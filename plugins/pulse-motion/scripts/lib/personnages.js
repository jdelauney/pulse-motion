'use strict';
/* Pulse Motion – bibliothèque des personnages : poses, clips et gabarits (JSON) ; lecture, validation, écriture stable.
 *
 *   <plugin>/personnages/{poses,clips,gabarits}/<nom>.json   bibliothèque livrée
 *   <vidéo>/personnages/{poses,clips,gabarits}/<nom>.json    fichiers de la vidéo (à nom égal, ils l'emportent)
 *
 * lire(dossierVideo | null) -> { poses, clips, gabarits, sources, fichiers, erreurs } : un fichier invalide est écarté
 * (la version de la bibliothèque reste, s'il y en a une) et signalé dans erreurs.
 * serialiser(type, objet) : ordre des clés fixe, angles dans l'ordre de REPOS, nombres au millième, indentation 2.
 * Démarches calculées (spec S11, 5.7) : réglages sans images-clés dans <…>/personnages/clips/demarches/<nom>.json
 * ({ nom, description, genre, foulee, periode, appui }), lus à part dans lu.demarches (ni mouvements, ni atelier).
 */
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../moteur/squelette.js');
const C = require('../../moteur/courbes.js');
const { verifierSVG } = require('./svg-sur.js');
const { FORMES: FORMES_PLUME } = require('../../moteur/habillage-plume.js');
const D = require('../../moteur/demarche.js');

const RACINE = path.resolve(__dirname, '..', '..');
const BIBLIOTHEQUE = path.join(RACINE, 'personnages');
const NOM = /^[a-z0-9-]+$/;
const NOM_OS = /^[a-z][a-zA-Z0-9]*$/;
const PARENTS = ['bassin', 'torse', 'tete'];
const LONGUEURS = ['cuisse', 'tibia', 'pied', 'colonne', 'hauteurEpaules', 'baseTete', 'bras', 'avantBras'];
const DEMI = ['demiBassin', 'demiEpaules'];
const RANG = [...S.NOMS.os, ...S.NOMS.expression];
const TYPES = { pose: 'poses', clip: 'clips', gabarit: 'gabarits', expression: 'expressions', dessin: 'dessins', decoupe: 'decoupes' };
const VUES = ['profil', 'troisQuarts', 'face', 'dos'];
const PIECES = ['bassin', 'torse', 'tete', ...['cuisse', 'tibia', 'pied', 'bras', 'avantBras', 'main'].flatMap((n) => [`${n}Avant`, `${n}Arriere`])];
const BOUCHES = ['neutre', 'sourire', 'rire', 'triste', 'surprise', 'colere', 'repos', 'A', 'E', 'I', 'O', 'U', 'MBP', 'FV', 'L'];
const ANGLES_VISAGE = ['sourcilsY', 'sourcilsAngle', 'paupieres', 'tailleYeux', 'taillePupilles', 'regardX', 'regardY'];
const COULEUR = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|none|transparent)$/i;
const NOM_COULEUR = /^[a-z][a-z0-9-]*$/;
const ORDRE = {
  pose: ['nom', 'description', 'expression', 'bouche', 'angles'],
  clip: ['nom', 'description', 'boucle', 'duree', 'foulee', 'pieds', 'miroir', 'additif', 'lissage', 'contacts', 'cles'],
  gabarit: ['nom', 'description', ...Object.keys(S.GABARIT)],
  expression: ['nom', 'description', 'bouche', 'angles', 'clignement'],
  dessin: ['nom', 'description', 'maniere', 'gabarit', 'couleurs', 'batonnets', 'plume', 'vetements', 'pieces', 'accessoires', 'visage'],
  decoupe: ['nom', 'description', 'source', 'vue', 'gabarit', 'couleurs', 'os', 'visage', 'ignorer'],
};
const ORDRE_CLE = ['t', 'pose', 'expression', 'bouche', 'angles', 'courbe'];
const ORDRE_ACCESSOIRE = ['nom', 'os', 'devant', 'dessins'];
// Manières de dessin (spec Mouvement vivant, 5.17) : « traits » (bâtonnets et tête en ellipse, comme touffu ; un réglage
// bâtonnets équivalent) ou « pieces » (tenue et volumes dessinés par pièce) ; « plume » (spec S11, 5.6) : trait d'encre tracé
// par l'habillage plume, sans pièces ni visage (réglage plume, vêtements).
const MANIERES = ['traits', 'pieces', 'plume'];
const ORDRE_PLUME = ['traits', 'remplissages', 'cheveux', 'chapeau', 'objets'];
const PARTIES_PLUME = ['torse', 'bras', 'jambes'];
const ORDRE_BATONNETS = ['couleurs', 'epaisseur'];
const COULEURS_BATONNETS = ['corps', 'dos', 'oeil', 'oeilTrait', 'pupille', 'touffe', 'touffeTrait'];
const ORDRE_VISAGE = ['oeil', 'sourcil', 'bouches', 'vues'];
const ORDRE_OEIL = ['blanc', 'pupille', 'paupiere', 'course', 'hauteur'];
const ORDRE_VUE_VISAGE = ['yeux', 'sourcils', 'bouche'];
const ORDRE_OS = ['nom', 'parent', 'attache', 'angle', 'longueur', 'raideur', 'amorti'];

const arrondir = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 + 0 : v);
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

