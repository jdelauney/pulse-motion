#!/usr/bin/env node
'use strict';
/* Pulse Motion – voix d'une vidéo.
 *
 *   node scripts/voix.js importer <fichier> --scene <id> [dossier]   une prise pour une scène (WAV, ou tout format avec ffmpeg)
 *   node scripts/voix.js provisoire [--scene <id>] [dossier]           voix du système pour caler avant d'enregistrer
 *
 * Résumé JSON ; code 1 en cas d'échec.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lireDeroule } = require('./lib/deroule.js');
const F = require('./lib/ffmpeg.js');
const { ecrirePrise } = require('./lib/voix.js');
const W = require('../moteur/wav.js');
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

/** Une prise pour une scène. -> { ok, fichier?, duree?, message? } */
async function importerVoix({ dossier, fichier, scene: id, outil = F.trouverFfmpeg() }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const { scene, message } = sceneAvecTexte(deroule, id);
  if (!scene) return { ok: false, message };
  if (!fs.existsSync(fichier)) return { ok: false, message: `Fichier introuvable : « ${fichier} ».` };
  let octets;
  // Un WAV 16 bits ou flottant se lit directement ; un autre WAV (24 bits, 8 bits…) ou format passe par ffmpeg.
  const lisible = (o) => { try { W.lire(new Uint8Array(o)); return true; } catch { return false; } };
  const estWav = /\.wav$/i.test(fichier);
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
  // Copie d'historique seulement quand la prise est lisible : un essai raté ne laisse rien.
  sauvegarder(projet);
  const r = await ecrirePrise({ projet, scene: id, octets: new Uint8Array(octets), texte: scene.voix.texte, outil: outil && outil.present ? outil : null });
  ecrireDeroule(projet, (d) => { d.scenes.find((s) => s.id === id).voix.fichier = r.relatif; });
  return { ok: true, fichier: r.relatif, duree: r.duree };
}

/** Voix du système -> WAV. -> { ok, message? } */
function synthetiserSysteme(texte, sortie) {
  let r;
  if (process.platform === 'win32') {
    const script = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
      + '$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "fr*" } | Select-Object -First 1; '
      + 'if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.SetOutputToWaveFile($env:PM_SORTIE); $s.Speak($env:PM_TEXTE); $s.Dispose()';
    r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, PM_TEXTE: texte, PM_SORTIE: sortie }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  } else if (process.platform === 'darwin') {
    r = spawnSync('say', ['-v', 'Thomas', '-o', sortie, '--data-format=LEI16@48000', texte], { encoding: 'utf8', timeout: 60000 });
  } else {
    r = spawnSync('espeak-ng', ['-v', 'fr', '-w', sortie, texte], { encoding: 'utf8', timeout: 60000 });
  }
  if (r.error || r.status !== 0 || !fs.existsSync(sortie)) {
    return { ok: false, message: process.platform === 'linux'
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
  let scenes = deroule.scenes.filter((s) => s.voix && s.voix.texte);
  if (id) {
    const r = sceneAvecTexte(deroule, id);
    if (!r.scene) return { ok: false, scenes: [], message: r.message };
    scenes = [r.scene];
  }
  if (!scenes.length) return { ok: false, scenes: [], message: 'Aucune scène n\'a de texte de voix (« voix.texte ») dans le déroulé.' };
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
  if (action === 'importer' && libres[0] && valeur('--scene')) travail = importerVoix({ dossier: libres[1] || '.', fichier: libres[0], scene: valeur('--scene') });
  else if (action === 'provisoire') travail = voixProvisoire({ dossier: libres[0] || '.', scene: valeur('--scene') });
  else {
    console.error('Usage : pulse-motion voix importer <fichier> --scene <id> [dossier] | provisoire [--scene <id>] [dossier]');
    process.exit(2);
  }
  travail.then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
    (e) => { console.log(JSON.stringify({ ok: false, message: e.message }, null, 2)); process.exit(1); });
}

module.exports = { importerVoix, voixProvisoire, synthetiserSysteme };
