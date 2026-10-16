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

const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js',
  'particules/maillage.js', 'particules/structures.js', 'particules/milieu.js'];

/** Code commun des pages : GPU, groupe couplé (effets puis milieu), lecture des particules et de la grille. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 1600 / 9;
const ZONE = [0, 0, L, 100];
const boite = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2, 0, 1, b[2] / 2, b[3] / 2, 1, 1];
const zonesDe = (z) => ({ a: () => z, grille: () => z, attaches: () => new Float32Array(boite(z)) });
function ligne(cadres) { const t = new Float32Array(cadres.length * 8); cadres.forEach((r, i) => O.ecrireRepere(t, i * 8, r)); return t; }
const lireP = (f) => { const u = new Uint32Array(f.buffer); const l = [];
  for (let s = 0; s < f.length / 16; s++) l.push({ x: f[s * 16], y: f[s * 16 + 1], vx: f[s * 16 + 4], vy: f[s * 16 + 5], vivante: u[s * 16 + 14] });
  return l; };
const empreinte = (u) => { let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const finis = (l) => l.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy));
/** Groupe couplé : effets [{ effet, zone, debut? }] (debut : pas du groupe, 0 par défaut), milieu en dernier (au pas
 *  debutMilieu) ; état après le chemin de τ. m, reperes : obstacles du milieu (facultatifs). -> { effets: [[{ p, brut }]], milieu, grille } */
async function groupeApres(effetMilieu, effets, chemin, m = null, reperes = () => new Float32Array(0), debutMilieu = 0) {
  const milieu = new P.Milieu(device, effetMilieu, ZONE, m, effetMilieu.fin);
  const sims = effets.map((x) => new P.Simulation(device, x.effet, null, null, L, milieu));
  const groupe = new P.Couplage(device, sims.map((s, i) => ({ membre: s, debut: effets[i].debut || 0 })).concat([{ membre: milieu, debut: debutMilieu }]));
  const zones = effets.map((x) => zonesDe(x.zone)).concat([{ reperes }]);
  for (const t of chemin) groupe.avancer(t, zones);
  const r = { effets: [], milieu: await milieu.lire(), grille: milieu.grille };
  for (const s of sims) {
    const e = [];
    for (let i = 0; i < s.emetteurs.length; i++) {
      const f = await s.lireEtat(i);
      e.push({ p: lireP(f), brut: empreinte(new Uint32Array(f.buffer)) });
    }
    r.effets.push(e);
  }
  groupe.detruire();
  sims.forEach((s) => s.detruire());
  milieu.detruire();
  return r;
}
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('couplage GPU : braises emportées dans la direction du panache (force « milieu »), retombées sans couplage', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const milieu = compilerMilieu({ resolution: 96, flottaison: 1.5, sources: [{ type: 'fumee', forme: { type: 'cercle', rayon: 8, decalage: [0, 30] }, debit: 6, temperature: 1 }] });
  const braises = (coef) => compiler([{ nom: 'b', naissance: { debit: 80, forme: { type: 'rectangle' }, vie: [3, 3], taille: [0.3, 0.3] },
    forces: [{ type: 'gravite', valeur: 15 }, { type: 'milieu', coef }] }]);
  const r = await page({ milieu, couplees: braises(4), libres: braises(0) }, `
const zone = [L / 2 - 5, 72, 10, 10];
const stats = (e) => {
  const v = e.effets[0][0].p.filter((p) => p.vivante === 1);
  const moy = (k) => v.reduce((s, p) => s + p[k], 0) / v.length;
  return { n: v.length, vx: moy('vx'), vy: moy('vy'), y: moy('y'), finis: finis(v) };
};
const a = await groupeApres(DONNEES.milieu, [{ effet: DONNEES.couplees, zone }], [2]);
const b = await groupeApres(DONNEES.milieu, [{ effet: DONNEES.libres, zone }], [2]);
await envoyer({ webgpu: true, couplees: stats(a), libres: stats(b) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const { couplees: c, libres: l } = r;
  t.diagnostic(`braises couplées : vy ${c.vy.toFixed(1)}, vx ${c.vx.toFixed(1)}, y ${c.y.toFixed(1)} ; libres : vy ${l.vy.toFixed(1)}, y ${l.y.toFixed(1)}`);
  assert.ok(c.finis && l.finis && c.n > 100 && l.n > 100);
  assert.ok(c.vy < -5, 'couplées : elles montent avec le panache');
  assert.ok(Math.abs(c.vx) < 0.5 * Math.abs(c.vy), 'dans la direction du panache (vertical)');
  assert.ok(l.vy > 5, 'sans couplage : elles tombent');
  assert.ok(c.y < l.y - 10, 'couplées : plus haut dans l\'image');
});

test('couplage GPU : panache laissé par une particule injectrice (dépôts entiers : quantité exacte, le long du trajet, rien ailleurs)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // Milieu immobile (ni flottaison, ni dissipation, ni tourbillons) : la fumée déposée reste où elle est tombée.
  const milieu = compilerMilieu({ resolution: 96, flottaison: 0, dissipation: 0, refroidissement: 0, vorticite: 0 }, 2);
  const fusee = compiler([{ nom: 'f', naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vitesse: { direction: [1, 0], valeur: [60, 60] }, vie: [2, 2] },
    injecte: { fumee: 3 } }], 2);
  const r = await page({ milieu, fusee }, `
const e = await groupeApres(DONNEES.milieu, [{ effet: DONNEES.fusee, zone: [30, 50, 0, 0] }], [1.5]);
const g = e.grille;
let total = 0, ailleurs = 0, colonnesVides = 0, colonnes = 0;
const bande = new Float64Array(g.nx);
for (let c = 0; c < g.nx * g.ny; c++) {
  const f = e.milieu.scalaires[c * 8];
  const x = g.origine[0] + (c % g.nx + 0.5) * g.cote;
  const y = g.origine[1] + (Math.floor(c / g.nx) + 0.5) * g.cote;
  total += f;
  if (Math.abs(y - 50) < 3) bande[c % g.nx] += f; else ailleurs += f;
}
for (let i = 0; i < g.nx; i++) {
  const x = g.origine[0] + (i + 0.5) * g.cote;
  if (x < 36 || x > 112) continue;
  colonnes++;
  if (!(bande[i] > 0)) colonnesVides++;
}
await envoyer({ webgpu: true, total, ailleurs, colonnes, colonnesVides, fusee: e.effets[0][0].p[0] });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const attendu = 180 * Math.round(3 / 120 * 65536) / 65536;
  assert.ok(Math.abs(r.total - attendu) < 1e-3, `fumée déposée ${r.total.toFixed(4)}, attendue ${attendu.toFixed(4)} (180 pas)`);
  assert.equal(r.ailleurs, 0, 'rien hors du trajet');
  assert.ok(r.colonnes > 30 && r.colonnesVides === 0, `${r.colonnesVides} colonnes vides sur ${r.colonnes} le long du trajet`);
  assert.ok(Math.abs(r.fusee.x - 120) < 0.01, `fusée à x = ${r.fusee.x}`);
});

