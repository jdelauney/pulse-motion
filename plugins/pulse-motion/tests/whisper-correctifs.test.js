'use strict';
/* Correctifs de la transcription : nom du modèle en argument, commandes affichées, Python trop ancien,
 * venv absent sous Linux, WAV non 16 bits, progression, échec de l'installation attrapé. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Wh = require('../scripts/lib/whisper.js');
const W = require('../moteur/wav.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { copierProjet } = require('./aide/projet.js');

const python = Wh.trouverPython();
const sansPython = { skip: !python && 'Python absent' };
const FAUX = path.join(__dirname, 'fixtures', 'whisper-faux.json');

test('modèle : nom passé en argument (jamais inséré dans le code Python), nom invalide refusé avant tout lancement', async () => {
  const c = Wh.commandesInstallation(['py'], path.join('C:', 'mon dossier'), 'small');
  assert.ok(!c[2].some((a) => a.includes('small') && a.includes('download_model')), c[2].join(' | '));
  assert.ok(c[2].includes('small'));
  let lances = 0;
  const r = await Wh.installerWhisper({ dossier: dossierTemporaire('pm-whisper-'), modele: 'small"); import os; os.system("x', python: { commande: ['py'], version: '3.12.0' }, lancer: async () => { lances++; return { code: 0 }; } });
  assert.equal(r.ok, false);
  assert.match(r.message, /modèle/);
  assert.equal(lances, 0);
});

test('commandes affichées : arguments avec espaces entre guillemets', () => {
  assert.equal(Wh.afficherCommande(['py', '-m', 'venv', 'C:\\Users\\Jean Dupont\\venv']), 'py -m venv "C:\\Users\\Jean Dupont\\venv"');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'whisper.js')], { encoding: 'utf8', env: { ...process.env, PM_WHISPER: path.join(dossierTemporaire('pm-whisper-'), 'avec espace') } });
  const etat = JSON.parse(r.stdout);
  if (etat.commandes.length) assert.match(etat.commandes[0], /"[^"]*avec espace[^"]*"/);
});

test('Python présent mais trop ancien : message qui le dit (et non « introuvable »)', () => {
  const ancien = Wh.pythonAncien({ candidats: [[process.execPath, '-e', 'console.log("Python 3.7.2")', '--']] });
  assert.equal(ancien, '3.7.2');
  const e = Wh.etatWhisper({ dossier: dossierTemporaire('pm-whisper-'), python: null, ancien: '3.7.2' });
  assert.match(e.message, /Python 3\.7\.2 est trop ancien/);
  assert.ok(e.commandeSysteme);
});

test('Linux sans python3-venv : message avec la commande du système, environnement incomplet supprimé', async () => {
  const dossier = dossierTemporaire('pm-whisper-');
  const lancer = async () => {
    fs.mkdirSync(path.join(dossier, 'venv', 'bin'), { recursive: true });
    return { code: 1, erreurs: 'The virtual environment was not created successfully because ensurepip is not available.' };
  };
  const r = await Wh.installerWhisper({ dossier, python: { commande: ['python3'], version: '3.12.0' }, lancer });
  assert.equal(r.ok, false);
  assert.match(r.message, /sudo apt install python3-venv/);
  assert.equal(fs.existsSync(path.join(dossier, 'venv')), false);
});

test('WAV non 16 bits (flottant 32 bits) : la transcription reçoit une copie 16 bits', async () => {
  const V = require('../scripts/lib/voix.js');
  const dir = copierProjet('projet-simple');
  const taux = 16000, x = new Float32Array(taux).map((_, i) => 0.3 * Math.sin(i / 5));
  // WAV flottant 32 bits écrit à la main.
  const donnees = Buffer.from(x.buffer);
  const e = Buffer.alloc(44);
  e.write('RIFF', 0); e.writeUInt32LE(36 + donnees.length, 4); e.write('WAVE', 8); e.write('fmt ', 12); e.writeUInt32LE(16, 16);
  e.writeUInt16LE(3, 20); e.writeUInt16LE(1, 22); e.writeUInt32LE(taux, 24); e.writeUInt32LE(taux * 4, 28); e.writeUInt16LE(4, 32); e.writeUInt16LE(32, 34);
  e.write('data', 36); e.writeUInt32LE(donnees.length, 40);
  fs.mkdirSync(path.join(dir, 'assets', 'voix'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), Buffer.concat([e, donnees]));
  let bits = null;
  const whisper = { pret: true, transcrire: async ({ wav }) => { bits = fs.readFileSync(wav).readUInt16LE(34); return { ok: true, mots: [{ w: 'bonjour', t0: 0.1, t1: 0.5 }] }; } };
  const r = await V.transcrirePrise({ projet: dir, relatif: 'assets/voix/intro.wav', texte: 'Bonjour', whisper });
  assert.equal(r.ok, true, r.message);
  assert.equal(bits, 16);
  assert.ok(W.lire(new Uint8Array(fs.readFileSync(path.join(dir, 'assets', 'voix', 'intro.wav')))));
});

test('progression d\'une transcription relayée en pourcentage', sansPython, async () => {
  const vus = [];
  const r = await Wh.transcrire({ wav: 'inutile.wav', duree: 2, python: python.commande, dossier: dossierTemporaire('pm-whisper-'), env: { PM_WHISPER_FAUX: FAUX }, surProgression: (p) => vus.push(p) });
  assert.equal(r.ok, true, r.message);
  assert.ok(vus.length > 0);
  vus.forEach((p) => assert.ok(p >= 0 && p <= 100, String(p)));
});

test('pulse-motion whisper installer : échec inattendu attrapé, JSON { ok: false, message }', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'whisper.js'), 'installer', '--modele', 'x y'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.ok(j.message);
});
