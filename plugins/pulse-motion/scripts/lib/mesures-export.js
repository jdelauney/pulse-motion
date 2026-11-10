'use strict';
/* Pulse Motion – vitesse d'export mesurée sur cet ordinateur (spec Rendu et export, 5.5 point 3).
 *
 * <dossier personnel>/mesures-export.json : { version: 1, mesures: [{ voie, definition, ips, flou, imagesParSeconde,
 *   finalesParSeconde, date }] }, les 5 dernières. imagesParSeconde : images réellement capturées par seconde (segments repris
 *   exclus) ; finalesParSeconde : temps des phases finales (son, assemblage, vérification, seconde passe) par seconde de vidéo.
 * noterMesure(mesure, { dossier? }) ; lireMesures({ dossier? }) -> [mesure]
 * estimerSecondes({ voie, definition, ips, duree, usage?, flou?, mesures? }) -> { secondes, source: 'mesure' | 'usages' | 'defaut' }
 */
const fs = require('node:fs');
const path = require('node:path');
const { dossierPersonnel } = require('./personnel.js');

const FICHIER = 'mesures-export.json';
const GARDEES = 5;
/** Sans aucune mesure : secondes de calcul par seconde de vidéo (ce que disait le skill avant les mesures). */
const DEFAUT = { fidele: 2, navigateur: 3 };

function lireMesures({ dossier = dossierPersonnel() } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dossier, FICHIER), 'utf8'));
    return Array.isArray(j.mesures) ? j.mesures : [];
  } catch { return []; }
}

function noterMesure(mesure, { dossier = dossierPersonnel() } = {}) {
  if (!mesure || !(mesure.imagesParSeconde > 0)) return;
  const mesures = [...lireMesures({ dossier }), { ...mesure, date: mesure.date || new Date().toISOString() }].slice(-GARDEES);
  try {
    fs.mkdirSync(dossier, { recursive: true });
    const f = path.join(dossier, FICHIER);
    fs.writeFileSync(`${f}.part`, JSON.stringify({ version: 1, mesures }, null, 2), 'utf8');
    fs.renameSync(`${f}.part`, f);
  } catch { /* mesure facultative */ }
}

const mediane = (v) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

function estimerSecondes({ voie = 'fidele', definition = '1080p', ips = 30, duree, usage = null, flou = false, mesures = lireMesures() }) {
  const images = Math.round(duree * ips);
  // Un export avec flou de mouvement (5.8) capture plus d'images : comparé d'abord aux exports qui en avaient aussi.
  const memeFlou = (m) => Boolean(m.flou) === Boolean(flou);
  const exacts = mesures.filter((m) => m.voie === voie && m.definition === definition && m.ips === ips);
  const memes = exacts.filter(memeFlou).length ? exacts.filter(memeFlou) : exacts;
  const proches = memes.length ? memes : mesures.filter((m) => m.voie === voie);
  if (proches.length) {
    const vitesse = mediane(proches.map((m) => m.imagesParSeconde));
    const finales = mediane(proches.map((m) => m.finalesParSeconde || 0));
    return { secondes: Math.round(images / vitesse + finales * duree), source: 'mesure' };
  }
  if (usage && usage.mesures && typeof usage.mesures.secondesParSeconde === 'number') {
    return { secondes: Math.round(usage.mesures.secondesParSeconde * duree), source: 'usages' };
  }
  return { secondes: Math.round((DEFAUT[voie] || 2) * duree), source: 'defaut' };
}

module.exports = { lireMesures, noterMesure, estimerSecondes, FICHIER, GARDEES };
