/* Pulse Motion – caméra (attribut data-camera) et parallaxe (data-profondeur).
 *
 *   <div data-camera="zoom 1→1.06 0+4; x 50→44 3+0.3 cubic-out; secousse 1.2 12+0.2"> … </div>
 *
 * Chaque clause : propriété, valeur de départ → valeur d'arrivée, plage « début+durée »
 * (secondes de la scène, ou temps musicaux « 2t »), courbe facultative (sine-inout par défaut).
 * Zoom continu (« zoom 1→6 0+4 log ») : jeton « log » après la plage, avant ou après la courbe ; le zoom avance alors
 * en échelle logarithmique (chaque doublement prend le même temps). Sans « log », interpolation linéaire.
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
      // Après la plage : la courbe et le jeton « log » (zoom seulement), dans n'importe quel ordre.
      var reste = morceaux.slice(3);
      var log = reste.indexOf('log') >= 0;
      if (log && prop !== 'zoom') throw new Error('data-camera : « log » ne vaut que pour le zoom, dans « ' + clause + ' ».');
      reste = reste.filter(function (m) { return m !== 'log'; });
      var nomCourbe = reste[0] || 'sine-inout';
      var c = {
        prop: prop, de: de, a: a,
        debut: lireTemps(plage[1], clause, dureeTemps),
        duree: lireTemps(plage[2], clause, dureeTemps),
        nomCourbe: nomCourbe,
        courbe: C.courbeNommee(nomCourbe),
      };
      if (log) c.log = true;
      return c;
    });
  }

  function valeur(clauses, prop, tau) {
    var liste = clauses.filter(function (c) { return c.prop === prop; }).sort(function (x, y) { return x.debut - y.debut; });
    if (!liste.length) return NEUTRES[prop];
    var courante = null;
    liste.forEach(function (c) { if (c.debut <= tau) courante = c; });
    if (!courante) return liste[0].de;
    var p = courante.duree > 0 ? Math.min(1, (tau - courante.debut) / courante.duree) : 1;
    if (courante.log) return Math.exp(Math.log(courante.de) + (Math.log(courante.a) - Math.log(courante.de)) * courante.courbe(p));
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
      transform: 'translate(' + e.sx + 'cqh, ' + e.sy + 'cqh) translate(50%, 50%) scale(' + e.zoom + ') rotate(' + e.rotation + 'deg) translate(' + arrondi(-e.x) + '%, ' + arrondi(-e.y) + '%)',
      filter: filtres.length ? filtres.join(' ') : 'none',
      dx: arrondi(e.x - 50),
      dy: arrondi(e.y - 50),
    };
  }

  // Zooms ciblés et enchaînés (spec S6, 5.11 ; réutilisés par la caméra automatique de S7). Logique d'enchaînement de argo
  // (src/camera-move.ts : CHAIN_GAP_MS = 1500, CHAIN_PAN_MS = 1000, detectChainedPairs, courbe 1 − (1 − p)³ ; MIT,
  // Shreyas Karnik), traduite des expressions ffmpeg en clauses de caméra.
  var ZOOM = { entree: 0.4, ecart: 1.5, panoramique: 1, part: 0.4, min: 1.3, max: 2.5, courbe: 'cubic-out' };

  /** Échelle d'un zoom : la cible occupe 40 % de la largeur (part : largeur de la cible ÷ largeur du cadre), de 1,3 à 2,5. */
  function echelleZoom(part, echelle) {
    if (echelle > 0) return echelle;
    var s = part > 0 ? ZOOM.part / part : ZOOM.max;
    return arrondi(Math.max(ZOOM.min, Math.min(ZOOM.max, s)));
  }

  /** Point visé (en %) gardé assez loin des bords pour que l'image zoomée couvre toujours le cadre. */
  function centreZoom(x, y, s) {
    var m = s > 1 ? 50 / s : 50;
    return [arrondi(Math.max(m, Math.min(100 - m, x))), arrondi(Math.max(m, Math.min(100 - m, y)))];
  }

  function clause(prop, de, a, debut, duree) {
    return { prop: prop, de: de, a: a, debut: arrondi(debut), duree: arrondi(Math.max(0.01, duree)), nomCourbe: ZOOM.courbe, courbe: C.courbeNommee(ZOOM.courbe) };
  }

  /** Trois clauses (zoom, x, y) d'un mouvement de A vers B. */
  function mouvement(a, b, debut, duree) {
    return [clause('zoom', a.echelle, b.echelle, debut, duree), clause('x', a.x, b.x, debut, duree), clause('y', a.y, b.y, debut, duree)];
  }

  /**
   * enchainerZooms([{ debut, fin, echelle, x, y }]) -> clauses de caméra (analyserCamera) : entrée et sortie de 0,4 s en
   * cubic-out ; deux zooms (d'échelle > 1) dont le second commence au plus 1,5 s après la fin du premier ne repassent pas
   * par le plan large : un panoramique d'au plus 1 s, échelle comprise, va d'une cible à l'autre et finit avec l'entrée du
   * second ; au-delà de 1,5 s, retour à 1. x, y : point visé en % du cadre (recentré pour couvrir le cadre).
   */
  function enchainerZooms(liste) {
    var LARGE = { echelle: 1, x: 50, y: 50 };
    var zooms = (liste || []).filter(function (z) { return z && z.fin > z.debut; }).map(function (z) {
      var s = Math.max(1, Number(z.echelle) || 1);
      var c = centreZoom(Number(z.x), Number(z.y), s);
      return { debut: z.debut, fin: z.fin, echelle: s, x: c[0], y: c[1] };
    }).sort(function (a, b) { return a.debut - b.debut; });
    var clauses = [];
    var courant = null;
    var libre = -Infinity;
    zooms.forEach(function (z, i) {
      var suivant = zooms[i + 1];
      if (courant) {
        // Panoramique depuis le zoom précédent, enchaîné : au plus 1 s, fini quand l'entrée du zoom aurait fini.
        var fin = Math.max(z.debut + ZOOM.entree, libre + 0.2);
        var debut = Math.max(libre, fin - ZOOM.panoramique, courant.fin - ZOOM.entree);
        if (debut > fin - 0.2) debut = fin - 0.2;
        if (debut < libre) debut = libre;
        clauses.push.apply(clauses, mouvement(courant, z, debut, fin - debut));
        libre = fin;
      } else {
        var depart = Math.max(z.debut, libre);
        clauses.push.apply(clauses, mouvement(LARGE, z, depart, ZOOM.entree));
        libre = depart + ZOOM.entree;
      }
      var enchaine = suivant && suivant.debut - z.fin <= ZOOM.ecart && z.echelle > 1 && suivant.echelle > 1;
      if (enchaine) { courant = z; return; }
      var sortie = Math.max(libre, z.fin - ZOOM.entree);
      clauses.push.apply(clauses, mouvement(z, LARGE, sortie, ZOOM.entree));
      libre = sortie + ZOOM.entree;
      courant = null;
    });
    return clauses;
  }

  return { analyserCamera: analyserCamera, etatCamera: etatCamera, styleCamera: styleCamera, PROPRIETES_CAMERA: PROPRIETES,
    enchainerZooms: enchainerZooms, echelleZoom: echelleZoom, centreZoom: centreZoom, ZOOM: ZOOM };
});
