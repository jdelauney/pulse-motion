/* Pulse Motion – clips de personnages : images-clés → pose à un instant (pur, sans DOM).
 *
 *   var pose = M.clips.echantillonner(clip, temps, bibliotheque, gabarit);
 *   pose = M.clips.ajouter(pose, bibliotheque.clips.respiration, temps, bibliotheque);
 *
 * Clip : { boucle, duree?, foulee?, pieds?: 'au-sol' | 'libres', miroir?, additif?, lissage?, contacts?, cles: [{ t, pose?, angles?, courbe? }] }
 *   - bouclé : t = phase dans [0, 1], duree = un cycle (s) ; ponctuel : t en secondes, durée = dernière clé ;
 *   - pistes par angle : entre deux clés qui le donnent, un angle est interpolé (courbe de la première clé,
 *     sine-inout par défaut) ; avant la première et après la dernière, il garde la valeur la plus proche
 *     (bouclé : la piste fait le tour) ;
 *   - une clé qui cite une pose fixe tous les angles animés du clip : ceux de la pose, les autres au repos ;
 *   - miroir m : membres Arrière = membres Avant à la phase + m (sauf piste Arrière explicite) ;
 *   - au-sol : poserAuSol à chaque image, la piste bassinY devient un décalage ;
 *   - additif : valeurs = différences (0 = rien), à combiner par ajouter() ;
 *   - lissage : « par-cle » (défaut : chaque segment a sa courbe, la vitesse retombe à zéro à chaque clé) ou « continu »
 *     (les poses s'enchaînent sans s'arrêter : flow de M.vivant, cyclique pour un clip bouclé ; une clé qui porte une
 *     « courbe » garde son segment) ; pistes et tangentes calculées une fois par clip (WeakMap) ;
 *   - contacts : instants (s) où un clip ponctuel touche le sol (écrasement à l'atterrissage, partition.js) ;
 *   - bouche, expression : pistes discrètes (la valeur tient jusqu'à la clé suivante) ; l'expression règle les clés
 *     d'expression que le clip n'anime pas ; resoudrePose() fait de même pour un fichier de pose.
 * Module pur : chargé tel quel dans la page (M.clips) et par Node (require).
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var S = nodeJS ? require('./squelette.js') : racine.M.squelette;
  var C = nodeJS ? require('./courbes.js') : racine.M;
  var V = nodeJS ? require('./vivant.js') : racine.M.vivant;
  var api = fabrique(S, C, V);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.clips = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, C, V) {
  'use strict';

  var MEMBRES = ['cuisse', 'tibia', 'pied', 'ecartJambe', 'torsionJambe', 'bras', 'avantBras', 'ecartBras', 'torsionBras'];
  var courbes = {};

  function courbe(nom) {
    var n = nom || 'sine-inout';
    if (!courbes[n]) courbes[n] = C.courbeNommee(n);
    return courbes[n];
  }

  function repos(nom, additif) {
    if (additif) return 0;
    return typeof S.REPOS[nom] === 'number' ? S.REPOS[nom] : 0;
  }

  function anglesDePose(cle, bib) {
    if (!cle.pose) return null;
    var poses = (bib && bib.poses) || {};
    var p = poses[cle.pose];
    if (!p) throw new Error('Clip : pose « ' + cle.pose + ' » introuvable (poses connues : ' + Object.keys(poses).join(', ') + ').');
    return p.angles || {};
  }

  function pistes(clip, bib) {
    var cles = clip.cles || [];
    var poses = cles.map(function (c) { return anglesDePose(c, bib); });
    var anime = {};
    cles.forEach(function (c, i) {
      Object.keys(c.angles || {}).forEach(function (n) { anime[n] = true; });
      if (poses[i]) Object.keys(poses[i]).forEach(function (n) { anime[n] = true; });
    });
    var out = {};
    Object.keys(anime).forEach(function (n) { out[n] = []; });
    cles.forEach(function (c, i) {
      var v = {};
      if (poses[i]) Object.keys(anime).forEach(function (n) { v[n] = typeof poses[i][n] === 'number' ? poses[i][n] : repos(n, clip.additif); });
      Object.keys(c.angles || {}).forEach(function (n) { v[n] = c.angles[n]; });
      Object.keys(v).forEach(function (n) { out[n].push([c.t, v[n], c.courbe]); });
    });
    return out;
  }

  function segment(a, ta, b, tb, u) {
    var d = tb - ta;
    var k = d > 1e-12 ? (u - ta) / d : 1;
    return a[1] + (b[1] - a[1]) * courbe(a[2])(k);
  }

  /** Piste en lissage continu : flow entre deux clés sans courbe, segment classique après une clé qui en porte une. */
  function lirePisteContinue(pts, u, boucle, m) {
    var n = pts.length;
    if (n === 1) return pts[0][1];
    var premier = pts[0], dernier = pts[n - 1];
    function seg(a, ta, ma, b, tb, mb) { return a[2] ? segment(a, ta, b, tb, u) : V.hermite(ta, a[1], ma, tb, b[1], mb, u); }
    if (boucle) {
      if (u < premier[0]) return seg(dernier, dernier[0] - 1, m[n - 1], premier, premier[0], m[0]);
      if (u >= dernier[0]) return seg(dernier, dernier[0], m[n - 1], premier, premier[0] + 1, m[0]);
    } else {
      if (u <= premier[0]) return premier[1];
      if (u >= dernier[0]) return dernier[1];
    }
    for (var i = 0; i < n - 1; i++) if (u < pts[i + 1][0]) return seg(pts[i], pts[i][0], m[i], pts[i + 1], pts[i + 1][0], m[i + 1]);
    return dernier[1];
  }

  // Pistes (et tangentes du lissage continu) d'un clip, gardées tant que le clip et la bibliothèque sont les mêmes objets.
  // Un clip modifié sur place (atelier) doit être passé en copie (Object.assign({}, clip)).
  var memo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function preparer(clip, bib) {
    var m = memo && memo.get(clip);
    if (m && m.bib === bib && m.cles === clip.cles && m.lissage === clip.lissage) return m;
    var ps = pistes(clip, bib), tg = {};
    if (clip.lissage === 'continu') {
      Object.keys(ps).forEach(function (n) {
        tg[n] = clip.boucle ? V.tangentesCycliques(ps[n]) : V.tangentes(ps[n]);
      });
    }
    m = { bib: bib, cles: clip.cles, lissage: clip.lissage, ps: ps, tg: tg, discretes: pistesDiscretes(clip, bib) };
    if (memo) memo.set(clip, m);
    return m;
  }

  function lirePiste(pts, u, boucle) {
    var n = pts.length;
    if (n === 1) return pts[0][1];
    var premier = pts[0], dernier = pts[n - 1];
    if (boucle) {
      if (u < premier[0]) return segment(dernier, dernier[0] - 1, premier, premier[0], u);
      if (u >= dernier[0]) return segment(dernier, dernier[0], premier, premier[0] + 1, u);
    } else {
      if (u <= premier[0]) return premier[1];
      if (u >= dernier[0]) return dernier[1];
    }
    for (var i = 0; i < n - 1; i++) if (u < pts[i + 1][0]) return segment(pts[i], pts[i][0], pts[i + 1], pts[i + 1][0], u);
    return dernier[1];
  }

  function duree(clip) {
    if (clip.boucle) return clip.duree;
    var c = clip.cles || [];
    return c.length ? c[c.length - 1].t : 0;
  }

  function position(clip, temps) {
    if (!clip.boucle) return temps;
    var u = temps / clip.duree;
    return u - Math.floor(u);
  }

  var DISCRETS = ['bouche', 'expression'];

  /** Pistes discrètes (bouche, expression) : [[t, valeur], …] ; une clé qui cite une pose prend ses choix. */
  function pistesDiscretes(clip, bib) {
    var out = { bouche: [], expression: [] };
    (clip.cles || []).forEach(function (c) {
      var p = c.pose ? (bib && bib.poses && bib.poses[c.pose]) || {} : {};
      DISCRETS.forEach(function (k) {
        var v = c[k] !== undefined ? c[k] : p[k];
        if (v !== undefined) out[k].push([c.t, v]);
      });
    });
    return out;
  }

  function lireDiscret(pts, u, boucle) {
    if (!pts.length) return undefined;
    var v;
    for (var i = 0; i < pts.length; i++) if (pts[i][0] <= u + 1e-9) v = pts[i][1];
    if (v === undefined) v = boucle ? pts[pts.length - 1][1] : pts[0][1];
    return v;
  }

  /** Applique l'expression nommée par pose.expression aux clés d'expression que la pose ne donne pas. */
  function appliquerExpression(pose, bib, explicites) {
    var e = pose.expression && bib && bib.expressions && bib.expressions[pose.expression];
    if (!e) return pose;
    Object.keys(e.angles || {}).forEach(function (k) { if (explicites.indexOf(k) < 0) pose[k] = e.angles[k]; });
    if (pose.bouche === undefined && e.bouche !== undefined) pose.bouche = e.bouche;
    return pose;
  }

  /** Pose d'un fichier de pose { angles, bouche?, expression? } -> pose à rendre. */
  function resoudrePose(objet, bib) {
    var out = Object.assign({}, objet.angles || {});
    var explicites = Object.keys(out);
    if (objet.bouche !== undefined) out.bouche = objet.bouche;
    if (objet.expression !== undefined) out.expression = objet.expression;
    return appliquerExpression(out, bib, explicites);
  }

  /** sansSol : sans poserAuSol (le retard des personnages ne lit que le haut du corps). */
  function echantillonner(clip, temps, bib, gabarit, sansSol) {
    var pr = preparer(clip, bib);
    var ps = pr.ps;
    var continu = clip.lissage === 'continu';
    var u = position(clip, temps);
    var out = {};
    function lireNom(n, uu, boucle) { return continu ? lirePisteContinue(ps[n], uu, boucle, pr.tg[n]) : lirePiste(ps[n], uu, boucle); }
    Object.keys(ps).forEach(function (n) { if (ps[n].length) out[n] = lireNom(n, u, clip.boucle); });
    if (clip.boucle && clip.miroir) {
      var v = u + clip.miroir; v -= Math.floor(v);
      MEMBRES.forEach(function (m) {
        var a = m + 'Avant', b = m + 'Arriere';
        if (ps[a] && ps[a].length && !(ps[b] && ps[b].length)) out[b] = lireNom(a, v, true);
      });
    }
    var explicites = Object.keys(out);
    var discretes = pr.discretes;
    DISCRETS.forEach(function (k) { var v = lireDiscret(discretes[k], u, clip.boucle); if (v !== undefined) out[k] = v; });
    appliquerExpression(out, bib, explicites);
    if (clip.pieds === 'au-sol' && !clip.additif && !sansSol) {
      var decalage = out.bassinY || 0;
      out.bassinY = S.poserAuSol(Object.assign({}, out, { bassinY: 0 }), gabarit).bassinY + decalage;
    }
    return out;
  }

  /** pose + différences du calque additif à temps (multipliées par facteur, 1 par défaut). */
  function ajouter(pose, clip, temps, bib, facteur) {
    if (!clip.additif) throw new Error('Clip « ' + (clip.nom || '?') + ' » : ajouter() attend un clip additif ("additif": true).');
    var f = typeof facteur === 'number' ? facteur : 1;
    var d = echantillonner(clip, temps, bib, null);
    var out = Object.assign({}, pose);
    Object.keys(d).forEach(function (n) {
      if (typeof d[n] !== 'number') return;
      var base = typeof out[n] === 'number' ? out[n] : repos(n, false);
      out[n] = base + d[n] * f;
    });
    return out;
  }

  return { MEMBRES: MEMBRES, pistesDiscretes: pistesDiscretes, appliquerExpression: appliquerExpression, resoudrePose: resoudrePose, pistes: pistes, duree: duree, position: position, echantillonner: echantillonner, ajouter: ajouter };
});
