#!/usr/bin/env node
'use strict';
/* Pulse Motion – export MP4 (ou planche d'images clés) depuis la ligne de commande.
 *
 *   node scripts/exporter.js <dossier-du-projet> [--pour <usage>] [--taille-max <Mo>] [--qualite 1080p|720p|540p] [--ips 30|60]
 *                            [--rapide] [--avec-provisoire] [--estimer]
 *                            [--scene <id>[,<id>] | --plage <début>-<fin>] [--gif [--largeur 1280]] [--cadre telephone [--cadre-format 16:9|1:1]]
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
 * Livrables (spec Rendu et export, 5.10 à 5.20) : couverture, chapitres, crédits joints selon l'usage (« fichiers ») ; extrait
 * d'une scène (--scene, un fichier par scène) ou passage seul (--plage « 12,5-18 ») ; GIF (--gif, ffmpeg requis, 20 s au plus) ;
 * cadre de téléphone (--cadre telephone, vidéo 9:16). Export « reseaux » d'une vidéo 9:16 sans plateforme : zones de toutes les
 * applications vérifiées (alertes dans « zonesToutes », phrase dans « conseils »).
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
const { scenesProvisoires, messageProvisoire, dureeVideo, minutageVideo } = require('./lib/voix.js');
const L = require('./lib/livrables.js');
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
  livrables: 'Export : couverture et chapitres…',
  gif: 'Export : GIF, couleurs calculées sur tout le passage…',
  reprise: 'Export : version légère, un peu plus compressée…',
  verification: 'Export : vérification de la vidéo…',
};

/**
 * Lignes de progression (5.5) : toutes les 10 % ou toutes les 15 s, au premier des deux, avec le temps restant estimé sur
 * une fenêtre glissante de 20 s d'images capturées (segments repris exclus). -> (faites, total, { reprises }) => void
 * ecrire(ligne) ; maintenant() en secondes ; finales : secondes des phases finales (dernière mesure). surEtat(faites, total,
 * restant) : à chaque appel (fichier d'avancement, spec Retouches et ergonomie 5.2 ; restant : secondes, ou null).
 */
