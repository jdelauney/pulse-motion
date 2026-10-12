'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const L = require('../scripts/logo.js');
const { pngRGBA, pngPalette } = require('./aide/png.js');

const BLEU = [0x1d, 0x4e, 0xd8, 255];
const ORANGE = [0xf5, 0x9e, 0x0b, 255];
const ecrire = (nom, contenu) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-logo-')), nom); fs.writeFileSync(f, contenu); return f; };

test('PNG RGBA (5 filtres) : pixels relus exactement', () => {
  const png = pngRGBA(7, 9, (x, y) => [x * 30, y * 20, (x + y) * 10, x === 0 ? 0 : 255]);
  const { largeur, hauteur, pixel } = L.decoderPNG(png);
  assert.deepEqual([largeur, hauteur], [7, 9]);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 7; x++) assert.deepEqual(pixel(x, y), [x * 30, y * 20, (x + y) * 10, x === 0 ? 0 : 255], `${x},${y}`);
});

test('logo PNG : bleu dominant en primaire, orange en accent ; transparent et blanc ignorés', () => {
  const png = pngRGBA(60, 40, (x, y) => (y === 0 ? [255, 255, 255, 255] : x < 40 ? BLEU : y < 30 ? ORANGE : [0, 0, 0, 0]));
  assert.deepEqual(L.couleursDominantes(L.couleursLogo(ecrire('logo.png', png))), { primaire: '#1d4ed8', accent: '#f59e0b' });
});

test('logo PNG à palette avec transparence', () => {
  const png = pngPalette(10, 10, (x) => (x < 2 ? 0 : x < 8 ? 1 : 2), [[0, 0, 0], [0x0f, 0x76, 0x6e], [0xe1, 0x1d, 0x48]], [0]);
  assert.deepEqual(L.couleursDominantes(L.couleursLogo(ecrire('logo.png', png))), { primaire: '#0f766e', accent: '#e11d48' });
});

test('logo SVG : fill, stroke, stop-color, noms et formes courtes ; une seule couleur → accent dérivé', () => {
  const svg = '<svg><rect fill="#1D4ED8"/><path style="fill:#1d4ed8;stroke:orange"/><stop stop-color="#f59e0b"/><g fill="none"><circle fill="url(#g)" stroke="#fff"/></g></svg>';
  assert.deepEqual(L.couleursSVG(svg), [{ hex: '#1d4ed8', poids: 2 }, { hex: '#ffa500', poids: 1 }, { hex: '#f59e0b', poids: 1 }, { hex: '#ffffff', poids: 1 }]);
  const seul = L.couleursDominantes(L.couleursSVG('<svg><rect fill="#1d4ed8"/></svg>'));
  assert.equal(seul.primaire, '#1d4ed8');
  assert.notEqual(seul.accent, '#1d4ed8');
  assert.equal(L.couleursDominantes(L.couleursSVG('<svg><rect fill="#000"/><rect fill="#fff"/></svg>')), null);
});

test('formats refusés avec un message clair', () => {
  assert.throws(() => L.couleursLogo(ecrire('logo.jpg', 'x')), /Donnez le logo en PNG ou en SVG/);
  assert.throws(() => L.couleursLogo(ecrire('logo.png', Buffer.from('\xff\xd8\xff\xe0JFIF', 'latin1'))), /n'est pas une image PNG/);
  assert.throws(() => L.decoderPNG(pngRGBA(2, 2, () => BLEU, { entrelace: true })), /PNG entrelacé/);
  assert.throws(() => L.decoderPNG(pngRGBA(2, 2, () => BLEU, { profondeur: 16 })), /16 bits/);
});

test('PNG à palette de 2 bits lu ; PNG ou palette abîmés : message en français', () => {
  const png2 = pngPalette(9, 4, (x) => (x < 2 ? 0 : x < 7 ? 1 : 2), [[0, 0, 0], [0x0f, 0x76, 0x6e], [0xe1, 0x1d, 0x48]], [0], 2);
  const { pixel } = L.decoderPNG(png2);
  assert.deepEqual([pixel(0, 0), pixel(3, 1), pixel(8, 3)], [[0, 0, 0, 0], [0x0f, 0x76, 0x6e, 255], [0xe1, 0x1d, 0x48, 255]]);
  assert.deepEqual(L.couleursDominantes(L.couleursLogo(ecrire('logo.png', png2))), { primaire: '#0f766e', accent: '#e11d48' });
  const court = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0])]);
  assert.throws(() => L.decoderPNG(court), /image PNG (abîmée|illisible)/);
  const horsPalette = pngPalette(4, 1, () => 3, [[0, 0, 0]], [], 8);
  assert.throws(() => L.couleursLogo(ecrire('logo.png', horsPalette)), /image PNG abîmée/);
});
