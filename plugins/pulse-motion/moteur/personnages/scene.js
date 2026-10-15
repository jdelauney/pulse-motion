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

  function lireAction(el, temps) {
    var a = { type: el.getAttribute('data-action'), debut: temps.debut, fin: temps.fin };
    if (el.hasAttribute('data-vers')) a.vers = nombre(el, 'data-vers', 50);
    if (el.hasAttribute('data-vue')) a.vue = nombre(el, 'data-vue', 0);
    ['pose', 'clip', 'expression', 'bouche'].forEach(function (k) { if (el.hasAttribute('data-' + k)) a[k] = el.getAttribute('data-' + k); });
    return a;
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
        if (temps) actions.push(lireAction(el, temps));
      });
      var echelle = nombre(div, 'data-taille', 40) / 100 * H / P.hauteur(gabarit);
      persos.push({
        habillage: habillage, gabarit: gabarit, sol: nombre(div, 'data-sol', 90) / 100 * H, echelle: echelle,
        partition: { x0: nombre(div, 'data-x', 50), vue0: nombre(div, 'data-vue', 0), calme: div.getAttribute('data-calme') !== 'non', largeur: W, echelle: echelle, actions: actions }
      });
    });
    if (!persos.length) return;

    function placer(p, t) {
      var e = P.etatAuTemps(p.partition, t, D.bib, p.gabarit);
      return Object.assign(e.pose, { x: e.x / 100 * W, y: p.sol - (S.sol(p.gabarit) + 7) * p.echelle, echelle: p.echelle });
    }
    function rendre(t) {
      persos.forEach(function (p) {
        var contexte = p.gabarit.osEnPlus.length ? { temps: t, poseA: function (u) { return placer(p, u); } } : undefined;
        p.habillage.rendre(S.calculer(placer(p, t), p.gabarit, contexte));
      });
    }
    M.surRendu(rendre);
    rendre(M.temps ? M.temps() : 0);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
