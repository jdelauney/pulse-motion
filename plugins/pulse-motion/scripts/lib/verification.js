'use strict';
/* Pulse Motion – vérification de l'export (spec S2, 5.12) : ce que le fichier livré montre et fait entendre, comparé à la page.
 *
 * ecrireStats(fichierSegment, vignettes) / lireStats(fichierSegment) : <segment>.stats.json à côté du segment (statistiques de
 *   capture, lib/series.js) ; un segment repris sans ce fichier est « non analysé ».
 * contexteSerie({ assemblage, deroule, dico }) -> { coupes, brusques, sequences, scenes } : ce qui peut changer d'un coup sans
 *   défaut (lib/series.js, evenementsExport).
 * noirsAbsents(noirs, images, { ips, seuil }) -> [noir] : intervalles noirs du MP4 qui ne le sont pas dans les statistiques de
 *   capture (les images non analysées ne comptent pas).
 * silencesAbsents(silences, wav, { duree, niveau, dureeMin }) -> [silence] : silences du MP4 absents du mixage son.wav.
 * reecouter({ scenes, wav, transcrire, ... }) -> { faite, problemes, pourquoi } : la transcription des scènes signalées par
 *   voix-couverte, sur le mixage, comparée au texte dit et à la prise seule (lemo final_asr.py, MIT : idée).
 * ecrireVerification(projet, v) -> chemin relatif ; resume(v) -> { erreurs, alertes, fichier }.
 */
const fs = require('node:fs');
const path = require('node:path');
const { statsSerie } = require('./series.js');
const { extraireScene } = require('./extraire.js');
const { ecrireAtomique } = require('./fichiers.js');
const { calculerMinutage } = require('../../moteur/minutage.js');
const { analyserCamera } = require('../../moteur/camera.js');
const { evenementsExport } = require('./series.js');
const ECOUTE = require('../../moteur/ecoute.js');
const W = require('../../moteur/wav.js');

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const fichierStats = (segment) => `${segment}.stats.json`;

function ecrireStats(segment, vignettes) {
  if (!vignettes || !vignettes.length) return null;
  const st = statsSerie(vignettes);
  ecrireAtomique(fichierStats(segment), JSON.stringify(st));
  return st;
}

function lireStats(segment) {
  try {
    const st = JSON.parse(fs.readFileSync(fichierStats(segment), 'utf8'));
    return st && st.version === 1 && Array.isArray(st.m) ? st : null;
  } catch { return null; }
}

function contexteSerie({ assemblage, deroule, dico = [], options = {} }) {
  const d = assemblage.donnees;
  const elements = {};
  const camera = {};
  for (const p of assemblage.parScene || []) {
    const lu = extraireScene(p.section || '');
    elements[p.id] = lu.elements;
    camera[p.id] = lu.miseEnScene.filter((m) => m.camera !== undefined && m.balise !== 'section').flatMap((m) => {
      try { return analyserCamera(m.camera, d.tempo ? 60 / d.tempo.bpm : null).filter((c) => c.prop === 'secousse'); } catch { return []; }
    });
  }
  const minutage = calculerMinutage(d.scenes, elements, options);
  const transitions = Object.fromEntries(deroule.scenes.map((s) => [s.id, s.transition || 'aucune']));
  const ev = evenementsExport({ minutage, dico, elements, transitions, camera });
  // Cartons de sous-titres : ils s'affichent et s'effacent d'un coup, c'est voulu.
  const cartons = (d.sousTitres && d.sousTitres.incrustes !== false && d.sousTitres.cartons) || [];
  for (const c of cartons) ev.brusques.push([c.debut, c.debut], [c.fin, c.fin]);
  return { ...ev, scenes: minutage.scenes.map((s) => ({ id: s.id, debut: s.debut, fin: s.fin })) };
}

/** Noirs du MP4 absents de la page : la moitié au moins des images analysées de l'intervalle n'y sont pas noires. */
function noirsAbsents(noirs, images, { ips, seuil = 0.08 }) {
  return (noirs || []).filter((n) => {
    const a = Math.max(0, Math.floor(n.debut * ips));
    const b = Math.min(images.length - 1, Math.ceil(n.fin * ips) - 1);
    let vues = 0;
    let claires = 0;
    for (let k = a; k <= b; k++) {
      if (!images[k]) continue;
      vues++;
      if (images[k].m > seuil * 255 * 1.5) claires++;
    }
    return vues > 0 && claires * 2 >= vues;
  });
}

