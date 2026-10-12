'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../moteur/wav.js');
const { wavSinus } = require('./aide/son.js');

test('écrire puis lire : même taux, mêmes canaux à 1/32767 près, en-tête RIFF/WAVE 16 bits', () => {
  const a = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 10) * 0.5);
  const b = Float32Array.from({ length: 480 }, (_, i) => -a[i]);
  const octets = W.ecrire({ taux: 48000, canaux: [a, b] });
  assert.equal(octets.length, 44 + 480 * 2 * 2);
  assert.equal(Buffer.from(octets.subarray(0, 4)).toString(), 'RIFF');
  const lu = W.lire(octets);
  assert.equal(lu.taux, 48000);
  assert.equal(lu.canaux.length, 2);
  for (let i = 0; i < 480; i++) assert.ok(Math.abs(lu.canaux[0][i] - a[i]) < 1 / 32767 + 1e-6);
  for (let i = 0; i < 480; i++) assert.ok(Math.abs(lu.canaux[1][i] - b[i]) < 1 / 32767 + 1e-6);
});

test('valeurs hors de [-1, 1] écrêtées', () => {
  const lu = W.lire(W.ecrire({ taux: 8000, canaux: [Float32Array.of(2, -3, 0.25)] }));
  assert.deepEqual(Array.from(lu.canaux[0]).map((x) => Math.round(x * 1000) / 1000), [1, -1, 0.25]);
});

test('lit un WAV écrit par un autre programme (aide de test, 44,1 kHz stéréo)', () => {
  const lu = W.lire(new Uint8Array(wavSinus({ secondes: 1 })));
  assert.equal(lu.taux, 44100);
  assert.equal(lu.canaux.length, 2);
  assert.equal(lu.canaux[0].length, 44100);
});

test('fichier qui n\'est pas un WAV, ou WAV 8 bits : message en français', () => {
  assert.throws(() => W.lire(new Uint8Array(Buffer.from('pas du son du tout'))), /n'est pas un WAV/);
  const huit = Buffer.from(wavSinus({ secondes: 0.1 }));
  huit.writeUInt16LE(8, 34);
  assert.throws(() => W.lire(new Uint8Array(huit)), /non pris en charge/);
});

test('base64 : identique à Buffer', () => {
  const o = W.ecrire({ taux: 8000, canaux: [Float32Array.of(0.1, 0.2, 0.3)] });
  assert.equal(W.base64(o), Buffer.from(o).toString('base64'));
});
