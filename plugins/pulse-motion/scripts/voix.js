#!/usr/bin/env node
'use strict';
/* Pulse Motion – voix d'une vidéo.
 *
 *   node scripts/voix.js importer <fichier> [--scene <id>] [dossier]   une prise pour une scène (WAV, ou tout format avec ffmpeg) ;
 *                                                                     sans --scene : toute la vidéo, découpée par la transcription
 *   node scripts/voix.js provisoire [--scene <id>] [dossier]           voix du système pour caler avant d'enregistrer
 *   node scripts/voix.js transcrire [--scene <id>] [dossier]           mots calés par la transcription (Whisper installé)
 *   node scripts/voix.js studio <scène> [dossier]                       ouvre le studio de voix de l'aperçu sur la scène
 *
 * Résumé JSON ; code 1 en cas d'échec.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lireDeroule } = require('./lib/deroule.js');
const F = require('./lib/ffmpeg.js');
const { ecrirePrise, transcrirePrise, lireVoixScene } = require('./lib/voix.js');
const { whisperParDefaut } = require('./lib/whisper.js');
const W = require('../moteur/wav.js');
const A = require('../moteur/aligner.js');
const { sauvegarder } = require('./historique.js');

function ecrireDeroule(projet, fn) {
  const fichier = path.join(projet, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, ''));
  fn(d);
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2) + '\n');
}

function sceneAvecTexte(deroule, id) {
  const scene = deroule.scenes.find((s) => s.id === id);
  if (!scene) return { message: `Scène inconnue : « ${id} » (scènes : ${deroule.scenes.map((s) => s.id).join(', ')}).` };
  if (!scene.voix || !scene.voix.texte) return { message: `La scène « ${id} » n'a pas de texte de voix : écrire d'abord « voix.texte » dans le déroulé.` };
  return { scene };
}

const lisible = (o) => { try { W.lire(new Uint8Array(o)); return true; } catch { return false; } };

/** Fichier son -> WAV lisible par le moteur. -> { ok: true, octets } | { ok: false, message } */
async function lireSon(fichier, outil) {
  if (!fs.existsSync(fichier)) return { ok: false, message: `Fichier introuvable : « ${fichier} ».` };
  // Un WAV 16 bits ou flottant se lit directement ; un autre WAV (24 bits, 8 bits…) ou format passe par ffmpeg.
  const estWav = /\.wav$/i.test(fichier);
  let octets;
  if (estWav && lisible(fs.readFileSync(fichier))) octets = fs.readFileSync(fichier);
  else if (outil && outil.present) {
    const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-voix-'));
    const temporaire = path.join(travail, 'prise.wav');
    try {
      await F.importerAudio({ ffmpeg: outil.chemin, entree: fichier, sortie: temporaire });
      octets = fs.readFileSync(temporaire);
    } catch (e) {
      return { ok: false, message: `${e.message.charAt(0).toUpperCase()}${e.message.slice(1)}.` };
    } finally {
      fs.rmSync(travail, { recursive: true, force: true });
    }
  } else {
    return { ok: false, message: estWav
      ? 'Ce WAV ne se lit pas tel quel : installez ffmpeg (« pulse-motion ffmpeg ») ou exportez-le en WAV 16 bits.'
      : 'Ce fichier n\'est pas un WAV : installez ffmpeg (« pulse-motion ffmpeg ») ou donnez un fichier WAV.' };
  }
  if (!lisible(octets)) return { ok: false, message: 'La voix n\'a pas pu être lue : ce fichier ne contient pas de son lisible.' };
  return { ok: true, octets };
}

