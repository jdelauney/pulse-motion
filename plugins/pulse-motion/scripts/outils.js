#!/usr/bin/env node
'use strict';
/* Pulse Motion – état de l'ordinateur en une commande (skill « outils »).
 *
 *   node scripts/outils.js   { node, navigateur, ffmpeg, python, transcription, voixSysteme } ; code 0 même s'il manque des outils
 *
 * Chaque détection est indépendante : une qui échoue (exception) est rendue « ok: false » avec son message.
 */
const { spawnSync } = require('node:child_process');

/** Voix du système, pour la voix provisoire. -> { ok, message } */
function voixSysteme({ plateforme = process.platform, lancer = spawnSync } = {}) {
  const options = { encoding: 'utf8', windowsHide: true, timeout: 20000 };
  if (plateforme === 'win32') {
    const r = lancer('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count'], options);
    const n = parseInt(String(r.stdout || '').trim(), 10);
    return !r.error && r.status === 0 && n > 0
      ? { ok: true, message: 'La voix de l\'ordinateur est disponible pour la voix provisoire.' }
      : { ok: false, message: 'Aucune voix de l\'ordinateur : en ajouter une dans Paramètres → Heure et langue → Voix.' };
  }
  if (plateforme === 'darwin') {
    const r = lancer('say', ['-v', '?'], options);
    return !r.error && r.status === 0
      ? { ok: true, message: 'La voix de l\'ordinateur est disponible pour la voix provisoire.' }
      : { ok: false, message: 'La voix de l\'ordinateur (say) est introuvable.' };
  }
  const r = lancer('espeak-ng', ['--version'], options);
  return !r.error && r.status === 0
    ? { ok: true, message: 'La voix de l\'ordinateur (espeak-ng) est disponible pour la voix provisoire.' }
    : { ok: false, message: 'Aucune voix de l\'ordinateur : dans un terminal, « sudo apt install espeak-ng » (votre mot de passe sera demandé).' };
}

function essayer(fn, siErreur) {
  try { return fn(); } catch (e) { return siErreur(e); }
}

/** -> { node, navigateur, ffmpeg, python, transcription, voixSysteme } */
function etatOutils(options = {}) {
  const N = () => require('./lib/navigateur.js');
  const F = () => require('./lib/ffmpeg.js');
  const Wh = () => require('./lib/whisper.js');
  const {
    trouverNavigateur = () => N().trouverNavigateur(),
    trouverFfmpeg = () => F().trouverFfmpeg(),
    etatWhisper = () => Wh().etatWhisper(),
    pythonAncien = () => Wh().pythonAncien(),
    voixSysteme: voix = () => voixSysteme(),
  } = options;
  const majeure = Number(process.versions.node.split('.')[0]);
  const echec = (quoi) => (e) => ({ ok: false, message: `${quoi} n'a pas pu être vérifié (${e.message}).` });

  const navigateur = essayer(() => {
    const chemin = trouverNavigateur();
    return chemin ? { ok: true, chemin, message: 'Chrome ou Edge est prêt pour l\'aperçu et les contrôles.' }
      : { ok: false, chemin: null, message: 'Chrome ou Edge introuvable : en installer un pour l\'aperçu, les contrôles et l\'export.' };
  }, (e) => ({ ok: false, chemin: null, message: `Chrome ou Edge introuvable (${e.message}).` }));

  const ffmpeg = essayer(() => {
    const f = trouverFfmpeg();
    const ok = Boolean(f.present && f.versionOk);
    return { ok, version: f.version || null, commande: f.commande || null,
      message: f.message || (ok ? 'ffmpeg est prêt pour l\'export fidèle.' : 'ffmpeg est absent : l\'export se fera dans le navigateur.') };
  }, echec('ffmpeg'));

  const whisper = essayer(() => ({ etat: etatWhisper() }), (e) => ({ erreur: e }));
  const ancien = essayer(() => pythonAncien(), () => null);
  const python = whisper.erreur ? echec('Python')(whisper.erreur) : (() => {
    const p = whisper.etat.python;
    const ok = Boolean(p) || Boolean(whisper.etat.venv);
    const vieux = p ? null : ancien;
    const systeme = whisper.etat.commandeSysteme || null;
    const message = p ? `Python ${p.version} est prêt.`
      : ok ? 'La transcription a son propre Python.'
        : vieux ? `Python ${vieux} est trop ancien (3.9 ou plus récent requis).${systeme ? ` ${systeme.message}` : ''}`
          : `Python est introuvable (nécessaire seulement pour la transcription).${systeme ? ` ${systeme.message}` : ''}`;
    return { ok, version: p ? p.version : null, ancien: vieux, commandeSysteme: systeme, message };
  })();
  const transcription = whisper.erreur ? echec('La transcription')(whisper.erreur) : {
    ok: Boolean(whisper.etat.pret), modele: whisper.etat.modele || null, message: whisper.etat.message,
  };

  return {
    node: { ok: majeure >= 20, version: process.versions.node },
    navigateur,
    ffmpeg,
    python,
    transcription,
    voixSysteme: essayer(() => voix(), echec('La voix de l\'ordinateur')),
  };
}

if (require.main === module) {
  console.log(JSON.stringify(etatOutils(), null, 2));
  process.exit(0);
}

module.exports = { etatOutils, voixSysteme };
