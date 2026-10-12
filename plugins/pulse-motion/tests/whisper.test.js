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
    assert.match(e.commandes[2].join(' '), /download_model\("large-v3-turbo"/);
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
