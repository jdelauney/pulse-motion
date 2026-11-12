'use strict';
/* Pulse Motion – dossier des données de la personne (styles personnels, chartes, lexique, préférences, vidéos, journal des
 * erreurs, version vue). */
const os = require('node:os');
const path = require('node:path');

/** $PULSE_MOTION_DOSSIER, sinon ~/.pulse-motion. Rien n'est créé ici. */
function dossierPersonnel() {
  return process.env.PULSE_MOTION_DOSSIER || path.join(os.homedir(), '.pulse-motion');
}

/**
 * Dossier où écrire en passant (registre des vidéos, journal des erreurs, version vue), ou null : jamais le vrai dossier de la
 * personne pendant les tests (node --test pose NODE_TEST_CONTEXT dans chaque fichier de test et ses processus enfants) sans
 * PULSE_MOTION_DOSSIER.
 */
function dossierPersonnelEcrivable() {
  if (!process.env.PULSE_MOTION_DOSSIER && process.env.NODE_TEST_CONTEXT) return null;
  return dossierPersonnel();
}

module.exports = { dossierPersonnel, dossierPersonnelEcrivable };
