'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/sonie.js');

const sinus = (secondes, taux, amplitude, frequence = 1000) =>
  Float32Array.from({ length: Math.round(secondes * taux) }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequence * i / taux));

test('sinusoïde 1 kHz à −20 dBFS : −20 LUFS en stéréo, −23 LUFS sur un seul canal (48 et 44,1 kHz)', () => {
  for (const taux of [48000, 44100]) {
    const x = sinus(5, taux, 0.1);
    const stereo = S.mesurer([x, x], taux).integree;
    assert.ok(Math.abs(stereo + 20) < 0.1, `${taux} : ${stereo}`);
    const mono = S.mesurer([x], taux).integree;
    assert.ok(Math.abs(mono + 23) < 0.1, `${taux} : ${mono}`);
  }
});

// Les blocs de 400 ms à cheval sur la fin du son comptent (norme) : écart de quelques centièmes seulement.
test('silence : −Infinity ; porte absolue : un silence ajouté ne change presque pas la mesure', () => {
  const taux = 48000;
  assert.equal(S.mesurer([new Float32Array(taux * 2)], taux).integree, -Infinity);
  const x = sinus(5, taux, 0.1);
  const avecSilence = new Float32Array(taux * 10);
  avecSilence.set(x);
  assert.ok(Math.abs(S.mesurer([avecSilence], taux).integree - S.mesurer([x], taux).integree) < 0.2);
});

test('son plus court que 400 ms : mesuré quand même (un seul bloc)', () => {
  const r = S.mesurer([sinus(0.2, 48000, 0.1)], 48000).integree;
  assert.ok(Math.abs(r + 23) < 0.3, String(r));
});

test('normaliser : −16 LUFS ; crête échantillon limitée à −2 dBFS avec des pointes', () => {
  const taux = 48000;
  const doux = sinus(5, taux, 0.01);
  const r = S.normaliser([doux, Float32Array.from(doux)], taux);
  assert.ok(Math.abs(r.integree + 16) < 0.2, String(r.integree));
  const pointes = sinus(5, taux, 0.05);
  for (let i = 0; i < pointes.length; i += taux / 2) pointes[i] = 1;
  const r2 = S.normaliser([pointes, Float32Array.from(pointes)], taux);
  assert.ok(r2.crete <= -2 + 0.01, String(r2.crete));
  assert.ok(Math.abs(r2.integree + 16) < 0.5, String(r2.integree));
});

test('normaliser un silence : rien ne change, gain 0', () => {
  const x = new Float32Array(48000);
  const r = S.normaliser([x], 48000);
  assert.equal(r.gain, 0);
  assert.equal(r.integree, -Infinity);
  assert.ok(x.every((v) => v === 0));
});

test('correctifs : le limiteur n\'alloue rien quand aucune crête ne dépasse le seuil', () => {
  const S = require('../moteur/sonie.js');
  const x = new Float32Array(48000).map((_, i) => 0.1 * Math.sin(i / 10));
  const Origine = globalThis.Float32Array;
  let crees = 0;
  globalThis.Float32Array = new Proxy(Origine, { construct(cible, args) { crees++; return new cible(...args); } });
  try { S.limiter([x], 48000, 0.5); } finally { globalThis.Float32Array = Origine; }
  assert.equal(crees, 0);
  assert.ok(Math.abs(x[15] - 0.1 * Math.sin(1.5)) < 1e-7);
});
