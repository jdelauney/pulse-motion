'use strict';
/* Pulse Motion – bibliothèque personnelle (chantier H) : effets et personnages gardés d'une vidéo à l'autre, et toute la
 * bibliothèque (chartes, styles, effets, personnages, goûts) emportée sur un autre ordinateur dans une archive ZIP.
 *
 *   ~/.pulse-motion/effets/<nom>/          un effet, rangé comme dans une vidéo : effets/<nom>.json, ses bases « etend »
 *                                          (effets/<base>.json), ses images (assets/…) et ses shaders (shaders/…)
 *   ~/.pulse-motion/personnages/<type>/<nom>.json   dessins, poses, mouvements (clips), expressions, gabarits
 *   ~/.pulse-motion/musiques/<id>/          une musique et sa fiche (licence) : scripts/lib/musiques.js (spec S9, 5.13)
 *
 * Par copie (spec 2026-10-23, § 6 bis) : utiliser un élément de la bibliothèque le copie dans la vidéo, qui reste autonome ;
 * l'assemblage ne lit jamais la bibliothèque, et la modifier ne change aucune vidéo existante. Un nom pris par le plugin est
 * refusé à l'enregistrement (--sous pour un autre nom). Un nom déjà pris dans la bibliothèque (ou dans la vidéo, à la copie)
 * n'est jamais écrasé sans « remplacer », donné après l'accord de la personne.
 * Ordre de recherche pour proposer : la vidéo, puis la bibliothèque, puis le plugin.
 *
 * Archive : bibliotheque.json (manifeste), LISEZ-MOI.txt, puis les dossiers tels qu'ils sont dans ~/.pulse-motion (chartes/,
 * styles/, effets/, personnages/, musiques/, preferences.json). Jamais : connexions aux sites, registre des vidéos, journal des
 * erreurs, mesures, essais. À l'import, tout est vérifié dans un dossier temporaire avant la moindre écriture.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dossierPersonnel } = require('./personnel.js');
const { ecrireAtomique } = require('./fichiers.js');
const { ecrireZip, lireZip, cheminSur } = require('./zip.js');
const P = require('./personnages.js');

const RACINE = path.resolve(__dirname, '..', '..');
const EFFETS_PLUGIN = path.join(RACINE, 'effets');
const SHADERS_PLUGIN = path.join(RACINE, 'shaders');
const NOM = /^[a-z0-9-]+$/;
/** Mots des sous-commandes de « pulse-motion effet » : jamais un nom d'effet. */
const RESERVES = ['liste', 'enregistrer', 'utiliser'];
/** Types de personnages gardés dans la bibliothèque, dans l'ordre où ils dépendent les uns des autres. Une découpe reste avec
 *  sa vidéo (elle renvoie à une illustration de assets/) : le dessin découpé suffit à animer le personnage ailleurs. */
const TYPES_PERSONNAGES = ['gabarit', 'expression', 'pose', 'clip', 'dessin'];
const FORMAT = 'pulse-motion-bibliotheque';
const IMAGE = /^assets\/.+\.(png|webp|jpe?g|svg)$/i;
const SORTES = ['charte', 'style', 'effet', 'musique', ...TYPES_PERSONNAGES];
/** Sortes rangées en dossier (<sorte>s/<nom>/…), comparées et écrites d'un bloc. */
const EN_DOSSIER = ['charte', 'style', 'effet', 'musique'];

const racinePerso = (personnel, ...p) => path.join(personnel || dossierPersonnel(), ...p);
const versionPlugin = () => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { return 'inconnue'; } };
const echec = (message, plus = {}) => Object.assign({ ok: false, message }, plus);
const lireJSONsur = (fichier) => { try { return JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Fichiers d'un dossier, chemins relatifs avec « / », triés ; fichiers temporaires (.part) écartés. -> Map(relatif -> Buffer) */
function fichiersDossier(dossier, prefixe = '', carte = new Map()) {
  let entrees;
  try { entrees = fs.readdirSync(path.join(dossier, prefixe), { withFileTypes: true }); } catch { return carte; }
  for (const e of entrees.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const relatif = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.isDirectory()) fichiersDossier(dossier, relatif, carte);
    else if (e.isFile() && !/\.part$/.test(e.name)) carte.set(relatif, fs.readFileSync(path.join(dossier, relatif)));
  }
  return carte;
}

const memesFichiers = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && b.get(k).equals(v));

/** Écrit un dossier entier d'un coup : à côté, puis renommé ; l'ancien n'est retiré qu'une fois le nouveau en place. */
function ecrireDossier(final, fichiers) {
  const temporaire = `${final}.part-${process.pid}`;
  const ancien = `${final}.ancien-${process.pid}`;
  fs.rmSync(temporaire, { recursive: true, force: true });
  try {
    for (const [relatif, donnees] of fichiers) {
      const cible = path.join(temporaire, ...relatif.split('/'));
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.writeFileSync(cible, donnees);
    }
    fs.mkdirSync(temporaire, { recursive: true });
    const remplace = fs.existsSync(final);
    if (remplace) { fs.rmSync(ancien, { recursive: true, force: true }); fs.renameSync(final, ancien); }
    try { fs.renameSync(temporaire, final); } catch (e) { if (remplace) fs.renameSync(ancien, final); throw e; }
    if (remplace) { try { fs.rmSync(ancien, { recursive: true, force: true }); } catch { /* invisible : le nom ne passe pas NOM */ } }
  } catch (e) {
    try { fs.rmSync(temporaire, { recursive: true, force: true }); } catch { /* rien à nettoyer */ }
    throw e;
  }
}

function nomsDossiers(dossier, temoin) {
  try {
    return fs.readdirSync(dossier, { withFileTypes: true }).filter((e) => e.isDirectory() && NOM.test(e.name) && fs.existsSync(path.join(dossier, e.name, ...temoin(e.name)))).map((e) => e.name).sort();
  } catch { return []; }
}

