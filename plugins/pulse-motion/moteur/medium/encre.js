/* Pulse Motion – encre d'un style dessiné (spec Styles et réalisation, 5.13 : contrat d'encre avec le calque de S7).
 *
 * Module d'un style (5.10 point 3) : inclus par l'assemblage seulement si identite.modules du style contient « encre »
 * (tableau-blanc, tableau-noir). Le calque SVG de S7 garde ses nœuds, ses boîtes et ses étiquettes HTML ; ce module
 * redessine l'encre des traits, à chaque image, à partir de M.dessin.traces (reçues par M.dessin.encreStyle), dans un canevas
 * posé juste après chaque calque (même conteneur, même place, il suit la caméra), où les fusions sont permises :
 *   - feutre (--pm-encre: feutre, par défaut) : encre à 0,94 en multiply (deux traits qui se croisent foncent), cœur du
 *     trait un peu plus clair (destination-out), comme un vrai feutre ;
 *   - craie (--pm-encre: craie) : le trait est peint dans une couche, puis le grain du tableau décide quels grains prennent
 *     la craie (destination-in avec un grain tiré de la graine de la scène, fixe sur le tableau) ; 2 à 5 grains de poussière
 *     au lever du trait.
 * Les sections sans data-encre reçoivent data-encre="style" (l'encre du style vaut pour toute la vidéo) ; data-encre="svg"
 * la refuse. Repli : si le canevas manque (navigateur sans canevas) ou si le dessin échoue, le canevas est effacé et
 * l'erreur remonte au calque, qui rend l'encre au SVG (opaque à 0,94, sans fusion) pour cette scène.
 * Déterminisme : tout vient des tracés de l'image et de graines (nom de la scène, clé du tracé) ; jamais Math.random.
 * Idée et chiffres (opacité 0,94, multiply, grain de la craie par destination-in) : lemo-opuscar, whiteboard et chalkboard
 * (MIT, © 2026 LemoLab), réécrits pour le calque de Pulse Motion. Navigateur seulement ; dépend de dessin/calque (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  if (!M.dessin || !M.dessin.encreStyle || typeof document === 'undefined') return;
  var NS = 'http://www.w3.org/2000/svg';
  var LONGUEURS_MAX = 4000;
  var OPACITE = 0.94;
  var etat = { scenes: {}, longueurs: new Map(), mesureur: null };

  // L'encre du style vaut pour chaque scène de la vidéo, sauf refus explicite (data-encre="svg").
  document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) {
    if (!s.hasAttribute('data-encre')) s.setAttribute('data-encre', 'style');
  });

  // --- Graines ----------------------------------------------------------------------------------------------------------

  function hacher(texte) {
    var h = 0x811c9dc5;
    for (var i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function alea(graine) {
    var a = graine | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- Mesure des chemins (part tracée d'un trait) ----------------------------------------------------------------------

  function mesureur() {
    if (etat.mesureur) return etat.mesureur;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    var p = document.createElementNS(NS, 'path');
    svg.appendChild(p);
    document.body.appendChild(svg);
    etat.mesureur = p;
    return p;
  }
  /** Longueur d'un chemin et son point d'arrivée (cqh), gardés par chemin. */
  function mesure(d) {
    var m = etat.longueurs.get(d);
    if (m) return m;
    var p = mesureur();
    p.setAttribute('d', d);
    var l = 0, fin = null;
    try { l = p.getTotalLength(); var q = p.getPointAtLength(l); fin = [q.x, q.y]; } catch (e) { l = 0; }
    if (etat.longueurs.size >= LONGUEURS_MAX) etat.longueurs.clear();
    m = { l: l, fin: fin };
    etat.longueurs.set(d, m);
    return m;
  }

  // --- Canevas d'une scène ----------------------------------------------------------------------------------------------

  function sceneDe(id) {
    var sc = etat.scenes[id];
    if (sc) return sc;
    var sec = null;
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) { if (s.getAttribute('data-scene') === id) sec = s; });
    if (!sec) throw new Error('section introuvable');
    var mode = getComputedStyle(sec).getPropertyValue('--pm-encre').trim();
    sc = etat.scenes[id] = { id: id, sec: sec, mode: mode === 'craie' ? 'craie' : 'feutre', canevas: {}, grain: null, couche: null };
    return sc;
  }

  function canevasDe(sc, nom) {
    var svg = sc.sec.querySelector('svg.pm-calque[data-calque="' + nom + '"]');
    if (!svg) return null;
    var c = sc.canevas[nom];
    if (!c || !c.el.isConnected) {
      var el = document.createElement('canvas');
      el.className = 'pm-encre';
      el.setAttribute('data-calque', nom);
      el.setAttribute('aria-hidden', 'true');
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      if (!el.getContext || !el.getContext('2d')) throw new Error('canevas indisponible');
      // Même plan que son calque (au-dessus du contenu, ou dessous pour le surlignage).
      el.style.zIndex = getComputedStyle(svg).zIndex;
      c = sc.canevas[nom] = { el: el, ctx: el.getContext('2d'), svg: svg };
    }
    // Juste après son calque : sous les étiquettes HTML, au-dessus de ce que le calque recouvre.
    if (c.el.previousSibling !== svg) svg.parentNode.insertBefore(c.el, svg.nextSibling);
    ['left', 'top', 'width', 'height'].forEach(function (k) { if (c.el.style[k] !== svg.style[k]) c.el.style[k] = svg.style[k]; });
    return c;
  }

  /** Taille en pixels du canevas : L × 100 cqh à la taille de la section (sans les transformations), au plus 2 px par pixel. */
  function dimensionner(sc, c, L) {
    var k = sc.sec.clientHeight / 100;
    var dpr = Math.max(1, Math.min(2, racine.devicePixelRatio || 1));
    var w = Math.max(1, Math.round(L * k * dpr)), h = Math.max(1, Math.round(100 * k * dpr));
    if (c.el.width !== w) c.el.width = w;
    if (c.el.height !== h) c.el.height = h;
    c.echelle = k * dpr;
    return c;
  }

  function effacer(c) {
    c.ctx.setTransform(1, 0, 0, 1, 0, 0);
    c.ctx.globalCompositeOperation = 'source-over';
    c.ctx.globalAlpha = 1;
    c.ctx.clearRect(0, 0, c.el.width, c.el.height);
  }

  // --- Grain du tableau (craie) -----------------------------------------------------------------------------------------

  /** Grain fixe du tableau, tiré de la graine de la scène : cellules de 2 px, 18 % sans craie, les autres de 0,45 à 1. */
  function grainDe(sc, w, h) {
    if (sc.grain && sc.grain.width === w && sc.grain.height === h) return sc.grain;
    var g = document.createElement('canvas');
    g.width = w; g.height = h;
    var ctx = g.getContext('2d');
    var img = ctx.createImageData(w, h);
    var hasard = alea(hacher('craie|' + sc.id));
    var cellule = 2;
    var lignes = Math.ceil(h / cellule), colonnes = Math.ceil(w / cellule);
    for (var j = 0; j < lignes; j++) {
      for (var i = 0; i < colonnes; i++) {
        var r = hasard();
        var a = r < 0.18 ? 0 : Math.round(255 * (0.45 + 0.55 * hasard()));
        for (var y = j * cellule; y < Math.min(h, (j + 1) * cellule); y++) {
          for (var x = i * cellule; x < Math.min(w, (i + 1) * cellule); x++) {
            var o = (y * w + x) * 4;
            img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = a;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    sc.grain = g;
    return g;
  }
  function coucheDe(sc, w, h) {
    if (!sc.couche || sc.couche.width !== w || sc.couche.height !== h) {
      sc.couche = document.createElement('canvas');
      sc.couche.width = w; sc.couche.height = h;
    }
    return sc.couche;
  }

  // --- Dessin d'un tracé ------------------------------------------------------------------------------------------------

  function transformation(ctx, t) {
    if (t.transform) {
      var m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)(?:\s*rotate\(\s*(-?[\d.]+)\s*\))?/.exec(t.transform);
      if (m) { ctx.translate(Number(m[1]), Number(m[2])); if (m[3]) ctx.rotate(Number(m[3]) * Math.PI / 180); }
    }
    if (t.origine && t.echelle) { ctx.translate(t.origine[0], t.origine[1]); ctx.scale(t.echelle, t.echelle); }
  }

  /** Tirets de la part tracée (et du pointillé) d'un trait de longueur l. */
  function tirets(t, l) {
    var part = t.part >= 0.999 ? 1 : Math.max(0, t.part);
    if (!t.pointille) return part >= 1 ? [] : [part * l, l + 1];
    var plein = Math.max(0.2, t.epaisseur * 1.6), vide = Math.max(0.3, t.epaisseur * 2.2);
    var total = part * l, r = [], fait = 0;
    while (fait < total && r.length < 2000) { var s = Math.min(plein, total - fait); r.push(s, vide); fait += s + vide; }
    if (r.length) r[r.length - 1] = l + 1;
    return r.length ? r : [0, l + 1];
  }

  function tracer(ctx, t, o) {
    if (!(t.part > 0) || !(t.opacite > 0) || !t.d) return;
    var echelle = t.echelle || 1;
    ctx.save();
    transformation(ctx, t);
    var chemin = new Path2D(t.d);
    ctx.globalAlpha = Math.min(1, t.opacite) * o.opacite;
    if (t.remplissage) {
      ctx.fillStyle = t.couleur;
      ctx.fill(chemin);
      ctx.restore();
      return;
    }
    var m = mesure(t.d);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = t.couleur;
    ctx.lineWidth = Math.max(0.05, t.epaisseur * o.largeur) / echelle;
    ctx.setLineDash(tirets(t, m.l));
    ctx.stroke(chemin);
    if (o.coeur && t.epaisseur >= 0.3) {
      // Cœur du feutre : un peu moins d'encre au milieu du trait.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.1 * Math.min(1, t.opacite);
      ctx.lineWidth = t.epaisseur * 0.35 / echelle;
      ctx.stroke(chemin);
    }
    ctx.restore();
  }

  /** Poussière de craie au lever du trait : 2 à 5 grains près de l'arrivée, tirés de la clé du tracé. */
  function poussiere(ctx, t, fin) {
    var hasard = alea(hacher('poussiere|' + t.cle));
    var n = 2 + Math.floor(hasard() * 4);
    ctx.save();
    ctx.fillStyle = t.couleur;
    for (var i = 0; i < n; i++) {
      var a = hasard() * Math.PI * 2, r = 0.4 + hasard() * 1.4, rayon = 0.08 + hasard() * 0.12;
      ctx.globalAlpha = (0.35 + 0.35 * hasard()) * Math.min(1, t.opacite);
      ctx.beginPath();
      ctx.arc(fin[0] + Math.cos(a) * r, fin[1] + Math.sin(a) * r + 0.3, rayon, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Peintre ----------------------------------------------------------------------------------------------------------

  function peindreCalque(sc, c, traces, L) {
    dimensionner(sc, c, L);
    effacer(c);
    if (!traces.length) return;
    var k = c.echelle;
    if (sc.mode === 'craie') {
      var couche = coucheDe(sc, c.el.width, c.el.height);
      var cc = couche.getContext('2d');
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalCompositeOperation = 'source-over';
      cc.globalAlpha = 1;
      cc.clearRect(0, 0, couche.width, couche.height);
      cc.setTransform(k, 0, 0, k, 0, 0);
      traces.forEach(function (t) { tracer(cc, t, { opacite: 0.92, largeur: 1.05 }); });
      // Le grain du tableau décide quels grains prennent la craie.
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalAlpha = 1;
      cc.globalCompositeOperation = 'destination-in';
      cc.drawImage(grainDe(sc, couche.width, couche.height), 0, 0);
      cc.globalCompositeOperation = 'source-over';
      c.ctx.drawImage(couche, 0, 0);
      c.ctx.setTransform(k, 0, 0, k, 0, 0);
      traces.forEach(function (t) { if (!t.remplissage && t.part >= 0.999 && !t.transform && !t.origine) { var m = mesure(t.d); if (m.fin) poussiere(c.ctx, t, m.fin); } });
      return;
    }
    c.ctx.setTransform(k, 0, 0, k, 0, 0);
    c.ctx.globalCompositeOperation = 'multiply';
    traces.forEach(function (t) { tracer(c.ctx, t, { opacite: OPACITE, largeur: 1, coeur: true }); });
    c.ctx.globalCompositeOperation = 'source-over';
  }

  function peindre(id, traces, o) {
    var sc = sceneDe(id);
    try {
      var L = (o && o.L) || 177.78;
      ['dessus', 'dessous'].forEach(function (nom) {
        var liste = traces.filter(function (t) { return (t.calque || 'dessus') === nom; });
        var c = canevasDe(sc, nom);
        if (!c) { if (liste.length) throw new Error('calque « ' + nom + ' » introuvable'); return; }
        peindreCalque(sc, c, liste, L);
      });
    } catch (e) {
      // Repli : rien ne reste dans les canevas ; le calque repeint l'encre dans son SVG.
      Object.keys(sc.canevas).forEach(function (nom) { try { effacer(sc.canevas[nom]); sc.canevas[nom].el.remove(); } catch (x) { /* déjà retiré */ } });
      sc.canevas = {};
      throw e;
    }
  }

  M.encre = { peindre: peindre, OPACITE: OPACITE };
  M.dessin.encreStyle(peindre);
})(typeof globalThis !== 'undefined' ? globalThis : this);
