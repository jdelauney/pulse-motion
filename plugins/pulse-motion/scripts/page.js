#!/usr/bin/env node
'use strict';
/* Pulse Motion – options de la page livrée (spec Retouches et ergonomie, 5.18).
 *
 *   node scripts/page.js <dossier> --bouton-mp4 oui|non
 *     oui : la page qui sait faire son MP4 (« page.boutonMp4: true » dans le déroulé, environ 250 Ko de plus) ;
 *     non : la page plus légère, sans le bouton MP4 (« boutonMp4: false »).
 *   Sauvegarde d'historique d'abord, déroulé réécrit de façon atomique, page réassemblée. La vidéo ne change pas d'aspect.
 *   -> { ok, boutonMp4, fichier, poids } | { ok: false, message }
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const { ecrireAtomique } = require('./lib/fichiers.js');

function reglerPage({ dossier = '.', boutonMp4 }) {
  if (typeof boutonMp4 !== 'boolean') return { ok: false, message: 'Dire « oui » (la page sait faire son MP4) ou « non » (page plus légère).' };
  const projet = path.resolve(dossier);
  const { erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const fichier = path.join(projet, 'deroule.json');
  const brut = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, ''));
  const avant = Boolean(brut.page && brut.page.boutonMp4 === true);
  if (avant !== boutonMp4) {
    require('./historique.js').sauvegarder(projet, { phrase: boutonMp4 ? 'une page qui sait faire son MP4' : 'une page plus légère, sans le bouton MP4' });
    brut.page = { ...(brut.page || {}), boutonMp4 };
    ecrireAtomique(fichier, `${JSON.stringify(brut, null, 2)}\n`);
  }
  const a = require('./assembler.js').assembler({ dossier: projet });
  if (!a.ok) return { ok: false, message: `La page n'a pas pu être réassemblée : ${a.erreurs.map((e) => e.message).join(' ')}` };
  return { ok: true, boutonMp4, fichier: path.relative(projet, a.fichier).split(path.sep).join('/'), poids: Buffer.byteLength(a.html, 'utf8') };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--bouton-mp4');
  const v = i >= 0 ? args[i + 1] : undefined;
  const dossier = args.find((x, k) => !x.startsWith('--') && args[k - 1] !== '--bouton-mp4') || '.';
  if (v !== 'oui' && v !== 'non') {
    console.error('Usage : pulse-motion page <dossier> --bouton-mp4 oui|non');
    process.exit(2);
  }
  const r = reglerPage({ dossier, boutonMp4: v === 'oui' });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

module.exports = { reglerPage };