const nomsJSON = (dossier) => { try { return fs.readdirSync(dossier).filter((f) => /^[a-z0-9-]+\.json$/.test(f)).map((f) => f.slice(0, -5)).sort(); } catch { return []; } };

/* ================================== effets ================================== */

const effetsPerso = (personnel) => nomsDossiers(racinePerso(personnel, 'effets'), (n) => ['effets', `${n}.json`]);
const effetDuPlugin = (nom) => fs.existsSync(path.join(EFFETS_PLUGIN, `${nom}.json`));

/** Effets proposables : la vidéo, puis la bibliothèque, puis le plugin ; un nom n'apparaît qu'une fois, avec sa provenance. */
function listerEffets({ projet = null, personnel } = {}) {
  const vus = new Map();
  const ajouter = (nom, source, fichier) => {
    if (vus.has(nom)) return;
    const r = lireJSONsur(fichier) || {};
    vus.set(nom, { nom, source, description: typeof r.description === 'string' ? r.description : '' });
  };
  if (projet) for (const n of nomsJSON(path.join(projet, 'effets'))) ajouter(n, 'video', path.join(projet, 'effets', `${n}.json`));
  for (const n of effetsPerso(personnel)) ajouter(n, 'personnel', racinePerso(personnel, 'effets', n, 'effets', `${n}.json`));
  for (const n of nomsJSON(EFFETS_PLUGIN)) ajouter(n, 'plugin', path.join(EFFETS_PLUGIN, `${n}.json`));
  return [...vus.values()].sort((a, b) => (a.nom < b.nom ? -1 : 1));
}

/** Fichier de la recette d'un effet, cherché dans la vidéo, la bibliothèque, puis le plugin. -> chemin | null */
function fichierEffet(nom, { projet = null, personnel } = {}) {
  if (!NOM.test(nom || '')) return null;
  const essais = [projet && path.join(projet, 'effets', `${nom}.json`), racinePerso(personnel, 'effets', nom, 'effets', `${nom}.json`), path.join(EFFETS_PLUGIN, `${nom}.json`)];
  return essais.find((f) => f && fs.existsSync(f)) || null;
}

/** Images (assets/…) et modules WGSL ({ force, couleur, forme }) cités par une recette. */
function citesParRecette(recette) {
  const images = new Set();
  const modules = new Set();
  const visiter = (v, cle) => {
    if (typeof v === 'string') { if (IMAGE.test(v) && !v.split('/').includes('..')) images.add(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => visiter(x)); return; }
    if (!estObjet(v)) return;
    if (cle === 'modules') for (const k of ['force', 'couleur', 'forme']) if (typeof v[k] === 'string' && NOM.test(v[k])) modules.add(v[k]);
    for (const [k, x] of Object.entries(v)) visiter(x, k);
  };
  visiter(recette);
  return { images: [...images], modules: [...modules] };
}

/** Shaders d'un module rangés dans <dossier>/shaders/ : <nom>.json et son code (.wgsl ou .glsl). -> [relatif] */
function fichiersShader(dossier, nom) {
  return [`${nom}.json`, `${nom}.wgsl`, `${nom}.glsl`].filter((f) => fs.existsSync(path.join(dossier, 'shaders', f))).map((f) => `shaders/${f}`);
}

/**
 * Enregistre l'effet <nom> de la vidéo dans la bibliothèque : sa recette, ses bases « etend » qui ne sont pas livrées, ses
 * images et ses shaders. sous : autre nom dans la bibliothèque (le nom de la vidéo est celui d'un effet livré, ou déjà pris).
 * -> { ok, nom, dossier, fichiers, deja?, remplace? } | { ok: false, message, raison? }
 */
