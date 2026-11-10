/* Pulse Motion – graphiques et code du calque de dessin (spec S7, 5.6 et 5.9), sur les points d'extension de calque.js.
 *
 *   <figure data-graphique="ventes" data-start="mot:ventes" style="width: 90cqh; height: 50cqh"></figure>
 *   <figure data-code="formule" data-start="1"></figure>
 *   M.dessin('s', function (d) { d.barres([12, 19, 27], { x: 88, y: 55, l: 80, h: 40, debut: 1 }); });
 *
 * L'assemblage (scripts/lib/donnees-scene.js) a posé dans la figure ses données (data-pm-graphique, data-pm-code) et ses
 * textes, tous tirés du déroulé : étiquettes, valeurs et source d'un graphique (<span class="pm-calque-texte"
 * data-texte="graphique:…" data-pm-role>), titre et jetons du code. Ici, tout est recalculé de t à chaque image.
 *
 * Graphique : la figure donne sa boîte (mesurée au relevé, sans la caméra) ; axe tracé en 0,5 s ; barres qui poussent en 0,9 s
 *   (la première 0,3 s après le début de l'axe, les suivantes décalées de 0,22 s, ou à leur debut), valeur qui compte avec la
 *   barre ; courbe qui se trace en 1,6 s (ou passe par chaque point à son debut), aire en dégradé (0,35 vers 0) après 60 %,
 *   points qui apparaissent avec un léger dépassement ; secteurs balayés en 1,2 s, étiquette « Images 55 % » quand le secteur
 *   est complet ; anneau : trou de 0,55. Hachures à main levée (--pm-trait: main) ; valeur inconnue (null) : contour pointillé.
 *   Durées divisées par l'allure (M.donnees.allure). Le relevé reçoit les boîtes des étiquettes (genre etiquette).
 * Code : jetons placés par --col et --ligne (grille à chasse fixe) ; d'une étape à l'autre en 0,8 s ÷ allure, les jetons
 *   communs glissent, les retirés s'effacent sur la première moitié, les nouveaux apparaissent sur la seconde ; la hauteur
 *   suit le nombre de lignes ; lignes surlignées (bande d'accent) relevées comme cadrage ; première apparition par lignes
 *   (0,12 s par ligne) ou par frappe (data-code-entree="frappe", paquets de la saisie de S6, M.paquetsSaisie). Ligne plus large
 *   que la fenêtre : règle code-trop-large (M.mesurerDessin).
 * d.barres(valeurs, o), d.courbe(valeurs, o), d.secteurs(valeurs, o) (o : x, y, l, h, debut, max, anneau, id) : les mêmes
 *   graphiques, sans textes, pour un dessin libre.
 * bars, lineChart, pie et number de engine/stage.js, codeMorphState de engine/code.js d'explainroo (MIT, © 2026 Vincent
 * Schmalbach) : adaptés en SVG et en DOM. Navigateur seulement ; dépend de dessin/calque, dessin/graphiques, dessin/code.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  if (!M.dessin || !M.dessin.composant) return;
  var G = M.graphiques, C = M.code;
  var NS = 'http://www.w3.org/2000/svg';
  var TAU = Math.PI * 2;

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function sortie(x) { x = clamp(x); return 1 - (1 - x) * (1 - x) * (1 - x); }
  function douce(x) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp(x)); }
  function inverseDouce(y) { return Math.acos(Math.max(-1, Math.min(1, 1 - 2 * clamp(y)))) / Math.PI; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function allure() { var a = M.donnees && Number(M.donnees.allure); return a > 0 ? a : 1; }
  function lireJson(el, nom) { try { return JSON.parse(el.getAttribute(nom) || 'null'); } catch (e) { return null; } }
  function propriete(n, nom, v) {
    var c = n.__pmp || (n.__pmp = {});
    if (c[nom] === v) return;
    c[nom] = v;
    if (v === null) n.style.removeProperty(nom); else n.style.setProperty(nom, v);
  }
  function texte(n, t) { if (n.__pmTexte !== t) { n.__pmTexte = t; n.textContent = t; } }
  function boiteDe(sc, el) {
    var faire = function (cadre) {
      var r = el.getBoundingClientRect(), k = 100 / (cadre.height || 1);
      return { x: (r.left + r.width / 2 - cadre.left) * k, y: (r.top + r.height / 2 - cadre.top) * k, l: r.width * k, h: r.height * k };
    };
    return sc.cadre && sc.cadre.mode === 'releve' && sc.cadreReleve ? faire(sc.cadreReleve) : M.avecSceneNeutre(sc.sec, faire);
  }
  function releverEtiquette(sc, cle, el, p, debut) {
    if (!el || !p) return;
    var t = el.__pmTaille || { l: 0, h: 0 };
    sc.cadre.boites.push({ cle: cle, id: null, genre: 'etiquette', debut: r2(debut), fin: r2((sc.info.fin - sc.info.debut) * sc.info.rythme), boite: { x: r2(p.x), y: r2(p.y), l: t.l, h: t.h }, forme: 'rect', nu: false });
  }

  // --- Graphiques ------------------------------------------------------------------------------------------------------

  function couleursDe(d, g) {
    var pal = G.palette({ accent: d.couleur('accent'), primaire: d.couleur('primaire'), fond: d.couleur('fond'), texte: d.couleur('texte') });
    return G.couleursSeries(g, pal);
  }
  function forme(O, sc, d, cle, debut, teinte, f, o) {
    var main = sc.trait === 'main';
    var spec = main ? { forme: f, plein: teinte, passes: 1 } : { forme: f, remplir: true };
    return O.tracer(sc, d, 'graphique', { id: cle, debut: debut, entree: (o && o.entree) || 'aucune', duree: o && o.duree, couleur: teinte, epaisseur: 0.3 }, { formes: [spec] });
  }
  function degrade(sc, cle, teinte, haut, bas) {
    var calque = sc.calques.dessus;
    var defs = calque.__pmDefs;
    if (!defs) { defs = calque.__pmDefs = document.createElementNS(NS, 'defs'); calque.insertBefore(defs, calque.firstChild); }
    var id = 'pm-degrade-' + sc.info.id + '-' + cle.replace(/[^A-Za-z0-9_-]/g, '-');
    var g = defs.querySelector('#' + id);
    if (!g) {
      g = document.createElementNS(NS, 'linearGradient');
      g.setAttribute('id', id);
      g.setAttribute('gradientUnits', 'userSpaceOnUse');
      g.setAttribute('x1', '0'); g.setAttribute('x2', '0');
      [0, 1].forEach(function (k) { var s = document.createElementNS(NS, 'stop'); s.setAttribute('offset', String(k)); g.appendChild(s); });
      defs.appendChild(g);
    }
    g.setAttribute('y1', String(r3(haut)));
    g.setAttribute('y2', String(r3(bas)));
    g.childNodes[0].setAttribute('stop-color', teinte); g.childNodes[0].setAttribute('stop-opacity', '0.35');
    g.childNodes[1].setAttribute('stop-color', teinte); g.childNodes[1].setAttribute('stop-opacity', '0');
    return id;
  }

  /** Dessine un graphique dont la mise en place (plan) et les temps (T) sont faits ; spans : textes de la figure, ou null. */
  function graphique(d, sc, O, g, plan, T, cle, spans) {
    var releve = sc.cadre.mode === 'releve';
    var ts = d.t;
    var couleurs = couleursDe(d, g);
    var opEtiquettes = releve ? 1 : clamp((ts - T.etiquettes.debut) / (T.etiquettes.duree || 1e-6));
    var poser = function (el, p, op, nom, debut) {
      if (!el || !p) return;
      if (releve) { releverEtiquette(sc, cle + ':' + nom, el, p, debut); return; }
      O.poserEtiquette(sc, sc.cadre, el, function () { return p; }, ts >= T.etiquettes.debut ? clamp(op) : 0);
    };
    if (spans && spans.source && plan.source) poser(spans.source, plan.source, opEtiquettes, 'source', T.etiquettes.debut);
    if (g.type === 'barres' || g.type === 'barres-horizontales') {
      var vertical = g.type === 'barres';
      d.trait([plan.axe.a, plan.axe.b], { id: cle + '/axe', debut: T.axe.debut, duree: T.axe.duree, couleur: 'texte', epaisseur: 0.3 });
      plan.barres.forEach(function (b, i) {
        var t0 = T.barres[i].debut, du = T.barres[i].duree;
        var part = releve ? 1 : du > 0 ? sortie((ts - t0) / du) : 1;
        if (b.inconnue) {
          var fi = vertical ? { x: b.cx - b.l / 2, y: b.base - b.h, l: b.l, h: b.h } : { x: b.base, y: b.cy - b.h / 2, l: b.l, h: b.h };
          d.rect({ id: cle + '/barre' + i, x: fi.x, y: fi.y, l: fi.l, h: fi.h, debut: t0, duree: du, entree: 'fondu', pointille: true, couleur: couleurs[i], epaisseur: 0.3 });
        } else if (releve || ts >= t0) {
          var f = vertical ? { type: 'rect', x: b.cx - b.l / 2, y: b.base - b.h * part, l: b.l, h: Math.max(0.01, b.h * part) }
            : { type: 'rect', x: b.base, y: b.cy - b.h / 2, l: Math.max(0.01, b.l * part), h: b.h };
          forme(O, sc, d, cle + '/barre' + i, t0, couleurs[i], f);
        }
        if (spans && spans.valeurs[i]) {
          var v = g.valeurs[i].valeur;
          if (!releve && v !== null) texte(spans.valeurs[i], G.texteValeur(v * part, g, G.decimalesDe(g, i)));
          poser(spans.valeurs[i], plan.valeur(i, b.inconnue ? 1 : part), b.inconnue ? clamp((ts - t0) / du) : (ts >= t0 ? part : 0), 'valeur' + i, t0);
        }
        if (spans && spans.etiquettes[i]) poser(spans.etiquettes[i], plan.etiquettes[i], opEtiquettes, 'etiquette' + i, T.etiquettes.debut);
      });
      return;
    }
    if (g.type === 'courbe') {
      d.trait(plan.axes, { id: cle + '/axes', debut: T.axe.debut, duree: T.axe.duree, couleur: 'texte', epaisseur: 0.3 });
      var connus = [];
      plan.points.forEach(function (p, i) { if (p) connus.push({ p: p, t: T.points[i], i: i }); });
      if (connus.length < 2) return;
      var cumul = [0];
      for (var k = 1; k < connus.length; k++) cumul.push(cumul[k - 1] + Math.hypot(connus[k].p[0] - connus[k - 1].p[0], connus[k].p[1] - connus[k - 1].p[1]));
      var total = cumul[cumul.length - 1] || 1;
      var atteint = 0;
      if (releve || ts >= connus[connus.length - 1].t) atteint = total;
      else if (ts > connus[0].t) {
        for (var j = 0; j + 1 < connus.length; j++) {
          if (ts < connus[j + 1].t) { var f2 = clamp((ts - connus[j].t) / Math.max(1e-6, connus[j + 1].t - connus[j].t)); atteint = cumul[j] + (cumul[j + 1] - cumul[j]) * douce(f2); break; }
        }
      }
      var part2 = atteint / total;
      var teinte = couleurs[0];
      var aire = releve ? 1 : clamp((part2 - 0.6) / 0.4);
      if (!releve && aire > 0) {
        var pts = connus.map(function (c) { return c.p; });
        var dAire = 'M' + pts[0][0] + ' ' + plan.zero + pts.map(function (p) { return 'L' + p[0] + ' ' + p[1]; }).join('') + 'L' + pts[pts.length - 1][0] + ' ' + plan.zero + 'Z';
        var n = O.noeud(sc, sc.cadre, cle + '/aire', 'path', O.calqueDe(sc, 'dessus'));
        O.attr(n, 'd', dAire);
        O.attr(n, 'fill', 'url(#' + degrade(sc, cle, teinte, plan.haut, plan.zero) + ')');
        O.attr(n, 'stroke', 'none');
        O.attr(n, 'opacity', aire < 1 ? r3(aire * 0.9) : '0.9');
      }
      if (releve || ts >= connus[0].t) {
        O.tracer(sc, d, 'graphique', { id: cle + '/ligne', debut: connus[0].t, entree: 'aucune', couleur: teinte, epaisseur: 0.55 },
          { formes: [{ forme: { type: 'poly', points: connus.map(function (c) { return c.p; }) }, passes: 1, progres: function () { return part2; } }] });
      }
      connus.forEach(function (c) {
        var du = 0.35 / allure();
        O.tracer(sc, d, 'graphique', { id: cle + '/point' + c.i, debut: c.t, duree: du, entree: 'pop', couleur: teinte }, { formes: [{ forme: { type: 'ellipse', cx: c.p[0], cy: c.p[1], rx: 0.95, ry: 0.95 }, remplir: true }] });
        if (spans && spans.valeurs[c.i]) poser(spans.valeurs[c.i], plan.valeur(c.i), ts >= c.t ? (ts - c.t) / du : 0, 'valeur' + c.i, c.t);
      });
      plan.etiquettes.forEach(function (p, i) { if (spans && spans.etiquettes[i]) poser(spans.etiquettes[i], p, opEtiquettes, 'etiquette' + i, T.etiquettes.debut); });
      return;
    }
    // Secteurs et anneau : balayage depuis midi, dans le sens des aiguilles d'une montre.
    var B = T.balayage;
    var x = releve ? 1 : clamp((ts - B.debut) / (B.duree || 1e-6));
    var balaye = douce(x) * TAU;
    plan.angles.forEach(function (a, i) {
      var finA = Math.min(a[1], -Math.PI / 2 + balaye);
      var complet = (releve || ts >= B.debut) && finA >= a[1] - 1e-6;
      if ((releve || ts >= B.debut) && finA > a[0] + 0.001) {
        var pts = G.coin(plan.cx, plan.cy, plan.r, plan.trou, a[0], finA);
        forme(O, sc, d, cle + '/secteur' + i, B.debut, couleurs[i], { type: 'poly', points: pts, ferme: true });
        if (sc.trait !== 'main') d.trait(pts, { id: cle + '/bord' + i, ferme: true, debut: B.debut, entree: 'aucune', couleur: 'fond', epaisseur: 0.35 });
      }
      if (spans && spans.etiquettes[i]) {
        var tComplet = B.debut + inverseDouce((a[1] + Math.PI / 2) / TAU) * B.duree;
        poser(spans.etiquettes[i], plan.etiquettes[i], complet ? clamp((ts - tComplet) / (0.25 / allure())) : 0, 'etiquette' + i, tComplet);
      }
    });
  }

  M.dessin.composant('[data-graphique][data-pm-graphique]', function (sc, el, O) {
    var g = lireJson(el, 'data-pm-graphique');
    var nom = el.getAttribute('data-graphique');
    var cle = 'graphique:' + (el.id || el.getAttribute('data-pm-cle') || nom);
    var spans = { etiquettes: [], valeurs: [], source: null };
    Array.prototype.slice.call(el.querySelectorAll('[data-pm-role]')).forEach(function (s) {
      var role = s.getAttribute('data-pm-role'), rang = Number(s.getAttribute('data-pm-rang')) || 0;
      O.adopterEtiquette(sc, s);
      if (role === 'etiquette') spans.etiquettes[rang] = s;
      else if (role === 'valeur') spans.valeurs[rang] = s;
      else if (role === 'source') spans.source = s;
    });
    var plan = null;
    return function (d) {
      if (!g || !Array.isArray(g.valeurs)) throw new Error('graphique « ' + nom + ' » : données absentes ou illisibles');
      if (sc.cadre.mode === 'releve' || !plan) {
        var taille = function (s) { return s ? s.__pmTaille || { l: 0, h: 0 } : null; };
        plan = G.disposer(g, boiteDe(sc, el), { etiquettes: spans.etiquettes.map(taille), valeurs: spans.valeurs.map(taille), source: taille(spans.source) });
      }
      var debut = O.tempsElement(sc, el).debut;
      graphique(d, sc, O, g, plan, G.temps(g, debut, allure(), d.temps), cle, spans);
    };
  });

  M.dessin.etendre(function (d, sc, O) {
    function libre(type) {
      return function (valeurs, o) {
        o = o || {};
        if (!Array.isArray(valeurs)) throw new Error('d.' + (type === 'barres' ? 'barres' : type === 'courbe' ? 'courbe' : 'secteurs') + ' attend une liste de nombres');
        var g = { type: type === 'secteurs' && o.anneau ? 'anneau' : type, valeurs: valeurs.map(function (v) { return typeof v === 'number' || v === null ? { valeur: v } : v; }) };
        if (o.max !== undefined) g.max = o.max;
        var fautes = G.valider(g);
        if (fautes.length) throw new Error(fautes[0]);
        var cadre = sc.cadre;
        var rang = cadre.rangs.graphique = (cadre.rangs.graphique || 0) + 1;
        var cle = cadre.prefixe + (o.id !== undefined ? String(o.id) : 'graphique#' + rang);
        var plan = G.disposer(g, { x: Number(o.x) || d.centre[0], y: Number(o.y) || 50, l: Number(o.l) || 80, h: Number(o.h) || 40 }, {});
        graphique(d, sc, O, g, plan, G.temps(g, d.temps(o.debut !== undefined ? o.debut : 0), allure(), d.temps), cle, null);
        return cle;
      };
    }
    d.barres = libre('barres');
    d.courbe = libre('courbe');
    d.secteurs = libre('secteurs');
  });

  // --- Code ------------------------------------------------------------------------------------------------------------

  M.dessin.composant('[data-code][data-pm-code]', function (sc, el, O) {
    var donnees = lireJson(el, 'data-pm-code') || {};
    var nom = el.getAttribute('data-code');
    var cle = 'code:' + (el.id || el.getAttribute('data-pm-cle') || nom);
    var fenetre = el.querySelector('.pm-code-fenetre');
    var corps = el.querySelector('.pm-code-corps');
    var jetons = [];
    Array.prototype.forEach.call(el.querySelectorAll('.pm-code-jeton'), function (s) { jetons[Number(s.getAttribute('data-pm-piste'))] = s; });
    var bandes = Array.prototype.slice.call(el.querySelectorAll('.pm-code-bande'));
    var pistes = donnees.pistes || [];
    var etapes = donnees.etapes || [];
    var frappe = el.getAttribute('data-code-entree') === 'frappe';
    var saisie = null;
    function debuts(d, t0) { return etapes.map(function (e, i) { return i === 0 ? (e.debut !== undefined ? d.temps(e.debut) : t0) : d.temps(e.debut); }); }
    return function (d) {
      if (!fenetre || !corps || !etapes.length) throw new Error('code « ' + nom + ' » : fenêtre absente (assemblage)');
      var A = allure();
      var t0 = O.tempsElement(sc, el).debut;
      var ds = debuts(d, t0);
      if (sc.cadre.mode === 'releve') {
        // Lignes surlignées : gros plans possibles pour la caméra (cadrage) ; ligne plus large que la fenêtre : code-trop-large.
        var fin = (sc.info.fin - sc.info.debut) * sc.info.rythme;
        bandes.forEach(function (b) {
          var s = Number(b.getAttribute('data-pm-etape'));
          var garde = b.style.opacity;
          b.style.opacity = '1';
          var bx = boiteDe(sc, b);
          b.style.opacity = garde;
          sc.cadre.boites.push({ cle: cle + ':ligne' + s + '-' + b.getAttribute('data-pm-ligne'), id: null, genre: 'cadrage', debut: r2(ds[s]), fin: r2(s + 1 < ds.length ? ds[s + 1] : fin), boite: { x: r2(bx.x), y: r2(bx.y), l: r2(bx.l), h: r2(bx.h) }, forme: 'rect', nu: false });
        });
        var sonde = document.createElement('span');
        sonde.textContent = '0000000000';
        sonde.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:0;top:0';
        corps.appendChild(sonde);
        var ch = sonde.getBoundingClientRect().width / 10;
        sonde.remove();
        var cs = getComputedStyle(fenetre);
        var dispo = fenetre.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        if ((donnees.largeur || 0) * ch > dispo + 0.5) {
          var k = 100 / ((sc.cadreReleve && sc.cadreReleve.height) || 1);
          O.signaler(sc, t0, 'code-trop-large', 'une ligne du code « ' + nom + ' » fait ' + donnees.largeur + ' caractères, plus large que sa fenêtre (' + Math.floor(dispo / (ch || 1)) + ' caractères, ' + r2(dispo * k) + ' cqh) : élargir la figure, réduire la police (--pm-code-taille) ou couper la ligne', el.id || null);
        }
        return;
      }
      var ts = d.t;
      var vue = ts < t0 ? 0 : douce((ts - t0) / (0.4 / A));
      propriete(fenetre, 'opacity', vue < 1 ? String(r3(vue)) : null);
      var st = C.etat(ds, ts, C.DUREE / A);
      var nl = donnees.lignes || [1];
      propriete(el, '--pm-code-lignes', String(r3(nl[st.de] + (nl[st.vers] - nl[st.de]) * st.p)));
      var tapees = Infinity;
      if (frappe && st.vers === 0) {
        if (!saisie) saisie = M.paquetsSaisie ? M.paquetsSaisie(String(donnees.texte || ''), sc.info.id + '|' + cle) : { delais: [] };
        var depart = t0 + 0.35 / A, ecoule = (ts - depart) * A;
        tapees = 0;
        while (tapees < saisie.delais.length && saisie.delais[tapees] <= ecoule + 1e-9 && ts >= depart) tapees++;
      }
      pistes.forEach(function (p, j) {
        var s = jetons[j];
        if (!s) return;
        var de = p.p[st.de], vers = p.p[st.vers];
        var pos = null, op = 0;
        if (st.vers === 0) {
          pos = p.p[0];
          if (pos) {
            if (frappe) op = tapees > p.o ? 1 : 0;
            else op = douce((ts - (t0 + (0.2 + pos[1] * C.PAR_LIGNE) / A)) / (0.25 / A));
          }
        } else if (de && vers) { pos = [de[0] + (vers[0] - de[0]) * st.p, de[1] + (vers[1] - de[1]) * st.p]; op = 1; }
        else if (de) { pos = de; op = st.retires; }
        else if (vers) { pos = vers; op = st.ajoutes; }
        if (pos) { propriete(s, '--col', String(r3(pos[0]))); propriete(s, '--ligne', String(r3(pos[1]))); }
        propriete(s, '--vis', frappe && st.vers === 0 && p.o !== undefined ? String(Math.max(0, Math.min(p.t.length, tapees - p.o))) : null);
        propriete(s, 'opacity', op < 1 ? String(r3(op)) : null);
      });
      bandes.forEach(function (b) {
        var s = Number(b.getAttribute('data-pm-etape'));
        var op = 0;
        if (st.vers === 0) op = s === 0 ? douce((ts - t0 - 0.4 / A) / (0.3 / A)) : 0;
        else if (s === st.vers) op = st.p;
        else if (s === st.de) op = 1 - st.p;
        propriete(b, 'opacity', String(r3(op)));
      });
    };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