function ErreurPersonnage(erreurs) {
  const e = new Error(erreurs.join('\n'));
  e.erreurs = erreurs;
  return e;
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function suggestion(nom, connus) {
  let meilleur = null;
  let d = 3;
  for (const c of connus) { const x = distance(nom, c); if (x < d) { d = x; meilleur = c; } }
  return meilleur ? ` ; voulais-tu « ${meilleur} » ?` : '';
}

function champsInconnus(objet, permis, erreurs, ou = '') {
  for (const k of Object.keys(objet)) if (!permis.includes(k)) erreurs.push(`${ou}champ « ${k} » inconnu (champs permis : ${permis.join(', ')}).`);
}

function verifierAngles(angles, ou, contexte, erreurs) {
  if (!estObjet(angles)) { erreurs.push(`${ou}« angles » doit être un objet { nom: degrés } (ex. { "brasAvant": -90 }).`); return; }
  const noms = [...RANG, ...(contexte.osEnPlus || [])];
  for (const [n, v] of Object.entries(angles)) {
    if (S.NOMS.placement.includes(n)) erreurs.push(`${ou}« ${n} » se règle dans la scène, pas dans une pose ou un clip.`);
    else if (!noms.includes(n)) erreurs.push(`${ou}« ${n} » : angle inconnu${suggestion(n, noms)}`);
    else if (!estNombre(v)) erreurs.push(`${ou}« ${n} » doit être un nombre (ex. -90), pas ${JSON.stringify(v)}.`);
  }
}

function verifierNom(objet, contexte, erreurs) {
  if (objet.nom !== undefined && objet.nom !== contexte.nom) erreurs.push(`« nom » vaut « ${objet.nom} » mais le fichier s'appelle « ${contexte.nom}.json ».`);
  if (objet.description !== undefined && typeof objet.description !== 'string') erreurs.push('« description » doit être un texte.');
}

function verifierChoix(objet, ou, contexte, erreurs) {
  if (objet.expression !== undefined && !(contexte.expressions || []).includes(objet.expression)) erreurs.push(`${ou}expression « ${objet.expression} » introuvable (expressions : ${(contexte.expressions || []).join(', ')}).`);
  if (objet.bouche !== undefined && !(typeof objet.bouche === 'string' && /^[A-Za-z][\w-]{0,19}$/.test(objet.bouche))) erreurs.push(`${ou}« bouche » : nom de bouche (ex. sourire, O, MBP).`);
}

function verifierVues(vues, lieu, erreurs) {
  const ou = lieu.trim();
  if (!estObjet(vues)) { erreurs.push(`${ou} : dessins par vue attendus ({ "profil": "<path …/>" }).`); return; }
  if (vues.profil === undefined) erreurs.push(`${ou} : vue « profil » obligatoire.`);
  for (const [v, svg] of Object.entries(vues)) {
    if (!VUES.includes(v)) { erreurs.push(`${ou} : vue « ${v} » inconnue (${VUES.join(', ')}).`); continue; }
    if (typeof svg !== 'string') { erreurs.push(`${ou}, vue « ${v} » : SVG attendu (texte).`); continue; }
    for (const m of verifierSVG(svg)) erreurs.push(`${ou}, vue « ${v} » : ${m}.`);
  }
}

const estPosition = (p) => Array.isArray(p) && p.length === 2 && p.every(estNombre);

function validerVisage(v, erreurs) {
  if (!estObjet(v)) { erreurs.push('visage : objet attendu { oeil, sourcil?, bouches, vues }.'); return; }
  champsInconnus(v, ORDRE_VISAGE, erreurs, 'visage : ');
  if (!estObjet(v.oeil) || typeof v.oeil.blanc !== 'string') erreurs.push('visage : « oeil.blanc » obligatoire (SVG du blanc de l\'œil).');
  if (estObjet(v.oeil)) {
    champsInconnus(v.oeil, ORDRE_OEIL, erreurs, 'visage, oeil : ');
    for (const k of ['blanc', 'pupille', 'paupiere']) {
      if (v.oeil[k] !== undefined && typeof v.oeil[k] !== 'string') erreurs.push(`visage : « oeil.${k} » : SVG attendu (texte).`);
      else if (typeof v.oeil[k] === 'string') for (const m of verifierSVG(v.oeil[k])) erreurs.push(`visage, oeil.${k} : ${m}.`);
      if (k === 'blanc' && typeof v.oeil.blanc === 'string' && /<g[\s>/]/.test(v.oeil.blanc)) erreurs.push('visage : « oeil.blanc » : formes simples sans « g » (le blanc sert aussi à découper la pupille et la paupière).');
    }
    for (const k of ['course', 'hauteur']) if (v.oeil[k] !== undefined && !(estNombre(v.oeil[k]) && v.oeil[k] > 0)) erreurs.push(`visage : « oeil.${k} » doit être un nombre positif.`);
  }
  if (v.sourcil !== undefined) {
    if (typeof v.sourcil !== 'string') erreurs.push('visage : « sourcil » : SVG attendu.');
    else for (const m of verifierSVG(v.sourcil)) erreurs.push(`visage, sourcil : ${m}.`);
  }
  if (!estObjet(v.bouches) || v.bouches.neutre === undefined) erreurs.push('visage : bouche « neutre » obligatoire (dans « bouches »).');
  if (estObjet(v.bouches)) for (const [n, vues] of Object.entries(v.bouches)) verifierVues(vues, `visage, bouche « ${n} » `, erreurs);
  if (!estObjet(v.vues) || v.vues.profil === undefined) { erreurs.push('visage : vue « profil » obligatoire (dans « vues »).'); }
  for (const [nom, vue] of Object.entries(estObjet(v.vues) ? v.vues : {})) {
    const ou = `visage, vue « ${nom} » : `;
    if (!VUES.includes(nom) || nom === 'dos') { erreurs.push(`${ou}vue inconnue (profil, troisQuarts, face ; de dos, le visage est caché).`); continue; }
    if (!estObjet(vue)) { erreurs.push(`${ou}objet { yeux, sourcils?, bouche } attendu.`); continue; }
    champsInconnus(vue, ORDRE_VUE_VISAGE, erreurs, ou);
    if (!Array.isArray(vue.yeux) || !vue.yeux.length || !vue.yeux.every(estPosition)) erreurs.push(`${ou}« yeux » : liste de positions [x, y] (ex. [[-13, -6], [13, -6]]).`);
    if (vue.sourcils !== undefined && !(Array.isArray(vue.sourcils) && vue.sourcils.every(estPosition))) erreurs.push(`${ou}« sourcils » : liste de positions [x, y].`);
    if (!estPosition(vue.bouche)) erreurs.push(`${ou}« bouche » : position [x, y] (ex. [0, 22]).`);
  }
}

function validerDessin(objet, contexte, erreurs) {
  champsInconnus(objet, ORDRE.dessin, erreurs);
  verifierNom(objet, contexte, erreurs);
  let os = [];
  if (objet.gabarit === undefined || typeof objet.gabarit === 'string') {
    const nom = objet.gabarit === undefined ? 'standard' : objet.gabarit;
    if (objet.gabarit !== undefined && !(contexte.gabarits || []).includes(nom)) erreurs.push(`gabarit « ${nom} » introuvable (gabarits : ${(contexte.gabarits || []).join(', ')}).`);
    os = (contexte.osParGabarit || {})[nom] || [];
  } else if (estObjet(objet.gabarit)) {
    const e = [];
    validerGabarit(objet.gabarit, { nom: contexte.nom }, e);
    for (const m of e) erreurs.push(`gabarit : ${m}`);
    os = (objet.gabarit.osEnPlus || []).map((o) => o && o.nom).filter(Boolean);
  } else erreurs.push('« gabarit » : nom d\'un gabarit (ex. "standard") ou proportions { cuisse, tibia, … }.');
  if (objet.couleurs !== undefined) {
    if (!estObjet(objet.couleurs)) erreurs.push('« couleurs » : objet { nom: couleur } (ex. { "peau": "#F2C9A0" }).');
    else for (const [n, c] of Object.entries(objet.couleurs)) {
      if (!NOM_COULEUR.test(n)) erreurs.push(`couleur « ${n} » : nom invalide (minuscules, chiffres, tirets).`);
      else if (typeof c !== 'string' || !COULEUR.test(c)) erreurs.push(`couleur « ${n} » : « ${c} » n'est pas une couleur (ex. #F2C9A0).`);
    }
  }
  const connus = [...PIECES, ...os];
  const plume = objet.maniere === 'plume';
  if (plume) {
    // Manière plume : l'habillage trace membres, corps et tête ; aucune pièce dessinée, aucun visage.
    for (const k of ['pieces', 'accessoires', 'visage']) {
      if (objet[k] !== undefined) erreurs.push(`« ${k} » : un dessin de la manière « plume » n'en a pas (${k === 'visage' ? 'figures sans visage : le caractère vient des cheveux, du chapeau et de la silhouette' : 'le corps est tracé par l\'habillage plume ; vêtements dans « vetements », objets dans « plume.objets »'}).`);
    }
    validerPlume(objet, erreurs);
  } else if (objet.plume !== undefined || objet.vetements !== undefined) erreurs.push('« plume » et « vetements » : réservés à la manière « plume » (ajouter "maniere": "plume").');
  if (plume) { /* pièces, accessoires et visage refusés plus haut */ } else if (!estObjet(objet.pieces) || !Object.keys(objet.pieces).length) erreurs.push('« pieces » : il faut au moins une pièce (ex. { "tete": { "profil": "<ellipse …/>" } }).');
  else for (const [n, vues] of Object.entries(objet.pieces)) {
    if (!connus.includes(n)) erreurs.push(`pièce « ${n} » : os inconnu${suggestion(n, connus)}`);
    else verifierVues(vues, `pièce « ${n} » `, erreurs);
  }
  if (objet.accessoires !== undefined && !plume) {
    if (!Array.isArray(objet.accessoires)) erreurs.push('« accessoires » : liste attendue.');
    else objet.accessoires.forEach((a, i) => {
      const ou = `accessoire ${i + 1} « ${a && a.nom} » `;
      if (!estObjet(a)) { erreurs.push(`accessoire ${i + 1} : objet { nom, os, dessins } attendu.`); return; }
      champsInconnus(a, ORDRE_ACCESSOIRE, erreurs, `${ou}: `);
      if (typeof a.nom !== 'string' || !NOM.test(a.nom)) erreurs.push(`${ou}: « nom » en minuscules, chiffres, tirets.`);
      if (!connus.includes(a.os)) erreurs.push(`${ou}: os « ${a.os} » inconnu${suggestion(String(a.os), connus)}`);
      if (a.devant !== undefined && typeof a.devant !== 'boolean') erreurs.push(`${ou}: « devant » vaut true ou false.`);
      verifierVues(a.dessins, ou, erreurs);
    });
  }
  if (objet.visage !== undefined && !plume) validerVisage(objet.visage, erreurs);
  if (objet.maniere !== undefined && !MANIERES.includes(objet.maniere)) erreurs.push(`« maniere » : « ${objet.maniere} » inconnue (traits, pieces ou plume).`);
  if (objet.batonnets !== undefined) validerBatonnets(objet, erreurs);
}

/** Réglage plume (traits, remplissages, cheveux, chapeau, objets) et vêtements d'un dessin de la manière « plume ». Formes :
 *  celles de l'habillage (moteur/habillage-plume.js, FORMES). Remplissage : papier, encre ou une couleur du dessin. */
function validerPlume(objet, erreurs) {
  const couleurs = estObjet(objet.couleurs) ? objet.couleurs : {};
  const remplissage = (v, ou) => {
    if (v !== undefined && v !== 'papier' && v !== 'encre' && !(typeof v === 'string' && Object.hasOwn(couleurs, v))) erreurs.push(`${ou} : remplissage « ${v} » : papier, encre ou une couleur du dessin (« couleurs »).`);
  };
  const forme = (x, liste, ou, champs) => {
    if (!estObjet(x)) { erreurs.push(`${ou} : objet { ${champs.join(', ')} } attendu.`); return false; }
    champsInconnus(x, champs, erreurs, `${ou} : `);
    if (!liste.includes(x.forme)) erreurs.push(`${ou} : forme « ${x.forme} » inconnue (${liste.join(', ')}).`);
    remplissage(x.remplissage, ou);
    return true;
  };
  const p = objet.plume;
  if (p !== undefined && !estObjet(p)) erreurs.push(`« plume » : objet { ${ORDRE_PLUME.join(', ')} } attendu.`);
  else if (p !== undefined) {
    champsInconnus(p, ORDRE_PLUME, erreurs, 'plume : ');
    if (p.traits !== undefined && p.traits !== 1 && p.traits !== 2) erreurs.push('plume : « traits » vaut 1 (un trait par membre) ou 2 (deux traits, du papier entre eux).');
    if (p.remplissages !== undefined) {
      if (!estObjet(p.remplissages)) erreurs.push(`plume : « remplissages » : objet { ${PARTIES_PLUME.join(', ')} } attendu.`);
      else {
        champsInconnus(p.remplissages, PARTIES_PLUME, erreurs, 'plume, remplissages : ');
        for (const [k, v] of Object.entries(p.remplissages)) remplissage(v, `plume, remplissage « ${k} »`);
      }
    }
    if (p.cheveux !== undefined) forme(p.cheveux, FORMES_PLUME.cheveux, 'plume, cheveux', ['forme', 'remplissage']);
    if (p.chapeau !== undefined) forme(p.chapeau, FORMES_PLUME.chapeau, 'plume, chapeau', ['forme', 'remplissage']);
    if (p.objets !== undefined && !Array.isArray(p.objets)) erreurs.push('plume : « objets » : liste attendue (ex. [{ "forme": "mallette", "main": "Avant" }]).');
    else if (p.objets !== undefined) {
      const mains = [];
      p.objets.forEach((o, i) => {
        if (!forme(o, FORMES_PLUME.objets, `plume, objet ${i + 1}`, ['forme', 'main', 'remplissage'])) return;
        const main = o.main === undefined ? 'Avant' : o.main;
        if (!FORMES_PLUME.mains.includes(main)) erreurs.push(`plume, objet ${i + 1} : « main » : ${FORMES_PLUME.mains.join(' ou ')}.`);
        else if (mains.includes(main)) erreurs.push(`plume, objet ${i + 1} : la main ${main} porte déjà un objet.`);
        else mains.push(main);
      });
    }
  }
  const v = objet.vetements;
  if (v !== undefined && !Array.isArray(v)) erreurs.push('« vetements » : liste attendue (ex. [{ "forme": "manteau" }]).');
  else if (v !== undefined) {
    const vus = [];
    v.forEach((x, i) => {
      if (!forme(x, FORMES_PLUME.vetements, `vêtement ${i + 1}`, ['forme', 'remplissage'])) return;
      if (vus.includes(x.forme)) erreurs.push(`vêtement ${i + 1} : « ${x.forme} » est déjà porté.`);
      vus.push(x.forme);
    });
    if (vus.includes('manteau') && vus.includes('robe')) erreurs.push('« vetements » : un seul vêtement long (manteau ou robe).');
  }
}

/** Réglage bâtonnets équivalent d'un dessin « traits » : chaque couleur des bâtonnets nomme une couleur du dessin. */
function validerBatonnets(objet, erreurs) {
  const b = objet.batonnets;
  if (objet.maniere !== 'traits') erreurs.push('« batonnets » : réglage réservé à la manière « traits » (ajouter "maniere": "traits").');
  if (!estObjet(b)) { erreurs.push('« batonnets » : objet { couleurs, epaisseur } attendu.'); return; }
  champsInconnus(b, ORDRE_BATONNETS, erreurs, 'batonnets : ');
  if (b.couleurs !== undefined) {
    if (!estObjet(b.couleurs)) erreurs.push('« batonnets.couleurs » : objet { corps: "<couleur du dessin>" } attendu.');
    else for (const [k, v] of Object.entries(b.couleurs)) {
      if (!COULEURS_BATONNETS.includes(k)) erreurs.push(`batonnets, couleur « ${k} » inconnue (${COULEURS_BATONNETS.join(', ')}).`);
      else if (!(estObjet(objet.couleurs) && Object.hasOwn(objet.couleurs, v))) erreurs.push(`batonnets, couleur « ${k} » : « ${v} » n'est pas une couleur du dessin (« couleurs »).`);
    }
  }
  if (b.epaisseur !== undefined && !(estNombre(b.epaisseur) && b.epaisseur >= 4 && b.epaisseur <= 30)) erreurs.push('« batonnets.epaisseur » : de 4 à 30 (ex. 14).');
}

/** Apparence des bâtonnets d'un dessin « traits » (M.batonnets.creer) : couleurs du dessin, épaisseur ; null sans réglage. */
function apparenceBatonnets(dessin) {
  if (!dessin || !estObjet(dessin.batonnets)) return null;
  const couleurs = {};
  for (const [k, v] of Object.entries(dessin.batonnets.couleurs || {})) if (dessin.couleurs && dessin.couleurs[v]) couleurs[k] = dessin.couleurs[v];
  const r = { couleurs };
  if (dessin.batonnets.epaisseur !== undefined) r.epaisseur = dessin.batonnets.epaisseur;
  return r;
}

const SELECTEUR = /^(#[^\s'"<>]+|([A-Za-z][\w-]*?\d+>)*[A-Za-z][\w-]*?\d+)$/;
const CENTRES = ['tete', 'bassin'];

/** Découpe d'un SVG existant (personnages/decoupes/<nom>.json) : validée sans ouvrir le SVG. */
function validerDecoupe(objet, contexte, erreurs) {
  champsInconnus(objet, ORDRE.decoupe, erreurs);
  verifierNom(objet, contexte, erreurs);
  if (typeof objet.source !== 'string' || !/^assets\/[^\\]+\.svg$/i.test(objet.source) || objet.source.split('/').includes('..')) erreurs.push('« source » : fichier SVG dans assets/ de la vidéo (ex. "assets/cuisinier.svg").');
  if (!VUES.includes(objet.vue)) erreurs.push(`« vue » : ${VUES.join(', ')}.`);
  if (objet.gabarit !== undefined && !(contexte.gabarits || []).includes(objet.gabarit)) erreurs.push(`gabarit « ${objet.gabarit} » introuvable (gabarits : ${(contexte.gabarits || []).join(', ')}).`);
  if (objet.couleurs !== undefined && !(estObjet(objet.couleurs) && Object.entries(objet.couleurs).every(([h, n]) => /^#[0-9a-f]{6}$/i.test(h) && NOM_COULEUR.test(n)))) erreurs.push('« couleurs » : { "#RRGGBB": "nom" } (ex. { "#F2C9A0": "peau" }).');
  const vus = new Map();
  const formes = (liste, ou) => {
    if (!Array.isArray(liste) || !liste.length) { erreurs.push(`${ou} : « formes » : liste de sélecteurs (ex. ["#jambe", "g2>path3"]).`); return; }
    for (const sel of liste) {
      if (typeof sel !== 'string' || !SELECTEUR.test(sel)) erreurs.push(`${ou} : sélecteur « ${sel} » illisible (« #id » ou « g2>path3 »).`);
      else if (vus.has(sel)) erreurs.push(`${ou} : la forme « ${sel} » est déjà dans ${vus.get(sel)}.`);
      else vus.set(sel, ou);
    }
  };
  if (!estObjet(objet.os) || !Object.keys(objet.os).length) erreurs.push('« os » : au moins un os (ex. { "torse": { "formes": ["#veste"], "de": [200, 400], "a": [200, 280] } }).');
  else for (const [n, def] of Object.entries(objet.os)) {
    const ou = `os « ${n} »`;
    if (!PIECES.includes(n)) { erreurs.push(`${ou} : inconnu${suggestion(n, PIECES)} (les os en plus ne se découpent pas encore).`); continue; }
    if (!estObjet(def)) { erreurs.push(`${ou} : objet { formes, de, a } attendu.`); continue; }
    formes(def.formes, ou);
    if (CENTRES.includes(n)) { if (!estPosition(def.centre)) erreurs.push(`${ou} : « centre » : position [x, y] dans le SVG.`); }
    else {
      if (!estPosition(def.de) || !estPosition(def.a)) erreurs.push(`${ou} : « de » et « a » : positions [x, y] dans le SVG (pivot, puis bout de l'os).`);
      else if (Math.hypot(def.a[0] - def.de[0], def.a[1] - def.de[1]) < 1e-6) erreurs.push(`${ou} : « de » et « a » confondus.`);
    }
  }
  if (objet.visage !== undefined) {
    const v = objet.visage;
    if (!estObjet(v)) erreurs.push('« visage » : objet { yeux, bouche } attendu.');
    else {
      if (!Array.isArray(v.yeux) || !v.yeux.length || !v.yeux.every((y) => estObjet(y) && typeof y.blanc === 'string' && SELECTEUR.test(y.blanc) && (y.pupille === undefined || (typeof y.pupille === 'string' && SELECTEUR.test(y.pupille))))) erreurs.push('visage : « yeux » : liste de { "blanc": "#oeil", "pupille": "#pupille" }.');
      if (v.bouche !== undefined && !(typeof v.bouche === 'string' && SELECTEUR.test(v.bouche))) erreurs.push('visage : « bouche » : un sélecteur (ex. "#bouche").');
      if (!estObjet(objet.os) || !objet.os.tete) erreurs.push('visage : il faut l\'os « tete » (avec son « centre »).');
    }
  }
  if (objet.ignorer !== undefined && !(Array.isArray(objet.ignorer) && objet.ignorer.every((x) => typeof x === 'string' && SELECTEUR.test(x)))) erreurs.push('« ignorer » : liste de sélecteurs.');
}

function validerExpression(objet, contexte, erreurs) {
  champsInconnus(objet, ORDRE.expression, erreurs);
  verifierNom(objet, contexte, erreurs);
  verifierChoix({ bouche: objet.bouche }, '', contexte, erreurs);
  if (objet.clignement !== undefined) {
    const c = objet.clignement;
    if (!estObjet(c)) erreurs.push('« clignement » : { "intervalle": [3, 4], "lenteur": 1 } (rythme des clignements de cette expression).');
    else {
      champsInconnus(c, ['intervalle', 'lenteur'], erreurs, 'clignement : ');
      const i = c.intervalle;
      if (i !== undefined && !(Array.isArray(i) && i.length === 2 && i.every(estNombre) && i[0] >= 1.5 && i[0] <= i[1] && i[1] <= 8)) erreurs.push('« clignement.intervalle » : deux durées en secondes, de 1,5 à 8 (ex. [3, 4]).');
      if (c.lenteur !== undefined && !(estNombre(c.lenteur) && c.lenteur >= 0.7 && c.lenteur <= 2)) erreurs.push('« clignement.lenteur » : de 0,7 à 2 (1 = vitesse normale, 1.4 = plus lent).');
    }
  }
  const a = objet.angles === undefined ? {} : objet.angles;
  if (!estObjet(a)) { erreurs.push('« angles » doit être un objet (ex. { "sourcilsY": 4 }).'); return; }
  for (const [n, v] of Object.entries(a)) {
    if (!ANGLES_VISAGE.includes(n)) erreurs.push(RANG.includes(n) ? `« ${n} » : une expression ne règle que le visage (${ANGLES_VISAGE.join(', ')}).` : `« ${n} » : clé inconnue${suggestion(n, ANGLES_VISAGE)}`);
    else if (!estNombre(v)) erreurs.push(`« ${n} » doit être un nombre.`);
  }
}

function validerPose(objet, contexte, erreurs) {
  champsInconnus(objet, ORDRE.pose, erreurs);
  verifierNom(objet, contexte, erreurs);
  verifierAngles(objet.angles === undefined ? {} : objet.angles, '', contexte, erreurs);
  verifierChoix(objet, '', contexte, erreurs);
}

function validerClip(objet, contexte, erreurs) {
  champsInconnus(objet, ORDRE.clip, erreurs);
  verifierNom(objet, contexte, erreurs);
  if (typeof objet.boucle !== 'boolean') erreurs.push('« boucle » doit valoir true ou false (true pour un cycle comme la marche).');
  if (objet.boucle === true && !(estNombre(objet.duree) && objet.duree > 0)) erreurs.push('« duree » : durée d\'un cycle en secondes, obligatoire pour un clip bouclé (ex. 1).');
  if (objet.boucle === false && objet.duree !== undefined) erreurs.push('« duree » ne sert qu\'aux clips bouclés : la durée d\'un clip ponctuel est le « t » de sa dernière clé.');
  if (objet.foulee !== undefined && !(estNombre(objet.foulee) && objet.foulee >= 0)) erreurs.push('« foulee » doit être un nombre positif (distance par cycle, ex. 248).');
  if (objet.pieds !== undefined && !['au-sol', 'libres'].includes(objet.pieds)) erreurs.push('« pieds » vaut « au-sol » ou « libres ».');
  if (objet.miroir !== undefined && (objet.boucle !== true || !(estNombre(objet.miroir) && objet.miroir > 0 && objet.miroir < 1))) erreurs.push('« miroir » : décalage de phase entre 0 et 1 (ex. 0.5), seulement pour un clip bouclé.');
  if (objet.additif !== undefined && typeof objet.additif !== 'boolean') erreurs.push('« additif » doit valoir true ou false.');
  if (objet.additif === true && objet.pieds === 'au-sol') erreurs.push('Un clip additif ne peut pas être « au-sol » : ses valeurs sont des différences.');
  if (objet.lissage !== undefined && !['par-cle', 'continu'].includes(objet.lissage)) erreurs.push('« lissage » : « continu » (les poses s\'enchaînent sans s\'arrêter) ou « par-cle ».');
  if (objet.contacts !== undefined) {
    if (objet.boucle !== false) erreurs.push('« contacts » ne sert qu\'aux mouvements ponctuels (instants où les pieds retouchent le sol, en secondes).');
    else if (!(Array.isArray(objet.contacts) && objet.contacts.every((c) => estNombre(c) && c >= 0))) erreurs.push('« contacts » : liste d\'instants en secondes où les pieds retouchent le sol (ex. [0.936]).');
  }
  if (!Array.isArray(objet.cles) || objet.cles.length === 0) { erreurs.push('« cles » : il faut au moins une clé (ex. [{ "t": 0, "pose": "debout" }]).'); return; }
  let precedent = -Infinity;
  const derniere = objet.cles[objet.cles.length - 1];
  if (objet.boucle === false && estObjet(derniere) && estNombre(derniere.t) && derniere.t <= 0) erreurs.push('Un clip ponctuel dure jusqu\'à sa dernière clé : il faut au moins une clé après 0 (ex. « t »: 0.5).');
  objet.cles.forEach((cle, i) => {
    const ou = `clé ${i + 1} : `;
    if (!estObjet(cle)) { erreurs.push(`${ou}doit être un objet { t, pose?, angles?, courbe? }.`); return; }
    champsInconnus(cle, ORDRE_CLE, erreurs, ou);
    if (!estNombre(cle.t)) erreurs.push(`${ou}« t » doit être un nombre.`);
    else {
      if (objet.boucle === true && (cle.t < 0 || cle.t > 1)) erreurs.push(`${ou}« t » vaut ${cle.t}, hors de [0, 1] (phase d'un clip bouclé).`);
      if (objet.boucle === false && cle.t < 0) erreurs.push(`${ou}« t » vaut ${cle.t} : les secondes d'un clip ponctuel commencent à 0.`);
      if (arrondir(cle.t) <= precedent) erreurs.push(`${ou}les clés doivent être rangées par « t » croissant, sans doublon (au millième près).`);
      precedent = arrondir(cle.t);
    }
    if (cle.pose === undefined && cle.angles === undefined && cle.bouche === undefined && cle.expression === undefined) erreurs.push(`${ou}il faut une « pose », des « angles », une « bouche » ou une « expression ».`);
    if (objet.additif === true && (cle.bouche !== undefined || cle.expression !== undefined)) erreurs.push(`${ou}un calque additif ne choisit ni bouche ni expression.`);
    verifierChoix(cle, ou, contexte, erreurs);
    if (cle.pose !== undefined && objet.additif === true) erreurs.push(`${ou}un clip additif ne cite pas de pose (ses valeurs sont des différences) : donner des « angles ».`);
    else if (cle.pose !== undefined && !(contexte.poses || []).includes(cle.pose)) erreurs.push(`${ou}pose « ${cle.pose} » introuvable (poses connues : ${(contexte.poses || []).join(', ')}).`);
    if (cle.angles !== undefined) verifierAngles(cle.angles, ou, contexte, erreurs);
    if (cle.courbe !== undefined) {
      try { C.courbeNommee(String(cle.courbe)); } catch { erreurs.push(`${ou}courbe « ${cle.courbe} » inconnue (exemples : linear, sine-inout, back-out, bounce-out).`); }
    }
  });
}

function validerGabarit(objet, contexte, erreurs) {
  champsInconnus(objet, ORDRE.gabarit, erreurs);
  verifierNom(objet, contexte, erreurs);
  for (const k of LONGUEURS) if (objet[k] !== undefined && !(estNombre(objet[k]) && objet[k] > 0)) erreurs.push(`« ${k} » doit être un nombre positif (ex. ${S.GABARIT[k]}).`);
  for (const k of DEMI) if (objet[k] !== undefined && !(estNombre(objet[k]) && objet[k] >= 0)) erreurs.push(`« ${k} » doit être un nombre positif ou nul (ex. ${S.GABARIT[k]}).`);
  if (objet.vie !== undefined) {
    if (!estObjet(objet.vie)) erreurs.push('« vie » : { "retard": 0.1, "force": 0.45 } (combien les bouts des membres arrivent après le corps).');
    else {
      champsInconnus(objet.vie, ['retard', 'force'], erreurs, 'vie : ');
      if (objet.vie.retard !== undefined && !(estNombre(objet.vie.retard) && objet.vie.retard >= 0.06 && objet.vie.retard <= 0.15)) erreurs.push('« vie.retard » : entre 0,06 et 0,15 s (ex. 0.1).');
      if (objet.vie.force !== undefined && !(estNombre(objet.vie.force) && objet.vie.force >= 0.3 && objet.vie.force <= 0.6)) erreurs.push('« vie.force » : entre 0,3 et 0,6 (ex. 0.45).');
    }
  }
  if (objet.tete !== undefined) {
    if (!estObjet(objet.tete)) erreurs.push('« tete » doit être un objet { rx, ry } (ex. { "rx": 34, "ry": 50 }).');
    else for (const k of ['rx', 'ry']) if (objet.tete[k] !== undefined && !(estNombre(objet.tete[k]) && objet.tete[k] > 0)) erreurs.push(`« tete.${k} » doit être un nombre positif (ex. ${S.GABARIT.tete[k]}).`);
  }
  const os = objet.osEnPlus === undefined ? [] : objet.osEnPlus;
  if (!Array.isArray(os)) erreurs.push('« osEnPlus » doit être une liste.');
  const vus = [];
  (Array.isArray(os) ? os : []).forEach((o, i) => {
    const ou = `os en plus ${i + 1} : `;
    if (!estObjet(o)) { erreurs.push(`${ou}doit être un objet { nom, parent, longueur, … }.`); return; }
    champsInconnus(o, ORDRE_OS, erreurs, ou);
    if (typeof o.nom !== 'string' || !NOM_OS.test(o.nom)) erreurs.push(`${ou}« nom » : lettres et chiffres, commence par une minuscule (ex. queue).`);
    else if (o.nom in S.REPOS) erreurs.push(`${ou}« ${o.nom} » est déjà un nom de la pose : choisir un autre nom.`);
    else if (S.RESERVES.includes(o.nom)) erreurs.push(`${ou}« ${o.nom} » est déjà le nom d'une articulation du squelette : choisir un autre nom (ex. queue, oreille, cape).`);
    else if (vus.includes(o.nom)) erreurs.push(`${ou}« ${o.nom} » est déclaré deux fois.`);
    else vus.push(o.nom);
    if (!PARENTS.includes(o.parent)) erreurs.push(`${ou}parent « ${o.parent} » inconnu (bassin, torse ou tete).`);
    if (o.attache !== undefined && !(Array.isArray(o.attache) && o.attache.length === 3 && o.attache.every(estNombre))) erreurs.push(`${ou}« attache » : décalage [x, y, z] (ex. [-4, -4, 0]).`);
    if (o.angle !== undefined && !estNombre(o.angle)) erreurs.push(`${ou}« angle » doit être un nombre (ex. 120).`);
    if (!(estNombre(o.longueur) && o.longueur > 0)) erreurs.push(`${ou}« longueur » doit être un nombre positif (ex. 40).`);
    for (const k of ['raideur', 'amorti']) if (o[k] !== undefined && !(estNombre(o[k]) && o[k] >= 0 && o[k] <= 1)) erreurs.push(`${ou}« ${k} » doit être entre 0 et 1.`);
  });
  if (objet.contraintes !== undefined) {
    if (!estObjet(objet.contraintes)) erreurs.push('« contraintes » doit être un objet { angle: [min, max] }.');
    else {
      const connus = [...Object.keys(S.LIMITES), ...S.NOMS.os, ...vus];
      for (const [k, v] of Object.entries(objet.contraintes)) {
        if (!connus.includes(k)) erreurs.push(`contrainte « ${k} » inconnue${suggestion(k, connus)}`);
        else if (!(Array.isArray(v) && v.length === 2 && v.every(estNombre) && v[0] <= v[1])) erreurs.push(`contrainte « ${k} » : [min, max] avec min ≤ max (ex. [-150, 0]).`);
      }
    }
  }
}

/** -> messages d'erreur (vide si valide). contexte : { nom, poses: [noms], osEnPlus: [noms] } */
function valider(type, objet, contexte) {
  const erreurs = [];
  if (!estObjet(objet)) return [`Le fichier doit contenir un objet JSON ({ … }).`];
  if (type === 'pose') validerPose(objet, contexte, erreurs);
  else if (type === 'clip') validerClip(objet, contexte, erreurs);
  else if (type === 'gabarit') validerGabarit(objet, contexte, erreurs);
  else if (type === 'expression') validerExpression(objet, contexte, erreurs);
  else if (type === 'dessin') validerDessin(objet, contexte, erreurs);
  else if (type === 'decoupe') validerDecoupe(objet, contexte, erreurs);
  else erreurs.push(`Type « ${type} » inconnu (pose, clip, gabarit, expression, dessin ou découpe).`);
  return erreurs;
}

function contexteDe(lu) {
  const os = new Set();
  const osParGabarit = {};
  for (const [nom, g] of Object.entries(lu.gabarits || {})) {
    osParGabarit[nom] = (g.osEnPlus || []).map((o) => o.nom);
    for (const o of g.osEnPlus || []) os.add(o.nom);
  }
  return { poses: Object.keys(lu.poses || {}), osEnPlus: [...os].sort(), gabarits: Object.keys(lu.gabarits || {}), osParGabarit, expressions: Object.keys(lu.expressions || {}) };
}

/** Gabarit d'un dessin : nommé (bibliothèque), en ligne, ou standard. */
function gabaritDe(dessin, lu) {
  if (dessin && estObjet(dessin.gabarit)) return dessin.gabarit;
  const nom = dessin && typeof dessin.gabarit === 'string' ? dessin.gabarit : 'standard';
  return (lu.gabarits || {})[nom] || {};
}

function nomsJSON(dossier) {
  try { return fs.readdirSync(dossier).filter((f) => /^[a-z0-9-]+\.json$/.test(f)).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
}

/** personnel : dossier des personnages de la bibliothèque personnelle (~/.pulse-motion/personnages), lu entre le plugin et la
 *  vidéo (source « personnel »), seulement pour proposer, montrer et copier (liste, afficher, planche, verifier) : jamais
 *  par l'assemblage, la vidéo reste autonome (chantier H, décision « par copie »). */
function lire(dossierVideo, { bibliotheque = BIBLIOTHEQUE, personnel = null } = {}) {
  const vide = () => ({ poses: {}, clips: {}, gabarits: {}, expressions: {}, dessins: {}, decoupes: {} });
  const lu = Object.assign(vide(), { sources: vide(), fichiers: vide(), erreurs: [] });
  const racines = [[bibliotheque, 'plugin', 'bibliothèque']];
  if (personnel) racines.push([personnel, 'personnel', 'bibliothèque personnelle']);
  if (dossierVideo) racines.push([path.join(dossierVideo, 'personnages'), 'video', 'vidéo']);
  for (const type of ['gabarit', 'expression', 'pose', 'clip', 'dessin', 'decoupe']) {
    const pluriel = TYPES[type];
    for (const [racine, source, libelle] of racines) {
      for (const nom of nomsJSON(path.join(racine, pluriel))) {
        const fichier = path.join(racine, pluriel, `${nom}.json`);
        const ou = `personnages/${pluriel}/${nom}.json (${libelle}) : `;
        let objet;
        try { objet = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch (e) {
          lu.erreurs.push({ type, nom, source, fichier, message: `${ou}JSON invalide (${e.message}).` });
          continue;
        }
        const erreurs = valider(type, objet, Object.assign({ nom }, contexteDe(lu)));
        if (erreurs.length) {
          for (const m of erreurs) lu.erreurs.push({ type, nom, source, fichier, message: ou + m });
          continue;
        }
        lu[pluriel][nom] = Object.assign({}, objet, { nom });
        lu.sources[pluriel][nom] = source;
        lu.fichiers[pluriel][nom] = fichier;
      }
    }
  }
  lu.demarches = lireDemarches(racines, lu.erreurs);
  return lu;
}

/** Réglages des démarches calculées (personnages/clips/demarches/), à nom égal la vidéo l'emporte. */
function lireDemarches(racines, erreurs) {
  const out = {};
  for (const [racine, source, libelle] of racines) {
    const dossier = path.join(racine, 'clips', 'demarches');
    for (const nom of nomsJSON(dossier)) {
      const fichier = path.join(dossier, `${nom}.json`);
      const ou = `personnages/clips/demarches/${nom}.json (${libelle}) : `;
      let objet;
      try { objet = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch (e) { erreurs.push({ type: 'demarche', nom, source, fichier, message: `${ou}JSON invalide (${e.message}).` }); continue; }
      const fautes = [];
      if (estObjet(objet)) {
        champsInconnus(objet, ['nom', 'description', 'genre', 'foulee', 'periode', 'appui'], fautes);
        verifierNom(objet, { nom }, fautes);
      }
      fautes.push(...D.valider(objet));
      if (fautes.length) { for (const m of fautes) erreurs.push({ type: 'demarche', nom, source, fichier, message: ou + m }); continue; }
      out[nom] = Object.assign({}, objet, { nom });
    }
  }
  return out;
}

/* ---------- écriture stable ---------- */

function ordonner(objet, ordre) {
  const o = {};
  for (const k of ordre) if (objet[k] !== undefined) o[k] = objet[k];
  for (const k of Object.keys(objet).sort()) if (!(k in o) && objet[k] !== undefined) o[k] = objet[k];
  return o;
}

function angles(a) {
  const cles = Object.keys(a).sort((x, y) => {
    const i = RANG.indexOf(x), j = RANG.indexOf(y);
    if (i >= 0 && j >= 0) return i - j;
    if (i >= 0) return -1;
    if (j >= 0) return 1;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const o = {};
  for (const k of cles) o[k] = arrondir(a[k]);
  return o;
}

function profond(v) {
  if (Array.isArray(v)) return v.map(profond);
  if (estObjet(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = profond(v[k]); return o; }
  return arrondir(v);
}

function serialiser(type, objet) {
  const o = ordonner(objet, ORDRE[type]);
  if (type === 'pose') o.angles = angles(o.angles || {});
  if (type === 'clip' && Array.isArray(o.cles)) {
    o.cles = o.cles.map((c) => {
      const cle = ordonner(c, ORDRE_CLE);
      if (cle.t !== undefined) cle.t = arrondir(cle.t);
      if (cle.angles) cle.angles = angles(cle.angles);
      return cle;
    });
  }
  if (type === 'clip') for (const k of ['duree', 'foulee', 'miroir']) if (o[k] !== undefined) o[k] = arrondir(o[k]);
  if (type === 'clip' && Array.isArray(o.contacts)) o.contacts = o.contacts.map(arrondir);
  if (type === 'gabarit') {
    for (const k of Object.keys(o)) if (!['osEnPlus', 'contraintes', 'tete'].includes(k)) o[k] = profond(o[k]);
    if (o.tete) o.tete = profond(ordonner(o.tete, ['rx', 'ry']));
    if (o.osEnPlus) o.osEnPlus = o.osEnPlus.map((x) => profond(ordonner(x, ORDRE_OS)));
    if (o.contraintes) o.contraintes = profond(ordonner(o.contraintes, []));
  }
  if (type === 'expression') o.angles = angles(o.angles || {});
  if (type === 'expression' && estObjet(o.clignement)) o.clignement = profond(ordonner(o.clignement, ['intervalle', 'lenteur']));
  if (type === 'decoupe') {
    if (estObjet(o.os)) { const r = {}; for (const k of [...PIECES, ...Object.keys(o.os).filter((n) => !PIECES.includes(n)).sort()]) if (o.os[k] !== undefined) r[k] = profond(ordonner(o.os[k], ['formes', 'de', 'a', 'centre'])); o.os = r; }
    if (estObjet(o.visage)) o.visage = ordonner(o.visage, ['yeux', 'bouche']);
    if (estObjet(o.couleurs)) o.couleurs = ordonner(o.couleurs, []);
  }
  if (type === 'dessin') {
    const vues = (v) => (estObjet(v) ? ordonner(v, VUES) : v);
    const ordrePieces = (p) => { const r = {}; for (const k of [...PIECES, ...Object.keys(p).filter((n) => !PIECES.includes(n)).sort()]) if (p[k] !== undefined) r[k] = vues(p[k]); return r; };
    if (estObjet(o.gabarit)) o.gabarit = JSON.parse(serialiser('gabarit', o.gabarit));
    if (estObjet(o.couleurs)) o.couleurs = ordonner(o.couleurs, []);
    if (estObjet(o.batonnets)) { o.batonnets = ordonner(o.batonnets, ORDRE_BATONNETS); if (estObjet(o.batonnets.couleurs)) o.batonnets.couleurs = ordonner(o.batonnets.couleurs, COULEURS_BATONNETS); }
    if (estObjet(o.plume)) {
      const pl = ordonner(o.plume, ORDRE_PLUME);
      if (estObjet(pl.remplissages)) pl.remplissages = ordonner(pl.remplissages, PARTIES_PLUME);
      for (const k of ['cheveux', 'chapeau']) if (estObjet(pl[k])) pl[k] = ordonner(pl[k], ['forme', 'remplissage']);
      if (Array.isArray(pl.objets)) pl.objets = pl.objets.map((x) => (estObjet(x) ? ordonner(x, ['forme', 'main', 'remplissage']) : x));
      o.plume = pl;
    }
    if (Array.isArray(o.vetements)) o.vetements = o.vetements.map((x) => (estObjet(x) ? ordonner(x, ['forme', 'remplissage']) : x));
    if (estObjet(o.pieces)) o.pieces = ordrePieces(o.pieces);
    if (Array.isArray(o.accessoires)) o.accessoires = o.accessoires.map((a) => { const r = ordonner(a, ORDRE_ACCESSOIRE); r.dessins = vues(r.dessins); return r; });
    if (estObjet(o.visage)) {
      const v = ordonner(o.visage, ORDRE_VISAGE);
      if (estObjet(v.oeil)) v.oeil = profond(ordonner(v.oeil, ORDRE_OEIL));
      if (estObjet(v.bouches)) { const b = {}; for (const k of [...BOUCHES, ...Object.keys(v.bouches).filter((n) => !BOUCHES.includes(n)).sort()]) if (v.bouches[k] !== undefined) b[k] = vues(v.bouches[k]); v.bouches = b; }
      if (estObjet(v.vues)) { const r = ordonner(v.vues, VUES); for (const k of Object.keys(r)) r[k] = profond(ordonner(r[k], ORDRE_VUE_VISAGE)); v.vues = r; }
      o.visage = v;
    }
  }
  return `${JSON.stringify(o, null, 2)}\n`;
}

/** Valide puis écrit <dossier>/<poses|clips|gabarits>/<nom>.json (écriture atomique). lu : résultat de lire() (contexte). */
function enregistrer({ dossier, type, nom, objet, lu, ecrire }) {
  if (!TYPES[type]) throw ErreurPersonnage([`Type « ${type} » inconnu (pose, clip, gabarit, expression ou dessin).`]);
  if (typeof nom !== 'string' || !NOM.test(nom)) throw ErreurPersonnage([`Nom « ${nom} » invalide (minuscules, chiffres, tirets ; ex. gratte-tete).`]);
  const complet = Object.assign({}, objet, { nom });
  const erreurs = valider(type, complet, Object.assign({ nom }, contexteDe(lu || {})));
  if (erreurs.length) throw ErreurPersonnage(erreurs);
  // Validé aussi tel qu'il sera écrit (nombres arrondis) : jamais un fichier que lire() refuserait ensuite.
  const texte = serialiser(type, complet);
  const ecrits = valider(type, JSON.parse(texte), Object.assign({ nom }, contexteDe(lu || {})));
  if (ecrits.length) throw ErreurPersonnage(ecrits);
  const fichier = path.join(dossier, TYPES[type], `${nom}.json`);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  (ecrire || require('./routes-atelier.js').ecrireAtomique)(fichier, texte);
  return { fichier };
}

module.exports = { BIBLIOTHEQUE, TYPES, VUES, PIECES, BOUCHES, ANGLES_VISAGE, MANIERES, COULEURS_BATONNETS, ORDRE_PLUME, valider, lire, contexteDe, gabaritDe, apparenceBatonnets, serialiser, enregistrer, ErreurPersonnage };
