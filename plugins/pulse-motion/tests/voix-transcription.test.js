'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { importerVoix, transcrireProjet } = require('../scripts/voix.js');
const W = require('../moteur/wav.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const taux = 48000;
function fichierParole(secondes = 2) {
  const x = new Float32Array(Math.round((secondes + 1) * taux));
  for (let i = taux / 2; i < (secondes + 0.5) * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  const f = path.join(dossierTemporaire('pm-voix-'), 'prise.wav');
  fs.writeFileSync(f, W.ecrire({ taux, canaux: [x] }));
  return f;
}
const faux = (mots) => ({ pret: true, transcrire: async () => ({ ok: true, mots }) });
const lireMots = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'voix', `${id}.mots.json`), 'utf8'));

test('import avec la transcription : mots du script aux temps entendus (transcription de la prise écrite)', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; });
  const whisper = faux([{ w: ' Pourquoi', t0: 0.1, t1: 0.5 }, { w: ' le', t0: 0.6, t1: 0.8 }, { w: ' froid.', t0: 1.5, t1: 2.0 }]);
  const r = await importerVoix({ dossier: dir, fichier: fichierParole(), scene: 'intro', outil: { present: false }, whisper });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.calage, 'whisper');
  const m = lireMots(dir, 'intro');
  assert.equal(m.approche, 'whisper');
  assert.deepEqual(m.mots.map((x) => x.w), ['Pourquoi', 'le', 'froid']);
  assert.equal(m.mots[2].t0, 1.5);
});

test('revue : transcription qui ne reconnaît rien : calage approché et avertissement', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; });
  const r = await importerVoix({ dossier: dir, fichier: fichierParole(), scene: 'intro', outil: { present: false }, whisper: faux([{ w: 'hello', t0: 0, t1: 1 }]) });
  assert.equal(r.ok, true);
  assert.equal(r.calage, 'lettres');
  assert.match(r.avertissement, /n'a reconnu aucun mot du texte/);
  assert.equal(lireMots(dir, 'intro').approche, 'lettres');
});

test('transcription en échec : calage approché, message transmis', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Bonjour' }; });
  const whisper = { pret: true, transcrire: async () => ({ ok: false, message: 'La transcription a pris trop longtemps : mots calés approximativement.' }) };
  const r = await importerVoix({ dossier: dir, fichier: fichierParole(), scene: 'intro', outil: { present: false }, whisper });
  assert.equal(r.calage, 'lettres');
  assert.match(r.avertissement, /trop longtemps/);
});

test('voix transcrire : retranscrit les prises en calage approché ; sans Whisper : message d\'installation', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; });
  await importerVoix({ dossier: dir, fichier: fichierParole(), scene: 'intro', outil: { present: false }, whisper: { pret: false } });
  assert.equal(lireMots(dir, 'intro').approche, 'lettres');
  const sans = await transcrireProjet({ dossier: dir, whisper: { pret: false } });
  assert.equal(sans.ok, false);
  assert.match(sans.message, /pulse-motion whisper installer/);
  const r = await transcrireProjet({ dossier: dir, whisper: faux([{ w: 'Pourquoi', t0: 0.1, t1: 0.5 }, { w: 'le', t0: 0.6, t1: 0.8 }, { w: 'froid', t0: 1.5, t1: 2 }]) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.scenes, [{ id: 'intro', calage: 'whisper' }]);
  assert.equal(lireMots(dir, 'intro').approche, 'whisper');
});