/** Silences du MP4 (ffmpeg silencedetect) absents du mixage : moins de la moitié de leur durée est silencieuse dans son.wav. */
function silencesAbsents(silences, wav, { duree, niveau = -50, dureeMin = 2.5 }) {
  if (!silences || !silences.length) return [];
  let mono = null;
  let taux = 48000;
  try {
    const son = W.lire(new Uint8Array(wav));
    taux = son.taux;
    const n = son.canaux[0].length;
    mono = new Float32Array(n);
    for (const c of son.canaux) for (let i = 0; i < n; i++) mono[i] += c[i] / son.canaux.length;
  } catch { return []; }
  const calmes = ECOUTE.silences(mono, taux, { niveau, duree: Math.min(dureeMin, 0.5) });
  return silences.map((s) => ({ ...s, fin: s.fin === null ? duree : s.fin })).filter((s) => {
    if (s.fin - s.debut < dureeMin - 1e-6) return false;
    const couvert = calmes.reduce((t, c) => t + Math.max(0, Math.min(s.fin, c.fin) - Math.max(s.debut, c.debut)), 0);
    return couvert < (s.fin - s.debut) / 2;
  });
}

const normaliser = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const motsDe = (t) => normaliser(t).split(' ').filter(Boolean);
/** Part des mots attendus retrouvés, dans l'ordre (sans tenir compte des répétitions). */
function partReconnue(attendus, entendus) {
  if (!attendus.length) return 1;
  const reste = [...entendus];
  let trouves = 0;
  for (const m of attendus) {
    const i = reste.indexOf(m);
    if (i >= 0) { trouves++; reste.splice(0, i + 1); }
  }
  return trouves / attendus.length;
}

/**
 * Réécoute des scènes signalées par voix-couverte au dernier contrôle, sur son.wav. scenes : [{ id, debut, fin, texte, mots }]
 * (mots : ceux de la prise seule). transcrire({ wav, duree, attendu }) -> Promise<{ ok, mots }> ; dossier : où écrire les extraits.
 */
async function reecouter({ scenes, wav, transcrire, dossier, seuil = 0.85 }) {
  const problemes = [];
  let son;
  try { son = W.lire(new Uint8Array(wav)); } catch { return { faite: false, pourquoi: 'le son de la vidéo n\'a pas pu être relu', problemes }; }
  for (const s of scenes) {
    const a = Math.max(0, Math.floor(s.debut * son.taux));
    const b = Math.min(son.canaux[0].length, Math.ceil(s.fin * son.taux));
    if (b <= a) continue;
    const extrait = path.join(dossier, `reecoute-${s.id}.wav`);
    fs.writeFileSync(extrait, Buffer.from(W.ecrire({ taux: son.taux, canaux: son.canaux.map((c) => c.subarray(a, b)) })));
    let r;
    try { r = await transcrire({ wav: extrait, duree: (b - a) / son.taux, attendu: s.texte }); } finally { fs.rmSync(extrait, { force: true }); }
    if (!r || !r.ok) return { faite: false, pourquoi: 'la transcription a échoué', problemes };
    const attendus = motsDe(s.texte || '');
    const p = partReconnue(attendus, (r.mots || []).flatMap((m) => motsDe(m.w)));
    const q = partReconnue(attendus, (s.mots || []).flatMap((m) => motsDe(m.w)));
    if (p < seuil - 1e-9 && q >= seuil - 1e-9) {
      problemes.push({ regle: 'voix-inaudible', gravite: 'alerte', scene: s.id,
        message: `Scène « ${s.id} » : dans la vidéo, la transcription ne reconnaît que ${Math.round(p * 100)} % des mots dits (${Math.round(q * 100)} % dans la prise seule) ; la musique couvre probablement la voix : la baisser dans cette scène.` });
    }
  }
  return { faite: true, problemes };
}

