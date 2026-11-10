'use strict';
/* Pulse Motion – réglages rapides de l'aperçu (spec Retouches et ergonomie, 5.11 ; références/reglages-rapides.md).
 *
 * Cinq réglages à valeurs fixes, sur liste fermée : couleur d'accent, allure, ton, musique, sous-titres. La valeur montrée
 * est toujours la valeur actuelle (« par défaut = fini ») ; un choix est écrit dans deroule.json, après une sauvegarde
 * d'historique portant la phrase « réglage rapide : … » (« annule » le défait), et noté dans .pulse-motion/reglages.json
 * ({ nonControles, changements, memoire }) : le prochain contrôle le remet à zéro (etat : reglagesNonControles).
 * La musique retirée (« Sans ») et les sous-titres retirés (« Non ») sont gardés dans memoire pour revenir au choix suivant.
 * Idée des réglages en direct de huashu-design (5 ou 6 au plus, valeur par défaut = fini) : idée seulement, rien de repris.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ecrireAtomique, ecrireJSON } = require('./fichiers.js');
const { validerDeroule, grilleFixe } = require('./deroule.js');
const { chartePour } = require('./fusion-charte.js');

const VOLUMES = { basse: 0.35, normale: 0.5, forte: 0.7 };
const ALLURES = [['0.8', 'Plus posé'], ['1', 'Normal'], ['1.2', 'Plus vif']];
const TONS = [['clair', 'Clair'], ['sombre', 'Sombre'], ['auto', 'Automatique']];
const MUSIQUES = [['basse', 'Plus basse'], ['normale', 'Normale'], ['forte', 'Plus forte'], ['sans', 'Sans']];
const SOUS_TITRES = [['oui', 'Oui'], ['non', 'Non'], ['mot', 'Mot par mot']];
const NOMS_COULEURS = { accent: 'Accent', primaire: 'Couleur principale', secondaire: 'Seconde couleur' };
const CLES = ['accent', 'allure', 'ton', 'musique', 'sousTitres'];
const LIBELLES = { accent: 'Couleur d\'accent', allure: 'Allure', ton: 'Ton', musique: 'Musique', sousTitres: 'Sous-titres' };
const HEX = /^#[0-9a-f]{6}$/i;
const CHANGEMENTS_MAX = 50;

class ErreurReglage extends Error {
  constructor(message, statut = 400) { super(message); this.statut = statut; }
}

const fichierReglages = (projet) => path.join(path.resolve(projet), '.pulse-motion', 'reglages.json');

function lireReglages(projet) {
  try {
    const r = JSON.parse(fs.readFileSync(fichierReglages(projet), 'utf8'));
    return { version: 1, nonControles: r.nonControles === true, changements: Array.isArray(r.changements) ? r.changements : [], memoire: r.memoire && typeof r.memoire === 'object' ? r.memoire : {}, controleLe: r.controleLe || null };
  } catch {
    return { version: 1, nonControles: false, changements: [], memoire: {}, controleLe: null };
  }
}

/** Le contrôle vient de passer : les réglages rapides sont contrôlés (appelé par controler). */
function marquerControle(projet) {
  if (!fs.existsSync(fichierReglages(projet))) return false;
  const r = lireReglages(projet);
  if (!r.nonControles) return false;
  ecrireJSON(fichierReglages(projet), { ...r, nonControles: false, controleLe: new Date().toISOString() });
  return true;
}

/** Pour etat : { nonControles, depuis: ["Allure : plus vif", …] } (changements depuis le dernier contrôle). */
function resumeNonControles(projet) {
  const r = lireReglages(projet);
  if (!r.nonControles) return { nonControles: false, depuis: [] };
  const apres = r.controleLe ? Date.parse(r.controleLe) : 0;
  const depuis = r.changements.filter((c) => Date.parse(c.date) > apres).map((c) => c.resume);
  return { nonControles: true, depuis: [...new Set(depuis)] };
}

function lireBrut(projet) {
  const fichier = path.join(path.resolve(projet), 'deroule.json');
  let d;
  try { d = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')); } catch { throw new ErreurReglage('Le déroulé est illisible : les réglages rapides attendent qu\'il soit corrigé.', 409); }
  const erreurs = validerDeroule(d);
  if (erreurs.length) throw new ErreurReglage('Le déroulé contient des erreurs : les réglages rapides attendent qu\'il soit corrigé.', 409);
  return d;
}

function dossierDuStyle(deroule, dossierStyles) {
  const st = require('../styles.js').trouverStyle(deroule.style, dossierStyles);
  return st ? st.dossier : null;
}

function lireJSON(fichier) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

const valeursDe = (liste) => liste.map(([valeur, libelle]) => ({ valeur, libelle }));