/** Enregistrement de toute la vidéo -> une prise par scène qui a un texte (transcription requise). */
async function importerUnique({ projet, deroule, fichier, outil, whisper }) {
  if (!whisper || !whisper.pret) return { ok: false, message: 'Un enregistrement de toute la vidéo se découpe grâce à la transcription : installez-la (« pulse-motion whisper installer »), ou importez scène par scène (--scene <id>).' };
  const scenes = deroule.scenes.filter((s) => s.voix && s.voix.texte);
  if (!scenes.length) return { ok: false, message: 'Aucune scène n\'a de texte de voix (« voix.texte ») dans le déroulé.' };
  const lu = await lireSon(fichier, outil);
  if (!lu.ok) return lu;
  const son = W.lire(new Uint8Array(lu.octets));
  const canal = W.mono(son.canaux);
  const duree = canal.length / son.taux;
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-voix-'));
  let t;
  try {
    const wav = path.join(travail, 'tout.wav');
    fs.writeFileSync(wav, W.ecrire({ taux: son.taux, canaux: [canal] }));
    t = await whisper.transcrire({ wav, duree });
  } finally {
    fs.rmSync(travail, { recursive: true, force: true });
  }
  if (!t.ok) return { ok: false, message: t.message };
  const decoupe = A.decouperEnScenes(scenes.map((s) => s.voix.texte), t.mots, duree);
  if (!decoupe) return { ok: false, message: 'La transcription n\'a reconnu aucun mot des textes : vérifier que l\'enregistrement dit bien les textes des scènes, ou importer scène par scène (--scene <id>).' };
  // Presque rien de reconnu : pas un enregistrement de toute la vidéo (oubli de --scene ?) ; rien n'est remplacé.
  const reconnus = decoupe.reduce((n, p) => n + p.reconnus, 0);
  const total = decoupe.reduce((n, p) => n + p.total, 0);
  if (reconnus < total / 2) {
    return { ok: false, message: `La transcription a reconnu moins de la moitié des mots des textes (${reconnus} sur ${total}) : est-ce bien l'enregistrement de toute la vidéo ? Pour une seule scène, ajouter --scene <id>.` };
  }
  sauvegarder(projet);
  const faites = [];
  const douteuses = [];
  const gardees = [];
  for (let k = 0; k < scenes.length; k++) {
    const p = decoupe[k];
    const douteuse = p.reconnus < p.total / 2;
    // Une scène presque absente de l'enregistrement garde sa prise existante.
    const existante = scenes[k].voix.fichier && fs.existsSync(path.join(projet, scenes[k].voix.fichier));
    if (douteuse && existante) { gardees.push(scenes[k].id); continue; }
    const morceau = canal.slice(Math.round(p.debut * son.taux), Math.round(p.fin * son.taux));
    const mots = p.mots.map((m) => ({ w: m.w, t0: m.t0 - p.debut, t1: m.t1 - p.debut }));
    const r = await ecrirePrise({ projet, scene: scenes[k].id, octets: W.ecrire({ taux: son.taux, canaux: [morceau] }), texte: scenes[k].voix.texte,
      outil: outil && outil.present ? outil : null, mots, approche: 'whisper' });
    faites.push({ id: scenes[k].id, fichier: r.relatif, duree: r.duree });
    if (douteuse) douteuses.push(scenes[k].id);
  }
  ecrireDeroule(projet, (d) => { for (const f of faites) d.scenes.find((s) => s.id === f.id).voix.fichier = f.fichier; });
  const messages = [];
  if (douteuses.length) messages.push(`Découpe à vérifier pour ${douteuses.map((id) => `la scène « ${id} »`).join(', ')} : moins de la moitié de ses mots ont été reconnus ; l'écouter, et la réenregistrer seule si besoin (pulse-motion voix importer <fichier> --scene <id>).`);
  if (gardees.length) messages.push(`Prise existante gardée pour ${gardees.map((id) => `la scène « ${id} »`).join(', ')} : elle n'a presque pas été reconnue dans cet enregistrement.`);
  if (messages.length) messages.push('« pulse-motion historique annuler » revient aux prises d\'avant.');
  const avertissement = messages.length ? messages.join(' ') : undefined;
  return { ok: true, scenes: faites, ...(avertissement ? { avertissement } : {}) };
}

/** Une prise pour une scène ; sans scène, un enregistrement de toute la vidéo découpé. -> { ok, fichier?|scenes?, duree?, message? } */
async function importerVoix({ dossier, fichier, scene: id, outil = F.trouverFfmpeg(), whisper = whisperParDefaut() }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (!id) return importerUnique({ projet, deroule, fichier, outil, whisper });
  const { scene, message } = sceneAvecTexte(deroule, id);
  if (!scene) return { ok: false, message };
  const lu = await lireSon(fichier, outil);
  if (!lu.ok) return lu;
  const r = await enregistrerPrise({ projet, scene: id, octets: lu.octets, outil, whisper });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, fichier: r.fichier, duree: r.duree, calage: r.calage, ...(r.avertissement ? { avertissement: r.avertissement } : {}) };
}

/**
 * Une prise pour une scène (import ou studio de l'aperçu) : vérifie la scène et le son, copie d'historique, écrit
 * la prise et ses mots, met le déroulé à jour, puis transcrit (si installée) — attendu, ou lancé en fond (enFond).
 * -> { ok, statut?, message?, fichier, duree, calage, transcription?: Promise|null, avertissement? }
 */
// File des transcriptions en fond, par scène : projet|scène -> promesse de la dernière.
const fileTranscriptions = new Map();

