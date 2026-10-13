'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();

async function attendre(page, condition, delai = 30000) {
  const fin = Date.now() + delai;
  for (;;) {
    try { if (await page.evaluer(`!!(${condition})`)) return; } catch { /* page en cours de rechargement */ }
    if (Date.now() > fin) throw new Error(`condition non remplie : ${condition}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

test('lecteur : boucle posée par l\'atelier, clavier laissé au panneau, rechargement retenu tant que l\'atelier est occupé', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47421, dossierStyles: STYLES, delai: 50 });
  const page = await ouvrirPage({ navigateur, largeur: 900, hauteur: 600 });
  try {
    await page.aller(apercu.url);
    const r = await page.evaluer(`M.pret.then(async () => {
      const r = {};
      const bouton = document.querySelector('#pm-lecteur button');
      M.boucler({ debut: 1, fin: 1.4 });
      M.rendre(1.3);
      bouton.click();
      await new Promise((ok) => setTimeout(ok, 900));
      r.dansLaBoucle = M.temps() >= 1 && M.temps() < 1.4;
      r.etiquette = document.querySelector('.pm-etiquette').textContent;
      bouton.click();
      M.boucler(null);
      r.sansBoucle = !/boucle/.test(document.querySelector('.pm-etiquette').textContent);
      const panneau = document.createElement('div');
      panneau.id = 'pm-atelier';
      const zone = document.createElement('div');
      zone.tabIndex = 0;
      panneau.appendChild(zone);
      document.body.appendChild(panneau);
      M.rendre(2);
      zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      r.clavierLaisse = M.temps() === 2 && !/boucle/.test(document.querySelector('.pm-etiquette').textContent);
      M.atelier = { occupe: () => true };
      window.__pmMarque = 1;
      M.rechargerQuandPossible();
      await new Promise((ok) => setTimeout(ok, 400));
      r.retenu = window.__pmMarque === 1;
      return r;
    })`);
    assert.equal(r.dansLaBoucle, true);
    assert.match(r.etiquette, /\(boucle\)/);
    assert.equal(r.sansBoucle, true);
    assert.equal(r.clavierLaisse, true);
    assert.equal(r.retenu, true);
    await page.evaluer('(M.atelier.occupe = () => false, M.reprendreRechargement(), true)');
    await attendre(page, '!window.__pmMarque && document.documentElement.hasAttribute("data-pm-pret")');
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
});
