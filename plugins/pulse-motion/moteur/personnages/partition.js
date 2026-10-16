/* Pulse Motion – partition d'un personnage dans une scène : ses actions minutées -> sa pose à l'instant t (pur).
 *
 *   var e = M.partition.etatAuTemps(partition, t, bibliotheque, gabarit);   // { pose, x, vue, corps }
 *
 * partition = { x0, sol0?, vue0, calme, largeur, hauteur?, echelle, sols?, actions: [{ type, debut, fin, vers?, sol?, hauteur?,
 *   courbe?, pose?, clip?, vue?, expression?, bouche?, piste? }] }
 *   temps absolus (résolus par le minutage) ; x en % de la largeur de la scène ; largeur et hauteur en unités de la scène ;
 *   echelle : unités de scène par unité du squelette ; sol (ligne des pieds) : % de la hauteur, ou « #id » d'un tracé dont
 *   sols[id](x) donne la hauteur (sol courbe).
 * - Position (x, sol) : x0 et sol0, puis interpolés pendant chaque trajet, gardés après. Trajets : « marcher », « courir »
 *   (démarche : « clip », mouvement en boucle), « glisser » (sans marcher, « courbe »), « bondir » (le saut, arc de
 *   « hauteur » % au milieu). D'un sol à l'autre : mélange progressif (pente, montée sur un tracé).
 * - Corps, par priorité : pose ou geste (« jouer ») en cours, le plus récent ; sinon marche ou course (phase calée sur la
 *   distance parcourue : pas de glissement) ; sinon repos. Fondu de 0,25 s à chaque changement, sans mémoire.
 * - Vue : vue0 ; une marche se tourne dans le sens du trajet (sauf « vue » donnée) ; « tourner » interpole.
 * - Visage : dernière expression et dernière bouche commencées ; « parler » (piste de visèmes, M.levres) l'emporte sur une
 *   bouche commencée avant lui, pendant les paroles ; respiration et clignement sauf calme === false.
 * Aucune mémoire d'un appel à l'autre : même t, même pose.
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var S = nodeJS ? require('../squelette.js') : racine.M.squelette;
  var K = nodeJS ? require('../clips.js') : racine.M.clips;
  var L = nodeJS ? require('./levres.js') : racine.M.levres;
  var api = fabrique(S, K, L);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.partition = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, K, L) {
  'use strict';

  var FONDU = 0.25;
  var ALLURES = { marcher: 'marche', courir: 'course', glisser: 'glisse', bondir: 'bond' };
  var GESTES = ['pose', 'jouer'];
  var SOL = 90;

  var memo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function structure(part) {
    var m = memo && memo.get(part);
    if (m) return m;
    m = { trajets: calculerTrajets(part), bornes: null, vues: null };
    m.bornes = calculerBornes(part, m.trajets);
    m.vues = calculerVues(part, m.trajets);
    if (memo) memo.set(part, m);
    return m;
  }

  function lisse(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function triees(actions) { return actions.slice().sort(function (a, b) { return a.debut - b.debut; }); }

  /** Hauteur du sol (% de l'image) pour une valeur (nombre, ou « #id » d'un tracé) à la position x. */
  function solValeur(part, v, x) {
    if (typeof v === 'number') return v;
    var f = typeof v === 'string' && part.sols ? part.sols[v.replace(/^#/, '')] : null;
    return typeof f === 'function' ? f(x) : SOL;
  }
  function solDepart(part) { return part.sol0 === undefined || part.sol0 === null ? SOL : part.sol0; }

  /** Avancement du trajet à t (0 → 1), selon sa courbe pour un glissement. */
  function avancement(d, t) {
    var u = Math.max(0, Math.min(1, (t - d.debut) / (d.fin - d.debut)));
    return d.allure === 'glisse' ? d.courbe(u) : u;
  }

  /** Position { x, sol } dans un trajet, à t (borné à son arrêt). */
  function positionTrajet(part, d, t) {
    t = Math.min(t, d.arret);
    var u = Math.max(0, Math.min(1, (t - d.debut) / (d.fin - d.debut)));
    var k = avancement(d, t);
    var x = d.de + (d.vers - d.de) * k;
    var s0 = solValeur(part, d.solDe, x), s1 = solValeur(part, d.solVers, x);
    var sol = s0 + (s1 - s0) * k;
    if (d.allure === 'bond') sol -= d.hauteur * 4 * u * (1 - u);
    return { x: x, sol: sol };
  }

  function courbeDe(nom) {
    var C = typeof require === 'function' && typeof module === 'object' ? require('../courbes.js') : (typeof M !== 'undefined' ? M : null);
    var f = null;
    try { f = C && C.courbeNommee ? C.courbeNommee(nom || 'sine-inout') : null; } catch (e) { f = null; }
    return typeof f === 'function' ? f : lisse;
  }

  /** Trajets successifs : { debut, fin, arret, de, vers, solDe, solVers, allure, … } (x en %). Un trajet qui commence avant
   *  la fin du précédent part de la position atteinte à cet instant ; le précédent s'arrête là (« arret »). */
  function calculerTrajets(part) {
    var x = part.x0, sol = solDepart(part), out = [];
    triees(part.actions).forEach(function (a) {
      if (!ALLURES[a.type]) return;
      var prec = out[out.length - 1];
      if (prec && a.debut < prec.arret) {
        prec.arret = Math.max(prec.debut + 1e-6, a.debut);
        var p = positionTrajet(part, prec, prec.arret);
        x = p.x;
        // Un trajet coupé sur un même tracé le garde ; sinon, le sol atteint (un nombre).
        sol = prec.solDe === prec.solVers && prec.allure !== 'bond' ? prec.solVers : p.sol;
      }
      var fin = Math.max(a.fin, a.debut + 1e-6);
      var d = { debut: a.debut, fin: fin, arret: fin, de: x, vers: typeof a.vers === 'number' ? a.vers : x, solDe: sol,
        solVers: a.sol === undefined || a.sol === null ? sol : a.sol, allure: ALLURES[a.type], vue: a.vue, clip: a.clip,
        hauteur: typeof a.hauteur === 'number' ? a.hauteur : 15, courbe: a.type === 'glisser' ? courbeDe(a.courbe) : null, a: a };
      out.push(d);
      x = d.vers; sol = d.solVers;
    });
    return out;
  }
  function trajets(part) { return structure(part).trajets; }

  /** Position { x, sol } à t (x en % de la largeur, sol en % de la hauteur). */
  function positionAuTemps(part, t) {
    var x = part.x0, solV = solDepart(part), tr = structure(part).trajets;
    for (var i = 0; i < tr.length; i++) {
      var d = tr[i];
      if (t < d.debut) break;
      if (t < d.arret) return positionTrajet(part, d, t);
      var p = positionTrajet(part, d, d.arret);
      x = p.x;
      solV = d.arret < d.fin ? (d.solDe === d.solVers && d.allure !== 'bond' ? d.solVers : p.sol) : d.solVers;
    }
    return { x: x, sol: solValeur(part, solV, x) };
  }
  function xAuTemps(part, t) { return positionAuTemps(part, t).x; }

  /** Distance parcourue (unités de scène) depuis le début du trajet en cours, pente comprise. */
  function distanceDansTrajet(part, d, t) {
    var a = positionTrajet(part, d, d.debut), b = positionTrajet(part, d, t);
    var dx = (b.x - a.x) * part.largeur / 100, dy = (b.sol - a.sol) * (part.hauteur || 0) / 100;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** État du corps à t : { type, a?, trajet?, debut }. Un bond est un geste (le saut) ; un glissement ne change pas le corps. */
  function etatCorps(part, t) {
    var actif = null;
    part.actions.forEach(function (a) {
      if (GESTES.indexOf(a.type) >= 0 && a.debut <= t && t < a.fin && (!actif || a.debut >= actif.debut)) actif = { type: a.type, a: a, debut: a.debut };
    });
    var tr = structure(part).trajets;
    tr.forEach(function (d) {
      if (d.allure === 'bond' && d.debut <= t && t < d.arret && (!actif || d.debut >= actif.debut)) actif = { type: 'bond', trajet: d, debut: d.debut };
    });
    if (actif) return actif;
    for (var i = 0; i < tr.length; i++) {
      var d = tr[i];
      if ((d.allure === 'marche' || d.allure === 'course') && d.debut <= t && t < d.arret) return { type: d.allure, trajet: d, debut: d.debut };
    }
    return { type: 'repos', debut: -Infinity };
  }

  function poseDuCorps(part, e, t, bib, gabarit) {
    if (e.type === 'pose') {
      var p = bib.poses[e.a.pose];
      return p ? K.resoudrePose(p, bib) : {};
    }
    if (e.type === 'jouer') {
      var c = bib.clips[e.a.clip];
      if (!c) return {};
      var tt = t - e.a.debut;
      if (!c.boucle) tt = Math.min(tt, K.duree(c));
      return c.additif ? K.ajouter({}, c, tt, bib) : K.echantillonner(c, tt, bib, gabarit);
    }
    if (e.type === 'bond') {
      var saut = (e.trajet.clip && bib.clips[e.trajet.clip]) || bib.clips.saut;
      if (!saut) return {};
      var ts = saut.boucle ? t - e.trajet.debut : Math.max(0, Math.min(1, (t - e.trajet.debut) / (e.trajet.fin - e.trajet.debut))) * K.duree(saut);
      return saut.additif ? K.ajouter({}, saut, ts, bib) : K.echantillonner(saut, ts, bib, gabarit);
    }
    if (e.type === 'marche' || e.type === 'course') {
      // Démarche à soi (data-clip : un mouvement en boucle), sinon la marche ou la course.
      var propre = e.trajet && e.trajet.clip ? bib.clips[e.trajet.clip] : null;
      var defaut = bib.clips[e.type];
      var clip = propre && propre.boucle && !propre.additif ? propre : defaut;
      if (!clip) return {};
      var foulee = (clip.foulee || (defaut && defaut.foulee) || 248) * part.echelle;
      var tc = distanceDansTrajet(part, e.trajet, t) / foulee * clip.duree;
      return K.echantillonner(clip, tc, bib, gabarit);
    }
    var repos = bib.clips.repos;
    return repos ? K.echantillonner(repos, t, bib, gabarit) : {};
  }

  /** Instants où l'état du corps change (débuts et fins des gestes et des trajets). */
  function calculerBornes(part, tr) {
    var b = [];
    part.actions.forEach(function (a) { if (GESTES.indexOf(a.type) >= 0) b.push(a.debut, a.fin); });
    tr.forEach(function (d) { if (d.allure !== 'glisse') b.push(d.debut, d.arret); });
    return b.sort(function (x, y) { return x - y; });
  }

  function corpsAuTemps(part, t, bib, gabarit, profondeur) {
    var cur = etatCorps(part, t);
    var pose = poseDuCorps(part, cur, t, bib, gabarit);
    // Fondu : depuis la pose affichée juste avant la dernière borne franchie (elle-même peut-être en plein fondu :
    // deux changements rapprochés s'enchaînent sans saut). Sans mémoire : tout se recalcule à partir de t.
    var dernier = null;
    structure(part).bornes.forEach(function (b) { if (b <= t) dernier = b; });
    if (dernier !== null && t - dernier < FONDU) {
      var avant = etatCorps(part, dernier - 1e-6);
      if (avant.type !== cur.type || avant.a !== cur.a || avant.trajet !== cur.trajet) {
        var depart = (profondeur || 0) < 6 ? corpsAuTemps(part, dernier - 1e-6, bib, gabarit, (profondeur || 0) + 1).pose : poseDuCorps(part, avant, dernier - 1e-6, bib, gabarit);
        pose = S.melanger(Object.assign({}, S.REPOS, depart), Object.assign({}, S.REPOS, pose), lisse((t - dernier) / FONDU));
      }
    }
    return { pose: pose, type: cur.type };
  }

  function normaliser(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  function versAngle(de, a, k) { return de + normaliser(a - de) * k; }

  function calculerVues(part, tr) {
    var ev = [];
    tr.forEach(function (d) {
      if (d.allure === 'glisse' && typeof d.vue !== 'number') return; // un glissement garde la vue
      if (typeof d.vue !== 'number' && Math.abs(d.vers - d.de) < 1e-9) return; // sur place : pas de demi-tour
      ev.push({ debut: d.debut, duree: FONDU, vue: typeof d.vue === 'number' ? d.vue : (d.vers >= d.de ? 0 : 180) });
    });
    part.actions.forEach(function (a) { if (a.type === 'tourner' && typeof a.vue === 'number') ev.push({ debut: a.debut, duree: Math.max(1e-6, a.fin - a.debut), vue: a.vue }); });
    ev.sort(function (x, y) { return x.debut - y.debut; });
    // Chaque rotation part de la vue atteinte à son début (même si la précédente n'était pas finie).
    var v = part.vue0 || 0;
    ev.forEach(function (e, i) {
      e.de = v;
      var suivant = ev[i + 1];
      if (suivant) { var k = lisse((suivant.debut - e.debut) / e.duree); v = versAngle(e.de, e.vue, k); }
    });
    return ev;
  }

  function vueAuTemps(part, t) {
    var ev = structure(part).vues, v = part.vue0 || 0;
    for (var i = 0; i < ev.length; i++) {
      if (t < ev[i].debut) break;
      v = versAngle(ev[i].de, ev[i].vue, lisse((t - ev[i].debut) / ev[i].duree));
    }
    return normaliser(v);
  }

  function dernier(part, type, t) {
    var trouve = null;
    part.actions.forEach(function (a) { if (a.type === type && a.debut <= t && (!trouve || a.debut >= trouve.debut)) trouve = a; });
    return trouve;
  }

  function etatAuTemps(part, t, bib, gabarit) {
    var corps = corpsAuTemps(part, t, bib, gabarit);
    var pose = Object.assign({}, corps.pose);
    var explicites = Object.keys(pose);
    var ex = dernier(part, 'expression', t), bo = dernier(part, 'bouche', t);
    if (ex && ex.expression) pose.expression = ex.expression;
    if (bo && bo.bouche && bo.bouche !== 'aucune') pose.bouche = bo.bouche;
    // Paroles : la piste de visèmes du dernier « parler » commencé, s'il est plus récent que la bouche demandée.
    var pa = null;
    part.actions.forEach(function (a) { if (a.type === 'parler' && a.debut <= t && t < a.fin && (!pa || a.debut >= pa.debut)) pa = a; });
    if (pa && (!bo || pa.debut >= bo.debut)) {
      var v = L.boucheAuTemps(pa.piste, t);
      if (v) pose.bouche = v;
    }
    K.appliquerExpression(pose, bib, explicites);
    if (part.calme !== false) {
      if (corps.type === 'repos' && bib.clips.respiration && !bib.clips.repos) pose = K.ajouter(pose, bib.clips.respiration, t, bib);
      if (bib.clips.clignement) pose = K.ajouter(pose, bib.clips.clignement, t, bib);
    }
    var vue = vueAuTemps(part, t);
    var pos = positionAuTemps(part, t);
    return { pose: Object.assign({}, S.REPOS, pose, { vue: vue }), x: pos.x, sol: pos.sol, vue: vue, corps: corps.type };
  }

  /** Hauteur du personnage debout (unités du squelette) : des pieds au haut de la tête. */
  function hauteur(gabarit) {
    var g = S.completerGabarit(gabarit);
    return g.cuisse + g.tibia + g.baseTete + 2 * g.tete.ry - 2;
  }

  return { etatAuTemps: etatAuTemps, xAuTemps: xAuTemps, positionAuTemps: positionAuTemps, vueAuTemps: vueAuTemps, trajets: trajets, hauteur: hauteur, FONDU: FONDU };
});
