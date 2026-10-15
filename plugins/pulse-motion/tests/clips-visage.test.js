'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../moteur/clips.js');

const BIB = {
  poses: { debout: { angles: {} }, cri: { bouche: 'A', expression: 'peur', angles: { brasAvant: -150 } } },
  clips: {}, gabarits: {},
  expressions: { joie: { bouche: 'sourire', angles: { sourcilsY: 4, paupieres: 0.85 } }, peur: { bouche: 'surprise', angles: { sourcilsAngle: -14, tailleYeux: 1.25 } } },
};

test('pistes discrètes : ponctuel, tient jusqu\'à la clé suivante', () => {
  const clip = { boucle: false, cles: [{ t: 0, pose: 'debout' }, { t: 0.4, bouche: 'O' }, { t: 0.8, bouche: 'MBP', expression: 'joie' }, { t: 1.2, angles: { torse: 4 } }] };
  assert.equal(K.echantillonner(clip, 0.1, BIB).bouche, 'O', 'avant la première : la valeur de la première');
  assert.equal(K.echantillonner(clip, 0.5, BIB).bouche, 'O');
  assert.equal(K.echantillonner(clip, 0.79, BIB).bouche, 'O');
  assert.equal(K.echantillonner(clip, 0.8, BIB).bouche, 'MBP');
  assert.equal(K.echantillonner(clip, 2, BIB).expression, 'joie');
  assert.equal(K.echantillonner({ boucle: false, cles: [{ t: 0, angles: { torse: 1 } }, { t: 1, angles: { torse: 2 } }] }, 0.5, BIB).bouche, undefined);
});

test('pistes discrètes : bouclé, la piste fait le tour', () => {
  const clip = { boucle: true, duree: 1, cles: [{ t: 0.2, bouche: 'A' }, { t: 0.6, bouche: 'O' }] };
  assert.equal(K.echantillonner(clip, 0.1, BIB).bouche, 'O');
  assert.equal(K.echantillonner(clip, 0.3, BIB).bouche, 'A');
  assert.equal(K.echantillonner(clip, 1.7, BIB).bouche, 'O');
});

test('pistes discrètes : une clé qui cite une pose prend sa bouche et son expression', () => {
  const clip = { boucle: false, cles: [{ t: 0, pose: 'debout' }, { t: 0.5, pose: 'cri' }, { t: 1, pose: 'cri', bouche: 'O' }] };
  assert.deepEqual(K.pistesDiscretes(clip, BIB), { bouche: [[0.5, 'A'], [1, 'O']], expression: [[0.5, 'peur'], [1, 'peur']] });
});

test('expression : appliquée aux clés non animées, la pose l\'emporte', () => {
  const clip = { boucle: false, cles: [{ t: 0, expression: 'joie', angles: { paupieres: 0.5 } }, { t: 1, angles: { torse: 2 } }] };
  const p = K.echantillonner(clip, 0.5, BIB);
  assert.equal(p.sourcilsY, 4);
  assert.equal(p.paupieres, 0.5);
  assert.equal(p.bouche, 'sourire', 'bouche de l\'expression');
  assert.equal(K.echantillonner({ boucle: false, cles: [{ t: 0, expression: 'joie', bouche: 'O' }, { t: 1, angles: {} }] }, 0, BIB).bouche, 'O');
});

test('resoudrePose : la pose l\'emporte, expression inconnue ignorée', () => {
  const p = K.resoudrePose({ expression: 'peur', angles: { tailleYeux: 1 } }, BIB);
  assert.equal(p.tailleYeux, 1);
  assert.equal(p.sourcilsAngle, -14);
  assert.equal(p.bouche, 'surprise');
  assert.equal(p.expression, 'peur');
  assert.deepEqual(K.resoudrePose({ expression: 'rage', angles: { torse: 3 } }, BIB), { torse: 3, expression: 'rage' });
  assert.deepEqual(K.resoudrePose({ angles: { torse: 3 } }, BIB), { torse: 3 });
});
