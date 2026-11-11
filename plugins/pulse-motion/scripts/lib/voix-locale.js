'use strict';
/* Pulse Motion – voix de synthèse locale facultative (spec S7, 5.12) : Kokoro-82M (Apache-2.0) lu par kokoro-onnx (MIT),
 * phonèmes par espeak-ng (GPL-3.0), tous installés sur l'ordinateur de la personne, avec son accord, dans un environnement
 * Python isolé (~/.pulse-motion/voix-locale/, ou PM_VOIX_LOCALE), et appelés par un processus séparé. Pulse Motion ne
 * distribue ni le modèle ni espeak-ng (décision 7.4 de la spec). Sur le modèle de lib/whisper.js (recherche de Python,
 * installation en étapes). Seule voix française : ff_siwis (voix du modèle, entraînée sur le corpus SIWIS, CC BY), qui
 * n'imite aucune personne réelle. Noms du modèle et des voix : src/models.js d'explainroo (MIT), idée seulement.
 *
 * La synthèse est fabriquée une fois par scène, puis figée dans assets/voix/synthese/ comme une prise (déterminisme, D2). */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const W = require('../../moteur/wav.js');
const A = require('../../moteur/aligner.js');

const SCRIPT = path.join(__dirname, '..', 'voix-locale', 'synthetiser.py');
// Version du script de fabrication : entre dans l'empreinte (une scène est refaite quand la fabrication change).
const VERSION_FABRICATION = 1;
const TAUX = 24000;
const ENTRE_PHRASES = 0.25;
const VOIX_FRANCAISES = ['ff_siwis'];
const VOIX_DEFAUT = 'ff_siwis';
const VITESSE_MIN = 0.7;
const VITESSE_MAX = 1.3;
const MENTION = 'Voix de synthèse Kokoro-82M (Apache-2.0), voix ff_siwis (corpus SIWIS, CC BY)';

// Fichiers du modèle publiés avec kokoro-onnx (tailles approchées, à mesurer à la première installation avec l'auteur).
const BASE_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/';
const VARIANTES = {
  legere: { modele: 'kokoro-v1.0.int8.onnx', taille: 'environ 300 Mo' },
  normale: { modele: 'kokoro-v1.0.onnx', taille: 'environ 550 Mo' },
};
const FICHIER_VOIX = 'voices-v1.0.bin';
// Empreintes SHA-256 attendues : null tant qu'elles n'ont pas été relevées sur une installation faite avec l'auteur ; le
// fichier téléchargé est alors gardé et son empreinte notée (version.json, « empreintes ») pour être reportée ici.
const EMPREINTES = { 'kokoro-v1.0.int8.onnx': null, 'kokoro-v1.0.onnx': null, 'voices-v1.0.bin': null };

const MESSAGE_ABSENTE = 'La voix de synthèse n\'est pas installée sur cet ordinateur : je peux l\'installer (environ 300 Mo, quelques minutes), ou utiliser la voix de l\'ordinateur en attendant.';

const dossierVoixLocale = () => process.env.PM_VOIX_LOCALE || path.join(os.homedir(), '.pulse-motion', 'voix-locale');
const pythonDuVenv = (dossier) => (process.platform === 'win32' ? path.join(dossier, 'venv', 'Scripts', 'python.exe') : path.join(dossier, 'venv', 'bin', 'python'));

const versionAcceptee = (v) => v.majeure === 3 && v.mineure >= 10 && v.mineure <= 13;

/** Python 3.10 à 3.13 (kokoro-onnx). -> { commande, version } | null */
function trouverPythonSynthese({ candidats } = {}) {
  const Wh = require('./whisper.js');
  const v = Wh.versionsPython(candidats).find(versionAcceptee);
  return v ? { commande: v.commande, version: `${v.majeure}.${v.mineure}.${v.correctif}` } : null;
}

