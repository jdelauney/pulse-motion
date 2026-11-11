'use strict';
/* Pulse Motion – avancement des travaux longs (spec Retouches et ergonomie, 5.2 ; friction 2) : un format commun dans
 * .pulse-motion/avancement.json, écrit de façon atomique, relu par « pulse-motion avancement » et par l'aperçu (bandeau).
 *
 * { travail, libelle, detail, fait, total, debut, maj, restant, fini, ok, message? }
 *   travail : fabrication, ebauche, assemblage, controle, comparaison, export, installation, transcription, voix ;
 *   restant : secondes, calculé quand fait / total ≥ 10 % ou après 5 s (null avant) ; pour l'export, celui que calcule
 *   l'estimation de l'export (moteur/estimation.js, mesures de cet ordinateur : spec Rendu et export, 5.5), donné tel quel.
 *
 * annoncer(projet, { travail, libelle, detail?, fait?, total?, restant? }, { maintenant? }) -> état écrit
 * terminer(projet, { ok, message?, detail? }, { maintenant? }) -> état écrit (fini vrai)
 * lire(projet) -> état | null
 * ligne(etat) -> « Contrôle de la lisibilité : scène 3 sur 6, encore environ 40 s » (français, sans jargon)
 * suivre(projet, { ecrire?, travail, libelle }) -> (fait, total, detail?, restant?) => void : écrit le fichier et, à chaque
 *   palier (10 %) ou changement de detail, une ligne en français sur la sortie d'erreur ; .terminer(ok, message?)
 */
const fs = require('node:fs');
const path = require('node:path');
const { ecrireAtomique } = require('./fichiers.js');
const { texteDuree } = require('../../moteur/estimation.js');

const TRAVAUX = ['fabrication', 'ebauche', 'assemblage', 'controle', 'comparaison', 'export', 'installation', 'transcription', 'voix'];
const PART_MIN = 0.1;
const SECONDES_MIN = 5;

const fichierAvancement = (projet) => path.join(path.resolve(projet), '.pulse-motion', 'avancement.json');

function lire(projet) {
  try { return JSON.parse(fs.readFileSync(fichierAvancement(projet), 'utf8')); } catch { return null; }
}

/** Temps restant estimé (secondes) : null tant que moins de 10 % est fait et que moins de 5 s se sont écoulées. */
function estimerRestant({ fait, total, ecoule }) {
  if (!(total > 0) || !(fait > 0) || fait >= total) return fait >= total && total > 0 ? 0 : null;
  if (fait / total < PART_MIN && ecoule < SECONDES_MIN) return null;
  return Math.max(0, Math.round((ecoule * (total - fait)) / fait));
}

function annoncer(projet, e, { maintenant = Date.now() } = {}) {
  if (!TRAVAUX.includes(e.travail)) throw new Error(`travail inconnu : ${e.travail} (${TRAVAUX.join(', ')})`);
  const avant = lire(projet);
  // Même travail en cours : son début est gardé (le temps restant se calcule depuis le début du travail).
  const debut = avant && avant.travail === e.travail && !avant.fini && avant.debut ? avant.debut : new Date(maintenant).toISOString();
  const fait = Number.isFinite(e.fait) ? e.fait : 0;
  const total = Number.isFinite(e.total) ? e.total : 0;
  const ecoule = Math.max(0, (maintenant - Date.parse(debut)) / 1000);
  const restant = e.restant !== undefined && e.restant !== null ? Math.max(0, Math.round(e.restant)) : estimerRestant({ fait, total, ecoule });
  const etat = { travail: e.travail, libelle: e.libelle || e.travail, detail: e.detail || '', fait, total, debut, maj: new Date(maintenant).toISOString(), restant, fini: false, ok: null };
  ecrireAtomique(fichierAvancement(projet), JSON.stringify(etat, null, 2));
  return etat;
}

function terminer(projet, { ok = true, message, detail } = {}, { maintenant = Date.now() } = {}) {
  const avant = lire(projet) || { travail: 'fabrication', libelle: '', detail: '', fait: 0, total: 0, debut: new Date(maintenant).toISOString() };
  const etat = { ...avant, ...(detail !== undefined ? { detail } : {}), fait: ok && avant.total ? avant.total : avant.fait, maj: new Date(maintenant).toISOString(), restant: ok ? 0 : null, fini: true, ok: Boolean(ok),
    ...(message ? { message } : {}) };
  ecrireAtomique(fichierAvancement(projet), JSON.stringify(etat, null, 2));
  return etat;
}

/** Une ligne en français : « Contrôle de la lisibilité : scène 3 sur 6, encore environ 40 s » ; fini : « … : terminé ». */
function ligne(e) {
  if (!e) return 'Aucun travail en cours.';
  const debut = e.libelle || e.travail;
  if (e.fini) return e.ok ? `${debut} : terminé.` : `${debut} : échec${e.message ? ` (${e.message})` : ''}.`;
  const parts = [];
  if (e.detail) parts.push(e.detail);
  else if (e.total > 0) parts.push(`${Math.floor((100 * e.fait) / e.total)} %`);
  if (Number.isFinite(e.restant) && e.restant !== null && e.restant > 0) parts.push(`encore environ ${texteDuree(e.restant)}`);
  return parts.length ? `${debut} : ${parts.join(', ')}.` : `${debut}…`;
}

/** Suivi d'un travail par une commande : fichier à chaque appel, ligne sur stderr à chaque palier de 10 % ou nouveau detail.
 *  projet null, ou dossier sans deroule.json (commande lancée hors d'une vidéo) : les lignes seulement, aucun fichier écrit. */
function suivre(dossier, { travail, libelle, ecrire = (l) => process.stderr.write(`${l}\n`), maintenant = () => Date.now() }) {
  // Un dossier sans deroule.json n'est pas une vidéo : aucun fichier d'avancement n'y est écrit (commande lancée au
  // mauvais endroit, ou qui échoue faute de déroulé), seulement les lignes.
  const projet = dossier && fs.existsSync(path.join(path.resolve(dossier), 'deroule.json')) ? dossier : null;
  let palier = -1;
  let dernierDetail = null;
  const f = (fait, total, detail, restant) => {
    let e;
    try {
      e = projet ? annoncer(projet, { travail, libelle, detail, fait, total, restant }, { maintenant: maintenant() })
        : { travail, libelle: libelle || travail, detail: detail || '', fait, total, restant: restant === undefined ? null : restant, fini: false, ok: null };
    } catch { return; }
    const p = total > 0 ? Math.floor((10 * fait) / total) : 0;
    if (p > palier || (detail && detail !== dernierDetail)) {
      palier = Math.max(palier, p);
      dernierDetail = detail || dernierDetail;
      ecrire(ligne(e));
    }
  };
  f.terminer = (ok = true, message) => {
    try { ecrire(ligne(projet ? terminer(projet, { ok, message }, { maintenant: maintenant() }) : { travail, libelle: libelle || travail, detail: '', fait: 0, total: 0, restant: ok ? 0 : null, fini: true, ok: Boolean(ok), ...(message ? { message } : {}) })); } catch { /* dossier en lecture seule : rien */ }
  };
  return f;
}

module.exports = { TRAVAUX, fichierAvancement, lire, annoncer, terminer, ligne, suivre, estimerRestant };
