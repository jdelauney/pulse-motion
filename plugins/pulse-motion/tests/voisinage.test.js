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
  assert.equal(new Uint32Array(gr.buffer)[8], 2 * R.ITERATIONS_GRAINS, 'grains : 2 × ITERATIONS_GRAINS itérations');
  assert.deepEqual(Array.from(gr.slice(12, 17)), [0.6, 0.4, 0.3, 0.1, 2].map(f32));
  assert.equal(P.iterationsGroupe(effet.groupes[0], membres(0)), 0);
});

test('voisinage : WGSL du module (noyaux et liaisons)', () => {
  for (const nom of ['effacer', 'noter', 'rassembler', 'prefixe', 'ranger', 'trier']) assert.match(P.WGSL_VOISINAGE, new RegExp('fn ' + nom + '\\('), nom);
  assert.match(P.WGSL_GROUPE, /struct Corps \{ pos: vec2f, vel: vec2f, rayon: f32, membre: u32, n: u32, r0: u32 \}/);
  assert.match(P.WGSL_VOISINAGE, /atomicAdd\(&comptes\[cle\], 1u\)/, 'comptage en entiers atomiques');
  assert.doesNotMatch(P.WGSL_VOISINAGE, /atomic<f32>/, 'aucune somme atomique en flottant');
});

const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js'];
const AUCUN = 0xffffffff;

/** Vérifie un voisinage lu : débuts croissants, cellules triées par indice, chaque corps vivant de la grille (cellule non
 *  pleine) rangé une fois dans sa cellule, cellule recalculée depuis la position. -> nombre de corps rangés. */
function verifier(v) {
  const { grille, cles, debuts, ordre, corps, corpsU } = v;
  assert.equal(debuts.length, grille.n + 1);
  const vus = new Set();
  let ranges = 0;
  for (let c = 0; c < grille.n; c++) {
    assert.ok(debuts[c + 1] >= debuts[c], 'débuts croissants');
    const tranche = ordre.slice(debuts[c], debuts[c + 1]);
    if (tranche.length > P.PLEINE) {
      assert.ok(tranche.every((i) => i === AUCUN), `cellule ${c} pleine : ignorée`);
      continue;
    }
    tranche.forEach((i, k) => {
      assert.equal(cles[i], c, `corps ${i} rangé dans sa cellule`);
      if (k) assert.ok(i > tranche[k - 1], `cellule ${c} triée par indice`);
      vus.add(i);
    });
    ranges += tranche.length;
  }
  assert.equal(debuts[grille.n], cles.filter((c) => c !== AUCUN).length, 'total = corps dans la grille');
  for (let i = 0; i < cles.length; i++) {
    if (corpsU[i * 8 + 5] === AUCUN) { assert.equal(cles[i], AUCUN, `corps ${i} mort : sans cellule`); continue; }
    if (cles[i] === AUCUN) { assert.ok(!vus.has(i)); continue; }
    const plein = debuts[cles[i] + 1] - debuts[cles[i]] > P.PLEINE;
    assert.equal(vus.has(i), !plein, `corps ${i} rangé une fois`);
    const qx = (corps[i * 8] - grille.origine[0]) / grille.cote;
    const qy = (corps[i * 8 + 1] - grille.origine[1]) / grille.cote;
    if (Math.abs(qx - Math.round(qx)) > 1e-3 && Math.abs(qy - Math.round(qy)) > 1e-3) {
      assert.equal(cles[i], Math.floor(qy) * grille.nx + Math.floor(qx), `cellule du corps ${i}`);
    }
  }
  return ranges;
}

test('voisinage GPU : tri par cellule correct et stable, corps hors de la grille ignorés, cellule pleine, même voisinage par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const essaim = (avec) => ({ type: 'essaim', rayon: 2, vision: { rayon: 6 }, avec });
  const effet = compiler([
    { nom: 'a', naissance: { salves: [{ t: 0, nombre: 1500 }], forme: { type: 'rectangle' }, vitesse: { cone: 360, valeur: [0, 10] }, vie: [5, 5] }, interactions: essaim(['c']) },
    { nom: 'loin', naissance: { salves: [{ t: 0, nombre: 200 }], forme: { type: 'rectangle', decalage: [-200, 0] }, vie: [5, 5] }, interactions: essaim(['a']) },
    { nom: 'c', naissance: { salves: [{ t: 0.2, nombre: 300 }], forme: { type: 'rectangle' }, vitesse: { cone: 360, valeur: [0, 10] }, vie: [5, 5] }, interactions: essaim([]) },
    { nom: 'seul', naissance: { salves: [{ t: 0, nombre: 200 }], forme: { type: 'point' }, vie: [5, 5] }, interactions: essaim([]) },
  ]);
  assert.deepEqual(effet.groupes.map((g) => g.membres), [[0, 1, 2], [3]]);
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: effet, code: `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const zones = { a: () => [50, 30, 60, 40], grille: () => [50, 30, 60, 40] };
async function voisinage(chemin, g) {
  const sim = new P.Simulation(device, DONNEES, null, null, 177.78);
  for (const t of chemin) sim.avancer(t, zones);
  const v = await sim.lireVoisinage(g);
  const etats = [];
  for (let i = 0; i < DONNEES.emetteurs.length; i++) etats.push(Array.from(new Uint32Array((await sim.lireEtat(i)).buffer)));
  const groupes = sim.groupes.map((x) => !!x);
  sim.detruire();
  return { corps: Array.from(v.corps), corpsU: Array.from(new Uint32Array(v.corps.buffer)), cles: Array.from(v.cles), debuts: Array.from(v.debuts),
    ordre: Array.from(v.ordre), grille: v.grille, membres: v.membres, etats, groupes };
}
const A = await voisinage([0.5], 0);
const B = await voisinage([0.3, 0.9, 0.5], 0);
const S = await voisinage([1.5 / 120], 1);
const egal = JSON.stringify([A.cles, A.debuts, A.ordre, A.etats]) === JSON.stringify([B.cles, B.debuts, B.ordre, B.etats]);
delete A.etats; delete B.etats; delete S.etats;
await envoyer({ webgpu: true, A, S, egal });` }), { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const { A, S } = r;
  assert.deepEqual(A.groupes, [true, true]);
  assert.equal(r.egal, true, 'même voisinage et même état au bit près par deux chemins (retour en arrière compris)');
  assert.deepEqual(A.membres, [{ emetteur: 0, base: 0, capacite: 1500 }, { emetteur: 1, base: 1500, capacite: 200 }, { emetteur: 2, base: 1700, capacite: 300 }]);
  assert.equal(A.grille.cote, 6);
  assert.equal(verifier(A), 1800, 'a et c rangés (cellules de moins de 96 corps), loin hors de la grille');
  for (let i = 1500; i < 1700; i++) {
    assert.notEqual(A.corpsU[i * 8 + 5], AUCUN, `corps ${i} de « loin » vivant`);
    assert.equal(A.cles[i], AUCUN, `corps ${i} de « loin » hors de la grille`);
  }
  for (let i = 1700; i < 2000; i++) assert.equal(A.corpsU[i * 8 + 5], 2, '« c », né à 0,2 s : rang 2 du groupe');
  // Salve née en un point : une cellule de 200 corps, pleine, vidée.
  verifier(S);
  const pleines = [];
  for (let c = 0; c < S.grille.n; c++) if (S.debuts[c + 1] - S.debuts[c] > P.PLEINE) pleines.push(S.debuts[c + 1] - S.debuts[c]);
  assert.deepEqual(pleines, [200]);
});
