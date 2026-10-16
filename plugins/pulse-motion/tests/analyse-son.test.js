'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../moteur/analyse-son.js');
const { clics, notes, syllabes } = require('./aide/signaux.js');

const TAUX = 48000;
const INSTANTS = [0, 1, 2, 3, 4, 5, 6, 7].map((j) => 0.25 + 0.5 * j);

test('FFT : un sinus pur tombe dans son intervalle de fréquence', () => {
  const n = 1024;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * 64 * i / n);
  A.fft(re, im);
  const mag = Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k]));
  assert.equal(mag.indexOf(Math.max(...mag)), 64);
  assert.ok(Math.abs(mag[64] - n / 2) < 1e-6);
});

test('battements : clics réguliers détectés à ± 1 image, un seul par clic', () => {
  const tb = A.analyser(clics({ duree: 4.2, instants: INSTANTS }), TAUX);
  assert.equal(tb.cadence, 60);
  assert.equal(tb.battements.length, INSTANTS.length, JSON.stringify(tb.battements));
  tb.battements.forEach((t, j) => assert.ok(Math.abs(t - INSTANTS[j]) <= 1 / 60 + 1e-9, `${t} pour ${INSTANTS[j]}`));
});

test('bandes : une note grave fait monter les basses, une note aiguë les aigus ; pic du spectre à la bonne bande', () => {
  const tb = A.analyser(notes({ plages: [{ debut: 0, fin: 1, frequence: 80 }, { debut: 1, fin: 2, frequence: 8000 }] }), TAUX);
  const grave = A.lire(tb, 0.5);
  const aigu = A.lire(tb, 1.5);
  assert.ok(grave.basses > 0.6 && grave.aigus < 0.2, JSON.stringify(grave));
  assert.ok(aigu.aigus > 0.6 && aigu.basses < 0.2, JSON.stringify(aigu));
  const bande = (f) => 512 * Math.log(f / 20) / Math.log(20000 / 20);
  const pic = (s) => s.indexOf(Math.max(...s));
  const sg = Array.from(A.spectreA(tb, 0.5));
  const sa = Array.from(A.spectreA(tb, 1.5));
  assert.ok(pic(sg) >= Math.floor(bande(70)) && pic(sg) <= Math.ceil(bande(100)), `pic grave à la bande ${pic(sg)}`);
  assert.ok(Math.abs(pic(sa) - bande(8000)) <= 3, `pic aigu à la bande ${pic(sa)}`);
  assert.ok(Math.abs(grave.volume - aigu.volume) < 0.1, 'même volume des deux notes');
});

test('tables identiques à chaque analyse (empreinte), onde centrée', () => {
  const x = notes({ plages: [{ debut: 0, fin: 1, frequence: 440 }] });
  const a = A.analyser(x, TAUX);
  const b = A.analyser(x, TAUX);
  assert.equal(A.empreinte(a), A.empreinte(b));
  assert.match(A.empreinte(a), /^[0-9a-f]{8}$/);
  const onde = Array.from(A.ondeA(tb0(), 0));
  assert.ok(onde.every((v) => v === 128 || v === 127), 'silence : onde au milieu');
  function tb0() { return A.analyser(new Float32Array(TAUX), TAUX); }
});

test('lecture interpolée : fonction de t, bornée hors de la piste ; battement et phase', () => {
  const tb = A.analyser(clics({ duree: 4.2, instants: INSTANTS }), TAUX);
  const i = 30;
  const a = A.lire(tb, i / 60);
  const b = A.lire(tb, (i + 1) / 60);
  const m = A.lire(tb, (i + 0.5) / 60);
  assert.ok(Math.abs(m.volume - (a.volume + b.volume) / 2) < 1e-6);
  assert.deepEqual(A.lire(tb, -1), A.lire(tb, 0));
  assert.deepEqual(A.lire(tb, 99), A.lire(tb, tb.duree));
  const t0 = tb.battements[2];
  assert.equal(A.lire(tb, t0).battement, 1);
  assert.equal(A.lire(tb, t0).phase, 0);
  const t1 = tb.battements[3];
  assert.ok(Math.abs(A.lire(tb, (t0 + t1) / 2).phase - 0.5) < 1e-9);
  assert.ok(A.lire(tb, t0 + 0.3).battement < 0.15);
  assert.equal(A.lire(tb, 0.1).battement, 0, 'avant le premier battement');
});

test('silence et piste très courte : aucun NaN, rien de détecté', () => {
  for (const x of [new Float32Array(2 * TAUX), new Float32Array(100)]) {
    const tb = A.analyser(x, TAUX);
    assert.deepEqual(tb.battements, []);
    for (const k of ['volume', 'basses', 'mediums', 'aigus']) assert.ok(Array.from(tb[k]).every((v) => v === 0), k);
    assert.deepEqual(A.lire(tb, 0.5), A.VIDE);
  }
});

test('voix : enveloppe qui suit les syllabes, syllabes détectées à ± 3 images', () => {
  const instants = [0.3, 0.6, 0.9, 1.2, 1.5];
  const tb = A.analyser(syllabes({ duree: 2, instants }), TAUX, { voix: true });
  assert.equal(tb.syllabes.length, instants.length, JSON.stringify(tb.syllabes));
  tb.syllabes.forEach((t, j) => assert.ok(Math.abs(t - instants[j]) <= 3 / 60 + 1e-9, `${t} pour ${instants[j]}`));
  assert.ok(A.lire(tb, 0.6).enveloppe > 0.7);
  assert.ok(A.lire(tb, 0.75).enveloppe < A.lire(tb, 0.6).enveloppe / 2);
  assert.equal(A.analyser(syllabes({ duree: 2, instants }), TAUX).enveloppe, null, 'musique : pas d\'enveloppe de voix');
});
