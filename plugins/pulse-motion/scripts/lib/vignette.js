'use strict';
/* Pulse Motion – vignettes des planches de regard réduites dans Node, à l'identique d'un passage à l'autre.
 * Réduire une image de 1 280 px dans la page (par le navigateur, sur la carte graphique) ne donnait pas toujours les
 * mêmes pixels : la planche est donc composée d'images déjà à leur taille, affichées sans mise à l'échelle.
 *
 *   reduirePng(png, largeur, hauteur) -> Buffer PNG (RVB 8 bits) de largeur × hauteur, moyenne exacte des surfaces.
 */
const zlib = require('node:zlib');
const { decoderPNG } = require('../logo.js');

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function bloc(type, donnees) {
  const l = Buffer.alloc(4); l.writeUInt32BE(donnees.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), donnees]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
}

/** PNG RVB 8 bits, sans filtre, compressé. pixels : Uint8Array largeur × hauteur × 3. */
function encoderPng(largeur, hauteur, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RVB
  const brut = Buffer.alloc(hauteur * (largeur * 3 + 1));
  for (let y = 0; y < hauteur; y++) Buffer.from(pixels.buffer, pixels.byteOffset + y * largeur * 3, largeur * 3).copy(brut, y * (largeur * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut, { level: 6 })), bloc('IEND', Buffer.alloc(0))]);
}

/** Poids des pixels sources de chaque pixel cible sur un axe (moyenne des surfaces) : [[[indice, poids]…]…]. */
function poidsAxe(source, cible) {
  const r = [];
  const pas = source / cible;
  for (let i = 0; i < cible; i++) {
    const a = i * pas, b = (i + 1) * pas;
    const liste = [];
    for (let s = Math.floor(a); s < Math.min(source, Math.ceil(b)); s++) {
      const p = Math.min(b, s + 1) - Math.max(a, s);
      if (p > 0) liste.push([s, p / pas]);
    }
    r.push(liste);
  }
  return r;
}

function reduirePng(png, largeur, hauteur) {
  const { largeur: L, hauteur: H, pixel } = decoderPNG(png);
  // Les pixels sources une fois (RVB), sur fond noir pour une image transparente (les captures sont opaques).
  const src = new Float64Array(L * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const [r, v, b, a] = pixel(x, y);
    const o = (y * L + x) * 3, k = a / 255;
    src[o] = r * k; src[o + 1] = v * k; src[o + 2] = b * k;
  }
  const px = poidsAxe(L, largeur);
  const py = poidsAxe(H, hauteur);
  // Horizontal, puis vertical.
  const tmp = new Float64Array(largeur * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < largeur; x++) {
    let r = 0, v = 0, b = 0;
    for (const [s, p] of px[x]) { const o = (y * L + s) * 3; r += src[o] * p; v += src[o + 1] * p; b += src[o + 2] * p; }
    const o = (y * largeur + x) * 3; tmp[o] = r; tmp[o + 1] = v; tmp[o + 2] = b;
  }
  const out = new Uint8Array(largeur * hauteur * 3);
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
    let r = 0, v = 0, b = 0;
    for (const [s, p] of py[y]) { const o = (s * largeur + x) * 3; r += tmp[o] * p; v += tmp[o + 1] * p; b += tmp[o + 2] * p; }
    const o = (y * largeur + x) * 3;
    out[o] = Math.min(255, Math.round(r)); out[o + 1] = Math.min(255, Math.round(v)); out[o + 2] = Math.min(255, Math.round(b));
  }
  return encoderPng(largeur, hauteur, out);
}

module.exports = { reduirePng, encoderPng, poidsAxe };
