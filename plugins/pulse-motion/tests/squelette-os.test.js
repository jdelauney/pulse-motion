'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/squelette.js');

const QUEUE = { nom: 'queue', parent: 'bassin', attache: [-4, -4, 0], angle: 120, longueur: 40, raideur: 0.5, amorti: 0.3 };
const gabarit = { osEnPlus: [QUEUE] };
// Avance de 300 unités/s jusqu'à t = 1, puis s'arrête net.
const poseA = (t) => ({ x: 300 * Math.min(t, 1) });

test('os en plus : sans contexte, à son angle de repos (+ angle de la pose)', () => {
  const r = S.calculer({}, gabarit);
  const b = r.articulations.queue, q = r.articulations.queueBout;
  const a = 120 * Math.PI / 180;
  assert.ok(Math.abs(q[0] - b[0] - (-40 * Math.sin(a))) < 1e-9);
  assert.ok(Math.abs(q[1] - b[1] - 40 * Math.cos(a)) < 1e-9);
  assert.ok('queue' in r.profondeurs && r.ordre.includes('queue'));
  const r2 = S.calculer({ queue: -30 }, gabarit);
  assert.equal(r2.os.queue.angle, 90);
});

test('os en plus : parent inconnu, erreur en français', () => {
  assert.throws(() => S.calculer({}, { osEnPlus: [{ nom: 'cape', parent: 'epaule', longueur: 10 }] }), /parent « epaule » inconnu/);
});

test('os en plus : immobile, aucun balancement', () => {
  const r = S.calculer({ x: 50 }, gabarit, { temps: 2, poseA: () => ({ x: 50 }) });
  assert.equal(r.os.queue.balancement, 0);
});

test('os en plus : l\'arrêt net fait balancer, puis tout se calme', () => {
  const juste = S.calculer(poseA(1.1), gabarit, { temps: 1.1, poseA });
  assert.ok(Math.abs(juste.os.queue.balancement) > 1, `balancement ${juste.os.queue.balancement}`);
  assert.ok(Math.abs(juste.os.queue.balancement) <= 80);
  const tard = S.calculer(poseA(5), gabarit, { temps: 5, poseA });
  assert.equal(tard.os.queue.balancement, 0, 'au-delà de la fenêtre, immobile depuis 1 s : repos');
});

test('os en plus : déterminisme (ordre de lecture indifférent)', () => {
  const lire = (t) => S.calculer(poseA(t), gabarit, { temps: t, poseA }).articulations.queueBout;
  const a3 = lire(1.13), a1 = lire(0.4);
  const b1 = lire(0.4), b3 = lire(1.13);
  assert.deepEqual(a3, b3);
  assert.deepEqual(a1, b1);
});

test('os en plus : coût raisonnable (300 images, 2 os, moins de 2 s)', () => {
  const g = { osEnPlus: [QUEUE, Object.assign({}, QUEUE, { nom: 'oreille', parent: 'tete', attache: [0, -40, 0], angle: 170, longueur: 20 })] };
  const debut = Date.now();
  for (let i = 0; i < 300; i++) S.calculer(poseA(i / 60), g, { temps: i / 60, poseA });
  assert.ok(Date.now() - debut < 2000, `${Date.now() - debut} ms`);
});

const balance = (pose, t, g = gabarit, f = poseA) => S.calculer(Object.assign({}, f(t), pose), g, { temps: t, poseA: (u) => Object.assign({}, f(u), pose) }).os.queue.balancement;

test('os en plus : pas de saut quand la poussée sort de la fenêtre', () => {
  const mou = { osEnPlus: [Object.assign({}, QUEUE, { raideur: 0, amorti: 0.4 })] };
  // L'arrêt net (t = 1) fait réagir l'os ; on regarde la sortie de la fenêtre, de 1,3 à 2,5 s.
  // Un saut se voit à la dérivée seconde (l'oscillation normale y reste sous 0,3° par image²).
  const v = Array.from({ length: 73 }, (_, i) => balance({}, 1.3 + i / 60, mou));
  for (let i = 1; i < v.length - 1; i++) {
    const d2 = v[i + 1] - 2 * v[i] + v[i - 1];
    assert.ok(Math.abs(d2) < 0.5, `saut à t = ${1.3 + i / 60} : ${v[i - 1]}, ${v[i]}, ${v[i + 1]}`);
  }
  assert.equal(balance({}, 2.1, mou), 0);
});

test('os en plus : même balancement à toute échelle ; continu quand la vue passe de face', () => {
  const a = balance({}, 1.1);
  const double = (t) => ({ x: 600 * Math.min(t, 1), echelle: 2 });
  const b = S.calculer(double(1.1), gabarit, { temps: 1.1, poseA: double }).os.queue.balancement;
  assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
  const v89 = balance({ vue: 89 }, 1.1), v91 = balance({ vue: 91 }, 1.1), v90 = balance({ vue: 90 }, 1.1);
  assert.ok(Math.abs(v89 - v91) < 2 && Math.abs(v90) < 1, `${v89} / ${v90} / ${v91}`);
});

test('os en plus : un nom déjà pris par le squelette est refusé', () => {
  assert.throws(() => S.calculer({}, { osEnPlus: [{ nom: 'tete', parent: 'bassin', longueur: 10 }] }), /« tete » est déjà pris/);
  assert.throws(() => S.calculer({}, { osEnPlus: [{ nom: 'mainAvant', parent: 'bassin', longueur: 10 }] }), /déjà pris/);
});
