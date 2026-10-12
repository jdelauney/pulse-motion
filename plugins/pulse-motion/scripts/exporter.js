#!/usr/bin/env node
'use strict';
/* Pulse Motion – export MP4 (ou planche d'images clés) depuis la ligne de commande.
 *
 *   node scripts/exporter.js <dossier-du-projet> [--qualite 1080p|720p] [--ips 30|60] [--rapide]
 *   node scripts/exporter.js <dossier-du-projet> --planche [id1,id2] [--ouvrir]
 *
 * Export fidèle (vraies captures + ffmpeg, voir export-fidele.js) quand ffmpeg est utilisable ; sinon, ou avec
 * --rapide, export dans le navigateur (résultat avec conseilFfmpeg). La planche passe toujours par le navigateur.
 * Export dans le navigateur : utilise l'aperçu en cours (ou en démarre un), l'ouvre dans Chrome ou Edge sans fenêtre
 * en mode export, et suit sortie/export.json jusqu'au MP4 relu (ou aux images de la planche).
 * Progression sur la sortie d'erreur ; résumé JSON sur la sortie standard ; code 1 en cas d'échec.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const { trouverNavigateur, ouvrirSansFenetre } = require('./lib/navigateur.js');
const { etatProjet } = require('./etat.js');
const { demarrerApercu, ouvrirNavigateur } = require('./apercu.js');
const { trouverFfmpeg } = require('./lib/ffmpeg.js');
const { exporterFidele } = require('./export-fidele.js');

/** Voie de l'export : fidèle (vraies captures + ffmpeg) si ffmpeg est utilisable, sauf --rapide et planche. */
function choisirVoie({ planche = null, rapide = false, outil }) {
  if (planche || rapide) return 'navigateur';
  return outil && outil.present && outil.versionOk !== false ? 'fidele' : 'navigateur';
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAI_DEMARRAGE = 45000;

/** Nettoyages en cours (navigateur sans fenêtre, aperçu lancé) : faits aussi si la commande est interrompue. */
const nettoyages = new Set();

/** Une scène du projet pose-t-elle un effet de particules ? (Chrome devra alors garder le GPU.) */
function avecEffets(projet, deroule) {
  return deroule.scenes.some((s) => {
    try { return /\sdata-effet\s*=/.test(fs.readFileSync(path.join(projet, s.fichier), 'utf8')); } catch { return false; }
  });
}

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

/**
 * exporterVideo({ dossier, planche?: string[] | true, ouvrir?, dossierStyles?, navigateur?,
 *                 surProgression?, delaiMax?, delaiDemarrage?, ouvrirFichier? })
 * -> { ok, fichier?, images?, duree?, audio?, avertissement?, message?, secondes }
 */
async function exporterVideo({
  dossier, planche = null, ouvrir = false, dossierStyles, navigateur = trouverNavigateur(),
  surProgression = () => {}, delaiMax, delaiDemarrage = DELAI_DEMARRAGE, ouvrirFichier = ouvrirNavigateur,
}) {
  const debut = Date.now();
  const projet = path.resolve(dossier);
  const fin = (r) => ({ ...r, secondes: Math.round((Date.now() - debut) / 100) / 10 });
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return fin({ ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` });

  const ids = planche === true || (Array.isArray(planche) && !planche.length)
    ? deroule.scenes.slice(0, 2).map((s) => s.id)
    : planche;
  if (ids) {
    const inconnues = ids.filter((id) => !deroule.scenes.some((s) => s.id === id));
    if (inconnues.length) return fin({ ok: false, message: `Scène inconnue : ${inconnues.join(', ')}.` });
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
  const adresse = `${url}?${ids ? `planche=${ids.map(encodeURIComponent).join(',')}` : 'export=1'}`;
  const images = Math.round(deroule.scenes.reduce((t, s) => t + s.duree / (s.rythme || 1), 0) * ((deroule.format && deroule.format.ips) || 30));
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
        if (e.etat === 'en-cours' && e.total) surProgression(e.images || 0, e.total);
        if (!ids && e.etat === 'fini') return fin({ ok: true, fichier: e.fichier, images: e.images, duree: e.duree, audio: e.audio, avertissement: e.avertissement });
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
  const OPTIONS_A_VALEUR = ['--planche', '--qualite', '--ips'];
  const dossier = args.find((a, i) => !a.startsWith('--') && !OPTIONS_A_VALEUR.includes(args[i - 1])) || '.';
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
  const i = args.indexOf('--planche');
  const planche = i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',').filter(Boolean) : true);
  const rapide = args.includes('--rapide');
  // Interruption (Ctrl+C, arrêt de la commande) : fermer le navigateur sans fenêtre et l'aperçu lancé.
  arreterProprementSurSignal();
  let dernier = -1;
  const surProgression = (n, total) => {
    const pourcent = Math.floor(100 * n / total);
    if (pourcent >= dernier + 10) { dernier = pourcent; process.stderr.write(`Export : ${pourcent} % (image ${n} / ${total})\n`); }
  };
  const outil = trouverFfmpeg();
  const voie = choisirVoie({ planche, rapide, outil });
  let travail;
  if (voie === 'fidele') {
    const controle = new AbortController();
    process.on('SIGINT', () => controle.abort());
    travail = exporterFidele({ dossier, qualite: valeur('--qualite') || '1080p', ips: valeur('--ips') ? Number(valeur('--ips')) : undefined, outil, signal: controle.signal, surProgression })
      .then((r) => ({ ...r, mode: 'fidele' }));
  } else {
    travail = exporterVideo({ dossier, planche, ouvrir: args.includes('--ouvrir'), surProgression })
      .then((r) => ({ ...r, mode: 'navigateur', ...(!rapide && !planche ? { conseilFfmpeg: { message: outil.message, commande: outil.commande } } : {}) }));
  }
  travail.then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { choisirVoie, exporterVideo, avecEffets, nettoyages, nettoyerTout, arreterProprementSurSignal };