function suiviProgression({ ecrire, maintenant = () => performance.now() / 1000, finales = 0, intervalle = 15, surEtat = null }) {
  let estimation = null;
  let dernierPourcent = -10;
  let dernierInstant = -Infinity;
  return (faites, total, info = {}) => {
    const t = maintenant();
    if (!estimation) estimation = creerEstimation({ total, finales });
    estimation.noter(faites, t, info.reprises || 0);
    if (surEtat) { try { surEtat(faites, total, estimation.restant(t)); } catch { /* suivi facultatif */ } }
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
  pour, qualite, ips, tailleMax, scene, plage, cadre, cadreFormat,
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
    if (inconnues.length) {
      // Scènes proches (spec Retouches et ergonomie, 5.16).
      const P = require('../moteur/proches.js');
      const l = P.proches(inconnues[0], deroule.scenes.map((s) => s.id));
      return fin({ ok: false, message: `Scène inconnue : ${inconnues.join(', ')}${l.length ? ` ; ${P.phrase(l)}` : '.'}` });
    }
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
  const options = u ? [['pour', pour], ['qualite', qualite], ['ips', ips], ['taille', tailleMax], ['scene', scene], ['plage', plage], ['cadre', cadre], ['cadreFormat', cadreFormat]].filter(([, v]) => v !== undefined && v !== null && v !== '')
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
            ...(e.verification ? { verification: e.verification } : {}),
            ...(e.fichiers ? { fichiers: { video: e.fichier, ...e.fichiers } } : {}), creditsAPreciser: e.creditsAPreciser || [], ...(e.alertes ? { alertes: e.alertes } : {}),
            ...(e.extrait ? { extrait: true } : {}) }, { projet, u, nomSlug: e.extrait ? null : require('./assembler.js').slug(deroule.titre) });
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
  const OPTIONS_A_VALEUR = ['--planche', '--qualite', '--ips', '--pour', '--taille-max', '--scene', '--plage', '--largeur', '--cadre', '--cadre-format'];
  const dossier = args.find((a, i) => !a.startsWith('--') && !OPTIONS_A_VALEUR.includes(args[i - 1])) || '.';
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
  const i = args.indexOf('--planche');
  const planche = i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',').filter(Boolean) : true);
  const rapide = args.includes('--rapide');
  // Voix provisoire (spec Retouches et ergonomie, 5.17) : un accord gardé (etat --accord voix-provisoire) vaut tant que les
  // prises provisoires n'ont pas changé ; l'export ne redemande pas.
  const avecProvisoire = args.includes('--avec-provisoire') || (() => { try { return Boolean(etatProjet(path.resolve(dossier)).accords.voixProvisoire); } catch { return false; } })();
  const choix = { pour: valeur('--pour'), qualite: valeur('--qualite'), ips: valeur('--ips'), tailleMax: valeur('--taille-max') };
  const sorte = { scenes: valeur('--scene') ? valeur('--scene').split(',').filter(Boolean) : null, plage: valeur('--plage'), gif: args.includes('--gif'),
    largeurGif: valeur('--largeur'), cadre: valeur('--cadre'), cadreFormat: valeur('--cadre-format') };
  const outil = trouverFfmpeg();
  // Le GIF ne se fait que par ffmpeg (voie fidèle), même avec --rapide.
  const voie = sorte.gif && !planche ? choisirVoie({ outil }) : choisirVoie({ planche, rapide, outil });
  // Sortie demandée vérifiée avant tout navigateur (scène inconnue, passage illisible, GIF trop long ou sans ffmpeg, cadre).
  const refus = verifierSortie({ dossier, voie, outil, ...choix, ...sorte });
  if (refus) {
    console.log(JSON.stringify({ ok: false, message: refus }, null, 2));
    process.exit(1);
  }
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
  // Avancement (spec Retouches et ergonomie, 5.2) : .pulse-motion/avancement.json, lu par l'aperçu et « pulse-motion avancement » ;
  // les lignes de la sortie d'erreur restent celles de la progression (une par palier de 10 %, avec le temps restant).
  const avancement = require('./lib/avancement.js').suivre(path.resolve(dossier), { travail: 'export', libelle: planche ? 'Planche des scènes' : 'Export de la vidéo', ecrire: () => {} });
  const surProgression = suiviProgression({ ecrire, finales: finales * duree, surEtat: (f, t, restant) => avancement(f, t, `image ${f} sur ${t}`, restant) });
  const surPhase = (nom) => { if (PHASES[nom]) ecrire(PHASES[nom]); };
  let travail;
  if (voie === 'fidele') {
    // Interruption (Ctrl+C, arrêt de la commande) : l'export s'annule et range ses fichiers avant de sortir.
    const controle = new AbortController();
    for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => controle.abort());
    const une = (sceneUne) => exporterFidele({ dossier, ...choix, outil, signal: controle.signal, surProgression, surPhase, avecProvisoire,
      scene: sceneUne, plage: sorte.plage, gif: sorte.gif, largeurGif: sorte.largeurGif, cadre: sorte.cadre, cadreFormat: sorte.cadreFormat });
    travail = parScene(sorte.scenes, une).then((r) => ({ ...r, mode: 'fidele' }));
  } else {
    // Interruption : fermer le navigateur sans fenêtre et l'aperçu lancé.
    arreterProprementSurSignal();
    const une = (sceneUne) => exporterVideo({ dossier, planche, ouvrir: args.includes('--ouvrir'), surProgression, avecProvisoire, ...choix,
      scene: sceneUne, plage: sorte.plage, cadre: sorte.cadre, cadreFormat: sorte.cadreFormat });
    travail = parScene(planche ? null : sorte.scenes, une)
      .then((r) => ({ ...r, mode: 'navigateur', ...(!rapide && !planche ? { conseilFfmpeg: { message: outil.message, commande: outil.commande } } : {}) }));
  }
  travail.then((r) => (r.ok && !planche ? completerDiffusion(r, { dossier, ...sorte }) : r)).then((r) => {
    // La relecture du critique (spec S2, 5.5) : l'export ne la lance jamais, il dit seulement son verdict et si elle
    // porte sur cette version (null : la vidéo n'a pas été relue).
    if (r.ok && !planche) r.relecture = require('./lib/relecture.js').etatRelecture(path.resolve(dossier));
    avancement.terminer(r.ok, r.ok ? undefined : r.message);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    avancement.terminer(false, e.message);
    console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
    process.exit(1);
  });
}

