#!/usr/bin/env node
'use strict';
/* Pulse Motion – où en est la vidéo, et quelle est l'étape suivante.
 *
 *   node scripts/etat.js <dossier-du-projet>
 *   node scripts/etat.js <dossier-du-projet> --parcours rapide|accompagne|autonome
 *     autonome : « Faites pour moi » (spec Retouches et ergonomie, 5.4) : aucune question après la première ronde, donc aucun
 *     accord demandé ; un déroulé valide mène droit à la fabrication.
 *   node scripts/etat.js <dossier-du-projet> --accord deroule|style|video|voix-provisoire
 *     style : les 3 styles proposés (styles --genre <genre> --noter <dossier>) et le style choisi s'ajoutent à la mémoire de la
 *     personne, ~/.pulse-motion/styles-proposes.json (spec S11, 5.3).
 *     voix-provisoire : accord pour exporter une version de travail avec la voix de l'ordinateur (spec Retouches et ergonomie,
 *     5.17), gardé avec l'empreinte des prises provisoires : il tombe dès que l'une d'elles change (accords.voixProvisoire).
 *
 * Lit et complète .pulse-motion/etat.json (accords donnés, aperçu en cours).
 * Affiche { node, projet, titre, parcours, etape, prochaine, accords, apercu, remarques, reglagesNonControles } en JSON.
 * remarques : { ouvertes, envoyees } (remarques laissées sur l'image dans l'aperçu, spec Retouches et ergonomie, 5.8) ;
 * reglagesNonControles : un réglage rapide de l'aperçu (5.11) attend le prochain contrôle (reglagesChanges : lesquels). Une scène encore à l'état d'ébauche
 * (section data-ebauche, pulse-motion ebauche) compte parmi les scènes manquantes (scenesManquantes, et ebauches).
 * Étape « tournage » (spec S6, 5.15) : un parcours de films/ sans prise choisie, ou une scène qui vise un film sans prise
 * (tournage : [{ nom, prises, choisie }]) ; elle passe avant toutes les autres, déroulé compris (le tournage précède le déroulé).
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule, PARCOURS } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { empreinteProvisoire } = require('./lib/voix.js');
const { etatCharte } = require('./charte.js');
const { ecrireJSON } = require('./lib/fichiers.js');
const { estEbauche } = require('./lib/ebauche.js');
const Remarques = require('./lib/remarques.js');
const Reglages = require('./lib/reglages-rapides.js');

const NODE_MINIMUM = 20;
const ACCORDS = ['deroule', 'style', 'video', 'voix-provisoire'];

/** -> { version, ok, message? } */
function verifierNode(version = process.versions.node) {
  const majeure = parseInt(String(version).split('.')[0], 10);
  if (majeure >= NODE_MINIMUM) return { version, ok: true };
  return {
    version,
    ok: false,
    message: `Node.js ${version} est trop ancien : Pulse Motion a besoin de Node.js ${NODE_MINIMUM} ou plus. ` +
      'Installez la version LTS depuis https://nodejs.org (Windows et macOS : programme d\'installation ; Linux : gestionnaire de paquets ou nvm), puis relancez Claude Code.',
  };
}

function cheminEtat(projet) { return path.join(projet, '.pulse-motion', 'etat.json'); }

function lireEtat(projet) {
  try { return JSON.parse(fs.readFileSync(cheminEtat(projet), 'utf8')); } catch { return {}; }
}

/** Écriture atomique : l'aperçu et la commande pulse-motion lisent ce fichier pendant qu'il change. */
function ecrireEtat(projet, etat) {
  ecrireJSON(cheminEtat(projet), etat);
}

