'use strict';
/* Pulse Motion – styles proposés et habitudes de la personne (spec S11, 5.3).
 *
 * ~/.pulse-motion/styles-proposes.json : les 30 dernières propositions, [{ date, genre, proposes: [3 styles], choisi }].
 * « styles --genre <genre> --noter <dossier> » note les 3 styles proposés dans l'état du projet (.pulse-motion/etat.json,
 * stylesProposes) ; « etat --accord style » les écrit ici avec le style choisi (celui du déroulé), puis les efface de l'état :
 * rien n'est écrit sans accord sur le style. Jamais le vrai dossier de la personne pendant les tests sans
 * PULSE_MOTION_DOSSIER (lib/personnel.js), ni en lecture ni en écriture.
 * Idées : cinecode, scripts/styles.py suggest (au plus 2 par famille, départage par une empreinte, recul des styles déjà
 * montrés) et quick-mode.md § 1 (« aucun de ceux-là ») (MIT, © 2026 Sarp Yıldız) ; code écrit à neuf.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dossierPersonnelEcrivable } = require('./personnel.js');
const { ecrireAtomique, ecrireJSON } = require('./fichiers.js');

const MAX = 30;
const RECENTES = 5;
const RECUL = 2;
const fichier = (personnel) => path.join(personnel, 'styles-proposes.json');
const etatProjet = (projet) => path.join(path.resolve(projet), '.pulse-motion', 'etat.json');
const nom = (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v);
const meme = (a, b) => (process.platform === 'win32' || process.platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b);

function lireJSON(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

/** Propositions retenues, la plus ancienne d'abord. */
function lirePropositions(personnel = dossierPersonnelEcrivable()) {
  if (!personnel) return [];
  const j = lireJSON(fichier(personnel));
  return Array.isArray(j) ? j.filter((p) => p && typeof p.genre === 'string' && Array.isArray(p.proposes)) : [];
}

/** Ajoute une proposition (30 au plus, les plus anciennes partent). -> l'entrée, ou null si rien n'a été écrit. */
function noterProposition({ genre, proposes, choisi = null, personnel = dossierPersonnelEcrivable(), date = new Date() }) {
  if (!personnel || typeof genre !== 'string' || !Array.isArray(proposes)) return null;
  const entree = { date: date.toISOString(), genre, proposes: proposes.filter(nom).slice(0, 3), choisi: nom(choisi) ? choisi : null };
  const liste = lirePropositions(personnel).concat(entree).slice(-MAX);
  try {
    fs.mkdirSync(personnel, { recursive: true });
    ecrireAtomique(fichier(personnel), `${JSON.stringify(liste, null, 2)}\n`);
  } catch { return null; }
  return entree;
}

/** Note dans l'état du projet les styles proposés pour ce genre (styles --genre --noter). */
function noterDansProjet(projet, { genre, proposes, date = new Date() }) {
  const f = etatProjet(projet);
  const etat = lireJSON(f) || {};
  etat.stylesProposes = { date: date.toISOString(), genre, proposes: proposes.filter(nom).slice(0, 3) };
  ecrireJSON(f, etat);
  return etat.stylesProposes;
}

/**
 * Accord sur le style (etat --accord style) : la proposition notée dans l'état (memo.stylesProposes) est écrite dans la
 * mémoire de la personne avec le style du déroulé, puis retirée de memo (que l'appelant écrit). -> l'entrée écrite, ou null.
 */
function retenirAccord(projet, memo, personnel = dossierPersonnelEcrivable()) {
  const note = memo && memo.stylesProposes;
  if (!note) return null;
  delete memo.stylesProposes;
  const deroule = lireJSON(path.join(path.resolve(projet), 'deroule.json')) || {};
  return noterProposition({ genre: note.genre, proposes: note.proposes || [], choisi: deroule.style, personnel });
}

/**
 * Habitude : le style choisi le plus récemment pour ce genre (mémoire des propositions), sinon celui de la vidéo de ce genre
 * la plus récemment vue (videos.json, le projet en cours exclu). -> nom ou null.
 */
function habitude(genre, { propositions = [], personnel = dossierPersonnelEcrivable(), projet = null } = {}) {
  for (let i = propositions.length - 1; i >= 0; i--) {
    const p = propositions[i];
    if (p.genre === genre && nom(p.choisi)) return p.choisi;
  }
  if (!personnel) return null;
  const { lireRegistre } = require('./videos.js');
  const ici = projet ? path.resolve(projet) : null;
  const videos = lireRegistre(personnel).slice().sort((a, b) => String(b.vue || '').localeCompare(String(a.vue || '')));
  for (const v of videos) {
    const dossier = path.resolve(v.dossier);
    if (ici && meme(dossier, ici)) continue;
    const d = lireJSON(path.join(dossier, 'deroule.json'));
    if (d && d.genre === genre && nom(d.style)) return d.style;
  }
  return null;
}

/** Préférence de portée style (domaine « style », portée qui nomme un style) valable pour ce genre, la plus récente. */
function preferenceDeStyle(genre, personnel = dossierPersonnelEcrivable()) {
  if (!personnel) return null;
  const { lirePreferences } = require('../preferences.js');
  const valables = lirePreferences(personnel).filter((p) => p && p.domaine === 'style' && p.portee && nom(p.portee.style)
    && (!p.portee.genre || p.portee.genre === genre));
  return valables.length ? valables[valables.length - 1].portee.style : null;
}

/** Styles proposés au moins 2 fois dans les 5 dernières propositions sans y être jamais choisis. -> Set */
function stylesRecules(propositions = []) {
  const recentes = propositions.slice(-RECENTES);
  const choisis = new Set(recentes.map((p) => p.choisi).filter(nom));
  const vus = new Map();
  for (const p of recentes) for (const s of new Set(p.proposes)) vus.set(s, (vus.get(s) || 0) + 1);
  return new Set([...vus].filter(([s, n]) => n >= RECUL && !choisis.has(s)).map(([s]) => s));
}

/** Empreinte d'un style dans un projet : l'ordre est stable dans un projet et change d'un projet à l'autre. */
const empreinte = (projet, style) => crypto.createHash('sha1').update(`${projet}|${style}`).digest('hex');

/**
 * « aussi » en rotation : les styles reculés passent à la fin ; dans chaque groupe, l'ordre de l'empreinte du nom du projet
 * (sans projet : l'ordre du tableau).
 */
function ordonnerAussi(aussi, { propositions = [], projet = null } = {}) {
  const recules = stylesRecules(propositions);
  const trier = (liste) => (projet ? liste.map((s) => [empreinte(projet, s), s]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, s]) => s) : liste);
  return [...trier(aussi.filter((s) => !recules.has(s))), ...trier(aussi.filter((s) => recules.has(s)))];
}

/** Contexte de la personne pour classer les styles d'un genre : { propositions, habitude, preference, projet }. */
function contexteGenre(genre, { projet = null, personnel = dossierPersonnelEcrivable() } = {}) {
  const propositions = lirePropositions(personnel);
  return {
    projet: projet ? path.basename(path.resolve(projet)) : null,
    propositions,
    habitude: personnel ? habitude(genre, { propositions, personnel, projet }) : null,
    preference: preferenceDeStyle(genre, personnel),
  };
}

module.exports = {
  lirePropositions, noterProposition, noterDansProjet, retenirAccord, habitude, preferenceDeStyle, stylesRecules, ordonnerAussi,
  contexteGenre, empreinte, MAX, RECENTES, RECUL,
};
