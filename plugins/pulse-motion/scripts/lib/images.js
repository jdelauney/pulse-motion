'use strict';
/* Pulse Motion – comparer deux images (spec S2, 5.13 et 5.14 ; réutilisé par S4 E5, avant/après).
 *
 *   rgb(png | { largeur, hauteur, rgb }) -> { largeur, hauteur, rgb: Uint8Array largeur × hauteur × 3 } (sur fond noir)
 *   comparerImages(a, b) -> { ecartMoyen, ecartMax, carte } : écart par canal, de 0 à 1 (moyenne et pire pixel) ; carte :
 *     PNG de la différence (gris pâle là où rien ne change, rouge d'autant plus vif que l'écart est grand).
 *   psnr(a, b) -> dB (Infinity si identiques) : rapport signal sur bruit de crête, sur les trois canaux.
 * Deux images de tailles différentes : écart maximal (1), PSNR nul.
 * Idées de reanimate (compare.ts, references/verify.md : plancher de bruit, écart moyen et maximal ; MIT, © Niaz Morshed),
 * réécrites sans pixelmatch. Module pur.
 */
const { decoderPNG } = require('../logo.js');
const { encoderPng } = require('./vignette.js');

function rgb(image) {
  if (image && image.rgb) return image;
  const { largeur, hauteur, pixel } = decoderPNG(image);
  const out = new Uint8Array(largeur * hauteur * 3);
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
    const [r, v, b, a] = pixel(x, y);
    const o = (y * largeur + x) * 3;
    const k = a / 255;
    out[o] = Math.round(r * k); out[o + 1] = Math.round(v * k); out[o + 2] = Math.round(b * k);
  }
  return { largeur, hauteur, rgb: out };
}

const memeTaille = (a, b) => a.largeur === b.largeur && a.hauteur === b.hauteur;

function comparerImages(imageA, imageB, { carte = true } = {}) {
  const a = rgb(imageA);
  const b = rgb(imageB);
  if (!memeTaille(a, b)) return { ecartMoyen: 1, ecartMax: 1, carte: null };
  const n = a.largeur * a.hauteur;
  const diff = carte ? new Uint8Array(n * 3) : null;
  let somme = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const dr = Math.abs(a.rgb[o] - b.rgb[o]);
    const dv = Math.abs(a.rgb[o + 1] - b.rgb[o + 1]);
    const db = Math.abs(a.rgb[o + 2] - b.rgb[o + 2]);
    somme += dr + dv + db;
    const pire = Math.max(dr, dv, db);
    if (pire > max) max = pire;
    if (diff) {
      if (pire === 0) { diff[o] = 235; diff[o + 1] = 235; diff[o + 2] = 235; } else {
        const k = Math.min(1, pire / 64);
        diff[o] = 255; diff[o + 1] = Math.round(200 * (1 - k)); diff[o + 2] = Math.round(200 * (1 - k));
      }
    }
  }
  return {
    ecartMoyen: somme / (n * 3 * 255),
    ecartMax: max / 255,
    carte: diff ? encoderPng(a.largeur, a.hauteur, diff) : null,
  };
}

function psnr(imageA, imageB) {
  const a = rgb(imageA);
  const b = rgb(imageB);
  if (!memeTaille(a, b)) return 0;
  let somme = 0;
  for (let i = 0; i < a.rgb.length; i++) { const d = a.rgb[i] - b.rgb[i]; somme += d * d; }
  if (somme === 0) return Infinity;
  const mse = somme / a.rgb.length;
  return 10 * Math.log10((255 * 255) / mse);
}

module.exports = { rgb, comparerImages, psnr };
