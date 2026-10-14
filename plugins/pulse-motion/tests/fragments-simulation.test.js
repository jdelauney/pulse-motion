'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js'];
const ZERO = { type: 'turbulence', force: 0 };

function compiler(emetteurs, dur = 2) {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 5, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

/** Code commun des pages : GPU, photographie de synthèse, repères des éléments, lecture des particules. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const F = M.fragments;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
function photo(Lx, Hy, couleur, largeurCqh = Lx, hauteurCqh = Hy) {
  const rgba = new Uint8ClampedArray(Lx * Hy * 4);
  for (let y = 0; y < Hy; y++) for (let x = 0; x < Lx; x++) rgba.set(couleur(x, y), (y * Lx + x) * 4);
  return { largeur: Lx, hauteur: Hy, rgba, largeurCqh, hauteurCqh };
}
/** Repères de l'ancre (a) et de l'élément visé (b), fonctions du point de grille g. */
function ancres(a, b = a) { return (g) => { const t = new Float32Array(16); O.ecrireRepere(t, 0, a(g)); O.ecrireRepere(t, 8, b(g)); return t; }; }
const lireP = (f) => { const u = new Uint32Array(f.buffer); const l = [];
  for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ s, n: u[s * 16 + 12], x: f[s * 16], y: f[s * 16 + 1], age: f[s * 16 + 3],
    vx: f[s * 16 + 4], vy: f[s * 16 + 5], taille: f[s * 16 + 7], rot: f[s * 16 + 9], vrot: f[s * 16 + 10] });
  return l; };
async function etat(effet, fragments, zones, chemin, monde = null) {
  const sim = new P.Simulation(device, effet, monde, fragments);
  for (const t of chemin) sim.avancer(t, zones);
  const r = { p: lireP(await sim.lireEtat(0)), rapide: sim.emetteurs[0].rapide };
  sim.detruire();
  return r;
}
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code })));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const pres = (a, b, tol, quoi = '') => assert.ok(Math.abs(a - b) <= tol, `${quoi} ${a} au lieu de ${b} (± ${tol})`);

test('fragments GPU : grains nés sur leurs pixels, tenus jusqu\'à leur libération (de gauche à droite), voie rapide = voie simulée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const grain = (forces) => ({ nom: 'g', naissance: { forme: { type: 'pixels', liberation: 1, ordre: 'gauche-droite' }, vie: [5, 5] }, forces });
  const rapide = compiler([grain([{ type: 'gravite', valeur: 40 }])]);
  const simulee = compiler([grain([{ type: 'gravite', valeur: 40 }, ZERO])]);
  const r = await page({ rapide, simulee }, `
// Photo de 8 × 4 pixels de 1 cqh ; ancre centrée en (60, 40), tournée de 90° : local (x, y) -> monde (60 − y, 40 + x).
const liste = F.listerPixels(photo(8, 4, (x, y) => [x * 30, y * 60, 0, 255]));
const frag = { a: F.permuter(liste, F.pasPremier(liste.total, 5)).donnees, b: null, eclats: null, image: null,
  demiA: liste.demi, demiB: [0, 0], coteA: liste.cote, coteB: 0 };
const zonesDe = (repere) => ({ a: () => [56, 38, 8, 4], grille: () => [56, 38, 8, 4], ancres: ancres(repere) });
const fixe = zonesDe(() => ({ centre: [60, 40], angle: Math.PI / 2, demi: [4, 2], echelle: [1, 1], actif: true }));
const glisse = zonesDe((g) => ({ centre: [60 + 10 * g / 30, 40], angle: Math.PI / 2, demi: [4, 2], echelle: [1, 1], actif: true }));
const ajuste = (e) => F.ajusterCapacites(e, { 0: liste.total });
const etats = {};
for (const [nom, effet, zones, tau] of [['R', DONNEES.rapide, fixe, 0.5], ['S', DONNEES.simulee, fixe, 0.5], ['R2', DONNEES.rapide, fixe, 1.5],
  ['S2', DONNEES.simulee, fixe, 1.5], ['G', DONNEES.simulee, glisse, 0.5], ['D', DONNEES.simulee, fixe, 1.5 / 120]]) {
  etats[nom] = await etat(ajuste(effet), [frag], zones, [tau]);
}
await envoyer({ webgpu: true, a: Array.from(frag.a), etats });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const { R: Rr, S, R2, S2, G, D } = r.etats;
  assert.deepEqual([Rr.rapide, S.rapide], [true, false]);
  const local = (n) => [r.a[n * 4], r.a[n * 4 + 1]];
  const monde = (n, cx = 60) => { const [x, y] = local(n); return [cx - y, 40 + x]; };
  // Libération : un pas de tenue, puis de gauche à droite sur 1 s (rang = x / 8 + 0,5).
  const lib = (n) => 1 / 120 + (local(n)[0] / 8 + 0.5);
  // Pas 1 : tous tenus exactement sur leur pixel, tournés et à la taille du pixel (raccord).
  assert.equal(D.p.length, 32);
  for (const p of D.p) {
    const [x, y] = monde(p.n);
    pres(p.x, x, 1e-4, 'x tenu'); pres(p.y, y, 1e-4, 'y tenu');
    pres(p.rot, Math.PI / 2, 1e-5, 'angle'); pres(p.taille, 1, 1e-6, 'taille');
    assert.equal(p.age, 0, 'un grain tenu ne vieillit pas');
  }
  // τ = 0,5 : grains de droite encore tenus ; ceux de gauche tombent depuis leur libération (voie rapide : exact).
  assert.equal(Rr.p.length, 32);
  for (const p of Rr.p) {
    const [x, y] = monde(p.n);
    const l = lib(p.n);
    if (l >= 0.5) { pres(p.x, x, 1e-4); pres(p.y, y, 1e-4); assert.equal(p.age, 0); }
    else { pres(p.x, x, 1e-3); pres(p.y, y + 20 * (0.5 - l) ** 2, 2e-3, 'chute depuis la libération'); pres(p.age, 0.5 - l, 1e-4, 'âge'); }
  }
  // Voie simulée : départ à l'instant de libération, gravité intégrée exactement : comme la voie rapide.
  for (const [a, b] of [[S, Rr], [S2, R2]]) {
    assert.equal(a.p.length, 32);
    for (const p of a.p) {
      const q = b.p.find((x) => x.n === p.n);
      pres(p.x, q.x, 1e-3, 'x simulé'); pres(p.y, q.y, 5e-3, 'y simulé');
    }
  }
  // Ancre qui glisse : un grain tenu la suit (position et vitesse).
  for (const p of G.p.filter((x) => lib(x.n) >= 0.5)) {
    const [x, y] = monde(p.n, 65);
    pres(p.x, x, 1e-3, 'suit l\'ancre'); pres(p.y, y, 1e-3);
    pres(p.vx, 10, 1e-2, 'vitesse de l\'ancre');
  }
});
