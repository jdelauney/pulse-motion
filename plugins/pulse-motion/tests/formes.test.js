'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/gpu.js', 'particules/formes.js'];

test('formes : champ de distance signé d\'un disque et d\'un demi-masque (Jump Flooding)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const code = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
// Disque de rayon 32 px dans 64 × 64 px, la boîte représente 20 cqh : rayon 10 cqh.
const disque = new Uint8ClampedArray(64 * 64);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) disque[y * 64 + x] = (x + 0.5 - 32) ** 2 + (y + 0.5 - 32) ** 2 < 32 * 32 ? 255 : 0;
// Moitié droite pleine, 128 × 64 px, hauteur 10 cqh.
const moitie = new Uint8ClampedArray(128 * 64);
for (let y = 0; y < 64; y++) for (let x = 64; x < 128; x++) moitie[y * 128 + x] = 255;
const f = P.creerFormes(device, [
  { largeur: 64, hauteur: 64, alpha: disque, hauteurCqh: 20 },
  { largeur: 128, hauteur: 64, alpha: moitie, hauteurCqh: 10 },
]);
function demi(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}
async function couche(n) {
  const b = device.createBuffer({ size: 256 * 2048, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: f.texture, origin: [0, 0, n] }, { buffer: b, bytesPerRow: 2048 }, [256, 256, 1]);
  device.queue.submit([enc.finish()]);
  await b.mapAsync(GPUMapMode.READ);
  const u = new Uint16Array(b.getMappedRange().slice(0));
  b.unmap(); b.destroy();
  return (i, j, c) => demi(u[(j * 256 + i) * 4 + c]);
}
const d = await couche(0);
const m = await couche(1);
await envoyer({ webgpu: true, nombre: f.nombre,
  centre: d(128, 128, 0), dehors: d(20, 20, 0), coin: d(0, 0, 0), dessusMilieu: d(128, 0, 1), dessusBord: d(2, 0, 1),
  gauche: m(10, 128, 0), droite: m(250, 128, 0), frontiere: m(128, 128, 0), videDessus: m(10, 0, 1), pleinDessus: m(200, 0, 1) });`;
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, code })));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const pres = (a, b, tol, quoi) => assert.ok(Math.abs(a - b) <= tol, `${quoi} : ${a} au lieu de ${b}`);
  assert.equal(r.nombre, 2);
  // Disque : 1 px = 0,3125 cqh ; tolérance d'un pixel.
  pres(r.centre, -10, 0.35, 'centre du disque');
  // Texel (20, 20) : point (5,125 ; 5,125) px du masque, hors du disque.
  pres(r.dehors, (Math.hypot(32 - 5.125, 32 - 5.125) - 32) * 20 / 64, 0.35, 'hors du disque');
  pres(r.coin, (Math.hypot(31.875, 31.875) - 32) * 20 / 64, 0.35, 'coin');
  pres(r.dessusMilieu, -10, 0.35, 'dessus de la colonne du milieu (haut du disque)');
  assert.ok(r.dessusBord > -5 && r.dessusBord < 0, `dessus près du bord : ${r.dessusBord}`);
  // Moitié droite pleine : frontière au milieu de la boîte (x local = 0) ; 1 px = 10 / 64 cqh.
  pres(r.gauche, (64 - 10.5 / 256 * 128) * 10 / 64, 0.2, 'distance à la frontière depuis la gauche');
  assert.ok(r.droite < 0, 'dedans : négatif');
  pres(r.frontiere, 0, 0.2, 'sur la frontière');
  assert.equal(r.videDessus, 10000, 'colonne vide : 1e4 (exact en demi-précision)');
  pres(r.pleinDessus, -5, 0.2, 'colonne pleine : dessus en haut de la boîte');
});
