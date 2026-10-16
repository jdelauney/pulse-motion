/* Pulse Motion – personnages dans les scènes (dans la page).
 *
 *   <div data-personnage="cuisinier" data-x="12" data-sol="90" data-taille="45">
 *     <i data-action="marcher" data-vers="40" data-start="0.3" data-dur="2"></i> …
 *   </div>
 *
 * M.demarrerPersonnages() (après M.demarrer) : pour chaque conteneur, un <svg> couvrant la scène, l'habillage (pièces
 * pour un dessin, bâtonnets sinon), la partition lue sur ses actions (temps résolus par le minutage) ; puis, à chaque
 * rendu (M.surRendu), la pose à l'instant t (M.partition.etatAuTemps), le squelette et l'habillage. Déterministe.
 * Données : M.donnees.personnages = { bib: { poses, clips, expressions }, dessins, gabarits, gabaritsDessins }.
 * « parler » : piste de visèmes (M.levres) tirée des mots de la voix de la scène ; sans data-dur, jusqu'à la fin.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var NS = 'http://www.w3.org/2000/svg';

  function nombre(el, attr, defaut) {
    var v = el.getAttribute(attr);
    var n = v === null || v.trim() === '' ? NaN : Number(v);
    return isFinite(n) ? n : defaut;
  }

  /** Voix de la scène : { mots, origine } (origine : instant absolu du début de la prise), ou null. */
  function voixDe(idScene) {
    var s = ((M.donnees && M.donnees.scenes) || []).filter(function (x) { return x.id === idScene; })[0];
    var m = ((M.minutage && M.minutage.scenes) || []).filter(function (x) { return x.id === idScene; })[0];
    if (!s || !s.voix || !s.voix.mots || !m) return null;
    return { mots: s.voix.mots, origine: m.debut + (typeof s.voix.debut === 'number' ? s.voix.debut : 0.3) };
  }

  /** Sol : un nombre (% de la hauteur) ou « #id » d'un tracé. */
  function valeurSol(texte) {
    var v = String(texte || '').trim();
    if (v.charAt(0) === '#') return v;
    var n = Number(v);
    return v !== '' && isFinite(n) ? n : 90;
  }

  /** Tracé d'un sol courbe -> fonction x (% de la largeur) -> hauteur (% de la hauteur), mesurée au démarrage et à chaque
   *  changement de taille, sans les mouvements de caméra ni de parallaxe (les autres transformations du décor comptent :
   *  repère du conteneur du personnage). Le plus haut point à un même x. Null si la mesure est impossible. */
  function mesurerTrace(chemin, div, sec) {
    var modifies = [];
    function neutraliser(el) {
      for (; el && el !== sec.parentElement; el = el.parentElement) {
        if (!el.style || !el.hasAttribute) continue;
        var camera = el.hasAttribute('data-camera'), plan = el.hasAttribute('data-profondeur');
        if (!camera && !plan) continue;
        modifies.push([el, el.style.transform, el.style.translate]);
        if (camera) el.style.transform = 'none';
        if (plan) el.style.translate = 'none';
      }
    }
    var affichage = sec.style.display;
    sec.style.display = '';
    neutraliser(chemin); neutraliser(div);
    var r = div.getBoundingClientRect(), points = [];
    try {
      var m = chemin.getScreenCTM(), long = chemin.getTotalLength();
      var n = Math.max(200, Math.min(4000, Math.ceil(long / 2)));
      for (var i = 0; i <= n; i++) {
        var p = chemin.getPointAtLength(long * i / n), q = new DOMPoint(p.x, p.y).matrixTransform(m);
        if (r.width > 0 && r.height > 0) points.push([(q.x - r.left) / r.width * 100, (q.y - r.top) / r.height * 100]);
      }
    } catch (e) { points = []; }
    modifies.reverse().forEach(function (x) { x[0].style.transform = x[1]; x[0].style.translate = x[2]; });
    sec.style.display = affichage;
    if (!points.length) return null;
    var pas = 0.25, x0 = Infinity, x1 = -Infinity;
    points.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); });
    var debut = Math.floor(x0 / pas), nb = Math.max(1, Math.ceil(x1 / pas) - debut + 1), table = new Array(nb);
    points.forEach(function (p) { var k = Math.round(p[0] / pas) - debut; if (table[k] === undefined || p[1] < table[k]) table[k] = p[1]; });
    // Cases vides : interpolées entre leurs voisines.
    var connus = [];
    for (var k = 0; k < nb; k++) if (table[k] !== undefined) connus.push(k);
    for (var j = 0; j < nb; j++) {
      if (table[j] !== undefined) continue;
      var a = null, b = null;
      connus.forEach(function (c) { if (c < j) a = c; else if (b === null && c > j) b = c; });
      table[j] = a === null ? table[b] : b === null ? table[a] : table[a] + (table[b] - table[a]) * (j - a) / (b - a);
    }
    return function (x) {
      var f = Math.max(0, Math.min(nb - 1, x / pas - debut)), i0 = Math.floor(f), i1 = Math.min(nb - 1, i0 + 1);
      return table[i0] + (table[i1] - table[i0]) * (f - i0);
    };
  }

  function lireAction(el, temps, idScene) {
    var a = { type: el.getAttribute('data-action'), debut: temps.debut, fin: temps.fin };
    if (a.type === 'parler') {
      if (!el.hasAttribute('data-dur')) a.fin = Infinity;
      var v = voixDe(idScene);
      a.piste = v ? M.levres.piste(v.mots, v.origine, a.debut, a.fin) : [];
    }
    if (el.hasAttribute('data-vers')) a.vers = nombre(el, 'data-vers', 50);
    if (el.hasAttribute('data-sol')) a.sol = valeurSol(el.getAttribute('data-sol'));
    if (el.hasAttribute('data-hauteur')) a.hauteur = nombre(el, 'data-hauteur', 15);
    if (el.hasAttribute('data-courbe')) a.courbe = el.getAttribute('data-courbe').trim();
    if (el.hasAttribute('data-vue')) a.vue = nombre(el, 'data-vue', 0);
    ['pose', 'clip', 'expression', 'bouche', 'cible', 'point', 'main', 'niveau'].forEach(function (k) { if (el.hasAttribute('data-' + k)) a[k] = el.getAttribute('data-' + k).trim(); });
    if (a.type === 'regarder' && !el.hasAttribute('data-dur')) a.jusquAuSuivant = true;
    return a;
  }

  function alerter(idScene, message) {
    var e = { regle: 'personnage-invalide', gravite: 'alerte', scene: idScene, message: 'Scène « ' + idScene + ' » : ' + message };
    if (M.erreurs) M.erreurs.push(e);
    if (typeof console !== 'undefined') console.warn('[Pulse Motion] ' + e.message);
  }

  M.demarrerPersonnages = function () {
    var D = M.donnees && M.donnees.personnages;
    if (!D || !M.minutage) return;
    var S = M.squelette, P = M.partition;
    var ratio = String((M.donnees.format && M.donnees.format.ratio) || '16:9').split(':').map(Number);
    var W = 100 * ratio[0], H = 100 * ratio[1];
    var persos = [];
    document.querySelectorAll('[data-personnage]').forEach(function (div) {
      var sec = div.closest('[data-scene]');
      if (!sec) return;
      var idScene = sec.getAttribute('data-scene');
      var nom = div.getAttribute('data-personnage');
      var dessin = nom === 'batonnets' ? null : D.dessins[nom];
      if (nom !== 'batonnets' && !dessin) return; // signalé à l'assemblage
      var gabarit = S.completerGabarit(dessin ? D.gabaritsDessins[nom] : D.gabarits[div.getAttribute('data-gabarit') || 'standard']);
      div.setAttribute('data-decor', '');
      div.style.position = 'absolute';
      div.style.inset = '0';
      div.style.pointerEvents = 'none';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
      div.appendChild(svg);
      var g = document.createElementNS(NS, 'g');
      svg.appendChild(g);
      var habillage = dessin ? M.pieces.creer(g, dessin, gabarit) : M.batonnets.creer(g);
      var elements = (M.minutage.elements && M.minutage.elements[idScene]) || {};
      var actions = [];
      Array.prototype.forEach.call(div.children, function (el) {
        if (!el.hasAttribute('data-action')) return;
        var temps = elements[el.getAttribute('data-pm-cle')];
        if (temps) actions.push(lireAction(el, temps, idScene));
      });
      var echelle = nombre(div, 'data-taille', 40) / 100 * H / P.hauteur(gabarit);
      var sol0 = div.hasAttribute('data-sol') ? valeurSol(div.getAttribute('data-sol')) : 90;
      // Sols courbes : chaque tracé cité (conteneur ou actions), mesuré au démarrage et à chaque changement de taille.
      var sols = {}, traces = [];
      [sol0].concat(actions.map(function (a) { return a.sol; })).forEach(function (v) {
        if (typeof v !== 'string' || traces.some(function (x) { return x.id === v.slice(1); })) return;
        var id = v.slice(1), chemin = null;
        try { chemin = sec.querySelector('path#' + (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id)); } catch (e) { chemin = null; }
        traces.push({ id: id, chemin: chemin });
      });
      function mesurer(signaler) {
        traces.forEach(function (tr) {
          var f = tr.chemin ? mesurerTrace(tr.chemin, div, sec) : null;
          if (f) sols[tr.id] = f;
          else if (signaler) alerter(idScene, 'personnage « ' + nom + ' » : le sol « #' + tr.id + ' » n\'a pas pu être mesuré (tracé introuvable, vide ou caché) ; ligne droite à 90 % à la place.');
        });
      }
      mesurer(true);
      // Actions qui commencent pendant un arrêt sur image de leur conteneur : retardées jusqu'à sa fin.
      if (M.tempsVuPar) actions.forEach(function (a) {
        if (isFinite(a.debut) && M.tempsVuPar(div, a.debut + 0.05) - M.tempsVuPar(div, a.debut) < 1e-3) {
          alerter(idScene, 'personnage « ' + nom + ' », action « ' + a.type + ' » : elle commence pendant un arrêt sur image de son conteneur (data-gel) ; elle ne se jouera qu\'à la fin de l\'arrêt, ou jamais s\'il dure jusqu\'à la fin de la scène. Sortir le personnage du conteneur figé, ou déplacer l\'action.');
        }
      });
      if (M.interactions) M.interactions.preparer(actions);
      persos.push({ mesurer: mesurer, sec: sec,
        div: div, habillage: habillage, gabarit: gabarit, echelle: echelle,
        partition: { x0: nombre(div, 'data-x', 50), sol0: sol0, vue0: nombre(div, 'data-vue', 0), calme: div.getAttribute('data-calme') !== 'non', largeur: W, hauteur: H, echelle: echelle, sols: sols, actions: actions }
      });
    });
    if (!persos.length) return;

    function placerBase(p, t) {
      var e = P.etatAuTemps(p.partition, t, D.bib, p.gabarit);
      return Object.assign(e.pose, { x: e.x / 100 * W, y: e.sol / 100 * H - (S.sol(p.gabarit) + 7) * p.echelle, echelle: p.echelle });
    }
    // Pose complète : la partition, puis les interactions (atteindre, regarder).
    var ctxInteractions = { persos: persos, W: W, H: H, placerBase: placerBase };
    function placer(p, t) {
      var pose = placerBase(p, t);
      return M.interactions ? M.interactions.appliquer(p, t, pose, ctxInteractions) : pose;
    }
    function rendre(t) {
      persos.forEach(function (p) {
        // Le personnage vit au temps de ses conteneurs (arrêt sur image, accéléré).
        var tp = M.tempsVuPar ? M.tempsVuPar(p.div, t) : t;
        var contexte = p.gabarit.osEnPlus.length ? { temps: tp, poseA: function (u) { return placer(p, u); } } : undefined;
        p.habillage.rendre(S.calculer(placer(p, tp), p.gabarit, contexte));
      });
    }
    M.surRendu(rendre);
    rendre(M.temps ? M.temps() : 0);
    // Mains des personnages (repère de la scène, au temps de chacun) : pour les objets tenus.
    var memoMains = { t: null, par: new Map() };
    M.personnages = {
      W: W, H: H,
      connu: function (div) { return persos.some(function (p) { return p.div === div; }); },
      /** Pose complète de div au temps du personnage t (pour les vérifications). */
      pose: function (div, t) { var p = persos.filter(function (x) { return x.div === div; })[0]; return p ? placer(p, t) : null; },
      /** Mains de div à t (temps global ; tLocal : t est déjà au temps du personnage). Mémorisées pour l'image en cours. */
      mains: function (div, t, tLocal) {
        var cle = t + (tLocal ? 'l' : 'g');
        if (memoMains.t !== cle) memoMains = { t: cle, par: new Map() };
        if (memoMains.par.has(div)) return memoMains.par.get(div);
        var p = persos.filter(function (x) { return x.div === div; })[0];
        if (!p) return null;
        var tp = tLocal || !M.tempsVuPar ? t : M.tempsVuPar(div, t);
        var pose = placer(p, tp);
        var r = S.calculer(pose, p.gabarit), A = r.articulations, e = r.efficace;
        function point(nom) { return [e.x + A[nom][0] * e.echelle, e.y + A[nom][1] * e.echelle]; }
        var out = { sol: pose.y + (S.sol(p.gabarit) + 7) * p.echelle };
        [['avant', 'Avant'], ['arriere', 'Arriere']].forEach(function (c) {
          var h = point('main' + c[1]), k = point('coude' + c[1]);
          out[c[0]] = { x: h[0], y: h[1], angle: Math.atan2(h[1] - k[1], h[0] - k[0]) * 180 / Math.PI };
        });
        memoMains.par.set(div, out);
        return out;
      }
    };
    if (M.demarrerObjetsTenus) M.demarrerObjetsTenus();
    // La place du décor peut changer avec la taille de l'image : les sols courbes sont remesurés.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', function () {
        // Nouvelle partition : ses longueurs de trajet (mémorisées) suivent les sols remesurés.
        persos.forEach(function (p) { p.mesurer(false); p.partition = Object.assign({}, p.partition); });
        rendre(M.temps ? M.temps() : 0);
      });
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
