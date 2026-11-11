/* Pulse Motion – minutage : temps absolus des scènes et des éléments.
 *
 * Entrée : les scènes du déroulé et, par scène, les éléments minutés lus dans le HTML.
 *   data-start="0.4"            absolu dans la scène
 *   data-start="#titre+0.3"     début de #titre + 0,3 s
 *   data-start="#titre:fin-0.2" fin de #titre − 0,2 s
 *   data-start="mot:froid"      quand la voix de la scène dit « froid » (#2 : deuxième fois, :fin : fin du mot, +0.2)
 *   data-start="repere:serveur" au repère [#serveur] du texte dit (voix.reperes : { nom: t }, secondes de la prise ; +0.2)
 *   data-dur="1.2"              durée (1 s par défaut)
 *   data-dur="scene"            jusqu'à la fin de la scène, voix comprise (dernière scène : 1 s avant, image finale stable)
 * Avec un tempo dans le déroulé, toute durée s'écrit aussi en temps musicaux : « 2t », « #titre:fin+1t ».
 * Les temps internes d'une scène sont divisés par son rythme. Une voix (scenes[].voix = { debut, duree, mots }, en
 * secondes réelles) allonge la scène jusqu'à sa fin + 0,4 s (arrondi au temps musical suivant avec un tempo).
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var node = typeof require === 'function' && typeof module === 'object';
  var Al = node ? require('./aligner.js') : (racine.M && racine.M.aligner);
  // Noms proches (spec Retouches et ergonomie, 5.16) : facultatifs (une page de test sans proches.js n'en propose aucun).
  var P = node ? require('./proches.js') : (racine.M && racine.M.proches) || null;
  var api = fabrique(Al, P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Al, P) {
  'use strict';

  var CHEVAUCHEMENT = 0.5;
  var DUREE_TRANSITION_SHADER = 0.8; // transition par shader sans « duree » (P6)
  var MARGE_VOIX = 0.4;   // respiration après la voix
  var DEBUT_VOIX = 0.3;   // début de la prise dans la scène, par défaut
  var ANCRE_MOT = /^mot:(.+?)(?:#(\d+))?(:fin)?(?:\s*([+-])\s*(\d*\.?\d+t?))?$/;
  var ANCRE_REPERE = /^repere:([A-Za-z0-9_-]+)(?:\s*([+-])\s*(\d*\.?\d+t?))?$/;
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

  /** Durée de la transition d'entrée : shader (« duree », 0,8 s par défaut), CSS (0,5 s), aucune ou coupe (0). */
  function dureeTransitionDe(scene) {
    var tr = scene.transition;
    if (tr && typeof tr === 'object') return tr.duree > 0 ? tr.duree : DUREE_TRANSITION_SHADER;
    return tr && tr !== 'aucune' && tr !== 'coupe' ? CHEVAUCHEMENT : 0;
  }

  function chevauchement(scene, index) {
    return index > 0 ? dureeTransitionDe(scene) : 0;
  }

  /**
   * calculerMinutage(scenes, elementsParScene, options?)
   *   scenes : [{ id, duree, rythme?, transition? }]
   *   elementsParScene : { [idScene]: [{ cle, start?, dur? }] }  (start, dur : textes des attributs)
   *   options.dureeTemps : secondes par temps musical (tempo du déroulé), absent sans tempo
   *   options.decalageTemps : instant du premier temps (tempo.decalage), 0 par défaut
   *   options.grilleFixe : la musique ne suit pas les scènes (une scène allongée par la voix finit sur un temps)
   *   options.derniere : la dernière scène de la liste est-elle la dernière de la vidéo (vrai par défaut ; faux pour le
   *     minutage d'une scène seule au milieu de la vidéo) : data-dur="scene" s'y arrête 1 s avant la fin
   *   options.allure : allure globale (spec S7, 5.14 ; 0,7 à 1,6, 1 par défaut) : rythme effectif = rythme × allure ;
   *     début de la voix par défaut, marge après la voix et chevauchement des transitions divisés par l'allure ; les ancres
   *     « mot: » et « repere: » restent sur leur instant (la prise n'est pas accélérée)
   * -> { duree, scenes: [{ id, debut, fin, rythme, transition, entree, dureeTransition }],
   *      elements: { [idScene]: { [cle]: { debut, fin } } }, erreurs: [{ regle, scene, element, message }] }
   */
  function calculerMinutage(scenes, elementsParScene, options) {
    var dureeTemps = options && options.dureeTemps > 0 ? options.dureeTemps : null;
    var decalageTemps = options && options.decalageTemps > 0 ? options.decalageTemps : 0;
    var grilleFixe = !!(options && options.grilleFixe);
    var finVideo = !(options && options.derniere === false);
    var allure = options && options.allure >= 0.7 && options.allure <= 1.6 ? options.allure : 1;
    var erreurs = [];
    var resultat = { duree: 0, scenes: [], elements: {}, erreurs: erreurs };
    var fin = 0;

    scenes.forEach(function (s, i) {
      var rythme = (s.rythme > 0 ? s.rythme : 1) * allure;
      var entree = chevauchement(s, i) / allure;
      var debutVoix = s.voix && s.voix.debut !== undefined ? s.voix.debut : DEBUT_VOIX / allure;
      var debut = Math.max(0, fin - entree);
      var reelle = s.duree / rythme;
      var allongee = false;
      if (s.voix && s.voix.duree > 0) {
        var finVoix = debutVoix + s.voix.duree + MARGE_VOIX / allure;
        if (finVoix > reelle + 1e-9) {
          // Grille fixe (musique qui ne suit pas les scènes) : la scène suivante commence sur un temps (premier temps à
          // decalageTemps, entrée chevauchée comprise). Sinon la scène finit avec la voix : la musique se cale dessus.
          if (dureeTemps && grilleFixe) {
            var entreeSuivante = i + 1 < scenes.length ? chevauchement(scenes[i + 1], i + 1) / allure : 0;
            var k = Math.ceil((debut + finVoix - entreeSuivante - decalageTemps) / dureeTemps - 1e-9);
            reelle = k * dureeTemps + decalageTemps + entreeSuivante - debut;
          } else reelle = finVoix;
          allongee = true;
        }
      }
      reelle = Math.round(reelle * 1e6) / 1e6;
      var finScene = debut + reelle;
      resultat.scenes.push({ id: s.id, debut: debut, fin: finScene, rythme: rythme, transition: s.transition || 'aucune', entree: entree, dureeTransition: dureeTransitionDe(s) / allure,
        allongee: allongee, dureeEffective: Math.round(reelle * rythme * 1e6) / 1e6 });
      // data-dur="scene" : jusqu'à la fin de la scène (temps de la scène), 1 s réelle avant sur la dernière.
      var finLocale = Math.round(reelle * rythme * 1e6) / 1e6 - (finVideo && i === scenes.length - 1 ? rythme : 0);
      resultat.elements[s.id] = minuterScene(s.id, debut, rythme, (elementsParScene && elementsParScene[s.id]) || [], erreurs, dureeTemps, s.voix, finLocale, debutVoix);
      fin = finScene;
    });
    resultat.duree = fin;
    return resultat;
  }

  function minuterScene(idScene, debutScene, rythme, elements, erreurs, dureeTemps, voix, finLocale, debutVoix) {
    var parCle = {};
    elements.forEach(function (e) { parCle[e.cle] = e; });
    var local = {};      // cle -> { debut, fin } en temps de scène
    var enCours = {};

    function erreur(regle, cle, message, consigne) {
      var e = { regle: regle, scene: idScene, element: cle, message: message };
      if (consigne) e.consigne = consigne;
      erreurs.push(e);
    }
    /** « ; vouliez-vous dire « a » ou « b » ? » (5.16), ou rien. */
    function suggestion(saisie, candidats) {
      var liste = P ? P.proches(saisie, candidats) : [];
      return liste.length ? ' ; ' + P.phrase(liste) : '';
    }

    /** Durée en temps de scène ; debut : début de l'élément (temps de scène), pour data-dur="scene". */
    function lireDuree(e, debut) {
      if (e.dur === undefined || e.dur === null || e.dur === '') return DUREE_DEFAUT;
      var d = String(e.dur).trim();
      if (d === 'scene') return Math.max(0, Math.round((finLocale - debut) * 1e6) / 1e6);
      var lu = lireSecondes(d, dureeTemps);
      if (lu.erreur === 'tempo-absent') {
        erreur('tempo-absent', e.cle, messageTempoAbsent(idScene, e.cle, 'data-dur', d));
        return DUREE_DEFAUT;
      }
      if (lu.erreur) {
        erreur('dur-invalide', e.cle, 'Scène « ' + idScene + ' », élément « ' + e.cle + ' » : data-dur « ' + e.dur + ' » n\'est pas un nombre de secondes (ni « scene » : jusqu\'à la fin de la scène).');
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
        // Forme affichée, et forme dite d'un {affiché|dit} (spec S7, 5.11).
        var cles = Al.decouperMots(mots[k].w + (mots[k].dit ? ' ' + mots[k].dit : '')).reduce(function (t, x) { return t.concat(x.cles); }, []);
        if (cles.indexOf(voulu) >= 0 && ++vus === rang) trouve = mots[k];
      }
      if (!trouve) {
        var dispo = [];
        mots.forEach(function (x) {
          var w = String(x.w).toLowerCase().replace(/[^\p{L}\p{N}'’-]+/gu, '');
          if (w && dispo.indexOf(w) < 0) dispo.push(w);
        });
        // Le mot le plus proche dans le message ; la liste complète dans la consigne (spec Retouches et ergonomie, 5.16).
        erreur('ancre-mot-introuvable', cle, 'Scène « ' + idScene + ' » : le mot « ' + a[1] + ' »' + (rang > 1 ? ' (n° ' + rang + ')' : '') + ' n\'est pas dit par la voix' + (suggestion(a[1], dispo) || '.'),
          'élément « ' + cle + ' », data-start « ' + texte + ' » ; mots dits dans la scène : ' + dispo.join(', ') + '.');
        return 0;
      }
      var ecart = a[5] ? lireSecondes(a[5], dureeTemps) : { valeur: 0 };
      if (ecart.erreur) erreur('tempo-absent', cle, messageTempoAbsent(idScene, cle, 'data-start', texte));
      var decalage = ecart.erreur ? 0 : ecart.valeur * (a[4] === '-' ? -1 : 1);
      var reel = debutVoix + (a[3] ? trouve.t1 : trouve.t0);
      return reel * rythme + decalage;
    }

    /** Ancre « repere: » (spec S7, 5.11) -> temps de scène : repère [#nom] du texte dit, à l'instant du mot qui le suit. */
    function resoudreRepere(cle, texte, a) {
      var reperes = voix && voix.reperes ? voix.reperes : null;
      if (!reperes || !Object.prototype.hasOwnProperty.call(reperes, a[1])) {
        var noms = reperes ? Object.keys(reperes) : [];
        erreur('repere-introuvable', cle, 'Scène « ' + idScene + ' » : le repère « ' + a[1] + " » n'est pas dans le texte dit" + (noms.length ? (suggestion(a[1], noms) || ' (repères : ' + noms.join(', ') + ').') : (voix ? ' (le poser par [#' + a[1] + '] devant le mot voulu).' : ", et la scène n'a pas de voix.")),
          'élément « ' + cle + ' », data-start « ' + texte + ' ».');
        return 0;
      }
      var ecart = a[3] ? lireSecondes(a[3], dureeTemps) : { valeur: 0 };
      if (ecart.erreur) erreur('tempo-absent', cle, messageTempoAbsent(idScene, cle, 'data-start', texte));
      var decalage = ecart.erreur ? 0 : ecart.valeur * (a[2] === '-' ? -1 : 1);
      return (debutVoix + reperes[a[1]]) * rythme + decalage;
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
      } else if (ANCRE_REPERE.test(s)) {
        debut = Math.max(0, resoudreRepere(cle, s, ANCRE_REPERE.exec(s)));
      } else {
        var m = REFERENCE.exec(s);
        if (!m) {
          erreur('start-invalide', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : data-start « ' + s + ' » illisible (exemples : 0.4, #titre+0.3, #titre:fin-0.2).');
        } else if (!parCle[m[1]]) {
          erreur('reference-inconnue', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : « #' + m[1] + ' » n\'existe pas dans cette scène (ou n\'est pas minuté)'
            + (suggestion(m[1], Object.keys(parCle).filter(function (k) { return k.charAt(0) !== '_'; })) || '.'));
        } else {
          var ref = resoudre(m[1]);
          var ecart = m[4] ? lireSecondes(m[4], dureeTemps) : { valeur: 0 };
          if (ecart.erreur) erreur('tempo-absent', cle, messageTempoAbsent(idScene, cle, 'data-start', s));
          var decalage = ecart.erreur ? 0 : ecart.valeur * (m[3] === '-' ? -1 : 1);
          debut = Math.max(0, (m[2] ? ref.fin : ref.debut) + decalage);
        }
      }
      var res = { debut: debut, fin: debut + lireDuree(e, debut) };
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

  /**
   * Partie visible de la scène i (spec Rendu et export, 5.10 et 5.12) : de son début + son entrée à sa fin − l'entrée de la
   * suivante, hors transitions (la règle de la planche). -> { debut, fin } en secondes absolues.
   */
  function partieVisible(minutage, i) {
    var s = minutage.scenes[i];
    var suivante = minutage.scenes[i + 1];
    var debut = s.debut + (s.entree || 0);
    var fin = s.fin - (suivante ? suivante.entree || 0 : 0);
    return fin > debut ? { debut: debut, fin: fin } : { debut: s.debut, fin: s.fin };
  }

  /**
   * Instant de la couverture (spec Rendu et export, 5.10) : couverture { scene, instant } du déroulé (secondes depuis le
   * début de la scène, borné à la scène), sinon la première scène à 95 % de sa partie visible. -> secondes absolues.
   */
  function instantCouverture(minutage, couverture) {
    if (!minutage || !minutage.scenes || !minutage.scenes.length) return 0;
    var i = couverture && couverture.scene ? minutage.scenes.findIndex(function (s) { return s.id === couverture.scene; }) : -1;
    if (i >= 0 && typeof couverture.instant === 'number') {
      var s = minutage.scenes[i];
      return Math.min(Math.max(s.debut + couverture.instant, s.debut), Math.max(s.debut, s.fin - 1e-3));
    }
    var v = partieVisible(minutage, i >= 0 ? i : 0);
    return v.debut + (v.fin - v.debut) * 0.95;
  }

  // ---- Boucles de vie pm-v-* (spec Mouvement vivant, 5.9) : calculs purs, partagés par l'horloge et les tests.

  /** FNV-1a 32 bits d'un texte -> entier non signé (même calcul que moteur/vivant.js, sel). */
  function selVie(texte) {
    var h = 0x811c9dc5, s = String(texte);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /** Phase d'une boucle de vie dans [0, 1[ : graine(rang, sel(idScene + '/' + classe)), un tour de mulberry32 (même calcul
   *  que moteur/vivant.js, graine). rang : rang de l'élément parmi ceux de même classe dans la scène. */
  function phaseVie(rang, idScene, classe) {
    var a = ((selVie(idScene + '/' + classe) >>> 0) ^ Math.imul((rang | 0) + 1, 0x9e3779b1)) | 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Nombre de cycles d'une boucle de période P dans une fenêtre W (mêmes unités) : une boucle qui oscille fait un nombre
   *  entier de cycles et finit au repos (une fraction si W < P) ; une boucle continue (défilement, engrenage) remplit W. */
  function cyclesVie(W, P, continue_) {
    if (!(W > 0) || !(P > 0)) return 0;
    var n = W / P;
    if (!continue_ && n >= 1 - 1e-9) n = Math.floor(n + 1e-9);
    // Arrondi par défaut : la dernière image du dernier cycle ne dépasse jamais la fenêtre.
    return Math.floor(n * 1e6 + 1e-7) / 1e6;
  }

  return {
    selVie: selVie,
    phaseVie: phaseVie,
    cyclesVie: cyclesVie,
    partieVisible: partieVisible,
    instantCouverture: instantCouverture,
    CHEVAUCHEMENT: CHEVAUCHEMENT,
    DUREE_TRANSITION_SHADER: DUREE_TRANSITION_SHADER,
    MARGE_VOIX: MARGE_VOIX,
    DEBUT_VOIX: DEBUT_VOIX,
    calculerMinutage: calculerMinutage,
    lireSecondes: lireSecondes,
    progression: progression,
    etat: etat,
    scenesVisibles: scenesVisibles,
  };
});
