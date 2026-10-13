'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { optionsWebGPU } = require('./aide/gpu.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();

function obtenir(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { corps += d; });
      res.on('end', () => resolve({ statut: res.statusCode, type: res.headers['content-type'], corps }));
    }).on('error', reject);
  });
}

test('page d\'atelier : page, moteur et styles servis par l\'aperçu', async () => {
  const dir = copierProjet('projet-effets');
  const apercu = await demarrerApercu({ dossier: dir, port: 47441, dossierStyles: STYLES, dossierEffets: EFFETS });
  try {
    const page = await obtenir(`${apercu.url}_pm/atelier?recette=gerbe`);
    assert.equal(page.statut, 200);
    assert.match(page.type, /text\/html/);
    assert.match(page.corps, /<section data-scene="atelier">/);
    assert.match(page.corps, /<div data-effet="atelier" data-pm-effet="0"><\/div>/);
    assert.match(page.corps, /<script src="\/_pm\/atelier\/moteur\.js"><\/script>\n<script src="\/_pm\/atelier\/expression\.js"><\/script>\n<script src="\/_pm\/atelier\/recette\.js"><\/script>\n<script type="module" src="\/_pm\/atelier\/page\.mjs"><\/script>/);
    const moteur = await obtenir(`${apercu.url}_pm/atelier/moteur.js`);
    assert.match(moteur.type, /javascript/);
    assert.match(moteur.corps, /M\.demarrerParticules = function/);
    assert.match(moteur.corps, /remplacerEffet/);
    assert.match(moteur.corps, /M\.boucler = function/);
    const css = await obtenir(`${apercu.url}_pm/atelier/base.css`);
    assert.match(css.type, /text\/css/);
    assert.match(css.corps, /--pm-ratio-l: 16; --pm-ratio-h: 9;/);
    assert.match(css.corps, /#pm-scene \{/);
    assert.match(css.corps, /--ease-cubic-out:/);
  } finally { await apercu.fermer(); }
});

/** Empreinte des pixels du calque avant de la scène technique à l'instant t. */
const PIXELS = (t) => `(async () => {
  await M.seek(${t});
  const p = await M.particules.lirePixels('atelier', 'avant');
  let h = 0x811c9dc5, somme = 0;
  for (const x of p.donnees) { h = Math.imul(h ^ x, 0x01000193) >>> 0; somme += x; }
  return { h, somme };
})()`;
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('page d\'atelier : joue une recette de la bibliothèque, la règle, enregistre une recette dérivée', async (t) => {
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-effets');
  const apercu = await demarrerApercu({ dossier: dir, port: 47442, dossierStyles: STYLES }); // bibliothèque du plugin
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 800, gpu: true, options: await optionsWebGPU(), delai: 90000 });
  try {
    await page.aller(`${apercu.url}_pm/atelier?recette=etincelles`);
    await page.evaluer('M.atelierPage.pret.then(() => true)');
    const e = await page.evaluer('M.atelierPage.etat()');
    assert.deepEqual([e.depart, e.source, e.projet], ['etincelles', 'bibliotheque', true]);
    assert.match(await page.evaluer('document.querySelector(".pm-etiquette").textContent'), /\(boucle\)/, 'lecture en boucle sur l\'effet');
    await page.evaluer('(M.atelierPage.lecture(false), true)');
    const a = await page.evaluer(PIXELS(0.8));
    assert.ok(a.somme > 0, 'la recette est jouée');
    await page.evaluer('M.atelierPage.modifier((r) => { r.rendu_calque.bloom = 1; })');
    const b = await page.evaluer(PIXELS(0.8));
    assert.notEqual(b.h, a.h, 'le réglage change l\'image');
    await page.evaluer('M.atelierPage.ancre({ x: 5, y: 60, l: 10, h: 10 })');
    const c = await page.evaluer(PIXELS(0.8));
    assert.notEqual(c.h, b.h, 'l\'ancre déplacée change la zone d\'émission');
    await page.evaluer('(M.atelierPage.fond("clair"), true)');
    assert.equal(await page.evaluer('getComputedStyle(document.getElementById("pm-scene")).backgroundColor'), rgb(e.charte.fond));
    const r = await page.evaluer('M.atelierPage.enregistrer("etincelles-douces")');
    assert.equal(r.fichier, 'effets/etincelles-douces.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'effets', 'etincelles-douces.json'), 'utf8')), {
      version: 1, nom: 'etincelles-douces', etend: 'etincelles', description: 'Dérivé de « etincelles » dans l\'atelier', rendu_calque: { bloom: 1 },
    });
    // Les réglages exposés deviennent les valeurs par défaut de la recette écrite.
    await page.evaluer('M.atelierPage.regler("vitesse", 2)');
    await page.evaluer('M.atelierPage.enregistrer("etincelles-vives")');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'effets', 'etincelles-vives.json'), 'utf8')).parametres, { vitesse: { defaut: 2 } });
    const refus = await page.evaluer('M.atelierPage.enregistrer("etincelles").then(() => null, (x) => x.statut)');
    assert.equal(refus, 409);
    assert.match(await page.evaluer('document.querySelector("#pm-atelier .pm-at-message").textContent'), /bibliothèque/);
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
});

test('page d\'atelier : recette inconnue : départ d\'une recette vide, avec un message', async (t) => {
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  const dir = copierProjet('projet-effets');
  const apercu = await demarrerApercu({ dossier: dir, port: 47443, dossierStyles: STYLES });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 800 });
  try {
    await page.envoyer('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__PM_SANS_GPU__ = true;' });
    await page.aller(`${apercu.url}_pm/atelier?recette=absente`);
    await page.evaluer('M.atelierPage.pret.then(() => true)');
    const e = await page.evaluer('M.atelierPage.etat()');
    assert.equal(e.depart, null);
    assert.equal(e.recette.nom, 'nouvel-effet');
    assert.match(await page.evaluer('document.getElementById("pm-atelier").textContent'), /Effet « absente » introuvable/);
    assert.equal(await page.evaluer('document.querySelectorAll("#pm-atelier [data-chemin]").length > 20'), true, 'formulaire de la recette construit');
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
});

test('page d\'atelier hors d\'un projet : joue la bibliothèque, dit de lancer l\'atelier depuis le dossier d\'une vidéo', async (t) => {
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  const vide = dossierTemporaire('pm-atelier-vide-');
  const apercu = await demarrerApercu({ dossier: vide, port: 47444 });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 800 });
  try {
    await page.envoyer('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__PM_SANS_GPU__ = true;' });
    await page.aller(`${apercu.url}_pm/atelier?recette=neige`);
    await page.evaluer('M.atelierPage.pret.then(() => true)');
    const r = await page.evaluer(`M.atelierPage.enregistrer('ma-neige').then(() => null, (e) => ({ message: e.message,
      texte: document.getElementById('pm-atelier').textContent,
      desactive: document.querySelector('#pm-atelier [data-action="enregistrer"]').disabled,
      etat: M.atelierPage.etat() }))`);
    assert.equal(r.etat.projet, false);
    assert.equal(r.etat.depart, 'neige');
    assert.match(r.message, /lancez l'atelier depuis le dossier d'une vidéo/);
    assert.match(r.texte, /lancez l'atelier depuis le dossier d'une vidéo/);
    assert.equal(r.desactive, true);
    assert.equal(fs.existsSync(path.join(vide, 'effets')), false);
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
});
