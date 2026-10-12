/* Pulse Motion – mesures de la vidéo rendue, pour les contrôles (Chrome sans fenêtre).
 *
 * M.mesurer({ ratio, seuils }) rend la vidéo tous les seuils.pasMesure secondes et renvoie des constats
 * bruts { regle, scene, element, instant, valeur }, sans message (scripts/lib/rendu-controle.js les traduit) :
 * chevauchement, hors-cadre, marge, zone-sure (9:16), logo-masque, texte-fugace, mouvement-rapide.
 * Élément jugé : texte (data-texte), image (sauf alt="" décoratif), logo, SVG de contenu (sans aria-hidden),
 * hors décor (.decor, [data-decor]) et pas imbriqué dans un autre élément jugé. Immobile : même place
 * qu'au relevé précédent, porteur data-etat ni « avant » ni « pendant », lettres arrivées, pas de transition.
 * [data-superpose] autorise un élément à en recouvrir un autre. Un constat par (règle, scène, élément).
 * Revient à l'instant de départ. Navigateur seulement ; dépend de horloge (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var JUGES = '[data-texte], img, [data-logo], .logo, svg:not([aria-hidden="true"])';
  var DEFAUTS = { pasMesure: 0.2, immobile: 0.005, chevauchementMax: 0.1, margeMin: 0.04, logoMasqueMax: 0.2, grandElement: 0.25, vitesseMax: 1, texteFugaceBase: 0.8, texteFugaceParMot: 0.2 };

  function estLogo(el) { return el.hasAttribute('data-logo') || el.classList.contains('logo'); }
  function estJuge(el) {
    if (el.closest('.decor, [data-decor]')) return false;
    if (el.tagName === 'IMG' && el.getAttribute('alt') === '' && !estLogo(el)) return false;
    var parent = el.parentElement;
    return !(parent && parent.closest(JUGES));
  }
  function opacite(el) {
    var o = 1;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  }
  function etat(el) { var p = el.closest('[data-etat]'); return p ? p.getAttribute('data-etat') : null; }
  function lettresEnCours(el) {
    if (!el.hasAttribute('data-lettres') && !el.hasAttribute('data-mots')) return false;
    return el.getAnimations({ subtree: true }).some(function (a) {
      var fin = a.effect && a.effect.getComputedTiming().endTime;
      return typeof fin === 'number' && a.currentTime < fin;
    });
  }
  function nom(el) {
    return el.id || el.getAttribute('data-texte') || (estLogo(el) ? 'logo' : el.tagName.toLowerCase());
  }
  /** Rectangle d'un élément ; pour un texte, l'étendue de son texte (une boîte de bloc prend toute la largeur). */
  function rectangle(el) {
    if (!el.hasAttribute('data-texte')) return el.getBoundingClientRect();
    var plage = document.createRange();
    plage.selectNodeContents(el);
    return plage.getBoundingClientRect();
  }
  function aire(r) { return Math.max(0, r.width) * Math.max(0, r.height); }
  function commune(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function mots(t) { return (String(t).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length; }
  function arrondi(x) { return Math.round(x * 100) / 100; }

  M.mesurer = function (options) {
    options = options || {};
    var S = {};
    Object.keys(DEFAUTS).forEach(function (k) { S[k] = options.seuils && typeof options.seuils[k] === 'number' ? options.seuils[k] : DEFAUTS[k]; });
    var vertical = options.ratio === '9:16';
    var depart = M.temps();
    var conteneur = document.getElementById('pm-scene');
    var constats = [];
    var vus = {};
    function constater(regle, scene, element, t, valeur) {
      var cle = regle + '|' + scene + '|' + element;
      if (vus[cle]) return;
      vus[cle] = true;
      constats.push({ regle: regle, scene: scene, element: element, instant: arrondi(t), valeur: valeur === undefined ? null : valeur });
    }
    var precedents = new Map();
    var lectures = new Map();   // texte -> { scene, debut, fin }

    function fermerLecture(el, l) {
      var duree = l.fin - l.debut + S.pasMesure;
      var besoin = S.texteFugaceBase + S.texteFugaceParMot * mots(el.textContent);
      if (duree < besoin - 1e-6) constater('texte-fugace', l.scene, nom(el), l.debut, { duree: arrondi(duree), besoin: arrondi(besoin) });
      lectures.delete(el);
    }

    var n = Math.floor(M.duree / S.pasMesure + 1e-6);
    for (var k = 0; k <= n; k++) {
      var t = Math.min(M.duree, k * S.pasMesure);
      M.rendre(t);
      var cadre = conteneur.getBoundingClientRect();
      var W = cadre.width;
      var H = cadre.height;
      var petit = Math.min(W, H);
      var visibles = M.scenesVisibles(M.minutage, t);
      var transition = visibles.length > 1;
      var textesVus = new Set();
      visibles.forEach(function (id) {
        var sec = conteneur.querySelector(':scope > section[data-scene="' + id + '"]');
        if (!sec) return;
        var immobiles = [];
        // Mouvement rapide : grands éléments animés ou jugés, hors transition.
        sec.querySelectorAll('[data-start], ' + JUGES).forEach(function (el) {
          var r = el.getBoundingClientRect();
          var avant = precedents.get(el);
          precedents.set(el, r);
          if (!avant || transition) return;
          var visibleDansImage = commune(r, cadre);
          if (visibleDansImage < S.grandElement * W * H) return;
          var dx = (r.left + r.width / 2) - (avant.left + avant.width / 2);
          var dy = (r.top + r.height / 2) - (avant.top + avant.height / 2);
          var vitesse = Math.sqrt(dx * dx + dy * dy) / W / S.pasMesure;
          if (vitesse > S.vitesseMax) constater('mouvement-rapide', id, nom(el), t, arrondi(vitesse));
        });
        sec.querySelectorAll(JUGES).forEach(function (el) {
          if (!estJuge(el)) return;
          var r = rectangle(el);
          var visible = aire(r) > 0 && opacite(el) > 0.5;
          if (el.hasAttribute('data-texte') && visible) {
            textesVus.add(el);
            var l = lectures.get(el);
            if (l) l.fin = t; else lectures.set(el, { scene: id, debut: t, fin: t });
          }
          if (!visible) return;
          var e = etat(el);
          var stable = !transition && e !== 'avant' && e !== 'pendant' && !lettresEnCours(el);
          var avant = el.__pmAvant;
          el.__pmAvant = r;
          if (!stable || !avant) return;
          if (Math.abs(r.left - avant.left) > S.immobile * W || Math.abs(r.top - avant.top) > S.immobile * H ||
              Math.abs(r.width - avant.width) > S.immobile * W || Math.abs(r.height - avant.height) > S.immobile * H) return;
          immobiles.push({ el: el, r: r });
        });
        immobiles.forEach(function (x) {
          var el = x.el;
          var r = x.r;
          var texte = el.hasAttribute('data-texte');
          var dedans = r.left >= cadre.left - 1 && r.right <= cadre.right + 1 && r.top >= cadre.top - 1 && r.bottom <= cadre.bottom + 1;
          if (!texte && !dedans && !el.closest('[data-camera]')) {
            if (estLogo(el)) constater('logo-masque', id, nom(el), t, 'dehors');
            else constater('hors-cadre', id, nom(el), t);
          }
          if (texte && dedans) {
            var d = Math.min(r.left - cadre.left, cadre.right - r.right, r.top - cadre.top, cadre.bottom - r.bottom);
            if (d < S.margeMin * petit) constater('marge', id, nom(el), t, arrondi(Math.max(0, d) / petit * 100));
            if (vertical) {
              var zone = r.top < cadre.top + 0.10 * H ? 'haut' : r.bottom > cadre.bottom - 0.20 * H ? 'bas' : r.right > cadre.right - 0.12 * W ? 'droite' : null;
              if (zone) constater('zone-sure', id, nom(el), t, zone);
            }
          }
        });
        for (var i = 0; i < immobiles.length; i++) {
          for (var j = i + 1; j < immobiles.length; j++) {
            var a = immobiles[i];
            var b = immobiles[j];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            var c = commune(a.r, b.r);
            if (!c) continue;
            var logo = estLogo(a.el) ? a : estLogo(b.el) ? b : null;
            if (logo && c / aire(logo.r) > S.logoMasqueMax) constater('logo-masque', id, nom(logo.el), t, arrondi(c / aire(logo.r)));
            if (a.el.closest('[data-superpose]') || b.el.closest('[data-superpose]')) continue;
            var part = c / Math.min(aire(a.r), aire(b.r));
            if (part > S.chevauchementMax) constater('chevauchement', id, nom(a.el) + '|' + nom(b.el), t, arrondi(part));
          }
        }
      });
      lectures.forEach(function (l, el) { if (!textesVus.has(el)) fermerLecture(el, l); });
    }
    lectures.forEach(function (l, el) { l.fin = M.duree; fermerLecture(el, l); });
    precedents.forEach(function (r, el) { delete el.__pmAvant; });
    M.rendre(depart);
    return constats;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
