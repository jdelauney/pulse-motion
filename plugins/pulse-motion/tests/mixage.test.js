'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../moteur/mixage.js');

const croissants = (pts) => pts.every((p, i) => i === 0 || p.t > pts[i - 1].t);

test('groupes de parole : mots placés dans la vidéo, écarts de moins de 0,3 s fusionnés', () => {
  const g = X.groupesParole([{ debut: 2, mots: [{ t0: 0, t1: 0.4 }, { t0: 0.6, t1: 1 }, { t0: 1.5, t1: 2 }] }]);
  assert.deepEqual(g, [{ debut: 2, fin: 3 }, { debut: 3.5, fin: 4 }]);
});

test('ducking : 0 dB, descente 0,1 s avant, −10 dB pendant, remontée 0,25 s après', () => {
  const pts = X.pointsDucking([{ debut: 2, fin: 3 }], X.DUCKING);
  assert.deepEqual(pts, [{ t: 0, db: 0 }, { t: 1.9, db: 0 }, { t: 2, db: -10 }, { t: 3, db: -10 }, { t: 3.25, db: 0 }]);
});

test('revue : deux groupes proches restent atténués entre eux ; parole à t = 0 : atténuée dès le départ', () => {
  const pts = X.pointsDucking([{ debut: 0, fin: 1 }, { debut: 1.3, fin: 2 }], X.DUCKING);
  assert.ok(croissants(pts));
  assert.deepEqual(pts, [{ t: 0, db: -10 }, { t: 2, db: -10 }, { t: 2.25, db: 0 }]);
});

test('fondus : entrée 0,5 s et sortie 1,5 s ; vidéo de 0,7 s : points croissants, fin à 0', () => {
  assert.deepEqual(X.pointsFondus(10, 0.6), [{ t: 0, v: 0 }, { t: 0.5, v: 0.6 }, { t: 8.5, v: 0.6 }, { t: 10, v: 0 }]);
  const court = X.pointsFondus(0.7, 1);
  assert.ok(croissants(court));
  assert.equal(court[court.length - 1].v, 0);
  assert.equal(court[court.length - 1].t, 0.7);
});