function processusActif(pid) {
  if (!Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const PROCHAINES = {
  'tournage': 'Un tournage est en cours : relire pulse-motion filmer prises, montrer la planche et faire choisir une prise, ou refilmer.',
  'questions': 'Aucune vidéo dans ce dossier : lancer /pulse-motion:creer.',
  'deroule-a-corriger': 'Le déroulé contient des erreurs : les corriger, puis le présenter à la personne.',
  'deroule-a-valider': 'Présenter le déroulé en tableau et demander l\'accord de la personne.',
  'fabrication': 'Écrire les scènes manquantes ou encore en ébauche (agent animateur), puis contrôler la vidéo et la regarder dans l\'aperçu.',
  'style-a-valider': 'Parcours accompagné : montrer la comparaison des styles (pulse-motion comparer) et demander l\'accord sur le style, avant d\'écrire les scènes.',
  'video-a-valider': 'Parcours accompagné : faire regarder la vidéo entière et demander l\'accord final.',
  'apercu': 'La vidéo est prête : proposer une retouche (/pulse-motion:retoucher) ou l\'export en MP4 (/pulse-motion:exporter).',
};

/** Films en attente d'une prise choisie : parcours sans prise, ou film visé par une scène sans prise. */
function filmsEnAttente(projet, deroule) {
  const F = require('./lib/film.js');
  const noms = new Set();
  try {
    for (const n of fs.readdirSync(path.join(projet, 'films'))) if (fs.existsSync(path.join(projet, 'films', n, 'parcours.json'))) noms.add(n);
  } catch { /* aucun film */ }
  if (deroule && Array.isArray(deroule.scenes)) for (const s of deroule.scenes) if (s && s.film && typeof s.film.nom === 'string') noms.add(s.film.nom);
  const attente = [];
  for (const nom of [...noms].sort()) {
    const parcours = F.lireParcoursBrut(projet, nom);
    if (parcours && parcours.prise && fs.existsSync(path.join(projet, 'films', nom, parcours.prise, 'film.json'))) continue;
    attente.push({ nom, prises: F.prises(projet, nom).filter((x) => x.ok).map((x) => x.prise), choisie: null });
  }
  return attente;
}

/** Calcule l'état du projet sans rien modifier. */
function etatProjet(dossier) {
  const projet = path.resolve(dossier);
  const memo = lireEtat(projet);
  const { 'voix-provisoire': accordVoix, ...autres } = memo.accords || {};
  const accords = { deroule: false, style: false, video: false, ...autres, voixProvisoire: false };
  const resultat = {
    node: verifierNode(),
    projet: fs.existsSync(path.join(projet, 'deroule.json')),
    titre: null,
    parcours: memo.parcours || 'rapide',
    etape: 'questions',
    prochaine: null,
    accords,
    apercu: memo.apercu ? { url: memo.apercu.url, actif: processusActif(memo.apercu.pid) } : null,
    erreurs: [],
    charte: null,
  };

  if (resultat.projet) {
    // Déclinaisons (spec S9, 5.2) : celles du projet (format, langue, dernier export) ; dans une déclinaison, son origine.
    const D = require('./decliner.js');
    const declinaisons = D.listerDeclinaisons(projet);
    if (declinaisons.length) resultat.declinaisons = declinaisons;
    try {
      const brut = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8').replace(/^\uFEFF/, ''));
      if (brut.declinaison && typeof brut.declinaison.origine === 'string') {
        const dOrigine = path.resolve(projet, brut.declinaison.origine);
        let titre = null;
        try { titre = JSON.parse(fs.readFileSync(path.join(dOrigine, 'deroule.json'), 'utf8').replace(/^\uFEFF/, '')).titre || null; } catch { /* origine déplacée */ }
        resultat.origine = { dossier: brut.declinaison.origine, titre, ...(brut.declinaison.format ? { format: brut.declinaison.format } : {}),
          ...(brut.declinaison.langue ? { langue: require('../moteur/langues.js').nom(brut.declinaison.langue) } : {}) };
      }
    } catch { /* déroulé illisible : signalé plus bas */ }
    resultat.remarques = Remarques.compte(projet);
    const reglages = Reglages.resumeNonControles(projet);
    resultat.reglagesNonControles = reglages.nonControles;
    if (reglages.nonControles) resultat.reglagesChanges = reglages.depuis;
    const { deroule, erreurs } = lireDeroule(projet);
    if (deroule && typeof deroule.titre === 'string') resultat.titre = deroule.titre;
    if (deroule && deroule.parcours) resultat.parcours = deroule.parcours;
    if (deroule && !erreurs.length) resultat.charte = etatCharte(projet, deroule);
    // Accord pour la voix provisoire : valable tant que les prises provisoires n'ont pas changé.
    if (deroule && !erreurs.length && typeof accordVoix === 'string') accords.voixProvisoire = accordVoix === empreinteProvisoire(projet, deroule);
    if (erreurs.length) {
      resultat.etape = 'deroule-a-corriger';
      resultat.erreurs = erreurs;
    } else if (!accords.deroule && resultat.parcours !== 'autonome') {
      resultat.etape = 'deroule-a-valider';
    } else if (resultat.parcours === 'accompagne' && !accords.style) {
      // Le style se choisit avant d'écrire les scènes : les scènes toutes faites dépendent de lui.
      resultat.etape = 'style-a-valider';
    } else {
      // Une ébauche n'est pas une scène écrite : elle garde l'étape « fabrication » (spec Retouches et ergonomie, 5.3).
      const ebauches = [];
      const manquantes = deroule.scenes.filter((s) => {
        const f = cheminDansProjet(projet, s.fichier);
        if (!f || !fs.existsSync(f)) return true;
        let html = '';
        try { html = fs.readFileSync(f, 'utf8'); } catch { return true; }
        if (estEbauche(html)) { ebauches.push(s.id); return true; }
        return false;
      }).map((s) => s.id);
      if (manquantes.length) {
        resultat.etape = 'fabrication';
        resultat.scenesManquantes = manquantes;
        if (ebauches.length) resultat.ebauches = ebauches;
      } else if (resultat.parcours === 'accompagne' && !accords.video) {
        resultat.etape = 'video-a-valider';
      } else {
        resultat.etape = 'apercu';
      }
    }
  }
  // Tournage en cours (spec S6, 5.15) : il passe avant tout le reste, même sans déroulé.
  let deroulePourFilms = null;
  try { deroulePourFilms = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8').replace(/^\uFEFF/, '')); } catch { /* sans déroulé */ }
  const tournage = filmsEnAttente(projet, deroulePourFilms);
  if (tournage.length) {
    resultat.etape = 'tournage';
    resultat.tournage = tournage;
  }
  resultat.prochaine = PROCHAINES[resultat.etape];
  return resultat;
}

/** Enregistre un accord donné par la personne. */
function donnerAccord(dossier, accord) {
  if (!ACCORDS.includes(accord)) throw new Error(`Accord inconnu : « ${accord} ». Accords : ${ACCORDS.join(', ')}.`);
  const projet = path.resolve(dossier);
  const memo = lireEtat(projet);
  let valeur = true;
  if (accord === 'voix-provisoire') {
    const { deroule } = lireDeroule(projet);
    valeur = deroule ? empreinteProvisoire(projet, deroule) : null;
    if (!valeur) throw new Error('La vidéo n\'a pas de voix provisoire : rien à accorder.');
  }
  // Accord sur le style (spec S11, 5.3) : les styles proposés, notés par « styles --genre --noter », entrent dans la mémoire
  // de la personne avec le style choisi, une seule fois.
  if (accord === 'style') require('./lib/styles-proposes.js').retenirAccord(projet, memo);
  memo.accords = { ...(memo.accords || {}), [accord]: valeur };
  ecrireEtat(projet, memo);
  return etatProjet(projet);
}

/** Enregistre le parcours choisi au départ. */
function choisirParcours(dossier, parcours) {
  if (!PARCOURS.includes(parcours)) throw new Error(`Parcours inconnu : « ${parcours} ». Parcours : ${PARCOURS.join(', ')}.`);
  const projet = path.resolve(dossier);
  const memo = lireEtat(projet);
  memo.parcours = parcours;
  ecrireEtat(projet, memo);
  // Début d'une création : la vidéo entre au registre de la personne (spec Retouches et ergonomie, 5.21).
  require('./lib/videos.js').noterVideo({ dossier: projet });
  return etatProjet(projet);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--')) || '.';
  const valeur = (option) => { const i = args.indexOf(option); return i >= 0 ? args[i + 1] : null; };
  try {
    let etat;
    if (valeur('--accord')) etat = donnerAccord(dossier, valeur('--accord'));
    else if (valeur('--parcours')) etat = choisirParcours(dossier, valeur('--parcours'));
    else etat = etatProjet(dossier);
    console.log(JSON.stringify(etat, null, 2));
    process.exit(etat.node.ok ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { filmsEnAttente, etatProjet, donnerAccord, choisirParcours, verifierNode, NODE_MINIMUM, PARCOURS };
