/* Pulse Motion – transitions d'entrée d'une scène.
 *
 * styleTransition(type, q) : style inline de la scène qui entre, q ∈ [0,1] étant
 * la progression de la transition. Pour la première scène, l'entrée se fait
 * depuis le fond, sans chevauchement.
 * styleSortie(type, q) : style de la scène qui sort pendant l'entrée de la suivante
 * (poussée, traversée), ou null quand la transition ne touche pas la scène qui sort.
 * Propriétés produites : opacity, transform, clip-path et filter (seulement blur(…cqh)).
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

  var TRANSITIONS = ['aucune', 'fondu', 'glissement', 'balayage', 'rideau', 'zoom', 'coupe',
    'whip', 'poussee', 'traversee', 'cercle', 'volets', 'retournement'];
  var douce = C.courbe('cubic', 'inout');
  // Le whip pan part vite et freine fort : l'essentiel du trajet se fait dans le flou.
  var rapide = C.courbe('expo', 'inout');
  var BANDES_VOLETS = 8;

  function arrondi(x) { return Math.round(x * 10000) / 10000; }
  function style(opacity, transform, clipPath, filter) {
    return { opacity: opacity || '', transform: transform || '', clipPath: clipPath || '', filter: filter || '' };
  }

  /** Volets : BANDES_VOLETS bandes verticales, chacune ouverte à k de sa largeur depuis son bord gauche, en un seul polygone
   *  (les bandes sont reliées par le bas de l'image, sur une épaisseur nulle). */
  function polygoneVolets(k) {
    var largeur = 100 / BANDES_VOLETS;
    var points = ['0% 100%'];
    for (var i = 0; i < BANDES_VOLETS; i++) {
      var g = arrondi(i * largeur);
      var d = arrondi(i * largeur + k * largeur);
      points.push(g + '% 100%', g + '% 0%', d + '% 0%', d + '% 100%');
    }
    points.push('100% 100%');
    return 'polygon(' + points.join(', ') + ')';
  }

  /** -> { opacity, transform, clipPath, filter } ('' = valeur par défaut) */
  function styleTransition(type, q) {
    var q01 = q < 0 ? 0 : q > 1 ? 1 : q;
    var k = douce(q01);
    if (k >= 1 || type === 'aucune' || !type) return style();
    if (type === 'fondu') return style(String(arrondi(k)));
    if (type === 'glissement') return style('', 'translateX(' + arrondi((1 - k) * 100) + '%)');
    if (type === 'balayage') return style('', '', 'inset(0 ' + arrondi((1 - k) * 100) + '% 0 0)');
    if (type === 'rideau') { var m = arrondi((1 - k) * 50); return style('', '', 'inset(0 ' + m + '% 0 ' + m + '%)'); }
    if (type === 'zoom') return style(String(arrondi(k)), 'scale(' + arrondi(0.86 + 0.14 * k) + ')');
    if (type === 'coupe') return style();
    if (type === 'whip') {
      var r = rapide(q01);
      // Flou de mouvement : nul aux deux bouts, 4 cqh au plus fort de la vitesse (milieu).
      var flou = arrondi(4 * Math.sin(Math.PI * q01));
      return style('', 'translateX(' + arrondi((1 - r) * 100) + '%)', '', flou > 0 ? 'blur(' + flou + 'cqh)' : '');
    }
    if (type === 'poussee') return style('', 'translateX(' + arrondi((1 - k) * 100) + '%)');
    if (type === 'traversee') return style(String(arrondi(k)), 'scale(' + arrondi(0.7 + 0.3 * k) + ')');
    // Cercle : rayon 0 → 75 % (le coin de l'image, à √(50² + 50²) ≈ 71 %, est couvert à la fin).
    if (type === 'cercle') return style('', '', 'circle(' + arrondi(k * 75) + '% at 50% 50%)');
    if (type === 'volets') return style('', '', polygoneVolets(k));
    // Retournement : de profil (90°, invisible) à de face, comme une carte qu'on retourne.
    if (type === 'retournement') return style('', 'perspective(200cqh) rotateY(' + arrondi((1 - k) * 90) + 'deg)');
    throw new Error('Transition inconnue : « ' + type + ' ». Transitions : ' + TRANSITIONS.join(', '));
  }

  /** -> { opacity, transform, filter } de la scène qui sort, ou null (transition sans effet sur elle). */
  function styleSortie(type, q) {
    var k = douce(q < 0 ? 0 : q > 1 ? 1 : q);
    if (type === 'poussee') return { opacity: '', transform: k >= 1 ? '' : 'translateX(' + arrondi(-k * 100) + '%)', filter: '' };
    if (type === 'traversee') {
      if (k >= 1) return { opacity: '', transform: '', filter: '' };
      return { opacity: String(arrondi(1 - k)), transform: 'scale(' + arrondi(1 + 0.6 * k) + ')', filter: '' };
    }
    return null;
  }

  return { TRANSITIONS: TRANSITIONS, styleTransition: styleTransition, styleSortie: styleSortie };
});
