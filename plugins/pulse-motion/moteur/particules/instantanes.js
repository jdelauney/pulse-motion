/* Pulse Motion – instantanés de la simulation : d'où repartir pour atteindre un pas donné.
 *
 * L'état k est l'état après k pas de 1/120 s de τ (l'état 0 est vide, toujours disponible).
 * planifier(cible) renvoie les actions à exécuter, dans l'ordre :
 *   { type: 'vider' } | { type: 'restaurer', k } | { type: 'pas', k } (k -> k + 1) | { type: 'sauver', k }
 * Un instantané est pris tous les « intervalle » pas, la première fois que la simulation y passe.
 *
 * Module pur : chargé tel quel dans la page (global M.instantanes) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.instantanes = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PAS_PAR_SECONDE = 120;

  /** Pas entre deux instantanés : 120, doublé tant que tous les instantanés ne tiennent pas dans le budget. */
  function intervallePour(o) {
    var intervalle = PAS_PAR_SECONDE;
    if (!(o.tailleEtat > 0)) return intervalle;
    var max = Math.max(1, Math.floor(o.budget / o.tailleEtat));
    while (Math.ceil(o.pasTotal / intervalle) > max) intervalle *= 2;
    return intervalle;
  }

  function creerPlanificateur(o) {
    var intervalle = o.intervalle;
    var instantanes = [];
    var courant = -1;   // -1 : état des tampons inconnu

    function planifier(cible) {
      var actions = [];
      var depart;
      if (courant >= 0 && cible >= courant && cible - courant <= intervalle) depart = courant;
      else {
        var meilleur = 0;
        instantanes.forEach(function (k) { if (k <= cible && k > meilleur) meilleur = k; });
        if (courant >= 0 && courant <= cible && courant >= meilleur) depart = courant;
        else {
          depart = meilleur;
          actions.push(meilleur === 0 ? { type: 'vider' } : { type: 'restaurer', k: meilleur });
        }
      }
      for (var k = depart; k < cible; k++) {
        actions.push({ type: 'pas', k: k });
        if ((k + 1) % intervalle === 0 && instantanes.indexOf(k + 1) < 0 && k + 1 < cible) {
          actions.push({ type: 'sauver', k: k + 1 });
          instantanes.push(k + 1);
        }
      }
      if (cible > 0 && cible % intervalle === 0 && instantanes.indexOf(cible) < 0 && actions.length) {
        actions.push({ type: 'sauver', k: cible });
        instantanes.push(cible);
      }
      courant = cible;
      return actions;
    }

    return {
      intervalle: intervalle,
      planifier: planifier,
      oublier: function () { instantanes = []; courant = -1; },
      courant: function () { return courant; },
      instantanes: function () { return instantanes.slice().sort(function (a, b) { return a - b; }); },
    };
  }

  return { PAS_PAR_SECONDE: PAS_PAR_SECONDE, intervallePour: intervallePour, creerPlanificateur: creerPlanificateur };
});
