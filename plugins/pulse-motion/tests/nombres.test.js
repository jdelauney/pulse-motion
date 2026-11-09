'use strict';
/* Spec S2, 5.7 : nombres en lettres (chiffre-invente). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { lireNombresEnLettres, nombresEnChiffres, nombresDuTexte } = require('../scripts/lib/nombres.js');

test('nombres.test.js › de zéro à neuf mille neuf cent quatre-vingt-dix-neuf, « soixante-dix », « quatre-vingts », « trois virgule cinq »', () => {
  const un = (t) => lireNombresEnLettres(t).pop();
  assert.equal(un('zéro'), 0);
  assert.equal(un('neuf mille neuf cent quatre-vingt-dix-neuf'), 9999);
  assert.equal(un('soixante-dix'), 70);
  assert.equal(un('soixante et onze'), 71);
  assert.equal(un('quatre-vingts'), 80);
  assert.equal(un('quatre-vingt-douze'), 92);
  assert.equal(un('vingt et un'), 21);
  assert.equal(un('deux cents'), 200);
  assert.equal(un('mille deux cent cinquante'), 1250);
  assert.equal(un('trois virgule cinq'), 3.5);
  assert.equal(un('deux virgule zéro cinq'), 2.05);
  assert.deepEqual(lireNombresEnLettres('à quatre degrés au maximum'), [4]);
  assert.deepEqual(lireNombresEnLettres('cinquante pour cent des produits'), [50]);
  assert.deepEqual(lireNombresEnLettres('rien ici'), []);
});

test('nombres.test.js › chiffres normalisés : espaces fines, virgule décimale, pour cent', () => {
  assert.deepEqual(nombresEnChiffres('1 250 clients, 1 250 ventes, 3,5 kg, 3.5 kg, 50 %'), [1250, 1250, 3.5, 3.5, 50]);
  assert.deepEqual(nombresDuTexte('4 maillons et quatre degrés'), [4, 4]);
});