test('couplage GPU : un drapeau claque dans le souffle d\'un panache (structure.milieu), pend sans couplage', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // Panache chaud sous le drapeau : source à (82, 85) (centre de la scène + décalage).
  const milieu = compilerMilieu({ resolution: 96, flottaison: 2, sources: [{ type: 'chaleur', forme: { type: 'cercle', rayon: 10, decalage: [82 - 800 / 9, 35] }, debit: 10 }] });
  const drapeau = (couple) => compiler([{ nom: 'd', structure: { type: 'tissu', resolution: [12, 8], attaches: [{ ou: 'gauche', a: 'ancre' }], ...(couple ? { milieu: { coef: 3 } } : {}) },
    forces: [{ type: 'gravite', valeur: 20 }] }]);
  const r = await page({ milieu, couple: drapeau(true), libre: drapeau(false) }, `
const zone = [70, 40, 24, 16];
const bord = (e) => { const s = e.effets[0][0].p; const l = []; for (let ligne = 0; ligne < 8; ligne++) l.push(s[ligne * 12 + 11]); return l; };
const a = await groupeApres(DONNEES.milieu, [{ effet: DONNEES.couple, zone }], [2]);
const a2 = await groupeApres(DONNEES.milieu, [{ effet: DONNEES.couple, zone }], [2.25]);
const b = await groupeApres(DONNEES.milieu, [{ effet: DONNEES.libre, zone }], [2]);
const ya = bord(a).reduce((s, p) => s + p.y, 0) / 8;
const yb = bord(b).reduce((s, p) => s + p.y, 0) / 8;
const bouge = Math.max(...a.effets[0][0].p.map((p, i) => Math.hypot(p.x - a2.effets[0][0].p[i].x, p.y - a2.effets[0][0].p[i].y)));
await envoyer({ webgpu: true, ya, yb, bouge, finis: finis(a.effets[0][0].p) && finis(b.effets[0][0].p), tenu: a.effets[0][0].p[0] });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`bord libre : y ${r.ya.toFixed(1)} couplé, ${r.yb.toFixed(1)} sans couplage ; déplacement en 0,25 s : ${r.bouge.toFixed(2)} cqh`);
  assert.equal(r.finis, true);
  assert.ok(Math.abs(r.tenu.x - 70) < 1e-3 && Math.abs(r.tenu.y - 40) < 1e-3, 'bord gauche tenu à sa place');
  assert.ok(r.ya < r.yb - 3, 'couplé : le souffle relève le drapeau');
  assert.ok(r.bouge > 0.3, 'couplé : il claque (bouge encore)');
});

test('couplage GPU : même état au bit près par deux chemins pour tout le groupe (grille, particules couplées et injectrices, tissu, obstacle mobile)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const milieu = compilerMilieu({ resolution: 64, sources: [{ type: 'fumee', forme: { type: 'cercle', rayon: 6, decalage: [0, 30] }, debit: 4, temperature: 1 }] });
  const effet = compiler([
    { nom: 'braise', naissance: { debit: 60, forme: { type: 'rectangle' }, vie: [1, 2] }, forces: [{ type: 'gravite', valeur: 10 }, { type: 'milieu', coef: 3 }], injecte: { chaleur: 0.5, encre: 'couleur' },
      vie: { couleur: { degrade: ['#ff8000', '#2040ff'] } } },
    { nom: 'drapeau', structure: { type: 'tissu', resolution: [10, 6], attaches: [{ ou: 'gauche', a: 'ancre' }], milieu: { coef: 2 } }, forces: [{ type: 'gravite', valeur: 20 }] },
  ]);
  const r = await page({ milieu, effet }, `
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [{ scene: 's', genre: 'element', video: false, index: 0 }] });
const fixes = table.entrees.map((e) => (e.source.element ? null : O.repereFixe(e.source, L, table.sol)));
const monde = { entrees: table.entrees, largeurCqh: L, actif: true };
const mobile = (g) => ligne(fixes.map((x) => x || { centre: [60 + 15 * g / 30, 55], angle: g / 30, demi: [10, 4], echelle: [1, 1], actif: true }));
const zones = [{ effet: DONNEES.effet, zone: [70, 40, 24, 16] }];
const a = await groupeApres(DONNEES.milieu, zones, [1, 2], monde, mobile);
const b = await groupeApres(DONNEES.milieu, zones, [2.5, 1.2, 2], monde, mobile);
await envoyer({ webgpu: true, a: [empreinte(a.milieu.etat), ...a.effets[0].map((e) => e.brut)], b: [empreinte(b.milieu.etat), ...b.effets[0].map((e) => e.brut)],
  encre: a.milieu.scalaires.reduce((s, x, i) => (i % 8 >= 4 && i % 8 <= 6 ? s + x : s), 0) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.encre > 0, 'encre déposée par les braises');
  assert.deepEqual(r.a, r.b, 'grille, braises et tissu : même état au bit près');
});

