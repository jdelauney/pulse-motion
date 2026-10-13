'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculerMinutage } = require('../moteur/minutage.js');

const voix = { debut: 0.3, duree: 2, mots: [{ w: 'Pourquoi', t0: 0, t1: 0.4 }, { w: 'le', t0: 0.5, t1: 0.6 }, { w: 'Froid,', t0: 0.7, t1: 1.2 }, { w: 'peut-être', t0: 1.3, t1: 1.6 }, { w: 'froid', t0: 1.7, t1: 2 }] };
const el = (cle, start) => ({ cle, start });
const r2 = (x) => Math.round(x * 100) / 100;

test('durée effective : la voix allonge la scène (0,3 + 2 + 0,4 = 2,7 s) ; sinon la durée écrite reste', () => {
  const m = calculerMinutage([{ id: 'a', duree: 1, voix }, { id: 'b', duree: 3 }], {});
  assert.equal(m.scenes[0].fin, 2.7);
  assert.equal(m.scenes[0].allongee, true);
  assert.equal(m.scenes[0].dureeEffective, 2.7);
  assert.equal(m.scenes[1].allongee, false);
  assert.equal(m.duree, 5.7);
  const long = calculerMinutage([{ id: 'a', duree: 5, voix }], {});
  assert.equal(long.scenes[0].fin, 5);
  assert.equal(long.scenes[0].allongee, false);
});

test('avec un tempo : allongement arrondi au temps suivant (120 bpm : 0,5 s)', () => {
  const m = calculerMinutage([{ id: 'a', duree: 1, voix }], {}, { dureeTemps: 0.5 });
  assert.equal(m.scenes[0].fin, 3);
});

test('ancres : mot normalisé, occurrence, fin, décalage, trait d\'union', () => {
  const m = calculerMinutage([{ id: 'a', duree: 4, voix }], { a: [
    el('x', 'mot:froid'), el('y', 'mot:FROID#2'), el('z', 'mot:froid:fin+0.1'), el('w', 'mot:peut-être-0.1'), el('v', 'mot:pourquoi'),
  ] });
  const e = m.elements.a;
  assert.equal(r2(e.x.debut), 1.0);   // 0,3 + 0,7
  assert.equal(r2(e.y.debut), 2.0);   // 0,3 + 1,7
  assert.equal(r2(e.z.debut), 1.6);   // 0,3 + 1,2 + 0,1
  assert.equal(r2(e.w.debut), 1.5);   // 0,3 + 1,3 − 0,1
  assert.equal(r2(e.v.debut), 0.3);
  assert.deepEqual(m.erreurs, []);
});

test('rythme 2 : la voix joue en temps réel, l\'ancre tombe sur le mot dit ; durée effective × rythme', () => {
  const m = calculerMinutage([{ id: 'a', duree: 1, rythme: 2, voix }], { a: [el('x', 'mot:froid')] });
  assert.equal(r2(m.elements.a.x.debut), 1.0);
  assert.equal(m.scenes[0].fin, 2.7);
  assert.equal(m.scenes[0].dureeEffective, 5.4);
});

test('ancre introuvable ou scène sans voix : erreur ancre-mot-introuvable avec les mots disponibles', () => {
  const m = calculerMinutage([{ id: 'a', duree: 4, voix }, { id: 'b', duree: 2 }], { a: [el('x', 'mot:chaud')], b: [el('y', 'mot:froid')] });
  assert.deepEqual(m.erreurs.map((e) => e.regle), ['ancre-mot-introuvable', 'ancre-mot-introuvable']);
  assert.match(m.erreurs[0].message, /« chaud ».*pourquoi, le, froid, peut-être/);
  assert.match(m.erreurs[1].message, /n'a pas de voix/);
});

test('une ancre peut servir de référence : #x:fin après un mot', () => {
  const m = calculerMinutage([{ id: 'a', duree: 4, voix }], { a: [el('x', 'mot:le'), el('y', '#x:fin')] });
  assert.equal(r2(m.elements.a.y.debut), 1.8); // 0,3 + 0,5 + 1 s (durée par défaut)
});

test('correctifs : allongement au temps musical compté depuis le décalage du tempo, scène suivante sur un temps', () => {
  // 120 bpm (0,5 s), premier temps à 0,25 s : la voix finit à 2,7 s, la scène suivante commence à 2,75 s.
  const m = calculerMinutage([{ id: 'a', duree: 1, voix }, { id: 'b', duree: 3 }], {}, { dureeTemps: 0.5, decalageTemps: 0.25 });
  assert.equal(m.scenes[1].debut, 2.75);
  // Avec une transition (entrée chevauchée), c'est le début de la scène suivante qui tombe sur un temps.
  const t = calculerMinutage([{ id: 'a', duree: 1, voix }, { id: 'b', duree: 3, transition: 'fondu' }], {}, { dureeTemps: 0.5, decalageTemps: 0.25 });
  const k = (t.scenes[1].debut - 0.25) / 0.5;
  assert.ok(Math.abs(k - Math.round(k)) < 1e-6, String(t.scenes[1].debut));
  assert.ok(t.scenes[0].fin >= 2.7 - 1e-9);
});