/** Problèmes de vérification qui ne viennent pas d'une série : noir, silence, crête. */
function problemeNoir(n) {
  return { regle: 'noir-export', gravite: 'erreur', instant: Math.round(n.debut * 100) / 100,
    message: `La vidéo exportée a ${virgule(n.duree)} s d'images noires vers ${virgule(n.debut)} s qui n'existent pas dans la page ; l'export est abîmé : relancez-le.` };
}
function problemeSilence(s) {
  return { regle: 'silence-export', gravite: 'erreur', instant: Math.round(s.debut * 100) / 100,
    message: `La vidéo exportée est muette de ${virgule(s.debut)} s à ${virgule(s.fin)} s alors que la page ne l'est pas ; la piste son est abîmée : relancez l'export.` };
}
function problemeCrete(c) {
  return { regle: 'crete-export', gravite: 'alerte', message: `Le son de la vidéo sature par moments (crête de ${virgule(c)} dB) ; baisser les bruitages forts ou la musique.` };
}

function ecrireVerification(projet, v) {
  const fichier = path.join(projet, 'sortie', 'verification.json');
  ecrireAtomique(fichier, JSON.stringify({ version: 1, ...v }, null, 2));
  return 'sortie/verification.json';
}

function resume(v) {
  const p = v.problemes || [];
  return { erreurs: p.filter((x) => x.gravite === 'erreur').length, alertes: p.filter((x) => x.gravite === 'alerte').length, fichier: 'sortie/verification.json' };
}

/** Scènes signalées par voix-couverte au dernier contrôle (sortie/controle.json). */
function scenesVoixCouverte(projet) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(projet, 'sortie', 'controle.json'), 'utf8'));
    return [...new Set((c.problemes || []).filter((p) => p.regle === 'voix-couverte' && p.scene).map((p) => p.scene))];
  } catch { return []; }
}

/**
 * Voie navigateur : statistiques calculées dans la page (moteur/export.mjs, creerStats), analysées ici à la réception de la
 * vidéo. Sans ffmpeg, noirs, silences, sonie et crête ne sont pas vérifiés (dit dans nonFaites). -> v (écrit) ou null.
 */
function verifierNavigateur({ projet, stats, fichier, ips, optionsAssemblage = {} }) {
  const { analyserSerie } = require('./series.js');
  const { assembler } = require('../assembler.js');
  const { lireDeroule, optionsMinutage } = require('./deroule.js');
  const SEUILS = require('../seuils.json');
  const sansFfmpeg = (quoi) => ({ quoi, pourquoi: 'sans ffmpeg, l\'export dans le navigateur ne le vérifie pas' });
  const nonFaites = ['noirs', 'silences', 'sonie', 'crete'].map(sansFfmpeg);
  const faites = [];
  let problemes = [];
  let parasites = 0;
  let sauts = 0;
  try {
    const { deroule } = lireDeroule(projet);
    const assemblage = assembler({ ...optionsAssemblage, dossier: projet, ecrire: false });
    if (!assemblage.ok) throw new Error('page');
    if (stats && Array.isArray(stats.m)) {
      let dico = [];
      try { dico = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'references', 'mouvements', 'mouvements.json'), 'utf8')).mouvements; } catch { /* absent */ }
      const contexte = contexteSerie({ assemblage, deroule, dico, options: optionsMinutage(deroule) });
      const images = stats.m.map((m, k) => ({ m, e: stats.e[k], d: stats.d[k], s: stats.s[k] }));
      const a = analyserSerie(images, { ips: ips || (deroule.format && deroule.format.ips) || 30, ...contexte, seuils: SEUILS });
      ({ problemes, parasites, sauts } = a);
      faites.push('images');
    } else nonFaites.unshift({ quoi: 'images', pourquoi: 'les statistiques de l\'export n\'ont pas été reçues' });
  } catch {
    nonFaites.unshift({ quoi: 'images', pourquoi: 'la vidéo n\'a pas pu être analysée' });
  }
  const v = { fichier, faites, nonFaites, mesures: { sonie: null, crete: null, parasites, sauts, noirs: [], silences: [] }, problemes };
  ecrireVerification(projet, v);
  return v;
}

module.exports = { verifierNavigateur, ecrireStats, lireStats, fichierStats, contexteSerie, noirsAbsents, silencesAbsents, reecouter, partReconnue,
  problemeNoir, problemeSilence, problemeCrete, ecrireVerification, resume, scenesVoixCouverte };
