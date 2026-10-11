'use strict';
/* Pulse Motion – lecture et validation de deroule.json (schéma écrit à la main). */

const fs = require('node:fs');
const path = require('node:path');
const { TYPES } = require('./contrat.js');

const TYPES_SCENE = Object.keys(TYPES);

const GENRES = ['formation', 'produit', 'storytelling', 'social'];
const PARCOURS = ['rapide', 'accompagne'];
const RATIOS = ['16:9', '9:16', '1:1'];
const TRANSITIONS = ['aucune', 'fondu', 'glissement', 'balayage'];
const ID = /^[a-z0-9-]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

// Noms injectés dans le CSS de la page : caractères sûrs seulement.
const CLE = /^[a-z0-9-]+$/;
const POLICE = /^[\p{L}\p{N} _.\/-]+$/u;

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const estTexte = (v) => typeof v === 'string' && v.trim() !== '';
const estPositif = (v) => typeof v === 'number' && isFinite(v) && v > 0;

/** -> liste de messages en français, vide si le déroulé est valide. */
function validerDeroule(d) {
  const err = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['Le déroulé doit être un objet JSON.'];

  if (d.version !== 1) err.push('« version » doit valoir 1.');
  if (!estTexte(d.titre)) err.push('« titre » est obligatoire (texte).');
  if (!GENRES.includes(d.genre)) err.push(`« genre » doit être l'un de : ${GENRES.join(', ')}.`);
  if (!PARCOURS.includes(d.parcours)) err.push(`« parcours » doit être l'un de : ${PARCOURS.join(', ')}.`);
  if (!d.format || !RATIOS.includes(d.format.ratio)) err.push(`« format.ratio » doit être l'un de : ${RATIOS.join(', ')}.`);
  if (d.format && d.format.ips !== undefined && !(Number.isInteger(d.format.ips) && d.format.ips >= 12 && d.format.ips <= 60)) {
    err.push('« format.ips » doit être un entier entre 12 et 60.');
  }
  if (!estTexte(d.style)) err.push('« style » est obligatoire (nom d\'un style du catalogue).');

  if (d.charte !== undefined && !estObjet(d.charte)) err.push('« charte » doit être un objet.');
  else if (d.charte !== undefined) {
    const c = d.charte;
    if (c.couleurs) {
      for (const [nom, val] of Object.entries(c.couleurs)) {
        if (!CLE.test(nom)) err.push(`« charte.couleurs.${nom} » : le nom doit contenir seulement a-z, 0-9 et des tirets.`);
        else if (!HEX.test(val)) err.push(`« charte.couleurs.${nom} » doit être une couleur #rrggbb (reçu : ${JSON.stringify(val)}).`);
      }
    }
    if (c.polices) {
      for (const [nom, val] of Object.entries(c.polices)) {
        if (!CLE.test(nom)) err.push(`« charte.polices.${nom} » : le nom doit contenir seulement a-z, 0-9 et des tirets.`);
        else if (!estTexte(val) || !POLICE.test(val)) err.push(`« charte.polices.${nom} » doit être un nom de police (lettres, chiffres, espaces, tirets) ou un fichier dans assets/.`);
      }
    }
    if (c.logo !== undefined && !estTexte(c.logo)) err.push('« charte.logo » doit être un chemin de fichier dans assets/.');
  }

  if (d.musique !== undefined && !estObjet(d.musique)) err.push('« musique » doit être un objet.');
  else if (d.musique !== undefined) {
    if (!estTexte(d.musique.fichier)) err.push('« musique.fichier » doit être un chemin de fichier dans assets/.');
    if (d.musique.volume !== undefined && !(typeof d.musique.volume === 'number' && d.musique.volume >= 0 && d.musique.volume <= 1)) {
      err.push('« musique.volume » doit être un nombre entre 0 et 1.');
    }
  }

  if (!Array.isArray(d.scenes) || d.scenes.length === 0) {
    err.push('« scenes » doit contenir au moins une scène.');
    return err;
  }
  const vus = new Set();
  d.scenes.forEach((s, i) => {
    const nom = s && estTexte(s.id) ? `scène « ${s.id} »` : `scène n° ${i + 1}`;
    if (!s || typeof s !== 'object') { err.push(`La ${nom} doit être un objet.`); return; }
    if (!estTexte(s.id) || !ID.test(s.id)) err.push(`La ${nom} : « id » doit contenir seulement a-z, 0-9 et des tirets.`);
    else if (vus.has(s.id)) err.push(`La ${nom} : « id » est déjà utilisé par une autre scène.`);
    else vus.add(s.id);
    if (!estTexte(s.fichier)) err.push(`La ${nom} : « fichier » est obligatoire (ex. scenes/01-intro.html).`);
    if (!estPositif(s.duree)) err.push(`La ${nom} : « duree » doit être un nombre de secondes supérieur à 0.`);
    if (s.rythme !== undefined && !estPositif(s.rythme)) err.push(`La ${nom} : « rythme » doit être un nombre supérieur à 0.`);
    if (!s.textes || typeof s.textes !== 'object' || Array.isArray(s.textes)) err.push(`La ${nom} : « textes » doit être un objet { clé: texte }.`);
    else for (const [k, v] of Object.entries(s.textes)) {
      if (typeof v !== 'string') err.push(`La ${nom} : « textes.${k} » doit être un texte.`);
    }
    if (s.transition !== undefined && !TRANSITIONS.includes(s.transition)) {
      err.push(`La ${nom} : « transition » doit être l'une de : ${TRANSITIONS.join(', ')}.`);
    }
    if (s.type !== undefined && !TYPES_SCENE.includes(s.type)) {
      err.push(`La ${nom} : « type » doit être l'un de : ${TYPES_SCENE.join(', ')} (ou absent pour une scène composée librement).`);
    }
  });
  return err;
}

/** Lit et valide <dossier>/deroule.json. -> { deroule, erreurs } */
function lireDeroule(dossier) {
  const fichier = path.join(dossier, 'deroule.json');
  let brut;
  try { brut = fs.readFileSync(fichier, 'utf8'); } catch {
    return { deroule: null, erreurs: [`Fichier introuvable : ${fichier}`] };
  }
  let d;
  try { d = JSON.parse(brut.replace(/^\uFEFF/, '')); } catch (e) {
    return { deroule: null, erreurs: [`deroule.json n'est pas un JSON valide : ${e.message}`] };
  }
  return { deroule: d, erreurs: validerDeroule(d) };
}

module.exports = { validerDeroule, lireDeroule, GENRES, PARCOURS, RATIOS, TRANSITIONS, TYPES_SCENE };
