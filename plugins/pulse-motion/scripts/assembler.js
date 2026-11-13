#!/usr/bin/env node
'use strict';
/* Pulse Motion – assemble un projet vidéo en une page HTML autonome.
 *
 *   node scripts/assembler.js <dossier-du-projet>
 *
 * Lit deroule.json et scenes/, injecte textes et charte, embarque polices, images,
 * logo et sources sonores, inclut le moteur, écrit sortie/<titre>.html.
 * Affiche un résumé JSON { ok, fichier, erreurs } ; code de sortie 1 si la page n'a pas pu être produite.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule, dureeTemps, tempoMusique, grilleFixe, optionsMinutage, allureDe } = require('./lib/deroule.js');
const { embarquerRessources, versDataURI, cheminDansProjet, estReferenceImitation, problemeReference } = require('./lib/embarquer.js');
const S = require('./lib/scenes.js');
const { preparerEffets } = require('./lib/effets.js');
const { preparerPersonnages, donneesPersonnages } = require('./lib/personnages-scene.js');
const { deplierGroupes } = require('./lib/groupes-personnages.js');
const Pers = require('./lib/personnages.js');
const { preparerObstacles, obstaclesVideo } = require('./lib/obstacles.js');
const { preparerMilieux } = require('./lib/milieux.js');
const { chargeurShaders, preparerShaders, shadersDuDeroule, BIBLIOTHEQUE: BIBLIOTHEQUE_SHADERS } = require('./lib/shaders.js');
const { besoinsSon } = require('./lib/son.js');
const { variablesCSS } = require('../moteur/courbes.js');
const { trouverStyle, messageStyleInconnu } = require('./styles.js');
const { charteFinale, chartePour, variablesDerivees } = require('./lib/fusion-charte.js');
const { estEbauche } = require('./lib/ebauche.js');
const { lireVoixScene } = require('./lib/voix.js');
const { lireTexteDit } = require('../moteur/aligner.js');
const { DEBUT_VOIX, calculerMinutage, DUREE_TRANSITION_SHADER } = require('../moteur/minutage.js');
const ST = require('../moteur/sous-titres.js');
const Langues = require('../moteur/langues.js');
const SP = require('../moteur/synthe/partition.js');
const SA = require('../moteur/synthe/ambiances.js');
const { trouverFichiersPolice, fichiersPoliceStyle, caracteristiquesPolice } = require('./lib/police.js');
const Briques = require('./lib/briques.js');
const GM = require('./lib/groupes-moteur.js');
const { minifier } = require('./lib/minifier.js');
const { preparerEcrans, usagesEcran } = require('./lib/ecrans.js');
const { blocFilm } = require('./lib/film.js');
const crypto = require('node:crypto');
const { preparerDessin, usagesDessin } = require('./lib/dessin.js');
const { preparerDonnees, usagesDonnees, cssDonnees } = require('./lib/donnees-scene.js');
const PageMp4 = require('./lib/page-mp4.js');

const RACINE = path.resolve(__dirname, '..');
// Modules du moteur, groupés (moteur à la carte, spec Rapidité 5.19) : lib/groupes-moteur.js.
const MOTEUR = GM.MODULES;
function slug(texte) {
  return String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
}

const POLICES_SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);

/** Variables CSS de la charte (et dérivées) et @font-face embarqués. -> { css, erreurs, polices } (fichiers embarqués) */
function cssCharte(charte, dossierProjet, dossierStyle) {
  const erreurs = [];
  const lignes = Object.entries(charte.couleurs).map(([nom, valeur]) => `  --c-${nom}: ${valeur};`);
  lignes.push(...variablesDerivees(charte.couleurs));
  const faces = [];
  const polices = [];
  const dejaVues = new Set();
  // Détail des polices embarquées (crédits, spec Rendu et export 5.20) : famille, rôles, fichiers.
  const detail = new Map();
  const face = (famille, fichier, graisse, italique = false) => {
    try {
      if (!detail.has(famille)) detail.set(famille, { famille, roles: [], fichiers: [] });
      detail.get(famille).fichiers.push(fichier);
      // Graisse déclarée (spec S9, 5.6) : celle du nom du fichier ; sinon la plage réelle d'une police variable (et sa largeur),
      // ou la graisse inscrite dans un fichier statique (OS/2.usWeightClass) ; 100 900 si le fichier ne la dit pas.
      let poids = graisse;
      let largeur = '';
      if (!poids) {
        const c = caracteristiquesPolice(fichier);
        const wght = c && c.axes.find((a) => a.tag === 'wght');
        const wdth = c && c.axes.find((a) => a.tag === 'wdth');
        poids = wght ? `${wght.min} ${wght.max}` : (c && c.graisse) || '100 900';
        if (wdth) largeur = ` font-stretch: ${wdth.min}% ${wdth.max}%;`;
      }
      faces.push(`@font-face { font-family: '${famille}'; src: url("${versDataURI(fichier)}"); font-weight: ${poids};${largeur}${italique ? ' font-style: italic;' : ''} font-display: block; }`);
      polices.push(fichier);
    } catch (e) {
      erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » : fichier « ${path.basename(fichier)} » illisible (${e.code || e.message}).` });
    }
  };
  for (const [role, valeur] of Object.entries(charte.polices)) {
    let famille;
    if (valeur && typeof valeur === 'object') {
      famille = valeur.famille;
      const absolu = cheminDansProjet(dossierProjet, valeur.fichier);
      if (!absolu || !fs.existsSync(absolu)) erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » : fichier « ${valeur.fichier} » introuvable (charte.polices.${role}).` });
      else if (!dejaVues.has(famille)) { face(famille, absolu); dejaVues.add(famille); }
    } else if (/\.(woff2?|ttf|otf)$/i.test(valeur)) {
      famille = path.basename(valeur).replace(/\.[^.]+$/, '');
      const absolu = cheminDansProjet(dossierProjet, valeur);
      if (!absolu || !fs.existsSync(absolu)) erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${valeur} » introuvable dans le projet (charte.polices.${role}).` });
      else if (!dejaVues.has(famille)) { face(famille, absolu); dejaVues.add(famille); }
    } else {
      famille = valeur;
      if (!POLICES_SYSTEME.has(famille) && !dejaVues.has(famille)) {
        // Charte du projet d'abord, puis le style : son dossier polices/, sinon les polices partagées du plugin (spec S11, 5.1).
        const duProjet = trouverFichiersPolice(famille, [path.join(dossierProjet, 'charte', 'polices')]);
        const fichiers = duProjet.length ? duProjet : fichiersPoliceStyle(famille, dossierStyle);
        if (fichiers.length) { fichiers.forEach((f) => face(famille, f.fichier, f.graisse, f.italique)); dejaVues.add(famille); }
        else erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » non fournie : récupérez-la avec « pulse-motion police "${famille}" », ou ajoutez son fichier dans charte/polices/ (charte.polices.${role}).` });
      }
    }
    lignes.push(`  --f-${role}: '${famille}', system-ui, sans-serif;`);
    if (detail.has(famille)) detail.get(famille).roles.push(role);
  }
  return { css: `${faces.join('\n')}\n:root {\n${lignes.join('\n')}\n}\n`, erreurs, polices, detailPolices: [...detail.values()] };
}

