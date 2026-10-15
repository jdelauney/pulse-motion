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
  assert.equal(tard.os.queue.balancement, 0, 'au-delà de la fenêtre, immobile depuis 0,6 s : repos');
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
