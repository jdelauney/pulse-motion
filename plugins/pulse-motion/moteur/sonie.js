/* Pulse Motion – sonie (ITU-R BS.1770 : pondération K, porte absolue −70 LUFS, porte relative −10 LU),
 * normalisation vers une sonie cible et limiteur à anticipation (crête échantillon).
 *
 * Module pur : chargé tel quel dans la page (global M.sonie) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.sonie = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Deux étages biquadratiques de la pondération K pour un taux donné (formules de BS.1770). */
  function etagesK(taux) {
    var K = Math.tan(Math.PI * 1681.974450955533 / taux), Q = 0.7071752369554196;
    var Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    var a0 = 1 + K / Q + K * K;
    var plateau = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    K = Math.tan(Math.PI * 38.13547087602444 / taux); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
    var passeHaut = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    return [plateau, passeHaut];
  }

  /** Énergie pondérée K, sommée sur les canaux, par pas de 100 ms. -> { e: Float64Array, pas, n } */
  function energies(canaux, taux) {
    var pas = Math.max(1, Math.round(taux / 10));
    var n = canaux[0].length, nPas = Math.ceil(n / pas);
    var e = new Float64Array(nPas);
    var et = etagesK(taux), p = et[0], h = et[1];
    canaux.forEach(function (x) {
      var x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
      for (var i = 0; i < n; i++) {
        var v = x[i];
        var y = p.b0 * v + p.b1 * x1 + p.b2 * x2 - p.a1 * y1 - p.a2 * y2;
        x2 = x1; x1 = v; y2 = y1; y1 = y;
        var z = h.b0 * y + h.b1 * u1 + h.b2 * u2 - h.a1 * z1 - h.a2 * z2;
        u2 = u1; u1 = y; z2 = z1; z1 = z;
        e[(i / pas) | 0] += z * z;
      }
    });
    return { e: e, pas: pas, n: n };
  }

  function lk(z) { return -0.691 + 10 * Math.log10(z); }

  function creteEchantillon(canaux) {
    var m = 0;
    canaux.forEach(function (x) { for (var i = 0; i < x.length; i++) { var a = Math.abs(x[i]); if (a > m) m = a; } });
    return m > 0 ? 20 * Math.log10(m) : -Infinity;
  }

  /** -> { integree (LUFS, -Infinity si silence), crete (dBFS) } */
  function mesurer(canaux, taux) {
    var r = energies(canaux, taux), e = r.e, pas = r.pas;
    var blocs = [];
    // Blocs de 400 ms, recouvrement de 75 % (pas de 100 ms) ; un son plus court forme un seul bloc.
    for (var j = 0; j + 4 <= Math.floor(r.n / pas); j++) blocs.push((e[j] + e[j + 1] + e[j + 2] + e[j + 3]) / (4 * pas));
    if (!blocs.length && r.n > 0) {
      var total = 0;
      for (var k = 0; k < e.length; k++) total += e[k];
      blocs.push(total / r.n);
    }
    var absolus = blocs.filter(function (z) { return z > 0 && lk(z) > -70; });
    if (!absolus.length) return { integree: -Infinity, crete: creteEchantillon(canaux) };
    var moyenne = absolus.reduce(function (a, b) { return a + b; }, 0) / absolus.length;
    var seuil = lk(moyenne) - 10;
    var relatifs = absolus.filter(function (z) { return lk(z) > seuil; });
    var m = relatifs.reduce(function (a, b) { return a + b; }, 0) / relatifs.length;
    return { integree: lk(m), crete: creteEchantillon(canaux) };
  }

  /** Limiteur à anticipation (5 ms) : aucune crête échantillon au-dessus de seuil (linéaire) ; relâchement 100 ms. */
  function limiter(canaux, taux, seuil) {
    var n = canaux[0].length, L = Math.max(1, Math.round(0.005 * taux)), i, c;
    // Rien à limiter : aucune copie (le cas courant après la normalisation).
    var depasse = false;
    for (c = 0; c < canaux.length && !depasse; c++) for (i = 0; i < n; i++) if (Math.abs(canaux[c][i]) > seuil) { depasse = true; break; }
    if (!depasse) return;
    var r = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var p = 0;
      for (c = 0; c < canaux.length; c++) { var a = Math.abs(canaux[c][i]); if (a > p) p = a; }
      r[i] = p > seuil ? seuil / p : 1;
    }
    // Minimum glissant de r sur [i, i + L] (file monotone), puis rampe d'attaque linéaire sur L échantillons.
    var m = new Float32Array(n), file = new Int32Array(n), tete = 0, queue = 0;
    for (i = n - 1; i >= 0; i--) {
      while (queue > tete && r[file[queue - 1]] >= r[i]) queue--;
      file[queue++] = i;
      while (file[tete] > i + L) tete++;
      m[i] = r[file[tete]];
    }
    for (i = n - 2; i >= 0; i--) m[i] = Math.min(m[i], m[i + 1] + 1 / L);
    var k = 1 - Math.exp(-1 / (0.1 * taux)), g = m[0];
    for (i = 0; i < n; i++) {
      g = Math.min(m[i], g + (1 - g) * k);
      for (c = 0; c < canaux.length; c++) canaux[c][i] *= g;
    }
  }

  /** Gain vers la sonie cible, puis limiteur (crête à plafond − 0,5 dB) ; la sonie perdue par le limiteur est
   *  rattrapée en quelques passes. Modifie les canaux. -> { gain (dB au total), integree, crete } */
  function normaliser(canaux, taux, options) {
    var o = options || {};
    var cible = o.cible === undefined ? -16 : o.cible;
    var plafond = o.plafond === undefined ? -1.5 : o.plafond;
    var seuil = Math.pow(10, (plafond - 0.5) / 20);
    var mesure = mesurer(canaux, taux);
    if (!isFinite(mesure.integree)) return { gain: 0, integree: mesure.integree, crete: mesure.crete };
    var total = 0;
    for (var passe = 0; passe < 4; passe++) {
      var ecart = Math.min(cible - mesure.integree, 40 - total);
      if (passe > 0 && Math.abs(ecart) < 0.2) break;
      var g = Math.pow(10, ecart / 20);
      canaux.forEach(function (x) { for (var i = 0; i < x.length; i++) x[i] *= g; });
      total += ecart;
      limiter(canaux, taux, seuil);
      mesure = mesurer(canaux, taux);
    }
    return { gain: total, integree: mesure.integree, crete: mesure.crete };
  }

  return { mesurer: mesurer, normaliser: normaliser, limiter: limiter };
});
