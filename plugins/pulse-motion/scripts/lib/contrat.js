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

module.exports = { TYPES, OPTIONNELLES, FAMILLES, NOM_STYLE };
