'use strict';
/* Pulse Motion – contrat commun des styles : les 9 types de scène toute faite et leurs clés de texte.
 * Tout style livré fournit ces 9 scènes avec exactement ces clés ; un style personnel peut ne pas avoir les types récents
 * (TYPES_RECENTS : moyeu, spec S7 5.7), écrits après lui. */

const TYPES = {
  titre: ['etiquette', 'titre', 'sous'],
  liste: ['titre', 'point1', 'point2', 'point3', 'point4'],
  chiffre: ['titre', 'unite', 'legende'],
  comparaison: ['titre', 'gauche-titre', 'gauche-texte', 'droite-titre', 'droite-texte'],
  etape: ['numero', 'titre', 'texte'],
  alerte: ['titre', 'texte'],
  schema: ['titre', 'a', 'b', 'c'],
  conclusion: ['titre', 'sous'],
  // Moyeu et rayons (spec S7, 5.7) : un centre et 3 à 5 parties reliées par des flèches.
  moyeu: ['titre', 'centre', 'partie1', 'partie2', 'partie3', 'partie4', 'partie5'],
};

/** Types ajoutés après les premiers styles personnels : facultatifs pour un style personnel (une scène absente : un avertissement). */
const TYPES_RECENTS = ['moyeu'];

/** Clés qu'on peut laisser sans texte : l'élément qui les porte est alors retiré de la scène. */
const OPTIONNELLES = { liste: ['point3', 'point4'], moyeu: ['partie4', 'partie5'] };

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

/** Sections reprises dans la fiche du relecteur (agent critique) : ce que le style est et n'est pas, sa logique de couleur,
 * ses pièges. La fiche entière dépasserait le budget de lecture du critique (15 000 jetons avant d'écrire). */
const SECTIONS_CRITIQUE = [SECTIONS_FICHE[1], SECTIONS_FICHE[3], SECTIONS_FICHE[9]];

module.exports = { TYPES, TYPES_RECENTS, OPTIONNELLES, FAMILLES, NOM_STYLE, CATEGORIES, TYPES_ENTREE, SECTIONS_FICHE, SECTIONS_ANIMATEUR, SECTIONS_CRITIQUE };
