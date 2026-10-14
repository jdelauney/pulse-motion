'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js'];

function compiler(emetteurs, dur = 1) {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 7, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

/** Code commun des pages : GPU, lecture des particules, monde d'obstacles déclarés, état après un chemin de τ. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
const lireP = (f) => { const u = new Uint32Array(f.buffer); const l = [];
  for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ n: u[s * 16 + 12], x: f[s * 16], y: f[s * 16 + 1], vx: f[s * 16 + 4], vy: f[s * 16 + 5], taille: f[s * 16 + 7] });
  return l; };
/** Monde des collisions : obstacles déclarés (propres) et sol de la recette ; repère d'un élément donné par cadre(g). */
function monde(propres, sol, cadre) {
  const table = O.construireTable({ largeurCqh: L, solRecette: sol, propres });
  const reperes = (g) => {
    const t = new Float32Array(table.entrees.length * 8);
    table.entrees.forEach((e, i) => O.ecrireRepere(t, i * 8, e.source.element ? cadre(g) : O.repereFixe(e.source, L, table.sol)));
    return t;
  };
  return { m: { entrees: table.entrees, largeurCqh: L, actif: true }, reperes };
}
/** État de chaque émetteur après le chemin de τ : particules vivantes et mots bruts (comparaison au bit près). */
async function etat(effet, zones, chemin, m = null) {
  const sim = new P.Simulation(device, effet, m, null, L);
  for (const t of chemin) sim.avancer(t, zones);
  const r = [];
  for (let i = 0; i < effet.emetteurs.length; i++) {
    const f = await sim.lireEtat(i);
    r.push({ p: lireP(f), brut: new Uint32Array(f.buffer) });
  }
  sim.detruire();
  return r;
}
const memes = (a, b) => a.length === b.length && a.every((x, i) => x.brut.length === b[i].brut.length && x.brut.every((w, k) => w === b[i].brut[k]));
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const centre = (p) => [p.reduce((s, q) => s + q.x, 0) / p.length, p.reduce((s, q) => s + q.y, 0) / p.length];
function distanceMin(p) {
  let d = Infinity;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) d = Math.min(d, Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y));
  return d;
}

test('interactions GPU : essaim : distances gardées, convergence vers la cible, vitesse bornée, même état au bit près par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const nuee = compiler([{ nom: 'n', naissance: { salves: [{ t: 0, nombre: 300 }], forme: { type: 'rectangle' }, vitesse: { cone: 360, valeur: [5, 15] }, vie: [20, 20], taille: [0.6, 0.6] },
    interactions: { type: 'essaim', rayon: 2, cible: [0.9, 0.2] } }]);
  const r = await page({ nuee }, `
const zones = { a: () => [50, 25, 60, 40], grille: () => [50, 25, 60, 40] };
const fin = await etat(DONNEES.nuee, zones, [6]);
const autre = await etat(DONNEES.nuee, zones, [2, 4.5, 3, 6]);
await envoyer({ webgpu: true, fin: fin[0].p, egal: memes(fin, autre) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.egal, true, 'même état au bit près par deux chemins (retour en arrière compris)');
  assert.equal(r.fin.length, 300);
  const d = distanceMin(r.fin);
  assert.ok(d >= 0.8, `distance minimale ${d.toFixed(3)} cqh (au moins 0,4 × rayon)`);
  for (const p of r.fin) {
    const v = Math.hypot(p.vx, p.vy);
    assert.ok(v >= 5 - 1e-3 && v <= 20 + 1e-3, `vitesse ${v} hors de [5, 20]`);
  }
  // Cible : zone [50, 25, 60, 40] × (0,9 ; 0,2) = (104, 33) ; départ centré en (80, 45).
  const [cx, cy] = centre(r.fin);
  assert.ok(Math.hypot(cx - 104, cy - 33) < 6, `centre de la nuée (${cx.toFixed(1)}, ${cy.toFixed(1)}) loin de la cible (104, 33)`);
});

test('interactions GPU : essaim et obstacle (P3) : aucun oiseau dans la boîte, la nuée la contourne jusqu\'à sa cible', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const nuee = compiler([{ nom: 'n', naissance: { salves: [{ t: 0, nombre: 200 }], forme: { type: 'rectangle' }, vitesse: { cone: 360, valeur: [5, 15] }, vie: [20, 20], taille: [0.6, 0.6] },
    collisions: { cibles: ['elements'], restitution: 0.5, frottement: 0 },
    interactions: { type: 'essaim', rayon: 2, cible: [1.8, 0.5], fuite: 40 } }]);
  const r = await page({ nuee }, `
const BOITE = { centre: [75, 45], angle: 0, demi: [3, 10], echelle: [1, 1], actif: true };
const { m, reperes } = monde([{ scene: 's', genre: 'element', video: false, index: 0 }], null, () => BOITE);
const zones = { a: () => [40, 30, 30, 30], grille: () => [40, 30, 30, 30], reperes };
const etats = {};
for (const tau of [1, 2, 3, 4, 6]) etats[tau] = (await etat(DONNEES.nuee, zones, [tau], m))[0].p;
await envoyer({ webgpu: true, etats });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  for (const [tau, p] of Object.entries(r.etats)) {
    assert.equal(p.length, 200, `τ = ${tau}`);
    const dedans = p.filter((q) => Math.abs(q.x - 75) < 3 + 0.25 && Math.abs(q.y - 45) < 10 + 0.25);
    assert.deepEqual(dedans, [], `τ = ${tau} : oiseaux dans l'obstacle`);
  }
  // Cible : zone [40, 30, 30, 30] × (1,8 ; 0,5) = (94, 45), derrière la boîte.
  const [cx, cy] = centre(r.etats[6]);
  assert.ok(Math.hypot(cx - 94, cy - 45) < 8, `centre (${cx.toFixed(1)}, ${cy.toFixed(1)}) loin de la cible (94, 45)`);
});

