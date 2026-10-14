'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

// Modules navigateur chargés sous Node (fonctions pures seulement : aucun appel au GPU au chargement).
require('../moteur/particules/simulation.js');
require('../moteur/particules/voisinage.js');
const P = globalThis.M.particulesInterne;

const f32 = Math.fround;

function compiler(emetteurs, dur = 2) {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 5, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

test('voisinage : grille fixe = scène élargie de 25 % de chaque côté, un million de cellules au plus', () => {
  assert.deepEqual(P.grilleInteractions(177.78, 2), { origine: [-0.25 * 177.78, -25], cote: 2, nx: 134, ny: 75, n: 10050 });
  assert.deepEqual(P.grilleInteractions(56.25, 6), { origine: [-0.25 * 56.25, -25], cote: 6, nx: 15, ny: 25, n: 375 });
  assert.equal(P.grilleInteractions(177.78, 0.25).n, 1067 * 600, 'rayon minimal du plan 1 : sous la limite');
  assert.throws(() => P.grilleInteractions(177.78, 0.1), /grille de voisinage de 4000500 cellules, au-delà de 1048576 : augmenter « rayon »/);
  assert.equal(P.PLEINE, 96);
  assert.equal(P.CELLULES_MAX, 1 << 20);
});

test('voisinage : uniforme « Groupe » (grille, membres, paramètres de chaque type, itérations)', () => {
  const effet = compiler([
    { nom: 'a', naissance: { salves: [{ t: 0, nombre: 50 }] }, interactions: { type: 'essaim', avec: ['b'], cible: [0.25, 0.75], vision: { rayon: 6, angle: 270 } } },
    { nom: 'b', naissance: { salves: [{ t: 0, nombre: 20 }] }, interactions: { type: 'essaim', rayon: 3 } },
    { nom: 'f', naissance: { salves: [{ t: 0, nombre: 10 }] }, interactions: { type: 'fluide', incompressibilite: 5 } },
    { nom: 'g', naissance: { salves: [{ t: 0, nombre: 10 }] }, interactions: { type: 'grains', cohesion: 0.3 } },
  ]);
  const membres = (g) => effet.groupes[g].membres.map((i, r, l) => ({ em: effet.emetteurs[i], base: l.slice(0, r).reduce((s, j) => s + effet.emetteurs[j].capacite, 0), capacite: effet.emetteurs[i].capacite }));
  const grille = P.grilleInteractions(177.78, effet.groupes[0].cote);
  const b = P.emballerGroupe(effet.groupes[0], membres(0), grille, 70);
  assert.equal(b.byteLength, 560);
  const f = new Float32Array(b);
  const u = new Uint32Array(b);
  assert.deepEqual([f[0], f[1], f[2]], [f32(-44.445), -25, 6]);
  assert.deepEqual(Array.from(u.slice(3, 10)), [grille.n, 45, 25, 70, 0, 0, 2]);
  assert.deepEqual(Array.from(f.slice(12, 24)), [1.5, 1, 1, 30, 6, Math.cos(135 * Math.PI / 180), 5, 20, 0.25, 0.75, 1, 2].map(f32));
  assert.deepEqual(Array.from(u.slice(24, 27)), [0, 50, 0]);
  assert.deepEqual(Array.from(f.slice(28, 40)), [1.5, 1, 1, 30, 6, Math.cos(135 * Math.PI / 180), 5, 20, 0, 0, 0, 3].map(f32), 'sans cible : drapeau 0');
  assert.deepEqual(Array.from(u.slice(40, 43)), [50, 20, 0]);
  const fl = new Float32Array(P.emballerGroupe(effet.groupes[1], membres(1), P.grilleInteractions(177.78, 2), 10));
  assert.equal(new Uint32Array(fl.buffer)[8], 10, 'fluide : 2 × incompressibilité');
  assert.deepEqual(Array.from(fl.slice(12, 17)), [effet.emetteurs[2].interactions.rho0, 0.05, 0.1, 5, 2].map(f32));
  const gr = new Float32Array(P.emballerGroupe(effet.groupes[2], membres(2), P.grilleInteractions(177.78, 2), 10));
  assert.equal(new Uint32Array(gr.buffer)[8], 2 * R.ITERATIONS_GRAINS, 'grains : 2 × 3 itérations');
  assert.deepEqual(Array.from(gr.slice(12, 17)), [0.6, 0.4, 0.3, 0.1, 2].map(f32));
  assert.equal(P.iterationsGroupe(effet.groupes[0], membres(0)), 0);
});

test('voisinage : WGSL du module (noyaux et liaisons)', () => {
  for (const nom of ['effacer', 'noter', 'rassembler', 'prefixe', 'ranger', 'trier']) assert.match(P.WGSL_VOISINAGE, new RegExp('fn ' + nom + '\\('), nom);
  assert.match(P.WGSL_GROUPE, /struct Corps \{ pos: vec2f, vel: vec2f, rayon: f32, membre: u32, n: u32, r0: u32 \}/);
  assert.match(P.WGSL_VOISINAGE, /atomicAdd\(&comptes\[cle\], 1u\)/, 'comptage en entiers atomiques');
  assert.doesNotMatch(P.WGSL_VOISINAGE, /atomic<f32>/, 'aucune somme atomique en flottant');
});