/** Fichier du projet -> URL data:, ou null avec une erreur nommée (introuvable, type, lecture). */
function embarquerFichier(projet, relatif, quoi, erreurs, ressources = null, sorte = 'image') {
  const absolu = cheminDansProjet(projet, relatif);
  // Référence d'une imitation (spec S9, 5.15) : jamais embarquée, même comme logo, musique ou son.
  if (absolu && estReferenceImitation(projet, absolu)) {
    erreurs.push(problemeReference(relatif, ` : ${quoi.charAt(0).toLowerCase()}${quoi.slice(1)}`));
    return null;
  }
  if (!absolu || !fs.existsSync(absolu)) {
    erreurs.push({ regle: 'fichier-introuvable', gravite: 'erreur', message: `${quoi} introuvable : « ${relatif} ».` });
    return null;
  }
  try { const uri = versDataURI(absolu); if (ressources) ressources.set(absolu, sorte); return uri; } catch (e) {
    erreurs.push({ regle: 'fichier-non-pris-en-charge', gravite: 'erreur', message: `${quoi} « ${relatif} » : ${e.code ? `lecture impossible (${e.code})` : e.message}.` });
    return null;
  }
}

// Modules minifiés, gardés en mémoire par contenu (un même processus assemble souvent plusieurs fois).
const minifies = new Map();
function lireModule(racine, f, brut) {
  const code = fs.readFileSync(path.join(racine, 'moteur', f), 'utf8');
  if (brut) return code;
  if (!minifies.has(code)) minifies.set(code, minifier(code));
  return minifies.get(code);
}

/**
 * Code du moteur inclus dans une page. groupes : liste de groupes (lib/groupes-moteur.js), ou 'tous' (ateliers, pages de
 * tests : le moteur entier, contrôle compris). brut : sans minification (PM_MOTEUR_BRUT=1, pour le débogage). M.groupes dit
 * les groupes inclus ; moteur/absents.js, en dernier, remplace les points d'entrée des groupes absents.
 */
function lireMoteur(racine, { groupes = 'tous', brut = process.env.PM_MOTEUR_BRUT === '1' } = {}) {
  const noms = groupes === 'tous' ? GM.NOMS : groupes;
  const entete = `(globalThis.M = globalThis.M || {}).groupes = ${JSON.stringify(noms)};`;
  return [entete].concat(GM.modulesDesGroupes(groupes).map((f) => lireModule(racine, f, brut))).join('\n;\n');
}

/** Sous-titres pour les plateformes (sous-titres activables) : sortie/<titre>.srt et .vtt ; retirés quand il n'y en a plus.
 *  langue : étiquette de la vidéo, quand le déroulé la déclare (ligne « Language: » du VTT, spec S9 5.1). */
function ecrireSousTitres(dossierSortie, titre, cartons, langue = null) {
  const base = path.join(dossierSortie, slug(titre));
  if (cartons && cartons.length) {
    fs.mkdirSync(dossierSortie, { recursive: true });
    fs.writeFileSync(`${base}.srt`, ST.versSRT(cartons), 'utf8');
    fs.writeFileSync(`${base}.vtt`, ST.versVTT(cartons, langue ? { langue } : undefined), 'utf8');
  } else {
    fs.rmSync(`${base}.srt`, { force: true });
    fs.rmSync(`${base}.vtt`, { force: true });
  }
}

/** Zones de la plateforme (spec Rendu et export, 5.19) : variables --pm-zone-* sur #pm-scene, en cqh et cqw ; rien sans
 *  plateforme (la page ne change pas). */
function cssZones(plateforme) {
  const z = plateforme && (require('./seuils.json').zonesPlateformes || {})[plateforme];
  if (!z) return '';
  const v = (x) => Math.round(x * 100 * 1000) / 1000;
  return `#pm-scene { --pm-zone-haut: ${v(z.haut)}cqh; --pm-zone-bas: ${v(z.bas)}cqh; --pm-zone-gauche: ${v(z.gauche)}cqw; --pm-zone-droite: ${v(z.droite)}cqw; }
`;
}

/**
 * Bruitages automatiques (spec S7, 5.15) : { auto, transitions, table? } pour la page. auto : true ou « minimal » (rien sinon : une vidéo
 * existante garde son mixage) ; table : celle du style (identite.json, son.bruitages), réduite aux types d'entrée connus
 * (TYPES_ENTREE de lib/contrat.js) et aux bruitages du catalogue (null : aucun son pour ce type).
 */
function bruitagesAuto(deroule, dossierStyle) {
  const auto = deroule.bruitages && deroule.bruitages.auto;
  if (auto !== true && auto !== 'minimal') return {};
  const { TYPES_ENTREE } = require('./lib/contrat.js');
  const { BRUITAGES, TENUS } = require('../moteur/synthe/catalogue.js');
  let table = null;
  const son = sonDuStyle(dossierStyle);
  const brute = son && son.bruitages;
  if (brute && typeof brute === 'object') {
    table = Object.fromEntries(Object.entries(brute).filter(([type, nom]) => TYPES_ENTREE.includes(type) && (nom === null || BRUITAGES.includes(nom))));
  }
  // Matière du style (spec Styles et réalisation, 5.7) : son tenu du tracé à main levée, à la place de crissement.
  const matiere = son && TENUS.includes(son.matiere) && son.matiere !== 'crissement' ? son.matiere : null;
  // true ou « minimal » sonnent aussi les transitions, sauf « transitions »: false écrit au déroulé.
  return { auto, transitions: deroule.bruitages.transitions !== false, ...(table && Object.keys(table).length ? { table } : {}), ...(matiere ? { matiere } : {}) };
}

/**
 * Modules du style (spec Styles et réalisation, 5.10 point 3) : moteur/medium/<nom>.js déclarés par identite.modules, dans
 * leur ordre ; un nom inconnu est ignoré ici (style verifier le refuse). [] sans déclaration : rien n'est inclus.
 */
function modulesDuStyle(dossierStyle) {
  try {
    const id = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'identite.json'), 'utf8').replace(/^﻿/, ''));
    const liste = id && Array.isArray(id.modules) ? id.modules : [];
    return [...new Set(liste.filter((n) => typeof n === 'string' && /^[a-z0-9-]+$/.test(n) && fs.existsSync(path.join(RACINE, 'moteur', 'medium', `${n}.js`))))];
  } catch { return []; }
}

// Modules d'un style qui s'appuient sur le calque de dessin (ils redessinent ses tracés) : ses groupes viennent avec eux.
// L'isométrie (iso) n'en a pas besoin : elle produit son propre SVG.
const MODULES_DESSIN = new Set(['encre', 'une-ligne']);

