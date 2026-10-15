'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../moteur/clips.js');
const S = require('../moteur/squelette.js');

const proche = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const BIB = { poses: { debout: { angles: {} }, haut: { angles: { brasAvant: -150 } } }, clips: {}, gabarits: {} };

test('clip ponctuel : interpolation, maintien avant et après, durée', () => {
  const clip = { boucle: false, cles: [{ t: 0, angles: { torse: 0 }, courbe: 'linear' }, { t: 2, angles: { torse: 20 } }] };
  assert.equal(K.duree(clip), 2);
  proche(K.echantillonner(clip, 1, BIB).torse, 10);
  proche(K.echantillonner(clip, -1, BIB).torse, 0);
  proche(K.echantillonner(clip, 5, BIB).torse, 20);
  const doux = { boucle: false, cles: [{ t: 0, angles: { torse: 0 } }, { t: 2, angles: { torse: 20 } }] };
  proche(K.echantillonner(doux, 0.5, BIB).torse, 20 * (0.5 - 0.5 * Math.cos(Math.PI * 0.25)), 1e-6);
});

test('pistes par angle : un angle absent d\'une clé est interpolé entre ses voisines', () => {
  const clip = { boucle: false, cles: [
    { t: 0, angles: { torse: 0, tete: 0 }, courbe: 'linear' },
    { t: 1, angles: { torse: 10 }, courbe: 'linear' },
    { t: 2, angles: { torse: 10, tete: 20 } }] };
  proche(K.echantillonner(clip, 1, BIB).tete, 10);
  assert.deepEqual(Object.keys(K.pistes(clip, BIB)).sort(), ['tete', 'torse']);
});

test('clé qui cite une pose : fixe tous les angles animés (les autres au repos)', () => {
  const clip = { boucle: false, cles: [{ t: 0, pose: 'debout' }, { t: 1, angles: { torse: 30 } }, { t: 2, pose: 'haut' }] };
  const fin = K.echantillonner(clip, 2, BIB);
  assert.equal(fin.torse, S.REPOS.torse);
  assert.equal(fin.brasAvant, -150);
  const debut = K.echantillonner(clip, 0, BIB);
  assert.equal(debut.brasAvant, S.REPOS.brasAvant);
  assert.equal(debut.torse, S.REPOS.torse);
});

test('clip bouclé : la piste fait le tour', () => {
  const clip = { boucle: true, duree: 2, cles: [{ t: 0.25, angles: { torse: 10 }, courbe: 'linear' }, { t: 0.75, angles: { torse: 30 }, courbe: 'linear' }] };
  proche(K.echantillonner(clip, 0, BIB).torse, 20);
  proche(K.echantillonner(clip, 0.5, BIB).torse, 10);
  proche(K.echantillonner(clip, 1, BIB).torse, 20);
  proche(K.echantillonner(clip, 2.5, BIB).torse, 10);
  proche(K.position(clip, -0.5), 0.75);
});

test('clip bouclé : piste à une clé, constante ; clés à 0 et 1, sans division par zéro', () => {
  const une = { boucle: true, duree: 1, cles: [{ t: 0.3, angles: { torse: 7 } }] };
  assert.equal(K.echantillonner(une, 0.9, BIB).torse, 7);
  const bornes = { boucle: true, duree: 1, cles: [{ t: 0, angles: { torse: 0 }, courbe: 'linear' }, { t: 1, angles: { torse: 0 } }] };
  for (const t of [0, 0.5, 0.999, 1]) assert.ok(Number.isFinite(K.echantillonner(bornes, t, BIB).torse));
});

test('miroir : les membres Arrière reprennent les Avant décalés, sauf piste explicite', () => {
  const clip = { boucle: true, duree: 1, miroir: 0.5, cles: [
    { t: 0, angles: { cuisseAvant: -20, brasArriere: 5 }, courbe: 'linear' },
    { t: 0.5, angles: { cuisseAvant: 20, brasAvant: 0 }, courbe: 'linear' }] };
  const a = K.echantillonner(clip, 0, BIB);
  proche(a.cuisseAvant, -20); proche(a.cuisseArriere, 20);
  const b = K.echantillonner(clip, 0.25, BIB);
  proche(b.cuisseAvant, 0); proche(b.cuisseArriere, 0);
  assert.equal(a.brasArriere, 5, 'piste Arrière explicite gardée');
});

test('pieds au sol : bassinY calculé, piste bassinY = décalage', () => {
  const angles = { cuisseAvant: -60, tibiaAvant: 100 };
  const clip = { boucle: false, pieds: 'au-sol', cles: [{ t: 0, angles }] };
  const attendu = S.poserAuSol(angles).bassinY;
  proche(K.echantillonner(clip, 0, BIB).bassinY, attendu);
  const rebond = { boucle: false, pieds: 'au-sol', cles: [{ t: 0, angles: Object.assign({ bassinY: -5 }, angles) }] };
  proche(K.echantillonner(rebond, 0, BIB).bassinY, attendu - 5);
  const long = { cuisse: 90, tibia: 90 };
  proche(K.echantillonner(clip, 0, BIB, long).bassinY, S.poserAuSol(angles, long).bassinY);
});

test('additif : les différences s\'ajoutent, une pose citée vaut 0', () => {
  const souffle = { boucle: true, duree: 2, additif: true, cles: [{ t: 0, angles: { torse: 0 }, courbe: 'linear' }, { t: 0.5, angles: { torse: 2 }, courbe: 'linear' }] };
  proche(K.ajouter({ torse: 10 }, souffle, 1, BIB).torse, 12);
  proche(K.ajouter({}, souffle, 1, BIB).torse, S.REPOS.torse + 2);
  const zero = { boucle: false, additif: true, cles: [{ t: 0, pose: 'debout' }, { t: 1, angles: { torse: 4 } }] };
  proche(K.echantillonner(zero, 0, BIB).torse, 0);
  assert.throws(() => K.ajouter({}, { nom: 'marche', boucle: true, duree: 1, cles: [{ t: 0, angles: { torse: 1 } }] }, 0, BIB), /« marche » .*additif/);
});

test('pose introuvable : erreur claire', () => {
  const clip = { boucle: false, cles: [{ t: 0, pose: 'assise' }] };
  assert.throws(() => K.echantillonner(clip, 0, BIB), /pose « assise » introuvable.*debout, haut/);
});
