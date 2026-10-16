/* Pulse Motion – naissances calculées : quelle particule occupe quelle case.
 *
 * Miroir exact, en JavaScript, des fonctions occupant() et naissanceDuPas() du WGSL de
 * simulation.js : il sert aux tests et documente la règle.
 *   - émission continue : la n-ième particule (n < nTotal) naît à τ = n / debit, case n mod capContinu ; débit modulé
 *     (P7, em.son) : elle ne naît que si alea(graine, émetteur, n, 30) < coefficient du débit à τ / em.son.cMax ;
 *   - salve : ses particules naissent ensemble à τ = t, cases [debut, debut + nombre) ;
 *   - salve au son (P7, em.salveSon) : cases [debut, debut + nombre × max), la j-ième salve à τ = em.son.instants[j] ;
 *   - enfant : case = ((caseParent × G) + gen mod G) × k + j.
 * em : émetteur compilé (capContinu, nTotal, debit, salves, k, G, index ; son : tables posées par la page).
 *
 * Module pur : Node (require) ; non chargé dans la page.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.naissances = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function pcg(v) {
    var s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
    var w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
    return ((w >>> 22) ^ w) >>> 0;
  }

  /** Hasard reproductible dans [0, 1) : comme alea() du WGSL. */
  function alea(graine, emetteur, n, canal) {
    return (pcg((graine ^ pcg((emetteur ^ pcg((n ^ pcg(canal)) >>> 0)) >>> 0)) >>> 0) >>> 8) / 16777216;
  }

  /** Coefficient du son (0 débit, 1 forces, 2 couleur, 3 taille) à τ : 60 points par seconde, linéaire ; 1 sans table. */
  function coefSon(em, quel, tau) {
    var s = em.son;
    if (!s) return 1;
    var x = Math.min(Math.max(tau * 60, 0), s.n - 1);
    var i = Math.floor(x);
    var j = Math.min(i + 1, s.n - 1);
    var b = quel * s.n;
    return s.coefs[b + i] * (1 - (x - i)) + s.coefs[b + j] * (x - i);
  }

  /** Naissances continues strictement avant τ. */
  function nesAvant(em, tau) { return Math.min(em.nTotal, Math.max(0, Math.ceil(tau * em.debit))); }

  /** Particule qui occupe la case s parmi les naissances strictement avant τ (vivante ou non). */
  function occupant(em, s, tau, graine) {
    if (s < em.capContinu) {
      var nes = nesAvant(em, tau);
      if (nes <= s) return null;
      var n = s + em.capContinu * Math.floor((nes - 1 - s) / em.capContinu);
      var t = n / em.debit;
      if (em.son && alea((graine || 0) >>> 0, em.index, n, 30) >= coefSon(em, 0, t) / em.son.cMax) return null;
      return { n: n, gen: Math.floor(n / em.capContinu), t: t };
    }
    var b = em.salveSon;
    if (b && s >= b.debut && s < b.debut + b.nombre * b.max) {
      var tj = em.son ? em.son.instants[Math.floor((s - b.debut) / b.nombre)] : Infinity;
      return tj < tau ? { n: em.nTotal + (s - em.capContinu), gen: 0, t: tj } : null;
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
  function naissanceDuPas(em, s, tau0, tau1, graine) {
    var r = occupant(em, s, tau1, graine);
    if (!r) return null;
    if (s < em.capContinu ? r.n < nesAvant(em, tau0) : r.t < tau0) return null;
    return r;
  }

  function caseEnfant(em, s) {
    return { caseParent: Math.floor(s / (em.k * em.G)), generation: Math.floor(s / em.k) % em.G, j: s % em.k };
  }

  return { alea: alea, coefSon: coefSon, nesAvant: nesAvant, occupant: occupant, naissanceDuPas: naissanceDuPas, caseEnfant: caseEnfant };
});
