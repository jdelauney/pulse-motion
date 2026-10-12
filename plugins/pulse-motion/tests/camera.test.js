'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../moteur/camera.js');

const proche = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('sans clause : cadre neutre', () => {
  const e = K.etatCamera([], 3);
  assert.deepEqual(e, { zoom: 1, x: 50, y: 50, rotation: 0, saturation: 1, flou: 0, sx: 0, sy: 0 });
  const s = K.styleCamera(e);
  assert.equal(s.transform, 'translate(0cqh, 0cqh) translate(50%, 50%) scale(1) rotate(0deg) translate(-50%, -50%)');
  assert.equal(s.filter, 'none');
  assert.equal(s.dx, 0);
  assert.equal(s.dy, 0);
});

test('analyse : propriété, bornes, plage début+durée, courbe', () => {
  const c = K.analyserCamera('zoom 1→1.06 0+4 linear; x 50->44 1.5+0.3', null);
  assert.equal(c.length, 2);
  assert.deepEqual([c[0].prop, c[0].de, c[0].a, c[0].debut, c[0].duree, c[0].nomCourbe], ['zoom', 1, 1.06, 0, 4, 'linear']);
  assert.deepEqual([c[1].prop, c[1].de, c[1].a, c[1].debut, c[1].duree, c[1].nomCourbe], ['x', 50, 44, 1.5, 0.3, 'sine-inout']);
});

test('valeur avant, pendant et après une clause', () => {
  const c = K.analyserCamera('zoom 1.2→1 2+2 linear', null);
  assert.equal(K.etatCamera(c, 0).zoom, 1.2);
  assert.ok(proche(K.etatCamera(c, 3).zoom, 1.1));
  assert.equal(K.etatCamera(c, 9).zoom, 1);
});

test('deux clauses successives d\'une même propriété', () => {
  const c = K.analyserCamera('x 50→20 0+1 linear; x 20→80 3+1 linear', null);
  assert.ok(proche(K.etatCamera(c, 0.5).x, 35));
  assert.equal(K.etatCamera(c, 2).x, 20);
  assert.ok(proche(K.etatCamera(c, 3.5).x, 50));
  assert.equal(K.etatCamera(c, 5).x, 80);
});

test('secousse : nulle hors de sa plage, amortie jusqu\'à sa fin', () => {
  const c = K.analyserCamera('secousse 1 2+0.2', null);
  assert.deepEqual([K.etatCamera(c, 1.9).sx, K.etatCamera(c, 1.9).sy], [0, 0]);
  assert.deepEqual([K.etatCamera(c, 2.2).sx, K.etatCamera(c, 2.2).sy], [0, 0]);
  const pendant = [2.01, 2.03, 2.05, 2.07].map((t) => Math.hypot(K.etatCamera(c, t).sx, K.etatCamera(c, t).sy));
  assert.ok(pendant.some((v) => v > 0.2), pendant.join(' '));
  assert.ok(pendant.every((v) => v <= 1), pendant.join(' '));
  assert.ok(Math.hypot(K.etatCamera(c, 2.199).sx, K.etatCamera(c, 2.199).sy) < 0.02);
});

test('cadrage, rotation, saturation, flou dans le style', () => {
  const c = K.analyserCamera('zoom 2→2 0+1; x 44→44 0+1; y 70→70 0+1; rotation 5→5 0+1; saturation 0.3→0.3 0+1; flou 0.5→0.5 0+1', null);
  const s = K.styleCamera(K.etatCamera(c, 0.5));
  assert.equal(s.transform, 'translate(0cqh, 0cqh) translate(50%, 50%) scale(2) rotate(5deg) translate(-44%, -70%)');
  assert.equal(s.filter, 'saturate(0.3) blur(0.5cqh)');
  assert.equal(s.dx, -6);
  assert.equal(s.dy, 20);
});

test('temps musicaux', () => {
  const c = K.analyserCamera('zoom 1→2 2t+1t linear', 0.5);
  assert.deepEqual([c[0].debut, c[0].duree], [1, 0.5]);
  assert.throws(() => K.analyserCamera('zoom 1→2 2t+1t', null), /en temps musicaux, mais le déroulé n'a pas de « tempo »/);
});

test('erreurs en français, qui nomment la clause', () => {
  assert.throws(() => K.analyserCamera('zoom 1→ 0+1', null), /data-camera : valeur manquante dans « zoom 1→ 0\+1 »/);
  assert.throws(() => K.analyserCamera('travelling 0→1 0+1', null), /propriété « travelling » inconnue \(zoom, x, y, rotation, saturation, flou, secousse\)/);
  assert.throws(() => K.analyserCamera('zoom 1→2', null), /plage « début\+durée » manquante/);
  assert.throws(() => K.analyserCamera('zoom 0→2 0+1', null), /zoom doit rester supérieur à 0/);
  assert.throws(() => K.analyserCamera('zoom 1→2 0+1 tordue', null), /courbe/i);
  assert.throws(() => K.analyserCamera('secousse 0 1+1', null), /amplitude/);
});

test("point visé hors de l'image (x ou y négatif) : CSS valide", () => {
  const s = K.styleCamera(K.etatCamera(K.analyserCamera('x 50→-10 0+1 linear; y 50→-20 0+1 linear', null), 2));
  assert.equal(s.transform, 'translate(0cqh, 0cqh) translate(50%, 50%) scale(1) rotate(0deg) translate(10%, 20%)');
});
