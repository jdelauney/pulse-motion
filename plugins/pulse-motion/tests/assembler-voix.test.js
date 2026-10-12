'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const V = require('../scripts/lib/voix.js');
const W = require('../moteur/wav.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const taux = 48000;
function wavParole(secondes) {
  const x = new Float32Array(Math.round((secondes + 1) * taux));
  for (let i = taux / 2; i < (secondes + 0.5) * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  return W.ecrire({ taux, canaux: [x] });
}

async function projetAvecVoix(secondes = 5) {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(secondes), texte: 'Pourquoi garder le froid' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi garder le froid', fichier: r.relatif }; });
  return dir;
}

test('voix embarquée (WAV sans Opus), désignée dans les données avec ses mots ; information calage approché', async () => {
  const dir = await projetAvecVoix();
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(r.ok, true);
  assert.match(r.html, /<script type="text\/plain" id="pm-son-voix-intro">data:audio\/wav;base64,/);
  const v = r.donnees.scenes[0].voix;
  assert.equal(v.source, 'pm-son-voix-intro');
  assert.equal(v.debut, 0.3);
  assert.ok(Math.abs(v.duree - 5.16) < 0.05, String(v.duree));
  assert.deepEqual(v.mots.map((m) => m.w), ['Pourquoi', 'garder', 'le', 'froid']);
  assert.deepEqual(r.donnees.voix, { volume: 1 });
  assert.deepEqual(r.erreurs.map((e) => [e.regle, e.gravite]), [['calage-approche', 'info']]);
});

test('Opus valide : embarqué à la place du WAV', async () => {
  const dir = await projetAvecVoix();
  const mots = path.join(dir, 'assets', 'voix', 'intro.mots.json');
  const m = JSON.parse(fs.readFileSync(mots, 'utf8'));
  fs.writeFileSync(path.join(dir, 'assets', 'voix', 'intro.opus'), Buffer.from('OggS-faux'));
  fs.writeFileSync(mots, JSON.stringify({ ...m, opus: m.empreinte }));
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.match(r.html, /id="pm-son-voix-intro">data:audio\/ogg;base64,/);
});

test('prise illisible : erreur voix-illisible, scène sans voix dans la page', async () => {
  const dir = await projetAvecVoix();
  fs.writeFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), 'abîmé');
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.ok(r.erreurs.some((e) => e.regle === 'voix-illisible' && e.gravite === 'erreur'));
  assert.equal(r.donnees.scenes[0].voix, undefined);
});

test('voix provisoire utilisée : alerte voix-provisoire', async () => {
  const dir = copierProjet('projet-simple');
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(1), texte: 'Bonjour', provisoire: true });
  modifierDeroule(dir, (d) => { d.voix = { provisoire: true }; d.scenes[0].voix = { texte: 'Bonjour' }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.ok(r.erreurs.some((e) => e.regle === 'voix-provisoire' && e.gravite === 'alerte'));
  assert.equal(r.donnees.scenes[0].voix.source, 'pm-son-voix-intro');
});

test('scène avec un texte de voix mais sans prise : rien d\'embarqué, pas d\'erreur', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Bonjour' }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(r.ok, true);
  assert.equal(r.donnees.scenes[0].voix, undefined);
  assert.equal(r.donnees.voix, null);
});
