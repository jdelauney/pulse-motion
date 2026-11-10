'use strict';
/* Copie un projet d'exemple de tests/fixtures dans un dossier temporaire. */
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./temporaire.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

// Les exports des tests notent leur vitesse et leurs encodeurs (spec Rendu et export, 5.5 et 5.7) : jamais dans le dossier
// personnel de la personne qui lance les tests.
if (!process.env.PULSE_MOTION_DOSSIER) process.env.PULSE_MOTION_DOSSIER = dossierTemporaire('pm-personnel-');
const STYLES = path.join(FIXTURES, 'styles');
const EFFETS = path.join(FIXTURES, 'effets');

function copierProjet(nom) {
  const cible = dossierTemporaire(`pm-${nom}-`);
  fs.cpSync(path.join(FIXTURES, nom), cible, { recursive: true });
  return cible;
}

function modifierDeroule(dossier, fn) {
  const fichier = path.join(dossier, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  fn(d);
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2));
}

module.exports = { FIXTURES, STYLES, EFFETS, copierProjet, modifierDeroule };
