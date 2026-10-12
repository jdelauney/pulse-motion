'use strict';
/* Projets d'essai des styles livrés (voir scripts/lib/projet-essai.js). */
const fs = require('node:fs');
const path = require('node:path');
const { texteDeLongueur, projetEssai } = require('../../scripts/lib/projet-essai.js');

const STYLES = path.join(__dirname, '..', '..', 'styles');
const STYLE = path.join(STYLES, 'clair-pedagogique');
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(STYLE, 'catalogue.json'), 'utf8'));

function projetCatalogue(style = 'clair-pedagogique', ratio = '16:9', { ton } = {}) {
  return projetEssai({ dossierStyle: path.join(STYLES, style), ratio, ton });
}

module.exports = { STYLE, CATALOGUE, texteDeLongueur, projetCatalogue };
