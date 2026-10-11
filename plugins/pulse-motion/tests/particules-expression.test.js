'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyser, evaluer } = require('../moteur/particules/expression.js');

test('expressions : opérations, priorités, cqh, moins unaire', () => {
  assert.equal(evaluer('30cqh * vitesse', { vitesse: 2 }), 60);
  assert.equal(evaluer('1 + 2 * 3', {}), 7);
  assert.equal(evaluer('(1 + 2) * 3', {}), 9);
  assert.equal(evaluer('-2 * -3', {}), 6);
  assert.equal(evaluer('10 / 4', {}), 2.5);
  assert.equal(evaluer('nombre / dur', { nombre: 300, dur: 2 }), 150);
  assert.equal(evaluer('.5 + 1.', {}), 1.5);
  assert.equal(evaluer(' 12 ', {}), 12);
});

test('expressions : erreurs en français', () => {
  assert.throws(() => evaluer('1 / 0', {}), /division par zéro dans « 1 \/ 0 »/);
  assert.throws(() => evaluer('2 +', {}), /une valeur attendu dans « 2 \+ »/);
  assert.throws(() => evaluer('vitesse2 * 2', { vitesse: 1, dur: 2 }), /« vitesse2 » inconnu dans « vitesse2 \* 2 » \(noms possibles : vitesse, dur\)/);
  assert.throws(() => evaluer('3 4', {}), /« 4 » en trop dans « 3 4 »/);
  assert.throws(() => evaluer('2 $ 3', {}), /« \$ » inattendu dans « 2 \$ 3 »/);
  assert.throws(() => evaluer('(1 + 2', {}), /« \) » attendu/);
  assert.throws(() => evaluer('', {}), /expression vide/);
  assert.throws(() => analyser('* 2'), /« \* » mal placé/);
});
