'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const MICRO = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

async function studio(port, { micro = true } = {}, fn) {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; });
  const apercu = await demarrerApercu({ dossier: dir, port, dossierStyles: STYLES, whisper: { pret: false } });
  const page = await ouvrirPage({ navigateur, largeur: 900, hauteur: 600, options: micro ? MICRO : ['--deny-permission-prompts'] });
  try {
    await page.aller(`${apercu.url}?studio=intro`);
    await page.evaluer('M.pret.then(function () { return new Promise(function (r) { (function attendre() { if (M.studio && M.studio.etat().phase !== "choix") r(true); else setTimeout(attendre, 50); })(); }); })');
    await fn(dir, page);
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
}

test('?studio=intro : panneau ouvert sur la scène, texte en prompteur', sans, async () => {
  await studio(47351, {}, async (dir, page) => {
    const e = await page.evaluer('({ etat: M.studio.etat(), prompteur: document.querySelector("#pm-studio .pm-studio-prompteur").textContent })');
    assert.equal(e.etat.scene, 'intro');
    assert.equal(e.etat.phase, 'pret');
    assert.match(e.prompteur, /Pourquoi le froid/);
  });
});

test('enregistrer (micro simulé), garder : prise écrite et déroulé mis à jour ; son coupé pendant la prise', sans, async () => {
  await studio(47352, {}, async (dir, page) => {
    const r = await page.evaluer(`(async function () {
      var p = M.studio.enregistrer(1.5);
      await new Promise(function (r) { setTimeout(r, 3800); });
      var pendant = M.etatSon().coupe;
      var prise = await p;
      var garde = await M.studio.garder();
      return { pendant: pendant, duree: prise.duree, fichier: garde.fichier, apres: M.etatSon().coupe };
    })()`);
    assert.equal(r.pendant, true);
    assert.ok(r.duree > 0.5, JSON.stringify(r));
    assert.equal(r.fichier, 'assets/voix/intro.wav');
    assert.equal(r.apres, false);
    assert.ok(fs.existsSync(path.join(dir, 'assets', 'voix', 'intro.wav')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8')).scenes[0].voix.fichier, 'assets/voix/intro.wav');
  });
});

test('revue : micro absent ou refusé : message dans le panneau, rien d\'écrit', sans, async () => {
  await studio(47353, { micro: false }, async (dir, page) => {
    const e = await page.evaluer('M.studio.enregistrer(1).then(function () { return M.studio.etat(); }, function () { return M.studio.etat(); })');
    assert.equal(e.phase, 'erreur');
    assert.match(e.message, /micro/);
    assert.equal(fs.existsSync(path.join(dir, 'assets', 'voix', 'intro.wav')), false);
  });
});

test('revue : un rechargement demandé pendant l\'enregistrement attend la fin de la prise', sans, async () => {
  await studio(47354, {}, async (dir, page) => {
    const r = await page.evaluer(`(async function () {
      M.studio.enregistrer(4);
      await new Promise(function (r) { setTimeout(r, 3300); });
      window.__pmPasRecharge = true;
      M.rechargerQuandPossible();
      await new Promise(function (r) { setTimeout(r, 300); });
      // Même page (pas rechargée) et prise toujours en cours ; le rechargement viendra à la fin de la prise.
      return window.__pmPasRecharge === true && M.studio.etat().phase === 'enregistre';
    })()`);
    assert.equal(r, true);
  });
});
