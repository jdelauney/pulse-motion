#!/usr/bin/env node
'use strict';
/* Pulse Motion – état de l'ordinateur en une commande (skill « outils »).
 *
 *   node scripts/outils.js   { node, navigateur, carteGraphique, ffmpeg, python, transcription, voixSysteme, voixSynthese } ; code 0 même s'il
 *   manque des outils. carteGraphique : sondée seulement si un navigateur est trouvé (null sinon), 20 s au plus.
 *   node scripts/outils.js --plan   ce qui manque et serait utile, dans l'ordre où l'installer (spec Retouches et ergonomie,
 *   5.6 point 4) : [{ outil, pourquoi, taille, duree, commande, leger?, texte? }] ; commande : celle que Claude lance après un
 *   seul accord pour toute la liste (jamais sudo ; null : la personne tape elle-même « texte », ou rien à installer d'ici).
 *   node scripts/outils.js --langue en   voixSysteme dit si une voix de cette langue existe (vidéo dans une autre langue, spec S9 5.1).
 *
 * Chaque détection est indépendante : une qui échoue (exception) est rendue « ok: false » avec son message.
 */
const { spawnSync } = require('node:child_process');

/** Voix du système, pour la voix provisoire. langue (étiquette, facultative, spec S9 5.1) : dit si une voix de cette langue
 *  existe (Windows : culture de la voix ; macOS : voix de say -v ?). -> { ok, message } */
