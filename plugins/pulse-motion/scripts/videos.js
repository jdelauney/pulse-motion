#!/usr/bin/env node
'use strict';
/* Pulse Motion – les vidéos de la personne (spec Retouches et ergonomie, 5.21).
 *
 *   node scripts/videos.js   -> { ok, videos: [{ dossier, titre, introuvable, etape, duree, format, style, page, mp4, modifiee }] }
 *
 * Registre ~/.pulse-motion/videos.json (lib/videos.js). Un dossier disparu est marqué « introuvable », jamais retiré.
 */
const { listerVideos } = require('./lib/videos.js');

if (require.main === module) console.log(JSON.stringify(listerVideos(), null, 2));

module.exports = { listerVideos };
