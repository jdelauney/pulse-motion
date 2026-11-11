/* Pulse Motion – isométrie (spec Styles et réalisation, 5.14), module d'un style (identite.modules : « iso ») avec sa
 * feuille iso.css. sx = (x − y)·cos 30°·k, sy = ((x + y)/2 − z)·k ; file triée (séparation des boîtes, puis profondeur
 * x + y + z) ; trois tons par face. Balisage : references/styles/iso-infographie.md. SVG produit avant M.demarrer, animé
 * par le moteur ; erreur : règle iso-invalide. Pur et déterministe (Node et page). Moteur isométrique de lemo-opuscar
 * (iso-infographic, MIT, © 2026 LemoLab), réécrit d'après la spec. */
(function (racine) {
  'use strict';
  var C30 = Math.cos(Math.PI / 6), K = 10, MARGE = 0.8;
  var FORMES = ['boite', 'prisme', 'cylindre', 'extruder', 'personne', 'isotype'];
  var ROLES = { primaire: 'var(--c-primaire-lisible)', accent: 'var(--c-accent-lisible)', texte: 'var(--c-texte)', fond: 'var(--c-fond)' };

  function r2(x) { var v = Math.round(x * 100) / 100; return v === 0 ? 0 : v; }
  function t(v) { return String(r2(v)); }
  function pt(p) { return t(p[0]) + ' ' + t(p[1]); }
  function ech(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function projeter(x, y, z, k) { k = k || K; return [(x - y) * C30 * k, ((x + y) / 2 - z) * k]; }
  function couleurDe(c) {
    if (c === undefined || c === null || c === '') return 'var(--iso-1, var(--c-primaire-lisible))';
    if (ROLES[c]) return ROLES[c];
    var m = /^iso([1-6])$/.exec(c);
    if (m) return 'var(--iso-' + m[1] + ')';
    return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(c) ? c.toLowerCase() : null;
  }

  function vue(n) { return n[0] + n[1] + n[2]; }
  function moy(pts) { var c = [0, 0, 0]; pts.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return c.map(function (v) { return v / pts.length; }); }
  function normale(p) {
    var n = [0, 0, 0];
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }
  function ton(n) { return n[2] / (Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1) > 0.75 ? 'dessus' : n[0] > n[1] ? 'ombre' : 'face'; }
  function convexe(polys) {
    var c = moy([].concat.apply([], polys));
    return polys.map(function (p) {
      var n = normale(p), m = moy(p);
      if (n[0] * (m[0] - c[0]) + n[1] * (m[1] - c[1]) + n[2] * (m[2] - c[2]) < 0) n = n.map(function (v) { return -v; });
      return vue(n) > 1e-9 ? { pts: p, ton: ton(n) } : null;
    }).filter(Boolean);
  }
  // Contour extrudé : murs visibles par profondeur, puis le dessus ; coupe : { arriere, avant }.
  function extrusion(ct, z, h, coupe) {
    var aire = 0, murs = [], dedans = [];
    ct.forEach(function (a, i) { var b = ct[(i + 1) % ct.length]; aire += a[0] * b[1] - b[0] * a[1]; });
    var s = aire >= 0 ? 1 : -1;
    ct.forEach(function (p, i) {
      var q = ct[(i + 1) % ct.length], n = [s * (q[1] - p[1]), -s * (q[0] - p[0]), 0];
      var f = { pts: [[p[0], p[1], z], [q[0], q[1], z], [q[0], q[1], z + h], [p[0], p[1], z + h]], prof: p[0] + q[0] + p[1] + q[1] };
      if (vue(n) > 1e-9) { f.ton = ton(n); murs.push(f); } else if (vue(n) < -1e-9) { f.ton = 'dedans'; dedans.push(f); }
    });
    var tri = function (a, b) { return a.prof - b.prof; };
    murs.sort(tri); dedans.sort(tri);
    var dessus = { pts: ct.map(function (c) { return [c[0], c[1], z + h]; }), ton: 'dessus' };
    if (coupe) return { arriere: [{ pts: ct.map(function (c) { return [c[0], c[1], z]; }), ton: 'dedans' }].concat(dedans), avant: murs.concat([dessus]) };
    return murs.concat([dessus]);
  }

  // Silhouette plate sans visage, debout sur s, 1,7 unité de haut.
  function silhouette(s, k) {
    var u = k / 10, X = s[0], Y = s[1];
    var p = function (dx, dy) { return t(X + dx * u) + ' ' + t(Y + dy * u); };
    var rond = function (cx, cy, rx, ry) { var a = 'A' + t(rx * u) + ' ' + t(ry * u) + ' 0 1 0 '; return 'M' + p(cx - rx, cy) + a + p(cx + rx, cy) + a + p(cx - rx, cy) + 'Z'; };
    return { pied: s, sol: rond(0, 0, 3.6, 1.9), tete: rond(0, -15.6, 2, 2),
      jambes: 'M' + p(-2.1, 0) + 'L' + p(-2.1, -6.4) + 'L' + p(2.1, -6.4) + 'L' + p(2.1, 0) + 'L' + p(0.4, 0) + 'L' + p(0, -3.6) + 'L' + p(-0.4, 0) + 'Z',
      corps: 'M' + p(-2.6, -6) + 'L' + p(-2.9, -12.4) + 'Q' + p(0, -14.2) + ' ' + p(2.9, -12.4) + 'L' + p(2.6, -6) + 'Z',
      points: [[X - 3.6 * u, Y + 1.9 * u], [X + 3.6 * u, Y - 17.6 * u]] };
  }

  // Morceaux projetés : [{ prof, ap (point d'appui), faces | figures, points, avant }].
  function morceaux(o, k, proj) {
    var nb = function (v, nom) { if (!isFinite(v) || typeof v !== 'number') throw new Error(nom + ' : nombre attendu'); return v; };
    var x = nb(o.x, 'x'), y = nb(o.y, 'y'), z = nb(o.z || 0, 'z'), b = o.biais || 0;
    // Boîte englobante [x0, y0, z0, x1, y1, z1] : celle des faces visibles (elles touchent les six bornes).
    var dessin = function (faces, prof, ap, avant) {
      var pts = [], bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
      return { prof: prof + b, ap: ap, avant: avant, points: pts, bb: bb, faces: faces.map(function (f) {
        return { ton: f.ton, d: f.pts.map(function (q, i) {
          for (var j = 0; j < 3; j++) { bb[j] = Math.min(bb[j], q[j]); bb[j + 3] = Math.max(bb[j + 3], q[j]); }
          var s = proj(q[0], q[1], q[2]); pts.push(s); return (i ? 'L' : 'M') + pt(s);
        }).join('') + 'Z' };
      }) };
    };
    var f = o.forme;
    if (f === 'boite' || f === 'extruder') {
      var ct, h = nb(o.h, 'hauteur');
      if (f === 'boite') {
        var l = nb(o.l, 'largeur'), p = nb(o.p, 'profondeur');
        if (l <= 0 || p <= 0 || h < 0) throw new Error('tailles positives');
        ct = [[x, y], [x + l, y], [x + l, y + p], [x, y + p]];
      } else {
        if (!Array.isArray(o.contour) || o.contour.length < 3) throw new Error('contour : 3 points au moins');
        ct = o.contour.map(function (c) { return [x + nb(c[0], 'contour'), y + nb(c[1], 'contour')]; });
      }
      var som = ct.map(function (c) { return c[0] + c[1]; }), mc = moy(ct.map(function (c) { return [c[0], c[1], z]; })), ap = proj(mc[0], mc[1], z);
      if (!o.coupe) return [dessin(extrusion(ct, z, h), mc[0] + mc[1] + z + h / 2, ap)];
      var e = extrusion(ct, z, h, true);
      return [dessin(e.arriere, Math.min.apply(null, som) + z, ap), dessin(e.avant, Math.max.apply(null, som) + z + h, ap, true)];
    }
    if (f === 'prisme') {
      var L = nb(o.l, 'largeur'), P = nb(o.p, 'profondeur'), H = nb(o.h, 'hauteur');
      if (L <= 0 || P <= 0 || H <= 0) throw new Error('tailles positives');
      // u le long du faîte, v en travers, w en hauteur.
      var Q = function (u, v, w) { return o.crete === 'y' ? [x + v * L, y + u * P, z + w * H] : [x + u * L, y + v * P, z + w * H]; };
      var polys = [[Q(0, 0, 0), Q(1, 0, 0), Q(1, 0.5, 1), Q(0, 0.5, 1)], [Q(0, 1, 0), Q(0, 0.5, 1), Q(1, 0.5, 1), Q(1, 1, 0)],
        [Q(1, 0, 0), Q(1, 0.5, 1), Q(1, 1, 0)], [Q(0, 0, 0), Q(0, 1, 0), Q(0, 0.5, 1)], [Q(0, 0, 0), Q(0, 1, 0), Q(1, 1, 0), Q(1, 0, 0)]];
      return [dessin(convexe(polys), x + L / 2 + y + P / 2 + z + H / 3, proj(x + L / 2, y + P / 2, z))];
    }
    if (f === 'cylindre') {
      var r = nb(o.r, 'rayon'), hc = nb(o.h, 'hauteur');
      if (r <= 0 || hc < 0) throw new Error('tailles positives');
      var hs = proj(x, y, z + hc), bs = proj(x, y, z), rx = r * k * Math.SQRT2 * C30, ry = r * k * Math.SQRT2 / 2, X = hs[0];
      var A = function (fl, p) { return 'A' + t(rx) + ' ' + t(ry) + ' 0 ' + fl + ' ' + pt(p); };
      var g = [X - rx, hs[1]], dr = [X + rx, hs[1]], av = [X, hs[1] + ry], gb = [X - rx, bs[1]], db = [X + rx, bs[1]], ab = [X, bs[1] + ry];
      var faces = hc > 0 ? [{ ton: 'face', d: 'M' + pt(g) + 'L' + pt(gb) + A('0 0', ab) + 'L' + pt(av) + A('0 1', g) + 'Z' },
        { ton: 'ombre', d: 'M' + pt(av) + 'L' + pt(ab) + A('0 0', db) + 'L' + pt(dr) + A('0 1', av) + 'Z' }] : [];
      faces.push({ ton: 'dessus', d: 'M' + pt(g) + A('1 0', dr) + A('1 0', g) + 'Z' });
      return [{ prof: x + y + z + hc / 2 + b, ap: bs, bb: [x - r, y - r, z, x + r, y + r, z + hc], faces: faces, points: [[X - rx, hs[1] - ry], [X + rx, bs[1] + ry]] }];
    }
    if (f === 'personne' || f === 'isotype') {
      var n = f === 'isotype' ? nb(o.n, 'nombre') : 1, pas = o.pas === undefined ? 0.8 : nb(o.pas, 'pas'), figs = [], pts = [];
      if (n < 1 || n > 40 || Math.round(n) !== n) throw new Error('nombre de silhouettes : entier de 1 à 40');
      for (var i = 0; i < n; i++) {
        var s = silhouette(proj(x + (o.axe === 'y' ? 0 : i * pas), y + (o.axe === 'y' ? i * pas : 0), z), k);
        figs.push(s); pts.push.apply(pts, s.points);
      }
      var lg = (n - 1) * pas;
      return [{ prof: x + y + z + 0.5 + b, ap: proj(x, y, z), figures: figs, points: pts, bb: [x - 0.2, y - 0.2, z, x + 0.2 + (o.axe === 'y' ? 0 : lg), y + 0.2 + (o.axe === 'y' ? lg : 0), z + 1.7] }];
    }
    throw new Error('forme « ' + f + ' » inconnue (formes : ' + FORMES.join(', ') + ')');
  }

  // A avant B s'il en est séparé derrière sur un axe (et pas l'inverse) ; sinon la plus petite profondeur.
  function trier(items) {
    var att = items.map(function () { return 0; }), suiv = items.map(function () { return []; }), reste = items.map(function (x, i) { return i; }), fait = [];
    var sep = function (a, b) { return a[3] <= b[0] + 1e-6 || a[4] <= b[1] + 1e-6 || a[5] <= b[2] + 1e-6; };
    items.forEach(function (A, i) {
      items.forEach(function (B, j) {
        if (j <= i || A.o.biais || B.o.biais || A.o === B.o) return;
        var ab = sep(A.bb, B.bb), ba = sep(B.bb, A.bb);
        if (ab !== ba) { suiv[ab ? i : j].push(ab ? j : i); att[ab ? j : i]++; }
      });
    });
    while (reste.length) {
      var libres = reste.filter(function (i) { return !att[i]; });
      var c = (libres.length ? libres : reste).reduce(function (m, i) { return items[i].prof < items[m].prof || (items[i].prof === items[m].prof && i < m) ? i : m; });
      fait.push(items[c]); reste.splice(reste.indexOf(c), 1);
      suiv[c].forEach(function (q) { att[q]--; });
    }
    return fait;
  }
  function attributs(a) {
    return Object.keys(a).filter(function (n) { return a[n] !== undefined && a[n] !== null; }).sort().map(function (n) { return ' ' + n + '="' + ech(a[n]) + '"'; }).join('');
  }

  // objets : [{ forme, x, y, z, l, p, h, r, contour, crete, n, pas, axe, couleur, biais, coupe, depuis, vers, dur, classes, attributs }] ;
  // options { k, ancres } -> { svg, largeur, hauteur, ancres (en %), erreurs }
  function svg(objets, options) {
    options = options || {};
    var k = options.k || K, marge = MARGE * k, erreurs = [], valides = [];
    var brut = function (x, y, z) { return projeter(x, y, z, k); };
    // Passe 1 : bornes ; passe 2 : origine du plan en (0, 0).
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var etendre = function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
    (objets || []).forEach(function (o, i) {
      try {
        var c = couleurDe(o.couleur);
        if (c === null) throw new Error('couleur « ' + o.couleur + ' » inconnue (primaire, accent, texte, iso1 … iso6, #rgb)');
        morceaux(o, k, brut).forEach(function (m) { m.points.forEach(etendre); });
        valides.push({ o: o, i: i, c: c });
      } catch (e) { erreurs.push({ index: i, message: e.message }); }
    });
    var ancres = options.ancres || [], bout = function (a, f, dz) { return f(a.point[0], a.point[1], a.point[2] + dz); };
    ancres.forEach(function (a) { etendre(bout(a, brut, 0)); etendre(bout(a, brut, a.fil || 0)); });
    if (x0 === Infinity) x0 = y0 = x1 = y1 = 0;
    var ox = x0 - marge, oy = y0 - marge, W = r2(x1 - x0 + 2 * marge), H = r2(y1 - y0 + 2 * marge);
    var proj = function (x, y, z) { var s = projeter(x, y, z, k); return [s[0] - ox, s[1] - oy]; };
    var items = [];
    valides.forEach(function (v) { morceaux(v.o, k, proj).forEach(function (m) { m.o = v.o; m.i = v.i; m.c = v.c; items.push(m); }); });
    var corps = trier(items).map(function (m) {
      var o = m.o, cl = ['iso-objet', 'iso-' + o.forme].concat(o.classes || []), st = '--iso-base:' + m.c, dep = proj(o.x, o.y, o.z || 0);
      var but = o.depuis || o.vers;
      if (but) {
        var c = proj(but[0], but[1], but[2]);
        st += ';--iso-dx:' + t(c[0] - dep[0]) + ';--iso-dy:' + t(c[1] - dep[1]);
        if (o.forme === 'personne') {
          cl.push('iso-marche');
          if (o.depuis) cl.push('iso-depuis');
          st += ';--iso-images:' + Math.max(1, Math.round((o.dur || 1) * 12)) + ';--iso-fois:' + Math.max(1, Math.round((o.dur || 1) * 3));
        } else cl.push(o.depuis ? 'iso-depuis' : 'iso-vers');
      }
      if (o.dur) st += ';--iso-dur:' + t(o.dur) + 's';
      st += ';transform-origin:' + t(m.ap[0]) + 'px ' + t(m.ap[1]) + 'px';
      var a = o.attributs || {};
      var at = attributs(m.avant ? { 'data-start': a['data-start'], 'data-dur': a['data-dur'] } : a), dedans;
      if (m.figures) {
        dedans = m.figures.map(function (s, j) {
          return '<g class="iso-un"' + (m.figures.length > 1 ? ' style="--i:' + j + ';transform-origin:' + t(s.pied[0]) + 'px ' + t(s.pied[1]) + 'px"' : '') +
            '><path class="iso-sol" d="' + s.sol + '"/><g class="iso-corps"><path class="iso-ombre" d="' + s.jambes + '"/><path class="iso-face" d="' + s.corps + '"/><path class="iso-tete" d="' + s.tete + '"/></g></g>';
        }).join('');
      } else {
        dedans = m.faces.map(function (f) { return '<path class="iso-' + f.ton + '" d="' + f.d + '"/>'; }).join('');
        if (m.avant) dedans = '<g class="iso-avant"' + attributs({ 'data-start': o.coupe.start, 'data-dur': t(o.coupe.dur || 0.8) }) + '>' + dedans + '</g>';
      }
      return '<g class="' + cl.join(' ') + '" style="' + st + '"' + at + '>' + dedans + '</g>';
    });
    ancres.forEach(function (a) {
      if (a.fil) corps.push('<path class="iso-fil" pathLength="1"' + attributs({ 'data-start': (a.attributs || {})['data-start'], 'data-dur': '0.4' }) + ' d="M' + pt(bout(a, proj, 0)) + 'L' + pt(bout(a, proj, a.fil)) + '"/>');
    });
    return { largeur: W, hauteur: H, erreurs: erreurs,
      svg: '<svg class="pm-iso" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t(W) + ' ' + t(H) + '">' + corps.join('') + '</svg>',
      ancres: ancres.map(function (a) { var p = bout(a, proj, a.fil || 0); return [r2(p[0] / (W || 1) * 100), r2(p[1] / (H || 1) * 100)]; }) };
  }

  function nombres(s, n, nom) {
    var v = String(s || '').trim().split(/[\s,;]+/).filter(Boolean).map(Number);
    if (v.length !== n || v.some(function (x) { return !isFinite(x); })) throw new Error(nom + ' : ' + (n > 1 ? n + ' nombres attendus' : 'un nombre attendu') + ' (« ' + s + ' »)');
    return v;
  }
  var COLONNES = { boite: 'x y z l p h', prisme: 'x y z l p h', cylindre: 'x y z r h', personne: 'x y z', isotype: 'x y z n' };

  // Description d'après les attributs (lire(nom) -> valeur ou null).
  function decrire(lire, noms) {
    var f = FORMES.filter(function (x) { return lire('data-iso-' + x) !== null; })[0];
    if (!f) throw new Error('aucune forme (data-iso-' + FORMES.join(', data-iso-') + ')');
    var o = { forme: f, attributs: {} }, lu = function (n, k) { return lire(n) !== null ? nombres(lire(n), k || 1, n) : [undefined]; };
    if (f === 'extruder') {
      var pts = String(lire('data-iso-extruder')).trim().split(/\s+/).map(function (p) { return p.split(',').map(Number); });
      if (pts.length < 3 || pts.some(function (p) { return p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1]); })) throw new Error('data-iso-extruder : contour « x,y x,y x,y … »');
      o.x = 0; o.y = 0; o.z = lu('data-iso-z')[0] || 0; o.h = lu('data-iso-h')[0]; o.contour = pts;
      if (o.h === undefined) o.h = 1;
    } else {
      var c = COLONNES[f], v = nombres(lire('data-iso-' + f), c.split(' ').length, 'data-iso-' + f + ' (« ' + c + ' »)');
      o.x = v[0]; o.y = v[1]; o.z = v[2];
      if (v.length === 6) { o.l = v[3]; o.p = v[4]; o.h = v[5]; }
      if (f === 'cylindre') { o.r = v[3]; o.h = v[4]; }
      if (f === 'isotype') o.n = v[3];
    }
    o.crete = lire('data-iso-crete') === 'y' ? 'y' : 'x';
    o.axe = lire('data-iso-axe') === 'y' ? 'y' : 'x';
    o.pas = lu('data-iso-pas')[0]; o.biais = lu('data-iso-biais')[0];
    if (lire('data-iso-depuis') !== null) o.depuis = lu('data-iso-depuis', 3);
    if (lire('data-iso-vers') !== null) o.vers = lu('data-iso-vers', 3);
    if (lire('data-iso-coupe') !== null) {
      if (f !== 'boite' && f !== 'extruder') throw new Error('data-iso-coupe : pour une boîte ou un contour extrudé');
      o.coupe = { start: lire('data-iso-coupe'), dur: lu('data-iso-coupe-dur')[0] || 0.8 };
    }
    if (lire('data-couleur') !== null) o.couleur = lire('data-couleur');
    if (/^\d*\.?\d+$/.test(lire('data-dur') || '')) o.dur = Number(lire('data-dur'));
    if (lire('class')) o.classes = lire('class').split(/\s+/).filter(Boolean);
    noms.forEach(function (n) { if (!/^(class|style|data-couleur|data-iso.*)$/.test(n)) o.attributs[n] = lire(n); });
    return o;
  }

  var ISO = { projeter: projeter, svg: svg, trier: trier, decrire: decrire, couleurDe: couleurDe, FORMES: FORMES, K: K };
  if (typeof module === 'object' && module.exports) { module.exports = ISO; return; }

  var M = racine.M = racine.M || {};
  M.iso = ISO;
  if (typeof document === 'undefined') return;
  var erreursIso = [];
  function signaler(el, message) {
    var s = el.closest('section[data-scene]'), id = s ? s.getAttribute('data-scene') : '';
    erreursIso.push({ regle: 'iso-invalide', scene: id, message: 'Scène « ' + id + ' » : isométrie' + (el.id ? ' (#' + el.id + ')' : '') + ' : ' + message + '.' });
  }
  // Les <i data-iso-…> deviennent le SVG du plan ; étiquettes posées en %.
  function preparerPlan(plan) {
    if (plan.hasAttribute('data-pm-iso')) return;
    plan.setAttribute('data-pm-iso', '');
    var objets = [], places = [], etiquettes = [], ancres = [];
    [].slice.call(plan.children).forEach(function (el) {
      var lire = function (n) { return el.getAttribute(n); };
      try {
        if (lire('data-iso-ancre') !== null) {
          ancres.push({ point: nombres(lire('data-iso-ancre'), 3, 'data-iso-ancre'), fil: Number(lire('data-iso-fil')) || 0, attributs: { 'data-start': lire('data-start') } });
          etiquettes.push(el);
        } else if (el.tagName === 'I' && FORMES.some(function (f) { return lire('data-iso-' + f) !== null; })) {
          objets.push(decrire(lire, [].map.call(el.attributes, function (a) { return a.name; })));
          places.push(el);
        }
      } catch (e) { signaler(el, e.message); if (el.tagName === 'I') el.remove(); }
    });
    var r = svg(objets, { ancres: ancres });
    r.erreurs.forEach(function (e) { signaler(places[e.index], e.message); });
    places.forEach(function (el) { el.remove(); });
    var g = document.createElement('template');
    g.innerHTML = r.svg;
    plan.insertBefore(g.content.firstChild, plan.firstChild);
    plan.style.setProperty('--iso-ratio', String(r2(r.largeur / (r.hauteur || 1))));
    plan.style.setProperty('--iso-w', String(r.largeur));
    etiquettes.forEach(function (el, i) {
      el.style.setProperty('--iso-ax', r.ancres[i][0] + '%');
      el.style.setProperty('--iso-ay', r.ancres[i][1] + '%');
      el.setAttribute('data-superpose', '');
    });
  }
  var demarrer = M.demarrer;
  if (typeof demarrer === 'function') {
    M.demarrer = function () {
      try {
        [].forEach.call(document.querySelectorAll('#pm-scene > section[data-scene] [data-iso]'), preparerPlan);
      } catch (e) { erreursIso.push({ regle: 'iso-invalide', message: 'Isométrie : ' + e.message + '.' }); }
      var r = demarrer.apply(this, arguments);
      if (erreursIso.length && Array.isArray(M.erreurs)) M.erreurs.push.apply(M.erreurs, erreursIso);
      return r;
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
