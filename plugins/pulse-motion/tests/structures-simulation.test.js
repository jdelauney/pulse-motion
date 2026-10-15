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

const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js', 'particules/maillage.js', 'particules/structures.js'];

/** Code commun des pages : GPU, éléments d'attache, lecture des sommets et des liens rompus, état après un chemin de τ. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
/** Repère (8 nombres, disposition des obstacles) d'une boîte [x, y, largeur, hauteur] sans rotation. */
const boite = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2, 0, 1, b[2] / 2, b[3] / 2, 1, 1];
/** Zones d'une simulation : zone fixe (élément 0), autres éléments d'attache donnés par autres(g) -> [boîtes]. */
function zonesDe(zone, autres = () => []) {
  return { a: () => zone, grille: () => zone, attaches: (g) => new Float32Array(boite(zone).concat(...autres(g).map(boite))) };
}
const lireS = (f) => {
  const u = new Uint32Array(f.buffer);
  const l = [];
  for (let s = 0; s < f.length / 16; s++) l.push({ x: f[s * 16], y: f[s * 16 + 1], vx: f[s * 16 + 4], vy: f[s * 16 + 5], vivante: u[s * 16 + 14], gen: u[s * 16 + 13] });
  return l;
};
/** État de chaque émetteur après le chemin de τ : sommets (ou particules), liens rompus, mots bruts. */
async function etat(effet, zones, chemin, m = null) {
  const sim = new P.Simulation(device, effet, m, null, L);
  for (const t of chemin) sim.avancer(t, zones);
  const r = [];
  for (let i = 0; i < effet.emetteurs.length; i++) {
    const f = await sim.lireEtat(i);
    const k = await sim.lireRompus(i);
    r.push({ s: lireS(f), rompus: Array.from(k), brut: Array.from(new Uint32Array(f.buffer)) });
  }
  sim.detruire();
  return r;
}
const memes = (a, b) => JSON.stringify(a.map((x) => [x.brut, x.rompus])) === JSON.stringify(b.map((x) => [x.brut, x.rompus]));
const finis = (e) => e.every((x) => x.s.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy)));
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

/** Chaînette de portée d et de longueur l : paramètre a tel que 2 a sh(d / 2a) = l (dichotomie). */
function chainette(d, l) {
  let bas = 1e-3;
  let haut = 1e4;
  for (let i = 0; i < 200; i++) {
    const a = (bas + haut) / 2;
    if (2 * a * Math.sinh(d / (2 * a)) > l) bas = a; else haut = a;
  }
  return (bas + haut) / 2;
}

