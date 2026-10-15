/* Pulse Motion – maillage des structures (cordes et tissus, P5b) : liens, coloration.
 *
 * Sommets d'une structure de C colonnes et R lignes (corde : R = 1) : v = r × C + c.
 * Lien : code = v × 8 + genre ; v : sommet propriétaire (coin haut gauche de sa cellule pour les diagonales) ; genres :
 *   0 H (v, v + 1), 1 V (v, v + C), 2 D1 (v, v + C + 1), 3 D2 (v + 1, v + C) : structure et cisaillement ;
 *   4 BH (v, v + 2), 5 BV (v, v + 2C) : flexion (deux sommets d'écart). Corde : H (segments) et BH (flexion).
 * couleur(genre, r, c) : H c mod 2 ; V 2 + r mod 2 ; D1 et D2 d'une même cellule 4 + 2 (r mod 2) + c mod 2 ; BH 8 + ⌊c/2⌋ mod 2 ;
 *   BV 10 + ⌊r/2⌋ mod 2. Deux liens d'une même couleur n'ont aucun sommet commun ; un sommet intérieur d'un tissu touche
 *   12 liens : 12 couleurs (corde : 4, numéros 0, 1, 8, 9).
 * liens(C, R) -> { codes: Uint32Array (rangés par couleur, puis par code), debuts: Uint32Array(13) }
 *   couleur k : codes[debuts[k] .. debuts[k + 1]) ; une passe parallèle par couleur, dans l'ordre des couleurs.
 * existe(genre, r, c, C, R), extremites(code, C) -> [a, b]
 *
 * Module pur : chargé tel quel dans la page (global M.maillage) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.maillage = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COULEURS = 12;
  var GENRES = 6;
  var NOMS = ['H', 'V', 'D1', 'D2', 'BH', 'BV'];

  /** Le lien du genre donné, porté par le sommet (r, c), existe dans une grille C × R. */
  function existe(g, r, c, C, R) {
    switch (g) {
      case 0: return c + 1 < C;
      case 1: return r + 1 < R;
      case 2: case 3: return c + 1 < C && r + 1 < R;
      case 4: return c + 2 < C;
      default: return r + 2 < R;
    }
  }

  function couleur(g, r, c) {
    switch (g) {
      case 0: return c % 2;
      case 1: return 2 + r % 2;
      case 2: case 3: return 4 + 2 * (r % 2) + c % 2;
      case 4: return 8 + (c >> 1) % 2;
      default: return 10 + (r >> 1) % 2;
    }
  }

  function extremites(code, C) {
    var v = Math.floor(code / 8);
    switch (code % 8) {
      case 0: return [v, v + 1];
      case 1: return [v, v + C];
      case 2: return [v, v + C + 1];
      case 3: return [v + 1, v + C];
      case 4: return [v, v + 2];
      default: return [v, v + 2 * C];
    }
  }

  function liens(C, R) {
    var parCouleur = [];
    var k;
    for (k = 0; k < COULEURS; k++) parCouleur.push([]);
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < C; c++) {
        for (var g = 0; g < GENRES; g++) {
          if (existe(g, r, c, C, R)) parCouleur[couleur(g, r, c)].push((r * C + c) * 8 + g);
        }
      }
    }
    var debuts = new Uint32Array(COULEURS + 1);
    var n = 0;
    for (k = 0; k < COULEURS; k++) { debuts[k] = n; n += parCouleur[k].length; }
    debuts[COULEURS] = n;
    var codes = new Uint32Array(n);
    var o = 0;
    for (k = 0; k < COULEURS; k++) { codes.set(parCouleur[k], o); o += parCouleur[k].length; }
    return { codes: codes, debuts: debuts };
  }

  return { COULEURS: COULEURS, GENRES: GENRES, NOMS: NOMS, existe: existe, couleur: couleur, extremites: extremites, liens: liens };
});
