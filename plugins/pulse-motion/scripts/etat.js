#!/usr/bin/env node
'use strict';
/* Pulse Motion – où en est la vidéo, et quelle est l'étape suivante.
 *
 *   node scripts/etat.js <dossier-du-projet>
 *   node scripts/etat.js <dossier-du-projet> --parcours rapide|accompagne
 *   node scripts/etat.js <dossier-du-projet> --accord deroule|style|video
 *
 * Lit et complète .pulse-motion/etat.json (accords donnés, aperçu en cours).
 * Affiche { node, projet, titre, parcours, etape, prochaine, accords, apercu } en JSON.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');

const NODE_MINIMUM = 20;
const ACCORDS = ['deroule', 'style', 'video'];

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

function ecrireEtat(projet, etat) {
  fs.mkdirSync(path.dirname(cheminEtat(projet)), { recursive: true });
  fs.writeFileSync(cheminEtat(projet), JSON.stringify(etat, null, 2));
}

function processusActif(pid) {
  if (!Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const PROCHAINES = {
  'questions': 'Aucune vidéo dans ce dossier : lancer /pulse-motion:creer.',
  'deroule-a-corriger': 'Le déroulé contient des erreurs : les corriger, puis le présenter à la personne.',
  'deroule-a-valider': 'Présenter le déroulé en tableau et demander l\'accord de la personne.',
  'fabrication': 'Écrire les scènes manquantes (agent animateur), puis assembler, contrôler et ouvrir l\'aperçu.',
  'style-a-valider': 'Parcours accompagné : montrer deux scènes dans l\'aperçu et demander l\'accord sur le style.',
  'video-a-valider': 'Parcours accompagné : faire regarder la vidéo entière et demander l\'accord final.',
  'apercu': 'La vidéo est prête : proposer une retouche (/pulse-motion:retoucher) ou l\'export.',
};

/** Calcule l'état du projet sans rien modifier. */
function etatProjet(dossier) {
  const projet = path.resolve(dossier);
  const memo = lireEtat(projet);
  const accords = { deroule: false, style: false, video: false, ...(memo.accords || {}) };
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
  };

  if (resultat.projet) {
    const { deroule, erreurs } = lireDeroule(projet);
    if (deroule && typeof deroule.titre === 'string') resultat.titre = deroule.titre;
    if (deroule && deroule.parcours) resultat.parcours = deroule.parcours;
    if (erreurs.length) {
      resultat.etape = 'deroule-a-corriger';
      resultat.erreurs = erreurs;
    } else if (!accords.deroule) {
      resultat.etape = 'deroule-a-valider';
    } else {
      const manquantes = deroule.scenes.filter((s) => {
        const f = cheminDansProjet(projet, s.fichier);
        return !f || !fs.existsSync(f);
      }).map((s) => s.id);
      if (manquantes.length) {
        resultat.etape = 'fabrication';
        resultat.scenesManquantes = manquantes;
      } else if (resultat.parcours === 'accompagne' && !accords.style) {
        resultat.etape = 'style-a-valider';
      } else if (resultat.parcours === 'accompagne' && !accords.video) {
        resultat.etape = 'video-a-valider';
      } else {
        resultat.etape = 'apercu';
      }
    }
  }
  resultat.prochaine = PROCHAINES[resultat.etape];
  return resultat;
}

/** Enregistre un accord donné par la personne. */
function donnerAccord(dossier, accord) {
  if (!ACCORDS.includes(accord)) throw new Error(`Accord inconnu : « ${accord} ». Accords : ${ACCORDS.join(', ')}.`);
  const projet = path.resolve(dossier);
  const memo = lireEtat(projet);
  memo.accords = { ...(memo.accords || {}), [accord]: true };
  ecrireEtat(projet, memo);
  return etatProjet(projet);
}

/** Enregistre le parcours choisi au départ. */
function choisirParcours(dossier, parcours) {
  if (!['rapide', 'accompagne'].includes(parcours)) throw new Error(`Parcours inconnu : « ${parcours} ». Parcours : rapide, accompagne.`);
  const projet = path.resolve(dossier);
  const memo = lireEtat(projet);
  memo.parcours = parcours;
  ecrireEtat(projet, memo);
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

module.exports = { etatProjet, donnerAccord, choisirParcours, verifierNode, NODE_MINIMUM };
