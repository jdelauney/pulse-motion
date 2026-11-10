/* Pulse Motion – géométrie des flèches et des annotations du calque de dessin (spec S7, 5.4 et 5.5). Tout en cqh.
 *
 * Une boîte : { x, y, l, h, forme: 'rect' | 'ellipse' } (centre et taille) ; un point : { x, y } (l = h = 0).
 * bord(boite, vers, ecart) -> { x, y } : point du bord de la boîte (rectangle ou ellipse) dans la direction de vers,
 *   reculé de ecart ; pour un point, à ecart de lui.
 * fleche(de, vers, o) -> { a, b, c, forme, longueur, echantillons, etiquette(l, h), pointe(distance, sens) }
 *   o : { courbe (−1 à 1, 0), ecart (1,3), epaisseur (0,4) }. Centre à centre, coupée au bord de chaque cible, reculée de
 *   l'écart ; contrôle milieu + normale × courbe × 0,5 × longueur ; forme 'segment' (courbe nulle) ou 'quad'.
 *   pointe(distance, sens) -> [[x, y] ×3] : pointe de longueur épaisseur × 3,2 + 1,1 cqh, ouverture ± 0,5 rad, au point du
 *   tracé à cette distance (elle suit le bout du tracé). etiquette(l, h) -> { x, y } : centre de l'étiquette, du côté
 *   extérieur de la courbe (au-dessus d'une flèche droite), à 3,1 cqh + |nx| × l / 2 (+ |ny| × max(0, h / 2 − 1,8)) du milieu,
 *   éloignée par pas de 0,4 cqh tant qu'elle touche encore le tracé.
 * annotation(type, boite, o) -> [{ forme, progres(p) -> [0, 1], remplir?, calque? }] ; types TYPES_ANNOTATION. Marge 1,3 cqh :
 *   souligne (trait sous la boîte), entoure (ellipse de 1,12 × la largeur et 1,25 × la hauteur avec marge), encadre,
 *   surligne (aplat sous le texte, qui s'étend de gauche à droite), barre, croix (deux traits successifs), accolade (à gauche).
 * DUREES_ANNOTATION : 0,6 s (0,8 s pour entoure). boiteDe(forme) -> boîte englobante (centre et taille).
 * Valeurs et logique de arrow, _arrowLabel, _edge et annotate de engine/stage.js d'explainroo (MIT, © 2026 Vincent
 * Schmalbach), adaptées en cqh. Module pur : page (M.geometrieDessin) et Node.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.geometrieDessin = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TYPES_ANNOTATION = ['souligne', 'entoure', 'encadre', 'surligne', 'barre', 'croix', 'accolade'];
  var DUREES_ANNOTATION = { entoure: 0.8 };
  var MARGE = 1.3;
  var ECART = 1.3;
  var DECALAGE_ETIQUETTE = 3.1;
  var PX = 100 / 1080; // un pixel d'une image de 1080 de haut, en cqh

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function bord(b, vers, ecart) {
    var dx = vers.x - b.x, dy = vers.y - b.y;
    if (!b.l && !b.h) {
      var L = Math.hypot(dx, dy) || 1;
      return { x: b.x + dx / L * ecart, y: b.y + dy / L * ecart };
    }
    var dl = b.l / 2 + ecart, dh = b.h / 2 + ecart;
    if (b.forme === 'ellipse') {
      var ang = Math.atan2(dy, dx);
      return { x: b.x + Math.cos(ang) * dl, y: b.y + Math.sin(ang) * dh };
    }
    var k = Math.min(Math.abs(dx) > 1e-6 ? dl / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? dh / Math.abs(dy) : Infinity);
    if (!isFinite(k)) k = 0;
    return { x: b.x + dx * k, y: b.y + dy * k };
  }

  function point(v) { return { x: v.x, y: v.y, l: v.l || 0, h: v.h || 0, forme: v.forme }; }

  function fleche(deBrut, versBrut, o) {
    o = o || {};
    var A = point(deBrut), B = point(versBrut);
    var ecart = o.ecart === undefined ? ECART : o.ecart;
    var epaisseur = o.epaisseur > 0 ? o.epaisseur : 0.4;
    var aBoite = A.l > 0 || A.h > 0, bBoite = B.l > 0 || B.h > 0;
    var a = aBoite ? bord(A, B, ecart) : { x: A.x, y: A.y };
    var b = bBoite ? bord(B, a, ecart) : { x: B.x, y: B.y };
    if (aBoite && !bBoite) a = bord(A, b, ecart);
    var courbe = Math.max(-1, Math.min(1, o.courbe || 0));
    var dx = b.x - a.x, dy = b.y - a.y;
    var c = { x: (a.x + b.x) / 2 - dy * courbe * 0.5, y: (a.y + b.y) / 2 + dx * courbe * 0.5 };
    var forme = courbe ? { type: 'quad', a: [a.x, a.y], c: [c.x, c.y], b: [b.x, b.y] } : { type: 'segment', a: [a.x, a.y], b: [b.x, b.y] };
    var echantillons = [];
    var n = courbe ? 32 : 16, s = 0, prec = null;
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      var p = courbe ? { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y } : { x: a.x + dx * t, y: a.y + dy * t };
      if (prec) s += Math.hypot(p.x - prec.x, p.y - prec.y);
      echantillons.push({ x: p.x, y: p.y, s: s });
      prec = p;
    }
    var longueur = s;
    function pointA(dist) {
      dist = Math.max(0, Math.min(longueur, dist));
      for (var k = 1; k < echantillons.length; k++) {
        var e0 = echantillons[k - 1], e1 = echantillons[k];
        if (e1.s >= dist || k === echantillons.length - 1) {
          var q = e1.s > e0.s ? (dist - e0.s) / (e1.s - e0.s) : 0;
          return { x: e0.x + (e1.x - e0.x) * q, y: e0.y + (e1.y - e0.y) * q };
        }
      }
      return { x: a.x, y: a.y };
    }
    var taillePointe = epaisseur * 3.2 + 12 * PX;
    function pointe(distance, sens) {
      var tip = pointA(distance);
      var arriere = pointA(distance - sens * Math.min(12 * PX, longueur / 3));
      var ang = Math.atan2(tip.y - arriere.y, tip.x - arriere.x);
      return [[tip.x - taillePointe * Math.cos(ang - 0.5), tip.y - taillePointe * Math.sin(ang - 0.5)], [tip.x, tip.y],
        [tip.x - taillePointe * Math.cos(ang + 0.5), tip.y - taillePointe * Math.sin(ang + 0.5)]];
    }
    function etiquette(l, h) {
      var mid = pointA(longueur / 2);
      var bx = mid.x - (a.x + b.x) / 2, by = mid.y - (a.y + b.y) / 2;
      var nx, ny;
      if (courbe && Math.hypot(bx, by) > 0.09) { nx = bx / Math.hypot(bx, by); ny = by / Math.hypot(bx, by); }
      else {
        var len = Math.hypot(dx, dy) || 1;
        nx = -dy / len; ny = dx / len;
        if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
      }
      var off = DECALAGE_ETIQUETTE;
      var extraX = Math.abs(nx) * (l || 0) / 2;
      var extraY = Math.abs(ny) * Math.max(0, (h || 0) / 2 - 1.8);
      // Une étiquette qui toucherait encore le tracé (flèche en biais, courbe serrée) s'éloigne par pas de 0,4 cqh.
      var pousse = 0;
      var touche = function (px, py) {
        return echantillons.some(function (e) { return Math.abs(e.x - px) < (l || 0) / 2 + epaisseur && Math.abs(e.y - py) < (h || 0) / 2 + epaisseur; });
      };
      var px = mid.x + nx * (off + extraX), py = mid.y + ny * (off + extraY);
      while ((l || h) && touche(px, py) && pousse < 60) { pousse++; px += nx * 0.4; py += ny * 0.4; }
      return { x: px, y: py, nx: nx, ny: ny };
    }
    return { a: a, b: b, c: c, forme: forme, longueur: longueur, echantillons: echantillons, pointA: pointA, pointe: pointe, etiquette: etiquette, taillePointe: taillePointe };
  }

  function annotation(type, b, o) {
    o = o || {};
    var m = o.marge === undefined ? MARGE : o.marge;
    var w = b.l + 2 * m, h = b.h + 2 * m;
    var x = b.x, y = b.y;
    var g = x - w / 2, dr = x + w / 2, haut = y - h / 2, bas = y + h / 2;
    var tout = function (p) { return p; };
    switch (type) {
      case 'souligne': {
        var yy = bas - m * 0.4;
        return [{ forme: { type: 'quad', a: [g, yy], c: [x, yy + 8 * PX], b: [dr, yy - 4 * PX] }, progres: tout }];
      }
      case 'entoure':
        return [{ forme: { type: 'ellipse', cx: x, cy: y, rx: w * 1.12 / 2, ry: h * 1.25 / 2 }, progres: tout }];
      case 'encadre':
        return [{ forme: { type: 'rect', x: g, y: haut, l: w, h: h }, progres: tout }];
      case 'surligne':
        return [{ forme: { type: 'rect', x: g, y: haut + h * 0.08, l: w, h: h * 0.84 }, progres: tout, remplir: true, balaye: true, calque: 'dessous' }];
      case 'barre':
        return [{ forme: { type: 'segment', a: [g, y + 4 * PX], b: [dr, y - 4 * PX] }, progres: tout }];
      case 'croix':
        return [{ forme: { type: 'segment', a: [g, haut], b: [dr, bas] }, progres: function (p) { return clamp(p * 2); } },
          { forme: { type: 'segment', a: [dr, haut], b: [g, bas] }, progres: function (p) { return clamp(p * 2 - 1); } }];
      case 'accolade': {
        var k = Math.min(1.5, h / 4), ym = y;
        var pts = [];
        // Accolade à gauche de la boîte : deux arcs, la pointe au milieu (points d'une courbe lissée ensuite).
        var arc = function (x0, y0, x1, y1, n) { for (var i = 0; i <= n; i++) { var t = i / n; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); } };
        pts.push([g + k, haut]); pts.push([g + k * 0.3, haut + k * 0.3]);
        arc(g, haut + k, g, ym - k, 2);
        pts.push([g - k * 0.5, ym - k * 0.2]); pts.push([g - k, ym]); pts.push([g - k * 0.5, ym + k * 0.2]);
        arc(g, ym + k, g, bas - k, 2);
        pts.push([g + k * 0.3, bas - k * 0.3]); pts.push([g + k, bas]);
        return [{ forme: { type: 'lisse', points: pts }, progres: tout }];
      }
      default:
        throw new Error('annotation « ' + type + ' » inconnue (' + TYPES_ANNOTATION.join(', ') + ')');
    }
  }

  /** Boîte englobante (centre et taille) d'une forme. */
  function boiteDe(forme) {
    var pts;
    if (forme.type === 'segment') pts = [forme.a, forme.b];
    else if (forme.type === 'quad') {
      pts = [];
      for (var i = 0; i <= 16; i++) { var t = i / 16, u = 1 - t; pts.push([u * u * forme.a[0] + 2 * u * t * forme.c[0] + t * t * forme.b[0], u * u * forme.a[1] + 2 * u * t * forme.c[1] + t * t * forme.b[1]]); }
    } else if (forme.type === 'rect') pts = [[forme.x, forme.y], [forme.x + forme.l, forme.y + forme.h]];
    else if (forme.type === 'ellipse') pts = [[forme.cx - Math.abs(forme.rx), forme.cy - Math.abs(forme.ry)], [forme.cx + Math.abs(forme.rx), forme.cy + Math.abs(forme.ry)]];
    else pts = forme.points || [];
    if (!pts.length) return { x: 0, y: 0, l: 0, h: 0 };
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, l: x1 - x0, h: y1 - y0 };
  }

  return { bord: bord, fleche: fleche, annotation: annotation, boiteDe: boiteDe, TYPES_ANNOTATION: TYPES_ANNOTATION,
    DUREES_ANNOTATION: DUREES_ANNOTATION, MARGE: MARGE, ECART: ECART, DECALAGE_ETIQUETTE: DECALAGE_ETIQUETTE };
});
