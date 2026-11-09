'use strict';
/* Spec S2, 5.8 : règles de réalisation sur la vidéo rendue (M.mesurer), dans Chrome ou Edge sans fenêtre. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { pngRGBA } = require('./aide/png.js');
const SEUILS = require('../scripts/seuils.json');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

/** Constats de M.mesurer sur un petit projet (style clair-pedagogique). */
async function mesurer(o, { genre = 'formation', ratio = '16:9' } = {}) {
  const dir = miniProjet({ ...o, deroule: { genre, format: { ratio, ips: 30 }, ...(o.deroule || {}) } });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.ok(a.ok, JSON.stringify(a.erreurs));
  const r = await mesurerPage({ html: a.html, navigateur, delai: 60000, script: `return M.mesurer(${JSON.stringify({ ratio, seuils: SEUILS, genre })});` });
  assert.ok(r.resultat, r.erreur);
  return r.resultat;
}
const de = (c, regle) => c.filter((x) => x.regle === regle);
const GRAND = '<h2 data-texte="titre" data-start="0" data-dur="0.01" style="font-size: 12cqh; width: 70cqw; text-align: center"></h2>';
const scene = (html, extra = {}) => ({ id: 'a', duree: 4, transition: 'aucune', textes: { titre: 'Garder le froid' }, html, ...extra });

test('mesures-realisation.test.js › texte-casse : un compteur nombre 0→abc affiche NaN, erreur', sans, async () => {
  const html = `${GRAND}<p id="cpt" data-start="1">0</p><script>M.chaqueImage('a', function (p) { document.getElementById('cpt').textContent = (p * Number('abc')).toFixed(0); });</script>`;
  const c = de(await mesurer({ scenes: [scene(html)] }), 'texte-casse');
  assert.equal(c.length, 1);
  assert.equal(c[0].valeur, 'NaN');
  const { traduireConstats } = require('../scripts/lib/rendu-controle.js');
  const [p] = traduireConstats(c);
  assert.equal(p.gravite, 'erreur');
  assert.match(p.message, /affiche « NaN » vers [\d,]+ s ; un compteur ou un calcul est cassé/);
});

test('mesures-realisation.test.js › texte-epingle : « 03/06 » en coin pendant 7 s, alerte ; data-repere, rien', sans, async () => {
  const coin = (attr) => `<span ${attr} style="position:absolute; right:3cqw; top:3cqh; font-size:2.5cqh">03/06</span>`;
  const c = de(await mesurer({ scenes: [scene(`${GRAND}${coin('')}`, { duree: 7.5 })] }), 'texte-epingle');
  assert.equal(c.length, 1);
  assert.equal(c[0].element, '03/06');
  assert.ok(c[0].valeur > 6);
  assert.deepEqual(de(await mesurer({ scenes: [scene(`${GRAND}${coin('data-repere')}`, { duree: 7.5 })] }), 'texte-epingle'), []);
});

test('mesures-realisation.test.js › accroche : social sans grand texte avant 3 s, alerte ; formation, jamais', sans, async () => {
  const petit = '<h2 data-texte="titre" data-start="0" data-dur="0.01" style="font-size: 4cqh"></h2>';
  const c = de(await mesurer({ scenes: [scene(petit, { duree: 5 })] }, { genre: 'social', ratio: '9:16' }), 'accroche');
  assert.equal(c.length, 1);
  assert.equal(c[0].element, 'titre');
  assert.ok(c[0].valeur.p < c[0].valeur.min);
  assert.deepEqual(de(await mesurer({ scenes: [scene(petit, { duree: 5 })] }, { genre: 'formation', ratio: '9:16' }), 'accroche'), []);
  assert.deepEqual(de(await mesurer({ scenes: [scene(GRAND, { duree: 5 })] }, { genre: 'social', ratio: '9:16' }), 'accroche'), []);
});

