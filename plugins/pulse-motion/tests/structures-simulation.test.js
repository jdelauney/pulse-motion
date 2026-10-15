'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const Mm = require('../moteur/particules/maillage.js');

// Modules navigateur chargés sous Node (fonctions pures seulement : aucun appel au GPU au chargement).
require('../moteur/particules/simulation.js');
require('../moteur/particules/structures.js');
const P = globalThis.M.particulesInterne;

function compiler(emetteurs, dur = 3) {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 7, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

test('structures : bloc de paramètres (en-tête de l\'émetteur, en-tête de la structure, attaches, sommets tenus, liens par couleur)', () => {
  const effet = compiler([{ nom: 't', naissance: { masse: 2, z: 0.25 }, structure: { type: 'tissu', resolution: [4, 3], raideur: 0.8, flexion: 0, amortissement: 0.5, dechirure: 1.5, epaisseur: 0.6,
    attaches: [{ ou: 'haut', a: 'ancre' }, { ou: 11, a: [0.5, 1], lacher: 1 }] }, forces: [{ type: 'gravite', valeur: 40 }] }]);
  const em = effet.emetteurs[0];
  const liens = Mm.liens(4, 3);
  const u = P.emballerStructure(em, effet, false, 10, liens, null);
  const f = new Float32Array(u.buffer);
  const S = P.MOTS_STRUCTURE;
  assert.equal(liens.codes.length, 39);
  assert.equal(u.length, Math.ceil((348 + 39) / 4) * 4);
  assert.deepEqual(Array.from(u.slice(0, 256)), Array.from(new Uint32Array(P.emballerE(em, effet, false, 10, null))), 'en-tête E de l\'émetteur');
  assert.deepEqual(Array.from(u.slice(S.TYPE, S.LIENS + 1)), [1, 4, 3, 12, 2, 320, 336, 348]);
  assert.deepEqual(Array.from(u.slice(S.COUL, S.COUL + 13)), Array.from(liens.debuts));
  assert.equal(f[S.ALPHA], Math.fround(P.complianceStructure(0.8)));
  assert.equal(P.complianceStructure(1), 0, 'raideur 1 : lien rigide');
  assert.equal(f[S.ALPHA_B], -1, 'flexion 0 : aucune contrainte de flexion');
  assert.deepEqual([f[S.AMORTI], f[S.DECH], f[S.EPAIS], f[S.MASSE], f[S.DL], f[S.DL + 1], f[S.FIN], f[S.Z]], [5, 1.5, Math.fround(0.6), 2, -1, -1, 3, 0.25]);
  // Attaches : élément 0 (ancre) jamais lâchée ; point (0,5 ; 1) de la zone lâché à 1 s.
  assert.deepEqual([u[320], u[321], f[322]], [1, 0, -1]);
  assert.deepEqual([u[328], f[330], f[331], f[332]], [0, 1, 0.5, 1]);
  const A = 0xffffffff;
  assert.deepEqual(Array.from(u.slice(336, 348)), [0, 0, 0, 0, A, A, A, A, A, A, A, 1], 'première attache de chaque sommet');
  assert.deepEqual(Array.from(u.slice(348, 348 + 39)), Array.from(liens.codes));
  // Photographie (source « ancre ») : rectangle local de repos.
  const p = new Float32Array(P.emballerStructure(em, effet, false, 10, liens, { centreA: [1, -2], demiA: [10, 5] }).buffer);
  assert.deepEqual([p[S.CL], p[S.CL + 1], p[S.DL], p[S.DL + 1]], [1, -2, 10, 5]);
  // Flexion non nulle : compliance de flexion.
  const souple = compiler([{ nom: 'c', structure: { type: 'corde', resolution: 8, flexion: 0.25 } }]);
  const fc = new Float32Array(P.emballerStructure(souple.emetteurs[0], souple, false, 10, Mm.liens(8, 1), null).buffer);
  assert.equal(fc[S.ALPHA_B], Math.fround(P.complianceStructure(0.25)));
  assert.equal(new Uint32Array(fc.buffer)[S.R], 1);
});

test('structures : WGSL du module (lecture du bloc par structure, noyau, liaisons)', () => {
  const code = P.codeStructures();
  assert.match(code, /fn ef\(i: u32\) -> f32 \{ return E\[baseE \+ i\]; \}/);
  assert.match(code, /fn eu\(i: u32\) -> u32 \{ return bitcast<u32>\(E\[baseE \+ i\]\); \}/);
  assert.doesNotMatch(code, /return E\[i\];/, 'plus aucune lecture hors du bloc');
  assert.match(code, /@compute @workgroup_size\(256\)\s*fn structures\(/);
  for (const nom of ['initialiserSommet', 'predire', 'resoudreLien', 'vitesseSommet', 'cibleAttache', 'reposStructure', 'contactsStructure']) assert.match(code, new RegExp('fn ' + nom + '\\('), nom);
  for (const b of [15, 16, 17, 18, 19, 20, 21, 22]) assert.match(code, new RegExp('@binding\\(' + b + '\\)'), 'liaison ' + b);
  assert.doesNotMatch(code, /atomic<f32>/);
  assert.equal(P.STRUCTURES_MAX, R.STRUCTURES_EFFET_MAX);
});
