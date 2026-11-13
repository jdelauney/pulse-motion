/* Pulse Motion – lecteur Lottie (spec S9, 5.11), écrit pour Pulse Motion d'après la description publique du format (aucun code
 * de lottie-web). L'animation n'est jamais jouée : chaque image est calculée du temps de la page (déterminisme).
 *
 *   <div data-lottie="assets/lottie/fusee.json" data-start="0.5" data-lottie-vitesse="1" data-lottie-boucle="non"
 *        data-lottie-couleurs="#ff5a00=primaire,#222222=texte" style="width: 40cqh; height: 40cqh"></div>
 *
 * imageLottie(anim, local, { vitesse = 1, boucle = false }) -> image (depuis ip) : (t − début) × cadence × vitesse, bornée à
 *   la dernière image, ou prise modulo la durée en boucle ; avant le début : la première image.
 * svgLottie(anim, image, prefixe = 'pmL') -> SVG (chaîne) de l'image donnée (depuis ip), identique pour une même image.
 * analyserLottie(anim) -> { ips, images, duree, largeur, hauteur, couleurs: ['#rrggbb'], expressions, textes, imagesExternes,
 *   nonPris: [noms français] } : ce que l'import rapporte et ce que le contrôle signale.
 * M.demarrerLotties() (page) : chaque [data-lottie] (le bloc JSON de la page, posé par l'assemblage) est redessiné à chaque
 *   rendu (M.surRendu) si son image a changé. Début : l'élément minuté (data-start), ou son ancêtre minuté, sinon la scène.
 *
 * Pris en charge : calques de formes, solides, images embarquées, nuls, précompositions (avec remappage du temps), parents,
 * masques (ajout, soustraction, inversés), caches (alpha, alpha inversé, luminance), images clés à courbes de Bézier (et
 * maintenues), positions sur une trajectoire courbe, chemins animés, rectangles, ellipses, étoiles et polygones, remplissages,
 * contours (tirets), dégradés linéaires et radiaux, tracés tronqués. Le reste (répéteur, coins arrondis, fusion de tracés,
 * effets, modes de fusion, textes, calques 3D, expressions…) n'est pas dessiné : analyserLottie le nomme.
 * Module pur (Node : require ; page : global M.lottie et M.demarrerLotties).
 */
