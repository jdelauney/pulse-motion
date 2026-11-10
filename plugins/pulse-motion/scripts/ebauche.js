#!/usr/bin/env node
'use strict';
/* Pulse Motion – ébauche animée des scènes absentes, dès l'accord sur le déroulé (spec Retouches et ergonomie, 5.3).
 *
 *   node scripts/ebauche.js <dossier-du-projet>
 *
 * Écrit chaque fichier de scène absent (scène toute faite du style, ou carte neutre pour une scène composée), marqué
 * data-ebauche ; n'écrase jamais un fichier existant. Affiche { ok, ecrites, gardees } ; code 1 avec { ok: false, message }.
 * Avancement : .pulse-motion/avancement.json (travail « ebauche ») et une ligne en français sur la sortie d'erreur.
 */
const path = require('node:path');
const { ecrireEbauche } = require('./lib/ebauche.js');

if (require.main === module) {
  const dossier = process.argv.slice(2).find((a) => !a.startsWith('--')) || '.';
  const projet = path.resolve(dossier);
  const fs = require('node:fs');
  // Hors d'une vidéo : aucun fichier d'avancement (rien n'est écrit hors d'une vidéo).
  const suivi = require('./lib/avancement.js').suivre(fs.existsSync(path.join(projet, 'deroule.json')) ? projet : null, { travail: 'ebauche', libelle: 'Ébauche animée des scènes' });
  let r;
  try { r = ecrireEbauche({ dossier: projet, suivi }); } catch (e) { r = { ok: false, message: `L'ébauche n'a pas pu être écrite (${e.message}).` }; }
  suivi.terminer(r.ok, r.ok ? undefined : r.message);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

module.exports = { ecrireEbauche };
