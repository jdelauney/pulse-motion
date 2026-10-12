/* Pulse Motion – catalogue du synthétiseur : instruments, bruitages, sons des transitions, ambiances.
 *
 * Module pur : chargé tel quel dans la page (global M.synthe.catalogue) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.synthe = racine.M.synthe || {}; racine.M.synthe.catalogue = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    INSTRUMENTS: ['pluck', 'pad', 'basse', 'sub', 'kick', 'caisse', 'charleston', 'cloche', 'nappe-bruit', 'riser'],
    PERCUSSIONS: ['kick', 'caisse', 'charleston', 'riser', 'nappe-bruit'],
    BRUITAGES: ['whoosh', 'swoosh-inverse', 'pop', 'clic', 'tic', 'impact', 'basse', 'montee', 'carillon', 'ding', 'blip', 'souffle'],
    // Sons forts : jamais sous la voix (contrôle son-sous-voix).
    FORTS: ['impact', 'basse', 'montee'],
    SONS_TRANSITION: { fondu: 'souffle', glissement: 'whoosh', balayage: 'swoosh-inverse', zoom: 'montee', coupe: 'impact', rideau: 'whoosh' },
    AMBIANCES: {
      calme: { tempo: 72, tonalite: 'fa' },
      entrainant: { tempo: 118, tonalite: 'sol' },
      inspirant: { tempo: 100, tonalite: 're' },
      corporate: { tempo: 108, tonalite: 'do' },
      suspense: { tempo: 84, tonalite: 'lam' },
      tech: { tempo: 124, tonalite: 'mim' },
    },
  };
});
