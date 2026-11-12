/* Pulse Motion – Ken Burns (spec S9, 5.9) : une photo qui glisse ou se rapproche doucement dans son cadre.
 *
 *   <div class="photo" data-ken-burns="auto" data-start="0.3"><img src="assets/cuisine.jpg" alt="La cuisine"></div>
 *   <div class="photo" data-ken-burns="avant 1.2"><img src="assets/salle.jpg" alt=""></div>
 *
 * data-ken-burns="<sens> [ampleur]" sur un conteneur (overflow: hidden) qui contient une image. Sens : auto, avant (se
 * rapproche), arriere (recule), gauche, droite, haut ou bas (la caméra glisse dans ce sens) ; ampleur : zoom final, 1,12
 * par défaut, de 1,03 à 1,3. Le mouvement va de l'apparition du conteneur (data-start, ou celle de son ancêtre minuté) à la
 * fin de la scène, en sine-inout ; le point visé se décale de 6 % au plus et l'image couvre toujours le cadre.
 * auto : le sens est tiré par la graine (identifiant de la scène et rang de l'image) ; deux images qui se suivent dans la
 * vidéo n'ont jamais le même sens, et le même tirage donne la même vidéo.
 * Les clauses sont celles de data-camera (moteur/camera.js) : l'horloge les ajoute aux caméras de la scène, posées sur
 * l'image (zoom, x, y) ; l'image porte __pmKenBurns { zoom, zoomMax } pour la règle image-agrandie (moteur/mesures.js).
 *
 * Module pur pour l'analyse (Node : require ; page : M.lireKenBurns, M.kenBurns, M.sensKenBurns) ; M.camerasKenBurns pour
 * l'horloge. Dépend de courbes (global M dans la page).
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var C = nodeJS ? require('./courbes.js') : racine.M;
  var api = fabrique(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var SENS = ['avant', 'arriere', 'gauche', 'droite', 'haut', 'bas'];
  var AMPLEUR = { defaut: 1.12, min: 1.03, max: 1.3 };
  var DECALAGE = 6;
  var COURBE = 'sine-inout';

  function arrondi(x) { return Math.round(x * 10000) / 10000; }

  /** "auto", "avant 1.2" -> { sens, ampleur, horsBornes? } ; sens inconnu ou ampleur illisible : erreur en français.
   *  Une ampleur hors de 1,03 à 1,3 est ramenée à la borne (horsBornes : la valeur écrite). */
  function lireKenBurns(texte) {
    var mots = String(texte == null ? '' : texte).trim().split(/\s+/).filter(Boolean);
    var sens = mots[0] || 'auto';
    if (sens !== 'auto' && SENS.indexOf(sens) < 0) {
      throw new Error('data-ken-burns : sens « ' + sens + ' » inconnu (auto, ' + SENS.join(', ') + ').');
    }
    if (mots.length > 2) throw new Error('data-ken-burns « ' + texte + ' » : un sens et une ampleur au plus (ex. « avant 1.15 »).');
    var r = { sens: sens, ampleur: AMPLEUR.defaut };
    if (mots[1] !== undefined) {
      var a = mots[1].replace(',', '.');
      if (!/^\d*\.?\d+$/.test(a)) throw new Error('data-ken-burns : ampleur « ' + mots[1] + ' » illisible (zoom final, de 1,03 à 1,3, ex. 1.12).');
      var v = parseFloat(a);
      if (v < AMPLEUR.min || v > AMPLEUR.max) { r.horsBornes = v; v = Math.max(AMPLEUR.min, Math.min(AMPLEUR.max, v)); }
      r.ampleur = v;
    }
    return r;
  }

  function hacher(texte) {
    var h = 0x811c9dc5;
    for (var i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /** Suite pseudo-aléatoire (mulberry32) tirée d'une graine texte. */
  function hasards(graine) {
    var a = hacher(String(graine)) | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Sens tiré pour « auto » : jamais celui de l'image précédente. */
  function sensKenBurns(graine, precedent) {
    var choix = SENS.filter(function (s) { return s !== precedent; });
    return choix[Math.floor(hasards(graine + '|sens')() * choix.length) % choix.length];
  }

  function clause(prop, de, a, debut, duree) {
    return { prop: prop, de: arrondi(de), a: arrondi(a), debut: arrondi(debut), duree: arrondi(Math.max(0.01, duree)), nomCourbe: COURBE, courbe: C.courbeNommee(COURBE) };
  }

  /**
   * kenBurns(spec, debut, duree, graine, precedent?) -> clauses de caméra (zoom, x, y), de debut à debut + duree (secondes de
   * la scène), et clauses.sens (le sens retenu). spec : texte de data-ken-burns ou objet lu par lireKenBurns.
   */
  function kenBurns(spec, debut, duree, graine, precedent) {
    var s = typeof spec === 'string' || spec == null ? lireKenBurns(spec) : spec;
    var sens = s.sens === 'auto' ? sensKenBurns(graine, precedent) : s.sens;
    var A = s.ampleur;
    // Décalage permis : l'image zoomée doit couvrir le cadre (point visé à 50 / A du bord au plus près), 6 % au plus.
    var m = Math.min(DECALAGE, 50 - 50 / A);
    var h = hasards(graine + '|point');
    var dx = m * (2 * h() - 1), dy = m * (2 * h() - 1);
    var c;
    if (sens === 'avant') c = [clause('zoom', 1, A, debut, duree), clause('x', 50, 50 + dx, debut, duree), clause('y', 50, 50 + dy, debut, duree)];
    else if (sens === 'arriere') c = [clause('zoom', A, 1, debut, duree), clause('x', 50 + dx, 50, debut, duree), clause('y', 50 + dy, 50, debut, duree)];
    else if (sens === 'gauche' || sens === 'droite') {
      var x0 = sens === 'gauche' ? 50 + m : 50 - m;
      c = [clause('zoom', A, A, debut, duree), clause('x', x0, 100 - x0, debut, duree), clause('y', 50 + dy / 2, 50 + dy / 2, debut, duree)];
    } else {
      var y0 = sens === 'haut' ? 50 + m : 50 - m;
      c = [clause('zoom', A, A, debut, duree), clause('x', 50 + dx / 2, 50 + dx / 2, debut, duree), clause('y', y0, 100 - y0, debut, duree)];
    }
    c.sens = sens;
    c.zoomMax = A;
    return c;
  }

  /**
   * Page : caméras Ken Burns d'une section, pour l'horloge (M.demarrer). info : minutage de la scène ; elements : minutage de
   * ses éléments ({ cle: { debut, fin } }, temps de la vidéo) ; suivi : { precedent } partagé par toutes les scènes (le sens
   * de la dernière image, pour « auto »). -> { cameras: [{ el, clauses, kenBurns }], erreurs }
   */
  function camerasKenBurns(sec, info, elements, suivi) {
    var cameras = [], erreurs = [];
    if (!sec || !sec.querySelectorAll) return { cameras: cameras, erreurs: erreurs };
    var rythme = info.rythme || 1;
    Array.prototype.forEach.call(sec.querySelectorAll('[data-ken-burns]'), function (el, rang) {
      var nom = el.id || el.className || 'data-ken-burns';
      var signaler = function (message) { erreurs.push({ regle: 'ken-burns-invalide', scene: info.id, message: 'Scène « ' + info.id + ' », « ' + nom + ' » : ' + message }); };
      var spec;
      try { spec = lireKenBurns(el.getAttribute('data-ken-burns')); } catch (e) { signaler(e.message); return; }
      if (spec.horsBornes !== undefined) signaler('ampleur ' + String(spec.horsBornes).replace('.', ',') + ' ramenée à ' + String(spec.ampleur).replace('.', ',') + ' (zoom final de 1,03 à 1,3).');
      var cible = el.querySelector('img, picture, svg, video, canvas') || el.firstElementChild;
      if (!cible) { signaler('aucune image dans le conteneur.'); return; }
      // Apparition : le conteneur minuté, ou son ancêtre minuté le plus proche ; sinon le début de la scène.
      var debutAbs = info.debut;
      for (var p = el; p && p !== sec; p = p.parentElement) {
        var cle = p.getAttribute && p.getAttribute('data-pm-cle');
        if (cle && elements && elements[cle]) { debutAbs = elements[cle].debut; break; }
      }
      var debut = Math.max(0, (debutAbs - info.debut) * rythme);
      var duree = Math.max(0.01, (info.fin - debutAbs) * rythme);
      var clauses = kenBurns(spec, debut, duree, info.id + '|' + rang, suivi ? suivi.precedent : null);
      if (suivi) suivi.precedent = clauses.sens;
      cible.setAttribute('data-pm-kb', clauses.sens);
      cameras.push({ el: cible, clauses: clauses, kenBurns: clauses.zoomMax });
    });
    return { cameras: cameras, erreurs: erreurs };
  }

  return { lireKenBurns: lireKenBurns, kenBurns: kenBurns, sensKenBurns: sensKenBurns, camerasKenBurns: camerasKenBurns, SENS_KEN_BURNS: SENS, AMPLEUR_KEN_BURNS: AMPLEUR };
});
