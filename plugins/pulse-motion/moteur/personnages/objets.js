/* Pulse Motion – objets tenus par un personnage (dans la page).
 *
 *   <div id="pancarte" data-tenu-par="#n1" data-main="deux" data-prise="50% 100%" data-orientation="droit"
 *        data-start="#leve" data-dur="5" data-lacher="reste">…</div>
 *
 * M.demarrerObjetsTenus() (appelé par M.demarrerPersonnages) : pendant sa fenêtre (data-start, data-dur), l'objet suit la
 * main de son porteur (M.personnages.mains) : son point de prise est posé sur la main, au temps du personnage ; il reste
 * droit ou tourne avec l'avant-bras (data-orientation). Avant : ses styles d'origine. Après : « reste » (là où la main l'a
 * lâché), « cache », ou « tombe » (jusqu'au sol du porteur). Tout ne dépend que de t : même image quel que soit l'ordre.
 * L'objet doit être dans le même conteneur que son porteur (repère commun).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var GRAVITE = 400;   // % de la hauteur de l'image par seconde²
  var MAINS = ['avant', 'arriere', 'deux'];
  var LACHERS = ['reste', 'cache', 'tombe'];
  var PROPRIETES = ['position', 'left', 'top', 'transform', 'transformOrigin', 'visibility', 'zIndex'];

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
      var origine = {};
      PROPRIETES.forEach(function (k) { origine[k] = el.style[k]; });
      objets.push({
        el: el, porteur: porteur, debut: temps.debut, fin: temps.fin, origine: origine,
        main: choix(el, 'data-main', MAINS, 'avant'), prise: lirePrise(el.getAttribute('data-prise')),
        orientation: choix(el, 'data-orientation', ['droit', 'main'], 'droit'), lacher: choix(el, 'data-lacher', LACHERS, 'reste'),
        devant: el.hasAttribute('data-devant')
      });
    });
    if (!objets.length) return;

    function restaurer(o) { PROPRIETES.forEach(function (k) { o.el.style[k] = o.origine[k]; }); }

    /** Point de prise (unités de la scène) et angle (degrés) à l'instant t, d'après les mains du porteur. */
    function prise(o, t) {
      var m = P.mains(o.porteur, t);
      if (!m) return null;
      if (o.main === 'deux') {
        var a = m.avant, b = m.arriere;
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
        if (t < o.debut) { restaurer(o); return; }
        var p = prise(o, Math.min(t, o.fin));
        if (!p) return;
        var y = p.y;
        if (t > o.fin && o.lacher === 'tombe') {
          var dt = t - o.fin;
          y = Math.min(Math.max(p.y, p.sol), p.y + 0.5 * GRAVITE * dt * dt / 100 * P.H);
        }
        var s = o.el.style;
        s.position = 'absolute';
        s.left = (p.x / P.W * 100) + '%';
        s.top = (y / P.H * 100) + '%';
        s.transformOrigin = o.prise[0] + '% ' + o.prise[1] + '%';
        s.transform = 'translate(' + (-o.prise[0]) + '%, ' + (-o.prise[1]) + '%) rotate(' + (Math.round(p.angle * 100) / 100) + 'deg)';
        s.zIndex = o.devant ? '10' : o.origine.zIndex;
        s.visibility = t > o.fin && o.lacher === 'cache' ? 'hidden' : o.origine.visibility;
      });
    }
    M.surRendu(rendre);
    rendre(M.temps ? M.temps() : 0);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
