'use strict';
/* Mire des couleurs (spec Rendu et export, 5.2) : tests/fixtures/mire-couleurs, une scène d'aplats sur une grille de
 * 7 colonnes et 4 rangées. Mesure de l'écart de couleur (CIEDE2000) entre chaque aplat attendu et l'image décodée, par
 * ffmpeg ou par Chrome (balise video, image dessinée dans un canevas). Sert aux tests et à outils/mesures/usages.js. */
const fs = require('node:fs');
const path = require('node:path');
const { deltaE00 } = require('../../scripts/lib/couleurs.js');
const { decoderPNG } = require('../../scripts/logo.js');

const MIRE = path.join(__dirname, '..', 'fixtures', 'mire-couleurs');
const COLONNES = 7;
const RANGEES = 4;
/** Demi-côté du carré lu au centre de chaque case (en fraction de la case) : loin des bords, où la chrominance déborde. */
const DEMI = 0.15;

const rvb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Aplats de la mire : [{ hex, attendu: [r, v, b], cx, cy, rx, ry }] (centre et demi-côté en fraction de l'image). */
function aplats(dossier = MIRE) {
  const html = fs.readFileSync(path.join(dossier, 'scenes', '01-mire.html'), 'utf8');
  return [...html.matchAll(/data-aplat="(#[0-9a-f]{6})"/g)].map((m, i) => ({
    hex: m[1], attendu: rvb(m[1]),
    cx: ((i % COLONNES) + 0.5) / COLONNES, cy: (Math.floor(i / COLONNES) + 0.5) / RANGEES,
    rx: DEMI / COLONNES, ry: DEMI / RANGEES,
  }));
}

/** Moyenne d'un carré de chaque aplat dans une image (lire(x, y) -> [r, v, b]) -> [{ hex, mesure, deltaE }]. */
function ecarts(liste, largeur, hauteur, lire) {
  return liste.map((a) => {
    const x0 = Math.round((a.cx - a.rx) * largeur);
    const x1 = Math.round((a.cx + a.rx) * largeur);
    const y0 = Math.round((a.cy - a.ry) * hauteur);
    const y1 = Math.round((a.cy + a.ry) * hauteur);
    const s = [0, 0, 0];
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = lire(x, y); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; }
    const mesure = s.map((v) => Math.round((v / n) * 10) / 10);
    return { hex: a.hex, mesure, deltaE: Math.round(deltaE00(a.attendu, mesure) * 100) / 100 };
  });
}

/** Image PNG (décodée par ffmpeg) -> écarts. */
function ecartsPNG(png, liste = aplats()) {
  const im = decoderPNG(png);
  return ecarts(liste, im.largeur, im.hauteur, (x, y) => im.pixel(x, y));
}

/** Vidéo lue par Chrome : balise video, image à l'instant t dessinée dans un canevas, puis lue. -> écarts */
async function ecartsChrome({ navigateur, fichier, t = 0.5, liste = aplats(), largeur = 1920, hauteur = 1080 }) {
  const { ouvrirPage } = require('../../scripts/lib/cdp.js');
  // Petit serveur local : une vidéo lue depuis file:// rendrait le canevas illisible (origine différente).
  const http = require('node:http');
  const serveur = http.createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta charset="utf-8"><video id="v" muted preload="auto" src="/video.mp4"></video>'); return; }
    if (req.url === '/video.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); fs.createReadStream(fichier).pipe(res); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const page = await ouvrirPage({ navigateur, largeur: 800, hauteur: 600, delai: 60000 });
  try {
    await page.aller(`http://127.0.0.1:${serveur.address().port}/`);
    // Moyennes calculées dans la page (une image entière ne passe pas par le protocole).
    const carres = liste.map((a) => [Math.round((a.cx - a.rx) * largeur), Math.round((a.cy - a.ry) * hauteur), Math.round(2 * a.rx * largeur), Math.round(2 * a.ry * hauteur)]);
    const moyennes = await page.evaluer(`(async function () {
      var v = document.getElementById('v');
      if (v.readyState < 2) await new Promise(function (r, e) { v.onloadeddata = r; v.onerror = function () { e(new Error('vidéo illisible par Chrome')); }; });
      await new Promise(function (r) { v.onseeked = r; v.currentTime = ${Number(t)}; });
      var c = document.createElement('canvas'); c.width = ${largeur}; c.height = ${hauteur};
      var x = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
      x.drawImage(v, 0, 0, ${largeur}, ${hauteur});
      return ${JSON.stringify(carres)}.map(function (q) {
        var d = x.getImageData(q[0], q[1], q[2], q[3]).data, s = [0, 0, 0], n = 0;
        for (var i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
        return [s[0] / n, s[1] / n, s[2] / n];
      });
    })()`);
    return liste.map((a, i) => {
      const mesure = moyennes[i].map((v) => Math.round(v * 10) / 10);
      return { hex: a.hex, mesure, deltaE: Math.round(deltaE00(a.attendu, mesure) * 100) / 100 };
    });
  } finally {
    await page.fermer();
    await new Promise((r) => serveur.close(r));
  }
}

const pire = (e) => e.reduce((m, x) => (x.deltaE > m.deltaE ? x : m), { deltaE: 0 });

module.exports = { MIRE, aplats, ecarts, ecartsPNG, ecartsChrome, pire };
