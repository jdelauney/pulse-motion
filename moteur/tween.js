/* Pulse Motion – interpolation de valeurs (attribut data-tween).
 *
 *   data-tween="opacity 0→1 back-out; --x -10cqh→0cqh; nombre 0→1250 cubic-out"
 *
 * Chaque clause : propriété, valeur de départ → valeur d'arrivée (même unité),
 * courbe facultative (cubic-out par défaut). « -> » est accepté pour « → ».
 * La propriété spéciale « nombre » remplace le texte de l'élément par la valeur
 * formatée en français (1 250).
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var C = typeof require === 'function' && typeof module === 'object' ? require('./courbes.js') : racine.M;
  var api = fabrique(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var VALEUR = /^(-?\d*\.?\d+)([a-z%]*)$/i;

  function lireValeur(texte, clause) {
    var m = VALEUR.exec(texte);
    if (!m) throw new Error('data-tween : valeur « ' + texte + ' » illisible dans « ' + clause + ' » (exemples : 0, 1.5, 10cqh, 45deg).');
    var decimales = (m[1].split('.')[1] || '').length;
    return { nombre: parseFloat(m[1]), unite: m[2], decimales: decimales };
  }

  /** "opacity 0→1 back-out; …" -> [{ prop, de, a, unite, decimales, courbe, nomCourbe }] */
  function analyserTween(texte) {
    return String(texte).split(';').map(function (s) { return s.trim(); }).filter(Boolean).map(function (clause) {
      var morceaux = clause.replace(/->/g, '→').split(/\s+/);
      if (morceaux.length < 2 || morceaux[1].indexOf('→') < 0) {
        throw new Error('data-tween : clause « ' + clause + ' » attendue sous la forme « propriété départ→arrivée [courbe] ».');
      }
      var bornes = morceaux[1].split('→');
      var de = lireValeur(bornes[0], clause);
      var a = lireValeur(bornes[1], clause);
      // Un zéro sans unité (« 0→10cqh ») prend l'unité de l'autre borne.
      if (!de.unite && de.nombre === 0) de.unite = a.unite;
      if (!a.unite && a.nombre === 0) a.unite = de.unite;
      if (de.unite !== a.unite) {
        throw new Error('data-tween : unités différentes (« ' + de.unite + ' » et « ' + a.unite + ' ») dans « ' + clause + ' ».');
      }
      var nomCourbe = morceaux[2] || 'cubic-out';
      return {
        prop: morceaux[0],
        de: de.nombre,
        a: a.nombre,
        unite: a.unite,
        decimales: Math.max(de.decimales, a.decimales),
        nomCourbe: nomCourbe,
        courbe: C.courbeNommee(nomCourbe),
      };
    });
  }

  /** Valeur d'une clause pour une progression p ∈ [0,1], sous forme de nombre. */
  function valeurTween(clause, p) {
    return clause.de + (clause.a - clause.de) * clause.courbe(p);
  }

  /** Formate un nombre en français : séparateur de milliers, virgule décimale. */
  function nombre(v, decimales) {
    var d = decimales || 0;
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  }

  /** Texte CSS à écrire pour une clause (avec unité), ou texte affiché pour « nombre ». */
  function texteTween(clause, p) {
    var v = valeurTween(clause, p);
    if (clause.prop === 'nombre') return nombre(v, clause.decimales);
    return String(Math.round(v * 10000) / 10000) + clause.unite;
  }

  return { analyserTween: analyserTween, valeurTween: valeurTween, texteTween: texteTween, nombre: nombre };
});
