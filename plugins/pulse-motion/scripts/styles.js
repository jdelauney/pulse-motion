#!/usr/bin/env node
'use strict';
/* Pulse Motion – catalogue des styles : styles livrés et personnels, recommandation, contrat.
 *
 *   node scripts/styles.js [--genre <genre>]     liste des styles (JSON), classée pour le genre
 *   node scripts/styles.js verifier <nom>        vérifie le contrat d'un style
 */
const fs = require('node:fs');
const path = require('node:path');
const { TYPES, FAMILLES, NOM_STYLE } = require('./lib/contrat.js');
const { TRANSITIONS, GENRES } = require('./lib/deroule.js');
const { extraireScene } = require('./lib/extraire.js');
const { verifierSection } = require('./lib/scenes.js');
const { contraste } = require('./lib/couleurs.js');
const { dossierPersonnel } = require('./lib/personnel.js');
const SEUILS = require('./seuils.json');

const RACINE = path.resolve(__dirname, '..');
const LIVRES = path.join(RACINE, 'styles');
const POLICES_SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);
const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

function lireJSON(fichier) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

function lireTexte(fichier) {
  try { return fs.readFileSync(fichier, 'utf8'); } catch { return null; }
}

const EFFETS = [
  [/filter\s*:[^;}]*url\(/i, 'filter: url(…)'],
  [/<filter\b|<fe[A-Z]\w*/, 'filtre SVG'],
  [/mix-blend-mode\s*:/i, 'mix-blend-mode'],
  [/backdrop-filter\s*:/i, 'backdrop-filter'],
];

function verifierEffets(texte, ou, avertissements) {
  const sansCommentaires = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const [motif, nom] of EFFETS) {
    if (motif.test(sansCommentaires)) {
      avertissements.push(`${ou} : ${nom} est mal rendu par l'export rapide (MP4 dans le navigateur) ; préférer une image embarquée (texture) ou une ombre décalée.`);
    }
  }
}

function verifierCatalogue(dossier, nom, catalogue, erreurs, avertissements) {
  if (catalogue.style !== nom) erreurs.push(`catalogue.json : « style » doit valoir « ${nom} » (nom du dossier).`);
  for (const t of catalogue.transitions || []) {
    if (!TRANSITIONS.includes(t)) erreurs.push(`catalogue.json : transition inconnue du moteur « ${t} ».`);
  }
  const decrites = new Map((catalogue.scenes || []).map((s) => [s.nom, s]));
  for (const [type, cles] of Object.entries(TYPES)) {
    const attendues = [...cles].sort().join(', ');
    const s = decrites.get(type);
    if (!s) erreurs.push(`catalogue.json : scène « ${type} » absente.`);
    else {
      const declarees = Object.keys(s.textes || {}).sort().join(', ');
      if (declarees !== attendues) erreurs.push(`catalogue.json, scène « ${type} » : clés de texte ${declarees || 'aucune'} au lieu de ${attendues}.`);
      if (!(typeof s.duree === 'number' && s.duree > 0)) erreurs.push(`catalogue.json, scène « ${type} » : « duree » manquante.`);
    }
    const html = lireTexte(path.join(dossier, 'scenes', `${type}.html`));
    if (html === null) { erreurs.push(`Fichier scenes/${type}.html manquant.`); continue; }
    const section = verifierSection(html, type);
    if (section) erreurs.push(`scenes/${type}.html : ${section}`);
    const textes = [...new Set(extraireScene(html).textes)].sort().join(', ');
    if (textes !== attendues) erreurs.push(`scenes/${type}.html : data-texte ${textes || 'aucun'} au lieu de ${attendues}.`);
    if (!/\sdata-decor\b/.test(html)) avertissements.push(`scenes/${type}.html : aucun élément data-decor (le décor ne sera pas étiré à la durée de la scène).`);
    verifierEffets(html, `scenes/${type}.html`, avertissements);
  }
}

