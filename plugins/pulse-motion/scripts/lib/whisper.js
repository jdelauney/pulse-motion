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

/** Versions de Python trouvées, dans l'ordre des commandes candidates. -> [{ commande, majeure, mineure, correctif }] */
function versionsPython(candidats) {
  const liste = candidats || (process.platform === 'win32' ? [['py', '-3'], ['python']] : [['python3'], ['python']]);
  const trouvees = [];
  for (const commande of liste) {
    const r = spawnSync(commande[0], [...commande.slice(1), '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const m = /Python (\d+)\.(\d+)\.(\d+)/.exec(`${r.stdout || ''}${r.stderr || ''}`);
    if (!r.error && r.status === 0 && m) trouvees.push({ commande, majeure: Number(m[1]), mineure: Number(m[2]), correctif: Number(m[3]) });
  }
  return trouvees;
}
const recent = (v) => v.majeure > 3 || (v.majeure === 3 && v.mineure >= 9);

/** Python 3.9 ou plus récent (le raccourci du Microsoft Store, qui ne lance rien, est écarté). -> { commande, version } | null */
function trouverPython({ candidats } = {}) {
  const v = versionsPython(candidats).find(recent);
  return v ? { commande: v.commande, version: `${v.majeure}.${v.mineure}.${v.correctif}` } : null;
}

/** Version d'un Python trop ancien (avant 3.9) trouvé à la place, pour le dire. -> '3.7.2' | null */
function pythonAncien({ candidats } = {}) {
  const v = versionsPython(candidats).find((x) => !recent(x));
  return v ? `${v.majeure}.${v.mineure}.${v.correctif}` : null;
}

/** Commande lisible (copiable dans un terminal) : arguments avec espaces ou guillemets entre guillemets. */
function afficherCommande(commande) {
  return commande.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
}

const MODELE_VALIDE = /^[a-z0-9.-]+$/;

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
    // Nom du modèle et dossier passés en arguments : jamais insérés dans le code Python.
    [venv, '-c', 'import sys; from faster_whisper import download_model; download_model(sys.argv[1], output_dir=sys.argv[2])', modele, cible],
  ];
}

function lireVersion(dossier) {
  try { return JSON.parse(fs.readFileSync(path.join(dossier, 'version.json'), 'utf8')); } catch { return null; }
}

/** État de l'installation. */
function etatWhisper({ dossier = dossierWhisper(), python = trouverPython(), ancien } = {}) {
  const venv = fs.existsSync(pythonDuVenv(dossier));
  const v = lireVersion(dossier);
  const modele = v && v.modele && fs.existsSync(path.join(dossier, 'modeles', v.modele, 'model.bin')) ? v.modele : null;
  const pret = venv && Boolean(modele);
  const etat = { dossier, python, venv, modele, pret, commandes: python ? commandesInstallation(python.commande, dossier) : [] };
  if (pret) etat.message = `La transcription est prête (modèle ${modele}).`;
  else if (!python && !venv) {
    const vieux = ancien !== undefined ? ancien : pythonAncien();
    etat.message = vieux
      ? `Python ${vieux} est trop ancien pour la transcription (3.9 ou plus récent requis).`
      : 'Python (3.9 ou plus récent) est nécessaire pour la transcription, et il est introuvable.';
    etat.commandeSysteme = commandeSysteme();
  } else etat.message = 'La transcription n\'est pas installée : « pulse-motion whisper installer » (environ 800 Mo à télécharger une fois).';
  return etat;
}

/** Transcrit une prise. -> Promise<{ ok: true, mots } | { ok: false, message }> */
function transcrire({ wav, duree, langue = 'fr', dossier = dossierWhisper(), python, env = {}, delaiMax, surProgression }) {
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
    p.stderr.on('data', (d) => {
      erreurs = (erreurs + d).slice(-4000);
      // Progrès : le script écrit la fin de chaque passage entendu, en secondes, sur une ligne.
      if (surProgression && duree > 0) {
        for (const ligne of String(d).split(/\r?\n/)) {
          if (/^\d+(\.\d+)?$/.test(ligne.trim())) surProgression(Math.min(100, Math.round(100 * Number(ligne) / duree)));
        }
      }
    });
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
async function installerWhisper({ dossier = dossierWhisper(), modele = MODELE_DEFAUT, python = trouverPython(), lancer = lancerCommande, ancien } = {}) {
  if (!MODELE_VALIDE.test(String(modele))) {
    return { ok: false, message: `Nom de modèle invalide : « ${modele} » (lettres minuscules, chiffres, points et tirets, ex. small ou large-v3-turbo).` };
  }
  if (!python) {
    const s = commandeSysteme();
    const vieux = ancien !== undefined ? ancien : pythonAncien();
    const quoi = vieux ? `Python ${vieux} est trop ancien (3.9 ou plus récent requis).` : 'Python (3.9 ou plus récent) est introuvable.';
    return { ok: false, message: `${quoi} ${s.message}${s.commande ? ` Commande : ${s.commande}` : ''}` };
  }
  fs.mkdirSync(dossier, { recursive: true });
  const commandes = commandesInstallation(python.commande, dossier, modele);
  for (let i = 0; i < commandes.length; i++) {
    const r = await lancer(commandes[i]);
    if (r.code !== 0) {
      const cause = String(r.erreurs || '').trim().split(/\r?\n/).pop() || `code ${r.code}`;
      if (i === 0) {
        // Environnement incomplet : retiré, pour qu'il ne passe pas pour installé.
        fs.rmSync(path.join(dossier, 'venv'), { recursive: true, force: true });
        if (/ensurepip|No module named venv/i.test(String(r.erreurs))) {
          return { ok: false, message: 'Python ne sait pas créer d\'environnement isolé sur cet ordinateur : dans un terminal, « sudo apt install python3-venv » (votre mot de passe sera demandé), puis relancer l\'installation.' };
        }
      }
      return { ok: false, message: `L'installation de la transcription a échoué (${ETAPES[i]} : ${cause}).` };
    }
  }
  fs.writeFileSync(path.join(dossier, 'version.json'), JSON.stringify({ modele, date: new Date().toISOString() }, null, 2));
  return { ok: true, modele, message: `La transcription est installée (modèle ${modele}, dans ${dossier}).` };
}

/** Whisper tel qu'installé sur l'ordinateur : { pret, transcrire }. */
function whisperParDefaut() {
  return { pret: etatWhisper({ python: null, ancien: null }).pret, transcrire };
}

module.exports = { MODELE_DEFAUT, dossierWhisper, pythonDuVenv, trouverPython, pythonAncien, afficherCommande, commandeSysteme, commandesInstallation, etatWhisper, transcrire, installerWhisper, whisperParDefaut };
