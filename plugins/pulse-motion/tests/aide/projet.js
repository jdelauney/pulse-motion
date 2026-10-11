'use strict';
/* Copie un projet d'exemple de tests/fixtures dans un dossier temporaire. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const STYLES = path.join(FIXTURES, 'styles');
const EFFETS = path.join(FIXTURES, 'effets');

function copierProjet(nom) {
  const cible = fs.mkdtempSync(path.join(os.tmpdir(), `pm-${nom}-`));
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
