/* Pulse Motion – partition d'un personnage dans une scène : ses actions minutées -> sa pose à l'instant t (pur).
 *
 *   var e = M.partition.etatAuTemps(partition, t, bibliotheque, gabarit);   // { pose, x, vue, corps }
 *
 * partition = { x0, vue0, calme, largeur, echelle, actions: [{ type, debut, fin, vers?, pose?, clip?, vue?, expression?, bouche? }] }
 *   temps absolus (résolus par le minutage) ; x en % de la largeur de la scène ; largeur en unités de la scène ;
 *   echelle : unités de scène par unité du squelette.
 * - Position : x0, puis interpolée pendant chaque marche ou course (« vers »), gardée après.
 * - Corps, par priorité : pose ou geste (« jouer ») en cours, le plus récent ; sinon marche ou course (phase calée sur la
 *   distance parcourue : pas de glissement) ; sinon repos. Fondu de 0,25 s à chaque changement, sans mémoire.
 * - Vue : vue0 ; une marche se tourne dans le sens du trajet (sauf « vue » donnée) ; « tourner » interpole.
 * - Visage : dernière expression et dernière bouche commencées ; respiration et clignement sauf calme === false.
 * Aucune mémoire d'un appel à l'autre : même t, même pose.
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var S = nodeJS ? require('../squelette.js') : racine.M.squelette;
  var K = nodeJS ? require('../clips.js') : racine.M.clips;
  var api = fabrique(S, K);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.partition = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, K) {
  'use strict';

  var FONDU = 0.25;
  var DEPLACEMENTS = ['marcher', 'courir'];
  var GESTES = ['pose', 'jouer'];

  function lisse(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function triees(actions) { return actions.slice().sort(function (a, b) { return a.debut - b.debut; }); }

  /** Trajets successifs : { debut, fin, de, vers, allure, vue? } (x en %). */
  function trajets(part) {
    var x = part.x0, out = [];
    triees(part.actions).forEach(function (a) {
      if (DEPLACEMENTS.indexOf(a.type) < 0) return;
      out.push({ debut: a.debut, fin: Math.max(a.fin, a.debut + 1e-6), de: x, vers: a.vers, allure: a.type === 'courir' ? 'course' : 'marche', vue: a.vue });
      x = a.vers;
    });
    return out;
  }

  function xAuTemps(part, t) {
    var x = part.x0, tr = trajets(part);
    for (var i = 0; i < tr.length; i++) {
      var d = tr[i];
      if (t < d.debut) break;
      if (t < d.fin) return d.de + (d.vers - d.de) * (t - d.debut) / (d.fin - d.debut);
      x = d.vers;
    }
    return x;
  }

  /** Distance parcourue (unités de scène) depuis le début du trajet en cours. */
  function distanceDansTrajet(part, d, t) {
    return Math.abs(d.vers - d.de) * Math.min(1, (t - d.debut) / (d.fin - d.debut)) * part.largeur / 100;
  }

  /** État du corps à t : { type, a?, trajet?, debut }. */
  function etatCorps(part, t) {
    var actif = null;
    part.actions.forEach(function (a) {
      if (GESTES.indexOf(a.type) >= 0 && a.debut <= t && t < a.fin && (!actif || a.debut >= actif.debut)) actif = a;
    });
    if (actif) return { type: actif.type, a: actif, debut: actif.debut };
    var tr = trajets(part);
    for (var i = 0; i < tr.length; i++) if (tr[i].debut <= t && t < tr[i].fin) return { type: tr[i].allure, trajet: tr[i], debut: tr[i].debut };
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
    if (e.type === 'marche' || e.type === 'course') {
      var clip = bib.clips[e.type];
      if (!clip) return {};
      var foulee = (clip.foulee || 248) * part.echelle;
      var tc = distanceDansTrajet(part, e.trajet, t) / foulee * clip.duree;
      return K.echantillonner(clip, tc, bib, gabarit);
    }
    var repos = bib.clips.repos;
    return repos ? K.echantillonner(repos, t, bib, gabarit) : {};
  }

  /** Instants où l'état du corps change (débuts et fins des gestes et des trajets). */
  function bornes(part) {
    var b = [];
    part.actions.forEach(function (a) { if (GESTES.indexOf(a.type) >= 0) b.push(a.debut, a.fin); });
    trajets(part).forEach(function (d) { b.push(d.debut, d.fin); });
    return b.sort(function (x, y) { return x - y; });
  }

  function corpsAuTemps(part, t, bib, gabarit) {
    var cur = etatCorps(part, t);
    var pose = poseDuCorps(part, cur, t, bib, gabarit);
    // Fondu : depuis l'état d'avant la dernière borne franchie, évalué au même instant.
    var dernier = null;
    bornes(part).forEach(function (b) { if (b <= t) dernier = b; });
    if (dernier !== null && t - dernier < FONDU) {
      var avant = etatCorps(part, dernier - 1e-6);
      if (avant.type !== cur.type || avant.a !== cur.a || avant.trajet !== cur.trajet) {
        pose = S.melanger(Object.assign({}, S.REPOS, poseDuCorps(part, avant, t, bib, gabarit)), Object.assign({}, S.REPOS, pose), lisse((t - dernier) / FONDU));
      }
    }
    return { pose: pose, type: cur.type };
  }

  function normaliser(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  function versAngle(de, a, k) { return de + normaliser(a - de) * k; }

  function vueAuTemps(part, t) {
    var v = part.vue0 || 0;
    var evenements = [];
    trajets(part).forEach(function (d) {
      var cible = typeof d.vue === 'number' ? d.vue : (d.vers >= d.de ? 0 : 180);
      evenements.push({ debut: d.debut, duree: FONDU, vue: cible });
    });
    part.actions.forEach(function (a) { if (a.type === 'tourner' && typeof a.vue === 'number') evenements.push({ debut: a.debut, duree: Math.max(1e-6, a.fin - a.debut), vue: a.vue }); });
    evenements.sort(function (x, y) { return x.debut - y.debut; });
    for (var i = 0; i < evenements.length; i++) {
      var e = evenements[i];
      if (t < e.debut) break;
      var k = lisse((t - e.debut) / e.duree);
      if (k < 1) return normaliser(versAngle(v, e.vue, k));
      v = e.vue;
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
    K.appliquerExpression(pose, bib, explicites);
    if (part.calme !== false) {
      if (corps.type === 'repos' && bib.clips.respiration && !bib.clips.repos) pose = K.ajouter(pose, bib.clips.respiration, t, bib);
      if (bib.clips.clignement) pose = K.ajouter(pose, bib.clips.clignement, t, bib);
    }
    var vue = vueAuTemps(part, t);
    return { pose: Object.assign({}, S.REPOS, pose, { vue: vue }), x: xAuTemps(part, t), vue: vue, corps: corps.type };
  }

  /** Hauteur du personnage debout (unités du squelette) : des pieds au haut de la tête. */
  function hauteur(gabarit) {
    var g = S.completerGabarit(gabarit);
    return g.cuisse + g.tibia + g.baseTete + 2 * g.tete.ry - 2;
  }

  return { etatAuTemps: etatAuTemps, xAuTemps: xAuTemps, vueAuTemps: vueAuTemps, trajets: trajets, hauteur: hauteur, FONDU: FONDU };
});
