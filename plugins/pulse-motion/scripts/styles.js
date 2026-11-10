#!/usr/bin/env node
'use strict';
/* Pulse Motion – catalogue des styles : styles livrés et personnels, recommandation, contrat.
 *
 *   node scripts/styles.js [--genre <genre>]     liste des styles (JSON), classée pour le genre : fiche complète des
 *                                                3 premiers, forme courte des autres
 *   node scripts/styles.js chercher <mots…>      styles dont le nom, la catégorie, les mots-clés, les usages ou la
 *                                                personnalité contiennent ces mots (« façon tableau blanc »)
 *   node scripts/styles.js verifier <nom>        vérifie le contrat d'un style
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TYPES, FAMILLES, NOM_STYLE, CATEGORIES, TYPES_ENTREE } = require('./lib/contrat.js');
const { TRANSITIONS, GENRES } = require('./lib/deroule.js');
const { extraireScene } = require('./lib/extraire.js');
const { verifierSection } = require('./lib/scenes.js');
const { contraste, luminance } = require('./lib/couleurs.js');
const { dossierPersonnel } = require('./lib/personnel.js');
const { trouverFichiersPolice } = require('./lib/police.js');
const SEUILS = require('./seuils.json');
const SYNTHE = require('../moteur/synthe/catalogue.js');

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

/** Ce qui empêche une image finale stable ou une capture fidèle. */
function verifierStabilite(texte, ou, erreurs, avertissements) {
  const sans = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/\binfinite\b/.test(sans)) erreurs.push(`${ou} : animation sans fin (« infinite ») : la vidéo ne finirait pas sur une image stable ; caler le mouvement sur la scène (data-tween) ou donner un nombre de répétitions.`);
  if (/\bcounter\(/.test(sans)) erreurs.push(`${ou} : compteur CSS (counter()) : la capture de l'export ne le calcule pas ; écrire les numéros en clair (li:nth-child(1)::before { content: "1"; }).`);
  if (/(^|[\s;{])transition\s*:/.test(sans)) avertissements.push(`${ou} : transition CSS sans effet (le moteur les neutralise) ; utiliser une animation calée sur data-start.`);
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
    verifierStabilite(html, `scenes/${type}.html`, erreurs, avertissements);
  }
}

// Champs de la fiche lus par le code (spec Styles et réalisation, 5.2) : obligatoires pour un style livré,
// facultatifs pour un style personnel (un style personnel d'avant reste valide), toujours vérifiés quand ils sont là.
const CHAMPS_LIVRE = ['categorie', 'nonPas', 'usages', 'motsCles', 'son'];
const USAGE_MAX = 40;
// Sons tenus (feutre, craie…) : aucun pour l'instant ; la matière d'un style vaut null tant qu'il n'y en a pas.
const SONS_TENUS = SYNTHE.TENUS || [];
const listeNoms = (v) => (v.length ? v.join(', ') : 'aucun pour l\'instant');
const chaine = (v) => typeof v === 'string' && v.trim() !== '';

function nomsFichiers(dossier, ext) {
  try { return fs.readdirSync(dossier).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort(); } catch { return []; }
}

