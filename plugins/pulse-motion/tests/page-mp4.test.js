'use strict';
/* Spec Retouches et ergonomie, 5.18 : la page qui sait faire son MP4 (facultative), dans Chrome ou Edge sans fenêtre, ouverte
 * en file:// sans aucun serveur ; mêmes images que l'export de l'aperçu ; conseil à la place du bouton sans VideoEncoder. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { assembler } = require('../scripts/assembler.js');
const { demarrerApercu } = require('../scripts/apercu.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

function pageMp4() {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.page = { boutonMp4: true }; });
  const a = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.ok(a.ok, JSON.stringify(a.erreurs));
  return { dir, fichier: a.fichier };
}

const ATTENDRE_BARRE = `new Promise((r) => { (function a() { if (document.getElementById('pm-bouton-export') || document.getElementById('pm-conseil-mp4')) r(true); else setTimeout(a, 50); })(); })`;

async function avecPage(fn, { avant = null } = {}) {
  let page = null;
  try {
    page = await ouvrirPage({ navigateur, largeur: 1000, hauteur: 600, delai: 180000 });
    if (avant) await page.envoyer('Page.addScriptToEvaluateOnNewDocument', { source: avant });
    await fn(page);
  } finally {
    if (page) await page.fermer();
  }
}

test('page livrée : export MP4 depuis file:// dans Chrome sans fenêtre', sans, async () => {
  const { fichier } = pageMp4();
  const telechargements = dossierTemporaire('pm-telechargement-');
  await avecPage(async (page) => {
    await page.envoyerNavigateur('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: telechargements });
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer(ATTENDRE_BARRE);
    assert.equal(await page.evaluer('Boolean(document.getElementById("pm-bouton-export"))'), true, 'bouton MP4 dans la barre');
    assert.equal(await page.evaluer('typeof M.capturer'), 'undefined', 'rien n\'est chargé avant le clic');
    // Sans sélecteur de fichier : la vidéo se télécharge.
    await page.evaluer('window.showSaveFilePicker = undefined, true');
    await page.evaluer('document.getElementById("pm-bouton-export").click(), true', { geste: true });
    const r = await page.evaluer('new Promise((r) => { (function a() { if (M.dernierExportPage) r(M.dernierExportPage); else setTimeout(a, 200); })(); })');
    assert.ok(!r.erreur, r.erreur);
    const attendues = await page.evaluer('Math.round(M.duree * 30)');
    assert.equal(r.images, attendues);
    assert.equal(r.relecture.ok, true);
    assert.equal(r.relecture.images, attendues);
    assert.match(r.nom, /\.mp4$/);
    // Le fichier téléchargé.
    const fin = Date.now() + 30000;
    let mp4 = null;
    while (Date.now() < fin && !mp4) {
      mp4 = fs.readdirSync(telechargements).find((f) => f.endsWith('.mp4'));
      if (!mp4) await new Promise((x) => setTimeout(x, 200));
    }
    assert.ok(mp4, 'MP4 téléchargé');
    const octets = fs.readFileSync(path.join(telechargements, mp4));
    assert.equal(octets.length, r.octets);
    assert.equal(octets.subarray(4, 8).toString('latin1'), 'ftyp', 'un vrai MP4');
  });
});

/** Empreintes des images de la scène à trois instants, capturées par M.capturer (la voie de l'export). */
const EMPREINTES = `(async () => {
  const toile = new OffscreenCanvas(480, 270);
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  const r = [];
  M.modeCapture(true);
  for (const t of [0.8, 3.2, 6.1]) {
    await M.seek(t);
    await M.capturer(ctx, 480, 270);
    const d = ctx.getImageData(0, 0, 480, 270).data;
    const h = await crypto.subtle.digest('SHA-256', d);
    r.push(Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join(''));
  }
  M.modeCapture(false);
  return r;
})()`;

test('page livrée : mêmes images que l\'export dans le navigateur de l\'aperçu (3 témoins)', sans, async () => {
  const { dir, fichier } = pageMp4();
  let depuisPage;
  await avecPage(async (page) => {
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer(ATTENDRE_BARRE);
    await page.evaluer('M.chargerExportPage().then(() => document.fonts.ready).then(() => true)');
    depuisPage = await page.evaluer(EMPREINTES);
  });
  const apercu = await demarrerApercu({ dossier: dir, dossierStyles: STYLES, port: 47861 });
  let depuisApercu;
  try {
    await avecPage(async (page) => {
      await page.aller(apercu.url);
      await page.evaluer('M.pret.then(() => document.fonts.ready).then(() => new Promise((r) => { (function a() { if (document.getElementById("pm-bouton-export") && M.capturer) r(true); else setTimeout(a, 50); })(); }))');
      assert.equal(await page.evaluer('document.querySelectorAll("#pm-bouton-export").length'), 1, 'un seul bouton MP4 sous l\'aperçu');
      depuisApercu = await page.evaluer(EMPREINTES);
    });
  } finally {
    await apercu.fermer();
  }
  assert.equal(depuisPage.length, 3);
  assert.equal(new Set(depuisPage).size, 3, 'trois images différentes');
  assert.deepEqual(depuisPage, depuisApercu);
});

test('page livrée : bouton remplacé par un conseil sans VideoEncoder', sans, async () => {
  const { fichier } = pageMp4();
  await avecPage(async (page) => {
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer(ATTENDRE_BARRE);
    assert.equal(await page.evaluer('Boolean(document.getElementById("pm-conseil-mp4"))'), false, 'avec VideoEncoder : le bouton');
  });
  await avecPage(async (page) => {
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer(ATTENDRE_BARRE);
    assert.equal(await page.evaluer('Boolean(document.getElementById("pm-bouton-export"))'), false);
    assert.equal(await page.evaluer('document.getElementById("pm-conseil-mp4").textContent'), 'Ouvrez cette page dans Chrome ou Edge pour obtenir le MP4');
  }, { avant: 'delete window.VideoEncoder;' });
});
