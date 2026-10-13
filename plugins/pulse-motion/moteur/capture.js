/* Pulse Motion – capture de l'image courante dans un canvas (export rapide).
 *
 * M.capturer(ctx, largeur, hauteur) dessine #pm-scene, tel qu'il est rendu à l'instant
 * courant, dans le contexte 2D donné. Voie SVG foreignObject : copie des scènes visibles
 * figées par M.figer (styles calculés en ligne, animations comprises, pseudo-éléments ::before/::after
 * recréés, valeurs SMIL figées), polices @font-face embarquées dans l'image.
 * Calques de particules : M.particules.preparerCapture() pose l'image de chaque calque sur son canvas, remplacé par un <img>.
 * Limites (export rapide) : filter: url(), mix-blend-mode, backdrop-filter mal rendus.
 * Navigateur seulement ; servi par l'aperçu, absent de la page livrée ; dépend de figer.js (M.figer, dans la page livrée).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var XHTML = 'http://www.w3.org/1999/xhtml';

  /** Copie de #pm-scene réduite aux scènes affichées. */
  function copierScene() {
    var scene = document.getElementById('pm-scene');
    var copie = scene.cloneNode(false);
    copie.setAttribute('style', M.figer.styleFige(getComputedStyle(scene)) + 'margin:0;left:0;top:0;');
    Array.prototype.forEach.call(scene.children, function (sec) {
      if (getComputedStyle(sec).display !== 'none') copie.appendChild(M.figer.figerArbre(sec));
    });
    return copie;
  }

  /** Dessine l'image courante de #pm-scene dans ctx. -> Promise */
  M.capturer = function (ctx, largeur, hauteur) {
    var avant = M.particules && M.particules.preparerCapture ? M.particules.preparerCapture() : Promise.resolve();
    return avant.then(function () { return dessiner(ctx, largeur, hauteur); });
  };

  function dessiner(ctx, largeur, hauteur) {
    var copie = copierScene();
    copie.setAttribute('xmlns', XHTML);
    var xml = new XMLSerializer().serializeToString(copie);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + largeur + '" height="' + hauteur + '">' +
      '<foreignObject x="0" y="0" width="' + largeur + '" height="' + hauteur + '">' +
      '<style xmlns="' + XHTML + '">' + M.figer.reglesPolices() + '</style>' + xml +
      '</foreignObject></svg>';
    var img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img.decode().then(function () {
      ctx.clearRect(0, 0, largeur, hauteur);
      ctx.drawImage(img, 0, 0, largeur, hauteur);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
