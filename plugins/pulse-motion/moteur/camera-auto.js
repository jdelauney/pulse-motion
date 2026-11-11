/* Pulse Motion – caméra automatique (spec S7, 5.8) : le plan des cadrages d'une scène, calculé une fois à partir du relevé
 * de mise en page (moteur/releve.js). La caméra ouvre sur l'image et s'élargit quand une chose nouvelle n'y tiendrait pas ;
 * une chose nouvelle qui tient déjà ne fait pas bouger. De temps en temps elle se rapproche d'une chose nouvelle, puis suit
 * les suivantes à cette distance ; elle ne se rapproche de nouveau que 5 s après le dernier changement de zoom. Vers la fin,
 * elle montre l'image entière. Pendant toute la scène, elle avance très lentement (dérive). Rien n'est tiré au hasard.
 *
 *   planifierCamera(elements, { duree, vue, cadre, allure, finVoix, depart, immobile, utile }) -> plan | null
 *     elements : [{ genre, debut, sortie?, boite: { x, y, l, h } (centre et taille), nu?, explicite? }] ; cadre : { L, H } ;
 *     vue : { x, y, l, h } (part de l'image que le sujet doit remplir, marges de 7 %) ; utile : { x0, y0, x1, y1 } (part
 *     laissée libre par les sous-titres et les boutons des applications) ; depart : plan de départ (scène qui continue la
 *     précédente) ; immobile : la caméra tient pendant la transition (s).
 *   cameraA(plan, t, derive = true) -> { x, y, z, derive } : point visé (unités du cadre) et zoom à l'instant t.
 *   enMouvement(plan, t) · continue(a, b, dernier) (alias de continuite) · planFond(plan, cam, profondeur = 0,33)
 *   composer(sujet, visibles, vue, cadre, utile?, remplissage?, zoomMax?) · rectCadre(plan, vue, cadre) · rectVue(plan, vue)
 *   depuisReleve(releve, { rythme }) -> elements ; versCamera(cam, cadre) -> { zoom, x, y } (x, y en % de l'image).
 * Genres : texte, carte, image, graphique, code, formule, fleche, trait, etiquette, cadrage, encre. Les flèches et les
 * traits peuvent être coupés, jamais un texte, une carte ou une étiquette ; un élément nu (icône sans texte) n'a pas de gros
 * plan à lui, ni un élément contenu dans un plus grand déjà présent ; une carte ou une image de plus de 60 % de l'image est
 * un fond. Les longueurs du modèle en pixels (3 px, 1 px, 0,5 px, 2 px sur une image de 1080 px) sont mises à l'échelle de
 * cadre.H / 1080 : le plan se calcule aussi bien en cqh qu'en pixels.
 *
 * Traduction de engine/director.js d'explainroo (MIT, © 2026 Vincent Schmalbach) : constantes et logique reprises, noms en
 * français. Module pur : chargé tel quel dans la page (global M.cameraAuto) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.cameraAuto = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Ce qui apparaît à moins de TEMPS_FORT s d'écart forme un temps fort, et reçoit un seul plan.
  var TEMPS_FORT = 0.8;
  var REMPLISSAGE = 0.72;        // part de la vue que remplit le sujet d'un gros plan
  var REMPLISSAGE_IMAGE = 0.82;  // part de la vue que remplit l'image entière
  var ZOOM_MAX = 2.2;
  var AVANCE = 0.3;              // la caméra part un peu avant l'élément
  var TENUE_MIN = 2.2;           // écart le plus court entre deux départs de mouvement
  var NEGLIGEABLE = 0.08;        // un changement plus petit ne vaut pas un mouvement
  var DERIVE = 0.035;            // rapprochement lent sur toute la scène
  // Se rapprocher : au moins RAPPROCHE fois plus près, tenu RAPPROCHE_TENUE s une fois arrivé, et le zoom a changé pour la
  // dernière fois il y a RAPPROCHE_ECART s ou plus.
  var RAPPROCHE = 1.3;
  var RAPPROCHE_TENUE = 1.5;
  var RAPPROCHE_ECART = 5;
  // Une ligne de code surlignée ou un cadrage demandé a son gros plan s'il est au moins tant de fois plus près.
  var GAIN_CADRAGE = 1.25;
  // Genres qui sont un fond quand ils couvrent la plus grande part de l'image.
  var FONDS = ['carte', 'image'];
  var COUPABLES = ['fleche', 'trait', 'cadrage'];

  function borne(x, a, b) { if (a === undefined) { a = 0; b = 1; } return x < a ? a : x > b ? b : x; }
  function melange(a, b, p) { return a + (b - a) * p; }
  function quintique(p) { return p * p * p * (p * (p * 6 - 15) + 10); }
  function unite(cadre) { return cadre.H / 1080; }

  function union(boites) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    boites.forEach(function (b) {
      x0 = Math.min(x0, b.x - b.l / 2); y0 = Math.min(y0, b.y - b.h / 2);
      x1 = Math.max(x1, b.x + b.l / 2); y1 = Math.max(y1, b.y + b.h / 2);
    });
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, l: x1 - x0, h: y1 - y0 };
  }
  function copie(o, ajouts) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in ajouts || {}) r[k] = ajouts[k]; return r; }

  /** Plan qui cadre une boîte : { x, y, z }, point de la scène montré au centre de la vue, et zoom. */
  function cadrerBoite(boite, vue, cadre, zoomMax, remplissage) {
    if (zoomMax === undefined) zoomMax = ZOOM_MAX;
    if (remplissage === undefined) remplissage = REMPLISSAGE;
    var u = unite(cadre);
    var z = borne(Math.min(vue.l * remplissage / Math.max(u, boite.l), vue.h * remplissage / Math.max(u, boite.h)), 1, zoomMax);
    return borner({ x: boite.x, y: boite.y, z: z }, vue, cadre);
  }

  /** Garde la part visible de la scène dans l'image : les bords des fonds peints par la scène ne se voient jamais. */
  function borner(plan, vue, cadre) {
    var cx = vue.x + vue.l / 2, cy = vue.y + vue.h / 2, z = plan.z;
    var r = { x: borne(plan.x, cx / z, cadre.L - (cadre.L - cx) / z), y: borne(plan.y, cy / z, cadre.H - (cadre.H - cy) / z), z: z };
    if (plan.derive !== undefined) r.derive = plan.derive;
    return r;
  }

  /** Part de la scène que montre l'image entière. */
  function rectCadre(plan, vue, cadre) {
    var cx = vue.x + vue.l / 2, cy = vue.y + vue.h / 2;
    return { x0: plan.x - cx / plan.z, y0: plan.y - cy / plan.z, x1: plan.x + (cadre.L - cx) / plan.z, y1: plan.y + (cadre.H - cy) / plan.z };
  }

  function rectVue(plan, vue) {
    var cx = vue.x + vue.l / 2, cy = vue.y + vue.h / 2;
    return { x0: plan.x - (cx - vue.x) / plan.z, y0: plan.y - (cy - vue.y) / plan.z, x1: plan.x + (vue.x + vue.l - cx) / plan.z, y1: plan.y + (vue.y + vue.h - cy) / plan.z };
  }

  // Une boîte est-elle coupée ? Un bord à moins de « marge » du bord de la vue compte comme coupé (rien ne touche le bord de
  // l'image) ; une boîte qui n'entre que de moins de « jeu » compte comme dehors. r : l'image entière ; utile (r par
  // défaut) : la part laissée libre, où une boîte visible doit tenir.
  function coupe(b, r, marge, jeu, utile) {
    jeu = jeu || 0;
    utile = utile || r;
    var x0 = b.x - b.l / 2, x1 = b.x + b.l / 2, y0 = b.y - b.h / 2, y1 = b.y + b.h / 2;
    var dehors = x1 <= r.x0 + jeu || x0 >= r.x1 - jeu || y1 <= r.y0 + jeu || y0 >= r.y1 - jeu;
    var dedans = x0 >= utile.x0 + marge && x1 <= utile.x1 - marge && y0 >= utile.y0 + marge && y1 <= utile.y1 - marge;
    return !dedans && !dehors;
  }

  /** Part libre de l'image (unités du cadre) en coordonnées de la scène, pour un plan. */
  function rectUtile(plan, vue, utile) {
    var cx = vue.x + vue.l / 2, cy = vue.y + vue.h / 2;
    return { x0: plan.x + (utile.x0 - cx) / plan.z, y0: plan.y + (utile.y0 - cy) / plan.z, x1: plan.x + (utile.x1 - cx) / plan.z, y1: plan.y + (utile.y1 - cy) / plan.z };
  }

  // Un plan montre-t-il la boîte (si donnée) entière, sans couper aucun des autres, à son zoom et au plus serré que la dérive
  // atteint ?
  function net(plan, boite, autres, vue, cadre, utile) {
    var z = plan.z, u = unite(cadre);
    var marge = Math.min(cadre.L, cadre.H) * 0.07 / z;
    var serre = borner(copie(plan, { z: z * (1 + DERIVE) }), vue, cadre);
    if (boite) {
      var v = rectVue(serre, vue);
      if (boite.x - boite.l / 2 < v.x0 - 0.5 * u || boite.x + boite.l / 2 > v.x1 + 0.5 * u || boite.y - boite.h / 2 < v.y0 - 0.5 * u || boite.y + boite.h / 2 > v.y1 + 0.5 * u) return false;
    }
    var r = rectCadre(serre, vue, cadre);
    var large = rectCadre(plan, vue, cadre);
    return !autres.some(function (e) {
      return coupe(e.boite, r, marge, u / z, rectUtile(serre, vue, utile)) || coupe(e.boite, large, marge, u / z, rectUtile(plan, vue, utile));
    });
  }

  function contient(a, b, u) {
    var d = 0.5 * (u || 1);
    return a.x - a.l / 2 <= b.x - b.l / 2 + d && a.x + a.l / 2 >= b.x + b.l / 2 - d && a.y - a.h / 2 <= b.y - b.h / 2 + d && a.y + a.h / 2 >= b.y + b.h / 2 - d;
  }

  /**
   * Cadre le sujet aussi près que possible, chaque autre élément visible étant entièrement dans le plan ou entièrement
   * dehors (une moitié d'étiquette au bord ressemble à une erreur). Essaie plusieurs zooms, et pour chacun le centre sur le
   * sujet et les centres qui mettent un voisin juste dedans ou juste dehors ; garde le plan le plus serré et le mieux centré.
   * Au zoom 1, le plan est l'image telle qu'écrite, qui marche toujours.
   */
  function composer(sujet, visibles, vue, cadre, utile, remplissage, zoomMax) {
    utile = utile || { x0: 0, y0: 0, x1: cadre.L, y1: cadre.H };
    if (remplissage === undefined) remplissage = REMPLISSAGE;
    if (zoomMax === undefined) zoomMax = ZOOM_MAX;
    var u = unite(cadre);
    var boite = union(sujet.map(function (e) { return e.boite; }));
    // Flèches et traits peuvent sortir d'un gros plan, comme un élément dans lequel le plan regarde (une fenêtre de code
    // autour de ses lignes surlignées). Une étiquette ou une carte coupée, jamais.
    var regarde = sujet.every(function (e) { return e.genre === 'cadrage'; });
    var autres = visibles.filter(function (e) { return sujet.indexOf(e) < 0 && COUPABLES.indexOf(e.genre) < 0 && !(regarde && contient(e.boite, boite, u)); });
    var cx = vue.x + vue.l / 2, cy = vue.y + vue.h / 2;
    var premier = cadrerBoite(boite, vue, cadre, Math.max(1, zoomMax), remplissage);
    var meilleur = null;
    for (var z = premier.z; z > 1.001; z /= 1.06) {
      var marge = Math.min(cadre.L, cadre.H) * 0.07 / z;
      // Centres qui gardent le sujet dans la vue.
      var xr = [boite.x + boite.l / 2 + marge - (vue.x + vue.l - cx) / z, boite.x - boite.l / 2 - marge + (cx - vue.x) / z];
      var yr = [boite.y + boite.h / 2 + marge - (vue.y + vue.h - cy) / z, boite.y - boite.h / 2 - marge + (cy - vue.y) / z];
      if (xr[0] > xr[1] || yr[0] > yr[1]) continue;
      var pas = 3 * u / z;
      var xs = [boite.x], ys = [boite.y];
      autres.forEach(function (e) {
        var g = e.boite.x - e.boite.l / 2, d = e.boite.x + e.boite.l / 2, h = e.boite.y - e.boite.h / 2, b = e.boite.y + e.boite.h / 2;
        xs.push(d + pas + cx / z, g - pas - (cadre.L - cx) / z, g - marge + cx / z, d + marge - (cadre.L - cx) / z);
        ys.push(b + pas + cy / z, h - pas - (cadre.H - cy) / z, h - marge + cy / z, b + marge - (cadre.H - cy) / z);
      });
      for (var i = 0; i < xs.length; i++) {
        if (xs[i] < xr[0] - 1e-6 || xs[i] > xr[1] + 1e-6) continue;
        for (var j = 0; j < ys.length; j++) {
          if (ys[j] < yr[0] - 1e-6 || ys[j] > yr[1] + 1e-6) continue;
          var plan = borner({ x: xs[i], y: ys[j], z: z }, vue, cadre);
          if (!net(plan, boite, autres, vue, cadre, utile)) continue;
          var ecart = Math.hypot((plan.x - boite.x) * z / vue.l, (plan.y - boite.y) * z / vue.h);
          var note = Math.log(z) - 0.8 * ecart;
          if (!meilleur || note > meilleur.note) meilleur = { plan: plan, note: note };
        }
      }
    }
    if (meilleur) return meilleur.plan;
    // Sinon l'image telle qu'écrite ; sa dérive reste coupée quand elle pousserait un élément sous les sous-titres ou les
    // boutons de l'application.
    var entier = cadrerBoite(boite, vue, cadre, 1);
    var serre = borner(copie(entier, { z: 1 + DERIVE }), vue, cadre);
    var dans = function (e, p) {
      var r = rectUtile(p, vue, utile);
      return e.boite.x - e.boite.l / 2 >= r.x0 && e.boite.x + e.boite.l / 2 <= r.x1 && e.boite.y - e.boite.h / 2 >= r.y0 && e.boite.y + e.boite.h / 2 <= r.y1;
    };
    var tenus = sujet.concat(autres).filter(function (e) { return COUPABLES.indexOf(e.genre) < 0; });
    return tenus.some(function (e) { return dans(e, entier) && !dans(e, serre); }) ? copie(entier, { derive: 0 }) : entier;
  }

  function memePlan(a, b, u) {
    return Math.abs(a.x - b.x) < 0.01 * u && Math.abs(a.y - b.y) < 0.01 * u && Math.abs(a.z - b.z) < 1e-4 && (a.derive === undefined ? 1 : a.derive) === (b.derive === undefined ? 1 : b.derive);
  }

  // Durée d'un mouvement à l'allure 1 : plus longue pour un plus grand changement de zoom ou de place, un peu plus longue
  // pour le recul de la fin.
  function longueurMouvement(de, vers, genre, cadre) {
    var distance = Math.hypot(vers.x - de.x, vers.y - de.y) / (cadre.L / Math.min(de.z, vers.z));
    return borne(0.9 + 0.5 * Math.abs(Math.log(vers.z / de.z)) + 0.6 * distance, 0.95, 1.7) * (genre === 'recul' ? 1.2 : 1);
  }

  function differe(a, b, cadre) {
    var da = a.derive === undefined ? 1 : a.derive, db = b.derive === undefined ? 1 : b.derive;
    return da !== db || Math.abs(Math.log(a.z / b.z)) > NEGLIGEABLE || Math.hypot(a.x - b.x, a.y - b.y) > NEGLIGEABLE * cadre.L / Math.max(a.z, b.z);
  }

  /** Plan de la caméra d'une scène (voir l'en-tête), ou null s'il n'y a rien à filmer. */
  function planifierCamera(elements, o) {
    var duree = o.duree, vue = o.vue, cadre = o.cadre, allure = o.allure > 0 ? o.allure : 1;
    var finVoix = o.finVoix === undefined ? null : o.finVoix;
    var depart = o.depart || null, immobile = o.immobile || 0;
    var utile = o.utile || { x0: 0, y0: 0, x1: cadre.L, y1: cadre.H };
    var u = unite(cadre);
    var aire = cadre.L * cadre.H;
    var items = (elements || [])
      // Une carte ou une image qui couvre la plus grande part de l'image est un fond. Graphiques, code, textes et dessins
      // comptent quelle que soit leur taille.
      .filter(function (e) { return e.boite && (FONDS.indexOf(e.genre) < 0 || e.boite.l * e.boite.h < aire * 0.6) && (e.boite.l > 2 * u || e.boite.h > 2 * u); })
      .map(function (e) { return copie(e, { debut: Math.max(0, e.debut), sortie: e.sortie === undefined || e.sortie === null ? Infinity : e.sortie }); })
      .filter(function (e) { return e.debut < duree - 0.3; })
      .sort(function (a, b) { return a.debut - b.debut; });
    if (!items.length) return null;

    var temps = [];
    items.forEach(function (e) {
      var dernier = temps[temps.length - 1];
      if (dernier && e.debut - dernier.debut <= TEMPS_FORT) dernier.els.push(e);
      else temps.push({ debut: e.debut, els: [e] });
    });

    var tenue = TENUE_MIN / allure;
    var visiblesPendant = function (t0, t1) { return items.filter(function (e) { return e.debut <= t1 && e.sortie > t0 + 0.25; }); };
    var image = function (liste) { return liste.filter(function (e) { return e.genre !== 'cadrage'; }); };
    // Ce dont la caméra peut se rapprocher. L'étiquette d'une flèche reste entière, mais elle fait partie de la flèche, qui
    // n'a pas de gros plan.
    var solides = function (liste) { return liste.filter(function (e) { return ['fleche', 'trait', 'cadrage', 'etiquette'].indexOf(e.genre) < 0; }); };
    // Tout ce qui est à l'écran de t0 à t1, cadré comme une seule image.
    var ensemble = function (t0, t1) {
      var v = image(visiblesPendant(t0, t1));
      return v.length ? composer(v, v, vue, cadre, utile, REMPLISSAGE_IMAGE) : null;
    };
    // Un plan montre-t-il déjà ces éléments entiers, dans la part libre de l'image, aussi au bout de sa dérive ? Un temps fort
    // fait seulement de flèches et de traits tient s'ils sont au moins en partie visibles. Une étiquette doit être entière.
    var tient = function (plan, liste) {
      var corps = liste.filter(function (e) { return e.genre !== 'fleche' && e.genre !== 'trait'; });
      var serre = plan.derive === 0 ? plan : borner(copie(plan, { z: plan.z * (1 + DERIVE) }), vue, cadre);
      var marge = Math.min(cadre.L, cadre.H) * 0.02 / plan.z;
      return [plan, serre].every(function (s) {
        var r = rectUtile(s, vue, utile);
        if (!corps.length) return liste.every(function (e) { return e.boite.x + e.boite.l / 2 > r.x0 && e.boite.x - e.boite.l / 2 < r.x1 && e.boite.y + e.boite.h / 2 > r.y0 && e.boite.y - e.boite.h / 2 < r.y1; });
        return corps.every(function (e) { return e.boite.x - e.boite.l / 2 >= r.x0 + marge && e.boite.x + e.boite.l / 2 <= r.x1 - marge && e.boite.y - e.boite.h / 2 >= r.y0 + marge && e.boite.y + e.boite.h / 2 <= r.y1 - marge; });
      });
    };
    // Les un ou deux éléments de « avant » les plus proches de « els ».
    var voisins = function (els, avant) {
      if (!avant.length) return [];
      var c = union(els.map(function (e) { return e.boite; }));
      var d = function (e) { return Math.hypot(e.boite.x - c.x, e.boite.y - c.y); };
      var tries = avant.slice().sort(function (a, b) { return d(a) - d(b); });
      return tries.slice(0, tries.length > 1 && d(tries[1]) < d(tries[0]) * 1.4 ? 2 : 1);
    };

    // Vers la fin, la caméra montre l'image entière.
    var dernierTemps = temps[temps.length - 1].debut;
    var instantRecul = Math.max(dernierTemps + 1.8, (finVoix === null ? dernierTemps : finVoix) - 0.9);
    var premier = Math.max(0, immobile);
    // Jusqu'à quand le plan tient : la prochaine chose nouvelle (ou le prochain cadrage) après le temps fort i qui n'y
    // tiendrait pas.
    var tenuJusqua = function (plan, i) {
      for (var j = i + 1; j < temps.length; j++) {
        var suite = temps[j].els.filter(function (e) { return e.sortie > temps[j].debut + 0.4; });
        if (suite.length && !tient(plan, suite)) return Math.max(premier, temps[j].debut - AVANCE);
      }
      return duree;
    };

    // immobile : la caméra tient pendant le fondu depuis la scène continuée, pour que les deux images restent l'une sur l'autre.
    var plans = [];
    var courant = depart;
    var dernier = depart ? premier - tenue : -Infinity;
    var zoome = -Infinity;
    // Prend un plan à partir de « debut ». Le premier ouvre la scène. Un mouvement obligatoire garde entière une chose
    // nouvelle, aussi petit soit-il.
    var prendre = function (plan, debut, genre, oblige) {
      if (!plan) return false;
      if (courant && (oblige ? memePlan(courant, plan, u) : !differe(courant, plan, cadre))) return false;
      if (courant && Math.abs(Math.log(plan.z / courant.z)) > 0.1) zoome = debut;
      plans.push({ debut: courant ? debut : 0, plan: plan, genre: genre, oblige: !!oblige });
      // L'ouverture n'est pas un mouvement : le premier mouvement peut la suivre plus tôt.
      dernier = courant ? debut : debut - tenue * 0.4;
      courant = plan;
      return true;
    };
    for (var i = 0; i < temps.length; i++) {
      var tf = temps[i];
      var debut = Math.max(premier, tf.debut - AVANCE);
      var suivant = i + 1 < temps.length ? Math.max(premier, temps[i + 1].debut - AVANCE) : duree;
      var libre = !courant || debut >= dernier + tenue - 1e-9;
      // La caméra peut-elle se rapprocher maintenant ?
      var plusPres = !courant || (suivant - debut >= (RAPPROCHE_TENUE + 1) / allure && debut - zoome >= RAPPROCHE_ECART / allure);
      var points = tf.els.filter(function (e) { return e.genre === 'cadrage'; });
      var neufs = image(tf.els).filter(function (e) { return e.sortie > tf.debut + 0.4; });

      // Lignes de code surlignées et cadrages demandés : gros plan quand le plan ne les montre pas déjà en grand et qu'on a
      // le temps.
      if (points.length && libre) {
        var explicite = points.some(function (p) { return p.explicite; });
        var finit = Math.min.apply(null, points.map(function (p) { return p.sortie; }));
        var proche = composer(points, visiblesPendant(debut, Math.min(finit, debut + tenue * 2 + AVANCE)), vue, cadre, utile, REMPLISSAGE, explicite || plusPres ? ZOOM_MAX : courant.z);
        // Le gros plan tient jusqu'à sa fin, ou jusqu'à ce qu'une chose nouvelle n'y tienne plus.
        var jusqua = Math.min(finit, tenuJusqua(proche, i));
        var gain = courant ? proche.z / courant.z : Infinity;
        if (jusqua - debut >= tenue && ((courant && !tient(courant, points)) || gain >= (explicite ? 1.05 : GAIN_CADRAGE))) {
          if (prendre(proche, debut, 'cadrage', !!(courant && !tient(courant, points)))) continue;
        }
      }
      if (!neufs.length) continue;
      var fenetre = debut + tenue + AVANCE;
      if (!courant) { prendre(ensemble(debut, fenetre), debut, 'image'); continue; }
      if (!libre && !tient(courant, neufs)) {
        // Trop tôt après le dernier mouvement pour une chose qui ne tient pas : le dernier plan prend l'image entière.
        if (plans.length) {
          var prec = plans[plans.length - 1];
          var large = ensemble(prec.debut, fenetre);
          if (large) { prec.plan = large; prec.genre = 'image'; }
          courant = prec.plan;
        }
        continue;
      }
      var avant = items.filter(function (e) { return e.debut < tf.debut - 0.05 && e.sortie > tf.debut + 0.3 && ['cadrage', 'encre', 'etiquette'].indexOf(e.genre) < 0; });
      if (tient(courant, neufs)) {
        // Déjà dans le plan. La caméra ne se rapproche que d'une carte, d'une étiquette ou d'une image nouvelle ; ni d'un
        // trait, ni d'une flèche, ni de ce qui se dessine dans un élément déjà là (une courbe dans un graphique), ni d'une
        // icône ou d'une forme sans mots. Elle essaie la chose nouvelle avec ses voisins, puis seule.
        var siens = solides(neufs).filter(function (e) {
          return !e.nu && !avant.some(function (f) { return f.boite.l * f.boite.h >= e.boite.l * e.boite.h * 2 && contient(f.boite, e.boite, u); });
        });
        // Elle est déjà à l'écran : le rapprochement peut attendre un moment son tour.
        var a = Math.max(debut, dernier + tenue);
        if (!siens.length || a > tf.debut + 1 / allure || a - zoome < RAPPROCHE_ECART / allure) continue;
        // Ce qui vient juste après fait partie du même plan quand c'est possible.
        var bientot = [];
        temps.slice(i + 1).filter(function (b) { return b.debut - tf.debut <= RAPPROCHE_TENUE / allure; }).forEach(function (b) { bientot = bientot.concat(solides(image(b.els))); });
        var pres = voisins(siens, avant);
        var vus = visiblesPendant(a, a + RAPPROCHE_TENUE / allure + tenue);
        var essais = [pres.concat(siens, bientot), pres.concat(siens), siens.concat(bientot), siens];
        for (var k = 0; k < essais.length; k++) {
          var p = composer(essais[k], vus, vue, cadre, utile);
          var fin = Math.min(tenuJusqua(p, i), tient(p, image(visiblesPendant(instantRecul, instantRecul + 0.1))) ? duree : instantRecul);
          if (p.z >= courant.z * RAPPROCHE && fin - a - longueurMouvement(courant, p, 'rapproche', cadre) / allure >= RAPPROCHE_TENUE / allure) {
            prendre(p, a, 'rapproche');
            break;
          }
        }
        continue;
      }
      // Ne tient pas : la chose nouvelle avec ce à quoi elle se rattache, au plus aussi près que la caméra peut aller.
      var visibles = visiblesPendant(debut, Math.max(suivant, fenetre));
      var limite = plusPres ? ZOOM_MAX : courant.z;
      var sujet = composer(voisins(neufs, avant).concat(neufs), visibles, vue, cadre, utile, REMPLISSAGE, limite);
      if (sujet.z < Math.min(1.15, limite)) sujet = composer(neufs, visibles, vue, cadre, utile, REMPLISSAGE, limite);
      prendre(tient(sujet, neufs) ? sujet : ensemble(debut, fenetre), debut, 'suit', true);
    }
    if (!plans.length && !depart) return null;
    // Vers la fin, la caméra montre l'image entière quand le plan en laisse une partie dehors.
    var recul = Math.max(instantRecul, dernier + tenue);
    // Une scène trop courte pour cela finit sur son dernier mouvement. Si c'est un gros plan qui laisse une partie de
    // l'image dehors, la dernière image ne montrerait pas toute l'idée : ce mouvement cadre alors l'image entière.
    var aLaFin = items.filter(function (e) { return e.genre !== 'cadrage' && e.debut <= duree - 0.1 && e.sortie >= duree - 0.05; });
    var queue = plans[plans.length - 1];
    if (recul >= duree - 1.1 && aLaFin.length && queue && queue.debut > 0 && ['rapproche', 'suit'].indexOf(queue.genre) >= 0 && !tient(courant, aLaFin)) {
      var tout = ensemble(queue.debut, duree);
      if (tout) { queue.plan = tout; courant = tout; }
    }
    if (courant && recul < duree - 1.1) {
      var entier = image(visiblesPendant(recul, recul + 0.1));
      if (entier.length && !tient(courant, entier)) prendre(composer(entier, visiblesPendant(recul, duree), vue, cadre, utile, REMPLISSAGE_IMAGE), recul, 'recul');
    }

    var debutPlan = depart || plans[0].plan;
    var mouvements = [];
    var actuel = debutPlan;
    (depart ? plans : plans.slice(1)).forEach(function (x) {
      if (x.oblige ? memePlan(actuel, x.plan, u) : !differe(actuel, x.plan, cadre)) return;
      // Chaque mouvement finit avant la scène.
      var place = duree - 0.05 - x.debut;
      if (place < 0.45 / allure) return;
      mouvements.push({ debut: x.debut, duree: Math.min(place, longueurMouvement(actuel, x.plan, x.genre, cadre) / allure), vers: x.plan, genre: x.genre });
      actuel = x.plan;
    });
    // Chaque mouvement part d'où la caméra est à ce moment : des mouvements qui se chevauchent restent souples.
    var plan = { depart: debutPlan, mouvements: mouvements, duree: duree, vue: vue, cadre: cadre, immobile: immobile, elements: items };
    mouvements.forEach(function (m) {
      m.de = cameraA(plan, m.debut, false);
      // Entre deux plans éloignés, la caméra recule en chemin : moins de choses coupées pendant le trajet.
      var ra = rectCadre(m.de, vue, cadre), rb = rectCadre(m.vers, vue, cadre);
      var commun = Math.max(0, Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0)) * Math.max(0, Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0));
      if (commun < 0.25 * Math.min((ra.x1 - ra.x0) * (ra.y1 - ra.y0), (rb.x1 - rb.x0) * (rb.y1 - rb.y0))) {
        var deux = { x: (Math.min(ra.x0, rb.x0) + Math.max(ra.x1, rb.x1)) / 2, y: (Math.min(ra.y0, rb.y0) + Math.max(ra.y1, rb.y1)) / 2,
          l: Math.max(ra.x1, rb.x1) - Math.min(ra.x0, rb.x0), h: Math.max(ra.y1, rb.y1) - Math.min(ra.y0, rb.y0) };
        var par = cadrerBoite(deux, vue, cadre, Math.min(m.de.z, m.vers.z));
        if (par.z < Math.min(m.de.z, m.vers.z) * 0.97) m.par = par;
      }
    });
    return plan;
  }

  /** Plan de la caméra à l'instant t (unités du cadre). derive (0 ou 1, 1 par défaut) : la dérive lente peut-elle courir. */
  function cameraA(plan, t, avecDerive) {
    var cam = plan.depart;
    for (var i = 0; i < plan.mouvements.length; i++) {
      var m = plan.mouvements[i];
      if (t < m.debut || !m.de) break;
      var p = quintique(borne((t - m.debut) / m.duree));
      var dd = melange(m.de.derive === undefined ? 1 : m.de.derive, m.vers.derive === undefined ? 1 : m.vers.derive, p);
      if (m.par) {
        // Une courbe qui passe par le plan plus large au milieu.
        var q = function (a, b, c) { return (1 - p) * (1 - p) * a + 2 * (1 - p) * p * b + p * p * c; };
        var milieu = function (k) { return 2 * m.par[k] - (m.de[k] + m.vers[k]) / 2; };
        cam = { x: q(m.de.x, milieu('x'), m.vers.x), y: q(m.de.y, milieu('y'), m.vers.y),
          z: Math.max(1, Math.exp(q(Math.log(m.de.z), 2 * Math.log(m.par.z) - (Math.log(m.de.z) + Math.log(m.vers.z)) / 2, Math.log(m.vers.z)))) };
        cam = borner(cam, plan.vue, plan.cadre);
        cam.derive = dd;
      } else {
        cam = { x: melange(m.de.x, m.vers.x, p), y: melange(m.de.y, m.vers.y, p), z: Math.exp(melange(Math.log(m.de.z), Math.log(m.vers.z), p)), derive: dd };
      }
    }
    if (avecDerive === false) return cam;
    // La dérive commence une fois la scène continuée entrée.
    var immobile = plan.immobile || 0;
    var d = cam.derive === undefined ? 1 : cam.derive;
    var pousse = 1 + DERIVE * d * borne((t - immobile) / Math.max(1, plan.duree - immobile));
    var r = borner({ x: cam.x, y: cam.y, z: cam.z * pousse }, plan.vue, plan.cadre);
    r.derive = d;
    return r;
  }

  /** Vrai pendant un mouvement (la dérive lente ne compte pas). */
  function enMouvement(plan, t) {
    return plan.mouvements.some(function (m) { return t > m.debut && t < m.debut + m.duree; });
  }

  /**
   * La scène b reprend-elle là où a s'est arrêtée ? Ce que montre la dernière image de a est pour l'essentiel encore là au
   * début de b, aux mêmes places (± 2 px sur 1080, soit 0,2 cqh). dernier : la part de la scène a que montre sa caméra à la
   * fin. L'étiquette d'une flèche va avec sa flèche : elle ne compte pas seule.
   */
  function continuite(a, b, dernier, cadre) {
    // cadre (facultatif) : les 2 px sont mis à son échelle ; sans lui, les boîtes sont en pixels d'une image de 1080.
    var u = cadre ? unite(cadre) : 1;
    var vu = function (e) { return e.boite.x + e.boite.l / 2 > dernier.x0 && e.boite.x - e.boite.l / 2 < dernier.x1 && e.boite.y + e.boite.h / 2 > dernier.y0 && e.boite.y - e.boite.h / 2 < dernier.y1; };
    a = a.filter(function (e) { return e.genre !== 'etiquette'; });
    b = b.filter(function (e) { return e.genre !== 'etiquette'; });
    var fin = a.filter(function (e) { return (e.sortie === undefined || e.sortie === null || e.sortie === Infinity) && vu(e); });
    var portes = b.filter(function (e) { return e.debut <= 0.05; });
    if (fin.length < 2 || portes.length < 2) return false;
    var pareil = function (x, y) { return x.genre === y.genre && Math.abs(x.boite.x - y.boite.x) < 2 * u && Math.abs(x.boite.y - y.boite.y) < 2 * u && Math.abs(x.boite.l - y.boite.l) < 2 * u && Math.abs(x.boite.h - y.boite.h) < 2 * u; };
    var gardes = fin.filter(function (e) { return portes.some(function (f) { return pareil(e, f); }); });
    var connus = portes.filter(function (e) { return a.some(function (f) { return pareil(e, f); }); });
    return gardes.length >= fin.length * 0.7 && connus.length >= portes.length * 0.6;
  }

  /** Où est le fond pour la caméra en cam : il suit au tiers de la force de la caméra, comme s'il était plus loin. */
  function planFond(plan, cam, profondeur) {
    if (profondeur === undefined) profondeur = 0.33;
    var cx = plan.vue.x + plan.vue.l / 2, cy = plan.vue.y + plan.vue.h / 2;
    return borner({ x: cx + (cam.x - cx) * profondeur, y: cy + (cam.y - cy) * profondeur, z: Math.pow(cam.z, profondeur) }, plan.vue, plan.cadre);
  }

  // --- Pont avec Pulse Motion --------------------------------------------------------------------------------------------

  /** Relevé d'une scène (moteur/releve.js) -> éléments du plan, en secondes réelles de la scène (temps du relevé ÷ rythme). */
  function depuisReleve(releve, o) {
    var rythme = o && o.rythme > 0 ? o.rythme : 1;
    return ((releve && releve.elements) || []).filter(function (e) { return e.boite && e.genre !== 'fond'; }).map(function (e) {
      var x = { genre: e.genre, cle: e.cle, debut: (e.debut || 0) / rythme, boite: { x: e.boite.x, y: e.boite.y, l: e.boite.l, h: e.boite.h } };
      if (e.genre === 'cadrage') { x.sortie = (e.fin || 0) / rythme; if (e.explicite) x.explicite = true; }
      if (e.nu) x.nu = true;
      return x;
    });
  }

  /** Vue (marges de 7 % du petit côté, comme explainroo) d'un cadre. */
  function vueDe(cadre) {
    var m = Math.min(cadre.L, cadre.H) * 0.07;
    return { x: m, y: m, l: cadre.L - 2 * m, h: cadre.H - 2 * m };
  }

  /** Plan { x, y, z } -> réglages de moteur/camera.js : zoom, x et y en % de l'image (point visé au centre). */
  function versCamera(cam, cadre) {
    var a = function (v) { return Math.round(v * 10000) / 10000; };
    return { zoom: a(cam.z), x: a(cam.x / cadre.L * 100), y: a(cam.y / cadre.H * 100) };
  }

  return {
    planifierCamera: planifierCamera, cameraA: cameraA, enMouvement: enMouvement, continue: continuite, continuite: continuite,
    planFond: planFond, composer: composer, rectCadre: rectCadre, rectVue: rectVue, cadrerBoite: cadrerBoite,
    depuisReleve: depuisReleve, vueDe: vueDe, versCamera: versCamera,
    CONSTANTES: { TEMPS_FORT: TEMPS_FORT, REMPLISSAGE: REMPLISSAGE, REMPLISSAGE_IMAGE: REMPLISSAGE_IMAGE, ZOOM_MAX: ZOOM_MAX, AVANCE: AVANCE,
      TENUE_MIN: TENUE_MIN, NEGLIGEABLE: NEGLIGEABLE, DERIVE: DERIVE, RAPPROCHE: RAPPROCHE, RAPPROCHE_TENUE: RAPPROCHE_TENUE,
      RAPPROCHE_ECART: RAPPROCHE_ECART, GAIN_CADRAGE: GAIN_CADRAGE },
  };
});