/** Feuille d'un module (moteur/medium/<nom>.css), embarquée avec lui ; '' s'il n'en a pas. */
function cssModule(nom) {
  try { return fs.readFileSync(path.join(RACINE, 'moteur', 'medium', `${nom}.css`), 'utf8'); } catch { return ''; }
}

/** Palette sonore du style (identite.json, son), ou null (style sans identité). */
function sonDuStyle(dossierStyle) {
  try {
    const id = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'identite.json'), 'utf8').replace(/^﻿/, ''));
    return id && id.son && typeof id.son === 'object' ? id.son : null;
  } catch { return null; }
}

/**
 * Moments forts (spec Styles et réalisation, 5.8) : éléments data-moment-fort minutés, au plus 1 par scène et 3 par vidéo (comme
 * moteur/audio.js), en temps de la vidéo. -> [{ scene, cle, t }]
 */
function momentsForts(scenesDonnees, elementsForts, options) {
  if (!Object.keys(elementsForts).length) return [];
  const min = calculerMinutage(scenesDonnees, elementsForts, options);
  const r = [];
  for (const s of min.scenes) {
    const e = (elementsForts[s.id] || []).find((x) => x.momentFort && min.elements[s.id][x.cle]);
    if (e && r.length < 3) r.push({ scene: s.id, cle: e.cle, t: min.elements[s.id][e.cle].debut });
  }
  return r;
}

function jsonDansHTML(objet) {
  return JSON.stringify(objet).replace(/</g, '\\u003c');
}

/**
 * assembler({ dossier, dossierStyles?: string | string[], dossierEffets?, dossierShaders?, ecrire?, groupes? })
 * -> { ok, fichier, html, erreurs: [{ regle, gravite, scene?, message }], effets: [{ scene, ordre, calque, ancre, effet }], milieux: [{ scene, calque, ancre, sansDuree, effet }], shaders, donnees (pm-donnees), moteur (code inclus), groupes }
 * groupes : groupes de modules du moteur imposés ('tous' : le moteur entier) ; sinon ceux dont la vidéo se sert.
 * Sans dossierStyles : styles livrés, puis styles personnels (~/.pulse-motion/styles). dossierShaders : bibliothèque des
 * shaders (plugins/pulse-motion/shaders par défaut), après shaders/ du projet.
 */
