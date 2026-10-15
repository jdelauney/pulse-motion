/* Pulse Motion – découpe d'une illustration SVG en pièces de personnage (dans la page : le SVG doit être rendu).
 *
 *   var a = M.decoupe.analyser(svg);                         // formes visibles, sélecteurs, boîtes, couleurs, refus
 *   var r = M.decoupe.decouper(svg, decoupe, gabarit);       // { partiel: { gabarit, couleurs, pieces, visage }, signalees, erreurs }
 *
 * Tout se calcule sur le SVG réellement rendu : styles calculés (classes, <style>), transformations cumulées
 * (getScreenCTM), couleurs des dégradés (premier arrêt). Chaque forme d'un os est recopiée avec sa géométrie, ses
 * couleurs et une matrice qui la ramène dans le repère « os debout » de l'os (pivot à l'origine, os vers +y ;
 * torse vers −y ; pied vers +x ; tête et bassin : centre à l'origine, sans rotation), à l'échelle du gabarit.
 * Couleurs regroupées en variables (--c1 = la plus grande surface…, ou le nom donné dans decoupe.couleurs).
 * Sélecteurs : « #id », ou chemin d'index « g3>path2 » (n-ième élément de ce nom parmi ses frères).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.decoupe = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEG = Math.PI / 180;
  var FORMES = ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'];
  var CACHES = ['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'style', 'title', 'desc', 'metadata'];
  var REFUSES = {
    text: 'du texte : le convertir en formes (Texte > Vectoriser, ou Objet en chemin)',
    image: 'une image : seules les formes vectorielles se découpent',
    foreignObject: 'un objet HTML : seules les formes vectorielles se découpent',
    use: 'une copie (« use ») : la convertir en formes (Édition > Cloner > Délier le clone, ou Objet > Décomposer)'
  };
  var GEOMETRIE = { path: ['d'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'],
    polygon: ['points'], polyline: ['points'], line: ['x1', 'y1', 'x2', 'y2'] };
  var LONGUEURS = { cuisse: 'cuisseAvant', tibia: 'tibiaAvant', pied: 'piedAvant', bras: 'brasAvant', avantBras: 'avantBrasAvant', colonne: 'torse' };

  function style(el) { return (el.ownerDocument && el.ownerDocument.defaultView || window).getComputedStyle(el); }
  function r(v, n) { var k = Math.pow(10, n === undefined ? 2 : n); return Math.round(v * k) / k + 0; }

  /* ---------- éléments ---------- */
  function selecteur(svg, el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    for (var e = el; e && e !== svg; e = e.parentNode) {
      var i = 1;
      for (var s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.localName === e.localName) i++;
      parts.unshift(e.localName + i);
    }
    return parts.join('>');
  }

  function element(svg, sel) {
    if (typeof sel !== 'string' || !sel) return null;
    if (sel.charAt(0) === '#') {
      var id = sel.slice(1), trouve = null;
      Array.prototype.some.call(svg.querySelectorAll('[id]'), function (e) { if (e.id === id) { trouve = e; return true; } return false; });
      return trouve;
    }
    var e = svg;
    var parts = sel.split('>');
    for (var i = 0; i < parts.length && e; i++) {
      var m = /^([A-Za-z][\w-]*?)(\d+)$/.exec(parts[i]);
      if (!m) return null;
      var k = 0, suivant = null;
      for (var c = e.firstElementChild; c; c = c.nextElementSibling) if (c.localName === m[1] && ++k === +m[2]) { suivant = c; break; }
      e = suivant;
    }
    return e;
  }

  function cache(svg, el) {
    for (var e = el; e && e !== svg; e = e.parentNode) if (CACHES.indexOf(e.localName) >= 0) return true;
    return false;
  }
  function visible(svg, el) {
    if (cache(svg, el)) return false;
    if (style(el).visibility === 'hidden') return false;
    for (var e = el; e && e !== svg.parentNode; e = e.parentNode) if (e.style && style(e).display === 'none') return false;
    return true;
  }
  /** Opacité cumulée de l'élément et de ses groupes. */
  function opaciteCumulee(svg, el) {
    var o = 1;
    for (var e = el; e && e !== svg.parentNode; e = e.parentNode) if (e.style) o *= parseFloat(style(e).opacity);
    return o;
  }
  /** Sans viewBox, la grille et les coordonnées seraient fausses dès qu'on agrandit le dessin : on le pose. */
  function normaliser(svg) {
    if (svg.getAttribute('viewBox')) return svg;
    var l = svg.width && svg.width.baseVal.value, h = svg.height && svg.height.baseVal.value;
    if (!(l > 0 && h > 0)) { var b = svg.getBBox(); l = b.x + b.width; h = b.y + b.height; }
    svg.setAttribute('viewBox', '0 0 ' + l + ' ' + h);
    return svg;
  }
  function heritage(svg, el, prop) {
    for (var e = el; e && e !== svg.parentNode; e = e.parentNode) {
      if (!e.style) continue;
      var v = style(e)[prop];
      if (v && v !== 'none') return true;
    }
    return false;
  }
  function calque(svg, el) {
    for (var a = el.parentNode; a && a !== svg; a = a.parentNode) {
      var n = a.getAttribute && (a.getAttribute('inkscape:label') || a.getAttribute('data-name') || a.id);
      if (n) return n;
    }
    return null;
  }

  /* ---------- géométrie ---------- */
  function matrice(svg, el) { return svg.getScreenCTM().inverse().multiply(el.getScreenCTM()); }
  function boite(svg, el) {
    var b = el.getBBox(), m = matrice(svg, el);
    var xs = [], ys = [];
    [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].forEach(function (p) {
      var q = new DOMPoint(p[0], p[1]).matrixTransform(m);
      xs.push(q.x); ys.push(q.y);
    });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return [x, y, Math.max.apply(null, xs) - x, Math.max.apply(null, ys) - y];
  }
  function centre(b) { return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }

  /* ---------- couleurs ---------- */
  function alpha(valeur) {
    var m = /rgba\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+[,\s/]+([\d.]+)/.exec(valeur || '');
    return m ? parseFloat(m[1]) : 1;
  }
  function hex(rgb) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb || '');
    if (!m || alpha(rgb) === 0) return null;
    return '#' + [m[1], m[2], m[3]].map(function (v) { var h = (+v).toString(16).toUpperCase(); return h.length < 2 ? '0' + h : h; }).join('');
  }
  function couleur(svg, valeur) {
    if (!valeur || valeur === 'none') return 'none';
    var u = /url\(["']?#([^"')]+)["']?\)/.exec(valeur);
    if (u) {
      var g = element(svg, '#' + u[1]), stop = null;
      // Inkscape : un dégradé peut emprunter ses arrêts à un autre (href / xlink:href).
      for (var n = 0; g && n < 8 && !(stop = g.querySelector('stop')); n++) {
        var ref = g.getAttribute('href') || g.getAttribute('xlink:href');
        g = ref && ref.charAt(0) === '#' ? element(svg, ref) : null;
      }
      return stop ? (hex(style(stop).stopColor) || 'none') : 'none';
    }
    return hex(valeur) || 'none';
  }

  /* ---------- analyse ---------- */
  function analyser(svg) {
    normaliser(svg);
    var formes = [], refuses = [], avertissements = [], n = 0;
    Array.prototype.forEach.call(svg.querySelectorAll('*'), function (el) {
      var tag = el.localName;
      if (!visible(svg, el)) return;
      var sel = selecteur(svg, el);
      if (REFUSES[tag]) { refuses.push({ selecteur: sel, type: tag, message: 'Forme « ' + sel + ' » : ' + REFUSES[tag] + '.' }); return; }
      if (FORMES.indexOf(tag) < 0) return;
      if (heritage(svg, el, 'filter')) refuses.push({ selecteur: sel, type: 'filtre', message: 'Forme « ' + sel + ' » : un filtre (flou, ombre portée…) : le retirer.' });
      if (heritage(svg, el, 'mask')) refuses.push({ selecteur: sel, type: 'masque', message: 'Forme « ' + sel + ' » : un masque : le retirer ou l\'appliquer (Objet > Masque > Retirer).' });
      if (heritage(svg, el, 'clipPath')) avertissements.push('Forme « ' + sel + ' » : une découpe (masque d\'écrêtage) sera ignorée : la forme sera dessinée entière.');
      var cs = style(el);
      formes.push({ n: ++n, selecteur: sel, id: el.id || null, calque: calque(svg, el), boite: boite(svg, el).map(function (v) { return r(v, 1); }),
        remplissage: couleur(svg, cs.fill), trait: couleur(svg, cs.stroke) });
    });
    var vb = svg.viewBox && svg.viewBox.baseVal;
    var viewBox = vb && vb.width ? [vb.x, vb.y, vb.width, vb.height] : [0, 0, svg.width.baseVal.value, svg.height.baseVal.value];
    return { viewBox: viewBox, formes: formes, refuses: refuses, avertissements: avertissements };
  }

  /* ---------- découpe ---------- */
  function feuilles(svg, el) {
    if (FORMES.indexOf(el.localName) >= 0) return visible(svg, el) ? [el] : [];
    return Array.prototype.filter.call(el.querySelectorAll(FORMES.join(',')), function (f) { return visible(svg, f); });
  }
  function dist(p, q) { return Math.hypot(q[0] - p[0], q[1] - p[1]); }

  /** Matrice qui ramène le repère du document dans le repère « os debout » de l'os. */
  function repere(nom, def, e) {
    var m = new DOMMatrix().scale(e);
    if (nom === 'tete' || nom === 'bassin') return m.translate(-def.centre[0], -def.centre[1]);
    var A = def.de, B = def.a, phi;
    if (/^pied/.test(nom)) phi = Math.atan2(B[1] - A[1], B[0] - A[0]) / DEG;
    else if (nom === 'torse') phi = -Math.atan2(A[0] - B[0], A[1] - B[1]) / DEG;
    else phi = -Math.atan2(B[0] - A[0], B[1] - A[1]) / DEG;
    return m.rotate(-phi).translate(-A[0], -A[1]);
  }

  /** Copie d'une forme : géométrie, matrice finale, couleurs calculées (variables posées plus tard). */
  function copie(svg, el, avant) {
    var cs = style(el);
    var m = avant.multiply(matrice(svg, el));
    var illisible = false;
    var attrs = GEOMETRIE[el.localName].map(function (a) {
      var v = el.getAttribute(a);
      if (v !== null && /['"&\\]/.test(v)) { illisible = true; return ''; }
      return v === null ? '' : ' ' + a + "='" + v.replace(/\s+/g, ' ').trim() + "'";
    }).join('');
    var b = boite(svg, el);
    var c = {
      tag: el.localName, attrs: attrs,
      matrice: [m.a, m.b, m.c, m.d, m.e, m.f].map(function (v) { return r(v, 4); }).join(' '),
      fill: couleur(svg, cs.fill), stroke: couleur(svg, cs.stroke),
      largeurTrait: parseFloat(cs.strokeWidth) || 0,
      opacite: opaciteCumulee(svg, el), opaciteFond: parseFloat(cs.fillOpacity) * alpha(cs.fill), opaciteTrait: parseFloat(cs.strokeOpacity) * alpha(cs.stroke),
      regle: cs.fillRule, aire: b[2] * b[3], illisible: illisible
    };
    if (c.largeurTrait <= 0) c.stroke = 'none';
    return c;
  }

  function texte(c, noms) {
    var s = '<' + c.tag + c.attrs + " transform='matrix(" + c.matrice + ")'";
    s += " fill='" + (c.fill === 'none' ? 'none' : 'var(--' + noms[c.fill] + ')') + "'";
    if (c.stroke !== 'none') s += " stroke='var(--" + noms[c.stroke] + ")' stroke-width='" + r(c.largeurTrait) + "'";
    if (c.opacite < 1) s += " opacity='" + r(c.opacite) + "'";
    if (c.opaciteFond < 1) s += " fill-opacity='" + r(c.opaciteFond) + "'";
    if (c.opaciteTrait < 1 && c.stroke !== 'none') s += " stroke-opacity='" + r(c.opaciteTrait) + "'";
    if (c.regle === 'evenodd') s += " fill-rule='evenodd'";
    return s + '/>';
  }

  function decouper(svg, d, gabarit) {
    normaliser(svg);
    var erreurs = [], utilises = new Set();
    var os = d.os || {};
    var e = 1;
    if (os.cuisseAvant && os.tibiaAvant) e = 136 / (dist(os.cuisseAvant.de, os.cuisseAvant.a) + dist(os.tibiaAvant.de, os.tibiaAvant.a));
    else if (os.torse) e = 82 / dist(os.torse.de, os.torse.a);

    // Gabarit en ligne : proportions du dessin, ramenées à l'échelle du gabarit standard.
    var g = JSON.parse(JSON.stringify(gabarit || {}));
    delete g.nom; delete g.description;
    Object.keys(LONGUEURS).forEach(function (k) { var o = os[LONGUEURS[k]]; if (o && o.de && o.a) g[k] = r(dist(o.de, o.a) * e); });
    if (os.torse) {
      g.baseTete = r(g.colonne + 2);
      if (os.brasAvant) {
        var u = [os.torse.a[0] - os.torse.de[0], os.torse.a[1] - os.torse.de[1]], lu = Math.hypot(u[0], u[1]);
        g.hauteurEpaules = r(((os.brasAvant.de[0] - os.torse.de[0]) * u[0] + (os.brasAvant.de[1] - os.torse.de[1]) * u[1]) / lu * e);
      }
    }

    function elementsDe(liste, ou) {
      var res = [];
      (liste || []).forEach(function (sel) {
        var el = element(svg, sel);
        if (!el) { erreurs.push('Forme « ' + sel + ' » introuvable (' + ou + ').'); return; }
        if (REFUSES[el.localName]) { erreurs.push('Forme « ' + sel + ' » (' + ou + ') : ' + REFUSES[el.localName] + '.'); return; }
        feuilles(svg, el).forEach(function (f) { res.push(f); });
      });
      return res;
    }

    var copies = {};
    var visage = null;
    var vd = d.visage, ct = os.tete && os.tete.centre;
    var elementsVisage = new Set();
    if (vd && !ct) erreurs.push('Visage : il faut l\'os « tete » et son « centre ».');
    if (vd && ct) {
      var yeux = (vd.yeux || []).map(function (y, i) {
        var blanc = elementsDe([y.blanc], 'œil ' + (i + 1)), pupille = elementsDe(y.pupille ? [y.pupille] : [], 'pupille ' + (i + 1));
        blanc.concat(pupille).forEach(function (f) { elementsVisage.add(f); });
        return { blanc: blanc, pupille: pupille };
      });
      var bouche = elementsDe(vd.bouche ? [vd.bouche] : [], 'bouche');
      bouche.forEach(function (f) { elementsVisage.add(f); });
      visage = { yeux: yeux, bouche: bouche };
    }

    Object.keys(os).forEach(function (nom) {
      var def = os[nom];
      var R = repere(nom, def, e);
      var bonnes = elementsDe(def.formes, 'os « ' + nom + ' »').filter(function (f) { return !elementsVisage.has(f); });
      bonnes.forEach(function (f) { if (utilises.has(f)) erreurs.push('Forme « ' + selecteur(svg, f) + ' » donnée à deux os.'); utilises.add(f); });
      copies[nom] = bonnes.map(function (f) {
        var c = copie(svg, f, R);
        if (c.illisible) erreurs.push('Forme « ' + selecteur(svg, f) + ' » : géométrie illisible (guillemet, « & » ou « \\ ») : la simplifier ou la réexporter.');
        return c;
      });
    });
    if (os.tete) {
      var bt = null;
      (os.tete.formes ? elementsDe(os.tete.formes, 'tête') : []).forEach(function (f) {
        var b = boite(svg, f);
        bt = bt ? [Math.min(bt[0], b[0]), 0, Math.max(bt[2], b[0] + b[2]), 0] : [b[0], 0, b[0] + b[2], 0];
      });
      g.tete = g.tete || {};
      if (bt) g.tete.rx = r((bt[2] - bt[0]) / 2 * e);
      // La tête se pose à baseTete + ry - 2 au-dessus du bassin (squelette) : ry ramène son centre là où il était.
      if (os.torse) g.tete.ry = r(Math.max(1, dist(os.torse.a, os.tete.centre) * e));
    }

    // Visage : un dessin d'œil (le premier), une position par œil, la bouche neutre.
    var copiesVisage = null;
    if (visage && visage.yeux.length) {
      var premier = visage.yeux[0];
      var cb = premier.blanc.length ? centre(boite(svg, premier.blanc[0])) : ct;
      var cp = premier.pupille.length ? centre(boite(svg, premier.pupille[0])) : cb;
      var bb = premier.blanc.length ? boite(svg, premier.blanc[0]) : [0, 0, 10, 10];
      copiesVisage = {
        blanc: premier.blanc.map(function (f) { return copie(svg, f, new DOMMatrix().scale(e).translate(-cb[0], -cb[1])); }),
        pupille: premier.pupille.map(function (f) { return copie(svg, f, new DOMMatrix().scale(e).translate(-cp[0], -cp[1])); }),
        positions: visage.yeux.map(function (y) {
          var c = y.blanc.length ? centre(boite(svg, y.blanc[0])) : ct;
          return [r((c[0] - ct[0]) * e), r((c[1] - ct[1]) * e)];
        }),
        course: r(bb[2] / 2 * e * 0.35), hauteur: r(bb[3] * e)
      };
      if (visage.bouche.length) {
        var bx = null;
        visage.bouche.forEach(function (f) { var b = boite(svg, f); bx = bx ? [Math.min(bx[0], b[0]), Math.min(bx[1], b[1]), Math.max(bx[2], b[0] + b[2]), Math.max(bx[3], b[1] + b[3])] : [b[0], b[1], b[0] + b[2], b[1] + b[3]]; });
        var cbo = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2];
        copiesVisage.bouche = visage.bouche.map(function (f) { return copie(svg, f, new DOMMatrix().scale(e).translate(-cbo[0], -cbo[1])); });
        copiesVisage.positionBouche = [r((cbo[0] - ct[0]) * e), r((cbo[1] - ct[1]) * e)];
      }
    } else if (visage && !visage.yeux.length && visage.bouche.length) erreurs.push('Visage : il faut au moins un œil pour un visage vivant.');

    // Couleurs : regroupées par surface décroissante ; noms donnés par decoupe.couleurs (#hex -> nom).
    var aires = {};
    function compter(c) { if (c.fill !== 'none') aires[c.fill] = (aires[c.fill] || 0) + c.aire; if (c.stroke !== 'none') aires[c.stroke] = (aires[c.stroke] || 0) + c.aire * 0.1; }
    Object.keys(copies).forEach(function (k) { copies[k].forEach(compter); });
    if (copiesVisage) ['blanc', 'pupille', 'bouche'].forEach(function (k) { (copiesVisage[k] || []).forEach(compter); });
    var alias = d.couleurs || {}, noms = {}, couleurs = {}, rang = 0;
    // Les nouvelles couleurs sont numérotées après les noms déjà pris (cN) : une couleur garde son nom d'une découpe à l'autre.
    Object.keys(alias).forEach(function (h) { var m = /^c(\d+)$/.exec(alias[h]); if (m) rang = Math.max(rang, +m[1]); });
    Object.keys(aires).sort(function (a, b) { return aires[b] - aires[a]; }).forEach(function (h) {
      var nom = alias[h] || alias[h.toLowerCase()] || ('c' + (++rang));
      while (couleurs[nom] !== undefined) nom = 'c' + (++rang);
      noms[h] = nom; couleurs[nom] = h;
    });

    var pieces = {};
    Object.keys(copies).forEach(function (k) { if (copies[k].length) pieces[k] = copies[k].map(function (c) { return texte(c, noms); }).join(''); });
    var partielVisage = null;
    if (copiesVisage) {
      partielVisage = {
        oeil: { blanc: copiesVisage.blanc.map(function (c) { return texte(c, noms); }).join(''), course: copiesVisage.course, hauteur: copiesVisage.hauteur },
        vue: { yeux: copiesVisage.positions, bouche: copiesVisage.positionBouche || [0, r(30 * e)] }
      };
      if (copiesVisage.pupille.length) partielVisage.oeil.pupille = copiesVisage.pupille.map(function (c) { return texte(c, noms); }).join('');
      partielVisage.bouche = copiesVisage.bouche ? copiesVisage.bouche.map(function (c) { return texte(c, noms); }).join('') : "<path d='M -8 0 L 8 0' stroke='#000000' stroke-width='3' fill='none'/>";
    }

    // Formes laissées de côté : ni dans un os, ni dans le visage, ni ignorées.
    var ignorees = new Set();
    (d.ignorer || []).forEach(function (sel) { var el = element(svg, sel); if (el) feuilles(svg, el).forEach(function (f) { ignorees.add(f); }); });
    var signalees = analyser(svg).formes.map(function (f) { return f.selecteur; }).filter(function (sel) {
      var el = element(svg, sel);
      return el && !utilises.has(el) && !elementsVisage.has(el) && !ignorees.has(el);
    });

    return { partiel: { gabarit: g, couleurs: couleurs, pieces: pieces, visage: partielVisage }, signalees: signalees, erreurs: erreurs, echelle: r(e, 4) };
  }


  /* ---------- édition de la découpe (atelier) ---------- */
  var CENTRES = ['tete', 'bassin'];
  function contient(svg, sel, el) { var c = element(svg, sel); return !!c && (c === el || c.contains(el)); }

  /** Où va cette forme : { type: 'os', nom } | { type: 'ignorer' } | { type: 'visage' } | null. */
  function proprietaire(decoupe, svg, el) {
    var v = decoupe.visage;
    if (v && ((v.yeux || []).some(function (y) { return contient(svg, y.blanc, el) || (y.pupille && contient(svg, y.pupille, el)); }) || (v.bouche && contient(svg, v.bouche, el)))) return { type: 'visage' };
    var os = decoupe.os || {};
    for (var n in os) if ((os[n].formes || []).some(function (s) { return contient(svg, s, el); })) return { type: 'os', nom: n };
    if ((decoupe.ignorer || []).some(function (s) { return contient(svg, s, el); })) return { type: 'ignorer' };
    return null;
  }

  /** Retire la forme el d'une liste de sélecteurs ; un groupe qui la contient est remplacé par ses autres formes. */
  function retirer(svg, liste, el) {
    var out = [];
    (liste || []).forEach(function (s) {
      var c = element(svg, s);
      if (!c || !(c === el || c.contains(el))) { out.push(s); return; }
      if (c === el) return;
      feuilles(svg, c).forEach(function (f) { if (f !== el) out.push(selecteur(svg, f)); });
    });
    return out;
  }

  /** Copie de la découpe où la forme el va à cible : un os (créé au besoin, pivots par défaut) ou 'ignorer'. */
  function reattribuer(decoupe, svg, el, cible) {
    var d = JSON.parse(JSON.stringify(decoupe));
    d.os = d.os || {};
    Object.keys(d.os).forEach(function (n) {
      d.os[n].formes = retirer(svg, d.os[n].formes, el);
      if (!d.os[n].formes.length) delete d.os[n];
    });
    d.ignorer = retirer(svg, d.ignorer, el);
    if (d.visage) {
      // Seule la forme cliquée quitte le visage : une pupille part seule ; un blanc emporte son œil (la pupille reste à ranger).
      d.visage.yeux = (d.visage.yeux || []).filter(function (y) { return !contient(svg, y.blanc, el); });
      d.visage.yeux.forEach(function (y) { if (y.pupille && contient(svg, y.pupille, el)) delete y.pupille; });
      if (d.visage.bouche && contient(svg, d.visage.bouche, el)) delete d.visage.bouche;
      if (!d.visage.yeux.length) {
        // Plus d'œil : plus de visage vivant ; la bouche reste dessinée, dans la tête.
        if (d.visage.bouche && d.os.tete) d.os.tete.formes.push(d.visage.bouche);
        delete d.visage;
      }
    }
    var sel = selecteur(svg, el);
    if (cible === 'ignorer') d.ignorer.push(sel);
    else {
      if (!d.os[cible]) {
        var b = boite(svg, el);
        d.os[cible] = CENTRES.indexOf(cible) >= 0 ? { formes: [], centre: [r(b[0] + b[2] / 2, 1), r(b[1] + b[3] / 2, 1)] }
          : { formes: [], de: [r(b[0] + b[2] / 2, 1), r(b[1], 1)], a: [r(b[0] + b[2] / 2, 1), r(b[1] + b[3], 1)] };
      }
      d.os[cible].formes.push(sel);
    }
    if (!d.ignorer.length) delete d.ignorer;
    return d;
  }

  return { analyser: analyser, decouper: decouper, normaliser: normaliser, proprietaire: proprietaire, reattribuer: reattribuer, boite: boite, feuilles: feuilles, element: element, selecteur: selecteur, repere: repere, REFUSES: REFUSES, FORMES: FORMES };
});
