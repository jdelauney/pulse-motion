'use strict';
/* Pulse Motion – Whisper (transcription des voix) : Python trouvé, environnement isolé et modèle dans
 * ~/.pulse-motion/whisper/ (PM_WHISPER pour le changer), transcription lancée avec un délai. Jamais obligatoire. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const MODELE_DEFAUT = 'large-v3-turbo';
const SCRIPT = path.join(__dirname, '..', 'whisper', 'transcrire.py');

const dossierWhisper = () => process.env.PM_WHISPER || path.join(os.homedir(), '.pulse-motion', 'whisper');
const pythonDuVenv = (dossier) => (process.platform === 'win32' ? path.join(dossier, 'venv', 'Scripts', 'python.exe') : path.join(dossier, 'venv', 'bin', 'python'));

/** Python 3.9 ou plus récent (le raccourci du Microsoft Store, qui ne lance rien, est écarté). -> { commande, version } | null */
function trouverPython({ candidats } = {}) {
  const liste = candidats || (process.platform === 'win32' ? [['py', '-3'], ['python']] : [['python3'], ['python']]);
  for (const commande of liste) {
    const r = spawnSync(commande[0], [...commande.slice(1), '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const m = /Python 3\.(\d+)\.(\d+)/.exec(`${r.stdout || ''}${r.stderr || ''}`);
    if (!r.error && r.status === 0 && m && Number(m[1]) >= 9) return { commande, version: `3.${m[1]}.${m[2]}` };
  }
  return null;
}

/** Commande d'installation de Python par le système (accord de la personne demandé par le skill). */
function commandeSysteme() {
  if (process.platform === 'win32') return { commande: 'winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements', message: 'Python s\'installe avec winget.' };
  if (process.platform === 'darwin') return { commande: 'brew install python', message: 'Python s\'installe avec Homebrew.' };
  return { commande: null, message: 'Dans un terminal : sudo apt install python3 python3-venv (votre mot de passe sera demandé).' };
}

/** Étapes de l'installation : environnement isolé, faster-whisper, modèle. -> [commande] */
function commandesInstallation(python, dossier, modele = MODELE_DEFAUT) {
  const venv = pythonDuVenv(dossier);
  const cible = path.join(dossier, 'modeles', modele);
  return [
    [...python, '-m', 'venv', path.join(dossier, 'venv')],
    [venv, '-m', 'pip', 'install', '--upgrade', 'faster-whisper'],
    [venv, '-c', `from faster_whisper import download_model; download_model("${modele}", output_dir=r"${cible}")`],
  ];
}

function lireVersion(dossier) {
  try { return JSON.parse(fs.readFileSync(path.join(dossier, 'version.json'), 'utf8')); } catch { return null; }
}

/** État de l'installation. */
function etatWhisper({ dossier = dossierWhisper(), python = trouverPython() } = {}) {
  const venv = fs.existsSync(pythonDuVenv(dossier));
  const v = lireVersion(dossier);
  const modele = v && v.modele && fs.existsSync(path.join(dossier, 'modeles', v.modele, 'model.bin')) ? v.modele : null;
  const pret = venv && Boolean(modele);
  const etat = { dossier, python, venv, modele, pret, commandes: python ? commandesInstallation(python.commande, dossier) : [] };
  if (pret) etat.message = `La transcription est prête (modèle ${modele}).`;
  else if (!python && !venv) {
    etat.message = 'Python (3.9 ou plus récent) est nécessaire pour la transcription, et il est introuvable.';
    etat.commandeSysteme = commandeSysteme();
  } else etat.message = 'La transcription n\'est pas installée : « pulse-motion whisper installer » (environ 800 Mo à télécharger une fois).';
  return etat;
}

/** Transcrit une prise. -> Promise<{ ok: true, mots } | { ok: false, message }> */
function transcrire({ wav, duree, langue = 'fr', dossier = dossierWhisper(), python, env = {}, delaiMax }) {
  const commande = python || [pythonDuVenv(dossier)];
  const v = lireVersion(dossier);
  const modele = path.join(dossier, 'modeles', (v && v.modele) || MODELE_DEFAUT);
  const limite = delaiMax || (10 * duree + 60) * 1000;
  return new Promise((resoudre) => {
    let fini = false;
    const finir = (r) => { if (!fini) { fini = true; clearTimeout(minuterie); resoudre(r); } };
    const p = spawn(commande[0], [...commande.slice(1), SCRIPT, wav, '--modele', modele, '--langue', langue],
      { env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...env }, windowsHide: true });
    const minuterie = setTimeout(() => {
      try { p.kill(); } catch { /* déjà arrêté */ }
      finir({ ok: false, message: 'La transcription a pris trop longtemps : mots calés approximativement.' });
    }, limite);
    let sortie = '';
    let erreurs = '';
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { erreurs = (erreurs + d).slice(-4000); });
    p.on('error', (e) => finir({ ok: false, message: `La transcription a échoué (${e.message}).` }));
    p.on('close', (code) => {
      const derniere = sortie.trim().split(/\r?\n/).pop() || '';
      try {
        if (code !== 0) throw new Error(erreurs.trim().split(/\r?\n/).pop() || `code ${code}`);
        const mots = JSON.parse(derniere);
        if (!Array.isArray(mots)) throw new Error('réponse inattendue');
        finir({ ok: true, mots });
      } catch (e) {
        finir({ ok: false, message: `La transcription a échoué (${e.message}).` });
      }
    });
  });
}

