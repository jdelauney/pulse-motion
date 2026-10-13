'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../scripts/lib/voix.js');
const W = require('../moteur/wav.js');
const F = require('../scripts/lib/ffmpeg.js');
const { copierProjet } = require('./aide/projet.js');

const taux = 48000;
function wavParole(secondes = 2) {
  const x = new Float32Array(Math.round((secondes + 1) * taux));
  for (let i = taux / 2; i < (secondes + 0.5) * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  return W.ecrire({ taux, canaux: [x] });
}
const deroule = (voix) => ({ voix, scenes: [{ id: 'intro', voix: { texte: 'Pourquoi le froid' } }] });

test('écrire une prise : WAV rogné à −3 dBFS, mots calés (lettres), lus ensuite', async () => {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(), texte: 'Pourquoi le froid' });
  assert.equal(r.relatif, 'assets/voix/intro.wav');
  assert.ok(Math.abs(r.duree - 2.16) < 0.05, String(r.duree));
  const d = deroule();
  d.scenes[0].voix.fichier = r.relatif;
  const v = V.lireVoixScene(dir, d, d.scenes[0]);
  assert.equal(v.approche, 'lettres');
  assert.deepEqual(v.mots.map((m) => m.w), ['Pourquoi', 'le', 'froid']);
  assert.deepEqual(v.alertes, []);
  assert.equal(v.prise.provisoire, false);
});

test('revue : texte changé après la prise : calage lettres recalculé, et alerte (la voix dit encore l\'ancien texte)', async () => {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(), texte: 'Pourquoi le froid' });
  const d = deroule();
  d.scenes[0].voix = { texte: 'Pourquoi la chaleur', fichier: r.relatif };
  const v = V.lireVoixScene(dir, d, d.scenes[0]);
  assert.deepEqual(v.mots.map((m) => m.w), ['Pourquoi', 'la', 'chaleur']);
  assert.deepEqual(v.alertes.map((a) => a.regle), ['mots-perimes']);
  assert.match(v.alertes[0].message, /dit encore l'ancien texte/);
});

test('calage whisper périmé (prise remplacée) : recalcul approché et alerte mots-perimes', async () => {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(), texte: 'Pourquoi le froid' });
  const fichierMots = path.join(dir, 'assets', 'voix', 'intro.mots.json');
  const mots = JSON.parse(fs.readFileSync(fichierMots, 'utf8'));
  fs.writeFileSync(fichierMots, JSON.stringify({ ...mots, approche: 'whisper', empreinte: 'autre' }));
  const d = deroule();
  d.scenes[0].voix.fichier = r.relatif;
  const v = V.lireVoixScene(dir, d, d.scenes[0]);
  assert.equal(v.approche, 'lettres');
  assert.deepEqual(v.alertes.map((a) => a.regle), ['mots-perimes']);
});

test('voix provisoire : prise rangée à part, choisie seulement avec voix.provisoire', async () => {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(1), texte: 'Bonjour', provisoire: true });
  assert.equal(r.relatif, 'assets/voix/provisoire/intro.wav');
  assert.equal(V.priseDeScene(dir, deroule(), deroule().scenes[0]), null);
  const d = deroule({ provisoire: true });
  assert.equal(V.priseDeScene(dir, d, d.scenes[0]).provisoire, true);
});

test('prise illisible : erreur en français', () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets', 'voix'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), 'pas du son');
  const d = deroule();
  d.scenes[0].voix.fichier = 'assets/voix/intro.wav';
  assert.match(V.lireVoixScene(dir, d, d.scenes[0]).erreur, /n'est pas un WAV/);
});

const outil = F.trouverFfmpeg();
test('avec ffmpeg : Opus écrit à côté de la prise et désigné dans les mots', { skip: !(outil.present && outil.versionOk) && 'ffmpeg absent' }, async () => {
  const dir = copierProjet('projet-simple');
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(), texte: 'Pourquoi le froid', outil });
  assert.ok(fs.statSync(path.join(dir, 'assets', 'voix', 'intro.opus')).size > 100);
  const d = deroule();
  d.scenes[0].voix.fichier = 'assets/voix/intro.wav';
  assert.equal(V.lireVoixScene(dir, d, d.scenes[0]).opus, 'assets/voix/intro.opus');
});

test('ecrirePrise avec des mots donnés : décalés du rognage, approche whisper', async () => {
  const dir = copierProjet('projet-simple');
  // Parole de 0,5 s à 2,5 s : rognage de 0,42 s au début (0,5 − 0,08).
  const mots = [{ w: 'Pourquoi', t0: 0.6, t1: 1.0 }, { w: 'le', t0: 1.1, t1: 1.3 }, { w: 'froid', t0: 1.5, t1: 2.4 }];
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(), texte: 'Pourquoi le froid', mots });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'voix', 'intro.mots.json'), 'utf8'));
  assert.equal(m.approche, 'whisper');
  assert.ok(Math.abs(m.mots[0].t0 - 0.18) < 0.02, JSON.stringify(m.mots[0]));
});