function verifierSon(son, erreurs) {
  if (!son || typeof son !== 'object' || Array.isArray(son)) { erreurs.push('identite.json : « son » doit être un objet { ambiances, bruitages, matiere, fort }.'); return; }
  const ambiances = Object.keys(SYNTHE.AMBIANCES);
  for (const champ of ['ambiances', 'bruitages', 'matiere', 'fort']) if (!(champ in son)) erreurs.push(`identite.json : « son.${champ} » manquant.`);
  if ('ambiances' in son) {
    if (!Array.isArray(son.ambiances) || son.ambiances.length < 1 || son.ambiances.length > 3) erreurs.push(`identite.json : « son.ambiances » : 1 à 3 ambiances parmi : ${ambiances.join(', ')}.`);
    else for (const a of son.ambiances) if (!ambiances.includes(a)) erreurs.push(`identite.json : ambiance « ${a} » inconnue (son.ambiances). Ambiances : ${ambiances.join(', ')}.`);
  }
  if ('bruitages' in son) {
    if (!son.bruitages || typeof son.bruitages !== 'object' || Array.isArray(son.bruitages)) erreurs.push('identite.json : « son.bruitages » : table « type d\'entrée → bruitage ou null ».');
    else {
      for (const [type, b] of Object.entries(son.bruitages)) {
        if (!TYPES_ENTREE.includes(type)) erreurs.push(`identite.json : type d'entrée « ${type} » inconnu (son.bruitages). Types : ${TYPES_ENTREE.join(', ')}.`);
        if (b !== null && !SYNTHE.BRUITAGES.includes(b)) erreurs.push(`identite.json : bruitage « ${b} » inconnu (son.bruitages.${type}). Bruitages : ${SYNTHE.BRUITAGES.join(', ')} ; ou null.`);
      }
    }
  }
  if ('matiere' in son && son.matiere !== null && !SONS_TENUS.includes(son.matiere)) {
    erreurs.push(`identite.json : matière « ${son.matiere} » inconnue (son.matiere). Sons tenus : ${listeNoms(SONS_TENUS)} ; ou null.`);
  }
  if ('fort' in son && !SYNTHE.BRUITAGES.includes(son.fort)) erreurs.push(`identite.json : son fort « ${son.fort} » inconnu (son.fort). Bruitages : ${SYNTHE.BRUITAGES.join(', ')}.`);
}

function verifierFicheIdentite(identite, livre, erreurs) {
  if (livre) for (const champ of CHAMPS_LIVRE) if (identite[champ] === undefined) erreurs.push(`identite.json : « ${champ} » est obligatoire pour un style livré.`);
  if (identite.categorie !== undefined && !CATEGORIES.some((c) => c.id === identite.categorie)) {
    erreurs.push(`identite.json : « categorie » doit être l'une de : ${CATEGORIES.map((c) => c.id).join(', ')}.`);
  }
  if (identite.nonPas !== undefined) {
    const phrases = chaine(identite.nonPas) ? identite.nonPas.split(/[.!?…](?:\s|$)/).filter((p) => p.trim()).length : 0;
    if (phrases < 1 || phrases > 3) erreurs.push('identite.json : « nonPas » : 1 à 3 phrases (ce que le style n\'est pas).');
  }
  if (identite.usages !== undefined && (!Array.isArray(identite.usages) || identite.usages.length !== 3 || !identite.usages.every((u) => chaine(u) && u.length <= USAGE_MAX))) {
    erreurs.push(`identite.json : « usages » : exactement 3 phrases courtes (${USAGE_MAX} caractères au plus chacune).`);
  }
  if (identite.motsCles !== undefined && (!Array.isArray(identite.motsCles) || identite.motsCles.length < 3 || !identite.motsCles.every(chaine))) {
    erreurs.push('identite.json : « motsCles » : 3 mots ou plus (pour trouver le style quand la personne le nomme avec ses mots).');
  }
  if (identite.son !== undefined) verifierSon(identite.son, erreurs);
  if (identite.shaders !== undefined) {
    const connus = nomsFichiers(path.join(RACINE, 'shaders'), '.json');
    const c = identite.shaders && identite.shaders.conseilles;
    if (!Array.isArray(c)) erreurs.push('identite.json : « shaders » : { "conseilles": [noms] }.');
    else for (const n of c) if (!connus.includes(n)) erreurs.push(`identite.json : shader conseillé « ${n} » inconnu. Shaders : ${connus.join(', ')}.`);
  }
  if (identite.modules !== undefined) {
    const connus = nomsFichiers(path.join(RACINE, 'moteur', 'medium'), '.js');
    if (!Array.isArray(identite.modules)) erreurs.push('identite.json : « modules » : liste de modules du moteur (moteur/medium/<nom>.js).');
    else for (const n of identite.modules) if (!connus.includes(n)) erreurs.push(`identite.json : module « ${n} » inconnu. Modules : ${listeNoms(connus)}.`);
  }
  if (identite.provenance !== undefined && (!Array.isArray(identite.provenance) || !identite.provenance.every((p) => p && chaine(p.depot) && chaine(p.style) && chaine(p.licence)))) {
    erreurs.push('identite.json : « provenance » : [{ "depot", "style", "licence" }].');
  }
  if (identite.base !== undefined) {
    const b = identite.base;
    if (!(b && chaine(b.style) && chaine(b.empreinte) && chaine(b.versionPlugin))) erreurs.push('identite.json : « base » : { "style", "empreinte", "versionPlugin" }.');
    else if (b.emprunts !== undefined && (!Array.isArray(b.emprunts) || !b.emprunts.every((n) => chaine(n) && NOM_STYLE.test(n)))) {
      erreurs.push('identite.json : « base.emprunts » : liste des styles qui prêtent des gestes (noms de styles).');
    }
  }
}

