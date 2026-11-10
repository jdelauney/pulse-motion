/* Pulse Motion – objets tenus par un personnage (dans la page).
 *
 *   <div id="pancarte" data-tenu-par="#n1" data-main="deux" data-prise="50% 100%" data-orientation="droit"
 *        data-start="#leve" data-dur="5" data-lacher="reste">…</div>
 *   <div id="balle" data-tenu-par="#n1" data-start="1" data-dur="1.5" data-lacher="lance" data-cible="#n2"
 *        data-hauteur="15" data-tours="1" data-roule="0">…</div>
 *
 * M.demarrerObjetsTenus() (appelé par M.demarrerPersonnages) : pendant sa fenêtre (data-start, data-dur), l'objet suit la
 * main de son porteur (M.personnages.mains) : son point de prise est posé sur la main, au temps du personnage ; il reste
 * droit ou tourne avec l'avant-bras (data-orientation). Avant : ses styles d'origine. Après : « reste » (là où la main l'a
 * lâché), « cache », « tombe » (jusqu'au sol du porteur), ou « lance » (spec Mouvement vivant 5.8) : un vol balistique
 * (gravité de « tombe ») vers data-cible, sommet data-hauteur % de l'image au-dessus du plus haut des deux points,
 * data-tours tours en vol ; un personnage visé (même conteneur) le reçoit dans sa main avant à l'arrivée, puis l'objet
 * suit cette main ; sur un élément (haut-milieu de sa boîte, mesuré à l'image en cours) ou un point « x% y% » : écrasement
 * de 80 ms, puis roulement de data-roule % de la largeur en 0,8 s (rotation = distance / rayon). Tout ne dépend que de t :
 * même image quel que soit l'ordre. Lancer et roulement : rossark-motion-skill (cakeState, drawBall ; licence MIT),
 * formules reprises, code réécrit.
 * L'objet doit être dans le même conteneur que son porteur (repère commun), positionné en absolu ; ses styles de
 * placement (left, top, transform…) sont pris par la prise, en priorité : animer plutôt un enfant de l'objet.
 * data-devant : au-dessus du porteur ; data-derriere : derrière lui. data-relais="#n2 à 1.5" : passé à la main de #n2.
 * M.objetsTenus = { connu(el), point(el, t, tLocal) (centre de l'objet, unités de la scène, pur), vol(el, t) }.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var GRAVITE = 400;   // % de la hauteur de l'image par seconde²
  var MAINS = ['avant', 'arriere', 'deux'];
  var LACHERS = ['reste', 'cache', 'tombe', 'lance'];
  var CONTACT = 0.08, ROULE = 0.8;
  // Styles posés par la prise (prioritaires : une animation CSS de l'objet ne les écrase pas), rendus avant la prise.
  var PROPRIETES = ['position', 'left', 'top', 'right', 'bottom', 'margin', 'translate', 'transform', 'transform-origin', 'visibility', 'z-index'];

  function lirePoint(texte) {
    var m = /^\s*(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%\s*$/.exec(texte || '');
    return m ? [Number(m[1]), Number(m[2])] : null;
  }
  function lirePrise(texte) { return lirePoint(texte) || [50, 100]; }
  function nombre(el, attr, defaut) {
    var v = el.getAttribute(attr);
    var n = v === null || v.trim() === '' ? NaN : Number(v);
    return isFinite(n) ? n : defaut;
  }
  function choix(el, attr, liste, defaut) {
    var v = (el.getAttribute(attr) || '').trim();
    return liste.indexOf(v) >= 0 ? v : defaut;
  }
  function echapper(id) { return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id; }
  function cubicOut(k) { k = Math.max(0, Math.min(1, k)); return 1 - Math.pow(1 - k, 3); }
  function alerter(idScene, message) {
    var e = { regle: 'personnage-invalide', gravite: 'alerte', scene: idScene, message: 'Scène « ' + idScene + ' » : ' + message };
    if (M.erreurs) M.erreurs.push(e);
    if (typeof console !== 'undefined') console.warn('[Pulse Motion] ' + e.message);
  }

  M.demarrerObjetsTenus = function () {
    var P = M.personnages;
    if (!P || !M.minutage) return;
    var objets = [];
    document.querySelectorAll('[data-tenu-par]').forEach(function (el) {
      var sec = el.closest('[data-scene]');
      if (!sec) return;
      var idScene = sec.getAttribute('data-scene');
      var id = (el.getAttribute('data-tenu-par') || '').trim().replace(/^#/, '');
      var porteur = null;
      try { porteur = sec.querySelector('#' + echapper(id)); } catch (e) { porteur = null; }
      var temps = ((M.minutage.elements || {})[idScene] || {})[el.getAttribute('data-pm-cle')];
      if (!porteur || !P.connu(porteur) || !temps) return; // signalé à l'assemblage
      var nomObjet = 'l\'objet tenu' + (el.id ? ' « ' + el.id + ' »' : '');
      if (porteur.parentElement !== el.parentElement) {
        alerter(idScene, nomObjet + ' doit être dans le même conteneur que son porteur « ' + id + ' » ; il reste à sa place.');
        return;
      }
      // Le repère du personnage (image entière) doit couvrir son conteneur : sinon l'objet ne serait pas dans sa main.
      var boite = porteur.getBoundingClientRect();
      if (boite.width > 0 && boite.height > 0 && Math.abs(boite.width / boite.height - P.W / P.H) > 0.02 * P.W / P.H) {
        alerter(idScene, nomObjet + ' : le conteneur de « ' + id + ' » n\'a pas le format de l\'image ; mettre le personnage et ses objets dans un conteneur qui couvre l\'image.');
      }
      // Relais : « #n2 à 1.5 » : à 1,5 s dans la prise, la main de #n2 le tient (même conteneur).
      var relais = null, mr = /^\s*#?([\w-]+)\s+à\s+(\d*\.?\d+)\s*$/.exec(el.getAttribute('data-relais') || '');
      if (mr) {
        var autre = null;
        try { autre = sec.querySelector('#' + echapper(mr[1])); } catch (e) { autre = null; }
        if (autre && P.connu(autre) && autre.parentElement === el.parentElement) relais = { div: autre, t: temps.debut + Number(mr[2]) };
      }
      var lacher = choix(el, 'data-lacher', LACHERS, 'reste');
      // Lancer : cible lue une fois (personnage du même conteneur, élément, ou point de l'image).
      var lancer = null;
      if (lacher === 'lance') {
        var c = (el.getAttribute('data-cible') || '').trim(), cible = null, point = lirePoint(c);
        if (point) cible = { point: { x: point[0] / 100 * P.W, y: point[1] / 100 * P.H } };
        else if (/^#[\w-]+$/.test(c)) {
          var vise = null;
          try { vise = sec.querySelector('#' + echapper(c.slice(1))); } catch (e) { vise = null; }
          if (vise && P.connu(vise) && vise.parentElement === el.parentElement) cible = { perso: vise };
          else if (vise) cible = { element: vise };
        }
        if (!cible) {
          alerter(idScene, nomObjet + ' est lancé sans cible trouvée (data-cible « ' + c + ' ») ; il reste là où la main l\'a lâché.');
          lacher = 'reste';
        } else {
          lancer = { cible: cible, hauteur: nombre(el, 'data-hauteur', 15), tours: nombre(el, 'data-tours', 1), roule: Math.max(0, nombre(el, 'data-roule', 0)), fixe: null };
        }
      }
      var origine = {};
      PROPRIETES.forEach(function (k) { origine[k] = [el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]; });
      objets.push({
        el: el, porteur: porteur, debut: temps.debut, fin: temps.fin, origine: origine,
        main: choix(el, 'data-main', MAINS, 'avant'), prise: lirePrise(el.getAttribute('data-prise')),
        orientation: choix(el, 'data-orientation', ['droit', 'main'], 'droit'), lacher: lacher, lancer: lancer,
        devant: el.hasAttribute('data-devant'), derriere: el.hasAttribute('data-derriere'), finale: null, relais: relais, taille: null
      });
      // Derrière : le porteur passe au-dessus de l'objet.
      if (el.hasAttribute('data-derriere') && !porteur.style.zIndex) porteur.style.zIndex = '2';
    });
    if (!objets.length) return;

    function restaurer(o) { PROPRIETES.forEach(function (k) { o.el.style.setProperty(k, o.origine[k][0], o.origine[k][1]); }); }
    function poser(o, k, v) { o.el.style.setProperty(k, v, 'important'); }

    /** Taille de mise en page de l'objet (unités de la scène), lue dès qu'il est affiché : elle ne dépend pas de t. */
    function taille(o) {
      if (o.taille) return o.taille;
      var l = o.el.offsetWidth, h = o.el.offsetHeight, L = o.porteur.offsetWidth, H = o.porteur.offsetHeight;
      if (!(l > 0 && h > 0 && L > 0 && H > 0)) return null;
      o.taille = { l: l / L * P.W, h: h / H * P.H };
      return o.taille;
    }

    /** Point de prise (unités de la scène) et angle (degrés) au temps local tl (celui du conteneur commun). */
    function prise(o, tl, div, main) {
      var m = P.mains(div || (o.relais && tl >= o.relais.t ? o.relais.div : o.porteur), tl, true);
      if (!m) return null;
      main = main || o.main;
      if (main === 'deux') {
        var a = m.avant, b = m.arriere;
        // Mains presque confondues (de profil) : l'angle de leur ligne n'a pas de sens, l'objet reste droit.
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01 * P.H) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: 0, sol: m.sol };
        var ligne = Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI;
        // La ligne des mains est lue de gauche à droite (l'objet ne se retourne pas quand le porteur se tourne).
        if (ligne > 90) ligne -= 180; else if (ligne < -90) ligne += 180;
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: o.orientation === 'main' ? ligne : 0, sol: m.sol };
      }
      var h = m[main];
      return { x: h.x, y: h.y, angle: o.orientation === 'main' ? h.angle + 90 : 0, sol: m.sol };
    }
    function lache(o) { return o.finale || (o.finale = prise(o, o.fin)); } // la main au lâcher ne change plus

    /** Durée d'un vol de p0 à p1, sommet hauteur % de l'image au-dessus du plus haut des deux. */
    function dureeVol(p0, p1, hauteur) {
      var g = GRAVITE / 100 * P.H, yA = Math.min(p0.y, p1.y) - hauteur / 100 * P.H;
      return Math.sqrt(2 * (p0.y - yA) / g) + Math.sqrt(2 * (p1.y - yA) / g);
    }
    /** Point visé par un lancer à tl : main avant du personnage à l'arrivée (point fixe en 3 passes, gardé), point de
     *  l'image, ou haut-milieu de la boîte de l'élément à l'image en cours (repère du porteur). */
    function arrivee(o, tl) {
      var L = o.lancer, c = L.cible, p0 = lache(o);
      if (c.point) return c.point;
      if (c.perso) {
        if (!L.fixe) {
          var m = P.mains(c.perso, o.fin, true), p1 = m ? m.avant : p0;
          for (var i = 0; i < 3; i++) { m = P.mains(c.perso, o.fin + dureeVol(p0, p1, L.hauteur), true); if (m) p1 = m.avant; }
          L.fixe = { x: p1.x, y: p1.y };
        }
        return L.fixe;
      }
      var rd = o.porteur.getBoundingClientRect(), re = c.element.getBoundingClientRect();
      // Élément non affiché à cette image : l'objet retombe où il a été lâché (rien n'est gardé d'une image à l'autre).
      if (!(rd.width > 0 && rd.height > 0) || !(re.width > 0 || re.height > 0)) return { x: p0.x, y: p0.y };
      return { x: (re.left + re.width / 2 - rd.left) / rd.width * P.W, y: (re.top - rd.top) / rd.height * P.H };
    }
    /** Vol d'un objet lancé, vu à tl : { t0, T, p0, p1, sommet }. */
    function vol(o, tl) {
      var p0 = lache(o);
      if (!p0) return null;
      var p1 = arrivee(o, tl);
      return { t0: o.fin, T: dureeVol(p0, p1, o.lancer.hauteur), p0: { x: p0.x, y: p0.y, angle: p0.angle }, p1: { x: p1.x, y: p1.y },
        sommet: Math.min(p0.y, p1.y) - o.lancer.hauteur / 100 * P.H };
    }

    /** État de l'objet au temps local tl : null avant sa fenêtre ; sinon { x, y (point de prise), angle, sx, sy, cache }. */
    function etat(o, tl) {
      if (tl < o.debut) return null;
      if (tl < o.fin) { var q = prise(o, tl); return q ? { x: q.x, y: q.y, angle: q.angle, sx: 1, sy: 1, cache: false } : null; }
      var p = lache(o);
      if (!p) return null;
      if (o.lacher === 'lance') {
        var v = vol(o, tl), s = tl - o.fin, L = o.lancer, g = GRAVITE / 100 * P.H;
        var tours = L.tours * 360;
        if (s < v.T) {
          var vy = Math.sqrt(2 * g * (v.p0.y - v.sommet));
          return { x: v.p0.x + (v.p1.x - v.p0.x) * s / v.T, y: v.p0.y - vy * s + g * s * s / 2, angle: p.angle + tours * s / v.T, sx: 1, sy: 1, cache: false };
        }
        // Arrivée dans une main : l'objet la suit (comme un relais).
        if (L.cible.perso) { var h = prise(o, tl, L.cible.perso, 'avant'); return h ? { x: h.x, y: h.y, angle: h.angle, sx: 1, sy: 1, cache: false } : null; }
        // Sur un élément ou un point : écrasement, puis roulement (distance / rayon).
        var u = s - v.T, dx = 0, roule = 0;
        if (L.roule > 0) {
          var t = taille(o), r = t ? t.h / 2 : 0;
          dx = (v.p1.x >= v.p0.x ? 1 : -1) * L.roule / 100 * P.W * cubicOut(u / ROULE);
          roule = r > 0 ? dx / r * 180 / Math.PI : 0;
        }
        var k = u < CONTACT ? cubicOut(u / CONTACT) : 1;
        return { x: v.p1.x + dx, y: v.p1.y, angle: p.angle + tours + roule, sx: 1.1 - 0.1 * k, sy: 0.88 + 0.12 * k, cache: false };
      }
      var y = p.y;
      if (tl > o.fin && o.lacher === 'tombe') {
        var dt = tl - o.fin;
        y = Math.min(Math.max(p.y, p.sol), p.y + 0.5 * GRAVITE * dt * dt / 100 * P.H);
      }
      return { x: p.x, y: y, angle: p.angle, sx: 1, sy: 1, cache: tl > o.fin && o.lacher === 'cache' };
    }

    function arrondi(x) { return Math.round(x * 100) / 100; }
    function rendre(t) {
      objets.forEach(function (o) {
        // Fenêtre, chute et vol au temps du conteneur (arrêt sur image, accéléré), comme les autres éléments minutés.
        var tl = M.tempsVuPar ? M.tempsVuPar(o.el, t) : t;
        if (tl < o.debut) { restaurer(o); return; }
        var e = etat(o, tl);
        if (!e) return;
        if (o.lancer && o.lancer.roule > 0) taille(o);
        poser(o, 'position', 'absolute');
        poser(o, 'left', (e.x / P.W * 100) + '%');
        poser(o, 'top', (e.y / P.H * 100) + '%');
        poser(o, 'right', 'auto'); poser(o, 'bottom', 'auto'); poser(o, 'margin', '0'); poser(o, 'translate', 'none');
        poser(o, 'transform-origin', o.prise[0] + '% ' + o.prise[1] + '%');
        var ecrase = Math.abs(e.sx - 1) > 1e-4 || Math.abs(e.sy - 1) > 1e-4 ? ' scale(' + Math.round(e.sx * 10000) / 10000 + ', ' + Math.round(e.sy * 10000) / 10000 + ')' : '';
        poser(o, 'transform', 'translate(' + (-o.prise[0]) + '%, ' + (-o.prise[1]) + '%) rotate(' + arrondi(e.angle) + 'deg)' + ecrase);
        if (o.devant) poser(o, 'z-index', '10'); else if (o.derriere) poser(o, 'z-index', '1');
        else o.el.style.setProperty('z-index', o.origine['z-index'][0], o.origine['z-index'][1]);
        if (e.cache) poser(o, 'visibility', 'hidden');
        else o.el.style.setProperty('visibility', o.origine.visibility[0], o.origine.visibility[1]);
      });
    }

    function objetDe(el) { return objets.filter(function (o) { return o.el === el; })[0] || null; }
    M.objetsTenus = {
      connu: function (el) { return !!objetDe(el); },
      /** Centre de l'objet à t (unités de la scène ; tLocal : t est déjà au temps de son conteneur), ou null avant sa
       *  fenêtre. Pur : sert au regard qui suit un objet tenu ou lancé. */
      point: function (el, t, tLocal) {
        var o = objetDe(el);
        if (!o) return null;
        var tl = tLocal || !M.tempsVuPar ? t : M.tempsVuPar(o.el, t);
        var e = etat(o, Math.max(tl, o.debut));
        if (!e) return null;
        var tt = taille(o);
        if (!tt) return { x: e.x, y: e.y };
        var lx = (50 - o.prise[0]) / 100 * tt.l * e.sx, ly = (50 - o.prise[1]) / 100 * tt.h * e.sy, a = e.angle * Math.PI / 180;
        return { x: e.x + lx * Math.cos(a) - ly * Math.sin(a), y: e.y + lx * Math.sin(a) + ly * Math.cos(a) };
      },
      /** Vol d'un objet lancé vu à t (temps de son conteneur) : { t0, T, p0, p1, sommet } (vérifications), ou null. */
      vol: function (el, t) { var o = objetDe(el); return o && o.lancer ? vol(o, typeof t === 'number' ? t : o.fin) : null; }
    };
    // Rendu appelé par celui des personnages (avant eux), à chaque image.
    M.rendreObjetsTenus = rendre;
    rendre(M.temps ? M.temps() : 0);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
