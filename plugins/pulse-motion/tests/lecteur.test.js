'use strict';
/* Spec Rendu et export, 5.17 : la page livrée, ouverte hors de l'aperçu, s'affiche sur sa couverture avec un bouton ▶. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

/** Page livrée (ou celle de l'aperçu, avec prelude) ouverte par le CDP, une fois prête. */
async function ouvrir(dir, { prelude = '', recherche = '' } = {}) {
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(a.ok, true);
  const html = prelude ? a.html.replace('</head>', `<script>${prelude}</script>\n</head>`) : a.html;
  const fichier = path.join(dir, 'sortie', 'page-lecteur.html');
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, html);
  const page = await ouvrirPage({ navigateur, largeur: 960, hauteur: 600 });
  await page.aller(`${pathToFileURL(fichier).href}${recherche}`);
  await page.evaluer('M.pret.then(function () { return new Promise(function (r) { setTimeout(r, 50); }); })');
  return page;
}

const ETAT = `(function () {
  var b = document.getElementById('pm-affiche');
  return { affiche: !!b, label: b && b.getAttribute('aria-label'), texte: b && b.textContent, t: M.temps(),
    couverture: M.instantCouverture(M.minutage, M.donnees.couverture),
    sousTitresMasques: !!document.querySelector('#pm-sous-titres.pm-sans-sous-titres'),
    bouton: document.querySelector('#pm-lecteur button').getAttribute('aria-label') };
})()`;

test('lecteur.test.js › page livrée : à l\'ouverture, image de la couverture et bouton ▶ ; au clic, lecture depuis 0', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => {
    d.couverture = { scene: 'chiffre', instant: 1 };
    d.sousTitres = {};
    d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' };
  });
  const page = await ouvrir(dir);
  try {
    const avant = await page.evaluer(ETAT);
    assert.equal(avant.affiche, true);
    assert.equal(avant.label, 'Lire la vidéo');
    assert.match(avant.texte, /▶/);
    assert.ok(Math.abs(avant.t - avant.couverture) < 1e-6, `${avant.t} au lieu de ${avant.couverture}`);
    assert.ok(avant.couverture > 3, 'instant de la couverture dans la scène « chiffre »');
    assert.equal(avant.sousTitresMasques, true);
    const apres = await page.evaluer(`(async function () {
      document.getElementById('pm-affiche').click();
      var t0 = M.temps();
      await new Promise(function (r) { setTimeout(r, 300); });
      return { t0: t0, t: M.temps(), affiche: !!document.getElementById('pm-affiche'), bouton: document.querySelector('#pm-lecteur button').getAttribute('aria-label'),
        sousTitresMasques: !!document.querySelector('#pm-sous-titres.pm-sans-sous-titres') };
    })()`);
    assert.equal(apres.affiche, false);
    assert.equal(apres.t0, 0, 'la lecture part de 0');
    assert.ok(apres.t > 0 && apres.t < 1.5, String(apres.t));
    assert.equal(apres.bouton, 'Pause');
    assert.equal(apres.sousTitresMasques, false);
  } finally { await page.fermer(); }
});

test('lecteur.test.js › aperçu : comportement inchangé (ni affiche ni saut à la couverture) ; capture et export non plus', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.couverture = { scene: 'chiffre', instant: 1 }; });
  for (const o of [{ prelude: 'window.__PM_APERCU__ = true;' }, { recherche: '?capture=1' }, { prelude: 'M.sansSon = true;' }]) {
    // M.sansSon (pages du contrôle) est posé après le moteur : le prélude le pose avant, l'effet est le même.
    const page = await ouvrir(dir, o.prelude === 'M.sansSon = true;' ? { prelude: 'window.M = { sansSon: true };' } : o);
    try {
      const e = await page.evaluer(ETAT);
      assert.equal(e.affiche, false, JSON.stringify(o));
      assert.equal(e.t, 0, JSON.stringify(o));
      assert.equal(e.bouton, 'Lecture');
    } finally { await page.fermer(); }
  }
});
