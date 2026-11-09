'use strict';
/* Pulse Motion – la relecture par l'agent critique (spec « Regard et réalisation », exigence 5.5) : empreinte de la page
 * relue, schéma de sortie/regard/critique.json, et état de la relecture d'une vidéo (à jour ou non).
 *
 *   empreintePage(html)                 -> 16 caractères hexadécimaux (SHA-256 de la page assemblée)
 *   validerCritique(c, { scenes? })     -> [messages] (vide : valide)
 *   etatRelecture(projet, { html? })    -> null (pas de relecture) | { verdict, plusFaible, aJour, empreinte, erreurs }
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SEUILS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seuils.json'), 'utf8'));

/** Les huit axes de la grille du critique (agents/critique.md, realisation.md § 13), dans l'ordre. */
const AXES = ['message', 'ouverture', 'lisibilite', 'composition', 'mouvement', 'rythme', 'continuite', 'verite'];
const GRAVITES = ['a-corriger', 'souhaitable', 'detail'];
const VERDICTS = ['prete', 'encore-un-tour'];

const empreintePage = (html) => crypto.createHash('sha256').update(String(html)).digest('hex').slice(0, 16);

const estTexte = (x) => typeof x === 'string' && x.trim().length > 0;
const estObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const estNote = (x) => Number.isInteger(x) && x >= 1 && x <= 10;

/** Fichier de la relecture d'un projet. */
const fichierCritique = (projet) => path.join(projet, 'sortie', 'regard', 'critique.json');

/**
 * Schéma de critique.json : axes connus, notes de 1 à 10 ou null (« invérifiable »), défauts classés, verdict cohérent
 * avec la barre (`critiqueBarre`) : « prete » si chaque axe noté l'atteint et qu'aucun défaut n'est « a-corriger ».
 * scenes : ids des scènes de la vidéo (facultatif) ; chaque scène citée doit en être.
 */
function validerCritique(c, { scenes = null } = {}) {
  if (!estObjet(c)) return ['critique.json doit être un objet.'];
  const err = [];
  const connue = (id) => !scenes || scenes.includes(id);
  if (c.version !== 1) err.push('« version » doit valoir 1.');
  if (!estTexte(c.empreinte)) err.push('« empreinte » est obligatoire (celle de la fiche).');
  for (const k of ['message', 'messagePrevu']) if (!estTexte(c[k])) err.push(`« ${k} » est obligatoire (une phrase).`);
  if (c.ecart !== undefined && typeof c.ecart !== 'string') err.push('« ecart » doit être un texte.');
  if (!estObjet(c.axes)) err.push(`« axes » doit être un objet : ${AXES.join(', ')}.`);
  else {
    for (const k of Object.keys(c.axes)) if (!AXES.includes(k)) err.push(`Axe inconnu : « ${k} ».`);
    for (const k of AXES) {
      const a = c.axes[k];
      if (!estObjet(a)) { err.push(`L'axe « ${k} » manque.`); continue; }
      if (a.note !== null && !estNote(a.note)) err.push(`« axes.${k}.note » doit être un entier de 1 à 10, ou null (invérifiable).`);
      if (!estTexte(a.preuve)) err.push(`« axes.${k}.preuve » est obligatoire (scène, instant, ce qu'on voit ; ou « invérifiable »).`);
    }
  }
  if (!Array.isArray(c.scenes)) err.push('« scenes » doit être une liste { id, note, raison }.');
  else c.scenes.forEach((s, i) => {
    if (!estObjet(s) || !estTexte(s.id) || !estNote(s.note) || !estTexte(s.raison)) err.push(`« scenes[${i}] » : id, note de 1 à 10 et raison.`);
    else if (!connue(s.id)) err.push(`« scenes[${i}].id » : la scène « ${s.id} » n'existe pas.`);
  });
  if (!Array.isArray(c.defauts)) err.push('« defauts » doit être une liste.');
  else c.defauts.forEach((d, i) => {
    if (!estObjet(d)) { err.push(`« defauts[${i}] » doit être un objet.`); return; }
    if (!GRAVITES.includes(d.gravite)) err.push(`« defauts[${i}].gravite » : ${GRAVITES.join(', ')}.`);
    if (!estTexte(d.scene) || !connue(d.scene)) err.push(`« defauts[${i}].scene » : l'id d'une scène de la vidéo.`);
    if (!(typeof d.instant === 'number' && isFinite(d.instant) && d.instant >= 0)) err.push(`« defauts[${i}].instant » : un nombre de secondes.`);
    for (const k of ['symptome', 'mecanisme', 'correction']) if (!estTexte(d[k])) err.push(`« defauts[${i}].${k} » est obligatoire.`);
  });
  if (!VERDICTS.includes(c.verdict)) err.push(`« verdict » : ${VERDICTS.join(' ou ')}.`);
  if (c.plusFaible !== undefined && c.plusFaible !== null && !(estTexte(c.plusFaible) && connue(c.plusFaible))) err.push('« plusFaible » : l\'id d\'une scène de la vidéo.');
  if (c.inverifiable !== undefined && !(Array.isArray(c.inverifiable) && c.inverifiable.every(estTexte))) err.push('« inverifiable » doit être une liste de textes.');
  // Le verdict suit la barre : une note embellie se voit.
  if (!err.length) {
    const notes = AXES.map((k) => c.axes[k].note).filter((n) => n !== null);
    const prete = notes.every((n) => n >= SEUILS.critiqueBarre) && !c.defauts.some((d) => d.gravite === 'a-corriger');
    if ((c.verdict === 'prete') !== prete) {
      err.push(prete ? '« verdict » : chaque axe atteint la barre et aucun défaut n\'est à corriger, la vidéo est « prete ».'
        : `« verdict » : « prete » exige chaque axe noté à ${SEUILS.critiqueBarre} au moins et aucun défaut « a-corriger ».`);
    }
  }
  return err;
}

/** Page actuelle de la vidéo, assemblée comme la planche de regard l'assemble (sans l'écrire), ou null. */
function pageActuelle(projet) {
  try {
    const r = require('../assembler.js').assembler({ dossier: projet, ecrire: false });
    return r.ok ? r.html : null;
  } catch { return null; }
}

/**
 * État de la relecture : null s'il n'y en a pas ; sinon son verdict, sa scène la plus faible, et si elle porte
 * l'empreinte de la page actuelle (html donné, sinon la page assemblée) : à jour, elle se relit sans se relancer.
 */
function etatRelecture(projet, { html } = {}) {
  let c;
  try { c = JSON.parse(fs.readFileSync(fichierCritique(projet), 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return null;
    return { verdict: null, plusFaible: null, aJour: false, empreinte: null, erreurs: ['critique.json illisible.'] };
  }
  let scenes = null;
  try { scenes = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8')).scenes.map((s) => s.id); } catch { /* déroulé absent */ }
  const erreurs = validerCritique(c, { scenes });
  const page = html === undefined ? pageActuelle(projet) : html;
  const actuelle = page === null ? null : empreintePage(page);
  return {
    verdict: estObjet(c) && VERDICTS.includes(c.verdict) ? c.verdict : null,
    plusFaible: estObjet(c) && estTexte(c.plusFaible) ? c.plusFaible : null,
    aJour: !erreurs.length && actuelle !== null && c.empreinte === actuelle,
    empreinte: estObjet(c) && estTexte(c.empreinte) ? c.empreinte : null,
    erreurs,
  };
}

module.exports = { AXES, GRAVITES, VERDICTS, empreintePage, validerCritique, etatRelecture, fichierCritique };