function enregistrerEffet({ nom, projet = '.', sous = null, remplacer = false, personnel } = {}) {
  projet = path.resolve(projet);
  const cible = sous || nom;
  if (!NOM.test(nom || '') || !NOM.test(cible || '')) return echec('Nom d\'effet : seulement des lettres minuscules, des chiffres et des tirets (ex. neige-douce).');
  if (RESERVES.includes(cible)) return echec(`« ${cible} » ne peut pas être le nom d'un effet : choisissez un autre nom.`);
  const source = path.join(projet, 'effets', `${nom}.json`);
  if (!fs.existsSync(source)) {
    if (effetsPerso(personnel).includes(nom)) return echec(`L'effet « ${nom} » est déjà dans votre bibliothèque.`, { raison: 'deja' });
    if (effetDuPlugin(nom)) return echec(`« ${nom} » est un effet livré avec Pulse Motion : il est déjà disponible dans toutes vos vidéos.`, { raison: 'livre' });
    return echec(`Effet « ${nom} » introuvable dans cette vidéo (effets/${nom}.json).`);
  }
  if (effetDuPlugin(cible)) {
    return echec(`« ${cible} » est le nom d'un effet livré avec Pulse Motion : gardez cette version sous un autre nom (--sous <nom>, ex. ${cible}-perso).`, { raison: 'nom-livre' });
  }
  const fichiers = new Map();
  const vus = new Set();
  let n = nom;
  while (n) {
    if (vus.has(n)) return echec(`Effet « ${nom} » : héritage circulaire (${[...vus, n].join(' → ')}).`);
    vus.add(n);
    const dansVideo = path.join(projet, 'effets', `${n}.json`);
    const dansPerso = racinePerso(personnel, 'effets', n);
    let origine;
    let octets;
    if (fs.existsSync(dansVideo)) {
      octets = fs.readFileSync(dansVideo);
      origine = projet;
      if (n !== nom && effetDuPlugin(n)) {
        if (octets.equals(fs.readFileSync(path.join(EFFETS_PLUGIN, `${n}.json`)))) break; // copie telle quelle de l'effet livré
        return echec(`L'effet « ${nom} » s'appuie sur votre version de « ${n} », qui porte le nom d'un effet livré : enregistrez d'abord cette version sous un autre nom, et faites-y renvoyer « ${nom} ».`, { raison: 'base-livree' });
      }
    } else if (fs.existsSync(path.join(dansPerso, 'effets', `${n}.json`))) {
      // Base déjà dans la bibliothèque (copiée d'un autre effet) : reprise avec tout ce qui l'accompagne.
      for (const [r, d] of fichiersDossier(dansPerso)) if (!fichiers.has(r)) fichiers.set(r, d);
      break;
    } else if (effetDuPlugin(n)) {
      break;
    } else {
      return echec(`L'effet « ${nom} » s'appuie sur « ${n} », introuvable (ni dans la vidéo, ni dans la bibliothèque, ni livré).`);
    }
    let recette;
    try { recette = JSON.parse(octets.toString('utf8').replace(/^﻿/, '')); } catch (e) { return echec(`effets/${n}.json n'est pas lisible (${e.message}).`); }
    if (n === nom && cible !== nom && estObjet(recette)) {
      recette.nom = cible;
      fichiers.set(`effets/${cible}.json`, Buffer.from(`${JSON.stringify(recette, null, 2)}\n`, 'utf8'));
    } else fichiers.set(`effets/${n}.json`, octets);
    const { images, modules } = citesParRecette(recette);
    for (const img of images) {
      const f = path.join(origine, ...img.split('/'));
      if (!fs.existsSync(f)) return echec(`L'image « ${img} » de l'effet « ${n} » est introuvable dans la vidéo.`);
      fichiers.set(img, fs.readFileSync(f));
    }
    for (const m of modules) for (const r of fichiersShader(origine, m)) fichiers.set(r, fs.readFileSync(path.join(origine, ...r.split('/'))));
    n = estObjet(recette) && typeof recette.etend === 'string' ? recette.etend : null;
  }
  const final = racinePerso(personnel, 'effets', cible);
  const avant = fichiersDossier(final);
  if (avant.size) {
    if (memesFichiers(avant, fichiers)) return { ok: true, nom: cible, dossier: final, fichiers: [...fichiers.keys()], deja: true };
    if (!remplacer) {
      return echec(`Un effet « ${cible} » est déjà dans votre bibliothèque, dans une autre version : rien n'a été changé. Demandez à la personne s'il faut le remplacer, ou choisissez un autre nom.`, { raison: 'pris', nom: cible });
    }
  }
  try { ecrireDossier(final, fichiers); } catch (e) {
    return echec(`L'effet « ${cible} » n'a pas pu être enregistré (${e.code || e.message}) : vérifiez les droits de ${racinePerso(personnel, 'effets')}.`);
  }
  return { ok: true, nom: cible, dossier: final, fichiers: [...fichiers.keys()], ...(avant.size ? { remplace: true } : {}) };
}

/** Copie de fichiers dans une vidéo : conflits (même chemin, autre contenu) d'abord ; rien n'est écrit s'il y en a, sauf
 *  remplacer. Une sauvegarde d'historique précède toute écriture. -> { ok, copies, deja } | { ok: false, conflits } */
function copierDansVideo(projet, fichiers, { remplacer = false, phrase, quoi }) {
  const copies = [];
  const deja = [];
  const conflits = [];
  for (const [relatif, donnees] of fichiers) {
    const f = path.join(projet, ...relatif.split('/'));
    if (!fs.existsSync(f)) copies.push(relatif);
    else if (fs.readFileSync(f).equals(donnees)) deja.push(relatif);
    else conflits.push(relatif);
  }
  if (conflits.length && !remplacer) {
    return echec(`La vidéo a déjà ${conflits.length > 1 ? 'des fichiers' : 'un fichier'} de même nom, dans une autre version (${conflits.join(', ')}) : rien n'a été copié. Demandez à la personne s'il faut ${quoi}.`, { raison: 'pris', conflits });
  }
  const aEcrire = copies.concat(remplacer ? conflits : []);
  if (aEcrire.length) {
    require('../historique.js').sauvegarder(projet, { phrase });
    for (const relatif of aEcrire) ecrireAtomique(path.join(projet, ...relatif.split('/')), fichiers.get(relatif));
  }
  return { ok: true, copies: aEcrire, deja };
}

const estVideo = (projet) => fs.existsSync(path.join(projet, 'deroule.json'));
const PAS_DE_VIDEO = 'Aucune vidéo dans ce dossier : ouvrez Claude Code dans le dossier de la vidéo où mettre cet élément.';

/** Copie l'effet <nom> de la bibliothèque dans la vidéo (effets/, assets/, shaders/). */
function utiliserEffet({ nom, projet = '.', remplacer = false, personnel } = {}) {
  projet = path.resolve(projet);
  if (!NOM.test(nom || '')) return echec('Nom d\'effet : seulement des lettres minuscules, des chiffres et des tirets.');
  if (!estVideo(projet)) return echec(PAS_DE_VIDEO);
  if (!effetsPerso(personnel).includes(nom)) {
    if (effetDuPlugin(nom)) return echec(`« ${nom} » est un effet livré : il est déjà disponible, rien à copier.`, { raison: 'livre' });
    return echec(`L'effet « ${nom} » n'est pas dans votre bibliothèque (effets gardés : ${effetsPerso(personnel).join(', ') || 'aucun'}).`);
  }
  const r = copierDansVideo(projet, fichiersDossier(racinePerso(personnel, 'effets', nom)), { remplacer, phrase: `effet « ${nom} » de la bibliothèque`, quoi: 'remplacer la version de la vidéo' });
  return r.ok ? Object.assign({ nom }, r) : r;
}

