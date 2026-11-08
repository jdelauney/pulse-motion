'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Wh = require('../scripts/lib/whisper.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const python = Wh.trouverPython();
const sansPython = { skip: !python && 'Python absent' };
const FAUX = path.join(__dirname, 'fixtures', 'whisper-faux.json');

test('état sans installation : pas prêt, commandes d\'installation données', () => {
  const dossier = dossierTemporaire('pm-whisper-');
  const e = Wh.etatWhisper({ dossier, python });
  assert.equal(e.pret, false);
  assert.equal(e.venv, false);
  if (python) {
    assert.equal(e.commandes.length, 3);
    assert.match(e.commandes[1].join(' '), /pip install --upgrade faster-whisper/);
    assert.match(e.commandes[2].join(' '), /download_model\(sys\.argv\[1\]/);
    assert.ok(e.commandes[2].includes('large-v3-turbo'));
  }
});

test('revue : Python absent : message et commande du système, sans planter', () => {
  const e = Wh.etatWhisper({ dossier: dossierTemporaire('pm-whisper-'), python: null });
  assert.equal(e.pret, false);
  assert.match(e.message, /Python/);
  assert.ok(e.commandeSysteme && 'commande' in e.commandeSysteme);
});

test('état installé (venv et modèle présents) : prêt', () => {
  const dossier = dossierTemporaire('pm-whisper-');
  fs.mkdirSync(path.dirname(Wh.pythonDuVenv(dossier)), { recursive: true });
  fs.writeFileSync(Wh.pythonDuVenv(dossier), '');
  fs.mkdirSync(path.join(dossier, 'modeles', 'small'), { recursive: true });
  fs.writeFileSync(path.join(dossier, 'modeles', 'small', 'model.bin'), '');
  fs.writeFileSync(path.join(dossier, 'version.json'), JSON.stringify({ modele: 'small' }));
  const e = Wh.etatWhisper({ dossier, python });
  assert.equal(e.pret, true);
  assert.equal(e.modele, 'small');
});

test('revue : transcription par le script Python (faux modèle) : mots lus, accents compris', sansPython, async () => {
  const r = await Wh.transcrire({ wav: 'inutile.wav', duree: 1, python: python.commande, dossier: dossierTemporaire('pm-whisper-'), env: { PM_WHISPER_FAUX: FAUX } });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.mots.map((m) => m.w), [' Pourquoi', ' l’été', ' froid ?']);
});

test('transcription en échec (faux fichier absent) : message en français', sansPython, async () => {
  const r = await Wh.transcrire({ wav: 'x.wav', duree: 1, python: python.commande, dossier: dossierTemporaire('pm-whisper-'), env: { PM_WHISPER_FAUX: path.join(__dirname, 'absent.json') } });
  assert.equal(r.ok, false);
  assert.match(r.message, /transcription a échoué/);
});

test('transcription trop longue : arrêtée au délai', sansPython, async () => {
  const r = await Wh.transcrire({ wav: 'x.wav', duree: 1, python: python.commande, dossier: dossierTemporaire('pm-whisper-'), env: { PM_WHISPER_FAUX: FAUX, PM_WHISPER_ATTENTE: '5' }, delaiMax: 500 });
  assert.equal(r.ok, false);
  assert.match(r.message, /trop longtemps/);
});

test('installer : lance les trois étapes dans l\'ordre, écrit version.json ; une étape en échec arrête et le dit', async () => {
  const dossier = dossierTemporaire('pm-whisper-');
  const vus = [];
  const lancer = async (c) => { vus.push(c.join(' ')); return { code: 0, erreurs: '' }; };
  const r = await Wh.installerWhisper({ dossier, modele: 'small', python: { commande: ['py', '-3'], version: '3.12.0' }, lancer });
  assert.equal(r.ok, true, r.message);
  assert.equal(vus.length, 3);
  assert.match(vus[2], /download_model\(sys\.argv\[1\].* small /);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dossier, 'version.json'), 'utf8')).modele, 'small');
  const echec = await Wh.installerWhisper({ dossier, python: { commande: ['py'], version: '3.12.0' }, lancer: async () => ({ code: 1, erreurs: 'No matching distribution' }) });
  assert.equal(echec.ok, false);
  assert.match(echec.message, /environnement Python.*No matching distribution/);
});

test('installer sans Python : refus avec la commande du système', async () => {
  const r = await Wh.installerWhisper({ dossier: dossierTemporaire('pm-whisper-'), python: null, lancer: async () => ({ code: 0 }) });
  assert.equal(r.ok, false);
  assert.match(r.message, /Python/);
});

