'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js', 'particules/rendu.js'];
const NEUTRE = { bloom: 0, tons: 'neutre' };

function compiler(emetteurs, dur = 1) {
  const r = R.compiler({ version: 1, nom: 'essai', rendu_calque: NEUTRE, emetteurs }, { dur, graine: 5, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

/** Canvas de 1777 × 1000 : 1 cqh = 10 pixels (largeur 177,7 cqh). */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const canvas = document.createElement('canvas');
canvas.width = 1777;
canvas.height = 1000;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
const OPTIONS = { largeurCqh: 177.7, dureeImage: 1 / 30, bloom: 0, seuil: 1, tons: 'neutre' };
const pixel = (px, x, y) => Array.from(px.donnees.slice((y * px.largeur + x) * 4, (y * px.largeur + x) * 4 + 4));
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

const flaque = (rendu) => [{ nom: 'f', naissance: { salves: [{ t: 0, nombre: 600 }], forme: { type: 'rectangle' }, vie: [10, 10], taille: [1.4, 1.4] }, rendu }];

test('rendu fluide : nappe continue de la teinte, transparente ailleurs, sans tri ; cible redimensionnée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler(flaque({ type: 'fluide', teinte: '#2060ff', opacite: 0.9, absorption: 1, lissage: 0.5 }));
  const r = await page({ effet }, `
// 600 particules sur 20 × 10 cqh : pixels [600, 800) × [400, 500).
const zones = { a: () => [60, 40, 20, 10], grille: () => [60, 40, 20, 10] };
const sim = new P.Simulation(device, DONNEES.effet, null, null, 177.7);
const d = sim.avancer(0.5, zones);
rendu.dessiner(cible, [{ sim, i: 0, delta: d[0] }], OPTIONS);
const px = await rendu.lirePixels(cible);
let couverts = 0;
let total = 0;
for (let y = 420; y < 480; y += 2) for (let x = 620; x < 780; x += 2) { total++; if (px.donnees[(y * px.largeur + x) * 4 + 3] >= 64) couverts++; }
const trie = rendu.estTrie(sim.emetteurs[0]);
canvas.width = 888;
canvas.height = 500;
const cible2 = rendu.cible(canvas);
rendu.dessiner(cible2, [{ sim, i: 0, delta: d[0] }], OPTIONS);
const px2 = await rendu.lirePixels(cible2);
rendu.oublier(sim);
sim.detruire();
await envoyer({ webgpu: true, centre: pixel(px, 700, 450), dehors: pixel(px, 300, 450), couverts: couverts / total, trie, centre2: pixel(px2, 350, 225), vide: cible.vide });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.trie, false, 'un émetteur « fluide » n\'est pas trié');
  assert.equal(r.vide, false);
  assert.ok(r.couverts >= 0.98, `${(r.couverts * 100).toFixed(1)} % de l'intérieur couvert : nappe continue`);
  assert.ok(r.centre[3] > 150, `alpha au centre ${r.centre[3]}`);
  assert.ok(r.centre[2] > r.centre[0] + 40, `teinte bleue au centre : ${r.centre}`);
  assert.deepEqual(r.dehors, [0, 0, 0, 0], 'transparent hors de la nappe');
  assert.ok(r.centre2[3] > 100, `cible redimensionnée : alpha ${r.centre2[3]}`);
});

test('rendu fluide identique par deux chemins (fluide simulé sur un sol, retour en arrière)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const eau = compiler([{ nom: 'eau', naissance: { salves: [{ t: 0, nombre: 800 }], forme: { type: 'rectangle' }, vie: [30, 30], taille: [1.2, 1.2] },
    forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['sol'], restitution: 0, frottement: 0.05 },
    interactions: { type: 'fluide', rayon: 2 }, rendu: { type: 'fluide', teinte: '#3a9bdc', lissage: 1 } }]);
  const r = await page({ eau }, `
const table = O.construireTable({ largeurCqh: 177.7, solRecette: 90 });
const fixes = new Float32Array(table.entrees.length * 8);
table.entrees.forEach((e, i) => O.ecrireRepere(fixes, i * 8, O.repereFixe(e.source, 177.7, table.sol)));
const m = { entrees: table.entrees, largeurCqh: 177.7, actif: true };
const zones = { a: () => [70, 50, 30, 20], grille: () => [70, 50, 30, 20], reperes: () => fixes };
async function image(chemin) {
  const sim = new P.Simulation(device, DONNEES.eau, m, null, 177.7);
  let d = null;
  for (const t of chemin) d = sim.avancer(t, zones);
  rendu.dessiner(cible, [{ sim, i: 0, delta: d[0] }], OPTIONS);
  const px = await rendu.lirePixels(cible);
  rendu.oublier(sim);
  sim.detruire();
  return px.donnees;
}
const a = await image([2]);
const b = await image([0.5, 2.6, 1, 2]);
let ecart = 0;
let opaques = 0;
for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
for (let i = 3; i < a.length; i += 4) if (a[i] > 0) opaques++;
await envoyer({ webgpu: true, ecart, opaques });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.ecart, 0, 'même image au bit près par deux chemins');
  assert.ok(r.opaques > 1000, `${r.opaques} pixels de nappe`);
});

test('rendu fluide : réfraction de la photographie de la scène ; sans photographie, réfraction ignorée (image d\'une réfraction nulle)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const verre = (refraction) => compiler(flaque({ type: 'fluide', teinte: '#ffffff', opacite: 0.1, absorption: 0.2, refraction, lissage: 0.5 }));
  const r = await page({ avec: verre(0.8), sans: verre(0) }, `
// Photographie de synthèse de la scène : bandes verticales rouges et vertes de 20 px.
const c2 = document.createElement('canvas');
c2.width = 1777;
c2.height = 1000;
const g = c2.getContext('2d');
for (let x = 0; x < 1777; x += 40) { g.fillStyle = '#ff0000'; g.fillRect(x, 0, 20, 1000); g.fillStyle = '#00ff00'; g.fillRect(x + 20, 0, 20, 1000); }
const bitmap = await createImageBitmap(c2);
const vue = rendu.photo('s', bitmap);
const memeVue = rendu.photo('s', bitmap) === vue;
const zones = { a: () => [60, 40, 20, 10], grille: () => [60, 40, 20, 10] };
async function image(effet, photoScene) {
  const sim = new P.Simulation(device, effet, null, null, 177.7);
  const d = sim.avancer(0.5, zones);
  rendu.dessiner(cible, [{ sim, i: 0, delta: d[0] }], Object.assign({ photoScene }, OPTIONS));
  const px = await rendu.lirePixels(cible);
  rendu.oublier(sim);
  sim.detruire();
  return px.donnees;
}
const avecPhoto = await image(DONNEES.avec, vue);
const sansPhoto = await image(DONNEES.avec, null);
const sansRefraction = await image(DONNEES.sans, null);
let rouges = 0;
let verts = 0;
for (let x = 620; x < 780; x++) {
  const k = (450 * 1777 + x) * 4;
  if (avecPhoto[k] > avecPhoto[k + 1] + 60) rouges++;
  if (avecPhoto[k + 1] > avecPhoto[k] + 60) verts++;
}
let ecartSans = 0;
let ecartAvec = 0;
for (let i = 0; i < avecPhoto.length; i++) {
  ecartSans = Math.max(ecartSans, Math.abs(sansPhoto[i] - sansRefraction[i]));
  ecartAvec = Math.max(ecartAvec, Math.abs(avecPhoto[i] - sansPhoto[i]));
}
const dehors = Array.from(avecPhoto.slice((450 * 1777 + 300) * 4, (450 * 1777 + 300) * 4 + 4));
rendu.oublierPhoto('s');
await envoyer({ webgpu: true, rouges, verts, ecartSans, ecartAvec, dehors, memeVue });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.memeVue, true, 'photographie de même taille : texture et vue réutilisées');
  assert.ok(r.rouges >= 20 && r.verts >= 20, `bandes vues à travers le fluide : ${r.rouges} rouges, ${r.verts} vertes`);
  assert.ok(r.ecartAvec > 50, 'la réfraction change l\'image');
  assert.equal(r.ecartSans, 0, 'sans photographie : exactement l\'image d\'une réfraction nulle');
  assert.deepEqual(r.dehors, [0, 0, 0, 0], 'hors du fluide : ni photographie ni teinte');
});