function voixSysteme({ plateforme = process.platform, lancer = spawnSync, langue = null } = {}) {
  const options = { encoding: 'utf8', windowsHide: true, timeout: 20000 };
  if (langue && plateforme !== 'linux') {
    const L = require('../moteur/langues.js').de(langue);
    const r = plateforme === 'win32'
      ? lancer('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `Add-Type -AssemblyName System.Speech; @((New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "${L.code}*" }).Count`], options)
      : lancer('say', ['-v', '?'], options);
    const sortie = String(r.stdout || '');
    const trouvee = !r.error && r.status === 0 && (plateforme === 'win32' ? parseInt(sortie.trim(), 10) > 0 : new RegExp(`\\s${L.code}[_-]`, 'i').test(sortie));
    return trouvee
      ? { ok: true, message: `Une voix ${L.adjectif} de l'ordinateur est disponible pour la voix provisoire.` }
      : { ok: false, message: plateforme === 'win32'
        ? `Aucune voix ${L.adjectif} sur l'ordinateur : en ajouter une dans Paramètres → Heure et langue → Voix → Ajouter des voix, ou enregistrer la voix.`
        : `Aucune voix ${L.adjectif} sur l'ordinateur : en ajouter une dans Réglages Système → Accessibilité → Contenu énoncé → Voix du système, ou enregistrer la voix.` };
  }
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

/** -> { node, navigateur, carteGraphique, ffmpeg, python, transcription, voixSysteme } */
function etatOutils(options = {}) {
  const N = () => require('./lib/navigateur.js');
  const F = () => require('./lib/ffmpeg.js');
  const Wh = () => require('./lib/whisper.js');
  const {
    trouverNavigateur = () => N().trouverNavigateur(),
    trouverFfmpeg = () => F().trouverFfmpeg(),
    etatWhisper = () => Wh().etatWhisper(),
    pythonAncien = () => Wh().pythonAncien(),
    voixSysteme: voix = () => voixSysteme(options.langue ? { langue: options.langue } : {}),
    sonderCarteGraphique = (o) => require('./lib/carte-graphique.js').sonderCarteGraphique(o),
    etatVoixLocale = () => require('./lib/voix-locale.js').etatVoixLocale(),
  } = options;
  const majeure = Number(process.versions.node.split('.')[0]);
  const echec = (quoi) => (e) => ({ ok: false, message: `${quoi} n'a pas pu être vérifié (${e.message}).` });

  const navigateur = essayer(() => {
    const chemin = trouverNavigateur();
    return chemin ? { ok: true, chemin, message: 'Chrome ou Edge est prêt pour l\'aperçu et les contrôles.' }
      : { ok: false, chemin: null, message: 'Chrome ou Edge introuvable : en installer un pour l\'aperçu, les contrôles et l\'export.' };
  }, (e) => ({ ok: false, chemin: null, message: `Chrome ou Edge introuvable (${e.message}).` }));

  // Rendu graphique logiciel (spec S2, 5.18) : seulement si un navigateur est trouvé.
  const carteGraphique = navigateur.ok ? essayer(() => sonderCarteGraphique({ navigateur: navigateur.chemin }), echec('La carte graphique')) : null;

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
    pulseMotion: { ok: true, version: require('../.claude-plugin/plugin.json').version },
    node: { ok: majeure >= 20, version: process.versions.node },
    navigateur,
    carteGraphique,
    ffmpeg,
    python,
    transcription,
    voixSysteme: essayer(() => voix(), echec('La voix de l\'ordinateur')),
    // Voix de synthèse locale facultative (spec S7, 5.12) : installée seulement à la demande, avec accord.
    voixSynthese: essayer(() => {
      const e = etatVoixLocale();
      return { ok: Boolean(e.pret), variante: e.variante || null, message: e.message };
    }, echec('La voix de synthèse')),
  };
}

/**
 * Plan d'installation (5.6 point 4), d'après l'état des outils : ffmpeg, puis Python (seulement si la transcription manque),
 * puis la transcription, puis le navigateur (rien à installer d'ici). Commandes sûres seulement : celles du système sans sudo,
 * et « pulse-motion whisper installer » pour la transcription. -> [{ outil, pourquoi, taille, duree, commande, leger?, texte? }]
 */
function planOutils(etat, { plateforme = process.platform, commandeFfmpeg, commandePython } = {}) {
  const F = require('./lib/ffmpeg.js');
  const sure = (c) => (c && !/^sudo\s/.test(c) ? c : null);
  const plan = [];
  if (etat.ffmpeg && !etat.ffmpeg.ok) {
    const c = commandeFfmpeg !== undefined ? commandeFfmpeg : F.commandeSure({ plateforme });
    plan.push({ outil: 'ffmpeg', pourquoi: 'un MP4 de qualité avec un son propre', taille: '≈ 100 Mo', duree: '1 à 2 min', commande: sure(c),
      ...(sure(c) ? {} : { texte: F.commandeInstallation({ plateforme }) }) });
  }
  const sansTranscription = etat.transcription && !etat.transcription.ok;
  if (sansTranscription && etat.python && !etat.python.ok) {
    const systeme = etat.python.commandeSysteme || null;
    const c = commandePython !== undefined ? commandePython : systeme && systeme.commande;
    plan.push({ outil: 'python', pourquoi: 'nécessaire à la transcription', taille: '≈ 30 Mo', duree: '1 à 2 min', commande: sure(c),
      ...(sure(c) ? {} : { texte: (systeme && systeme.message) || 'installer Python 3 avec le gestionnaire de paquets du système' }) });
  }
  if (sansTranscription) {
    plan.push({ outil: 'transcription', pourquoi: 'caler les sous-titres et les animations sur les vrais mots de la voix', taille: '≈ 800 Mo', leger: '≈ 250 Mo',
      duree: '3 à 6 min', commande: 'pulse-motion whisper installer', commandeLegere: 'pulse-motion whisper installer --modele small' });
  }
  if (etat.navigateur && !etat.navigateur.ok) {
    plan.push({ outil: 'navigateur', pourquoi: 'regarder la vidéo, la contrôler, l\'exporter', taille: '≈ 150 Mo', duree: '2 min', commande: null,
      texte: 'installer Chrome ou Edge depuis leur site' });
  }
  return plan;
}

if (require.main === module) {
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify(planOutils(etatOutils({ sonderCarteGraphique: () => null })), null, 2));
    process.exit(0);
  }
  const i = process.argv.indexOf('--langue');
  console.log(JSON.stringify(etatOutils(i > 0 && process.argv[i + 1] ? { langue: process.argv[i + 1] } : {}), null, 2));
  process.exit(0);
}

module.exports = { etatOutils, voixSysteme, planOutils };