test('mesures-realisation.test.js › image-zero : social à première image vide, alerte', sans, async () => {
  const tard = '<h2 class="entre-bas" data-texte="titre" data-start="1" data-dur="0.5" style="font-size: 12cqh"></h2>';
  const c = de(await mesurer({ scenes: [scene(tard)] }, { genre: 'social', ratio: '9:16' }), 'image-zero');
  assert.equal(c.length, 1);
  assert.equal(c[0].scene, 'a');
  assert.deepEqual(de(await mesurer({ scenes: [scene(GRAND)] }, { genre: 'social', ratio: '9:16' }), 'image-zero'), []);
  assert.deepEqual(de(await mesurer({ scenes: [scene(tard)] }), 'image-zero'), []);
});

const photo = pngRGBA(800, 450, (x, y) => [x % 255, y % 255, 120, 255]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="45"><rect width="80" height="45" fill="#0a6cff"/></svg>';

test('mesures-realisation.test.js › image-agrandie : image de 800 px affichée sur 1 200, alerte avec la largeur conseillée ; zoom de caméra compté ; SVG jamais', sans, async () => {
  // Fenêtre de 1 280 px : 62,5 cqw = 800 px de page = 1 200 px de l'export en 1080p.
  const img = (src, largeur) => `${GRAND}<img src="${src}" alt="Chambre froide" data-start="0" data-dur="0.01" style="position:absolute; left:10cqw; top:40cqh; width:${largeur}">`;
  const c = de(await mesurer({ scenes: [scene(img('assets/p.png', '62.5cqw'))], assets: { 'p.png': photo } }), 'image-agrandie');
  assert.equal(c.length, 1);
  assert.ok(Math.abs(c[0].valeur.f - 1.5) < 0.02, JSON.stringify(c[0]));
  assert.ok(Math.abs(c[0].valeur.px - 1200) <= 2, JSON.stringify(c[0]));
  const { traduireConstats } = require('../scripts/lib/rendu-controle.js');
  assert.match(traduireConstats(c)[0].message, /Fournir une image d'au moins 1 ?20\d pixels de large/);
  // À sa taille : rien ; sous un zoom de caméra de 1,5 : signalée.
  assert.deepEqual(de(await mesurer({ scenes: [scene(img('assets/p.png', '40cqw'))], assets: { 'p.png': photo } }), 'image-agrandie'), []);
  const zoom = `<div data-camera="zoom 1→1.5 0+0.2" style="position:absolute; inset:0">${img('assets/p.png', '40cqw')}</div>`;
  assert.equal(de(await mesurer({ scenes: [scene(zoom)], assets: { 'p.png': photo } }), 'image-agrandie').length, 1);
  assert.deepEqual(de(await mesurer({ scenes: [scene(img('assets/p.svg', '62.5cqw'))], assets: { 'p.svg': SVG } }), 'image-agrandie'), []);
});

test('mesures-realisation.test.js › texte-petit-lecteur : texte réduit par transform: scale(0.4), alerte ; même texte sans échelle, rien', sans, async () => {
  const texte = (style) => `${GRAND}<p data-texte="note" data-start="0" data-dur="0.01" style="position:absolute; left:10cqw; top:70cqh; font-size:4cqh; ${style}"></p>`;
  const o = (style) => ({ scenes: [scene(texte(style), { textes: { titre: 'Garder le froid', note: 'Au réfrigérateur' } })] });
  const c = de(await mesurer(o('transform: scale(0.4); transform-origin: left top')), 'texte-petit-lecteur');
  assert.equal(c.length, 1);
  assert.equal(c[0].element, 'note');
  assert.equal(c[0].valeur.largeur, 854);
  assert.ok(c[0].valeur.px < 16);
  assert.deepEqual(de(await mesurer(o('')), 'texte-petit-lecteur'), []);
});

test('mesures-realisation.test.js › sujet-petit : contenu de 20 % au centre, alerte ; titre sur 70 % de la largeur, rien', sans, async () => {
  const petit = '<h2 data-texte="titre" data-start="0.3" data-dur="0.5" style="position:absolute; left:40cqw; top:45cqh; width:20cqw; font-size:5cqh; margin:0"></h2>';
  const c = de(await mesurer({ scenes: [scene(petit, { textes: { titre: 'Froid' } })] }), 'sujet-petit');
  assert.equal(c.length, 1);
  assert.ok(c[0].valeur <= 25, String(c[0].valeur));
  assert.ok(Math.abs(c[0].instant - 1.1) < 0.05, String(c[0].instant));
  assert.deepEqual(de(await mesurer({ scenes: [scene(GRAND)] }), 'sujet-petit'), []);
});

test('mesures-realisation.test.js › transition-vide : scène qui entre sans élément visible pendant un fondu, alerte', sans, async () => {
  // « a » efface son titre avant la fin ; « b » entre en fondu, son titre n'arrive qu'après.
  const a = { id: 'a', duree: 3, transition: 'aucune', textes: { titre: 'Avant' }, html: '<h2 data-texte="titre" data-start="0" data-dur="1.5" data-tween="opacity 1→0 linear" style="font-size:10cqh"></h2>' };
  const b = (debut) => ({ id: 'b', duree: 3, transition: 'fondu', textes: { titre: 'Après' }, html: `<h2 data-texte="titre" data-start="${debut}" data-dur="0.3" style="font-size:10cqh"></h2>` });
  const c = de(await mesurer({ scenes: [a, b(1)] }), 'transition-vide');
  assert.equal(c.length, 1);
  assert.equal(c[0].scene, 'b');
  assert.equal(c[0].element, 'a|b');
  // « a » garde son titre jusqu'au bout : la transition n'est jamais vide.
  const garde = { ...a, html: '<h2 data-texte="titre" data-start="0" data-dur="0.5" style="font-size:10cqh"></h2>' };
  assert.deepEqual(de(await mesurer({ scenes: [garde, b(1)] }), 'transition-vide'), []);
});

test('mesures-realisation.test.js › sous-titre-cache-sujet : sous-titres sur un personnage, alerte', sans, async () => {
  const sujet = (top) => `${GRAND}<svg id="perso" data-start="0" data-dur="0.01" viewBox="0 0 10 10" style="position:absolute; left:35cqw; top:${top}; width:30cqw; height:30cqh"><circle cx="5" cy="5" r="5"/></svg>`;
  const o = (top) => ({ scenes: [scene(sujet(top), { duree: 5, voix: { texte: 'Gardez vos produits frais au froid, toujours, sans attendre.' } })], deroule: { sousTitres: {} } });
  const c = de(await mesurer(o('68cqh')), 'sous-titre-cache-sujet');
  assert.equal(c.length, 1, JSON.stringify(c));
  assert.equal(c[0].element, 'perso');
  assert.deepEqual(de(await mesurer(o('20cqh')), 'sous-titre-cache-sujet'), []);
});

test('mesures-realisation.test.js › marge : image collée au bord, alerte ; photo pleine page, rien', sans, async () => {
  const img = (style) => `${GRAND}<img src="assets/p.png" alt="Chambre froide" data-start="0" data-dur="0.01" style="position:absolute; ${style}">`;
  const c = de(await mesurer({ scenes: [scene(img('left:0.5cqw; top:30cqh; width:20cqw'))], assets: { 'p.png': photo } }), 'marge');
  assert.equal(c.length, 1);
  assert.equal(c[0].image, true);
  const { traduireConstats } = require('../scripts/lib/rendu-controle.js');
  assert.match(traduireConstats(c)[0].message, /« Chambre froide » touche presque le bord/);
  assert.deepEqual(de(await mesurer({ scenes: [scene(img('inset:0; width:100%; height:100%; object-fit:cover'))], assets: { 'p.png': photo } }), 'marge'), []);
  assert.ok(fs.existsSync(path.join(__dirname, 'aide', 'mini-projet.js')));
});

test('mesures-realisation.test.js › un effet de particules suit son ancre sous la caméra (effet-decroche non créée : non-régression)', () => {
  // Spec S2 § 8 : la zone de l'ancre est remesurée (rectangle rendu, caméra comprise) à chaque point de la grille de 30 par
  // seconde ; la règle effet-decroche n'a donc pas lieu d'être.
  const calques = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'particules', 'calques.js'), 'utf8');
  assert.match(calques, /function mesurer\(fx\) \{\s*const s = fx\.section\.getBoundingClientRect\(\);[\s\S]{0,200}\(fx\.ancre \|\| fx\.el\)\.getBoundingClientRect\(\)/);
  assert.match(calques, /au point g de la grille \(τ = g \/ 30\)/);
  assert.match(calques, /function zoneA\(fx, tau, mesures\)/);
});
