/* Pulse Motion – ressorts, pendules et vent, sans état (spec S11, 5.8).
 *
 *   var Ph = M.physique;                                  // page ; require('./physique.js') dans Node
 *   Ph.pendule({ longueur, amorti, pivot?, gravite?, prise? }, t, { vent?, poussee?, impulsions? }) -> angle (radians)
 *   Ph.ressortAmorti({ k, c, cible? }, t, { poussee?, impulsions? }) -> position
 *   Ph.impulsion(instant, force)                           choc minuté (clic, arrêt, coup de chapeau)
 *   M.vent(t) -> { x, y, force, dir } ; M.vent.defini     piste de vent de la vidéo (page)
 *
 * Sans état : chaque appel intègre la seconde passée (FENETRE) à pas de 1/60 sur une grille absolue (multiples de PAS), comme
 * le balancement des os en plus (squelette.js) : même t, même résultat, quel que soit l'ordre des appels. Départ à l'équilibre
 * des forces du début de la fenêtre (un vent constant donne l'angle d'équilibre exact ; le calme, le repos exact) ; les écarts
 * à ces forces pèsent entier sur la moitié récente de la fenêtre, puis s'effacent en douceur (aucun saut quand ils en sortent).
 * Pendule : angle depuis la verticale, positif quand le bout part vers +x ; longueur et gravite dans les mêmes unités (mètres
 * et 9,81 par défaut) ; pivot : point fixe ou fonction u -> [x, y] (son accélération le balance, sa vitesse fait le vent
 * relatif) ; amorti : part de l'amortissement critique (0 à 1) ; prise : prise au vent (accélération en g par unité de force).
 * forces : vent (u -> { x, y } ou [x, y], force par axe, 1 = vent fort), poussee (u -> [ax, ay], accélération du bout),
 * impulsions ([impulsion(instant, force)] : vitesse donnée d'un coup, rad/s ou unités/s).
 * Vent : clés { de, force, dir, rafales } (scènes : data-vent au début de la scène ; déroulé : "vent") ; chaque clé se rejoint
 * en TRANSITION s (base lissée, continue d'une scène à l'autre), plus des rafales en somme de sinus à graine ; dir : vers où
 * souffle le vent, en degrés (0 : vers la droite, 90 : vers le bas de l'image). Avant la première clé : calme.
 * data-pendule="<longueur> <amorti>" sur un groupe SVG (longueur en cqh, image de 2 m de haut) : il pend de son bord haut,
 * au milieu, et répond au vent. D'après line-art-animation (MIT, © 2026 JDhruv14 : lib/motion.ts spring, pendulum, kick,
 * vent du pointeur devenu une piste minutée), réécrit en forme pure de t.
 */
