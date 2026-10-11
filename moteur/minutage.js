/* Pulse Motion – minutage : temps absolus des scènes et des éléments.
 *
 * Entrée : les scènes du déroulé et, par scène, les éléments minutés lus dans le HTML.
 *   data-start="0.4"            absolu dans la scène
 *   data-start="#titre+0.3"     début de #titre + 0,3 s
 *   data-start="#titre:fin-0.2" fin de #titre − 0,2 s
 *   data-dur="1.2"              durée (1 s par défaut)
 * Les temps internes d'une scène sont divisés par son rythme.
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CHEVAUCHEMENT = 0.5;
  var DUREE_DEFAUT = 1;
  var REFERENCE = /^#([A-Za-z0-9_-]+)(:fin)?\s*(?:([+-])\s*(\d*\.?\d+))?$/;
  var NOMBRE = /^\d*\.?\d+$/;

  function chevauchement(scene, index) {
    return index > 0 && scene.transition && scene.transition !== 'aucune' ? CHEVAUCHEMENT : 0;
  }

  /**
   * calculerMinutage(scenes, elementsParScene)
   *   scenes : [{ id, duree, rythme?, transition? }]
   *   elementsParScene : { [idScene]: [{ cle, start?, dur? }] }  (start, dur : textes des attributs)
   * -> { duree, scenes: [{ id, debut, fin, rythme, transition, entree }],
   *      elements: { [idScene]: { [cle]: { debut, fin } } }, erreurs: [{ regle, scene, element, message }] }
   */
  function calculerMinutage(scenes, elementsParScene) {
    var erreurs = [];
    var resultat = { duree: 0, scenes: [], elements: {}, erreurs: erreurs };
    var fin = 0;

    scenes.forEach(function (s, i) {
      var rythme = s.rythme > 0 ? s.rythme : 1;
      var entree = chevauchement(s, i);
      var debut = Math.max(0, fin - entree);
      var finScene = debut + s.duree / rythme;
      resultat.scenes.push({ id: s.id, debut: debut, fin: finScene, rythme: rythme, transition: s.transition || 'aucune', entree: entree });
      resultat.elements[s.id] = minuterScene(s.id, debut, rythme, (elementsParScene && elementsParScene[s.id]) || [], erreurs);
      fin = finScene;
    });
    resultat.duree = fin;
    return resultat;
  }

  function minuterScene(idScene, debutScene, rythme, elements, erreurs) {
    var parCle = {};
    elements.forEach(function (e) { parCle[e.cle] = e; });
    var local = {};      // cle -> { debut, fin } en temps de scène
    var enCours = {};

    function erreur(regle, cle, message) {
      erreurs.push({ regle: regle, scene: idScene, element: cle, message: message });
    }

    function lireDuree(e) {
      if (e.dur === undefined || e.dur === null || e.dur === '') return DUREE_DEFAUT;
      var d = String(e.dur).trim();
      if (!NOMBRE.test(d)) {
        erreur('dur-invalide', e.cle, 'Scène « ' + idScene + ' », élément « ' + e.cle + ' » : data-dur « ' + e.dur + ' » n\'est pas un nombre de secondes.');
        return DUREE_DEFAUT;
      }
      return parseFloat(d);
    }

    function resoudre(cle) {
      if (local[cle]) return local[cle];
      var e = parCle[cle];
      if (enCours[cle]) {
        erreur('reference-circulaire', cle, 'Scène « ' + idScene + ' » : référence circulaire autour de « #' + cle + ' ».');
        return { debut: 0, fin: DUREE_DEFAUT };
      }
      enCours[cle] = true;
      var debut = 0;
      var s = e.start === undefined || e.start === null ? '' : String(e.start).trim();
      if (s === '') debut = 0;
      else if (NOMBRE.test(s)) debut = parseFloat(s);
      else {
        var m = REFERENCE.exec(s);
        if (!m) {
          erreur('start-invalide', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : data-start « ' + s + ' » illisible (exemples : 0.4, #titre+0.3, #titre:fin-0.2).');
        } else if (!parCle[m[1]]) {
          erreur('reference-inconnue', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : « #' + m[1] + ' » n\'existe pas dans cette scène (ou n\'est pas minuté).');
        } else {
          var ref = resoudre(m[1]);
          var decalage = m[4] ? parseFloat(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
          debut = Math.max(0, (m[2] ? ref.fin : ref.debut) + decalage);
        }
      }
      var res = { debut: debut, fin: debut + lireDuree(e) };
      enCours[cle] = false;
      local[cle] = res;
      return res;
    }

    var absolus = {};
    elements.forEach(function (e) {
      var r = resoudre(e.cle);
      absolus[e.cle] = { debut: debutScene + r.debut / rythme, fin: debutScene + r.fin / rythme };
    });
    return absolus;
  }

  /** Progression bornée [0,1] et état d'un intervalle à l'instant t. */
  function progression(t, debut, fin) {
    if (t <= debut) return 0;
    if (t >= fin) return 1;
    return (t - debut) / (fin - debut);
  }
  function etat(t, debut, fin) { return t < debut ? 'avant' : t < fin ? 'pendant' : 'apres'; }

  /** Identifiants des scènes visibles à t (deux pendant un chevauchement). */
  function scenesVisibles(minutage, t) {
    var visibles = minutage.scenes.filter(function (s) { return t >= s.debut && t < s.fin; });
    if (!visibles.length && minutage.scenes.length) visibles = [minutage.scenes[minutage.scenes.length - 1]];
    return visibles.map(function (s) { return s.id; });
  }

  return {
    CHEVAUCHEMENT: CHEVAUCHEMENT,
    calculerMinutage: calculerMinutage,
    progression: progression,
    etat: etat,
    scenesVisibles: scenesVisibles,
  };
});
