/* Pulse Motion – taille ajustée d'un texte (data-taille="0.9", posé par l'assemblage depuis deroule.ajustements) :
 * taille de police de la scène (écrite dans son style, sinon celle du style) × facteur. Recalculée au chargement,
 * quand l'image change de taille (ResizeObserver, et à chaque rendu par sûreté : export) ; le facteur suit les cqh.
 * Un texte dont la taille est animée (data-tween sur font-size) n'est jamais ajusté : l'animation l'emporterait.
 * M.essayerTailles({ minimumCqh, facteurs }) : dans la page de contrôle, pour chaque texte qui déborde de son
 * cadre, le plus grand facteur (sous le facteur actuel) qui supprime le débordement sans passer sous minimumCqh.
 * Navigateur seulement ; dépend de horloge (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var derniere = '';

  function animee(el) { return /(^|;)\s*font-size\b/.test(el.getAttribute('data-tween') || ''); }

  /** Taille écrite dans la scène (gardée une fois pour toutes), remise en place ; -> taille calculée en px. */
  function base(el) {
    if (!el.hasAttribute('data-pm-taille-scene')) el.setAttribute('data-pm-taille-scene', el.style.getPropertyValue('font-size'));
    var ecrite = el.getAttribute('data-pm-taille-scene');
    if (ecrite) el.style.setProperty('font-size', ecrite); else el.style.removeProperty('font-size');
    return parseFloat(getComputedStyle(el).fontSize);
  }
  function poser(el, f) {
    var taille = base(el);
    if (f < 1) el.style.setProperty('font-size', (taille * f) + 'px');
  }

  M.appliquerTailles = function () {
    document.querySelectorAll('#pm-scene [data-taille]').forEach(function (el) {
      var f = parseFloat(el.getAttribute('data-taille'));
      if (!animee(el) && f > 0 && f <= 1) poser(el, f);
    });
    var c = document.getElementById('pm-scene');
    if (c) { var r = c.getBoundingClientRect(); derniere = r.width + 'x' + r.height; }
  };

  function deborde(el) {
    var marge = Math.max(1, 0.25 * parseFloat(getComputedStyle(el).fontSize));
    return el.scrollWidth > el.clientWidth + marge || el.scrollHeight > el.clientHeight + marge;
  }

  M.essayerTailles = function (options) {
    options = options || {};
    var facteurs = options.facteurs || [0.95, 0.9, 0.85, 0.8];
    var conteneur = document.getElementById('pm-scene');
    var minimum = (options.minimumCqh || 3.5) * conteneur.getBoundingClientRect().height / 100;
    var depart = M.temps();
    var resultats = [];
    var vus = {};
    M.minutage.scenes.forEach(function (s) {
      var sec = conteneur.querySelector(':scope > section[data-scene="' + s.id + '"]');
      if (!sec) return;
      for (var k = 0; k < 5; k++) {
        M.rendre(s.debut + (s.fin - s.debut) * (k + 0.5) / 5);
        sec.querySelectorAll('[data-texte]').forEach(function (el) {
          var cle = el.getAttribute('data-texte');
          if (vus[s.id + '|' + cle] || animee(el) || !deborde(el)) return;
          vus[s.id + '|' + cle] = true;
          var actuel = parseFloat(el.getAttribute('data-taille')) || 1;
          var taille = base(el);
          var trouve = null;
          for (var i = 0; i < facteurs.length; i++) {
            var f = facteurs[i];
            if (f >= actuel - 1e-9) continue;
            if (taille * f < minimum) break;
            el.style.setProperty('font-size', (taille * f) + 'px');
            if (!deborde(el)) { trouve = f; break; }
          }
          // L'essai ne laisse rien : taille de la scène × facteur actuel.
          poser(el, actuel);
          resultats.push({ scene: s.id, element: el.id || cle, cle: cle, taille: trouve });
        });
      }
    });
    M.rendre(depart);
    return resultats;
  };

  // Au chargement, quand l'image change de taille (aperçu en pause, plein écran), et à chaque rendu par sûreté.
  M.appliquerTailles();
  var scene = document.getElementById('pm-scene');
  if (scene && racine.ResizeObserver) new racine.ResizeObserver(function () { M.appliquerTailles(); }).observe(scene);
  else if (racine.addEventListener) racine.addEventListener('resize', function () { M.appliquerTailles(); });
  if (M.surRendu) {
    M.surRendu(function () {
      var c = document.getElementById('pm-scene');
      if (!c) return;
      var r = c.getBoundingClientRect();
      if (r.width + 'x' + r.height !== derniere) M.appliquerTailles();
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