/* ================================ personnages ================================ */

/** Dépendances d'un élément de personnage : [[type, nom]]. */
function dependances(type, objet) {
  const d = [];
  if (type === 'dessin' && typeof objet.gabarit === 'string') d.push(['gabarit', objet.gabarit]);
  if (type === 'pose' && typeof objet.expression === 'string') d.push(['expression', objet.expression]);
  if (type === 'clip') {
    for (const c of Array.isArray(objet.cles) ? objet.cles : []) {
      if (typeof c.pose === 'string') d.push(['pose', c.pose]);
      if (typeof c.expression === 'string') d.push(['expression', c.expression]);
    }
  }
  return d;
}

/** Éléments à emporter : ceux de nom <nom> (types filtrés) venant de `source`, et ce dont ils dépendent venant aussi de
 *  `source`. -> [{ type, nom }] dans l'ordre des dépendances, sans doublon. */
function avecDependances(lu, depart, source) {
  const vus = new Set();
  const liste = [];
  const visiter = (type, nom) => {
    const cle = `${type}:${nom}`;
    const pluriel = P.TYPES[type];
    if (vus.has(cle) || lu.sources[pluriel][nom] !== source) return;
    vus.add(cle);
    for (const [t, n] of dependances(type, lu[pluriel][nom])) visiter(t, n);
    liste.push({ type, nom });
  };
  for (const { type, nom } of depart) visiter(type, nom);
  return liste.sort((a, b) => TYPES_PERSONNAGES.indexOf(a.type) - TYPES_PERSONNAGES.indexOf(b.type));
}

const duPlugin = (type, nom) => fs.existsSync(path.join(P.BIBLIOTHEQUE, P.TYPES[type], `${nom}.json`));
const libelle = { dessin: 'le dessin', pose: 'la pose', clip: 'le mouvement', expression: 'l\'expression', gabarit: 'le gabarit' };

/**
 * Enregistre le personnage <nom> de la vidéo (dessin, pose, mouvement, expression ou gabarit ; tous les types de ce nom sans
 * --type) et ce dont il dépend dans la vidéo. sous : autre nom (un seul élément).
 */
function enregistrerPersonnage({ nom, type = null, projet = '.', sous = null, remplacer = false, personnel } = {}) {
  projet = path.resolve(projet);
  if (!NOM.test(nom || '') || (sous !== null && !NOM.test(sous))) return echec('Nom : seulement des lettres minuscules, des chiffres et des tirets (ex. cuisinier).');
  if (type !== null && !TYPES_PERSONNAGES.includes(type)) return echec(`Type « ${type} » : ${TYPES_PERSONNAGES.join(', ')} (une découpe reste avec sa vidéo ; son dessin, lui, s'enregistre).`);
  const dossierPerso = racinePerso(personnel, 'personnages');
  const lu = P.lire(projet, { personnel: dossierPerso });
  const types = type ? [type] : TYPES_PERSONNAGES;
  const depart = types.filter((t) => lu.sources[P.TYPES[t]][nom] === 'video').map((t) => ({ type: t, nom }));
  if (!depart.length) {
    const ailleurs = types.find((t) => lu.sources[P.TYPES[t]][nom]);
    if (ailleurs && lu.sources[P.TYPES[ailleurs]][nom] === 'personnel') return echec(`« ${nom} » est déjà dans votre bibliothèque.`, { raison: 'deja' });
    if (ailleurs) return echec(`« ${nom} » est livré avec Pulse Motion : il est déjà disponible dans toutes vos vidéos.`, { raison: 'livre' });
    const erreur = lu.erreurs.find((e) => e.nom === nom && e.source === 'video');
    return echec(erreur ? `« ${nom} » a une erreur, à corriger d'abord : ${erreur.message}` : `« ${nom} » introuvable dans les personnages de cette vidéo.`);
  }
  if (sous !== null && depart.length > 1) return echec(`Plusieurs éléments s'appellent « ${nom} » (${depart.map((d) => d.type).join(', ')}) : préciser --type pour l'enregistrer sous un autre nom.`);
  const elements = avecDependances(lu, depart, 'video').map((e) => Object.assign(e, { cible: sous !== null && e.nom === nom && e.type === depart[0].type ? sous : e.nom }));
  const livres = elements.filter((e) => duPlugin(e.type, e.cible));
  if (livres.length) {
    const e = livres[0];
    return echec(e.nom === nom && e.cible === nom
      ? `« ${nom} » est le nom d'un élément livré avec Pulse Motion (${libelle[e.type]}) : gardez cette version sous un autre nom (--sous <nom>, ex. ${nom}-perso).`
      : `« ${nom} » s'appuie sur votre version de ${libelle[e.type]} « ${e.nom} », qui porte le nom d'un élément livré : enregistrez-la d'abord sous un autre nom, et faites-y renvoyer « ${nom} ».`, { raison: 'nom-livre' });
  }
  const textes = elements.map((e) => Object.assign(e, { texte: P.serialiser(e.type, Object.assign({}, lu[P.TYPES[e.type]][e.nom], { nom: e.cible })) }));
  const pris = [];
  const deja = [];
  for (const e of textes) {
    const f = path.join(dossierPerso, P.TYPES[e.type], `${e.cible}.json`);
    if (!fs.existsSync(f)) continue;
    if (fs.readFileSync(f, 'utf8') === e.texte) deja.push(e); else pris.push(e);
  }
  if (pris.length && !remplacer) {
    return echec(`Déjà dans votre bibliothèque, dans une autre version : ${pris.map((e) => `${libelle[e.type]} « ${e.cible} »`).join(', ')} ; rien n'a été changé. Demandez à la personne s'il faut remplacer, ou choisissez un autre nom.`, { raison: 'pris', pris: pris.map((e) => ({ type: e.type, nom: e.cible })) });
  }
  const ecrits = [];
  try {
    for (const e of textes) {
      if (deja.includes(e)) continue;
      P.enregistrer({ dossier: dossierPerso, type: e.type, nom: e.cible, objet: lu[P.TYPES[e.type]][e.nom], lu, ecrire: ecrireAtomique });
      ecrits.push({ type: e.type, nom: e.cible });
    }
  } catch (err) {
    return echec(err.erreurs ? `« ${nom} » : ${err.erreurs.join(' ')}` : `Enregistrement impossible (${err.code || err.message}).`);
  }
  return { ok: true, enregistres: ecrits, deja: deja.map((e) => ({ type: e.type, nom: e.cible })), ...(pris.length ? { remplaces: pris.map((e) => ({ type: e.type, nom: e.cible })) } : {}) };
}