/** Python trouvé hors de 3.10 à 3.13, pour le dire. -> '3.9.7' | null */
function pythonHorsPlage({ candidats } = {}) {
  const Wh = require('./whisper.js');
  const v = Wh.versionsPython(candidats).find((x) => !versionAcceptee(x));
  return v ? `${v.majeure}.${v.mineure}.${v.correctif}` : null;
}

function lireVersion(dossier) {
  try { return JSON.parse(fs.readFileSync(path.join(dossier, 'version.json'), 'utf8')); } catch { return null; }
}

/** Étapes de l'installation : environnement isolé, kokoro-onnx, modèle, voix. Adresses et cibles passées en arguments :
 *  jamais insérées dans le code Python. -> [commande] */
function commandesInstallation(python, dossier, variante = 'legere') {
  const venv = pythonDuVenv(dossier);
  const telecharger = 'import os, sys, urllib.request; c = sys.argv[2]; urllib.request.urlretrieve(sys.argv[1], c + ".part"); os.replace(c + ".part", c)';
  const modele = VARIANTES[variante].modele;
  return [
    [...python, '-m', 'venv', path.join(dossier, 'venv')],
    [venv, '-m', 'pip', 'install', '--upgrade', 'kokoro-onnx'],
    [venv, '-c', telecharger, BASE_URL + modele, path.join(dossier, 'modeles', modele)],
    [venv, '-c', telecharger, BASE_URL + FICHIER_VOIX, path.join(dossier, 'modeles', FICHIER_VOIX)],
  ];
}
const ETAPES = ['environnement Python', 'installation de kokoro-onnx', 'téléchargement du modèle de voix', 'téléchargement des voix'];

/** État de l'installation. -> { dossier, python, venv, modele, variante, pret, message, commandeSysteme? } */
function etatVoixLocale({ dossier = dossierVoixLocale(), python, horsPlage } = {}) {
  const venv = fs.existsSync(pythonDuVenv(dossier));
  const v = lireVersion(dossier);
  const variante = v && VARIANTES[v.variante] ? v.variante : null;
  const modele = variante && fs.existsSync(path.join(dossier, 'modeles', VARIANTES[variante].modele)) && fs.existsSync(path.join(dossier, 'modeles', FICHIER_VOIX)) ? VARIANTES[variante].modele : null;
  const pret = venv && Boolean(modele);
  const etat = { dossier, venv, modele, variante, pret };
  if (pret) { etat.message = `La voix de synthèse est prête (version ${variante === 'legere' ? 'légère' : 'normale'}).`; return etat; }
  const py = python !== undefined ? python : trouverPythonSynthese();
  etat.python = py;
  if (!py && !venv) {
    const autre = horsPlage !== undefined ? horsPlage : pythonHorsPlage();
    etat.message = autre
      ? `Python ${autre} ne convient pas à la voix de synthèse (une version de 3.10 à 3.13 est requise).`
      : 'Python (de 3.10 à 3.13) est nécessaire pour la voix de synthèse, et il est introuvable.';
    etat.commandeSysteme = require('./whisper.js').commandeSysteme();
  } else etat.message = MESSAGE_ABSENTE;
  return etat;
}

