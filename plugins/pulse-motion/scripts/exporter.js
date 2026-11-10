#!/usr/bin/env node
'use strict';
/* Pulse Motion – export MP4 (ou planche d'images clés) depuis la ligne de commande.
 *
 *   node scripts/exporter.js <dossier-du-projet> [--pour <usage>] [--taille-max <Mo>] [--qualite 1080p|720p|540p] [--ips 30|60]
 *                            [--rapide] [--avec-provisoire] [--estimer]
 *   node scripts/exporter.js <dossier-du-projet> --planche [id1,id2] [--ouvrir]
 *
 * Usages (scripts/usages.json, spec Rendu et export 5.1) : web (défaut, <slug>.mp4), reseaux, presentation, master, courriel
 * (taille visée, 10 Mo par défaut), brouillon ; --qualite et --ips priment, dans les deux voies. --estimer : durée annoncée
 * ({ secondesEstimees }), sans lancer de navigateur (mesures de cet ordinateur, ~/.pulse-motion/mesures-export.json).
 * Progression sur la sortie d'erreur, toutes les 10 % ou toutes les 15 s, avec le temps restant ; phases nommées.
 * Export fidèle (vraies captures + ffmpeg, voir export-fidele.js) quand ffmpeg est utilisable ; sinon, ou avec
 * --rapide, export dans le navigateur (résultat avec conseilFfmpeg). La planche passe toujours par le navigateur.
 * Export dans le navigateur : utilise l'aperçu en cours (ou en démarre un), l'ouvre dans Chrome ou Edge sans fenêtre
 * en mode export, et suit sortie/export.json jusqu'au MP4 relu (ou aux images de la planche).
 * Les deux voies vérifient la vidéo livrée (spec S2, 5.12) : sortie/verification.json, résumé dans « verification ».
 * Progression sur la sortie d'erreur ; résumé JSON sur la sortie standard ; code 1 en cas d'échec.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const { trouverNavigateur, ouvrirSansFenetre } = require('./lib/navigateur.js');
const { etatProjet } = require('./etat.js');
const { demarrerApercu, ouvrirNavigateur } = require('./apercu.js');
const { trouverFfmpeg } = require('./lib/ffmpeg.js');
const { exporterFidele, avecEffets } = require('./export-fidele.js');
const { scenesProvisoires, messageProvisoire, dureeVideo } = require('./lib/voix.js');
const U = require('./lib/usages.js');
const ME = require('./lib/mesures-export.js');
const { creerEstimation, ligneProgression } = require('../moteur/estimation.js');

/** Voie de l'export : fidèle (vraies captures + ffmpeg) si ffmpeg est utilisable, sauf --rapide et planche. */
function choisirVoie({ planche = null, rapide = false, outil }) {
  if (planche || rapide) return 'navigateur';
  return outil && outil.present && outil.versionOk !== false ? 'fidele' : 'navigateur';
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAI_DEMARRAGE = 45000;

/** Nettoyages en cours (navigateur sans fenêtre, aperçu lancé) : faits aussi si la commande est interrompue. */
const nettoyages = new Set();

/** Fait tous les nettoyages en cours (sans échouer) et vide la liste. */
async function nettoyerTout() {
  const enCours = [...nettoyages];
  nettoyages.clear();
  await Promise.all(enCours.map((n) => Promise.resolve().then(n).catch(() => {})));
}

/** Interruption (Ctrl+C, arrêt de la commande) : nettoyer, puis quitter. Pour les commandes qui exportent. */
function arreterProprementSurSignal() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { nettoyerTout().then(() => process.exit(130)); });
  }
}

/** Phases nommées de l'export, sur la sortie d'erreur (5.5, point 2). */
const PHASES = {
  son: 'Export : préparation du son…',
  assemblage: 'Export : assemblage de la vidéo…',
  'seconde-passe': 'Export : version légère, seconde passe…',
  reprise: 'Export : version légère, un peu plus compressée…',
  verification: 'Export : vérification de la vidéo…',
};

/**
 * Lignes de progression (5.5) : toutes les 10 % ou toutes les 15 s, au premier des deux, avec le temps restant estimé sur
 * une fenêtre glissante de 20 s d'images capturées (segments repris exclus). -> (faites, total, { reprises }) => void
 * ecrire(ligne) ; maintenant() en secondes ; finales : secondes des phases finales (dernière mesure).
 */
