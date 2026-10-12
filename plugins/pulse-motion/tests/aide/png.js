'use strict';
/* Encodeur PNG minimal pour les tests : RGBA 8 bits (filtres variés) ou palette. */
const zlib = require('node:zlib');

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function bloc(type, donnees) {
  const t = Buffer.from(type, 'latin1');
  const l = Buffer.alloc(4); l.writeUInt32BE(donnees.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, donnees])));
  return Buffer.concat([l, t, donnees, c]);
}
const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

/** pixels(x, y) -> [r, g, b, a] ; la ligne y utilise le filtre y % 5. */
function pngRGBA(largeur, hauteur, pixels, { entrelace = false, profondeur = 8 } = {}) {
  const stride = largeur * 4;
  const lignes = [];
  let precedente = Buffer.alloc(stride);
  for (let y = 0; y < hauteur; y++) {
    const ligne = Buffer.alloc(stride);
    for (let x = 0; x < largeur; x++) Buffer.from(pixels(x, y)).copy(ligne, x * 4);
    const filtre = y % 5;
    const sortie = Buffer.alloc(stride + 1);
    sortie[0] = filtre;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? ligne[i - 4] : 0; const b = precedente[i]; const c = i >= 4 ? precedente[i - 4] : 0;
      sortie[i + 1] = (ligne[i] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][filtre]) & 0xff;
    }
    lignes.push(sortie);
    precedente = ligne;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4); ihdr[8] = profondeur; ihdr[9] = 6; ihdr[12] = entrelace ? 1 : 0;
  return Buffer.concat([SIGNATURE, bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(Buffer.concat(lignes))), bloc('IEND', Buffer.alloc(0))]);
}

/** PNG à palette (filtre 0) ; alphas = transparence par index (tRNS). */
function pngPalette(largeur, hauteur, indices, palette, alphas = []) {
  const lignes = [];
  for (let y = 0; y < hauteur; y++) { const l = Buffer.alloc(largeur + 1); for (let x = 0; x < largeur; x++) l[x + 1] = indices(x, y); lignes.push(l); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4); ihdr[8] = 8; ihdr[9] = 3;
  const morceaux = [SIGNATURE, bloc('IHDR', ihdr), bloc('PLTE', Buffer.from(palette.flat()))];
  if (alphas.length) morceaux.push(bloc('tRNS', Buffer.from(alphas)));
  morceaux.push(bloc('IDAT', zlib.deflateSync(Buffer.concat(lignes))), bloc('IEND', Buffer.alloc(0)));
  return Buffer.concat(morceaux);
}

module.exports = { pngRGBA, pngPalette };
