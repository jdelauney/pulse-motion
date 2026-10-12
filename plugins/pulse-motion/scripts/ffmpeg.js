#!/usr/bin/env node
'use strict';
/* Pulse Motion – ffmpeg est-il prêt pour l'export fidèle ?
 *
 *   node scripts/ffmpeg.js
 *
 * Affiche { present, chemin, cheminProbe, version, versionOk, installer, message } ; code 0 si utilisable, 1 sinon.
 */
const { trouverFfmpeg } = require('./lib/ffmpeg.js');

if (require.main === module) {
  const r = trouverFfmpeg();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.present && r.versionOk ? 0 : 1);
}
