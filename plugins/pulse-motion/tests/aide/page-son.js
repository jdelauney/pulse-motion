'use strict';
/* Page assemblée ouverte dans Chrome sans fenêtre (CDP), avec données et sons injectés pour les tests du son. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../../scripts/assembler.js');
const { ouvrirPage } = require('../../scripts/lib/cdp.js');
const { STYLES } = require('./projet.js');

const DONNEES = /(<script type="application\/json" id="pm-donnees">)([\s\S]*?)(<\/script>)/;

/** -> page CDP (aller, evaluer, fermer…) ouverte sur la page du projet, après M.pret. */
async function ouvrirPageSon({ dir, navigateur, modifier, sons = {} }) {
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  if (!r.ok) throw new Error(r.erreurs.map((e) => e.message).join(' '));
  let html = r.html.replace(DONNEES, (_, a, json, b) => {
    const d = JSON.parse(json);
    if (modifier) modifier(d);
    return a + JSON.stringify(d).replace(/</g, '\\u003c') + b;
  });
  const blocs = Object.entries(sons).map(([id, octets]) => `<script type="text/plain" id="${id}">data:audio/wav;base64,${octets.toString('base64')}</script>`);
  html = html.replace('<script type="application/json" id="pm-donnees">', `${blocs.join('\n')}\n<script type="application/json" id="pm-donnees">`);
  const fichier = path.join(dir, 'page-son.html');
  fs.writeFileSync(fichier, html);
  const page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 360 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer('M.pret.then(function () { return true; })');
    return page;
  } catch (e) {
    await page.fermer();
    throw e;
  }
}

module.exports = { ouvrirPageSon };
