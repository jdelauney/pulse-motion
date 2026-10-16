/* Pulse Motion – objets tenus par un personnage (dans la page).
 *
 *   <div id="pancarte" data-tenu-par="#n1" data-main="deux" data-prise="50% 100%" data-orientation="droit"
 *        data-start="#leve" data-dur="5" data-lacher="reste">…</div>
 *
 * M.demarrerObjetsTenus() (appelé par M.demarrerPersonnages) : pendant sa fenêtre (data-start, data-dur), l'objet suit la
 * main de son porteur (M.personnages.mains) : son point de prise est posé sur la main, au temps du personnage ; il reste
 * droit ou tourne avec l'avant-bras (data-orientation). Avant : ses styles d'origine. Après : « reste » (là où la main l'a
 * lâché), « cache », ou « tombe » (jusqu'au sol du porteur). Tout ne dépend que de t : même image quel que soit l'ordre.
 * L'objet doit être dans le même conteneur que son porteur (repère commun), positionné en absolu ; ses styles de
 * placement (left, top, transform…) sont pris par la prise, en priorité : animer plutôt un enfant de l'objet.
 * data-devant : au-dessus du porteur ; data-derriere : derrière lui.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var GRAVITE = 400;   // % de la hauteur de l'image par seconde²
  var MAINS = ['avant', 'arriere', 'deux'];
  var LACHERS = ['reste', 'cache', 'tombe'];
  // Styles posés par la prise (prioritaires : une animation CSS de l'objet ne les écrase pas), rendus avant la prise.
  var PROPRIETES = ['position', 'left', 'top', 'right', 'bottom', 'margin', 'translate', 'transform', 'transform-origin', 'visibility', 'z-index'];

  function lirePrise(texte) {
    var m = /^\s*(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%\s*$/.exec(texte || '');
    return m ? [Number(m[1]), Number(m[2])] : [50, 100];
  }
  function choix(el, attr, liste, defaut) {
    var v = (el.getAttribute(attr) || '').trim();
    return liste.indexOf(v) >= 0 ? v : defaut;
  }
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
      try { porteur = sec.querySelector('#' + (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id)); } catch (e) { porteur = null; }
      var temps = ((M.minutage.elements || {})[idScene] || {})[el.getAttribute('data-pm-cle')];
      if (!porteur || !P.connu(porteur) || !temps) return; // signalé à l'assemblage
      if (porteur.parentElement !== el.parentElement) {
        alerter(idScene, 'l\'objet tenu' + (el.id ? ' « ' + el.id + ' »' : '') + ' doit être dans le même conteneur que son porteur « ' + id + ' » ; il reste à sa place.');
        return;
      }
      // Le repère du personnage (image entière) doit couvrir son conteneur : sinon l'objet ne serait pas dans sa main.
      var boite = porteur.getBoundingClientRect();
      if (boite.width > 0 && boite.height > 0 && Math.abs(boite.width / boite.height - P.W / P.H) > 0.02 * P.W / P.H) {
        alerter(idScene, 'l\'objet tenu' + (el.id ? ' « ' + el.id + ' »' : '') + ' : le conteneur de « ' + id + ' » n\'a pas le format de l\'image ; mettre le personnage et ses objets dans un conteneur qui couvre l\'image.');
      }
      var origine = {};
      PROPRIETES.forEach(function (k) { origine[k] = [el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]; });
      objets.push({
        el: el, porteur: porteur, debut: temps.debut, fin: temps.fin, origine: origine,
        main: choix(el, 'data-main', MAINS, 'avant'), prise: lirePrise(el.getAttribute('data-prise')),
        orientation: choix(el, 'data-orientation', ['droit', 'main'], 'droit'), lacher: choix(el, 'data-lacher', LACHERS, 'reste'),
        devant: el.hasAttribute('data-devant'), derriere: el.hasAttribute('data-derriere'), finale: null
      });
      // Derrière : le porteur passe au-dessus de l'objet.
      if (el.hasAttribute('data-derriere') && !porteur.style.zIndex) porteur.style.zIndex = '2';
    });
    if (!objets.length) return;

    function restaurer(o) { PROPRIETES.forEach(function (k) { o.el.style.setProperty(k, o.origine[k][0], o.origine[k][1]); }); }
    function poser(o, k, v) { o.el.style.setProperty(k, v, 'important'); }

    /** Point de prise (unités de la scène) et angle (degrés) au temps local tl (celui du conteneur commun). */
    function prise(o, tl) {
      var m = P.mains(o.porteur, tl, true);
      if (!m) return null;
      if (o.main === 'deux') {
        var a = m.avant, b = m.arriere;
        // Mains presque confondues (de profil) : l'angle de leur ligne n'a pas de sens, l'objet reste droit.
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01 * P.H) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: 0, sol: m.sol };
        var ligne = Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI;
        // La ligne des mains est lue de gauche à droite (l'objet ne se retourne pas quand le porteur se tourne).
        if (ligne > 90) ligne -= 180; else if (ligne < -90) ligne += 180;
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: o.orientation === 'main' ? ligne : 0, sol: m.sol };
      }
      var h = m[o.main];
      return { x: h.x, y: h.y, angle: o.orientation === 'main' ? h.angle + 90 : 0, sol: m.sol };
    }

    function rendre(t) {
      objets.forEach(function (o) {
        // Fenêtre et chute au temps du conteneur (arrêt sur image, accéléré), comme les autres éléments minutés.
        var tl = M.tempsVuPar ? M.tempsVuPar(o.el, t) : t;
        if (tl < o.debut) { restaurer(o); return; }
        var p;
        if (tl >= o.fin) p = o.finale || (o.finale = prise(o, o.fin)); // la main au lâcher ne change plus
        else p = prise(o, tl);
        if (!p) return;
        var y = p.y;
        if (tl > o.fin && o.lacher === 'tombe') {
          var dt = tl - o.fin;
          y = Math.min(Math.max(p.y, p.sol), p.y + 0.5 * GRAVITE * dt * dt / 100 * P.H);
        }
        poser(o, 'position', 'absolute');
        poser(o, 'left', (p.x / P.W * 100) + '%');
        poser(o, 'top', (y / P.H * 100) + '%');
        poser(o, 'right', 'auto'); poser(o, 'bottom', 'auto'); poser(o, 'margin', '0'); poser(o, 'translate', 'none');
        poser(o, 'transform-origin', o.prise[0] + '% ' + o.prise[1] + '%');
        poser(o, 'transform', 'translate(' + (-o.prise[0]) + '%, ' + (-o.prise[1]) + '%) rotate(' + (Math.round(p.angle * 100) / 100) + 'deg)');
        if (o.devant) poser(o, 'z-index', '10'); else if (o.derriere) poser(o, 'z-index', '1');
        else o.el.style.setProperty('z-index', o.origine['z-index'][0], o.origine['z-index'][1]);
        if (tl > o.fin && o.lacher === 'cache') poser(o, 'visibility', 'hidden');
        else o.el.style.setProperty('visibility', o.origine.visibility[0], o.origine.visibility[1]);
      });
    }
    M.surRendu(rendre);
    rendre(M.temps ? M.temps() : 0);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
