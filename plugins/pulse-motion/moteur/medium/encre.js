/* Pulse Motion – encre d'un style dessiné (spec Styles et réalisation, 5.13 : contrat d'encre avec le calque de S7).
 *
 * Module d'un style (5.10 point 3) : inclus par l'assemblage seulement si identite.modules du style contient « encre »
 * (tableau-blanc, tableau-noir, crayon, riso). Le calque SVG de S7 garde ses nœuds, ses boîtes et ses étiquettes HTML ; ce module
 * redessine l'encre des traits, à chaque image, à partir de M.dessin.traces (reçues par M.dessin.encreStyle), dans un canevas
 * posé juste après chaque calque (même conteneur, même place, il suit la caméra), où les fusions sont permises :
 *   - feutre (--pm-encre: feutre, par défaut) : encre à 0,94 en multiply (deux traits qui se croisent foncent), cœur du
 *     trait un peu plus clair (destination-out), comme un vrai feutre ;
 *   - craie (--pm-encre: craie) : le trait est peint dans une couche, puis le grain du tableau décide quels grains prennent
 *     la craie (destination-in avec un grain tiré de la graine de la scène, fixe sur le tableau) ; 2 à 5 grains de poussière
 *     au lever du trait ;
 *   - cire (--pm-encre: cire, crayon gras, spec 5.15) : comme la craie, avec le grain du papier (plus de creux sans cire),
 *     un trait plus large, posé en multiply (deux crayons qui se croisent se mêlent) ;
 *   - riso (--pm-encre: riso, spec 5.15) : une couche par encre (une couleur), grain d'encre léger ; chaque couche est surimprimée en multiply, décalée de son calage (M.encre.decalage : 0,2 à 0,5 cqh tiré de la
 *     scène et de l'encre, constant dans le plan, rattrapé par l'élément [data-riso-calage] de la scène).
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
    sc = etat.scenes[id] = { id: id, sec: sec, mode: GRAINS[mode] ? mode : 'feutre', canevas: {}, grain: null, couche: null };
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

  // --- Grain du tableau (craie), du papier (cire), de l'encre (riso) ----------------------------------------------------

  // Par mode : part des cellules sans matière, opacité la plus faible des autres (de min à 1). Feutre : aucun grain.
  var GRAINS = { feutre: null, craie: { vide: 0.18, min: 0.45 }, cire: { vide: 0.3, min: 0.5 }, riso: { vide: 0.05, min: 0.7 } };

  /** Grain fixe de la surface, tiré de la graine de la scène : cellules de 2 px, une part sans matière, les autres de min à 1. */
  function grainDe(sc, w, h) {
    if (sc.grain && sc.grain.width === w && sc.grain.height === h) return sc.grain;
    var g = document.createElement('canvas');
    g.width = w; g.height = h;
    var ctx = g.getContext('2d');
    var img = ctx.createImageData(w, h);
    var p = GRAINS[sc.mode];
    var hasard = alea(hacher(sc.mode + '|' + sc.id));
    var cellule = 2;
    var lignes = Math.ceil(h / cellule), colonnes = Math.ceil(w / cellule);
    for (var j = 0; j < lignes; j++) {
      for (var i = 0; i < colonnes; i++) {
        var r = hasard();
        var a = r < p.vide ? 0 : Math.round(255 * (p.min + (1 - p.min) * hasard()));
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

  // --- Riso : encres, calage --------------------------------------------------------------------------------------------

  var normaliseur = null;
  /** Couleur sous une forme unique (#rrggbb, ou rgba(…)), pour reconnaître une même encre d'un tracé à l'autre. */
  function normaliser(couleur) {
    if (!normaliseur) normaliseur = document.createElement('canvas').getContext('2d');
    normaliseur.fillStyle = '#000';
    normaliseur.fillStyle = String(couleur || '#000');
    return normaliseur.fillStyle;
  }
  /** Rattrapage du calage (0 à 1) : la part écoulée (--p) du premier élément [data-riso-calage] de la scène, 0 sinon. */
  function calage(sec) {
    var el = sec && sec.querySelector('[data-riso-calage]');
    var p = el ? parseFloat(el.style.getPropertyValue('--p')) : 0;
    return isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
  }
  /** Décalage de calage d'une encre dans une scène, en cqh : 0,2 à 0,5 cqh dans une direction tirée de la scène et de
   *  l'encre, le même à chaque image du plan ; réduit d'autant que le calage est rattrapé. -> [dx, dy] */
  function decalage(sec, idScene, couleur) {
    var hasard = alea(hacher('calage|' + idScene + '|' + normaliser(couleur)));
    var a = hasard() * Math.PI * 2, r = (0.2 + 0.3 * hasard()) * (1 - calage(sec));
    return [Math.round(Math.cos(a) * r * 1000) / 1000, Math.round(Math.sin(a) * r * 1000) / 1000];
  }

  // --- Peintre ----------------------------------------------------------------------------------------------------------

  /** Couche de travail vidée, à la taille du canevas, mise à l'échelle k. */
  function coucheVide(sc, c, k) {
    var couche = coucheDe(sc, c.el.width, c.el.height);
    var cc = couche.getContext('2d');
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalCompositeOperation = 'source-over';
    cc.globalAlpha = 1;
    cc.clearRect(0, 0, couche.width, couche.height);
    cc.setTransform(k, 0, 0, k, 0, 0);
    return cc;
  }
  /** Le grain de la surface décide quels grains de la couche prennent la matière. */
  function grainer(sc, cc) {
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalAlpha = 1;
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(grainDe(sc, cc.canvas.width, cc.canvas.height), 0, 0);
    cc.globalCompositeOperation = 'source-over';
  }

  function peindreCalque(sc, c, traces, L) {
    dimensionner(sc, c, L);
    effacer(c);
    if (!traces.length) return;
    var k = c.echelle;
    var cc;
    if (sc.mode === 'craie') {
      cc = coucheVide(sc, c, k);
      traces.forEach(function (t) { tracer(cc, t, { opacite: 0.92, largeur: 1.05 }); });
      grainer(sc, cc);
      c.ctx.drawImage(cc.canvas, 0, 0);
      c.ctx.setTransform(k, 0, 0, k, 0, 0);
      traces.forEach(function (t) { if (!t.remplissage && t.part >= 0.999 && !t.transform && !t.origine) { var m = mesure(t.d); if (m.fin) poussiere(c.ctx, t, m.fin); } });
      return;
    }
    if (sc.mode === 'cire') {
      // Crayon gras : la cire ne prend que sur les bosses du papier ; deux crayons qui se croisent se mêlent.
      cc = coucheVide(sc, c, k);
      traces.forEach(function (t) { tracer(cc, t, { opacite: 0.95, largeur: 1.2 }); });
      grainer(sc, cc);
      c.ctx.globalCompositeOperation = 'multiply';
      c.ctx.drawImage(cc.canvas, 0, 0);
      c.ctx.globalCompositeOperation = 'source-over';
      return;
    }
    if (sc.mode === 'riso') {
      // Une couche par encre, dans l'ordre d'apparition des encres ; chacune surimprimée à son calage.
      var encres = [], groupes = {};
      traces.forEach(function (t) { var e = normaliser(t.couleur); if (!groupes[e]) { groupes[e] = []; encres.push(e); } groupes[e].push(t); });
      encres.forEach(function (e) {
        cc = coucheVide(sc, c, k);
        groupes[e].forEach(function (t) { tracer(cc, t, { opacite: 1, largeur: 1 }); });
        grainer(sc, cc);
        var d = decalage(sc.sec, sc.id, e);
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.globalAlpha = 0.9;
        c.ctx.globalCompositeOperation = 'multiply';
        c.ctx.drawImage(cc.canvas, d[0] * k, d[1] * k);
      });
      c.ctx.globalAlpha = 1;
      c.ctx.globalCompositeOperation = 'source-over';
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

  M.encre = { peindre: peindre, OPACITE: OPACITE, decalage: decalage, normaliser: normaliser };
  M.dessin.encreStyle(peindre);
})(typeof globalThis !== 'undefined' ? globalThis : this);
