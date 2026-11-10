#!/usr/bin/env node
'use strict';
/* Pulse Motion – crédits de la vidéo (spec Rendu et export, 5.20).
 *
 *   node scripts/credits.js <dossier> noter <fichier> "<source>" "<licence>" ["<auteur>"]
 *        note d'où vient un fichier importé de assets/ (assets/sources.json) ; Claude l'appelle quand la personne le dit
 *        (« la musique vient de Pixabay ») ;
 *   node scripts/credits.js <dossier>
 *        crédits tels qu'ils seront joints au prochain export ({ texte, aPreciser }).
 * Résumé JSON ; code 1 en cas d'échec.
 */
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const L = require('./lib/livrables.js');

function principal(args) {
  const [dossier = '.', action, ...reste] = args;
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (action === 'noter') {
    const [fichier, source, licence, auteur] = reste;
    return L.noterSource({ projet, fichier, source, licence, auteur });
  }
  if (action !== undefined) return { ok: false, message: 'Usage : pulse-motion credits <dossier> [noter <fichier> "<source>" "<licence>" ["<auteur>"]]' };
  const { assembler } = require('./assembler.js');
  const assemblage = assembler({ dossier: projet, ecrire: false });
  const c = L.credits({ projet, deroule, assemblage: assemblage.ok ? assemblage : null });
  return { ok: true, texte: c.texte, aPreciser: c.aPreciser };
}

if (require.main === module) {
  const r = principal(process.argv.slice(2));
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

module.exports = { principal };
