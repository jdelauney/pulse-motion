'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js', 'particules/maillage.js', 'particules/structures.js'];

function compiler(emetteurs, dur = 3) {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 7, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

/** Code commun : GPU, éléments d'attache, monde d'obstacles déclarés, lecture des états, état après un chemin de τ. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
const boite = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2, 0, 1, b[2] / 2, b[3] / 2, 1, 1];
function zonesDe(zone, autres = () => []) {
  return { a: () => zone, grille: () => zone, attaches: (g) => new Float32Array(boite(zone).concat(...autres(g).map(boite))) };
}
/** Monde des collisions : obstacles déclarés (propres) et sol de la recette (null : bas de l'image), repères fixes. */
function monde(propres, sol) {
  const table = O.construireTable({ largeurCqh: L, solRecette: sol, propres });
  const fixes = new Float32Array(table.entrees.length * 8);
  table.entrees.forEach((e, i) => O.ecrireRepere(fixes, i * 8, O.repereFixe(e.source, L, table.sol)));
  return { m: { entrees: table.entrees, largeurCqh: L, actif: true }, reperes: () => fixes };
}
const lireS = (f) => {
  const u = new Uint32Array(f.buffer);
  const l = [];
  for (let s = 0; s < f.length / 16; s++) {
    l.push({ x: f[s * 16], y: f[s * 16 + 1], z: f[s * 16 + 2], age: f[s * 16 + 3], vx: f[s * 16 + 4], vy: f[s * 16 + 5], vie: f[s * 16 + 6],
      taille: f[s * 16 + 7], vivante: u[s * 16 + 14] });
  }
  return l;
};
async function etat(effet, zones, chemin, m = null) {
  const sim = new P.Simulation(device, effet, m, null, L);
  for (const t of chemin) sim.avancer(t, zones);
  const r = [];
  for (let i = 0; i < effet.emetteurs.length; i++) {
    const f = await sim.lireEtat(i);
    r.push({ s: lireS(f), rompus: Array.from(await sim.lireRompus(i)), brut: Array.from(new Uint32Array(f.buffer)) });
  }
  sim.detruire();
  return r;
}
const memes = (a, b) => JSON.stringify(a.map((x) => [x.brut, x.rompus])) === JSON.stringify(b.map((x) => [x.brut, x.rompus]));
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const moyenne = (l, f) => l.reduce((s, x) => s + f(x), 0) / l.length;

test('structures GPU : bannière lâchée qui tombe et se pose sur un sol (P3) sans le traverser, même état par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const banniere = compiler([{ nom: 'b', structure: { type: 'tissu', resolution: [16, 8], attaches: [{ ou: 'haut', a: 'ancre', lacher: 0.3 }] },
    forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['sol'], restitution: 0, frottement: 0.6 } }], 5);
  const r = await page({ banniere }, `
const { m, reperes } = monde([], 90);
const zones = Object.assign(zonesDe([70, 20, 30, 14]), { reperes });
const etats = {};
let direct = null;
for (const tau of [0.8, 1.2, 1.6, 2, 4]) {
  const e = await etat(DONNEES.banniere, zones, [tau], m);
  etats[tau] = e[0].s;
  if (tau === 4) direct = e;
}
const autre = await etat(DONNEES.banniere, zones, [2.5, 1, 4], m);
await envoyer({ webgpu: true, etats, egal: memes(direct, autre) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.egal, true, 'même état au bit près par deux chemins');
  for (const [tau, s] of Object.entries(r.etats)) {
    assert.equal(s.length, 128);
    for (const p of s) assert.ok(p.y <= 90 - 0.2 + 0.01, `τ = ${tau} : sommet à y = ${p.y} sous le sol (rayon 0,2)`);
  }
  const fin = r.etats[4];
  assert.ok(moyenne(fin, (p) => p.y) > 75, `y moyen ${moyenne(fin, (p) => p.y).toFixed(1)} : la bannière est tombée jusqu'au sol`);
  assert.ok(moyenne(fin, (p) => Math.hypot(p.vx, p.vy)) < 3, 'posée : vitesse moyenne sous 3 cqh/s');
});

