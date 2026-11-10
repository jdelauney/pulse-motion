/* Pulse Motion – pointeur de souris dessiné par le moteur (spec S6, 5.9) : trajets, clics, cercle de localisation.
 *
 * Toutes les positions sont en pixels CSS de la page montrée par l'écran (1280 × 800 par défaut) ; tous les instants en
 * secondes. Fonctions pures : l'état du pointeur ne dépend que de t (aucune horloge lue).
 *
 * graineDe(texte) -> entier (FNV-1a 32 bits) · hasard(graine) -> () => [0, 1[ (mulberry32)
 * dureeTrajet(distance, diagonale) -> s : 0,3 + 0,7 d / diagonale, bornée entre 0,3 et 1,1 s
 * trajet(de, vers, { graine, diagonale, vitesse }) -> { de, vers, c1, c2, distance, duree, bruit, phases }
 *   courbe de Bézier cubique : courbure min(96, 0,13 d) px, sens au hasard, ampleur × (0,72 à 1,14) ; contrôles à 32 % et
 *   72 % du trajet, le second à 70 % de la courbure ; bruit perpendiculaire au trajet, borné par min(1,4, d / 180) px, nul
 *   aux deux bouts. vitesse : facteur de la durée (1,4 : « le pointeur va trop vite »).
 * position(trajet, q) -> [x, y] : q ∈ [0, 1] (part du temps du trajet), progression en accélération puis freinage cubiques.
 * pointVise([x, y, l, h]) -> [x, y] : 8 % de la largeur et 78 % de la hauteur de la boîte (en bas à gauche du libellé, pour
 *   ne pas le couvrir) ; au centre pour une cible de moins de 48 px.
 * planGestes(gestes, { depart, diagonale, graine, vitesse }) -> { gestes, ecarts }
 *   gestes : [{ type: 'clic' | 'survol' | 'double-clic', instant, point }] (instant : le clic, ou l'arrivée d'un survol) ;
 *   chaque geste reçoit son trajet, son départ et son arrivée (pause de 0,35 s avant un clic). ecarts : paires de gestes
 *   trop rapprochés pour aller de l'un à l'autre ({ a, b, ecart, minimum }, rangs à partir de 1).
 * etatPointeur(plan, t, { doigt }) -> { x, y, echelle, opacite, ondes: [{ x, y, echelle, opacite }], appuis: [{ rang, echelle }] }
 * onde(age) -> { echelle, opacite } : cercle de 0,7 s, de l'échelle 2,4 à 0,2, opaque entre 15 % et 70 % de sa durée.
 * enfoncement(age) -> échelle du pointeur : 0,9 pendant 90 ms autour de la pointe.
 * appui(age) -> échelle de l'élément visé : valeurs de #081 (pm-m-appui : 0,97 à 55 %, 0,22 s, cubic-out).
 * Valeurs et algorithme de argo (src/human-cursor.ts : buildHumanCursorPath, durées, point visé ; src/cursor.ts : mode
 * « click », 700 ms ; MIT, Shreyas Karnik), eux-mêmes inspirés de CloverLabsAI/human-cursor et feder-cr/invisible_playwright
 * (MIT) ; réécrits.
 *
 * Module pur : chargé dans la page (M.pointeur) et par Node (require).
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var C = nodeJS ? require('./courbes.js') : racine.M;
  var api = fabrique(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.pointeur = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var PAUSE = 0.35;
  var DUREE_MIN = 0.3;
  var DUREE_MAX = 1.1;
  var ENFONCE = 0.09;
  var ENFONCE_ECHELLE = 0.9;
  var DOUBLE = 0.15;
  var MARGE = 0.2;
  var ONDE = { duree: 0.7, de: 2.4, a: 0.2, entree: 0.15, sortie: 0.7 };
  var APPUI = { duree: 0.22, ampleur: 0.97, sommet: 0.55 };
  var VISE = { x: 0.08, y: 0.78, petit: 48 };
  var DOIGT = { avance: 0.15, reste: 0.3 };
  var sortieCubique = C.courbeNommee('cubic-out');

  function graineDe(texte) {
    var h = 0x811c9dc5;
    var s = String(texte);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  function hasard(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var borne = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var arrondi = function (x) { return Math.round(x * 1000) / 1000; };

  function dureeTrajet(d, diagonale) {
    return borne(DUREE_MIN + 0.7 * d / (diagonale > 0 ? diagonale : 1509), DUREE_MIN, DUREE_MAX);
  }

  function trajet(de, vers, o) {
    o = o || {};
    var h = hasard(graineDe(o.graine === undefined ? '' : o.graine));
    var dx = vers[0] - de[0];
    var dy = vers[1] - de[1];
    var d = Math.sqrt(dx * dx + dy * dy);
    var nx = d > 0 ? -dy / d : 0;
    var ny = d > 0 ? dx / d : 0;
    var sens = h() < 0.5 ? -1 : 1;
    var courbure = Math.min(96, 0.13 * d) * (0.72 + 0.42 * h()) * sens;
    return {
      de: [de[0], de[1]],
      vers: [vers[0], vers[1]],
      c1: [de[0] + 0.32 * dx + nx * courbure, de[1] + 0.32 * dy + ny * courbure],
      c2: [de[0] + 0.72 * dx + nx * courbure * 0.7, de[1] + 0.72 * dy + ny * courbure * 0.7],
      normale: [nx, ny],
      distance: d,
      courbure: courbure,
      duree: dureeTrajet(d, o.diagonale) * (o.vitesse > 0 ? o.vitesse : 1),
      bruit: Math.min(1.4, d / 180),
      phases: [h() * 2 * Math.PI, h() * 2 * Math.PI],
    };
  }

  /** Accélération puis freinage cubiques. */
  function progression(q) { return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2; }

  function position(tr, q) {
    if (q <= 0) return [tr.de[0], tr.de[1]];
    if (q >= 1) return [tr.vers[0], tr.vers[1]];
    var s = progression(q);
    var u = 1 - s;
    var b0 = u * u * u, b1 = 3 * u * u * s, b2 = 3 * u * s * s, b3 = s * s * s;
    var x = b0 * tr.de[0] + b1 * tr.c1[0] + b2 * tr.c2[0] + b3 * tr.vers[0];
    var y = b0 * tr.de[1] + b1 * tr.c1[1] + b2 * tr.c2[1] + b3 * tr.vers[1];
    // Bruit de la main : perpendiculaire au trajet, nul aux deux bouts, borné par tr.bruit.
    var n = tr.bruit * Math.sin(Math.PI * q) * (0.6 * Math.sin(6 * Math.PI * q + tr.phases[0]) + 0.4 * Math.sin(14 * Math.PI * q + tr.phases[1]));
    return [x + tr.normale[0] * n, y + tr.normale[1] * n];
  }

  function pointVise(boite) {
    var x = boite[0], y = boite[1], l = boite[2], h = boite[3];
    if (l < VISE.petit || h < VISE.petit) return [x + l / 2, y + h / 2];
    return [x + VISE.x * l, y + VISE.y * h];
  }

  /** Instants des enfoncements d'un geste. */
  function appuisDe(g) {
    if (g.type === 'clic') return [g.instant];
    if (g.type === 'double-clic') return [g.instant, g.instant + DOUBLE];
    return [];
  }
  /** Fin d'un geste : le pointeur est libre de repartir. */
  function finDe(g) {
    if (g.type === 'clic') return g.instant + ENFONCE;
    if (g.type === 'double-clic') return g.instant + DOUBLE + ENFONCE;
    return g.instant;
  }

  function planGestes(liste, o) {
    o = o || {};
    var depart = o.depart || [0, 0];
    var gestes = [];
    var ecarts = [];
    var ici = depart;
    var libre = -Infinity;
    liste.slice().sort(function (a, b) { return a.instant - b.instant; }).forEach(function (g, k) {
      var arrivee = g.type === 'survol' ? g.instant : g.instant - PAUSE;
      var tr = trajet(ici, g.point, { graine: (o.graine || '') + ':' + (k + 1) + ':' + Math.round(g.point[0]) + ':' + Math.round(g.point[1]), diagonale: o.diagonale, vitesse: o.vitesse });
      var debut = arrivee - tr.duree;
      if (k > 0 && debut < libre + MARGE - 1e-9) {
        var precedent = gestes[k - 1];
        var minimum = (finDe(precedent) - precedent.instant) + MARGE + (g.type === 'survol' ? 0 : PAUSE) + tr.duree;
        ecarts.push({ a: k, b: k + 1, ecart: arrondi(g.instant - precedent.instant), minimum: arrondi(minimum) });
        // Trajet raccourci : il part dès que le geste précédent est fini.
        if (debut < libre) debut = Math.min(arrivee, libre);
      }
      gestes.push({ type: g.type, instant: g.instant, point: [g.point[0], g.point[1]], debut: debut, arrivee: arrivee, trajet: tr, rang: k + 1, cle: g.cle });
      ici = g.point;
      libre = finDe(g);
    });
    return { gestes: gestes, ecarts: ecarts, depart: [depart[0], depart[1]] };
  }

  function onde(age) {
    if (!(age >= 0) || age >= ONDE.duree) return { echelle: ONDE.a, opacite: 0 };
    var p = age / ONDE.duree;
    var opacite = p < ONDE.entree ? p / ONDE.entree : p <= ONDE.sortie ? 1 : (1 - p) / (1 - ONDE.sortie);
    return { echelle: arrondi(ONDE.de + (ONDE.a - ONDE.de) * sortieCubique(p)), opacite: arrondi(opacite) };
  }

  function enfoncement(age) {
    if (!(age >= 0) || age >= ENFONCE + 0.06) return 1;
    if (age < 0.03) return arrondi(1 + (ENFONCE_ECHELLE - 1) * age / 0.03);
    if (age <= ENFONCE) return ENFONCE_ECHELLE;
    return arrondi(ENFONCE_ECHELLE + (1 - ENFONCE_ECHELLE) * (age - ENFONCE) / 0.06);
  }

  function appui(age) {
    if (!(age >= 0) || age >= APPUI.duree) return 1;
    var p = age / APPUI.duree;
    if (p < APPUI.sommet) return arrondi(1 + (APPUI.ampleur - 1) * sortieCubique(p / APPUI.sommet));
    return arrondi(APPUI.ampleur + (1 - APPUI.ampleur) * sortieCubique((p - APPUI.sommet) / (1 - APPUI.sommet)));
  }

  function etatPointeur(plan, t, o) {
    o = o || {};
    var gestes = plan.gestes;
    var x = plan.depart[0], y = plan.depart[1];
    var opacite = 1;
    var echelle = 1;
    if (o.doigt) {
      // Doigt : aucun trajet visible ; un disque apparaît 0,15 s avant le toucher et reste 0,3 s.
      opacite = 0;
      gestes.forEach(function (g) {
        var a = t - (g.instant - DOIGT.avance);
        var fin = DOIGT.avance + (finDe(g) - g.instant) + DOIGT.reste;
        if (a >= 0 && a < fin) {
          x = g.point[0]; y = g.point[1];
          opacite = Math.min(1, a / DOIGT.avance, (fin - a) / DOIGT.avance);
        }
      });
    } else {
      for (var k = 0; k < gestes.length; k++) {
        var g = gestes[k];
        if (t < g.debut) break;
        if (t < g.arrivee) {
          var p = position(g.trajet, (t - g.debut) / Math.max(1e-6, g.arrivee - g.debut));
          x = p[0]; y = p[1];
          break;
        }
        x = g.point[0]; y = g.point[1];
      }
    }
    var ondes = [];
    var appuis = [];
    gestes.forEach(function (g) {
      appuisDe(g).forEach(function (instant) {
        var age = t - instant;
        if (!o.doigt) echelle = Math.min(echelle, enfoncement(age));
        if (age >= 0 && age < ONDE.duree) {
          var w = onde(age);
          ondes.push({ x: g.point[0], y: g.point[1], echelle: w.echelle, opacite: w.opacite });
        }
        if (age >= 0 && age < APPUI.duree) appuis.push({ rang: g.rang, echelle: appui(age) });
      });
    });
    return { x: arrondi(x), y: arrondi(y), echelle: echelle, opacite: arrondi(opacite), ondes: ondes, appuis: appuis };
  }

  return {
    PAUSE: PAUSE, DUREE_MIN: DUREE_MIN, DUREE_MAX: DUREE_MAX, ENFONCE: ENFONCE, ENFONCE_ECHELLE: ENFONCE_ECHELLE, DOUBLE: DOUBLE,
    MARGE: MARGE, ONDE: ONDE, APPUI: APPUI, VISE: VISE, DOIGT: DOIGT,
    graineDe: graineDe, hasard: hasard, dureeTrajet: dureeTrajet, trajet: trajet, position: position, pointVise: pointVise,
    planGestes: planGestes, etatPointeur: etatPointeur, onde: onde, enfoncement: enfoncement, appui: appui,
  };
});