function lancerCommande(commande) {
  return new Promise((resoudre) => {
    // Sortie de pip et des téléchargements sur la sortie d'erreur : la sortie standard de la commande reste un JSON seul.
    const p = spawn(commande[0], commande.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    p.stdout.on('data', (d) => process.stderr.write(d));
    let erreurs = '';
    p.stderr.on('data', (d) => { process.stderr.write(d); erreurs = (erreurs + d).slice(-4000); });
    p.on('error', (e) => resoudre({ code: 1, erreurs: e.message }));
    p.on('close', (code) => resoudre({ code, erreurs }));
  });
}

const empreinteFichier = (fichier) => crypto.createHash('sha256').update(fs.readFileSync(fichier)).digest('hex');

/**
 * Installe la voix de synthèse (à lancer seulement après l'accord de la personne). variante : legere (défaut) | normale.
 * Empreintes vérifiées quand elles sont connues (fichier faux : retiré, installation refusée) ; sinon notées.
 * -> { ok, message, variante?, empreintes?, aConfirmer? } ; surEtape(i, n, nom) au début de chaque étape.
 */
async function installerVoixLocale({ dossier = dossierVoixLocale(), variante = 'legere', python, lancer = lancerCommande, surEtape = () => {}, empreintes = EMPREINTES } = {}) {
  if (!VARIANTES[variante]) return { ok: false, message: `Version inconnue : « ${variante} » (légère ou normale).` };
  const py = python !== undefined ? python : trouverPythonSynthese();
  if (!py) {
    const s = require('./whisper.js').commandeSysteme();
    const autre = pythonHorsPlage();
    const quoi = autre ? `Python ${autre} ne convient pas (une version de 3.10 à 3.13 est requise).` : 'Python (de 3.10 à 3.13) est introuvable.';
    return { ok: false, message: `${quoi} ${s.message}`, commandeSysteme: s };
  }
  fs.mkdirSync(path.join(dossier, 'modeles'), { recursive: true });
  const commandes = commandesInstallation(py.commande, dossier, variante);
  for (let i = 0; i < commandes.length; i++) {
    try { surEtape(i, commandes.length, ETAPES[i]); } catch { /* suivi facultatif */ }
    const r = await lancer(commandes[i]);
    if (r.code !== 0) {
      const cause = String(r.erreurs || '').trim().split(/\r?\n/).pop() || `code ${r.code}`;
      if (i === 0) fs.rmSync(path.join(dossier, 'venv'), { recursive: true, force: true });
      return { ok: false, message: `L'installation de la voix de synthèse a échoué (${ETAPES[i]} : ${cause}).` };
    }
  }
  const releves = {};
  const aConfirmer = [];
  for (const nom of [VARIANTES[variante].modele, FICHIER_VOIX]) {
    const fichier = path.join(dossier, 'modeles', nom);
    if (!fs.existsSync(fichier)) return { ok: false, message: `L'installation de la voix de synthèse a échoué (fichier « ${nom} » absent après le téléchargement).` };
    releves[nom] = empreinteFichier(fichier);
    const attendue = empreintes[nom];
    if (attendue && attendue !== releves[nom]) {
      fs.rmSync(fichier, { force: true });
      return { ok: false, message: `Le fichier « ${nom} » téléchargé ne correspond pas à celui attendu (empreinte différente) : il a été retiré ; réessayer plus tard.` };
    }
    if (!attendue) aConfirmer.push(nom);
  }
  fs.writeFileSync(path.join(dossier, 'version.json'), JSON.stringify({ variante, modele: VARIANTES[variante].modele, empreintes: releves, date: new Date().toISOString() }, null, 2), 'utf8');
  return { ok: true, variante, empreintes: releves, ...(aConfirmer.length ? { aConfirmer } : {}),
    message: `La voix de synthèse est installée (version ${variante === 'legere' ? 'légère' : 'normale'}, dans ${dossier}).` };
}

// --- Fabrication -------------------------------------------------------------------------------------------------------

const FIN_PHRASE = /[.!?…]["»”’)\]]*$/;

/**
 * Texte dit lu (lireTexteDit) -> phrases à synthétiser : [{ texte, mots: [rangs des mots dits], ecart }] ; ecart : silence
 * après la phrase (0,25 s en fin de phrase, plus les [pause …] posées là ; la dernière : 0). Une pause au milieu d'une
 * phrase la coupe en deux. debut : silence avant la première (pause posée avant tout mot).
 */
function decouperPhrases(lu) {
  const mots = A.decouperMots(lu.dit);
  const pauseApres = new Map();
  for (const p of lu.pauses || []) pauseApres.set(p.apres, (pauseApres.get(p.apres) || 0) + p.duree);
  const phrases = [];
  let courante = null;
  mots.forEach((m, k) => {
    if (!courante) courante = { texte: '', mots: [], ecart: 0 };
    courante.texte += (courante.mots.length ? (mots[k - 1].insecable || ' ') : '') + m.w;
    courante.mots.push(k);
    const pause = pauseApres.get(k + 1) || 0;
    const fin = FIN_PHRASE.test(m.w);
    if (fin || pause > 0 || k === mots.length - 1) {
      courante.ecart = k === mots.length - 1 ? 0 : (fin ? ENTRE_PHRASES : 0) + pause;
      phrases.push(courante);
      courante = null;
    }
  });
  return { phrases, debut: pauseApres.get(0) || 0 };
}

/** Rééchantillonnage linéaire (une phrase rendue à un autre taux). */
function reechantillonner(canal, de, vers) {
  if (de === vers) return canal;
  const n = Math.max(1, Math.round(canal.length * vers / de));
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * de / vers, a = Math.floor(x), f = x - a;
    r[i] = (canal[Math.min(a, canal.length - 1)] || 0) * (1 - f) + (canal[Math.min(a + 1, canal.length - 1)] || 0) * f;
  }
  return r;
}

/**
 * Sons des phrases -> une prise : silences exacts entre elles (au taux près). sons : [{ taux, canal }] ; ecarts : secondes
 * après chaque phrase ; debut : silence avant la première. -> { taux, canal, bornes: [{ debut, fin }] }
 */
function assemblerPhrases(sons, ecarts, { taux = TAUX, debut = 0 } = {}) {
  const morceaux = sons.map((s) => reechantillonner(s.canal, s.taux, taux));
  const silences = morceaux.map((m, k) => Math.round(Math.max(0, ecarts[k] || 0) * taux));
  const avant = Math.round(Math.max(0, debut) * taux);
  const total = avant + morceaux.reduce((n, m, k) => n + m.length + silences[k], 0);
  const canal = new Float32Array(total);
  const bornes = [];
  let pos = avant;
  morceaux.forEach((m, k) => {
    canal.set(m, pos);
    bornes.push({ debut: pos / taux, fin: (pos + m.length) / taux });
    pos += m.length + silences[k];
  });
  return { taux, canal, bornes };
}

/**
 * Mots dits de la prise assemblée : dans chaque phrase, au prorata des lettres en sautant ses silences (calageApproche) ;
 * bornes de phrase exactes. -> [{ w, t0, t1 }] dans la forme dite
 */
function calerMots(lu, phrases, prise) {
  const dits = A.decouperMots(lu.dit);
  const r = dits.map((m) => ({ w: m.w, t0: 0, t1: 0 }));
  phrases.forEach((p, k) => {
    const b = prise.bornes[k];
    const morceau = prise.canal.subarray(Math.round(b.debut * prise.taux), Math.round(b.fin * prise.taux));
    let cales = A.calageApproche(p.texte, morceau, prise.taux);
    if (cales.length !== p.mots.length) {
      // Découpe différente (ponctuation seule) : au prorata des lettres sur la phrase entière.
      const lettres = p.mots.map((i) => Math.max(1, dits[i].cles[0].length));
      const somme = lettres.reduce((a, x) => a + x, 0);
      let cumul = 0;
      cales = lettres.map((l) => { const t0 = cumul / somme * (b.fin - b.debut); cumul += l; return { t0, t1: cumul / somme * (b.fin - b.debut) }; });
    }
    p.mots.forEach((i, q) => {
      r[i].t0 = Math.round((b.debut + cales[q].t0) * 1000) / 1000;
      r[i].t1 = Math.round((b.debut + cales[q].t1) * 1000) / 1000;
    });
  });
  return r;
}

/** Vitesse effective : vitesse du déroulé × allure de la vidéo (5.14), bornée à ce que le modèle accepte. */
function vitesseEffective(vitesse = 1, allure = 1) {
  return Math.round(Math.min(2, Math.max(0.5, vitesse * allure)) * 1000) / 1000;
}

/** Empreinte de fabrication d'une scène : version du script, modèle, voix, vitesse × allure, texte dit, pauses. */
function empreinteFabrication({ modele, voix, vitesse, lu }) {
  return crypto.createHash('sha256').update(JSON.stringify({ v: VERSION_FABRICATION, modele, voix, vitesse, dit: lu.dit, pauses: lu.pauses || [] })).digest('hex');
}

/**
 * Moteur réel : le script Python de l'environnement isolé, dans un processus séparé.
 * ({ phrases: [{ texte }], voix, vitesse }) -> Promise<{ ok: true, sons: [{ taux, canal }] } | { ok: false, message }>
 */
function moteurPython({ dossier = dossierVoixLocale(), python, env = {}, delaiMax } = {}) {
  return ({ phrases, voix, vitesse }) => new Promise((resoudre) => {
    const v = lireVersion(dossier) || {};
    const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-synthese-'));
    const entree = { phrases, voix, vitesse, langue: 'fr-fr', dossier: travail,
      modele: path.join(dossier, 'modeles', v.modele || VARIANTES.legere.modele), voix_fichier: path.join(dossier, 'modeles', FICHIER_VOIX) };
    const commande = python || [pythonDuVenv(dossier)];
    let fini = false;
    const finir = (r) => { if (fini) return; fini = true; clearTimeout(minuterie); fs.rmSync(travail, { recursive: true, force: true }); resoudre(r); };
    const p = spawn(commande[0], [...commande.slice(1), SCRIPT], { env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...env }, windowsHide: true });
    const lettres = phrases.reduce((n, x) => n + x.texte.length, 0);
    const minuterie = setTimeout(() => { try { p.kill(); } catch { /* déjà arrêté */ } finir({ ok: false, message: 'La voix de synthèse a pris trop longtemps.' }); }, delaiMax || (60 + lettres * 0.5) * 1000);
    let sortie = '';
    let erreurs = '';
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { erreurs = (erreurs + d).slice(-4000); });
    p.on('error', (e) => finir({ ok: false, message: `La voix de synthèse a échoué (${e.message}).` }));
    p.on('close', (code) => {
      try {
        if (code !== 0) throw new Error(erreurs.trim().split(/\r?\n/).pop() || `code ${code}`);
        const r = JSON.parse(sortie.trim().split(/\r?\n/).pop() || '');
        if (!r || !Array.isArray(r.phrases) || r.phrases.length !== phrases.length) throw new Error('réponse inattendue');
        const sons = r.phrases.map((x) => {
          const son = W.lire(new Uint8Array(fs.readFileSync(path.join(travail, path.basename(x.fichier)))));
          return { taux: son.taux, canal: W.mono(son.canaux) };
        });
        finir({ ok: true, sons });
      } catch (e) {
        finir({ ok: false, message: `La voix de synthèse a échoué (${e.message}).` });
      }
    });
    p.stdin.on('error', () => { /* processus déjà fermé : dit par close */ });
    p.stdin.end(JSON.stringify(entree), 'utf8');
  });
}

/** Voix de synthèse telle qu'installée : { pret, moteur, modele } (pret faux : rien n'est fabriqué). */
function voixLocaleParDefaut() {
  const e = etatVoixLocale({ python: null, horsPlage: null });
  return { pret: e.pret, modele: e.modele, moteur: e.pret ? moteurPython() : null, message: e.message };
}

module.exports = { MENTION, MESSAGE_ABSENTE, VOIX_FRANCAISES, VOIX_DEFAUT, VITESSE_MIN, VITESSE_MAX, ENTRE_PHRASES, TAUX, VARIANTES, FICHIER_VOIX, EMPREINTES, VERSION_FABRICATION,
  dossierVoixLocale, pythonDuVenv, trouverPythonSynthese, pythonHorsPlage, commandesInstallation, etatVoixLocale, installerVoixLocale,
  decouperPhrases, assemblerPhrases, calerMots, vitesseEffective, empreinteFabrication, moteurPython, voixLocaleParDefaut };