const ETAPES = ['environnement Python', 'installation de faster-whisper', 'téléchargement du modèle'];

function lancerCommande(commande) {
  return new Promise((resoudre) => {
    // La sortie de pip va sur la sortie d'erreur : la sortie standard de la commande reste un JSON seul.
    const p = spawn(commande[0], commande.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    p.stdout.on('data', (d) => process.stderr.write(d));
    let erreurs = '';
    p.stderr.on('data', (d) => { process.stderr.write(d); erreurs = (erreurs + d).slice(-4000); });
    p.on('error', (e) => resoudre({ code: 1, erreurs: e.message }));
    p.on('close', (code) => resoudre({ code, erreurs }));
  });
}

/** Installe la transcription (environnement isolé, faster-whisper, modèle). -> { ok, message, modele? } */
async function installerWhisper({ dossier = dossierWhisper(), modele = MODELE_DEFAUT, python = trouverPython(), lancer = lancerCommande } = {}) {
  if (!python) {
    const s = commandeSysteme();
    return { ok: false, message: `Python (3.9 ou plus récent) est introuvable. ${s.message}${s.commande ? ` Commande : ${s.commande}` : ''}` };
  }
  fs.mkdirSync(dossier, { recursive: true });
  const commandes = commandesInstallation(python.commande, dossier, modele);
  for (let i = 0; i < commandes.length; i++) {
    const r = await lancer(commandes[i]);
    if (r.code !== 0) {
      const cause = String(r.erreurs || '').trim().split(/\r?\n/).pop() || `code ${r.code}`;
      return { ok: false, message: `L'installation de la transcription a échoué (${ETAPES[i]} : ${cause}).` };
    }
  }
  fs.writeFileSync(path.join(dossier, 'version.json'), JSON.stringify({ modele, date: new Date().toISOString() }, null, 2));
  return { ok: true, modele, message: `La transcription est installée (modèle ${modele}, dans ${dossier}).` };
}

/** Whisper tel qu'installé sur l'ordinateur : { pret, transcrire }. */
function whisperParDefaut() {
  return { pret: etatWhisper({ python: null }).pret, transcrire };
}

module.exports = { MODELE_DEFAUT, dossierWhisper, pythonDuVenv, trouverPython, commandeSysteme, commandesInstallation, etatWhisper, transcrire, installerWhisper, whisperParDefaut };
