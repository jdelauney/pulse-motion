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

const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/milieu.js'];

/** Code commun des pages : GPU, milieu seul dans un groupe, empreinte d'un état, grandeurs d'une grille. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 1600 / 9;
const ZONE = [0, 0, L, 100];
function ligne(cadres) { const t = new Float32Array(cadres.length * 8); cadres.forEach((r, i) => O.ecrireRepere(t, i * 8, r)); return t; }
/** Milieu seul dans un groupe couplé : état après le chemin de τ ; m : monde des obstacles ; reperes(g) : leurs repères. */
async function milieuApres(effet, chemin, m = null, reperes = () => new Float32Array(0)) {
  const milieu = new P.Milieu(device, effet, ZONE, m, effet.fin);
  const groupe = new P.Couplage(device, [{ membre: milieu, debut: 0 }]);
  for (const t of chemin) groupe.avancer(t, [{ reperes }]);
  const r = await milieu.lire();
  r.grille = milieu.grille;
  groupe.detruire();
  milieu.detruire();
  return r;
}
const empreinte = (u) => { let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const finis = (f) => f.every(Number.isFinite);
/** Centre de la cellule c (cqh). */
const centre = (g, c) => [g.origine[0] + (c % g.nx + 0.5) * g.cote, g.origine[1] + (Math.floor(c / g.nx) + 0.5) * g.cote];
/** Divergence (flux sortant) de la cellule (i, j) d'un champ de faces. */
function divergence(g, v, i, j) {
  const nu = (g.nx + 1) * g.ny;
  return v[j * (g.nx + 1) + i + 1] - v[j * (g.nx + 1) + i] + v[nu + (j + 1) * g.nx + i] - v[nu + j * g.nx + i];
}
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

// Fumée chaude au centre bas de la scène (cercle de 6 cqh, centre à y = 80).
const PANACHE = { resolution: 96, sources: [{ type: 'fumee', forme: { type: 'cercle', rayon: 6, decalage: [0, 30] }, debit: 4, temperature: 1 }] };

test('milieu GPU : la fumée chaude monte de sa source (panache centré, valeurs finies)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ effet: compiler(PANACHE) }, `
const e = await milieuApres(DONNEES.effet, [2]);
const g = e.grille;
let masse = 0, mx = 0, my = 0;
for (let c = 0; c < g.nx * g.ny; c++) {
  const f = e.scalaires[c * 8];
  const [x, y] = centre(g, c);
  masse += f; mx += f * x; my += f * y;
}
await envoyer({ webgpu: true, masse, x: mx / masse, y: my / masse, finis: finis(e.vitesse) && finis(e.scalaires) && finis(e.pression) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.finis, true, 'aucune valeur non finie');
  assert.ok(r.masse > 1, `fumée présente (${r.masse})`);
  assert.ok(r.y < 65, `centre de la fumée à y = ${r.y.toFixed(1)} : elle monte au-dessus de sa source (y = 80)`);
  assert.ok(Math.abs(r.x - L / 2) < 4, `panache centré (x = ${r.x.toFixed(1)})`);
});

test('milieu GPU : divergence quasi nulle après la projection (40 itérations de Jacobi, départ du pas précédent)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ effet: compiler(PANACHE) }, `
const e = await milieuApres(DONNEES.effet, [1.5]);
const g = e.grille;
let apres = 0, avant = 0, n = 0, v2 = 0;
for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
  const c = j * g.nx + i;
  if (e.solide[c * 4] > 0.5) continue;
  apres += divergence(g, e.vitesse, i, j) ** 2;
  avant += e.divergence[c] ** 2;
  n++;
}
for (const x of e.vitesse) v2 += x * x;
await envoyer({ webgpu: true, apres: Math.sqrt(apres / n), avant: Math.sqrt(avant / n), vitesse: Math.sqrt(v2 / e.vitesse.length) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`divergence : ${r.avant.toFixed(4)} avant la projection, ${r.apres.toFixed(4)} après ; vitesse ${r.vitesse.toFixed(3)} cqh/s`);
  assert.ok(r.vitesse > 0.5, 'le fluide bouge');
  assert.ok(r.apres <= 0.3 * r.avant, `divergence réduite à ${(r.apres / r.avant * 100).toFixed(1)} % par la projection`);
  assert.ok(r.apres <= 0.05 * r.vitesse, `divergence résiduelle ${(r.apres / r.vitesse * 100).toFixed(2)} % de la vitesse`);
});

test('milieu GPU : même état au bit près par deux chemins (instantanés, pression et dépôts compris)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ effet: compiler(PANACHE, 3) }, `
const a = await milieuApres(DONNEES.effet, [1, 2]);
const b = await milieuApres(DONNEES.effet, [2.5, 1.7, 2]);
const c = await milieuApres(DONNEES.effet, [2]);
await envoyer({ webgpu: true, a: empreinte(a.etat), b: empreinte(b.etat), c: empreinte(c.etat), n: a.etat.length });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.n > 1000);
  assert.equal(r.a, r.b, 'retour en arrière : même état');
  assert.equal(r.a, r.c, 'chemin direct : même état');
});

