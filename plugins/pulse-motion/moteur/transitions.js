/* Pulse Motion – transitions d'entrée d'une scène.
 *
 * styleTransition(type, q) : style inline de la scène qui entre, q ∈ [0,1] étant
 * la progression de la transition. Pour la première scène, l'entrée se fait
 * depuis le fond, sans chevauchement.
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

  var TRANSITIONS = ['aucune', 'fondu', 'glissement', 'balayage', 'rideau', 'zoom', 'coupe'];
  var douce = C.courbe('cubic', 'inout');

  function arrondi(x) { return Math.round(x * 10000) / 10000; }

  /** -> { opacity, transform, clipPath } ('' = valeur par défaut) */
  function styleTransition(type, q) {
    var k = douce(q < 0 ? 0 : q > 1 ? 1 : q);
    var vide = { opacity: '', transform: '', clipPath: '' };
    if (k >= 1 || type === 'aucune' || !type) return vide;
    if (type === 'fondu') return { opacity: String(arrondi(k)), transform: '', clipPath: '' };
    if (type === 'glissement') return { opacity: '', transform: 'translateX(' + arrondi((1 - k) * 100) + '%)', clipPath: '' };
    if (type === 'balayage') return { opacity: '', transform: '', clipPath: 'inset(0 ' + arrondi((1 - k) * 100) + '% 0 0)' };
    if (type === 'rideau') { var m = arrondi((1 - k) * 50); return { opacity: '', transform: '', clipPath: 'inset(0 ' + m + '% 0 ' + m + '%)' }; }
    if (type === 'zoom') return { opacity: String(arrondi(k)), transform: 'scale(' + arrondi(0.86 + 0.14 * k) + ')', clipPath: '' };
    if (type === 'coupe') return vide;
    throw new Error('Transition inconnue : « ' + type + ' ». Transitions : ' + TRANSITIONS.join(', '));
  }

  return { TRANSITIONS: TRANSITIONS, styleTransition: styleTransition };
});
