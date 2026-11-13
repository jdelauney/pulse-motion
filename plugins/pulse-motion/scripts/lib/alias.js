'use strict';
/* Pulse Motion – références connues → styles (spec S11, 5.2) : references/styles/alias.json.
 *
 *   { "<référence>": { "styles": [1 ou 2 styles], "reprend": "<le médium repris>" } }
 *   { "<référence>": { "styles": [], "sansRecette": "<phrase>", "proche": [styles] } }
 *
 * Une clé qui commence par « _ » est une note. On reprend le médium, jamais l'œuvre : ces noms ne vivent que dans ce fichier
 * (jamais dans une fiche, une scène ni à l'écran : règle alias-a-l-ecran).
 * Idée de la table, du repli et de la note « un nom ne veut jamais dire copier » : cinecode, styles/aliases.json (MIT,
 * © 2026 Sarp Yıldız) ; code écrit à neuf.
 */
const fs = require('node:fs');
const path = require('node:path');

const FICHIER = path.join(__dirname, '..', '..', 'references', 'styles', 'alias.json');

// Petits mots ignorés dans une recherche de style (« façon tableau blanc », « quelque chose à la craie »).
const MOTS_VIDES = new Set(['a', 'au', 'aux', 'avec', 'de', 'des', 'du', 'en', 'et', 'la', 'le', 'les', 'l', 'd', 'un', 'une', 'sur', 'pour', 'par',
  'facon', 'style', 'comme', 'genre', 'maniere', 'mode', 'look', 'esprit', 'type', 'quelque', 'chose', 'video', 'fais', 'fait', 'moi', 'je', 'veux',
  'plutot', 'plus', 'tres']);
const racineMot = (mot) => (mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot);

/** Sans accents ni casse, la ponctuation remplacée par des espaces. */
function sansAccents(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Mots cherchés d'une demande : sans accents, sans ponctuation ni petits mots, au singulier. */
function termesRecherche(texte) {
  return sansAccents(texte).split(' ').filter((t) => t && !MOTS_VIDES.has(t)).map(racineMot);
}

const caches = new Map();
/** -> [{ reference, styles, reprend?, sansRecette?, proche?, termes, phrase }] (phrase : la clé sans accents, pour l'écran). */
function lireAlias(fichier = FICHIER) {
  let mtime = 0;
  try { mtime = fs.statSync(fichier).mtimeMs; } catch { return []; }
  const vu = caches.get(fichier);
  if (vu && vu.mtime === mtime) return vu.liste;
  let brut = {};
  try { brut = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')); } catch { brut = {}; }
  const liste = [];
  for (const [reference, v] of Object.entries(brut || {})) {
    if (reference.startsWith('_') || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const termes = termesRecherche(reference);
    if (!termes.length) continue;
    liste.push({
      reference,
      styles: Array.isArray(v.styles) ? v.styles.filter((s) => typeof s === 'string') : [],
      ...(typeof v.reprend === 'string' ? { reprend: v.reprend } : {}),
      ...(typeof v.sansRecette === 'string' ? { sansRecette: v.sansRecette } : {}),
      ...(Array.isArray(v.proche) ? { proche: v.proche.filter((s) => typeof s === 'string') } : {}),
      termes,
      phrase: sansAccents(reference),
    });
  }
  caches.set(fichier, { mtime, liste });
  return liste;
}

/** La référence dont tous les mots sont dans la demande (termes), la plus longue d'abord ; null sinon. */
function trouverAlias(termes, fichier) {
  const demande = new Set(termes);
  let meilleur = null;
  for (const a of lireAlias(fichier)) {
    if (!a.termes.every((t) => demande.has(t))) continue;
    if (!meilleur || a.termes.length > meilleur.termes.length) meilleur = a;
  }
  return meilleur;
}

/** Références écrites dans un texte (en entier, mot pour mot, sans accents ni casse). -> [référence] */
function referencesDansTexte(texte, fichier) {
  const t = ` ${sansAccents(texte)} `;
  return lireAlias(fichier).filter((a) => t.includes(` ${a.phrase} `)).map((a) => a.reference);
}

module.exports = { lireAlias, trouverAlias, referencesDansTexte, termesRecherche, sansAccents, racineMot, MOTS_VIDES, FICHIER };
