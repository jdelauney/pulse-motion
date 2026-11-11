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

/** Numéro d'un dossier « Python312 » ou « Python3.12 » -> 312, pour trier du plus récent au plus ancien. */
const numeroPython = (nom) => Number(String(nom).replace(/\D/g, '')) || 0;

/**
 * Emplacements connus de Python hors du PATH (spec Retouches et ergonomie, 5.6 point 3) : un Python installé à l'instant
 * (winget, programme d'installation, Homebrew) n'est vu par l'outil qu'à son redémarrage ; on le cherche donc aussi ici, sur
 * le modèle de lib/ffmpeg.js. -> [[commande, ...arguments]] existants, le plus récent d'abord.
 */
function emplacementsPython({ env = process.env, plateforme = process.platform, existe = fs.existsSync, lister = (d) => fs.readdirSync(d) } = {}) {
  const chemins = plateforme === 'win32' ? path.win32 : path.posix;
  const r = [];
  if (plateforme === 'win32') {
    if (env.LOCALAPPDATA) {
      const racine = chemins.join(env.LOCALAPPDATA, 'Programs', 'Python');
      let dossiers = [];
      try { dossiers = lister(racine).filter((d) => /^Python3/i.test(d)); } catch { dossiers = []; }
      dossiers.sort((a, b) => numeroPython(b) - numeroPython(a));
      for (const d of dossiers) r.push([chemins.join(racine, d, 'python.exe')]);
      r.push([chemins.join(racine, 'Launcher', 'py.exe'), '-3']);
    }
    if (env.SystemRoot) r.push([chemins.join(env.SystemRoot, 'py.exe'), '-3']);
  } else {
    r.push(['/opt/homebrew/bin/python3'], ['/usr/local/bin/python3']);
  }
  return r.filter((c) => existe(c[0]));
}

/** Commandes candidates : celles du PATH, puis les emplacements connus. */
function candidatsPython(options = {}) {
  const plateforme = options.plateforme || process.platform;
  const duPath = plateforme === 'win32' ? [['py', '-3'], ['python']] : [['python3'], ['python']];
  return [...duPath, ...emplacementsPython(options)];
}

/** Versions de Python trouvées, dans l'ordre des commandes candidates. -> [{ commande, majeure, mineure, correctif }] */
function versionsPython(candidats) {
  const liste = candidats || candidatsPython();
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

// Phrases que Whisper invente sur un silence ou un bruit : génériques de sous-titrage amateur et formules de fin de
// vidéo apprises sur des vidéos en ligne. Comparées sans accents, ponctuation ni majuscules. Liste figée : ne l'étendre
// qu'avec une phrase réellement observée sur une prise silencieuse.
const PHRASES_FANTOMES = [
  'Sous-titres réalisés par la communauté d\'Amara.org',
  'Sous-titres réalisés para la communauté d\'Amara.org',
  'Sous-titrage ST\' 501',
  'Sous-titrage Société Radio-Canada',
  'Sous-titrage FR',
  'Merci d\'avoir regardé',
  'Merci d\'avoir regardé cette vidéo',
  'Abonnez-vous',
  'Abonnez-vous à la chaîne',
  'N\'oubliez pas de vous abonner',
];
// Un même mot dit plus de 4 fois de suite : une boucle de Whisper, pas une phrase.
const REPETITIONS_MAX = 4;
// Mots au plus d'une phrase fantôme (recherche sans numéro de passage).
const LONGUEUR_FANTOME = 12;

/** Texte comparable : sans accents, ponctuation ni majuscules, espaces réduits. */
function normaliser(texte) {
  return String(texte).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Retire d'une transcription ce que Whisper invente : les passages qui ne sont qu'une phrase fantôme connue (sauf si le
 * texte attendu la contient : elle est alors vraiment dite), et les suites de plus de REPETITIONS_MAX fois le même mot
 * (la suite entière). Mots [{ w, t0, t1, s? }] (s : numéro du passage ; sans lui, une suite de mots qui forme
 * exactement une phrase fantôme est retirée). -> mots gardés, dans l'ordre, inchangés.
 */
function filtrerTranscription(mots, { attendu = '' } = {}) {
  if (!Array.isArray(mots) || !mots.length) return Array.isArray(mots) ? mots : [];
  const dit = ` ${normaliser(attendu)} `;
  const fantomes = new Set(PHRASES_FANTOMES.map(normaliser).filter((p) => p && !dit.includes(` ${p} `)));
  const retires = new Set();
  if (mots.every((m) => Number.isInteger(m.s))) {
    const passages = new Map();
    mots.forEach((m, i) => { if (!passages.has(m.s)) passages.set(m.s, []); passages.get(m.s).push(i); });
    for (const indices of passages.values()) {
      if (fantomes.has(normaliser(indices.map((i) => mots[i].w).join(' ')))) indices.forEach((i) => retires.add(i));
    }
  } else {
    for (let i = 0; i < mots.length; i++) {
      let texte = '';
      for (let j = i; j < Math.min(mots.length, i + LONGUEUR_FANTOME); j++) {
        texte += ` ${mots[j].w}`;
        if (fantomes.has(normaliser(texte))) { for (let k = i; k <= j; k++) retires.add(k); i = j; break; }
      }
    }
  }
  const restants = mots.map((m, i) => i).filter((i) => !retires.has(i));
  for (let a = 0; a < restants.length;) {
    const mot = normaliser(mots[restants[a]].w);
    let b = a + 1;
    while (b < restants.length && mot && normaliser(mots[restants[b]].w) === mot) b++;
    if (mot && b - a > REPETITIONS_MAX) for (let k = a; k < b; k++) retires.add(restants[k]);
    a = b;
  }
  return mots.filter((m, i) => !retires.has(i));
}

/** Transcrit une prise. attendu : le texte que la prise doit dire (une phrase fantôme qu'il contient est gardée).
 *  -> Promise<{ ok: true, mots } | { ok: false, message }> */
function transcrire({ wav, duree, langue = 'fr', dossier = dossierWhisper(), python, env = {}, delaiMax, surProgression, attendu = '' }) {
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
        finir({ ok: true, mots: filtrerTranscription(mots, { attendu }) });
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

/** Installe la transcription (environnement isolé, faster-whisper, modèle). -> { ok, message, modele? } ; surEtape(i, n, nom) :
 *  au début de chaque étape (avancement, spec Retouches et ergonomie 5.2). */
async function installerWhisper({ dossier = dossierWhisper(), modele = MODELE_DEFAUT, python = trouverPython(), lancer = lancerCommande, ancien, surEtape = () => {} } = {}) {
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
    try { surEtape(i, commandes.length, ETAPES[i]); } catch { /* suivi facultatif */ }
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
  fs.writeFileSync(path.join(dossier, 'version.json'), JSON.stringify({ modele, date: new Date().toISOString() }, null, 2), 'utf8');
  return { ok: true, modele, message: `La transcription est installée (modèle ${modele}, dans ${dossier}).` };
}

/** Whisper tel qu'installé sur l'ordinateur : { pret, transcrire }. */
function whisperParDefaut() {
  return { pret: etatWhisper({ python: null, ancien: null }).pret, transcrire };
}

module.exports = { versionsPython, emplacementsPython, candidatsPython, MODELE_DEFAUT, PHRASES_FANTOMES, filtrerTranscription, dossierWhisper, pythonDuVenv, trouverPython, pythonAncien, afficherCommande, commandeSysteme, commandesInstallation, etatWhisper, transcrire, installerWhisper, whisperParDefaut };