function verifierIdentite(nom, identite, css, erreurs, charteCouleurs = {}, livre = false) {
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
  } else {
    if (c.tons.length === 2 && !/\[data-ton=["']?sombre/.test(css)) erreurs.push('style.css : variante [data-ton="sombre"] absente alors que le ton sombre est déclaré.');
    // Chaque ton : sa variante (couleur.clair, couleur.sombre) ou, à défaut, la charte du style.
    for (const ton of c.tons) {
      const v = c[ton];
      if (ton === 'sombre' && !v) { erreurs.push('identite.json : « couleur.sombre » doit indiquer fond et texte en #rrggbb pour le ton sombre.'); continue; }
      const k = v || charteCouleurs;
      if (!HEX.test(k.fond || '') || !HEX.test(k.texte || '')) { erreurs.push(`identite.json : « couleur.${ton} » doit indiquer fond et texte en #rrggbb.`); continue; }
      const fondSombre = luminance(k.fond) < 0.18;
      if (ton === 'clair' && fondSombre) erreurs.push('identite.json : le ton clair a un fond sombre : indiquez « couleur.clair » (fond, texte).');
      if (ton === 'sombre' && !fondSombre) erreurs.push('identite.json : le ton sombre a un fond clair : corrigez « couleur.sombre ».');
      if (contraste(k.texte, k.fond) < SEUILS.contrasteTexte) erreurs.push(`identite.json : contraste texte/fond du ton ${ton} de ${virgule(contraste(k.texte, k.fond))}:1, il faut au moins ${virgule(SEUILS.contrasteTexte)}:1.`);
    }
  }
  const typo = identite.typographie || {};
  for (const role of ['titres', 'texte']) {
    if (!typo[role] || !typo[role].famille || !typo[role].categorie) erreurs.push(`identite.json : « typographie.${role} » doit indiquer famille et categorie.`);
  }
  const transitions = (identite.mouvement || {}).transitions;
  if (!Array.isArray(transitions) || !transitions.length) erreurs.push('identite.json : « mouvement.transitions » est obligatoire.');
  else for (const t of transitions) if (!TRANSITIONS.includes(t)) erreurs.push(`identite.json : transition inconnue du moteur « ${t} ».`);
  if (typeof identite.signature !== 'string' || !identite.signature.trim()) erreurs.push('identite.json : « signature » est obligatoire.');
  verifierFicheIdentite(identite, livre, erreurs);
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

/**
 * Vérifie qu'un dossier de style respecte le contrat. -> { ok, erreurs, avertissements } (ne lève jamais)
 * options.livre : traiter le style comme livré (par défaut : rangé dans styles/ du plugin).
 */
function verifierStyle(dossier, options = {}) {
  try {
    return verifierContrat(dossier, options);
  } catch (e) {
    // Un fichier de style aux valeurs d'un mauvais type ne doit pas faire tomber la liste des styles.
    return { ok: false, erreurs: [`Style mal formé (${path.basename(dossier)}) : ${e.message}.`], avertissements: [] };
  }
}

function verifierContrat(dossier, { livre = estLivre(dossier) } = {}) {
  const erreurs = [];
  const avertissements = [];
  const nom = path.basename(dossier);
  if (!NOM_STYLE.test(nom)) erreurs.push(`Nom de style « ${nom} » : seulement des lettres minuscules, des chiffres et des tirets.`);
  const css = lireTexte(path.join(dossier, 'style.css'));
  if (css === null) erreurs.push('style.css manquant.');
  else { verifierEffets(css, 'style.css', avertissements); verifierStabilite(css, 'style.css', erreurs, avertissements); }
  const catalogue = lireJSON(path.join(dossier, 'catalogue.json'));
  if (!catalogue) erreurs.push('catalogue.json manquant ou illisible.');
  else verifierCatalogue(dossier, nom, catalogue, erreurs, avertissements);
  const identite = lireJSON(path.join(dossier, 'identite.json'));
  if (!identite) erreurs.push('identite.json manquant ou illisible.');
  else verifierIdentite(nom, identite, css || '', erreurs, (lireJSON(path.join(dossier, 'charte.json')) || {}).couleurs || {}, livre);
  verifierCharte(dossier, lireJSON(path.join(dossier, 'charte.json')) || {}, erreurs);
  return { ok: erreurs.length === 0, erreurs, avertissements };
}

const RECOMMANDATION = path.join(RACINE, 'references', 'styles', 'recommandation.json');

/** Style livré : rangé dans styles/ du plugin (les champs de sa fiche sont alors obligatoires). */
function estLivre(dossier) {
  return path.resolve(path.dirname(dossier)) === path.resolve(LIVRES);
}

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
  // Noms proches d'abord (spec Retouches et ergonomie, 5.16) ; la liste entière seulement si aucun ne ressemble.
  const proches = require('../moteur/proches.js');
  const liste = proches.proches(nom, dispo);
  if (liste.length) return `Style « ${nom} » introuvable ; ${proches.phrase(liste)}`;
  return `Style « ${nom} » introuvable. Styles disponibles : ${dispo.join(', ') || 'aucun'}. Un style personnel se range dans ${path.join(dossierPersonnel(), 'styles', exemple)}.`;
}

const MARQUE_VERIFIE = '.verifie.json';
const MARQUE_BASE = '.base-signalee.json';
const CHANGEMENTS = 'changements.json';
// Fichiers d'un style qui ne changent pas son rendu : guide, journal des changements et marques écrites par le plugin.
const HORS_EMPREINTE = new Set([MARQUE_VERIFIE, MARQUE_BASE, CHANGEMENTS, 'guide.md']);

/** Fichiers d'un style, chemins relatifs dans un ordre stable (hors guide, journal et marques). */
function fichiersStyle(dossier) {
  const liste = [];
  const parcourir = (relatif) => {
    for (const e of fs.readdirSync(path.join(dossier, relatif), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = relatif ? `${relatif}/${e.name}` : e.name;
      if (e.isDirectory()) parcourir(r);
      else if (!HORS_EMPREINTE.has(r)) liste.push(r);
    }
  };
  parcourir('');
  return liste;
}

/** Empreinte des fichiers d'un style (hors guide, journal et marques) : change dès qu'on modifie le style. */
function empreinteStyle(dossier) {
  const h = crypto.createHash('sha256');
  for (const r of fichiersStyle(dossier)) h.update(r).update('\0').update(fs.readFileSync(path.join(dossier, r))).update('\0');
  return h.digest('hex');
}

const TEXTE = /\.(css|html|json|md|svg|txt)$/i;
const sansCR = (b, r) => (TEXTE.test(r) ? Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : b);

/** Fiche d'un style : references/styles/<style>.md pour un style livré, guide.md pour un style personnel. */
function ficheDuStyle(st) {
  return st.personnel ? path.join(st.dossier, 'guide.md') : path.join(RACINE, 'references', 'styles', `${st.nom}.md`);
}

/**
 * Empreinte d'un style pris pour base d'un style personnel (spec Styles et réalisation, 5.5 point 6) : sa fiche et ses
 * fichiers, fins de ligne normalisées (une mise à jour qui ne change que les fins de ligne ne compte pas).
 */
function empreinteBase(st) {
  const h = crypto.createHash('sha256');
  const fiche = ficheDuStyle(st);
  h.update('fiche\0').update(sansCR(fs.existsSync(fiche) ? fs.readFileSync(fiche) : Buffer.alloc(0), 'fiche.md')).update('\0');
  for (const r of fichiersStyle(st.dossier)) h.update(r).update('\0').update(sansCR(fs.readFileSync(path.join(st.dossier, r)), r)).update('\0');
  return h.digest('hex');
}

/**
 * Base d'un style personnel qui a changé depuis sa création (mise à jour du plugin) et pas encore signalée.
 * -> { base, empreinte } | null. Style sans base notée, base absente, inchangée ou déjà signalée : null.
 */
function baseAChanger(st) {
  if (!st || !st.personnel) return null;
  const base = (lireJSON(path.join(st.dossier, 'identite.json')) || {}).base;
  if (!base || typeof base.style !== 'string' || typeof base.empreinte !== 'string') return null;
  const stBase = trouverStyle(base.style);
  if (!stBase || path.resolve(stBase.dossier) === path.resolve(st.dossier)) return null;
  let empreinte;
  try { empreinte = empreinteBase(stBase); } catch { return null; }
  if (empreinte === base.empreinte) return null;
  const marque = lireJSON(path.join(st.dossier, MARQUE_BASE));
  if (marque && marque.empreinte === empreinte) return null;
  return { base: base.style, empreinte };
}

/** Note qu'une base modifiée a été dite à la personne : elle ne l'est qu'une fois (spec 5.5 point 6). */
function signalerBase(st) {
  const a = baseAChanger(st);
  if (!a) return false;
  try {
    fs.writeFileSync(path.join(st.dossier, MARQUE_BASE), JSON.stringify({ style: a.base, empreinte: a.empreinte, date: new Date().toISOString().slice(0, 10) }, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

/** Note qu'un style a passé « pulse-motion style verifier » dans son état actuel. */
function marquerVerifie(dossier) {
  fs.writeFileSync(path.join(dossier, MARQUE_VERIFIE), JSON.stringify({ empreinte: empreinteStyle(dossier), date: new Date().toISOString().slice(0, 10) }, null, 2), 'utf8');
}

/** Style proposable : livré, ou personnel conforme et vérifié depuis sa dernière modification. */
function styleVerifie(st) {
  if (!st.personnel) return true;
  if (!verifierStyle(st.dossier).ok) return false;
  const marque = lireJSON(path.join(st.dossier, MARQUE_VERIFIE));
  try { return Boolean(marque && marque.empreinte === empreinteStyle(st.dossier)); } catch { return false; }
}

/** Ce qu'il faut savoir d'un style pour le proposer. */
function ficheStyle(st) {
  const catalogue = lireJSON(path.join(st.dossier, 'catalogue.json')) || {};
  const identite = lireJSON(path.join(st.dossier, 'identite.json')) || {};
  const liste = (v) => (Array.isArray(v) ? v : []);
  const texte = (v) => (typeof v === 'string' ? v : '');
  const aChange = baseAChanger(st);
  return {
    style: st.nom,
    description: texte(catalogue.description),
    personnel: st.personnel,
    verifie: styleVerifie(st),
    ...(aChange ? { baseModifiee: true, base: aChange.base } : {}),
    famille: texte(identite.famille) || null,
    categorie: texte(identite.categorie) || null,
    personnalite: liste(identite.personnalite),
    usages: liste(identite.usages),
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
 * du genre, le style de contraste (ou, à défaut, un style d'une autre famille), les styles « aussi »
 * du tableau, puis le reste. Les styles personnels non vérifiés ne sont pas proposés.
 */
function recommander(genre, dossierStyles, recommandation = lireJSON(RECOMMANDATION)) {
  if (!GENRES.includes(genre)) throw new Error(`Genre inconnu : « ${genre} ». Genres : ${GENRES.join(', ')}.`);
  const fiches = listerStyles(dossierStyles).filter((f) => f.verifie);
  const parNom = new Map(fiches.map((f) => [f.style, f]));
  const table = (recommandation || {})[genre] || {};
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
  (table.aussi || []).forEach(ajouter);
  fiches.forEach((f) => ajouter(f.style));
  return ordre.map((n) => parNom.get(n));
}

/** Nombre de styles rendus en fiche complète par « styles --genre » ; les autres ont une forme courte. */
const PROPOSES = 3;

/** Forme courte d'un style (au-delà des 3 proposés) : de quoi le reconnaître et le nommer. */
function ficheCourte(f) {
  return { style: f.style, categorie: f.categorie, personnalite: f.personnalite, usages: f.usages, personnel: f.personnel, ...(f.baseModifiee ? { baseModifiee: true } : {}) };
}

/**
 * Forme courte en une ligne, pour « styles --genre » au-delà des 3 proposés (6 Ko au plus pour 25 styles) :
 * « <style> · <catégorie> · <personnalité> · <usages> », suivie de « · personnel » pour un style personnel.
 */
function ligneCourte(f) {
  return [f.style, f.categorie || 'sans catégorie', f.personnalite.join(', '), f.usages.join(' ; ') || 'usages non dits', ...(f.personnel ? ['personnel'] : []),
    ...(f.baseModifiee ? [`base « ${f.base} » modifiée`] : [])].join(' · ');
}

/** Fiche complète d'un style proposé, resserrée : chaque scène toute faite en « durée · textes (longueurs maximales) ». */
function fichePropose(f) {
  const scenes = {};
  for (const s of f.scenes) {
    if (!s || typeof s.nom !== 'string') continue;
    const textes = Object.entries(s.textes || {}).map(([k, n]) => `${k} ${n}`).join(', ');
    scenes[s.nom] = `${String(s.duree).replace('.', ',')} s · ${textes}`;
  }
  return {
    style: f.style, personnel: f.personnel, famille: f.famille, categorie: f.categorie, personnalite: f.personnalite,
    usages: f.usages, genres: f.genres, signature: f.signature, transitions: f.transitions, scenes,
    ...(f.baseModifiee ? { baseModifiee: true, base: f.base } : {}),
  };
}

/** Liste de « styles --genre » : fiche complète des 3 premiers, forme courte (une ligne) des autres. */
function listePourGenre(fiches) {
  return fiches.map((f, i) => (i < PROPOSES ? fichePropose(f) : ligneCourte(f)));
}

// Petits mots ignorés dans une recherche de style (« façon tableau blanc », « quelque chose à la craie »).
const MOTS_VIDES = new Set(['a', 'au', 'aux', 'avec', 'de', 'des', 'du', 'en', 'et', 'la', 'le', 'les', 'l', 'd', 'un', 'une', 'sur', 'pour', 'par',
  'facon', 'style', 'comme', 'genre', 'maniere', 'mode', 'look', 'esprit', 'type', 'quelque', 'chose', 'video', 'fais', 'fait', 'moi', 'je', 'veux',
  'plutot', 'plus', 'tres']);
const racineMot = (mot) => (mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot);

/**
 * Styles vérifiés dont le nom, la catégorie, les mots-clés, les usages ou la personnalité contiennent les mots
 * cherchés, sans accents ni casse : ceux qui les contiennent tous, puis, s'il n'y en a aucun, ceux qui en
 * contiennent le plus. -> formes courtes, la plus proche d'abord.
 */
function chercherStyles(mots, dossierStyles) {
  const { normaliser } = require('./mouvements.js');
  const normal = normaliser(Array.isArray(mots) ? mots.join(' ') : mots);
  const termes = normal.split(' ').filter((t) => t && !MOTS_VIDES.has(t)).map(racineMot);
  if (!termes.length) return [];
  const requete = termes.join(' ');
  const resultats = [];
  listerStyles(dossierStyles).filter((f) => f.verifie).forEach((f, ordre) => {
    const identite = lireJSON(path.join(trouverStyle(f.style, dossierStyles).dossier, 'identite.json')) || {};
    const nom = normaliser(f.style);
    const categorie = CATEGORIES.find((c) => c.id === f.categorie);
    const cles = (Array.isArray(identite.motsCles) ? identite.motsCles : []).filter(chaine).map(normaliser);
    const champs = [nom, normaliser(f.categorie), normaliser(categorie && categorie.nom), ...cles, ...f.usages.map(normaliser), ...f.personnalite.map(normaliser)];
    const tout = champs.join(' | ');
    const trouves = termes.filter((t) => tout.includes(t)).length;
    if (!trouves) return;
    let score = 0;
    if (nom === normal || nom === requete) score += 100;
    else if (nom.includes(requete)) score += 50;
    if (cles.some((c) => c === normal || c.split(' ').map(racineMot).join(' ') === requete)) score += 30;
    else if (cles.some((c) => c.includes(requete))) score += 15;
    resultats.push({ f, score, trouves, complet: trouves === termes.length, ordre });
  });
  const complets = resultats.filter((r) => r.complet);
  return (complets.length ? complets : resultats)
    .sort((a, b) => b.trouves - a.trouves || b.score - a.score || a.ordre - b.ordre)
    .map((r) => ficheCourte(r.f));
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
    if (args[0] === 'chercher') {
      if (!args.slice(1).join(' ').trim()) throw new Error('Indiquez des mots après chercher (ex. : chercher tableau blanc).');
      console.log(JSON.stringify(chercherStyles(args.slice(1))));
      process.exit(0);
    }
    if (args[0] === 'choisir') {
      const lireOption = (nom) => { const k = args.indexOf(nom); return k >= 0 ? args[k + 1] : undefined; };
      const minutes = Number(lireOption('--delai') || 30);
      const { choisirStyles } = require('./lib/choisir-styles.js');
      choisirStyles({
        categorie: lireOption('--categorie') || null,
        delai: (minutes > 0 ? minutes : 30) * 60 * 1000,
        surPret: (url) => {
          console.error(`Page de choix : ${url}`);
          if (args.includes('--ouvrir')) require('./apercu.js').ouvrirNavigateur(url);
        },
      }).then((r) => {
        console.log(JSON.stringify(r, null, 2));
        process.exit(r.ok ? 0 : 1);
      });
      return;
    }
    const i = args.indexOf('--genre');
    if (i >= 0 && (!args[i + 1] || args[i + 1].startsWith('--'))) throw new Error(`Indiquez un genre après --genre : ${GENRES.join(', ')}.`);
    // Avec un genre : JSON compact (fiche complète des 3 premiers, forme courte des autres), lu à chaque création.
    const fiches = i >= 0 ? recommander(args[i + 1]) : listerStyles();
    console.log(i >= 0 ? JSON.stringify(listePourGenre(fiches)) : JSON.stringify(fiches, null, 2));
    // Une base modifiée n'est dite qu'une fois (creer, style) : la marque est posée une fois la liste rendue.
    for (const f of fiches.filter((x) => x.baseModifiee)) signalerBase(trouverStyle(f.style));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = {
  verifierStyle, styleVerifie, marquerVerifie, racinesStyles, trouverStyle, nomsStyles, messageStyleInconnu, ficheStyle, listerStyles, recommander,
  listePourGenre, ficheCourte, chercherStyles, estLivre, CHAMPS_LIVRE,
  empreinteStyle, empreinteBase, ficheDuStyle, baseAChanger, signalerBase, MARQUE_BASE, CHANGEMENTS,
  lireJSON, RACINE, LIVRES, dossierPersonnel,
};
