'use strict';
/* Copie du plugin hors du dépôt (dossier temporaire du système), sans ses tests : comme une fois installé. */
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./temporaire.js');

const RACINE = path.join(__dirname, '..', '..');
const EXCLUS = new Set(['tests', 'sortie-tests', 'node_modules', '.git']);

/** -> chemin de la copie (dossier pulse-motion dans un dossier temporaire). */
function copierPlugin() {
  const cible = path.join(dossierTemporaire('pm-plugin-'), 'pulse-motion');
  fs.cpSync(RACINE, cible, { recursive: true, filter: (src) => !EXCLUS.has(path.relative(RACINE, src).split(path.sep)[0]) });
  return cible;
}

module.exports = { copierPlugin, RACINE };
