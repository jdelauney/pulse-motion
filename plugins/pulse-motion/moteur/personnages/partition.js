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
 *   bouche commencée avant lui, pendant les paroles.
 * - Vie (vie : « pleine » par défaut, « sobre », « mains », « aucune » ; calme === false vaut « aucune ») ; « mains »
 *   (animation limitée) : ni respiration, ni retard, repos tenu sur sa première image, repos vivant des seuls bras (ampleur
 *   doublée), clignements gardés. Pour « pleine » et « sobre » : clignements à des instants
 *   irréguliers tirés d'une graine propre au personnage (sel), et au début de chaque tournant ; respiration en pose et en
 *   geste ; repos vivant (petits mouvements déphasés) en pose tenue et au repos ; retard des bouts (avant-bras, tête,
 *   touffe) sur leur parent, lus « vie.retard » s plus tôt (gabarit). Poids fondus sur 0,25 s comme le corps.
 * - Flotter (trajet « flotter », hauteur en % de l'image, 12 par défaut) : il s'élève (quint-out), dérive doucement (±5 % de
 *   sa taille en 3,2 s), redescend (sine-inout) et touche le sol (écrasement de 6 %) ; il garde sa pose ou son geste, les
 *   jambes pendantes (pieds pointés vers le bas, genoux qui alternent sur 3 s), pieds remis à plat avant le contact.
 *   L'ombre reste au sol (solAuTemps ne compte pas l'élévation). Méthode de rossark-motion-skill (MIT), réécrite.
 * - Atterrissage : ecraseY (écrasement vertical, 1 = aucun) autour de la fin d'un « bondir » (étirement juste avant) et
 *   des contacts d'un geste (champ « contacts » du clip) ; ecrase (conteneur ou action) règle l'ampleur.
 * Champs de partition pour la vie : vie, sel (entier), scene { debut, fin }, ecrase. Méthode du mouvement vivant :
 * rossark-motion-skill et take-one (licences MIT), chiffres repris, code réécrit.
 * Marche calculée (spec S11, 5.7 ; part.demarche === 'calculee', data-demarche) : une marche ou une course de profil (vues 0
 *   et 180) prend la pose de M.demarche, réglages bib.demarches[data-clip du trajet], sinon bib.demarches.marche ou .course, phase
 *   tirée de la distance parcourue (le pied posé ne glisse pas) ; ailleurs le clip (marche, course ou data-clip à images-clés),
 *   fondu selon la vue entre 20° et 2,5° du profil.
 * Aucune mémoire d'un appel à l'autre : même t, même pose.
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var S = nodeJS ? require('../squelette.js') : racine.M.squelette;
  var K = nodeJS ? require('../clips.js') : racine.M.clips;
  var L = nodeJS ? require('./levres.js') : racine.M.levres;
  var V = nodeJS ? require('../vivant.js') : racine.M.vivant;
  // Marche calculée : lue à l'appel (groupe « demarche » du moteur, absent des pages qui ne s'en servent pas).
  var D = function () { return nodeJS ? require('../demarche.js') : racine.M.demarche; };
  var api = fabrique(S, K, L, V, D);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.partition = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, K, L, V, D) {
  'use strict';

  var FONDU = 0.25;
  var ALLURES = { marcher: 'marche', courir: 'course', glisser: 'glisse', bondir: 'bond', flotter: 'flotte' };
  // Trajets qui partent du point atteint en l'air quand ils sont coupés, et qui ne changent pas l'état du corps.
  var EN_L_AIR = { bond: true, flotte: true };
  var SANS_CORPS = { glisse: true, flotte: true };
  var GESTES = ['pose', 'jouer'];
  var SOL = 90;

  var memo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function structure(part) {
    var m = memo && memo.get(part);
    if (m) return m;
    m = { trajets: calculerTrajets(part), bornes: null, vues: null, clignements: null, contacts: null };
    m.bornes = calculerBornes(part, m.trajets);
    m.vues = calculerVues(part, m.trajets);
    if (memo) memo.set(part, m);
    return m;
  }

  function sineInOut(k) { k = Math.max(0, Math.min(1, k)); return (1 - Math.cos(Math.PI * k)) / 2; }
  function lisse(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function quintOut(k) { k = Math.max(0, Math.min(1, k)); return 1 - Math.pow(1 - k, 5); }
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
    return d.allure === 'glisse' ? d.courbe(u) : d.allure === 'flotte' ? sineInOut(u) : u;
  }

  /** Position { x, sol } dans un trajet, à t (borné à son arrêt) ; sansArc : le sol sans la hauteur du bond. */
  function positionTrajet(part, d, t, sansArc, xSol) {
    t = Math.min(t, d.arret);
    var u = Math.max(0, Math.min(1, (t - d.debut) / (d.fin - d.debut)));
    var k = avancement(d, t);
    var x = d.de + (d.vers - d.de) * k;
    var xs = typeof xSol === 'number' ? xSol : x;
    var s0 = solValeur(part, d.solDe, xs), s1 = solValeur(part, d.solVers, xs);
    var sol = s0 + (s1 - s0) * k;
    if (d.allure === 'bond' && !sansArc) sol -= d.hauteur * 4 * u * (1 - u);
    if (d.allure === 'flotte' && !sansArc) sol -= elevation(part, d, t);
    return { x: x, sol: sol };
  }

  /** Élévation d'un « flotter » à t (% de la hauteur de l'image) : montée en quint-out sur min(0,9 s ; 30 %), dérive de
   *  ±5 % de la taille du personnage en 3,2 s (entrée fondue sur 0,6 s), descente en sine-inout sur min(0,7 s ; 25 %). */
  function elevation(part, d, t) {
    var D = d.fin - d.debut, tau = Math.max(0, Math.min(D, t - d.debut));
    var h = d.hauteur, mont = Math.min(0.9, 0.3 * D), desc = Math.min(0.7, 0.25 * D);
    var derive = 0.05 * (typeof part.taille === 'number' ? part.taille : 40);
    function enVol(x) { var u = x - mont; return h + derive * Math.sin(2 * Math.PI * u / 3.2) * lisse(u / 0.6); }
    if (tau < mont) return h * quintOut(tau / mont);
    if (tau < D - desc) return enVol(tau);
    return enVol(D - desc) * (1 - sineInOut((tau - (D - desc)) / desc));
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
    var x = part.x0, sol = solDepart(part), cible = sol, out = [];
    triees(part.actions).forEach(function (a) {
      if (!ALLURES[a.type]) return;
      var prec = out[out.length - 1];
      if (prec && a.debut < prec.arret) {
        prec.arret = Math.max(prec.debut + 1e-6, a.debut);
        // Coupé en route : on repart du point atteint (en l'air pour un bond : pas de saut) ; un trajet coupé sur un
        // même tracé le garde ; le suivant vise encore le sol d'arrivée du coupé s'il n'en donne pas (il redescend).
        var p = positionTrajet(part, prec, prec.arret);
        x = p.x;
        sol = prec.solDe === prec.solVers && !EN_L_AIR[prec.allure] ? prec.solVers : p.sol;
        cible = prec.solVers;
      }
      var fin = Math.max(a.fin, a.debut + 1e-6);
      var d = { debut: a.debut, fin: fin, arret: fin, de: x, vers: typeof a.vers === 'number' ? a.vers : x, solDe: sol,
        solVers: a.sol === undefined || a.sol === null ? cible : a.sol, allure: ALLURES[a.type], vue: a.vue, clip: a.clip,
        hauteur: a.type === 'flotter' ? Math.max(2, Math.min(40, typeof a.hauteur === 'number' ? a.hauteur : 12)) : (typeof a.hauteur === 'number' ? a.hauteur : 15), courbe: a.type === 'glisser' ? courbeDe(a.courbe) : null, a: a };
      out.push(d);
      x = d.vers; sol = d.solVers; cible = d.solVers;
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
      solV = d.arret < d.fin ? (d.solDe === d.solVers && !EN_L_AIR[d.allure] ? d.solVers : p.sol) : d.solVers;
    }
    return { x: x, sol: solValeur(part, solV, x) };
  }
  function xAuTemps(part, t) { return positionAuTemps(part, t).x; }

  /** Ligne du sol sous le personnage à t (% de la hauteur), lue à l'abscisse x (% de la largeur) : sans l'arc d'un
   *  « bondir » ; un sol courbe est suivi, un glissement emmène son sol avec lui. */
  function solAuTemps(part, t, x) {
    var solV = solDepart(part), tr = structure(part).trajets;
    for (var i = 0; i < tr.length; i++) {
      var d = tr[i];
      if (t < d.debut) break;
      if (t < d.arret) return positionTrajet(part, d, t, true, x).sol;
      var p = positionTrajet(part, d, d.arret, true, x);
      solV = d.arret < d.fin ? (d.solDe === d.solVers && !EN_L_AIR[d.allure] ? d.solVers : p.sol) : d.solVers;
    }
    return solValeur(part, solV, x);
  }

  /** Distance parcourue (unités de scène) depuis le début du trajet en cours, le long du chemin (pente, colline) :
   *  longueurs cumulées sur 128 points, calculées une fois par trajet. */
  var POINTS = 128;
  function distanceDansTrajet(part, d, t) {
    if (!d.longueurs) {
      var cumul = [0], prec = positionTrajet(part, d, d.debut, true), total = 0;
      for (var i = 1; i <= POINTS; i++) {
        var q = positionTrajet(part, d, d.debut + (d.fin - d.debut) * i / POINTS, true);
        var dx = (q.x - prec.x) * part.largeur / 100, dy = (q.sol - prec.sol) * (part.hauteur || 0) / 100;
        total += Math.sqrt(dx * dx + dy * dy);
        cumul.push(total);
        prec = q;
      }
      d.longueurs = cumul;
    }
    var f = Math.max(0, Math.min(1, (Math.min(t, d.arret) - d.debut) / (d.fin - d.debut))) * POINTS;
    var i0 = Math.floor(f), i1 = Math.min(POINTS, i0 + 1);
    return d.longueurs[i0] + (d.longueurs[i1] - d.longueurs[i0]) * (f - i0);
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

  function poseDuCorps(part, e, t, bib, gabarit, sansSol) {
    if (e.type === 'pose') {
      var p = bib.poses[e.a.pose];
      return p ? K.resoudrePose(p, bib) : {};
    }
    if (e.type === 'jouer') {
      var c = bib.clips[e.a.clip];
      if (!c) return {};
      var tt = t - e.a.debut;
      if (!c.boucle) tt = Math.min(tt, K.duree(c));
      return c.additif ? K.ajouter({}, c, tt, bib) : K.echantillonner(c, tt, bib, gabarit, sansSol);
    }
    if (e.type === 'bond') {
      var saut = (e.trajet.clip && bib.clips[e.trajet.clip]) || bib.clips.saut;
      if (!saut) return {};
      var ts = saut.boucle ? t - e.trajet.debut : Math.max(0, Math.min(1, (t - e.trajet.debut) / (e.trajet.fin - e.trajet.debut))) * K.duree(saut);
      return saut.additif ? K.ajouter({}, saut, ts, bib) : K.echantillonner(saut, ts, bib, gabarit, sansSol);
    }
    if (e.type === 'marche' || e.type === 'course') {
      // Démarche à soi (data-clip : un mouvement en boucle), sinon la marche ou la course.
      var propre = e.trajet && e.trajet.clip ? bib.clips[e.trajet.clip] : null;
      var defaut = bib.clips[e.type];
      var clip = propre && propre.boucle && !propre.additif ? propre : defaut;
      var calc = part.demarche === 'calculee' ? poseCalculee(part, e, t, bib, gabarit) : null;
      if (calc && calc.poids >= 1) return calc.pose;
      if (!clip) return calc ? calc.pose : {};
      var foulee = (clip.foulee || (defaut && defaut.foulee) || 248) * part.echelle;
      var tc = distanceDansTrajet(part, e.trajet, t) / foulee * clip.duree;
      var duClip = K.echantillonner(clip, tc, bib, gabarit, sansSol);
      return calc ? S.melanger(Object.assign({}, S.REPOS, duClip), Object.assign({}, S.REPOS, calc.pose), calc.poids) : duClip;
    }
    var repos = bib.clips.repos;
    // Le repos respire : chaque personnage à sa phase (deux voisins ne respirent pas ensemble). Vie « mains » : le corps
    // tient la première image du repos (animation limitée), seules les mains bougeront.
    if (repos && vieDe(part) === 'mains') return K.echantillonner(repos, 0, bib, gabarit, sansSol);
    return repos ? K.echantillonner(repos, t + phaseRespiration(part, repos), bib, gabarit, sansSol) : {};
  }

  /** Poids de la marche calculée selon la vue : 1 de profil (à 2,5° près), 0 à 20° et au-delà (3/4, face, dos). */
  function poidsProfil(vue) {
    var c = Math.abs(Math.cos(vue * Math.PI / 180)), a = Math.cos(20 * Math.PI / 180), b = Math.cos(2.5 * Math.PI / 180);
    return lisse((c - a) / (b - a));
  }
  /** Marche calculée d'un trajet à t : { pose, poids } ou null (hors du profil, ou module absent). */
  function poseCalculee(part, e, t, bib, gabarit) {
    var w = poidsProfil(vueAuTemps(part, t)), Dm = D();
    if (!(w > 0) || !Dm) return null;
    var reg = bib.demarches || {};
    var r = (e.trajet.clip && reg[e.trajet.clip]) || reg[e.type] || { genre: e.type };
    var d = Dm.demarche(r, gabarit);
    var phase = distanceDansTrajet(part, e.trajet, t) / (part.echelle * d.cycle);
    return { pose: d.pose(phase, 1).angles, poids: w };
  }

  /* ---------- vie ---------- */

  var DUREE_CLIGNEMENT = 0.34, ECART_CLIGNEMENTS = 0.42;

  function vieDe(part) {
    if (part.calme === false || part.vie === 'aucune') return 'aucune';
    return part.vie === 'sobre' || part.vie === 'mains' ? part.vie : 'pleine';
  }

  // Vie « mains » (animation limitée, style mode-d-emploi) : le repos vivant réduit aux bras et aux avant-bras, ampleur
  // doublée (les mains travaillent), le reste du corps immobile. Clip dérivé une fois par clip source.
  var MAINS = { brasAvant: true, brasArriere: true, avantBrasAvant: true, avantBrasArriere: true };
  var memoMains = typeof WeakMap === 'function' ? new WeakMap() : null;
  function reposMains(rv) {
    var m = memoMains && memoMains.get(rv);
    if (m) return m;
    m = Object.assign({}, rv, { cles: rv.cles.map(function (c) {
      var angles = {};
      Object.keys(c.angles || {}).forEach(function (k) { if (MAINS[k]) angles[k] = 2 * c.angles[k]; });
      return Object.assign({}, c, { angles: angles });
    }).filter(function (c) { return Object.keys(c.angles).length; }) });
    if (memoMains) memoMains.set(rv, m);
    return m;
  }
  function selDe(part) { return typeof part.sel === 'number' ? part.sel >>> 0 : V.sel(part.sel || ''); }
  function phaseRespiration(part, clip) { return (clip.duree || 2.86) * V.graine(2, selDe(part)); }
  function sceneDe(part) {
    if (part.scene && typeof part.scene.debut === 'number') return part.scene;
    var fin = 0;
    part.actions.forEach(function (a) { if (isFinite(a.fin)) fin = Math.max(fin, a.fin); });
    return { debut: 0, fin: fin + 30 };
  }

  // Poids des couches de vie selon l'état du corps (spec Mouvement vivant 5.3, 5.4).
  var POIDS_VIE = { repos: 1, pose: 1, jouer: 0.5, marche: 0, course: 0, bond: 0 };
  var POIDS_RETARD = { repos: 1, pose: 1, jouer: 1, bond: 1, marche: 0, course: 0 };
  var POIDS_RESPIRATION = { repos: 0, pose: 1, jouer: 0.5, marche: 0, course: 0, bond: 0 };
  var POIDS_RESPIRATION_SEULE = { repos: 1, pose: 1, jouer: 0.5, marche: 0, course: 0, bond: 0 };

  /** Poids des couches de vie à t, d'un seul passage : { retard, respiration, vie, borne } (tables par état du corps),
   *  fondus sur FONDU à chaque borne, sans mémoire. borne : dernière borne franchie (ou null). */
  function poidsAuTemps(part, t, tableResp, profondeur) {
    var cur = etatCorps(part, t);
    var w = { retard: POIDS_RETARD[cur.type] || 0, respiration: tableResp[cur.type] || 0, vie: POIDS_VIE[cur.type] || 0, borne: null, type: cur.type };
    var dernier = null, bornes = structure(part).bornes;
    for (var i = 0; i < bornes.length && bornes[i] <= t; i++) dernier = bornes[i];
    w.borne = dernier;
    if (dernier !== null && t - dernier < FONDU) {
      var avant = etatCorps(part, dernier - 1e-6);
      if (avant.type !== cur.type || avant.a !== cur.a || avant.trajet !== cur.trajet) {
        var w0 = (profondeur || 0) < 6 ? poidsAuTemps(part, dernier - 1e-6, tableResp, (profondeur || 0) + 1)
          : { retard: POIDS_RETARD[avant.type] || 0, respiration: tableResp[avant.type] || 0, vie: POIDS_VIE[avant.type] || 0 };
        var k = lisse((t - dernier) / FONDU);
        ['retard', 'respiration', 'vie'].forEach(function (c) { w[c] = w0[c] + (w[c] - w0[c]) * k; });
      }
    }
    return w;
  }

  /** Rythme de clignement de l'expression active à t : { a, b, lenteur }. */
  function rythmeClignement(part, t, bib) {
    var ex = dernier(part, 'expression', t);
    var e = ex && ex.expression && bib.expressions ? bib.expressions[ex.expression] : null;
    var c = e && e.clignement ? e.clignement : {};
    var i = c.intervalle && c.intervalle.length === 2 ? c.intervalle : [3, 4];
    return { a: i[0], b: i[1], lenteur: typeof c.lenteur === 'number' ? c.lenteur : 1 };
  }

  /** Instants des clignements, calculés une fois par partition : [{ t, lenteur }], triés. Réguliers à graine (intervalle
   *  de l'expression), parfois doublés (+ 0,42 s), un à chaque tournant (tourner, regarder une cible, demi-tour d'une
   *  marche) ; les réguliers proches d'un tournant sont retirés, et deux clignements sont espacés de 0,42 s au moins. */
  function calculerClignements(part, bib) {
    var sel = selDe(part), sc = sceneDe(part), fin = sc.fin + 1;
    var reguliers = [];
    var tk = sc.debut + 0.8 + 2.2 * V.graine(0, sel);
    for (var k = 0; tk <= fin && k < 10000; k++) {
      reguliers.push(tk);
      if (V.graine(k, (sel + 7) >>> 0) < 0.15) reguliers.push(tk + ECART_CLIGNEMENTS);
      var r = rythmeClignement(part, tk, bib);
      tk += r.a + (r.b - r.a) * V.graine(k + 1, sel);
    }
    var tournants = [];
    part.actions.forEach(function (a) {
      if (a.type === 'tourner') tournants.push(a.debut);
      if (a.type === 'regarder' && a.cible && String(a.cible).trim() !== 'aucune') tournants.push(a.debut);
    });
    structure(part).vues.forEach(function (ev) {
      var tourne = part.actions.some(function (a) { return a.type === 'tourner' && a.debut === ev.debut; });
      if (!tourne && Math.abs(normaliser(ev.vue - ev.de)) > 1) tournants.push(ev.debut);
    });
    tournants = tournants.filter(function (x) { return isFinite(x) && x >= sc.debut && x <= fin; });
    var tous = reguliers.filter(function (x) {
      return x <= fin && !tournants.some(function (tau) { return x >= tau - 1.2 && x <= tau + 1.5; });
    }).concat(tournants).sort(function (x, y) { return x - y; });
    var gardes = [];
    tous.forEach(function (x) {
      if (gardes.length && x - gardes[gardes.length - 1].t < ECART_CLIGNEMENTS - 1e-9) return;
      gardes.push({ t: x, lenteur: rythmeClignement(part, x, bib).lenteur });
    });
    return gardes;
  }
  function clignements(part, bib) {
    var m = structure(part);
    if (!m.clignements || m.bibClignements !== bib) { m.clignements = calculerClignements(part, bib); m.bibClignements = bib; }
    return m.clignements;
  }

  /** Contacts avec le sol : [{ t, A, etire }] (fin de chaque « bondir » non coupé ; contacts d'un geste joué). */
  function contacts(part, bib) {
    var m = structure(part);
    if (m.contacts && m.bibContacts === bib) return m.contacts;
    var defaut = typeof part.ecrase === 'number' ? part.ecrase : null;
    var liste = [];
    m.trajets.forEach(function (d) {
      if (!EN_L_AIR[d.allure] || d.arret < d.fin) return;
      // Fin d'un bond : 12 %, étirement juste avant ; fin d'un vol (flotter) : 6 %, sans étirement.
      var bond = d.allure === 'bond';
      var A = typeof d.a.ecrase === 'number' ? d.a.ecrase : (defaut !== null ? defaut : bond ? 0.12 : 0.06);
      liste.push({ t: d.fin, A: A, etire: bond });
    });
    part.actions.forEach(function (a) {
      if (a.type !== 'jouer') return;
      var c = bib.clips[a.clip];
      if (!c || c.boucle || !c.contacts) return;
      c.contacts.forEach(function (x) {
        if (a.debut + x <= a.fin + 1e-6) liste.push({ t: a.debut + x, A: defaut !== null ? defaut : 0.08, etire: false });
      });
    });
    liste.sort(function (x, y) { return x.t - y.t; });
    m.contacts = liste; m.bibContacts = bib;
    return liste;
  }

  function cubicOut(k) { k = Math.max(0, Math.min(1, k)); return 1 - Math.pow(1 - k, 3); }


  /** Écrasement vertical autour d'un contact (τ = t − contact) ; 1 hors de sa fenêtre. */
  function profilEcrase(c, tau) {
    var A = c.A;
    if (!(A > 0)) return 1;
    var haut = c.etire ? 1.06 : 1;
    if (tau < -0.04) return c.etire && tau >= -0.2 ? 1 + 0.06 * lisse((tau + 0.2) / 0.16) : 1;
    if (tau < 0.06) return haut + (1 - A - haut) * cubicOut((tau + 0.04) / 0.1);
    if (tau < 0.18) return (1 - A) + 1.25 * A * sineInOut((tau - 0.06) / 0.12);
    if (tau <= 0.32) return (1 + 0.25 * A) - 0.25 * A * sineInOut((tau - 0.18) / 0.14);
    return 1;
  }
  function ecraseAuTemps(part, t, bib) {
    var liste = contacts(part, bib), choisi = null;
    for (var i = 0; i < liste.length; i++) {
      var tau = t - liste[i].t;
      if (tau >= (liste[i].etire ? -0.2 : -0.04) && tau <= 0.32) choisi = liste[i];
    }
    return choisi ? profilEcrase(choisi, t - choisi.t) : 1;
  }

  function valeurDe(pose, k) { return typeof pose[k] === 'number' ? pose[k] : S.REPOS[k]; }

  // Bouts qui arrivent après leur parent (enfant, parent, facteur de la force du gabarit).
  var RETARDS = [['avantBrasAvant', 'brasAvant', 1], ['avantBrasArriere', 'brasArriere', 1], ['tete', 'torse', 1], ['touffeRot', 'tete', 4 / 3]];

  /** Instants où l'état du corps change (débuts et fins des gestes et des trajets). */
  function calculerBornes(part, tr) {
    var b = [];
    part.actions.forEach(function (a) { if (GESTES.indexOf(a.type) >= 0) b.push(a.debut, a.fin); });
    tr.forEach(function (d) { if (!SANS_CORPS[d.allure]) b.push(d.debut, d.arret); });
    return b.sort(function (x, y) { return x - y; });
  }

  /** sansSol : sans poser les pieds au sol (bassinY non corrigé), pour le retard qui ne lit que le haut du corps. */
  function corpsAuTemps(part, t, bib, gabarit, profondeur, sansSol) {
    var cur = etatCorps(part, t);
    var pose = poseDuCorps(part, cur, t, bib, gabarit, sansSol);
    // Fondu : depuis la pose affichée juste avant la dernière borne franchie (elle-même peut-être en plein fondu :
    // deux changements rapprochés s'enchaînent sans saut). Sans mémoire : tout se recalcule à partir de t.
    var dernier = null;
    structure(part).bornes.forEach(function (b) { if (b <= t) dernier = b; });
    if (dernier !== null && t - dernier < FONDU) {
      var avant = etatCorps(part, dernier - 1e-6);
      if (avant.type !== cur.type || avant.a !== cur.a || avant.trajet !== cur.trajet) {
        var depart = (profondeur || 0) < 6 ? corpsAuTemps(part, dernier - 1e-6, bib, gabarit, (profondeur || 0) + 1, sansSol).pose : poseDuCorps(part, avant, dernier - 1e-6, bib, gabarit, sansSol);
        pose = S.melanger(Object.assign({}, S.REPOS, depart), Object.assign({}, S.REPOS, pose), lisse((t - dernier) / FONDU));
      }
    }
    return { pose: pose, type: cur.type };
  }

  /** En vol (flotter) : jambes pendantes, d'un poids fondu selon l'élévation (plein à mi-hauteur) ; pieds pointés vers le
   *  bas (70° et 64°), remis à plat dans les 0,15 s avant le contact ; genoux qui alternent lentement (3 s) ; jambes
   *  serrées, bras un peu écartés. Pose inchangée hors d'un vol. */
  function jambesPendantes(part, t, pose) {
    var tr = structure(part).trajets, d = null;
    for (var i = 0; i < tr.length; i++) if (tr[i].allure === 'flotte' && tr[i].debut <= t && t < tr[i].arret) d = tr[i];
    if (!d) return pose;
    var w = lisse(elevation(part, d, t) / (0.5 * d.hauteur));
    if (!(w > 0)) return pose;
    var tau = t - d.debut, D = d.fin - d.debut;
    var wPieds = w * (1 - lisse((tau - (D - 0.15)) / 0.15));
    var onde = Math.sin(2 * Math.PI * tau / 3);
    var out = Object.assign({}, pose);
    var vers = function (k, cible, poids) { var v = valeurDe(pose, k); out[k] = v + (cible - v) * poids; };
    vers('piedAvant', 70, wPieds);
    vers('piedArriere', 64, wPieds);
    vers('tibiaAvant', 18 + 10 * (0.5 + 0.5 * onde), w);
    vers('tibiaArriere', 12 + 10 * (0.5 - 0.5 * onde), w);
    vers('ecartJambeAvant', 1, w);
    vers('ecartJambeArriere', 1, w);
    out.ecartBrasAvant = valeurDe(pose, 'ecartBrasAvant') + 10 * w;
    out.ecartBrasArriere = valeurDe(pose, 'ecartBrasArriere') + 10 * w;
    return out;
  }

  function normaliser(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  function versAngle(de, a, k) { return de + normaliser(a - de) * k; }

  function calculerVues(part, tr) {
    var ev = [];
    tr.forEach(function (d) {
      if (SANS_CORPS[d.allure] && typeof d.vue !== 'number') return; // un glissement ou un vol garde la vue
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

  /** options.releve : rend aussi « fixe », la pose sans respiration ni clignements (contrôle du mouvement), et « vie ». */
  function etatAuTemps(part, t, bib, gabarit, options) {
    var corps = corpsAuTemps(part, t, bib, gabarit);
    var pose = Object.assign({}, corps.pose);
    var explicites = Object.keys(pose);
    var vie = vieDe(part);
    var poids = vie === 'aucune' ? null : poidsAuTemps(part, t, bib.clips.repos ? POIDS_RESPIRATION : POIDS_RESPIRATION_SEULE);
    // Retard : le corps relu « retard » s plus tôt (sans vie ni interactions) ; chaque bout reprend une part du
    // déplacement récent de son parent (rien quand le parent est immobile ; jambes exclues : les pieds glisseraient).
    if (vie === 'pleine' && poids.retard > 0) {
      var wr = poids.retard;
      var reglage = (gabarit && gabarit.vie) || S.GABARIT.vie;
      var delai = typeof reglage.retard === 'number' ? reglage.retard : S.GABARIT.vie.retard;
      var force = typeof reglage.force === 'number' ? reglage.force : S.GABARIT.vie.force;
      // Pose tenue depuis plus longtemps que retard + fondu : le corps n'a pas bougé, rien à rattraper.
      var tenue = poids.type === 'pose' && poids.borne !== null && t - delai >= poids.borne + FONDU;
      if (!tenue) {
        var avant = corpsAuTemps(part, t - delai, bib, gabarit, 0, true).pose;
        RETARDS.forEach(function (r) {
          var d = valeurDe(avant, r[1]) - valeurDe(corps.pose, r[1]);
          if (d !== 0) pose[r[0]] = valeurDe(pose, r[0]) + wr * force * r[2] * d;
        });
      }
    }
    pose = jambesPendantes(part, t, pose);
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
    // Relevé du contrôle (pose-figee) : la pose sans la respiration ni les clignements, repos vivant compris.
    var fixe = options && options.releve ? pose : null;
    if (vie !== 'aucune') {
      // Respiration : en pose tenue et en geste (à moitié) ; au repos, c'est le clip « repos » qui respire.
      var resp = vie === 'mains' ? null : bib.clips.respiration;
      if (resp && resp.additif) {
        var wResp = poids.respiration;
        if (wResp > 0) pose = K.ajouter(pose, resp, t + phaseRespiration(part, resp), bib, wResp);
      }
      var rv = bib.clips['repos-vivant'];
      if (vie === 'mains' && rv && rv.additif && rv.cles) rv = reposMains(rv);
      if ((vie === 'pleine' || vie === 'mains') && rv && rv.additif) {
        var w = poids.vie;
        if (w > 0) {
          var tv = t + (rv.duree || 9) * V.graine(1, selDe(part));
          pose = K.ajouter(pose, rv, tv, bib, w);
          if (fixe) fixe = K.ajouter(fixe, rv, tv, bib, w);
        }
      }
      var cl = bib.clips.clignement;
      if (cl && cl.additif) {
        if (cl.boucle) pose = K.ajouter(pose, cl, t, bib); // ancien clignement en boucle (bibliothèque d'une vidéo)
        else {
          var liste = clignements(part, bib), en = null;
          for (var i = 0; i < liste.length && liste[i].t <= t; i++) if (t - liste[i].t < DUREE_CLIGNEMENT * liste[i].lenteur) en = liste[i];
          if (en) pose = K.ajouter(pose, cl, (t - en.t) / en.lenteur, bib);
        }
      }
    }
    var vue = vueAuTemps(part, t);
    var pos = positionAuTemps(part, t);
    var etat = { pose: Object.assign({}, S.REPOS, pose, { vue: vue }), x: pos.x, sol: pos.sol, vue: vue, corps: corps.type,
      ecraseY: ecraseAuTemps(part, t, bib) };
    if (fixe) { etat.fixe = Object.assign({}, S.REPOS, fixe); etat.vie = vie; }
    return etat;
  }

  /** Hauteur du personnage debout (unités du squelette) : des pieds au haut de la tête. */
  function hauteur(gabarit) {
    var g = S.completerGabarit(gabarit);
    return g.cuisse + g.tibia + g.baseTete + 2 * g.tete.ry - 2;
  }

  return { etatAuTemps: etatAuTemps, xAuTemps: xAuTemps, positionAuTemps: positionAuTemps, solAuTemps: solAuTemps, vueAuTemps: vueAuTemps,
    trajets: trajets, hauteur: hauteur, elevation: elevation, clignements: clignements, contacts: contacts, profilEcrase: profilEcrase, FONDU: FONDU };
});