async function enregistrerPrise({ projet, scene: id, octets, outil = null, whisper = whisperParDefaut(), enFond = false }) {
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, statut: 422, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const { scene, message } = sceneAvecTexte(deroule, id);
  if (!scene) return { ok: false, statut: deroule.scenes.some((s) => s.id === id) ? 422 : 404, message };
  let son;
  try { son = W.lire(new Uint8Array(octets)); } catch { return { ok: false, statut: 422, message: 'La voix n\'a pas pu être lue : ce fichier ne contient pas de son lisible.' }; }
  const pret = W.preparerPrise(son);
  const crete = pret.canaux[0].reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (crete === 0 || pret.canaux[0].length < 0.1 * son.taux) return { ok: false, statut: 422, message: 'La prise ne contient aucun son : vérifier le micro, puis recommencer.' };
  if (W.dureeParole(pret) < 0.3) return { ok: false, statut: 422, message: 'La prise semble vide (silence, souffle ou clic) : vérifier le micro, puis recommencer en parlant.' };
  // Copie d'historique seulement quand la prise est bonne : un essai raté ne laisse rien.
  sauvegarder(projet);
  const r = await ecrirePrise({ projet, scene: id, octets: new Uint8Array(octets), texte: scene.voix.texte, outil: outil && outil.present ? outil : null });
  ecrireDeroule(projet, (d) => { d.scenes.find((s) => s.id === id).voix.fichier = r.relatif; });
  // Transcription (si installée) : les mots prennent les temps réels de la parole ; sinon calage approché.
  if (!(whisper && whisper.pret)) return { ok: true, fichier: r.relatif, duree: r.duree, calage: 'lettres', transcription: null };
  // Transcriptions d'une même scène l'une après l'autre (une prise refaite pendant la transcription de la précédente).
  const cle = `${path.resolve(projet)}|${id}`;
  const travail = (fileTranscriptions.get(cle) || Promise.resolve()).then(() => transcrirePrise({ projet, relatif: r.relatif, texte: scene.voix.texte, whisper }));
  const suivante = travail.catch(() => {}).then(() => { if (fileTranscriptions.get(cle) === suivante) fileTranscriptions.delete(cle); });
  fileTranscriptions.set(cle, suivante);
  if (enFond) return { ok: true, fichier: r.relatif, duree: r.duree, calage: 'lettres', transcription: travail.catch(() => ({ ok: false })) };
  const t = await travail;
  return { ok: true, fichier: r.relatif, duree: r.duree, calage: t.ok ? 'whisper' : 'lettres', ...(t.ok ? {} : { avertissement: t.message }) };
}

/** Ouvre le studio de voix de l'aperçu (déjà lancé) sur une scène. -> { ok, url?, message? } */
function ouvrirStudio({ dossier, scene: id, ouvrir }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const { scene, message } = sceneAvecTexte(deroule, id);
  if (!scene) return { ok: false, message };
  const { etatProjet } = require('./etat.js');
  const e = etatProjet(projet);
  if (!e.apercu || !e.apercu.actif) return { ok: false, message: `Lancez l'aperçu : pulse-motion apercu ${dossier} --ouvrir, puis relancez cette commande.` };
  const url = `${e.apercu.url}?studio=${encodeURIComponent(id)}`;
  (ouvrir || require('./apercu.js').ouvrirNavigateur)(url);
  return { ok: true, url };
}

/** Transcrit les prises (pas la voix provisoire) dont les mots ne viennent pas d'une transcription à jour. */
async function transcrireProjet({ dossier, scene: id, whisper = whisperParDefaut() }) {
  const projet = path.resolve(dossier);
  if (!whisper || !whisper.pret) return { ok: false, scenes: [], message: 'La transcription n\'est pas installée : « pulse-motion whisper installer » (une fois, avec votre accord).' };
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, scenes: [], message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const scenes = deroule.scenes.filter((s) => s.voix && s.voix.fichier && (!id || s.id === id));
  if (id && !scenes.length) return { ok: false, scenes: [], message: `La scène « ${id} » n'a pas de prise de voix.` };
  const faites = [];
  const avertissements = [];
  for (const s of scenes) {
    const v = lireVoixScene(projet, deroule, s);
    if (!v || v.erreur || (v.approche === 'whisper' && !v.alertes.length)) continue;
    // Progrès sur la sortie d'erreur (la sortie standard reste un JSON seul).
    let dernier = -1;
    const surProgression = (p) => { if (p >= dernier + 10) { dernier = p; process.stderr.write(`Transcription de la scène « ${s.id} » : ${p} %\n`); } };
    const t = await transcrirePrise({ projet, relatif: s.voix.fichier, texte: s.voix.texte, whisper, surProgression });
    faites.push({ id: s.id, calage: t.ok ? 'whisper' : 'lettres' });
    if (!t.ok) avertissements.push(`Scène « ${s.id} » : ${t.message}`);
  }
  return { ok: true, scenes: faites, ...(avertissements.length ? { avertissement: avertissements.join(' ') } : {}) };
}

