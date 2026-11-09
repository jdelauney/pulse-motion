'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { comparerImages, psnr, rgb } = require('../scripts/lib/images.js');
const { encoderPng } = require('../scripts/lib/vignette.js');

function image(fn, L = 20, H = 10) {
  const px = new Uint8Array(L * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) px.set(fn(x, y), (y * L + x) * 3);
  return encoderPng(L, H, px);
}
const gris = () => [100, 100, 100];

test('images.test.js › comparerImages : identiques 0, une case changée mesurée, carte de différence', () => {
  const a = image(gris);
  const r0 = comparerImages(a, image(gris));
  assert.deepEqual([r0.ecartMoyen, r0.ecartMax], [0, 0]);
  assert.equal(psnr(a, image(gris)), Infinity);
  // Une case de 5 × 5 pixels (25 sur 200) changée de 51 niveaux sur le rouge seulement.
  const b = image((x, y) => (x < 5 && y < 5 ? [151, 100, 100] : [100, 100, 100]));
  const r = comparerImages(a, b);
  assert.ok(Math.abs(r.ecartMax - 51 / 255) < 1e-9, String(r.ecartMax));
  assert.ok(Math.abs(r.ecartMoyen - (25 * 51) / (200 * 3 * 255)) < 1e-9, String(r.ecartMoyen));
  const carte = rgb(r.carte);
  assert.deepEqual([carte.largeur, carte.hauteur], [20, 10]);
  assert.equal(carte.rgb[0], 255, 'rouge là où ça change');
  assert.ok(carte.rgb[1] < 200);
  const loin = (9 * 20 + 19) * 3;
  assert.deepEqual([...carte.rgb.slice(loin, loin + 3)], [235, 235, 235], 'gris pâle là où rien ne change');
  assert.ok(psnr(a, b) > 20 && psnr(a, b) < 40);
  // Tailles différentes : écart maximal.
  assert.deepEqual(comparerImages(a, image(gris, 10, 10)), { ecartMoyen: 1, ecartMax: 1, carte: null });
});
