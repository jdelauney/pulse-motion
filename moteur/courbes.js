/* Pulse Motion – courbes d'animation.
 *
 * Portage JavaScript de BZAnimationTool.pas (J. Delauney, BZScene, 2017), publié
 * sous licence MIT dans Pulse Motion. Une courbe = un type (forme « in » de base)
 * composé avec un mode (in, out, inout, spike, arch…).
 *
 * Écarts assumés avec l'original :
 * - bounce : la forme de base est le rebond « in » (l'original était « out ») ;
 * - tardis : escalier adouci (l'original renvoyait toujours la même valeur) ;
 * - arch-spike : symétrique de spike-arch (l'original était un fondu fixe) ;
 * - ressort et cubic-bezier ajoutés (forme close, sans état).
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PI = Math.PI;

  function rebondOut(t) {
    var n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d; return n * t * t + 0.984375;
  }

  function sinusInOut(t) { return 0.5 - 0.5 * Math.cos(PI * t); }

  function bezierCubique(p) {
    var x1 = p[0], y1 = p[1], x2 = p[2], y2 = p[3];
    function bx(s) { return 3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s; }
    function by(s) { return 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s; }
    function dbx(s) { return 3 * x1 * (1 - s) * (1 - s) + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s; }
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var s = t;
      for (var i = 0; i < 8; i++) {
        var e = bx(s) - t, d = dbx(s);
        if (Math.abs(e) < 1e-7) return by(s);
        if (Math.abs(d) < 1e-6) break;
        s -= e / d;
      }
      var a = 0, b = 1;
      s = t;
      for (var j = 0; j < 40; j++) {
        var x = bx(s);
        if (Math.abs(x - t) < 1e-7) break;
        if (x < t) a = s; else b = s;
        s = (a + b) / 2;
      }
      return by(s);
    };
  }

  function ressort(p) {
    var k = (p && p.raideur) || 100;
    var c = (p && p.amortissement) || 10;
    var w0 = Math.sqrt(k);
    var zeta = c / (2 * w0);
    var x, duree;
    if (zeta < 1) {
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      duree = -Math.log(0.001) / (zeta * w0);
      x = function (T) {
        return 1 - Math.exp(-zeta * w0 * T) * (Math.cos(wd * T) + (zeta * w0 / wd) * Math.sin(wd * T));
      };
    } else {
      duree = 9.23 / w0;
      x = function (T) { return 1 - Math.exp(-w0 * T) * (1 + w0 * T); };
    }
    return function (t) { return t >= 1 ? 1 : t <= 0 ? 0 : x(t * duree); };
  }

  // Formes de base (« in »), param facultatif.
  var BASES = {
    linear: function () { return function (t) { return t; }; },
    quad: function () { return function (t) { return t * t; }; },
    cubic: function () { return function (t) { return t * t * t; }; },
    quart: function () { return function (t) { return t * t * t * t; }; },
    quint: function () { return function (t) { return t * t * t * t * t; }; },
    expo: function () { return function (t) { return t === 0 ? 0 : Math.pow(2, 10 * (t - 1)); }; },
    sine: function () { return function (t) { return Math.sin((t - 1) * PI / 2) + 1; }; },
    circle: function () { return function (t) { return 1 - Math.sqrt(Math.max(0, 1 - t * t)); }; },
    elastic: function () { return function (t) { return Math.sin(13 * PI / 2 * t) * Math.pow(2, 10 * (t - 1)); }; },
    back: function () { return function (t) { return t * t * t - t * Math.sin(t * PI); }; },
    bounce: function () { return function (t) { return 1 - rebondOut(1 - t); }; },
    bell: function () { return function (t) { var u = 1 - t; return (1 - u * u * u) * t * t * t; }; },
    power: function (p) { var e = p === undefined ? 2 : p; return function (t) { return Math.pow(t, e); }; },
    step: function (p) {
      var n = p === undefined ? 5 : p;
      return function (t) { return t >= 1 ? 1 : Math.floor(t * n) / n; };
    },
    swing: function () { return function (t) { return t + Math.sin(t * 10 * PI) / 10; }; },
    jitter: function () { return function (t) { return t + Math.sin(t * 3 * PI) * 0.1; }; },
    // Oscillateur (ne part pas de 0) : utile pour un clignotement ou une pulsation.
    wave: function () { return function (t) { return 0.5 * Math.sin(2 * PI * 4 * t + 0.2) + 0.5; }; },
    tardis: function (p) {
      var n = p === undefined ? 9 : p;
      return function (t) {
        var seg = Math.min(Math.floor(t * n), n - 1);
        return (seg + sinusInOut(t * n - seg)) / n;
      };
    },
    'cubic-bezier': function (p) { return bezierCubique(p || [0.25, 0.1, 0.25, 1]); },
    ressort: function (p) { return ressort(p); },
  };

  // Modes (TBZAnimationMode) : composent une forme de base F.
  function aller(t) { return t < 0.5 ? t + t : 2 - t - t; }
  var MODES_FN = {
    'in': function (F) { return function (t) { return F(t); }; },
    'in-inv': function (F) { return function (t) { return F(1 - t); }; },
    'out': function (F) { return function (t) { return 1 - F(1 - t); }; },
    'out-inv': function (F) { return function (t) { return 1 - F(t); }; },
    'inout': function (F) { return function (t) { return t < 0.5 ? F(t + t) / 2 : 1 - F(2 - t - t) / 2; }; },
    'outin': function (F) { return function (t) { return t < 0.5 ? (1 - F(1 - t - t)) / 2 : 0.5 + F(t + t - 1) / 2; }; },
    'spike': function (F) { return function (t) { return F(aller(t)); }; },
    'spike-inv': function (F) { return function (t) { return 1 - F(aller(t)); }; },
    'arch': function (F) { return function (t) { return 1 - F(1 - aller(t)); }; },
    'arch-inv': function (F) { return function (t) { return F(1 - aller(t)); }; },
    'spike-arch': function (F) { return function (t) { return t < 0.5 ? F(t + t) : 1 - F(t + t - 1); }; },
    'spike-arch-inv': function (F) { return function (t) { return t < 0.5 ? F(1 - t - t) : 1 - F(2 - t - t); }; },
    'arch-spike': function (F) { return function (t) { return t < 0.5 ? 1 - F(1 - t - t) : F(2 - t - t); }; },
  };

  var TYPES = Object.keys(BASES);
  var MODES = Object.keys(MODES_FN);

  /** courbe(type, mode = 'in', param) -> (t ∈ [0,1]) => nombre */
  function courbe(type, mode, param) {
    var base = BASES[type];
    if (!base) throw new Error('Courbe inconnue : « ' + type + ' ». Types : ' + TYPES.join(', '));
    var m = MODES_FN[mode || 'in'];
    if (!m) throw new Error('Mode inconnu : « ' + mode + ' ». Modes : ' + MODES.join(', '));
    var f = m(base(param));
    return function (t) { return f(t < 0 ? 0 : t > 1 ? 1 : t); };
  }

  /** Nom court « back-out », « linear », « spike-arch-inv »… -> { type, mode } */
  var MODES_PAR_LONGUEUR = MODES.slice().sort(function (a, b) { return b.length - a.length; });
  function analyserNom(nom) {
    if (BASES[nom]) return { type: nom, mode: 'in' };
    for (var i = 0; i < MODES_PAR_LONGUEUR.length; i++) {
      var m = MODES_PAR_LONGUEUR[i];
      var suffixe = '-' + m;
      if (nom.length > suffixe.length && nom.slice(-suffixe.length) === suffixe) {
        var type = nom.slice(0, -suffixe.length);
        if (BASES[type]) return { type: type, mode: m };
      }
    }
    throw new Error('Nom de courbe inconnu : « ' + nom + ' » (exemples : cubic-out, back-inout, bounce-out).');
  }

  function courbeNommee(nom) { var c = analyserNom(nom); return courbe(c.type, c.mode); }

  // Opérateurs (easeMix, easeCrossFade, easeScale, easeReverseScale).
  function mix(a, b, k) { return function (t) { var x = a(t); return x + k * (b(t) - x); }; }
  function fondu(a, b) { return function (t) { var x = a(t); return x + t * (b(t) - x); }; }
  function echelle(a) { return function (t) { return t * a(t); }; }
  function echelleInverse(a) { return function (t) { return (1 - t) * a(t); }; }

  function arrondi(x, n) { var f = Math.pow(10, n); return Math.round(x * f) / f; }

  // Ajoute des points là où la corde s'écarte de la courbe (pentes raides, rebonds).
  function subdiviser(f, a, fa, b, fb, profondeur, sortie) {
    var m = (a + b) / 2, fm = f(m);
    var ecart = Math.abs(fm - (fa + fb) / 2);
    var q1 = a + (b - a) / 4, q3 = a + 3 * (b - a) / 4;
    ecart = Math.max(ecart, Math.abs(f(q1) - (fa * 3 + fb) / 4), Math.abs(f(q3) - (fa + fb * 3) / 4));
    if (profondeur > 0 && ecart > 0.002) {
      subdiviser(f, a, fa, m, fm, profondeur - 1, sortie);
      sortie.push([m, fm]);
      subdiviser(f, m, fm, b, fb, profondeur - 1, sortie);
    }
  }

  /** Échantillonne une courbe en fonction CSS linear(…) : n segments réguliers, affinés si besoin. */
  function courbeCSS(type, mode, param, n) {
    var f = typeof type === 'function' ? type : courbe(type, mode, param);
    n = n || 24;
    var pts = [[0, f(0)]];
    for (var i = 1; i <= n; i++) {
      var a = pts[pts.length - 1], t = i / n, ft = f(t);
      subdiviser(f, a[0], a[1], t, ft, 6, pts);
      pts.push([t, ft]);
    }
    return 'linear(' + pts.map(function (p) {
      return arrondi(p[1], 4) + ' ' + arrondi(p[0] * 100, 3) + '%';
    }).join(', ') + ')';
  }

  var TYPES_CSS = ['quad', 'cubic', 'quart', 'quint', 'expo', 'sine', 'circle', 'elastic', 'back', 'bounce'];
  var MODES_CSS = ['in', 'out', 'inout'];

  /** Bloc CSS « :root { --ease-<type>-<mode>: linear(…); … } » pour les combinaisons usuelles. */
  function variablesCSS() {
    var lignes = [];
    TYPES_CSS.forEach(function (ty) {
      MODES_CSS.forEach(function (mo) {
        lignes.push('  --ease-' + ty + '-' + mo + ': ' + courbeCSS(ty, mo) + ';');
      });
    });
    return ':root {\n' + lignes.join('\n') + '\n}\n';
  }

  return {
    TYPES: TYPES,
    MODES: MODES,
    courbe: courbe,
    analyserNom: analyserNom,
    courbeNommee: courbeNommee,
    mix: mix,
    fondu: fondu,
    echelle: echelle,
    echelleInverse: echelleInverse,
    courbeCSS: courbeCSS,
    variablesCSS: variablesCSS,
  };
});
