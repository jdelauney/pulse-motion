/* Pulse Motion – mesures par pixels de la vidéo rendue (contrôle, Chrome sans fenêtre).
 *
 * M.mesurerPixels({ ratio, seuils }) -> Promise de constats { regle, scene, element, instant, valeur } :
 * - contraste-reel : à un instant où chaque scène est entrée, trois captures (lettres forcées en noir, en blanc,
 *   puis transparentes, aplats gardés). Les pixels où noir et blanc diffèrent sont ceux des lettres, quelle que
 *   soit leur couleur ; le fond se lit là sur la capture sans lettres (10e et 90e centiles). Couleur du texte
 *   mélangée au fond selon sa transparence ; une ombre ou un contour compte s'il détache mieux le texte. Fond
 *   uni de la charte sous une couleur de la charte : laissé au contrôle de la charte (pas d'alerte doublée).
 * - flash (WCAG 2.3.1) : passe rapide à intervalles irréguliers (pas d'effet de stroboscope), puis image par
 *   image (cadence de la vidéo) autour des passages où la lumière change ; plus de flashMax flashs dans une
 *   seconde sur au moins flashAire de l'image.
 * Captures à la taille de la page (capture.js fige les styles calculés). Particules non dessinées (WebGPU
 * absent). Revient à l'instant de départ. Dépend de horloge et de capture (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var DEFAUTS = { contrasteTexte: 4.5, contrasteGrandTexte: 3, grandTexteCqh: 4.5, fondUniEcart: 0.05, ecartLettre: 60,
    flashIps: 12, flashVariation: 0.1, flashSombre: 0.8, flashAire: 0.25, flashMax: 3, flashCases: 4, largeurFlash: 64 };
  var CHARTE = ['--c-texte', '--c-primaire', '--c-primaire-lisible', '--c-accent', '--c-accent-lisible'];

  function lineaire(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function luminance(r, g, b) { return 0.2126 * lineaire(r) + 0.7152 * lineaire(g) + 0.0722 * lineaire(b); }
  function contraste(a, b) { var h = Math.max(a, b); var l = Math.min(a, b); return (h + 0.05) / (l + 0.05); }
  function couleur(texte) {
    var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(texte || '');
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    var h = /#([0-9a-f]{6})/i.exec(texte || '');
    return h ? { r: parseInt(h[1].slice(0, 2), 16), g: parseInt(h[1].slice(2, 4), 16), b: parseInt(h[1].slice(4, 6), 16), a: 1 } : null;
  }
  function meme(a, b) { return a && b && Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) <= 6; }
  function centile(liste, p) { var i = Math.min(liste.length - 1, Math.max(0, Math.round(p * (liste.length - 1)))); return liste[i]; }
  function arrondi(x) { return Math.round(x * 10) / 10; }

  /** Instant où la scène est entrée et où ses textes sont posés : juste avant sa fin (ou l'entrée de la suivante). */
  function instantStable(i) {
    var s = M.minutage.scenes[i];
    var suivante = M.minutage.scenes[i + 1];
    var fin = suivante && suivante.debut < s.fin ? suivante.debut : s.fin;
    return Math.max(s.debut, fin - 0.1);
  }

  /** Couleur d'un ornement qui détache le texte (contour, ombre), ou null. */
  function ornement(cs) {
    if (parseFloat(cs.webkitTextStrokeWidth) > 0) return couleur(cs.webkitTextStrokeColor);
    if (cs.textShadow && cs.textShadow !== 'none') return couleur(cs.textShadow);
    return null;
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

  /** Flashs : passe rapide irrégulière pour repérer les passages où la lumière change, puis image par image. */
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
    function relever(t) {
      M.rendre(t);
      return M.capturer(gctx, grande.width, grande.height).then(function () {
        ctx.drawImage(grande, 0, 0, l, h);
        return cases(ctx.getImageData(0, 0, l, h).data, l, h, n);
      });
    }
    function change(a, b) {
      return b.some(function (v, c) { return Math.abs(v - a[c]) >= S.flashVariation && Math.min(v, a[c]) < S.flashSombre; });
    }
    // Instants irréguliers (graine fixe) : un clignotement régulier ne tombe pas toujours sur la même phase.
    var graine = 20261012;
    function alea() { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; }
    var instants = [];
    for (var k = 0; k < M.duree * S.flashIps; k++) instants.push(Math.min(M.duree, (k + 0.5 + 0.8 * (alea() - 0.5)) / S.flashIps));
    var passages = [];
    var avant = null;
    var chaine = Promise.resolve();
    instants.forEach(function (t, i) {
      chaine = chaine.then(function () { return relever(t); }).then(function (v) {
        if (avant && change(avant, v)) passages.push([Math.max(0, instants[i - 1] - 1), Math.min(M.duree, t + 1)]);
        avant = v;
      });
    });
    return chaine.then(function () {
      // Passages fusionnés, puis examinés à la cadence de la vidéo.
      passages.sort(function (a, b) { return a[0] - b[0]; });
      var fusion = [];
      passages.forEach(function (p) {
        var dernier = fusion[fusion.length - 1];
        if (dernier && p[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], p[1]); else fusion.push(p.slice());
      });
      var ips = M.ips || 30;
      var trouve = false;
      var suite = Promise.resolve();
      fusion.forEach(function (p) {
        suite = suite.then(function () {
          if (trouve) return null;
          var premiere = Math.ceil(p[0] * ips);
          var derniere = Math.floor(p[1] * ips);
          var series = [];
          var lecture = Promise.resolve();
          for (var f = premiere; f <= derniere; f++) {
            (function (f) { lecture = lecture.then(function () { return relever(f / ips); }).then(function (v) { series.push(v); }); })(f);
          }
          return lecture.then(function () {
            var changements = [];
            for (var k = 1; k < series.length; k++) {
              changements.push(series[k].map(function (v, c) {
                var a = series[k - 1][c];
                return Math.abs(v - a) >= S.flashVariation && Math.min(v, a) < S.flashSombre ? (v > a ? 1 : -1) : 0;
              }));
            }
            for (var debut = 0; debut < changements.length && !trouve; debut++) {
              var fin = Math.min(changements.length, debut + ips);
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
                var t = (premiere + debut + 1) / ips;
                var visibles = M.scenesVisibles(M.minutage, t);
                constats.push({ regle: 'flash', scene: visibles[0] || null, element: null, instant: Math.round(t * 100) / 100, valeur: arrondi(maxFlashs) });
                trouve = true;
              }
            }
            return null;
          });
        });
      });
      return suite;
    });
  }

  M.mesurerPixels = function (options) {
    options = options || {};
    var S = {};
    Object.keys(DEFAUTS).forEach(function (k) { S[k] = options.seuils && typeof options.seuils[k] === 'number' ? options.seuils[k] : DEFAUTS[k]; });
    var depart = M.temps();
    var conteneur = document.getElementById('pm-scene');
    var cadre = conteneur.getBoundingClientRect();
    var L = Math.max(1, Math.round(cadre.width));
    var H = Math.max(1, Math.round(cadre.height));
    var toile = document.createElement('canvas');
    toile.width = L;
    toile.height = H;
    var ctx = toile.getContext('2d', { willReadFrequently: true });
    var echelle = L / cadre.width;
    var constats = [];
    var racineCs = getComputedStyle(conteneur);
    var charte = CHARTE.map(function (v) { return couleur(racineCs.getPropertyValue(v)); }).filter(Boolean);
    var fond = couleur(racineCs.getPropertyValue('--c-fond'));
    // Lettres repeintes le temps des captures : noir, blanc, puis transparentes (aplats gardés).
    var regles = document.createElement('style');
    regles.textContent = ['noir:#000', 'blanc:#fff', 'sans:transparent'].map(function (p) {
      var nom = p.split(':')[0];
      var valeur = p.split(':')[1];
      return '[data-pm-lettres="' + nom + '"], [data-pm-lettres="' + nom + '"] * { color: ' + valeur + ' !important; -webkit-text-fill-color: ' + valeur +
        ' !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; text-decoration-color: transparent !important; }';
    }).join('\n');
    document.head.appendChild(regles);
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
          var cs = getComputedStyle(el);
          return { el: el, r: plage.getBoundingClientRect(), couleur: couleur(cs.color), ornement: ornement(cs), taille: parseFloat(cs.fontSize) };
        });
        if (!textes.length) return null;
        var images = {};
        function capturer(nom) {
          textes.forEach(function (x) { x.el.setAttribute('data-pm-lettres', nom); });
          return M.capturer(ctx, L, H).then(function () { images[nom] = ctx.getImageData(0, 0, L, H).data; });
        }
        function remettre() { textes.forEach(function (x) { x.el.removeAttribute('data-pm-lettres'); }); }
        return capturer('noir').then(function () { return capturer('blanc'); }).then(function () { return capturer('sans'); }).then(function () {
          remettre();
          var noir = images.noir;
          var blanc = images.blanc;
          var image = images.sans;
          textes.forEach(function (x) {
            if (!x.couleur) return;
            var x0 = Math.max(0, Math.floor((x.r.left - cadre.left) * echelle));
            var x1 = Math.min(L, Math.ceil((x.r.right - cadre.left) * echelle));
            var y0 = Math.max(0, Math.floor((x.r.top - cadre.top) * echelle));
            var y1 = Math.min(H, Math.ceil((x.r.bottom - cadre.top) * echelle));
            var lums = [];
            var somme = { r: 0, g: 0, b: 0 };
            for (var y = y0; y < y1; y++) {
              for (var xx = x0; xx < x1; xx++) {
                var k = (y * L + xx) * 4;
                var ecart = Math.abs(noir[k] - blanc[k]) + Math.abs(noir[k + 1] - blanc[k + 1]) + Math.abs(noir[k + 2] - blanc[k + 2]);
                if (ecart <= S.ecartLettre) continue;
                lums.push(luminance(image[k], image[k + 1], image[k + 2]));
                somme.r += image[k]; somme.g += image[k + 1]; somme.b += image[k + 2];
              }
            }
            if (!lums.length) return;
            lums.sort(function (a, b) { return a - b; });
            var bas = centile(lums, 0.1);
            var haut = centile(lums, 0.9);
            var moyen = { r: somme.r / lums.length, g: somme.g / lums.length, b: somme.b / lums.length };
            // Fond uni de la charte sous une couleur de la charte : jugé par le contrôle de la charte.
            var uni = haut - bas < S.fondUniEcart;
            if (uni && fond && meme(moyen, fond) && charte.some(function (c) { return meme(c, x.couleur); })) return;
            // Couleur transparente : mélangée au fond.
            var a = x.couleur.a;
            var lt = luminance(a * x.couleur.r + (1 - a) * moyen.r, a * x.couleur.g + (1 - a) * moyen.g, a * x.couleur.b + (1 - a) * moyen.b);
            var c = Math.min(contraste(lt, bas), contraste(lt, haut));
            if (x.ornement) {
              var lo = luminance(x.ornement.r, x.ornement.g, x.ornement.b);
              c = Math.max(c, Math.min(contraste(lo, bas), contraste(lo, haut)));
            }
            var grand = x.taille >= S.grandTexteCqh * cadre.height / 100;
            var minimum = grand ? S.contrasteGrandTexte : S.contrasteTexte;
            if (c < minimum) constats.push({ regle: 'contraste-reel', scene: s.id, element: x.el.id || x.el.getAttribute('data-texte'), instant: Math.round(t * 100) / 100, valeur: arrondi(c) });
          });
          return null;
        }, function (e) {
          remettre();
          throw e;
        });
      });
    });
    function finir() {
      regles.remove();
      if (M.particules) M.particules.preparerCapture = preparer;
      M.rendre(depart);
    }
    return chaine.then(function () { return mesurerFlashs(S, constats); }).then(function () {
      finir();
      return constats;
    }, function (e) {
      finir();
      throw e;
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
