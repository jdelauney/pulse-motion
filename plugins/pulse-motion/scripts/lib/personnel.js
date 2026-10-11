'use strict';
/* Pulse Motion – dossier des données de la personne (styles personnels, chartes, lexique). */
const os = require('node:os');
const path = require('node:path');

/** $PULSE_MOTION_DOSSIER, sinon ~/.pulse-motion. Rien n'est créé ici. */
function dossierPersonnel() {
  return process.env.PULSE_MOTION_DOSSIER || path.join(os.homedir(), '.pulse-motion');
}

module.exports = { dossierPersonnel };
