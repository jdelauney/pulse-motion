'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Mi = require('../moteur/minutage.js');

const proche = (a, b) => Math.abs(a - b) < 1e-9;

test('scènes bout à bout, sans transition', () => {
  const m = Mi.calculerMinutage([{ id: 'a', duree: 4 }, { id: 'b', duree: 6 }], {});
  assert.deepEqual(m.scenes.map((s) => [s.id, s.debut, s.fin]), [['a', 0, 4], ['b', 4, 10]]);
  assert.equal(m.duree, 10);
  assert.deepEqual(m.erreurs, []);
});

test('transition d\'entrée : chevauchement de 0,5 s, sauf pour la première scène', () => {
  const m = Mi.calculerMinutage([
    { id: 'a', duree: 4, transition: 'fondu' },
    { id: 'b', duree: 6, transition: 'glissement' },
    { id: 'c', duree: 2, transition: 'aucune' },
  ], {});
  assert.deepEqual(m.scenes.map((s) => [s.debut, s.fin, s.entree]), [[0, 4, 0], [3.5, 9.5, 0.5], [9.5, 11.5, 0]]);
  assert.equal(m.duree, 11.5);
});

test('rythme : durée effective et temps internes étirés', () => {
  const m = Mi.calculerMinutage(
    [{ id: 'a', duree: 4 }, { id: 'b', duree: 4, rythme: 0.8 }],
    { b: [{ cle: 'titre', start: '1', dur: '2' }] },
  );
  assert.equal(m.scenes[1].fin, 4 + 5);
  assert.ok(proche(m.elements.b.titre.debut, 4 + 1.25));
  assert.ok(proche(m.elements.b.titre.fin, 4 + 3.75));
});

test('références relatives au début et à la fin, avec décalage', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 10 }], {
    s: [
      { cle: 'c', start: '#b:fin-0.2' },
      { cle: 'a', start: '0.4', dur: '1.2' },
      { cle: 'b', start: '#a+0.3', dur: '2' },
      { cle: 'd' },
    ],
  });
  const e = m.elements.s;
  assert.ok(proche(e.a.debut, 0.4) && proche(e.a.fin, 1.6));
  assert.ok(proche(e.b.debut, 0.7) && proche(e.b.fin, 2.7));
  assert.ok(proche(e.c.debut, 2.5) && proche(e.c.fin, 3.5));
  assert.ok(proche(e.d.debut, 0) && proche(e.d.fin, 1));
  assert.deepEqual(m.erreurs, []);
});

test('un décalage négatif ne fait pas démarrer avant 0', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 5 }], { s: [{ cle: 'a', start: '0' }, { cle: 'b', start: '#a-2' }] });
  assert.equal(m.elements.s.b.debut, 0);
});

test('référence circulaire détectée, nommée, sans boucle infinie', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 5 }], {
    s: [{ cle: 'a', start: '#b' }, { cle: 'b', start: '#a' }],
  });
  assert.equal(m.erreurs.length, 1);
  assert.equal(m.erreurs[0].regle, 'reference-circulaire');
  assert.equal(m.erreurs[0].scene, 's');
  assert.match(m.erreurs[0].message, /référence circulaire/);
});

test('référence inconnue, data-start et data-dur illisibles', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 5 }], {
    s: [{ cle: 'a', start: '#zz+1' }, { cle: 'b', start: 'bientôt' }, { cle: 'c', dur: 'long' }],
  });
  assert.deepEqual(m.erreurs.map((e) => [e.regle, e.element]), [
    ['reference-inconnue', 'a'], ['start-invalide', 'b'], ['dur-invalide', 'c'],
  ]);
  assert.match(m.erreurs[0].message, /« #zz » n'existe pas/);
  assert.equal(m.elements.s.a.debut, 0);
});

test('progression, état et scènes visibles', () => {
  assert.equal(Mi.progression(1, 2, 4), 0);
  assert.equal(Mi.progression(3, 2, 4), 0.5);
  assert.equal(Mi.progression(9, 2, 4), 1);
  assert.deepEqual([1, 2, 3, 4].map((t) => Mi.etat(t, 2, 4)), ['avant', 'pendant', 'pendant', 'apres']);
  const m = Mi.calculerMinutage([{ id: 'a', duree: 4 }, { id: 'b', duree: 4, transition: 'fondu' }], {});
  assert.deepEqual(Mi.scenesVisibles(m, 1), ['a']);
  assert.deepEqual(Mi.scenesVisibles(m, 3.7), ['a', 'b']);
  assert.deepEqual(Mi.scenesVisibles(m, 7.5), ['b']);
  assert.deepEqual(Mi.scenesVisibles(m, 99), ['b'], 'après la fin : dernière scène');
});

test('vidéo de 5 minutes : 40 scènes de 30 éléments minutées en moins de 50 ms', () => {
  const scenes = [], elements = {};
  for (let i = 0; i < 40; i++) {
    scenes.push({ id: `s${i}`, duree: 7.5, transition: i % 2 ? 'fondu' : 'aucune' });
    elements[`s${i}`] = Array.from({ length: 30 }, (_, k) => ({ cle: `e${k}`, start: k ? `#e${k - 1}+0.1` : '0' }));
  }
  const debut = process.hrtime.bigint();
  const m = Mi.calculerMinutage(scenes, elements);
  const ms = Number(process.hrtime.bigint() - debut) / 1e6;
  assert.deepEqual(m.erreurs, []);
  assert.ok(Math.abs(m.duree - (300 - 20 * 0.5)) < 1e-9);
  assert.ok(ms < 50, `${ms} ms`);
});

test('coupe : aucun chevauchement entre les scènes', () => {
  const { calculerMinutage } = require('../moteur/minutage.js');
  const m = calculerMinutage([{ id: 'a', duree: 4 }, { id: 'b', duree: 2, transition: 'coupe' }, { id: 'c', duree: 2, transition: 'zoom' }], {});
  assert.deepEqual(m.scenes.map((s) => [s.debut, s.entree]), [[0, 0], [4, 0], [5.5, 0.5]]);
});
