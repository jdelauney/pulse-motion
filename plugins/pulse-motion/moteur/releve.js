/* Pulse Motion – relevé de mise en page (spec S7, 5.1) : la boîte de chaque élément d'une scène à l'état final, sans la caméra.
 *
 * M.relever(idScene) -> { largeur, hauteur: 100, elements: [{ cle, id, genre, debut, fin, boite: { x, y, l, h }, forme, nu }] }
 *   ou null avant le calcul. Boîtes en cqh (1 = 1 % de la hauteur de l'image), centre et taille.
 * M.releves() -> { idScene: relevé } ; M.releveEnAttente() -> Promise résolue après le calcul ; M.releveEnCours() -> bool.
 * M.completerReleve(fn(info, section, releve, cadre)) : appelé pour chaque scène à la fin du calcul, scène affichée, rendue à
 *   son instant final et caméras neutralisées (cadre : rectangle de la section) ; le calque y ajoute ses boîtes.
 * M.apresReleve(fn(releves)) : appelé après chaque calcul, avant le rendu de l'instant courant.
 * M.avecSceneNeutre(section, fn(cadre)) : fn appelé scène affichée, transformations de la section et des caméras retirées
 *   (rétablies ensuite, à l'identique).
 * M.demarrerReleve() : calcul après M.pret, document.fonts.ready et le décodage des images, pour toutes les scènes ; M.seek
 *   l'attend (M.surSeek) ; recalcul si la taille de #pm-scene change (ResizeObserver).
 *
 * Éléments relevés : ceux que juge le contrôle (data-texte, img, logo, SVG de contenu, comme moteur/mesures.js) et tout
 * élément qui a un id, data-cadrer, data-graphique, data-code ou data-formule ; hors décor (.decor, [data-decor]), hors fond
 * (plus de 60 % de l'image), hors calque et composants de dessin (le calque ajoute leurs boîtes). Instant de mesure : la fin
 * de son entrée (l'élément minuté, sinon son ancêtre minuté le plus proche, sinon la dernière fin de la scène), bornée à la
 * fin de la scène. Genres : texte, carte (texte sur un fond ou dans une bordure), image (nu : sans texte), cadrage,
 * graphique, code, formule ; puis fleche, trait, etiquette (calque). Cadrage (data-cadrer, caméra automatique) : explicite ;
 * <i data-cadrer="#id"> prend la boîte de sa cible, pendant sa propre plage (debut, fin). Forme ellipse : border-radius d'au moins 50 %, <circle>,
 * <ellipse>. Idée de boundsRecorder et des genres de director.js (BACKDROPS, bare), explainroo (MIT, © 2026 Vincent
 * Schmalbach) ; code neuf. Navigateur seulement ; dépend de horloge, minutage (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var JUGES = '[data-texte], img, [data-logo], .logo, svg:not([aria-hidden="true"])';
  var CANDIDATS = JUGES + ', [id], [data-cadrer], [data-graphique], [data-code], [data-formule]';
  var HORS = '.decor, [data-decor], .pm-calque, .pm-calque-textes, [data-fleche], [data-annoter]';
  var etat = { releves: null, calcul: false, complements: [], apres: [], taille: null, pret: null };

  function r2(x) { return Math.round(x * 100) / 100; }
  function largeurImage() {
    var f = (M.donnees && M.donnees.format && M.donnees.format.ratio) || '16:9';
    var p = String(f).split(':').map(Number);
    return p[0] > 0 && p[1] > 0 ? r2(100 * p[0] / p[1]) : 177.78;
  }
  function sections() {
    var r = {};
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) { r[s.getAttribute('data-scene')] = s; });
    return r;
  }

  M.avecSceneNeutre = function (sec, fn) {
    var masquee = sec.style.display === 'none';
    if (masquee) sec.style.display = '';
    var liste = [sec].concat(Array.prototype.slice.call(sec.querySelectorAll('[data-camera]')));
    var gardes = liste.map(function (el) {
      var g = [el, el.style.transform, el.style.getPropertyValue('--pm-cam-dx'), el.style.getPropertyValue('--pm-cam-dy')];
      el.style.transform = 'none';
      if (el !== sec) { el.style.setProperty('--pm-cam-dx', '0'); el.style.setProperty('--pm-cam-dy', '0'); }
      return g;
    });
    try { return fn(sec.getBoundingClientRect()); } finally {
      gardes.forEach(function (g) {
        g[0].style.transform = g[1];
        if (g[0] !== sec) {
          if (g[2]) g[0].style.setProperty('--pm-cam-dx', g[2]); else g[0].style.removeProperty('--pm-cam-dx');
          if (g[3]) g[0].style.setProperty('--pm-cam-dy', g[3]); else g[0].style.removeProperty('--pm-cam-dy');
        }
      });
      if (masquee) sec.style.display = 'none';
    }
  };

  function aFond(cs) {
    var bg = cs.backgroundColor;
    var fond = (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) || (cs.backgroundImage && cs.backgroundImage !== 'none');
    var bordure = ['Top', 'Right', 'Bottom', 'Left'].some(function (c) { return parseFloat(cs['border' + c + 'Width']) > 0 && cs['border' + c + 'Style'] !== 'none'; });
    return fond || bordure;
  }
  function aTexte(el) { return el.hasAttribute('data-texte') || /\S/.test(el.textContent || ''); }
  function rond(el, cs, r) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'circle' || tag === 'ellipse') return true;
    var rayon = cs.borderTopLeftRadius || '';
    if (/%$/.test(rayon)) return parseFloat(rayon) >= 50;
    var px = parseFloat(rayon);
    return px > 0 && px >= Math.min(r.width, r.height) / 2 - 0.5;
  }
  function genreDe(el, cs) {
    if (el.hasAttribute('data-cadrer')) return 'cadrage';
    if (el.hasAttribute('data-graphique')) return 'graphique';
    if (el.hasAttribute('data-code')) return 'code';
    if (el.hasAttribute('data-formule')) return 'formule';
    if (el.tagName === 'IMG' || el.closest('svg')) return 'image';
    if (aTexte(el)) return aFond(cs) ? 'carte' : 'texte';
    return 'image';
  }

  function candidats(sec) {
    return Array.prototype.filter.call(sec.querySelectorAll(CANDIDATS), function (el) {
      if (el.closest(HORS)) return false;
      var svg = el.closest('svg');
      if (svg && svg !== el && !el.id) return false;
      // Élément jugé imbriqué dans un autre élément jugé : seulement s'il a un id (cible possible d'une flèche).
      var parent = el.parentElement;
      if (!el.id && parent && parent !== sec && parent.closest(JUGES) && sec.contains(parent.closest(JUGES))) return false;
      return true;
    });
  }

  function tempsDe(el, sec, info, finale) {
    var temps = (M.minutage.elements && M.minutage.elements[info.id]) || {};
    for (var c = el; c && c !== sec; c = c.parentElement) {
      var cle = c.getAttribute && c.getAttribute('data-pm-cle');
      if (cle && temps[cle]) return { debut: temps[cle].debut, fin: Math.min(temps[cle].fin, finale) };
    }
    return { debut: info.debut, fin: finale };
  }

  function rectangle(el, genre) {
    if (genre !== 'texte' || !el.hasAttribute('data-texte')) return el.getBoundingClientRect();
    var plage = document.createRange();
    plage.selectNodeContents(el);
    var r = plage.getBoundingClientRect();
    return r.width > 0 || r.height > 0 ? r : el.getBoundingClientRect();
  }

  function releverScene(info, sec) {
    // Scène affichée pendant tout le relevé : une scène masquée n'a ni boîtes ni animations CSS à positionner.
    var masquee = sec.style.display === 'none';
    if (masquee) sec.style.display = '';
    try { return releverAffichee(info, sec); } finally { if (masquee) sec.style.display = 'none'; }
  }

  function releverAffichee(info, sec) {
    var L = largeurImage();
    var finale = info.fin - 1e-4;
    var temps = (M.minutage.elements && M.minutage.elements[info.id]) || {};
    var derniere = info.debut;
    Object.keys(temps).forEach(function (k) { derniere = Math.max(derniere, temps[k].fin); });
    var fond = Math.min(derniere, finale);
    var liste = candidats(sec).map(function (el) { var tps = tempsDe(el, sec, info, finale); if (tps.fin === finale && !el.closest('[data-pm-cle]')) tps.fin = fond; return { el: el, debut: tps.debut, fin: tps.fin }; });
    var parInstant = {};
    liste.forEach(function (x) { (parInstant[x.fin] = parInstant[x.fin] || []).push(x); });
    var elements = [];
    var n = 0;
    Object.keys(parInstant).map(Number).sort(function (a, b) { return a - b; }).forEach(function (t) {
      M.rendreScene(info.id, t);
      M.avecSceneNeutre(sec, function (cadre) {
        var k = 100 / (cadre.height || 1);
        parInstant[t].forEach(function (x) {
          var cs = getComputedStyle(x.el);
          if (cs.display === 'none') return;
          var genre = genreDe(x.el, cs);
          // Gros plan demandé (caméra automatique, spec S7 5.8) : <i data-cadrer="#id" data-start data-dur> vise la boîte de
          // sa cible pendant sa plage, sans rien dessiner ; data-cadrer sans valeur : l'élément lui-même est la zone.
          var vise = genre === 'cadrage' ? String(x.el.getAttribute('data-cadrer') || '').trim() : '';
          var cible = /^#[A-Za-z0-9_-]+$/.test(vise) ? sec.querySelector(vise) : null;
          if (vise && !cible) return;
          var r = cible ? rectangle(cible, genreDe(cible, getComputedStyle(cible))) : rectangle(x.el, genre);
          if (!(r.width > 0 && r.height > 0)) return;
          var l = r.width * k, h = r.height * k;
          if (l * h > 0.6 * L * 100) return; // fond plein cadre
          elements.push({ cle: x.el.id || x.el.getAttribute('data-texte') || x.el.getAttribute('data-pm-cle') || ('_r' + (++n)), id: x.el.id || null, genre: genre,
            debut: r2((x.debut - info.debut) * info.rythme), fin: r2((x.fin - info.debut) * info.rythme),
            boite: { x: r2((r.left + r.width / 2 - cadre.left) * k), y: r2((r.top + r.height / 2 - cadre.top) * k), l: r2(l), h: r2(h) },
            forme: rond(x.el, cs, r) ? 'ellipse' : 'rect', nu: genre === 'image' && !aTexte(x.el) });
          if (genre === 'cadrage') elements[elements.length - 1].explicite = true;
        });
      });
    });
    var releve = { largeur: L, hauteur: 100, elements: elements };
    if (etat.complements.length) {
      M.rendreScene(info.id, finale);
      M.avecSceneNeutre(sec, function (cadre) { etat.complements.forEach(function (fn) { fn(info, sec, releve, cadre); }); });
    }
    return releve;
  }

  function calculer() {
    if (!M.minutage) return;
    var t0 = M.temps();
    var secs = sections();
    var r = {};
    etat.calcul = true;
    try {
      M.minutage.scenes.forEach(function (info) { if (secs[info.id]) r[info.id] = releverScene(info, secs[info.id]); });
    } finally { etat.calcul = false; }
    etat.releves = r;
    etat.apres.forEach(function (fn) { fn(r); });
    var scene = document.getElementById('pm-scene');
    etat.taille = scene ? scene.clientWidth + 'x' + scene.clientHeight : null;
    M.rendre(t0);
  }

  function attendreImages() {
    var attentes = [document.fonts ? document.fonts.ready : Promise.resolve()];
    document.querySelectorAll('#pm-scene img').forEach(function (img) { if (typeof img.decode === 'function') attentes.push(img.decode().catch(function () {})); });
    return Promise.all(attentes);
  }

  M.relever = function (id) { return etat.releves ? etat.releves[id] || null : null; };
  M.releves = function () { return etat.releves; };
  M.releveEnCours = function () { return etat.calcul; };
  M.releveEnAttente = function () { return etat.pret || Promise.resolve(); };
  M.completerReleve = function (fn) { etat.complements.push(fn); };
  /** fn(releves) appelé à chaque calcul, juste avant le rendu de l'instant courant. */
  M.apresReleve = function (fn) { etat.apres.push(fn); };
  M.recalculerReleve = calculer;
  M.demarrerReleve = function (avant) {
    if (etat.pret) return etat.pret;
    etat.pret = M.pret.then(attendreImages).then(function () { if (avant) avant(); calculer(); });
    M.surSeek(function () { return etat.pret; });
    var scene = document.getElementById('pm-scene');
    if (scene && typeof racine.ResizeObserver === 'function') {
      new racine.ResizeObserver(function () {
        if (!etat.releves || etat.calcul) return;
        if (scene.clientWidth + 'x' + scene.clientHeight !== etat.taille) calculer();
      }).observe(scene);
    }
    return etat.pret;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
