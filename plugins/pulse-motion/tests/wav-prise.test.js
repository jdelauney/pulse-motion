'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../moteur/wav.js');

const taux = 48000;
const sinus = (s, a, f = 440) => Float32Array.from({ length: Math.round(s * taux) }, (_, i) => a * Math.sin(2 * Math.PI * f * i / taux));
const crete = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('mono : moyenne des canaux', () => {
  assert.deepEqual(Array.from(W.mono([Float32Array.of(1, 0.5), Float32Array.of(0, 0.5)])), [0.5, 0.5]);
});

test('passe-haut 80 Hz : un continu disparaît, un 440 Hz passe', () => {
  const continu = W.passeHaut(new Float32Array(taux).fill(0.5), taux);
  assert.ok(Math.abs(continu[taux - 1]) < 0.01);
  const la = W.passeHaut(sinus(1, 0.5), taux);
  assert.ok(crete(la.subarray(taux / 2)) > 0.45);
});

test('rogner : silences du début et de la fin retirés, 80 ms de marge gardées', () => {
  const x = new Float32Array(taux * 3);
  x.set(sinus(1, 0.5), taux); // son de 1 s à 2 s
  const r = W.rogner(x, taux);
  assert.ok(Math.abs(r.length / taux - 1.16) < 0.02, String(r.length / taux));
});

test('revue : prise entièrement silencieuse ou minuscule : jamais vide', () => {
  assert.ok(W.rogner(new Float32Array(1000), taux).length >= 1);
  assert.ok(W.rogner(new Float32Array(0), taux).length >= 1);
  assert.equal(crete(W.normaliserCrete(new Float32Array(10))), 0);
});

test('normaliserCrete : crête à −3 dBFS', () => {
  const x = W.normaliserCrete(sinus(0.5, 0.1));
  assert.ok(Math.abs(20 * Math.log10(crete(x)) + 3) < 0.01);
});

test('preparerPrise : stéréo -> mono rognée à −3 dBFS', () => {
  const x = new Float32Array(taux * 2);
  x.set(sinus(1, 0.2), taux / 2);
  const p = W.preparerPrise({ taux, canaux: [x, Float32Array.from(x)] });
  assert.equal(p.canaux.length, 1);
  assert.equal(p.taux, taux);
  assert.ok(p.canaux[0].length < taux * 1.3);
  assert.ok(Math.abs(20 * Math.log10(crete(p.canaux[0])) + 3) < 0.1);
});