/** Copie le personnage <nom> de la bibliothèque (et ce dont il dépend dans la bibliothèque) dans personnages/ de la vidéo. */
function utiliserPersonnage({ nom, type = null, projet = '.', remplacer = false, personnel } = {}) {
  projet = path.resolve(projet);
  if (!NOM.test(nom || '')) return echec('Nom : seulement des lettres minuscules, des chiffres et des tirets.');
  if (type !== null && !TYPES_PERSONNAGES.includes(type)) return echec(`Type « ${type} » : ${TYPES_PERSONNAGES.join(', ')}.`);
  if (!estVideo(projet)) return echec(PAS_DE_VIDEO);
  const lu = P.lire(null, { personnel: racinePerso(personnel, 'personnages') });
  const types = type ? [type] : TYPES_PERSONNAGES;
  const depart = types.filter((t) => lu.sources[P.TYPES[t]][nom] === 'personnel').map((t) => ({ type: t, nom }));
  if (!depart.length) {
    if (types.some((t) => lu.sources[P.TYPES[t]][nom] === 'plugin')) return echec(`« ${nom} » est livré avec Pulse Motion : il est déjà disponible, rien à copier.`, { raison: 'livre' });
    return echec(`« ${nom} » n'est pas dans votre bibliothèque de personnages.`);
  }
  const fichiers = new Map();
  for (const e of avecDependances(lu, depart, 'personnel')) fichiers.set(`personnages/${P.TYPES[e.type]}/${e.nom}.json`, fs.readFileSync(lu.fichiers[P.TYPES[e.type]][e.nom]));
  const r = copierDansVideo(projet, fichiers, { remplacer, phrase: `personnage « ${nom} » de la bibliothèque`, quoi: 'remplacer la version de la vidéo' });
  return r.ok ? Object.assign({ nom }, r) : r;
}

/* ================================== archive ================================== */

function contenuBibliotheque({ personnel } = {}) {
  const lu = P.lire(null, { personnel: racinePerso(personnel, 'personnages') });
  const personnages = {};
  for (const t of TYPES_PERSONNAGES) {
    const pl = P.TYPES[t];
    const noms = Object.keys(lu.sources[pl]).filter((n) => lu.sources[pl][n] === 'personnel').sort();
    if (noms.length) personnages[pl] = noms;
  }
  let gouts = 0;
  try { gouts = require('../preferences.js').lirePreferences(personnel || dossierPersonnel()).length; } catch { gouts = 0; }
  return {
    chartes: nomsDossiers(racinePerso(personnel, 'chartes'), () => ['charte.json']),
    styles: nomsDossiers(racinePerso(personnel, 'styles'), () => ['style.css']),
    effets: effetsPerso(personnel),
    personnages,
    musiques: require('./musiques.js').listerMusiques({ personnel }).musiques.map((m) => m.id),
    gouts,
    ...(lu.erreurs.some((e) => e.source === 'personnel') ? { erreurs: lu.erreurs.filter((e) => e.source === 'personnel').map((e) => e.message) } : {}),
  };
}

function listerBibliotheque({ personnel } = {}) {
  return Object.assign({ ok: true, dossier: personnel || dossierPersonnel() }, contenuBibliotheque({ personnel }));
}

/** Liste demandée : undefined (rien demandé), « tout », ou des noms séparés par des virgules. */
function choix(valeur, disponibles, quoi) {
  if (valeur === undefined || valeur === null || valeur === false) return [];
  if (valeur === true || valeur === 'tout') return disponibles;
  const noms = String(valeur).split(',').map((s) => s.trim()).filter(Boolean);
  const absent = noms.find((n) => !disponibles.includes(n));
  if (absent) throw new Error(`${quoi} « ${absent} » introuvable dans votre bibliothèque (${disponibles.join(', ') || 'aucun'}).`);
  return [...new Set(noms)];
}

const LISEZ_MOI = [
  'Bibliothèque Pulse Motion',
  '',
  'Cette archive contient votre bibliothèque personnelle de Pulse Motion : chartes, styles, effets, personnages, musiques et goûts retenus.',
  'Pour la reprendre sur un autre ordinateur : copiez ce fichier sur cet ordinateur, ouvrez Claude Code, et dites',
  '« importe ma bibliothèque » en donnant ce fichier. Rien de ce qui est déjà là n\'est remplacé sans votre accord.',
  '',
  'Il n\'est pas utile de l\'ouvrir : le détail est dans bibliotheque.json.',
  '',
].join('\r\n');

function fichierParDefaut(date) {
  const documents = path.join(os.homedir(), 'Documents');
  return path.join(fs.existsSync(documents) ? documents : os.homedir(), `pulse-motion-bibliotheque-${date.toISOString().slice(0, 10)}.zip`);
}

/**
 * Archive ZIP de la bibliothèque. selection : { chartes, styles, effets, personnages, musiques, gouts } (« tout », liste « a,b », ou
 * rien) ; aucune sélection : tout. -> { ok, fichier, contenu, octets }
 */
