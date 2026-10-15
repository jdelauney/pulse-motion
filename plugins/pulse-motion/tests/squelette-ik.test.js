'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/squelette.js');

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const plan = { ecartJambeAvant: 0, ecartJambeArriere: 0, ecartBrasAvant: 0, ecartBrasArriere: 0 };

test('ik2 : cible atteignable, extrémité exactement sur la cible', () => {
  for (const sens of [1, -1]) {
    const r = S.ik2([0, 0], 68, 68, [20, 100], sens);
    assert.equal(r.atteint, true);
    const a1 = r.a1 * Math.PI / 180, a2 = (r.a1 + r.a2) * Math.PI / 180;
    const bout = [-68 * Math.sin(a1) - 68 * Math.sin(a2), 68 * Math.cos(a1) + 68 * Math.cos(a2)];
    assert.ok(dist(bout, [20, 100]) < 1e-6, JSON.stringify(bout));
    assert.ok(sens * r.a2 > 0, 'la flexion suit le sens demandé');
  }
});

test('ik2 : cible hors de portée, la chaîne s\'étire vers elle', () => {
  const r = S.ik2([0, 0], 50, 46, [300, 0], -1);
  assert.equal(r.atteint, false);
  assert.ok(Math.abs(r.a2) < 1, 'presque tendue');
  assert.ok(Math.abs(r.a1 - -90) < 1, 'pointe vers la cible (devant = -90°)');
});

test('ik2 : cible sur la racine, angles finis', () => {
  const r = S.ik2([5, 5], 50, 46, [5, 5], -1);
  assert.ok(Number.isFinite(r.a1) && Number.isFinite(r.a2));
  assert.equal(r.atteint, false);
});

test('atteindre : la main avant rejoint la cible, de profil', () => {
  const pose = Object.assign({}, plan);
  const r0 = S.calculer(pose);
  const cible = [r0.articulations.epauleAvant[0] + 40, r0.articulations.epauleAvant[1] + 60];
  const angles = S.atteindre(pose, {}, 'mainAvant', cible);
  assert.equal(angles.atteint, true);
  const r = S.calculer(Object.assign({}, pose, angles));
  assert.ok(dist(r.articulations.mainAvant, cible) < 0.01, JSON.stringify(r.articulations.mainAvant));
  assert.ok(angles.avantBrasAvant <= 0, 'le coude plie dans le bon sens');
});

test('atteindre : la cheville arrière rejoint la cible, vue de gauche', () => {
  const pose = Object.assign({ vue: 180 }, plan);
  const r0 = S.calculer(pose);
  const h = r0.articulations.hancheArriere;
  const cible = [h[0] - 30, h[1] + 110];
  const angles = S.atteindre(pose, {}, 'chevilleArriere', cible);
  const r = S.calculer(Object.assign({}, pose, angles));
  assert.ok(dist(r.articulations.chevilleArriere, cible) < 0.01);
  assert.ok(angles.tibiaArriere >= 0);
});

test('atteindre : tient compte du bassin et du torse', () => {
  const pose = Object.assign({ bassinRot: 10, torse: 20 }, plan);
  const r0 = S.calculer(pose);
  const cible = [r0.articulations.epauleAvant[0] + 30, r0.articulations.epauleAvant[1] + 70];
  const r = S.calculer(Object.assign({}, pose, S.atteindre(pose, {}, 'mainAvant', cible)));
  assert.ok(dist(r.articulations.mainAvant, cible) < 0.01);
});

test('atteindre : de face, null ; extrémité inconnue, erreur en français', () => {
  assert.equal(S.atteindre({ vue: 90 }, {}, 'mainAvant', [0, 0]), null);
  assert.throws(() => S.atteindre({}, {}, 'piedAvant', [0, 0]), /extrémité « piedAvant » inconnue.*mainAvant/);
});
