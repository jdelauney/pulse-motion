'use strict';
/* Pulse Motion – contrat commun des styles : les 8 types de scène toute faite et leurs clés de texte.
 * Tout style (livré ou personnel) fournit ces 8 scènes avec exactement ces clés. */

const TYPES = {
  titre: ['etiquette', 'titre', 'sous'],
  liste: ['titre', 'point1', 'point2', 'point3', 'point4'],
  chiffre: ['titre', 'unite', 'legende'],
  comparaison: ['titre', 'gauche-titre', 'gauche-texte', 'droite-titre', 'droite-texte'],
  etape: ['numero', 'titre', 'texte'],
  alerte: ['titre', 'texte'],
  schema: ['titre', 'a', 'b', 'c'],
  conclusion: ['titre', 'sous'],
};

/** Clés qu'on peut laisser sans texte : l'élément qui les porte est alors retiré de la scène. */
const OPTIONNELLES = { liste: ['point3', 'point4'] };

/** Familles de styles, reprises des directions visuelles de pulse-vibe. */
const FAMILLES = ['editoriale', 'moderne', 'technique', 'affirmee', 'chaleureuse'];

const NOM_STYLE = /^[a-z0-9-]+$/;

/** Catégories de la galerie et de la liste des styles, dans leur ordre d'affichage (spec Styles et réalisation, 5.2). */
const CATEGORIES = [
  { id: 'essentiels', nom: 'Les essentiels' },
  { id: 'dessine', nom: 'Dessiné à la main' },
  { id: 'schemas-donnees', nom: 'Schémas et données' },
  { id: 'papier-imprime', nom: 'Papier et imprimé' },
  { id: 'ecrans-annonces', nom: 'Écrans et annonces' },
  { id: 'anime', nom: 'Animé' },
];

/**
 * Types d'entrée d'un élément, pour la table des bruitages d'un style (identite.son.bruitages).
 * Liste unique, partagée avec les bruitages automatiques (spec Explication narrée) : un type nouveau s'ajoute ici.
 */
const TYPES_ENTREE = ['titre', 'texte', 'point', 'chiffre', 'trace', 'forme', 'image', 'ecriture', 'transition'];

/** Titres exacts des sections d'une fiche de style, dans l'ordre (spec Styles et réalisation, 5.1). */
const SECTIONS_FICHE = [
  "L'essentiel",
  "1. Essence, et ce qu'il n'est pas",
  '2. Matières et rendu',
  '3. Logique de couleur',
  '4. Typographie et sous-titres',
  '5. Qualité du mouvement',
  '6. Grammaire de caméra et transitions',
  '7. Palette sonore',
  '8. Gestes natifs',
  '9. Pièges',
  '10. Scènes toutes faites et classes',
  '11. Espace de variation',
];

/** Sections lues par l'animateur (pulse-motion reference styles/<style> --pour animateur). */
const SECTIONS_ANIMATEUR = [SECTIONS_FICHE[0], SECTIONS_FICHE[2], SECTIONS_FICHE[4], SECTIONS_FICHE[5], SECTIONS_FICHE[8], SECTIONS_FICHE[9], SECTIONS_FICHE[10]];

module.exports = { TYPES, OPTIONNELLES, FAMILLES, NOM_STYLE, CATEGORIES, TYPES_ENTREE, SECTIONS_FICHE, SECTIONS_ANIMATEUR };
