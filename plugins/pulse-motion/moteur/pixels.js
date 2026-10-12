/* Pulse Motion – mesures par pixels de la vidéo rendue (contrôle, Chrome sans fenêtre).
 *
 * M.mesurerPixels({ ratio, seuils }) -> Promise de constats { regle, scene, element, instant, valeur } :
 * contraste-reel (texte sur un fond non uni : image, dégradé, décor) et flash (WCAG 2.3.1, 12 images par seconde). Une capture du fond par scène, textes
 * rendues transparentes, à un instant où la scène est entrée ; le fond est lu aux seuls pixels des lettres
 * (différence entre les deux captures) ; contraste de la couleur du texte avec les 10e et 90e centiles de ce fond. Fond uni (écart < seuils.fondUniEcart) : laissé au contrôle
 * de la charte. Particules non dessinées (WebGPU absent). Dépend de horloge et de capture (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var DEFAUTS = { contrasteTexte: 4.5, contrasteGrandTexte: 3, grandTexteCqh: 4.5, fondUniEcart: 0.05, ecartLettre: 60,
    flashIps: 12, flashVariation: 0.1, flashSombre: 0.8, flashAire: 0.25, flashMax: 3, flashCases: 4, largeurFlash: 64 };

  function lineaire(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function luminance(r, g, b) { return 0.2126 * lineaire(r) + 0.7152 * lineaire(g) + 0.0722 * lineaire(b); }
  function contraste(a, b) { var h = Math.max(a, b); var l = Math.min(a, b); return (h + 0.05) / (l + 0.05); }
  function couleur(texte) {
    var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(texte);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  }
  function centile(liste, p) { var i = Math.min(liste.length - 1, Math.max(0, Math.round(p * (liste.length - 1)))); return liste[i]; }
  function arrondi(x) { return Math.round(x * 10) / 10; }

  /** Instant où la scène est entrée et où ses textes sont posés : juste avant sa fin (ou l'entrée de la suivante). */
  function instantStable(i) {
    var s = M.minutage.scenes[i];
    var suivante = M.minutage.scenes[i + 1];
    var fin = suivante && suivante.debut < s.fin ? suivante.debut : s.fin;
    return Math.max(s.debut, fin - 0.1);
  }

  /** Luminance moyenne de chaque case d'une grille n×n de l'image. */
  function cases(image, l, h, n) {
    var sommes = [];
    var nombres = [];
    for (var i = 0; i < n * n; i++) { sommes.push(0); nombres.push(0); }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < l; x++) {
        var k = (y * l + x) * 4;
        var c = Math.min(n - 1, Math.floor(y * n / h)) * n + Math.min(n - 1, Math.floor(x * n / l));
        sommes[c] += luminance(image[k], image[k + 1], image[k + 2]);
        nombres[c]++;
      }
    }
    return sommes.map(function (s, i) { return s / nombres[i]; });
  }

  /** Flashs (WCAG 2.3.1) : par case, changements opposés de luminance ≥ variation, côté sombre < sombre ;
   * plus de flashMax flashs dans une seconde sur au moins flashAire de l'image -> constat. */
  function mesurerFlashs(S, constats) {
    var n = S.flashCases;
    var l = S.largeurFlash;
    var cadre = document.getElementById('pm-scene').getBoundingClientRect();
    var h = Math.max(1, Math.round(l * cadre.height / cadre.width));
    var grande = document.createElement('canvas');
    grande.width = Math.max(1, Math.round(cadre.width));
    grande.height = Math.max(1, Math.round(cadre.height));
    var gctx = grande.getContext('2d');
    var toile = document.createElement('canvas');
    toile.width = l;
    toile.height = h;
    var ctx = toile.getContext('2d', { willReadFrequently: true });
    var pas = 1 / S.flashIps;
    var nombre = Math.floor(M.duree / pas) + 1;
    var series = [];
    var chaine = Promise.resolve();
    for (var k = 0; k < nombre; k++) {
      (function (k) {
        chaine = chaine.then(function () {
          M.rendre(k * pas);
          return M.capturer(gctx, grande.width, grande.height).then(function () {
            ctx.drawImage(grande, 0, 0, l, h);
            series.push(cases(ctx.getImageData(0, 0, l, h).data, l, h, n));
          });
        });
      })(k);
    }
    return chaine.then(function () {
      // Changements par case : +1, -1 ou 0 entre deux images.
      var changements = [];
      for (var k = 1; k < series.length; k++) {
        changements.push(series[k].map(function (v, c) {
          var a = series[k - 1][c];
          return Math.abs(v - a) >= S.flashVariation && Math.min(v, a) < S.flashSombre ? (v > a ? 1 : -1) : 0;
        }));
      }
      var fenetre = S.flashIps;
      var deja = false;
      for (var debut = 0; debut + 1 <= changements.length && !deja; debut++) {
        var fin = Math.min(changements.length, debut + fenetre);
        var touchees = 0;
        var maxFlashs = 0;
        for (var c = 0; c < n * n; c++) {
          var signe = 0;
          var alternances = 0;
          for (var k2 = debut; k2 < fin; k2++) {
            var d = changements[k2][c];
            if (d && d !== signe) { alternances++; signe = d; }
          }
          var flashs = alternances / 2;
          if (flashs > S.flashMax) { touchees++; maxFlashs = Math.max(maxFlashs, flashs); }
        }
        if (touchees / (n * n) >= S.flashAire) {
          var t = (debut + 1) * pas;
          var visibles = M.scenesVisibles(M.minutage, t);
          constats.push({ regle: 'flash', scene: visibles[0] || null, element: null, instant: Math.round(t * 100) / 100, valeur: Math.round(maxFlashs * 10) / 10 });
          deja = true;
        }
      }
      return null;
    });
  }

  M.mesurerPixels = function (options) {
    options = options || {};
    var S = {};
    Object.keys(DEFAUTS).forEach(function (k) { S[k] = options.seuils && typeof options.seuils[k] === 'number' ? options.seuils[k] : DEFAUTS[k]; });
    var depart = M.temps();
    var conteneur = document.getElementById('pm-scene');
    var cadre = conteneur.getBoundingClientRect();
    // Capture à la taille de la page : capture.js fige les styles calculés, une autre taille changerait la mise en page.
    var L = Math.max(1, Math.round(cadre.width));
    var H = Math.max(1, Math.round(cadre.height));
    var toile = document.createElement('canvas');
    toile.width = L;
    toile.height = H;
    var ctx = toile.getContext('2d', { willReadFrequently: true });
    var echelle = L / cadre.width;
    var constats = [];
    // Lettres seules rendues transparentes pour capturer le fond : l'aplat propre du texte (pastille, carte) reste.
    var sansLettres = document.createElement('style');
    sansLettres.textContent = '[data-pm-sans-lettres], [data-pm-sans-lettres] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }';
    document.head.appendChild(sansLettres);
    // Particules : pas de WebGPU sans fenêtre ; leurs calques ne sont pas dessinés pendant la mesure.
    var preparer = M.particules && M.particules.preparerCapture;
    if (M.particules) M.particules.preparerCapture = function () { return Promise.resolve(); };

    var chaine = Promise.resolve();
    M.minutage.scenes.forEach(function (s, i) {
      chaine = chaine.then(function () {
        var t = instantStable(i);
        M.rendre(t);
        var sec = conteneur.querySelector(':scope > section[data-scene="' + s.id + '"]');
        if (!sec) return null;
        var textes = Array.prototype.filter.call(sec.querySelectorAll('[data-texte]'), function (el) {
          if (el.closest('.decor, [data-decor]')) return false;
          var cs = getComputedStyle(el);
          if (cs.webkitTextFillColor && /rgba\([^)]*,\s*0\)/.test(cs.webkitTextFillColor)) return false;
          var r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && parseFloat(cs.opacity) > 0.5 && cs.visibility !== 'hidden';
        }).map(function (el) {
          var plage = document.createRange();
          plage.selectNodeContents(el);
          return { el: el, r: plage.getBoundingClientRect(), cs: getComputedStyle(el) };
        });
        if (!textes.length) return null;
        textes.forEach(function (x) { x.couleur = couleur(x.cs.color); x.taille = parseFloat(x.cs.fontSize); });
        // Deux captures : avec les lettres, puis sans (lettres transparentes, aplats gardés). Les pixels qui
        // diffèrent sont ceux des lettres : le fond se lit là, quelle que soit la forme (rotation, marge, aplat).
        var avec = null;
        return M.capturer(ctx, L, H).then(function () {
          avec = ctx.getImageData(0, 0, L, H).data;
          textes.forEach(function (x) { x.el.setAttribute('data-pm-sans-lettres', ''); });
          return M.capturer(ctx, L, H);
        }).then(function () {
          textes.forEach(function (x) { x.el.removeAttribute('data-pm-sans-lettres'); });
          var image = ctx.getImageData(0, 0, L, H).data;
          textes.forEach(function (x) {
            if (!x.couleur) return;
            var x0 = Math.max(0, Math.floor((x.r.left - cadre.left) * echelle));
            var x1 = Math.min(L, Math.ceil((x.r.right - cadre.left) * echelle));
            var y0 = Math.max(0, Math.floor((x.r.top - cadre.top) * echelle));
            var y1 = Math.min(H, Math.ceil((x.r.bottom - cadre.top) * echelle));
            var lums = [];
            for (var y = y0; y < y1; y++) {
              for (var xx = x0; xx < x1; xx++) {
                var k = (y * L + xx) * 4;
                var ecart = Math.abs(avec[k] - image[k]) + Math.abs(avec[k + 1] - image[k + 1]) + Math.abs(avec[k + 2] - image[k + 2]);
                if (ecart > S.ecartLettre) lums.push(luminance(image[k], image[k + 1], image[k + 2]));
              }
            }
            if (!lums.length) return;
            lums.sort(function (a, b) { return a - b; });
            var bas = centile(lums, 0.1);
            var haut = centile(lums, 0.9);
            if (haut - bas < S.fondUniEcart) return;
            var lt = luminance(x.couleur.r, x.couleur.g, x.couleur.b);
            var c = Math.min(contraste(lt, bas), contraste(lt, haut));
            var grand = x.taille >= S.grandTexteCqh * cadre.height / 100;
            var minimum = grand ? S.contrasteGrandTexte : S.contrasteTexte;
            if (c < minimum) constats.push({ regle: 'contraste-reel', scene: s.id, element: x.el.id || x.el.getAttribute('data-texte'), instant: Math.round(t * 100) / 100, valeur: arrondi(c) });
          });
          return null;
        }, function (e) {
          textes.forEach(function (x) { x.el.removeAttribute('data-pm-sans-lettres'); });
          throw e;
        });
      });
    });
    return chaine.then(function () { return mesurerFlashs(S, constats); }).then(function () {
      sansLettres.remove();
      if (M.particules) M.particules.preparerCapture = preparer;
      M.rendre(depart);
      return constats;
    }, function (e) {
      sansLettres.remove();
      if (M.particules) M.particules.preparerCapture = preparer;
      M.rendre(depart);
      throw e;
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
