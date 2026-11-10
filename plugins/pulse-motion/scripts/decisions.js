#!/usr/bin/env node
'use strict';
/* Pulse Motion – journal des choix faits par Claude à la place de la personne (parcours « Faites pour moi », spec Retouches
 * et ergonomie, 5.4) : .pulse-motion/decisions.json, relu par le bloc de fin (« Mes choix, chacun se change en une phrase »).
 *
 *   node scripts/decisions.js <dossier-du-projet>                                         le journal (JSON)
 *   node scripts/decisions.js <dossier-du-projet> noter "<sujet>" "<choix>" "<raison>" "<pour changer>"
 *
 * [{ "sujet": "style", "choix": "chaleureux", "raison": "formation pour des stagiaires", "pourChanger": "« passe en style éditorial »" }]
 * Un sujet déjà noté est remplacé (le dernier choix compte) ; écriture atomique.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ecrireJSON } = require('./lib/fichiers.js');

const fichierDecisions = (projet) => path.join(path.resolve(projet), '.pulse-motion', 'decisions.json');
const CHAMPS = ['sujet', 'choix', 'raison', 'pourChanger'];

/** Journal du projet : [] s'il n'existe pas ou s'il est illisible. */
function lireDecisions(projet) {
  try {
    const j = JSON.parse(fs.readFileSync(fichierDecisions(projet), 'utf8'));
    return Array.isArray(j) ? j.filter((d) => d && typeof d.sujet === 'string') : [];
  } catch { return []; }
}

/** Note un choix (dès la première ronde, avant le déroulé) ; -> le journal complet. Lève une erreur en français si un champ manque. */
function noterDecision(projet, decision) {
  const d = {};
  for (const c of CHAMPS) {
    const v = decision && decision[c];
    if (typeof v !== 'string' || !v.trim()) throw new Error(`Choix incomplet : « ${c} » manque (sujet, choix, raison, pour changer).`);
    d[c] = v.trim();
  }
  const journal = lireDecisions(projet).filter((x) => x.sujet !== d.sujet);
  journal.push(d);
  ecrireJSON(fichierDecisions(projet), journal);
  return journal;
}

/** Lignes du bloc de fin : « style : chaleureux (formation pour des stagiaires ; pour changer : « passe en style éditorial ») ». */
const resumer = (journal) => journal.map((d) => `${d.sujet} : ${d.choix} (${d.raison} ; pour changer : ${d.pourChanger})`);

if (require.main === module) {
  const [dossier = '.', commande, ...reste] = process.argv.slice(2);
  try {
    if (commande === 'noter') {
      const [sujet, choix, raison, pourChanger] = reste;
      console.log(JSON.stringify(noterDecision(dossier, { sujet, choix, raison, pourChanger }), null, 2));
    } else if (commande === undefined) {
      console.log(JSON.stringify(lireDecisions(dossier), null, 2));
    } else {
      console.error('Usage : pulse-motion decisions <dossier> [noter "<sujet>" "<choix>" "<raison>" "<pour changer>"]');
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { lireDecisions, noterDecision, resumer, fichierDecisions };
