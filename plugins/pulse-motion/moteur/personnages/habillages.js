/* Pulse Motion – registre des habillages des personnages (spec S11, 5.1 point 4) : la source unique de leur liste.
 * La scène (moteur/personnages/scene.js), la validation (scripts/lib/personnages-scene.js), l'assemblage (un groupe
 * « habillage-<nom> » du moteur par habillage, inclus seulement si une scène s'en sert : scripts/lib/groupes-moteur.js) et
 * l'atelier des personnages la lisent ici. Ajouter un habillage : son module et une entrée ici.
 *
 *   M.habillages.pieces.creer(g, dessin, gabarit, options)  -> { groupe, rendre(r, contexte?), main(cote) }
 *   (contexte : { temps, ebullition } passé par la scène ; les pièces et les bâtonnets l'ignorent.)
 *
 * Chaque entrée :
 *   creer(g, dessin, gabarit, options)  options.apparence : le réglage du dessin que l'habillage demande (voir reglage) ;
 *   fichier     son module, relatif à moteur/ ;
 *   libelle     son nom pour la personne (atelier) ;
 *   parDefaut   l'habillage d'un dessin sans data-habillage (un seul) ;
 *   sansDessin  un personnage de ce nom se dessine sans dessin, sur un gabarit (data-personnage="batonnets") ;
 *   reglage     le réglage du dessin dont il a besoin pour l'habiller (dessin.batonnets : couleurs et épaisseur) ;
 *   miroir      il dessine le visage en miroir quand le personnage regarde à gauche (regard des interactions) ;
 *   maniere     les dessins de cette manière (dessin.maniere) prennent cet habillage, et lui seul ; il n'habille qu'eux ;
 *   modules     autres modules du moteur dont il a besoin (planche et atelier), groupes : leurs groupes (assemblage) ;
 *   fondClair   il se dessine à l'encre sur papier : planche et atelier sur fond de papier.
 * Les modules d'habillage sont lus au moment de creer (M.pieces, M.batonnets, M.plume) : l'ordre de chargement ne compte pas.
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
    },
    // Trait de plume (spec S11, 5.6) : dessins de la manière « plume » ; tremblé tiré par main-levee.js.
    plume: {
      fichier: 'habillage-plume.js', libelle: 'plume', maniere: 'plume', modules: ['dessin/main-levee.js'], groupes: ['main-levee'], fondClair: true,
      creer: function (g, dessin, gabarit, options) { return moteur().plume.creer(g, dessin, gabarit, options); }
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
  /** Autres modules du moteur (modules) ou groupes (groupes) dont ont besoin les habillages nommés (tous sans liste), sans doublon. */
  function besoins(cle, noms) {
    var r = [];
    NOMS.forEach(function (n) { if (!noms || noms.indexOf(n) >= 0) (habillages[n][cle] || []).forEach(function (m) { if (r.indexOf(m) < 0) r.push(m); }); });
    return r;
  }
  /** Habillage d'un dessin sans data-habillage : celui de sa manière, sinon l'habillage par défaut. */
  function habillageDe(dessin) {
    var m = dessin && dessin.maniere;
    return NOMS.filter(function (n) { return m && habillages[n].maniere === m; })[0] || DEFAUT;
  }
  /** Raison du refus de l'habillage nom pour ce dessin (texte), ou null s'il peut l'habiller (hors réglage demandé). */
  function refus(nom, dessin) {
    var propre = habillageDe(dessin), h = habillages[nom];
    if (h.maniere && h.maniere !== (dessin && dessin.maniere)) return 'l\'habillage ' + h.libelle + ' ne dessine que les dessins de la manière « ' + h.maniere + ' »';
    if (habillages[propre].maniere && nom !== propre) return 'un dessin de la manière « ' + habillages[propre].maniere + ' » se dessine seulement en ' + habillages[propre].libelle;
    return null;
  }

  return { habillages: habillages, NOMS: NOMS, DEFAUT: DEFAUT, connu: connu, sansDessin: sansDessin, fichiers: fichiers, besoins: besoins, habillageDe: habillageDe, refus: refus };
});
