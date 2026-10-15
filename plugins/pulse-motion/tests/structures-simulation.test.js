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
  assert.equal(f[S.ALPHA_C], Math.fround(50 * P.complianceStructure(0.8)), 'flexion 0 : compression au plancher (50 × raideur)');
  assert.deepEqual([f[S.G], f[S.G + 1]], [0, 40], 'gravité de la recette');
  // Flexion non nulle : compliance de flexion (logarithmique au-delà de 0,5), compression au plus 50 fois la raideur.
  const souple = compiler([{ nom: 'c', structure: { type: 'corde', resolution: 8, flexion: 0.25 } }]);
  const fc = new Float32Array(P.emballerStructure(souple.emetteurs[0], souple, false, 10, Mm.liens(8, 1), null).buffer);
  assert.equal(fc[S.ALPHA_B], Math.fround(P.complianceFlexion(0.25)));
  assert.equal(fc[S.ALPHA_C], Math.fround(Math.min(P.complianceFlexion(0.25), 50 * P.complianceStructure(0.9))));
  assert.ok(P.complianceFlexion(0.1) / P.complianceFlexion(0.9) > 1000 && P.complianceFlexion(1) > 0, 'flexion visible sur toute sa plage');
  // Glissement d'une attache : décalage et durée dans les mots 5 à 7 de l'attache.
  const gl = compiler([{ nom: 't', structure: { type: 'tissu', resolution: [4, 3], attaches: [{ ou: 'haut', glisse: { vers: [-0.25, 0.5], duree: 2 } }] } }]);
  const fg = new Float32Array(P.emballerStructure(gl.emetteurs[0], gl, false, 10, Mm.liens(4, 3), null).buffer);
  assert.deepEqual([fg[325], fg[326], fg[327]], [-0.25, 0.5, 2]);
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
  // Fanion : bord gauche à sa place de repos (x = 40, hauteur de la zone), déplacé avec #mat (20 cqh à τ = 2), sans être
  // étalé sur le bord de #mat.
  for (let ligne = 0; ligne < 6; ligne++) {
    const p = r.apres[1][ligne * 8];
    assert.ok(Math.abs(p.x - 60) < 1e-3 && Math.abs(p.y - (30 + 12 * ligne / 5)) < 1e-3, `fanion, ligne ${ligne} : ${p.x}, ${p.y}`);
    assert.ok(Math.abs(p.vx - 10) < 0.05, `vitesse du bord tenu ${p.vx} : celle de son élément`);
  }
});

