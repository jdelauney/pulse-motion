/* Pulse Motion – minutage : temps absolus des scènes et des éléments.
 *
 * Entrée : les scènes du déroulé et, par scène, les éléments minutés lus dans le HTML.
 *   data-start="0.4"            absolu dans la scène
 *   data-start="#titre+0.3"     début de #titre + 0,3 s
 *   data-start="#titre:fin-0.2" fin de #titre − 0,2 s
 *   data-start="mot:froid"      quand la voix de la scène dit « froid » (#2 : deuxième fois, :fin : fin du mot, +0.2)
 *   data-dur="1.2"              durée (1 s par défaut)
 * Avec un tempo dans le déroulé, toute durée s'écrit aussi en temps musicaux : « 2t », « #titre:fin+1t ».
 * Les temps internes d'une scène sont divisés par son rythme. Une voix (scenes[].voix = { debut, duree, mots }, en
 * secondes réelles) allonge la scène jusqu'à sa fin + 0,4 s (arrondi au temps musical suivant avec un tempo).
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var Al = typeof require === 'function' && typeof module === 'object' ? require('./aligner.js') : (racine.M && racine.M.aligner);
  var api = fabrique(Al);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Al) {
  'use strict';

  var CHEVAUCHEMENT = 0.5;
  var MARGE_VOIX = 0.4;   // respiration après la voix
  var DEBUT_VOIX = 0.3;   // début de la prise dans la scène, par défaut
  var ANCRE_MOT = /^mot:(.+?)(?:#(\d+))?(:fin)?(?:\s*([+-])\s*(\d*\.?\d+t?))?$/;
  var DUREE_DEFAUT = 1;
  var REFERENCE = /^#([A-Za-z0-9_-]+)(:fin)?\s*(?:([+-])\s*(\d*\.?\d+t?))?$/;
  var DUREE = /^(\d*\.?\d+)(t?)$/;

  /**
   * Durée écrite en secondes (« 1.5 ») ou en temps musicaux (« 2t »).
   * dureeTemps : secondes par temps, ou null sans tempo.
   * -> { valeur } | { erreur: 'illisible' | 'tempo-absent' }
   */
  function lireSecondes(texte, dureeTemps) {
    var m = DUREE.exec(String(texte).trim());
    if (!m) return { erreur: 'illisible' };
    if (!m[2]) return { valeur: parseFloat(m[1]) };
    if (!(dureeTemps > 0)) return { erreur: 'tempo-absent' };
    return { valeur: parseFloat(m[1]) * dureeTemps };
  }

  function messageTempoAbsent(idScene, cle, attribut, valeur) {
    return 'Scène « ' + idScene + ' », élément « ' + cle + ' » : ' + attribut + ' « ' + valeur + ' » est en temps musicaux, mais le déroulé n\'a pas de « tempo » (ex. "tempo": { "bpm": 120 }).';
  }

  function chevauchement(scene, index) {
    return index > 0 && scene.transition && scene.transition !== 'aucune' && scene.transition !== 'coupe' ? CHEVAUCHEMENT : 0;
  }

  /**
   * calculerMinutage(scenes, elementsParScene, options?)
   *   scenes : [{ id, duree, rythme?, transition? }]
   *   elementsParScene : { [idScene]: [{ cle, start?, dur? }] }  (start, dur : textes des attributs)
   *   options.dureeTemps : secondes par temps musical (tempo du déroulé), absent sans tempo
   *   options.decalageTemps : instant du premier temps (tempo.decalage), 0 par défaut
   * -> { duree, scenes: [{ id, debut, fin, rythme, transition, entree }],
   *      elements: { [idScene]: { [cle]: { debut, fin } } }, erreurs: [{ regle, scene, element, message }] }
   */
  function calculerMinutage(scenes, elementsParScene, options) {
    var dureeTemps = options && options.dureeTemps > 0 ? options.dureeTemps : null;
    var decalageTemps = options && options.decalageTemps > 0 ? options.decalageTemps : 0;
    var erreurs = [];
    var resultat = { duree: 0, scenes: [], elements: {}, erreurs: erreurs };
    var fin = 0;

    scenes.forEach(function (s, i) {
      var rythme = s.rythme > 0 ? s.rythme : 1;
      var entree = chevauchement(s, i);
      var debut = Math.max(0, fin - entree);
      var reelle = s.duree / rythme;
      var allongee = false;
      if (s.voix && s.voix.duree > 0) {
        var finVoix = (s.voix.debut === undefined ? DEBUT_VOIX : s.voix.debut) + s.voix.duree + MARGE_VOIX;
        if (finVoix > reelle + 1e-9) {
          // Avec un tempo : la scène suivante commence sur un temps (premier temps à decalageTemps, entrée chevauchée comprise).
          if (dureeTemps) {
            var entreeSuivante = i + 1 < scenes.length ? chevauchement(scenes[i + 1], i + 1) : 0;
            var k = Math.ceil((debut + finVoix - entreeSuivante - decalageTemps) / dureeTemps - 1e-9);
            reelle = k * dureeTemps + decalageTemps + entreeSuivante - debut;
          } else reelle = finVoix;
          allongee = true;
        }
      }
      reelle = Math.round(reelle * 1e6) / 1e6;
      var finScene = debut + reelle;
      resultat.scenes.push({ id: s.id, debut: debut, fin: finScene, rythme: rythme, transition: s.transition || 'aucune', entree: entree,
        allongee: allongee, dureeEffective: Math.round(reelle * rythme * 1e6) / 1e6 });
      resultat.elements[s.id] = minuterScene(s.id, debut, rythme, (elementsParScene && elementsParScene[s.id]) || [], erreurs, dureeTemps, s.voix);
      fin = finScene;
    });
    resultat.duree = fin;
    return resultat;
  }

  function minuterScene(idScene, debutScene, rythme, elements, erreurs, dureeTemps, voix) {
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
      var lu = lireSecondes(d, dureeTemps);
      if (lu.erreur === 'tempo-absent') {
        erreur('tempo-absent', e.cle, messageTempoAbsent(idScene, e.cle, 'data-dur', d));
        return DUREE_DEFAUT;
      }
      if (lu.erreur) {
        erreur('dur-invalide', e.cle, 'Scène « ' + idScene + ' », élément « ' + e.cle + ' » : data-dur « ' + e.dur + ' » n\'est pas un nombre de secondes.');
        return DUREE_DEFAUT;
      }
      return lu.valeur;
    }

    /** Ancre « mot: » -> temps de scène (temps du contenu : secondes réelles × rythme). */
    function resoudreMot(cle, texte, a) {
      var mots = voix && voix.mots ? voix.mots : null;
      if (!mots || !mots.length) {
        erreur('ancre-mot-introuvable', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : data-start « ' + texte + ' » vise un mot, mais la scène n\'a pas de voix.');
        return 0;
      }
      var voulu = Al.normaliserMot(a[1]), rang = a[2] ? parseInt(a[2], 10) : 1, vus = 0, trouve = null;
      for (var k = 0; k < mots.length && !trouve; k++) {
        var cles = Al.decouperMots(mots[k].w).reduce(function (t, x) { return t.concat(x.cles); }, []);
        if (cles.indexOf(voulu) >= 0 && ++vus === rang) trouve = mots[k];
      }
      if (!trouve) {
        var dispo = [];
        mots.forEach(function (x) {
          var w = String(x.w).toLowerCase().replace(/[^\p{L}\p{N}'’-]+/gu, '');
          if (w && dispo.indexOf(w) < 0) dispo.push(w);
        });
        erreur('ancre-mot-introuvable', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : le mot « ' + a[1] + ' »' + (rang > 1 ? ' (n° ' + rang + ')' : '') + ' n\'est pas dit par la voix (mots : ' + dispo.join(', ') + ').');
        return 0;
      }
      var ecart = a[5] ? lireSecondes(a[5], dureeTemps) : { valeur: 0 };
      if (ecart.erreur) erreur('tempo-absent', cle, messageTempoAbsent(idScene, cle, 'data-start', texte));
      var decalage = ecart.erreur ? 0 : ecart.valeur * (a[4] === '-' ? -1 : 1);
      var reel = (voix.debut === undefined ? DEBUT_VOIX : voix.debut) + (a[3] ? trouve.t1 : trouve.t0);
      return reel * rythme + decalage;
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
      var direct = s === '' ? { valeur: 0 } : lireSecondes(s, dureeTemps);
      if (direct.valeur !== undefined) debut = direct.valeur;
      else if (direct.erreur === 'tempo-absent') erreur('tempo-absent', cle, messageTempoAbsent(idScene, cle, 'data-start', s));
      else if (ANCRE_MOT.test(s)) {
        debut = Math.max(0, resoudreMot(cle, s, ANCRE_MOT.exec(s)));
      } else {
        var m = REFERENCE.exec(s);
        if (!m) {
          erreur('start-invalide', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : data-start « ' + s + ' » illisible (exemples : 0.4, #titre+0.3, #titre:fin-0.2).');
        } else if (!parCle[m[1]]) {
          erreur('reference-inconnue', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : « #' + m[1] + ' » n\'existe pas dans cette scène (ou n\'est pas minuté).');
        } else {
          var ref = resoudre(m[1]);
          var ecart = m[4] ? lireSecondes(m[4], dureeTemps) : { valeur: 0 };
          if (ecart.erreur) erreur('tempo-absent', cle, messageTempoAbsent(idScene, cle, 'data-start', s));
          var decalage = ecart.erreur ? 0 : ecart.valeur * (m[3] === '-' ? -1 : 1);
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
    MARGE_VOIX: MARGE_VOIX,
    DEBUT_VOIX: DEBUT_VOIX,
    calculerMinutage: calculerMinutage,
    lireSecondes: lireSecondes,
    progression: progression,
    etat: etat,
    scenesVisibles: scenesVisibles,
  };
});
