/* Pulse Motion – « une seule ligne » (spec Styles et réalisation, 5.13, style carnet ; idée de lemo-opuscar one-line, MIT,
 * © 2026 LemoLab, réécrite pour le calque de S7) : un seul trait continu, à main levée, qui entre dans l'image, fait le tour
 * de chaque élément visé, va de l'un à l'autre et ressort par une petite boucle, tracé sur la durée de l'élément.
 *
 *   <i data-une-ligne="#titre" data-start="0.4" data-dur="2.4"></i>
 *   <i data-une-ligne="#a #b #c" data-start="mot:ensemble" data-dur="3" data-couleur="accent-lisible" data-epaisseur="0.4"></i>
 *
 * Module d'un style (5.10 point 3) : inclus seulement si identite.modules contient « une-ligne » (carnet). Composant du
 * calque (M.dessin.composant) : les boîtes viennent du relevé, le trait est un d.trait lissé à main levée (--pm-rugosite,
 * --pm-courbure, --pm-ebullition de la scène), donc frémit avec les autres tracés et jamais avec un texte. Sans data-dur :
 * 2 s. Une cible absente : dessin-erreur (avec les ids proches), la scène continue. Navigateur seulement ; dépend de
 * dessin/calque (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  if (!M.dessin || !M.dessin.composant) return;
  var TOUR = 1.12;          // tours autour de chaque cible
  var POINTS_TOUR = 14;     // points par tour
  var ECART = 2.2;          // cqh entre la cible et la ligne

  function r2(x) { return Math.round(x * 100) / 100; }

  /** Points [x, y] (cqh) de la ligne qui fait le tour de chaque boîte { x, y, l, h } (centre), dans l'ordre. */
  function pointsDe(boites, L) {
    var pts = [];
    var borne = function (p) { return [r2(Math.max(1, Math.min(L - 1, p[0]))), r2(Math.max(1, Math.min(99, p[1])))]; };
    var premiere = boites[0];
    // Entrée par la gauche, un peu sous la première cible.
    pts.push(borne([premiere.x - premiere.l / 2 - 9, premiere.y + premiere.h / 2 + 5]));
    boites.forEach(function (b) {
      var rx = b.l / 2 + ECART, ry = b.h / 2 + ECART;
      var depart = 0.75 * Math.PI;   // en bas à gauche (y vers le bas)
      var n = Math.round(POINTS_TOUR * TOUR);
      for (var i = 0; i <= n; i++) {
        var a = depart + (i / POINTS_TOUR) * 2 * Math.PI;
        // Le tour s'élargit un peu : la ligne ne repasse jamais exactement sur elle-même.
        var k = 1 + 0.08 * i / n;
        pts.push(borne([b.x + Math.cos(a) * rx * k, b.y + Math.sin(a) * ry * k]));
      }
    });
    // Sortie par la droite avec une petite boucle.
    var derniere = boites[boites.length - 1];
    var bx = derniere.x + derniere.l / 2 + ECART, by = derniere.y + derniere.h / 2 + ECART + 1;
    [[bx + 4, by + 1], [bx + 7, by - 1.5], [bx + 6, by - 3.5], [bx + 4.5, by - 2], [bx + 7.5, by + 0.5], [bx + 11, by]].forEach(function (p) { pts.push(borne(p)); });
    return pts;
  }

  M.dessin.composant('[data-une-ligne]', function (sc, el, outils) {
    var cibles = String(el.getAttribute('data-une-ligne') || '').split(/[\s,→]+/).filter(function (c) { return /^#[A-Za-z0-9_-]+$/.test(c); });
    var cle = 'une-ligne:' + (el.id || el.getAttribute('data-pm-cle') || cibles.join(''));
    var epaisseur = el.hasAttribute('data-epaisseur') ? outils.nombre(el.getAttribute('data-epaisseur'), 0.4) : undefined;
    return function (d) {
      if (!cibles.length) throw new Error('data-une-ligne : aucune cible (« #id » séparés par des espaces)');
      var t = outils.tempsElement(sc, el);
      var boites = cibles.map(function (c) { return d.boite(c); });
      d.trait(pointsDe(boites, d.L), { id: cle, lisse: true, main: true, debut: t.debut, duree: t.duree !== null ? t.duree : 2,
        couleur: el.getAttribute('data-couleur') || undefined, epaisseur: epaisseur });
    };
  });
  M.uneLigne = { pointsDe: pointsDe };
})(typeof globalThis !== 'undefined' ? globalThis : this);