test('structures GPU : toile retenue par une ligne courte (plus fine que l\'écart des sommets) par le centre d\'une cellule', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // 6 × 4 sommets sur [60, 20, 40, 12] (écart 8 × 4 cqh) ; ligne de 3 cqh sous la cellule centrale du bas (x de 76 à 84).
  const toile = compiler([{ nom: 't', structure: { type: 'tissu', resolution: [6, 4], flexion: 0.2 }, forces: [{ type: 'gravite', valeur: 40 }],
    collisions: { cibles: ['elements'], restitution: 0, frottement: 0.8 } }], 3);
  const r = await page({ toile }, `
const { m, reperes } = monde([{ scene: 's', genre: 'ligne', video: false, de: [78.5, 60], a: [81.5, 60] }], null);
const zones = Object.assign(zonesDe([60, 20, 40, 12]), { reperes });
const fin = await etat(DONNEES.toile, zones, [2], m);
await envoyer({ webgpu: true, s: fin[0].s });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  // Sans contact, la toile aurait chuté de 80 cqh (y moyen au-delà de 100).
  assert.ok(moyenne(r.s, (p) => p.y) < 85, `y moyen ${moyenne(r.s, (p) => p.y).toFixed(1)} : la toile est retenue`);
  assert.ok(r.s.some((p) => Math.hypot(p.x - 80, p.y - 60) < 6), 'des sommets restent autour du point d\'appui');
});

test('structures GPU : perles posées sur les sommets de leur corde (position, vitesse, taille, profondeur, âge), effacées en revenant au début', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const guirlande = compiler([
    { nom: 'fil', structure: { type: 'corde', resolution: 33, attaches: [{ ou: 'debut', a: [0, 0.5] }, { ou: 'fin', a: [0.9, 0.5] }], perles: { tous: 8, emetteur: 'ampoule' } },
      forces: [{ type: 'gravite', valeur: 40 }] },
    { nom: 'ampoule', naissance: { taille: [1.5, 1.5], z: [0.2, 0.2] }, rendu: { melange: 'additif' } },
  ], 3);
  const r = await page({ guirlande }, `
const zones = zonesDe([40, 30, 64, 2]);
const a = await etat(DONNEES.guirlande, zones, [1.5]);
const b = await etat(DONNEES.guirlande, zones, [2.5, 1.5]);
const debut = await etat(DONNEES.guirlande, zones, [1.5, 0]);
await envoyer({ webgpu: true, fil: a[0].s, perles: a[1].s, egal: memes(a, b), vides: debut[1].s.map((p) => p.vivante) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.egal, true, 'mêmes perles par deux chemins (retour en arrière)');
  assert.equal(r.perles.length, 4, 'sommets 4, 12, 20, 28');
  r.perles.forEach((p, k) => {
    const s = r.fil[4 + 8 * k];
    assert.deepEqual([p.x, p.y, p.vx, p.vy, p.vivante], [s.x, s.y, s.vx, s.vy, 1], `perle ${k} sur son sommet`);
    assert.ok(Math.abs(p.taille - 1.5) < 1e-6 && Math.abs(p.z - 0.2) < 1e-6, `perle ${k} : taille ${p.taille}, profondeur ${p.z}`);
    assert.deepEqual([p.age, p.vie], [1.5, 3], `perle ${k} : âge (τ1) et vie (fenêtre de l'effet)`);
  });
  assert.ok(r.fil[16].y > 31 + 1, 'la guirlande pend');
  assert.deepEqual(r.vides, [0, 0, 0, 0], 'état 0 : aucune perle');
});

test('structures GPU : corde liée à des grains (avec) : les grains s\'y posent, elle ploie sous leur poids ; même état par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // Une corde de 33 sommets d'abord : la corde liée commence au sommet 36 du tampon commun (liaison décalée de 2 304 octets).
  const effet = (avec) => compiler([
    { nom: 'tresse', structure: { type: 'corde', resolution: 33 } },
    { nom: 'corde', structure: { type: 'corde', resolution: 61, raideur: 0.9, flexion: 0.05, amortissement: 0.3, epaisseur: 0.8,
      attaches: [{ ou: 'debut', a: [0, 0.5] }, { ou: 'fin', a: [0.9, 0.5] }] }, forces: [{ type: 'gravite', valeur: 40 }] },
    { nom: 'sable', naissance: { salves: [{ t: 0.5, nombre: 300 }], forme: { type: 'rectangle', largeur: 30, hauteur: 6, decalage: [0, -12] }, vie: [10, 10], taille: [0.6, 0.6] },
      forces: [{ type: 'gravite', valeur: 40 }], interactions: { type: 'grains', rayon: 1, avec } },
  ], 4);
  const lie = effet(['corde']);
  assert.deepEqual(lie.groupes[0].structures, [1]);
  const r = await page({ lie, libre: effet([]) }, `
// Corde de 60 cqh tenue en (50, 40,5) et (104, 40,5) ; sable versé au-dessus de sa partie centrale.
const zones = zonesDe([50, 40, 60, 1]);
const a = await etat(DONNEES.lie, zones, [3]);
const b = await etat(DONNEES.lie, zones, [1.5, 0.7, 3]);
const sans = await etat(DONNEES.libre, zones, [3]);
await envoyer({ webgpu: true, corde: a[1].s, grains: a[2].s.filter((p) => p.vivante === 1), seule: sans[1].s, egal: memes(a, b) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.egal, true, 'même état au bit près par deux chemins, couplage compris');
  const fleche = (s) => Math.max(...s.map((p) => p.y)) - 40.5;
  assert.ok(fleche(r.corde) > fleche(r.seule) + 1, `flèche ${fleche(r.corde).toFixed(2)} cqh avec le sable, ${fleche(r.seule).toFixed(2)} sans : la corde ploie`);
  // Hauteur de la corde sous chaque grain (interpolée entre ses sommets) : le grain reste au-dessus.
  const yCorde = (x) => {
    const s = r.corde;
    for (let i = 0; i + 1 < s.length; i++) {
      const [a, b] = s[i].x <= s[i + 1].x ? [s[i], s[i + 1]] : [s[i + 1], s[i]];
      if (x >= a.x && x <= b.x) return a.y + (b.y - a.y) * ((x - a.x) / Math.max(b.x - a.x, 1e-6));
    }
    return Infinity;
  };
  const dessus = r.grains.filter((p) => p.y < yCorde(p.x) + 0.2).length;
  assert.equal(r.grains.length, 300);
  assert.ok(dessus >= 0.9 * r.grains.length, `${dessus} grains sur 300 au-dessus de la corde`);
});
