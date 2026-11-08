#!/usr/bin/env node
'use strict';
/* Pulse Motion – crochet PostToolUse (Write, Edit) : contrôle immédiat de la scène qui vient d'être écrite (spec
 * Rapidité 5.11), par l'agent animateur comme pendant une retouche.
 *
 * Entrée (stdin) : l'évènement du crochet ({ tool_input: { file_path }, cwd, … }). Le fichier n'est pas une scène
 * (scenes/NN-<id>.html d'un dossier qui a un deroule.json) : rien, sans sortie. Sinon, les règles statiques de la scène
 * (lib/controle-scene.js, les mêmes que le contrôle) ; des problèmes : { decision: "block", reason } en français, une
 * ligne par problème, pour que Claude corrige la scène tout de suite. Toujours le code de sortie 0 : le crochet ne
 * bloque jamais l'outil (il a déjà écrit), et une panne du crochet n'empêche rien.
 */
const path = require('node:path');

function lireEntree() {
  return new Promise((resolve) => {
    let texte = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { texte += d; });
    process.stdin.on('end', () => resolve(texte));
    process.stdin.on('error', () => resolve(texte));
  });
}

/** Évènement du crochet -> réponse ({ decision, reason }) ou null (rien à dire). */
function repondre(evenement) {
  const entree = (evenement && evenement.tool_input) || {};
  let fichier = entree.file_path || entree.path;
  if (typeof fichier !== 'string' || !/\.html?$/i.test(fichier)) return null;
  if (!path.isAbsolute(fichier)) fichier = path.resolve(evenement.cwd || process.cwd(), fichier);
  // Chargement paresseux : hors d'une scène, le crochet répond sans lire les règles.
  const { sceneDuFichier, controlerScene } = require('./lib/controle-scene.js');
  const cible = sceneDuFichier(fichier);
  if (!cible) return null;
  const fs = require('node:fs');
  let html;
  try { html = fs.readFileSync(fichier, 'utf8'); } catch { return null; }
  const problemes = controlerScene({ ...cible, html }).filter((p) => p.gravite === 'erreur' || p.gravite === 'alerte');
  if (!problemes.length) return null;
  const lignes = problemes.map((p) => `- ${p.gravite === 'erreur' ? 'Erreur' : 'Alerte'} (${p.regle}) : ${p.message}`);
  return { decision: 'block', reason: `Contrôle de la scène « ${cible.scene.id} » (${path.basename(fichier)}) :\n${lignes.join('\n')}\nCorriger la scène maintenant.` };
}

if (require.main === module) {
  lireEntree().then((texte) => {
    let reponse = null;
    try { reponse = repondre(JSON.parse(texte || '{}')); } catch { reponse = null; }
    if (reponse) process.stdout.write(JSON.stringify(reponse));
    process.exit(0);
  });
}

module.exports = { repondre };
