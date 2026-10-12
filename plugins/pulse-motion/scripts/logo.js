#!/usr/bin/env node
'use strict';
/* Pulse Motion – couleurs d'un logo (SVG ou PNG), sans dépendance.
 *
 *   node scripts/logo.js <fichier>        couleurs dominantes { primaire, accent } (JSON)
 *
 * Utilisé par « pulse-motion charte depuis-logo », qui les rend lisibles sur le fond du style.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { hexVersOklab, versOklch, depuisOklch } = require('./lib/couleurs.js');

const NOMS_CSS = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', navy: '#000080', teal: '#008080', gray: '#808080', grey: '#808080',
  maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', silver: '#c0c0c0',
};
const ECHANTILLONS_MAX = 40000;
const SIGNATURE_PNG = Buffer.from('89504e470d0a1a0a', 'hex');

function normaliserCouleur(valeur) {
  const v = String(valeur).trim().toLowerCase();
  if (NOMS_CSS[v]) return NOMS_CSS[v];
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${[...m[1]].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

/** Couleurs des attributs et styles fill, stroke, stop-color, comptées. */
function couleursSVG(texte) {
  const poids = new Map();
  const re = /\b(?:fill|stroke|stop-color)\s*(?:=\s*["']|:\s*)\s*(#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)|[a-zA-Z]+)/g;
  for (const m of String(texte).matchAll(re)) {
    const hex = normaliserCouleur(m[1]);
    if (hex) poids.set(hex, (poids.get(hex) || 0) + 1);
  }
  return [...poids].map(([hex, p]) => ({ hex, poids: p }));
}

const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/** Erreur prévue, au message déjà en français (les autres deviennent « image PNG abîmée »). */
class ErreurImage extends Error {}

/**
 * PNG non entrelacé, 8 bits par couleur (1, 2 ou 4 bits aussi pour la palette et les gris)
 * -> { largeur, hauteur, pixel(x, y) -> [r, g, b, a] }.
 */
function decoderPNG(buf) {
  try {
    return decoder(buf);
  } catch (e) {
    if (e instanceof ErreurImage) throw new Error(e.message);
    throw new Error('image PNG abîmée : réenregistrez le logo, ou donnez-le en SVG');
  }
}

function decoder(buf) {
  if (!Buffer.isBuffer(buf) || !buf.subarray(0, 8).equals(SIGNATURE_PNG)) throw new ErreurImage('ce fichier n\'est pas une image PNG');
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let alphas = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const longueur = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const donnees = buf.subarray(pos + 8, pos + 8 + longueur);
    if (type === 'IHDR') {
      if (donnees.length < 13) throw new ErreurImage('image PNG abîmée (en-tête incomplet)');
      ihdr = { largeur: donnees.readUInt32BE(0), hauteur: donnees.readUInt32BE(4), profondeur: donnees[8], type: donnees[9], entrelace: donnees[12] };
    } else if (type === 'PLTE') palette = donnees;
    else if (type === 'tRNS') alphas = donnees;
    else if (type === 'IDAT') idat.push(donnees);
    else if (type === 'IEND') break;
    pos += 12 + longueur;
  }
  if (!ihdr) throw new ErreurImage('image PNG illisible');
  if (ihdr.entrelace) throw new ErreurImage('PNG entrelacé non pris en charge : réenregistrez le logo en PNG non entrelacé, ou donnez-le en SVG');
  const canaux = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.type];
  if (!canaux || (ihdr.type === 3 && !palette)) throw new ErreurImage('type de PNG non pris en charge : réenregistrez le logo en PNG couleur, ou donnez-le en SVG');
  const profondeurs = ihdr.type === 0 || ihdr.type === 3 ? [1, 2, 4, 8] : [8];
  if (!profondeurs.includes(ihdr.profondeur)) throw new ErreurImage(`PNG en ${ihdr.profondeur} bits par couleur non pris en charge : réenregistrez le logo en PNG 8 bits, ou donnez-le en SVG`);
  const { largeur, hauteur, profondeur } = ihdr;
  const stride = Math.ceil((largeur * canaux * profondeur) / 8);
  const pas = Math.max(1, (canaux * profondeur) >> 3);
  let brut;
  try { brut = zlib.inflateSync(Buffer.concat(idat)); } catch { throw new ErreurImage('image PNG abîmée'); }
  if (brut.length < hauteur * (stride + 1)) throw new ErreurImage('image PNG abîmée');
  const px = Buffer.alloc(stride * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const ligne = y * stride;
    const precedente = ligne - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= pas ? px[ligne + i - pas] : 0;
      const b = y ? px[precedente + i] : 0;
      const c = y && i >= pas ? px[precedente + i - pas] : 0;
      const prediction = filtre === 1 ? a : filtre === 2 ? b : filtre === 3 ? (a + b) >> 1 : filtre === 4 ? paeth(a, b, c) : 0;
      px[ligne + i] = (brut[source + i] + prediction) & 0xff;
    }
  }
  // Valeur d'un échantillon de moins de 8 bits (palette, gris).
  const echantillon = (x, y) => {
    const bit = x * profondeur;
    return (px[y * stride + (bit >> 3)] >> (8 - profondeur - (bit & 7))) & ((1 << profondeur) - 1);
  };
  const pixel = (x, y) => {
    const o = y * stride + x * canaux;
    switch (ihdr.type) {
      case 0: { const v = profondeur === 8 ? px[o] : Math.round((echantillon(x, y) * 255) / ((1 << profondeur) - 1)); return [v, v, v, 255]; }
      case 2: return [px[o], px[o + 1], px[o + 2], 255];
      case 3: {
        const k = profondeur === 8 ? px[o] : echantillon(x, y);
        if (k * 3 + 2 >= palette.length) throw new Error('image PNG abîmée (couleur hors de la palette) : réenregistrez le logo, ou donnez-le en SVG');
        return [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], alphas && k < alphas.length ? alphas[k] : 255];
      }
      case 4: return [px[o], px[o], px[o], px[o + 1]];
      default: return [px[o], px[o + 1], px[o + 2], px[o + 3]];
    }
  };
  return { largeur, hauteur, pixel };
}

