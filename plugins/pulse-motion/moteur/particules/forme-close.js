/* Pulse Motion – trajectoire exacte sous accélération constante et traînée linéaire.
 *
 *   v' = A − K v   =>   v(t) = v e + A f,   p(t) = p + v f + A g
 *   avec e = exp(−K t), f = (1 − e) / K, g = (t − f) / K  (développements limités si K t < 1e-3)
 *
 * Miroir exact de balistique() dans le WGSL de simulation.js : sert de référence aux tests
 * (voie rapide, chute libre) et documente l'intégrateur.
 *
 * Module pur : Node (require) ; non chargé dans la page.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.formeClose = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** balistique([x, y], [vx, vy], [ax, ay], K, t) -> { p: [x, y], v: [vx, vy] } */
  function balistique(p, v, A, K, t) {
    var x = K * t;
    var f, g;
    if (x < 1e-3) {
      f = t * (1 - x / 2 + x * x / 6);
      g = t * t * (0.5 - x / 6 + x * x / 24);
    } else {
      f = (1 - Math.exp(-x)) / K;
      g = (t - f) / K;
    }
    var e = 1 - K * f;
    return {
      p: [p[0] + v[0] * f + A[0] * g, p[1] + v[1] * f + A[1] * g],
      v: [v[0] * e + A[0] * f, v[1] * e + A[1] * f],
    };
  }

  return { balistique: balistique };
});
