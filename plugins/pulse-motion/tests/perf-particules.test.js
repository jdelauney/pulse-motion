'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'particules/rendu.js'];

// 100 000 particules simultanées : débit 50 000/s, vie 2 s, turbulence (voie simulée), étincelles additives.
const { effet } = R.compiler({
  version: 1, nom: 'perf',
  emetteurs: [{ nom: 'nuee',
    naissance: { debit: 50000, forme: { type: 'ancre' }, vitesse: { cone: 360, valeur: [5, 30] }, vie: [2, 2], taille: [0.3, 0.6] },
    forces: [{ type: 'gravite', valeur: 10 }, { type: 'trainee', coef: 0.5 }, { type: 'turbulence', echelle: 10, force: 20 }],
    rendu: { type: 'etincelle', melange: 'additif' } }],
}, { dur: 8, graine: 1 });

const CODE = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const canvas = document.createElement('canvas');
canvas.width = 1920; canvas.height = 1080;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
const sim = new P.Simulation(device, DONNEES);
const ZONE = [60, 30, 58, 40];
const zones = { a: () => ZONE, grille: () => ZONE };
const options = { largeurCqh: 177.78, dureeImage: 1 / 30, bloom: 0.8, seuil: 1, tons: 'douce' };
// Montée en régime : 2,5 s de simulation pour atteindre 100 000 particules vivantes.
sim.avancer(2.5, zones);
await device.queue.onSubmittedWorkDone();
const etat = new Uint32Array((await sim.lireEtat(0)).buffer);
let vivantes = 0;
// Champ « vivante » : mot 14 des 16 mots de la disposition Particule.
for (let s = 14; s < etat.length; s += 16) if (etat[s] === 1) vivantes++;
// τ continue d'une mesure à l'autre : aucun retour en arrière (restauration d'instantané) dans les boucles chronométrées.
let t = 2.5;
async function chrono(images, pas, avecRendu) {
  const debut = performance.now();
  for (let n = 0; n < images; n++) {
    t += pas;
    const deltas = sim.avancer(t, zones);
    if (avecRendu) rendu.dessiner(cible, [{ sim, i: 0, delta: deltas[0] }], options);
    await device.queue.onSubmittedWorkDone();
  }
  return (performance.now() - debut) / images;
}
// Échauffement hors mesure : compilation des pipelines de rendu.
rendu.dessiner(cible, [{ sim, i: 0, delta: 0 }], options);
await device.queue.onSubmittedWorkDone();
const capture = await chrono(60, 1 / 30, false);
const apercu = await chrono(120, 1 / 60, true);
const info = gpu.adaptateur && gpu.adaptateur.info ? gpu.adaptateur.info : {};
await envoyer({ webgpu: true, vivantes, capture, apercu, adaptateur: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') });
`;

test('performances : 100 000 particules (simulation en capture, rendu 1080p en aperçu)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: effet, code: CODE }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`adaptateur : ${r.adaptateur || 'inconnu'}`);
  t.diagnostic(`particules vivantes : ${r.vivantes}`);
  t.diagnostic(`capture : ${r.capture.toFixed(2)} ms de simulation par image (spec : < 5 ms)`);
  t.diagnostic(`aperçu : ${r.apercu.toFixed(2)} ms par image avec rendu 1080p (spec : < 16,7 ms pour 60 ips)`);
  assert.ok(r.vivantes > 90000, `${r.vivantes} particules vivantes`);
  if (process.env.PM_PERF === '1') {
    assert.ok(r.capture < 5, `simulation : ${r.capture.toFixed(2)} ms par image`);
    assert.ok(r.apercu < 1000 / 60, `aperçu : ${r.apercu.toFixed(2)} ms par image`);
  }
});

// 100 000 particules à rebonds contre 16 obstacles : 12 primitives (boîtes, cercles, segments) et 4 formes exactes.
const AVEC_OBSTACLES = R.compiler({
  version: 1, nom: 'perf-collisions',
  emetteurs: [{ nom: 'nuee',
    naissance: { debit: 50000, forme: { type: 'ancre' }, vitesse: { cone: 360, valeur: [5, 30] }, vie: [2, 2], taille: [0.3, 0.6] },
    forces: [{ type: 'gravite', valeur: 10 }, { type: 'trainee', coef: 0.5 }, { type: 'turbulence', echelle: 10, force: 20 }],
    collisions: { restitution: [0.3, 0.6], frottement: 0.2 },
    rendu: { type: 'etincelle', melange: 'additif' } }],
}, { dur: 8, graine: 1 }).effet;

const CODE_OBSTACLES = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
const disque = new Uint8ClampedArray(128 * 128);
for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) disque[y * 128 + x] = (x + 0.5 - 64) ** 2 + (y + 0.5 - 64) ** 2 < 60 * 60 ? 255 : 0;
const formes = P.creerFormes(device, [0, 1, 2, 3].map(() => ({ largeur: 128, hauteur: 128, alpha: disque, hauteurCqh: 12 })));
const propres = [];
for (let i = 0; i < 12; i++) propres.push(i % 3 === 0 ? { scene: 's', genre: 'element', video: false, index: i }
  : i % 3 === 1 ? { scene: 's', genre: 'cercle', video: false, centre: [20 + 12 * i, 30], rayon: 4 }
  : { scene: 's', genre: 'ligne', video: false, de: [10 + 12 * i, 75], a: [18 + 12 * i, 82] });
for (let i = 0; i < 4; i++) propres.push({ scene: 's', genre: 'forme', video: false, index: 12 + i });
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres });
O.attacherFormes(table, (d) => d.index - 12);
const cadres = table.entrees.map((e, i) => {
  const d = e.source.element;
  if (!d) return O.repereFixe(e.source, L, table.sol);
  if (d.genre === 'forme') return { centre: [30 + 40 * (d.index - 12), 55], angle: 0.3, demi: [6, 6], echelle: [1, 1], actif: true };
  return { centre: [15 + 12 * d.index, 50], angle: 0.2 * d.index, demi: [5, 1.5], echelle: [1, 1], actif: true };
});
const ligne = new Float32Array(table.entrees.length * 8);
cadres.forEach((r, i) => O.ecrireRepere(ligne, i * 8, r));
const ZONE = [60, 30, 58, 40];
const zones = { a: () => ZONE, grille: () => ZONE, reperes: () => ligne };
const sim = new P.Simulation(device, DONNEES, { entrees: table.entrees, largeurCqh: L, actif: true, formes: { vue: formes.vue } });
sim.avancer(2.5, zones);
await device.queue.onSubmittedWorkDone();
const etat = new Uint32Array((await sim.lireEtat(0)).buffer);
let vivantes = 0;
for (let s = 14; s < etat.length; s += 16) if (etat[s] === 1) vivantes++;
let t = 2.5;
const debut = performance.now();
for (let n = 0; n < 60; n++) {
  t += 1 / 30;
  sim.avancer(t, zones);
  await device.queue.onSubmittedWorkDone();
}
const capture = (performance.now() - debut) / 60;
const info = gpu.adaptateur && gpu.adaptateur.info ? gpu.adaptateur.info : {};
await envoyer({ webgpu: true, vivantes, obstacles: table.entrees.length - 3, formes: table.entrees.filter((e) => e.type === 4).length, capture,
  adaptateur: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') });
`;

test('performances : 100 000 particules contre 16 obstacles (dont 4 formes exactes)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const fichiers = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/formes.js'];
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers, donnees: AVEC_OBSTACLES, code: CODE_OBSTACLES }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`adaptateur : ${r.adaptateur || 'inconnu'}`);
  t.diagnostic(`particules vivantes : ${r.vivantes} ; obstacles : ${r.obstacles} (dont ${r.formes} formes exactes)`);
  t.diagnostic(`capture : ${r.capture.toFixed(2)} ms de simulation par image avec collisions (spec : < 5 ms)`);
  assert.equal(r.obstacles, 16);
  assert.equal(r.formes, 4);
  assert.ok(r.vivantes > 90000, `${r.vivantes} particules vivantes`);
  if (process.env.PM_PERF === '1') assert.ok(r.capture < 5, `simulation avec collisions : ${r.capture.toFixed(2)} ms par image`);
});