/** Densité PBF de chaque particule (même noyau que le GPU) : 1 + Σ (1 − (r/h)²)³ sur les voisines à moins de h. */
function densites(p, h) {
  return p.map((a) => {
    let rho = 1;
    for (const b of p) {
      if (b === a) continue;
      const q = Math.hypot(a.x - b.x, a.y - b.y) / h;
      if (q < 1) rho += (1 - q * q) ** 3;
    }
    return rho;
  });
}

test('interactions GPU : fluide : même état au bit près par deux chemins (émetteurs liés), goutte incompressible et cohérente', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const goutte = (nom, avec, nombre) => ({ nom, naissance: { salves: [{ t: 0, nombre }], forme: { type: 'rectangle' }, vie: [10, 10], taille: [0.8, 0.8] },
    interactions: { type: 'fluide', rayon: 2, densite: 6, viscosite: 0.1, tension: 0.3, avec } });
  const fluide = compiler([goutte('a', ['b'], 225), goutte('b', [], 75)]);
  // 300 particules sur 20 × 10 cqh : 1,5 par cqh², la densité au repos (6 par cellule de 2 × 2).
  const r = await page({ fluide }, `
const zones = { a: () => [70, 40, 20, 10], grille: () => [70, 40, 20, 10] };
const fin = await etat(DONNEES.fluide, zones, [1]);
const autre = await etat(DONNEES.fluide, zones, [0.4, 1.3, 0.6, 1]);
await envoyer({ webgpu: true, p: fin[0].p.concat(fin[1].p), egal: memes(fin, autre) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.egal, true, 'même état au bit près par deux chemins (retour en arrière compris)');
  assert.equal(r.p.length, 300);
  const rho0 = fluide.emetteurs[0].interactions.rho0;
  const max = Math.max(...densites(r.p, 2));
  assert.ok(max <= 1.15 * rho0, `densité maximale ${(max / rho0).toFixed(3)} ρ0 (incompressibilité)`);
  assert.ok(distanceMin(r.p) >= 0.1, 'aucun amas de particules confondues (répulsion artificielle)');
  const [cx, cy] = centre(r.p);
  const proches = r.p.filter((q) => Math.hypot(q.x - cx, q.y - cy) < 15).length;
  assert.ok(proches >= 240, `${proches} particules à moins de 15 cqh du centre : la goutte tient (tension)`);
});

test('interactions GPU : fluide au repos dans une cuve (P3) : densité à 2 % près, aucune particule dans les parois', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const eau = compiler([{ nom: 'eau', naissance: { salves: [{ t: 0, nombre: 1200 }], forme: { type: 'rectangle' }, vie: [30, 30], taille: [1, 1] },
    forces: [{ type: 'gravite', valeur: 40 }],
    collisions: { cibles: ['sol', 'elements'], restitution: 0, frottement: 0.05 },
    interactions: { type: 'fluide', rayon: 2, densite: 6, viscosite: 0.1, tension: 0.1, incompressibilite: 4 } }]);
  // Cuve : parois verticales en x = 60 et x = 100 (de y = 40 à 90), sol de la recette en y = 90.
  const r = await page({ eau }, `
const CUVE = [{ scene: 's', genre: 'ligne', video: false, de: [60, 40], a: [60, 90] }, { scene: 's', genre: 'ligne', video: false, de: [100, 40], a: [100, 90] }];
const { m, reperes } = monde(CUVE, 90);
const zones = { a: () => [61, 52, 38, 36], grille: () => [61, 52, 38, 36], reperes };
const fin = await etat(DONNEES.eau, zones, [5], m);
await envoyer({ webgpu: true, p: fin[0].p });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.p.length, 1200);
  for (const q of r.p) {
    assert.ok(q.x >= 60.5 - 0.05 && q.x <= 99.5 + 0.05, `x = ${q.x} : dans une paroi`);
    assert.ok(q.y <= 89.5 + 0.05, `y = ${q.y} : sous le sol`);
  }
  const vitesse = r.p.reduce((s, q) => s + Math.hypot(q.vx, q.vy), 0) / r.p.length;
  assert.ok(vitesse < 2, `vitesse moyenne ${vitesse.toFixed(2)} cqh/s : au repos`);
  const rho0 = eau.emetteurs[0].interactions.rho0;
  const rho = densites(r.p, 2);
  const haut = Math.min(...r.p.map((q) => q.y));
  const interieur = r.p.map((q, i) => [q, rho[i]]).filter(([q]) => q.x >= 64 && q.x <= 96 && q.y >= haut + 2 && q.y <= 87.5);
  assert.ok(interieur.length >= 150, `${interieur.length} particules à l'intérieur`);
  const moyenne = interieur.reduce((s, x) => s + x[1], 0) / interieur.length;
  assert.ok(Math.abs(moyenne / rho0 - 1) <= 0.02, `densité au repos ${(moyenne / rho0).toFixed(4)} ρ0 (à 2 % près)`);
});
