'use strict';
/* Pulse Motion – PNG rapides pour le flou de mouvement (spec Rendu et export, 5.8) : les captures du navigateur (RVB ou RVBA,
 * 8 bits, non entrelacées) décodées dans un tableau, moyennées sur 16 bits, puis réencodées (zlib niveau 1, sans filtre :
 * l'image ne fait que passer à ffmpeg). Les autres PNG passent par le décodeur général de scripts/logo.js.
 *
 * decoder(png) -> { largeur, hauteur, canaux: 3 | 4, donnees: Uint8Array }
 * encoder({ largeur, hauteur, canaux, donnees }, { niveau? }) -> Buffer PNG
 * moyenne([png]) -> Buffer PNG : moyenne des images (mêmes tailles), arrondie ; une seule image : rendue telle quelle.
 * alphaOpaque(png, { seuil? }) -> part des pixels opaques (alpha ≥ seuil, 250 par défaut) ; 1 sans couche alpha.
 * verifierPNG(png, { sommes? }) -> null si l'image est complète, sinon la raison (structure, sommes de contrôle).
 */
const zlib = require('node:zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
// Somme de contrôle native quand Node l'a (22.2 et plus) : la vérification d'une image de 1080p prend alors une milliseconde.
const crc32Rapide = typeof zlib.crc32 === 'function' ? (buf) => zlib.crc32(buf) >>> 0 : crc32;

/**
 * Image PNG complète ? -> null si oui, sinon la raison en français. Signature, en-tête IHDR d'abord, chaque bloc dans le
 * fichier, IEND à la fin exacte ; sommes : vérifie aussi la somme de contrôle de chaque bloc (une image coupée, mêlée à une
 * autre ou abîmée en mémoire est reconnue avant d'être décodée). Sans sommes : seulement la structure, en quelques
 * microsecondes (chaque image capturée de l'export).
 */
function verifierPNG(buf, { sommes = true } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) return 'ce n\'est pas une image PNG';
  let pos = 8;
  let premier = true;
  while (pos + 12 <= buf.length) {
    const longueur = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (premier && type !== 'IHDR') return 'en-tête IHDR absent';
    premier = false;
    if (pos + 12 + longueur > buf.length) return `bloc ${type} coupé (image incomplète)`;
    if (sommes && crc32Rapide(buf.subarray(pos + 4, pos + 8 + longueur)) !== buf.readUInt32BE(pos + 8 + longueur)) return `bloc ${type} abîmé (somme de contrôle fausse)`;
    pos += 12 + longueur;
    if (type === 'IEND') return pos === buf.length ? null : 'données après la fin de l\'image';
  }
  return 'fin de l\'image absente (image incomplète)';
}
function bloc(type, donnees) {
  const l = Buffer.alloc(4); l.writeUInt32BE(donnees.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), donnees]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
}

/** Décodage général (palette, gris, 16 bits…) par scripts/logo.js, ramené en RVBA. */
function decoderGeneral(buf) {
  const { decoderPNG } = require('../logo.js');
  const img = decoderPNG(buf);
  const donnees = new Uint8Array(img.largeur * img.hauteur * 4);
  for (let y = 0, i = 0; y < img.hauteur; y++) for (let x = 0; x < img.largeur; x++, i += 4) donnees.set(img.pixel(x, y), i);
  return { largeur: img.largeur, hauteur: img.hauteur, canaux: 4, donnees };
}

function decoder(buf) {
  if (!Buffer.isBuffer(buf) || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('ce fichier n\'est pas une image PNG');
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const longueur = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + longueur);
    if (type === 'IHDR') ihdr = { largeur: d.readUInt32BE(0), hauteur: d.readUInt32BE(4), profondeur: d[8], type: d[9], entrelace: d[12] };
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    pos += 12 + longueur;
  }
  if (!ihdr) throw new Error('image PNG abîmée (en-tête absent)');
  if (ihdr.profondeur !== 8 || ihdr.entrelace || (ihdr.type !== 2 && ihdr.type !== 6)) return decoderGeneral(buf);
  const canaux = ihdr.type === 6 ? 4 : 3;
  const { largeur, hauteur } = ihdr;
  const brut = zlib.inflateSync(Buffer.concat(idat));
  const ligne = largeur * canaux;
  const donnees = new Uint8Array(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (ligne + 1)];
    const src = y * (ligne + 1) + 1;
    const dst = y * ligne;
    const haut = dst - ligne;
    for (let i = 0; i < ligne; i++) {
      const x = brut[src + i];
      const a = i >= canaux ? donnees[dst + i - canaux] : 0;
      const b = y > 0 ? donnees[haut + i] : 0;
      let v;
      if (filtre === 0) v = x;
      else if (filtre === 1) v = x + a;
      else if (filtre === 2) v = x + b;
      else if (filtre === 3) v = x + ((a + b) >> 1);
      else if (filtre === 4) {
        const c = y > 0 && i >= canaux ? donnees[haut + i - canaux] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('image PNG abîmée (filtre inconnu)');
      donnees[dst + i] = v & 0xff;
    }
  }
  return { largeur, hauteur, canaux, donnees };
}

function encoder({ largeur, hauteur, canaux, donnees }, { niveau = 1 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = canaux === 4 ? 6 : 2;
  const ligne = largeur * canaux;
  const brut = Buffer.alloc(hauteur * (ligne + 1));
  for (let y = 0; y < hauteur; y++) Buffer.from(donnees.buffer, donnees.byteOffset + y * ligne, ligne).copy(brut, y * (ligne + 1) + 1);
  return Buffer.concat([SIGNATURE, bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut, { level: niveau })), bloc('IEND', Buffer.alloc(0))]);
}

function moyenne(pngs) {
  if (!pngs.length) throw new Error('aucune image à moyenner');
  if (pngs.length === 1) return pngs[0];
  const images = pngs.map(decoder);
  const { largeur, hauteur } = images[0];
  // Les captures d'une même page ont le même format ; sinon, tout en RVBA.
  const canaux = images.every((x) => x.canaux === images[0].canaux) ? images[0].canaux : 4;
  const taille = largeur * hauteur * canaux;
  const somme = new Uint16Array(taille);
  for (const img of images) {
    if (img.largeur !== largeur || img.hauteur !== hauteur) throw new Error('sous-images de tailles différentes');
    const d = img.donnees;
    if (img.canaux === canaux) for (let i = 0; i < taille; i++) somme[i] += d[i];
    else for (let p = 0, i = 0; i < taille; p += 3, i += 4) { somme[i] += d[p]; somme[i + 1] += d[p + 1]; somme[i + 2] += d[p + 2]; somme[i + 3] += 255; }
  }
  const n = images.length;
  const demi = n >> 1;
  const sortie = new Uint8Array(taille);
  for (let i = 0; i < taille; i++) sortie[i] = ((somme[i] + demi) / n) | 0;
  return encoder({ largeur, hauteur, canaux, donnees: sortie });
}

function alphaOpaque(png, { seuil = 250 } = {}) {
  const img = decoder(png);
  if (img.canaux !== 4) return 1;
  let opaques = 0;
  const d = img.donnees;
  for (let i = 3; i < d.length; i += 4) if (d[i] >= seuil) opaques++;
  return opaques / (img.largeur * img.hauteur);
}

module.exports = { decoder, encoder, moyenne, alphaOpaque, verifierPNG };
