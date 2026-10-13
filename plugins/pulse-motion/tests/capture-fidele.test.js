'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { assembler } = require('../scripts/assembler.js');
const { decoderPNG } = require('../scripts/logo.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

/** Scène d'ouverture : fond rouge, moitié gauche en « difference » avec du blanc (donc cyan), carré noir qui apparaît à 1 s. */
function page() {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8')
    .replace(/<section([^>]*)>/, '<section$1 style="background:#ff0000">')
    .replace('</section>', '<div data-decor style="position:absolute; left:0; top:0; width:50%; height:100%; background:#ffffff; mix-blend-mode:difference"></div>'
      + '<div data-decor style="position:absolute; right:0; top:0; width:20%; height:20%; background:#000000" data-start="1" data-dur="1" data-tween="opacity 0→1 linear"></div></section>'));
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const html2 = path.join(dir, 'page.html');
  fs.writeFileSync(html2, html);
  return html2;
}
const couleur = (png, fx, fy) => { const i = decoderPNG(png); return i.pixel(Math.floor(fx * i.largeur), Math.floor(fy * i.hauteur)).slice(0, 3); };
const proche = (a, b) => a.every((v, k) => Math.abs(v - b[k]) <= 12);

test('capture fidèle : taille exacte, mix-blend-mode rendu comme dans le navigateur', sans, async () => {
  const c = await ouvrirCapture({ fichierHtml: page(), largeur: 320, hauteur: 180, navigateur });
  try {
    assert.equal(c.duree, 7.25);
    const png = await c.capturer(1.5);
    const img = decoderPNG(png);
    assert.deepEqual([img.largeur, img.hauteur], [320, 180]);
    assert.ok(proche(couleur(png, 0.1, 0.6), [0, 255, 255]), `cyan attendu : ${couleur(png, 0.1, 0.6)}`);
    assert.ok(proche(couleur(png, 0.6, 0.6), [255, 0, 0]), `rouge attendu : ${couleur(png, 0.6, 0.6)}`);
  } finally {
    await c.fermer();
  }
});

test('capture fidèle : chaque capture montre l\'instant demandé (avant et après l\'apparition du carré noir)', sans, async () => {
  const c = await ouvrirCapture({ fichierHtml: page(), largeur: 320, hauteur: 180, navigateur });
  try {
    assert.ok(proche(couleur(await c.capturer(0.8), 0.9, 0.1), [255, 0, 0]));
    assert.ok(proche(couleur(await c.capturer(3), 0.9, 0.1), [0, 0, 0]));
    assert.ok(proche(couleur(await c.capturer(0.8), 0.9, 0.1), [255, 0, 0]), 'retour en arrière');
  } finally {
    await c.fermer();
  }
});

test('capture fidèle : format vertical, image entière sans bande', sans, async () => {
  const c = await ouvrirCapture({ fichierHtml: page(), largeur: 180, hauteur: 320, navigateur });
  try {
    const png = await c.capturer(1.5);
    assert.deepEqual([decoderPNG(png).largeur, decoderPNG(png).hauteur], [180, 320]);
    assert.ok(proche(couleur(png, 0.75, 0.98), [255, 0, 0]), 'le fond de la scène va jusqu\'en bas');
  } finally {
    await c.fermer();
  }
});

test('son rapatrié en plusieurs morceaux : WAV stéréo 48 kHz complet, sonie annoncée', sans, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.wav'), require('./aide/son.js').wavSinus({ secondes: 10 }));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav' }; });
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).html);
  const capture = await ouvrirCapture({ fichierHtml: fichier, largeur: 640, hauteur: 360, navigateur });
  try {
    const son = await capture.rendreSon({ morceau: 100000 });
    const lu = require('../moteur/wav.js').lire(new Uint8Array(son.wav));
    assert.deepEqual([lu.taux, lu.canaux.length, lu.canaux[0].length], [48000, 2, Math.ceil(capture.duree * 48000)]);
    assert.ok(Math.abs(son.sonie + 16) < 0.3, String(son.sonie));
    assert.deepEqual(son.avertissements, []);
  } finally {
    await capture.fermer();
  }
});

test('page sans son : rendreSon renvoie wav nul', sans, async () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).html);
  const capture = await ouvrirCapture({ fichierHtml: fichier, largeur: 640, hauteur: 360, navigateur });
  try {
    assert.equal((await capture.rendreSon()).wav, null);
  } finally {
    await capture.fermer();
  }
});

test('correctifs : la page de capture ne prépare pas le son d\'avance (rendu seulement sur demande)', sans, async () => {
  const fichier = page();
  const dir = path.dirname(fichier);
  const { wavSinus } = require('./aide/son.js');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'musique.wav'), wavSinus({ secondes: 3 }));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav' }; });
  fs.writeFileSync(fichier, assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).html);
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: 320, hauteur: 180, navigateur });
  try {
    assert.equal(await c.evaluer('location.search'), '?capture=1');
    assert.ok((await c.rendreSon()).wav);
  } finally { await c.fermer(); }
  // Page lente : la capture n'est pas encore active quand le lecteur voudrait préparer le son (1 s après le chargement).
  const { ouvrirPage } = require('../scripts/lib/cdp.js');
  const { pathToFileURL } = require('node:url');
  const p = await ouvrirPage({ navigateur, largeur: 320, hauteur: 180 });
  try {
    await p.aller(pathToFileURL(fichier).href + '?capture=1');
    await new Promise((r) => setTimeout(r, 2500));
    assert.deepEqual(await p.evaluer('({ attendu: M.etatSon().attendu, pret: M.etatSon().pret, capture: M.enCapture() })'), { attendu: true, pret: false, capture: false });
  } finally { await p.fermer(); }
});
