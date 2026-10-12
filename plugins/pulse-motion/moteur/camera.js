/* Pulse Motion – caméra (attribut data-camera) et parallaxe (data-profondeur).
 *
 *   <div data-camera="zoom 1→1.06 0+4; x 50→44 3+0.3 cubic-out; secousse 1.2 12+0.2"> … </div>
 *
 * Chaque clause : propriété, valeur de départ → valeur d'arrivée, plage « début+durée »
 * (secondes de la scène, ou temps musicaux « 2t »), courbe facultative (sine-inout par défaut).
 * Secousse : « secousse <amplitude en cqh> <début>+<durée> », amortie jusqu'à la fin de sa plage.
 *   zoom : 1 = cadre normal · x, y : point visé, en % de l'image · rotation : degrés
 *   saturation : 1 = normale, 0 = gris · flou : cqh
 * Avant la première clause d'une propriété, sa valeur de départ ; après la dernière, sa valeur d'arrivée.
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var C = nodeJS ? require('./courbes.js') : racine.M;
  var Mi = nodeJS ? require('./minutage.js') : racine.M;
  var api = fabrique(C, Mi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, Mi) {
  'use strict';

  var NEUTRES = { zoom: 1, x: 50, y: 50, rotation: 0, saturation: 1, flou: 0 };
  var PROPRIETES = ['zoom', 'x', 'y', 'rotation', 'saturation', 'flou', 'secousse'];
  var VALEUR = /^-?\d*\.?\d+$/;
  var PLAGE = /^([^+]+)\+([^+]+)$/;

  function arrondi(x) { return Math.round(x * 10000) / 10000; }

  function lireValeur(texte, clause) {
    if (texte === '') throw new Error('data-camera : valeur manquante dans « ' + clause + ' ».');
    if (!VALEUR.test(texte)) throw new Error('data-camera : valeur « ' + texte + ' » illisible dans « ' + clause + ' » (nombre sans unité, ex. 1.06, 44, -5).');
    return parseFloat(texte);
  }

  function lireTemps(texte, clause, dureeTemps) {
    var lu = Mi.lireSecondes(texte, dureeTemps);
    if (lu.erreur === 'tempo-absent') throw new Error('data-camera : « ' + texte + ' » est en temps musicaux, mais le déroulé n\'a pas de « tempo » (clause « ' + clause + ' »).');
    if (lu.erreur) throw new Error('data-camera : temps « ' + texte + ' » illisible dans « ' + clause + ' » (ex. 1.5, ou 2t avec un tempo).');
    return lu.valeur;
  }

  /** "zoom 1→1.06 0+4; secousse 1 2+0.2" -> [{ prop, de, a, debut, duree, nomCourbe, courbe }] */
  function analyserCamera(texte, dureeTemps) {
    return String(texte).split(';').map(function (s) { return s.trim(); }).filter(Boolean).map(function (clause) {
      var morceaux = clause.replace(/->/g, '→').split(/\s+/);
      var prop = morceaux[0];
      if (PROPRIETES.indexOf(prop) < 0) {
        throw new Error('data-camera : propriété « ' + prop + ' » inconnue (' + PROPRIETES.join(', ') + ') dans « ' + clause + ' ».');
      }
      var de, a;
      if (prop === 'secousse') {
        de = a = lireValeur(morceaux[1] || '', clause);
        if (!(de > 0)) throw new Error('data-camera : l\'amplitude de la secousse doit être supérieure à 0 (en cqh) dans « ' + clause + ' ».');
      } else {
        if (!morceaux[1] || morceaux[1].indexOf('→') < 0) throw new Error('data-camera : clause « ' + clause + ' » attendue sous la forme « propriété départ→arrivée début+durée [courbe] ».');
        var bornes = morceaux[1].split('→');
        de = lireValeur(bornes[0], clause);
        a = lireValeur(bornes[1], clause);
        if (prop === 'zoom' && !(de > 0 && a > 0)) throw new Error('data-camera : le zoom doit rester supérieur à 0 dans « ' + clause + ' ».');
        if ((prop === 'saturation' || prop === 'flou') && (de < 0 || a < 0)) throw new Error('data-camera : ' + prop + ' ne peut pas être négatif dans « ' + clause + ' ».');
      }
      var plage = PLAGE.exec(morceaux[2] || '');
      if (!plage) throw new Error('data-camera : plage « début+durée » manquante dans « ' + clause + ' » (ex. 0+4, 2t+1t).');
      var nomCourbe = morceaux[3] || 'sine-inout';
      return {
        prop: prop, de: de, a: a,
        debut: lireTemps(plage[1], clause, dureeTemps),
        duree: lireTemps(plage[2], clause, dureeTemps),
        nomCourbe: nomCourbe,
        courbe: C.courbeNommee(nomCourbe),
      };
    });
  }

  function valeur(clauses, prop, tau) {
    var liste = clauses.filter(function (c) { return c.prop === prop; }).sort(function (x, y) { return x.debut - y.debut; });
    if (!liste.length) return NEUTRES[prop];
    var courante = null;
    liste.forEach(function (c) { if (c.debut <= tau) courante = c; });
    if (!courante) return liste[0].de;
    var p = courante.duree > 0 ? Math.min(1, (tau - courante.debut) / courante.duree) : 1;
    return courante.de + (courante.a - courante.de) * courante.courbe(p);
  }

  /** État de la caméra au temps tau (secondes de la scène). */
  function etatCamera(clauses, tau) {
    var e = {};
    Object.keys(NEUTRES).forEach(function (prop) { e[prop] = arrondi(valeur(clauses, prop, tau)); });
    var sx = 0, sy = 0;
    clauses.forEach(function (c) {
      if (c.prop !== 'secousse' || tau < c.debut || tau >= c.debut + c.duree || !(c.duree > 0)) return;
      var force = c.de * (1 - (tau - c.debut) / c.duree);
      var w = 2 * Math.PI * tau;
      sx += force * (0.6 * Math.sin(13 * w) + 0.4 * Math.sin(29 * w + 1.3));
      sy += force * (0.6 * Math.sin(17 * w + 0.7) + 0.4 * Math.sin(23 * w + 2.1));
    });
    e.sx = arrondi(sx);
    e.sy = arrondi(sy);
    return e;
  }

  /** -> { transform, filter, dx, dy } ; dx, dy : écart du point visé au centre, en % de l'image (parallaxe). */
  function styleCamera(e) {
    var filtres = [];
    if (e.saturation !== 1) filtres.push('saturate(' + e.saturation + ')');
    if (e.flou > 0) filtres.push('blur(' + e.flou + 'cqh)');
    return {
      transform: 'translate(' + e.sx + 'cqh, ' + e.sy + 'cqh) translate(50%, 50%) scale(' + e.zoom + ') rotate(' + e.rotation + 'deg) translate(-' + e.x + '%, -' + e.y + '%)',
      filter: filtres.length ? filtres.join(' ') : 'none',
      dx: arrondi(e.x - 50),
      dy: arrondi(e.y - 50),
    };
  }

  return { analyserCamera: analyserCamera, etatCamera: etatCamera, styleCamera: styleCamera, PROPRIETES_CAMERA: PROPRIETES };
});
