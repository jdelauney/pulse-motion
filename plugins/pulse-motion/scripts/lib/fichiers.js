'use strict';
// Pulse Motion – écritures sur le disque sans fichier à moitié écrit.
// ecrireAtomique écrit dans un fichier temporaire voisin (.<nom>.<pid>-<compteur>.part), puis le renomme : un lecteur
// (aperçu, commande pulse-motion, éditeur) voit l'ancien contenu ou le nouveau, jamais un morceau. Sous Windows, le
// renommage est réessayé si le fichier est un instant verrouillé (antivirus, indexation, surveillance du dossier).
// Principe repris d'explainroo (src/server.js, téléversements en .part, MIT, voir THIRD-PARTY-NOTICES.md).

const fs = require('node:fs');
const path = require('node:path');

const ESSAIS = 3;
const PAUSE_MS = 100;
const VERROUS = ['EPERM', 'EBUSY', 'EACCES'];
let compteur = 0;

const attendre = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Nom de fichier simple (minuscules, chiffres, tirets, une extension) : sert aux noms venus d'une page. */
const NOM_SUR = /^[a-z0-9-]+(\.[a-z0-9]+)?$/;

/**
 * ecrireAtomique(fichier, donnees, { essais?, pause? }) : écrit `donnees` (texte ou Buffer) dans `fichier`.
 * Le dossier est créé s'il manque. En cas d'échec, le fichier d'origine est intact et le temporaire retiré.
 */
function ecrireAtomique(fichier, donnees, { essais = ESSAIS, pause = PAUSE_MS } = {}) {
  const dossier = path.dirname(fichier);
  fs.mkdirSync(dossier, { recursive: true });
  const temporaire = path.join(dossier, `.${path.basename(fichier)}.${process.pid}-${++compteur}.part`);
  try {
    fs.writeFileSync(temporaire, donnees);
    for (let essai = 1; ; essai++) {
      try {
        fs.renameSync(temporaire, fichier);
        return;
      } catch (e) {
        if (essai >= essais || !VERROUS.includes(e.code)) throw e;
        attendre(pause);
      }
    }
  } catch (e) {
    try { fs.rmSync(temporaire, { force: true }); } catch { /* rien à nettoyer */ }
    throw e;
  }
}

/** ecrireJSON(fichier, objet) : JSON indenté, écrit de façon atomique. */
function ecrireJSON(fichier, objet) {
  ecrireAtomique(fichier, JSON.stringify(objet, null, 2));
}

module.exports = { ecrireAtomique, ecrireJSON, NOM_SUR };
