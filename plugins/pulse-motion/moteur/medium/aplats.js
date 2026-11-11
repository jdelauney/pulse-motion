/* Pulse Motion – aplats décalés de leur trait cassé, du style mode-d-emploi (spec Styles et réalisation, 5.16).
 *
 * Module d'un style (5.10 point 3) : inclus par l'assemblage seulement si identite.modules du style contient « aplats ». Il ne
 * tire pas le calque de dessin. Balisage :
 *   <div class="piece" data-aplat style="--pm-aplat: …">…</div>     data-aplat="rond" : contour en ellipse (sinon rectangle,
 *   arrondi par --pm-aplat-rayon).
 * Au chargement, une seule fois : chaque [data-aplat] reçoit son trait, un <svg class="pm-aplat-trait"> sur sa boîte (contour
 * sans remplissage, en unités cqh, donc juste à toute taille) ; ses tirets irréguliers (--pm-tirets, quatre tirets et leurs
 * blancs, de 1,6 à 5 cqh et de 0,25 à 0,6 cqh) et leur départ (--pm-tirets-depart) sont tirés d'une graine (scène et rang de
 * l'élément). Chaque scène qui en a reçoit son décalage de repérage (--pm-repere-x, --pm-repere-y : de 0,3 à 0,6 cqh, direction
 * et longueur tirées de la scène), constant dans le plan : la couleur de tous ses aplats (::before, aplats.css) est imprimée
 * à côté de son trait, comme une impression jamais tout à fait calée. Rien ne dépend du temps : rien n'est redessiné.
 * Déterminisme : graines seulement, jamais Math.random. Idée (aplats des années 50 à quelques pixels de leur trait cassé) :
 * lemo-opuscar, midcentury-toon (MIT, © 2026 LemoLab), réécrite. Navigateur seulement.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  if (typeof document === 'undefined') return;
  var NS = 'http://www.w3.org/2000/svg';

  /** Graine stable d'un texte (FNV-1a), puis suite de nombres dans [0, 1[ (mulberry32). */
  function suite(texte) {
    var h = 2166136261;
    for (var i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619); }
    var a = h >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cqh(v) { return (Math.round(v * 100) / 100) + 'cqh'; }

  /** Tirets d'un élément : « a b c d e f g h » (cqh). */
  function tirets(cle) {
    var u = suite(cle), v = [];
    for (var i = 0; i < 4; i++) v.push(cqh(1.6 + 3.4 * u()), cqh(0.25 + 0.35 * u()));
    return { motif: v.join(' '), depart: cqh(-8 * u()) };
  }
  /** Décalage de repérage d'une scène : [dx, dy] en cqh, longueur 0,3 à 0,6, plutôt vers le bas à droite. */
  function repere(idScene) {
    var u = suite('repere/' + idScene);
    var a = (10 + 60 * u()) * Math.PI / 180, r = 0.3 + 0.3 * u();
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  function poser() {
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (sec) {
      var id = sec.getAttribute('data-scene');
      var aplats = sec.querySelectorAll('[data-aplat]');
      if (!aplats.length) return;
      var d = repere(id);
      sec.style.setProperty('--pm-repere-x', cqh(d[0]));
      sec.style.setProperty('--pm-repere-y', cqh(d[1]));
      Array.prototype.forEach.call(aplats, function (el, rang) {
        if (el.querySelector(':scope > svg.pm-aplat-trait')) return;
        var t = tirets(id + '/' + (el.id || rang));
        el.style.setProperty('--pm-tirets', t.motif);
        el.style.setProperty('--pm-tirets-depart', t.depart);
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'pm-aplat-trait');
        svg.setAttribute('aria-hidden', 'true');
        var rond = (el.getAttribute('data-aplat') || '').trim() === 'rond';
        var f = document.createElementNS(NS, rond ? 'ellipse' : 'rect');
        if (rond) { f.setAttribute('cx', '50%'); f.setAttribute('cy', '50%'); f.setAttribute('rx', '50%'); f.setAttribute('ry', '50%'); }
        else { f.setAttribute('width', '100%'); f.setAttribute('height', '100%'); }
        svg.appendChild(f);
        el.appendChild(svg);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poser);
  else poser();
  M.aplats = { tirets: tirets, repere: repere, poser: poser };
})(typeof globalThis !== 'undefined' ? globalThis : this);
