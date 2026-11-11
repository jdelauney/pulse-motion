/* Pulse Motion – catalogue du synthétiseur : instruments, bruitages (sons tenus, pics), sons des transitions, ambiances.
 *
 * Module pur : chargé tel quel dans la page (global M.synthe.catalogue) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.synthe = racine.M.synthe || {}; racine.M.synthe.catalogue = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var SONS_TRANSITION = { fondu: 'souffle', glissement: 'whoosh', balayage: 'swoosh-inverse', zoom: 'montee', coupe: 'impact', rideau: 'whoosh',
    whip: 'whoosh', poussee: 'whoosh', traversee: 'montee', cercle: 'swoosh-inverse', volets: 'swoosh-inverse', retournement: 'whoosh' };
  // Transitions par shader de la bibliothèque ; un shader du projet : souffle (comme un fondu).
  var SONS_TRANSITION_SHADER = { dissolution: 'souffle', ondulation: 'souffle', pixels: 'blip', glitch: 'impact', 'balayage-organique': 'swoosh-inverse',
    'fuite-lumiere': 'souffle', brulure: 'souffle', lentille: 'whoosh', deformation: 'whoosh', iris: 'swoosh-inverse' };
  return {
    // corde : cordes pincées par modèle physique (synthe/corde.js), préréglage de la piste (PREREGLAGES_CORDE) ; tic : battement
    // d'horlogerie (spec Styles et réalisation, 5.8).
    INSTRUMENTS: ['pluck', 'pad', 'basse', 'sub', 'kick', 'caisse', 'charleston', 'cloche', 'nappe-bruit', 'riser', 'corde', 'tic'],
    PERCUSSIONS: ['kick', 'caisse', 'charleston', 'riser', 'nappe-bruit', 'tic'],
    PREREGLAGES_CORDE: ['guitare', 'harpe', 'kalimba', 'pizzicato'],
    BRUITAGES: ['whoosh', 'swoosh-inverse', 'pop', 'clic', 'tic', 'impact', 'basse', 'montee', 'carillon', 'ding', 'blip', 'souffle', 'crissement',
      'frappe', 'succes', 'erreur', 'notification', 'aimant', 'feutre', 'craie', 'crayon', 'papier', 'chargement'],
    // Sons tenus : ils durent l'entrée de l'élément (data-dur) et comptent pour un son. crissement : tracé générique ; feutre,
    // craie, crayon et papier : matières d'un style (identite.son.matiere), qui remplacent crissement pour le tracé.
    TENUS: ['crissement', 'feutre', 'craie', 'crayon', 'papier', 'chargement'],
    // Sons forts : jamais sous la voix (contrôle son-sous-voix).
    FORTS: ['impact', 'basse', 'montee'],
    /**
     * Instant du pic de chaque son (s après son départ), tiré de sa recette (synthe/bruitages.js) : fin de l'attaque de
     * l'enveloppe la plus forte. Calage par le pic (bruitages.calage = "pic") : le son part pic secondes plus tôt. Pour un son
     * tenu, la fin de son attaque (la pointe touche la matière).
     */
    PICS: {
      whoosh: 0.25,              // balayage de 0,5 s : attaque de la moitié
      'swoosh-inverse': 0.225,   // balayage de 0,45 s
      pop: 0.004, clic: 0.001, tic: 0.001, impact: 0.002, basse: 0.01, ding: 0.003, blip: 0.002,
      montee: 0.9,               // dent de scie : attaque de 0,9 s, plus forte que le souffle qui culmine à 0,5 s
      carillon: 0.183,           // troisième note (0,18 s) sur les deux premières qui sonnent encore
      souffle: 0.3,
      crissement: 0.03,
      frappe: 0.002,
      succes: 0.124,             // seconde note (0,12 s), plus forte
      erreur: 0.146,             // seconde note (0,14 s), plus forte
      notification: 0.103,       // second tintement (0,1 s), plus fort
      aimant: 0.016,             // choc sourd à 0,012 s, attaque de 4 ms
      feutre: 0.02, craie: 0.015, crayon: 0.02, papier: 0.01, chargement: 0.001,
    },
    SONS_TRANSITION: SONS_TRANSITION,
    SONS_TRANSITION_SHADER: SONS_TRANSITION_SHADER,
    /** Son d'une transition du déroulé (nom, ou { shader, duree }) ; null pour « aucune » ou sans transition. */
    sonTransition: function (transition) {
      if (transition && typeof transition === 'object') {
        return typeof transition.shader === 'string' ? (SONS_TRANSITION_SHADER[transition.shader] || 'souffle') : null;
      }
      return SONS_TRANSITION[transition] || null;
    },
    AMBIANCES: {
      calme: { tempo: 72, tonalite: 'fa' },
      entrainant: { tempo: 118, tonalite: 'sol' },
      inspirant: { tempo: 100, tonalite: 're' },
      corporate: { tempo: 108, tonalite: 'do' },
      suspense: { tempo: 84, tonalite: 'lam' },
      tech: { tempo: 124, tonalite: 'mim' },
      // Styles dessinés et techniques (spec Styles et réalisation, 5.8) : cordes pincées et nappe ; horlogerie.
      acoustique: { tempo: 92, tonalite: 'sol' },
      mecanique: { tempo: 108, tonalite: 'lam' },
    },
  };
});
