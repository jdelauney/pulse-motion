'use strict';
/* Spec Rendu et export, 5.15 : cadre de téléphone générique autour d'une vidéo verticale. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterFidele } = require('../scripts/export-fidele.js');
const T = require('../moteur/cadres/telephone.js');
const L = require('../scripts/lib/livrables.js');
const F = require('../scripts/lib/ffmpeg.js');
const { decoderPNG } = require('../scripts/logo.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };

/** Rectangle des pixels rouges francs d'une image PNG -> { x0, y0, x1, y1 } (bornes incluses). */
function rouge(png) {
  const im = decoderPNG(png);
  let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
  for (let y = 0; y < im.hauteur; y++) {
    for (let x = 0; x < im.largeur; x++) {
      const [r, g, b] = im.pixel(x, y);
      if (r > 200 && g < 60 && b < 60) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
  }
  return { x0, y0, x1, y1 };
}

test('cadre-telephone.test.js › 9:16 dans un cadre 16:9 : sortie 1920×1080, écran à l\'échelle exacte (un repère de la scène tombe à ±1 px de sa place calculée)', sans, async () => {
  const dir = miniProjet({
    scenes: [{ id: 'repere', duree: 1, transition: 'coupe', html: '<div data-decor style="position:absolute;left:25%;top:25%;width:20%;height:10%;background:#ff0000"></div>' }],
    deroule: { format: { ratio: '9:16', ips: 12 } },
  });
  const r = await exporterFidele({ dossier: dir, navigateur, outil, ips: 5, dureeSegment: 3, paralleles: 1, cadre: 'telephone' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'essai-telephone.mp4'));
  assert.deepEqual([r.largeur, r.hauteur], [1920, 1080]);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.deepEqual([s.largeur, s.hauteur], [1920, 1080]);
  const g = T.geometrie({ sortie: [1920, 1080], scene: [1080, 1920] });
  assert.ok(Math.abs(g.ecran.hauteur - 0.86 * 1080) < 1e-9);
  const k = g.echelle;
  const attendu = { x0: g.ecran.x + 0.25 * 1080 * k, y0: g.ecran.y + 0.25 * 1920 * k, x1: g.ecran.x + 0.45 * 1080 * k, y1: g.ecran.y + 0.35 * 1920 * k };
  const lu = rouge(await F.extraireImage({ ffmpeg: outil.chemin, fichier: r.fichier, t: 0.5 }));
  for (const c of ['x0', 'y0']) assert.ok(Math.abs(lu[c] - attendu[c]) <= 1, `${c} : ${lu[c]} au lieu de ${attendu[c]}`);
  for (const c of ['x1', 'y1']) assert.ok(Math.abs(lu[c] + 1 - attendu[c]) <= 1, `${c} : ${lu[c] + 1} au lieu de ${attendu[c]}`);
  // Carré : 1080 × 1080.
  assert.deepEqual(T.FORMATS['1:1'], [1080, 1080]);
});

test('cadre-telephone.test.js › vidéo 16:9 : option refusée ; format du cadre inconnu refusé', () => {
  const min = { duree: 4, scenes: [{ id: 'a', debut: 0, fin: 4, entree: 0 }] };
  assert.equal(L.preparerSortie({ deroule: { format: { ratio: '16:9' } }, minutage: min, ips: 30, cadre: 'telephone' }).erreur, 'Le cadre de téléphone est fait pour une vidéo verticale.');
  assert.match(L.preparerSortie({ deroule: { format: { ratio: '9:16' } }, minutage: min, ips: 30, cadre: 'telephone', cadreFormat: '4:3' }).erreur, /16:9 ou 1:1/);
  assert.equal(L.preparerSortie({ deroule: { format: { ratio: '9:16' } }, minutage: min, ips: 30, cadre: 'telephone' }).cadreFormat, '16:9');
  assert.equal(L.nomSortie('essai', { usage: 'reseaux', cadre: 'telephone' }), 'essai-reseaux-telephone.mp4');
});

test('cadre-telephone.test.js › aucun nom de marque dans le fichier du dessin', () => {
  const texte = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'cadres', 'telephone.js'), 'utf8');
  assert.doesNotMatch(texte, /iphone|apple|samsung|galaxy|\bpixel\b|google|android|huawei|xiaomi|oneplus|motorola|nokia|sony/i);
  const svg = T.svg(T.geometrie({ sortie: [1920, 1080] }), { fond: '#abcdef' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /fill="#abcdef"/);
  assert.match(svg, /fill="#111111"/);
  assert.doesNotMatch(svg, /<image|href=|https?:\/\/(?!www\.w3\.org)/, 'aucune ressource externe');
});
