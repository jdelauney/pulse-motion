'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../moteur/particules/obstacles.js');

test('déclaration : rien sans attribut d\'obstacle', () => {
  assert.equal(O.lireDeclaration({ id: 'x', class: 'y' }), null);
  assert.equal(O.MAX_SCENE, 16);
  assert.equal(O.MAX_VIDEO, 8);
});

test('déclaration : éléments (boîte, forme, vidéo)', () => {
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle': '' }), { obstacle: { genre: 'element', video: false } });
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle': 'forme' }), { obstacle: { genre: 'forme', video: false } });
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle': 'video' }), { obstacle: { genre: 'element', video: true } });
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle': ' video  forme ' }), { obstacle: { genre: 'forme', video: true } });
  assert.match(O.lireDeclaration({ 'data-obstacle': 'formes' }).erreur, /data-obstacle « formes » : valeurs possibles/);
  assert.match(O.lireDeclaration({ 'data-obstacle': 'vidéo' }).erreur, /data-obstacle « vidéo »/);
  assert.match(O.lireDeclaration({ 'data-obstacle': '', 'data-obstacle-forme': 'ligne' }).erreur, /ne vont pas sur la même balise/);
});

test('déclaration : formes invisibles en cqh', () => {
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle-forme': 'ligne', 'data-de': '10 80', 'data-a': '60, 95' }),
    { obstacle: { genre: 'ligne', video: false, de: [10, 80], a: [60, 95] } });
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle-forme': 'cercle', 'data-centre': '50 50', 'data-rayon': '8.5' }),
    { obstacle: { genre: 'cercle', video: false, centre: [50, 50], rayon: 8.5 } });
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle-forme': 'rectangle', 'data-de': '10 60', 'data-a': '40 70', 'data-angle': '-15' }),
    { obstacle: { genre: 'rectangle', video: false, de: [10, 60], a: [40, 70], angle: -15 } });
  assert.deepEqual(O.lireDeclaration({ 'data-obstacle-forme': 'rectangle', 'data-de': '10 60', 'data-a': '40 70' }).obstacle.angle, 0);
  const fautes = [
    [{ 'data-obstacle-forme': 'triangle' }, /« triangle » inconnue \(ligne, cercle, rectangle\)/],
    [{ 'data-obstacle-forme': 'ligne', 'data-de': '10 80' }, /ligne : data-de="x y" et data-a="x y"/],
    [{ 'data-obstacle-forme': 'ligne', 'data-de': '10 80', 'data-a': '10 80' }, /confondus/],
    [{ 'data-obstacle-forme': 'ligne', 'data-de': '10', 'data-a': '20 30' }, /data-de="x y"/],
    [{ 'data-obstacle-forme': 'cercle', 'data-centre': '50 50' }, /data-rayon positif/],
    [{ 'data-obstacle-forme': 'cercle', 'data-centre': '50 50', 'data-rayon': '0' }, /data-rayon positif/],
    [{ 'data-obstacle-forme': 'cercle', 'data-rayon': '3' }, /data-centre="x y"/],
    [{ 'data-obstacle-forme': 'rectangle', 'data-de': '10 60', 'data-a': '10 70' }, /coins opposés/],
    [{ 'data-obstacle-forme': 'rectangle', 'data-de': '10 60', 'data-a': '40 70', 'data-angle': 'droit' }, /data-angle en degrés/],
  ];
  for (const [attrs, message] of fautes) assert.match(O.lireDeclaration(attrs).erreur, message, JSON.stringify(attrs));
});

test('déroulé : obstacles de la vidéo', () => {
  assert.deepEqual(O.lireObstaclesVideo(undefined), { obstacles: [], erreurs: [], enTrop: 0 });
  const r = O.lireObstaclesVideo([
    { type: 'sol', a: 92 },
    { type: 'ligne', de: [0, 80], a: [40, 95] },
    { type: 'cercle', centre: [50, 50], rayon: 5 },
    { type: 'rectangle', de: [10, 60], a: [40, 70], angle: 10 },
    { type: 'rectangle', de: [10, 60], a: [40, 70] },
  ]);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.obstacles.length, 5);
  assert.deepEqual(r.obstacles[4], { type: 'rectangle', de: [10, 60], a: [40, 70], angle: 0 });
  const fautes = O.lireObstaclesVideo([
    { type: 'sol' }, { type: 'plafond', a: 3 }, { type: 'ligne', de: [0, 80] }, { type: 'cercle', centre: [1, 2], rayon: -1 },
    { type: 'sol', a: 92, b: 1 }, 'sol', { type: 'ligne', de: [0, 80], a: [0, 80] },
  ]);
  assert.equal(fautes.obstacles.length, 0);
  assert.deepEqual(fautes.erreurs, [
    '« obstacles[0] » : sol : « a » = hauteur du sol en cqh depuis le haut (ex. 92).',
    '« obstacles[1] » : « type » parmi sol, ligne, cercle, rectangle.',
    '« obstacles[2] » : ligne : « de » et « a » = [x, y] en cqh.',
    '« obstacles[3] » : cercle : « centre » = [x, y] et « rayon » positif, en cqh.',
    '« obstacles[4] » : champ « b » inconnu (champs de sol : type, a).',
    '« obstacles[5] » doit être un objet.',
    '« obstacles[6] » : ligne : « de » et « a » confondus.',
  ]);
  assert.deepEqual(O.lireObstaclesVideo({ type: 'sol' }).erreurs, ['« obstacles » doit être une liste, ex. [{ "type": "sol", "a": 92 }].']);
  const neuf = O.lireObstaclesVideo(Array.from({ length: 9 }, (_, i) => ({ type: 'sol', a: 90 + i })));
  assert.equal(neuf.obstacles.length, 8);
  assert.equal(neuf.enTrop, 1);
  assert.deepEqual(neuf.obstacles.map((o) => o.a), [90, 91, 92, 93, 94, 95, 96, 97]);
});
