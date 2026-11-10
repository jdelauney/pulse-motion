/* Pulse Motion – temps restant d'un export (spec Rendu et export, 5.5).
 *
 * creerEstimation({ total, fenetre?, finales? }) -> { noter(faites, instant, reprises?), restant(instant) }
 *   total : images de la vidéo ; faites : images faites (reprises comprises) ; reprises : images venues de segments repris
 *   d'un export précédent, exclues de la vitesse ; instant : secondes (horloge réelle) ; fenetre : secondes d'images
 *   réellement capturées sur lesquelles la vitesse est mesurée (20 par défaut) ; finales : secondes des phases finales
 *   (son, assemblage, vérification, seconde passe), tirées de la dernière mesure. restant() : secondes, ou null tant que la
 *   vitesse n'est pas connue.
 * texteDuree(secondes) -> « 1 min 10 s », « 45 s »
 * ligneProgression({ faites, total, restant }) -> « Export : 40 % (image 720 / 1800) – encore environ 1 min 10 s »
 *
 * Module pur : chargé par l'aperçu (export-ui.mjs, global M.estimation) et par Node (require). Jamais dans la page livrée.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.estimation = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function creerEstimation(o) {
    var total = Math.max(1, o.total || 1);
    var fenetre = o.fenetre || 20;
    var finales = o.finales || 0;
    // Échantillons [instant, images capturées] ; les reprises avancent « faites » sans compter dans la vitesse.
    var points = [];
    var faitesDernier = 0;
    return {
      noter: function (faites, instant, reprises) {
        var capturees = faites - (reprises || 0);
        faitesDernier = faites;
        var dernier = points[points.length - 1];
        if (dernier && capturees === dernier[1]) return;
        points.push([instant, capturees]);
        // Fenêtre glissante : on garde le dernier point sorti de la fenêtre, pour mesurer sur 20 s pleines.
        while (points.length > 2 && instant - points[1][0] >= fenetre) points.shift();
      },
      restant: function (instant) {
        if (points.length < 2) return null;
        var a = points[0];
        var b = points[points.length - 1];
        var duree = b[0] - a[0];
        if (duree < 0.5 || b[1] <= a[1]) return null;
        var vitesse = (b[1] - a[1]) / duree;
        var reste = Math.max(0, total - faitesDernier) / vitesse + finales - Math.max(0, (instant === undefined ? b[0] : instant) - b[0]);
        return Math.max(0, reste);
      },
    };
  }

  function texteDuree(secondes) {
    var s = Math.max(0, Math.round(secondes));
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60);
    return s % 60 ? m + ' min ' + (s % 60) + ' s' : m + ' min';
  }

  function ligneProgression(o) {
    var pourcent = Math.floor((100 * o.faites) / Math.max(1, o.total));
    var base = 'Export : ' + pourcent + ' % (image ' + o.faites + ' / ' + o.total + ')';
    return o.restant === null || o.restant === undefined ? base : base + ' – encore environ ' + texteDuree(o.restant);
  }

  return { creerEstimation: creerEstimation, texteDuree: texteDuree, ligneProgression: ligneProgression };
});
