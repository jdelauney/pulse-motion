/* Pulse Motion – cordes pincées par modèle physique (spec Styles et réalisation, 5.8) : Karplus-Strong étendu (excitation
 * de bruit tirée d'une graine, filtrée selon la brillance et la position du pincement, boucle à retard fractionnaire,
 * filtre d'amortissement réglé sur la durée de résonance) ; kalimba par synthèse modale (lames : partiels 1, 6,27, 17,55).
 * Quatre préréglages : guitare, harpe, kalimba, pizzicato. La graine change le bruit d'excitation, le désaccord (±3 cents),
 * la brillance et le niveau : quatre variantes par note jouées tour à tour (round-robin) évitent l'effet mitraillette.
 *
 *   calculer({ frequence, duree, prereglage, graine, taux, velocite }) -> Float32Array (mono, taux échantillons par seconde)
 *   variante(t, frequence) -> 0..3 : variante d'une note, tirée de son instant et de sa hauteur (même note, même variante)
 *
 * Réécrit en JavaScript d'après lemo-opuscar (core/audio/pluck.py, sélection round-robin de sampler.py ; MIT, © 2026 LemoLab).
 * Module pur : chargé tel quel dans la page (global M.synthe.corde) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.synthe = racine.M.synthe || {}; racine.M.synthe.corde = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // resonance : durée (s) pour perdre 60 dB à 220 Hz (plus courte dans l'aigu) ; brillance : 0 (sourd) à 1 ; position : point
  // de pincement (fraction de la corde) ; etouffe : durée (s) de l'étouffement après la fin de la note ; niveau : crête visée.
  var PREREGLAGES = {
    guitare: { resonance: 2.6, brillance: 0.62, position: 0.18, etouffe: 0.9, niveau: 0.34 },
    harpe: { resonance: 3.6, brillance: 0.45, position: 0.5, etouffe: 1.6, niveau: 0.32, douceur: 0.004 },
    pizzicato: { resonance: 0.38, brillance: 0.36, position: 0.3, etouffe: 0.12, niveau: 0.36 },
    kalimba: { modal: true, partiels: [[1, 1, 1.9], [6.27, 0.22, 0.32], [17.55, 0.06, 0.1]], etouffe: 0.8, niveau: 0.3 },
  };

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function variante(t, frequence) {
    var h = (Math.round(t * 1000) * 73856093) ^ (Math.round(frequence * 100) * 19349663);
    return ((h % 4) + 4) % 4;
  }

  /** Longueur rendue : la note, puis son étouffement, bornée par la résonance. */
  function longueur(p, duree) {
    var res = p.modal ? p.partiels[0][2] * 2 : p.resonance;
    return Math.max(0.12, Math.min(res, Math.max(0.05, duree) + p.etouffe));
  }

  function karplus(x, p, f, duree, taux, hasard) {
    var n = x.length;
    var periode = taux / f;
    var entier = Math.floor(periode), frac = periode - entier;
    var taille = entier + 2;
    var ligne = new Float64Array(taille);
    // Excitation : bruit à graine, adouci (brillance), avec le creux du point de pincement (filtre en peigne).
    var brillance = Math.max(0.05, Math.min(1, p.brillance * (0.9 + 0.2 * hasard())));
    var prec = 0;
    var bruit = new Float64Array(taille);
    for (var i = 0; i < taille; i++) {
      var b = hasard() * 2 - 1;
      prec = prec + brillance * (b - prec);
      bruit[i] = prec;
    }
    var decal = Math.max(1, Math.round(p.position * entier));
    for (var j = 0; j < taille; j++) ligne[j] = bruit[j] - (j >= decal ? bruit[j - decal] : 0);
    // Gain par période pour -60 dB en resonance secondes (plus court dans l'aigu, comme une vraie corde).
    var res = p.resonance * Math.pow(220 / f, 0.35);
    var gainPeriode = Math.pow(10, -3 / (res * f));
    var finNote = Math.round(Math.max(0.05, duree) * taux);
    var gainEtouffe = Math.pow(10, -3 / (Math.max(0.03, p.etouffe) * f));
    var ecriture = 0, precedent = 0;
    var attaque = Math.max(1, Math.round((p.douceur || 0.0015) * taux));
    for (var k = 0; k < n; k++) {
      // Lecture fractionnaire (interpolation linéaire) de la ligne à retard, puis moyenne à deux points (amortissement).
      var lu = ligne[(ecriture + taille - entier) % taille] * (1 - frac) + ligne[(ecriture + taille - entier - 1) % taille] * frac;
      var g = k < finNote ? gainPeriode : gainEtouffe;
      var sortie = g * 0.5 * (lu + precedent) / Math.cos(Math.PI * f / taux);
      precedent = lu;
      ligne[ecriture] = sortie;
      ecriture = (ecriture + 1) % taille;
      x[k] = sortie * (k < attaque ? k / attaque : 1);
    }
  }

  function modale(x, p, f, duree, taux, hasard) {
    var n = x.length, finNote = Math.round(Math.max(0.05, duree) * taux);
    p.partiels.forEach(function (q) {
      var fq = f * q[0] * (1 + (hasard() - 0.5) * 0.002);
      if (fq >= taux / 2.2) return;
      var amp = q[1] * (0.9 + 0.2 * hasard()), phase = hasard() * 2 * Math.PI;
      var tau = q[2] / 6.9, tauEtouffe = Math.min(tau, p.etouffe / 6.9);
      var w = 2 * Math.PI * fq / taux;
      for (var k = 0; k < n; k++) {
        var tps = k / taux;
        var e = k < finNote ? Math.exp(-tps / tau) : Math.exp(-finNote / taux / tau) * Math.exp(-(k - finNote) / taux / tauEtouffe);
        x[k] += amp * e * Math.sin(w * k + phase);
      }
    });
    // Petit claquement de la lame sous le pouce : 3 ms de bruit doux.
    var clic = Math.round(0.003 * taux);
    for (var c = 0; c < clic && c < n; c++) x[c] += 0.12 * (hasard() * 2 - 1) * (1 - c / clic);
    var att = Math.round(0.001 * taux);
    for (var a = 0; a < att && a < n; a++) x[a] *= a / att;
  }

  function calculer(o) {
    var p = PREREGLAGES[o.prereglage] || PREREGLAGES.guitare;
    var taux = o.taux || 48000;
    var f = Math.max(20, Math.min(taux / 4, o.frequence || 220));
    var hasard = mulberry32(((o.graine || 0) * 2654435761 + Math.round(f * 100)) | 0);
    // Variation de la note : désaccord de ±3 cents, niveau de ±8 %.
    var desaccord = Math.pow(2, (hasard() - 0.5) * 6 / 1200);
    var niveau = p.niveau * (0.92 + 0.16 * hasard()) * (o.velocite === undefined ? 1 : o.velocite);
    var duree = o.duree > 0 ? o.duree : 0.5;
    var x = new Float32Array(Math.round(longueur(p, duree) * taux));
    var calcul = new Float64Array(x.length);
    if (p.modal) modale(calcul, p, f * desaccord, duree, taux, hasard);
    else karplus(calcul, p, f * desaccord, duree, taux, hasard);
    var crete = 0;
    for (var i = 0; i < calcul.length; i++) crete = Math.max(crete, Math.abs(calcul[i]));
    var k = crete > 0 ? niveau / crete : 0;
    // Fondu de 20 ms à la fin du tampon : la note ne s'arrête jamais net.
    var fondu = Math.round(0.02 * taux);
    for (var j = 0; j < x.length; j++) x[j] = calcul[j] * k * (j >= x.length - fondu ? (x.length - j) / fondu : 1);
    return x;
  }

  return { PREREGLAGES: PREREGLAGES, calculer: calculer, variante: variante, longueur: longueur };
});