function verifierIdentite(nom, identite, css, erreurs) {
  if (identite.style !== nom) erreurs.push(`identite.json : « style » doit valoir « ${nom} ».`);
  if (!FAMILLES.includes(identite.famille)) erreurs.push(`identite.json : « famille » doit être l'une de : ${FAMILLES.join(', ')}.`);
  if (!Array.isArray(identite.personnalite) || identite.personnalite.length !== 3) erreurs.push('identite.json : « personnalite » doit contenir 3 mots.');
  if (!Array.isArray(identite.genres) || !identite.genres.length || identite.genres.some((g) => !GENRES.includes(g))) {
    erreurs.push(`identite.json : « genres » doit contenir au moins un genre parmi : ${GENRES.join(', ')}.`);
  }
  const c = identite.couleur || {};
  if (!Array.isArray(c.tons) || !c.tons.length || c.tons.some((t) => !['clair', 'sombre'].includes(t))) {
    erreurs.push('identite.json : « couleur.tons » doit contenir clair, sombre ou les deux.');
  } else if (!c.tons.includes(c.tonDefaut)) {
    erreurs.push('identite.json : « couleur.tonDefaut » doit être l\'un des tons déclarés.');
  } else if (c.tons.length === 2 && !/\[data-ton=["']?sombre/.test(css)) {
    erreurs.push('style.css : variante [data-ton="sombre"] absente alors que le ton sombre est déclaré.');
  }
  const typo = identite.typographie || {};
  for (const role of ['titres', 'texte']) {
    if (!typo[role] || !typo[role].famille || !typo[role].categorie) erreurs.push(`identite.json : « typographie.${role} » doit indiquer famille et categorie.`);
  }
  const transitions = (identite.mouvement || {}).transitions;
  if (!Array.isArray(transitions) || !transitions.length) erreurs.push('identite.json : « mouvement.transitions » est obligatoire.');
  else for (const t of transitions) if (!TRANSITIONS.includes(t)) erreurs.push(`identite.json : transition inconnue du moteur « ${t} ».`);
  if (typeof identite.signature !== 'string' || !identite.signature.trim()) erreurs.push('identite.json : « signature » est obligatoire.');
}

function verifierCharte(dossier, charte, erreurs) {
  const licences = lireTexte(path.join(dossier, 'polices', 'LICENCES.md')) || '';
  for (const [role, famille] of Object.entries(charte.polices || {})) {
    if (POLICES_SYSTEME.has(famille)) continue;
    if (!fs.existsSync(path.join(dossier, 'polices', `${famille}.woff2`))) erreurs.push(`Police « ${famille} » (charte.polices.${role}) : fichier polices/${famille}.woff2 manquant.`);
    else if (!licences.includes(famille)) erreurs.push(`Police « ${famille} » : licence absente de polices/LICENCES.md.`);
  }
  const couleurs = charte.couleurs || {};
  if (couleurs.fond) {
    for (const [nomCouleur, minimum] of [['texte', SEUILS.contrasteTexte], ['primaire', SEUILS.contrasteTitres]]) {
      if (!couleurs[nomCouleur]) continue;
      const c = contraste(couleurs[nomCouleur], couleurs.fond);
      if (c < minimum) erreurs.push(`charte.json : contraste ${nomCouleur}/fond de ${virgule(c)}:1, il faut au moins ${virgule(minimum)}:1.`);
    }
  }
}

/** Vérifie qu'un dossier de style respecte le contrat. -> { ok, erreurs, avertissements } */
function verifierStyle(dossier) {
  const erreurs = [];
  const avertissements = [];
  const nom = path.basename(dossier);
  if (!NOM_STYLE.test(nom)) erreurs.push(`Nom de style « ${nom} » : seulement des lettres minuscules, des chiffres et des tirets.`);
  const css = lireTexte(path.join(dossier, 'style.css'));
  if (css === null) erreurs.push('style.css manquant.');
  else verifierEffets(css, 'style.css', avertissements);
  const catalogue = lireJSON(path.join(dossier, 'catalogue.json'));
  if (!catalogue) erreurs.push('catalogue.json manquant ou illisible.');
  else verifierCatalogue(dossier, nom, catalogue, erreurs, avertissements);
  const identite = lireJSON(path.join(dossier, 'identite.json'));
  if (!identite) erreurs.push('identite.json manquant ou illisible.');
  else verifierIdentite(nom, identite, css || '', erreurs);
  verifierCharte(dossier, lireJSON(path.join(dossier, 'charte.json')) || {}, erreurs);
  return { ok: erreurs.length === 0, erreurs, avertissements };
}

module.exports = { verifierStyle, lireJSON, RACINE, LIVRES, dossierPersonnel };
