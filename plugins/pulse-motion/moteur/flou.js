/* Pulse Motion – flou de mouvement par sous-images (spec Rendu et export, 5.8).
 *
 * Une image floue est la moyenne de N captures prises autour de son instant, obturateur à 180° (s = 0,5) :
 *   t_k = n / ips + ((k + 0,5) / N − 0,5) × s / ips, k de 0 à N − 1, bornés à [0, durée),
 * jamais à travers une coupe (scène voisine entrée sans transition : sous-images ramenées dans la scène de n / ips).
 * N adaptatif, d'après le plus grand déplacement en pixels de sortie, entre t et t + 1 / ips, d'un bord de la boîte d'un
 * élément visible (tweens, caméra, transitions, personnages ; particules exclues, leur simulation a son propre pas) :
 * N = 1 sous 4 px ; 4 jusqu'à 20 px ; ⌈px / 5⌉ au-delà, 16 au plus ; N = 1 si les seuls éléments rapides sont des
 * textes (data-texte) à moins de 20 px par image (un texte à lire n'est jamais flouté).
 * Formule centrée et N adaptatif : video-director (references/craft.md § 12, MIT, © win4r) ; sous-images moyennées :
 * take-one (scripts/export.mjs, MIT, © Tal Siach). Réécrits.
 *
 * instants(n, ips, N, { obturateur?, duree, scenes }) -> [t_k]   (scenes : minutage, { debut, fin, entree })
 * sousImages({ px, pxHorsTexte }) -> N
 * Dans la page (global M.flou) : vitesse(t, dt, echelle) -> { px, pxHorsTexte } ;
 *   nParImage(images, ips, echelle) -> [N] pour les images demandées (indices croissants), par une marche en avant
 *   (M.rendre), boîtes de l'image suivante réutilisées ; l'instant courant est remis à la fin. Même fonction dans les deux
 *   voies d'export : les mêmes N pour la même mise en page.
 * Module pur : chargé dans la page (tronc du moteur) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.flou = api; racine.M.vitesseMax = api.vitesse; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var G = typeof globalThis !== 'undefined' ? globalThis : {};

  var OBTURATEUR = 0.5;
  var N_MAX = 16;
  var SEUIL_FLOU = 4;
  var SEUIL_QUATRE = 20;

  function sousImages(v) {
    var px = (v && v.px) || 0;
    var hors = v && typeof v.pxHorsTexte === 'number' ? v.pxHorsTexte : px;
    if (px < SEUIL_FLOU) return 1;
    if (hors < SEUIL_FLOU && px < SEUIL_QUATRE) return 1;
    if (px <= SEUIL_QUATRE) return 4;
    return Math.min(N_MAX, Math.ceil(px / 5));
  }

  /** Bornes [bas, haut) où les sous-images de l'instant t0 peuvent aller : la scène de t0, si une coupe la sépare de ses voisines. */
  function bornes(t0, scenes, duree) {
    var bas = 0;
    var haut = duree;
    if (!scenes || !scenes.length) return [bas, haut];
    var i = 0;
    for (var j = 0; j < scenes.length; j++) if (scenes[j].debut <= t0 + 1e-9) i = j;
    var s = scenes[i];
    var suivante = scenes[i + 1];
    if (i > 0 && !(s.entree > 0)) bas = Math.max(bas, s.debut);
    if (suivante && !(suivante.entree > 0)) haut = Math.min(haut, suivante.debut);
    return [bas, haut];
  }

  function instants(n, ips, N, o) {
    o = o || {};
    var s = typeof o.obturateur === 'number' ? o.obturateur : OBTURATEUR;
    var duree = typeof o.duree === 'number' ? o.duree : Infinity;
    var t0 = n / ips;
    var b = bornes(t0, o.scenes, duree);
    // Une sous-image ne touche jamais la borne haute (l'image suivante, ou la scène d'après la coupe).
    var marge = 1e-6;
    var liste = [];
    for (var k = 0; k < N; k++) {
      var t = t0 + ((k + 0.5) / N - 0.5) * s / ips;
      t = Math.max(b[0], Math.min(b[1] - marge, t));
      liste.push(Math.round(t * 1e7) / 1e7);
    }
    return liste;
  }

  /** Boîtes des éléments des scènes affichées (pixels de sortie) : Map(élément -> [gauche, haut, droite, bas, texte]). */
  function boites(echelle) {
    var r = new Map();
    var sections = document.querySelectorAll('#pm-scene > section[data-scene]');
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      if (sec.style.display === 'none') continue;
      var tous = [sec].concat(Array.prototype.slice.call(sec.querySelectorAll('*')));
      for (var j = 0; j < tous.length; j++) {
        var el = tous[j];
        // Calques de particules : leur simulation avance par pas de 1/120 s, ils ne comptent pas.
        if (el.tagName === 'CANVAS' || el.closest('[data-effet],[data-milieu]')) continue;
        var b = el.getBoundingClientRect();
        if (!(b.width > 0 && b.height > 0)) continue;
        r.set(el, [b.left * echelle, b.top * echelle, b.right * echelle, b.bottom * echelle, !!el.closest('[data-texte]')]);
      }
    }
    return r;
  }

  function deplacement(a, b) {
    var px = 0;
    var hors = 0;
    a.forEach(function (x, el) {
      var y = b.get(el);
      if (!y) return;
      var d = Math.max(Math.abs(y[0] - x[0]), Math.abs(y[1] - x[1]), Math.abs(y[2] - x[2]), Math.abs(y[3] - x[3]));
      if (d > px) px = d;
      if (!x[4] && d > hors) hors = d;
    });
    return { px: Math.round(px * 100) / 100, pxHorsTexte: Math.round(hors * 100) / 100 };
  }

  function mesurer(t, echelle) {
    G.M.rendre(t);
    return boites(echelle);
  }

  function vitesse(t, dt, echelle) {
    var M = G.M;
    var depart = M.temps();
    try {
      var a = mesurer(t, echelle || 1);
      var b = mesurer(Math.min(M.duree, t + dt), echelle || 1);
      return deplacement(a, b);
    } finally { M.rendre(depart); }
  }

  function nParImage(images, ips, echelle) {
    var M = G.M;
    var depart = M.temps();
    var e = echelle || 1;
    var cache = null;
    var resultat = [];
    try {
      for (var i = 0; i < images.length; i++) {
        var n = images[i];
        var a = cache && cache.n === n ? cache.b : mesurer(n / ips, e);
        var b = mesurer(Math.min(M.duree, (n + 1) / ips), e);
        cache = { n: n + 1, b: b };
        resultat.push(sousImages(deplacement(a, b)));
      }
    } finally { M.rendre(depart); }
    return resultat;
  }

  return { OBTURATEUR: OBTURATEUR, N_MAX: N_MAX, sousImages: sousImages, instants: instants, bornes: bornes, vitesse: vitesse, nParImage: nParImage, deplacement: deplacement };
});
