/* Pulse Motion – tracé à main levée à graine (spec S7, 5.3) : la même graine donne toujours le même tracé.
 *
 * graine(...parties) -> entier 32 bits (FNV-1a des parties jointes par « | ») ; alea(graine) -> fonction () -> [0, 1)
 *   (mulberry32) ; pasEbullition(t, ebullition) -> pas du re-tracé (0 si ebullition vaut 0 : tracé figé).
 * net(forme) -> { d, longueur } : tracé exact ; mainLevee(forme, o) -> { d, longueur } : tracé à main levée.
 *   forme : { type: 'segment', a, b } | { type: 'poly', points, ferme } | { type: 'lisse', points, ferme }
 *     | { type: 'quad', a, c, b } | { type: 'rect', x, y, l, h } | { type: 'ellipse', cx, cy, rx, ry } ; points [x, y].
 *   o : { graine, rugosite = 1, courbure = 1, passes = 2, unite = 1 (unités locales par cqh) }.
 *   Segment : deux passages de courbes de Bézier aux extrémités décalées (rugosité × longueur, borné à 0,35 cqh), légère
 *   courbure perpendiculaire ; polyligne et rectangle par segments ; courbe (lisse, quad) par points perturbés reliés en
 *   Catmull-Rom ; ellipse en points à rayon perturbé, refermée avec chevauchement. Les passages se suivent dans le même
 *   chemin (le tracé révélé fait le tour une fois, puis repasse).
 * hachures(polygone, o) -> { d, longueur, segments } : traits à −41°, écart de 4 fois l'épaisseur (o.epaisseur), découpés par
 *   balayage pair-impair et réunis en un seul chemin ; chaque trait reste dans le polygone (vérifié point par point, sinon
 *   tracé droit).
 * dansPolygone([x, y], polygone) -> bool ; simplifier(points, tolerance) -> points (Ramer-Douglas-Peucker) ;
 * polygoneDe(forme) -> points du contour (rectangle, ellipse en 48 points, polyligne).
 * Nombres arrondis au centième. Principes de Rough.js (MIT, Preet Shihn) tels qu'utilisés par engine/pen.js d'explainroo
 * (MIT, © 2026 Vincent Schmalbach) : réécriture courte, en SVG, sans code repris. Module pur : page (M.mainLevee) et Node.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.mainLevee = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ANGLE_HACHURES = -41 * Math.PI / 180;

  function graine() {
    var s = Array.prototype.map.call(arguments, String).join('|');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function alea(g) {
    var a = g >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pasEbullition(t, ebullition) { return ebullition > 0 ? Math.floor(t * ebullition + 1e-6) : 0; }

  function f(x) { var v = Math.round(x * 100) / 100; return String(v === 0 ? 0 : v); }
  function pt(p) { return f(p[0]) + ' ' + f(p[1]); }
  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function cubique(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  }
  function longueurCubique(p0, p1, p2, p3) {
    var l = 0, prec = p0;
    for (var i = 1; i <= 8; i++) { var q = cubique(p0, p1, p2, p3, i / 8); l += dist(prec, q); prec = q; }
    return l;
  }
  function options(o) {
    o = o || {};
    return { graine: o.graine >>> 0, rugosite: o.rugosite === undefined ? 1 : Math.max(0, o.rugosite), courbure: o.courbure === undefined ? 1 : o.courbure,
      passes: o.passes === 1 ? 1 : 2, unite: o.unite > 0 ? o.unite : 1, epaisseur: o.epaisseur > 0 ? o.epaisseur : 0.4 };
  }
  function jitter(r, a) { return (r() * 2 - 1) * a; }

  /** Un passage d'un segment : [début, contrôle 1, contrôle 2, fin]. */
  function passeSegment(a, b, r, o, k) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var L = Math.hypot(dx, dy) || 1e-9;
    var u = o.unite;
    var ecart = o.rugosite * Math.min(0.012 * L, 0.35 * u) * k;
    var flexion = o.rugosite * o.courbure * Math.min(0.02 * L, 1.2 * u);
    var nx = -dy / L, ny = dx / L;
    var bombe = jitter(r, flexion);
    var d1 = 0.2 + r() * 0.2, d2 = 0.6 + r() * 0.2;
    var p0 = [a[0] + jitter(r, ecart), a[1] + jitter(r, ecart)];
    var p3 = [b[0] + jitter(r, ecart), b[1] + jitter(r, ecart)];
    var p1 = [a[0] + dx * d1 + nx * bombe + jitter(r, ecart * 0.5), a[1] + dy * d1 + ny * bombe + jitter(r, ecart * 0.5)];
    var p2 = [a[0] + dx * d2 + nx * bombe + jitter(r, ecart * 0.5), a[1] + dy * d2 + ny * bombe + jitter(r, ecart * 0.5)];
    return [p0, p1, p2, p3];
  }
  function ecrireCubiques(liste) {
    var d = '', L = 0;
    liste.forEach(function (c) {
      d += 'M' + pt(c[0]) + 'C' + pt(c[1]) + ' ' + pt(c[2]) + ' ' + pt(c[3]);
      L += longueurCubique(c[0], c[1], c[2], c[3]);
    });
    return { d: d, longueur: L };
  }

  /** Courbe de Catmull-Rom par des points (ferme : boucle) -> cubiques [p0, c1, c2, p3]. */
  function catmullRom(points, ferme) {
    var n = points.length, r = [];
    if (n < 2) return r;
    var dernier = ferme ? n : n - 1;
    for (var i = 0; i < dernier; i++) {
      var p0 = points[ferme ? (i - 1 + n) % n : Math.max(0, i - 1)];
      var p1 = points[i];
      var p2 = points[(i + 1) % n];
      var p3 = points[ferme ? (i + 2) % n : Math.min(n - 1, i + 2)];
      r.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
    }
    return r;
  }
  /** Cubiques enchaînées en un chemin continu (un seul M). */
  function chaine(cubiques) {
    if (!cubiques.length) return { d: '', longueur: 0 };
    var d = 'M' + pt(cubiques[0][0]), L = 0;
    cubiques.forEach(function (c) { d += 'C' + pt(c[1]) + ' ' + pt(c[2]) + ' ' + pt(c[3]); L += longueurCubique(c[0], c[1], c[2], c[3]); });
    return { d: d, longueur: L };
  }
  function fusion(parts) {
    return { d: parts.map(function (p) { return p.d; }).join(''), longueur: parts.reduce(function (s, p) { return s + p.longueur; }, 0) };
  }

  function pointsQuad(a, c, b, n) {
    var r = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      r.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
    return r;
  }
  function pointsEllipse(cx, cy, rx, ry, n) {
    var r = [];
    for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; r.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return r;
  }
  function polygoneDe(forme) {
    if (forme.type === 'rect') return [[forme.x, forme.y], [forme.x + forme.l, forme.y], [forme.x + forme.l, forme.y + forme.h], [forme.x, forme.y + forme.h]];
    if (forme.type === 'ellipse') return pointsEllipse(forme.cx, forme.cy, forme.rx, forme.ry, 48);
    return (forme.points || []).slice();
  }

  /** Tracé exact. */
  function net(forme) {
    var L = 0, d = '';
    if (forme.type === 'segment') return { d: 'M' + pt(forme.a) + 'L' + pt(forme.b), longueur: dist(forme.a, forme.b) };
    if (forme.type === 'quad') {
      var q = pointsQuad(forme.a, forme.c, forme.b, 16);
      for (var i = 1; i < q.length; i++) L += dist(q[i - 1], q[i]);
      return { d: 'M' + pt(forme.a) + 'Q' + pt(forme.c) + ' ' + pt(forme.b), longueur: L };
    }
    if (forme.type === 'ellipse') {
      var rx = Math.abs(forme.rx), ry = Math.abs(forme.ry);
      d = 'M' + pt([forme.cx + rx, forme.cy]) + 'A' + f(rx) + ' ' + f(ry) + ' 0 1 1 ' + pt([forme.cx - rx, forme.cy]) + 'A' + f(rx) + ' ' + f(ry) + ' 0 1 1 ' + pt([forme.cx + rx, forme.cy]) + 'Z';
      var h = Math.pow(rx - ry, 2) / Math.pow(rx + ry || 1, 2);
      return { d: d, longueur: Math.PI * (rx + ry) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h))) };
    }
    if (forme.type === 'lisse') return chaine(catmullRom(forme.points, !!forme.ferme));
    var pts = forme.type === 'rect' ? polygoneDe(forme) : forme.points;
    var ferme = forme.type === 'rect' || !!forme.ferme;
    d = 'M' + pt(pts[0]);
    for (var k = 1; k < pts.length; k++) { d += 'L' + pt(pts[k]); L += dist(pts[k - 1], pts[k]); }
    if (ferme) { d += 'Z'; L += dist(pts[pts.length - 1], pts[0]); }
    return { d: d, longueur: L };
  }

  function mainLeveePoly(pts, ferme, r, o) {
    var passes = [];
    for (var p = 0; p < o.passes; p++) {
      var liste = [];
      for (var i = 1; i < pts.length; i++) liste.push(passeSegment(pts[i - 1], pts[i], r, o, p ? 0.6 : 1));
      if (ferme && pts.length > 2) liste.push(passeSegment(pts[pts.length - 1], pts[0], r, o, p ? 0.6 : 1));
      passes.push(ecrireCubiques(liste));
    }
    return fusion(passes);
  }
  function mainLeveeLisse(pts, ferme, r, o) {
    var passes = [];
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    var amplitude = o.rugosite * Math.min(0.25 * o.unite, 0.01 * L);
    for (var p = 0; p < o.passes; p++) {
      var bouges = pts.map(function (q) { return [q[0] + jitter(r, amplitude), q[1] + jitter(r, amplitude)]; });
      passes.push(chaine(catmullRom(bouges, ferme)));
    }
    return fusion(passes);
  }
  function mainLeveeEllipse(e, r, o) {
    var rx = Math.abs(e.rx), ry = Math.abs(e.ry);
    var perimetre = Math.PI * (rx + ry);
    var n = Math.max(10, Math.min(40, Math.ceil(perimetre / (3 * o.unite))));
    var passes = [];
    for (var p = 0; p < o.passes; p++) {
      var depart = r() * 2 * Math.PI;
      var chevauchement = (0.25 + r() * 0.25) * o.rugosite;
      var pas = (2 * Math.PI + chevauchement) / n;
      var pts = [];
      var amplitude = o.rugosite * Math.min(0.05, 0.35 * o.unite / Math.max(rx, ry, 1e-9));
      for (var i = 0; i <= n; i++) {
        var a = depart + i * pas + (i > 0 && i < n ? jitter(r, pas * 0.15) : 0);
        var k = 1 + jitter(r, amplitude);
        pts.push([e.cx + rx * k * Math.cos(a), e.cy + ry * k * Math.sin(a)]);
      }
      passes.push(chaine(catmullRom(pts, false)));
    }
    return fusion(passes);
  }

  function mainLevee(forme, oBrut) {
    var o = options(oBrut);
    var r = alea(o.graine);
    if (forme.type === 'segment') return mainLeveePoly([forme.a, forme.b], false, r, o);
    if (forme.type === 'poly') return mainLeveePoly(forme.points, !!forme.ferme, r, o);
    if (forme.type === 'rect') return mainLeveePoly(polygoneDe(forme), true, r, o);
    if (forme.type === 'ellipse') return mainLeveeEllipse(forme, r, o);
    if (forme.type === 'quad') return mainLeveeLisse(pointsQuad(forme.a, forme.c, forme.b, 8), false, r, o);
    if (forme.type === 'lisse') return mainLeveeLisse(forme.points, !!forme.ferme, r, o);
    throw new Error('forme inconnue : « ' + forme.type + ' »');
  }

  function dansPolygone(p, poly) {
    var dedans = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) dedans = !dedans;
    }
    return dedans;
  }

  function hachures(poly, oBrut) {
    var o = options(oBrut);
    var r = alea(o.graine);
    var ecart = 4 * o.epaisseur;
    var cos = Math.cos(-ANGLE_HACHURES), sin = Math.sin(-ANGLE_HACHURES);
    // Repère tourné : les hachures y sont horizontales.
    var tourne = poly.map(function (p) { return [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos]; });
    var retour = function (p) { return [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos]; };
    var ys = tourne.map(function (p) { return p[1]; });
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var marge = o.epaisseur * 0.5 + 0.2 * o.unite;
    var cubiques = [];
    var segments = [];
    for (var y = y0 + ecart / 2; y < y1; y += ecart) {
      var xs = [];
      for (var i = 0, j = tourne.length - 1; i < tourne.length; j = i++) {
        var a = tourne[i], b = tourne[j];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var xa = xs[k] + marge, xb = xs[k + 1] - marge;
        if (xb - xa < ecart) continue;
        var ja = r() * marge * 0.5, jb = r() * marge * 0.5;
        var A = retour([xa + ja, y]), B = retour([xb - jb, y]);
        var bombe = jitter(r, Math.min(0.25 * ecart, 0.02 * (xb - xa)) * o.rugosite);
        var C1 = retour([xa + (xb - xa) * 0.33, y + bombe]), C2 = retour([xa + (xb - xa) * 0.66, y + bombe]);
        var c = [A, C1, C2, B];
        for (var s = 1; s < 8; s++) if (!dansPolygone(cubique(A, C1, C2, B, s / 8), poly)) { c = [A, A, B, B]; break; }
        cubiques.push(c);
        segments.push(c);
      }
    }
    var e = ecrireCubiques(cubiques);
    return { d: e.d, longueur: e.longueur, segments: segments };
  }

  /** Ramer-Douglas-Peucker. */
  function simplifier(points, tolerance) {
    if (points.length < 3) return points.slice();
    var a = points[0], b = points[points.length - 1];
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    var pire = -1, indice = 0;
    for (var i = 1; i < points.length - 1; i++) {
      var p = points[i];
      var d = L > 1e-9 ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L : dist(a, p);
      if (d > pire) { pire = d; indice = i; }
    }
    if (pire <= tolerance) return [a, b];
    var gauche = simplifier(points.slice(0, indice + 1), tolerance);
    return gauche.slice(0, -1).concat(simplifier(points.slice(indice), tolerance));
  }

  return { graine: graine, alea: alea, pasEbullition: pasEbullition, net: net, mainLevee: mainLevee, hachures: hachures,
    dansPolygone: dansPolygone, simplifier: simplifier, polygoneDe: polygoneDe, pointsQuad: pointsQuad, ANGLE_HACHURES: ANGLE_HACHURES };
});
