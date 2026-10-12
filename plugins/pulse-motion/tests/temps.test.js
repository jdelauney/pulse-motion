'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../moteur/temps.js');

test('gel : le contenu s\'arrête puis reprend où il en était', () => {
  const p = T.analyserTemps('1+1.5', null, null);
  assert.deepEqual(p, [{ debut: 1, duree: 1.5, facteur: 0 }]);
  assert.deepEqual([0.5, 1, 2, 2.5, 3].map((t) => T.appliquerTemps(p, t)), [0.5, 1, 1, 1, 1.5]);
});

test('vitesse : le contenu va plus vite pendant la plage', () => {
  const p = T.analyserTemps(null, '3+2 x2', null);
  assert.deepEqual([2, 4, 5, 6].map((t) => T.appliquerTemps(p, t)), [2, 5, 7, 8]);
  assert.deepEqual(T.analyserTemps(null, '3+2 ×0.5', null)[0].facteur, 0.5);
});

test('plusieurs plages, en temps musicaux, triées', () => {
  const p = T.analyserTemps('4t+2t', '0+1 x2', 0.5);
  assert.deepEqual(p, [{ debut: 0, duree: 1, facteur: 2 }, { debut: 2, duree: 1, facteur: 0 }]);
  assert.equal(T.appliquerTemps(p, 3.5), 3.5 + 1 - 1);
  assert.deepEqual(T.appliquerTemps([], 2.25), 2.25);
});

test('erreurs nommées', () => {
  assert.throws(() => T.analyserTemps('1+1; 1.5+1', null, null), /data-gel : les plages « 1\+1 » et « 1.5\+1 » se chevauchent/);
  assert.throws(() => T.analyserTemps('1+1', '1.5+1 x2', null), /se chevauchent/);
  assert.throws(() => T.analyserTemps(null, '1+1', null), /data-vitesse : facteur manquant dans « 1\+1 » \(ex\. 1\+2 x2\)/);
  assert.throws(() => T.analyserTemps(null, '1+1 x0', null), /facteur doit être supérieur à 0/);
  assert.throws(() => T.analyserTemps('1.2', null, null), /data-gel : plage « 1.2 » attendue sous la forme « début\+durée »/);
  assert.throws(() => T.analyserTemps('1t+1', null, null), /temps musicaux/);
});
