/* Pulse Motion – écrans dans les scènes (spec S6, 5.8 à 5.11) : pointeur, clics, projecteur, anneau, assombrissement,
 * zooms ciblés et enchaînés, suivi des gestes.
 *
 *   <div class="pm-ecran" data-cadre="navigateur" data-pm-ecran="1" style="--pm-page-l: 1280; --pm-page-h: 800">
 *     <div class="pm-ecran-barre">…</div>
 *     <div class="pm-ecran-surface"><div class="pm-ecran-plan">
 *       <img …> <i class="pm-clic" data-cible="#envoyer" data-start="2"></i> <i class="pm-zoom" data-cible="#total" …></i>
 *     </div></div>
 *   </div>
 * (structure posée à l'assemblage par scripts/lib/ecrans.js).
 *
 * M.demarrerEcrans() (après M.demarrer) : relève les marques de chaque écran et leurs instants (minutage), pose le pointeur
 * et ses cercles dans le plan ; les cibles sont mesurées dans le plan (chaîne offsetLeft / offsetTop : sans les
 * transformations, donc la même mesure à chaque instant), à la première image puis une fois les polices chargées (M.pret).
 * À chaque rendu (M.surRendu), l'état de chaque écran visible est recalculé de t seul, vu par l'écran (M.tempsVuPar :
 * data-gel et data-vitesse) : position du pointeur (M.pointeur), enfoncement et cercle au clic, appui de l'élément visé
 * (valeurs de #081), opacité des mises en valeur (entrée et sortie de 0,4 s, cubic-bezier(0.4, 0, 0.2, 1)), pulsation de
 * l'anneau (1,5 s), caméra du plan (zooms pm-zoom, ou data-film-camera="suivre" : un zoom par geste, enchaînés par
 * M.enchainerZooms, puis un recul ; les pm-zoom écrits l'emportent).
 * M.mesurerEcrans({ scenes }) -> constats du contrôle rendu : etapes-trop-rapprochees (gestes ou étapes d'un film trop
 * proches pour aller de l'un à l'autre), pointeur-hors-ecran (cible #id hors de l'image).
 * Film (plan 2 de S6, 5.8) : data-film="fichier:pm-film-<nom>" désigne le bloc JSON embarqué (étapes et images en data:),
 * data-etapes les étapes montrées ; une marque <i class="pm-etape" data-etape="N" data-start="…"> fixe l'instant de l'action
 * de l'étape N (sinon, M.film.planifierFilm la place). L'image est choisie par M.film.etatFilm, du temps vu par l'écran, et
 * posée dans deux <img> (l'une s'affiche une fois l'autre décodée ; M.seek attend ce décodage) ; les images des 2 s
 * suivantes sont préchargées pendant la lecture. Le pointeur suit les gestes des étapes ; « etape:N » vise la cible relevée
 * au tournage.
 * Valeurs de argo (src/camera.ts : spotlight, focusRing, dimAround ; src/cursor.ts ; MIT, Shreyas Karnik), rendu réécrit
 * sans filtre SVG ni backdrop-filter. Navigateur seulement ; dépend de pointeur, camera, courbes, horloge (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var NS = 'http://www.w3.org/2000/svg';
  var GESTES = { 'pm-clic': 'clic', 'pm-survol': 'survol', 'pm-double-clic': 'double-clic' };
  var MISES = ['pm-projecteur', 'pm-anneau', 'pm-assombrir'];
  var FONDU = 0.4;
  var ANNEAU = 1.5;
  var REACTION = 1;
  var MARGE_PROJECTEUR = 12;
  var DEPART = [72, 78];
  var FLECHE = 'M0 0 L0 17 L4.5 13 L7.5 20 L10 19 L7 12 L13 12 Z';
  var MAIN = 'M8 1.6a1.6 1.6 0 0 1 3.2 0V9.2l.7-.1a1.5 1.5 0 0 1 2.6.5l.6-.1a1.5 1.5 0 0 1 2.5.8l.4 0a1.5 1.5 0 0 1 2.4 1.2V16c0 4.2-2.6 7.4-6.6 7.4h-1.6c-2.4 0-4-1.1-5.3-3L2.9 15a1.6 1.6 0 0 1 2.4-2.1L8 15.4Z';
  var ecrans = [];
  var douce = null;
  var films = {};
  var PRECHARGE = 2;

  /** Bloc d'un film (lu une fois) : { largeur, hauteur, cadence, etapes, images }. */
  function lireFilm(ref) {
    var id = String(ref || '').replace(/^fichier:/, '');
    if (!Object.prototype.hasOwnProperty.call(films, id)) {
      var b = document.getElementById(id);
      try { films[id] = b ? JSON.parse(b.textContent) : null; } catch (err) { films[id] = null; }
    }
    return films[id];
  }
  function fenetreScene(scene) {
    var s = M.minutage && M.minutage.scenes.filter(function (x) { return x.id === scene; })[0];
    return s ? { debut: s.debut, fin: s.fin } : { debut: 0, fin: 0 };
  }

  function nombre(v, defaut) { var n = parseFloat(v); return isFinite(n) ? n : defaut; }
  function arrondi(x) { return Math.round(x * 1000) / 1000; }
  function minuteDe(el, scene) {
    var cle = el.getAttribute('data-pm-cle');
    var e = cle && M.minutage && M.minutage.elements[scene] && M.minutage.elements[scene][cle];
    return e ? { debut: e.debut, fin: e.fin } : null;
  }

  /** Opacité d'une mise en valeur : entrée et sortie de 0,4 s (bornées à la moitié de sa durée), nulle hors de sa plage. */
  function opaciteDe(m, te) {
    if (te < m.debut || te >= m.fin) return 0;
    var d = Math.min(FONDU, (m.fin - m.debut) / 2);
    var q = Math.min(1, (te - m.debut) / d, (m.fin - te) / d);
    return arrondi(douce(Math.max(0, q)));
  }

  function svg(chemin, vue) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', vue);
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', chemin);
    s.appendChild(p);
    return s;
  }

  /** Boîte d'un élément dans le plan, en px CSS de la mise en page (sans transformations), ou null. */
  function boiteDans(el, plan) {
    var x = 0, y = 0, c = el;
    while (c && c !== plan) {
      if (typeof c.offsetLeft !== 'number') return null;
      x += c.offsetLeft; y += c.offsetTop;
      c = c.offsetParent;
    }
    return c === plan ? [x, y, el.offsetWidth, el.offsetHeight] : null;
  }

  function lireCible(texte) {
    var t = String(texte || '').trim();
    var m;
    if ((m = /^#([A-Za-z][\w-]*)$/.exec(t))) return { id: m[1] };
    if ((m = /^etape:(\d+)$/.exec(t))) return { etape: Number(m[1]) };
    var n = t.split(',').map(function (x) { return parseFloat(x); });
    if (/%/.test(t) && (n.length === 2 || n.length === 4) && n.every(isFinite)) return { valeurs: n };
    return null;
  }

  function preparer(el, sec, scene, rang) {
    var surface = el.querySelector(':scope > .pm-ecran-surface');
    var plan = surface && surface.querySelector(':scope > .pm-ecran-plan');
    if (!plan) return null;
    var cs = racine.getComputedStyle(el);
    var page = [nombre(cs.getPropertyValue('--pm-page-l'), 1280), nombre(cs.getPropertyValue('--pm-page-h'), 800)];
    var e = {
      el: el, sec: sec, scene: scene, plan: plan, page: page, rang: rang,
      forme: el.getAttribute('data-pointeur') || 'fleche',
      graine: scene + (rang > 1 ? '-' + rang : ''),
      vitesse: nombre(el.getAttribute('data-pointeur-vitesse'), 1),
      suivre: el.getAttribute('data-film-camera') === 'suivre' && !el.hasAttribute('data-camera'),
      gestes: [], mises: [], zooms: [], ondes: [], mesure: false, ecrit: {},
    };
    var depart = lireCible(el.getAttribute('data-pointeur-depart'));
    e.depart = depart && depart.valeurs && depart.valeurs.length === 2 ? depart.valeurs : DEPART;
    if (el.hasAttribute('data-film')) {
      e.film = lireFilm(el.getAttribute('data-film'));
      if (e.film) {
        e.etapesFilm = String(el.getAttribute('data-etapes') || '').split(',').map(Number).filter(function (n) { return n > 0; });
        e.marquesFilm = {};
        e.fenetre = fenetreScene(scene);
        plan.querySelectorAll('.pm-etape').forEach(function (m) {
          var t = minuteDe(m, scene);
          var n = Number(m.getAttribute('data-etape'));
          if (t && n > 0) e.marquesFilm[n] = t.debut - e.fenetre.debut;
        });
        e.imgs = [1, 0].map(function (k) {
          var img = document.createElement('img');
          img.className = 'pm-ecran-film';
          img.setAttribute('alt', '');
          img.setAttribute('data-decor', '');
          img.setAttribute('aria-hidden', 'true');
          img.style.opacity = '0';
          plan.insertBefore(img, plan.firstChild);
          return { el: img, nom: null, pret: false, rang: k };
        }).reverse();
        e.montree = e.imgs[0];
        e.attentes = [];
        e.precharges = {};
      }
    }
    plan.querySelectorAll('.pm-clic, .pm-survol, .pm-double-clic').forEach(function (m) {
      var type = GESTES[Object.keys(GESTES).filter(function (c) { return m.classList.contains(c); })[0]];
      var t = minuteDe(m, scene);
      if (t) e.gestes.push({ type: type, instant: t.debut, cible: m.getAttribute('data-cible'), marque: m });
    });
    el.querySelectorAll('.pm-projecteur, .pm-anneau, .pm-assombrir').forEach(function (m) {
      var t = minuteDe(m, scene);
      if (t) e.mises.push({ sorte: MISES.filter(function (c) { return m.classList.contains(c); })[0], debut: t.debut, fin: t.fin, cible: m.getAttribute('data-cible'), el: m });
    });
    plan.querySelectorAll('.pm-zoom').forEach(function (m) {
      var t = minuteDe(m, scene);
      if (t) e.zooms.push({ debut: t.debut, fin: t.fin, cible: m.getAttribute('data-cible'), echelle: nombre(m.getAttribute('data-echelle'), 0) });
    });
    if (e.forme !== 'aucun' && (e.gestes.length || (e.film && e.film.etapes.some(function (x) { return x.point && M.film.gesteDe(x); })))) {
      var p = document.createElement('div');
      p.className = 'pm-pointeur';
      p.setAttribute('data-forme', e.forme);
      p.setAttribute('data-decor', '');
      p.setAttribute('aria-hidden', 'true');
      if (e.forme === 'fleche') p.appendChild(svg(FLECHE, '0 0 14 21'));
      else if (e.forme === 'main') p.appendChild(svg(MAIN, '0 0 20 24'));
      calqueDe(e).appendChild(p);
      e.pointeur = p;
    }
    return e;
  }

  /** Cibles mesurées : gestes en points visés, mises en valeur en boîtes (avec la marge du projecteur), zooms. */
  function mesurer(e) {
    var L = e.plan.offsetWidth, H = e.plan.offsetHeight;
    if (!(L > 0 && H > 0)) return;
    var kx = e.page[0] / L, ky = e.page[1] / H;
    var trouver = function (texte) {
      var c = lireCible(texte);
      if (!c) return null;
      if (c.id) {
        var cible = e.plan.querySelector('#' + (racine.CSS && CSS.escape ? CSS.escape(c.id) : c.id));
        var b = cible && boiteDans(cible, e.plan);
        return b ? { boite: [b[0] * kx, b[1] * ky, b[2] * kx, b[3] * ky], el: cible } : null;
      }
      if (c.etape) {
        var et = e.film && e.film.etapes.filter(function (x) { return x.n === c.etape; })[0];
        if (!et) return null;
        if (et.cible && et.cible.boite) return { boite: et.cible.boite.slice() };
        return et.point ? { point: et.point.slice() } : null;
      }
      var v = c.valeurs;
      var x = v[0] / 100 * e.page[0], y = v[1] / 100 * e.page[1];
      return v.length === 4 ? { boite: [x, y, v[2] / 100 * e.page[0], v[3] / 100 * e.page[1]] } : { point: [x, y] };
    };
    e.hors = [];
    var gestes = [];
    e.gestes.forEach(function (g) {
      var c = trouver(g.cible);
      if (!c) return;
      g.point = c.point || M.pointeur.pointVise(c.boite);
      g.boite = c.boite || null;
      g.el = c.el || null;
      if (g.point[0] < 0 || g.point[1] < 0 || g.point[0] > e.page[0] || g.point[1] > e.page[1]) e.hors.push(g.cible);
      gestes.push({ type: g.type, instant: g.instant, point: g.point, cle: g });
    });
    var diagonale = Math.sqrt(e.page[0] * e.page[0] + e.page[1] * e.page[1]);
    e.ecartsFilm = [];
    if (e.film && M.film) {
      var depart = [e.depart[0] / 100 * e.page[0], e.depart[1] / 100 * e.page[1]];
      e.planFilm = M.film.planifierFilm(e.film, e.marquesFilm, { etapes: e.etapesFilm, duree: e.fenetre.fin - e.fenetre.debut, depart: depart, diagonale: diagonale, vitesse: e.vitesse });
      e.ecartsFilm = e.planFilm.ecarts;
      M.film.gestesDuPlan(e.planFilm).forEach(function (g) {
        var p = e.planFilm.etapes.filter(function (x) { return x.n === g.etape; })[0];
        gestes.push({ type: g.type, instant: g.instant + e.fenetre.debut, point: g.point, cle: { boite: p.boite, fin: p.fin + e.fenetre.debut, film: true } });
      });
    }
    e.planGestes = M.pointeur.planGestes(gestes, { depart: [e.depart[0] / 100 * e.page[0], e.depart[1] / 100 * e.page[1]], diagonale: diagonale, graine: e.graine, vitesse: e.vitesse });
    e.mises.forEach(function (m) {
      if (m.sorte === 'pm-assombrir') return;
      var c = trouver(m.cible);
      m.boite = c && c.boite ? c.boite : null;
      if (m.boite && m.sorte === 'pm-projecteur') {
        var b = m.boite;
        m.boite = [b[0] - MARGE_PROJECTEUR, b[1] - MARGE_PROJECTEUR, b[2] + 2 * MARGE_PROJECTEUR, b[3] + 2 * MARGE_PROJECTEUR];
      }
      if (m.boite) {
        var s = m.el.style;
        s.left = arrondi(m.boite[0] / e.page[0] * 100) + '%';
        s.top = arrondi(m.boite[1] / e.page[1] * 100) + '%';
        s.width = arrondi(m.boite[2] / e.page[0] * 100) + '%';
        s.height = arrondi(m.boite[3] / e.page[1] * 100) + '%';
      }
    });
    // Zooms : écrits, puis ceux du suivi des gestes qui n'en chevauchent aucun.
    var zooms = [];
    e.zooms.forEach(function (z) {
      var c = trouver(z.cible);
      if (!c) return;
      var centre = c.point || [c.boite[0] + c.boite[2] / 2, c.boite[1] + c.boite[3] / 2];
      var part = c.boite ? c.boite[2] / e.page[0] : 0;
      zooms.push({ debut: z.debut, fin: z.fin, echelle: c.boite ? M.echelleZoom(part, z.echelle) : (z.echelle || 1.8), x: centre[0] / e.page[0] * 100, y: centre[1] / e.page[1] * 100 });
    });
    if (e.suivre) {
      e.planGestes.gestes.forEach(function (g) {
        var debut = g.arrivee, fin = g.cle && g.cle.fin !== undefined ? Math.max(g.cle.fin, g.instant + 0.4) : g.instant + REACTION;
        if (zooms.some(function (z) { return z.debut < fin && debut < z.fin; })) return;
        var b = g.cle.boite;
        var part = b ? b[2] / e.page[0] : 0;
        zooms.push({ debut: debut, fin: fin, echelle: b ? M.echelleZoom(part, 0) : 1.8, x: g.point[0] / e.page[0] * 100, y: g.point[1] / e.page[1] * 100 });
      });
    }
    e.clauses = M.enchainerZooms(zooms);
    e.mesure = true;
  }

  function ecrire(e, cle, el, prop, valeur) {
    var k = cle + ':' + prop;
    if (e.ecrit[k] === valeur) return;
    e.ecrit[k] = valeur;
    if (prop.indexOf('--') === 0) el.style.setProperty(prop, valeur);
    else el.style[prop] = valeur;
  }

  function onde(e, i) {
    while (e.ondes.length <= i) {
      var o = document.createElement('i');
      o.className = 'pm-onde';
      o.setAttribute('data-decor', '');
      o.setAttribute('aria-hidden', 'true');
      calqueDe(e).appendChild(o);
      e.ondes.push(o);
    }
    return e.ondes[i];
  }

  /** Calque du pointeur et des cercles, au-dessus du plan (non zoomé), à la taille de la surface. */
  function calqueDe(e) {
    if (!e.calque) {
      e.calque = document.createElement('div');
      e.calque.className = 'pm-ecran-calque';
      e.calque.setAttribute('data-decor', '');
      e.calque.setAttribute('aria-hidden', 'true');
      e.plan.parentNode.appendChild(e.calque);
    }
    return e.calque;
  }

  function uri(e, nom) { return nom && e.film.images ? e.film.images[nom] || '' : ''; }

  /** Images du film à l'instant vu par l'écran : l'image de base dans l'<img> montrée ; l'autre reçoit l'image suivante (ou le
   *  fondu d'un « aller ») et ne passe devant qu'une fois décodée. */
  function poserFilm(e, te) {
    var st = M.film.etatFilm(e.planFilm, te - e.fenetre.debut);
    var base = st.image, dessus = st.fondu ? st.fondu.image : null;
    var autre = e.imgs[1 - e.montree.rang];
    var charger = function (i, nom) {
      if (i.nom === nom) return;
      i.nom = nom; i.pret = false;
      i.el.src = uri(e, nom);
      var promesse = i.el.decode().catch(function () {}).then(function () {
        if (i.nom !== nom) return;
        i.pret = true;
        if (!M.enCapture || !M.enCapture()) poserFilm(e, M.tempsVuPar ? M.tempsVuPar(e.el, M.temps()) : M.temps());
      });
      e.attentes.push(promesse);
    };
    if (base && e.montree.nom !== base) {
      if (autre.nom === base && autre.pret) { e.montree = autre; autre = e.imgs[1 - e.montree.rang]; } else if (!e.montree.nom) charger(e.montree, base); else charger(autre, base);
    }
    if (dessus && e.montree.nom === base) charger(autre, dessus);
    e.imgs.forEach(function (i) {
      var o = i === e.montree ? (i.pret ? 1 : 0) : (dessus && i.nom === dessus && i.pret ? st.fondu.opacite : 0);
      ecrire(e, 'f' + i.rang, i.el, 'opacity', String(o));
      ecrire(e, 'f' + i.rang, i.el, 'zIndex', i === e.montree ? '0' : '1');
    });
    // Préchargement des 2 s suivantes (lecture seulement : une capture attend chaque image à son instant).
    if (!M.enCapture || !M.enCapture()) {
      M.film.imagesEntre(e.planFilm, te - e.fenetre.debut, PRECHARGE).forEach(function (nom) {
        if (e.precharges[nom]) return;
        var im = new Image();
        im.src = uri(e, nom);
        e.precharges[nom] = im;
        if (im.decode) im.decode().catch(function () {});
      });
    }
  }

  function rendreEcran(e, t) {
    if (!e.mesure) mesurer(e);
    if (!e.mesure) return;
    var te = M.tempsVuPar ? M.tempsVuPar(e.el, t) : t;
    if (e.planFilm) poserFilm(e, te);
    // Caméra du plan (zooms) : le pointeur et les cercles sont dans un calque au-dessus du plan, placés et dimensionnés par la
    // mise en page (--pm-z, --pm-k) et non par une transformation : Chrome garde sinon l'échelle de dessin d'un calque déjà
    // zoomé, et la même image dépendrait de celle d'avant.
    var cam = e.clauses.length ? M.etatCamera(e.clauses, te) : null;
    var z = cam ? cam.zoom : 1;
    var X = function (x) { return arrondi(cam ? 50 + z * (x / e.page[0] * 100 - cam.x) : x / e.page[0] * 100) + '%'; };
    var Y = function (y) { return arrondi(cam ? 50 + z * (y / e.page[1] * 100 - cam.y) : y / e.page[1] * 100) + '%'; };
    ecrire(e, 'z', calqueDe(e), '--pm-z', String(arrondi(z)));
    var st = M.pointeur.etatPointeur(e.planGestes, te, { doigt: e.forme === 'doigt' });
    if (e.pointeur) {
      ecrire(e, 'p', e.pointeur, 'left', X(st.x));
      ecrire(e, 'p', e.pointeur, 'top', Y(st.y));
      ecrire(e, 'p', e.pointeur, '--pm-k', String(st.echelle));
      ecrire(e, 'p', e.pointeur, 'opacity', String(st.opacite));
    }
    var n = e.forme === 'aucun' ? 0 : st.ondes.length;
    for (var i = 0; i < Math.max(n, e.ondes.length); i++) {
      var o = onde(e, i);
      var w = st.ondes[i];
      ecrire(e, 'o' + i, o, 'opacity', w && i < n ? String(w.opacite) : '0');
      if (w && i < n) {
        ecrire(e, 'o' + i, o, 'left', X(w.x));
        ecrire(e, 'o' + i, o, 'top', Y(w.y));
        ecrire(e, 'o' + i, o, '--pm-k', String(w.echelle));
      }
    }
    // Appui de l'élément visé (#081) : seulement pendant l'appui ; sinon sa propre échelle.
    var appuis = {};
    st.appuis.forEach(function (a) { appuis[a.rang] = a.echelle; });
    e.planGestes.gestes.forEach(function (g) {
      var el = g.cle.el;
      if (!el) return;
      ecrire(e, 'a' + g.rang, el, 'scale', appuis[g.rang] !== undefined ? String(appuis[g.rang]) : '');
    });
    var assombrit = false;
    e.mises.forEach(function (m, k) {
      var o = opaciteDe(m, te);
      ecrire(e, 'm' + k, m.el, '--pm-o', String(o));
      if (m.sorte === 'pm-assombrir' && o > 0) assombrit = true;
      if (m.sorte === 'pm-anneau') {
        // Pulsation de 1,5 s : w (3 px) à 40 % et 2w à 15 %, jusqu'à w + 1 à 60 % et 2w + 2 à 25 %, avec un halo de 20 px.
        var q = te >= m.debut ? ((te - m.debut) % ANNEAU) / ANNEAU : 0;
        var k2 = arrondi((1 - Math.cos(2 * Math.PI * q)) / 2);
        var px = function (v) { return 'calc(' + arrondi(v) + ' * var(--pm-px))'; };
        var c = function (p) { return 'color-mix(in srgb, var(--c-accent) ' + arrondi(p) + '%, transparent)'; };
        ecrire(e, 'm' + k, m.el, 'boxShadow', '0 0 0 ' + px(3 + k2) + ' ' + c(40 + 20 * k2) + ', 0 0 0 ' + px(6 + 2 * k2) + ' ' + c(15 + 10 * k2) + ', 0 0 ' + px(20) + ' ' + px(0) + ' ' + c(25 * k2));
      }
    });
    ecrire(e, 'e', e.el, '--pm-assombri', assombrit ? '1' : '0');
    if (e.el.classList.contains('pm-ecran-assombrit') !== assombrit) e.el.classList.toggle('pm-ecran-assombrit', assombrit);
    if (cam) ecrire(e, 'c', e.plan, 'transform', M.styleCamera(cam).transform);
  }

  function rendre(t) {
    for (var i = 0; i < ecrans.length; i++) {
      var e = ecrans[i];
      if (e.sec.style.display === 'none') continue;
      rendreEcran(e, t);
    }
  }

  M.demarrerEcrans = function () {
    if (!M.pointeur || !M.minutage) return;
    douce = M.courbe('cubic-bezier', 'in', [0.4, 0, 0.2, 1]);
    ecrans = [];
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (sec) {
      var scene = sec.getAttribute('data-scene');
      sec.querySelectorAll('.pm-ecran[data-pm-ecran]').forEach(function (el, i) {
        var e = preparer(el, sec, scene, i + 1);
        if (e) ecrans.push(e);
      });
    });
    if (!ecrans.length) return;
    M.surRendu(rendre);
    // M.seek attend les images du film en cours de décodage, puis les pose : la même image à chaque rendu de cet instant.
    if (ecrans.some(function (e) { return e.film; })) {
      var reposer = function (t) {
        ecrans.forEach(function (e) { if (e.planFilm && e.sec.style.display !== 'none') poserFilm(e, M.tempsVuPar ? M.tempsVuPar(e.el, t) : t); });
      };
      var vider = function () {
        var a = [];
        ecrans.forEach(function (e) { if (e.film) { a = a.concat(e.attentes); e.attentes = []; } });
        return a;
      };
      M.surSeek(function (t) {
        var attendre = function (passe) {
          var a = vider();
          if (!a.length || passe > 3) return null;
          return Promise.all(a).then(function () { reposer(t); return attendre(passe + 1); });
        };
        return attendre(0);
      });
    }
    // Polices et images chargées : les cibles sont mesurées de nouveau, puis l'image courante est refaite.
    M.pret.then(function () {
      ecrans.forEach(function (e) { e.mesure = false; e.ecrit = {}; });
      M.rendre(M.temps());
    });
    rendre(M.temps());
  };

  M.mesurerEcrans = function (o) {
    var scenes = o && o.scenes;
    var constats = [];
    ecrans.forEach(function (e) {
      if (scenes && scenes.indexOf(e.scene) < 0) return;
      if (!e.mesure) mesurer(e);
      if (!e.mesure) return;
      e.ecartsFilm.forEach(function (c) {
        constats.push({ regle: 'etapes-trop-rapprochees', scene: e.scene, element: 'etape:' + c.a + '|etape:' + c.b, instant: 0,
          valeur: { a: c.a, b: c.b, ecart: c.ecart, minimum: c.minimum, film: true } });
      });
      e.planGestes.ecarts.forEach(function (c) {
        var ga = e.planGestes.gestes[c.a - 1], gb = e.planGestes.gestes[c.b - 1];
        if (ga && gb && ga.cle && gb.cle && ga.cle.film && gb.cle.film) return;
        constats.push({ regle: 'etapes-trop-rapprochees', scene: e.scene, element: c.a + '|' + c.b, instant: arrondi(e.planGestes.gestes[c.b - 1].instant),
          valeur: { a: c.a, b: c.b, ecart: c.ecart, minimum: c.minimum } });
      });
      e.hors.forEach(function (cible) { constats.push({ regle: 'pointeur-hors-ecran', scene: e.scene, element: cible, instant: 0 }); });
    });
    return constats;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
