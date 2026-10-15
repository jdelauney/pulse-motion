'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

// Modules navigateur chargés sous Node (fonctions pures seulement : aucun appel au GPU au chargement).
require('../moteur/particules/simulation.js');
require('../moteur/particules/milieu.js');
const P = globalThis.M.particulesInterne;
const L = 1600 / 9;

function compiler(milieu, dur = 3) {
  const r = R.compiler({ version: 1, nom: 'essai', milieu }, { dur, graine: 7, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

test('milieu : grille (cellules carrées, résolution sur le grand côté, centrée sur la zone), régions du tampon', () => {
  const g = P.grilleMilieu([0, 0, L, 100], 256);
  assert.deepEqual([g.nx, g.ny], [256, 144]);
  assert.ok(Math.abs(g.cote - L / 256) < 1e-9);
  assert.ok(Math.abs(g.origine[0]) < 1e-9 && Math.abs(g.origine[1] - (50 - 72 * g.cote)) < 1e-9);
  const p = P.grilleMilieu([10, 20, 30, 60], 64);
  assert.deepEqual([p.nx, p.ny, p.cote, p.origine], [32, 64, 0.9375, [10, 20]]);
  const d = P.dispositionMilieu(4, 3);
  assert.deepEqual(d, { n: 12, nu: 15, nf: 31, vA: 0, sA: 31, pA: 127, etat: 139, vB: 139, vC: 170, sB: 201, sC: 297, pB: 393, dv: 405, sol: 417, total: 465 });
  // Plus grande grille compilée (1024 sur le grand côté, 16:9) : chaque noyau en moins de 65 535 groupes de 64 fils.
  const G = P.grilleMilieu([0, 0, L, 100], R.RESOLUTION_MILIEU[1]);
  const D = P.dispositionMilieu(G.nx, G.ny);
  assert.ok(Math.ceil(D.nf / 64) <= 65535 && Math.ceil(D.n / 64) <= 65535, `${G.nx} × ${G.ny}`);
});

test('milieu : uniforme « Grille » (géométrie, régions, réglages, sources)', () => {
  const effet = compiler({ resolution: 64, flottaison: 1.5, vorticite: 0.5, viscosite: 1, bords: 'fermes', refroidissement: 2, dissipation: 0.25,
    sources: [{ type: 'encre', forme: { type: 'cercle', rayon: 4, decalage: [3, -2], zone: 'contour' }, debit: 2, temperature: 0.5, couleur: '#2050c0' }],
    rendu: { lumiere: [-1, 0] } });
  const zone = [0, 0, L, 100];
  const g = P.grilleMilieu(zone, 64);
  const d = P.dispositionMilieu(g.nx, g.ny);
  const b = P.emballerGrille(effet, g, d, zone);
  assert.equal(b.byteLength, P.MILIEU.OCTETS_GRILLE);
  const f = new Float32Array(b);
  const u = new Uint32Array(b);
  assert.deepEqual([f[0], f[1], f[2], f[3]], [Math.fround(g.origine[0]), Math.fround(g.origine[1]), Math.fround(g.cote), Math.fround(1 / 120)]);
  assert.deepEqual(Array.from(f.slice(4, 8)), zone.map(Math.fround));
  assert.deepEqual(Array.from(u.slice(8, 24)), [g.nx, g.ny, d.n, d.nu, d.nf, d.vA, d.vB, d.vC, d.sA, d.sB, d.sC, d.pA, d.pB, d.dv, d.sol, 1]);
  const nu = Math.min(1 * P.MILIEU.VISCOSITE, 0.2 * g.cote * g.cote * 120);
  assert.deepEqual([f[24], f[25], f[26], f[27], f[28]], [1.5 * P.MILIEU.FLOTTAISON, 2, 0.25, 0.5 * P.MILIEU.CONFINEMENT, Math.fround(nu)].map(Math.fround));
  assert.deepEqual([u[29], f[30], u[31], f[32], f[33]], [1, Math.fround(P.MILIEU.ABSORPTION), 12, -1, 0]);
  const s = effet.milieu.sources[0];
  assert.deepEqual(Array.from(u.slice(36, 40)), [2, 1, 1, 0]);
  assert.deepEqual(Array.from(f.slice(40, 52)), [4, 0, -1, -1, 0, 3, -2, 2, 0.5, ...s.encre].map(Math.fround));
  assert.equal(P.MILIEU.SOURCES_MAX, R.SOURCES_MILIEU_MAX);
  assert.equal(P.MILIEU.JACOBI, 40);
});

test('milieu : WGSL du module (noyaux, liaisons, dépôts entiers, aucune addition flottante atomique)', () => {
  const code = P.codeMilieu();
  for (const nom of P.NOYAUX_MILIEU) assert.match(code, new RegExp('@compute @workgroup_size\\(64\\)\\s*fn ' + nom + '\\('), nom);
  assert.deepEqual(P.NOYAUX_MILIEU, ['gObstacles', 'gInjecter', 'gAdvecterS', 'gCorrigerS', 'gRecopierS', 'gTourbillon', 'gForcer', 'gAdvecterV', 'gCorrigerV', 'gLimites', 'gDivergence', 'gJacobi', 'gProjeter', 'gPublier']);
  for (const b of [30, 31, 32, 33, 34, 35, 36]) assert.match(code, new RegExp('@binding\\(' + b + '\\)'), 'liaison ' + b);
  assert.match(code, /atomicExchange\(&depots\[/);
  assert.doesNotMatch(code, /atomic<f32>/);
  assert.match(code, /fn repere\(o: u32, tau: f32\) -> Repere/, 'module des collisions de P3 inclus (repères des obstacles)');
});
