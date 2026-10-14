'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js', 'particules/rendu.js'];
const NEUTRE = { bloom: 0, tons: 'neutre' };

function compiler(emetteurs, dur = 1, rendu_calque = NEUTRE) {
  const r = R.compiler({ version: 1, nom: 'essai', rendu_calque, emetteurs }, { dur, graine: 5, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

/** Canvas de 1777 × 1000 : 1 cqh = 10 pixels (largeur 177,7 cqh). Photographie de synthèse, repères, lecture. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const F = M.fragments;
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
function photo(Lx, Hy, couleur, largeurCqh = Lx, hauteurCqh = Hy) {
  const rgba = new Uint8ClampedArray(Lx * Hy * 4);
  for (let y = 0; y < Hy; y++) for (let x = 0; x < Lx; x++) rgba.set(couleur(x, y), (y * Lx + x) * 4);
  return { largeur: Lx, hauteur: Hy, rgba, largeurCqh, hauteurCqh };
}
function ancres(a, b = a) { return (g) => { const t = new Float32Array(16); O.ecrireRepere(t, 0, a(g)); O.ecrireRepere(t, 8, b(g)); return t; }; }
const lireP = (f) => { const u = new Uint32Array(f.buffer); const l = [];
  for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ s, n: u[s * 16 + 12], x: f[s * 16], y: f[s * 16 + 1] });
  return l; };
/** Plus grand écart (niveaux de 0 à 255, prémultiplié) entre le canvas et la photographie posée en (x0, y0) pixels. */
function ecartPhoto(px, ph, x0, y0) {
  let pire = 0;
  for (let j = 0; j < ph.hauteur; j++) for (let i = 0; i < ph.largeur; i++) {
    const c = ((y0 + j) * px.largeur + x0 + i) * 4;
    const r = (j * ph.largeur + i) * 4;
    const a = ph.rgba[r + 3] / 255;
    for (let k = 0; k < 3; k++) pire = Math.max(pire, Math.abs(px.donnees[c + k] - ph.rgba[r + k] * a));
    pire = Math.max(pire, Math.abs(px.donnees[c + 3] - ph.rgba[r + 3]));
  }
  return pire;
}
// Ancre de 6,4 × 3,2 cqh centrée en (50, 40) : boîte de pixels [468, 532) × [384, 416).
const ZONE = [46.8, 38.4, 6.4, 3.2];
const ANCRE = () => ({ centre: [50, 40], angle: 0, demi: [3.2, 1.6], echelle: [1, 1], actif: true });
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code })));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('rendu : grains tenus sur leurs pixels = la photographie au pixel près (tons neutres), sans tri', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const pix = compiler([{ nom: 'g', naissance: { forme: { type: 'pixels', densite: 1 }, vie: [20, 20] }, vie: { couleur: 'source' }, rendu: { texture: 'pixel', melange: 'alpha' } }]);
  const r = await page({ pix }, `
// 64 × 32 pixels de 0,1 cqh (un pixel du canvas chacun), bords haut et gauche transparents.
const ph = photo(64, 32, (x, y) => (x < 2 || y < 2 ? [0, 0, 0, 0] : [x * 4, y * 8, 200, 255]), 6.4, 3.2);
const liste = F.listerPixels(ph);
const frag = { a: F.permuter(liste, F.pasPremier(liste.total, 1)).donnees, b: null, eclats: null, image: null,
  demiA: liste.demi, demiB: [0, 0], coteA: liste.cote, coteB: 0 };
const zones = { a: () => ZONE, grille: () => ZONE, ancres: ancres(ANCRE) };
const sim = new P.Simulation(device, F.ajusterCapacites(DONNEES.pix, { 0: liste.total }), null, [frag]);
const d = sim.avancer(1.5 / 120, zones);
rendu.dessiner(cible, [{ sim, i: 0, delta: d[0] }], OPTIONS);
const px = await rendu.lirePixels(cible);
let dehors = 0;
for (let j = 370; j < 430; j++) for (const i of [460, 540]) dehors = Math.max(dehors, px.donnees[(j * px.largeur + i) * 4 + 3]);
const trie = rendu.estTrie(sim.emetteurs[0]);
sim.detruire();
await envoyer({ webgpu: true, pire: ecartPhoto(px, ph, 468, 384), dehors, trie });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.pire <= 2, `écart de ${r.pire} niveaux avec la photographie`);
  assert.equal(r.dehors, 0, 'rien hors de l\'élément');
  assert.equal(r.trie, false, 'fragments à profondeur constante : pas de tri');
});

test('rendu : métamorphose : couleur de A vers B le long du trajet, particule en trop qui sort en fondu', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const meta = compiler([{ nom: 'g', naissance: { forme: { type: 'pixels' } }, cible: { source: 'cible', arrivee: 'choree', a: 1 },
    vie: { couleur: 'source' }, rendu: { texture: 'pixel', melange: 'alpha' } }]);
  const r = await page({ meta }, `
// A : deux pixels rouges de 1 cqh, à 40 cqh l'un de l'autre ; B : un pixel bleu. La particule 1 est en trop côté B.
const A = F.listerPixels(photo(41, 1, (x) => (x === 0 || x === 40 ? [255, 0, 0, 255] : [0, 0, 0, 0])));
const B = F.listerPixels(photo(1, 1, () => [0, 0, 255, 255]));
const ap = F.apparier(A, B);
const frag = { a: ap.a, b: ap.b, eclats: null, image: null, demiA: A.demi, demiB: B.demi, coteA: A.cote, coteB: B.cote };
const zones = { a: () => [40, 29.5, 41, 1], grille: () => [40, 29.5, 41, 1], ancres: ancres(
  () => ({ centre: [60, 30], angle: 0, demi: [20.5, 0.5], echelle: [1, 1], actif: true }),
  () => ({ centre: [100, 70], angle: 0, demi: [0.5, 0.5], echelle: [1, 1], actif: true })) };
const sim = new P.Simulation(device, F.ajusterCapacites(DONNEES.meta, { 0: ap.total }), null, [frag]);
async function image(tau) {
  const d = sim.avancer(tau, zones);
  rendu.dessiner(cible, [{ sim, i: 0, delta: d[0] }], OPTIONS);
  const px = await rendu.lirePixels(cible);
  return lireP(await sim.lireEtat(0)).map((p) => {
    const c = (Math.round(p.y * 10) * px.largeur + Math.round(p.x * 10)) * 4;
    return { n: p.n, x: p.x, y: p.y, rgba: Array.from(px.donnees.slice(c, c + 4)) };
  });
}
const milieu = await image(0.5);
const fin = await image(119.5 / 120);
sim.detruire();
await envoyer({ webgpu: true, drapeaux: [Math.floor(ap.b[3] / 65536), Math.floor(ap.b[7] / 65536)], milieu, fin });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.drapeaux, [0, 2]);
  const [p0, p1] = [0, 1].map((n) => r.milieu.find((p) => p.n === n));
  assert.ok(Math.hypot(p0.x - p1.x, p0.y - p1.y) > 2, 'particules séparées à mi-trajet');
  // Mi-trajet : moitié rouge, moitié bleu en linéaire (0,5 -> 188 en sRGB) ; la particule en trop à moitié effacée.
  const pres = (a, b, tol, quoi) => assert.ok(Math.abs(a - b) <= tol, `${quoi} : ${a} au lieu de ${b}`);
  pres(p0.rgba[0], 188, 3, 'rouge'); pres(p0.rgba[1], 0, 2, 'vert'); pres(p0.rgba[2], 188, 3, 'bleu'); pres(p0.rgba[3], 255, 1, 'alpha');
  pres(p1.rgba[3], 128, 3, 'alpha de la particule qui sort'); pres(p1.rgba[0], 94, 3, 'rouge prémultiplié'); pres(p1.rgba[2], 94, 3, 'bleu prémultiplié');
  // Arrivée : bleu de B, opaque.
  const f0 = r.fin.find((p) => p.n === 0);
  assert.ok(f0.rgba[2] >= 250 && f0.rgba[0] <= 20 && f0.rgba[3] >= 250, `couleur d'arrivée ${f0.rgba}`);
});