test('structures GPU : rideau déchiré au seuil prévu (liens intacts sous le seuil, déchirures définitives), même état au bit près par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // 20 × 10 sommets sur [40, 30, 38, 18] (Lu = Lv = 2) ; moitié gauche du bord haut tenue par #gauche (fixe, lâchée à
  // 2,5 s), moitié droite par #droite, qui part vers la droite à 12 cqh/s : le rideau se déchire au milieu.
  const gauche = Array.from({ length: 10 }, (_, i) => i).join(', ');
  const droite = Array.from({ length: 10 }, (_, i) => i + 10).join(', ');
  const rideau = compiler([{ nom: 'r', structure: { type: 'tissu', resolution: [20, 10], raideur: 1, flexion: 0.05, dechirure: 1.3,
    attaches: [{ ou: gauche, a: '#gauche', lacher: 2.5 }, { ou: droite, a: '#droite' }] }, forces: [{ type: 'gravite', valeur: 40 }] }], 4);
  const r = await page({ rideau }, `
const Z = [40, 30, 38, 18];
const zones = zonesDe(Z, (g) => [Z, [40 + 12 * g / 30, 30, 38, 18]]);
const etats = {};
for (const tau of [0.03, 1, 2, 3]) etats[tau] = (await etat(DONNEES.rideau, zones, [tau]))[0];
const autre = (await etat(DONNEES.rideau, zones, [1.2, 0.4, 2]))[0];
const encore = (await etat(DONNEES.rideau, zones, [3, 2]))[0];
await envoyer({ webgpu: true, etats, egal: memes([etats[2]], [autre]) && memes([etats[2]], [encore]) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.egal, true, 'même état au bit près par deux chemins (retours en arrière compris), déchirures comprises');
  const C = 20;
  const { codes } = Mm.liens(C, 10);
  const repos = [2, 2, Math.hypot(2, 2), Math.hypot(2, 2), 4, 4];
  const rompu = (e, code) => ((e.rompus[code >> 3] >> (code & 7)) & 1) === 1;
  const nRompus = (e) => codes.filter((c) => rompu(e, c)).length;
  assert.equal(nRompus(r.etats[0.03]), 0, 'pas 3 : écart de 0,3 cqh (étirement 1,15) : aucun lien rompu');
  for (const tau of [1, 2, 3]) {
    const e = r.etats[tau];
    assert.ok(nRompus(e) > 0, `τ = ${tau} : liens rompus`);
    for (const code of codes) {
      if (rompu(e, code)) continue;
      const [a, b] = Mm.extremites(code, C);
      const l = Math.hypot(e.s[a].x - e.s[b].x, e.s[a].y - e.s[b].y);
      assert.ok(l <= 1.3 * repos[code & 7] * (1 + 1e-5), `τ = ${tau} : lien intact ${code} étiré à ${(l / repos[code & 7]).toFixed(4)}`);
    }
  }
  assert.ok(rompu(r.etats[1], 9 * 8), 'le lien du bord haut entre les deux moitiés (sommets 9 et 10) est rompu');
  for (const code of codes) if (rompu(r.etats[1], code)) assert.ok(rompu(r.etats[2], code) && rompu(r.etats[3], code), `lien ${code} : rupture définitive`);
  // Lâcher de la moitié gauche à 2,5 s : elle tombe (ou pend de la moitié droite).
  assert.ok(r.etats[2].s[0].y < 30 + 1e-3, 'avant le lâcher : sommet 0 tenu');
  assert.ok(r.etats[3].s[0].y > 30 + 2, `sommet 0 à y = ${r.etats[3].s[0].y.toFixed(2)} après le lâcher`);
});

test('structures GPU : pose des premières images (corde pendue en chaînette ou à la verticale, fanion posé sur son mât sans lien étiré)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // Corde tenue aux deux bouts (celle de l'essai au repos) ; corde tenue au milieu du bord haut de [40, 30, 60, 2] ;
  // fanion de [40, 30, 30, 12] tenu par son bord gauche à #mat, boîte de 4 × 24 (taille différente), forces du drapeau.
  const deux = compiler([{ nom: 'c', structure: { type: 'corde', resolution: 61, raideur: 1, flexion: 0, amortissement: 0.4,
    attaches: [{ ou: 'debut', a: [0, 0.5] }, { ou: 'fin', a: ['50 / 60', 0.5] }] }, forces: [{ type: 'gravite', valeur: 40 }] }], 4);
  const un = compiler([{ nom: 'c', structure: { type: 'corde', resolution: 40, raideur: 1, flexion: 0.2, attaches: [{ ou: 'debut', a: [0.5, 0] }] },
    forces: [{ type: 'gravite', valeur: 40 }] }], 4);
  const fanion = compiler([{ nom: 'f', structure: { type: 'tissu', resolution: [16, 10], raideur: 0.95, flexion: 0.05, dechirure: 1.3, attaches: [{ ou: 'gauche', a: '#mat' }] },
    forces: [{ type: 'gravite', valeur: 20 }, { type: 'vent', vitesse: [60, 0], coef: 1.5 }, { type: 'turbulence', echelle: 12, force: 25, vitesse: 1.5 }] }], 4);
  const r = await page({ deux, un, fanion }, `
const corde = zonesDe([40, 30, 60, 2]);
const mat = zonesDe([40, 30, 30, 12], () => [[20, 30, 4, 24]]);
const deux = (await etat(DONNEES.deux, corde, [1 / 30]))[0];
const un = (await etat(DONNEES.un, corde, [1 / 30]))[0];
const pas1 = (await etat(DONNEES.fanion, mat, [0.0084]))[0];
const image3 = (await etat(DONNEES.fanion, mat, [3 / 30]))[0];
await envoyer({ webgpu: true, deux: deux.s, un: un.s, pas1, image3 });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  // Deux bouts : chaînette dès la première image (± 2 %).
  const a = chainette(50, 60);
  const fleche = a * (Math.cosh(25 / a) - 1);
  const mesuree = Math.max(...r.deux.map((p) => p.y)) - 31;
  assert.ok(Math.abs(mesuree - fleche) <= 0.02 * fleche, `première image : flèche ${mesuree.toFixed(3)} cqh, chaînette ${fleche.toFixed(3)} cqh`);
  let e2 = 0;
  for (const p of r.deux) e2 += (p.y - (31 + a * (Math.cosh(25 / a) - Math.cosh((p.x - 65) / a)))) ** 2;
  assert.ok(Math.sqrt(e2 / r.deux.length) <= 0.02 * fleche, `première image : écart quadratique moyen ${Math.sqrt(e2 / r.deux.length).toFixed(3)} cqh à la chaînette`);
  // Un bout : à la verticale sous (70, 30), longueur de repos gardée (60 / 39 entre deux sommets).
  r.un.forEach((p, v) => {
    assert.ok(Math.abs(p.x - 70) < 0.05, `corde pendue, sommet ${v} : x ${p.x.toFixed(3)}`);
    assert.ok(Math.abs(p.y - (30 + v * 60 / 39)) <= 0.02 * Math.max(1, v * 60 / 39), `corde pendue, sommet ${v} : y ${p.y.toFixed(3)}`);
  });
  // Fanion : bord tenu à sa place de repos (x = 40, sur la hauteur de la zone), aucun lien étiré de plus de 5 % au pas 1,
  // aucun lien rompu aux premières images.
  const C = 16;
  const { codes } = Mm.liens(C, 10);
  const Lu = 30 / 15;
  const Lv = 12 / 9;
  const repos = [Lu, Lv, Math.hypot(Lu, Lv), Math.hypot(Lu, Lv), 2 * Lu, 2 * Lv];
  for (let ligne = 0; ligne < 10; ligne++) {
    const p = r.pas1.s[ligne * C];
    assert.ok(Math.abs(p.x - 40) < 1e-3 && Math.abs(p.y - (30 + Lv * ligne)) < 1e-3, `fanion, ligne ${ligne} : ${p.x}, ${p.y}`);
  }
  for (const code of codes) {
    if ((code & 7) >= 4) continue;
    const [i, j] = Mm.extremites(code, C);
    const l = Math.hypot(r.pas1.s[i].x - r.pas1.s[j].x, r.pas1.s[i].y - r.pas1.s[j].y);
    assert.ok(l <= 1.05 * repos[code & 7], `pas 1 : lien ${code} étiré à ${(l / repos[code & 7]).toFixed(3)}`);
  }
  assert.ok(r.image3.rompus.every((m) => (m & 63) === 0), 'aucun lien rompu aux trois premières images');
});

