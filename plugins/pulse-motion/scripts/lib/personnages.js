'use strict';
/* Pulse Motion – bibliothèque des personnages : poses, clips et gabarits (JSON) ; lecture, validation, écriture stable.
 *
 *   <plugin>/personnages/{poses,clips,gabarits}/<nom>.json   bibliothèque livrée
 *   <vidéo>/personnages/{poses,clips,gabarits}/<nom>.json    fichiers de la vidéo (à nom égal, ils l'emportent)
 *
 * lire(dossierVideo | null) -> { poses, clips, gabarits, sources, fichiers, erreurs } : un fichier invalide est écarté
 * (la version de la bibliothèque reste, s'il y en a une) et signalé dans erreurs.
 * serialiser(type, objet) : ordre des clés fixe, angles dans l'ordre de REPOS, nombres au millième, indentation 2.
 */
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../moteur/squelette.js');
const C = require('../../moteur/courbes.js');

const RACINE = path.resolve(__dirname, '..', '..');
const BIBLIOTHEQUE = path.join(RACINE, 'personnages');
const TYPES = { pose: 'poses', clip: 'clips', gabarit: 'gabarits' };
const NOM = /^[a-z0-9-]+$/;
const NOM_OS = /^[a-z][a-zA-Z0-9]*$/;
const PARENTS = ['bassin', 'torse', 'tete'];
const LONGUEURS = ['cuisse', 'tibia', 'pied', 'colonne', 'hauteurEpaules', 'baseTete', 'bras', 'avantBras'];
const DEMI = ['demiBassin', 'demiEpaules'];
const RANG = [...S.NOMS.os, ...S.NOMS.expression];
const ORDRE = {
  pose: ['nom', 'description', 'angles'],
  clip: ['nom', 'description', 'boucle', 'duree', 'foulee', 'pieds', 'miroir', 'additif', 'cles'],
  gabarit: ['nom', 'description', ...Object.keys(S.GABARIT)],
};
const ORDRE_CLE = ['t', 'pose', 'angles', 'courbe'];
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

function validerPose(objet, contexte, erreurs) {
  champsInconnus(objet, ORDRE.pose, erreurs);
  verifierNom(objet, contexte, erreurs);
  verifierAngles(objet.angles === undefined ? {} : objet.angles, '', contexte, erreurs);
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
    if (cle.pose === undefined && cle.angles === undefined) erreurs.push(`${ou}il faut une « pose » ou des « angles ».`);
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
  else erreurs.push(`Type « ${type} » inconnu (pose, clip ou gabarit).`);
  return erreurs;
}

function contexteDe(lu) {
  const os = new Set();
  for (const g of Object.values(lu.gabarits || {})) for (const o of g.osEnPlus || []) os.add(o.nom);
  return { poses: Object.keys(lu.poses || {}), osEnPlus: [...os].sort() };
}

function nomsJSON(dossier) {
  try { return fs.readdirSync(dossier).filter((f) => /^[a-z0-9-]+\.json$/.test(f)).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
}

function lire(dossierVideo, { bibliotheque = BIBLIOTHEQUE } = {}) {
  const lu = { poses: {}, clips: {}, gabarits: {}, sources: { poses: {}, clips: {}, gabarits: {} }, fichiers: { poses: {}, clips: {}, gabarits: {} }, erreurs: [] };
  const racines = [[bibliotheque, 'plugin', 'bibliothèque']];
  if (dossierVideo) racines.push([path.join(dossierVideo, 'personnages'), 'video', 'vidéo']);
  for (const type of ['gabarit', 'pose', 'clip']) {
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
  return lu;
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
  if (type === 'gabarit') {
    for (const k of Object.keys(o)) if (!['osEnPlus', 'contraintes', 'tete'].includes(k)) o[k] = profond(o[k]);
    if (o.tete) o.tete = profond(ordonner(o.tete, ['rx', 'ry']));
    if (o.osEnPlus) o.osEnPlus = o.osEnPlus.map((x) => profond(ordonner(x, ORDRE_OS)));
    if (o.contraintes) o.contraintes = profond(ordonner(o.contraintes, []));
  }
  return `${JSON.stringify(o, null, 2)}\n`;
}

/** Valide puis écrit <dossier>/<poses|clips|gabarits>/<nom>.json (écriture atomique). lu : résultat de lire() (contexte). */
function enregistrer({ dossier, type, nom, objet, lu, ecrire }) {
  if (!TYPES[type]) throw ErreurPersonnage([`Type « ${type} » inconnu (pose, clip ou gabarit).`]);
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

module.exports = { BIBLIOTHEQUE, TYPES, valider, lire, contexteDe, serialiser, enregistrer, ErreurPersonnage };
