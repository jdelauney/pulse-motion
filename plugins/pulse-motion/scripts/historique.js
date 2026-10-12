#!/usr/bin/env node
'use strict';
/* Pulse Motion – historique des retouches : une copie avant chaque retouche, « annule » la restaure.
 *
 *   node scripts/historique.js sauvegarder <dossier-du-projet>
 *   node scripts/historique.js annuler <dossier-du-projet>
 *
 * Copie deroule.json, scenes/, assets/, charte/ et effets/ dans .historique/NNN/ ; garde les 20 dernières copies.
 * Affiche un résumé JSON ; code de sortie 1 avec un message en français en cas d'échec.
 */
const fs = require('node:fs');
const path = require('node:path');

const CONSERVEES = 20;
const CONTENU = ['deroule.json', 'scenes', 'assets', 'charte', 'effets'];

function copies(dossierHistorique) {
  if (!fs.existsSync(dossierHistorique)) return [];
  return fs.readdirSync(dossierHistorique).filter((n) => /^\d{3,}$/.test(n)).sort((a, b) => Number(a) - Number(b));
}

/** -> { numero: '007', dossier } */
function sauvegarder(dossier) {
  const projet = path.resolve(dossier);
  if (!fs.existsSync(path.join(projet, 'deroule.json'))) throw new Error('Aucun déroulé à sauvegarder dans ce dossier.');
  const racine = path.join(projet, '.historique');
  const existantes = copies(racine);
  const suivant = existantes.length ? Number(existantes[existantes.length - 1]) + 1 : 1;
  const numero = String(suivant).padStart(3, '0');
  const cible = path.join(racine, numero);
  fs.mkdirSync(cible, { recursive: true });
  for (const nom of CONTENU) {
    const source = path.join(projet, nom);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(cible, nom), { recursive: true });
  }
  for (const ancienne of copies(racine).slice(0, -CONSERVEES)) fs.rmSync(path.join(racine, ancienne), { recursive: true, force: true });
  return { numero, dossier: cible };
}

/** Restaure la dernière copie puis la retire. -> { numero } */
function annuler(dossier) {
  const projet = path.resolve(dossier);
  const racine = path.join(projet, '.historique');
  const existantes = copies(racine);
  if (!existantes.length) throw new Error('Aucune retouche à annuler.');
  const numero = existantes[existantes.length - 1];
  const source = path.join(racine, numero);
  for (const nom of CONTENU) {
    fs.rmSync(path.join(projet, nom), { recursive: true, force: true });
    if (fs.existsSync(path.join(source, nom))) fs.cpSync(path.join(source, nom), path.join(projet, nom), { recursive: true });
  }
  fs.rmSync(source, { recursive: true, force: true });
  return { numero };
}

if (require.main === module) {
  const [action, dossier] = process.argv.slice(2);
  const actions = { sauvegarder, annuler };
  if (!actions[action] || !dossier) {
    console.error('Usage : node scripts/historique.js sauvegarder|annuler <dossier-du-projet>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(actions[action](dossier), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { sauvegarder, annuler, CONSERVEES };
