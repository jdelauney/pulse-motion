/* Pulse Motion – lecture d'un film figé (spec S6, 5.8) : plan des étapes et image à montrer, fonctions pures de t.
 *
 * Un film (films/<nom>/prise-NN/film.json, ou son bloc embarqué pm-film-<nom>) donne, par étape : le geste du pointeur
 * (point visé, boîte de la cible), les états calmes (avant, vue, survol, après, noms d'images) et les images de la réaction
 * ([[ms, image]], coupes retirées). Le temps entre deux actions est élastique : le data-start d'une marque pm-etape est
 * l'instant de l'action ; sans marque, l'étape se place après la précédente et le temps libre de la scène se partage en
 * parts égales entre les états calmes.
 *
 * gesteDe(etape) -> 'clic' | 'double-clic' | 'survol' | null
 * dureeReaction(etape, cadence) -> s (aller sans images de chargement : fondu de 0,25 s ; « lire » d'une vidéo importée :
 *   sa durée)
 * reperesDe(film) -> repères d'une prise importée ([{ instant, point, boite? }]) : etape:N y désigne le repère N.
 * planifierFilm(film, marques, { etapes, duree, depart, diagonale, vitesse }) -> { etapes: [plan], ecarts, minimum, court }
 *   marques : { n: instant de l'action } ; etapes : numéros montrés (défaut : toutes) ; duree : durée de la scène (vue par
 *   l'écran) ; depart : point de départ du pointeur (px CSS de la page) ; vitesse : facteur de la durée des trajets.
 *   plan d'une étape : { n, geste, point, boite, approche (s), trajet (s), debut (début de l'approche), depart (départ du
 *   pointeur), arrivee, action, fin } ; départ du pointeur = action − 0,35 − trajet (survol : action − trajet).
 *   ecarts : [{ a, b, ecart, minimum }] (numéros d'étapes ; a = 0 : le début de la scène) ; minimum : durée de scène qu'il
 *   faut au moins ; court : la scène est trop courte pour ses étapes.
 * ecartMinimal(planA, planB) -> s : R_a + 0,35 + T_b + 0,2 (et l'approche de b).
 * etatFilm(plan, t) -> { image, fondu: { image, opacite } | null, etape } · imageA(plan, t) -> nom de l'image
 *   avant l'approche : « avant » ; pendant l'approche : l'image de défilement ; jusqu'à l'arrivée du pointeur : « vue » (ou
 *   « avant ») ; de l'arrivée à l'action : « survol » ; pendant la réaction : la dernière image dont l'instant est au plus
 *   (t − action) ; ensuite : « après ». aller sans réaction : fondu de 0,25 s de « avant » vers « après ».
 * gestesDuPlan(plan) -> [{ type, instant, point, etape }] pour M.pointeur.planGestes.
 * Aucune horloge lue. Module pur : chargé dans la page (M.film) et par Node (require).
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var Pt = nodeJS ? require('./pointeur.js') : racine.M.pointeur;
  var api = fabrique(Pt);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.film = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Pt) {
  'use strict';

  var MARGE = 0.2;
  var FONDU = 0.25;
  var GESTES = { cliquer: 'clic', cocher: 'clic', decocher: 'clic', taper: 'clic', vider: 'clic', choisir: 'clic', 'double-cliquer': 'double-clic', survoler: 'survol', defiler: 'survol' };
  var arrondi = function (x) { return Math.round(x * 1000) / 1000; };

  function gesteDe(e) { return e && e.point ? GESTES[e.faire] || null : null; }

  function finImages(liste, cadence) {
    if (!liste || !liste.length) return 0;
    return liste[liste.length - 1][0] / 1000 + 1 / (cadence > 0 ? cadence : 30);
  }

  function dureeReaction(e, cadence) {
    var r = finImages(e.reaction, cadence);
    // Vidéo importée (étape « lire ») : sa durée, la dernière image comprise (une animation garde la durée de chacune).
    if (e.faire === 'lire' && e.duree > 0) return Math.max(r - 1 / (cadence > 0 ? cadence : 30), e.duree / 1000);
    if (!r && e.faire === 'aller') return FONDU;
    // Un clic s'enfonce 0,09 s, un double-clic 0,24 s : la réaction ne finit jamais avant.
    var g = gesteDe(e);
    var appui = g === 'clic' ? Pt.ENFONCE : g === 'double-clic' ? Pt.DOUBLE + Pt.ENFONCE : 0;
    return Math.max(r, appui);
  }

  function parNumero(film) {
    var m = {};
    (film.etapes || []).forEach(function (e) { m[e.n] = e; });
    return m;
  }

  function planifierFilm(film, marques, o) {
    o = o || {};
    marques = marques || {};
    var toutes = parNumero(film);
    var numeros = (o.etapes && o.etapes.length ? o.etapes : (film.etapes || []).map(function (e) { return e.n; })).filter(function (n) { return toutes[n]; });
    var cadence = film.cadence || 30;
    var page = [film.largeur || 1280, film.hauteur || 800];
    var diagonale = o.diagonale || Math.sqrt(page[0] * page[0] + page[1] * page[1]);
    var vitesse = o.vitesse > 0 ? o.vitesse : 1;
    var ici = o.depart || [0.72 * page[0], 0.78 * page[1]];
    var plans = numeros.map(function (n) {
      var e = toutes[n];
      var g = gesteDe(e);
      var trajet = 0;
      if (g) {
        var dx = e.point[0] - ici[0], dy = e.point[1] - ici[1];
        trajet = Pt.dureeTrajet(Math.sqrt(dx * dx + dy * dy), diagonale) * vitesse;
        ici = e.point;
      }
      var approche = finImages(e.approche, cadence);
      var avantAction = approche + (g ? trajet + (g === 'survol' ? 0 : Pt.PAUSE) : 0);
      return { n: n, faire: e.faire, geste: g, point: e.point || null, boite: e.cible && e.cible.boite ? e.cible.boite : null,
        approche: approche, trajet: trajet, avantAction: avantAction, reaction: dureeReaction(e, cadence), etape: e,
        marque: Object.prototype.hasOwnProperty.call(marques, n) && isFinite(marques[n]) ? Number(marques[n]) : null };
    });
    var duree = o.duree > 0 ? o.duree : 0;
    var ecarts = [];
    var court = false;
    // Durée minimale : chaque étape (approche, trajet, réaction), une marge de 0,2 s avant chacune et à la fin.
    var minimum = MARGE;
    plans.forEach(function (p) { minimum += p.avantAction + p.reaction + MARGE; });
    // Placement : les étapes marquées sont des ancres ; entre deux ancres, le temps libre se partage entre les états calmes.
    var k = 0;
    var finPrecedente = 0;
    while (k < plans.length) {
      var j = k;
      while (j < plans.length && plans[j].marque === null) j++;
      var libres = plans.slice(k, j);
      var borne = j < plans.length ? plans[j].marque - plans[j].avantAction : (duree || Infinity);
      var besoin = MARGE * (libres.length + 1);
      libres.forEach(function (p) { besoin += p.avantAction + p.reaction; });
      if (borne === Infinity) borne = finPrecedente + besoin;
      var reste = borne - finPrecedente - besoin;
      if (reste < -1e-9 && !libres.length && j < plans.length) {
        // Deux ancres trop proches (ou la première trop tôt) : l'écart minimal manque.
        var precedente = k > 0 ? plans[k - 1] : null;
        var minimumAB = precedente ? arrondi(precedente.reaction + MARGE + plans[j].avantAction) : arrondi(plans[j].avantAction);
        ecarts.push({ a: precedente ? precedente.n : 0, b: plans[j].n, ecart: arrondi(plans[j].marque - (precedente ? precedente.action : 0)), minimum: minimumAB });
      } else if (reste < -1e-9) {
        if (j < plans.length) {
          var a = libres[libres.length - 1];
          ecarts.push({ a: a.n, b: plans[j].n, ecart: null, minimum: arrondi(a.reaction + MARGE + plans[j].avantAction) });
        } else court = true;
      }
      var pas = MARGE + Math.max(0, reste) / (libres.length + 1);
      var t = finPrecedente + pas;
      libres.forEach(function (p) {
        p.debut = t;
        p.action = t + p.avantAction;
        p.fin = p.action + p.reaction;
        t = p.fin + pas;
      });
      if (j < plans.length) {
        var q = plans[j];
        q.action = q.marque;
        q.debut = q.action - q.avantAction;
        q.fin = q.action + q.reaction;
        finPrecedente = q.fin;
      } else if (libres.length) finPrecedente = libres[libres.length - 1].fin;
      k = j + 1;
    }
    if (duree && plans.length && plans[plans.length - 1].fin + MARGE > duree + 1e-9) court = true;
    plans.forEach(function (p) {
      p.debut = arrondi(p.debut); p.action = arrondi(p.action); p.fin = arrondi(p.fin);
      p.depart = arrondi(p.debut + p.approche);
      p.arrivee = arrondi(p.geste === 'survol' ? p.action : p.geste ? p.action - Pt.PAUSE : p.action);
      delete p.marque;
    });
    return { etapes: plans, ecarts: ecarts, minimum: arrondi(minimum), court: court, cadence: cadence };
  }

  function reperesDe(film) {
    var e = film && film.etapes && film.etapes[0];
    return film && film.etapes && film.etapes.length === 1 && e.faire === 'lire' && Array.isArray(e.reperes) ? e.reperes : null;
  }

  function ecartMinimal(a, b) { return arrondi(a.reaction + MARGE + b.avantAction); }

  function derniereAuPlus(liste, ms) {
    var image = null;
    for (var i = 0; i < liste.length; i++) { if (liste[i][0] <= ms + 1e-6) image = liste[i][1]; else break; }
    return image;
  }

  function calme(e) { return e.vue || e.avant; }

  function etatFilm(plan, t) {
    var etapes = plan.etapes;
    if (!etapes.length) return { image: null, fondu: null, etape: null };
    var k = -1;
    for (var i = 0; i < etapes.length; i++) if (t >= etapes[i].debut - 1e-9) k = i;
    if (k < 0) return { image: etapes[0].etape.avant, fondu: null, etape: etapes[0].n };
    var p = etapes[k];
    var e = p.etape;
    if (t < p.depart && e.approche && e.approche.length) {
      return { image: derniereAuPlus(e.approche, (t - p.debut) * 1000) || e.avant, fondu: null, etape: p.n };
    }
    if (t < p.arrivee) return { image: calme(e), fondu: null, etape: p.n };
    if (t < p.action) return { image: e.survol || calme(e), fondu: null, etape: p.n };
    if (t < p.fin) {
      if (e.reaction && e.reaction.length) return { image: derniereAuPlus(e.reaction, (t - p.action) * 1000) || e.survol || calme(e), fondu: null, etape: p.n };
      if (e.faire === 'aller') return { image: calme(e), fondu: { image: e.apres, opacite: arrondi(Math.min(1, (t - p.action) / FONDU)) }, etape: p.n };
    }
    return { image: e.apres, fondu: null, etape: p.n };
  }

  function imageA(plan, t) { return etatFilm(plan, t).image; }

  function gestesDuPlan(plan) {
    return plan.etapes.filter(function (p) { return p.geste; }).map(function (p) {
      return { type: p.geste, instant: p.action, point: [p.point[0], p.point[1]], etape: p.n };
    });
  }

  /** Images dont l'écran a besoin entre t et t + duree (préchargement). */
  function imagesEntre(plan, t, duree) {
    var noms = {};
    plan.etapes.forEach(function (p) {
      if (p.fin < t || p.debut > t + duree) return;
      var e = p.etape;
      [e.avant, e.vue, e.survol, e.apres].forEach(function (x) { if (x) noms[x] = 1; });
      (e.approche || []).concat(e.reaction || []).forEach(function (r) { noms[r[1]] = 1; });
    });
    return Object.keys(noms);
  }

  return { MARGE: MARGE, FONDU: FONDU, GESTES: GESTES, gesteDe: gesteDe, dureeReaction: dureeReaction, reperesDe: reperesDe, planifierFilm: planifierFilm,
    ecartMinimal: ecartMinimal, etatFilm: etatFilm, imageA: imageA, gestesDuPlan: gestesDuPlan, imagesEntre: imagesEntre };
});
