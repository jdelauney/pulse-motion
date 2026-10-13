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