/**
 * reglagesActuels(projet, { dossierStyles? }) -> { reglages: [{ cle, libelle, valeurs: [{ valeur, libelle, couleur? }], actuelle,
 *   grise, raison? }] } : les cinq réglages, leurs valeurs permises (liste fermée) et la valeur actuelle de la vidéo.
 */
function reglagesActuels(projet, { dossierStyles } = {}) {
  const d = lireBrut(projet);
  const memoire = lireReglages(projet).memoire;
  const dossierStyle = dossierDuStyle(d, dossierStyles);
  const reglages = [];

  // Couleur d'accent : l'accent actuel, puis les couleurs de la charte et du style (5 au plus).
  const brute = dossierStyle ? chartePour(d, dossierStyle, path.resolve(projet)) : { couleurs: (d.charte && d.charte.couleurs) || {} };
  const duStyle = (dossierStyle && lireJSON(path.join(dossierStyle, 'charte.json'))) || {};
  const duProjet = lireJSON(path.join(path.resolve(projet), 'charte', 'charte.json')) || {};
  const sources = [['accent', brute.couleurs.accent], ...[duProjet.couleurs || {}, (d.charte && d.charte.couleurs) || {}, duStyle.couleurs || {}]
    .flatMap((c) => ['accent', 'primaire', 'secondaire'].map((k) => [k, c[k]]))];
  const couleurs = [];
  for (const [nom, hex] of sources) {
    if (!HEX.test(hex || '') || couleurs.some((c) => c.valeur === hex.toLowerCase()) || couleurs.length >= 5) continue;
    const libelle = couleurs.some((c) => c.libelle === NOMS_COULEURS[nom]) ? `${NOMS_COULEURS[nom]} (${hex.toLowerCase()})` : NOMS_COULEURS[nom];
    couleurs.push({ valeur: hex.toLowerCase(), libelle, couleur: hex.toLowerCase() });
  }
  const accent = HEX.test(brute.couleurs.accent || '') ? brute.couleurs.accent.toLowerCase() : null;
  reglages.push({ cle: 'accent', libelle: LIBELLES.accent, valeurs: couleurs, actuelle: accent, grise: couleurs.length < 2, ...(couleurs.length < 2 ? { raison: 'La charte et le style n\'ont qu\'une couleur.' } : {}) });

  // Allure : rythme de toutes les scènes.
  const rythmes = [...new Set(d.scenes.map((s) => (typeof s.rythme === 'number' ? s.rythme : 1)))];
  const allure = rythmes.length === 1 && ALLURES.some(([v]) => Number(v) === rythmes[0]) ? String(rythmes[0]) : null;
  const fixe = grilleFixe(d);
  reglages.push({ cle: 'allure', libelle: LIBELLES.allure, valeurs: valeursDe(ALLURES), actuelle: allure, grise: fixe,
    ...(fixe ? { raison: 'La vidéo suit le tempo d\'une musique : changer l\'allure la décalerait.' } : allure === null ? { raison: 'Les scènes n\'ont pas toutes la même allure.' } : {}) });

  // Ton : ceux que le style déclare (et « automatique »).
  const identite = dossierStyle ? lireJSON(path.join(dossierStyle, 'identite.json')) : null;
  const tons = identite && identite.couleur && Array.isArray(identite.couleur.tons) && identite.couleur.tons.length ? identite.couleur.tons : ['clair'];
  const valeursTon = valeursDe(TONS.filter(([v]) => v === 'auto' || tons.includes(v)));
  const ton = (d.charte && d.charte.ton) || (duProjet.ton) || 'auto';
  reglages.push({ cle: 'ton', libelle: LIBELLES.ton, valeurs: valeursTon, actuelle: valeursTon.some((v) => v.valeur === ton) ? ton : null, grise: tons.length < 2,
    ...(tons.length < 2 ? { raison: 'Ce style n\'a qu\'un ton.' } : {}) });

  // Musique : volume, ou retirée.
  const valeursMusique = valeursDe(MUSIQUES);
  let musique = null;
  if (!d.musique) musique = 'sans';
  else {
    const v = typeof d.musique.volume === 'number' ? d.musique.volume : 1;
    musique = Object.keys(VOLUMES).find((k) => Math.abs(VOLUMES[k] - v) < 1e-9) || null;
    if (!musique) {
      valeursMusique.splice(3, 0, { valeur: 'actuelle', libelle: `Comme maintenant (${Math.round(v * 100)} %)` });
      musique = 'actuelle';
    }
  }
  const sansMusique = !d.musique && !memoire.musique;
  reglages.push({ cle: 'musique', libelle: LIBELLES.musique, valeurs: valeursMusique, actuelle: musique, grise: sansMusique, ...(sansMusique ? { raison: 'La vidéo n\'a pas de musique.' } : {}) });

  // Sous-titres : seulement avec une voix.
  const avecVoix = d.scenes.some((s) => s.voix && typeof s.voix.texte === 'string' && s.voix.texte.trim());
  const st = !d.sousTitres ? 'non' : d.sousTitres.mode === 'mot' ? 'mot' : 'oui';
  reglages.push({ cle: 'sousTitres', libelle: LIBELLES.sousTitres, valeurs: valeursDe(SOUS_TITRES), actuelle: st, grise: !avecVoix, ...(!avecVoix ? { raison: 'La vidéo n\'a pas de voix.' } : {}) });

  return { reglages };
}