const mot = (w, s, t0 = 0) => ({ w, t0, t1: t0 + 0.3, ...(s === undefined ? {} : { s }) });
const texte = (mots) => mots.map((m) => m.w).join('').trim();

test('whisper-phrases-fantomes-filtrees : un passage qui n\'est qu\'une phrase fantôme est retiré, avec ou sans numéro de passage', () => {
  const avecPassages = [mot(' Bonjour', 0), mot(' à', 0), mot(' tous.', 0),
    mot(' Sous-titres', 1), mot(' réalisés', 1), mot(' par', 1), mot(' la', 1), mot(' communauté', 1), mot(' d\'Amara.org', 1),
    mot(' Abonnez-vous !', 2), mot(' Merci', 3), mot(' d’avoir', 3), mot(' regarde', 3)];
  assert.equal(texte(Wh.filtrerTranscription(avecPassages)), 'Bonjour à tous.');
  // Ancienne sortie du script (sans « s ») : la suite de mots qui forme la phrase est retirée.
  const sansPassages = [mot(' Le'), mot(' froid.'), mot(' Sous-titrage'), mot(' ST\''), mot(' 501'), mot(' Merci'), mot(' d\'avoir'), mot(' regardé.')];
  assert.equal(texte(Wh.filtrerTranscription(sansPassages)), 'Le froid.');
  // Les mots gardés ne sont pas modifiés (horodatages compris).
  const gardes = Wh.filtrerTranscription(avecPassages);
  assert.deepEqual(gardes[0], avecPassages[0]);
});

test('whisper-repetitions-filtrees : plus de 4 fois le même mot de suite, la suite entière est retirée', () => {
  const mots = [mot(' Oui,', 0), mot(' merci', 1), mot(' merci', 1), mot(' Merci.', 1), mot(' merci', 1), mot(' merci', 1), mot(' fin', 2)];
  assert.equal(texte(Wh.filtrerTranscription(mots)), 'Oui, fin');
  const quatre = [mot(' très'), mot(' très'), mot(' très'), mot(' très'), mot(' bien')];
  assert.equal(Wh.filtrerTranscription(quatre).length, 5, '4 fois : gardé');
});

test('whisper-mots-reels-gardes : une phrase fantôme vraiment dite (dans le texte attendu) et les vrais mots restent', () => {
  const mots = [mot(' Chaque', 0), mot(' goutte', 0), mot(' compte.', 0), mot(' Merci', 1), mot(' d\'avoir', 1), mot(' regardé !', 1)];
  assert.equal(texte(Wh.filtrerTranscription(mots, { attendu: 'Chaque goutte compte. Merci d’avoir regardé !' })), 'Chaque goutte compte. Merci d\'avoir regardé !');
  assert.equal(texte(Wh.filtrerTranscription(mots)), 'Chaque goutte compte.');
  // Un mot de la liste dans une vraie phrase plus longue n'est pas retiré.
  const phrase = [mot(' Abonnez-vous', 0), mot(' à', 0), mot(' la', 0), mot(' lettre', 0), mot(' du', 0), mot(' service.', 0)];
  assert.equal(Wh.filtrerTranscription(phrase).length, 6);
  assert.deepEqual(Wh.filtrerTranscription([]), []);
});

test('transcrire-py-vad-active : filtre de silence de 500 ms, passages indépendants, numéro de passage écrit', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'whisper', 'transcrire.py'), 'utf8');
  assert.match(py, /vad_filter=True/);
  assert.match(py, /vad_parameters=\{'min_silence_duration_ms': 500\}/);
  assert.match(py, /condition_on_previous_text=False/);
  assert.match(py, /word_timestamps=True/);
  assert.match(py, /'s': i/);
});

test('revue : transcription par le script Python (faux modèle) : phrases fantômes retirées après la lecture', sansPython, async () => {
  const dossier = dossierTemporaire('pm-whisper-');
  const faux = path.join(dossier, 'faux.json');
  fs.writeFileSync(faux, JSON.stringify([{ w: ' Le', t0: 0, t1: 0.2, s: 0 }, { w: ' froid.', t0: 0.3, t1: 0.6, s: 0 }, { w: ' Abonnez-vous !', t0: 3, t1: 3.5, s: 1 }]));
  const r = await Wh.transcrire({ wav: 'inutile.wav', duree: 4, python: python.commande, dossier, env: { PM_WHISPER_FAUX: faux } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.mots.map((m) => m.w), [' Le', ' froid.']);
});
