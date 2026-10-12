/* Pulse Motion – temps figé (data-gel) et accéléré (data-vitesse) d'un conteneur.
 *
 *   <div data-gel="1.2+1.5">         à 1,2 s, le contenu s'arrête 1,5 s puis reprend où il en était
 *   <div data-vitesse="3+2 x2">       de 3 s à 5 s, le contenu va deux fois plus vite
 *
 * Plages « début+durée » en secondes de la scène (ou temps musicaux « 2t »), séparées par « ; »,
 * sans chevauchement. Le temps vu par le contenu est f(temps de la scène).
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var Mi = typeof require === 'function' && typeof module === 'object' ? require('./minutage.js') : racine.M;
  var api = fabrique(Mi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Mi) {
  'use strict';

  var PLAGE = /^([^+\s]+)\+([^+\s]+)$/;
  var FACTEUR = /^[x×](\d*\.?\d+)$/;

  function lireTemps(texte, attribut, plage, dureeTemps) {
    var lu = Mi.lireSecondes(texte, dureeTemps);
    if (lu.erreur === 'tempo-absent') throw new Error(attribut + ' : « ' + texte + ' » est en temps musicaux, mais le déroulé n\'a pas de « tempo » (plage « ' + plage + ' »).');
    if (lu.erreur) throw new Error(attribut + ' : temps « ' + texte + ' » illisible dans « ' + plage + ' ».');
    return lu.valeur;
  }

  function lirePlages(texte, attribut, dureeTemps) {
    if (texte === null || texte === undefined) return [];
    return String(texte).split(';').map(function (s) { return s.trim(); }).filter(Boolean).map(function (plage) {
      var morceaux = plage.split(/\s+/);
      var m = PLAGE.exec(morceaux[0]);
      if (!m) throw new Error(attribut + ' : plage « ' + plage + ' » attendue sous la forme « début+durée »' + (attribut === 'data-vitesse' ? ' suivie du facteur (ex. 1+2 x2).' : ' (ex. 1.2+1.5).'));
      var facteur = 0;
      if (attribut === 'data-vitesse') {
        if (!morceaux[1]) throw new Error('data-vitesse : facteur manquant dans « ' + plage + ' » (ex. 1+2 x2).');
        var f = FACTEUR.exec(morceaux[1]);
        if (!f) throw new Error('data-vitesse : facteur « ' + morceaux[1] + ' » illisible dans « ' + plage + ' » (ex. x2, x0.5).');
        facteur = parseFloat(f[1]);
        if (!(facteur > 0)) throw new Error('data-vitesse : le facteur doit être supérieur à 0 dans « ' + plage + ' » (pour arrêter le temps : data-gel).');
      }
      return { debut: lireTemps(m[1], attribut, plage, dureeTemps), duree: lireTemps(m[2], attribut, plage, dureeTemps), facteur: facteur, texte: plage, attribut: attribut };
    });
  }

  /** -> [{ debut, duree, facteur }] triées (facteur 0 : gel). Lève une Error en français. */
  function analyserTemps(gel, vitesse, dureeTemps) {
    var plages = lirePlages(gel, 'data-gel', dureeTemps).concat(lirePlages(vitesse, 'data-vitesse', dureeTemps));
    plages.sort(function (a, b) { return a.debut - b.debut; });
    for (var i = 1; i < plages.length; i++) {
      var p = plages[i - 1], q = plages[i];
      if (q.debut < p.debut + p.duree) {
        throw new Error(q.attribut + ' : les plages « ' + p.texte + ' » et « ' + q.texte + ' » se chevauchent.');
      }
    }
    return plages.map(function (p) { return { debut: p.debut, duree: p.duree, facteur: p.facteur }; });
  }

  /** Temps vu par le contenu au temps tau de la scène. */
  function appliquerTemps(plages, tau) {
    var resultat = tau;
    plages.forEach(function (p) {
      var dedans = Math.max(0, Math.min(p.duree, tau - p.debut));
      resultat += (p.facteur - 1) * dedans;
    });
    return Math.round(resultat * 1e6) / 1e6;
  }

  return { analyserTemps: analyserTemps, appliquerTemps: appliquerTemps };
});
