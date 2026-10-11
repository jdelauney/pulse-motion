/* Pulse Motion – recettes d'effets de particules : héritage, réglages, couleurs, compilation.
 *
 * resoudre(nom, charger)   applique « etend » (fusion profonde, émetteurs fusionnés par nom)
 * analyserReglages(texte)  "nombre: 3000; couleur: accent" -> { valeurs, erreurs }
 * compiler(recette, o)     recette -> paramètres numériques pour le GPU (cqh, s de τ, radians,
 *                          RVB linéaire, tables de 64 valeurs, capacités)
 *
 * Module pur : chargé tel quel dans la page (global M.recette) et par Node (require).
 */
(function (racine, fabrique) {
  var noeud = typeof require === 'function' && typeof module === 'object';
  var C = noeud ? require('../courbes.js') : racine.M;
  var X = noeud ? require('./expression.js') : racine.M.expression;
  var api = fabrique(C, X);
  if (noeud && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.recette = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, X) {
  'use strict';

  var PAS = 1 / 120;
  var TAILLE_TABLE = 64;
  var PROFONDEUR_MAX = 2;
  var FORCES_MAX = 8;
  var TRAINEE_MAX = 16;
  var CODES = {
    forme: { point: 0, cercle: 1, anneau: 2, rectangle: 3, ligne: 4, ancre: 5 },
    force: { gravite: 0, trainee: 1, vent: 2, turbulence: 3, attracteur: 4, vortex: 5, rappel: 6 },
    rendu: { sprite: 0, etincelle: 1, trainee: 2, planche: 3 },
    melange: { additif: 0, alpha: 1, premultiplie: 2 },
    texture: { 'disque-doux': 0, etoile: 1, fumee: 2, flamme: 3, eclat: 4, confetti: 5, image: 6 },
  };
  var COULEURS_CHARTE = ['primaire', 'accent', 'texte', 'fond'];
  var HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  function ErreurRecette(regle, message) {
    var e = new Error(message);
    e.name = 'ErreurRecette';
    e.regle = regle;
    return e;
  }

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cloner(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  // ---- Héritage ----

  function fusionnerEmetteurs(base, ajout) {
    var r = cloner(base);
    ajout.forEach(function (e) {
      var i = -1;
      r.forEach(function (b, j) { if (estObjet(b) && estObjet(e) && b.nom === e.nom) i = j; });
      if (i >= 0) r[i] = fusionner(r[i], e);
      else r.push(cloner(e));
    });
    return r;
  }

  /** Fusion profonde : objets fusionnés, tableaux et valeurs remplacés ; emetteurs fusionnés par nom. */
  function fusionner(base, ajout) {
    if (!estObjet(base) || !estObjet(ajout)) return cloner(ajout);
    var r = cloner(base);
    Object.keys(ajout).forEach(function (k) {
      if (k === 'emetteurs' && Array.isArray(r.emetteurs) && Array.isArray(ajout.emetteurs)) r.emetteurs = fusionnerEmetteurs(r.emetteurs, ajout.emetteurs);
      else if (estObjet(r[k]) && estObjet(ajout[k])) r[k] = fusionner(r[k], ajout[k]);
      else r[k] = cloner(ajout[k]);
    });
    return r;
  }

  /** resoudre(nom, charger) -> recette complète ; charger(nom) -> objet JSON | null. */
  function resoudre(nom, charger) {
    var chaine = [];
    function charge(n) {
      if (chaine.indexOf(n) >= 0) {
        throw ErreurRecette('effet-invalide', 'Effet « ' + nom + ' » : héritage circulaire (' + chaine.concat(n).join(' → ') + ').');
      }
      chaine.push(n);
      var r = charger(n);
      if (!estObjet(r)) {
        if (chaine.length === 1) throw ErreurRecette('effet-inconnu', 'Effet « ' + n + ' » introuvable (ni dans effets/ du projet, ni dans la bibliothèque).');
        throw ErreurRecette('effet-invalide', 'Effet « ' + nom + ' » : « etend » vise « ' + n + ' », introuvable.');
      }
      if (r.etend !== undefined && r.etend !== null) {
        if (typeof r.etend !== 'string') throw ErreurRecette('effet-invalide', 'Effet « ' + n + ' » : « etend » doit être un nom d\'effet.');
        return fusionner(charge(r.etend), r);
      }
      return cloner(r);
    }
    var recette = charge(nom);
    recette.nom = nom;
    recette.etend = null;
    return recette;
  }

  // ---- Réglages et couleurs ----

  /** "nombre: 3000; couleur: accent" -> { valeurs: { nombre: '3000', couleur: 'accent' }, erreurs: [message] } */
  function analyserReglages(texte) {
    var valeurs = {};
    var erreurs = [];
    String(texte || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (clause) {
      var m = /^([a-z_][a-z0-9_]*)\s*:\s*(\S(?:.*\S)?)$/.exec(clause);
      if (!m) erreurs.push('réglage « ' + clause + ' » illisible (attendu « nom: valeur »)');
      else valeurs[m[1]] = m[2];
    });
    return { valeurs: valeurs, erreurs: erreurs };
  }

  function hexVersRVBA(hex) {
    var h = hex.slice(1);
    if (h.length <= 4) h = h.split('').map(function (c) { return c + c; }).join('');
    if (h.length === 6) h += 'ff';
    return [0, 2, 4, 6].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
  }

  function versLineaire(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  /** Texte -> hex, via les paramètres de type couleur puis la charte. */
  function resoudreCouleur(texte, ctx) {
    var t = String(texte).trim();
    if (HEX.test(t)) return t;
    if (ctx.couleurs && Object.prototype.hasOwnProperty.call(ctx.couleurs, t)) return resoudreCouleur(ctx.couleurs[t], { charte: ctx.charte });
    if (COULEURS_CHARTE.indexOf(t) >= 0 && ctx.charte && HEX.test(String(ctx.charte[t] || ''))) return ctx.charte[t];
    throw new Error('couleur « ' + t + ' » inconnue (hex comme #ffb347, ou ' + COULEURS_CHARTE.join(', ') + ')');
  }

  /** couleurLineaire('#ff8800', { couleurs, charte }) -> [r, g, b, a] (RVB linéaire, alpha inchangé) */
  function couleurLineaire(texte, ctx) {
    var c = hexVersRVBA(resoudreCouleur(texte, ctx || {}));
    return [versLineaire(c[0]), versLineaire(c[1]), versLineaire(c[2]), c[3]];
  }

  return {
    CODES: CODES,
    PAS: PAS,
    TAILLE_TABLE: TAILLE_TABLE,
    PROFONDEUR_MAX: PROFONDEUR_MAX,
    FORCES_MAX: FORCES_MAX,
    TRAINEE_MAX: TRAINEE_MAX,
    ErreurRecette: ErreurRecette,
    resoudre: resoudre,
    analyserReglages: analyserReglages,
    couleurLineaire: couleurLineaire,
  };
});