(function (racine, fabrique) {
  var api = fabrique(racine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.lottie = api; racine.M.demarrerLotties = api.demarrerLotties; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (racine) {
  'use strict';

  var KAPPA = 0.5519150244935105;

  function n3(v) {
    var r = Math.round(v * 1000) / 1000;
    return r === 0 ? '0' : String(r);
  }
  function en(x) { return Array.isArray(x) ? x : [x]; }
  function anime(p) {
    if (!p || p.k === undefined) return false;
    if (p.a === 1) return true;
    return Array.isArray(p.k) && p.k.length > 0 && p.k[0] !== null && typeof p.k[0] === 'object' && p.k[0].t !== undefined;
  }

  // --- Courbes d'accélération (Bézier cubique, comme une courbe CSS) ------------------------------------------------------
  function bezier(x1, y1, x2, y2, t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    x1 = Math.min(1, Math.max(0, x1)); x2 = Math.min(1, Math.max(0, x2));
    if (x1 === y1 && x2 === y2) return t;
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    var fx = function (u) { return ((ax * u + bx) * u + cx) * u; };
    var u = t;
    for (var i = 0; i < 8; i++) {
      var d = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(d) < 1e-7) break;
      var e = fx(u) - t;
      if (Math.abs(e) < 1e-7) break;
      u -= e / d;
    }
    if (!(u >= 0 && u <= 1) || Math.abs(fx(u) - t) > 1e-5) {
      var bas = 0, haut = 1;
      u = t;
      for (var k = 0; k < 30; k++) { if (fx(u) < t) bas = u; else haut = u; u = (bas + haut) / 2; }
    }
    return ((ay * u + by) * u + cy) * u;
  }
  function composante(v, j) { return Array.isArray(v) ? (v[j] !== undefined ? v[j] : v[v.length - 1]) : v; }
  function avance(k0, p, j) {
    if (!k0.o || !k0.i) return p;
    return bezier(composante(k0.o.x, j), composante(k0.o.y, j), composante(k0.i.x, j), composante(k0.i.y, j), p);
  }

  // --- Valeurs animées ----------------------------------------------------------------------------------------------------
  function melangeChemins(a, b, e) {
    return {
      c: a.c, v: a.v.map(function (p, i) { var q = b.v[i] || p; return [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e]; }),
      i: a.i.map(function (p, i) { var q = (b.i || [])[i] || p; return [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e]; }),
      o: a.o.map(function (p, i) { var q = (b.o || [])[i] || p; return [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e]; }),
    };
  }
  function cheminDe(s) { var c = Array.isArray(s) ? s[0] : s; return c && c.v ? { c: !!c.c, v: c.v, i: c.i || c.v.map(function () { return [0, 0]; }), o: c.o || c.v.map(function () { return [0, 0]; }) } : { c: false, v: [], i: [], o: [] }; }

  /** Point à la fraction e (de la longueur) d'une courbe cubique a, a + to, b + ti, b. */
  function surTrajectoire(a, b, to, ti, e) {
    var p1 = [a[0] + to[0], a[1] + to[1]], p2 = [b[0] + ti[0], b[1] + ti[1]];
    var pt = function (u) {
      var m = 1 - u;
      return [m * m * m * a[0] + 3 * m * m * u * p1[0] + 3 * m * u * u * p2[0] + u * u * u * b[0], m * m * m * a[1] + 3 * m * m * u * p1[1] + 3 * m * u * u * p2[1] + u * u * u * b[1]];
    };
    var N = 32, longueurs = [0], prec = a, total = 0;
    for (var i = 1; i <= N; i++) { var q = pt(i / N); total += Math.hypot(q[0] - prec[0], q[1] - prec[1]); longueurs.push(total); prec = q; }
    if (total < 1e-9) return a.slice();
    var cible = Math.min(1, Math.max(0, e)) * total;
    for (var k = 1; k <= N; k++) {
      if (longueurs[k] >= cible) {
        var f = (cible - longueurs[k - 1]) / Math.max(1e-12, longueurs[k] - longueurs[k - 1]);
        var r = pt((k - 1 + f) / N);
        if (a.length > 2) r.push(a[2] + ((b[2] || 0) - a[2]) * e);
        return r;
      }
    }
    return b.slice();
  }

  /** Valeur d'une propriété à l'image f (temps de sa composition) ; forme : 'chemin' pour un tracé. */
  function valeur(p, f, forme, defaut) {
    if (!p || p.k === undefined) return defaut;
    if (!anime(p)) return forme === 'chemin' ? cheminDe(p.k) : p.k;
    var kf = p.k;
    var debutDe = function (k) { return forme === 'chemin' ? cheminDe(k.s) : k.s; };
    if (f <= kf[0].t || kf.length === 1) return debutDe(kf[0]) !== undefined ? debutDe(kf[0]) : defaut;
    var i = 0;
    while (i < kf.length - 1 && !(f >= kf[i].t && f < kf[i + 1].t)) i++;
    if (i >= kf.length - 1) {
      var der = kf[kf.length - 1];
      if (der.s !== undefined) return debutDe(der);
      var av = kf[kf.length - 2];
      return forme === 'chemin' ? cheminDe(av.e !== undefined ? av.e : av.s) : (av.e !== undefined ? av.e : av.s);
    }
    var k0 = kf[i], k1 = kf[i + 1];
    var a = k0.s, b = k0.e !== undefined ? k0.e : k1.s;
    if (b === undefined) b = a;
    if (k0.h === 1 || k1.t === k0.t) return forme === 'chemin' ? cheminDe(a) : a;
    var t = (f - k0.t) / (k1.t - k0.t);
    if (forme === 'chemin') return melangeChemins(cheminDe(a), cheminDe(b), avance(k0, t, 0));
    var A = en(a), B = en(b);
    if (k0.to && k0.ti && A.length >= 2 && (k0.to[0] || k0.to[1] || k0.ti[0] || k0.ti[1])) return surTrajectoire(A, B, k0.to, k0.ti, avance(k0, t, 0));
    var r = A.map(function (x, j) { var y = B[j] !== undefined ? B[j] : x; return x + (y - x) * avance(k0, t, j); });
    return Array.isArray(a) ? r : r[0];
  }
  function nombre(p, f, defaut) { var v = valeur(p, f, null, defaut); return Array.isArray(v) ? v[0] : (v === undefined ? defaut : v); }

  // --- Matrices affines [a, b, c, d, e, f] (comme SVG) --------------------------------------------------------------------
  var IDENTITE = [1, 0, 0, 1, 0, 0];
  function multiplier(m, q) {
    return [m[0] * q[0] + m[2] * q[1], m[1] * q[0] + m[3] * q[1], m[0] * q[2] + m[2] * q[3], m[1] * q[2] + m[3] * q[3],
      m[0] * q[4] + m[2] * q[5] + m[4], m[1] * q[4] + m[3] * q[5] + m[5]];
  }
  function appliquer(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  function rotation(deg) { var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; }

  /** Transformation d'un calque ou d'un groupe (ks, tr) : T(p) · R(r) · inclinaison · S(s) · T(−a) ; opacité de 0 à 1. */
  function transformation(ks, f) {
    ks = ks || {};
    var a = en(valeur(ks.a, f, null, [0, 0]));
    var p;
    if (ks.p && ks.p.s) p = [nombre(ks.p.x, f, 0), nombre(ks.p.y, f, 0)];
    else p = en(valeur(ks.p, f, null, [0, 0]));
    var s = en(valeur(ks.s, f, null, [100, 100]));
    var r = nombre(ks.r || ks.rz, f, 0);
    var m = [1, 0, 0, 1, p[0] || 0, p[1] || 0];
    m = multiplier(m, rotation(r));
    var sk = nombre(ks.sk, f, 0);
    if (sk) {
      var sa = nombre(ks.sa, f, 0);
      m = multiplier(m, multiplier(rotation(sa), multiplier([1, 0, Math.tan(-sk * Math.PI / 180), 1, 0, 0], rotation(-sa))));
    }
    m = multiplier(m, [(s[0] === undefined ? 100 : s[0]) / 100, 0, 0, (s[1] === undefined ? (s[0] === undefined ? 100 : s[0]) : s[1]) / 100, 0, 0]);
    m = multiplier(m, [1, 0, 0, 1, -(a[0] || 0), -(a[1] || 0)]);
    return { m: m, o: Math.max(0, Math.min(1, nombre(ks.o, f, 100) / 100)) };
  }
  function matriceSVG(m) { return 'matrix(' + m.map(n3).join(' ') + ')'; }

  // --- Tracés : segments absolus [départ, [c1, c2, arrivée]…], fermé ou non ------------------------------------------------
  function versSegments(c) {
    var v = c.v || [];
    if (!v.length) return null;
    var segs = [];
    var nb = c.c ? v.length : v.length - 1;
    for (var k = 0; k < nb; k++) {
      var j = (k + 1) % v.length;
      var o = c.o[k] || [0, 0], i = c.i[j] || [0, 0];
      segs.push([[v[k][0] + o[0], v[k][1] + o[1]], [v[j][0] + i[0], v[j][1] + i[1]], [v[j][0], v[j][1]]]);
    }
    return { depart: [v[0][0], v[0][1]], segs: segs, ferme: !!c.c };
  }
  function rectangle(p, s, r, sens) {
    var x = p[0], y = p[1], w = s[0] / 2, h = s[1] / 2;
    r = Math.min(r || 0, w, h);
    var v, i, o;
    if (!r) {
      v = [[x + w, y - h], [x + w, y + h], [x - w, y + h], [x - w, y - h]];
      i = v.map(function () { return [0, 0]; }); o = i.slice();
    } else {
      var k = r * (1 - KAPPA);
      v = [[x + w, y - h + r], [x + w, y + h - r], [x + w - r, y + h], [x - w + r, y + h], [x - w, y + h - r], [x - w, y - h + r], [x - w + r, y - h], [x + w - r, y - h]];
      i = [[0, -(r - k)], [0, 0], [r - k, 0], [0, 0], [0, r - k], [0, 0], [-(r - k), 0], [0, 0]];
      o = [[0, 0], [0, r - k], [0, 0], [-(r - k), 0], [0, 0], [0, -(r - k)], [0, 0], [r - k, 0]];
    }
    return orienter({ c: true, v: v, i: i, o: o }, sens);
  }
  function ellipse(p, s, sens) {
    var x = p[0], y = p[1], rx = s[0] / 2, ry = s[1] / 2, cx = rx * KAPPA, cy = ry * KAPPA;
    return orienter({ c: true, v: [[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y]], i: [[-cx, 0], [0, -cy], [cx, 0], [0, cy]], o: [[cx, 0], [0, cy], [-cx, 0], [0, -cy]] }, sens);
  }
  function etoile(it, f) {
    var pts = Math.max(3, Math.round(nombre(it.pt, f, 5)));
    var p = en(valeur(it.p, f, null, [0, 0])), rot = nombre(it.r, f, 0), ext = nombre(it.or, f, 10), int = nombre(it.ir, f, 5);
    var v = [];
    var etoileVraie = it.sy !== 2;
    var nb = etoileVraie ? pts * 2 : pts;
    for (var k = 0; k < nb; k++) {
      var ang = (-90 + rot + k * 360 / nb) * Math.PI / 180;
      var rr = etoileVraie && k % 2 ? int : ext;
      v.push([p[0] + rr * Math.cos(ang), p[1] + rr * Math.sin(ang)]);
    }
    var z = v.map(function () { return [0, 0]; });
    return orienter({ c: true, v: v, i: z, o: z.slice() }, it.d);
  }
  function orienter(c, sens) {
    if (sens !== 3) return c;
    var v = c.v.slice().reverse(), i = c.o.slice().reverse(), o = c.i.slice().reverse();
    return { c: c.c, v: v, i: i, o: o };
  }
  function transformerSegments(s, m) {
    if (!s) return s;
    return { depart: appliquer(m, s.depart), segs: s.segs.map(function (g) { return [appliquer(m, g[0]), appliquer(m, g[1]), appliquer(m, g[2])]; }), ferme: s.ferme };
  }
  function enD(s) {
    if (!s || !s.segs.length) return '';
    var d = 'M' + n3(s.depart[0]) + ' ' + n3(s.depart[1]);
    s.segs.forEach(function (g) { d += 'C' + n3(g[0][0]) + ' ' + n3(g[0][1]) + ' ' + n3(g[1][0]) + ' ' + n3(g[1][1]) + ' ' + n3(g[2][0]) + ' ' + n3(g[2][1]); });
    return s.ferme ? d + 'Z' : d;
  }

  // Tracés tronqués : longueur d'un segment par échantillons, découpe de Bézier (de Casteljau).
  function pointCubique(a, g, u) {
    var m = 1 - u;
    return [m * m * m * a[0] + 3 * m * m * u * g[0][0] + 3 * m * u * u * g[1][0] + u * u * u * g[2][0], m * m * m * a[1] + 3 * m * m * u * g[0][1] + 3 * m * u * u * g[1][1] + u * u * u * g[2][1]];
  }
  function table(a, g) {
    var N = 16, l = [0], prec = a, tot = 0;
    for (var i = 1; i <= N; i++) { var q = pointCubique(a, g, i / N); tot += Math.hypot(q[0] - prec[0], q[1] - prec[1]); l.push(tot); prec = q; }
    return l;
  }
  function parametre(l, cible) {
    var N = l.length - 1;
    if (cible <= 0) return 0;
    if (cible >= l[N]) return 1;
    for (var k = 1; k <= N; k++) if (l[k] >= cible) return (k - 1 + (cible - l[k - 1]) / Math.max(1e-12, l[k] - l[k - 1])) / N;
    return 1;
  }
  function couper(a, g, u0, u1) {
    // Morceau [u0, u1] d'une cubique : coupe à u1, puis à u0 / u1 sur la partie gauche.
    var lerp = function (p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    var gauche = function (p0, p1, p2, p3, t) {
      var a1 = lerp(p0, p1, t), b1 = lerp(p1, p2, t), c1 = lerp(p2, p3, t), a2 = lerp(a1, b1, t), b2 = lerp(b1, c1, t), m = lerp(a2, b2, t);
      return [p0, a1, a2, m, b2, c1, p3];
    };
    var r = gauche(a, g[0], g[1], g[2], u1);
    var p0 = r[0], p1 = r[1], p2 = r[2], p3 = r[3];
    if (u0 <= 0) return { depart: p0, seg: [p1, p2, p3] };
    var t = u1 > 0 ? u0 / u1 : 0;
    var s = gauche(p0, p1, p2, p3, t);
    return { depart: s[3], seg: [s[4], s[5], s[6]] };
  }
  /** Morceaux d'un tracé entre deux fractions de sa longueur (0 ≤ de ≤ a ≤ 1). */
  function morceau(s, de, a) {
    var tables = [], prec = s.depart, total = 0;
    s.segs.forEach(function (g) { var l = table(prec, g); tables.push({ a: prec, g: g, l: l, debut: total }); total += l[l.length - 1]; prec = g[2]; });
    if (total < 1e-9) return null;
    var L0 = de * total, L1 = a * total;
    var r = { depart: null, segs: [], ferme: false };
    tables.forEach(function (x) {
      var lg = x.l[x.l.length - 1];
      var d0 = Math.max(L0, x.debut), d1 = Math.min(L1, x.debut + lg);
      if (d1 <= d0 + 1e-9) return;
      var c = couper(x.a, x.g, parametre(x.l, d0 - x.debut), parametre(x.l, d1 - x.debut));
      if (!r.depart) r.depart = c.depart;
      r.segs.push(c.seg);
    });
    return r.depart ? r : null;
  }
  function tronquer(s, tm) {
    if (!s || !s.segs.length) return [s];
    var de = tm.s / 100, a = tm.e / 100;
    if (de > a) { var x = de; de = a; a = x; }
    var dec = (tm.o / 360) % 1;
    if (dec < 0) dec += 1;
    if (a - de >= 1 - 1e-9) return [s];
    if (a - de <= 1e-9) return [];
    de += dec; a += dec;
    if (de >= 1) { de -= 1; a -= 1; }
    if (a <= 1) return [morceau(s, de, a)].filter(Boolean);
    return [morceau(s, de, 1), morceau(s, 0, a - 1)].filter(Boolean);
  }

  // --- Couleurs -----------------------------------------------------------------------------------------------------------
  function couleur(c, forcer) {
    if (forcer) return forcer;
    var v = en(c || [0, 0, 0]);
    var k = v.some(function (x) { return x > 1; }) ? 1 : 255;
    var h = function (x) { var y = Math.round(Math.max(0, Math.min(255, (x || 0) * k))).toString(16); return y.length < 2 ? '0' + y : y; };
    return '#' + h(v[0]) + h(v[1]) + h(v[2]);
  }

  // --- Formes d'un calque ---------------------------------------------------------------------------------------------------
  var STYLES = { fl: 1, st: 1, gf: 1, gs: 1 };
  var TRACES = { sh: 1, rc: 1, el: 1, sr: 1 };

  function chemin(it, f) {
    if (it.ty === 'sh') return orienter(valeur(it.ks, f, 'chemin'), it.d);
    if (it.ty === 'rc') return rectangle(en(valeur(it.p, f, null, [0, 0])), en(valeur(it.s, f, null, [0, 0])), nombre(it.r, f, 0), it.d);
    if (it.ty === 'el') return ellipse(en(valeur(it.p, f, null, [0, 0])), en(valeur(it.s, f, null, [0, 0])), it.d);
    return etoile(it, f);
  }

  /**
   * Arbre d'un groupe : parcours de la fin vers le début (le premier élément est dessiné au-dessus) ; un style (remplissage,
   * contour) s'applique aux tracés qui le précèdent dans son groupe et ses sous-groupes. herites : [{ style, m }] (m : du
   * groupe courant vers celui du style) ; coupes : tracés tronqués en vigueur.
   */
  function arbreGroupe(items, f, herites, coupes, ctx) {
    var sortie = [];
    var actifs = herites.slice();
    var mesCoupes = coupes.slice();
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (!it || it.hd) continue;
      if (STYLES[it.ty]) {
        var st = { it: it, traces: [] };
        sortie.push({ style: st });
        actifs.push({ style: st, m: IDENTITE });
      } else if (TRACES[it.ty]) {
        var s = versSegments(chemin(it, f));
        var morceaux = [s];
        mesCoupes.forEach(function (tm) { morceaux = [].concat.apply([], morceaux.map(function (x) { return tronquer(x, tm); })); });
        actifs.forEach(function (a) { morceaux.forEach(function (x) { if (x) a.style.traces.push(transformerSegments(x, a.m)); }); });
      } else if (it.ty === 'gr') {
        var tr = null;
        (it.it || []).forEach(function (x) { if (x && x.ty === 'tr') tr = x; });
        var t = transformation(tr, f);
        var enfant = arbreGroupe(it.it || [], f, actifs.map(function (a) { return { style: a.style, m: multiplier(a.m, t.m) }; }), mesCoupes, ctx);
        sortie.push({ groupe: enfant, m: t.m, o: t.o });
      } else if (it.ty === 'tm') {
        mesCoupes.push({ s: nombre(it.s, f, 0), e: nombre(it.e, f, 100), o: nombre(it.o, f, 0) });
      }
    }
    return sortie;
  }

  function attributsTrace(it, f, ctx) {
    var a = '';
    var o = nombre(it.o, f, 100) / 100;
    if (it.ty === 'fl' || it.ty === 'gf') {
      a += ' fill="' + (it.ty === 'fl' ? couleur(valeur(it.c, f), ctx.forcer) : peinture(it, f, ctx)) + '"';
      if (o < 1) a += ' fill-opacity="' + n3(o) + '"';
      if (it.r === 2) a += ' fill-rule="evenodd"';
      return a;
    }
    a += ' fill="none" stroke="' + (it.ty === 'st' ? couleur(valeur(it.c, f), ctx.forcer) : peinture(it, f, ctx)) + '"';
    if (o < 1) a += ' stroke-opacity="' + n3(o) + '"';
    a += ' stroke-width="' + n3(nombre(it.w, f, 1)) + '"';
    a += ' stroke-linecap="' + (['butt', 'butt', 'round', 'square'][it.lc || 1] || 'butt') + '"';
    a += ' stroke-linejoin="' + (['miter', 'miter', 'round', 'bevel'][it.lj || 1] || 'miter') + '"';
    if ((it.lj || 1) === 1) a += ' stroke-miterlimit="' + n3(it.ml || 4) + '"';
    if (Array.isArray(it.d) && it.d.length) {
      var tirets = [], decalage = 0;
      it.d.forEach(function (x) { var v = nombre(x.v, f, 0); if (x.n === 'o') decalage = v; else tirets.push(v); });
      if (tirets.length && tirets.some(function (v) { return v > 0; })) a += ' stroke-dasharray="' + tirets.map(n3).join(' ') + '" stroke-dashoffset="' + n3(-decalage) + '"';
    }
    return a;
  }

  /** Dégradé (gf, gs) : défini dans ctx.defs, dans l'espace du groupe du style. */
  function peinture(it, f, ctx) {
    if (ctx.forcer) return ctx.forcer;
    var id = ctx.prefixe + 'g' + (ctx.compte++);
    var nb = (it.g && it.g.p) || 0;
    var g = en(valeur(it.g && it.g.k, f, null, []));
    var s = en(valeur(it.s, f, null, [0, 0])), e = en(valeur(it.e, f, null, [100, 0]));
    var opacites = [];
    for (var j = nb * 4; j + 1 < g.length; j += 2) opacites.push([g[j], g[j + 1]]);
    var opaciteA = function (x) {
      if (!opacites.length) return 1;
      if (x <= opacites[0][0]) return opacites[0][1];
      for (var k = 1; k < opacites.length; k++) if (x <= opacites[k][0]) { var a = opacites[k - 1], b = opacites[k]; return a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1e-9, b[0] - a[0]); }
      return opacites[opacites.length - 1][1];
    };
    var arrets = '';
    for (var k = 0; k < nb && k * 4 + 3 < g.length; k++) {
      var x = g[k * 4];
      var op = opaciteA(x);
      arrets += '<stop offset="' + n3(x) + '" stop-color="' + couleur([g[k * 4 + 1], g[k * 4 + 2], g[k * 4 + 3]].map(function (v) { return Math.min(1, v); })) + '"' + (op < 1 ? ' stop-opacity="' + n3(op) + '"' : '') + '/>';
    }
    if (it.t === 2) {
      var r = Math.hypot(e[0] - s[0], e[1] - s[1]);
      var h = nombre(it.h, f, 0) / 100, ang = (nombre(it.a, f, 0) + Math.atan2(e[1] - s[1], e[0] - s[0]) * 180 / Math.PI) * Math.PI / 180;
      var hl = Math.max(-0.99, Math.min(0.99, h)) * r;
      ctx.defs.push('<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + n3(s[0]) + '" cy="' + n3(s[1]) + '" r="' + n3(r) + '" fx="' + n3(s[0] + Math.cos(ang) * hl) + '" fy="' + n3(s[1] + Math.sin(ang) * hl) + '">' + arrets + '</radialGradient>');
    } else {
      ctx.defs.push('<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + n3(s[0]) + '" y1="' + n3(s[1]) + '" x2="' + n3(e[0]) + '" y2="' + n3(e[1]) + '">' + arrets + '</linearGradient>');
    }
    return 'url(#' + id + ')';
  }

  function rendreArbre(arbre, f, ctx) {
    var html = '';
    arbre.forEach(function (x) {
      if (x.style) {
        var d = x.style.traces.map(enD).join('');
        if (d) html += '<path d="' + d + '"' + attributsTrace(x.style.it, f, ctx) + '/>';
      } else if (x.groupe) {
        var dedans = rendreArbre(x.groupe, f, ctx);
        if (dedans && x.o > 0) html += '<g transform="' + matriceSVG(x.m) + '"' + (x.o < 1 ? ' opacity="' + n3(x.o) + '"' : '') + '>' + dedans + '</g>';
      }
    });
    return html;
  }

  // --- Calques -------------------------------------------------------------------------------------------------------------
  var GRANDE = ' x="-100000" y="-100000" width="200000" height="200000"';

  function masques(calque, f, ctx) {
    var liste = (calque.masksProperties || []).filter(function (m) { return m && m.mode !== 'n'; });
    if (!liste.length) return null;
    var id = ctx.prefixe + 'm' + (ctx.compte++);
    var dedans = '';
    var premier = liste[0];
    if (premier.mode === 's' || premier.inv) dedans += '<rect fill="#fff"' + GRANDE + '/>';
    liste.forEach(function (m) {
      var blanc = m.mode !== 's';
      if (m.inv) blanc = !blanc;
      var o = nombre(m.o, f, 100) / 100;
      var d = enD(versSegments(valeur(m.pt, f, 'chemin')));
      if (d) dedans += '<path d="' + d + '" fill="' + (blanc ? '#fff' : '#000') + '"' + (o < 1 ? ' fill-opacity="' + n3(o) + '"' : '') + '/>';
    });
    ctx.defs.push('<mask id="' + id + '" maskUnits="userSpaceOnUse"' + GRANDE + '>' + dedans + '</mask>');
    return id;
  }

  /** Contenu d'un calque dans son propre repère (sans sa transformation). */
  function contenu(calque, f, anim, ctx, profondeur) {
    if (calque.ty === 4) return rendreArbre(arbreGroupe(calque.shapes || [], f, [], [], ctx), f, ctx);
    if (calque.ty === 1) return '<rect width="' + n3(calque.sw || 0) + '" height="' + n3(calque.sh || 0) + '" fill="' + (ctx.forcer || String(calque.sc || '#000000')) + '"/>';
    var actif = (anim.assets || []).filter(function (a) { return a.id === calque.refId; })[0];
    if (calque.ty === 2) {
      if (!actif || !/^data:/.test(String(actif.p || ''))) return '';
      return '<image href="' + String(actif.p).replace(/"/g, '%22') + '" width="' + n3(actif.w || 0) + '" height="' + n3(actif.h || 0) + '" preserveAspectRatio="none"/>';
    }
    if (calque.ty === 0 && actif && Array.isArray(actif.layers) && profondeur < 16) {
      var fe = calque.tm ? nombre(calque.tm, f, 0) * (anim.fr || 30) : (f - (calque.st || 0)) / (calque.sr || 1);
      var clip = ctx.prefixe + 'c' + (ctx.compte++);
      ctx.defs.push('<clipPath id="' + clip + '"><rect width="' + n3(calque.w || anim.w || 0) + '" height="' + n3(calque.h || anim.h || 0) + '"/></clipPath>');
      return '<g clip-path="url(#' + clip + ')">' + composition(actif.layers, fe, anim, ctx, profondeur + 1) + '</g>';
    }
    return '';
  }

  /** Calques d'une composition à l'image f : du dernier (dessous) au premier (dessus) ; parents, masques et caches. */
  function composition(calques, f, anim, ctx, profondeur) {
    var parInd = {};
    calques.forEach(function (c) { if (c && c.ind !== undefined) parInd[c.ind] = c; });
    var memo = new Map();
    var monde = function (c, garde) {
      if (memo.has(c)) return memo.get(c);
      var t = transformation(c.ks, f);
      var m = t.m;
      var p = c.parent !== undefined ? parInd[c.parent] : null;
      if (p && p !== c && garde < 32) m = multiplier(monde(p, garde + 1).m, m);
      var r = { m: m, o: t.o };
      memo.set(c, r);
      return r;
    };
    var html = '';
    for (var i = calques.length - 1; i >= 0; i--) {
      var c = calques[i];
      if (!c || c.hd || c.td || c.ty === 3 || c.ty === 5 || c.ty > 5) continue;
      if (!(f >= (c.ip || 0) && f < (c.op === undefined ? Infinity : c.op))) continue;
      var w = monde(c, 0);
      if (w.o <= 0) continue;
      var corps = contenu(c, f, anim, ctx, profondeur);
      if (!corps) continue;
      var m = masques(c, f, ctx);
      if (m) corps = '<g mask="url(#' + m + ')">' + corps + '</g>';
      var bloc = '<g transform="' + matriceSVG(w.m) + '"' + (w.o < 1 ? ' opacity="' + n3(w.o) + '"' : '') + '>' + corps + '</g>';
      // Cache (tt) : le calque source est celui de tp (format récent), sinon celui juste au-dessus (td).
      if (c.tt && c.tt !== 4) {
        var source = c.tp !== undefined ? parInd[c.tp] : calques[i - 1];
        if (source && f >= (source.ip || 0) && f < (source.op === undefined ? Infinity : source.op)) {
          var ws = monde(source, 0);
          var forcer = c.tt === 1 ? '#fff' : c.tt === 2 ? '#000' : null;
          var avant = ctx.forcer;
          ctx.forcer = forcer;
          var dessin = contenu(source, f, anim, ctx, profondeur);
          ctx.forcer = avant;
          var id = ctx.prefixe + 'm' + (ctx.compte++);
          ctx.defs.push('<mask id="' + id + '" maskUnits="userSpaceOnUse"' + GRANDE + '>' + (c.tt === 2 ? '<rect fill="#fff"' + GRANDE + '/>' : '') +
            '<g transform="' + matriceSVG(ws.m) + '"' + (ws.o < 1 ? ' opacity="' + n3(ws.o) + '"' : '') + '>' + dessin + '</g></mask>');
          bloc = '<g mask="url(#' + id + ')">' + bloc + '</g>';
        } else if (c.tt === 1 || c.tt === 3) continue;
      }
      html += bloc;
    }
    return html;
  }

  function svgLottie(anim, image, prefixe) {
    var f = (anim.ip || 0) + (image || 0);
    var ctx = { prefixe: (prefixe || 'pmL') + '-', compte: 0, defs: [], forcer: null };
    var corps = composition(anim.layers || [], f, anim, ctx, 0);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n3(anim.w || 0) + ' ' + n3(anim.h || 0) + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="display: block; overflow: hidden">' +
      (ctx.defs.length ? '<defs>' + ctx.defs.join('') + '</defs>' : '') + corps + '</svg>';
  }

  function imageLottie(anim, local, options) {
    var o = options || {};
    var vitesse = typeof o.vitesse === 'number' && o.vitesse > 0 ? o.vitesse : 1;
    var total = Math.max(0, (anim.op || 0) - (anim.ip || 0));
    if (!(total > 0)) return 0;
    var fr = anim.fr || 30;
    var image = Math.max(0, local) * fr * vitesse;
    if (o.boucle) image = image % total;
    else image = Math.min(image, total - 0.01);
    return Math.round(image * 10000) / 10000;
  }

  // --- Analyse (import, contrôle) ------------------------------------------------------------------------------------------
  var NON_PRIS = { rp: 'répéteur', rd: 'coins arrondis', mm: 'fusion de tracés', op: 'décalage de tracé', tw: 'torsion', pb: 'gonflement', zz: 'zigzag', ms: 'fusion de formes' };

  function analyserLottie(anim) {
    var r = { ips: anim.fr || 0, images: Math.max(0, (anim.op || 0) - (anim.ip || 0)), largeur: anim.w || 0, hauteur: anim.h || 0,
      couleurs: [], expressions: false, textes: 0, imagesExternes: [], nonPris: [] };
    r.duree = r.ips ? Math.round(r.images / r.ips * 1000) / 1000 : 0;
    var couleurs = {}, nonPris = {};
    var noter = function (c) { var h = couleur(c); couleurs[h] = (couleurs[h] || 0) + 1; };
    var noterValeur = function (p) {
      if (!p || p.k === undefined) return;
      if (anime(p)) p.k.forEach(function (k) { if (Array.isArray(k.s)) noter(k.s); if (Array.isArray(k.e)) noter(k.e); });
      else if (Array.isArray(p.k)) noter(p.k);
    };
    var visiter = function (x) {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(visiter); return; }
      if (typeof x.x === 'string' && x.k !== undefined) r.expressions = true;
      if ((x.ty === 'fl' || x.ty === 'st') && x.c) noterValeur(x.c);
      if (NON_PRIS[x.ty]) nonPris[NON_PRIS[x.ty]] = 1;
      if (x.ty === 'tm' && x.m === 2) nonPris['tracés tronqués à la suite'] = 1;
      Object.keys(x).forEach(function (k) { if (x[k] && typeof x[k] === 'object') visiter(x[k]); });
    };
    var calques = function (liste) {
      (liste || []).forEach(function (c) {
        if (!c) return;
        if (c.ty === 5) r.textes++;
        if (c.ty === 1 && c.sc) { var h = String(c.sc).toLowerCase(); couleurs[h] = (couleurs[h] || 0) + 1; }
        if (c.ddd) nonPris['calques 3D'] = 1;
        if (c.bm) nonPris['modes de fusion'] = 1;
        if (Array.isArray(c.ef) && c.ef.length) nonPris['effets de calque'] = 1;
        if (c.ao) nonPris['orientation automatique'] = 1;
        if (c.tt === 4) nonPris['cache de luminance inversé'] = 1;
        (c.masksProperties || []).forEach(function (m) { if (m && (m.mode === 'i' || m.mode === 'l' || m.mode === 'd' || m.mode === 'f')) nonPris['masques en intersection ou en différence'] = 1; });
        visiter(c);
      });
    };
    calques(anim.layers);
    (anim.assets || []).forEach(function (a) {
      if (!a) return;
      if (Array.isArray(a.layers)) calques(a.layers);
      else if (a.p !== undefined && !/^data:/.test(String(a.p))) r.imagesExternes.push(String(a.u || '') + String(a.p));
    });
    if (anim.ddd) nonPris['calques 3D'] = 1;
    r.couleurs = Object.keys(couleurs).sort(function (a, b) { return couleurs[b] - couleurs[a] || (a < b ? -1 : 1); });
    r.nonPris = Object.keys(nonPris).sort();
    return r;
  }

  // --- Page ----------------------------------------------------------------------------------------------------------------
  function demarrerLotties() {
    var M = racine.M;
    var liste = [];
    var scenes = {};
    (M.minutage ? M.minutage.scenes : []).forEach(function (s) { scenes[s.id] = s; });
    var rang = 0;
    document.querySelectorAll('#pm-scene > section[data-scene] [data-lottie]').forEach(function (el) {
      var sec = el.closest('section[data-scene]');
      var id = sec.getAttribute('data-scene');
      var info = scenes[id];
      var bloc = document.getElementById(el.getAttribute('data-lottie'));
      if (!info || !bloc) return;
      var anim;
      try { anim = JSON.parse(bloc.textContent); } catch (e) { console.warn('[Pulse Motion] animation Lottie illisible dans la scène « ' + id + ' »'); return; }
      var base = info.debut;
      var elements = (M.minutage.elements && M.minutage.elements[id]) || {};
      for (var p = el; p && p !== sec; p = p.parentNode) {
        var cle = p.getAttribute && p.getAttribute('data-pm-cle');
        if (cle && elements[cle]) { base = elements[cle].debut; break; }
      }
      var vitesse = parseFloat(el.getAttribute('data-lottie-vitesse') || '1');
      liste.push({ el: el, id: id, anim: anim, base: base, rythme: info.rythme || 1, prefixe: 'pmL' + (rang++),
        options: { vitesse: vitesse > 0 ? vitesse : 1, boucle: el.getAttribute('data-lottie-boucle') === 'oui' }, derniere: null });
    });
    if (!liste.length) return;
    function poser(t) {
      var visibles = M.scenesVisibles(M.minutage, t);
      liste.forEach(function (x) {
        if (visibles.indexOf(x.id) < 0 && x.derniere !== null) return;
        var image = imageLottie(x.anim, (M.tempsVuPar(x.el, t) - x.base) * x.rythme, x.options);
        if (image === x.derniere) return;
        x.el.innerHTML = svgLottie(x.anim, image, x.prefixe);
        x.derniere = image;
      });
    }
    M.surRendu(poser);
    poser(M.temps());
  }

  return { imageLottie: imageLottie, svgLottie: svgLottie, analyserLottie: analyserLottie, valeur: valeur, couleurHex: couleur, demarrerLotties: demarrerLotties };
});
