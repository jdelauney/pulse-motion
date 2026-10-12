'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tr = require('../moteur/transitions.js');

const VIDE = { opacity: '', transform: '', clipPath: '' };

test('fondu, glissement, balayage : début, milieu, fin', () => {
  assert.deepEqual(Tr.styleTransition('fondu', 0), { opacity: '0', transform: '', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('fondu', 0.5), { opacity: '0.5', transform: '', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('glissement', 0), { opacity: '', transform: 'translateX(100%)', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('balayage', 0.5), { opacity: '', transform: '', clipPath: 'inset(0 50% 0 0)' });
  for (const t of Tr.TRANSITIONS) assert.deepEqual(Tr.styleTransition(t, 1), VIDE);
});

test('aucune transition : style vide ; q hors bornes ramené dans [0,1]', () => {
  assert.deepEqual(Tr.styleTransition('aucune', 0), VIDE);
  assert.deepEqual(Tr.styleTransition('fondu', -1), { opacity: '0', transform: '', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('fondu', 3), VIDE);
});

test('transition inconnue : message en français', () => {
  assert.throws(() => Tr.styleTransition('tourbillon', 0.2), /Transition inconnue : « tourbillon »/);
});

test('rideau, zoom, coupe : début, milieu, fin', () => {
  assert.deepEqual(Tr.styleTransition('rideau', 0), { opacity: '', transform: '', clipPath: 'inset(0 50% 0 50%)' });
  assert.deepEqual(Tr.styleTransition('rideau', 0.5), { opacity: '', transform: '', clipPath: 'inset(0 25% 0 25%)' });
  assert.deepEqual(Tr.styleTransition('zoom', 0), { opacity: '0', transform: 'scale(0.86)', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('zoom', 0.5), { opacity: '0.5', transform: 'scale(0.93)', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('coupe', 0), VIDE);
  for (const t of ['rideau', 'zoom', 'coupe']) assert.deepEqual(Tr.styleTransition(t, 1), VIDE);
});
