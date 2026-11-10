/* Pulse Motion – cadre de téléphone autour d'une vidéo verticale (spec Rendu et export, 5.15).
 *
 * Dessin générique, sans marque ni forme reconnaissable : corps arrondi (rayon 9 % de sa largeur), bord de 2,5 %, pastille
 * de caméra dans le bord du haut ; corps #111, fond égal au fond de la charte. L'écran occupe 86 % de la hauteur de sortie
 * et montre la scène (1080 × 1920) à l'échelle exacte k. Idée : mode « phone » de rossark (MIT) ; dimensions réécrites.
 * S6 reprend ce dessin pour ses cadres dans les scènes.
 *
 * FORMATS : { '16:9': [1920, 1080], '1:1': [1080, 1080] }
 * geometrie({ sortie: [L, H], scene: [l, h] }) -> { largeur, hauteur, echelle, ecran: { x, y, largeur, hauteur, rayon },
 *   corps: { x, y, largeur, hauteur, rayon }, pastille: { x, y, rayon } } (pixels de sortie)
 * svg(geometrie, { fond, corps }) -> SVG du cadre (fond plein, corps, pastille), à dessiner sous l'écran.
 *
 * Module pur : chargé par Node (capture fidèle) et par l'aperçu (/_pm/cadres/telephone.js, export du navigateur, global
 * M.cadreTelephone). Jamais dans la page livrée.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.cadreTelephone = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FORMATS = { '16:9': [1920, 1080], '1:1': [1080, 1080] };
  var PART_ECRAN = 0.86;
  var BORD = 0.025;
  var RAYON = 0.09;
  var CORPS = '#111111';

  function geometrie(o) {
    var L = o.sortie[0];
    var H = o.sortie[1];
    var l = (o.scene && o.scene[0]) || 1080;
    var h = (o.scene && o.scene[1]) || 1920;
    var ecranH = PART_ECRAN * H;
    var k = ecranH / h;
    var ecranL = l * k;
    var corpsL = ecranL / (1 - 2 * BORD);
    var bord = BORD * corpsL;
    var corpsH = ecranH + 2 * bord;
    var x0 = (L - corpsL) / 2;
    var y0 = (H - corpsH) / 2;
    var rayon = RAYON * corpsL;
    return {
      largeur: L, hauteur: H, echelle: k,
      corps: { x: x0, y: y0, largeur: corpsL, hauteur: corpsH, rayon: rayon },
      ecran: { x: x0 + bord, y: y0 + bord, largeur: ecranL, hauteur: ecranH, rayon: Math.max(0, rayon - bord) },
      pastille: { x: L / 2, y: y0 + bord / 2, rayon: bord * 0.3 },
    };
  }

  var arrondi = function (x) { return Math.round(x * 1000) / 1000; };

  function svg(g, o) {
    var fond = (o && o.fond) || '#ffffff';
    var corps = (o && o.corps) || CORPS;
    var c = g.corps;
    var p = g.pastille;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + g.largeur + '" height="' + g.hauteur + '" viewBox="0 0 ' + g.largeur + ' ' + g.hauteur + '">'
      + '<rect width="' + g.largeur + '" height="' + g.hauteur + '" fill="' + fond + '"/>'
      + '<rect x="' + arrondi(c.x) + '" y="' + arrondi(c.y) + '" width="' + arrondi(c.largeur) + '" height="' + arrondi(c.hauteur) + '" rx="' + arrondi(c.rayon) + '" fill="' + corps + '"/>'
      + '<circle cx="' + arrondi(p.x) + '" cy="' + arrondi(p.y) + '" r="' + arrondi(p.rayon) + '" fill="#2a2a2a"/>'
      + '</svg>';
  }

  return { FORMATS: FORMATS, geometrie: geometrie, svg: svg, PART_ECRAN: PART_ECRAN };
});