function exporterBibliotheque({ fichier = null, selection = {}, remplacer = false, personnel, date = new Date() } = {}) {
  const dispo = contenuBibliotheque({ personnel });
  const tousPersonnages = [...new Set(Object.values(dispo.personnages).flat())].sort();
  const rien = ['chartes', 'styles', 'effets', 'personnages', 'musiques', 'gouts'].every((k) => selection[k] === undefined || selection[k] === null || selection[k] === false);
  const s = rien ? { chartes: 'tout', styles: 'tout', effets: 'tout', personnages: 'tout', musiques: 'tout', gouts: true } : selection;
  let chartes; let styles; let effets; let noms; let musiques;
  try {
    chartes = choix(s.chartes, dispo.chartes, 'Charte');
    styles = choix(s.styles, dispo.styles, 'Style');
    effets = choix(s.effets, dispo.effets, 'Effet');
    noms = choix(s.personnages, tousPersonnages, 'Personnage');
    musiques = choix(s.musiques, dispo.musiques, 'Musique');
  } catch (e) { return echec(e.message); }
  const gouts = Boolean(s.gouts) && dispo.gouts > 0;
  const entrees = [];
  const ajouterDossier = (sorte, nom) => {
    for (const [r, d] of fichiersDossier(racinePerso(personnel, sorte, nom))) entrees.push({ nom: `${sorte}/${nom}/${r}`, donnees: d, date });
  };
  chartes.forEach((n) => ajouterDossier('chartes', n));
  styles.forEach((n) => ajouterDossier('styles', n));
  effets.forEach((n) => ajouterDossier('effets', n));
  musiques.forEach((n) => ajouterDossier('musiques', n));
  const lu = P.lire(null, { personnel: racinePerso(personnel, 'personnages') });
  const elements = avecDependances(lu, noms.flatMap((n) => TYPES_PERSONNAGES.filter((t) => lu.sources[P.TYPES[t]][n] === 'personnel').map((t) => ({ type: t, nom: n }))), 'personnel');
  for (const e of elements) entrees.push({ nom: `personnages/${P.TYPES[e.type]}/${e.nom}.json`, donnees: fs.readFileSync(lu.fichiers[P.TYPES[e.type]][e.nom]), date });
  if (gouts) entrees.push({ nom: 'preferences.json', donnees: fs.readFileSync(racinePerso(personnel, 'preferences.json')), date });
  if (!entrees.length) return echec('Rien à emporter : votre bibliothèque est vide (ou rien n\'a été choisi).');
  const personnages = {};
  for (const e of elements) (personnages[P.TYPES[e.type]] = personnages[P.TYPES[e.type]] || []).push(e.nom);
  const contenu = { chartes, styles, effets, personnages, musiques, gouts: gouts ? dispo.gouts : 0 };
  const manifeste = { format: FORMAT, version: 1, plugin: versionPlugin(), date: date.toISOString().slice(0, 10), contenu };
  entrees.unshift({ nom: 'LISEZ-MOI.txt', donnees: LISEZ_MOI, date }, { nom: 'bibliotheque.json', donnees: `${JSON.stringify(manifeste, null, 2)}\n`, date });
  const cible = path.resolve(fichier || fichierParDefaut(date));
  if (!/\.zip$/i.test(cible)) return echec('Le fichier de la bibliothèque se termine par « .zip ».');
  if (fs.existsSync(cible) && !remplacer) return echec(`Le fichier ${cible} existe déjà : rien n'a été écrit. Demandez à la personne s'il faut le remplacer, ou choisissez un autre nom.`, { raison: 'pris' });
  let octets;
  try {
    octets = ecrireZip(entrees);
    ecrireAtomique(cible, octets);
  } catch (e) { return echec(`L'archive n'a pas pu être écrite (${e.code || e.message}) : vérifiez le dossier choisi.`); }
  return { ok: true, fichier: cible, contenu, octets: octets.length };
}

/** Éléments d'une archive, rangés par sorte. -> { manifeste, elements: Map('sorte:nom' -> { sorte, nom, fichiers }), gouts, ignores } */
function lireArchive(fichier) {
  let donnees;
  try { donnees = fs.readFileSync(fichier); } catch (e) { throw new Error(e.code === 'ENOENT' ? `Fichier ${fichier} introuvable.` : `Fichier illisible (${e.code || e.message}).`); }
  let entrees;
  try { entrees = lireZip(donnees); } catch (e) { throw new Error(`Ce fichier n'est pas une bibliothèque lisible : ${e.message}.`); }
  const manifesteBrut = entrees.find((e) => e.nom === 'bibliotheque.json');
  let manifeste = null;
  try { manifeste = manifesteBrut && JSON.parse(manifesteBrut.donnees.toString('utf8')); } catch { manifeste = null; }
  if (!manifeste || manifeste.format !== FORMAT) throw new Error('Ce fichier n\'est pas une bibliothèque Pulse Motion (bibliotheque.json absent ou d\'un autre format).');
  const elements = new Map();
  const ignores = [];
  let gouts = null;
  const element = (sorte, nom) => {
    const cle = `${sorte}:${nom}`;
    if (!elements.has(cle)) elements.set(cle, { sorte, nom, fichiers: new Map() });
    return elements.get(cle);
  };
  const pluriels = Object.fromEntries(TYPES_PERSONNAGES.map((t) => [P.TYPES[t], t]));
  for (const e of entrees) {
    if (e.nom === 'bibliotheque.json' || e.nom === 'LISEZ-MOI.txt') continue;
    if (!cheminSur(e.nom)) { ignores.push(e.nom); continue; }
    let m;
    if ((m = /^(chartes|styles|effets|musiques)\/([a-z0-9-]+)\/(.+)$/.exec(e.nom))) element({ chartes: 'charte', styles: 'style', effets: 'effet', musiques: 'musique' }[m[1]], m[2]).fichiers.set(m[3], e.donnees);
    else if ((m = /^personnages\/([a-z]+)\/([a-z0-9-]+)\.json$/.exec(e.nom)) && pluriels[m[1]]) element(pluriels[m[1]], m[2]).fichiers.set(`${m[2]}.json`, e.donnees);
    else if (e.nom === 'preferences.json') {
      try { const j = JSON.parse(e.donnees.toString('utf8')); gouts = Array.isArray(j.preferences) ? j.preferences : null; } catch { gouts = null; }
      if (!gouts) ignores.push(e.nom);
    } else ignores.push(e.nom);
  }
  return { manifeste, elements, gouts, ignores };
}