function suiviProgression({ ecrire, maintenant = () => performance.now() / 1000, finales = 0, intervalle = 15 }) {
  let estimation = null;
  let dernierPourcent = -10;
  let dernierInstant = -Infinity;
  return (faites, total, info = {}) => {
    const t = maintenant();
    if (!estimation) estimation = creerEstimation({ total, finales });
    estimation.noter(faites, t, info.reprises || 0);
    const pourcent = Math.floor((100 * faites) / total);
    if (pourcent >= dernierPourcent + 10 || t - dernierInstant >= intervalle || faites === total) {
      if (faites === total && dernierPourcent === 100) return;
      dernierPourcent = Math.max(dernierPourcent, pourcent - (pourcent % 10));
      if (faites === total) dernierPourcent = 100;
      dernierInstant = t;
      ecrire(ligneProgression({ faites, total, restant: estimation.restant(t) }));
    }
  };
}

/** Résultat commun aux deux voies (5.6) : usage, octets, taille à la française, fichiers joints. */
function completerResultat(r, { projet, u, nomSlug }) {
  if (!r.ok || !u) return r;
  const fichier = r.fichier && !path.isAbsolute(r.fichier) ? path.join(projet, r.fichier) : r.fichier;
  let octets = r.octets;
  if (!octets && fichier) { try { octets = fs.statSync(fichier).size; } catch { octets = undefined; } }
  const rel = (f) => path.relative(projet, f).replace(/\\/g, '/');
  const fichiers = r.fichiers || (fichier ? { video: rel(fichier) } : {});
  if (!fichiers.sousTitres && nomSlug) {
    const sousTitres = ['srt', 'vtt'].map((e) => path.join(projet, 'sortie', `${nomSlug}.${e}`)).filter((f) => fs.existsSync(f)).map(rel);
    if (sousTitres.length) fichiers.sousTitres = sousTitres;
  }
  return {
    ...r, usage: r.usage || u.usage, octets, taille: octets ? U.tailleFrancaise(octets) : undefined,
    definition: r.definition || u.definition, ips: r.ips || u.ips, flou: r.flou || { applique: false, sousImages: 1 },
    chapitresIntegres: Boolean(r.chapitresIntegres), fichiers,
  };
}

/**
 * exporterVideo({ dossier, pour?, qualite?, ips?, tailleMax?, planche?: string[] | true, ouvrir?, dossierStyles?, navigateur?,
 *                 surProgression?, delaiMax?, delaiDemarrage?, ouvrirFichier? })
 * -> { ok, fichier?, images?, duree?, audio?, usage?, octets?, taille?, fichiers?, avertissement?, verification?: { erreurs,
 *      alertes, fichier }, message?, secondes }
 */
