/* Pulse Motion – mots d'une voix : découpage du texte dit, formes normalisées (ancres « mot: »),
 * calage approché des mots sur une prise (énergie de la parole, prorata des lettres).
 * L'alignement sur une transcription (Whisper) s'ajoute au plan 3.
 *
 * Module pur : chargé tel quel dans la page (global M.aligner) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.aligner = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FENETRE = 0.02;      // 20 ms
  var SEUIL_PAROLE = -40;  // dBFS
  var PAUSE = 0.25;        // un silence plus long sépare deux groupes de parole

  function normaliserMot(texte) {
    return String(texte).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  /** Texte dit -> [{ w, cles }] ; la ponctuation isolée est rattachée au mot précédent. */
  function decouperMots(texte) {
    var mots = [];
    String(texte).split(/\s+/).filter(Boolean).forEach(function (brut) {
      var cle = normaliserMot(brut);
      if (!cle) { if (mots.length) mots[mots.length - 1].w += ' ' + brut; return; }
      var cles = [cle];
      brut.split(/['’\-]/).map(normaliserMot).forEach(function (p) { if (p && cles.indexOf(p) < 0) cles.push(p); });
      mots.push({ w: brut, cles: cles });
    });
    return mots;
  }

  function lettres(m) { return Math.max(1, m.cles[0].length); }

  /** Groupes de parole [[debut, fin]] (secondes) : fenêtres de 20 ms au-dessus de −40 dBFS, pauses < 0,25 s comblées. */
  function groupesParole(canal, taux) {
    var pas = Math.max(1, Math.round(FENETRE * taux)), seuil = Math.pow(10, SEUIL_PAROLE / 20), groupes = [];
    for (var debut = 0; debut < canal.length; debut += pas) {
      var s = 0, n = 0;
      for (var i = debut; i < Math.min(canal.length, debut + pas); i++) { s += canal[i] * canal[i]; n++; }
      if (Math.sqrt(s / n) < seuil) continue;
      var a = debut / taux, b = Math.min(canal.length, debut + pas) / taux, d = groupes[groupes.length - 1];
      if (d && a - d[1] < PAUSE) d[1] = b; else groupes.push([a, b]);
    }
    return groupes;
  }

  /** Mots du texte calés sur la prise : la durée de parole est partagée au prorata des lettres. -> [{ w, t0, t1 }] */
  function calageApproche(texte, canal, taux) {
    var mots = decouperMots(texte);
    if (!mots.length) return [];
    var duree = canal.length / taux;
    var groupes = groupesParole(canal, taux);
    if (!groupes.length) groupes = [[0, duree]];
    var parole = groupes.reduce(function (t, g) { return t + g[1] - g[0]; }, 0);
    // Temps de parole cumulé -> temps de la prise (en sautant les silences).
    // Un début de mot qui tombe pile en fin de groupe passe au groupe suivant ; une fin de mot reste dans le sien.
    function versPrise(tp, estDebut) {
      for (var k = 0; k < groupes.length; k++) {
        var l = groupes[k][1] - groupes[k][0];
        var dedans = estDebut ? tp < l - 1e-9 : tp <= l + 1e-9;
        if (dedans || k === groupes.length - 1) return groupes[k][0] + Math.min(tp, l);
        tp -= l;
      }
      return duree;
    }
    var total = mots.reduce(function (t, m) { return t + lettres(m); }, 0), cumul = 0;
    return mots.map(function (m) {
      var a = cumul / total * parole;
      cumul += lettres(m);
      var b = cumul / total * parole;
      var t0 = versPrise(a, true), t1 = versPrise(b, false);
      return { w: m.w, t0: Math.round(Math.min(t0, t1) * 1000) / 1000, t1: Math.round(t1 * 1000) / 1000 };
    });
  }

  return { normaliserMot: normaliserMot, decouperMots: decouperMots, calageApproche: calageApproche, groupesParole: groupesParole };
});
