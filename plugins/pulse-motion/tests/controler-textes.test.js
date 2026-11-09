'use strict';
/* Spec S2, 5.7 : glyphes absents des polices, emoji, image répétée. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { controler } = require('../scripts/controler.js');
const { miniProjet } = require('./aide/mini-projet.js');

const de = (dir, regle) => controler({ dossier: dir, ecrire: false }).problemes.filter((p) => p.regle === regle);
const titre = '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2>';

test('controler-textes.test.js › glyphe-absent : ⌘ absent des polices du style ; é présent', () => {
  const p = de(miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Appuyez sur ⌘ pour copier' }, html: titre }] }), 'glyphe-absent');
  assert.equal(p.length, 1);
  assert.equal(p[0].scene, 'a');
  assert.match(p[0].message, /Scène « a », texte « titre » : le caractère « ⌘ » n'existe pas dans les polices de la vidéo/);
  assert.deepEqual(de(miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Été, « café », 4 °C, 12 €' }, html: titre }] }), 'glyphe-absent'), []);
});

test('controler-textes.test.js › emoji : 🚀 signalé', () => {
  const p = de(miniProjet({ scenes: [{ id: 'a', textes: { titre: 'On décolle 🚀' }, html: titre }] }), 'emoji');
  assert.equal(p.length, 1);
  assert.match(p[0].message, /l'emoji « 🚀 » change d'allure selon l'ordinateur/);
  // Un emoji n'est pas en plus un glyphe absent ; © (sans présentation emoji) n'est pas un emoji.
  assert.deepEqual(de(miniProjet({ scenes: [{ id: 'a', textes: { titre: 'On décolle 🚀' }, html: titre }] }), 'glyphe-absent'), []);
  assert.deepEqual(de(miniProjet({ scenes: [{ id: 'a', textes: { titre: '© Pulse 2026' }, html: titre }] }), 'emoji'), []);
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a8f40000000049454e44ae426082', 'hex');

test('controler-textes.test.js › image-repetee : 3 scènes, alerte ; le logo jamais', () => {
  const avec = (html) => ['a', 'b', 'c'].map((id) => ({ id, textes: { titre: 'Le froid' }, html: `${titre}${html}` }));
  const p = de(miniProjet({ scenes: avec('<img src="assets/photo.png" alt="Une chambre froide" data-start="1">'), assets: { 'photo.png': PNG } }), 'image-repetee');
  assert.equal(p.length, 1);
  assert.equal(p[0].scene, 'a');
  assert.match(p[0].message, /La même image « assets\/photo\.png » revient dans 3 scènes \(« a », « b », « c »\)/);
  assert.deepEqual(de(miniProjet({ scenes: avec('<img class="logo" src="assets/photo.png" alt="Logo" data-start="1">'), assets: { 'photo.png': PNG } }), 'image-repetee'), []);
  assert.deepEqual(de(miniProjet({ scenes: avec('<img src="assets/photo.png" alt="" data-start="1">'), assets: { 'photo.png': PNG } }), 'image-repetee'), []);
});
