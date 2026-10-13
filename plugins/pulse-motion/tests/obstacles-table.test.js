'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../moteur/particules/obstacles.js');

const L = 177.78;
const proche = (a, b, quoi, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${quoi} : ${a} au lieu de ${b}`);

test('constantes du contrat GPU', () => {
  assert.deepEqual(O.TYPES, { demiPlan: 0, boite: 1, cercle: 2, segment: 3, forme: 4 });
  assert.deepEqual(O.CATEGORIES, { sol: 1, murs: 2, elements: 4, formes: 8 });
  assert.equal(O.AUCUN, 0xffffffff);
  assert.equal(O.MAX_TABLE, 48);
  assert.equal(O.MAX_PROFILS, 8);
  assert.equal(O.CASES, 256);
  assert.equal(O.REPERE, 8);
  assert.equal(O.OCTETS_MONDE, 816);
  assert.equal(O.INACTIF.actif, false);
});

test('repères fixes : bords et primitives, côté plein des demi-plans', () => {
  const sol = O.repereFixe({ bord: 'sol' }, L, 90);
  assert.deepEqual(sol, { centre: [L / 2, 90], angle: 0, demi: [L / 2, 0], echelle: [1, 1], actif: true });
  // Point du côté plein : y local > 0.
  assert.ok(O.versLocal(sol, [10, 95])[1] > 0);
  assert.ok(O.versLocal(O.repereFixe({ bord: 'gauche' }, L, 100), [-3, 40])[1] > 0, 'mur gauche plein pour x < 0');
  assert.ok(O.versLocal(O.repereFixe({ bord: 'gauche' }, L, 100), [3, 40])[1] < 0);
  assert.ok(O.versLocal(O.repereFixe({ bord: 'droit' }, L, 100), [L + 2, 40])[1] > 0, 'mur droit plein pour x > largeur');
  const ligne = O.repereFixe({ fixe: { genre: 'ligne', de: [10, 80], a: [40, 120] } }, L, 100);
  assert.deepEqual(ligne.centre, [25, 100]);
  proche(ligne.angle, Math.atan2(40, 30), 'angle de la ligne');
  proche(ligne.demi[0], 25, 'demi-longueur');
  assert.equal(ligne.demi[1], 0);
  assert.deepEqual(O.repereFixe({ fixe: { type: 'cercle', centre: [5, 6], rayon: 3 } }, L, 100), { centre: [5, 6], angle: 0, demi: [3, 3], echelle: [1, 1], actif: true });
  const rect = O.repereFixe({ fixe: { genre: 'rectangle', de: [40, 70], a: [10, 60], angle: 90 } }, L, 100);
  assert.deepEqual(rect.centre, [25, 65]);
  assert.deepEqual(rect.demi, [15, 5]);
  proche(rect.angle, Math.PI / 2, 'angle du rectangle');
  assert.deepEqual(O.repereFixe({ fixe: { type: 'sol', a: 92 } }, L, 100).centre, [L / 2, 92]);
  // Aller-retour local <-> monde.
  const p = O.versMonde(rect, O.versLocal(rect, [12.5, 61.25]));
  proche(p[0], 12.5, 'x', 1e-12);
  proche(p[1], 61.25, 'y', 1e-12);
});

test('interpolation : position et échelle linéaires, angle par le plus court chemin, actif du premier', () => {
  const a = { centre: [0, 0], angle: 3, demi: [1, 2], echelle: [1, 1], actif: true };
  const b = { centre: [10, 20], angle: -3, demi: [3, 2], echelle: [2, 1], actif: false };
  const m = O.interpolerRepere(a, b, 0.25);
  assert.deepEqual(m.centre, [2.5, 5]);
  assert.deepEqual(m.demi, [1.5, 2]);
  assert.deepEqual(m.echelle, [1.25, 1]);
  // De 3 à −3 rad : le plus court passe par π (+0,283 rad), pas par 0 (−6 rad).
  proche(m.angle, 3 + 0.25 * (2 * Math.PI - 6), 'angle');
  assert.equal(m.actif, true);
  const t = new Float32Array(16);
  O.ecrireRepere(t, 8, b);
  assert.deepEqual(Array.from(t.slice(8)), [10, 20, Math.fround(-3), 0, 3, 2, 2, 1]);
  const lu = O.lireRepere(t, 8);
  assert.deepEqual(lu.centre, [10, 20]);
  assert.equal(lu.actif, false);
});

test('table : ordre, catégories, limites, activité', () => {
  const propres = [
    { scene: 's', genre: 'element', video: false, index: 0 },
    { scene: 's', genre: 'forme', video: false, index: 1 },
    { scene: 's', genre: 'ligne', video: false, de: [0, 0], a: [1, 1] },
    { scene: 's', genre: 'cercle', video: false, centre: [5, 5], rayon: 2 },
    { scene: 's', genre: 'rectangle', video: false, de: [0, 0], a: [2, 1], angle: 0 },
  ];
  const voisins = [{ scene: 'v', genre: 'element', video: true, index: 7 }];
  const video = [{ type: 'sol', a: 92 }, { type: 'ligne', de: [0, 0], a: [3, 0] }];
  const t = O.construireTable({ largeurCqh: L, solRecette: null, propres, voisins, video });
  assert.equal(t.actif, true);
  assert.equal(t.sol, 100);
  assert.deepEqual(t.entrees.map((e) => [e.type, e.categorie]), [
    [0, 1], [0, 2], [0, 2],
    [1, 4], [1, 8], [3, 4], [2, 4], [1, 4],
    [1, 4],
    [0, 4], [3, 4],
  ]);
  assert.ok(t.entrees.every((e) => e.forme === O.AUCUN && e.profil === O.AUCUN));
  assert.deepEqual(t.entrees.slice(0, 3).map((e) => e.source.bord), ['sol', 'gauche', 'droit']);
  assert.equal(t.entrees[3].source.element, propres[0]);
  assert.equal(t.entrees[3].source.voisin, false);
  assert.equal(t.entrees[8].source.voisin, true);
  assert.equal(t.entrees[5].source.fixe, propres[2]);
  assert.equal(t.entrees[9].source.video, 0);
  assert.equal(t.entrees[10].source.video, 1);
  // Sans obstacle déclaré (scène, scènes voisines « video », déroulé) : inactif, sauf sol décalé par la recette.
  assert.equal(O.construireTable({ largeurCqh: L, solRecette: null, propres: [], voisins: [], video: [] }).actif, false);
  assert.equal(O.construireTable({ largeurCqh: L, solRecette: null, propres: [], voisins, video: [] }).actif, true);
  const decale = O.construireTable({ largeurCqh: L, solRecette: 85 });
  assert.equal(decale.actif, true);
  assert.equal(decale.sol, 85);
  // 48 entrées au plus.
  const beaucoup = Array.from({ length: 60 }, (_, i) => ({ scene: 's', genre: 'element', video: false, index: i }));
  assert.equal(O.construireTable({ largeurCqh: L, solRecette: null, propres: beaucoup }).entrees.length, 48);
});

test('sol de l\'effet : premier émetteur qui le décale', () => {
  assert.equal(O.solDe({ emetteurs: [{ collisions: null }, { collisions: { sol: null } }] }), null);
  assert.equal(O.solDe({ emetteurs: [{ collisions: null }, { collisions: { sol: 88 } }, { collisions: { sol: 70 } }] }), 88);
});

test('emballage de l\'uniforme Monde', () => {
  const t = O.construireTable({ largeurCqh: L, solRecette: 90, propres: [{ scene: 's', genre: 'element', video: false, index: 0 }] });
  t.entrees[3].profil = 0;
  const b = O.emballerMonde(t.entrees, 62, L, [0.7]);
  assert.equal(b.byteLength, 816);
  const u = new Uint32Array(b);
  const f = new Float32Array(b);
  assert.deepEqual([u[0], u[1], u[3]], [4, 62, 1]);
  assert.equal(f[2], Math.fround(L));
  assert.equal(f[4], Math.fround(0.7));
  assert.deepEqual(Array.from(u.slice(12, 16)), [0, 1, O.AUCUN, O.AUCUN]);
  assert.deepEqual(Array.from(u.slice(24, 28)), [1, 4, O.AUCUN, 0]);
});