/** Voix du système -> WAV. -> { ok, message? } */
function synthetiserSysteme(texte, sortie, { plateforme = process.platform, lancer = spawnSync } = {}) {
  let r;
  // Texte passé par un fichier : jamais pris pour une option (« -v… ») ni coupé par les guillemets.
  const fichierTexte = `${sortie}.txt`;
  if (plateforme !== 'win32') fs.writeFileSync(fichierTexte, texte);
  if (plateforme === 'win32') {
    const script = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
      + '$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "fr*" } | Select-Object -First 1; '
      + 'if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.SetOutputToWaveFile($env:PM_SORTIE); $s.Speak($env:PM_TEXTE); $s.Dispose()';
    r = lancer('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, PM_TEXTE: texte, PM_SORTIE: sortie }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  } else if (plateforme === 'darwin') {
    // Voix françaises de macOS, puis la voix par défaut.
    for (const voix of ['Thomas', 'Amélie', null]) {
      r = lancer('say', [...(voix ? ['-v', voix] : []), '-o', sortie, '--data-format=LEI16@48000', '-f', fichierTexte], { encoding: 'utf8', timeout: 60000 });
      if (!r.error && r.status === 0 && fs.existsSync(sortie)) break;
    }
  } else {
    r = lancer('espeak-ng', ['-v', 'fr', '-w', sortie, '-f', fichierTexte], { encoding: 'utf8', timeout: 60000 });
  }
  fs.rmSync(fichierTexte, { force: true });
  if (r.error || r.status !== 0 || !fs.existsSync(sortie)) {
    return { ok: false, message: plateforme === 'linux'
      ? 'aucune voix du système : installez espeak-ng (ex. « sudo apt install espeak-ng »)'
      : 'aucune voix du système n\'a pu lire le texte' };
  }
  return { ok: true };
}

/** Voix provisoire pour les scènes qui ont un texte (ou une seule). -> { ok, scenes, message? } */
async function voixProvisoire({ dossier, scene: id, synthetiser = synthetiserSysteme, outil = F.trouverFfmpeg() }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, scenes: [], message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  // Sans --scene : les scènes qui ont déjà une vraie prise la gardent.
  let scenes = deroule.scenes.filter((s) => s.voix && s.voix.texte && !s.voix.fichier);
  if (id) {
    const r = sceneAvecTexte(deroule, id);
    if (!r.scene) return { ok: false, scenes: [], message: r.message };
    scenes = [r.scene];
  }
  if (!scenes.length && deroule.scenes.some((s) => s.voix && s.voix.texte)) return { ok: true, scenes: [], message: 'Toutes les scènes qui ont un texte ont déjà leur vraie voix : rien à faire.' };
  if (!scenes.length) return { ok: false, scenes: [], message: 'Aucune scène n\'a de texte de voix (« voix.texte ») dans le déroulé.' };
  sauvegarder(projet);
  const faites = [];
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-voix-'));
  try {
    for (const s of scenes) {
      const brut = path.join(travail, `${s.id}.wav`);
      const r = synthetiser(s.voix.texte, brut);
      if (!r.ok) return { ok: false, scenes: faites, message: `Voix provisoire impossible : ${r.message}.` };
      const p = await ecrirePrise({ projet, scene: s.id, octets: new Uint8Array(fs.readFileSync(brut)), texte: s.voix.texte, provisoire: true, outil: outil && outil.present ? outil : null });
      faites.push({ id: s.id, fichier: p.relatif, duree: p.duree });
    }
  } finally {
    fs.rmSync(travail, { recursive: true, force: true });
  }
  if (!(deroule.voix && deroule.voix.provisoire)) ecrireDeroule(projet, (d) => { d.voix = { ...(d.voix || {}), provisoire: true }; });
  return { ok: true, scenes: faites };
}

if (require.main === module) {
  const [action, ...args] = process.argv.slice(2);
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
  const libres = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scene');
  let travail;
  if (action === 'importer' && libres[0]) travail = importerVoix({ dossier: libres[1] || '.', fichier: libres[0], scene: valeur('--scene') });
  else if (action === 'provisoire') travail = voixProvisoire({ dossier: libres[0] || '.', scene: valeur('--scene') });
  else if (action === 'transcrire') travail = transcrireProjet({ dossier: libres[0] || '.', scene: valeur('--scene') });
  else if (action === 'studio' && libres[0]) travail = Promise.resolve(ouvrirStudio({ dossier: libres[1] || '.', scene: libres[0] }));
  else {
    console.error('Usage : pulse-motion voix importer <fichier> [--scene <id>] [dossier] | provisoire [--scene <id>] [dossier] | transcrire [--scene <id>] [dossier] | studio <scène> [dossier]');
    process.exit(2);
  }
  travail.then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
    (e) => { console.log(JSON.stringify({ ok: false, message: e.message }, null, 2)); process.exit(1); });
}

module.exports = { importerVoix, enregistrerPrise, ecrireDeroule, voixProvisoire, transcrireProjet, ouvrirStudio, synthetiserSysteme };
