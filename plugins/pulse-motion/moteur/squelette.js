/* Pulse Motion – squelette 2.5D des personnages : la pose → les articulations projetées (sans DOM).
 *
 *   var S = M.squelette;                                   // page ; require('./squelette.js') dans Node
 *   var r = S.calculer({ vue: 45, cuisseAvant: -25 }, gabarit, { temps: t, poseA: f });
 *   r.articulations.mainAvant → [x, y, profondeur], repère du personnage (avant x, y, echelle)
 *
 * Les os sont calculés en 3D (x = avant, y = bas, z = côté Avant) puis projetés selon `vue` :
 *   0 = profil vers la droite · 45 = 3/4 face · 90 = face · -90 = dos · 180 = profil vers la gauche.
 * Conventions des angles (degrés), reprises du rig LemStick :
 *   - cuisse, bras : négatif = membre porté vers l'avant ;
 *   - tibia positif = genou fléchi ; avantBras négatif = coude fléchi ;
 *   - piedAvant / piedArriere : angles absolus (0 = pied à plat) ;
 *   - ecart… : abduction, positif = vers l'extérieur ; torsion… : oriente la charnière
 *     (torsionBras 90 = le coude plie sur le côté) ;
 *   - torseRot : rotation des épaules ; torseIncl : inclinaison latérale ; teteTourne positif = vers le côté Avant.
 * Côtés anatomiques Avant et Arrière (pas gauche / droite). Clés absentes : valeur de REPOS.
 * Les clés d'expression (yeux, regard, sourcils, touffe) font partie de la pose, mais le noyau les ignore (habillage).
 * Contraintes : chaque angle est borné (LIMITES, surchargées par gabarit.contraintes ; « cuisse » vaut pour
 * les deux côtés, « cuisseAvant » pour un seul) ; `efficace` rend la pose réellement appliquée.
 * Os en plus (gabarit.osEnPlus) : balancement recalculé à chaque appel à partir de contexte.poseA(t) sur les
 * FENETRE_OS secondes précédentes (grille absolue de PAS_OS) ; sans contexte, l'os reste à son angle de repos.
 * Module pur : chargé tel quel dans la page (M.squelette) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.squelette = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEG = Math.PI / 180;
  var SEUIL_LOIN = -6;

  var REPOS = Object.freeze({
    x: 0, y: 0, echelle: 1, vue: 0,
    bassinY: 0, bassinRot: 0,
    torse: 3, torseRot: 0, torseIncl: 0, tete: 0, teteTourne: 0, tetePenche: 0,
    cuisseAvant: -4, tibiaAvant: 4, piedAvant: 0, ecartJambeAvant: 3, torsionJambeAvant: 0,
    cuisseArriere: 4, tibiaArriere: 2, piedArriere: 0, ecartJambeArriere: 3, torsionJambeArriere: 0,
    brasAvant: 8, avantBrasAvant: -10, ecartBrasAvant: 8, torsionBrasAvant: 0,
    brasArriere: -6, avantBrasArriere: -12, ecartBrasArriere: 8, torsionBrasArriere: 0,
    yeuxY: 0, tailleYeux: 1, paupieres: 1, regardX: 0, regardY: 0, taillePupilles: 1, sourcilsY: 0, sourcilsAngle: 0,
    touffeRot: 0, touffeEtire: 1, touffeEventail: 1, touffeOnde: 0
  });
  var PLACEMENT = ['x', 'y', 'echelle', 'vue'];
  var EXPRESSION = ['yeuxY', 'tailleYeux', 'paupieres', 'regardX', 'regardY', 'taillePupilles', 'sourcilsY', 'sourcilsAngle',
    'touffeRot', 'touffeEtire', 'touffeEventail', 'touffeOnde'];
  var OS = Object.keys(REPOS).filter(function (k) { return PLACEMENT.indexOf(k) < 0 && EXPRESSION.indexOf(k) < 0; });
  var NOMS = Object.freeze({ placement: PLACEMENT, os: OS, expression: EXPRESSION });
  // Noms des articulations et des chaînes : interdits aux os en plus (ils écraseraient le résultat).
  var RESERVES = Object.freeze(['bassin', 'cou', 'centreTete', 'sommetTete', 'colonne', 'tete',
    'jambeAvant', 'jambeArriere', 'brasAvant', 'brasArriere'].concat(['hanche', 'genou', 'cheville', 'orteil', 'epaule', 'coude', 'main']
    .reduce(function (l, n) { return l.concat([n + 'Avant', n + 'Arriere']); }, [])));

  // Bornes par défaut [min, max] (degrés), clés génériques : un humanoïde souple de cartoon.
  var LIMITES = Object.freeze({
    bassinRot: [-70, 70],
    torse: [-40, 70], torseRot: [-50, 50], torseIncl: [-35, 35],
    tete: [-40, 45], teteTourne: [-85, 85], tetePenche: [-35, 35],
    cuisse: [-125, 45], tibia: [0, 150], pied: [-40, 55], ecartJambe: [-15, 60], torsionJambe: [-40, 45],
    bras: [-180, 60], avantBras: [-150, 0], ecartBras: [-20, 175], torsionBras: [-90, 90]
  });

  // Proportions du rig LemStick (unités SVG à l'échelle 1).
  var GABARIT = Object.freeze({
    cuisse: 68, tibia: 68, pied: 15, colonne: 82, hauteurEpaules: 72, baseTete: 84,
    bras: 50, avantBras: 46, demiBassin: 6, demiEpaules: 9,
    tete: Object.freeze({ rx: 34, ry: 50 }),
    osEnPlus: Object.freeze([]), contraintes: Object.freeze({})
  });

  /* ---------- maths 3D ---------- */
  function Rz(a) { var c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function Rx(a) { var c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function Ry(a) { var c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
  function mul(A, B) {
    var o = new Array(9);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++)
      o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return o;
  }
  function tf(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

  /* ---------- gabarit et contraintes ---------- */
  function completerGabarit(gabarit) {
    var g = gabarit || {};
    var out = {};
    Object.keys(GABARIT).forEach(function (k) { out[k] = g[k] !== undefined ? g[k] : GABARIT[k]; });
    out.tete = { rx: (g.tete && g.tete.rx !== undefined) ? g.tete.rx : GABARIT.tete.rx, ry: (g.tete && g.tete.ry !== undefined) ? g.tete.ry : GABARIT.tete.ry };
    out.osEnPlus = (g.osEnPlus || []).slice();
    out.contraintes = Object.assign({}, g.contraintes || {});
    return out;
  }

  function generique(nom) { return nom.replace(/(Avant|Arriere)$/, ''); }

  function limite(nom, g) {
    var c = (g && g.contraintes) || {};
    return c[nom] || c[generique(nom)] || LIMITES[nom] || LIMITES[generique(nom)] || null;
  }

  function contraindre(pose, gabarit, actives) {
    var g = gabarit && gabarit.contraintes && gabarit.osEnPlus ? gabarit : completerGabarit(gabarit);
    var p = Object.assign({}, REPOS, pose || {});
    if (actives === false) return p;
    Object.keys(p).forEach(function (k) {
      var lim = limite(k, g);
      if (lim && typeof p[k] === 'number') p[k] = Math.min(lim[1], Math.max(lim[0], p[k]));
    });
    return p;
  }

  /* ---------- géométrie ---------- */
  function geometrie(p, g) {
    var cv = Math.cos(p.vue * DEG), sv = Math.sin(p.vue * DEG);
    function proj(v) { return [v[0] * cv - v[2] * sv, v[1], v[0] * sv + v[2] * cv]; }
    var A = {};
    var hanches = [0, p.bassinY, 0];
    var Rh = Rz(p.bassinRot);
    var Rt = mul(mul(mul(Rh, Rz(p.torse)), Ry(p.torseRot)), Rx(p.torseIncl));
    var cou = add(hanches, tf(Rt, [0, -g.colonne, 0]));
    A.bassin = proj(hanches);
    A.cou = proj(cou);
    [['Avant', 1], ['Arriere', -1]].forEach(function (c) {
      var s = c[0], cote = c[1];
      var hanche = add(hanches, tf(Rh, [0, 0, cote * g.demiBassin]));
      var Rc = mul(mul(mul(Rh, Rx(cote * p['ecartJambe' + s])), Rz(p['cuisse' + s])), Ry(cote * p['torsionJambe' + s]));
      var genou = add(hanche, tf(Rc, [0, g.cuisse, 0]));
      var Rti = mul(Rc, Rz(p['tibia' + s]));
      var cheville = add(genou, tf(Rti, [0, g.tibia, 0]));
      var orteil = add(cheville, tf(Rz(p['pied' + s]), [g.pied, 0, 0]));
      A['hanche' + s] = proj(hanche); A['genou' + s] = proj(genou); A['cheville' + s] = proj(cheville); A['orteil' + s] = proj(orteil);
      var epaule = add(hanches, tf(Rt, [0, -g.hauteurEpaules, cote * g.demiEpaules]));
      var Rb = mul(mul(mul(Rt, Rx(cote * p['ecartBras' + s])), Rz(p['bras' + s])), Ry(cote * p['torsionBras' + s]));
      var coude = add(epaule, tf(Rb, [0, g.bras, 0]));
      var Rab = mul(Rb, Rz(p['avantBras' + s]));
      var main = add(coude, tf(Rab, [0, g.avantBras, 0]));
      A['epaule' + s] = proj(epaule); A['coude' + s] = proj(coude); A['main' + s] = proj(main);
    });
    var Rtete = mul(mul(mul(Rt, Rz(p.tete)), Ry(p.teteTourne)), Rx(p.tetePenche));
    var centre3 = add(add(hanches, tf(Rt, [0, -g.baseTete, 0])), tf(Rtete, [0, -g.tete.ry + 2, 0]));
    A.centreTete = proj(centre3);
    var haut = proj(tf(Rtete, [0, -1, 0]));
    var avant = proj(tf(Rtete, [1, 0, 0]));
    var longHaut = Math.hypot(haut[0], haut[1]);
    var tete = {
      centre: A.centreTete, haut: haut, avant: avant,
      roulis: Math.atan2(haut[0], -haut[1]) / DEG,
      rx: g.tete.rx,
      ry: Math.sqrt(g.tete.ry * g.tete.ry * longHaut * longHaut + g.tete.rx * g.tete.rx * haut[2] * haut[2]),
      vers: function (local) { return proj(add(centre3, tf(Rtete, local))); },
      direction: function (local) { return proj(tf(Rtete, local)); }
    };
    A.sommetTete = tete.vers([0, -(g.tete.ry - 6), 0]);
    return { A: A, tete: tete, proj: proj, hanches: hanches, cou: cou, centre3: centre3, Rh: Rh, Rt: Rt, Rtete: Rtete };
  }

  /** Repère et origine du parent d'un os en plus. */
  function repereParent(parent, geo) {
    if (parent === 'bassin') return { R: geo.Rh, O: geo.hanches };
    if (parent === 'torse') return { R: geo.Rt, O: geo.cou };
    if (parent === 'tete') return { R: geo.Rtete, O: geo.centre3 };
    throw new Error('Os en plus : parent « ' + parent + ' » inconnu (bassin, torse ou tete).');
  }

  /** Os en plus à leur angle (repos + pose + balancement fourni). -> { nom: { base, bout, angle } } */
  function placerOs(p, g, geo, balancements) {
    var out = {};
    g.osEnPlus.forEach(function (os) {
      if (RESERVES.indexOf(os.nom) >= 0 || os.nom in REPOS) throw new Error('Os en plus : le nom « ' + os.nom + ' » est déjà pris par le squelette (ex. queue, oreille, cape).');
      var rp = repereParent(os.parent, geo);
      var angle = (os.angle || 0) + (typeof p[os.nom] === 'number' ? p[os.nom] : 0) + ((balancements && balancements[os.nom]) || 0);
      var base = add(rp.O, tf(rp.R, os.attache || [0, 0, 0]));
      var bout = add(base, tf(mul(rp.R, Rz(angle)), [0, os.longueur, 0]));
      out[os.nom] = { base: geo.proj(base), bout: geo.proj(bout), angle: angle };
    });
    return out;
  }

  var FENETRE_OS = 1, PAS_OS = 1 / 60;

  /** Point d'attache à l'écran (repère du parent du personnage) et tangente du balancement à l'écran
   *  (déplacement du bout par radian ; sa composante horizontale s'efface quand l'os est vu de face). */
  function attacheEcran(pose, g, os, contraintes) {
    var p = contraindre(pose, g, contraintes !== false);
    var geo = geometrie(p, g);
    var a = placerOs(p, g, geo, null)[os.nom];
    var b = {}; b[os.nom] = 1;
    var d = placerOs(p, g, geo, b)[os.nom];
    var e = p.echelle / DEG;
    return { x: p.x + a.base[0] * p.echelle, y: p.y + a.base[1] * p.echelle, T: [(d.bout[0] - a.bout[0]) * e, (d.bout[1] - a.bout[1]) * e], L: (os.longueur || 1) * p.echelle };
  }

  /** Poids d'une poussée selon son âge : entier sur la première moitié de la fenêtre, puis s'efface en douceur
   *  jusqu'à 0 au bout de la fenêtre (pas de saut quand une poussée en sort). */
  function poids(age) {
    var k = (age - FENETRE_OS / 2) / (FENETRE_OS / 2);
    if (k <= 0) return 1;
    if (k >= 1) return 0;
    return 1 - k * k * (3 - 2 * k);
  }

  /** Balancement (degrés) d'un os à l'instant t : ressort amorti intégré sur la fenêtre passée, depuis le repos,
   *  piloté par l'accélération du point d'attache projetée sur la tangente du balancement (pendule).
   *  Grille absolue (multiples de PAS_OS) : même t ⇒ même résultat, quel que soit l'ordre des appels. */
  function balancement(os, g, t, poseA, contraintes) {
    var n = Math.round(FENETRE_OS / PAS_OS);
    var k0 = Math.floor(t / PAS_OS + 1e-9);
    var pts = [];
    for (var i = -n - 1; i <= 0; i++) pts.push(attacheEcran(poseA((k0 + i) * PAS_OS), g, os, contraintes));
    var f = 0.8 + 4 * Math.max(0, Math.min(1, os.raideur === undefined ? 0.5 : os.raideur));
    var raid = Math.pow(2 * Math.PI * f, 2);
    var amort = 2 * Math.max(0, Math.min(1, os.amorti === undefined ? 0.4 : os.amorti)) * Math.sqrt(raid);
    var theta = 0, omega = 0, h = PAS_OS;
    for (var j = 1; j < pts.length - 1; j++) {
      var q = pts[j];
      var ax = (pts[j + 1].x - 2 * q.x + pts[j - 1].x) / (h * h);
      var ay = (pts[j + 1].y - 2 * q.y + pts[j - 1].y) / (h * h);
      var age = t - (k0 + j - n - 1) * PAS_OS;
      var pousse = -(ax * q.T[0] + ay * q.T[1]) / (q.L * q.L) / DEG * poids(age);
      omega += h * (pousse - raid * theta - amort * omega);
      theta += h * omega;
    }
    theta += omega * (t - k0 * PAS_OS);
    var v = Math.max(-80, Math.min(80, theta));
    return Math.abs(v) < 1e-9 ? 0 : v;
  }

  function calculerOsEnPlus(p, g, geo, ctx) {
    var bal = {};
    var anime = typeof ctx.poseA === 'function' && typeof ctx.temps === 'number';
    g.osEnPlus.forEach(function (os) { bal[os.nom] = anime ? balancement(os, g, ctx.temps, ctx.poseA, ctx.contraintes) : 0; });
    var out = placerOs(p, g, geo, bal);
    Object.keys(out).forEach(function (nom) { out[nom].balancement = bal[nom]; });
    return out;
  }

  function moyenne(A, noms) { return noms.reduce(function (s, n) { return s + A[n][2]; }, 0) / noms.length; }

  function calculer(pose, gabarit, contexte) {
    var g = completerGabarit(gabarit);
    var ctx = contexte || {};
    var p = contraindre(pose, g, ctx.contraintes !== false);
    var geo = geometrie(p, g);
    var A = geo.A;
    var os = calculerOsEnPlus(p, g, geo, ctx);
    var colonne = moyenne(A, ['bassin', 'cou']);
    var profondeurs = {
      jambeAvant: moyenne(A, ['hancheAvant', 'genouAvant', 'chevilleAvant']),
      jambeArriere: moyenne(A, ['hancheArriere', 'genouArriere', 'chevilleArriere']),
      brasAvant: moyenne(A, ['epauleAvant', 'coudeAvant', 'mainAvant']),
      brasArriere: moyenne(A, ['epauleArriere', 'coudeArriere', 'mainArriere']),
      colonne: colonne - 0.5,
      tete: Math.max(colonne, A.centreTete[2]) + 0.5
    };
    Object.keys(os).forEach(function (n) {
      A[n] = os[n].base;
      A[n + 'Bout'] = os[n].bout;
      profondeurs[n] = (os[n].base[2] + os[n].bout[2]) / 2;
    });
    var noms = Object.keys(profondeurs);
    var ordre = noms.slice().sort(function (a, b) { return (profondeurs[a] - profondeurs[b]) || (noms.indexOf(a) - noms.indexOf(b)); });
    return { articulations: A, profondeurs: profondeurs, ordre: ordre, efficace: p, tete: geo.tete, os: os };
  }

  /* ---------- utilitaires ---------- */
  function sol(gabarit) { var g = completerGabarit(gabarit); return g.cuisse + g.tibia; }

  /** Copie de la pose dont bassinY pose la cheville la plus basse sur le sol (géométrie complète : bascule,
   *  écart et torsion compris). */
  function poserAuSol(pose, gabarit) {
    var g = completerGabarit(gabarit);
    var q = contraindre(pose, g, true);
    q.bassinY = 0;
    var A = geometrie(q, g).A;
    var bas = Math.max(A.chevilleAvant[1], A.chevilleArriere[1]);
    return Object.assign({}, pose, { bassinY: g.cuisse + g.tibia - bas });
  }

  function melanger(a, b, k) {
    var out = {};
    var cles = Object.keys(Object.assign({}, REPOS, a, b));
    cles.forEach(function (c) {
      var va = typeof a[c] === 'number' ? a[c] : (typeof REPOS[c] === 'number' ? REPOS[c] : b[c]);
      var vb = typeof b[c] === 'number' ? b[c] : (typeof REPOS[c] === 'number' ? REPOS[c] : a[c]);
      if (typeof va === 'number' && typeof vb === 'number') out[c] = va + (vb - va) * k;
    });
    return out;
  }

  function pointDe(resultat, nom) {
    var j = resultat.articulations[nom];
    if (!j) return null;
    var p = resultat.efficace;
    return { x: p.x + j[0] * p.echelle, y: p.y + j[1] * p.echelle, profondeur: j[2] };
  }

  /* ---------- IK à deux os (plan sagittal) ---------- */
  function normaliser(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }

  /** Angles d'une chaîne à deux os dont l'extrémité vise `cible`. sens 1 : genou ; -1 : coude. */
  function ik2(racine, l1, l2, cible, sens) {
    var dx = cible[0] - racine[0], dy = cible[1] - racine[1];
    var d = Math.hypot(dx, dy);
    var max = l1 + l2, min = Math.abs(l1 - l2);
    var atteint = d <= max + 1e-9 && d >= min - 1e-9 && d > 1e-9;
    var dd = Math.min(max - 1e-6, Math.max(min + 1e-6, d));
    var phi = d > 1e-9 ? Math.atan2(-dx, dy) : 0;
    var borne = function (x) { return Math.max(-1, Math.min(1, x)); };
    var alpha = Math.acos(borne((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd)));
    var beta = Math.acos(borne((l1 * l1 + l2 * l2 - dd * dd) / (2 * l1 * l2)));
    return {
      a1: normaliser((phi - sens * alpha) / DEG),
      a2: normaliser(sens * (Math.PI - beta) / DEG),
      atteint: atteint
    };
  }

  var CHAINES = Object.freeze({
    mainAvant: { racine: 'epauleAvant', os1: 'brasAvant', os2: 'avantBrasAvant', l1: 'bras', l2: 'avantBras', sens: -1, base: ['bassinRot', 'torse'] },
    mainArriere: { racine: 'epauleArriere', os1: 'brasArriere', os2: 'avantBrasArriere', l1: 'bras', l2: 'avantBras', sens: -1, base: ['bassinRot', 'torse'] },
    chevilleAvant: { racine: 'hancheAvant', os1: 'cuisseAvant', os2: 'tibiaAvant', l1: 'cuisse', l2: 'tibia', sens: 1, base: ['bassinRot'] },
    chevilleArriere: { racine: 'hancheArriere', os1: 'cuisseArriere', os2: 'tibiaArriere', l1: 'cuisse', l2: 'tibia', sens: 1, base: ['bassinRot'] }
  });

  /** Angles qui amènent `extremite` (mainAvant…, chevilleArriere) sur `cible` (repère du personnage, à l'écran).
   *  Résolu dans le plan de la chaîne, puis affiné par la méthode de Newton sur la géométrie complète (écart, torsion,
   *  rotation du torse, vue de 3/4) ; angles bornés par les contraintes. atteint : extrémité à moins de 0,5 de la cible. */
  function atteindre(pose, gabarit, extremite, cible) {
    var c = CHAINES[extremite];
    if (!c) throw new Error('IK : extrémité « ' + extremite + ' » inconnue (mainAvant, mainArriere, chevilleAvant ou chevilleArriere).');
    var g = completerGabarit(gabarit);
    var p = contraindre(pose, g, true);
    var cv = Math.cos(p.vue * DEG);
    if (Math.abs(cv) < 0.25) return null;
    var r = geometrie(p, g).A[c.racine];
    var base = c.base.reduce(function (s, k) { return s + p[k]; }, 0);
    var borner = function (nom, v) { var l = limite(nom, g); return l ? Math.min(l[1], Math.max(l[0], v)) : v; };
    var res = ik2([0, 0], g[c.l1], g[c.l2], [(cible[0] - r[0]) / cv, cible[1] - r[1]], c.sens);
    var x = [borner(c.os1, normaliser(res.a1 - base)), borner(c.os2, res.a2)];
    function bout(v) {
      var q = Object.assign({}, p);
      q[c.os1] = v[0]; q[c.os2] = v[1];
      return geometrie(q, g).A[extremite];
    }
    // Newton sur la géométrie complète, à partir de la solution du plan de la chaîne.
    var b = bout(x), erreur = Math.hypot(cible[0] - b[0], cible[1] - b[1]), d = 0.05;
    for (var it = 0; it < 20 && erreur > 1e-3; it++) {
      var e0 = cible[0] - b[0], e1 = cible[1] - b[1];
      var u = bout([x[0] + d, x[1]]), w = bout([x[0], x[1] + d]);
      var j00 = (u[0] - b[0]) / d, j10 = (u[1] - b[1]) / d, j01 = (w[0] - b[0]) / d, j11 = (w[1] - b[1]) / d;
      var det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-9) break;
      var p0 = (e0 * j11 - e1 * j01) / det, p1 = (j00 * e1 - j10 * e0) / det;
      var pas = Math.hypot(p0, p1);
      if (pas > 30) { p0 *= 30 / pas; p1 *= 30 / pas; }
      var y = [borner(c.os1, x[0] + p0), borner(c.os2, x[1] + p1)];
      var by = bout(y), ey = Math.hypot(cible[0] - by[0], cible[1] - by[1]);
      if (ey >= erreur) break;
      x = y; b = by; erreur = ey;
    }
    var out = {};
    out[c.os1] = x[0];
    out[c.os2] = x[1];
    out.atteint = res.atteint && erreur < 0.5;
    return out;
  }

  return {
    REPOS: REPOS, NOMS: NOMS, LIMITES: LIMITES, GABARIT: GABARIT, SEUIL_LOIN: SEUIL_LOIN,
    completerGabarit: completerGabarit, generique: generique, limite: limite, contraindre: contraindre,
    calculer: calculer, sol: sol, poserAuSol: poserAuSol, melanger: melanger, pointDe: pointDe,
    ik2: ik2, CHAINES: CHAINES, atteindre: atteindre, FENETRE_OS: FENETRE_OS, PAS_OS: PAS_OS, RESERVES: RESERVES,
    // Interne (débogage).
    _geometrie: geometrie, _placerOs: placerOs
  };
});
