/* Pulse Motion – obstacles des collisions de particules.
 *
 * Déclarations (assemblage et page) :
 *   lireDeclaration(attrs) -> null | { obstacle } | { erreur }    attributs d'une balise (noms en minuscules)
 *     data-obstacle : '' (boîte de l'élément) | 'forme' | 'video' | 'forme video'
 *     data-obstacle-forme : 'ligne' (data-de, data-a) | 'cercle' (data-centre, data-rayon) | 'rectangle' (data-de, data-a, data-angle)
 *   lireObstaclesVideo(liste) -> { obstacles, erreurs, enTrop }   « obstacles » de deroule.json (8 au plus)
 * Coordonnées en cqh depuis le coin haut gauche de la scène, angles en degrés.
 *
 * Module pur : chargé tel quel dans la page (global M.obstacles) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.obstacles = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_SCENE = 16;
  var MAX_VIDEO = 8;
  var FORMES = ['ligne', 'cercle', 'rectangle'];
  var CHAMPS_VIDEO = { sol: ['type', 'a'], ligne: ['type', 'de', 'a'], cercle: ['type', 'centre', 'rayon'], rectangle: ['type', 'de', 'a', 'angle'] };
  var NOMBRE = /^[-+]?(\d+\.?\d*|\.\d+)$/;

  function possede(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function nombreTexte(t) {
    var s = String(t === undefined || t === null ? '' : t).trim();
    return NOMBRE.test(s) ? Number(s) : null;
  }
  function paireTexte(t) {
    var m = String(t === undefined || t === null ? '' : t).trim().split(/[\s,]+/);
    if (m.length !== 2) return null;
    var x = nombreTexte(m[0]);
    var y = nombreTexte(m[1]);
    return x === null || y === null ? null : [x, y];
  }
  function estNombre(v) { return typeof v === 'number' && isFinite(v); }
  function estPaire(v) { return Array.isArray(v) && v.length === 2 && estNombre(v[0]) && estNombre(v[1]); }
  function memePoint(a, b) { return a[0] === b[0] && a[1] === b[1]; }

  function lireDeclaration(a) {
    var obstacle = possede(a, 'data-obstacle');
    var forme = possede(a, 'data-obstacle-forme');
    if (!obstacle && !forme) return null;
    if (obstacle && forme) return { erreur: 'data-obstacle et data-obstacle-forme ne vont pas sur la même balise (un élément de la scène, ou une forme invisible).' };
    if (obstacle) {
      var mots = String(a['data-obstacle']).trim().split(/\s+/).filter(Boolean);
      if (mots.some(function (m) { return m !== 'forme' && m !== 'video'; })) {
        return { erreur: 'data-obstacle « ' + a['data-obstacle'] + ' » : valeurs possibles « » (boîte de l\'élément), « forme », « video », « forme video ».' };
      }
      return { obstacle: { genre: mots.indexOf('forme') >= 0 ? 'forme' : 'element', video: mots.indexOf('video') >= 0 } };
    }
    var g = String(a['data-obstacle-forme']).trim();
    if (FORMES.indexOf(g) < 0) return { erreur: 'data-obstacle-forme « ' + g + ' » inconnue (' + FORMES.join(', ') + ').' };
    if (g === 'cercle') {
      var c = paireTexte(a['data-centre']);
      var r = nombreTexte(a['data-rayon']);
      if (!c) return { erreur: 'cercle : data-centre="x y" (cqh) attendu.' };
      if (r === null || r <= 0) return { erreur: 'cercle : data-rayon positif (cqh) attendu.' };
      return { obstacle: { genre: 'cercle', video: false, centre: c, rayon: r } };
    }
    var de = paireTexte(a['data-de']);
    var fin = paireTexte(a['data-a']);
    if (!de || !fin) return { erreur: g + ' : data-de="x y" et data-a="x y" (cqh) attendus.' };
    if (g === 'ligne') {
      if (memePoint(de, fin)) return { erreur: 'ligne : data-de et data-a confondus.' };
      return { obstacle: { genre: 'ligne', video: false, de: de, a: fin } };
    }
    var angle = possede(a, 'data-angle') ? nombreTexte(a['data-angle']) : 0;
    if (angle === null) return { erreur: 'rectangle : data-angle en degrés attendu.' };
    if (de[0] === fin[0] || de[1] === fin[1]) return { erreur: 'rectangle : data-de et data-a sont deux coins opposés (largeur et hauteur non nulles).' };
    return { obstacle: { genre: 'rectangle', video: false, de: de, a: fin, angle: angle } };
  }

  function lireObstacleVideo(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { erreur: 'doit être un objet.' };
    if (!possede(CHAMPS_VIDEO, o.type)) return { erreur: ': « type » parmi ' + Object.keys(CHAMPS_VIDEO).join(', ') + '.' };
    var champs = CHAMPS_VIDEO[o.type];
    var inconnu = Object.keys(o).filter(function (k) { return champs.indexOf(k) < 0; })[0];
    if (inconnu !== undefined) return { erreur: ': champ « ' + inconnu + ' » inconnu (champs de ' + o.type + ' : ' + champs.join(', ') + ').' };
    if (o.type === 'sol') {
      if (!estNombre(o.a)) return { erreur: ': sol : « a » = hauteur du sol en cqh depuis le haut (ex. 92).' };
      return { obstacle: { type: 'sol', a: o.a } };
    }
    if (o.type === 'cercle') {
      if (!estPaire(o.centre) || !estNombre(o.rayon) || o.rayon <= 0) return { erreur: ': cercle : « centre » = [x, y] et « rayon » positif, en cqh.' };
      return { obstacle: { type: 'cercle', centre: o.centre.slice(), rayon: o.rayon } };
    }
    if (!estPaire(o.de) || !estPaire(o.a)) return { erreur: ': ' + o.type + ' : « de » et « a » = [x, y] en cqh.' };
    if (o.type === 'ligne') {
      if (memePoint(o.de, o.a)) return { erreur: ': ligne : « de » et « a » confondus.' };
      return { obstacle: { type: 'ligne', de: o.de.slice(), a: o.a.slice() } };
    }
    if (o.angle !== undefined && !estNombre(o.angle)) return { erreur: ': rectangle : « angle » en degrés.' };
    if (o.de[0] === o.a[0] || o.de[1] === o.a[1]) return { erreur: ': rectangle : « de » et « a » sont deux coins opposés (largeur et hauteur non nulles).' };
    return { obstacle: { type: 'rectangle', de: o.de.slice(), a: o.a.slice(), angle: o.angle === undefined ? 0 : o.angle } };
  }

  function lireObstaclesVideo(liste) {
    var r = { obstacles: [], erreurs: [], enTrop: 0 };
    if (liste === undefined) return r;
    if (!Array.isArray(liste)) { r.erreurs.push('« obstacles » doit être une liste, ex. [{ "type": "sol", "a": 92 }].'); return r; }
    liste.forEach(function (o, i) {
      var lu = lireObstacleVideo(o);
      if (lu.erreur) { r.erreurs.push('« obstacles[' + i + '] » ' + lu.erreur.replace(/^: /, ': ')); return; }
      if (r.obstacles.length >= MAX_VIDEO) { r.enTrop++; return; }
      r.obstacles.push(lu.obstacle);
    });
    return r;
  }

  return {
    MAX_SCENE: MAX_SCENE,
    MAX_VIDEO: MAX_VIDEO,
    lireDeclaration: lireDeclaration,
    lireObstaclesVideo: lireObstaclesVideo,
  };
});
