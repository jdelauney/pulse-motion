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
const { trouverFichiersPolice } = require('./lib/police.js');
const SEUILS = require('./seuils.json');

const RACINE = path.resolve(__dirname, '..');
const LIVRES = path.join(RACINE, 'styles');
const HEX = /^#[0-9a-fA-F]{6}$/;
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
  if (!Array.isArray(catalogue.scenes)) {
    erreurs.push('catalogue.json : « scenes » doit être une liste.');
    return;
  }
  const decrites = new Map(catalogue.scenes.map((s) => [s && s.nom, s]));
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
  } else if (c.tons.includes('sombre')) {
    if (c.tons.length === 2 && !/\[data-ton=["']?sombre/.test(css)) erreurs.push('style.css : variante [data-ton="sombre"] absente alors que le ton sombre est déclaré.');
    const s = c.sombre || {};
    if (!HEX.test(s.fond || '') || !HEX.test(s.texte || '')) erreurs.push('identite.json : « couleur.sombre » doit indiquer fond et texte en #rrggbb pour le ton sombre.');
    else if (contraste(s.texte, s.fond) < SEUILS.contrasteTexte) erreurs.push(`identite.json : contraste texte/fond du ton sombre de ${virgule(contraste(s.texte, s.fond))}:1, il faut au moins ${virgule(SEUILS.contrasteTexte)}:1.`);
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
    if (!trouverFichiersPolice(famille, [path.join(dossier, 'polices')]).length) erreurs.push(`Police « ${famille} » (charte.polices.${role}) : aucun fichier ${famille}.woff2 ou ${famille}-<graisse>.woff2 dans polices/.`);
    else if (!licences.includes(famille)) erreurs.push(`Police « ${famille} » : licence absente de polices/LICENCES.md.`);
  }
  const couleurs = charte.couleurs || {};
  if (couleurs.fond) {
    for (const nomCouleur of ['texte', 'primaire', 'fond']) {
      if (couleurs[nomCouleur] !== undefined && !HEX.test(couleurs[nomCouleur])) {
        erreurs.push(`charte.json : « couleurs.${nomCouleur} » doit être une couleur #rrggbb.`);
      }
    }
    if (erreurs.some((e) => e.startsWith('charte.json : « couleurs.'))) return;
    for (const [nomCouleur, minimum] of [['texte', SEUILS.contrasteTexte], ['primaire', SEUILS.contrasteTitres]]) {
      if (!couleurs[nomCouleur]) continue;
      const c = contraste(couleurs[nomCouleur], couleurs.fond);
      if (c < minimum) erreurs.push(`charte.json : contraste ${nomCouleur}/fond de ${virgule(c)}:1, il faut au moins ${virgule(minimum)}:1.`);
    }
  }
}

/** Vérifie qu'un dossier de style respecte le contrat. -> { ok, erreurs, avertissements } (ne lève jamais) */
function verifierStyle(dossier) {
  try {
    return verifierContrat(dossier);
  } catch (e) {
    // Un fichier de style aux valeurs d'un mauvais type ne doit pas faire tomber la liste des styles.
    return { ok: false, erreurs: [`Style mal formé (${path.basename(dossier)}) : ${e.message}.`], avertissements: [] };
  }
}

function verifierContrat(dossier) {
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

const RECOMMANDATION = path.join(RACINE, 'references', 'styles', 'recommandation.json');

/** Dossiers où chercher les styles, du plus prioritaire au moins prioritaire. */
function racinesStyles(dossierStyles) {
  if (Array.isArray(dossierStyles)) return dossierStyles;
  if (dossierStyles) return [dossierStyles];
  return [LIVRES, path.join(dossierPersonnel(), 'styles')];
}

const estPersonnel = (racine) => path.resolve(racine) === path.resolve(dossierPersonnel(), 'styles');

/** -> { nom, dossier, personnel } | null (nom refusé s'il n'est pas sûr). */
function trouverStyle(nom, dossierStyles) {
  if (typeof nom !== 'string' || !NOM_STYLE.test(nom)) return null;
  for (const racine of racinesStyles(dossierStyles)) {
    const dossier = path.join(racine, nom);
    if (fs.existsSync(path.join(dossier, 'style.css'))) return { nom, dossier, personnel: estPersonnel(racine) };
  }
  return null;
}

/** Noms des styles disponibles, sans doublon, dans l'ordre des dossiers. */
function nomsStyles(dossierStyles) {
  const noms = [];
  for (const racine of racinesStyles(dossierStyles)) {
    let entrees;
    try { entrees = fs.readdirSync(racine).sort(); } catch { continue; }
    for (const n of entrees) {
      if (NOM_STYLE.test(n) && !noms.includes(n) && fs.existsSync(path.join(racine, n, 'style.css'))) noms.push(n);
    }
  }
  return noms;
}

function messageStyleInconnu(nom, dossierStyles) {
  const dispo = nomsStyles(dossierStyles);
  const exemple = NOM_STYLE.test(String(nom)) ? nom : '<nom>';
  return `Style « ${nom} » introuvable. Styles disponibles : ${dispo.join(', ') || 'aucun'}. Un style personnel se range dans ${path.join(dossierPersonnel(), 'styles', exemple)}.`;
}

/** Ce qu'il faut savoir d'un style pour le proposer. */
function ficheStyle(st) {
  const catalogue = lireJSON(path.join(st.dossier, 'catalogue.json')) || {};
  const identite = lireJSON(path.join(st.dossier, 'identite.json')) || {};
  const liste = (v) => (Array.isArray(v) ? v : []);
  const texte = (v) => (typeof v === 'string' ? v : '');
  return {
    style: st.nom,
    description: texte(catalogue.description),
    personnel: st.personnel,
    verifie: st.personnel ? verifierStyle(st.dossier).ok : true,
    famille: texte(identite.famille) || null,
    personnalite: liste(identite.personnalite),
    genres: liste(identite.genres),
    signature: texte(identite.signature),
    transitions: liste(catalogue.transitions),
    scenes: liste(catalogue.scenes),
  };
}

function listerStyles(dossierStyles) {
  return nomsStyles(dossierStyles).map((n) => ficheStyle(trouverStyle(n, dossierStyles)));
}

/**
 * Styles classés pour un genre : les 2 recommandés du tableau, les styles personnels vérifiés
 * du genre, le style de contraste (ou, à défaut, un style d'une autre famille), puis le reste.
 * Les styles personnels non vérifiés ne sont pas proposés.
 */
function recommander(genre, dossierStyles) {
  if (!GENRES.includes(genre)) throw new Error(`Genre inconnu : « ${genre} ». Genres : ${GENRES.join(', ')}.`);
  const fiches = listerStyles(dossierStyles).filter((f) => f.verifie);
  const parNom = new Map(fiches.map((f) => [f.style, f]));
  const table = (lireJSON(RECOMMANDATION) || {})[genre] || {};
  const ordre = [];
  const ajouter = (n) => { if (parNom.has(n) && !ordre.includes(n)) ordre.push(n); };
  (table.recommandes || []).forEach(ajouter);
  fiches.filter((f) => f.personnel && f.genres.includes(genre)).forEach((f) => ajouter(f.style));
  if (parNom.has(table.contraste)) ajouter(table.contraste);
  else {
    const familles = new Set(ordre.map((n) => parNom.get(n).famille));
    const autre = fiches.find((f) => !ordre.includes(f.style) && !familles.has(f.famille));
    if (autre) ajouter(autre.style);
  }
  fiches.forEach((f) => ajouter(f.style));
  return ordre.map((n) => parNom.get(n));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === 'verifier') {
      const st = trouverStyle(args[1]);
      if (!st) { console.error(messageStyleInconnu(args[1] || '')); process.exit(1); }
      const r = verifierStyle(st.dossier);
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    }
    const i = args.indexOf('--genre');
    console.log(JSON.stringify(i >= 0 ? recommander(args[i + 1]) : listerStyles(), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = {
  verifierStyle, racinesStyles, trouverStyle, nomsStyles, messageStyleInconnu, ficheStyle, listerStyles, recommander,
  lireJSON, RACINE, LIVRES, dossierPersonnel,
};
