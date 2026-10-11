'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../moteur/tween.js');

test('analyse de plusieurs clauses', () => {
  const c = T.analyserTween('opacity 0→1 back-out; --x -10cqh->0cqh;nombre 0→1250');
  assert.equal(c.length, 3);
  assert.deepEqual(
    c.map(({ prop, de, a, unite, nomCourbe }) => ({ prop, de, a, unite, nomCourbe })),
    [
      { prop: 'opacity', de: 0, a: 1, unite: '', nomCourbe: 'back-out' },
      { prop: '--x', de: -10, a: 0, unite: 'cqh', nomCourbe: 'cubic-out' },
      { prop: 'nombre', de: 0, a: 1250, unite: '', nomCourbe: 'cubic-out' },
    ],
  );
});

test('valeurs aux extrémités et au milieu', () => {
  const [c] = T.analyserTween('--x 10cqh→20cqh linear');
  assert.equal(T.texteTween(c, 0), '10cqh');
  assert.equal(T.texteTween(c, 0.5), '15cqh');
  assert.equal(T.texteTween(c, 1), '20cqh');
});

test('nombre : format français, décimales reprises des bornes', () => {
  const [c] = T.analyserTween('nombre 0→1250 linear');
  assert.equal(T.texteTween(c, 1).replace(/\s/g, ' '), '1 250');
  const [d] = T.analyserTween('nombre 0→3.5 linear');
  assert.equal(T.texteTween(d, 1), '3,5');
  assert.equal(T.nombre(1234567).replace(/\s/g, ' '), '1 234 567');
});

test('erreurs explicites', () => {
  assert.throws(() => T.analyserTween('opacity 0 1'), /attendue sous la forme/);
  assert.throws(() => T.analyserTween('--x 0px→1cqh'), /unités différentes/);
  assert.throws(() => T.analyserTween('--x a→1'), /illisible/);
  assert.throws(() => T.analyserTween('opacity 0→1 rebond'), /Nom de courbe inconnu/);
});

test('un zéro sans unité prend l\'unité de l\'autre borne', () => {
  const [c] = T.analyserTween('--x 0→-10cqh linear');
  assert.equal(c.unite, 'cqh');
  assert.equal(T.texteTween(c, 1), '-10cqh');
  const [d] = T.analyserTween('--y 5px→0 linear');
  assert.equal(T.texteTween(d, 1), '0px');
});

test('une chaîne vide ne produit aucune clause', () => {
  assert.deepEqual(T.analyserTween(''), []);
  assert.deepEqual(T.analyserTween(' ; '), []);
});
