'use strict';
/* Pulse Motion – corrections sûres du déroulé (textes, durées), en une écriture précédée d'une copie
 * d'historique : « annule » les défait ensemble. Jamais le HTML des scènes, la charte ni les mots. */
const fs = require('node:fs');
const path = require('node:path');
const { sauvegarder } = require('../historique.js');

const virgule = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
const RAISONS = { lecture: 'temps de lecture', 'pause-finale': 'image stable à la fin', 'temps-mort': 'temps mort en fin de scène' };
// Ce qui a été fait, en mots : l'avant et l'après ne diffèrent souvent que par des espaces invisibles.
const quoi = (p) => (p.regle === 'typographie' ? `typographie française${p.details ? ` (${p.details})` : ''}` : p.details || 'majuscule accentuée');

/** problemes (ceux qui portent `correction`) -> { corrections, erreur? } */
function appliquerCorrections(projet, problemes) {
  const fichier = path.join(projet, 'deroule.json');
  const brut = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^\ufeff/, ''));
  const scene = (id) => (brut.scenes || []).find((s) => s.id === id);
  const corrections = [];
  // Durées : une par scène, la plus longue (le temps de lecture prime sur un temps mort).
  const durees = new Map();
  for (const p of problemes) {
    const c = p.correction;
    if (!c || !scene(c.scene)) continue;
    if (c.texte !== undefined) {
      const s = scene(c.scene);
      const avant = s.textes && s.textes[c.texte];
      if (typeof avant !== 'string' || avant === c.valeur) continue;
      s.textes[c.texte] = c.valeur;
      corrections.push({ regle: p.regle, scene: c.scene, element: c.texte, avant, apres: c.valeur,
        message: `Scène « ${c.scene} », texte « ${c.texte} » : ${quoi(p)}.` });
    } else if (typeof c.duree === 'number') {
      const deja = durees.get(c.scene);
      if (!deja || c.duree > deja.correction.duree) durees.set(c.scene, p);
    }
  }
  for (const [id, p] of durees) {
    const s = scene(id);
    const avant = s.duree;
    const apres = p.correction.duree;
    if (avant === apres) continue;
    s.duree = apres;
    corrections.push({ regle: p.regle, scene: id, avant, apres, message: `Scène « ${id} » : durée ${virgule(avant)} s → ${virgule(apres)} s (${RAISONS[p.regle] || p.regle}).` });
  }
  if (!corrections.length) return { corrections: [] };
  const temporaire = `${fichier}.${process.pid}.tmp`;
  let copie = null;
  try {
    copie = sauvegarder(projet).dossier;
    fs.writeFileSync(temporaire, JSON.stringify(brut, null, 2));
    fs.renameSync(temporaire, fichier);
  } catch (e) {
    try { fs.rmSync(temporaire, { force: true }); } catch { /* dossier à la place du fichier : laissé */ }
    // Rien n'a été écrit : seule la copie prise pour ce passage est retirée (« annule » ne la consommera pas à vide).
    if (copie) { try { fs.rmSync(copie, { recursive: true, force: true }); } catch { /* copie verrouillée : laissée */ } }
    return { corrections: [], erreur: `Les corrections n'ont pas pu être écrites dans deroule.json (${e.code || e.message}) : vérifiez les droits du dossier du projet (et de son dossier .historique). Rien n'a été changé.` };
  }
  return { corrections };
}

module.exports = { appliquerCorrections };