/** Sortie demandée (extrait, passage, GIF, cadre) vérifiée sans navigateur. -> message de refus, ou null. */
function verifierSortie({ dossier, voie, outil, pour, qualite, ips, tailleMax, scenes, plage, gif, cadre, cadreFormat }) {
  if (!scenes && !plage && !gif && !cadre && !cadreFormat) return null;
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return null;
  const minutage = minutageVideo(projet, deroule);
  const u = U.resoudreUsage({ pour, qualite, ips, tailleMax, deroule, duree: minutage.duree });
  if (u.erreur) return null;
  const avecFfmpeg = Boolean(outil && outil.present && outil.versionOk !== false);
  for (const scene of scenes || [null]) {
    const d = L.preparerSortie({ deroule, minutage, ips: u.ips, scene, plage, gif, cadre, cadreFormat, avecFfmpeg });
    if (d.erreur) return d.erreur;
  }
  return null;
}

/** Une scène après l'autre (--scene a,b : un fichier par scène) ; un seul résultat sinon. -> résultat (le dernier, avec
 *  « extraits » quand il y en a plusieurs) */
async function parScene(scenes, une) {
  if (!scenes || scenes.length < 2) return une(scenes ? scenes[0] : null);
  const resultats = [];
  for (const id of scenes) {
    const r = await une(id);
    resultats.push(r);
    if (!r.ok) return { ...r, extraits: resultats };
  }
  const dernier = resultats[resultats.length - 1];
  return { ...dernier, extraits: resultats.map((r) => ({ fichier: r.fichiers && (r.fichiers.video || r.fichiers.gif), taille: r.taille, duree: r.duree })) };
}

/**
 * Après un export réussi (spec Rendu et export, 5.11, 5.19, 5.20) : conseils à dire en une phrase. Vidéo 9:16 exportée pour
 * les réseaux sans plateforme dite : zones de toutes les applications vérifiées (alertes) ; web de plus de 2 minutes sans
 * chapitres : les proposer ; fichiers importés sans source : les demander.
 */
async function completerDiffusion(r, { dossier, scenes, plage, gif, cadre, controler = null }) {
  const projet = path.resolve(dossier);
  const { deroule } = lireDeroule(projet);
  if (!deroule) return r;
  const conseils = [];
  const extrait = Boolean((scenes && scenes.length) || plage || gif);
  if (r.usage === 'reseaux' && deroule.format.ratio === '9:16' && !deroule.format.plateforme && !extrait && !cadre) {
    const zones = await verifierZonesToutes(projet, deroule, controler);
    if (zones) {
      r.zonesToutes = zones;
      conseils.push(zones.length
        ? `Sans plateforme précisée, j'ai vérifié les zones de toutes les applications : ${zones.length} texte${zones.length > 1 ? 's passent' : ' passe'} sous leurs boutons ; dites-moi la plateforme (TikTok, Shorts, Reels) pour un contrôle exact.`
        : 'Sans plateforme précisée, j\'ai vérifié les zones de toutes les applications : rien ne passe sous leurs boutons.');
    }
  }
  if (r.usage === 'web' && !extrait && (r.duree || 0) > 120 && !deroule.scenes.some((s) => s.chapitre)) {
    conseils.push('La vidéo dure plus de 2 minutes : des chapitres aideraient à s\'y retrouver sur YouTube (une retouche).');
  }
  const aPreciser = r.creditsAPreciser || [];
  if (aPreciser.length) conseils.push(`${aPreciser.length} fichier${aPreciser.length > 1 ? 's importés n\'ont' : ' importé n\'a'} pas de source : dites-moi d'où ${aPreciser.length > 1 ? 'ils viennent' : 'il vient'} pour compléter les crédits.`);
  if (conseils.length) r.conseils = conseils;
  return r;
}

/** Zones de toutes les applications (5.19, point 3) : contrôle du rendu limité à la règle zone-sure, en alertes. -> messages, ou
 *  null si le rendu n'a pas pu être mesuré. */
async function verifierZonesToutes(projet, deroule, controler) {
  try {
    const { assembler } = require('./assembler.js');
    const a = assembler({ dossier: projet, ecrire: false });
    if (!a.ok) return null;
    const mesurer = controler || require('./lib/rendu-controle.js').controlerRendu;
    const v = await mesurer({ html: a.html, ratio: deroule.format.ratio, duree: a.minutage.duree, genre: deroule.genre, plateforme: 'toutes' });
    if (!v.renduVerifie) return null;
    return v.problemes.filter((p) => p.regle === 'zone-sure').map((p) => p.message);
  } catch { return null; }
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

module.exports = { choisirVoie, exporterVideo, avecEffets, nettoyages, nettoyerTout, arreterProprementSurSignal, suiviProgression, completerResultat, estimerExport, PHASES,
  verifierSortie, completerDiffusion, verifierZonesToutes, parScene };
