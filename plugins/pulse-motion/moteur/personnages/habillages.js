/* Pulse Motion – registre des habillages des personnages (spec S11, 5.1 point 4) : la source unique de leur liste.
 * La scène (moteur/personnages/scene.js), la validation (scripts/lib/personnages-scene.js), l'assemblage (un groupe
 * « habillage-<nom> » du moteur par habillage, inclus seulement si une scène s'en sert : scripts/lib/groupes-moteur.js) et
 * l'atelier des personnages la lisent ici. Ajouter un habillage : son module et une entrée ici.
 *
 *   M.habillages.pieces.creer(g, dessin, gabarit, options)  -> { groupe, rendre(r), main(cote) }
 *
 * Chaque entrée :
 *   creer(g, dessin, gabarit, options)  options.apparence : le réglage du dessin que l'habillage demande (voir reglage) ;
 *   fichier     son module, relatif à moteur/ ;
 *   libelle     son nom pour la personne (atelier) ;
 *   parDefaut   l'habillage d'un dessin sans data-habillage (un seul) ;
 *   sansDessin  un personnage de ce nom se dessine sans dessin, sur un gabarit (data-personnage="batonnets") ;
 *   reglage     le réglage du dessin dont il a besoin pour l'habiller (dessin.batonnets : couleurs et épaisseur) ;
 *   miroir      il dessine le visage en miroir quand le personnage regarde à gauche (regard des interactions).
 * Les modules d'habillage sont lus au moment de creer (M.pieces, M.batonnets) : l'ordre de chargement ne compte pas.
 */
(function (racine, fabrique) {
  var api = fabrique(function () { return racine.M || {}; });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.habillages = api.habillages; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (moteur) {
  'use strict';

  var habillages = {
    pieces: {
      fichier: 'habillage-pieces.js', libelle: 'pièces', parDefaut: true, miroir: true,
      creer: function (g, dessin, gabarit) { return moteur().pieces.creer(g, dessin, gabarit); }
    },
    batonnets: {
      fichier: 'habillage-batonnets.js', libelle: 'bâtonnets', sansDessin: true, reglage: 'batonnets',
      creer: function (g, dessin, gabarit, options) { return moteur().batonnets.creer(g, (options && options.apparence) || undefined); }
    }
  };

  var NOMS = Object.keys(habillages);
  var DEFAUT = NOMS.filter(function (n) { return habillages[n].parDefaut; })[0];

  /** Habillage connu du registre. */
  function connu(nom) { return Object.prototype.hasOwnProperty.call(habillages, nom); }
  /** Noms des personnages qui se dessinent sans dessin (« batonnets »). */
  function sansDessin() { return NOMS.filter(function (n) { return habillages[n].sansDessin; }); }
  /** Modules des habillages nommés (tous sans liste), dans l'ordre du registre. */
  function fichiers(noms) { return NOMS.filter(function (n) { return !noms || noms.indexOf(n) >= 0; }).map(function (n) { return habillages[n].fichier; }); }

  return { habillages: habillages, NOMS: NOMS, DEFAUT: DEFAUT, connu: connu, sansDessin: sansDessin, fichiers: fichiers };
});
