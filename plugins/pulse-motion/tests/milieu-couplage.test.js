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
