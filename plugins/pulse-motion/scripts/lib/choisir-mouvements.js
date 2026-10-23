'use strict';
/* Pulse Motion – projets de démonstration : une scène courte par mouvement du dictionnaire (ou par effet, par mouvement de
 * personnage), dans un vrai style, pour les voir jouer. Sert à la page de choix (pulse-motion mouvements choisir) et aux
 * aperçus du wiki (outils/site/medias.js).
 *
 *   projetDeDemos(dossier, demos, { style, ratio, titre }) -> { deroule, plages: [{ id, debut, fin }] }
 *   demosDeMouvements(entrees) -> demos       (une scène par entrée ; deux pour une transition : avant, puis l'entrée)
 *   projetDeMouvements(dossier, entrees, options) -> { deroule, plages: [{ no, debut, fin }] }
 */
const fs = require('node:fs');
const path = require('node:path');
const { calculerMinutage } = require('../../moteur/minutage.js');

// Décor visible pour les démonstrations de caméra : un motif à la couleur de la charte sur chaque décor vide de l'extrait
// (un plan lointain, data-profondeur faible, porte un motif plus large).
const DECOR = `<style>@scope {
  .decor:empty { position: absolute; inset: -10%; pointer-events: none;
    background: radial-gradient(circle, color-mix(in srgb, var(--c-primaire) 28%, transparent) 0 0.7cqh, transparent 0.8cqh) 0 0 / 6cqh 6cqh; }
  .decor[data-profondeur="0.2"]:empty { background: radial-gradient(circle, color-mix(in srgb, var(--c-accent) 22%, transparent) 0 3cqh, transparent 3.1cqh) 0 0 / 16cqh 16cqh; }
} </style>`;

/** Écrit le projet (déroulé et scènes) dans `dossier` ; les démos s'enchaînent en coupe franche, sauf transition demandée. */
function projetDeDemos(dossier, demos, { style = 'clair-pedagogique', ratio = '16:9', titre = 'Démonstrations' } = {}) {
  fs.mkdirSync(path.join(dossier, 'scenes'), { recursive: true });
  const scenes = demos.map((d) => {
    const fichier = `scenes/${d.id}.html`;
    fs.writeFileSync(path.join(dossier, fichier), `<section data-scene="${d.id}">\n${DECOR}\n${d.html}\n</section>\n`);
    return { id: d.id, fichier, duree: d.duree, textes: d.textes || {}, transition: d.transition || 'coupe' };
  });
  const deroule = { version: 1, titre, genre: 'formation', parcours: 'rapide', format: { ratio, ips: 30 }, style, scenes };
  fs.writeFileSync(path.join(dossier, 'deroule.json'), JSON.stringify(deroule, null, 2));
  const min = calculerMinutage(scenes, {});
  return { deroule, plages: min.scenes.map((s) => ({ id: s.id, debut: s.debut, fin: s.fin })) };
}

/** Démos des entrées du dictionnaire : `m<no>` (3 s), ou `m<no>a` puis `m<no>` (1,5 s chacune) pour une transition. */
function demosDeMouvements(entrees) {
  const demos = [];
  for (const e of entrees) {
    const textes = { titre: e.nom.fr, texte: e.nom.metier };
    if (e.recette.type === 'transition') {
      const transition = JSON.parse(`{${e.recette.exemple}}`).transition;
      demos.push({ id: `m${e.no}a`, duree: 1.5, textes: { titre: 'Avant' }, html: '<h2 data-texte="titre" data-start="0"></h2>' });
      demos.push({ id: `m${e.no}`, duree: 1.5, textes, transition, html: '<h2 data-texte="titre" data-start="0"></h2>' });
    } else {
      demos.push({ id: `m${e.no}`, duree: 3, textes, html: e.recette.exemple });
    }
  }
  return demos;
}

/** -> { deroule, plages: [{ no, debut, fin }] } : une plage par entrée (une transition couvre ses deux scènes). */
function projetDeMouvements(dossier, entrees, options = {}) {
  const { deroule, plages } = projetDeDemos(dossier, demosDeMouvements(entrees), { titre: 'Mouvements', ...options });
  const parId = new Map(plages.map((p) => [p.id, p]));
  return {
    deroule,
    plages: entrees.map((e) => {
      const p = parId.get(`m${e.no}`);
      const avant = parId.get(`m${e.no}a`);
      return { no: e.no, debut: avant ? avant.debut : p.debut, fin: p.fin };
    }),
  };
}

module.exports = { projetDeDemos, demosDeMouvements, projetDeMouvements };
