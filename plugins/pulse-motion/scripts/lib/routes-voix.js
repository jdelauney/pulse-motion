'use strict';
/* Pulse Motion – routes du studio de voix de l'aperçu.
 *
 *   GET  /_pm/studio.mjs          module du studio (aperçu seulement, jamais dans la page livrée)
 *   GET  /_pm/voix/scenes         scènes qui ont un texte à dire, et l'état de leur prise
 *   POST /_pm/voix?scene=<id>     (audio/wav, 50 Mo au plus) → prise écrite, déroulé mis à jour, transcription en fond
 * Le type audio/wav n'est pas « simple » : une autre origine est arrêtée par la requête préalable CORS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./deroule.js');
const { lireVoixScene, priseDeScene } = require('./voix.js');

const STUDIO = path.resolve(__dirname, '..', '..', 'moteur', 'studio.mjs');
const MAX_PRISE = 50 * 1024 ** 2;

function repondre(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}

/**
 * creerRoutesVoix(projet, { whisper, maxOctets, outil }) -> (req, res, url) => bool (true si la route a été traitée)
 * whisper, outil : objets, ou fonctions appelées à chaque prise (installés pendant que l'aperçu tourne).
 */
function creerRoutesVoix(projet, { whisper, maxOctets = MAX_PRISE, outil } = {}) {
  // Chargé à l'appel : scripts/voix.js charge des modules qui dépendent de l'assembleur.
  const { enregistrerPrise } = require('../voix.js');
  let ecritureEnCours = false;

  function listerScenes(res) {
    const { deroule } = lireDeroule(projet);
    if (!deroule || !Array.isArray(deroule.scenes)) return repondre(res, 422, { message: 'Déroulé illisible.' });
    const scenes = deroule.scenes.filter((s) => s && s.voix && s.voix.texte).map((s) => {
      const p = priseDeScene(projet, deroule, s);
      const v = p && !p.erreur ? lireVoixScene(projet, deroule, s) : null;
      return { id: s.id, texte: s.voix.texte, etat: !p || p.erreur ? 'aucune' : p.provisoire ? 'provisoire' : 'enregistree', calage: v && !v.erreur ? v.approche : null };
    });
    return repondre(res, 200, scenes);
  }

  function recevoirPrise(req, res, url) {
    const type = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
    if (type !== 'audio/wav') { req.resume(); return repondre(res, 415, { message: 'Prise WAV attendue.' }); }
    if (ecritureEnCours) { req.resume(); return repondre(res, 409, { message: 'Une prise est déjà en cours d\'enregistrement : attendez un instant.' }); }
    ecritureEnCours = true;
    const morceaux = [];
    let taille = 0;
    let fini = false;
    const finir = (statut, corps) => { if (fini) return; fini = true; ecritureEnCours = false; repondre(res, statut, corps); };
    req.on('data', (m) => {
      if (fini) return;
      taille += m.length;
      if (taille > maxOctets) { finir(413, { message: `Prise trop lourde (${(maxOctets / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo au plus) : enregistrer la scène en plusieurs fois, ou plus courte.` }); return; }
      morceaux.push(m);
    });
    req.on('error', () => finir(400, { message: 'Envoi de la prise interrompu.' }));
    req.on('end', async () => {
      if (fini) return;
      try {
        const actuel = (x) => (typeof x === 'function' ? x() : x);
        const r = await enregistrerPrise({ projet, scene: url.searchParams.get('scene') || '', octets: Buffer.concat(morceaux), outil: actuel(outil), whisper: actuel(whisper), enFond: true });
        if (!r.ok) return finir(r.statut || 422, { message: r.message });
        return finir(200, { fichier: r.fichier, duree: r.duree, calage: r.calage, transcription: r.transcription ? 'en-cours' : null });
      } catch (e) {
        return finir(500, { message: `La prise n'a pas pu être enregistrée (${e.message}).` });
      }
    });
  }

  return function route(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/_pm/studio.mjs') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(STUDIO));
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/_pm/voix/scenes') { listerScenes(res); return true; }
    if (req.method === 'POST' && url.pathname === '/_pm/voix') { recevoirPrise(req, res, url); return true; }
    return false;
  };
}

module.exports = { creerRoutesVoix, MAX_PRISE };
