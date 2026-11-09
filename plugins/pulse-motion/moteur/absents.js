/* Pulse Motion – points d'entrée des groupes de modules absents de la page (moteur à la carte, spec Rapidité 5.19).
 * Toujours inclus, en dernier. Une page sans personnage, sans effet ou sans son réactif appelle quand même
 * M.demarrerPersonnages(), M.demarrerParticules() et M.demarrerSonReactif() : ici, ils ne font rien.
 * M.groupes : groupes de modules inclus (diagnostic), écrit par l'assemblage juste avant ce module.
 * Navigateur seulement (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  function rien() {}
  ['demarrerPersonnages', 'demarrerParticules', 'demarrerSonReactif'].forEach(function (nom) {
    if (typeof M[nom] !== 'function') M[nom] = rien;
  });
  if (!M.groupes) M.groupes = [];
})(typeof globalThis !== 'undefined' ? globalThis : this);
