'use strict';
/* Spec Rendu et export, 5.4 point 6 et 5.23 : bouton MP4 de l'aperçu (menu de quatre usages) ; erreur de script d'une
 * scène pendant l'export dans le navigateur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

async function avecPage(port, fn) {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, dossierStyles: STYLES, port });
  let page = null;
  try {
    page = await ouvrirPage({ navigateur, largeur: 1000, hauteur: 600, delai: 120000 });
    await page.aller(apercu.url);
    await page.evaluer('M.pret.then(function () { return document.fonts.ready; }).then(function () { return new Promise(function (r) { (function attendre() { if (document.getElementById("pm-bouton-export")) r(true); else setTimeout(attendre, 50); })(); }); })');
    await fn(dir, page);
  } finally {
    if (page) await page.fermer();
    await apercu.fermer();
  }
}

/** Attend que sortie/export.json soit fini ou en erreur. */
async function suiviFinal(dir, delai = 120000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    try {
      const e = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'export.json'), 'utf8'));
      if (['fini', 'erreur', 'annule'].includes(e.etat)) return e;
    } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('export non terminé');
}

test('export-ui.test.js › le bouton MP4 ouvre un menu de quatre usages ; Web donne le même nombre d\'images qu\'avant', sans, async () => {
  await avecPage(47801, async (dir, page) => {
    const menu = await page.evaluer(`(function () {
      document.getElementById('pm-bouton-export').click();
      var m = document.getElementById('pm-menu-export');
      return { role: m && m.getAttribute('role'), usages: m ? Array.from(m.querySelectorAll('[role="menuitem"]')).map(function (b) { return [b.dataset.pour, b.textContent]; }) : [],
        ouvert: document.getElementById('pm-bouton-export').getAttribute('aria-expanded') };
    })()`);
    assert.deepEqual(menu, { role: 'menu', usages: [['web', 'Web'], ['reseaux', 'Réseaux'], ['presentation', 'Présentation'], ['courriel', 'Courriel']], ouvert: 'true' });
    await page.evaluer('document.querySelector(\'#pm-menu-export [data-pour="web"]\').click(), true');
    const e = await suiviFinal(dir);
    assert.equal(e.etat, 'fini', e.message);
    // 7,25 s à 30 images par seconde : 218 images, comme le bouton d'avant ; même nom de fichier.
    assert.deepEqual([e.fichier, e.images, e.usage], ['sortie/la-chaine-du-froid.mp4', 218, 'web']);
    assert.equal(await page.evaluer('!document.getElementById("pm-menu-export")'), true, 'menu refermé');
  });
});

test('export-fidele.test.js › exception dans une scène pendant l\'export : échec avec le nom de la scène et l\'instant (voie navigateur)', sans, async () => {
  await avecPage(47802, async (dir, page) => {
    // Une scène dont le script échoue à partir de 5 s (dans « chiffre ») : rejet non traité pendant l'export.
    await page.evaluer(`(function () {
      var seek = M.seek;
      M.seek = function (t) { return Promise.resolve(seek.call(M, t)).then(function (r) { if (t >= 5) Promise.reject(new Error('boum')); return r; }); };
      return import('/_pm/export-ui.mjs').then(function (m) { m.lancerExport(); return true; });
    })()`);
    const e = await suiviFinal(dir);
    assert.equal(e.etat, 'erreur');
    assert.match(e.message, /^La scène « chiffre » a une erreur de script vers 5(,\d)? s : l'export s'arrête, rien n'est écrit\.$/);
    assert.equal(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4')), false);
  });
});
