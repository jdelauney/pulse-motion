'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { ouvrirPageSon } = require('./aide/page-son.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

function projet(sousTitres) {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.sousTitres = sousTitres; d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' }; });
  return dir;
}
const ETAT = `(function (t) {
  M.rendre(t);
  var calque = document.getElementById('pm-sous-titres');
  if (!calque) return null;
  var carton = calque.querySelector('.pm-st-carton');
  return { position: calque.getAttribute('data-position'), mode: calque.getAttribute('data-mode'),
    texte: carton ? carton.textContent : null,
    etats: carton ? Array.prototype.map.call(carton.querySelectorAll('.pm-st-mot'), function (m) { return m.getAttribute('data-etat'); }) : [],
    bas: carton ? Math.round(calque.parentElement.getBoundingClientRect().bottom - carton.getBoundingClientRect().bottom) : null };
})`;

test('mode ligne : le carton s\'affiche pendant sa plage, rien avant ; en bas par défaut', sans, async () => {
  const page = await ouvrirPageSon({ dir: projet({}), navigateur });
  try {
    const avant = await page.evaluer(`${ETAT}(0.1)`);
    assert.equal(avant.texte, null);
    const pendant = await page.evaluer(`${ETAT}(1.5)`);
    assert.match(pendant.texte, /Pourquoi garder/);
    assert.equal(pendant.position, 'bas');
    assert.ok(pendant.bas > 0);
  } finally { await page.fermer(); }
});

test('mode mot : mots dits, en cours, à venir', sans, async () => {
  const page = await ouvrirPageSon({ dir: projet({ mode: 'mot' }), navigateur });
  try {
    const e = await page.evaluer(`${ETAT}(1.5)`);
    assert.equal(e.mode, 'mot');
    assert.ok(e.etats.includes('dit') && e.etats.includes('a-venir'), JSON.stringify(e.etats));
    assert.ok(e.etats.filter((x) => x === 'en-cours').length <= 1);
  } finally { await page.fermer(); }
});

test('position haut ; incrustes false : aucun calque', sans, async () => {
  const haut = await ouvrirPageSon({ dir: projet({ position: 'haut' }), navigateur });
  try { assert.equal((await haut.evaluer(`${ETAT}(1.5)`)).position, 'haut'); } finally { await haut.fermer(); }
  const aucun = await ouvrirPageSon({ dir: projet({ incrustes: false }), navigateur });
  try { assert.equal(await aucun.evaluer(`${ETAT}(1.5)`), null); } finally { await aucun.fermer(); }
});

test('le calque ne prend pas les clics (le clic sur l\'image lance toujours la lecture)', sans, async () => {
  const page = await ouvrirPageSon({ dir: projet({}), navigateur });
  try {
    assert.equal(await page.evaluer('(function () { M.rendre(1.5); return getComputedStyle(document.getElementById("pm-sous-titres")).pointerEvents; })()'), 'none');
  } finally { await page.fermer(); }
});
