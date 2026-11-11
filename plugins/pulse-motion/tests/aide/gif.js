'use strict';
/* GIF animé écrit à la main pour les tests d'import (spec S6, 5.14) : des images d'une seule couleur (palette de 4), chacune
 * avec sa durée (en centièmes de seconde). Compression LZW sans dictionnaire (codes littéraux, effacement régulier) : valide
 * pour tout décodeur, simple à écrire. */

function lzw(indices, min = 2) {
  const clear = 1 << min, fin = clear + 1;
  const octets = [];
  let tampon = 0, bits = 0;
  const ecrire = (code, taille) => {
    tampon |= code << bits;
    bits += taille;
    while (bits >= 8) { octets.push(tampon & 0xff); tampon >>>= 8; bits -= 8; }
  };
  let taille = min + 1, suivant = fin + 1, premier = true;
  ecrire(clear, taille);
  for (const p of indices) {
    ecrire(p, taille);
    if (!premier) { suivant++; if (suivant === (1 << taille) && taille < 12) taille++; }
    premier = false;
    if (taille >= 8) { ecrire(clear, taille); taille = min + 1; suivant = fin + 1; premier = true; }
  }
  ecrire(fin, taille);
  if (bits > 0) octets.push(tampon & 0xff);
  const blocs = [];
  for (let i = 0; i < octets.length; i += 255) { const b = octets.slice(i, i + 255); blocs.push(b.length, ...b); }
  return [min, ...blocs, 0];
}

/** -> Buffer d'un GIF de largeur × hauteur ; images : [{ couleur: 0..3, centiemes }] ; palette : 4 couleurs [r, v, b]. */
function gifAnime({ largeur = 64, hauteur = 36, images, palette = [[220, 30, 30], [30, 180, 60], [30, 60, 220], [240, 240, 240]] }) {
  const o = [];
  const mot = (n) => o.push(n & 0xff, (n >> 8) & 0xff);
  o.push(...Buffer.from('GIF89a', 'ascii'));
  mot(largeur); mot(hauteur);
  o.push(0xf1, 0, 0);
  for (const c of palette) o.push(...c);
  // Boucle infinie (extension NETSCAPE2.0).
  o.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0, 0, 0);
  for (const im of images) {
    o.push(0x21, 0xf9, 0x04, 0x04); mot(im.centiemes); o.push(0, 0);
    o.push(0x2c); mot(0); mot(0); mot(largeur); mot(hauteur); o.push(0);
    o.push(...lzw(new Array(largeur * hauteur).fill(im.couleur)));
  }
  o.push(0x3b);
  return Buffer.from(o);
}

module.exports = { gifAnime };
