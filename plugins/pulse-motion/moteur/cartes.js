/* Pulse Motion – cartes géographiques (spec S9, 5.10) : projections et liaisons, mêmes formules pour l'outil du mainteneur
 * (outils/cartes/preparer.js, qui fabrique cartes/*.json) et pour l'assemblage (repères, liaisons, cadres).
 *
 * projeter(carte, lon, lat) -> { x, y } : point en unités de la carte (boîte de 1 000 de large, y vers le bas), au dixième.
 *   carte.projection : { type: 'equal-earth' | 'conique-conforme' | 'equirectangulaire', …paramètres, k, x0, y0, dx, dy } ;
 *   carte.encarts : [{ code, lonlat: [lonO, latS, lonE, latN], projection }] (outre-mer de la carte de France) : un point
 *   qui tombe dans la boîte d'un encart est projeté par l'encart.
 * brut(projection, lon, lat) -> [X, Y] avant mise à l'échelle (outil : bornes et échelle).
 * arc(a, b, courbure = 0.25) -> d : courbe de Bézier quadratique de a vers b, bombée vers le haut de la carte de
 *   courbure × la distance (une liaison aérienne) ; points { x, y }.
 * boiteLonLat(carte, [lonO, latS, lonE, latN]) -> [x0, y0, x1, y1] : boîte projetée d'une zone (bords échantillonnés).
 * CADRES : boîtes nommées des cadres de continent (lon, lat), pour data-carte-cadre (europe, afrique, ameriques, asie, oceanie).
 * elargir(boite, part = 0.1) ; unir(boites) ; seCroisent(a, b) ; versCamera(boite, viewBox, ratio) -> { x, y, zoom } (centre en %
 *   de l'image et zoom conseillé, pour une carte qui couvre toute l'image).
 * contenu(carte) -> boîte de tout ce que la carte dessine (pays, territoires, cadres des encarts).
 * estVertical(ratio) : image plus haute que large (« 9:16 », « 4:5 »).
 * ajusterAuFormat(boite, ratio, limites) -> boîte étendue aux proportions de l'image (la carte remplit l'écran), gardée dans
 *   les limites de la carte quand elle y tient, sinon centrée sur elles.
 * decalagesVerticaux(carte) -> { code: [dx, dy] } : en vertical, les encarts d'outre-mer passent sous la métropole, en deux
 *   rangées centrées (au lieu d'une colonne à gauche) ; null sans encart.
 * deplacerChemin(d, dx, dy) : chemin de l'outil (M absolus, l relatifs) translaté.
 *
 * Module pur : chargé par Node (require) et dans la page (global M.cartes, groupe « cartes » du moteur à la carte), pour les
 * scripts de scène qui posent un point à des coordonnées.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.cartes = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RAD = Math.PI / 180;
  // Equal Earth (Šavrič, Patterson, Jenny, 2018).
  var A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
  var MEE = Math.sqrt(3) / 2;

  function dixieme(v) { return Math.round(v * 10) / 10; }

  function equalEarth(lon, lat, lon0) {
    var l = (lon - (lon0 || 0)) * RAD;
    var t = Math.asin(MEE * Math.sin(lat * RAD));
    var t2 = t * t, t6 = t2 * t2 * t2;
    var x = l * Math.cos(t) / (MEE * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
    var y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
    return [x, y];
  }

  /** Conique conforme de Lambert (sphère) : parallèles sécants p1, p2, origine lat0, méridien lon0 (degrés). */
  function coniqueConforme(lon, lat, p) {
    var f1 = p.p1 * RAD, f2 = p.p2 * RAD, f0 = p.lat0 * RAD;
    var tq = function (f) { return Math.tan(Math.PI / 4 + f / 2); };
    var n = f1 === f2 ? Math.sin(f1) : Math.log(Math.cos(f1) / Math.cos(f2)) / Math.log(tq(f2) / tq(f1));
    var F = Math.cos(f1) * Math.pow(tq(f1), n) / n;
    var rho = F / Math.pow(tq(lat * RAD), n);
    var rho0 = F / Math.pow(tq(f0), n);
    var th = n * (lon - p.lon0) * RAD;
    return [rho * Math.sin(th), rho0 - rho * Math.cos(th)];
  }

  function equirectangulaire(lon, lat, p) {
    return [(lon - p.lon0) * RAD * Math.cos(p.lat0 * RAD), (lat - p.lat0) * RAD];
  }

  function brut(projection, lon, lat) {
    var p = projection || {};
    if (p.type === 'equal-earth') return equalEarth(lon, lat, p.lon0);
    if (p.type === 'conique-conforme') return coniqueConforme(lon, lat, p);
    if (p.type === 'equirectangulaire') return equirectangulaire(lon, lat, p);
    throw new Error('projection inconnue : « ' + p.type + ' »');
  }

  /** Point projeté puis mis à l'échelle de la carte, sans arrondi. */
  function exact(projection, lon, lat) {
    var xy = brut(projection, lon, lat);
    return { x: (xy[0] - projection.x0) * projection.k + (projection.dx || 0), y: (projection.y0 - xy[1]) * projection.k + (projection.dy || 0) };
  }

  function dansBoite(b, lon, lat) { return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]; }

  /** Projection qui vaut pour ce point : celle d'un encart dont la boîte le contient, sinon celle de la carte. */
  function projectionPour(carte, lon, lat) {
    var encarts = (carte && carte.encarts) || [];
    for (var i = 0; i < encarts.length; i++) if (dansBoite(encarts[i].lonlat, lon, lat)) return encarts[i].projection;
    return carte.projection;
  }

  function projeter(carte, lon, lat) {
    var p = exact(projectionPour(carte, lon, lat), lon, lat);
    return { x: dixieme(p.x), y: dixieme(p.y) };
  }

  function arc(a, b, courbure) {
    var c = typeof courbure === 'number' && isFinite(courbure) ? courbure : 0.25;
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var vx = b.x - a.x, vy = b.y - a.y;
    // Perpendiculaire de longueur |ab| ; tournée vers le haut de la carte (y plus petit), à droite si la liaison est verticale.
    var px = vy, py = -vx;
    if (py > 0 || (py === 0 && px < 0)) { px = -px; py = -py; }
    var cx = mx + px * c, cy = my + py * c;
    return 'M' + dixieme(a.x) + ' ' + dixieme(a.y) + 'Q' + dixieme(cx) + ' ' + dixieme(cy) + ' ' + dixieme(b.x) + ' ' + dixieme(b.y);
  }

  // Cadres de continent : boîtes en degrés [ouest, sud, est, nord]. L'Europe s'arrête à l'Oural ; les Amériques vont de l'Alaska
  // au cap Horn ; l'Asie sans la Sibérie extrême-orientale au-delà de 150° E.
  var CADRES = {
    europe: [-25, 34, 45, 71.5],
    afrique: [-19, -36, 52, 38],
    ameriques: [-170, -56, -32, 72],
    asie: [25, -11, 150, 60],
    oceanie: [110, -48, 180, 2],
  };

  function boiteLonLat(carte, b) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var pas = 16;
    for (var i = 0; i <= pas; i++) {
      var f = i / pas;
      [[b[0] + (b[2] - b[0]) * f, b[1]], [b[0] + (b[2] - b[0]) * f, b[3]], [b[0], b[1] + (b[3] - b[1]) * f], [b[2], b[1] + (b[3] - b[1]) * f]].forEach(function (q) {
        var p = exact(carte.projection, q[0], q[1]);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      });
    }
    return [dixieme(x0), dixieme(y0), dixieme(x1), dixieme(y1)];
  }

  function elargir(b, part) {
    var q = typeof part === 'number' ? part : 0.1;
    var mx = (b[2] - b[0]) * q / 2, my = (b[3] - b[1]) * q / 2;
    return [dixieme(b[0] - mx), dixieme(b[1] - my), dixieme(b[2] + mx), dixieme(b[3] + my)];
  }

  function unir(boites) {
    var r = null;
    (boites || []).forEach(function (b) {
      if (!b) return;
      r = r ? [Math.min(r[0], b[0]), Math.min(r[1], b[1]), Math.max(r[2], b[2]), Math.max(r[3], b[3])] : b.slice();
    });
    return r;
  }

  function seCroisent(a, b) { return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]; }

  /**
   * Centre d'une boîte en % de l'image et zoom qui lui fait occuper 60 % de l'image, pour une carte (viewBox [x, y, l, h])
   * posée sur toute l'image du ratio donné (« 16:9 »), ajustée sans déformation (preserveAspectRatio meet).
   */
  function versCamera(boite, viewBox, ratio) {
    var r = String(ratio || '16:9').split(':');
    var L = Number(r[0]) || 16, H = Number(r[1]) || 9;
    var s = Math.min(L / viewBox[2], H / viewBox[3]);
    var ox = (L - viewBox[2] * s) / 2, oy = (H - viewBox[3] * s) / 2;
    var cx = ((boite[0] + boite[2]) / 2 - viewBox[0]) * s + ox;
    var cy = ((boite[1] + boite[3]) / 2 - viewBox[1]) * s + oy;
    var bl = Math.max(1e-6, (boite[2] - boite[0]) * s), bh = Math.max(1e-6, (boite[3] - boite[1]) * s);
    var zoom = Math.max(1, Math.min(6, Math.min(0.6 * L / bl, 0.6 * H / bh)));
    return { x: dixieme(cx / L * 100), y: dixieme(cy / H * 100), zoom: dixieme(zoom) };
  }

  function boiteDeChemin(d) {
    var b = [Infinity, Infinity, -Infinity, -Infinity], x = 0, y = 0, re = /([MlLmz])([^MlLmz]*)/g, m;
    while ((m = re.exec(d))) {
      if (m[1] === 'z') continue;
      var n = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
      for (var i = 0; i + 1 < n.length; i += 2) {
        if (m[1] === 'M' || m[1] === 'L') { x = n[i]; y = n[i + 1]; } else { x += n[i]; y += n[i + 1]; }
        b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
      }
    }
    return b;
  }

  function contenu(carte) {
    var boites = [];
    (carte.pays || []).concat(carte.autres || []).forEach(function (p) { boites.push(p.tout || boiteDeChemin(p.d)); });
    (carte.encarts || []).forEach(function (e) { boites.push(e.cadre); });
    var b = unir(boites) || [0, 0, carte.largeur, carte.hauteur];
    return b.map(dixieme);
  }

  function proportions(ratio) {
    var r = String(ratio || '16:9').split(':');
    var L = Number(r[0]), H = Number(r[1]);
    return L > 0 && H > 0 ? L / H : 16 / 9;
  }

  function estVertical(ratio) { return proportions(ratio) < 1; }

  /**
   * Intervalle [a, b] porté à la longueur n, centré sur lui, puis gardé dans [la, lb] s'il y tient (sinon centré dessus) ; le
   * milieu de [a, b] reste entre 30 % et 60 % du résultat (en vertical, le sujet reste hors des boutons des réseaux).
   */
  function etendre(a, b, n, la, lb) {
    if (n <= b - a) return [a, b];
    var c = (a + b) / 2, d = c - n / 2;
    if (n >= lb - la) d = (la + lb) / 2 - n / 2;
    else d = Math.min(Math.max(d, la), lb - n);
    d = Math.min(Math.max(d, c - 0.6 * n), c - 0.3 * n);
    return [d, d + n];
  }

  function ajusterAuFormat(boite, ratio, limites) {
    var a = proportions(ratio), l = boite[2] - boite[0], h = boite[3] - boite[1];
    var lim = limites || boite;
    var x = [boite[0], boite[2]], y = [boite[1], boite[3]];
    if (l / h > a) y = etendre(boite[1], boite[3], l / a, lim[1], lim[3]);
    else x = etendre(boite[0], boite[2], h * a, lim[0], lim[2]);
    return [x[0], y[0], x[1], y[1]].map(dixieme);
  }

  function decalagesVerticaux(carte) {
    var encarts = carte.encarts || [];
    if (!encarts.length) return null;
    var codes = {};
    encarts.forEach(function (e) { codes[e.code] = true; });
    var metro = unir((carte.pays || []).filter(function (p) { return !codes[p.code]; }).map(function (p) { return p.tout || boiteDeChemin(p.d); }));
    if (!metro) return null;
    // Espace entre deux encarts : celui de la colonne livrée (10 unités).
    var ecart = encarts.length > 1 ? Math.max(0, encarts[1].cadre[1] - encarts[0].cadre[3]) : 10;
    var parRangee = encarts.length <= 3 ? encarts.length : Math.ceil(encarts.length / 2);
    var cx = (metro[0] + metro[2]) / 2;
    var haut = metro[3] + 2 * ecart;
    var r = {};
    for (var debut = 0, rangee = 0; debut < encarts.length; debut += parRangee, rangee++) {
      var ligne = encarts.slice(debut, debut + parRangee);
      var largeur = ligne.reduce(function (t, e) { return t + e.cadre[2] - e.cadre[0]; }, 0) + ecart * (ligne.length - 1);
      var hauteur = Math.max.apply(null, ligne.map(function (e) { return e.cadre[3] - e.cadre[1]; }));
      var x = cx - largeur / 2;
      ligne.forEach(function (e) {
        r[e.code] = [dixieme(x - e.cadre[0]), dixieme(haut - e.cadre[1])];
        x += e.cadre[2] - e.cadre[0] + ecart;
      });
      haut += hauteur + ecart;
    }
    return r;
  }

  function deplacerChemin(d, dx, dy) {
    return String(d).replace(/([ML])\s*(-?(?:\d+\.?\d*|\.\d+))[\s,]*(-?(?:\d+\.?\d*|\.\d+))/g, function (t, c, x, y) {
      return c + dixieme(Number(x) + dx) + ' ' + dixieme(Number(y) + dy);
    });
  }

  return { projeter: projeter, brut: brut, arc: arc, boiteLonLat: boiteLonLat, CADRES: CADRES, elargir: elargir, unir: unir, seCroisent: seCroisent, versCamera: versCamera,
    contenu: contenu, estVertical: estVertical, ajusterAuFormat: ajusterAuFormat, decalagesVerticaux: decalagesVerticaux, deplacerChemin: deplacerChemin, boiteDeChemin: boiteDeChemin };
});
