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

function fichierDeuxScenes() {
  // Parole 0,5–2 s (scène 1), silence, parole 3,5–5 s (scène 2).
  const x = new Float32Array(taux * 6);
  for (const [a, b] of [[0.5, 2], [3.5, 5]]) for (let i = a * taux; i < b * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  const f = path.join(dossierTemporaire('pm-voix-'), 'tout.wav');
  fs.writeFileSync(f, W.ecrire({ taux, canaux: [x] }));
  return f;
}
const deuxTextes = (dir) => modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; d.scenes[1].voix = { texte: 'Les bactéries' }; });
const entendusDeux = [{ w: 'Pourquoi', t0: 0.5, t1: 0.9 }, { w: 'le', t0: 1.0, t1: 1.2 }, { w: 'froid', t0: 1.4, t1: 2.0 }, { w: 'Les', t0: 3.5, t1: 3.8 }, { w: 'bactéries', t0: 4.0, t1: 5.0 }];

test('fichier unique : une prise par scène, coupée dans le silence, mots transcrits, déroulé mis à jour', async () => {
  const dir = copierProjet('projet-simple');
  deuxTextes(dir);
  const r = await importerVoix({ dossier: dir, fichier: fichierDeuxScenes(), outil: { present: false }, whisper: faux(entendusDeux) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.scenes.map((s) => s.fichier), ['assets/voix/intro.wav', 'assets/voix/chiffre.wav']);
  assert.ok(r.scenes[0].duree < 2.2 && r.scenes[1].duree < 2.2, JSON.stringify(r.scenes));
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  assert.deepEqual(d.scenes.map((s) => s.voix.fichier), ['assets/voix/intro.wav', 'assets/voix/chiffre.wav']);
  const m = lireMots(dir, 'chiffre');
  assert.equal(m.approche, 'whisper');
  assert.deepEqual(m.mots.map((x) => x.w), ['Les', 'bactéries']);
  assert.ok(m.mots[0].t0 < 0.2, JSON.stringify(m.mots[0]));
});

test('revue : fichier unique dont une scène est peu reconnue : alerte nommant la scène, découpe faite', async () => {
  const dir = copierProjet('projet-simple');
  deuxTextes(dir);
  const entendus = [...entendusDeux.slice(0, 3), { w: 'zzz', t0: 3.5, t1: 3.8 }, { w: 'yyy', t0: 4.0, t1: 5.0 }];
  const r = await importerVoix({ dossier: dir, fichier: fichierDeuxScenes(), outil: { present: false }, whisper: faux(entendus) });
  assert.equal(r.ok, true, r.message);
  assert.match(r.avertissement, /scène « chiffre ».*réenregistrer/);
});

test('fichier unique sans transcription : refusé, avec les deux solutions', async () => {
  const dir = copierProjet('projet-simple');
  deuxTextes(dir);
  const r = await importerVoix({ dossier: dir, fichier: fichierDeuxScenes(), outil: { present: false }, whisper: { pret: false } });
  assert.equal(r.ok, false);
  assert.match(r.message, /pulse-motion whisper installer.*--scene/);
});

test('revue : voix transcrire sur une prise qui ne dit plus le texte (moins de la moitié reconnue) : pas déclarée transcrite', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; });
  await importerVoix({ dossier: dir, fichier: fichierParole(), scene: 'intro', outil: { present: false }, whisper: { pret: false } });
  modifierDeroule(dir, (d) => { d.scenes[0].voix.texte = 'Pourquoi les bactéries aiment la chaleur du midi'; });
  const r = await transcrireProjet({ dossier: dir, whisper: faux([{ w: 'Pourquoi', t0: 0.1, t1: 0.5 }, { w: 'le', t0: 0.6, t1: 0.8 }, { w: 'froid', t0: 1.5, t1: 2 }]) });
  assert.deepEqual(r.scenes, [{ id: 'intro', calage: 'lettres' }]);
  assert.match(r.avertissement, /moins de la moitié.*réenregistrer/);
  assert.notEqual(lireMots(dir, 'intro').approche, 'whisper');
});

test('revue : enregistrement d\'une seule scène importé sans --scene : refusé, prises existantes intactes', async () => {
  const dir = copierProjet('projet-simple');
  deuxTextes(dir);
  await importerVoix({ dossier: dir, fichier: fichierParole(), scene: 'chiffre', outil: { present: false }, whisper: { pret: false } });
  const avant = fs.readFileSync(path.join(dir, 'assets', 'voix', 'chiffre.wav'));
  // L'enregistrement ne dit que la scène 1 (3 mots sur 5).
  const r = await importerVoix({ dossier: dir, fichier: fichierParole(), outil: { present: false }, whisper: faux(entendusDeux.slice(0, 3)) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.scenes.map((s) => s.id), ['intro']);
  assert.match(r.avertissement, /gardée pour la scène « chiffre »/);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'assets', 'voix', 'chiffre.wav')), avant);
});

test('revue : enregistrement presque pas reconnu sans --scene : refusé avec le conseil --scene', async () => {
  const dir = copierProjet('projet-simple');
  deuxTextes(dir);
  const r = await importerVoix({ dossier: dir, fichier: fichierDeuxScenes(), outil: { present: false }, whisper: faux([{ w: 'Pourquoi', t0: 0.5, t1: 0.9 }, { w: 'zzz', t0: 1, t1: 2 }]) });
  assert.equal(r.ok, false);
  assert.match(r.message, /moins de la moitié.*--scene/);
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'voix', 'intro.wav')), false);
});
