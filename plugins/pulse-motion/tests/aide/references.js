'use strict';
/* Aide des tests – lecture d'une référence découpée en tronc et parties (spec Rapidité § 5.4) : references/<nom>.md est
 * le tronc, references/<nom>/*.md ses parties, lues à la carte par « pulse-motion reference <nom>/<partie> ». */
const fs = require('node:fs');
const path = require('node:path');

const REFERENCES = path.join(__dirname, '..', '..', 'references');

/** Parties d'une référence, dans l'ordre alphabétique : [{ nom: 'moteur/camera', fichier, texte }]. */
function partiesDe(nom) {
  const dossier = path.join(REFERENCES, nom);
  if (!fs.existsSync(dossier) || !fs.statSync(dossier).isDirectory()) return [];
  return fs.readdirSync(dossier).filter((f) => f.endsWith('.md')).sort().map((f) => ({
    nom: `${nom}/${f.slice(0, -3)}`, fichier: path.join(dossier, f), texte: fs.readFileSync(path.join(dossier, f), 'utf8'),
  }));
}

/** Texte d'une référence : le tronc seul, ou (parties: true) le tronc suivi de toutes ses parties. */
function lireReference(nom, { parties = false } = {}) {
  const tronc = fs.readFileSync(path.join(REFERENCES, `${nom}.md`), 'utf8');
  if (!parties) return tronc;
  return [tronc, ...partiesDe(nom).map((p) => p.texte)].join('\n');
}

/** Section d'une référence (tronc et parties) : du titre donné, quel que soit son niveau, au titre suivant de même niveau ou plus haut. */
function sectionReference(nom, titre) {
  const texte = lireReference(nom, { parties: true });
  const lignes = texte.split(/\r?\n/);
  const i = lignes.findIndex((l) => /^#{1,6} /.test(l) && l.replace(/^#+ /, '') === titre);
  if (i < 0) return null;
  const niveau = /^#+/.exec(lignes[i])[0].length;
  let j = i + 1;
  while (j < lignes.length && !(/^#{1,6} /.test(lignes[j]) && /^#+/.exec(lignes[j])[0].length <= niveau)) j++;
  return lignes.slice(i, j).join('\n');
}

module.exports = { lireReference, partiesDe, sectionReference, REFERENCES };
