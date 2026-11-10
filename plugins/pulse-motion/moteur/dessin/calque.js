/* Pulse Motion – calque de dessin des scènes (spec S7, 5.2 à 5.5) : un SVG redessiné à chaque image à partir de t et du
 * relevé (moteur/releve.js), net à tout zoom, capturé tel quel par les deux voies d'export.
 *
 *   M.dessin('schema', function (d) { d.fleche('#client', '#serveur', { debut: 'mot:serveur', etiquette: 'requete' }); });   (script de scène)
 *   <i data-fleche="#client → #serveur" data-start="mot:serveur" data-dur="0.7"><span data-texte="requete"></span></i>
 *   <i data-annoter="entoure" data-cible="#prix" data-start="mot:cher"></i>
 *   <path data-main-levee d="…">                       (forme SVG d'une scène redessinée à main levée au démarrage)
 *
 * M.dessin(idScene, fn(d)) : dessin libre, enregistré avant M.demarrer (comme M.chaqueImage). M.demarrerDessin() (après
 * M.demarrer) : calques des scènes qui dessinent, composants, étiquettes, relevé (M.demarrerReleve). M.dessinerScene(info, t,
 * vu) : appelé par horloge.js dans rendreScene, après les éléments et avant les caméras ; vu(el) donne le temps vu par
 * l'élément (data-gel, data-vitesse). Rien n'est dessiné avant le relevé (aperçu : M.seek l'attend toujours).
 * Calque : <svg class="pm-calque" data-calque="dessus" aria-hidden="true" viewBox="0 0 L 100">, dernier enfant du premier
 * conteneur data-camera de la scène (il suit la caméra), sinon de la section, posé en cqh sur la section ; « dessous » créé
 * au besoin, en premier enfant (surlignage sous le texte). Étiquettes : <span class="pm-calque-texte" data-texte> du déroulé
 * (remplies par l'assemblage, jugées par le contrôle), dans <div class="pm-calque-textes"> au-dessus du SVG ; jamais de <text>.
 * Réconciliation par clé (o.id, sinon <genre>#<rang d'appel>) : nœud réutilisé, attributs écrits s'ils changent, nœuds non
 * appelés retirés, ordre des nœuds celui des appels ; tracés gardés en cache (4 000 au plus, comme pen.js d'explainroo).
 *
 * d : t, duree (s de scène), temps(v) (nombre, 'mot:…', '#id', '#id:fin+0.2' : règles de data-start), p(debut, duree = 0,6,
 *   courbe = 'sine-inout'), depuis(v), entre(a, b) ; hasard(i), bruit(x), ondule(ampleur, vitesse) (graine : la scène ;
 *   jamais Math.random, ré-amorcé à chaque image) ; L, H (100), centre, zone (hors marges de 7 % et sous-titres), boite('#id')
 *   (relevé) ; couleur(nom) (couleur de la charte résolue) ; trait(points, o), chemin(d, o), rect(o), ellipse(o),
 *   fleche(de, vers, o), annoter(cible, o), icone(nom, o), etiquette(cle, o), groupe(o, fn).
 *   Options communes : id, debut, fin, duree, entree (trace par défaut, fondu, pop, aucune), sortie (fondu, aucune),
 *   couleur, epaisseur (cqh), main (main levée), pointille, calque ('dessus' | 'dessous').
 * Tracé (entrée « trace ») : trait de 0 à 1 sur les 78 premiers % de l'entrée, remplissage de 42 % à 100 % (stage.js) ; une
 * flèche se trace sur toute son entrée, sa pointe au bout du trait, son étiquette de 55 % à 90 %. Main levée : --pm-trait:
 * main sur la scène (ou o.main), --pm-rugosite, --pm-courbure, --pm-ebullition (re-tracés par seconde, 0 : figé).
 * Encre des styles (conflit 9) : M.dessin.traces(idScene) -> [{ cle, genre, d, transform? (pointe), part, epaisseur, couleur, calque, remplissage?,
 *   opacite }] de l'image en cours ; M.dessin.encreStyle(fn(idScene, traces, { L })) : le canevas d'un style s'inscrit ;
 *   data-encre="style" sur la scène : le SVG garde ses nœuds sans peindre l'encre, fn la redessine ; sans fn, encre opaque à
 *   0,94 dans le SVG, sans fusion.
 * Erreurs : règle dessin-erreur (M.erreurs, « Scène « x », à 2,4 s : … »), la scène continue sans ce dessin ; cible d'une
 *   flèche absente : fleche-cible-introuvable, avec les ids proches. M.mesurerDessin({ scenes? }) -> { constats, releves }.
 * Options at/out, entrées, _life, _seed, rand, noise, wiggle, get de engine/stage.js d'explainroo (MIT, © 2026 Vincent
 * Schmalbach) : adaptés en français, réécrits pour SVG. Navigateur seulement ; dépend de horloge, releve, minutage, courbes,
 * proches, dessin/main-levee, dessin/geometrie (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var NS = 'http://www.w3.org/2000/svg';
  var CACHE_MAX = 4000;
  var SORTIE = 0.3;
  var FORMES = ['line', 'polyline', 'polygon', 'rect', 'ellipse', 'circle', 'path'];
  var etat = { fns: {}, scenes: {}, pret: false, constats: [], vus: {}, peintre: null, cache: new Map(), courbes: {}, chemins: new Map(), mesureur: null };

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function douce(x) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp(x)); }
  function arriere(x) { var c = 1.70158, u = clamp(x) - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  function nombre(v, defaut) { var n = parseFloat(v); return isFinite(n) ? n : defaut; }
  function virgule(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }
  function copie(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  // --- Enregistrement et API publique -----------------------------------------------------------------------------------

  function dessin(id, fn) { (etat.fns[id] = etat.fns[id] || []).push(fn); }
  M.dessin = dessin;
  dessin.traces = function (id) { var sc = etat.scenes[id]; return sc && sc.traces ? sc.traces.map(copie) : []; };
  dessin.encreStyle = function (fn) { etat.peintre = typeof fn === 'function' ? fn : null; };
  M.mesurerDessin = function (o) {
    var scenes = o && o.scenes;
    var garder = function (id) { return !scenes || scenes.indexOf(id) >= 0; };
    var releves = {};
    var tous = M.releves ? M.releves() : null;
    Object.keys(etat.scenes).forEach(function (id) { if (garder(id) && tous && tous[id]) releves[id] = tous[id]; });
    return { constats: etat.constats.filter(function (c) { return garder(c.scene); }), releves: releves };
  };

  // --- Erreurs ----------------------------------------------------------------------------------------------------------

  function signaler(sc, ts, regle, message, element) {
    var cle = regle + '|' + sc.info.id + '|' + message;
    if (etat.vus[cle]) return;
    etat.vus[cle] = true;
    var texte = 'Scène « ' + sc.info.id + ' », à ' + virgule(Math.max(0, ts)) + ' s : ' + message;
    if (M.erreurs) M.erreurs.push({ regle: regle, scene: sc.info.id, message: texte });
    etat.constats.push({ regle: regle, scene: sc.info.id, element: element || null, instant: r2(sc.info.debut + Math.max(0, ts) / sc.info.rythme), valeur: message });
    console.warn('[Pulse Motion] ' + texte);
  }
  function essayer(sc, ts, fn) {
    try { fn(); } catch (e) { signaler(sc, ts, 'dessin-erreur', (e && e.message) || String(e)); }
  }

  // --- Écritures différentielles ----------------------------------------------------------------------------------------

  function attr(n, nom, valeur) {
    var c = n.__pm || (n.__pm = {});
    var v = valeur === null || valeur === undefined ? null : String(valeur);
    if (c[nom] === v) return;
    c[nom] = v;
    if (v === null) n.removeAttribute(nom); else n.setAttribute(nom, v);
  }
  function styleDe(n, prop, valeur) {
    var c = n.__pms || (n.__pms = {});
    if (c[prop] === valeur) return;
    c[prop] = valeur;
    n.style[prop] = valeur;
  }

  // --- Scènes, calques et étiquettes ------------------------------------------------------------------------------------

  function largeurImage() {
    var p = String((M.donnees && M.donnees.format && M.donnees.format.ratio) || '16:9').split(':').map(Number);
    return p[0] > 0 && p[1] > 0 ? r2(100 * p[0] / p[1]) : 177.78;
  }
  function creerCalque(sc, nom) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pm-calque');
    svg.setAttribute('data-calque', nom);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 ' + sc.L + ' 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    if (sc.position) appliquerPosition(svg, sc.position, sc.L);
    if (nom === 'dessous') sc.conteneur.insertBefore(svg, sc.conteneur.firstChild);
    else sc.conteneur.insertBefore(svg, sc.textes);
    return svg;
  }
  function calqueDe(sc, nom) {
    if (nom === 'dessous') return sc.calques.dessous || (sc.calques.dessous = creerCalque(sc, 'dessous'));
    return sc.calques.dessus;
  }
  function appliquerPosition(el, p, L) {
    el.style.left = p.x + 'cqh';
    el.style.top = p.y + 'cqh';
    el.style.width = L + 'cqh';
    el.style.height = '100cqh';
  }
  function positionner(sc, cadre) {
    var c = sc.conteneur;
    var p = { x: 0, y: 0 };
    if (c !== sc.sec) {
      var cr = c.getBoundingClientRect();
      var k = 100 / (cadre.height || 1);
      p = { x: r3((cadre.left - cr.left - c.clientLeft) * k), y: r3((cadre.top - cr.top - c.clientTop) * k) };
    }
    sc.position = p;
    [sc.calques.dessus, sc.calques.dessous, sc.textes].forEach(function (el) { if (el) appliquerPosition(el, p, sc.L); });
  }
  function mesurerTextes(sc, cadre) {
    var k = 100 / (cadre.height || 1);
    sc.etiquettes.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.__pmTaille = { l: r2(r.width * k), h: r2(r.height * k) };
    });
  }

  function creerScene(info, sec, fns) {
    var conteneur = sec.querySelector('[data-camera]') || sec;
    var cs = getComputedStyle(sec);
    var textes = document.createElement('div');
    textes.className = 'pm-calque-textes';
    conteneur.appendChild(textes);
    var sc = { info: info, sec: sec, conteneur: conteneur, fns: fns, textes: textes, calques: {}, composants: [], libres: {}, etiquettes: [],
      noeuds: new Map(), traces: [], couleurs: {}, temps: {}, L: largeurImage(), releve: null, position: null, mains: [],
      trait: cs.getPropertyValue('--pm-trait').trim() === 'main' ? 'main' : 'net',
      rugosite: Math.max(0, Math.min(3, nombre(cs.getPropertyValue('--pm-rugosite'), 1))),
      courbure: nombre(cs.getPropertyValue('--pm-courbure'), 1),
      ebullition: Math.max(0, nombre(cs.getPropertyValue('--pm-ebullition'), 0)),
      encreStyle: sec.getAttribute('data-encre') === 'style',
      sombre: !!(document.getElementById('pm-scene') && document.getElementById('pm-scene').getAttribute('data-ton') === 'sombre') };
    sc.calques.dessus = creerCalque(sc, 'dessus');
    return sc;
  }
  function adopterEtiquette(sc, el) {
    el.classList.add('pm-calque-texte');
    sc.textes.appendChild(el);
    sc.etiquettes.push(el);
    return el;
  }

  // --- Temps, couleurs, cibles ------------------------------------------------------------------------------------------

  function tempsScene(sc, v) {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null || v === '') return 0;
    var s = String(v).trim();
    if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
    if (Object.prototype.hasOwnProperty.call(sc.temps, s)) {
      var c = sc.temps[s];
      if (c.erreur) throw new Error(c.erreur);
      return c.valeur;
    }
    var info = sc.info;
    var donnee = (M.donnees.scenes || []).filter(function (x) { return x.id === info.id; })[0] || {};
    var liste = [];
    sc.sec.querySelectorAll('[data-pm-cle]').forEach(function (el) { liste.push({ cle: el.getAttribute('data-pm-cle'), start: el.getAttribute('data-start'), dur: el.getAttribute('data-dur') }); });
    liste.push({ cle: '__pm_q', start: s });
    var parScene = {};
    parScene[info.id] = liste;
    var rythme = donnee.rythme || 1;
    var r = M.calculerMinutage([{ id: info.id, duree: donnee.duree || 1, rythme: rythme, transition: 'aucune', voix: donnee.voix }], parScene, { dureeTemps: M.dureeTemps, derniere: false });
    var e = r.erreurs.filter(function (x) { return x.element === '__pm_q'; })[0];
    if (e) {
      var message = 'temps « ' + s + ' » illisible : ' + String(e.message).replace(/^Scène « [^»]* », élément « __pm_q » : /, '');
      sc.temps[s] = { erreur: message };
      throw new Error(message);
    }
    var valeur = (r.elements[info.id].__pm_q.debut - r.scenes[0].debut) * rythme;
    sc.temps[s] = { valeur: valeur };
    return valeur;
  }
  function couleur(sc, nom) {
    nom = nom || 'texte';
    if (Object.prototype.hasOwnProperty.call(sc.couleurs, nom)) return sc.couleurs[nom];
    var v = /^[a-z][a-z0-9-]*$/i.test(nom) ? getComputedStyle(sc.sec).getPropertyValue('--c-' + nom).trim() : '';
    sc.couleurs[nom] = v || nom;
    return sc.couleurs[nom];
  }
  function idsDe(sc) { return (sc.releve ? sc.releve.elements : []).filter(function (e) { return e.id; }).map(function (e) { return e.id; }); }
  function proches(sc, id) {
    var P = M.proches;
    var liste = P ? P.proches(id, idsDe(sc)) : [];
    return liste.length ? ' ; ' + P.phrase(liste.map(function (x) { return '#' + x; })) : '';
  }
  function boiteRelevee(sc, id) {
    var e = (sc.releve ? sc.releve.elements : []).filter(function (x) { return x.id === id; })[0];
    return e ? { x: e.boite.x, y: e.boite.y, l: e.boite.l, h: e.boite.h, forme: e.forme } : null;
  }
  function boiteVivante(sc, id) {
    var el = sc.sec.querySelector('#' + (racine.CSS && CSS.escape ? CSS.escape(id) : id));
    if (!el) return null;
    return M.avecSceneNeutre(sc.sec, function (cadre) {
      var r = el.getBoundingClientRect();
      var k = 100 / (cadre.height || 1);
      var e = boiteRelevee(sc, id);
      return { x: (r.left + r.width / 2 - cadre.left) * k, y: (r.top + r.height / 2 - cadre.top) * k, l: r.width * k, h: r.height * k, forme: e ? e.forme : 'rect' };
    });
  }
  /** '#id' (relevé, ou mesuré à chaque image si suivre), [x, y], « x,y » ou { x, y, l, h } -> boîte ou point ; null si absent. */
  function cible(sc, v, suivre) {
    if (Array.isArray(v)) return { x: Number(v[0]), y: Number(v[1]), l: 0, h: 0 };
    if (v && typeof v === 'object') return { x: Number(v.x), y: Number(v.y), l: Number(v.l) || 0, h: Number(v.h) || 0, forme: v.forme };
    var s = String(v || '').trim();
    var m = /^(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)$/.exec(s);
    if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]), l: 0, h: 0 };
    var id = s.replace(/^#/, '');
    return suivre ? boiteVivante(sc, id) : boiteRelevee(sc, id);
  }

  // --- Tracés -----------------------------------------------------------------------------------------------------------

  function memoire(cle, calcul) {
    var v = etat.cache.get(cle);
    if (v) return v;
    if (etat.cache.size >= CACHE_MAX) etat.cache.clear();
    v = calcul();
    etat.cache.set(cle, v);
    return v;
  }
  function mesureur() {
    if (etat.mesureur) return etat.mesureur;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;left:-10px;top:-10px;width:1px;height:1px;overflow:hidden;visibility:hidden';
    var p = document.createElementNS(NS, 'path');
    svg.appendChild(p);
    document.body.appendChild(svg);
    etat.mesureur = p;
    return p;
  }
  /** Points d'un chemin SVG quelconque, en sous-chemins (un saut entre deux échantillons coupe le chemin). */
  function echantillonner(dSvg, pas, el) {
    var p = el || mesureur();
    var garde = el ? null : p.getAttribute('d');
    if (!el) p.setAttribute('d', dSvg);
    var L = p.getTotalLength();
    var n = Math.max(2, Math.min(400, Math.ceil(L / pas)));
    var sous = [], cour = [], prec = null;
    for (var i = 0; i <= n; i++) {
      var q = p.getPointAtLength(L * i / n);
      var pt = [q.x, q.y];
      if (prec && Math.hypot(pt[0] - prec[0], pt[1] - prec[1]) > 2.5 * L / n) { if (cour.length > 1) sous.push(cour); cour = []; }
      cour.push(pt);
      prec = pt;
    }
    if (cour.length > 1) sous.push(cour);
    if (!el && garde !== null) p.setAttribute('d', garde);
    return { sous: sous, longueur: L };
  }
  function formesDuChemin(dSvg, unite, el) {
    var e = echantillonner(dSvg, unite * 0.5, el);
    return e.sous.map(function (pts) {
      var s = M.mainLevee.simplifier(pts, 0.12 * unite);
      return s.length <= 3 ? { type: 'poly', points: s } : { type: 'lisse', points: s };
    });
  }
  function geometrie(sc, forme, main, g, o) {
    var cle = (main ? 'm' : 'n') + JSON.stringify(forme) + '|' + g + '|' + sc.rugosite + '|' + sc.courbure + '|' + (o.passes || 2);
    return memoire(cle, function () {
      var ML = M.mainLevee;
      if (forme.type === 'chemin') {
        if (!main) { var mes = echantillonner(forme.d, 0.5); return { d: forme.d, longueur: mes.longueur }; }
        var parts = formesDuChemin(forme.d, 1).map(function (f, i) { return ML.mainLevee(f, { graine: g + i, rugosite: sc.rugosite, courbure: sc.courbure }); });
        return { d: parts.map(function (x) { return x.d; }).join(''), longueur: parts.reduce(function (s, x) { return s + x.longueur; }, 0) };
      }
      if (!main) return ML.net(forme);
      return ML.mainLevee(forme, { graine: g, rugosite: sc.rugosite * (o.rugosite === undefined ? 1 : o.rugosite), courbure: sc.courbure, passes: o.passes });
    });
  }
  function boiteDeForme(sc, forme) {
    if (forme.type !== 'chemin') return M.geometrieDessin.boiteDe(forme);
    var pts = [];
    memoire('b' + forme.d, function () { return formesDuChemin(forme.d, 1); }).forEach(function (f) { pts = pts.concat(f.points); });
    return M.geometrieDessin.boiteDe({ type: 'poly', points: pts });
  }
  function union(boites) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    boites.forEach(function (b) { x0 = Math.min(x0, b.x - b.l / 2); y0 = Math.min(y0, b.y - b.h / 2); x1 = Math.max(x1, b.x + b.l / 2); y1 = Math.max(y1, b.y + b.h / 2); });
    return isFinite(x0) ? { x: r2((x0 + x1) / 2), y: r2((y0 + y1) / 2), l: r2(x1 - x0), h: r2(y1 - y0) } : { x: 0, y: 0, l: 0, h: 0 };
  }

  function noeud(sc, cadre, cle, balise, parent) {
    var n = sc.noeuds.get(cle);
    if (!n) {
      n = document.createElementNS(NS, balise);
      n.setAttribute('data-cle', cle);
      sc.noeuds.set(cle, n);
    }
    if (n.parentNode !== parent) parent.appendChild(n);
    cadre.vus.add(cle);
    (cadre.ordres.get(parent) || cadre.ordres.set(parent, []).get(parent)).push(n);
    return n;
  }
  function enfant(n, k, balise) {
    var e = n.__enfants || (n.__enfants = []);
    if (!e[k]) { e[k] = document.createElementNS(NS, balise); n.appendChild(e[k]); }
    return e[k];
  }
  function retirerEnfants(n, depuis) {
    var e = n.__enfants || [];
    for (var k = depuis; k < e.length; k++) if (e[k]) { e[k].remove(); e[k] = null; }
    n.__enfants = e.slice(0, depuis);
  }
  function encre(sc, chemin, opacite) {
    if (sc.encreStyle && etat.peintre) { attr(chemin, 'visibility', 'hidden'); attr(chemin, 'opacity', null); }
    else { attr(chemin, 'visibility', null); attr(chemin, 'opacity', sc.encreStyle ? r3(0.94 * opacite) : (opacite < 1 ? r3(opacite) : null)); }
  }
  /** Révélation d'un trait de longueur L (pathLength) à la part p ; pointillé : tirets de 3 et 2,4 épaisseurs. */
  function reveler(chemin, p, L, pointille, ep) {
    var Lr = Math.max(0.01, r3(L));
    attr(chemin, 'pathLength', Lr);
    if (!pointille) {
      if (p >= 1) { attr(chemin, 'stroke-dasharray', null); attr(chemin, 'stroke-dashoffset', null); }
      else { attr(chemin, 'stroke-dasharray', r3(p * Lr) + ' ' + r3(Lr + 1)); attr(chemin, 'stroke-dashoffset', '0'); }
      return;
    }
    var tiret = 3 * ep, trou = 2.4 * ep;
    var reste = p * Lr, liste = [];
    while (reste > 0 && liste.length < 400) { var t = Math.min(tiret, reste); liste.push(r3(t)); reste -= t; if (reste <= 0) break; var u = Math.min(trou, reste); liste.push(r3(u)); reste -= u; }
    if (liste.length % 2) liste.push(r3(Lr + 1)); else liste.push(0, r3(Lr + 1));
    attr(chemin, 'stroke-dasharray', p >= 1 ? r3(tiret) + ' ' + r3(trou) : liste.join(' '));
    attr(chemin, 'stroke-dashoffset', '0');
  }

  /** Une primitive : { formes: [{ forme, progres, remplir, balaye }], genre, defauts, fleche?, etiquette? } -> sa clé. */
  function tracer(sc, d, genre, o, spec) {
    o = o || {};
    var cadre = sc.cadre;
    var rang = cadre.rangs[genre] = (cadre.rangs[genre] || 0) + 1;
    var cle = cadre.prefixe + (o.id !== undefined ? String(o.id) : genre + '#' + rang);
    var def = spec.defauts || {};
    var ts = cadre.ts;
    var debut = d.temps(o.debut !== undefined ? o.debut : 0);
    var duree = o.duree !== undefined ? Math.max(0, Number(o.duree)) : (def.duree !== undefined ? def.duree : 0.6);
    var fin = o.fin !== undefined && o.fin !== null ? d.temps(o.fin) : null;
    var entree = o.entree || def.entree || 'trace';
    var sortie = o.sortie || (fin !== null ? 'fondu' : 'aucune');
    var calque = o.calque || spec.calque || 'dessus';
    if (cadre.mode === 'releve') {
      // Calque du dessous créé dès le relevé (avant toute image) : la page est la même quel que soit l'ordre des seek.
      if (calque === 'dessous' && !cadre.parents.length) calqueDe(sc, 'dessous');
      var bx = spec.formes.map(function (f) { return boiteDeForme(sc, f.forme); });
      if (spec.fleche) bx.push(M.geometrieDessin.boiteDe({ type: 'poly', points: spec.fleche.geo.pointe(spec.fleche.geo.longueur, 1) }));
      cadre.boites.push({ cle: cle, id: o.id !== undefined ? String(o.id) : null, genre: genre === 'annotation' ? 'trait' : genre, debut: r2(debut), fin: r2(fin !== null ? fin : d.duree), boite: union(bx), forme: 'rect', nu: true });
      if (spec.etiquette && spec.etiquette.__pmTaille && spec.fleche) {
        var tl = spec.etiquette.__pmTaille, pe = spec.fleche.geo.etiquette(tl.l, tl.h);
        cadre.boites.push({ cle: cle + ':etiquette', id: null, genre: 'etiquette', debut: r2(debut), fin: r2(fin !== null ? fin : d.duree), boite: { x: r2(pe.x), y: r2(pe.y), l: tl.l, h: tl.h }, forme: 'rect', nu: false });
      }
      return cle;
    }
    if (ts < debut - 1e-9) return cle;
    var pe2 = duree > 0 ? clamp((ts - debut) / duree) : 1;
    var opacite = o.opacite !== undefined ? clamp(Number(o.opacite)) : 1;
    if (fin !== null && ts >= fin) {
      if (sortie === 'aucune') return cle;
      var q = clamp((ts - fin) / SORTIE);
      if (q >= 1) return cle;
      opacite *= 1 - q;
    }
    var main = o.main !== undefined ? !!o.main : sc.trait === 'main';
    var ep = o.epaisseur !== undefined ? Math.max(0.05, Number(o.epaisseur)) : (def.epaisseur || 0.4);
    var teinte = d.couleur(o.couleur || def.couleur || 'texte');
    var g = M.mainLevee.graine(sc.info.id, cle, main ? M.mainLevee.pasEbullition(ts, sc.ebullition) : 0);
    var parent = cadre.parents.length ? cadre.parents[cadre.parents.length - 1] : calqueDe(sc, calque);
    var n = noeud(sc, cadre, cle, 'g', parent);
    var tracee = entree !== 'trace' ? 1 : spec.fleche ? douce(pe2) : douce(pe2 / 0.78);
    var remplie = entree !== 'trace' ? 1 : clamp((pe2 - 0.42) / 0.58);
    var groupe = opacite;
    if (entree === 'fondu') groupe *= douce(pe2);
    if (entree === 'pop') {
      groupe *= clamp(pe2 * 3);
      var bb = union(spec.formes.map(function (f) { return boiteDeForme(sc, f.forme); }));
      var s = r3(0.6 + 0.4 * arriere(pe2));
      attr(n, 'transform', s === 1 ? null : 'translate(' + bb.x + ' ' + bb.y + ') scale(' + s + ') translate(' + (-bb.x) + ' ' + (-bb.y) + ')');
    } else attr(n, 'transform', null);
    attr(n, 'opacity', groupe < 1 ? r3(groupe) : null);
    var k = 0;
    spec.formes.forEach(function (f, i) {
      var part = f.progres ? f.progres(tracee) : tracee;
      if (f.remplir) {
        // Aplat (surlignage) : il s'étend de gauche à droite (balaye) ou apparaît en fondu ; jamais de mode de fusion.
        var forme = f.forme;
        var pf = f.balaye ? part : remplie;
        if (f.balaye) forme = { type: 'rect', x: forme.x, y: forme.y, l: forme.l * clamp(part), h: forme.h };
        var cheminR = enfant(n, k++, 'path');
        var geoR = M.mainLevee.net(forme);
        attr(cheminR, 'd', pf > 0 ? geoR.d : 'M0 0');
        attr(cheminR, 'fill', teinte);
        attr(cheminR, 'fill-opacity', r3((f.opacite !== undefined ? f.opacite : 1) * (f.balaye ? 1 : pf)));
        attr(cheminR, 'stroke', 'none');
        encre(sc, cheminR, 1);
        cadre.traces.push({ cle: cle + (i ? '/' + i : ''), genre: genre, d: geoR.d, part: r3(pf), epaisseur: 0, couleur: teinte, calque: calque, remplissage: true, opacite: r3(opacite * (f.opacite !== undefined ? f.opacite : 1)) });
        return;
      }
      var geo = geometrie(sc, f.forme, main, g + i, { passes: spec.fleche && main ? 1 : f.passes, rugosite: f.rugosite });
      var chemin = enfant(n, k++, 'path');
      attr(chemin, 'd', geo.d);
      attr(chemin, 'fill', 'none');
      attr(chemin, 'stroke', teinte);
      attr(chemin, 'stroke-width', r3(ep));
      attr(chemin, 'stroke-linecap', 'round');
      attr(chemin, 'stroke-linejoin', 'round');
      attr(chemin, 'visibility', part > 0 ? null : 'hidden');
      reveler(chemin, part, geo.longueur, !!o.pointille, ep);
      if (part > 0) encre(sc, chemin, 1); else attr(chemin, 'opacity', null);
      cadre.traces.push({ cle: cle + (i ? '/' + i : ''), genre: genre, d: geo.d, part: r3(part), epaisseur: r3(ep), couleur: teinte, calque: calque, pointille: !!o.pointille, opacite: r3(opacite) });
      if (f.plein) {
        // Remplissage : hachures à main levée, aplat en tracé net ; de 42 % à 100 % de l'entrée.
        var cp = enfant(n, k++, 'path');
        if (main) {
          var h = memoire('h' + JSON.stringify(f.forme) + '|' + g + '|' + ep, function () { return M.mainLevee.hachures(M.mainLevee.polygoneDe(f.forme), { graine: g + 97, epaisseur: ep, rugosite: sc.rugosite }); });
          attr(cp, 'd', h.d || 'M0 0');
          attr(cp, 'fill', 'none');
          attr(cp, 'fill-opacity', null);
          attr(cp, 'stroke', f.plein);
          attr(cp, 'stroke-width', r3(ep * 0.7));
          attr(cp, 'stroke-linecap', 'round');
          reveler(cp, remplie, h.longueur, false, ep);
          cadre.traces.push({ cle: cle + '/hachures' + (i ? i : ''), genre: genre, d: h.d, part: r3(remplie), epaisseur: r3(ep * 0.7), couleur: f.plein, calque: calque, opacite: r3(opacite) });
        } else {
          var dn = M.mainLevee.net(f.forme).d;
          attr(cp, 'd', dn);
          attr(cp, 'fill', f.plein);
          attr(cp, 'fill-opacity', r3(remplie));
          attr(cp, 'stroke', 'none');
          cadre.traces.push({ cle: cle + '/remplissage' + (i ? i : ''), genre: genre, d: dn, part: r3(remplie), epaisseur: 0, couleur: f.plein, calque: calque, remplissage: true, opacite: r3(opacite * remplie) });
        }
        attr(cp, 'visibility', remplie > 0 ? null : 'hidden');
        if (remplie > 0) encre(sc, cp, 1);
      }
    });
    if (spec.fleche) k = pointes(sc, cadre, n, k, spec.fleche, tracee, { ep: ep, teinte: teinte, main: main, g: g, cle: cle, calque: calque, opacite: opacite });
    retirerEnfants(n, k);
    if (spec.etiquette) poserEtiquette(sc, cadre, spec.etiquette, spec.fleche ? function (l, h) { return spec.fleche.geo.etiquette(l, h); } : spec.positionEtiquette,
      clamp((pe2 - 0.55) / 0.35) * opacite);
    return cle;
  }

  function pointes(sc, cadre, n, k, fl, tracee, o) {
    var geo = fl.geo;
    if (geo.longueur <= 0.1 || tracee <= 0.02) return k;
    var liste = [];
    if (fl.tete === 'fin' || fl.tete === 'deux') liste.push(geo.pointe(geo.longueur * tracee, 1));
    if ((fl.tete === 'debut' || fl.tete === 'deux') && tracee > 0.2) liste.push(geo.pointe(0.001, -1));
    // La pointe garde le même chemin, dans son repère, et se déplace par une transformation : le rendu d'un chemin qui a changé
    // de forme d'une image à l'autre peut différer de quelques pixels selon ce que le navigateur a déjà dessiné.
    var hs = geo.taillePointe;
    var local = [[-hs * Math.cos(0.5), hs * Math.sin(0.5)], [0, 0], [-hs * Math.cos(0.5), -hs * Math.sin(0.5)]];
    liste.forEach(function (pts, j) {
      var chemin = enfant(n, k++, 'path');
      var dPointe;
      var tip = pts[1];
      var angle = Math.atan2(tip[1] - (pts[0][1] + pts[2][1]) / 2, tip[0] - (pts[0][0] + pts[2][0]) / 2) * 180 / Math.PI;
      var transformation = 'translate(' + r3(tip[0]) + ' ' + r3(tip[1]) + ') rotate(' + r3(angle) + ')';
      attr(chemin, 'transform', transformation);
      pts = local;
      if (o.main) {
        dPointe = M.mainLevee.mainLevee({ type: 'poly', points: pts }, { graine: o.g + 7 + j, rugosite: 0.6 * sc.rugosite, courbure: sc.courbure, passes: 1 }).d;
        attr(chemin, 'fill', 'none');
        attr(chemin, 'stroke-width', r3(o.ep));
      } else {
        dPointe = M.mainLevee.net({ type: 'poly', points: pts, ferme: true }).d;
        attr(chemin, 'fill', o.teinte);
        attr(chemin, 'stroke-width', r3(o.ep * 0.6));
      }
      attr(chemin, 'd', dPointe);
      attr(chemin, 'stroke', o.teinte);
      attr(chemin, 'stroke-linecap', 'round');
      attr(chemin, 'stroke-linejoin', 'round');
      attr(chemin, 'visibility', null);
      attr(chemin, 'pathLength', null);
      attr(chemin, 'stroke-dasharray', null);
      attr(chemin, 'stroke-dashoffset', null);
      encre(sc, chemin, 1);
      cadre.traces.push({ cle: o.cle + '/pointe' + (j ? j : ''), genre: 'fleche', d: dPointe, transform: transformation, part: 1, epaisseur: r3(o.main ? o.ep : o.ep * 0.6), couleur: o.teinte, calque: o.calque, remplissage: !o.main, opacite: r3(o.opacite) });
    });
    return k;
  }

  function poserEtiquette(sc, cadre, el, position, opacite) {
    var t = el.__pmTaille || { l: 0, h: 0 };
    var p = position(t.l, t.h);
    styleDe(el, 'left', r2(p.x) + 'cqh');
    styleDe(el, 'top', r2(p.y) + 'cqh');
    styleDe(el, 'opacity', String(r3(opacite)));
    cadre.etiquettesVues.add(el);
  }

  // --- Outil « d » -------------------------------------------------------------------------------------------------------

  function outil(sc, ts) {
    var info = sc.info;
    var d = {};
    d.t = ts;
    d.duree = (info.fin - info.debut) * info.rythme;
    d.L = sc.L;
    d.H = 100;
    d.centre = [sc.L / 2, 50];
    var m = 0.07 * Math.min(sc.L, 100);
    var st = M.donnees && M.donnees.sousTitres;
    var bas = st && st.incrustes !== false && st.position !== 'haut' ? 20 : 0;
    var haut = st && st.incrustes !== false && st.position === 'haut' ? 20 : 0;
    d.zone = { x: r2(m), y: r2(m + haut), l: r2(sc.L - 2 * m), h: r2(100 - 2 * m - bas - haut) };
    d.temps = function (v) { return tempsScene(sc, v); };
    d.p = function (debut, duree, courbe) {
      var x = clamp((ts - d.temps(debut)) / (duree > 0 ? duree : 0.6));
      var nom = courbe || 'sine-inout';
      var c = etat.courbes[nom] || (etat.courbes[nom] = M.courbeNommee(nom));
      return c(x);
    };
    d.depuis = function (v) { return ts - d.temps(v); };
    d.entre = function (a, b) { return ts >= d.temps(a) && ts < d.temps(b); };
    d.hasard = function (i) { return M.mainLevee.alea(M.mainLevee.graine(info.id, 'hasard', i))(); };
    d.bruit = function (x) {
      var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
      var a = M.mainLevee.alea(M.mainLevee.graine(info.id, 'bruit', i))(), b = M.mainLevee.alea(M.mainLevee.graine(info.id, 'bruit', i + 1))();
      return a + (b - a) * u;
    };
    d.ondule = function (ampleur, vitesse) { return (ampleur === undefined ? 1 : ampleur) * (2 * d.bruit(ts * (vitesse === undefined ? 1 : vitesse)) - 1); };
    d.couleur = function (nom) { return couleur(sc, nom); };
    d.boite = function (v) {
      var b = cible(sc, v, false);
      if (!b) throw new Error('« ' + v + ' » n\'est pas un élément de la scène' + proches(sc, String(v).replace(/^#/, '')));
      return b;
    };
    d.trait = function (points, o) {
      o = o || {};
      if (!Array.isArray(points) || points.length < 2) throw new Error('d.trait attend au moins deux points [x, y]');
      var forme = points.length === 2 && !o.lisse ? { type: 'segment', a: points[0], b: points[1] } : { type: o.lisse ? 'lisse' : 'poly', points: points, ferme: !!o.ferme };
      return tracer(sc, d, 'trait', o, { formes: [{ forme: forme }] });
    };
    d.chemin = function (dSvg, o) { return tracer(sc, d, 'trait', o || {}, { formes: [{ forme: { type: 'chemin', d: String(dSvg) } }] }); };
    d.rect = function (o) {
      o = o || {};
      var forme = { type: 'rect', x: Number(o.x) || 0, y: Number(o.y) || 0, l: Number(o.l) || 0, h: Number(o.h) || 0 };
      return tracer(sc, d, 'trait', o, { formes: [{ forme: forme, plein: o.remplir ? d.couleur(o.remplir === true ? o.couleur : o.remplir) : null }] });
    };
    d.ellipse = function (o) {
      o = o || {};
      var forme = { type: 'ellipse', cx: Number(o.x) || 0, cy: Number(o.y) || 0, rx: Number(o.rx !== undefined ? o.rx : o.r) || 0, ry: Number(o.ry !== undefined ? o.ry : o.r) || 0 };
      return tracer(sc, d, 'trait', o, { formes: [{ forme: forme, plein: o.remplir ? d.couleur(o.remplir === true ? o.couleur : o.remplir) : null }] });
    };
    d.fleche = function (de, vers, o) {
      o = o || {};
      var A = cible(sc, de, !!o.suivre), B = cible(sc, vers, !!o.suivre);
      var manque = !A ? de : !B ? vers : null;
      if (manque !== null) {
        var id = String(manque).replace(/^#/, '');
        signaler(sc, ts, 'fleche-cible-introuvable', 'la flèche vise « #' + id + ' », qui n\'est pas dans la scène' + proches(sc, id), o.id || null);
        return null;
      }
      var geo = M.geometrieDessin.fleche(A, B, { courbe: o.courbe, ecart: o.ecart, epaisseur: o.epaisseur });
      var etiquette = typeof o.etiquette === 'string' ? sc.libres[o.etiquette] : o.etiquette || null;
      if (typeof o.etiquette === 'string' && !etiquette) throw new Error('étiquette « ' + o.etiquette + ' » absente : son texte doit être dans le déroulé (scenes[].textes)');
      return tracer(sc, d, 'fleche', o, { formes: [{ forme: geo.forme }], defauts: { duree: 0.7, couleur: 'texte', epaisseur: 0.4 },
        fleche: { geo: geo, tete: ['fin', 'debut', 'deux', 'aucune'].indexOf(o.tete) >= 0 ? o.tete : 'fin' }, etiquette: etiquette });
    };
    d.annoter = function (v, o) {
      o = o || {};
      var type = o.type || 'souligne';
      if (M.geometrieDessin.TYPES_ANNOTATION.indexOf(type) < 0) {
        var P = M.proches;
        var l = P ? P.proches(type, M.geometrieDessin.TYPES_ANNOTATION) : [];
        throw new Error('annotation « ' + type + ' » inconnue' + (l.length ? ' ; ' + P.phrase(l) : ' (' + M.geometrieDessin.TYPES_ANNOTATION.join(', ') + ')'));
      }
      var b = d.boite(v);
      var formes = M.geometrieDessin.annotation(type, b, { marge: o.marge });
      if (type === 'surligne') formes[0].opacite = sc.sombre ? 0.3 : 0.38;
      return tracer(sc, d, 'annotation', o, { formes: formes, calque: formes[0].calque, defauts: { duree: M.geometrieDessin.DUREES_ANNOTATION[type] || 0.6, couleur: 'accent', epaisseur: 0.45 } });
    };
    d.icone = function (nom, o) { return icone(sc, d, String(nom), o || {}); };
    d.etiquette = function (cle, o) {
      o = o || {};
      var el = sc.libres[cle];
      if (!el) throw new Error('étiquette « ' + cle + ' » absente : son texte doit être dans le déroulé (scenes[].textes)');
      var debut = d.temps(o.debut !== undefined ? o.debut : 0);
      if (sc.cadre.mode === 'releve') {
        var t = el.__pmTaille || { l: 0, h: 0 };
        sc.cadre.boites.push({ cle: cle, id: null, genre: 'etiquette', debut: r2(debut), fin: r2(d.duree), boite: { x: r2(Number(o.x) || 0), y: r2(Number(o.y) || 0), l: t.l, h: t.h }, forme: 'rect', nu: false });
        return cle;
      }
      if (ts < debut) return cle;
      var duree = o.duree !== undefined ? Number(o.duree) : 0.4;
      var op = duree > 0 ? douce((ts - debut) / duree) : 1;
      if (o.fin !== undefined) { var fin = d.temps(o.fin); if (ts >= fin) op *= 1 - clamp((ts - fin) / SORTIE); }
      if (o.couleur) styleDe(el, 'color', d.couleur(o.couleur));
      poserEtiquette(sc, sc.cadre, el, function () { return { x: Number(o.x) || 0, y: Number(o.y) || 0 }; }, op);
      return cle;
    };
    d.groupe = function (o, fn) {
      if (typeof o === 'function') { fn = o; o = {}; }
      o = o || {};
      var cadre = sc.cadre;
      var rang = cadre.rangs.groupe = (cadre.rangs.groupe || 0) + 1;
      var cle = cadre.prefixe + (o.id !== undefined ? String(o.id) : 'groupe#' + rang);
      var prefixe = cadre.prefixe;
      var rangs = cadre.rangs;
      cadre.prefixe = cle + '/';
      cadre.rangs = {};
      if (cadre.mode !== 'releve') {
        var parent = cadre.parents.length ? cadre.parents[cadre.parents.length - 1] : calqueDe(sc, o.calque || 'dessus');
        var n = noeud(sc, cadre, cle, 'g', parent);
        var tr = [];
        if (o.x || o.y) tr.push('translate(' + r3(Number(o.x) || 0) + ' ' + r3(Number(o.y) || 0) + ')');
        if (o.rotation) tr.push('rotate(' + r3(Number(o.rotation)) + ')');
        if (o.echelle !== undefined && Number(o.echelle) !== 1) tr.push('scale(' + r3(Number(o.echelle)) + ')');
        attr(n, 'transform', tr.length ? tr.join(' ') : null);
        attr(n, 'opacity', o.opacite !== undefined && Number(o.opacite) < 1 ? r3(clamp(Number(o.opacite))) : null);
        cadre.parents.push(n);
      } else if (o.calque === 'dessous') calqueDe(sc, 'dessous');
      try { fn(d); } finally {
        if (cadre.mode !== 'releve') cadre.parents.pop();
        cadre.prefixe = prefixe;
        cadre.rangs = rangs;
      }
      return cle;
    };
    return d;
  }

  /** Icône Lucide (table embarquée par l'assemblage, donnees.icones) : centre x, y, taille (cqh, 8 par défaut). */
  function icone(sc, d, nom, o) {
    var table = (M.donnees && M.donnees.icones) || {};
    var chemins = table[nom];
    if (!chemins) throw new Error('icône « ' + nom + ' » absente de la page : l\'écrire en toutes lettres, d.icone(\'' + nom + '\'), pour que l\'assemblage l\'embarque');
    var cadre = sc.cadre;
    var rang = cadre.rangs.icone = (cadre.rangs.icone || 0) + 1;
    var cle = cadre.prefixe + (o.id !== undefined ? String(o.id) : 'icone#' + rang);
    var taille = o.taille > 0 ? Number(o.taille) : 8;
    var x = Number(o.x) || 0, y = Number(o.y) || 0;
    var debut = d.temps(o.debut !== undefined ? o.debut : 0);
    if (cadre.mode === 'releve') {
      if (o.calque === 'dessous' && !cadre.parents.length) calqueDe(sc, 'dessous');
      cadre.boites.push({ cle: cle, id: o.id !== undefined ? String(o.id) : null, genre: 'image', debut: r2(debut), fin: r2(d.duree), boite: { x: r2(x), y: r2(y), l: r2(taille), h: r2(taille) }, forme: 'rect', nu: true });
      return cle;
    }
    var ts = cadre.ts;
    if (ts < debut - 1e-9) return cle;
    var duree = o.duree !== undefined ? Number(o.duree) : 0.8;
    var pe = duree > 0 ? clamp((ts - debut) / duree) : 1;
    var entree = o.entree || 'trace';
    var opacite = 1;
    if (o.fin !== undefined) { var fin = d.temps(o.fin); if (ts >= fin) { opacite = 1 - clamp((ts - fin) / SORTIE); if (opacite <= 0) return cle; } }
    var s = taille / 24;
    var teinte = d.couleur(o.couleur || 'texte');
    var parent = cadre.parents.length ? cadre.parents[cadre.parents.length - 1] : calqueDe(sc, o.calque || 'dessus');
    var n = noeud(sc, cadre, cle, 'g', parent);
    attr(n, 'transform', 'translate(' + r3(x - taille / 2) + ' ' + r3(y - taille / 2) + ') scale(' + r3(s) + ')');
    var groupe = opacite * (entree === 'fondu' || entree === 'pop' ? douce(pe) : 1);
    attr(n, 'opacity', groupe < 1 ? r3(groupe) : null);
    var tracee = entree === 'trace' ? douce(pe / 0.78) : 1;
    var remplie = entree === 'trace' ? clamp((pe - 0.42) / 0.58) : 1;
    var ep = (o.epaisseur > 0 ? Number(o.epaisseur) : taille / 12) / s;
    chemins.forEach(function (c, i) {
      var p = enfant(n, i, 'path');
      var plein = c && typeof c === 'object' && c.plein;
      attr(p, 'd', typeof c === 'string' ? c : c.d);
      if (plein) { attr(p, 'fill', teinte); attr(p, 'fill-opacity', r3(remplie)); attr(p, 'stroke', 'none'); }
      else {
        attr(p, 'fill', 'none');
        attr(p, 'stroke', teinte);
        attr(p, 'stroke-width', r3(ep));
        attr(p, 'stroke-linecap', 'round');
        attr(p, 'stroke-linejoin', 'round');
        attr(p, 'pathLength', '1');
        if (tracee >= 1) { attr(p, 'stroke-dasharray', null); attr(p, 'stroke-dashoffset', null); }
        else { attr(p, 'stroke-dasharray', r3(tracee) + ' 2'); attr(p, 'stroke-dashoffset', '0'); }
        attr(p, 'visibility', tracee > 0 ? null : 'hidden');
      }
      encre(sc, p, 1);
      cadre.traces.push({ cle: cle + (i ? '/' + i : ''), genre: 'icone', d: typeof c === 'string' ? c : c.d, part: r3(plein ? remplie : tracee), epaisseur: r3(ep * s), couleur: teinte, calque: o.calque || 'dessus', remplissage: !!plein, opacite: r3(opacite), echelle: r3(s), origine: [r3(x - taille / 2), r3(y - taille / 2)] });
    });
    retirerEnfants(n, chemins.length);
    return cle;
  }

  // --- Composants déclaratifs --------------------------------------------------------------------------------------------

  function tempsElement(sc, el) {
    var cle = el.getAttribute('data-pm-cle');
    var e = cle && M.minutage.elements[sc.info.id] && M.minutage.elements[sc.info.id][cle];
    if (!e) return { debut: 0, duree: null };
    return { debut: (e.debut - sc.info.debut) * sc.info.rythme, duree: (e.fin - e.debut) * sc.info.rythme };
  }
  function composantFleche(sc, el) {
    var m = /^\s*(.+?)\s*(?:→|->)\s*(.+?)\s*$/.exec(el.getAttribute('data-fleche') || '');
    var etiquette = el.querySelector('[data-texte]');
    if (etiquette) adopterEtiquette(sc, etiquette);
    var cle = 'fleche:' + (el.id || el.getAttribute('data-pm-cle') || sc.composants.length);
    return function (d) {
      if (!m) throw new Error('data-fleche « ' + el.getAttribute('data-fleche') + ' » : écrire « #a → #b »');
      var t = tempsElement(sc, el);
      d.fleche(m[1], m[2], { id: cle, debut: t.debut, duree: t.duree !== null ? t.duree : 0.7, courbe: nombre(el.getAttribute('data-fleche-courbe'), 0),
        tete: el.getAttribute('data-fleche-tete') || 'fin', ecart: nombre(el.getAttribute('data-fleche-ecart'), undefined),
        pointille: el.hasAttribute('data-fleche-pointille'), suivre: el.hasAttribute('data-fleche-suivre'), etiquette: etiquette || null,
        couleur: el.getAttribute('data-couleur') || undefined, epaisseur: el.hasAttribute('data-epaisseur') ? nombre(el.getAttribute('data-epaisseur'), 0.4) : undefined });
    };
  }
  function composantAnnotation(sc, el) {
    var cle = 'annoter:' + (el.id || el.getAttribute('data-pm-cle') || sc.composants.length);
    return function (d) {
      var t = tempsElement(sc, el);
      var type = el.getAttribute('data-annoter');
      d.annoter(el.getAttribute('data-cible') || '', { id: cle, type: type, debut: t.debut, duree: t.duree !== null ? t.duree : (M.geometrieDessin.DUREES_ANNOTATION[type] || 0.6),
        couleur: el.getAttribute('data-couleur') || undefined, epaisseur: el.hasAttribute('data-epaisseur') ? nombre(el.getAttribute('data-epaisseur'), 0.45) : undefined });
    };
  }

  /** data-main-levee : la forme est redessinée à main levée, dans son propre repère (unite : unités locales par cqh). */
  function remplacerMainLevee(sc, cadre) {
    var ML = M.mainLevee;
    sc.mains.forEach(function (el, rang) {
      var tag = el.tagName.toLowerCase();
      if (FORMES.indexOf(tag) < 0) return;
      var ctm = el.getScreenCTM && el.getScreenCTM();
      var echelle = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      var unite = (cadre.height / 100) / (echelle || 1);
      var cs = getComputedStyle(el);
      var o = { graine: ML.graine(sc.info.id, el.id || 'main-levee#' + rang), rugosite: Math.max(0, Math.min(3, nombre(cs.getPropertyValue('--pm-rugosite'), 1))),
        courbure: nombre(cs.getPropertyValue('--pm-courbure'), 1), unite: unite };
      var n = function (a) { return parseFloat(el.getAttribute(a)) || 0; };
      var formes;
      if (tag === 'line') formes = [{ type: 'segment', a: [n('x1'), n('y1')], b: [n('x2'), n('y2')] }];
      else if (tag === 'polyline' || tag === 'polygon') {
        var v = String(el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        var pts = [];
        for (var i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
        formes = [{ type: 'poly', points: pts, ferme: tag === 'polygon' }];
      } else if (tag === 'rect') formes = [{ type: 'rect', x: n('x'), y: n('y'), l: n('width'), h: n('height') }];
      else if (tag === 'circle') formes = [{ type: 'ellipse', cx: n('cx'), cy: n('cy'), rx: n('r'), ry: n('r') }];
      else if (tag === 'ellipse') formes = [{ type: 'ellipse', cx: n('cx'), cy: n('cy'), rx: n('rx'), ry: n('ry') }];
      else formes = formesDuChemin(el.getAttribute('d') || '', unite, el);
      var parts = formes.map(function (f, i) { return ML.mainLevee(f, { graine: o.graine + i, rugosite: o.rugosite, courbure: o.courbure, unite: unite }); });
      var dMain = parts.map(function (p) { return p.d; }).join('');
      var rempli = cs.fill && cs.fill !== 'none' && tag !== 'line';
      if (tag === 'path') {
        if (rempli) {
          var fond = el.cloneNode(false);
          fond.removeAttribute('id');
          fond.removeAttribute('data-main-levee');
          fond.setAttribute('stroke', 'none');
          el.parentNode.insertBefore(fond, el);
          el.setAttribute('fill', 'none');
        }
        el.setAttribute('d', dMain);
        el.setAttribute('data-pm-main-levee', '');
        return;
      }
      var nouveau = document.createElementNS(NS, 'path');
      Array.prototype.forEach.call(el.attributes, function (a) {
        if (['x1', 'y1', 'x2', 'y2', 'points', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'data-main-levee'].indexOf(a.name) < 0) nouveau.setAttribute(a.name, a.value);
      });
      nouveau.setAttribute('d', dMain);
      nouveau.setAttribute('data-pm-main-levee', '');
      if (rempli) {
        var g = document.createElementNS(NS, 'g');
        var plein = document.createElementNS(NS, 'path');
        plein.setAttribute('d', formes.map(function (f) { return ML.net(f).d; }).join(''));
        plein.setAttribute('stroke', 'none');
        Array.prototype.forEach.call(nouveau.attributes, function (a) { if (/^(id|class|style)$/.test(a.name)) { g.setAttribute(a.name, a.value); } });
        ['id', 'class', 'style'].forEach(function (a) { nouveau.removeAttribute(a); });
        nouveau.setAttribute('fill', 'none');
        plein.setAttribute('fill', el.getAttribute('fill') || cs.fill);
        g.appendChild(plein);
        g.appendChild(nouveau);
        el.parentNode.replaceChild(g, el);
      } else el.parentNode.replaceChild(nouveau, el);
    });
  }

  // --- Rendu ------------------------------------------------------------------------------------------------------------

  function dessiner(sc, ts, mode) {
    var cadre = { mode: mode, ts: ts, vus: new Set(), ordres: new Map(), traces: [], boites: [], rangs: {}, parents: [], prefixe: '', etiquettesVues: new Set() };
    sc.cadre = cadre;
    var d = outil(sc, ts);
    sc.composants.forEach(function (c) { essayer(sc, ts, function () { c(d); }); });
    sc.fns.forEach(function (fn) { essayer(sc, ts, function () { fn(d); }); });
    if (mode !== 'image') return cadre.boites;
    sc.noeuds.forEach(function (n, cle) { if (!cadre.vus.has(cle)) { n.remove(); sc.noeuds.delete(cle); } });
    // Ordre des nœuds : celui des appels (la même image quel que soit l'ordre des seek).
    cadre.ordres.forEach(function (liste, parent) {
      var attendu = parent.firstChild;
      liste.forEach(function (n) {
        while (attendu && attendu.nodeType === 1 && !attendu.hasAttribute('data-cle')) attendu = attendu.nextSibling;
        if (n !== attendu) parent.insertBefore(n, attendu); else attendu = attendu.nextSibling;
      });
    });
    sc.etiquettes.forEach(function (el) { if (!cadre.etiquettesVues.has(el)) styleDe(el, 'opacity', '0'); });
    sc.traces = cadre.traces;
    if (sc.encreStyle && etat.peintre) {
      var traces = cadre.traces.map(copie);
      essayer(sc, ts, function () { etat.peintre(sc.info.id, traces, { L: sc.L, t: ts }); });
    }
    return cadre.boites;
  }

  function masquer(sc) {
    sc.noeuds.forEach(function (n) { n.remove(); });
    sc.noeuds.clear();
    sc.etiquettes.forEach(function (el) { styleDe(el, 'opacity', '0'); });
    sc.traces = [];
  }

  M.dessinerScene = function (info, t, vu) {
    var sc = etat.scenes[info.id];
    if (!sc) return;
    if (!etat.pret || (M.releveEnCours && M.releveEnCours())) { if (etat.pret === false) masquer(sc); return; }
    var ts = Math.max(0, (vu(sc.calques.dessus) - info.debut) * info.rythme);
    dessiner(sc, ts, 'image');
  };

  M.demarrerDessin = function () {
    if (!M.minutage) return;
    var secs = {};
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) { secs[s.getAttribute('data-scene')] = s; });
    M.minutage.scenes.forEach(function (info) {
      var sec = secs[info.id];
      if (!sec || etat.scenes[info.id]) return;
      var fns = etat.fns[info.id] || [];
      var comps = sec.querySelectorAll('[data-fleche], [data-annoter]');
      var mains = sec.querySelectorAll('[data-main-levee]');
      if (!fns.length && !comps.length && !mains.length) return;
      var sc = creerScene(info, sec, fns);
      sec.querySelectorAll('.pm-calque-texte[data-pm-libre][data-texte]').forEach(function (el) { sc.libres[el.getAttribute('data-texte')] = adopterEtiquette(sc, el); });
      comps.forEach(function (el) { sc.composants.push(el.hasAttribute('data-fleche') ? composantFleche(sc, el) : composantAnnotation(sc, el)); });
      sc.mains = Array.prototype.slice.call(mains);
      etat.scenes[info.id] = sc;
    });
    if (!Object.keys(etat.scenes).length) return;
    M.completerReleve(function (info, sec, releve, cadre) {
      var sc = etat.scenes[info.id];
      if (!sc) return;
      positionner(sc, cadre);
      mesurerTextes(sc, cadre);
      sc.releve = releve;
      sc.temps = {};
      dessiner(sc, Math.max(0, (info.fin - 1e-4 - info.debut) * info.rythme), 'releve').forEach(function (b) { releve.elements.push(b); });
    });
    M.apresReleve(function () { etat.pret = true; });
    M.demarrerReleve(function () {
      Object.keys(etat.scenes).forEach(function (id) {
        var sc = etat.scenes[id];
        if (sc.mains.length) M.avecSceneNeutre(sc.sec, function (cadre) { remplacerMainLevee(sc, cadre); });
      });
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
