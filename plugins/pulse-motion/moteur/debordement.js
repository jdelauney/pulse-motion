/* Pulse Motion – détection des textes qui débordent (aperçu seulement).
 *
 * M.detecterDebordements() rend 5 instants de chaque scène et relève les éléments
 * data-texte qui débordent de leur cadre ou sortent de l'image, puis revient à
 * l'instant de départ. Un élément encore en train d'entrer (data-etat « avant »
 * ou « pendant ») n'est pas jugé hors de l'image : il peut arriver de l'extérieur.
 * Un texte découpé (data-lettres, data-mots) n'est jugé qu'une fois toutes ses lettres arrivées ;
 * un texte dans une caméra (data-camera) n'est pas jugé hors de l'image : le cadrage est voulu.
 * Sous l'aperçu (window.__PM_APERCU__), le rapport est envoyé à /_pm/controle.
 * Navigateur seulement ; dépend de horloge (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var INSTANTS = 5;

  function virgule(t) { return (Math.round(t * 10) / 10).toString().replace('.', ','); }

  function enMouvement(el) {
    var porteur = el.closest('[data-etat]');
    var etat = porteur && porteur.getAttribute('data-etat');
    return etat === 'avant' || etat === 'pendant';
  }

  /** Texte découpé dont une lettre ou un mot est encore en train d'entrer. */
  function lettresEnCours(el) {
    if (!el.hasAttribute('data-lettres') && !el.hasAttribute('data-mots')) return false;
    return el.getAnimations({ subtree: true }).some(function (a) {
      var fin = a.effect && a.effect.getComputedTiming().endTime;
      return typeof fin === 'number' && a.currentTime < fin;
    });
  }

  M.detecterDebordements = function () {
    var depart = M.temps();
    var resultats = [];
    var vus = {};
    M.minutage.scenes.forEach(function (s) {
      var sec = document.querySelector('#pm-scene > section[data-scene="' + s.id + '"]');
      if (!sec) return;
      for (var k = 0; k < INSTANTS; k++) {
        var t = s.debut + (s.fin - s.debut) * (k + 0.5) / INSTANTS;
        M.rendre(t);
        var cadre = sec.getBoundingClientRect();
        sec.querySelectorAll('[data-texte]').forEach(function (el) {
          var nom = el.getAttribute('data-texte');
          var cle = s.id + '|' + (el.id || nom);
          if (vus[cle] || lettresEnCours(el)) return;
          var r = el.getBoundingClientRect();
          // Tolérance d'un quart de la taille du texte : avec un interligne serré, accents et
          // jambages dépassent de quelques pixels sans que le texte déborde vraiment.
          var marge = Math.max(1, 0.25 * parseFloat(getComputedStyle(el).fontSize));
          var deborde = el.scrollWidth > el.clientWidth + marge || el.scrollHeight > el.clientHeight + marge;
          var dehors = !enMouvement(el) && !el.closest('[data-camera]') && r.width > 0 &&
            (r.left < cadre.left - 1 || r.right > cadre.right + 1 || r.top < cadre.top - 1 || r.bottom > cadre.bottom + 1);
          if (deborde || dehors) {
            vus[cle] = true;
            resultats.push({
              scene: s.id,
              element: el.id || nom,
              message: 'Scène « ' + s.id + ' » : le texte « ' + nom + ' » ' +
                (deborde ? 'déborde de son cadre' : 'sort de l\'image') + ' (vers ' + virgule(t) + ' s).',
            });
          }
        });
      }
    });
    M.rendre(depart);
    return resultats;
  };

  if (racine.__PM_APERCU__ && racine.fetch) {
    M.pret.then(function () { return document.fonts ? document.fonts.ready : null; }).then(function () {
      var debordements = M.detecterDebordements();
      return racine.fetch('/_pm/controle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debordements: debordements }),
      });
    }).catch(function () { /* l'aperçu peut être arrêté : rien à signaler */ });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
