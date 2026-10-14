'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/shaders/code.js');
const { calculerMinutage } = require('../moteur/minutage.js');

const MIN = calculerMinutage([
  { id: 'a', duree: 3, transition: { shader: 'ouverture', duree: 0.5 } },
  { id: 'b', duree: 3, transition: { shader: 'dissolution', duree: 1 } },
  { id: 'c', duree: 3, transition: 'fondu' },
], {});
const plan = (t, o = {}) => S.planComposition(Object.assign({ scenes: MIN.scenes, t, transitions: { a: true, b: true }, posts: {}, postsVideo: 0 }, o));

test('planComposition : transition par shader pendant le chevauchement, rien ailleurs', () => {
  // b : de 2 à 5, transition de 2 à 3.
  assert.deepEqual(plan(2.5), { couches: ['a', 'b'], transition: { sortante: 'a', entrante: 'b', progres: 0.5, temps: 0.5, duree: 1 }, postsVideo: 0 });
  assert.equal(plan(1), null, 'scène seule, sans post-traitement');
  assert.equal(plan(3.2), null, 'transition finie');
  assert.equal(plan(4.7), null, 'transition CSS (fondu) : pas de composition');
  assert.equal(plan(2.5, { transitions: { a: true } }), null, 'shader de b non compilé : repli en fondu, pas de composition');
});

test('planComposition : première scène, post-traitements de scène et de la vidéo', () => {
  assert.deepEqual(plan(0.25).transition, { sortante: null, entrante: 'a', progres: 0.5, temps: 0.25, duree: 0.5 });
  assert.deepEqual(plan(0.25).couches, ['a']);
  assert.deepEqual(plan(1, { posts: { a: 1 } }), { couches: ['a'], transition: null, postsVideo: 0 });
  assert.equal(plan(1, { posts: { b: 2 } }), null, 'post-traitement d\'une scène non visible');
  assert.deepEqual(plan(4.7, { postsVideo: 1 }), { couches: ['b', 'c'], transition: null, postsVideo: 1 }, 'transition CSS avec post-traitement de la vidéo : empilement');
  assert.deepEqual(plan(99, { postsVideo: 1 }).couches, ['c'], 'après la fin : dernière scène');
});
