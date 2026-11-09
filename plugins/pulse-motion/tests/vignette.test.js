'use strict';
/* Vignettes des planches de regard réduites dans Node (scripts/lib/vignette.js) : la réduction faite par le navigateur
 * ne donnait pas toujours les mêmes pixels, et « deux planches du même projet sont identiques à l'octet » (spec S2, 5.4). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { reduirePng, poidsAxe } = require('../scripts/lib/vignette.js');
const { decoderPNG } = require('../scripts/logo.js');
const { pngRGBA } = require('./aide/png.js');

test('vignette : moyenne exacte des surfaces, taille demandée, identique à l\'octet', () => {
  // Damier 1 px noir et blanc : réduit de moitié, gris moyen partout.
  const damier = pngRGBA(8, 6, (x, y) => ((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  const r = reduirePng(damier, 4, 3);
  const d = decoderPNG(r);
  assert.deepEqual([d.largeur, d.hauteur], [4, 3]);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) assert.deepEqual(d.pixel(x, y), [128, 128, 128, 255]);
  assert.ok(reduirePng(damier, 4, 3).equals(r), 'même entrée, mêmes octets');
  // Bande rouge à gauche, bleue à droite, réduite à 2 × 1 : chaque moitié garde sa couleur.
  const bandes = pngRGBA(10, 4, (x) => (x < 5 ? [200, 0, 0, 255] : [0, 0, 200, 255]));
  const b = decoderPNG(reduirePng(bandes, 2, 1));
  assert.deepEqual(b.pixel(0, 0), [200, 0, 0, 255]);
  assert.deepEqual(b.pixel(1, 0), [0, 0, 200, 255]);
  // Rapport non entier : les poids d'un pixel cible font 1.
  for (const liste of poidsAxe(1280, 381)) assert.ok(Math.abs(liste.reduce((s, [, p]) => s + p, 0) - 1) < 1e-9);
});