function assembler({ dossier, dossierStyles, dossierEffets = path.join(RACINE, 'effets'), dossierShaders = BIBLIOTHEQUE_SHADERS, ecrire = true, groupes: groupesImposes = null }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs: erreursDeroule } = lireDeroule(projet);
  if (erreursDeroule.length) {
    return { ok: false, fichier: null, html: null, effets: [], milieux: [], shaders: [], donnees: null, erreurs: erreursDeroule.map((message) => ({ regle: 'deroule-invalide', gravite: 'erreur', message })) };
  }
  const style = trouverStyle(deroule.style, dossierStyles);
  if (!style) {
    return { ok: false, fichier: null, html: null, effets: [], milieux: [], shaders: [], donnees: null, erreurs: [{ regle: 'style-inconnu', gravite: 'erreur', message: messageStyleInconnu(deroule.style, dossierStyles) }] };
  }
  const dossierStyle = style.dossier;

  const erreurs = [];
  const charte = charteFinale(deroule, dossierStyle, projet);
  charte.erreurs.forEach((message) => erreurs.push({ regle: 'charte-invalide', gravite: 'erreur', message }));
  const { css: cssDeCharte, erreurs: erreursPolices, polices, detailPolices } = cssCharte(charte, projet, dossierStyle);
  erreurs.push(...erreursPolices);

  // Fichiers du projet réellement embarqués (crédits, spec Rendu et export 5.20) : chemin absolu -> image, son, musique.
  const ressources = new Map();
  let uriLogo = null;
  if (charte.logo) uriLogo = embarquerFichier(projet, charte.logo, 'Logo', erreurs, ressources, 'image');

  const sections = [];
  const scriptsScenes = [];
  // Par scène : section assemblée et scripts (empreintes du contrôle, lib/empreintes.js).
  const parScene = [];
  // Sources sonores : un bloc texte par source (URL data:), lu et décodé par moteur/audio.js.
  const sons = [];
  const blocSon = (id, uri) => `<script type="text/plain" id="${id}">${uri}</script>`;
  let fichiersSons = 0;
  const sonsEmbarques = new Map();   // chemin du son -> id du bloc
  const effets = [];
  const milieux = [];
  const obstacles = [];
  const shaders = [];
  const chargerShader = chargeurShaders(projet, dossierShaders);
  const sourcesModules = {};
  let luPersonnages = null;
  const utilisesPersonnages = { dessins: new Set(), gabarits: new Set(), batonnets: new Set(), habillages: new Set() };
  const scenesQuiParlent = new Set();
  // Écrans des tutoriels (spec S6) : moteur de l'écran et moteur/ecran.css seulement si une scène s'en sert.
  const usages = { moteur: false, css: false };
  // Films (plan 2 de S6, 5.8) : nom -> étapes visées par les scènes (seules ces étapes sont embarquées).
  const filmsVises = new Map();
  // Calque de dessin (spec S7) : groupe « dessin » et moteur/dessin/dessin.css seulement si une scène dessine ; icônes de d.icone.
  const dessin = { utilise: false, icones: new Set(), scripts: [] };
  // Cartes (spec S9, 5.10) : noms des fonds posés (crédits, feuille moteur/cartes.css). Lottie (5.11) : un bloc JSON par fichier.
  const cartesUtilisees = new Set();
  const blocsLottie = new Map();
  // Modules du style (5.10 point 3) : seulement s'il les déclare ; ils s'appuient sur le calque de dessin.
  const modulesStyle = modulesDuStyle(dossierStyle);
  const modulesDessin = modulesStyle.some((n) => MODULES_DESSIN.has(n));
  if (modulesDessin) dessin.utilise = true;
  // Graphiques, code et formules (spec S7, 5.6, 5.9, 5.10) : polices du code et des formules seulement si une scène en montre.
  const montre = { code: false, formule: false };
  // Voix : une prise par scène (ou la voix provisoire), mots calés ; Opus si encodé, sinon WAV. Lues avant les scènes : la
  // durée d'une scène allongée par sa voix sert aux effets faits de structures sans data-dur (jusqu'à la fin de la scène).
  const voixScenes = {};
  const sonsVoix = [];
  const erreursVoix = [];
  let calageApproche = false;
  // Scènes dont les mots sont calés sur la voix (transcription ou voix de synthèse) : le karaoké les suit (spec S9, 5.8).
  const voixCalees = new Set();
  for (const scene of deroule.scenes) {
    const v = lireVoixScene(projet, deroule, scene);
    if (!v) continue;
    if (v.erreur) { erreursVoix.push({ regle: 'voix-illisible', gravite: 'erreur', scene: scene.id, message: v.erreur }); continue; }
    erreursVoix.push(...v.alertes);
    const uri = embarquerFichier(projet, v.opus || v.prise.relatif, `Voix de la scène « ${scene.id} »`, erreursVoix);
    if (!uri) continue;
    const id = `pm-son-voix-${scene.id}`;
    sonsVoix.push(blocSon(id, uri));
    // Début par défaut divisé par l'allure (spec S7, 5.14) ; repères du texte dit (5.11), en secondes de la prise.
    voixScenes[scene.id] = { source: id, debut: scene.voix.debut ?? DEBUT_VOIX / allureDe(deroule), duree: v.duree, mots: v.mots,
      ...(v.reperes && Object.keys(v.reperes).length ? { reperes: v.reperes } : {}), ...(v.prise.provisoire ? { provisoire: true } : {}), ...(v.prise.synthese ? { synthese: true } : {}) };
    // Voix de synthèse (spec S7, 5.12) : bornes de phrase exactes, mots au prorata des lettres dans chaque phrase.
    if (v.approche !== 'whisper' && v.approche !== 'synthese') calageApproche = true;
    else voixCalees.add(scene.id);
    if (v.prise.provisoire) {
      erreursVoix.push({ regle: 'voix-provisoire', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : c'est encore la voix provisoire du système ; enregistrez la vôtre avant d'exporter.` });
    }
  }
  const scenesDonnees = deroule.scenes.map((s) => ({ id: s.id, duree: s.duree, rythme: s.rythme || 1,
    transition: s.transition && typeof s.transition === 'object' ? { shader: s.transition.shader, duree: s.transition.duree > 0 ? s.transition.duree : DUREE_TRANSITION_SHADER } : (s.transition || 'aucune'),
    ...(voixScenes[s.id] ? { voix: voixScenes[s.id] } : {}) }));
  const minutageScenes = calculerMinutage(scenesDonnees, {}, optionsMinutage(deroule));

  // Son réactif (P7) : texte de chaque scène, cherché ensuite pour les variables CSS du son.
  const textesScenes = [];
  // Éléments des scènes qui déclarent un moment fort (spec Styles et réalisation, 5.8), minutés pour couper la musique.
  const elementsForts = {};
  for (const [rang, scene] of deroule.scenes.entries()) {
    const fichier = cheminDansProjet(projet, scene.fichier);
    let html = null;
    let probleme = null;
    if (!fichier) probleme = `le fichier « ${scene.fichier} » sort du dossier du projet.`;
    else if (!fs.existsSync(fichier)) probleme = `fichier introuvable : « ${scene.fichier} ».`;
    else {
      try {
        html = fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, '');
        probleme = S.verifierSection(html, scene.id);
      } catch (e) {
        probleme = `lecture impossible de \u00AB ${scene.fichier} \u00BB (${e.code || e.message}).`;
      }
    }
    if (probleme) {
      erreurs.push({ regle: 'scene-invalide', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : ${probleme}` });
      sections.push(S.panneauErreur(scene.id, probleme));
      parScene.push({ id: scene.id, section: sections[sections.length - 1], scripts: [] });
      continue;
    }
    // Ébauche (spec Retouches et ergonomie, 5.3) : la page le sait, pour la pastille « Ébauche » de l'aperçu.
    if (estEbauche(html)) scenesDonnees[rang].ebauche = true;
    // Groupes de personnages dépliés d'abord : effets, obstacles et personnages voient les membres (#file-2).
    if (/data-groupe/.test(html)) {
      const deplie = deplierGroupes(html, { scene: scene.id, dureeTemps: dureeTemps(deroule) });
      html = deplie.html;
      erreurs.push(...deplie.erreurs);
    }
    if (/\sdata-moment-fort[\s=>]/.test(html)) elementsForts[scene.id] = require('./lib/extraire.js').extraireScene(html).elements;
    const { html: sansScripts, scripts } = S.extraireScripts(html);
    // Flèches, annotations et dessins libres (spec S7, 5.2 à 5.5) : avant les textes (étiquettes des dessins libres).
    let aDessiner = sansScripts;
    if (usagesDessin(sansScripts, scripts)) {
      const r = preparerDessin(sansScripts, { scene: scene.id, scripts });
      aDessiner = r.html;
      erreurs.push(...r.erreurs);
      dessin.utilise = true;
      r.icones.forEach((n) => dessin.icones.add(n));
      dessin.scripts.push(...scripts);
    }
    const { html: avecTextes, manquants } = S.injecterTextes(aDessiner, scene.textes, scene.ajustements);
    manquants.forEach((cle) => erreurs.push({ regle: 'texte-manquant', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : data-texte="${cle}" n'a pas de texte dans le déroulé.` }));
    // Graphiques, code et formules (spec S7) : après les textes (leurs textes, tirés de scenes[].graphiques, code, formules,
    // sont posés déjà remplis).
    let avecDonnees = avecTextes;
    const usageDonnees = usagesDonnees(avecTextes);
    if (usageDonnees.graphique || usageDonnees.code || usageDonnees.formule) {
      const r = preparerDonnees(avecTextes, { scene, ...(deroule.langue !== undefined ? { langue: Langues.etiquetteDe(deroule) } : {}) });
      avecDonnees = r.html;
      erreurs.push(...r.erreurs);
      if (r.code) montre.code = true;
      if (r.formule) montre.formule = true;
    }
    // Icônes Lucide (spec S9, 5.3) : <svg data-icone="nom"> devient son SVG en ligne ; la bibliothèque n'est lue qu'à la
    // première icône (une page sans icône n'en porte rien).
    let avecIcones = avecDonnees;
    if (/data-icone/.test(avecDonnees)) {
      const r = require('./lib/icones.js').preparerIcones(avecDonnees, { scene: scene.id });
      avecIcones = r.html;
      erreurs.push(...r.erreurs);
    }
    // QR codes (spec S9, 5.4) : <svg data-qr="clé"> reçoit le tracé du texte « clé » du déroulé, fabriqué ici (lib/qr.js).
    if (/\sdata-qr\s*=/.test(avecIcones)) {
      const r = Briques.preparerQR(avecIcones, { scene: scene.id, textes: scene.textes, couleurs: charte.couleurs });
      avecIcones = r.html;
      erreurs.push(...r.erreurs);
    }
    // Cartes (spec S9, 5.10) : <svg data-carte> reçoit ses pays, son cadre, ses repères et ses liaisons (fonds de cartes/) ;
    // les fonds ne sont lus qu'à la première carte.
    if (/\sdata-carte\s*=/.test(avecIcones)) {
      const r = require('./lib/cartes.js').preparerCartes(avecIcones, { scene: scene.id, ratio: deroule.format.ratio });
      avecIcones = r.html;
      erreurs.push(...r.erreurs);
      r.cartes.forEach((n) => cartesUtilisees.add(n));
    }
    // Animations Lottie (spec S9, 5.11) : le fichier de assets/lottie/, recoloré à la charte, devient un bloc JSON de la page.
    if (/\sdata-lottie\s*=/.test(avecIcones)) {
      const r = require('./lib/lottie.js').preparerLotties(avecIcones, { scene: scene.id, projet, couleurs: charte.couleurs, blocs: blocsLottie, dureeScene: minutageScenes.scenes[rang].dureeEffective });
      avecIcones = r.html;
      erreurs.push(...r.erreurs);
      r.fichiers.forEach((f) => { if (!ressources.has(f)) ressources.set(f, 'lottie'); });
    }
    // Écrans (spec S6, 5.8 à 5.12) : cadre, surface et plan posés, adresse réduite au domaine, marques en décor, bruitage des clics.
    const usage = usagesEcran(avecIcones);
    if (usage.moteur) usages.moteur = true;
    if (usage.css) usages.css = true;
    if (usage.moteur) {
      const r = preparerEcrans(avecIcones, { scene: scene.id, projet, film: scene.film || null, duree: scene.duree / (scene.rythme || 1) });
      avecIcones = r.html;
      erreurs.push(...r.erreurs);
      for (const f of r.films) {
        if (!filmsVises.has(f.nom)) filmsVises.set(f.nom, new Set());
        f.etapes.forEach((n) => filmsVises.get(f.nom).add(n));
      }
    }
    // Milieu fluide (P5c) : un par scène, préparé avant les effets (qui peuvent s'y coupler).
    const { html: avecMilieux, milieux: milieuxScene, erreurs: erreursMilieux } = preparerMilieux(avecIcones, {
      scene: scene.id, projet, bibliotheque: dossierEffets, charte: charte.couleurs, premierIndex: milieux.length, dureeTemps: dureeTemps(deroule),
    });
    milieux.push(...milieuxScene);
    erreurs.push(...erreursMilieux);
    const { html: avecEffets, effets: effetsScene, erreurs: erreursEffets, modules: modulesScene } = preparerEffets(avecMilieux, {
      scene: scene.id, projet, bibliotheque: dossierEffets, charte: charte.couleurs, premierIndex: effets.length, dureeTemps: dureeTemps(deroule), chargerShader,
      milieu: milieuxScene.length > 0, dureeScene: minutageScenes.scenes[rang].dureeEffective, voix: voixScenes[scene.id] || null, rythme: scenesDonnees[rang].rythme,
      derniere: rang === deroule.scenes.length - 1,
    });
    Object.assign(sourcesModules, modulesScene);
    effets.push(...effetsScene);
    erreurs.push(...erreursEffets);
    const { html: avecShaders, shaders: shadersScene, erreurs: erreursShaders } = preparerShaders(avecEffets, {
      scene: scene.id, charger: chargerShader, charte: charte.couleurs, projet, premierIndex: shaders.length,
    });
    shaders.push(...shadersScene);
    erreurs.push(...erreursShaders);
    const { html: avecObstacles, obstacles: obstaclesScene, erreurs: erreursObstacles } = preparerObstacles(avecShaders, { scene: scene.id, premierIndex: obstacles.length });
    obstacles.push(...obstaclesScene);
    erreurs.push(...erreursObstacles);
    // Personnages : validés, durée des gestes écrite ; la bibliothèque n'est lue qu'au premier personnage rencontré.
    let avecPersonnages = avecObstacles;
    if (/data-personnage|data-action/.test(avecObstacles)) {
      if (!luPersonnages) {
        luPersonnages = Pers.lire(projet);
        luPersonnages.erreurs.forEach((e) => erreurs.push({ regle: 'personnage-invalide', gravite: 'alerte', message: e.message }));
      }
      const r = preparerPersonnages(avecObstacles, { scene: scene.id, lu: luPersonnages, voix: !!(scene.voix && scene.voix.texte), dureeTemps: dureeTemps(deroule) });
      avecPersonnages = r.html;
      if (r.parle) scenesQuiParlent.add(scene.id);
      r.utilises.dessins.forEach((n) => utilisesPersonnages.dessins.add(n));
      r.utilises.gabarits.forEach((n) => utilisesPersonnages.gabarits.add(n));
      (r.utilises.batonnets || []).forEach((n) => utilisesPersonnages.batonnets.add(n));
      (r.utilises.habillages || []).forEach((n) => utilisesPersonnages.habillages.add(n));
      erreurs.push(...r.erreurs);
    }
    // Sons importés (data-son="assets/…") : embarqués en bloc, l'attribut désigne le bloc ; un nom de bruitage reste tel quel.
    // Valeur entre guillemets doubles ou simples (une apostrophe dans un chemin entre guillemets doubles reste au chemin) ;
    // un même fichier n'est embarqué qu'une fois.
    const avecSons = avecPersonnages.replace(/(\sdata-son=)(?:"([^"]+)"|'([^']+)')/g, (tout, debut, double, simple) => {
      const valeur = double !== undefined ? double : simple;
      const guillemet = double !== undefined ? '"' : "'";
      if (!/[/.]/.test(valeur)) return tout;
      let id = sonsEmbarques.get(valeur);
      if (!id) {
        const uri = embarquerFichier(projet, valeur, `Son « ${valeur} » (scène « ${scene.id} »)`, erreurs, ressources, 'son');
        if (!uri) return tout;
        id = `pm-son-fichier-${fichiersSons++}`;
        sons.push(blocSon(id, uri));
        sonsEmbarques.set(valeur, id);
      }
      return `${debut}${guillemet}fichier:${id}${guillemet}`;
    });
    const { html: embarque, erreurs: erreursRes, fichiers: fichiersScene } = embarquerRessources(S.injecterLogo(avecSons, uriLogo), projet, `scène « ${scene.id} »`);
    for (const f of fichiersScene) if (!ressources.has(f)) ressources.set(f, 'image');
    erreursRes.forEach((e) => erreurs.push({ ...e, scene: scene.id }));
    sections.push(embarque.trim());
    parScene.push({ id: scene.id, section: sections[sections.length - 1], scripts });
    textesScenes.push({ scene: scene.id, texte: embarque });
    scripts.forEach((code) => scriptsScenes.push(`(function () { try {\n${code}\n} catch (e) { console.error('[Pulse Motion] Scène « ${scene.id} » : ' + e.message); } })();`));
  }

  const { html: cssStyle, erreurs: erreursStyle } = embarquerRessources(fs.readFileSync(path.join(dossierStyle, 'style.css'), 'utf8'), dossierStyle, `style « ${deroule.style} »`);
  erreurs.push(...erreursStyle);

  let sourceMusique = null;
  if (deroule.musique && deroule.musique.fichier) {
    const uri = embarquerFichier(projet, deroule.musique.fichier, 'Musique', erreurs, ressources, 'musique');
    if (uri) { sourceMusique = 'pm-son-musique'; sons.push(blocSon(sourceMusique, uri)); }
  }

  // Voix (lues avant les scènes) : blocs et messages rangés ici, à leur place habituelle.
  sons.push(...sonsVoix);
  erreurs.push(...erreursVoix);
  for (const id of scenesQuiParlent) {
    if (!voixScenes[id]) erreurs.push({ regle: 'personnage-invalide', gravite: 'alerte', scene: id,
      message: `Scène « ${id} » : un personnage doit parler, mais la voix n'est pas enregistrée : il restera bouche fermée (enregistrer la voix de la scène, ou « pulse-motion voix provisoire --scene ${id} »).` });
  }
  if (calageApproche) {
    erreurs.push({ regle: 'calage-approche', gravite: 'info',
      message: 'Les mots de la voix sont calés approximativement (sans transcription) : les ancres « mot: » et les sous-titres peuvent tomber un peu à côté ; « pulse-motion whisper » dit comment installer la transcription.' });
  }
  // Films : un bloc JSON par film, ses seules étapes visées, images en data: (cache des URI par chemin, taille et date).
  const blocsFilms = [];
  const films = [];
  let poidsFilms = 0;
  for (const [nom, numeros] of filmsVises) {
    const b = blocFilm(projet, nom, [...numeros].sort((a, c) => a - c));
    if (b.erreur) continue;
    blocsFilms.push(b.html);
    poidsFilms += b.poids;
    films.push({ nom, prise: b.prise, etapes: [...numeros].sort((a, c) => a - c), poids: b.poids, empreinte: crypto.createHash('sha256').update(b.html).digest('hex') });
  }
  if (poidsFilms > 25 * 1024 * 1024) {
    erreurs.push({ regle: 'film-trop-lourd', gravite: 'alerte',
      message: `Les images filmées embarquées pèsent ${Math.round(poidsFilms / 1024 / 1024)} Mo (au-delà de 25 Mo, la page est lente à ouvrir) : supprimer les étapes inutiles des scènes, raccourcir les réactions (refilmer en attendant moins), ou alléger le film.` });
  }
  const poidsSons = sons.reduce((n, b) => n + b.length, 0);
  if (poidsSons > 20 * 1024 * 1024) {
    erreurs.push({ regle: 'page-lourde', gravite: 'alerte',
      message: `Les sons embarqués pèsent ${Math.round(poidsSons / 1024 / 1024)} Mo : la page sera lente à ouvrir ; installez ffmpeg (« pulse-motion ffmpeg ») pour les voix en Opus.` });
  }

  const video = obstaclesVideo(deroule);
  erreurs.push(...video.erreurs);
  // Transitions et post-traitements du déroulé : après les fonds (les indices data-pm-shader restent justes).
  const duDeroule = shadersDuDeroule(deroule, { charger: chargerShader, charte: charte.couleurs, projet });
  shaders.push(...duDeroule.shaders);
  erreurs.push(...duDeroule.erreurs);
  const [l, h] = deroule.format.ratio.split(':');
  // Briques de la spec S9 (typographie, QR, Ken Burns, 2,5D) : axes des polices variables seulement si une scène en anime un.
  const policesVariables = Briques.besoinsBriques(sections).variable ? Briques.donneesPolices(detailPolices) : {};
  const donnees = {
    titre: deroule.titre,
    // Langue de la vidéo (spec S9, 5.1) : seulement si le déroulé la déclare (sans elle, la page est celle d'avant).
    ...(deroule.langue !== undefined ? { langue: Langues.etiquetteDe(deroule) } : {}),
    format: { ratio: deroule.format.ratio, ips: deroule.format.ips || 30, ...(deroule.format.plateforme ? { plateforme: deroule.format.plateforme } : {}) },
    // Couverture déclarée (spec Rendu et export, 5.10) : la page livrée s'ouvre sur elle (moteur/lecteur.js, M.instantCouverture).
    ...(deroule.couverture ? { couverture: { scene: deroule.couverture.scene, instant: deroule.couverture.instant } } : {}),
    // Boucle parfaite (spec Rendu et export, 5.18) : le lecteur reprend à 0, la musique perd ses fondus.
    ...(deroule.boucle === true ? { boucle: true } : {}),
    musique: deroule.musique ? { volume: deroule.musique.volume ?? 1, source: sourceMusique, partition: null } : null,
    voix: Object.keys(voixScenes).length ? { volume: deroule.voix && typeof deroule.voix.volume === 'number' ? deroule.voix.volume : 1 } : null,
    // Tempo du déroulé, sinon celui de la musique générée.
    // Allure globale (spec S7, 5.14, plan J4) : lue par le code et les graphiques du calque (durées divisées par l'allure).
    ...(typeof deroule.allure === 'number' && deroule.allure >= 0.7 && deroule.allure <= 1.6 && deroule.allure !== 1 ? { allure: deroule.allure } : {}),
    tempo: dureeTemps(deroule) ? { bpm: (deroule.tempo && deroule.tempo.bpm) || tempoMusique(deroule), decalage: (deroule.tempo && deroule.tempo.decalage) || 0, ...(grilleFixe(deroule) ? { grille: true } : {}) } : null,
    bruitages: deroule.bruitages ? { transitions: deroule.bruitages.transitions === true, volume: deroule.bruitages.volume ?? 1, ...bruitagesAuto(deroule, dossierStyle),
      // Calage par le pic et mixage par bandes (spec Styles et réalisation, 5.8) : seulement si le déroulé les déclare.
      ...(deroule.bruitages.calage === 'pic' ? { calage: 'pic' } : {}), ...(deroule.bruitages.bandes === true ? { bandes: true } : {}) } : null,
    // Moment fort (5.8) : le son fort du style (identite.json, son.fort), seulement si une scène en déclare un.
    ...(Object.keys(elementsForts).length ? { momentFort: { son: (sonDuStyle(dossierStyle) || {}).fort || 'impact' } } : {}),
    scenes: scenesDonnees,
    effets: effets.map(({ calque, ancre, cible, effet }) => ({ calque, ancre, cible, effet })),
    milieux: milieux.map(({ calque, ancre, sansDuree, effet }) => ({ calque, ancre, sansDuree, effet })),
    obstacles,
    obstaclesVideo: video.obstacles,
    shaders,
    modules: sourcesModules,
    ...(luPersonnages ? { personnages: donneesPersonnages(utilisesPersonnages, luPersonnages) } : {}),
    // Icônes des dessins libres (d.icone) : seulement celles nommées (lib/icones.js, cheminsPour).
    ...(dessin.icones.size ? { icones: require('./lib/icones.js').cheminsPour([...dessin.icones]) } : {}),
    // Polices variables (spec S9, 5.6) : axes par famille, lus par l'effet de lettres graisse.
    ...(Object.keys(policesVariables).length ? { polices: policesVariables } : {}),
  };

  // Son réactif (P7) : pistes lues par les effets, les shaders et le CSS ; analysées une fois dans la page.
  const besoins = besoinsSon({
    effets, shaders,
    css: [{ scene: null, texte: cssStyle }, { scene: null, texte: cssDeCharte }, ...textesScenes],
    presentes: { musique: !!deroule.musique, voix: Object.keys(voixScenes).length > 0 },
  });
  donnees.son = besoins.son;
  erreurs.push(...besoins.erreurs);

  // Sous-titres : cartons en temps absolus (minutage des scènes avec leurs voix), fichiers SRT et VTT.
  let cartons = [];
  if (deroule.sousTitres && deroule.scenes.some((s) => s.voix && s.voix.texte)) {
    const min = calculerMinutage(donnees.scenes, {}, optionsMinutage(deroule));
    const scenesST = deroule.scenes.map((s, i) => {
      const m = min.scenes[i];
      // Forme affichée du texte dit (spec S7, 5.11) : jamais de balisage dans les sous-titres.
      const mots = s.voix && s.voix.texte ? ST.motsDeScene({ debut: m.debut, fin: m.fin, texte: lireTexteDit(s.voix.texte).affiche, voix: voixScenes[s.id] || null }) : [];
      return { id: s.id, debut: m.debut, fin: m.fin, mots };
    }).filter((s) => s.mots.length);
    cartons = ST.cartons(scenesST, { ratio: deroule.format.ratio, langue: Langues.etiquetteDe(deroule) });
  }
  donnees.sousTitres = cartons.length ? {
    mode: deroule.sousTitres.mode || 'ligne',
    incrustes: deroule.sousTitres.incrustes !== false,
    position: deroule.sousTitres.position || null,
    cartons,
  } : null;
  // Karaoké (spec S9, 5.8) : sans voix enregistrée et calée, les mots sont répartis au prorata des lettres.
  if (donnees.sousTitres && donnees.sousTitres.mode === 'karaoke') {
    const sansVoix = deroule.scenes.filter((s) => s.voix && s.voix.texte && !voixCalees.has(s.id)).map((s) => s.id);
    if (sansVoix.length) {
      erreurs.push({ regle: 'karaoke-sans-voix', gravite: 'alerte', scene: sansVoix[0],
        message: `Le karaoké suit les mots de la voix : sans voix enregistrée et calée, le remplissage ne suivra pas la parole (scène${sansVoix.length > 1 ? 's' : ''} ${sansVoix.map((x) => `« ${x} »`).join(', ')}).` });
    }
  }

  // Allure (spec S7, 5.14) : une musique importée ou une partition garde son tempo ; on le dit.
  if (allureDe(deroule) !== 1 && deroule.musique && (deroule.musique.fichier || deroule.musique.partition)) {
    erreurs.push({ regle: 'allure-musique', gravite: 'alerte', message: `L'allure de la vidéo est à ${String(allureDe(deroule)).replace('.', ',')}, mais la musique ${deroule.musique.fichier ? 'importée' : 'de la partition'} garde son tempo : elle ne suit pas l'allure (une musique générée, elle, la suit).` });
  }
  // Musique générée (ambiance) ou partition libre : partition validée, jouée par le synthétiseur de la page.
  if (deroule.musique && deroule.musique.generee) {
    const min = calculerMinutage(donnees.scenes, {}, optionsMinutage(deroule));
    const forts = momentsForts(donnees.scenes, elementsForts, optionsMinutage(deroule));
    // Allure (spec S7, 5.14) : tempo × √allure ; accents (5.15) : une note douce de tonique au début de chaque scène.
    donnees.musique.partition = SA.generer({ ambiance: deroule.musique.generee, tempo: allureDe(deroule) === 1 ? deroule.musique.tempo : tempoMusique(deroule), tonalite: deroule.musique.tonalite,
      ...(deroule.musique.accents === true ? { accents: true } : {}),
      intensite: deroule.musique.intensite, graine: deroule.musique.graine, duree: min.duree,
      // Moments forts (5.8) : la musique se tait 0,6 s avant chacun (aucune note n'y part).
      ...(forts.length ? { coupures: forts.map((m) => ({ debut: Math.max(0, m.t - 0.6), fin: m.t })) } : {}),
      scenes: min.scenes.map((s, i) => ({ debut: s.debut, fin: s.fin, humeur: deroule.scenes[i].musique })) });
  } else if (deroule.musique && deroule.musique.partition) {
    const absolu = cheminDansProjet(projet, deroule.musique.partition);
    let lue = null;
    try { lue = JSON.parse(fs.readFileSync(absolu, 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
      erreurs.push({ regle: 'partition-invalide', gravite: 'erreur', message: `Partition « ${deroule.musique.partition} » illisible (${e.code === 'ENOENT' || !absolu ? 'fichier introuvable dans le projet' : 'JSON invalide'}).` });
    }
    if (lue) {
      const fautes = SP.validerPartition(lue);
      if (fautes.length) erreurs.push({ regle: 'partition-invalide', gravite: 'erreur', message: `Partition « ${deroule.musique.partition} » : ${fautes.join(' ')}` });
      else {
        // Pistes calées sur une scène : leur grille part du vrai début de la scène et s'arrête au début de la suivante.
        const min = calculerMinutage(donnees.scenes, {}, optionsMinutage(deroule));
        const ids = min.scenes.map((s) => s.id);
        const inconnues = [...new Set(lue.pistes.filter((p) => p.scene !== undefined && !ids.includes(p.scene)).map((p) => p.scene))];
        if (inconnues.length) erreurs.push({ regle: 'partition-invalide', gravite: 'erreur', message: `Partition « ${deroule.musique.partition} » : scène${inconnues.length > 1 ? 's' : ''} ${inconnues.map((x) => `« ${x} »`).join(', ')} inconnue${inconnues.length > 1 ? 's' : ''} (scènes : ${ids.join(', ')}).` });
        donnees.musique.partition = { ...lue, pistes: lue.pistes.filter((p) => p.scene === undefined || ids.includes(p.scene)).map((p) => {
          if (p.scene === undefined) return p;
          const i = ids.indexOf(p.scene);
          const { scene, ...reste } = p;
          return { ...reste, origine: Math.round(min.scenes[i].debut * 1e6) / 1e6, jusqua: Math.round((i + 1 < ids.length ? min.scenes[i + 1].debut : min.duree) * 1e6) / 1e6 };
        }) };
      }
    }
  }

  // Moteur à la carte : seuls les groupes de modules dont la vidéo se sert (groupesImposes : 'tous' pour les tests) ; des
  // habillages des personnages, seulement ceux d'une scène (spec S11, 5.1 point 4).
  const groupes = groupesImposes || GM.groupesDuDeroule(donnees, sections, dessin.scripts, { habillages: [...utilisesPersonnages.habillages] });
  if (modulesDessin && Array.isArray(groupes)) for (const g of ['dessin', 'releve']) if (!groupes.includes(g)) groupes.push(g);
  const moteur = [lireMoteur(RACINE, { groupes })].concat(modulesStyle.map((n) => lireModule(RACINE, `medium/${n}.js`, process.env.PM_MOTEUR_BRUT === '1'))).join('\n;\n');
  // Polices du code et des formules (vendor/polices/, OFL) : seulement si une scène en montre ; dans les crédits.
  const cssMontre = cssDonnees(montre);
  polices.push(...cssMontre.polices);
  for (const p of cssMontre.detail) {
    const deja = detailPolices.find((x) => x.famille === p.famille);
    if (deja) { deja.roles.push(...p.roles); deja.fichiers.push(...p.fichiers); } else detailPolices.push(p);
  }
  const temps = dureeTemps(deroule);
  // Feuille des briques de la spec S9 (moteur/briques.css) : seulement si une scène s'en sert, ou en karaoké.
  const cssBriques = Briques.besoinsBriques(sections, donnees).css ? `${fs.readFileSync(path.join(RACINE, 'moteur', 'briques.css'), 'utf8')}\n` : '';
  // Cartes (spec S9, 5.10) : moteur/cartes.css seulement si une scène pose une carte.
  const cssCartes = cartesUtilisees.size ? `${fs.readFileSync(path.join(RACINE, 'moteur', 'cartes.css'), 'utf8')}\n` : '';
  const cssPage = `:root { --pm-ratio-l: ${l}; --pm-ratio-h: ${h};${temps ? ` --pm-temps: ${temps}s; --pm-bpm: ${Math.round(60 / temps * 1000) / 1000};` : ''} }
${cssZones(deroule.format.plateforme)}${fs.readFileSync(path.join(RACINE, 'moteur', 'base.css'), 'utf8')}
${fs.readFileSync(path.join(RACINE, 'moteur', 'mouvements.css'), 'utf8')}
${usages.css ? `${fs.readFileSync(path.join(RACINE, 'moteur', 'ecran.css'), 'utf8')}\n` : ''}${cssBriques}${cssCartes}${dessin.utilise ? `${fs.readFileSync(path.join(RACINE, 'moteur', 'dessin', 'dessin.css'), 'utf8')}\n` : ''}${variablesCSS()}
${cssDeCharte}
${cssMontre.css}${modulesStyle.map(cssModule).filter(Boolean).map((c) => `${c}
`).join('')}${cssStyle}`;
  // Page qui sait faire son MP4 (spec Retouches et ergonomie, 5.18) : seulement sur demande (page.boutonMp4: true).
  const blocMp4 = PageMp4.avecBoutonMp4(deroule)
    ? PageMp4.blocExport({ deroule, dossierStyle, duree: minutageScenes.duree, titre: deroule.titre, base: slug(deroule.titre) }) : '';
  const page = `<!doctype html>
<html lang="${Langues.etiquetteDe(deroule)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Pulse Motion">
<title>${S.echapperHTML(deroule.titre)}</title>
<style>
${cssPage}
</style>
</head>
<body>
<div id="pm-scene" data-ton="${charte.ton}">
${sections.join('\n')}
</div>
${sons.join('\n')}
${blocsFilms.length ? `${blocsFilms.join('\n')}\n` : ''}${[...blocsLottie.values()].map((b) => `${b.html}\n`).join('')}<script type="application/json" id="pm-donnees">${jsonDansHTML(donnees)}</script>
<script>
${moteur}
</script>
<script>
${scriptsScenes.join('\n')}
M.demarrer();
M.demarrerPersonnages();
M.demarrerLecteur();
M.demarrerSousTitres();
M.demarrerSonReactif();
M.demarrerParticules();
${usages.moteur && (groupes === 'tous' || groupes.includes('ecran')) ? 'M.demarrerEcrans();\n' : ''}${dessin.utilise && (groupes === 'tous' || groupes.includes('dessin')) ? 'M.demarrerDessin();\n' : ''}${groupes === 'tous' || groupes.includes('camera-auto') ? 'M.demarrerCameraAuto();\n' : ''}${groupes === 'tous' || groupes.includes('trace') ? 'M.demarrerTraces();\n' : ''}${groupes === 'tous' || groupes.includes('lottie') ? 'M.demarrerLotties();\n' : ''}</script>
${blocMp4 ? `${blocMp4}\n` : ''}</body>
</html>
`;

  const resultat = { ok: true, fichier: null, html: page, erreurs, effets, milieux, shaders, donnees, parScene, cssPage, moteur, groupes, polices, detailPolices, dossierStyle, films,
    ressources: [...ressources].map(([fichier, sorte]) => ({ fichier, sorte })), minutage: minutageScenes,
    ...(cartesUtilisees.size ? { cartes: [...cartesUtilisees] } : {}) };
  if (ecrire) resultat.fichier = ecrireSortie(projet, resultat).fichier;
  return resultat;
}

/**
 * Écrit la page d'un assemblage réussi dans sortie/<titre>.html (écriture atomique), avec ses sous-titres.
 * siChangee : rien n'est écrit si la page sur le disque est déjà la même (l'aperçu ne se recharge pas pour rien, et le
 * rapport de débordement qu'il a envoyé reste valable). -> { fichier, ecrite }
 */
function ecrireSortie(projet, assemblage, { siChangee = false } = {}) {
  const dossierSortie = path.join(projet, 'sortie');
  const titre = assemblage.donnees.titre;
  const sortie = path.join(dossierSortie, `${slug(titre)}.html`);
  if (siChangee) {
    let actuelle = null;
    try { actuelle = fs.readFileSync(sortie, 'utf8'); } catch { /* pas encore de page */ }
    if (actuelle === assemblage.html) return { fichier: sortie, ecrite: false };
  }
  fs.mkdirSync(dossierSortie, { recursive: true });
  const temporaire = `${sortie}.${process.pid}.tmp`;
  fs.writeFileSync(temporaire, assemblage.html, 'utf8');
  fs.renameSync(temporaire, sortie);
  ecrireSousTitres(dossierSortie, titre, assemblage.donnees.sousTitres ? assemblage.donnees.sousTitres.cartons : [], assemblage.donnees.langue || null);
  // Le rapport de débordement portait sur l'ancienne page : l'aperçu en renverra un pour la nouvelle.
  fs.rmSync(path.join(dossierSortie, 'controle-page.json'), { force: true });
  // Registre des vidéos de la personne (spec Retouches et ergonomie, 5.21) : titre et date, à chaque assemblage.
  require('./lib/videos.js').noterVideo({ dossier: projet, titre });
  return { fichier: sortie, ecrite: true };
}

if (require.main === module) {
  const dossier = process.argv[2];
  if (!dossier) {
    console.error('Usage : node scripts/assembler.js <dossier-du-projet>');
    process.exit(2);
  }
  const { ok, fichier, erreurs } = assembler({ dossier });
  console.log(JSON.stringify({ ok, fichier, erreurs }, null, 2));
  process.exit(ok ? 0 : 1);
}

module.exports = { assembler, ecrireSortie, slug, chartePour, charteFinale, ecrireSousTitres, lireMoteur, MOTEUR, RACINE };
