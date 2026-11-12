'use strict';
/* Spec S9 (lacunes créatives), 5.1 : la page livrée d'une vidéo dans une autre langue (lecteur, nombres), dans Chrome. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 120000 };
const html = '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2><p data-texte="chiffre" data-start="0.5" data-dur="1" data-tween="nombre 0→1250.5"></p>';

async function ouvrir(langue) {
  const dir = miniProjet({ scenes: [{ id: 'a', duree: 4, textes: { titre: 'Bacteria', chiffre: '0' }, html }], deroule: { ...(langue ? { langue } : {}), couverture: { scene: 'a', instant: 3 } } });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  const fichier = path.join(dir, 'sortie', 'page.html');
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, a.html);
  const page = await ouvrirPage({ navigateur, largeur: 960, hauteur: 600 });
  await page.aller(`${pathToFileURL(fichier).href}?affiche=1`);
  await page.evaluer('M.pret.then(function () { return new Promise(function (r) { setTimeout(r, 50); }); })');
  return page;
}

const ETAT = `(function () {
  M.rendre(2);
  var affiche = document.getElementById('pm-affiche');
  return { lang: document.documentElement.lang, bouton: document.querySelector('#pm-lecteur button').getAttribute('aria-label'),
    position: document.querySelector('#pm-lecteur input').getAttribute('aria-label'), affiche: affiche && affiche.getAttribute('aria-label'),
    etiquette: document.querySelector('#pm-lecteur .pm-etiquette').textContent, chiffre: document.querySelector('[data-texte="chiffre"]').textContent };
})()`;

test('lecteur : textes de la barre dans la langue de la vidéo ; nombres de la page dans sa langue', sans, async () => {
  const en = await ouvrir('en-US');
  try {
    const e = await en.evaluer(ETAT);
    assert.equal(e.lang, 'en-US');
    assert.equal(e.bouton, 'Play');
    assert.equal(e.position, 'Position');
    assert.equal(e.affiche, 'Play the video');
    assert.match(e.etiquette, /^Scene 1\/1 · a · /);
    assert.equal(e.chiffre, '1,250.5');
  } finally { await en.fermer(); }
  const fr = await ouvrir(null);
  try {
    const f = await fr.evaluer(ETAT);
    assert.equal(f.lang, 'fr');
    assert.equal(f.bouton, 'Lecture');
    assert.equal(f.affiche, 'Lire la vidéo');
    assert.match(f.etiquette, /^Scène 1\/1 · a · /);
    assert.equal(f.chiffre, `1${String.fromCharCode(0xa0)}250,5`);
  } finally { await fr.fermer(); }
});
