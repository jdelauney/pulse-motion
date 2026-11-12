/* Pulse Motion – graphiques de données du calque de dessin (spec S7, 5.6) : nombres à la française, validation, mise en
 * place et temps. Tout en cqh. Les données viennent du déroulé (scenes[].graphiques.<clé>) :
 *   { type: 'barres' | 'barres-horizontales' | 'courbe' | 'secteurs' | 'anneau',
 *     valeurs: [{ etiquette: '2023', valeur: 19, debut: 'mot:2023', accent: true }], unite: '%', prefixe: '', source: '…',
 *     max: 40, decimales: 1 }
 *
 * TYPES ; MAX_BARRES (12) ; MAX_SECTEURS (6) ; TROU (0,55 : anneau).
 * nombreFr(v, decimales, langue?) -> « 1 250,5 » : espace fine insécable des milliers, virgule décimale, signe « − » ; dans une
 *   autre langue (étiquette, sinon celle de la page, M.donnees.langue, spec S9 5.1) : ses séparateurs (Intl), « 1,250.5 » en anglais.
 * texteValeur(v, g, decimales?, langue?) -> préfixe + nombre + espace insécable + unité (« 12 % », « 1 250 € ») ; « 12% » collé
 *   dans les langues qui ne séparent pas le pourcentage (règle unite-insecable-sauf-pourcent de moteur/langues.js).
 * decimalesDe(g, i?) -> décimales affichées : g.decimales, sinon celles de la valeur i (ou le plus grand nombre de décimales
 *   des valeurs), 3 au plus ; une valeur qui compte garde ses décimales.
 * pourcentages(g) -> [entiers] des parts d'un secteur (somme 100, plus forts restes).
 * texteSecteur(g, i) -> « Images 55 % » (étiquette et part) ; textes(g) -> { etiquettes, valeurs, source } finaux.
 * valider(g) -> [messages en français] (vide si valide) : règle graphique-donnees-invalides (valeur non numérique, liste
 *   vide, plus de 6 secteurs, plus de 12 barres, valeur négative de barre ou de secteur, courbe d'un seul point…).
 * melanger(a, b, p) -> hexadécimal ; palette({ accent, primaire, fond, texte }) -> 6 couleurs (accent, primaire, puis
 *   mélanges) ; couleursSeries(g, palette) -> couleur de chaque valeur (barres : accent pour la série, ou pour les valeurs
 *   « accent » et primaire pour les autres ; secteurs : la palette dans l'ordre, l'accent d'abord pour la valeur mise en avant).
 * disposer(g, boite, tailles) -> mise en place dans la boîte de la figure ({ x, y, l, h } : centre et taille), tailles :
 *   { etiquettes: [{ l, h }], valeurs: [{ l, h }], source: { l, h } | null } des textes mesurés. Barres : axe, barres
 *   (rectangle plein, depuis zéro), places des étiquettes et des valeurs ; courbe : axes, points, places ; secteurs : centre,
 *   rayon, trou, angles, places des étiquettes.
 * temps(g, debut, allure, tempsDe) -> instants (s de scène) : axe en 0,5 s ; barre en 0,9 s, la première 0,3 s après le début
 *   de l'axe, les suivantes décalées de 0,22 s, ou à son propre debut ; courbe en 1,6 s ; secteurs balayés en 1,2 s ; durées
 *   divisées par l'allure. tempsDe(v) résout un debut (« mot:2024 »).
 * coin(cx, cy, r, trou, a0, a1) -> points [x, y] du contour fermé d'un secteur (arc extérieur, puis intérieur ou centre).
 * Valeurs et logique de bars, lineChart, pie et number de engine/stage.js d'explainroo (MIT, © 2026 Vincent Schmalbach) ;
 * table et arrivée des axes au mot : styles/dataviz/STYLE.md de lemo (MIT), idées. Module pur : page (M.graphiques) et Node.
 */
