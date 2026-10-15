/* Pulse Motion – partition d'un personnage dans une scène : ses actions minutées -> sa pose à l'instant t (pur).
 *
 *   var e = M.partition.etatAuTemps(partition, t, bibliotheque, gabarit);   // { pose, x, vue, corps }
 *
 * partition = { x0, vue0, calme, largeur, echelle, actions: [{ type, debut, fin, vers?, pose?, clip?, vue?, expression?, bouche?, piste? }] }
 *   temps absolus (résolus par le minutage) ; x en % de la largeur de la scène ; largeur en unités de la scène ;
 *   echelle : unités de scène par unité du squelette.
 * - Position : x0, puis interpolée pendant chaque marche ou course (« vers »), gardée après.
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
  var DEPLACEMENTS = ['marcher', 'courir'];
  var GESTES = ['pose', 'jouer'];

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

  /** Trajets successifs : { debut, fin, de, vers, allure, vue? } (x en %). Un trajet qui commence avant la fin du
   *  précédent part de la position atteinte à cet instant ; le précédent s'arrête là. */
  function calculerTrajets(part) {
    var x = part.x0, out = [];
    triees(part.actions).forEach(function (a) {
      if (DEPLACEMENTS.indexOf(a.type) < 0) return;
      var prec = out[out.length - 1];
      if (prec && a.debut < prec.fin) {
        x = prec.de + (prec.vers - prec.de) * Math.max(0, a.debut - prec.debut) / (prec.fin - prec.debut);
        prec.vers = x; prec.fin = Math.max(prec.debut + 1e-6, a.debut);
      }
      out.push({ debut: a.debut, fin: Math.max(a.fin, a.debut + 1e-6), de: x, vers: a.vers, allure: a.type === 'courir' ? 'course' : 'marche', vue: a.vue });
      x = a.vers;
    });
    return out;
  }
  function trajets(part) { return structure(part).trajets; }

  function xAuTemps(part, t) {
    var x = part.x0, tr = structure(part).trajets;
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
    var tr = structure(part).trajets;
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
  function calculerBornes(part, tr) {
    var b = [];
    part.actions.forEach(function (a) { if (GESTES.indexOf(a.type) >= 0) b.push(a.debut, a.fin); });
    tr.forEach(function (d) { b.push(d.debut, d.fin); });
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
    var pa = dernier(part, 'parler', t);
    if (pa && t < pa.fin && (!bo || pa.debut >= bo.debut)) {
      var v = L.boucheAuTemps(pa.piste, t);
      if (v) pose.bouche = v;
    }
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