test('couplage GPU : débuts décalés (injecteur à 0 s, milieu à 1 s) : rien déposé avant le milieu, même état par trois chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // Milieu immobile de 2 s qui commence à 1 s (pas 120 du groupe) ; fusée injectrice (comme fusee-panache) dès 0 s.
  const milieu = compilerMilieu({ resolution: 64, flottaison: 0, dissipation: 0, refroidissement: 0, vorticite: 0 }, 2);
  const fusee = compiler([{ nom: 'f', naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vitesse: { direction: [1, 0], valeur: [30, 30] }, vie: [3, 3] },
    injecte: { fumee: 3, encre: 'couleur' }, vie: { couleur: { degrade: ['#ff8000', '#2040ff'] } } }], 3);
  const r = await page({ milieu, fusee }, `
const effets = [{ effet: DONNEES.fusee, zone: [30, 50, 0, 0] }];
const apres = (chemin) => groupeApres(DONNEES.milieu, effets, chemin, null, () => new Float32Array(0), 120);
const somme = (e) => e.milieu.scalaires.reduce((s, x, i) => (i % 8 === 0 || (i % 8 >= 4 && i % 8 <= 6) ? s + x : s), 0);
const fumee = (e) => e.milieu.scalaires.reduce((s, x, i) => (i % 8 === 0 ? s + x : s), 0);
const premier = await apres([1 + 1.5 / 120]);
const direct = await apres([3]);
const continu = await apres([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]);
const retour = await apres([3, 0.4, 3]);
const em = (e) => [empreinte(e.milieu.etat), ...e.effets[0].map((x) => x.brut)];
await envoyer({ webgpu: true, premier: fumee(premier), avant: somme(await apres([0.9])), direct: em(direct), continu: em(continu), retour: em(retour), total: fumee(direct) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const pasDepot = Math.round(3 / 120 * 65536) / 65536;
  assert.equal(r.avant, 0, 'rien dans la grille avant le début du milieu');
  assert.ok(Math.abs(r.premier - pasDepot) < 1e-6, `fumée au pas 0 du milieu : ${r.premier}, un pas de dépôt : ${pasDepot}`);
  assert.ok(r.total > 100 * pasDepot, 'la fusée dépose pendant le milieu');
  assert.deepEqual(r.continu, r.direct, 'lecture continue = chemin direct');
  assert.deepEqual(r.retour, r.direct, 'retour en arrière depuis 3 s = chemin direct');
});

test("couplage GPU : après la fin d'un milieu (data-dur), les effets couplés qui continuent ne lisent plus de vent (particules et tissu)", async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // Panache de 1 s ; braises sans gravité, nées au repos, vie 0,4 s, émises 3 s : seul le vent du milieu les fait bouger.
  const milieu = compilerMilieu({ resolution: 64, flottaison: 1.5, sources: [{ type: 'fumee', forme: { type: 'cercle', rayon: 8, decalage: [0, 30] }, debit: 6, temperature: 1 }] }, 1);
  const braises = compiler([{ nom: 'b', naissance: { debit: 80, forme: { type: 'rectangle' }, vie: [0.4, 0.4], taille: [0.3, 0.3] },
    forces: [{ type: 'milieu', coef: 4 }] }], 3);
  // Tissu couplé sans gravité, tenu à gauche, dans le panache : seul le vent du milieu le déplace.
  const tissu = compiler([{ nom: 'd', structure: { type: 'tissu', resolution: [12, 8], attaches: [{ ou: 'gauche', a: 'ancre' }], milieu: { coef: 3 } } }], 3);
  const r = await page({ milieu, braises, tissu }, `
const zone = [L / 2 - 5, 72, 10, 10];
const vmax = (e) => { const v = e.effets[0][0].p.filter((p) => p.vivante === 1); return { n: v.length, v: Math.max(...v.map((p) => Math.hypot(p.vx, p.vy))) }; };
const pendant = vmax(await groupeApres(DONNEES.milieu, [{ effet: DONNEES.braises, zone }], [0.9]));
const apres = vmax(await groupeApres(DONNEES.milieu, [{ effet: DONNEES.braises, zone }], [2.5]));
const retour = vmax(await groupeApres(DONNEES.milieu, [{ effet: DONNEES.braises, zone }], [2.5, 1.5, 2.5]));
// Déplacement maximal d'un point du tissu entre deux instants (tissu né au pas debut du groupe, 120 pas par seconde).
const zoneTissu = [L / 2 - 8, 70, 16, 8];
const deplacement = async (debut, t0, t1) => {
  const a = (await groupeApres(DONNEES.milieu, [{ effet: DONNEES.tissu, zone: zoneTissu, debut }], [t0])).effets[0][0].p;
  const b = (await groupeApres(DONNEES.milieu, [{ effet: DONNEES.tissu, zone: zoneTissu, debut }], [t1])).effets[0][0].p;
  return { n: a.length, d: Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y))), finis: finis(a) && finis(b) };
};
const tissuPendant = await deplacement(0, 0.5, 0.9);
const tissuApres = await deplacement(180, 2, 2.5);
await envoyer({ webgpu: true, pendant, apres, retour, tissuPendant, tissuApres });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`vitesse max : ${r.pendant.v.toFixed(2)} pendant le milieu, ${r.apres.v} après sa fin`);
  assert.ok(r.pendant.n > 10 && r.pendant.v > 2, 'pendant le milieu : le vent les emporte');
  assert.ok(r.apres.n > 10 && r.apres.v < 1e-3, 'après la fin du milieu : vent nul (aucune vitesse)');
  assert.ok(r.retour.n > 10 && r.retour.v < 1e-3, 'après un retour en arrière : vent nul aussi');
  t.diagnostic(`tissu : ${r.tissuPendant.d.toFixed(2)} cqh pendant le milieu, ${r.tissuApres.d} après sa fin`);
  assert.equal(r.tissuPendant.finis && r.tissuApres.finis, true);
  assert.ok(r.tissuPendant.n >= 96 && r.tissuPendant.d > 0.3, 'tissu pendant le milieu : le vent le déplace');
  assert.ok(r.tissuApres.d < 1e-3, 'tissu né après la fin du milieu (τ = 1,5 s) : vent nul, il ne bouge pas');
});
