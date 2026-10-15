'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/squelette.js');

const proche = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} (±${tol})`);
const sansNaN = (r) => Object.entries(r.articulations).forEach(([n, v]) => v.forEach((x) => assert.ok(Number.isFinite(x), `${n} : ${x}`)));

test('calculer : pose vide = repos, aucune valeur NaN', () => {
  const r = S.calculer({});
  sansNaN(r);
  assert.deepEqual(r.efficace.cuisseAvant, S.REPOS.cuisseAvant);
  assert.deepEqual(r.articulations.bassin, [0, 0, 0]);
  // cou : Rz(torse 3°)·[0, -82, 0]
  proche(r.articulations.cou[0], 82 * Math.sin(3 * Math.PI / 180), 1e-9);
  proche(r.articulations.cou[1], -82 * Math.cos(3 * Math.PI / 180), 1e-9);
});

test('calculer : cuisse à -90° = genou devant le bassin, de profil', () => {
  const r = S.calculer({ cuisseAvant: -90 });
  const h = r.articulations.hancheAvant, g = r.articulations.genouAvant;
  proche(g[0] - h[0], 68, 1e-9);
  proche(g[1] - h[1], 0, 1e-9);
});

test('calculer : de face, les hanches sont symétriques et le côté Avant est à gauche de l\'écran', () => {
  const r = S.calculer({ vue: 90 });
  const a = r.articulations.hancheAvant, b = r.articulations.hancheArriere;
  proche(a[0], -6, 1e-9);
  proche(b[0], 6, 1e-9);
});

test('calculer : ordre de profondeur selon la vue', () => {
  const profil = S.calculer({ vue: 0 });
  assert.ok(profil.ordre.indexOf('jambeArriere') < profil.ordre.indexOf('jambeAvant'));
  assert.ok(profil.ordre.indexOf('brasArriere') < profil.ordre.indexOf('brasAvant'));
  const gauche = S.calculer({ vue: 180 });
  assert.ok(gauche.ordre.indexOf('jambeAvant') < gauche.ordre.indexOf('jambeArriere'));
  assert.equal(profil.ordre.length, 6);
  assert.ok(profil.profondeurs.jambeArriere < 0 && profil.profondeurs.jambeAvant > 0);
});

test('contraindre : bornes, clé générique, surcharge du gabarit, désactivation', () => {
  assert.equal(S.contraindre({ tibiaAvant: -20 }).tibiaAvant, 0);
  assert.equal(S.contraindre({ cuisseArriere: 200 }).cuisseArriere, 45);
  assert.equal(S.contraindre({ avantBrasAvant: -170 }, { contraintes: { avantBras: [-180, 0] } }).avantBrasAvant, -170);
  assert.equal(S.contraindre({ avantBrasAvant: -170 }, { contraintes: { avantBrasArriere: [-180, 0] } }).avantBrasAvant, -150);
  assert.equal(S.contraindre({ tibiaAvant: -20 }, {}, false).tibiaAvant, -20);
  const r = S.calculer({ tibiaAvant: -20 }, {}, { contraintes: false });
  assert.equal(r.efficace.tibiaAvant, -20);
});

test('limite : clés génériques et expression sans borne', () => {
  assert.deepEqual(S.limite('cuisseAvant', S.completerGabarit()), [-125, 45]);
  assert.equal(S.limite('tailleYeux', S.completerGabarit()), null);
  assert.equal(S.generique('avantBrasAvant'), 'avantBras');
  assert.equal(S.generique('brasArriere'), 'bras');
  assert.equal(S.generique('torse'), 'torse');
});

test('completerGabarit : fusion profonde de la tête', () => {
  const g = S.completerGabarit({ cuisse: 80, tete: { rx: 40 } });
  assert.equal(g.cuisse, 80);
  assert.equal(g.tibia, 68);
  assert.deepEqual(g.tete, { rx: 40, ry: 50 });
  assert.deepEqual(g.osEnPlus, []);
  assert.equal(S.GABARIT.tete.rx, 34, 'le gabarit standard n\'est pas modifié');
});

test('poserAuSol : la cheville la plus basse touche le sol, quel que soit le gabarit', () => {
  for (const gabarit of [{}, { cuisse: 80, tibia: 70 }]) {
    for (const pose of [{}, { cuisseAvant: -60, tibiaAvant: 100, cuisseArriere: -50, tibiaArriere: 95, ecartJambeAvant: 0, ecartJambeArriere: 0 }]) {
      const p = S.poserAuSol(pose, gabarit);
      const r = S.calculer(p, gabarit);
      const bas = Math.max(r.articulations.chevilleAvant[1], r.articulations.chevilleArriere[1]);
      proche(bas, S.sol(gabarit), 1e-6, JSON.stringify(gabarit));
    }
  }
  assert.equal(S.sol({}), 136);
  const origine = { cuisseAvant: -30 };
  S.poserAuSol(origine);
  assert.equal(origine.bassinY, undefined, 'la pose d\'origine n\'est pas modifiée');
});

test('melanger : interpolation clé à clé, clés absentes = repos', () => {
  const m = S.melanger({ torse: 10 }, { torse: 30, vue: 90 }, 0.25);
  assert.equal(m.torse, 15);
  assert.equal(m.vue, 22.5);
  assert.equal(m.cuisseAvant, S.REPOS.cuisseAvant);
});

test('pointDe : position dans le repère du parent', () => {
  const r = S.calculer({ x: 100, y: 200, echelle: 0.5, cuisseAvant: -90 });
  const p = S.pointDe(r, 'genouAvant');
  proche(p.x, 100 + r.articulations.genouAvant[0] * 0.5, 1e-9);
  proche(p.y, 200 + r.articulations.genouAvant[1] * 0.5, 1e-9);
  assert.equal(S.pointDe(r, 'inconnu'), null);
});

test('calculer : la tête expose son repère pour l\'habillage', () => {
  const r = S.calculer({});
  const c = r.tete.vers([0, 0, 0]);
  c.forEach((v, i) => proche(v, r.articulations.centreTete[i], 1e-9));
  proche(r.tete.rx, 34, 1e-9);
  proche(r.tete.ry, 50, 1e-9, 'de profil, la tête garde sa hauteur');
  const de90 = S.calculer({ vue: 90 });
  proche(de90.tete.avant[2], Math.cos(3 * Math.PI / 180), 1e-9, 'de face, la tête regarde la caméra (torse 3°)');
});