/** Vérifie un élément de l'archive, rangé dans <tmp>. -> raison du refus | null */
function verifierElement(el, tmp, personnel) {
  const ecrire = (dossier) => {
    for (const [r, donnees] of el.fichiers) {
      const f = path.join(dossier, ...r.split('/'));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, donnees);
    }
    return dossier;
  };
  if (el.sorte === 'charte') {
    const d = ecrire(path.join(tmp, 'chartes', el.nom));
    const c = lireJSONsur(path.join(d, 'charte.json'));
    if (!c) return 'charte.json absent ou illisible';
    const fautes = require('./deroule.js').validerCharte(c, 'charte.json');
    return fautes.length ? fautes.join(' ') : null;
  }
  if (el.sorte === 'style') {
    const S = require('../styles.js');
    if (fs.existsSync(path.join(S.LIVRES, el.nom))) return 'nom d\'un style livré avec Pulse Motion';
    const d = ecrire(path.join(tmp, 'styles', el.nom));
    const v = S.verifierStyle(d, { livre: false });
    return v.ok ? null : v.erreurs.join(' ');
  }
  if (el.sorte === 'effet') {
    if (effetDuPlugin(el.nom) || RESERVES.includes(el.nom)) return 'nom d\'un effet livré avec Pulse Motion';
    const d = ecrire(path.join(tmp, 'effets', el.nom));
    if (!fs.existsSync(path.join(d, 'effets', `${el.nom}.json`))) return `effets/${el.nom}.json absent`;
    for (const r of el.fichiers.keys()) if (!/^(effets\/[a-z0-9-]+\.json|assets\/.+|shaders\/[a-z0-9-]+\.(json|wgsl|glsl))$/.test(r)) return `fichier inattendu « ${r} »`;
    const R = require('../../moteur/particules/recette.js');
    const charger = (n) => {
      const f = [path.join(d, 'effets', `${n}.json`), path.join(EFFETS_PLUGIN, `${n}.json`)].find((x) => NOM.test(n) && fs.existsSync(x));
      if (!f) return null;
      const j = lireJSONsur(f);
      if (!j) throw R.ErreurRecette('effet-invalide', `effets/${n}.json illisible`);
      return j;
    };
    try { R.resoudre(el.nom, charger); } catch (e) { return e.message; }
    return null;
  }
  if (el.sorte === 'musique') {
    // Une fiche valide (licence comprise) et son fichier, rien d'autre.
    const M = require('./musiques.js');
    let fiche = null;
    try { fiche = JSON.parse(el.fichiers.get('fiche.json').toString('utf8')); } catch { return 'fiche.json absent ou illisible'; }
    const fautes = M.validerFiche(fiche);
    if (fautes.length) return fautes.join(' ');
    if (!el.fichiers.has(fiche.fichier)) return `${fiche.fichier} absent`;
    for (const r of el.fichiers.keys()) if (r !== 'fiche.json' && r !== fiche.fichier) return `fichier inattendu « ${r} »`;
    return null;
  }
  // Personnage : vérifié comme dans une vidéo, avec la bibliothèque de la personne et celle du plugin pour contexte.
  if (duPlugin(el.sorte, el.nom)) return 'nom d\'un élément livré avec Pulse Motion';
  return null;
}

/** Comparaison avec la bibliothèque. -> 'nouveau' | 'identique' | 'pris' */
function etatElement(el, personnel) {
  if (EN_DOSSIER.includes(el.sorte)) {
    const avant = fichiersDossier(racinePerso(personnel, `${el.sorte}s`, el.nom));
    if (!avant.size) return 'nouveau';
    return memesFichiers(avant, el.fichiers) ? 'identique' : 'pris';
  }
  const f = racinePerso(personnel, 'personnages', P.TYPES[el.sorte], `${el.nom}.json`);
  if (!fs.existsSync(f)) return 'nouveau';
  return fs.readFileSync(f).equals(el.fichiers.get(`${el.nom}.json`)) ? 'identique' : 'pris';
}

const cleGout = (p) => `${String(p.citation || '').trim()}\u0000${String(p.regle || '').trim()}`;

/**
 * Importe une archive de bibliothèque. voir : rien n'est écrit, le bilan seulement. remplacer : « tout » ou
 * ['charte:dupont', 'dessin:cuisinier', …] (après l'accord de la personne) ; sans lui, un nom déjà pris n'est jamais écrasé.
 * -> { ok, importes, identiques, pris, refuses, gouts, ignores }
 */
