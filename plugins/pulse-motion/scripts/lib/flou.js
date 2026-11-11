/* Pulse Motion – données personnelles à flouter au tournage (spec S6, 5.6). Module pur : chargé par Node (require) et posé
 * tel quel dans la page filmée, avant le script du monde isolé (globalThis.__pmFlou), pour que la page et film.json
 * reconnaissent les mêmes choses.
 *
 * CATEGORIES : courriel, telephone, iban, carte, secu (textes reconnus) ; mot-de-passe, adresse, naissance (champs de
 *   formulaire seulement). Un mot de passe est toujours flouté, même sans flou automatique.
 * trouverTextes(texte, actives?) -> [{ debut, fin, categorie }] : plages reconnues (carte : 13 à 19 chiffres validés par
 *   Luhn ; téléphone français ; IBAN : code pays, clé et au moins 11 caractères ; numéro de sécurité sociale).
 * categorieChamp({ type, autocomplete }) -> catégorie d'un champ de formulaire, ou null.
 * luhn(chiffres) -> booléen.
 * masquerTexte(texte, actives?) -> texte, chaque plage reconnue remplacée par « ••• » (ce qui entre dans film.json).
 * lireFlou(flou) -> { auto, mode, cibles, actives } : réglage du parcours, avec ses défauts (auto, mode « flou »).
 * erreursFlou(flou, erreurCible) -> [messages] : validation du champ « flou » de parcours.json.
 * Écrit pour Pulse Motion.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.__pmFlou = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TEXTES = ['courriel', 'telephone', 'iban', 'carte', 'secu'];
  var CHAMPS = ['mot-de-passe', 'adresse', 'naissance'];
  var CATEGORIES = TEXTES.concat(CHAMPS);
  var MODES = ['flou', 'masque'];

  // Motifs (drapeau g). Les bornes évitent de couper un nombre plus long.
  var MOTIFS = {
    courriel: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    telephone: /(?<![\dA-Za-z])(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g,
    iban: /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}(?![A-Za-z0-9])/g,
    carte: /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g,
    secu: /(?<![\dA-Za-z])[12][ ]?\d{2}[ ]?(?:0[1-9]|1[0-2]|[2-9]\d)[ ]?(?:\d{2}|2[AB])[ ]?\d{3}[ ]?\d{3}(?:[ ]?\d{2})?(?![\d])/g,
  };

  function luhn(chiffres) {
    var s = String(chiffres || '').replace(/\D/g, '');
    if (s.length < 13 || s.length > 19) return false;
    var somme = 0;
    for (var i = 0; i < s.length; i++) {
      var d = s.charCodeAt(s.length - 1 - i) - 48;
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      somme += d;
    }
    return somme % 10 === 0;
  }

  function trouverTextes(texte, actives) {
    var t = String(texte || '');
    var plages = [];
    if (!t || !/[\d@]/.test(t)) return plages;
    TEXTES.forEach(function (c) {
      if (actives && !actives[c]) return;
      var motif = MOTIFS[c];
      motif.lastIndex = 0;
      var m;
      while ((m = motif.exec(t))) {
        var brut = m[0].replace(/[ .-]+$/, '');
        if (c === 'carte' && !luhn(brut)) { motif.lastIndex = m.index + 1; continue; }
        if (c === 'iban' && brut.replace(/ /g, '').length > 34) continue;
        plages.push({ debut: m.index, fin: m.index + brut.length, categorie: c });
      }
    });
    plages.sort(function (a, b) { return a.debut - b.debut || b.fin - a.fin; });
    return plages;
  }

  function categorieChamp(champ) {
    var type = String((champ && champ.type) || '').toLowerCase();
    var ac = String((champ && champ.autocomplete) || '').toLowerCase().split(/\s+/);
    var a = function (re) { return ac.some(function (x) { return re.test(x); }); };
    if (type === 'password' || a(/^(current|new)-password$/)) return 'mot-de-passe';
    if (type === 'email' || a(/^email$/)) return 'courriel';
    if (type === 'tel' || a(/^tel(-|$)/)) return 'telephone';
    if (a(/^cc-/)) return 'carte';
    if (a(/^(street-address|address-line\d|postal-code)$/)) return 'adresse';
    if (a(/^bday/)) return 'naissance';
    return null;
  }

  function lireFlou(flou) {
    var f = flou && typeof flou === 'object' ? flou : {};
    var auto = f.auto !== false;
    var actives = {};
    CATEGORIES.forEach(function (c) { actives[c] = auto && !(f.categories && f.categories[c] === false); });
    actives['mot-de-passe'] = true;
    return { auto: auto, mode: f.mode === 'masque' ? 'masque' : 'flou', cibles: Array.isArray(f.cibles) ? f.cibles.slice() : [], actives: actives };
  }

  function masquerTexte(texte, actives) {
    var t = String(texte === undefined || texte === null ? '' : texte);
    var plages = trouverTextes(t, actives);
    if (!plages.length) return t;
    var r = '';
    var i = 0;
    plages.forEach(function (p) {
      if (p.debut < i) return;
      r += t.slice(i, p.debut) + '•••';
      i = p.fin;
    });
    return r + t.slice(i);
  }

  function erreursFlou(f, erreurCible) {
    var err = [];
    if (f === undefined) return err;
    if (!f || typeof f !== 'object' || Array.isArray(f)) return ['« flou » : un objet { "auto", "mode", "cibles", "categories" }.'];
    var inconnus = Object.keys(f).filter(function (k) { return ['auto', 'mode', 'cibles', 'categories'].indexOf(k) < 0; });
    if (inconnus.length) err.push('« flou » : champ' + (inconnus.length > 1 ? 's' : '') + ' ' + inconnus.map(function (k) { return '« ' + k + ' »'; }).join(', ') + ' inconnu' + (inconnus.length > 1 ? 's' : '') + ' (auto, mode, cibles, categories).');
    if (f.auto !== undefined && typeof f.auto !== 'boolean') err.push('« flou.auto » : true (recommandé) ou false.');
    if (f.mode !== undefined && MODES.indexOf(f.mode) < 0) err.push('« flou.mode » : « flou » (défaut) ou « masque » (pastille grise opaque).');
    if (f.cibles !== undefined) {
      if (!Array.isArray(f.cibles)) err.push('« flou.cibles » : une liste de cibles (texte, { "texte", "rang", "dans" }, { "selecteur" }, { "point" } ou { "colonne" }).');
      else f.cibles.forEach(function (c, i) {
        if (c && typeof c === 'object' && !Array.isArray(c) && c.colonne !== undefined) {
          if (Object.keys(c).length !== 1 || typeof c.colonne !== 'string' || !c.colonne.trim()) err.push('« flou.cibles » ' + (i + 1) + ' : { "colonne": "<titre de la colonne>" } seul.');
          return;
        }
        var m = erreurCible ? erreurCible(c) : null;
        if (m) err.push('« flou.cibles » ' + (i + 1) + ' : ' + m + '.');
      });
    }
    if (f.categories !== undefined) {
      if (!f.categories || typeof f.categories !== 'object' || Array.isArray(f.categories)) err.push('« flou.categories » : { "<catégorie>": false } pour ne pas flouter une catégorie (' + CATEGORIES.join(', ') + ').');
      else Object.keys(f.categories).forEach(function (k) {
        if (CATEGORIES.indexOf(k) < 0) err.push('« flou.categories » : catégorie « ' + k + ' » inconnue (' + CATEGORIES.join(', ') + ').');
        else if (typeof f.categories[k] !== 'boolean') err.push('« flou.categories.' + k + ' » : true ou false.');
        else if (k === 'mot-de-passe' && f.categories[k] === false) err.push('« flou.categories » : un mot de passe est toujours flouté.');
      });
    }
    return err;
  }

  return { CATEGORIES: CATEGORIES, TEXTES: TEXTES, CHAMPS: CHAMPS, MODES: MODES, MOTIFS: MOTIFS, luhn: luhn, trouverTextes: trouverTextes,
    categorieChamp: categorieChamp, lireFlou: lireFlou, masquerTexte: masquerTexte, erreursFlou: erreursFlou };
});
