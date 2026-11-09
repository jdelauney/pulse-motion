/* Pulse Motion – mesures de la vidéo rendue, pour les contrôles (Chrome sans fenêtre).
 *
 * M.mesurer({ ratio, seuils, plages?, genre? }) rend la vidéo tous les seuils.pasMesure secondes et renvoie des constats
 * bruts { regle, scene, element, instant, valeur }, sans message (scripts/lib/rendu-controle.js les traduit) :
 * chevauchement, hors-cadre, marge (textes, images, logos, SVG), zone-sure (9:16), logo-masque, texte-fugace, mouvement-rapide,
 * sous-titre-cache-texte ; réalisation (spec S2, 5.8) : texte-casse, texte-epingle ([data-repere] exclu), accroche et
 * image-zero (options.genre « social »), image-agrandie (rapportée à l'export en 1080p), texte-petit-lecteur, sujet-petit
 * (un rendu par scène, à l'instant stable), transition-vide, sous-titre-cache-sujet. Idées de take-one (text-audit.mjs,
 * plate-audit.mjs : BROKEN, PINNED, SMALL, UPSCALE ; MIT, © 2026 Tal Siach) et d'explainroo (readability.js : 854 px,
 * 16 px ; MIT, © 2026 Vincent Schmalbach), adaptées au DOM.
 * Élément jugé : texte (data-texte), image (sauf alt="" décoratif), logo, SVG de contenu (sans aria-hidden),
 * hors décor (.decor, [data-decor]) et pas imbriqué dans un autre élément jugé. Immobile : même place
 * qu'au relevé précédent, porteur data-etat ni « avant » ni « pendant », lettres arrivées, pas de transition.
 * [data-superpose] autorise un élément à en recouvrir un autre. Un constat par (règle, scène, élément).
 * plages : [[debut, fin]] ; seuls les relevés qui y tombent sont faits (contrôle partiel : les scènes changées, et un
 * relevé de chaque côté ; les constats des autres scènes sont repris du contrôle précédent).
 * Revient à l'instant de départ. Navigateur seulement ; dépend de horloge (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var JUGES = '[data-texte], img, [data-logo], .logo, svg:not([aria-hidden="true"])';
  var DEFAUTS = { pasMesure: 0.2, immobile: 0.005, chevauchementMax: 0.1, margeMin: 0.04, logoMasqueMax: 0.2, grandElement: 0.25, vitesseMax: 1, texteFugaceBase: 0.8, texteFugaceParMot: 0.2,
    zoneHaut: 0.07, zoneBas: 0.2, zoneDroite: 0.11, zoneDroiteDebut: 0.4, zoneDroiteFin: 0.85, sousTitreMin: 1.25,
    grandTexteCqh: 4.5, animationLongue: 3, epingleCoin: 0.15, epingleDuree: 6, accrocheMax: 3, accrocheTaille: 0.078, agrandissementMax: 1.12,
    lecteurLargeur: 854, lecteurTexteMin: 16, telephoneLargeur: 360, telephoneTexteMin: 9, sujetMin: 0.33, regardDecalage: 0.3, transitionOpacite: 0.1 };
  // Largeur de l'image exportée en 1080p, par format (scripts/export-fidele.js, TAILLES).
  var LARGEUR_EXPORT = { '16:9': 1920, '9:16': 1080, '1:1': 1080, '4:5': 1080 };
  var CASSE = /\b(NaN|undefined|Infinity|null)\b|\[object Object\]/;
  var TRAME = /^data:image\/(png|jpe?g|gif|webp|avif)|\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i;
  // Sujet d'une image : textes, images, SVG de contenu, conteneurs de personnages (spec S2, 5.8).
  var SUJETS = '[data-personnage], img, svg:not([aria-hidden="true"])';

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
    // Texte ou compteur : l'étendue de son texte (une boîte de bloc prend toute la largeur).
    if (!el.hasAttribute('data-texte') && !/(^|;)\s*nombre\s/.test(el.getAttribute('data-tween') || '')) return el.getBoundingClientRect();
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
      // Première scène : la durée de sa transition (0,8 s par défaut pour un shader, 0,5 s en CSS, 0 sans transition).
      var duree = s.entree > 0 ? s.entree : (i === 0 ? (s.dureeTransition || 0) : 0);
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
  /** Taille rendue d'un texte (px) : taille de police × échelle réelle (largeur rendue / largeur de mise en page). */
  function tailleRendue(el) {
    var l = el.offsetWidth;
    var echelle = l > 0 ? el.getBoundingClientRect().width / l : 1;
    return parseFloat(getComputedStyle(el).fontSize) * (isFinite(echelle) && echelle > 0 ? echelle : 1);
  }
  /** Image tramée (png, jpg, gif, webp, avif), pas un SVG. */
  function estTramee(img) { return img.tagName === 'IMG' && TRAME.test(img.getAttribute('src') || ''); }
  /** Éléments sujets d'une section (hors décor, logo, image décorative, et pas dans un autre sujet). */
  function sujets(sec) {
    return Array.prototype.filter.call(sec.querySelectorAll(SUJETS), function (el) {
      if (el.closest('.decor, [data-decor]') || estLogo(el)) return false;
      if (el.tagName === 'IMG' && el.getAttribute('alt') === '') return false;
      var parent = el.parentElement;
      return !(parent && parent.closest('[data-personnage], svg'));
    });
  }
  /** Éléments porteurs d'un texte écrit d'une section (data-texte, compteurs, et tout élément qui a son propre texte). */
  function porteursTexte(sec) {
    var vus = new Set();
    sec.querySelectorAll('[data-texte], [data-tween*="nombre"]').forEach(function (el) { vus.add(el); });
    var w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      var p = n.parentElement;
      if (!p || !n.nodeValue.trim() || p.closest('svg, script, style') || p.closest('[data-texte]')) continue;
      vus.add(p);
    }
    return Array.from(vus);
  }

  M.mesurer = function (options) {
    options = options || {};
    var S = {};
    Object.keys(DEFAUTS).forEach(function (k) { S[k] = options.seuils && typeof options.seuils[k] === 'number' ? options.seuils[k] : DEFAUTS[k]; });
    var vertical = options.ratio === '9:16';
    var depart = M.temps();
    var conteneur = document.getElementById('pm-scene');
    var constats = [];
    var vus = {};
    function constater(regle, scene, element, t, valeur, extra) {
      var cle = regle + '|' + scene + '|' + element;
      if (vus[cle]) return;
      vus[cle] = true;
      var c = { regle: regle, scene: scene, element: element, instant: arrondi(t), valeur: valeur === undefined ? null : valeur };
      if (extra) Object.keys(extra).forEach(function (x) { c[x] = extra[x]; });
      constats.push(c);
    }
    var precedents = new Map();   // élément -> { r, k } : relevé précédent (mouvement rapide)
    var releves = new Map();      // élément jugé -> { r, k } : relevé précédent (immobilité)
    var enTransition = false;
    var lectures = new Map();   // texte -> { scene, debut, fin }
    // Réalisation (spec S2, 5.8).
    var social = options.genre === 'social';
    var largeurExport = LARGEUR_EXPORT[options.ratio] || 1920;
    var lecteur = options.ratio === '16:9' || !options.ratio ? { largeur: S.lecteurLargeur, min: S.lecteurTexteMin } : { largeur: S.telephoneLargeur, min: S.telephoneTexteMin };
    var epingles = new Map();     // contenu d'un petit texte en coin -> { scene, debut, duree }
    var agrandies = new Map();    // scène|image -> { scene, element, f, px, t }
    var accroche = { mesuree: false, lisible: null, petit: null, premier: null };
    var premiereScene = M.minutage.scenes.length ? M.minutage.scenes[0].id : null;

    function fermerLecture(el, l) {
      var duree = l.fin - l.debut + S.pasMesure;
      var besoin = S.texteFugaceBase + S.texteFugaceParMot * mots(el.textContent);
      if (duree < besoin - 1e-6) constater('texte-fugace', l.scene, nom(el), l.debut, { duree: arrondi(duree), besoin: arrondi(besoin) });
      lectures.delete(el);
    }

    var plages = options.plages || null;
    function dansPlages(t) {
      return !plages || plages.some(function (p) { return t >= p[0] - 1e-9 && t <= p[1] + 1e-9; });
    }
    var n = Math.floor(M.duree / S.pasMesure + 1e-6);
    for (var k = 0; k <= n; k++) {
      var t = Math.min(M.duree, k * S.pasMesure);
      if (!dansPlages(t)) continue;
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
          // Un texte brouillé (data-lettres="brouille") n'est lisible qu'une fois toutes ses lettres en place.
          var visible = aire(r) > 0 && opacite(el) > 0.5 && !el.querySelector('.pm-lettre[data-pm-brouille]');
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
          // Marge : textes, et images, logos et SVG de contenu (sauf une image pleine page, plus de 90 % de l'image).
          if (!texte && dedans && aire(r) <= 0.9 * W * H) {
            var di = Math.min(r.left - cadre.left, cadre.right - r.right, r.top - cadre.top, cadre.bottom - r.bottom);
            if (di < S.margeMin * petit) constater('marge', id, nom(el), t, arrondi(Math.max(0, di) / petit * 100), { image: true });
          }
          if (texte) {
            // Taille vue sur un petit lecteur (fil d'un réseau, téléphone) : zooms et échelles compris (spec S2, 5.8).
            var vu = tailleRendue(el) * lecteur.largeur / W;
            if (vu < lecteur.min - 1e-6) constater('texte-petit-lecteur', id, nom(el), t, { px: Math.round(vu * 10) / 10, largeur: lecteur.largeur, min: lecteur.min });
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
        // Textes écrits : cassés (NaN, undefined…), petits et épinglés dans un coin, accroche des réseaux.
        porteursTexte(sec).forEach(function (el) {
          if (el.closest('.decor, [data-decor]') || opacite(el) <= 0.5) return;
          var r = rectangle(el);
          if (!aire(r)) return;
          var contenu = el.textContent.replace(/\s+/g, ' ').trim();
          if (!contenu) return;
          var casse = CASSE.exec(contenu);
          if (casse) constater('texte-casse', id, nom(el), t, casse[0]);
          var taille = tailleRendue(el);
          if (!el.closest('[data-repere]') && !estLogo(el) && taille < S.grandTexteCqh * H / 100) {
            var cx = S.epingleCoin * W;
            var cy = S.epingleCoin * H;
            var enCoin = (r.right <= cadre.left + cx || r.left >= cadre.right - cx) && (r.bottom <= cadre.top + cy || r.top >= cadre.bottom - cy);
            if (enCoin) {
              var ep = epingles.get(contenu);
              if (ep) ep.duree += S.pasMesure; else epingles.set(contenu, { scene: id, debut: t, duree: S.pasMesure });
            }
          }
          if (social && el.hasAttribute('data-texte') && !lettresEnCours(el) && !el.querySelector('.pm-lettre[data-pm-brouille]')) {
            var p = taille / petit;
            if (p >= S.accrocheTaille - 1e-9) { if (accroche.premier === null) accroche.premier = t; if (t <= S.accrocheMax + 1e-9 && !accroche.lisible) accroche.lisible = { t: t }; }
            else if (t <= S.accrocheMax + 1e-9 && (!accroche.petit || p > accroche.petit.p)) accroche.petit = { element: nom(el), p: p, t: t };
          }
        });
        // Images tramées agrandies au-delà de leur taille réelle (zoom compris), rapportées à l'export en 1080p.
        sec.querySelectorAll('img').forEach(function (img) {
          if (!estTramee(img) || !img.naturalWidth || !img.naturalHeight || opacite(img) <= 0.5) return;
          var r = img.getBoundingClientRect();
          if (!aire(r)) return;
          var k2 = largeurExport / W;
          var fx = r.width * k2 / img.naturalWidth;
          var fy = r.height * k2 / img.naturalHeight;
          var f = getComputedStyle(img).objectFit === 'contain' ? Math.min(fx, fy) : Math.max(fx, fy);
          var cle = id + '|' + nom(img);
          var avant = agrandies.get(cle);
          if (!avant || f > avant.f) agrandies.set(cle, { scene: id, element: nom(img), f: f, px: Math.ceil(img.naturalWidth * f), t: t });
        });
        // Réseaux : la première image (vignette) montre déjà du contenu.
        if (social && k === 0 && id === premiereScene) {
          var plein = Array.prototype.some.call(sec.querySelectorAll(JUGES + ', [data-personnage]'), function (el) {
            return (!el.closest('.decor, [data-decor]')) && aire(rectangle(el)) > 0 && opacite(el) > 0.5;
          });
          if (!plein) constater('image-zero', id, null, 0);
        }
      });
      if (social && t <= S.accrocheMax + 1e-9) accroche.mesuree = true;
      // Transition entre deux scènes : un élément de contenu de l'une ou de l'autre reste visible.
      if (visibles.length > 1) {
        var vide = visibles.every(function (id) {
          var sec = conteneur.querySelector(':scope > section[data-scene="' + id + '"]');
          if (!sec) return true;
          return !Array.prototype.some.call(sec.querySelectorAll(JUGES + ', [data-personnage]'), function (el) {
            if (el.closest('.decor, [data-decor]')) return false;
            var r = rectangle(el);
            return aire(r) > 0 && commune(r, cadre) > 0 && opacite(el) > S.transitionOpacite;
          });
        });
        if (vide) constater('transition-vide', visibles[visibles.length - 1], visibles.join('|'), t);
      }
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
          // Sujet sous un carton : image, SVG de contenu, personnage.
          sujets(sec).forEach(function (el) {
            if (opacite(el) <= 0.5) return;
            var r = el.getBoundingClientRect();
            if (!aire(r)) return;
            var part = commune(r, rc) / aire(r);
            if (part > S.chevauchementMax) constater('sous-titre-cache-sujet', id, nom(el), t, arrondi(part));
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
        var vuSt = tailleRendue(carton) * lecteur.largeur / W;
        if (sceneSt && vuSt < lecteur.min - 1e-6) constater('texte-petit-lecteur', sceneSt, 'sous-titres', t, { px: Math.round(vuSt * 10) / 10, largeur: lecteur.largeur, min: lecteur.min });
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
    // Cartons de sous-titres affichés moins de sousTitreMin (durée lue dans les données : c'est celle de l'affichage).
    var st = M.donnees && M.donnees.sousTitres;
    if (st && st.incrustes !== false && st.cartons) {
      st.cartons.forEach(function (c) {
        if (c.fin - c.debut < S.sousTitreMin - 1e-6) constater('texte-fugace', c.scene, 'sous-titres', c.debut, { duree: arrondi(c.fin - c.debut), besoin: S.sousTitreMin });
      });
    }
    // Petit texte resté dans un coin plus de epingleDuree au total (même contenu, toutes scènes mesurées).
    epingles.forEach(function (e, contenu) {
      if (e.duree > S.epingleDuree + 1e-6) constater('texte-epingle', e.scene, contenu, e.debut, arrondi(e.duree));
    });
    agrandies.forEach(function (a) {
      if (a.f > S.agrandissementMax + 1e-6) constater('image-agrandie', a.scene, a.element, a.t, { f: Math.round(a.f * 100) / 100, px: a.px });
    });
    // Accroche des réseaux : un texte grand et complet avant accrocheMax (mesurée seulement si l'ouverture l'a été).
    if (social && accroche.mesuree && !accroche.lisible && premiereScene) {
      constater('accroche', premiereScene, accroche.petit ? accroche.petit.element : null, accroche.petit ? accroche.petit.t : 0,
        { t: accroche.premier, p: accroche.petit ? Math.round(accroche.petit.p * 1000) / 10 : null, min: Math.round(S.accrocheTaille * 1000) / 10 });
    }
    // Sujet aux moments clés : à l'instant stable de chaque scène (fin de la dernière entrée + regardDecalage).
    M.minutage.scenes.forEach(function (s, i) {
      var suivante = M.minutage.scenes[i + 1];
      var fin = suivante ? Math.min(s.fin, suivante.debut) : s.fin;
      var sec = conteneur.querySelector(':scope > section[data-scene="' + s.id + '"]');
      if (!sec) return;
      var elements = (M.minutage.elements && M.minutage.elements[s.id]) || {};
      var derniere = s.debut + (s.entree || 0);
      sec.querySelectorAll('[data-pm-cle]').forEach(function (el) {
        var e = elements[el.getAttribute('data-pm-cle')];
        if (!e || el.closest('.decor, [data-decor]')) return;
        derniere = Math.max(derniere, e.fin - e.debut < S.animationLongue ? e.fin : e.debut);
      });
      var t = Math.max(s.debut, Math.min(fin - 0.05, derniere + S.regardDecalage));
      if (!dansPlages(t)) return;
      M.rendre(t);
      var cadre = conteneur.getBoundingClientRect();
      var u = null;
      Array.prototype.forEach.call(sec.querySelectorAll(JUGES + ', [data-personnage], [data-tween*="nombre"]'), function (el) {
        if (el.closest('.decor, [data-decor]') || (el.tagName === 'IMG' && el.getAttribute('alt') === '' && !estLogo(el))) return;
        if (opacite(el) <= 0.5) return;
        var r = rectangle(el);
        var g = Math.max(r.left, cadre.left);
        var d = Math.min(r.right, cadre.right);
        var h = Math.max(r.top, cadre.top);
        var b = Math.min(r.bottom, cadre.bottom);
        if (d <= g || b <= h) return;
        u = u ? { g: Math.min(u.g, g), d: Math.max(u.d, d), h: Math.min(u.h, h), b: Math.max(u.b, b) } : { g: g, d: d, h: h, b: b };
      });
      if (!u) return;
      var pl = (u.d - u.g) / cadre.width;
      var ph = (u.b - u.h) / cadre.height;
      if (pl < S.sujetMin && ph < S.sujetMin) constater('sujet-petit', s.id, null, t, Math.round(Math.max(pl, ph) * 100));
    });
    M.rendre(depart);
    return constats;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