test('structures GPU : corde au repos en chaînette (± 2 %), bouts tenus à leur point', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // 61 sommets sur la ligne médiane de la zone [40, 30, 60, 2] : longueur 60 ; bouts tenus en (40, 31) et (90, 31).
  const corde = compiler([{ nom: 'c', structure: { type: 'corde', resolution: 61, raideur: 1, flexion: 0, amortissement: 0.4,
    attaches: [{ ou: 'debut', a: [0, 0.5] }, { ou: 'fin', a: ['50 / 60', 0.5] }] }, forces: [{ type: 'gravite', valeur: 40 }] }], 10);
  const r = await page({ corde }, `
const fin = await etat(DONNEES.corde, zonesDe([40, 30, 60, 2]), [8]);
await envoyer({ webgpu: true, s: fin[0].s, finis: finis(fin) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.finis, true);
  assert.equal(r.s.length, 61);
  assert.ok(Math.abs(r.s[0].x - 40) < 1e-3 && Math.abs(r.s[0].y - 31) < 1e-3, `début ${r.s[0].x}, ${r.s[0].y}`);
  assert.ok(Math.abs(r.s[60].x - 90) < 1e-3 && Math.abs(r.s[60].y - 31) < 1e-3, `fin ${r.s[60].x}, ${r.s[60].y}`);
  const a = chainette(50, 60);
  const fleche = a * (Math.cosh(25 / a) - 1);
  const mesuree = Math.max(...r.s.map((p) => p.y)) - 31;
  assert.ok(Math.abs(mesuree - fleche) <= 0.02 * fleche, `flèche ${mesuree.toFixed(3)} cqh, chaînette ${fleche.toFixed(3)} cqh`);
  let e2 = 0;
  for (const p of r.s) {
    const y = 31 + a * (Math.cosh(25 / a) - Math.cosh((p.x - 65) / a));
    e2 += (p.y - y) ** 2;
  }
  const ecart = Math.sqrt(e2 / r.s.length);
  assert.ok(ecart <= 0.02 * fleche, `écart quadratique moyen ${ecart.toFixed(3)} cqh à la chaînette (flèche ${fleche.toFixed(2)})`);
  assert.ok(r.s.every((p) => Math.hypot(p.vx, p.vy) < 0.5), 'au repos');
});

test('structures GPU : drapeau déployé sous le vent, bord gauche tenu à sa place, qui ondule', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const drapeau = compiler([{ nom: 'd', structure: { type: 'tissu', resolution: [24, 16], attaches: [{ ou: 'gauche', a: 'ancre' }] },
    forces: [{ type: 'gravite', valeur: 20 }, { type: 'vent', vitesse: [80, 0], coef: 2 }, { type: 'turbulence', echelle: 10, force: 30, vitesse: 2 }] }], 5);
  const r = await page({ drapeau }, `
const zones = zonesDe([40, 30, 36, 24]);
const a = await etat(DONNEES.drapeau, zones, [3]);
const b = await etat(DONNEES.drapeau, zones, [3.25]);
await envoyer({ webgpu: true, a: a[0].s, b: b[0].s, finis: finis(a) && finis(b) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.finis, true, 'aucune valeur non finie');
  const C = 24;
  for (let ligne = 0; ligne < 16; ligne++) {
    const p = r.a[ligne * C];
    assert.ok(Math.abs(p.x - 40) < 1e-3 && Math.abs(p.y - (30 + 24 * ligne / 15)) < 1e-3, `bord tenu, ligne ${ligne} : ${p.x}, ${p.y}`);
  }
  const droite = Array.from({ length: 16 }, (_, ligne) => r.a[ligne * C + C - 1]);
  const xMoyen = droite.reduce((s, p) => s + p.x, 0) / 16;
  assert.ok(xMoyen >= 40 + 0.75 * 36, `bord libre à x moyen ${xMoyen.toFixed(1)} : drapeau déployé`);
  const hauteur = Math.max(...droite.map((p) => p.y)) - Math.min(...droite.map((p) => p.y));
  assert.ok(hauteur >= 0.4 * 24, `bord libre haut de ${hauteur.toFixed(1)} cqh : toile ouverte, pas repliée`);
  const bouge = Math.max(...r.a.map((p, i) => Math.hypot(p.x - r.b[i].x, p.y - r.b[i].y)));
  assert.ok(bouge > 0.3, `déplacement maximal ${bouge.toFixed(2)} cqh en 0,25 s : le drapeau ondule`);
});

test('structures GPU : attache lâchée à l\'instant prévu (bannière qui tombe), attache sur un élément qui bouge', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler([
    { nom: 'banniere', structure: { type: 'tissu', resolution: [12, 6], attaches: [{ ou: 'haut', a: 'ancre', lacher: 1 }] }, forces: [{ type: 'gravite', valeur: 40 }] },
    { nom: 'fanion', structure: { type: 'tissu', resolution: [8, 6], attaches: [{ ou: 'gauche', a: '#mat' }] } },
  ], 4);
  assert.deepEqual(effet.elements, ['mat']);
  const r = await page({ effet }, `
// Élément 1 (#mat) : boîte de 4 × 24 qui glisse de 10 cqh/s vers la droite.
const zones = zonesDe([40, 30, 30, 12], (g) => [[20 + 10 * g / 30, 30, 4, 24]]);
const avant = await etat(DONNEES.effet, zones, [0.9]);
const apres = await etat(DONNEES.effet, zones, [2]);
await envoyer({ webgpu: true, avant: avant.map((e) => e.s), apres: apres.map((e) => e.s) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const haut = (s) => s.slice(0, 12);
  assert.ok(haut(r.avant[0]).every((p) => Math.abs(p.y - 30) < 1e-3 && p.gen === 1), 'avant le lâcher : bord haut tenu');
  assert.ok(haut(r.apres[0]).every((p) => p.y > 30 + 5 && p.gen === 0), 'après le lâcher : la bannière tombe');
  // Fanion : bord gauche sur le bord gauche de #mat (x = 20 + 10 × 2 = 40 à τ = 2), réparti sur sa hauteur.
  for (let ligne = 0; ligne < 6; ligne++) {
    const p = r.apres[1][ligne * 8];
    assert.ok(Math.abs(p.x - 40) < 1e-3 && Math.abs(p.y - (30 + 24 * ligne / 5)) < 1e-3, `fanion, ligne ${ligne} : ${p.x}, ${p.y}`);
    assert.ok(Math.abs(p.vx - 10) < 0.05, `vitesse du bord tenu ${p.vx} : celle de son élément`);
  }
});
