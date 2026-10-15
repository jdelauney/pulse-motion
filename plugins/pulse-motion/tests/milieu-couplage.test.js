'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const Mm = require('../moteur/particules/maillage.js');

// Modules navigateur chargés sous Node (fonctions pures seulement : aucun appel au GPU au chargement).
require('../moteur/particules/simulation.js');
require('../moteur/particules/structures.js');
require('../moteur/particules/milieu.js');
const P = globalThis.M.particulesInterne;

function compiler(emetteurs, dur = 3) {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 7, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}
function compilerMilieu(milieu, dur = 3) {
  const r = R.compiler({ version: 1, nom: 'air', milieu }, { dur, graine: 7, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

test('vent du milieu : force « milieu » dans le noyau (code 7), fonctions neutres, variante qui lit la texture', () => {
  const effet = compiler([{ nom: 'b', naissance: { debit: 5 }, forces: [{ type: 'milieu', coef: 2.5 }] }]);
  const E = new Float32Array(P.emballerE(effet.emetteurs[0], effet, false, 10, null));
  const U = new Uint32Array(E.buffer);
  assert.deepEqual([U[11], U[72], E[74]], [1, 7, 2.5], 'une force, code 7, coefficient');
  for (const code of [P.WGSL_MODULE_COLLISIONS(), P.codeStructures(256)]) {
    assert.match(code, /case 7u: \{/);
    assert.ok(code.includes(P.NEUTRE_VENT), 'vent neutre');
  }
  assert.ok(P.WGSL_MODULE_COLLISIONS().includes(P.NEUTRE_EXPOSITION), 'exposition neutre (particules)');
  const vent = P.avecMilieu(P.WGSL_MODULE_COLLISIONS());
  assert.ok(!vent.includes(P.NEUTRE_VENT));
  assert.match(vent, /@group\(0\) @binding\(24\) var ventTex: texture_2d<f32>;/);
  assert.match(vent, /@group\(0\) @binding\(25\) var<uniform> GV: GrilleVent;/);
  assert.match(vent, /fn ventMilieu\(x: vec2f\) -> vec2f \{\n  if \(GV\.n\.x == 0u \|\| GV\.n\.y == 0u\) \{ return vec2f\(0\.0\); \}/);
  assert.throws(() => P.avecMilieu('fn autre() {}'), /vent du milieu/);
});

test('dépôts : uniforme « Depot » (géométrie de la grille, quantités, encre fixe ou couleur de la particule) et WGSL', () => {
  const effet = compiler([
    { nom: 'a', naissance: { debit: 5 }, injecte: { fumee: 0.5, chaleur: 0.25 } },
    { nom: 'b', naissance: { debit: 5 }, injecte: { encre: '#2050c0' } },
    { nom: 'c', naissance: { debit: 5 }, injecte: { encre: 'couleur', fumee: 1 } },
  ]);
  const g = { origine: [1, 2], cote: 0.5, nx: 40, ny: 30 };
  const lire = (em, cap) => { const b = P.emballerDepot(em, g, cap); assert.equal(b.byteLength, 64); return { f: new Float32Array(b), u: new Uint32Array(b) }; };
  const a = lire(effet.emetteurs[0], 100);
  assert.deepEqual([a.f[0], a.f[1], a.f[2], a.f[3], a.u[4], a.u[5], a.u[6], a.u[7], a.f[8], a.f[9], a.f[10]],
    [1, 2, 0.5, Math.fround(1 / 120), 40, 30, 0, 100, 0.5, 0.25, 0]);
  const b = lire(effet.emetteurs[1], 7);
  assert.deepEqual([b.u[6], b.f[10]], [1, P.MILIEU.ENCRE]);
  assert.deepEqual(Array.from(b.f.slice(12, 15)), effet.emetteurs[1].injecte.encre.absorbance.map(Math.fround));
  const c = lire(effet.emetteurs[2], 7);
  assert.deepEqual([c.u[6], c.f[8], c.f[10]], [2, 1, P.MILIEU.ENCRE]);
  const code = P.codeDepots();
  assert.match(code, /@compute @workgroup_size\(64\)\s*fn deposer\(/);
  assert.match(code, /atomicAdd\(&depots\[b\], entier\(D\.quantites\.x \* D\.dt\)\)/);
  assert.doesNotMatch(code, /atomic<f32>/);
});

test('structures couplées : mot MILIEU du bloc, force « milieu » de la structure, exposition dans « rot », variante du noyau', () => {
  const effet = compiler([{ nom: 'd', structure: { type: 'tissu', resolution: [6, 4], milieu: { coef: 2 } }, forces: [{ type: 'gravite', valeur: 20 }] }]);
  const em = effet.emetteurs[0];
  const u = P.emballerStructure(em, effet, false, 10, Mm.liens(6, 4), null);
  const f = new Float32Array(u.buffer);
  assert.equal(P.MOTS_STRUCTURE.MILIEU, 293);
  assert.equal(u[293], 1);
  assert.deepEqual([u[11], u[72], u[80], f[82]], [2, 0, 7, 2], 'gravité, puis la poussée du milieu (code 7, coef 2)');
  const libre = compiler([{ nom: 'c', structure: { type: 'corde' } }]);
  assert.equal(P.emballerStructure(libre.emetteurs[0], libre, false, 10, Mm.liens(32, 1), null)[293], 0);
  const base = P.codeStructures(256);
  const vent = P.codeStructures(256, true);
  for (const code of [base, vent]) {
    assert.match(code, /fn expositionMilieu\(p: Particule\) -> f32 \{ return p\.rot; \}/);
    assert.ok(!code.includes(P.NEUTRE_EXPOSITION));
    assert.match(code, /fn exposer\(v: u32, base: u32, rp: Repos\)/);
    assert.match(code, /for \(var v = li; v < n; v \+= S_FILS\) \{ exposer\(v, base, rp\); \}\n  barriere\(\);/);
  }
  assert.doesNotMatch(base, /@binding\(24\)/);
  assert.match(vent, /@binding\(24\) var ventTex: texture_2d<f32>;/);
  assert.ok(!vent.includes(P.NEUTRE_VENT));
});