function importerBibliotheque({ fichier, voir = false, remplacer = [], personnel } = {}) {
  let archive;
  try { archive = lireArchive(path.resolve(String(fichier || ''))); } catch (e) { return echec(e.message); }
  const remplacerTout = remplacer === 'tout' || (Array.isArray(remplacer) && remplacer.includes('tout'));
  const aRemplacer = new Set(Array.isArray(remplacer) ? remplacer : []);
  const inconnue = [...aRemplacer].find((c) => c !== 'tout' && !SORTES.includes(c.split(':')[0]));
  if (inconnue) return echec(`« ${inconnue} » : à remplacer, écrire <sorte>:<nom> (sortes : ${SORTES.join(', ')}) ou « tout ».`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-bibliotheque-'));
  const bilan = { importes: [], identiques: [], pris: [], refuses: [] };
  const aEcrire = [];
  try {
    const personnages = [...archive.elements.values()].filter((el) => TYPES_PERSONNAGES.includes(el.sorte));
    // Personnages : rangés comme dans une vidéo temporaire, lus avec la bibliothèque de la personne pour contexte.
    const videoTmp = path.join(tmp, 'video');
    for (const el of personnages) {
      const f = path.join(videoTmp, 'personnages', P.TYPES[el.sorte], `${el.nom}.json`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const donnees = el.fichiers.get(`${el.nom}.json`);
      fs.writeFileSync(f, donnees);
    }
    const lu = personnages.length ? P.lire(videoTmp, { personnel: racinePerso(personnel, 'personnages') }) : null;
    for (const el of [...archive.elements.values()].sort((a, b) => SORTES.indexOf(a.sorte) - SORTES.indexOf(b.sorte) || (a.nom < b.nom ? -1 : 1))) {
      const id = { sorte: el.sorte, nom: el.nom };
      let raison = verifierElement(el, tmp, personnel);
      if (!raison && lu) {
        const faute = lu.erreurs.find((e) => e.source === 'video' && e.type === el.sorte && e.nom === el.nom);
        if (faute) raison = faute.message.replace(/ \(vidéo\)/, '');
      }
      if (raison) { bilan.refuses.push(Object.assign(id, { raison })); continue; }
      const etat = etatElement(el, personnel);
      if (etat === 'identique') bilan.identiques.push(id);
      else if (etat === 'pris' && !remplacerTout && !aRemplacer.has(`${el.sorte}:${el.nom}`)) bilan.pris.push(id);
      else { bilan.importes.push(Object.assign(id, etat === 'pris' ? { remplace: true } : {})); aEcrire.push(el); }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // Goûts : ajoutés à ceux de la personne (jamais remplacés), sans doublon, dans la limite de 30.
  const Pref = require('../preferences.js');
  const actuels = Pref.lirePreferences(personnel || dossierPersonnel());
  const connus = new Set(actuels.map(cleGout));
  const nouveaux = (archive.gouts || []).filter((p) => p && typeof p.citation === 'string' && typeof p.regle === 'string' && !connus.has(cleGout(p)) && (connus.add(cleGout(p)), true));
  const place = Math.max(0, Pref.MAX - actuels.length);
  const gouts = { ajoutes: Math.min(place, nouveaux.length), deja: (archive.gouts || []).length - nouveaux.length, horsLimite: Math.max(0, nouveaux.length - place) };
  const resultat = Object.assign({ ok: true, voir, plugin: archive.manifeste.plugin || null }, bilan, { gouts, ignores: archive.ignores });
  if (voir) return resultat;
  try {
    for (const el of aEcrire) {
      if (EN_DOSSIER.includes(el.sorte)) ecrireDossier(racinePerso(personnel, `${el.sorte}s`, el.nom), el.fichiers);
      else ecrireAtomique(racinePerso(personnel, 'personnages', P.TYPES[el.sorte], `${el.nom}.json`), el.fichiers.get(`${el.nom}.json`));
    }
    if (gouts.ajoutes) {
      let n = actuels.reduce((m, p) => Math.max(m, Number(String(p.id || '').replace(/^p-/, '')) || 0), 0);
      const ajout = nouveaux.slice(0, gouts.ajoutes).map((p) => Object.assign({}, p, { id: `p-${String(++n).padStart(3, '0')}` }));
      const dossier = personnel || dossierPersonnel();
      fs.mkdirSync(dossier, { recursive: true });
      ecrireAtomique(path.join(dossier, 'preferences.json'), `${JSON.stringify({ version: 1, preferences: actuels.concat(ajout) }, null, 2)}\n`);
    }
  } catch (e) {
    return echec(`L'import s'est arrêté (${e.code || e.message}) : ce qui précède est importé, le reste non ; relancer l'import reprend là où il s'est arrêté.`, resultat);
  }
  return resultat;
}

/** Effet ou personnage absent d'une vidéo mais gardé dans la bibliothèque : phrase à ajouter au message d'erreur, ou ''.
 *  Jamais le vrai dossier de la personne pendant les tests sans PULSE_MOTION_DOSSIER (messages stables). */
function suggestionBibliotheque(sorte, nom, { personnel = require('./personnel.js').dossierPersonnelEcrivable() } = {}) {
  if (!personnel || !NOM.test(nom || '')) return '';
  if (sorte === 'effet') {
    return fs.existsSync(racinePerso(personnel, 'effets', nom, 'effets', `${nom}.json`))
      ? ` ; il est dans la bibliothèque personnelle : le copier d'abord dans la vidéo (pulse-motion effet utiliser ${nom} .)` : '';
  }
  if (!TYPES_PERSONNAGES.includes(sorte)) return '';
  return fs.existsSync(racinePerso(personnel, 'personnages', P.TYPES[sorte], `${nom}.json`))
    ? ` ; il est dans la bibliothèque personnelle : le copier d'abord dans la vidéo (pulse-motion personnages utiliser ${nom} --dossier .)` : '';
}

module.exports = {
  listerEffets, fichierEffet, enregistrerEffet, utiliserEffet, enregistrerPersonnage, utiliserPersonnage,
  contenuBibliotheque, listerBibliotheque, exporterBibliotheque, importerBibliotheque, lireArchive, suggestionBibliotheque,
  citesParRecette, TYPES_PERSONNAGES, RESERVES, FORMAT, SORTES,
};