/** Monde d'un obstacle « élément » (boîte) : table de P3 et repères (bords fixes, puis l'élément donné par cadre(g)). */
const MONDE = `
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [{ scene: 's', genre: 'element', video: false, index: 0 }] });
const fixes = table.entrees.map((e) => (e.source.element ? null : O.repereFixe(e.source, L, table.sol)));
const monde = { entrees: table.entrees, largeurCqh: L, actif: true };
const reperesDe = (cadre) => (g) => ligne(fixes.map((r) => r || cadre(g)));
`;

test('milieu GPU : la fumée contourne une boîte (rien dedans, présente de chaque côté et au-dessus)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ effet: compiler(PANACHE) }, MONDE + `
// Boîte de 24 × 8 cqh au-dessus de la source (y de 51 à 59).
const boite = { centre: [L / 2, 55], angle: 0, demi: [12, 4], echelle: [1, 1], actif: true };
const e = await milieuApres(DONNEES.effet, [2.5], monde, reperesDe(() => boite));
const g = e.grille;
let dedans = 0, pleines = 0, gauche = 0, droite = 0, dessus = 0, masse = 0;
for (let c = 0; c < g.nx * g.ny; c++) {
  const f = e.scalaires[c * 8];
  const [x, y] = centre(g, c);
  masse += f;
  const dansBoite = Math.abs(x - L / 2) <= 12 && Math.abs(y - 55) <= 4;
  if (e.solide[c * 4] > 0.5) { pleines++; dedans += f; }
  if (!dansBoite && y >= 51 && y <= 59 && x < L / 2 - 12 && x > L / 2 - 22) gauche += f;
  if (!dansBoite && y >= 51 && y <= 59 && x > L / 2 + 12 && x < L / 2 + 22) droite += f;
  if (Math.abs(x - L / 2) <= 12 && y < 48 && y > 20) dessus += f;
}
await envoyer({ webgpu: true, dedans, pleines, attendues: 24 * 8 / (g.cote * g.cote), gauche, droite, dessus, masse });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.dedans, 0, 'aucune fumée dans la boîte');
  assert.ok(Math.abs(r.pleines - r.attendues) <= 0.2 * r.attendues, `${r.pleines} cellules pleines pour ${r.attendues.toFixed(0)} attendues`);
  assert.ok(r.gauche > 0.01 * r.masse && r.droite > 0.01 * r.masse, `fumée de chaque côté de la boîte (${r.gauche.toFixed(2)}, ${r.droite.toFixed(2)} sur ${r.masse.toFixed(1)})`);
  assert.ok(r.dessus > 0, 'la fumée passe au-dessus de la boîte');
});

test('milieu GPU : une barre en rotation entraîne le fluide dans son sens (moment cinétique du signe de sa rotation)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ calme: compiler({ resolution: 96, vorticite: 0 }, 2) }, MONDE + `
// Barre de 40 × 3 cqh au centre de la scène, angle ± 3 rad/s ; fluide au repos, sans source.
const barre = (sens) => reperesDe((g) => ({ centre: [L / 2, 50], angle: sens * 3 * g / 30, demi: [20, 1.5], echelle: [1, 1], actif: true }));
async function moment(sens) {
  const e = await milieuApres(DONNEES.calme, [1], monde, barre(sens));
  const g = e.grille;
  const nu = (g.nx + 1) * g.ny;
  let l = 0;
  for (let c = 0; c < g.nx * g.ny; c++) {
    if (e.solide[c * 4] > 0.5) continue;
    const i = c % g.nx, j = Math.floor(c / g.nx);
    const [x, y] = centre(g, c);
    const dx = x - L / 2, dy = y - 50;
    if (dx * dx + dy * dy > 26 * 26) continue;
    const vx = 0.5 * (e.vitesse[j * (g.nx + 1) + i] + e.vitesse[j * (g.nx + 1) + i + 1]);
    const vy = 0.5 * (e.vitesse[nu + j * g.nx + i] + e.vitesse[nu + (j + 1) * g.nx + i]);
    l += dx * vy - dy * vx;
  }
  return l;
}
await envoyer({ webgpu: true, plus: await moment(1), moins: await moment(-1) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`moment cinétique du fluide : ${r.plus.toFixed(1)} (barre +3 rad/s), ${r.moins.toFixed(1)} (−3 rad/s)`);
  assert.ok(r.plus > 0 && r.moins < 0, 'le fluide tourne dans le sens de la barre');
  assert.ok(Math.abs(r.plus + r.moins) <= 0.1 * Math.abs(r.plus), 'sens opposés : moments opposés (symétrie)');
});

test('milieu GPU : même état au bit près par deux chemins avec un obstacle qui bouge', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ effet: compiler(PANACHE, 3) }, MONDE + `
// Boîte qui glisse de 15 cqh/s vers la droite en tournant de 1 rad/s.
const mobile = reperesDe((g) => ({ centre: [60 + 15 * g / 30, 55], angle: g / 30, demi: [10, 4], echelle: [1, 1], actif: true }));
const a = await milieuApres(DONNEES.effet, [1, 2], monde, mobile);
const b = await milieuApres(DONNEES.effet, [2.5, 1.2, 2], monde, mobile);
await envoyer({ webgpu: true, a: empreinte(a.etat), b: empreinte(b.etat) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.a, r.b);
});
