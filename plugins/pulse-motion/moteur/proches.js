/* Pulse Motion – noms proches d'une saisie (spec Retouches et ergonomie, 5.16) : « … introuvable ; vouliez-vous dire « froid »
 * ou « froids » ? » plutôt qu'une liste entière, ou rien.
 *
 * proches(saisie, candidats, { max = 3 }) -> [candidats] les plus proches d'abord : distance de Damerau-Levenshtein (une
 *   transposition compte 1) au plus max(2, 40 % de la longueur de la saisie), ou préfixe commun de 4 lettres et plus ;
 *   comparés sans accents (NFD) ni casse. Rien au-delà du seuil.
 * phrase(liste) -> « vouliez-vous dire « a », « b » ou « c » ? » (vide si la liste est vide)
 * normaliser(texte) -> sans accents, en minuscules
 *
 * Idée : suggest d'explainroo (engine/util.js ; MIT, © 2026 Vincent Schmalbach), réécrite. Module pur : chargé tel quel dans
 * la page (global M.proches, tronc du moteur : minutage.js s'en sert) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.proches = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normaliser(texte) {
    return String(texte === undefined || texte === null ? '' : texte).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /** Distance de Damerau-Levenshtein (alignement optimal des chaînes : une transposition de deux lettres voisines compte 1). */
  function distance(a, b) {
    var n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    var d = [];
    for (var i = 0; i <= n; i++) { d.push([i]); for (var j = 1; j <= m; j++) d[i].push(i ? 0 : j); }
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var cout = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[n][m];
  }

  function prefixeCommun(a, b) {
    var k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    return k;
  }

  function proches(saisie, candidats, options) {
    var max = options && options.max ? options.max : 3;
    var s = normaliser(saisie);
    if (!s) return [];
    var seuil = Math.max(2, Math.floor(0.4 * s.length));
    var vus = {};
    var notes = [];
    (candidats || []).forEach(function (c, ordre) {
      var nom = String(c);
      if (vus[nom]) return;
      vus[nom] = true;
      var n = normaliser(nom);
      var d = distance(s, n);
      var p = prefixeCommun(s, n);
      if (d <= seuil || p >= 4) notes.push({ nom: nom, d: d, p: p, ordre: ordre });
    });
    notes.sort(function (x, y) { return x.d - y.d || y.p - x.p || x.ordre - y.ordre; });
    return notes.slice(0, max).map(function (x) { return x.nom; });
  }

  function phrase(liste) {
    if (!liste || !liste.length) return '';
    var noms = liste.map(function (x) { return '« ' + x + ' »'; });
    var texte = noms.length === 1 ? noms[0] : noms.slice(0, -1).join(', ') + ' ou ' + noms[noms.length - 1];
    return 'vouliez-vous dire ' + texte + ' ?';
  }

  return { proches: proches, phrase: phrase, normaliser: normaliser, distance: distance };
});
