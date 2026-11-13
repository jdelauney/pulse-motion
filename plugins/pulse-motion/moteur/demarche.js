/* Pulse Motion – marche calculée (spec S11, 5.7) : marche, pas traînés et course, pose fonction de la phase seule (pur).
 *
 *   var d = M.demarche.demarche({ genre: 'marche', foulee: 0.7, periode: 1, appui: 0.62 }, gabarit);
 *   d.vitesse (unités du squelette par seconde), d.cycle (unités par cycle) ; d.pose(phase, allant) ->
 *   { hanche: [x, y], pieds: [{ cheville: [x, y], angle, appui }, …], devant, appuis, rebond, angles }
 *
 * Repère du squelette, de profil, hanche en x = 0, cheville à plat sur y = cuisse + tibia (le sol), semelle 7 plus bas.
 * Réglages : genre (marche, pas-traines, course) ; foulee : distance que parcourt le pied d'appui sous le corps, en longueurs
 * de jambe (hanche → cheville) ; periode : durée d'un cycle (deux pas, s) ; appui : part du cycle où chaque pied est posé.
 * Quatre règles (line-art-animation, lib/gait.ts, MIT © 2026 JDhruv14, réécrit) :
 *  1. le pied d'appui recule exactement à foulee / (appui × periode) : posé, il ne glisse pas quand la phase vient de la
 *     distance parcourue (partition.js) ;
 *  2. la jambe libre suit une trajectoire à secousse minimale (minimum jerk), basse en marche, talon lancé en course ;
 *  3. le talon décolle sur les 14 derniers % de l'appui, le pied pivotant sur sa pointe ;
 *  4. la hanche est à la hauteur que les jambes d'appui atteignent (point bas en double appui) ; la course se comprime sur
 *     l'appui et monte en vol (aucune sinusoïde libre).
 * allant ∈ [0, 1] ramène les deux pieds au repos (arrêt pour saluer). Les angles des jambes viennent de M.squelette.ik2 ;
 * jambes sans écart ni torsion (la vue de profil ne les montre pas), cheville posée exactement sur sa cible.
 * Module pur : chargé tel quel dans la page (M.demarche) et par Node (require).
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var api = fabrique(function () { return nodeJS ? require('./squelette.js') : racine.M.squelette; });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.demarche = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (squelette) {
  'use strict';

  var DEG = Math.PI / 180, SEMELLE = 7;
  // Préréglages (proportions en longueurs de jambe) ; les fichiers personnages/clips/demarches/ règlent foulee, periode, appui.
  var GENRES = Object.freeze({
    marche: Object.freeze({ foulee: 0.7, periode: 1, appui: 0.62, levee: 0.075, talon: 15, coup: 0, torse: 5, bras: 16, coude: -20 }),
    'pas-traines': Object.freeze({ foulee: 0.5, periode: 0.9, appui: 0.64, levee: 0.045, talon: 12, coup: 0, torse: 3, bras: 9, coude: -16 }),
    course: Object.freeze({ foulee: 0.62, periode: 0.5, appui: 0.36, levee: 0.34, talon: 10, coup: 0.13, torse: 13, bras: 34, coude: -85 })
  });
  var BORNES = { foulee: [0.2, 1.2], periode: [0.3, 2], appui: { course: [0.2, 0.49], autre: [0.51, 0.85] } };

  function borne(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lisse(e0, e1, x) { var k = borne((x - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); }
  function minJerk(s) { return s * s * s * (10 - 15 * s + 6 * s * s); }
  function tour(u) { return ((u % 1) + 1) % 1; }

  /** Erreurs (texte) des réglages d'une démarche : genre connu, nombres dans leurs bornes. */
  function valider(r) {
    var e = [];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return ['réglages attendus : { "genre": "marche", "foulee": 0.7, "periode": 1, "appui": 0.62 }.'];
    if (!Object.prototype.hasOwnProperty.call(GENRES, r.genre)) e.push('« genre » : marche, pas-traines ou course.');
    var nb = function (k, b, sens) {
      if (r[k] === undefined) return;
      if (!(typeof r[k] === 'number' && isFinite(r[k]) && r[k] >= b[0] && r[k] <= b[1])) e.push('« ' + k + ' » : ' + sens + ', de ' + String(b[0]).replace('.', ',') + ' à ' + String(b[1]).replace('.', ',') + '.');
    };
    nb('foulee', BORNES.foulee, 'distance que parcourt le pied posé, en longueurs de jambe');
    nb('periode', BORNES.periode, 'durée d\'un cycle de deux pas, en secondes');
    nb('appui', r.genre === 'course' ? BORNES.appui.course : BORNES.appui.autre, r.genre === 'course' ? 'part du cycle où un pied est posé (sous 0,5 : une phase de vol)' : 'part du cycle où un pied est posé (au-dessus de 0,5 : un double appui)');
    return e;
  }

  function demarche(reglages, gabarit) {
    var S = squelette(), r = reglages || {};
    var genre = Object.prototype.hasOwnProperty.call(GENRES, r.genre) ? r.genre : 'marche';
    var o = {};
    Object.keys(GENRES[genre]).forEach(function (k) { o[k] = typeof r[k] === 'number' && isFinite(r[k]) ? r[k] : GENRES[genre][k]; });
    var g = S.completerGabarit(gabarit);
    var L = g.cuisse + g.tibia, A0 = L, portee = 0.983 * L, hautRepos = A0 - portee, pointe = g.pied;
    var F = o.foulee * L, appui = o.appui, levee = o.levee * L, coup = o.coup * L;
    var vitesse = F / (appui * o.periode);

    /** Pied à la phase u (cycle) : cheville, angle (pointe vers le bas, degrés), posé ou non. */
    function finAppui() {
      var th = o.talon * DEG, px = -F / 2 + pointe, py = A0 + SEMELLE;
      return [px - pointe * Math.cos(th) + SEMELLE * Math.sin(th), py - pointe * Math.sin(th) - SEMELLE * Math.cos(th)];
    }
    var fin = finAppui();
    function pied(u) {
      u = tour(u);
      if (u < appui) {
        var x = F / 2 - F * u / appui, decolle = lisse(appui - 0.14, appui, u), th = o.talon * decolle * DEG;
        // Pivot sur la pointe, au sol : la cheville tourne autour de lui.
        var px = x + pointe, py = A0 + SEMELLE;
        return { cheville: [px - pointe * Math.cos(th) + SEMELLE * Math.sin(th), py - pointe * Math.sin(th) - SEMELLE * Math.cos(th)], angle: o.talon * decolle, appui: true };
      }
      var s = (u - appui) / (1 - appui), raccord = 1 - lisse(0, 0.5, s);
      var cx = -F / 2 + F * minJerk(s) - coup * Math.sin(Math.PI * Math.min(1, s * 1.6));
      var cy = A0 - levee * Math.pow(Math.sin(Math.PI * Math.pow(s, coup ? 0.7 : 1)), 1.2);
      // Départ de la jambe libre raccordé à la fin de l'appui (talon levé) : pas de saut de la cheville.
      return { cheville: [cx + (fin[0] + F / 2) * raccord, cy + (fin[1] - A0) * raccord], angle: o.talon * Math.pow(1 - lisse(0, 0.55, s), 1.4), appui: false };
    }

    function pose(phase, allant) {
      var va = typeof allant === 'number' ? borne(allant, 0, 1) : 1;
      var pieds = [pied(phase), pied(phase + 0.5)];
      if (va < 1) pieds.forEach(function (p, i) {
        var repos = (i ? -0.02 : 0.02) * L;
        p.cheville = [repos + (p.cheville[0] - repos) * va, A0 + (p.cheville[1] - A0) * va];
        p.angle *= va; p.appui = true;
      });
      var y = hautRepos;
      if (coup && va >= 1) {
        // Course : comprimée sur l'appui, au plus haut au milieu du vol.
        var demi = tour(phase * 2) / 2;
        y = demi < appui ? hautRepos + 0.054 * L * Math.sin(Math.PI * demi / appui) : hautRepos - 0.1 * L * Math.sin(Math.PI * (demi - appui) / (0.5 - appui));
      }
      // Hanche à la hauteur que les jambes posées atteignent (point bas en double appui).
      pieds.forEach(function (p) { if (p.appui) y = Math.max(y, p.cheville[1] - Math.sqrt(Math.max(1, portee * portee - p.cheville[0] * p.cheville[0]))); });
      var angles = { bassinY: y, bassinRot: 0, torse: o.torse * (0.4 + 0.6 * va), tete: -0.5 * o.torse * va };
      ['Avant', 'Arriere'].forEach(function (cote, i) {
        var p = pieds[i], ik = S.ik2([0, y], g.cuisse, g.tibia, p.cheville, 1);
        angles['cuisse' + cote] = ik.a1; angles['tibia' + cote] = ik.a2; angles['pied' + cote] = p.angle;
        angles['ecartJambe' + cote] = 0; angles['torsionJambe' + cote] = 0;
        // Bras opposé à la jambe du même côté, un peu en retard sur elle.
        var j = borne(pied(phase + i * 0.5 - 0.05).cheville[0] / (F / 2), -1, 1) * va;
        angles['bras' + cote] = o.bras * j;
        angles['avantBras' + cote] = o.coude * (coup ? 1 : 1 + 0.5 * Math.max(0, -j));
      });
      var appuis = pieds.filter(function (p) { return p.appui; }).length;
      return { hanche: [0, y], pieds: pieds, devant: pieds[0].cheville[0] >= pieds[1].cheville[0] ? 0 : 1, appuis: appuis, rebond: y - hautRepos, angles: angles };
    }

    return { genre: genre, reglages: o, jambe: L, vitesse: vitesse, cycle: F / appui, pose: pose };
  }

  return { demarche: demarche, valider: valider, GENRES: GENRES, BORNES: BORNES, SEMELLE: SEMELLE };
});
