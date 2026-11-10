#!/usr/bin/env node
'use strict';
/* Pulse Motion – remarques laissées sur l'image dans l'aperçu (spec Retouches et ergonomie, 5.8).
 *
 *   node scripts/remarques.js [liste] [<dossier>]                       remarques (ré-ancrées) : ouvertes, à discuter, faites
 *   node scripts/remarques.js attendre [<dossier>] [--delai <minutes>]   rend la main au prochain « Envoyer à Claude » (2 h au plus)
 *   node scripts/remarques.js faite <id> "<réponse>" [<dossier>]       faite ; exige l'image d'après (planche --instants)
 *   node scripts/remarques.js discuter <id> "<question>" [<dossier>]   remarque de goût ou incomprise : à discuter
 *
 * Résumé JSON ; code de sortie 1 avec un message en français en cas d'échec.
 */
const R = require('./lib/remarques.js');

const ACTIONS = ['liste', 'attendre', 'faite', 'discuter'];

/** -> { action, id, texte, dossier, delai } */
function lireArguments(args) {
  const iDelai = args.indexOf('--delai');
  const delai = iDelai >= 0 ? Number(String(args[iDelai + 1]).replace(',', '.')) : null;
  const libres = args.filter((a, k) => !(a === '--delai' || (iDelai >= 0 && k === iDelai + 1)));
  const action = ACTIONS.includes(libres[0]) ? libres.shift() : 'liste';
  if (action === 'faite' || action === 'discuter') {
    const [id, texte, dossier = '.'] = libres;
    return { action, id, texte, dossier, delai };
  }
  return { action, dossier: libres[0] || '.', delai };
}

async function lancer(args) {
  const { action, id, texte, dossier, delai } = lireArguments(args);
  if (action === 'liste') return R.liste(dossier);
  if (action === 'attendre') return R.attendre(dossier, Number.isFinite(delai) && delai > 0 ? { delai: delai * 60000 } : {});
  if (action === 'faite') return R.faite(dossier, id, texte);
  return R.discuter(dossier, id, texte);
}

if (require.main === module) {
  lancer(process.argv.slice(2)).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }, (e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { lancer, lireArguments };