async function exporterVideo({
  dossier, planche = null, ouvrir = false, dossierStyles, navigateur = trouverNavigateur(),
  surProgression = () => {}, delaiMax, delaiDemarrage = DELAI_DEMARRAGE, ouvrirFichier = ouvrirNavigateur, avecProvisoire = false,
  pour, qualite, ips, tailleMax,
}) {
  const debut = Date.now();
  const projet = path.resolve(dossier);
  const fin = (r) => ({ ...r, secondes: Math.round((Date.now() - debut) / 100) / 10 });
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return fin({ ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` });

  const ids = planche === true || (Array.isArray(planche) && !planche.length)
    ? deroule.scenes.slice(0, 2).map((s) => s.id)
    : planche;
  // Usage résolu ici (refus avant tout navigateur), puis de nouveau par l'aperçu pour la page (même module, mêmes réglages).
  const u = ids ? null : U.resoudreUsage({ pour, qualite, ips, tailleMax, deroule, duree: dureeVideo(projet, deroule) });
  if (u && u.erreur) return fin({ ok: false, message: u.erreur, ...(u.propositionMo ? { propositionMo: u.propositionMo } : {}) });
  if (ids) {
    const inconnues = ids.filter((id) => !deroule.scenes.some((s) => s.id === id));
    if (inconnues.length) return fin({ ok: false, message: `Scène inconnue : ${inconnues.join(', ')}.` });
  } else {
    // La planche n'a pas de son ; une vidéo avec la voix provisoire du système ne sort pas sans accord.
    const provisoires = scenesProvisoires(projet, deroule);
    if (provisoires.length && !avecProvisoire) return fin({ ok: false, message: messageProvisoire(provisoires) });
  }

  const etat = etatProjet(projet);
  let apercuLance = null;
  let url;
  if (!dossierStyles && etat.apercu && etat.apercu.actif) {
    url = etat.apercu.url;
  } else {
    apercuLance = await demarrerApercu(dossierStyles ? { dossier: projet, dossierStyles } : { dossier: projet });
    url = apercuLance.url;
  }
  if (!navigateur) {
    if (apercuLance) await apercuLance.fermer();
    return fin({ ok: false, message: `Chrome ou Edge introuvable : ouvrez l'aperçu ${etat.apercu && etat.apercu.url || 'avec /pulse-motion:reprendre'} dans Chrome ou Edge et cliquez sur « MP4 ».` });
  }

  const suivi = path.join(projet, 'sortie', 'export.json');
  fs.rmSync(suivi, { force: true });
  const options = u ? [['pour', pour], ['qualite', qualite], ['ips', ips], ['taille', tailleMax]].filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('') : '';
  const adresse = `${url}?${ids ? `planche=${ids.map(encodeURIComponent).join(',')}` : `export=1${avecProvisoire ? '&provisoire=1' : ''}${options}`}`;
  // Délai maximal sur la durée réelle (scènes allongées par leur voix comprises).
  const images = Math.round(dureeVideo(projet, deroule) * ((u && u.ips) || (deroule.format && deroule.format.ips) || 30));
  const limite = Date.now() + (delaiMax || (120 + images * 0.5) * 1000);
  const limiteDemarrage = Date.now() + delaiDemarrage;
  const chrome = ouvrirSansFenetre(navigateur, adresse, { gpu: avecEffets(projet, deroule) });
  const nettoyer = async () => {
    await chrome.fermer();
    if (apercuLance) await apercuLance.fermer();
  };
  nettoyages.add(nettoyer);
  try {
    while (Date.now() < limite) {
      await attendre(300);
      let e = null;
      try { e = JSON.parse(fs.readFileSync(suivi, 'utf8')); } catch { /* pas encore de suivi */ }
      if (e) {
        if (e.etat === 'en-cours' && e.total) surProgression(e.images || 0, e.total, {});
        if (!ids && e.etat === 'fini') {
          const r = completerResultat({ ok: true, fichier: e.fichier, images: e.images, duree: e.duree, audio: e.audio, octets: e.octets, usage: e.usage,
            definition: e.definition, ips: e.ips, avertissement: e.avertissement, ...(e.couleurs ? { couleurs: e.couleurs } : {}),
            ...(e.verification ? { verification: e.verification } : {}) }, { projet, u, nomSlug: require('./assembler.js').slug(deroule.titre) });
          // Vitesse de cet ordinateur dans le navigateur (images par seconde de calcul), pour les prochaines estimations.
          if (e.imagesParSeconde > 0) ME.noterMesure({ voie: 'navigateur', definition: u.definition, ips: u.ips, flou: false, imagesParSeconde: e.imagesParSeconde, finalesParSeconde: e.finalesParSeconde || 0 });
          return fin(r);
        }
        if (ids && e.etat === 'planche') {
          if (ouvrir) ouvrirFichier(path.join(projet, e.fichier));
          return fin({ ok: true, fichier: e.fichier, images: e.images });
        }
        if (e.etat === 'erreur' || e.etat === 'annule') return fin({ ok: false, message: e.message || 'L\'export a échoué.' });
      }
      if (chrome.aQuitte()) return fin({ ok: false, message: 'Le navigateur s\'est fermé avant la fin de l\'export : relancez l\'export, ou ouvrez l\'aperçu dans Chrome ou Edge et cliquez sur « MP4 ».' });
      if (!e && Date.now() > limiteDemarrage) {
        return fin({ ok: false, message: 'L\'export n\'a pas démarré dans le navigateur : vérifiez que l\'aperçu affiche bien la vidéo (contrôle de la vidéo, puis nouvel essai).' });
      }
    }
    return fin({ ok: false, message: 'L\'export n\'a pas abouti dans le temps prévu.' });
  } finally {
    nettoyages.delete(nettoyer);
    await nettoyer();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const OPTIONS_A_VALEUR = ['--planche', '--qualite', '--ips', '--pour', '--taille-max'];
  const dossier = args.find((a, i) => !a.startsWith('--') && !OPTIONS_A_VALEUR.includes(args[i - 1])) || '.';
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
  const i = args.indexOf('--planche');
  const planche = i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',').filter(Boolean) : true);
  const rapide = args.includes('--rapide');
  const avecProvisoire = args.includes('--avec-provisoire');
  const choix = { pour: valeur('--pour'), qualite: valeur('--qualite'), ips: valeur('--ips'), tailleMax: valeur('--taille-max') };
  const outil = trouverFfmpeg();
  const voie = choisirVoie({ planche, rapide, outil });
  if (args.includes('--estimer')) {
    // Durée annoncée avant de lancer (5.5, point 3) : sans navigateur, d'après les mesures de cet ordinateur.
    const r = estimerExport({ dossier, voie, ...choix });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }
  const ecrire = (ligne) => process.stderr.write(`${ligne}\n`);
  const finales = (() => { const m = ME.lireMesures().filter((x) => x.voie === voie); return m.length ? (m[m.length - 1].finalesParSeconde || 0) : 0; })();
  let duree = 0;
  try { const { deroule } = lireDeroule(path.resolve(dossier)); duree = deroule ? dureeVideo(path.resolve(dossier), deroule) : 0; } catch { duree = 0; }
  const surProgression = suiviProgression({ ecrire, finales: finales * duree });
  const surPhase = (nom) => { if (PHASES[nom]) ecrire(PHASES[nom]); };
  let travail;
  if (voie === 'fidele') {
    // Interruption (Ctrl+C, arrêt de la commande) : l'export s'annule et range ses fichiers avant de sortir.
    const controle = new AbortController();
    for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => controle.abort());
    travail = exporterFidele({ dossier, ...choix, outil, signal: controle.signal, surProgression, surPhase, avecProvisoire })
      .then((r) => ({ ...r, mode: 'fidele', ...(r.ok && typeof r.fichier === 'string' ? { fichier: path.relative(path.resolve(dossier), r.fichier).replace(/\\/g, '/') } : {}) }));
  } else {
    // Interruption : fermer le navigateur sans fenêtre et l'aperçu lancé.
    arreterProprementSurSignal();
    travail = exporterVideo({ dossier, planche, ouvrir: args.includes('--ouvrir'), surProgression, avecProvisoire, ...choix })
      .then((r) => ({ ...r, mode: 'navigateur', ...(!rapide && !planche ? { conseilFfmpeg: { message: outil.message, commande: outil.commande } } : {}) }));
  }
  travail.then((r) => {
    // La relecture du critique (spec S2, 5.5) : l'export ne la lance jamais, il dit seulement son verdict et si elle
    // porte sur cette version (null : la vidéo n'a pas été relue).
    if (r.ok && !planche) r.relecture = require('./lib/relecture.js').etatRelecture(path.resolve(dossier));
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
    process.exit(1);
  });
}

/** Durée estimée d'un export (--estimer), sans navigateur. -> { ok, secondesEstimees, usage, voie, source } | { ok: false, message } */
function estimerExport({ dossier, voie = 'fidele', pour, qualite, ips, tailleMax, mesures }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const duree = dureeVideo(projet, deroule);
  const u = U.resoudreUsage({ pour, qualite, ips, tailleMax, deroule, duree });
  if (u.erreur) return { ok: false, message: u.erreur };
  const definition = u.tailleMax && voie === 'fidele' ? '1080p' : u.definition;
  const e = ME.estimerSecondes({ voie, definition, ips: u.ips, duree, usage: U.lireUsages().usages[u.usage], ...(mesures ? { mesures } : {}) });
  return { ok: true, secondesEstimees: e.secondes, usage: u.usage, voie, source: e.source };
}

module.exports = { choisirVoie, exporterVideo, avecEffets, nettoyages, nettoyerTout, arreterProprementSurSignal, suiviProgression, completerResultat, estimerExport, PHASES };