function couleursPNG(buf) {
  const { largeur, hauteur, pixel } = decoderPNG(buf);
  const pas = Math.max(1, Math.ceil(Math.sqrt((largeur * hauteur) / ECHANTILLONS_MAX)));
  const poids = new Map();
  for (let y = 0; y < hauteur; y += pas) {
    for (let x = 0; x < largeur; x += pas) {
      const [r, g, b, a] = pixel(x, y);
      if (a < 128) continue;
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      poids.set(hex, (poids.get(hex) || 0) + 1);
    }
  }
  return [...poids].map(([hex, p]) => ({ hex, poids: p }));
}

/** Fichier de logo -> [{ hex, poids }] ; lève une erreur en français pour un format non lu. */
function couleursLogo(fichier) {
  const ext = path.extname(fichier).toLowerCase();
  if (ext === '.svg') return couleursSVG(fs.readFileSync(fichier, 'utf8'));
  if (ext === '.png') return couleursPNG(fs.readFileSync(fichier));
  throw new Error('Donnez le logo en PNG ou en SVG : les autres formats (JPEG, WebP…) ne sont pas lus');
}

const distance2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
const ecartTeinte = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * Primaire et accent d'un ensemble de couleurs pondérées (OKLab, k-moyennes k ≤ 5, départ déterministe).
 * Quasi blancs (L > 0,95) et quasi noirs (L < 0,12) écartés. -> { primaire, accent } | null
 */
function couleursDominantes(echantillons) {
  const points = echantillons.map((e) => ({ ...e, lab: hexVersOklab(e.hex) })).filter((p) => p.lab[0] >= 0.12 && p.lab[0] <= 0.95);
  if (!points.length) return null;
  let centres = [...points].sort((a, b) => b.poids - a.poids || (a.hex < b.hex ? -1 : 1)).slice(0, Math.min(5, points.length)).map((p) => p.lab);
  let groupes = [];
  for (let tour = 0; tour < 20; tour++) {
    groupes = centres.map(() => []);
    for (const p of points) {
      let meilleur = 0;
      centres.forEach((c, i) => { if (distance2(p.lab, c) < distance2(p.lab, centres[meilleur])) meilleur = i; });
      groupes[meilleur].push(p);
    }
    centres = groupes.map((g, i) => {
      if (!g.length) return centres[i];
      const total = g.reduce((s, p) => s + p.poids, 0);
      return [0, 1, 2].map((j) => g.reduce((s, p) => s + p.lab[j] * p.poids, 0) / total);
    });
  }
  const total = points.reduce((s, p) => s + p.poids, 0);
  const classes = groupes.filter((g) => g.length).map((g) => {
    const part = g.reduce((s, p) => s + p.poids, 0) / total;
    const representant = [...g].sort((a, b) => b.poids - a.poids || (a.hex < b.hex ? -1 : 1))[0];
    const { C, h } = versOklch(representant.hex);
    return { hex: representant.hex, C, h, score: part * (0.5 + C) };
  }).sort((a, b) => b.score - a.score);
  const primaire = classes[0];
  const autre = classes.slice(1).find((c) => c.C > 0.02 && ecartTeinte(c.h, primaire.h) > 30);
  if (autre) return { primaire: primaire.hex, accent: autre.hex };
  const o = versOklch(primaire.hex);
  return { primaire: primaire.hex, accent: depuisOklch({ ...o, L: o.L > 0.5 ? o.L - 0.25 : o.L + 0.25 }) };
}

if (require.main === module) {
  try {
    const r = couleursDominantes(couleursLogo(process.argv[2] || ''));
    console.log(JSON.stringify(r, null, 2));
    process.exit(r ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { couleursSVG, decoderPNG, couleursLogo, couleursDominantes, normaliserCouleur };