(function (racine, fabrique) {
  var node = typeof module === 'object' && module.exports;
  var api = fabrique(function () { return racine.M && racine.M.donnees && racine.M.donnees.langue; },
    function () { return node ? require('../langues.js') : (racine.M && racine.M.langues) || null; });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.graphiques = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (langueDeLaPage, langues) {
  'use strict';
  var TYPES = ['barres', 'barres-horizontales', 'courbe', 'secteurs', 'anneau'];
  var MAX_BARRES = 12, MAX_SECTEURS = 6, TROU = 0.55;
  var FINE = ' ', INSECABLE = ' ';
  var CHAMPS = ['type', 'valeurs', 'unite', 'prefixe', 'source', 'max', 'decimales'];
  var CHAMPS_VALEUR = ['etiquette', 'valeur', 'debut', 'accent'];

  function r2(x) { return Math.round(x * 100) / 100; }
  function estSecteurs(type) { return type === 'secteurs' || type === 'anneau'; }

  function francais(l) { return !l || /^fr(-|$)/i.test(String(l)); }

  function nombreFr(v, decimales, langue) {
    var d = Math.max(0, Math.min(3, decimales | 0));
    var n = Number(v);
    if (!isFinite(n)) return '';
    var l = langue || langueDeLaPage();
    if (!francais(l)) {
      var t = new Intl.NumberFormat(l, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(n)).replace(/\u202f/g, INSECABLE);
      return (n < 0 && Number(Math.abs(n).toFixed(d)) !== 0 ? '−' : '') + t;
    }
    var s = Math.abs(n).toFixed(d);
    var parties = s.split('.');
    var entier = parties[0].replace(/\B(?=(\d{3})+(?!\d))/g, FINE);
    var nul = Number(s) === 0;
    return (n < 0 && !nul ? '−' : '') + entier + (parties[1] ? ',' + parties[1] : '');
  }

  function decimalesDe(g, rang) {
    if (g && typeof g.decimales === 'number') return Math.max(0, Math.min(3, Math.round(g.decimales)));
    var d = 0;
    var liste = (g && g.valeurs) || [];
    (rang === undefined ? liste : [liste[rang]]).forEach(function (x) {
      var v = x && x.valeur;
      if (typeof v !== 'number' || !isFinite(v)) return;
      var m = /\.(\d+)$/.exec(String(v));
      if (m) d = Math.max(d, Math.min(3, m[1].length));
    });
    return d;
  }

  function texteValeur(v, g, decimales, langue) {
    g = g || {};
    var dec = decimales === undefined ? decimalesDe(g) : decimales;
    var unite = typeof g.unite === 'string' ? g.unite.trim() : '';
    var l = langue || langueDeLaPage(), L = !francais(l) && langues();
    var colle = unite === '%' && L && L.de(l).typographie.indexOf('unite-insecable-sauf-pourcent') >= 0;
    return (typeof g.prefixe === 'string' ? g.prefixe : '') + nombreFr(v, dec, l) + (unite ? (colle ? '' : INSECABLE) + unite : '');
  }

  function pourcentages(g) {
    var vals = (g.valeurs || []).map(function (x) { return Math.max(0, Number(x.valeur) || 0); });
    var total = vals.reduce(function (a, b) { return a + b; }, 0) || 1;
    var bruts = vals.map(function (v) { return v / total * 100; });
    var entiers = bruts.map(Math.floor);
    var reste = 100 - entiers.reduce(function (a, b) { return a + b; }, 0);
    var ordre = bruts.map(function (b, i) { return [b - Math.floor(b), i]; }).sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    for (var k = 0; k < reste && k < ordre.length; k++) entiers[ordre[k][1]] += 1;
    return entiers;
  }

  function texteSecteur(g, i, langue) {
    var x = g.valeurs[i] || {};
    var part = texteValeur(pourcentages(g)[i], { unite: '%' }, 0, langue);
    return typeof x.etiquette === 'string' && x.etiquette.trim() ? x.etiquette.trim() + ' ' + part : part;
  }

  /** Textes finaux d'un graphique : étiquettes (secteurs : avec leur part), valeurs, source (langue : étiquette facultative). */
  function textes(g, langue) {
    var sect = estSecteurs(g.type);
    return {
      etiquettes: g.valeurs.map(function (x, i) { return sect ? texteSecteur(g, i, langue) : (typeof x.etiquette === 'string' ? x.etiquette : ''); }),
      valeurs: sect ? [] : g.valeurs.map(function (x, i) { return x.valeur === null ? '' : texteValeur(x.valeur, g, decimalesDe(g, i), langue); }),
      source: typeof g.source === 'string' && g.source.trim() ? g.source.trim() : null,
    };
  }

  function valider(g) {
    var err = [];
    if (!g || typeof g !== 'object' || Array.isArray(g)) return ['doit être un objet { "type": "barres", "valeurs": [{ "etiquette": "2024", "valeur": 19 }] }.'];
    Object.keys(g).forEach(function (k) { if (CHAMPS.indexOf(k) < 0) err.push('champ « ' + k + ' » inconnu (champs : ' + CHAMPS.join(', ') + ').'); });
    if (TYPES.indexOf(g.type) < 0) err.push('« type » doit être l\'un de : ' + TYPES.join(', ') + (g.type !== undefined ? ' (et non « ' + g.type + ' »)' : '') + '.');
    if (!Array.isArray(g.valeurs) || !g.valeurs.length) { err.push('« valeurs » est vide : donner au moins une valeur, ex. [{ "etiquette": "2024", "valeur": 19 }].'); return err; }
    var sect = estSecteurs(g.type);
    if (sect && g.valeurs.length > MAX_SECTEURS) err.push(g.valeurs.length + ' secteurs : au plus ' + MAX_SECTEURS + ' (regrouper les plus petits en « Autres »).');
    if ((g.type === 'barres' || g.type === 'barres-horizontales') && g.valeurs.length > MAX_BARRES) err.push(g.valeurs.length + ' barres : au plus ' + MAX_BARRES + ' (garder les plus parlantes, ou une courbe pour une évolution).');
    if (g.type === 'courbe' && g.valeurs.length < 2) err.push('une courbe a besoin d\'au moins deux valeurs.');
    g.valeurs.forEach(function (x, i) {
      var n = 'la valeur n° ' + (i + 1);
      if (!x || typeof x !== 'object' || Array.isArray(x)) { err.push(n + ' doit être un objet { "etiquette": "…", "valeur": 12 }.'); return; }
      Object.keys(x).forEach(function (k) { if (CHAMPS_VALEUR.indexOf(k) < 0) err.push(n + ' : champ « ' + k + ' » inconnu (champs : ' + CHAMPS_VALEUR.join(', ') + ').'); });
      var v = x.valeur;
      var inconnue = v === null && !sect;
      if (!inconnue && !(typeof v === 'number' && isFinite(v))) err.push(n + (x.etiquette ? ' (« ' + x.etiquette + ' »)' : '') + ' n\'est pas un nombre : « ' + (v === undefined ? 'absente' : String(v)) + ' » (écrire 1250.5, sans espace ni unité ; null pour une valeur inconnue d\'une barre ou d\'une courbe).');
      else if (!inconnue && v < 0 && g.type !== 'courbe') err.push(n + ' est négative (' + String(v).replace('.', ',') + ') : barres et secteurs partent de zéro ; une évolution qui descend sous zéro se montre en courbe.');
      else if (sect && v === 0) err.push(n + ' vaut 0 : un secteur vide ne se dessine pas, le retirer.');
      if (x.etiquette !== undefined && typeof x.etiquette !== 'string') err.push(n + ' : « etiquette » doit être un texte.');
      if (x.debut !== undefined && typeof x.debut !== 'string' && typeof x.debut !== 'number') err.push(n + ' : « debut » doit être un instant (« mot:2024 », 1.5).');
      if (x.accent !== undefined && typeof x.accent !== 'boolean') err.push(n + ' : « accent » vaut true ou false.');
    });
    if (g.max !== undefined && !(typeof g.max === 'number' && g.max > 0)) err.push('« max » doit être un nombre positif (le haut de l\'échelle ; les barres partent toujours de zéro).');
    if (g.decimales !== undefined && !(typeof g.decimales === 'number' && g.decimales >= 0 && g.decimales <= 3 && Math.round(g.decimales) === g.decimales)) err.push('« decimales » doit être un entier de 0 à 3.');
    ['unite', 'prefixe', 'source'].forEach(function (k) { if (g[k] !== undefined && typeof g[k] !== 'string') err.push('« ' + k + ' » doit être un texte.'); });
    return err;
  }

  // --- Couleurs -------------------------------------------------------------------------------------------------------

  function rvb(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function melanger(a, b, p) {
    var x = rvb(a), y = rvb(b);
    if (!x) return a;
    if (!y) return a;
    var c = x.map(function (v, i) { return Math.round(v * p + y[i] * (1 - p)); });
    return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function palette(c) {
    return [c.accent, c.primaire, melanger(c.primaire, c.fond, 0.55), melanger(c.accent, c.fond, 0.55), melanger(c.texte, c.fond, 0.6), melanger(c.primaire, c.accent, 0.5)];
  }
  function couleursSeries(g, pal) {
    var marquees = g.valeurs.some(function (x) { return x.accent === true; });
    if (!estSecteurs(g.type)) return g.valeurs.map(function (x) { return !marquees || x.accent === true ? pal[0] : pal[1]; });
    var reste = pal.slice(marquees ? 1 : 0);
    var k = 0;
    return g.valeurs.map(function (x) { return marquees && x.accent === true ? pal[0] : reste[(k++) % reste.length]; });
  }

  // --- Mise en place --------------------------------------------------------------------------------------------------

  function maxi(liste, cle) { return liste.reduce(function (m, t) { return Math.max(m, (t && t[cle]) || 0); }, 0); }

  function disposer(g, b, tailles) {
    tailles = tailles || {};
    var et = tailles.etiquettes || [], va = tailles.valeurs || [], so = tailles.source;
    var x0 = b.x - b.l / 2, x1 = b.x + b.l / 2, haut = b.y - b.h / 2, bas = b.y + b.h / 2;
    var src = so ? { x: b.x, y: bas - so.h / 2 } : null;
    var basUtile = so ? bas - so.h - 1.2 : bas;
    var n = g.valeurs.length;
    var nombres = g.valeurs.map(function (x) { return typeof x.valeur === 'number' ? x.valeur : null; });
    var connus = nombres.filter(function (v) { return v !== null; });
    var plusGrand = connus.length ? Math.max.apply(null, connus) : 1;
    if (g.type === 'barres') {
      var hEt = maxi(et, 'h'), hVa = maxi(va, 'h');
      var base = basUtile - (hEt ? hEt + 1.2 : 0);
      var plafond = haut + (hVa ? hVa + 1 : 0);
      var hp = Math.max(1, base - plafond);
      var echelle = Math.max(g.max || 0, plusGrand * 1.12) || 1;
      var slot = b.l / n, bw = slot * 0.64;
      var moyenne = connus.length ? connus.reduce(function (a, v) { return a + v; }, 0) / connus.length : echelle / 2;
      return { type: g.type, axe: { a: [r2(x0 - 1), r2(base)], b: [r2(x1 + 1), r2(base)] }, source: src, echelle: echelle,
        barres: nombres.map(function (v, i) {
          var cx = x0 + slot * (i + 0.5), bh = (v === null ? moyenne : v) / echelle * hp;
          return { cx: r2(cx), l: r2(bw), base: r2(base), h: r2(bh), inconnue: v === null };
        }),
        etiquettes: nombres.map(function (v, i) { var t = et[i] || { h: 0 }; return { x: r2(x0 + slot * (i + 0.5)), y: r2(base + 1.2 + t.h / 2) }; }),
        valeur: function (i, part) { var bar = this.barres[i], t = va[i] || { h: 0 }; return { x: bar.cx, y: r2(bar.base - bar.h * part - 1 - t.h / 2) }; } };
    }
    if (g.type === 'barres-horizontales') {
      var lEt = maxi(et, 'l'), lVa = maxi(va, 'l');
      var gauche = x0 + (lEt ? lEt + 1.6 : 0), droite = x1 - (lVa ? lVa + 1.2 : 0);
      var lp = Math.max(1, droite - gauche);
      var ech = Math.max(g.max || 0, plusGrand * 1.06) || 1;
      var rang = (basUtile - haut) / n, bh2 = rang * 0.64;
      var moy = connus.length ? connus.reduce(function (a, v) { return a + v; }, 0) / connus.length : ech / 2;
      return { type: g.type, axe: { a: [r2(gauche), r2(haut - 0.6)], b: [r2(gauche), r2(basUtile + 0.6)] }, source: src, echelle: ech,
        barres: nombres.map(function (v, i) {
          var cy = haut + rang * (i + 0.5);
          return { cy: r2(cy), h: r2(bh2), base: r2(gauche), l: r2((v === null ? moy : v) / ech * lp), inconnue: v === null };
        }),
        etiquettes: nombres.map(function (v, i) { var t = et[i] || { l: 0 }; return { x: r2(gauche - 1.6 - t.l / 2), y: r2(haut + rang * (i + 0.5)) }; }),
        valeur: function (i, part) { var bar = this.barres[i], t = va[i] || { l: 0 }; return { x: r2(bar.base + bar.l * part + 1.2 + t.l / 2), y: bar.cy }; } };
    }
    if (g.type === 'courbe') {
      var hEt2 = maxi(et, 'h'), hVa2 = maxi(va, 'h'), lVa2 = maxi(va, 'l');
      var base2 = basUtile - (hEt2 ? hEt2 + 1.2 : 0);
      var plafond2 = haut + (hVa2 ? hVa2 + 1.6 : 0);
      var marge = Math.max(2, lVa2 / 2);
      var gx = x0 + marge, dx = x1 - marge;
      var bas2 = connus.length ? Math.min(0, Math.min.apply(null, connus)) : 0;
      var hautEchelle = Math.max(g.max || 0, plusGrand > 0 ? plusGrand * 1.1 : 1);
      var etendue = (hautEchelle - bas2) || 1;
      var hp2 = Math.max(1, base2 - plafond2);
      var points = nombres.map(function (v, i) {
        var px = n > 1 ? gx + (dx - gx) * i / (n - 1) : (gx + dx) / 2;
        return v === null ? null : [r2(px), r2(base2 - (v - bas2) / etendue * hp2)];
      });
      var zero = r2(base2 - (0 - bas2) / etendue * hp2);
      return { type: g.type, source: src, axes: [[r2(x0), r2(haut)], [r2(x0), r2(base2)], [r2(x1), r2(base2)]], base: r2(base2), haut: r2(plafond2), zero: zero, points: points,
        etiquettes: nombres.map(function (v, i) { var t = et[i] || { h: 0 }; var px = n > 1 ? gx + (dx - gx) * i / (n - 1) : (gx + dx) / 2; return { x: r2(px), y: r2(base2 + 1.2 + t.h / 2) }; }),
        valeur: function (i) { var p = this.points[i], t = va[i] || { h: 0 }; return p ? { x: p[0], y: r2(p[1] - 1.6 - t.h / 2) } : null; } };
    }
    // Secteurs et anneau.
    var lEt3 = maxi(et, 'l'), hEt3 = maxi(et, 'h');
    var hUtile = basUtile - haut;
    var rayon = Math.max(4, Math.min(hUtile / 2 - hEt3 - 2.4, b.l / 2 - lEt3 - 3.4));
    var cx3 = b.x, cy3 = haut + hUtile / 2;
    var total = connus.reduce(function (a, v) { return a + Math.max(0, v); }, 0) || 1;
    var a0 = -Math.PI / 2;
    var angles = nombres.map(function (v) { var plein = Math.max(0, v || 0) / total * Math.PI * 2; var r = [a0, a0 + plein]; a0 += plein; return r; });
    var decalage = rayon * 0.12 + 2.4;
    return { type: g.type, source: src, cx: r2(cx3), cy: r2(cy3), r: r2(rayon), trou: g.type === 'anneau' ? TROU : 0, angles: angles,
      etiquettes: angles.map(function (a, i) {
        var mid = (a[0] + a[1]) / 2, t = et[i] || { l: 0, h: 0 }, c = Math.cos(mid), s = Math.sin(mid);
        var px = cx3 + c * (rayon + decalage), py = cy3 + s * (rayon + decalage);
        if (c > 0.2) px += t.l / 2; else if (c < -0.2) px -= t.l / 2;
        if (s > 0.6) py += t.h / 2 * Math.min(1, s); else if (s < -0.6) py -= t.h / 2 * Math.min(1, -s);
        return { x: r2(px), y: r2(py) };
      }) };
  }

  function temps(g, debut, allure, tempsDe) {
    var A = allure > 0 ? allure : 1;
    var r = { axe: { debut: debut, duree: 0.5 / A }, etiquettes: { debut: debut, duree: 0.4 / A } };
    if (g.type === 'barres' || g.type === 'barres-horizontales') {
      r.barres = g.valeurs.map(function (x, i) { return { debut: x.debut !== undefined ? tempsDe(x.debut) : debut + 0.3 / A + i * 0.22 / A, duree: 0.9 / A }; });
    } else if (g.type === 'courbe') {
      // La courbe passe par chaque point à son debut s'il en a un, sinon elle se trace en 1,6 s.
      var n = g.valeurs.length;
      var ecart = 1.6 / A / Math.max(1, n - 1);
      var instants = [];
      var prec = debut + 0.15 / A;
      g.valeurs.forEach(function (x, i) {
        var t = x.debut !== undefined ? tempsDe(x.debut) : (i === 0 ? prec : prec + ecart);
        if (i && t < prec) t = prec;
        instants.push(t);
        prec = t;
      });
      r.points = instants;
      r.duree = 1.6 / A;
    } else r.balayage = { debut: debut + 0.15 / A, duree: 1.2 / A };
    return r;
  }

  function coin(cx, cy, r, trou, a0, a1) {
    var pas = Math.max(2, Math.ceil((a1 - a0) / 0.08));
    var pts = [];
    for (var i = 0; i <= pas; i++) { var a = a0 + (a1 - a0) * i / pas; pts.push([r2(cx + Math.cos(a) * r), r2(cy + Math.sin(a) * r)]); }
    if (trou > 0) {
      for (var j = pas; j >= 0; j--) { var b = a0 + (a1 - a0) * j / pas; pts.push([r2(cx + Math.cos(b) * r * trou), r2(cy + Math.sin(b) * r * trou)]); }
    } else pts.push([r2(cx), r2(cy)]);
    return pts;
  }

  return { TYPES: TYPES, MAX_BARRES: MAX_BARRES, MAX_SECTEURS: MAX_SECTEURS, TROU: TROU, nombreFr: nombreFr, texteValeur: texteValeur,
    decimalesDe: decimalesDe, pourcentages: pourcentages, texteSecteur: texteSecteur, textes: textes, valider: valider,
    melanger: melanger, palette: palette, couleursSeries: couleursSeries, disposer: disposer, temps: temps, coin: coin, estSecteurs: estSecteurs };
});
