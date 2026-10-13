/* Pulse Motion – sous-titres : mots d'une scène, découpage en cartons lisibles (2 lignes au plus, coupes aux
 * ponctuations, jamais après un article, 3,5 mots/s au plus, 1,25 s au moins), fichiers SRT et VTT.
 * Le texte affiché est celui du script ; les temps viennent de la voix (ou de la durée de la scène).
 *
 * Module pur : chargé tel quel dans la page (global M.sousTitres) et par Node (require).
 */
(function (racine, fabrique) {
  var Al = typeof require === 'function' && typeof module === 'object' ? require('./aligner.js') : (racine.M && racine.M.aligner);
  var api = fabrique(Al);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.sousTitres = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Al) {
  'use strict';

  // Caractères par ligne : 42 en paysage et au carré, 32 en 4:5, 28 en 9:16 (le carton s'y écarte des boutons à droite).
  var LARGEUR = { large: 42, etroit: 32, vertical: 28 };
  var DUREE_MIN = 1.25, DEBIT_MAX = 3.5, ECART = 0.1, MARGE_SANS_VOIX = 0.3;
  var FORTE = /[.!?…]["»”’)]*$/;
  var FAIBLE = /[,;:]["»”’)]*$/;
  var ARTICLES = ['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'au', 'aux', 'ce', 'cet', 'cette', 'ces',
    'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'a', 'en'];
  var LIAISONS = ['et', 'ou', 'mais', 'donc', 'car', 'ni', 'qui', 'que', 'quand', 'pour', 'avec', 'sans', 'parce', 'puis', 'comme', 'si', 'dont'];

  function arrondi(x) { return Math.round(x * 1000) / 1000; }
  function longueur(ms) { return ms.map(function (m) { return m.w; }).join(' ').length; }
  /** Mots d'une ligne remis bout à bout, avec les espaces insécables du texte. */
  function joindre(l) { return l.map(function (m, j) { return m.w + (j + 1 < l.length ? (m.insecable || ' ') : ''); }).join(''); }
  function cle(m) { return Al.normaliserMot(m.w); }

  /** Mots de la scène en temps absolus : ceux de la voix, sinon le texte réparti sur la scène au prorata des lettres. */
  function motsDeScene(s) {
    var liste = Al.decouperMots(s.texte || '');
    if (s.voix && s.voix.mots && s.voix.mots.length) {
      var d = s.debut + (s.voix.debut || 0);
      // Mots de la voix dans l'ordre du texte : ils reprennent sa graphie (espaces insécables comprises).
      var memes = liste.length === s.voix.mots.length;
      return s.voix.mots.map(function (m, k) {
        var mot = { w: memes ? liste[k].w : m.w, t0: arrondi(d + m.t0), t1: arrondi(d + m.t1) };
        if (memes && liste[k].insecable) mot.insecable = liste[k].insecable;
        return mot;
      });
    }
    var a = s.debut + MARGE_SANS_VOIX, b = Math.max(a, s.fin - MARGE_SANS_VOIX);
    var total = liste.reduce(function (n, m) { return n + Math.max(1, m.cles[0].length); }, 0), cumul = 0;
    return liste.map(function (m) {
      var t0 = a + (b - a) * cumul / total;
      cumul += Math.max(1, m.cles[0].length);
      var mot = { w: m.w, t0: arrondi(t0), t1: arrondi(a + (b - a) * cumul / total) };
      if (m.insecable) mot.insecable = m.insecable;
      return mot;
    });
  }

  /** Note d'une coupe juste avant le mot i (0 : interdite : après un article, ou avant une ponctuation isolée). */
  function note(ms, i) {
    if (i <= 0 || i >= ms.length) return 0;
    if (!cle(ms[i]) || ms[i - 1].insecable) return 0;
    if (ARTICLES.indexOf(cle(ms[i - 1])) >= 0) return 0;
    if (FORTE.test(ms[i - 1].w)) return 4;
    if (FAIBLE.test(ms[i - 1].w)) return 3;
    if (LIAISONS.indexOf(cle(ms[i])) >= 0) return 2;
    return 1;
  }

  /** Coupe ms en morceaux d'au plus max caractères (le plus long possible, à la meilleure coupe). */
  function couper(ms, max) {
    var morceaux = [];
    while (ms.length) {
      if (longueur(ms) <= max) { morceaux.push(ms); break; }
      // Meilleure coupe : ponctuation d'abord, mais une ligne bien remplie l'emporte sur une ligne orpheline.
      var meilleure = -1, meilleureNote = -1, i;
      for (i = 1; i < ms.length && longueur(ms.slice(0, i)) <= max; i++) {
        var n = note(ms, i);
        var valeur = n + 2.5 * longueur(ms.slice(0, i)) / max;
        if (n > 0 && valeur >= meilleureNote) { meilleure = i; meilleureNote = valeur; }
      }
      // Aucune coupe permise dans la largeur (mot trop long, articles) : la première coupe permise, sinon après le premier mot.
      if (meilleure < 0) {
        for (i = 1; i < ms.length && note(ms, i) === 0; i++) { /* première coupe permise */ }
        meilleure = Math.max(1, Math.min(i, ms.length));
      }
      morceaux.push(ms.slice(0, meilleure));
      ms = ms.slice(meilleure);
    }
    return morceaux;
  }

  /** Carton (mots) -> une ou deux lignes, coupe équilibrée et permise. */
  function lignes(ms, max) {
    if (longueur(ms) <= max || ms.length < 2) return [ms];
    var meilleure = 1, score = -Infinity;
    for (var i = 1; i < ms.length; i++) {
      var a = longueur(ms.slice(0, i)), b = longueur(ms.slice(i));
      var n = note(ms, i);
      var s = (n ? n : -10) - Math.abs(a - b) / max * 4 - (a > max || b > max ? 20 : 0);
      if (s > score) { score = s; meilleure = i; }
    }
    return [ms.slice(0, meilleure), ms.slice(meilleure)];
  }

  /** Phrases (coupées après une ponctuation forte) -> cartons d'au plus deux lignes. */
  function cartons(scenes, options) {
    var ratio = options && options.ratio;
    var max = ratio === '9:16' ? LARGEUR.vertical : ratio === '4:5' ? LARGEUR.etroit : LARGEUR.large;
    var resultat = [];
    scenes.forEach(function (sc) {
      var phrases = [], courante = [];
      sc.mots.forEach(function (m) { courante.push(m); if (FORTE.test(m.w)) { phrases.push(courante); courante = []; } });
      if (courante.length) phrases.push(courante);
      var siens = [];
      // Une phrase -> lignes valides (largeur, coupes permises) -> cartons de deux lignes ; une phrase courte tient sur une ligne.
      phrases.forEach(function (p) {
        var ls = longueur(p) <= 2 * max ? lignes(p, max) : null;
        if (!ls || ls.some(function (l) { return longueur(l) > max && l.length > 1; }) || (ls.length === 2 && note(p, ls[0].length) === 0)) ls = couper(p, max);
        for (var k = 0; k < ls.length; k += 2) {
          var bloc = ls.slice(k, k + 2);
          var premier = bloc[0][0], dernier = bloc[bloc.length - 1][bloc[bloc.length - 1].length - 1];
          siens.push({ scene: sc.id, debut: premier.t0, fin: dernier.t1, lignes: bloc });
        }
      });
      // Phrases très courtes (« Vite. ») : regroupées avec la suivante quand le tout tient en deux lignes et se lit à temps.
      for (var k = 0; k + 1 < siens.length; k++) {
        var a = siens[k], b = siens[k + 1];
        var nbA = a.lignes.reduce(function (n, l) { return n + l.length; }, 0);
        var nbB = b.lignes.reduce(function (n, l) { return n + l.length; }, 0);
        var court = a.fin - a.debut < DUREE_MIN;
        var place = a.lignes.length + b.lignes.length <= 2;
        var lisible = (nbA + nbB) / Math.max(DUREE_MIN, b.fin - a.debut) <= DEBIT_MAX;
        if (court && place && lisible && b.debut - a.fin < 1) {
          var tout = a.lignes.concat(b.lignes);
          var uneLigne = [].concat.apply([], tout);
          siens.splice(k, 2, { scene: sc.id, debut: a.debut, fin: b.fin, lignes: longueur(uneLigne) <= max ? [uneLigne] : tout });
          k--;
        }
      }
      // Durée de lecture : au moins 1,25 s et 1 s pour 3,5 mots, prise sur le silence, sans toucher le suivant ni sortir de la scène.
      siens.forEach(function (c, k) {
        var nb = c.lignes.reduce(function (n, l) { return n + l.length; }, 0);
        var besoin = Math.max(DUREE_MIN, nb / DEBIT_MAX);
        var limite = k + 1 < siens.length ? siens[k + 1].debut - ECART : sc.fin;
        c.debut = arrondi(Math.max(sc.debut, Math.min(c.debut, sc.fin - 0.1)));
        c.fin = arrondi(Math.min(Math.max(c.fin, c.debut + besoin), limite, sc.fin));
        if (c.fin <= c.debut) c.fin = arrondi(Math.min(sc.fin, c.debut + 0.1));
      });
      Array.prototype.push.apply(resultat, siens);
    });
    // Entre deux scènes qui se chevauchent (transition), le carton précédent s'arrête 0,1 s avant le suivant.
    for (var i = 0; i + 1 < resultat.length; i++) {
      var c = resultat[i], d = resultat[i + 1];
      if (c.fin > d.debut - ECART) c.fin = arrondi(Math.max(c.debut + 0.1, d.debut - ECART));
      if (c.fin > d.debut - ECART) d.debut = arrondi(c.fin + ECART);
    }
    return resultat;
  }

  function horodatage(t, separateur) {
    var ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    var p = function (x, n) { return String(x).padStart(n, '0'); };
    return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + separateur + p(ms % 1000, 3);
  }
  function texteCarton(c) { return c.lignes.map(joindre).join('\n'); }
  function echapper(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function versSRT(liste) {
    return liste.map(function (c, i) { return (i + 1) + '\n' + horodatage(c.debut, ',') + ' --> ' + horodatage(c.fin, ',') + '\n' + texteCarton(c) + '\n'; }).join('\n');
  }
  function versVTT(liste) {
    return 'WEBVTT\n\n' + liste.map(function (c) { return horodatage(c.debut, '.') + ' --> ' + horodatage(c.fin, '.') + '\n' + echapper(texteCarton(c)) + '\n'; }).join('\n');
  }

  return { LARGEUR: LARGEUR, motsDeScene: motsDeScene, cartons: cartons, versSRT: versSRT, versVTT: versVTT };
});
