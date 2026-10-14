'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/synthe/partition.js');
const { INSTRUMENTS, BRUITAGES, SONS_TRANSITION, AMBIANCES } = require('../moteur/synthe/catalogue.js');

const proche = (a, b) => Math.abs(a - b) < 0.01;

test('catalogue : instruments, douze bruitages, sons de transition, six ambiances', () => {
  assert.ok(['pluck', 'pad', 'basse', 'sub', 'kick', 'caisse', 'charleston', 'cloche', 'nappe-bruit', 'riser'].every((n) => INSTRUMENTS.includes(n)));
  assert.equal(BRUITAGES.length, 12);
  assert.equal(SONS_TRANSITION.glissement, 'whoosh');
  assert.deepEqual(Object.keys(AMBIANCES).sort(), ['calme', 'corporate', 'entrainant', 'inspirant', 'suspense', 'tech']);
});

test('catalogue : son d'une transition, nommée ou par shader (bibliothèque, ou souffle pour un shader du projet)', () => {
  const C = require('../moteur/synthe/catalogue.js');
  assert.equal(C.sonTransition('fondu'), 'souffle');
  assert.equal(C.sonTransition('aucune'), null);
  assert.equal(C.sonTransition(undefined), null);
  assert.equal(C.sonTransition({ shader: 'glitch', duree: 0.8 }), 'impact');
  assert.equal(C.sonTransition({ shader: 'vagues-maison', duree: 0.8 }), 'souffle');
  for (const nom of Object.values(C.SONS_TRANSITION_SHADER)) assert.ok(BRUITAGES.includes(nom), nom);
  const fs = require('node:fs');
  const path = require('node:path');
  const transitions = fs.readdirSync(path.join(__dirname, '..', 'shaders')).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shaders', f), 'utf8'))).filter((j) => j.usage === 'transition').map((j) => j.nom);
  assert.deepEqual(transitions.sort(), Object.keys(C.SONS_TRANSITION_SHADER).sort(), 'un son pour chaque transition de la bibliothèque');
});

test('fréquences : noms français et anglais, altérations, octaves', () => {
  assert.ok(proche(P.frequence('la4'), 440));
  assert.ok(proche(P.frequence('a4'), 440));
  assert.ok(proche(P.frequence('do4'), 261.63));
  assert.ok(proche(P.frequence('ré4'), P.frequence('d4')));
  assert.ok(proche(P.frequence('sib3'), P.frequence('a#3')));
  assert.ok(proche(P.frequence('bb3'), P.frequence('sib3')));
  assert.equal(P.frequence('zz4'), null);
  assert.equal(P.nomDeMidi(69), 'la4');
});

test('évènements : temps, durées, accords, silences, répétition de la mesure « de » à « a »', () => {
  const p = { tempo: 120, mesures: 4, pistes: [
    { instrument: 'pad', motif: ['do3+mi3+sol3 1'], de: 0, a: 2 },
    { instrument: 'pluck', volume: 0.5, motif: ['do4 1/4', '- 1/4', 'mi4 1/2 0.7'], de: 1 },
    { instrument: 'kick', motif: ['x 1/4'], de: 3 },
  ] };
  assert.deepEqual(P.validerPartition(p), []);
  assert.equal(P.dureeMesure(120), 2);
  const e = P.evenements(p);
  const pad = e.filter((x) => x.instrument === 'pad');
  assert.deepEqual(pad.map((x) => [x.t, x.duree, x.frequences.length]), [[0, 2, 3], [2, 2, 3]]);
  const pluck = e.filter((x) => x.instrument === 'pluck');
  assert.deepEqual(pluck.slice(0, 2).map((x) => [x.t, x.duree, x.velocite, x.volume]), [[2, 0.5, 1, 0.5], [3, 1, 0.7, 0.5]]);
  assert.equal(pluck.length, 6); // mesures 1 à 3
  assert.deepEqual(e.filter((x) => x.instrument === 'kick').map((x) => x.t), [6, 6.5, 7, 7.5]);
  assert.ok(e.every((x, i) => i === 0 || x.t >= e[i - 1].t));
});

test('évènements coupés à la durée de la vidéo', () => {
  const e = P.evenements({ tempo: 120, mesures: 4, pistes: [{ instrument: 'pad', motif: ['do3 1'] }] }, { duree: 3 });
  assert.deepEqual(e.map((x) => [x.t, x.duree]), [[0, 2], [2, 1]]);
});

test('revue : erreurs claires (instrument, note, durée, étendue), avec piste et position', () => {
  const e = P.validerPartition({ tempo: 500, mesures: 0, pistes: [
    { instrument: 'violon', motif: ['do4 1/4'] },
    { instrument: 'pluck', motif: ['do4 1/4', 'zz4 1/4', 'do9 1/4', 're4 0', 're4'] },
    { instrument: 'kick', motif: [] },
  ] }).join(' | ');
  assert.match(e, /tempo/);
  assert.match(e, /mesures/);
  assert.match(e, /piste 1 : instrument « violon » inconnu/);
  assert.match(e, /piste 2, note 2 : « zz4 »/);
  assert.match(e, /piste 2, note 3 : « do9 » hors de l'étendue/);
  assert.match(e, /piste 2, note 4 : durée « 0 »/);
  assert.match(e, /piste 2, note 5 : durée manquante/);
  assert.match(e, /piste 3 : motif vide/);
  assert.deepEqual(P.validerPartition('bonjour'), ['La partition doit être un objet JSON.']);
});
