/* Pulse Motion – mesures de la vidéo rendue, pour les contrôles (Chrome sans fenêtre).
 *
 * M.mesurer({ ratio, seuils }) rend la vidéo tous les seuils.pasMesure secondes et renvoie des constats
 * bruts { regle, scene, element, instant, valeur }, sans message (scripts/lib/rendu-controle.js les traduit) :
 * chevauchement, hors-cadre, marge, zone-sure (9:16), logo-masque, texte-fugace, mouvement-rapide, sous-titre-cache-texte.
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
  var DEFAUTS = { pasMesure: 0.2, immobile: 0.005, chevauchementMax: 0.1, margeMin: 0.04, logoMasqueMax: 0.2, grandElement: 0.25, vitesseMax: 1, texteFugaceBase: 0.8, texteFugaceParMot: 0.2,
    zoneHaut: 0.07, zoneBas: 0.2, zoneDroite: 0.11, zoneDroiteDebut: 0.4, zoneDroiteFin: 0.85 };

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
    // Sans identifiant : texte alternatif d'une image, sinon première classe, sinon balise.
    return el.id || el.getAttribute('data-texte') || (estLogo(el) ? 'logo' : el.getAttribute('alt') || el.classList[0] || el.tagName.toLowerCase());
  }
  /** Rectangle d'un élément ; pour un texte, l'étendue de son texte (une boîte de bloc prend toute la largeur). */
  function rectangle(el) {
    if (!el.hasAttribute('data-texte')) return el.getBoundingClientRect();
    var plage = document.createRange();
    plage.selectNodeContents(el);
    return plage.getBoundingClientRect();
  }
  /** Zone des lettres d'un texte : sa boîte de texte réduite de 20 % de la taille de police en haut et
   * en bas (place des montantes et descendantes, vide pour un chiffre géant) ; autre élément : inchangée. */
  function encre(x) {
    if (!x.el.hasAttribute('data-texte')) return x.r;
    var marge = 0.2 * parseFloat(getComputedStyle(x.el).fontSize);
    var haut = x.r.top + marge;
    var bas = Math.max(haut, x.r.bottom - marge);
    return { left: x.r.left, right: x.r.right, top: haut, bottom: bas, width: x.r.width, height: bas - haut };
  }
  /** Une scène est-elle en train d'entrer à t (transition d'entrée, ou entrée de la première depuis le fond) ? */
  function enEntree(t) {
    return M.minutage.scenes.some(function (s, i) {
      var duree = s.entree > 0 ? s.entree : (i === 0 ? (M.CHEVAUCHEMENT || 0.5) : 0);
      return t >= s.debut - 1e-9 && t < s.debut + duree - 1e-9;
    });
  }
  /** a est-il peint au-dessus de b, au centre de leur partie commune ? */
  function audessus(a, b) {
    var x = (Math.max(a.r.left, b.r.left) + Math.min(a.r.right, b.r.right)) / 2;
    var y = (Math.max(a.r.top, b.r.top) + Math.min(a.r.bottom, b.r.bottom)) / 2;
    var pile = document.elementsFromPoint(x, y);
    var rang = function (el) { for (var i = 0; i < pile.length; i++) if (el === pile[i] || el.contains(pile[i])) return i; return -1; };
    var ia = rang(a.el);
    var ib = rang(b.el);
    return ia >= 0 && (ib < 0 || ia < ib);
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
    var precedents = new Map();   // élément -> { r, k } : relevé précédent (mouvement rapide)
    var releves = new Map();      // élément jugé -> { r, k } : relevé précédent (immobilité)
    var enTransition = false;
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
      // Pendant une transition, et au relevé qui la suit, la scène se déplace en bloc : rien n'est jugé immobile ni rapide.
      var bouge = visibles.length > 1 || enEntree(t);
      var transition = bouge || enTransition;
      enTransition = bouge;
      var textesVus = new Set();
      visibles.forEach(function (id) {
        var sec = conteneur.querySelector(':scope > section[data-scene="' + id + '"]');
        if (!sec) return;
        var immobiles = [];
        // Mouvement rapide : grands éléments animés ou jugés, hors transition.
        sec.querySelectorAll('[data-start], ' + JUGES).forEach(function (el) {
          var r = el.getBoundingClientRect();
          var avant = precedents.get(el);
          precedents.set(el, { r: r, k: k });
          // Seulement deux relevés consécutifs, l'élément affiché dans les deux : une scène qui
          // réapparaît (rectangle nul tant qu'elle était masquée) n'est pas un mouvement.
          if (!avant || avant.k !== k - 1 || !aire(avant.r) || !aire(r) || transition) return;
          avant = avant.r;
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
          var avant = releves.get(el);
          releves.set(el, { r: r, k: k });
          if (!stable || !avant || avant.k !== k - 1) return;
          avant = avant.r;
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
              // Interfaces des réseaux (TikTok, Reels) : bandeau du haut, légende du bas, colonne de boutons
              // à droite entre 40 % et 85 % de la hauteur.
              var colonne = r.bottom > cadre.top + S.zoneDroiteDebut * H && r.top < cadre.top + S.zoneDroiteFin * H;
              var zone = r.top < cadre.top + S.zoneHaut * H ? 'haut' : r.bottom > cadre.bottom - S.zoneBas * H ? 'bas'
                : colonne && r.right > cadre.right - S.zoneDroite * W ? 'droite' : null;
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
            var superpose = a.el.closest('[data-superpose]') || b.el.closest('[data-superpose]');
            // Logo masqué : seulement par un élément peint au-dessus de lui, et pas autorisé (data-superpose).
            var logo = estLogo(a.el) ? a : estLogo(b.el) ? b : null;
            var autre = logo === a ? b : a;
            if (logo && !superpose && c / aire(logo.r) > S.logoMasqueMax && audessus(autre, logo)) constater('logo-masque', id, nom(logo.el), t, arrondi(c / aire(logo.r)));
            if (superpose) continue;
            var ra = encre(a);
            var rb = encre(b);
            var part = commune(ra, rb) / Math.min(aire(ra), aire(rb));
            if (part > S.chevauchementMax) constater('chevauchement', id, nom(a.el) + '|' + nom(b.el), t, arrondi(part));
          }
        }
      });
      // Sous-titres : carton qui recouvre un texte de la scène ; en 9:16, carton dans les zones des réseaux.
      var carton = conteneur.querySelector('#pm-sous-titres .pm-st-carton');
      if (carton && opacite(carton) > 0.5 && aire(carton.getBoundingClientRect()) > 0) {
        var rc = carton.getBoundingClientRect();
        visibles.forEach(function (id) {
          var sec = conteneur.querySelector(':scope > section[data-scene="' + id + '"]');
          if (!sec) return;
          sec.querySelectorAll('[data-texte]').forEach(function (el) {
            if (!estJuge(el) || opacite(el) <= 0.5) return;
            var r = encre({ el: el, r: rectangle(el) });
            if (!aire(r)) return;
            var part = commune(r, rc) / aire(r);
            if (part > S.chevauchementMax) constater('sous-titre-cache-texte', id, nom(el), t, arrondi(part));
          });
          // Logo de la scène sous un carton (le calque des sous-titres passe au-dessus du contenu des scènes).
          sec.querySelectorAll('[data-logo], .logo').forEach(function (el) {
            if (opacite(el) <= 0.5) return;
            var rl = el.getBoundingClientRect();
            if (aire(rl) && commune(rl, rc) / aire(rl) > S.logoMasqueMax) constater('logo-masque', id, nom(el), t, { par: 'sous-titres', part: arrondi(commune(rl, rc) / aire(rl)) });
          });
        });
        var sceneSt = visibles[visibles.length - 1];
        var dSt = Math.min(rc.left - cadre.left, cadre.right - rc.right, rc.top - cadre.top, cadre.bottom - rc.bottom);
        if (sceneSt && dSt < S.margeMin * petit) constater('marge', sceneSt, 'sous-titres', t, arrondi(Math.max(0, dSt) / petit * 100));
        if (vertical && sceneSt) {
          var colonneSt = rc.bottom > cadre.top + S.zoneDroiteDebut * H && rc.top < cadre.top + S.zoneDroiteFin * H;
          var zoneSt = rc.top < cadre.top + S.zoneHaut * H ? 'haut' : rc.bottom > cadre.bottom - S.zoneBas * H ? 'bas'
            : colonneSt && rc.right > cadre.right - S.zoneDroite * W ? 'droite' : null;
          if (zoneSt) constater('zone-sure', sceneSt, 'sous-titres', t, zoneSt);
        }
      }
      lectures.forEach(function (l, el) { if (!textesVus.has(el)) fermerLecture(el, l); });
    }
    lectures.forEach(function (l, el) { l.fin = M.duree; fermerLecture(el, l); });
    // Cartons de sous-titres affichés moins de 1,25 s (durée lue dans les données : c'est celle de l'affichage).
    var st = M.donnees && M.donnees.sousTitres;
    if (st && st.incrustes !== false && st.cartons) {
      st.cartons.forEach(function (c) {
        if (c.fin - c.debut < 1.25 - 1e-6) constater('texte-fugace', c.scene, 'sous-titres', c.debut, { duree: arrondi(c.fin - c.debut), besoin: 1.25 });
      });
    }
    M.rendre(depart);
    return constats;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