test('structures GPU : rideau de la bibliothèque, ouvert par ses attaches ; après la déchirure, ses morceaux pendent ou tombent (ni projetés, ni remontés)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const recette = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'effets', 'rideau.json'), 'utf8'));
  const rideaux = ['', 'resistance: 1.1'].map((reglages) => {
    const r = R.compiler(recette, { dur: 5, graine: 1, charte: {}, reglages });
    assert.equal(r.ok, true, JSON.stringify(r.erreurs));
    return r.effet;
  });
  const r = await page({ rideaux }, `
// Zone [130, 60, 40, 30] ; une image tous les 1/30 s jusqu'à 4,5 s.
const zones = zonesDe([130, 60, 40, 30]);
const res = [];
for (const e of DONNEES.rideaux) {
  const sim = new P.Simulation(device, e, null, null, L);
  const images = [];
  for (let k = 1; k <= 135; k++) {
    sim.avancer(k / 30, zones);
    const f = await sim.lireEtat(0);
    const rp = await sim.lireRompus(0);
    const xy = [];
    for (let i = 0; i < f.length / 16; i++) xy.push(f[i * 16], f[i * 16 + 1]);
    images.push({ xy, rompus: Array.from(rp) });
  }
  sim.detruire();
  res.push(images);
}
await envoyer({ webgpu: true, res });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const C = 32;
  const N = 32 * 24;
  const { codes } = Mm.liens(C, 24);
  // Sommets reliés (liens de structure intacts) au bord haut, tenu.
  const lies = (rompus) => {
    const par = Array.from({ length: N }, (_, i) => i);
    const racine = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (const code of codes) {
      if ((code & 7) >= 4 || ((rompus[code >> 3] >> (code & 7)) & 1)) continue;
      const [a, b] = Mm.extremites(code, C);
      par[racine(a)] = racine(b);
    }
    const haut = new Set(Array.from({ length: C }, (_, c) => racine(c)));
    return Array.from({ length: N }, (_, i) => haut.has(racine(i)));
  };
  r.res.forEach((images, q) => {
    const nom = q === 0 ? 'rideau' : 'rideau peu résistant';
    const k0 = images.findIndex((im) => im.rompus.some((m) => (m & 63) !== 0));
    assert.ok(k0 >= 0 && k0 < 30, `${nom} : déchiré dans la première seconde (image ${k0 + 1})`);
    for (let k = k0; k < images.length; k++) {
      const { xy } = images[k];
      for (let i = 0; i < N; i++) {
        // Zone élargie de 25 % de sa largeur de chaque côté : [120, 180].
        assert.ok(xy[2 * i] >= 120 - 0.05 && xy[2 * i] <= 180 + 0.05, `${nom}, image ${k + 1} : sommet ${i} projeté en x = ${xy[2 * i].toFixed(1)}`);
        if (k > k0) assert.ok(images[k - 1].xy[2 * i + 1] - xy[2 * i + 1] <= 2, `${nom}, image ${k + 1} : sommet ${i} remonté de ${(images[k - 1].xy[2 * i + 1] - xy[2 * i + 1]).toFixed(2)} cqh`);
      }
    }
    const fin = images[images.length - 1];
    const tenus = lies(fin.rompus);
    if (q === 0) {
      // Ouvert : écart entre les deux moitiés au milieu de la hauteur ; aucun morceau détaché.
      const ligne = 12;
      const gauche = Math.max(...Array.from({ length: 16 }, (_, c) => fin.xy[2 * (ligne * C + c)]));
      const droite = Math.min(...Array.from({ length: 16 }, (_, c) => fin.xy[2 * (ligne * C + c + 16)]));
      assert.ok(droite - gauche >= 8, `rideau ouvert de ${(droite - gauche).toFixed(1)} cqh au milieu de sa hauteur`);
      assert.ok(tenus.every(Boolean), 'aucun morceau détaché');
    } else {
      // Morceaux détachés : ils tombent (y moyen qui croît d'une seconde à l'autre).
      const libres = tenus.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
      assert.ok(libres.length > 0, 'rideau peu résistant : des morceaux se détachent');
      const yMoyen = (im) => libres.reduce((s, i) => s + im.xy[2 * i + 1], 0) / libres.length;
      for (let k = 74; k + 30 < images.length; k += 30) assert.ok(yMoyen(images[k + 30]) > yMoyen(images[k]) + 5, `morceaux détachés qui tombent (image ${k + 1} -> ${k + 31})`);
    }
  });
});

test('structures GPU : repli à 256 fils quand le pilote refuse davantage ; même état et mêmes liens rompus au bit près qu\'avec les fils du device', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler([
    { nom: 'a', structure: { type: 'tissu', resolution: [40, 30], attaches: [{ ou: 'haut', a: 'ancre' }], dechirure: 1.2 },
      forces: [{ type: 'gravite', valeur: 40 }, { type: 'attracteur', force: -1500, rayon: 4, centre: [0.5, 0.6] }, { type: 'turbulence', echelle: 10, force: 30 }] },
    { nom: 'b', structure: { type: 'corde', resolution: 60, attaches: [{ ou: 'debut', a: [0.5, 0] }] }, forces: [{ type: 'gravite', valeur: 40 }] },
  ], 4);
  const r = await page({ effet }, `
const zones = zonesDe([40, 10, 60, 60]);
// Device de la page : fils permis par l'adaptateur (1024 au plus), pipeline créé sans préparation.
const a = await etat(DONNEES.effet, zones, [2.5]);
const filsA = P.filsStructures(device);
// Second device aux mêmes limites : 2048 fils demandés, refusés -> repli à 256, sans erreur non capturée.
const l = gpu.adaptateur.limits;
const fils = Math.min(1024, l.maxComputeInvocationsPerWorkgroup, l.maxComputeWorkgroupSizeX);
const adaptateur = await navigator.gpu.requestAdapter();
const autre = await adaptateur.requestDevice(fils > 256 ? { requiredLimits: { maxComputeInvocationsPerWorkgroup: fils, maxComputeWorkgroupSizeX: fils } } : undefined);
const erreurs = [];
autre.onuncapturederror = (e) => erreurs.push(String(e.error && e.error.message));
const filsB = await P.preparerStructures(autre, 2048);
const sim = new P.Simulation(autre, DONNEES.effet, null, null, L);
sim.avancer(2.5, zones);
const b = [];
for (let i = 0; i < 2; i++) {
  const f = await sim.lireEtat(i);
  b.push({ brut: Array.from(new Uint32Array(f.buffer)), rompus: Array.from(await sim.lireRompus(i)) });
}
const filsSim = sim.structures.fils;
sim.detruire();
await autre.queue.onSubmittedWorkDone();
const nRompus = a[0].rompus.filter((m) => (m & 63) !== 0).length;
await envoyer({ webgpu: true, filsA, filsB, filsSim, erreurs, egal: memes(a, b), nRompus });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`fils du device de la page : ${r.filsA}`);
  assert.equal(r.filsB, 256, 'repli à 256 fils');
  assert.equal(r.filsSim, 256, 'la simulation prend le pipeline préparé');
  assert.deepEqual(r.erreurs, [], 'aucune erreur non capturée');
  assert.ok(r.nRompus > 0, 'des liens rompus');
  assert.equal(r.egal, true, `même état et mêmes liens rompus à 256 et ${r.filsA} fils`);
});
