'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validerDeroule } = require('../scripts/lib/deroule.js');

const base = () => ({ version: 1, titre: 'T', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 's',
  scenes: [{ id: 'a', fichier: 'scenes/a.html', duree: 2, textes: {} }] });

test('voix valide : globale et par scène', () => {
  const d = base();
  d.voix = { provisoire: true, volume: 0.8 };
  d.scenes[0].voix = { texte: 'Bonjour à tous', fichier: 'assets/voix/a.wav', debut: 0.5 };
  assert.deepEqual(validerDeroule(d), []);
});

test('voix invalide : messages en français', () => {
  const d = base();
  d.voix = { provisoire: 'oui', volume: 2 };
  d.scenes[0].voix = { texte: '  ', debut: -1, fichier: 3 };
  const e = validerDeroule(d).join(' ');
  assert.match(e, /« voix\.provisoire » doit valoir true ou false/);
  assert.match(e, /« voix\.volume » doit être un nombre entre 0 et 1/);
  assert.match(e, /« voix\.texte » est obligatoire/);
  assert.match(e, /« voix\.debut » doit être un nombre de secondes positif ou nul/);
  assert.match(e, /« voix\.fichier » doit être un chemin de fichier/);
});

test('voix de scène qui n\'est pas un objet', () => {
  const d = base();
  d.scenes[0].voix = 'bonjour';
  assert.match(validerDeroule(d).join(' '), /« voix » doit être un objet/);
});
