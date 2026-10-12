'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const taillePNG = (b) => ({ largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) });
const PAGE = 'data:text/html,' + encodeURIComponent('<body style="margin:0;background:rgb(255,0,0)"><script>window.attendre = () => new Promise((r) => setTimeout(() => r(42), 50));</script></body>');

test('page ouverte à la taille exacte : évaluer (promesse comprise) et capturer en PNG', sans, async () => {
  const page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 360 });
  try {
    await page.aller(PAGE);
    assert.equal(await page.evaluer('innerWidth + "x" + innerHeight'), '640x360');
    assert.equal(await page.evaluer('window.attendre()'), 42);
    const png = await page.capturer();
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
    assert.deepEqual(taillePNG(png), { largeur: 640, hauteur: 360 });
  } finally {
    await page.fermer();
  }
});

test('erreur dans la page : rejet avec son message ; commande après fermeture : rejet', sans, async () => {
  const page = await ouvrirPage({ navigateur, largeur: 320, hauteur: 200 });
  await page.aller(PAGE);
  await assert.rejects(page.evaluer('(() => { throw new Error("cassé ici"); })()'), /cassé ici/);
  await page.fermer();
  await page.fermer();
  await assert.rejects(page.evaluer('1'), /le navigateur s'est arrêté|fermé/);
});

test('navigateur qui s\'arrête pendant une commande : la commande est rejetée, rien ne reste suspendu', sans, async () => {
  const page = await ouvrirPage({ navigateur, largeur: 320, hauteur: 200 });
  await page.aller(PAGE);
  const enCours = page.evaluer('new Promise(() => {})');
  page.processus.kill();
  await assert.rejects(enCours, /le navigateur s'est arrêté/);
  await page.fermer();
});

test('navigateur introuvable : rejet avec le code ENOENT', async () => {
  await assert.rejects(ouvrirPage({ navigateur: path.join(__dirname, 'absent.exe'), largeur: 10, hauteur: 10 }), (e) => e.code === 'ENOENT');
});

test('profil temporaire retiré à la fermeture', sans, async () => {
  const page = await ouvrirPage({ navigateur, largeur: 100, hauteur: 100 });
  const profil = page.profil;
  assert.ok(fs.existsSync(profil));
  await page.fermer();
  assert.equal(fs.existsSync(profil), false);
});
