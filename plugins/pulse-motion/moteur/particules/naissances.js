/* Pulse Motion – naissances calculées : quelle particule occupe quelle case.
 *
 * Miroir exact, en JavaScript, des fonctions occupant() et naissanceDuPas() du WGSL de
 * simulation.js : il sert aux tests et documente la règle.
 *   - émission continue : la n-ième particule (n < nTotal) naît à τ = n / debit, case n mod capContinu ;
 *   - salve : ses particules naissent ensemble à τ = t, cases [debut, debut + nombre) ;
 *   - enfant : case = ((caseParent × G) + gen mod G) × k + j.
 * em : émetteur compilé (capContinu, nTotal, debit, salves, k, G).
 *
 * Module pur : Node (require) ; non chargé dans la page.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.naissances = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Naissances continues strictement avant τ. */
  function nesAvant(em, tau) { return Math.min(em.nTotal, Math.max(0, Math.ceil(tau * em.debit))); }

  /** Particule qui occupe la case s parmi les naissances strictement avant τ (vivante ou non). */
  function occupant(em, s, tau) {
    if (s < em.capContinu) {
      var nes = nesAvant(em, tau);
      if (nes <= s) return null;
      var n = s + em.capContinu * Math.floor((nes - 1 - s) / em.capContinu);
      return { n: n, gen: Math.floor(n / em.capContinu), t: n / em.debit };
    }
    for (var i = 0; i < em.salves.length; i++) {
      var v = em.salves[i];
      if (s >= v.debut && s < v.debut + v.nombre) {
        return v.t < tau ? { n: em.nTotal + (s - em.capContinu), gen: 0, t: v.t } : null;
      }
    }
    return null;
  }

  /** Particule née dans la case s pendant [τ0, τ1), ou null. */
  function naissanceDuPas(em, s, tau0, tau1) {
    var r = occupant(em, s, tau1);
    if (!r) return null;
    if (s < em.capContinu ? r.n < nesAvant(em, tau0) : r.t < tau0) return null;
    return r;
  }

  function caseEnfant(em, s) {
    return { caseParent: Math.floor(s / (em.k * em.G)), generation: Math.floor(s / em.k) % em.G, j: s % em.k };
  }

  return { nesAvant: nesAvant, occupant: occupant, naissanceDuPas: naissanceDuPas, caseEnfant: caseEnfant };
});