(function (racine, fabrique) {
  var api = fabrique(racine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.physique = api; api.installer(racine.M); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (racine) {
  'use strict';

  var DEG = Math.PI / 180, FENETRE = 1, PAS = 1 / 60, G = 9.81, TRANSITION = 1;
  // Vitesse du vent de force 1 (m/s) : le vent relatif d'un porteur qui marche ; gravité en cqh/s² (image de 2 m de haut).
  var VITESSE_VENT = 6, G_CQH = G / 0.02, PRISE = 0.6, RAFALES_DEROULE = 0.35;
  var NIVEAUX = Object.freeze({
    calme: Object.freeze({ force: 0, rafales: 0 }), brise: Object.freeze({ force: 0.3, rafales: 0.1 }),
    rafales: Object.freeze({ force: 0.35, rafales: 0.5 }), tempete: Object.freeze({ force: 0.8, rafales: 0.25 })
  });
  // Pendants de l'habillage plume (fractions de la hauteur de la figure, qui vaut 1,75 m).
  var PENDANTS = Object.freeze({
    echarpe: Object.freeze({ longueur: 0.12, amorti: 0.3, prise: 2.2 }),
    mallette: Object.freeze({ longueur: 0.075, amorti: 0.12, prise: 0.15 }),
    sac: Object.freeze({ longueur: 0.08, amorti: 0.15, prise: 0.3 })
  });
  var HAUTEUR_FIGURE = 1.75;

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function borne(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lisse(k) { k = borne(k, 0, 1); return k * k * (3 - 2 * k); }
  function vec(f, u) {
    var v = typeof f === 'function' ? f(u) : f;
    if (!v) return [0, 0];
    return Array.isArray(v) ? [num(v[0], 0), num(v[1], 0)] : [num(v.x, 0), num(v.y, 0)];
  }
  function zero(x) { return Math.abs(x) < 1e-12 ? 0 : x; }

  /** Poids d'un écart selon son âge : entier sur la première moitié de la fenêtre, puis 0 en douceur au bout. */
  function poids(age) {
    var k = (age - FENETRE / 2) / (FENETRE / 2);
    if (k <= 0) return 1;
    if (k >= 1) return 0;
    return 1 - k * k * (3 - 2 * k);
  }

  function impulsion(instant, force) { return { instant: num(Number(instant), 0), force: num(Number(force), 0) }; }

  /** Grille de la fenêtre : instants τ_i = (k0 − n − 1 + i) · PAS, i = 0 … n + 1. */
  function grille(t) {
    var n = Math.round(FENETRE / PAS), k0 = Math.floor(t / PAS + 1e-9);
    return { n: n, k0: k0, tau: function (i) { return (k0 - n - 1 + i) * PAS; } };
  }

  /** Vitesse donnée par les impulsions tombées dans ]a, b], pondérée par leur âge à t. */
  function coups(liste, a, b, t) {
    var s = 0;
    (liste || []).forEach(function (c) { if (c.instant > a && c.instant <= b) s += c.force * poids(t - c.instant); });
    return s;
  }

  function pendule(reglage, t, forces) {
    var r = reglage || {}, f = forces || {}, gr = grille(t), h = PAS;
    var g = num(r.gravite, G), L = Math.max(1e-6, num(r.longueur, 1)), prise = num(r.prise, PRISE);
    var c = 2 * borne(num(r.amorti, 0.15), 0, 1) * Math.sqrt(g / L), vref = VITESSE_VENT * g / G;
    var piv = [];
    for (var i = 0; i <= gr.n + 1; i++) piv.push(r.pivot ? vec(r.pivot, gr.tau(i)) : [0, 0]);
    /** Accélération extérieure du bout dans le repère du pivot, à τ_i (vent relatif, porteur, poussée). */
    function acc(i) {
      var u = gr.tau(i), a = [0, 0];
      var vx = (piv[i + 1][0] - piv[i - 1][0]) / (2 * h), vy = (piv[i + 1][1] - piv[i - 1][1]) / (2 * h);
      if (f.vent) { var v = vec(f.vent, u); a[0] += prise * g * (v[0] - vx / vref); a[1] += prise * g * (v[1] - vy / vref); }
      a[0] -= (piv[i + 1][0] - 2 * piv[i][0] + piv[i - 1][0]) / (h * h);
      a[1] -= (piv[i + 1][1] - 2 * piv[i][1] + piv[i - 1][1]) / (h * h);
      if (f.poussee) { var p = vec(f.poussee, u); a[0] += p[0]; a[1] += p[1]; }
      return a;
    }
    var a0 = acc(1);
    var theta = Math.atan2(a0[0], g + a0[1]), omega = 0;
    for (var j = 1; j <= gr.n; j++) {
      var aj = acc(j), w = poids(t - gr.tau(j)), ax = a0[0] + w * (aj[0] - a0[0]), ay = a0[1] + w * (aj[1] - a0[1]);
      omega += h * ((ax * Math.cos(theta) - (g + ay) * Math.sin(theta)) / L - c * omega);
      omega += coups(f.impulsions, gr.tau(j - 1), gr.tau(j), t);
      theta += h * omega;
    }
    theta += omega * (t - gr.k0 * PAS);
    return zero(theta);
  }

  function ressortAmorti(reglage, t, forces) {
    var r = reglage || {}, f = forces || {}, gr = grille(t), h = PAS;
    var k = Math.max(1e-6, num(r.k, 40)), c = Math.max(0, num(r.c, 6));
    var cible = function (u) { return typeof r.cible === 'function' ? num(r.cible(u), 0) : num(r.cible, 0); };
    var pousse = function (u) { return f.poussee ? num(typeof f.poussee === 'function' ? f.poussee(u) : f.poussee, 0) : 0; };
    var c0 = cible(gr.tau(1)), p0 = pousse(gr.tau(1));
    var x = c0 + p0 / k, v = 0;
    for (var j = 1; j <= gr.n; j++) {
      var u = gr.tau(j), w = poids(t - u);
      var cj = c0 + w * (cible(u) - c0), pj = p0 + w * (pousse(u) - p0);
      v += h * (-k * (x - cj) - c * v + pj);
      v += coups(f.impulsions, gr.tau(j - 1), u, t);
      x += h * v;
    }
    x += v * (t - gr.k0 * PAS);
    return zero(x);
  }

  /* ---------- vent ---------- */

  /** Niveau d'une scène (data-vent) -> { force, rafales } ou null. */
  function niveau(texte) {
    var n = String(texte === undefined || texte === null ? '' : texte).trim();
    return Object.prototype.hasOwnProperty.call(NIVEAUX, n) ? NIVEAUX[n] : null;
  }

  /** Clés de la piste : scènes [{ debut, vent, dir }] (data-vent, data-vent-dir) et déroulé [{ de, force, dir }]. */
  function entreesVent(o) {
    var out = [];
    ((o && o.scenes) || []).forEach(function (s) {
      var nv = niveau(s.vent);
      if (nv && isFinite(s.debut)) out.push({ de: s.debut, force: nv.force, rafales: nv.rafales, dir: num(Number(s.dir), 0) });
    });
    ((o && o.deroule) || []).forEach(function (d) {
      if (d && isFinite(d.de)) { var fo = borne(num(d.force, 0), 0, 1); out.push({ de: d.de, force: fo, rafales: RAFALES_DEROULE * fo, dir: num(d.dir, 0) }); }
    });
    return out;
  }

  function melange(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, r: a.r + (b.r - a.r) * k }; }

  /** Piste triée (à instant égal, l'ordre des clés est gardé : le déroulé, donné après, l'emporte) ; départ de chaque clé. */
  function piste(entrees) {
    var cles = (entrees || []).map(function (e, i) { return { de: e.de, i: i, cible: { x: e.force * Math.cos(e.dir * DEG), y: e.force * Math.sin(e.dir * DEG), r: e.rafales || 0 } }; })
      .sort(function (a, b) { return (a.de - b.de) || (a.i - b.i); });
    var calme = { x: 0, y: 0, r: 0 };
    cles.forEach(function (c, i) {
      var p = cles[i - 1];
      c.depart = p ? melange(p.depart, p.cible, lisse((c.de - p.de) / TRANSITION)) : calme;
    });
    return { cles: cles, defini: cles.length > 0 };
  }

  // Rafales : somme de trois sinus à graine (phases tirées une fois), positive seulement (des coups de vent).
  var PHASES = (function () {
    var s = 11, out = [];
    for (var i = 0; i < 4; i++) { s = (s * 16807) % 2147483647; out.push(2 * Math.PI * (s - 1) / 2147483646); }
    return out;
  })();
  function rafale(t) {
    var s = 0.5 * Math.sin(2 * Math.PI * 0.11 * t + PHASES[0]) + 0.3 * Math.sin(2 * Math.PI * 0.29 * t + PHASES[1]) + 0.2 * Math.sin(2 * Math.PI * 0.71 * t + PHASES[2]);
    return Math.pow(Math.max(0, s), 1.5);
  }

  /** Vent de la piste à t : { x, y, force, dir } (dir en degrés). Continu en t. */
  function ventPiste(p, t) {
    var cles = (p && p.cles) || [], c = null;
    for (var i = 0; i < cles.length && cles[i].de <= t; i++) c = cles[i];
    var b = c ? melange(c.depart, c.cible, lisse((t - c.de) / TRANSITION)) : { x: 0, y: 0, r: 0 };
    var m = Math.hypot(b.x, b.y);
    if (m < 1e-12 && b.r < 1e-12) return { x: 0, y: 0, force: 0, dir: 0 };
    var dir = m > 1e-12 ? Math.atan2(b.y, b.x) : 0;
    var mag = m + b.r * rafale(t), ang = dir + 0.12 * b.r * Math.sin(2 * Math.PI * 0.17 * t + PHASES[3]);
    return { x: zero(mag * Math.cos(ang)), y: zero(mag * Math.sin(ang)), force: mag, dir: ang / DEG };
  }

  /** Accélération du vent (unités/s²) d'une gravité g et d'une prise : pour les os en plus. */
  function accelerationVent(v, g, prise) { var w = vec(v); var k = num(prise, PRISE) * g; return [k * w[0], k * w[1]]; }

  /** Pendants (écharpe, objets portés) d'un dessin plume : [{ cle, longueur, amorti, prise }], longueur en fraction de la figure. */
  function pendantsDe(dessin) {
    var out = [];
    ((dessin && dessin.vetements) || []).forEach(function (v) { if (v && v.forme === 'echarpe') out.push(Object.assign({ cle: 'echarpe' }, PENDANTS.echarpe)); });
    (((dessin && dessin.plume) || {}).objets || []).forEach(function (o) {
      if (o && PENDANTS[o.forme]) out.push(Object.assign({ cle: 'objet' + (o.main || 'Avant') }, PENDANTS[o.forme]));
    });
    return out;
  }

  /** Angles des pendants à t, en degrés dans la convention de l'habillage plume (positif : le bout part vers −x).
   *  pendants : pendantsDe(dessin) ; pivots(u) -> { cle: [x, y] } (unités de la scène) ; hauteur : la figure en unités de la
   *  scène ; vent : u -> { x, y }. Les pivots sont calculés une fois par instant de la grille. */
  function anglesPendants(pendants, t, pivots, hauteur, vent) {
    var memo = {}, g = G * hauteur / HAUTEUR_FIGURE, out = {};
    function en(u) { var k = Math.round(u / PAS); return memo[k] || (memo[k] = pivots(k * PAS) || {}); }
    pendants.forEach(function (p) {
      var a = pendule({ longueur: p.longueur * hauteur, amorti: p.amorti, prise: p.prise, gravite: g, pivot: function (u) { return en(u)[p.cle] || [0, 0]; } }, t, { vent: vent });
      out[p.cle] = zero(-a / DEG);
    });
    return out;
  }

  /** "<longueur> <amorti>" (cqh, 0 à 1) -> { longueur, amorti } ou null. */
  function lirePendule(texte) {
    var m = /^\s*(\d*\.?\d+)\s+(\d*\.?\d+)\s*$/.exec(String(texte || ''));
    if (!m) return null;
    var l = Number(m[1]), a = Number(m[2]);
    return l > 0 && l <= 200 && a >= 0 && a <= 1 ? { longueur: l, amorti: a } : null;
  }

  /* ---------- page ---------- */

  function installer(M) {
    var lue = null;
    function laPiste() {
      if (lue) return lue;
      if (!M.minutage) return piste([]);
      var scenes = [];
      if (racine.document) document.querySelectorAll('[data-scene][data-vent]').forEach(function (sec) {
        var m = (M.minutage.scenes || []).filter(function (x) { return x.id === sec.getAttribute('data-scene'); })[0];
        if (m) scenes.push({ debut: m.debut, vent: sec.getAttribute('data-vent'), dir: sec.getAttribute('data-vent-dir') });
      });
      lue = piste(entreesVent({ scenes: scenes, deroule: M.donnees && M.donnees.vent }));
      return lue;
    }
    M.vent = function (t) { return ventPiste(laPiste(), t); };
    Object.defineProperty(M.vent, 'defini', { get: function () { return laPiste().defini; } });
    /** data-pendule : chaque groupe SVG pend de son bord haut, au milieu, et répond au vent (temps vu par son conteneur). */
    M.demarrerPhysique = function () {
      var liste = [];
      document.querySelectorAll('[data-pendule]').forEach(function (el) {
        var v = lirePendule(el.getAttribute('data-pendule')), sec = el.closest('[data-scene]');
        if (!v || typeof el.getBBox !== 'function') return;
        var affichee = sec ? sec.style.display : '', bb = null;
        if (sec) sec.style.display = '';
        try { bb = el.getBBox(); } catch (e) { bb = null; }
        if (sec) sec.style.display = affichee;
        if (bb) liste.push({ el: el, v: v, px: bb.x + bb.width / 2, py: bb.y, base: el.getAttribute('transform') || '' });
      });
      if (!liste.length) return;
      var r3 = function (x) { var y = Math.round(x * 1000) / 1000; return y === 0 ? 0 : y; };
      M.surRendu(function (t) {
        liste.forEach(function (x) {
          var tp = M.tempsVuPar ? M.tempsVuPar(x.el, t) : t;
          var a = pendule({ longueur: x.v.longueur, amorti: x.v.amorti, gravite: G_CQH, prise: PRISE }, tp, { vent: M.vent });
          var rot = a === 0 ? '' : 'rotate(' + r3(-a / DEG) + ' ' + r3(x.px) + ' ' + r3(x.py) + ')';
          var tr = [x.base, rot].filter(Boolean).join(' ');
          if (tr) x.el.setAttribute('transform', tr); else x.el.removeAttribute('transform');
        });
      });
    };
  }

  return { pendule: pendule, ressortAmorti: ressortAmorti, impulsion: impulsion, poids: poids, niveau: niveau, entreesVent: entreesVent,
    piste: piste, ventPiste: ventPiste, rafale: rafale, accelerationVent: accelerationVent, pendantsDe: pendantsDe, anglesPendants: anglesPendants,
    lirePendule: lirePendule, installer: installer,
    NIVEAUX: NIVEAUX, PENDANTS: PENDANTS, FENETRE: FENETRE, PAS: PAS, G: G, G_CQH: G_CQH, TRANSITION: TRANSITION, VITESSE_VENT: VITESSE_VENT,
    PRISE: PRISE, HAUTEUR_FIGURE: HAUTEUR_FIGURE };
});