// 100 000 particules qui se posent et s'empilent sur le sol (un profil relaxé à chaque pas).
const EMPILEMENT = R.compiler({
  version: 1, nom: 'perf-empilement',
  emetteurs: [{ nom: 'neige',
    naissance: { debit: 50000, forme: { type: 'ancre' }, vitesse: { direction: [0, 1], cone: 30, valeur: [20, 40] }, vie: [2, 2], taille: [0.3, 0.6] },
    forces: [{ type: 'gravite', valeur: 40 }],
    collisions: { cibles: ['sol'], reponse: 'poser', empiler: true, epaisseur: 0.01, talus: 35, sol: 80 },
    rendu: { type: 'sprite', melange: 'additif' } }],
}, { dur: 8, graine: 1 }).effet;

const CODE_EMPILEMENT = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
const table = O.construireTable({ largeurCqh: L, solRecette: O.solDe(DONNEES), effet: DONNEES });
const ligne = new Float32Array(table.entrees.length * 8);
table.entrees.forEach((e, i) => O.ecrireRepere(ligne, i * 8, O.repereFixe(e.source, L, table.sol)));
const ZONE = [20, 40, 137, 1];
const zones = { a: () => ZONE, grille: () => ZONE, reperes: () => ligne };
const sim = new P.Simulation(device, DONNEES, { entrees: table.entrees, largeurCqh: L, actif: true, tans: table.tans });
sim.avancer(2.5, zones);
await device.queue.onSubmittedWorkDone();
const etat = new Uint32Array((await sim.lireEtat(0)).buffer);
const contacts = new Uint32Array((await sim.lireContacts(0)).buffer);
let vivantes = 0;
let posees = 0;
for (let s = 0; s < etat.length / 16; s++) if (etat[s * 16 + 14] === 1) { vivantes++; if (contacts[s * 8 + 2] !== 0xffffffff) posees++; }
let t = 2.5;
const debut = performance.now();
for (let n = 0; n < 60; n++) {
  t += 1 / 30;
  sim.avancer(t, zones);
  await device.queue.onSubmittedWorkDone();
}
const capture = (performance.now() - debut) / 60;
const h = await sim.lireHauteurs();
const info = gpu.adaptateur && gpu.adaptateur.info ? gpu.adaptateur.info : {};
await envoyer({ webgpu: true, vivantes, posees, profils: table.tans.length, hMax: Math.max(...h), capture,
  adaptateur: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') });
`;

test('performances : 100 000 particules qui s\'empilent sur le sol (un profil relaxé à chaque pas)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const fichiers = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js'];
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers, donnees: EMPILEMENT, code: CODE_EMPILEMENT }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`adaptateur : ${r.adaptateur || 'inconnu'}`);
  t.diagnostic(`particules vivantes : ${r.vivantes} (dont ${r.posees} posées) ; profils : ${r.profils} ; couche max ${r.hMax.toFixed(2)} cqh`);
  t.diagnostic(`capture : ${r.capture.toFixed(2)} ms de simulation par image avec empilement (spec : < 5 ms)`);
  assert.equal(r.profils, 1);
  assert.ok(r.vivantes > 90000, `${r.vivantes} particules vivantes`);
  assert.ok(r.posees > 10000, `${r.posees} particules posées`);
  if (process.env.PM_PERF === '1') assert.ok(r.capture < 5, `simulation avec empilement : ${r.capture.toFixed(2)} ms par image`);
});