/** Phrase courte du changement : « Allure : plus vif ». */
const resume = (r, v) => `${r.libelle} : ${v.libelle.charAt(0).toLowerCase()}${v.libelle.slice(1)}`;

/**
 * appliquer(projet, { cle, valeur }, { dossierStyles? }) : clé et valeur sur liste fermée ; sauvegarde d'historique, puis
 * déroulé réécrit de façon atomique et valide, changement noté. -> { ok, cle, valeur, inchange?, sauvegarde?, resume }
 * Lève ErreurReglage (statut 400 : hors liste ; 409 : réglage indisponible, déroulé invalide).
 */
function appliquer(projet, { cle, valeur } = {}, { dossierStyles } = {}) {
  if (!CLES.includes(cle)) throw new ErreurReglage('Réglage inconnu.');
  const { reglages } = reglagesActuels(projet, { dossierStyles });
  const r = reglages.find((x) => x.cle === cle);
  const v = r.valeurs.find((x) => x.valeur === String(valeur).toLowerCase());
  if (!v) throw new ErreurReglage('Valeur hors de la liste de ce réglage.');
  if (r.grise) throw new ErreurReglage(r.raison || 'Ce réglage n\'est pas disponible pour cette vidéo.', 409);
  if (v.valeur === r.actuelle || v.valeur === 'actuelle') return { ok: true, cle, valeur: v.valeur, inchange: true, resume: resume(r, v) };

  const d = lireBrut(projet);
  const memo = lireReglages(projet);
  if (cle === 'accent') {
    d.charte = d.charte || {};
    d.charte.couleurs = { ...(d.charte.couleurs || {}), accent: v.valeur };
  } else if (cle === 'allure') {
    const n = Number(v.valeur);
    for (const s of d.scenes) { if (n === 1) delete s.rythme; else s.rythme = n; }
  } else if (cle === 'ton') {
    d.charte = d.charte || {};
    d.charte.ton = v.valeur;
  } else if (cle === 'musique') {
    if (v.valeur === 'sans') { memo.memoire.musique = d.musique; delete d.musique; } else {
      if (!d.musique) d.musique = memo.memoire.musique;
      d.musique = { ...d.musique, volume: VOLUMES[v.valeur] };
    }
  } else if (cle === 'sousTitres') {
    if (v.valeur === 'non') { memo.memoire.sousTitres = d.sousTitres; delete d.sousTitres; } else {
      d.sousTitres = { ...(d.sousTitres || memo.memoire.sousTitres || {}), mode: v.valeur === 'mot' ? 'mot' : 'ligne' };
    }
  }
  const erreurs = validerDeroule(d);
  if (erreurs.length) throw new ErreurReglage(`Ce réglage rendrait la vidéo invalide (${erreurs[0]}) : rien n'a été changé.`, 409);

  const historique = require('../historique.js');
  const phrase = `réglage rapide : ${resume(r, v)}`;
  const { numero } = historique.sauvegarder(projet, { phrase });
  try {
    ecrireAtomique(path.join(path.resolve(projet), 'deroule.json'), JSON.stringify(d, null, 2));
  } catch (e) {
    historique.retirerSauvegarde(projet, numero);
    throw new ErreurReglage(`Le déroulé n'a pas pu être écrit (${e.code || e.message}) : rien n'a été changé.`, 500);
  }
  memo.nonControles = true;
  memo.changements = [...memo.changements, { date: new Date().toISOString(), cle, valeur: v.valeur, resume: resume(r, v) }].slice(-CHANGEMENTS_MAX);
  ecrireJSON(fichierReglages(projet), memo);
  return { ok: true, cle, valeur: v.valeur, sauvegarde: numero, resume: resume(r, v) };
}

module.exports = { reglagesActuels, appliquer, lireReglages, marquerControle, resumeNonControles, fichierReglages, ErreurReglage, CLES, VOLUMES, ALLURES };
