/* Pulse Motion – mouvement vivant : fonctions pures pour des poses qui s'enchaînent et une vie à graine (sans DOM).
 *
 *   var V = M.vivant;                                   // page ; require('./vivant.js') dans Node
 *   V.flow([[0, 0], [0.5, 40], [1, 10]], 0.3)            // interpolation qui passe par chaque clé sans s'y arrêter
 *   V.flowCyclique([[0, 0], [0.5, 4]], 0.9)              // même chose sur une période de 1, raccord sans saut
 *   V.graine(3, V.sel('scene/chef'))                     // nombre stable dans [0, 1[
 *   V.retard(f, t, 0.1, 0.45)                            // 0.45 × (f(t − 0.1) − f(t)) : le bout arrive après la base
 *
 * flow : interpolation d'Hermite cubique monotone (Fritsch–Butland) : tangentes nulles aux extrémités (un geste part et
 * finit au repos), nulles à une clé où le sens change, moyenne harmonique pondérée ailleurs ; jamais de dépassement entre
 * deux clés voisines. Formule de rossark-motion-skill (templates/react-native/motion.ts, licence MIT, © 2026 rossark0),
 * traduite en ES5 ; variante cyclique écrite ici. retard : principe de settle() de take-one (scripts/life.js, licence
 * MIT, © 2026 Tal Siach), réécrit. Graine : hachage entier (Math.imul), même résultat dans Node et dans Chrome.
 * Module pur : chargé tel quel dans la page (M.vivant) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.vivant = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Tangente intérieure de Fritsch–Butland entre deux pentes (h0 : intervalle de gauche, h1 : de droite). */
  function tangente(d0, d1, h0, h1) {
    if (d0 * d1 <= 0) return 0;
    var w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / d0 + w1 / d1);
  }

  /** Tangentes d'une suite de clés [[t, v], …] (extrémités nulles). */
  function tangentes(cles) {
    var n = cles.length, m = new Array(n);
    m[0] = 0; m[n - 1] = 0;
    for (var i = 1; i < n - 1; i++) {
      var h0 = cles[i][0] - cles[i - 1][0], h1 = cles[i + 1][0] - cles[i][0];
      m[i] = h0 > 0 && h1 > 0 ? tangente((cles[i][1] - cles[i - 1][1]) / h0, (cles[i + 1][1] - cles[i][1]) / h1, h0, h1) : 0;
    }
    return m;
  }

  /** Tangentes d'une piste cyclique de période 1 : voisines virtuelles (t_{n−1} − 1, v_{n−1}) et (t_0 + 1, v_0). */
  function tangentesCycliques(cles) {
    var n = cles.length, m = new Array(n);
    if (n < 2) { m[0] = 0; return m; }
    for (var i = 0; i < n; i++) {
      var a = i > 0 ? cles[i - 1] : [cles[n - 1][0] - 1, cles[n - 1][1]];
      var c = i < n - 1 ? cles[i + 1] : [cles[0][0] + 1, cles[0][1]];
      var h0 = cles[i][0] - a[0], h1 = c[0] - cles[i][0];
      m[i] = h0 > 0 && h1 > 0 ? tangente((cles[i][1] - a[1]) / h0, (c[1] - cles[i][1]) / h1, h0, h1) : 0;
    }
    return m;
  }

  /** Segment d'Hermite de (t0, v0, m0) à (t1, v1, m1), à u. */
  function hermite(t0, v0, m0, t1, v1, m1, u) {
    var h = t1 - t0;
    if (!(h > 1e-12)) return v1;
    var s = (u - t0) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1;
  }

  /** Valeur à u d'une piste ponctuelle, tangentes m données (ou calculées). */
  function lire(cles, u, m) {
    var n = cles.length;
    if (!n) return 0;
    if (n === 1 || u <= cles[0][0]) return cles[0][1];
    if (u >= cles[n - 1][0]) return cles[n - 1][1];
    m = m || tangentes(cles);
    for (var i = 0; i < n - 1; i++) if (u < cles[i + 1][0]) return hermite(cles[i][0], cles[i][1], m[i], cles[i + 1][0], cles[i + 1][1], m[i + 1], u);
    return cles[n - 1][1];
  }

  /** Valeur à u (ramené dans [0, 1[) d'une piste cyclique de période 1. */
  function lireCyclique(cles, u, m) {
    var n = cles.length;
    if (!n) return 0;
    if (n === 1) return cles[0][1];
    m = m || tangentesCycliques(cles);
    u -= Math.floor(u);
    var premier = cles[0], dernier = cles[n - 1];
    if (u < premier[0]) return hermite(dernier[0] - 1, dernier[1], m[n - 1], premier[0], premier[1], m[0], u);
    if (u >= dernier[0]) return hermite(dernier[0], dernier[1], m[n - 1], premier[0] + 1, premier[1], m[0], u);
    for (var i = 0; i < n - 1; i++) if (u < cles[i + 1][0]) return hermite(cles[i][0], cles[i][1], m[i], cles[i + 1][0], cles[i + 1][1], m[i + 1], u);
    return dernier[1];
  }

  function flow(cles, u) { return lire(cles, u); }
  function flowCyclique(cles, u) { return lireCyclique(cles, u); }

  /** FNV-1a 32 bits d'un texte -> entier non signé. */
  function sel(texte) {
    var h = 0x811c9dc5, s = String(texte);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /** Nombre stable dans [0, 1[ pour (i, sel) : un tour de mulberry32 sur l'entier mêlé. */
  function graine(i, s) {
    var a = ((s >>> 0) ^ Math.imul((i | 0) + 1, 0x9e3779b1)) | 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** force × (f(t − delai) − f(t)) : ce qu'un bout doit ajouter pour arriver après sa base. */
  function retard(f, t, delai, force) { return force * (f(t - delai) - f(t)); }

  return { flow: flow, flowCyclique: flowCyclique, tangentes: tangentes, tangentesCycliques: tangentesCycliques, lire: lire,
    lireCyclique: lireCyclique, hermite: hermite, sel: sel, graine: graine, retard: retard };
});
