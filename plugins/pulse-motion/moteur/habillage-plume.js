/* Pulse Motion – habillage « plume » (spec S11, 5.6) : un trait d'encre fin sur papier, figures ouvertes sans visage.
 *   var perso = M.plume.creer(g, dessin, gabarit, { graine, traits, ebullition });
 *   perso.rendre(M.squelette.calculer(pose, gabarit), { temps, ebullition, angles }); perso.main('Avant'); perso.accroches()
 *   M.plume.dessiner(r, dessin, gabarit, { graine, traits, pas, angles }) -> { traces, accroches, ourlet }   (pur)
 * Trait : 1,4 % de la hauteur, encre var(--pm-encre), papier var(--pm-papier). Tremblé tiré par main-levee.js (graine par
 * personnage et par membre), aucun filtre. Écharpe et objets : pivot et angle (0 : ils pendent droit ; pendules en 5.8).
 * D'après line-art-animation (MIT, © 2026 JDhruv14 : lib/ink.ts limb, shape, blot, paint ; examples/walker), réécrit.
 */
(function (racine, fabrique) {
  var api = fabrique(racine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.plume = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (racine) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg', DEG = Math.PI / 180, N = 16;
  var FORMES = Object.freeze({
    cheveux: ['courts', 'chignon', 'couettes'], chapeau: ['melon', 'casquette'],
    vetements: ['manteau', 'robe', 'jupe', 'echarpe'], objets: ['sac', 'mallette'], mains: ['Avant', 'Arriere']
  });
  // Ourlet : fraction de la jambe (hanche → cheville) où il tombe.
  var OURLET = { manteau: 0.55, robe: 0.8, jupe: 0.42 };
  var PARTIES = ['jambeArriere', 'jambeAvant', 'brasArriere', 'colonne', 'tete', 'brasAvant'];
  var CSS = '.pm-plume{color:var(--pm-encre,#1c1c1c)}\n.pm-plume path{stroke-linecap:round;stroke-linejoin:round}\n' +
    '.pm-plume .pm-plume-t{stroke:currentColor}\n.pm-plume [data-r="aucun"]{fill:none}\n' +
    '.pm-plume [data-r="papier"]{fill:var(--pm-papier,#fdfcf8)}\n.pm-plume [data-r="encre"]{fill:currentColor}';

  // Modules lus à l'usage : M.mainLevee et M.squelette dans la page, require dans Node.
  function mod(nom, f) { return (racine.M && racine.M[nom]) || require(f); }
  function ml() { return mod('mainLevee', './dessin/main-levee.js'); }
  function sq() { return mod('squelette', './squelette.js'); }

  function f(x) { var v = Math.round(x * 100) / 100; return v === 0 ? 0 : v; }
  function pt(p) { return f(p[0]) + ' ' + f(p[1]); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function lerp(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  function long(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function unit(a) { var l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function ouvert(P) { return 'M' + P.map(pt).join('L'); }
  /** Forme close arrondie par les milieux (un point doublé fait un angle vif). */
  function close(P) {
    var n = P.length, d = 'M' + pt(lerp(P[n - 1], P[0], 0.5));
    for (var i = 0; i < n; i++) d += 'Q' + pt(P[i]) + ' ' + pt(lerp(P[i], P[(i + 1) % n], 0.5));
    return d + 'Z';
  }
  /** Bézier quadratique par 2 ou 3 articulations (celle du milieu poussée de 0,55) : N + 1 points. */
  function courbe(J) {
    var s = J[0], e = J[J.length - 1], c = lerp(s, e, 0.5), P = [];
    if (J.length === 3) c = add(J[1], mul(sub(J[1], c), 0.55));
    for (var i = 0; i <= N; i++) { var t = i / N, u = 1 - t; P.push(add(add(mul(s, u * u), mul(c, 2 * u * t)), mul(e, t * t))); }
    return P;
  }
  /** Décalage de d le long des normales, plus un tremblé lisse (quatre nœuds tirés) d'amplitude amp. */
  function decaler(P, d, alea, amp) {
    var k = [alea(), alea(), alea(), alea()];
    return P.map(function (p, i) {
      var q = unit(sub(P[Math.min(N, i + 1)], P[Math.max(0, i - 1)])), x = i / N * 3, j = Math.min(2, Math.floor(x));
      var w = (1 - Math.cos((x - j) * Math.PI)) / 2, o = d + amp * (2 * (k[j] * (1 - w) + k[j + 1] * w) - 1);
      return [p[0] - q[1] * o, p[1] + q[0] * o];
    });
  }
  /** Retire la longueur l au bout d'une ligne. */
  function couper(P, l) {
    var Q = P.slice();
    while (Q.length > 2 && l > 0) {
      var a = Q[Q.length - 1], b = Q[Q.length - 2], s = long(a, b);
      if (s > l) { Q[Q.length - 1] = lerp(a, b, l / s); return Q; }
      l -= s; Q.pop();
    }
    return Q;
  }
  function tourner(p, o, a) { var c = Math.cos(a * DEG), s = Math.sin(a * DEG), d = sub(p, o); return [o[0] + d[0] * c - d[1] * s, o[1] + d[0] * s + d[1] * c]; }

  function ajouter(c, partie, cle, role, d, remplissage, contour, membre) {
    var v = remplissage || 'aucun', plat = ['encre', 'papier', 'aucun'].indexOf(v) < 0;
    c.traces.push({ partie: partie, cle: cle, role: role, d: d, r: plat ? 'aplat' : v, couleur: plat ? v : null, contour: contour ? f(contour) : 0, membre: membre || null });
  }
  /** Membre : deux traits ouverts arrêtés avant le bout (0,4 et 0,9 fois sa largeur), papier entre eux sans fermeture ; ou un
   *  seul trait (traits: 1). */
  function membre(c, partie, nom, J, largeur, remplissage) {
    var P = courbe(J), amp = 0.22 * c.ep;
    if (c.traits === 1) return ajouter(c, partie, nom, 'trait', ouvert(decaler(P, 0, c.alea(nom), amp)), 'aucun', c.ep, nom);
    var h = (largeur - c.ep) / 2, L = decaler(P, h, c.alea(nom + '/a'), amp), R = decaler(P, -h, c.alea(nom + '/b'), amp);
    ajouter(c, partie, nom + '/papier', 'papier', ouvert(L.concat(R.slice().reverse())), remplissage, 0, nom);
    ajouter(c, partie, nom + '/a', 'trait', ouvert(couper(L, 0.4 * largeur)), 'aucun', c.ep, nom);
    ajouter(c, partie, nom + '/b', 'trait', ouvert(couper(R, 0.9 * largeur)), 'aucun', c.ep, nom);
  }
  /** Chaussure : coin d'encre de la cheville vers l'orteil ; de face ou de dos, une semelle vue de bout. */
  function chaussure(c, s, A, w, sens) {
    var o = A['cheville' + s], d = sub(A['orteil' + s], o), l = Math.hypot(d[0], d[1]), cote = l > 0.35 * c.pied;
    var u = cote ? unit(d) : [sens >= 0 ? 1 : -1, 0], n = [-u[1], u[0]];
    if (n[1] < 0 || (n[1] === 0 && u[0] < 0)) n = mul(n, -1);
    var L = Math.max(l, 0.6 * c.pied) * 1.05, Q = function (x, y) { return add(o, add(mul(u, x * w), mul(n, y * w))); };
    var P = cote ? [Q(-0.45, -0.2), Q(L / w * 0.55, -0.25), Q(L / w + 0.2, 0.05), Q(L / w + 0.1, 0.4), Q(L / w + 0.1, 0.4), Q(-0.45, 0.42), Q(-0.45, 0.42)]
      : [Q(-0.6, 0), Q(0, -0.2), Q(0.6, 0), Q(0.6, 0.42), Q(-0.6, 0.42)];
    ajouter(c, 'jambe' + s, 'pied' + s, 'tache', close(P), 'encre', 0);
  }

  /** Tête ovale sans visage (disque en traits: 1), cheveux, chapeau. */
  function tete(c, T, R) {
    var rx = T.rx, ry = c.traits === 1 ? rx : T.ry, ch = R.cheveux, cp = R.chapeau, al = c.alea('tete');
    var cs = Math.cos(T.roulis * DEG), sn = Math.sin(T.roulis * DEG), fx = Math.max(-1, Math.min(1, T.avant[0]));
    var V = function (x, y) { return [T.centre[0] + x * cs - y * sn, T.centre[1] + x * sn + y * cs]; };
    var ov = function (x, y, ax, ay, n, k) { var Q = []; for (var i = 0; i < n; i++) { var a = i / n * 2 * Math.PI, j = k ? k() : 1; Q.push(V(x + ax * j * Math.cos(a), y + ay * j * Math.sin(a))); } return Q; };
    var loc = function (p) { var d = sub(p, T.centre); return [d[0] * cs + d[1] * sn, d[1] * cs - d[0] * sn]; };
    if (ch && ch.forme === 'chignon') ajouter(c, 'tete', 'chignon', 'forme', close(ov(-0.62 * fx * rx, -0.82 * ry, 0.42 * rx, 0.4 * rx, 10)), ch.remplissage, c.ep);
    if (ch && ch.forme === 'couettes') [1, -1].forEach(function (s) {
      var q = loc(T.vers([-0.35 * rx, 0.15 * ry, s * 1.05 * rx]));
      ajouter(c, 'tete', 'couette' + (s > 0 ? 'Avant' : 'Arriere'), 'forme', close(ov(q[0], q[1], 0.3 * rx, 0.5 * ry, 8)), ch.remplissage, c.ep);
    });
    ajouter(c, 'tete', 'tete', 'forme', close(ov(0, 0, rx, ry, 20, function () { return 1 + 0.02 * (al() * 2 - 1); })), 'papier', c.ep);
    if (ch) {
      var tl = (195 + 12 * fx) * DEG, tr = (345 - 15 * fx) * DEG, H = [];
      for (var j = 0; j <= 8; j++) { var t = tl + (tr - tl) * j / 8; H.push(V(1.06 * rx * Math.cos(t), 1.06 * ry * Math.sin(t))); }
      H = [H[0]].concat(H, [H[8], V(-0.25 * fx * rx, (ch.forme === 'courts' ? -0.05 : -0.3) * ry), H[0]]);
      ajouter(c, 'tete', 'cheveux', 'forme', close(H), ch.remplissage, c.ep);
    }
    if (!cp) return;
    var melon = cp.forme === 'melon', y0 = (melon ? -0.35 : -0.22) * ry, lc = (melon ? 0.9 : 1.04) * rx, D = [V(-lc, y0), V(-lc, y0)];
    for (var m = 1; m < 6; m++) { var b = Math.PI * (1 + m / 6); D.push(V(lc * Math.cos(b), y0 + (melon ? 0.95 : 0.92) * ry * Math.sin(b))); }
    ajouter(c, 'tete', 'chapeau', 'forme', close(D.concat([V(lc, y0), V(lc, y0)])), cp.remplissage, c.ep);
    // Bord : bande horizontale de la tête ; casquette : la visière, projetée vers l'avant, cachée de dos.
    var xs = melon ? [-1.45 * rx, 1.45 * rx] : [[0.55, -0.75], [0.55, 0.75], [1.55, -0.75], [1.55, 0.75]].map(function (q) { return loc(T.vers([q[0] * rx, y0, q[1] * rx]))[0]; });
    var g = Math.min.apply(null, xs), d = Math.max.apply(null, xs), e = 0.08 * ry;
    var cache = !melon && T.avant[2] < -0.25 && Math.abs(T.avant[0]) < 0.6;
    ajouter(c, 'tete', 'bord', 'forme', cache ? '' : close([V(g, y0 - e), V(d, y0 - e), V(d + e, y0), V(d, y0 + e), V(g, y0 + e), V(g - e, y0)]), cp.remplissage, c.ep);
  }

  /** Cou, torse (ou trait de colonne), jupe, manteau ou robe, écharpe. */
  function corps(c, r, g, R, angles) {
    var A = r.articulations, p = r.efficace, B = A.bassin, C = A.cou, H = c.H;
    var u = unit(sub(C, B)), n = [-u[1], u[0]], vt = (p.vue + p.torseRot) * DEG, fo = Math.abs(Math.cos(vt)), fa = Math.abs(Math.sin(vt));
    var wS = fo * 0.05 * H + fa * (g.demiEpaules + 0.3 * c.lb), wW = fo * 0.045 * H + fa * (g.demiBassin + 0.5 * c.lj), wN = 0.5 * c.lc;
    var Sh = lerp(B, C, g.hauteurEpaules / g.colonne), haut = function (o, k) { return add(o, mul(u, k * H)); };
    var Q = function (o, a) { return add(o, mul(n, a)); };
    var vet = {}, mesure = null, acc = {};
    R.vetements.forEach(function (v) { vet[v.forme === 'robe' ? 'manteau' : v.forme] = v; });
    var lg = vet.manteau;
    membre(c, 'colonne', 'cou', [C, lerp(C, A.centreTete, 0.8)], c.lc, R.remplissages.torse);
    if (!lg && c.traits === 1) ajouter(c, 'colonne', 'torse', 'trait', ouvert(courbe([B, C])), 'aucun', c.ep, 'torse');
    else if (!lg) ajouter(c, 'colonne', 'torse', 'forme', close([Q(C, -wN), Q(C, wN), Q(Sh, wS), Q(B, wW), Q(B, wW), haut(B, -0.03), Q(B, -wW), Q(B, -wW), Q(Sh, -wS)]), R.remplissages.torse, c.ep);
    // Vêtement : haut avant, taille, ourlet autour des jambes à sa hauteur (et des genoux au-dessus), haut arrière.
    function ourlet(v, avant, arriere, hl) {
      var k = OURLET[v.forme], av = -Infinity, ar = Infinity, hh = 0;
      ['Avant', 'Arriere'].forEach(function (s) {
        var h = A['hanche' + s], ge = A['genou' + s], ch = A['cheville' + s], l1 = long(h, ge), l2 = long(ge, ch), x = k * (l1 + l2);
        var P = x <= l1 ? lerp(h, ge, l1 ? x / l1 : 0) : lerp(ge, ch, l2 ? (x - l1) / l2 : 0);
        (x > l1 ? [h, P, ge] : [h, P]).forEach(function (q) { var a = dot(sub(q, B), n); av = Math.max(av, a); ar = Math.min(ar, a); });
        hh += dot(sub(P, B), u) / 2;
      });
      var ev = (v.forme === 'robe' ? 1.3 : 1.05) * wW, o = add(B, mul(u, hh)), hf, hb;
      av = Math.max(av + 0.6 * c.lj, ev); ar = Math.min(ar - 0.6 * c.lj, -ev);
      hf = Q(o, av); hb = Q(o, ar);
      ajouter(c, 'colonne', v.forme, 'forme', close(avant.concat([Q(B, hl), Q(haut(B, hh / H / 2), av), hf, hf, Q(haut(o, -0.015), (av + ar) / 2), hb, hb, Q(haut(B, hh / H / 2), ar), Q(B, -hl)], arriere)), v.remplissage, c.ep);
      return { avant: f(av), arriere: f(ar), hauteur: f(hh) };
    }
    var ta = haut(B, 0.1), ep = wS + 0.25 * c.lb;
    if (vet.jupe) mesure = ourlet(vet.jupe, [Q(ta, -wW * 1.05), Q(ta, wW * 1.05)], [], wW * 1.1);
    if (lg) mesure = ourlet(lg, [Q(C, -wN * 1.4), Q(C, wN * 1.4), Q(Sh, ep), Q(Sh, ep)], [Q(Sh, -ep), Q(Sh, -ep)], wW + 0.15 * c.lj);
    if (vet.echarpe) {
      var w = wN * 1.7 + fa * 0.2 * c.lb, ce = haut(C, -0.015), piv = haut(ce, -0.015), a = angles.echarpe || 0, l = 0.17 * H, lw = 0.028 * H;
      ajouter(c, 'colonne', 'echarpe', 'forme', close([Q(haut(ce, 0.03), -w), Q(haut(ce, 0.03), w), Q(ce, w * 1.05), Q(haut(ce, -0.03), w), Q(haut(ce, -0.03), -w), Q(ce, -w * 1.05)]), vet.echarpe.remplissage, c.ep);
      ajouter(c, 'colonne', 'echarpe/pan', 'forme', close([[-lw, 0], [lw, 0], [lw * 0.9, l], [lw * 0.9, l], [-lw * 0.9, l * 0.96], [-lw * 0.9, l * 0.96]].map(function (q) { return tourner(add(piv, q), piv, a); })), vet.echarpe.remplissage, c.ep);
      acc.echarpe = [f(piv[0]), f(piv[1])];
    }
    return { accroches: acc, ourlet: mesure };
  }

  /** Objet porté (sac, mallette) : il pend du poignet selon son angle (0 : droit) ; dans la partie de son bras. */
  function objet(c, o, A, vue, angles) {
    var piv = A['main' + o.main], a = angles['objet' + o.main] || 0, H = c.H, mal = o.forme === 'mallette', cle = 'objet' + o.main;
    var w = (mal ? 0.065 : 0.045) * H * Math.max(0.25, Math.abs(Math.cos(vue * DEG))), h = (mal ? 0.085 : 0.1) * H, y = 0.03 * H;
    var T = function (P) { return P.map(function (q) { return tourner(add(piv, q), piv, a); }); };
    var P = mal ? [[-w, y], [-w, y], [w, y], [w, y], [w, y + h], [w, y + h], [-w, y + h], [-w, y + h]]
      : [[-w * 0.8, y], [w * 0.8, y], [w * 1.1, y + h * 0.7], [w, y + h], [-w, y + h], [-w * 1.1, y + h * 0.7]];
    ajouter(c, 'bras' + o.main, cle + '/anse', 'trait', ouvert(T(courbe([[-w * 0.35, y], [0, -y * 0.6], [w * 0.35, y]]))), 'aucun', c.ep * 0.6);
    ajouter(c, 'bras' + o.main, cle, 'forme', close(T(P)), o.remplissage, c.ep);
    if (mal) ajouter(c, 'bras' + o.main, cle + '/fermoir', 'trait', ouvert(T([[-w * 0.5, y + h * 0.35], [w * 0.5, y + h * 0.35]])), 'aucun', c.ep * 0.5);
    return [f(piv[0]), f(piv[1])];
  }

  /** Réglage plume du dessin (dessin.plume, dessin.vetements), complété. */
  function reglage(dessin, options) {
    var P = (dessin && dessin.plume) || {}, m = P.remplissages || {};
    var x = function (v, d) { return v ? { forme: v.forme, main: v.main || 'Avant', remplissage: v.remplissage || d } : null; };
    return {
      traits: ((options || {}).traits || P.traits) === 1 ? 1 : 2,
      remplissages: { torse: m.torse || 'papier', bras: m.bras || 'papier', jambes: m.jambes || 'papier' },
      cheveux: x(P.cheveux, 'encre'), chapeau: x(P.chapeau, 'encre'),
      objets: (P.objets || []).map(function (v) { return x(v, 'papier'); }),
      vetements: ((dessin && dessin.vetements) || []).map(function (v) { return x(v, 'papier'); })
    };
  }

  /** Hauteur de la figure, comme partition.hauteur. */
  function hauteur(g) { return g.cuisse + g.tibia + g.baseTete + 2 * g.tete.ry - 2; }

  /** Tracés d'une pose ; angles : { echarpe, objetAvant, objetArriere } en degrés. traces : [{ partie, cle, role, d, r, couleur,
   *  contour, membre }]. */
  function dessiner(r, dessin, gabarit, options) {
    var o = options || {}, g = sq().completerGabarit(gabarit), R = reglage(dessin, o), H = hauteur(g), L = ml();
    var graine = String(o.graine || (dessin && dessin.nom) || 'plume'), pas = o.pas || 0;
    var c = { traces: [], traits: R.traits, H: H, ep: 0.014 * H, lj: 0.044 * H, lb: 0.038 * H, lc: 0.03 * H, pied: g.pied,
      alea: function (cle) { return L.alea(L.graine(graine, cle, pas)); } };
    var A = r.articulations, p = r.efficace, angles = o.angles || {};
    // De face et de dos, les jambes sont droites.
    var droit = Math.abs(Math.sin(p.vue * DEG)) > Math.sin(67.5 * DEG);
    ['Arriere', 'Avant'].forEach(function (s) {
      membre(c, 'jambe' + s, 'jambe' + s, droit ? [A['hanche' + s], A['cheville' + s]] : [A['hanche' + s], A['genou' + s], A['cheville' + s]], c.lj, R.remplissages.jambes);
      chaussure(c, s, A, c.lj, Math.cos(p.vue * DEG));
      membre(c, 'bras' + s, 'bras' + s, [A['epaule' + s], A['coude' + s], A['main' + s]], c.lb, R.remplissages.bras);
    });
    var k = corps(c, r, g, R, angles);
    tete(c, r.tete, R);
    R.objets.forEach(function (x) { k.accroches['objet' + x.main] = objet(c, x, A, p.vue, angles); });
    return { traces: c.traces, accroches: k.accroches, ourlet: k.ourlet };
  }

  /** Ordre des parties : les jambes sous le corps (un manteau les couvre), puis le reste dans l'ordre de profondeur. */
  function ordre(r) {
    var o = (r.ordre || []).filter(function (n) { return PARTIES.indexOf(n) >= 0; }), j = function (n) { return /^jambe/.test(n); };
    return o.filter(j).concat(o.filter(function (n) { return !j(n); }));
  }

  function creer(groupe, dessin, gabarit, options) {
    var o = options || {}, svg = groupe.ownerSVGElement || groupe;
    var el = function (t, a, parent) {
      var e = document.createElementNS(NS, t);
      Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); });
      return parent ? parent.appendChild(e) : e;
    };
    if (!svg.querySelector('style[data-pm-plume]')) svg.insertBefore(el('style', { 'data-pm-plume': '' }), svg.firstChild).textContent = CSS;
    // Groupe réutilisé par l'atelier : on repart de zéro.
    while (groupe.firstChild) groupe.removeChild(groupe.firstChild);
    (groupe.__pmVariables || []).forEach(function (k) { groupe.style.removeProperty(k); });
    var couleurs = (dessin && dessin.couleurs) || {};
    groupe.__pmVariables = Object.keys(couleurs).map(function (k) { groupe.style.setProperty('--' + k, couleurs[k]); return '--' + k; });
    groupe.classList.add('pm-perso', 'pm-plume');
    groupe.setAttribute('data-decor', '');
    var racineG = el('g', { 'data-pm-perso-racine': '' }, groupe), parties = {}, chemins = {}, mains = {}, signature = '', dernieres = {};
    PARTIES.forEach(function (n) { parties[n] = el('g', { 'data-partie': n }, racineG); });
    ['Avant', 'Arriere'].forEach(function (s) { mains[s] = el('g', { 'data-main': s }, parties['bras' + s]); });
    // Chaque tracé est créé une fois, puis seulement mis à jour ; la main reste au-dessus de son bras.
    function chemin(t) {
      var e = el('path', { 'data-plume': t.role, 'data-cle': t.cle, 'data-r': t.r }), m = mains[t.partie.replace(/^bras/, '')];
      if (t.membre) e.setAttribute('data-membre', t.membre);
      if (t.r === 'aplat') e.setAttribute('fill', 'var(--' + t.couleur + ')');
      if (t.contour) { e.setAttribute('class', 'pm-plume-t'); e.setAttribute('stroke-width', t.contour); }
      return (chemins[t.cle] = parties[t.partie].insertBefore(e, m || null));
    }
    function rendre(r, contexte) {
      var x = contexte || {}, eb = typeof x.ebullition === 'number' ? x.ebullition : (o.ebullition || 0), A = r.articulations, p = r.efficace;
      var res = dessiner(r, dessin, gabarit, { graine: o.graine, traits: o.traits, pas: eb > 0 ? ml().pasEbullition(x.temps || 0, eb) : 0, angles: x.angles || o.angles });
      res.traces.forEach(function (t) { (chemins[t.cle] || chemin(t)).setAttribute('d', t.d); });
      dernieres = res.accroches;
      ['Avant', 'Arriere'].forEach(function (s) {
        var h = A['main' + s], e = A['coude' + s];
        mains[s].setAttribute('transform', 'translate(' + pt(h) + ') rotate(' + f(-Math.atan2(h[0] - e[0], h[1] - e[1]) / DEG) + ')');
      });
      var ord = ordre(r), sig = ord.join();
      if (sig !== signature) { ord.forEach(function (n) { racineG.appendChild(parties[n]); }); signature = sig; }
      racineG.setAttribute('transform', 'translate(' + f(p.x) + ' ' + f(p.y) + ') scale(' + f(p.echelle) + ')');
    }
    rendre(sq().calculer({}, gabarit), {});
    return { groupe: groupe, rendre: rendre, main: function (cote) { return mains[cote || 'Avant']; }, accroches: function () { return dernieres; } };
  }

  return { creer: creer, dessiner: dessiner, reglage: reglage, hauteur: hauteur, ordre: ordre, FORMES: FORMES, OURLET: OURLET, CSS: CSS };
});
