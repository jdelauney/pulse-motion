/* Pulse Motion – shaders WGSL : fichiers, réglages, assemblage du code (module pur).
 *
 * Un shader = shaders/<nom>.wgsl (code) + shaders/<nom>.json ({ version: 1, nom, usage, description, parametres, debord? }),
 * dans le projet ou dans la bibliothèque du plugin. usage : fond (fonds et auras), transition, post, module-force,
 * module-couleur, module-forme ; chacun a sa fonction attendue (FONCTIONS).
 *
 * validerShader(nom, json, code) -> [{ regle, message }]   shader-invalide, shader-trop-gros, liaison-reservee,
 *                                    fonction-absente, nom-reserve, reglage-inconnu
 * valeursShader(json, reglages, charte) -> { valeurs, erreurs }  réglages (texte « a: 1; b: accent » ou objet) :
 *                                    nombre, ou couleur RVBA linéaire [r, v, b, a] ; erreurs : [{ chemin, message }]
 * reglagesEnTexte(objet | texte) -> texte
 * sansCommentaires(code) -> texte    commentaires remplacés par des espaces (positions et lignes gardées)
 * octets(texte) -> taille en UTF-8
 *
 * Module pur : chargé tel quel dans la page (global M.codeShader) et par Node (require). Dans la page, recette.js
 * (M.recette) n'est chargé que par l'atelier : il est cherché à l'appel des fonctions qui en ont besoin.
 */
(function (racine, fabrique) {
  var noeud = typeof require === 'function' && typeof module === 'object';
  var R = noeud ? require('../particules/recette.js') : null;
  var api = fabrique(function () { return R || (racine.M && racine.M.recette); });
  if (noeud && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.codeShader = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (recette) {
  'use strict';

  var USAGES = ['fond', 'transition', 'post', 'module-force', 'module-couleur', 'module-forme'];
  var TAILLE_MAX = 65536;
  var CHAMPS = ['version', 'nom', 'usage', 'description', 'parametres', 'debord'];
  var DEBORD_MAX = 50;
  // Charte de contrôle : les couleurs de la charte par défaut d'un réglage se résolvent sans projet.
  var CHARTE_CONTROLE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };

  var V2 = 'vec2(?:f|<f32>)';
  var V4 = 'vec4(?:f|<f32>)';
  var ID = '[A-Za-z_][A-Za-z0-9_]*';
  function signature(nom, args, retour) {
    return new RegExp('\\bfn\\s+' + nom + '\\s*\\(\\s*' + args.map(function (t) { return ID + '\\s*:\\s*' + t; }).join('\\s*,\\s*') +
      '\\s*,?\\s*\\)\\s*->\\s*' + retour);
  }
  var FONCTIONS = {
    fond: { nom: 'image', texte: 'fn image(coord: vec2f) -> vec4f', motif: signature('image', [V2], V4) },
    transition: { nom: 'transition', texte: 'fn transition(coord: vec2f, progres: f32) -> vec4f', motif: signature('transition', [V2, 'f32'], V4) },
    post: { nom: 'post', texte: 'fn post(coord: vec2f) -> vec4f', motif: signature('post', [V2], V4) },
    'module-force': { nom: 'force', texte: 'fn force(p: Particule, t: f32, zone: vec4f) -> vec2f', motif: signature('force', ['Particule', 'f32', V4], V2) },
    'module-couleur': { nom: 'couleur', texte: 'fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f', motif: signature('couleur', ['Particule', 'f32', V4], V4) },
    'module-forme': { nom: 'forme', texte: 'fn forme(uv: vec2f, p: Particule) -> f32', motif: signature('forme', [V2, 'Particule'], 'f32') },
  };
  var RESERVES = /\b(?:fn|var|const|struct|alias|override)\s+(pm[A-Za-z0-9_]*|PM[A-Za-z0-9_]*|iTime|iProgres|iResolution|iChannel[0-3]|iEchantillon|iRepete|R|canal[0-3])\b/;
  var REFS_R = /(^|[^.A-Za-z0-9_])R\.([A-Za-z_][A-Za-z0-9_]*)/g;

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /** Commentaires (// et blocs, imbriqués) remplacés par des espaces : positions et retours à la ligne gardés. */
  function sansCommentaires(code) {
    var s = String(code);
    var r = '';
    var i = 0;
    var bloc = 0;
    while (i < s.length) {
      var c = s[i];
      var d = s[i + 1];
      if (bloc) {
        if (c === '/' && d === '*') { bloc++; r += '  '; i += 2; continue; }
        if (c === '*' && d === '/') { bloc--; r += '  '; i += 2; continue; }
        r += c === '\n' ? '\n' : ' ';
        i++;
        continue;
      }
      if (c === '/' && d === '*') { bloc = 1; r += '  '; i += 2; continue; }
      if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') { r += ' '; i++; } continue; }
      r += c;
      i++;
    }
    return r;
  }

  /** Taille en octets UTF-8. */
  function octets(texte) {
    var s = String(texte);
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
    }
    return n;
  }

  function invalidePour(nom) {
    return function (chemin, message) {
      return recette().ErreurRecette('shader-invalide', 'Shader « ' + nom + ' »' + (chemin ? ', ' + chemin : '') + ' : ' + message + '.', chemin || '');
    };
  }

  /** Contrôle des fichiers d'un shader (sans GPU). -> [{ regle, message }] */
  function validerShader(nom, json, code) {
    var err = [];
    function e(regle, m) { err.push({ regle: regle, message: 'Shader « ' + nom + ' » : ' + m + '.' }); }
    if (!estObjet(json)) { e('shader-invalide', 'le fichier .json doit contenir un objet JSON'); return err; }
    if (json.version !== 1) e('shader-invalide', '« version » doit valoir 1');
    if (json.nom !== undefined && json.nom !== nom) e('shader-invalide', '« nom » (« ' + json.nom + ' ») diffère du nom du fichier');
    if (USAGES.indexOf(json.usage) < 0) e('shader-invalide', '« usage » doit être l\'un de : ' + USAGES.join(', '));
    Object.keys(json).forEach(function (k) { if (CHAMPS.indexOf(k) < 0) e('shader-invalide', 'champ « ' + k + ' » inconnu (champs : ' + CHAMPS.join(', ') + ')'); });
    if (json.debord !== undefined && !(typeof json.debord === 'number' && json.debord >= 0 && json.debord <= DEBORD_MAX)) {
      e('shader-invalide', '« debord » doit être un nombre de cqh entre 0 et ' + DEBORD_MAX);
    }
    var params = json.parametres === undefined ? {} : json.parametres;
    if (!estObjet(params)) e('shader-invalide', '« parametres » doit être un objet');
    else {
      Object.keys(params).forEach(function (k) { if (/^pm/.test(k)) e('nom-reserve', 'le réglage « ' + k + ' » commence par « pm », réservé au moteur'); });
      try { recette().valeursParametres({ nom: nom, parametres: params }, {}, CHARTE_CONTROLE, invalidePour(nom)); } catch (x) {
        if (!x.regle) throw x;
        err.push({ regle: 'shader-invalide', message: x.message });
      }
    }
    if (typeof code !== 'string') { e('shader-invalide', 'fichier .wgsl illisible'); return err; }
    if (octets(code) > TAILLE_MAX) { e('shader-trop-gros', 'le code fait ' + octets(code) + ' octets, au-delà de ' + TAILLE_MAX + ' (64 Ko)'); return err; }
    var nu = sansCommentaires(code);
    if (/@\s*(?:group|binding)\s*\(/.test(nu)) e('liaison-reservee', '@group et @binding sont réservés au moteur : lire les images avec canal0(uv)… canal3(uv) et les réglages avec R.<nom>');
    var f = FONCTIONS[json.usage];
    if (f && !f.motif.test(nu)) e('fonction-absente', 'fonction attendue absente : « ' + f.texte + ' »');
    var r = RESERVES.exec(nu);
    if (r) e('nom-reserve', '« ' + r[1] + ' » est un nom réservé au moteur : en choisir un autre');
    if (estObjet(params)) {
      var vus = {};
      var m;
      REFS_R.lastIndex = 0;
      while ((m = REFS_R.exec(nu))) {
        if (!Object.prototype.hasOwnProperty.call(params, m[2]) && !vus[m[2]]) {
          vus[m[2]] = true;
          e('reglage-inconnu', 'R.' + m[2] + ' n\'est pas un réglage de « parametres » (réglages : ' + (Object.keys(params).join(', ') || 'aucun') + ')');
        }
      }
    }
    return err;
  }

  /** { vitesse: 0.5, couleur: 'accent' } -> « vitesse: 0.5; couleur: accent » ; un texte est rendu tel quel. */
  function reglagesEnTexte(o) {
    if (o === undefined || o === null) return '';
    if (typeof o === 'string') return o;
    return Object.keys(o).map(function (k) { return k + ': ' + o[k]; }).join('; ');
  }

  /** Valeurs des réglages d'un shader : défauts du .json, puis réglages donnés (texte ou objet). */
  function valeursShader(json, reglages, charte) {
    var Rr = recette();
    var erreurs = [];
    var lu = Rr.analyserReglages(reglagesEnTexte(reglages));
    lu.erreurs.forEach(function (m) { erreurs.push({ chemin: 'reglages', message: 'Shader « ' + json.nom + ' » : ' + m + '.' }); });
    var vp;
    try {
      vp = Rr.valeursParametres({ nom: json.nom, parametres: json.parametres || {} }, lu.valeurs, charte || {}, invalidePour(json.nom));
    } catch (x) {
      if (!x.regle) throw x;
      erreurs.push({ chemin: x.chemin || '', message: x.message });
      return { valeurs: {}, erreurs: erreurs };
    }
    vp.erreurs.forEach(function (x) {
      erreurs.push({ chemin: x.chemin, message: 'Shader « ' + json.nom + ' » : ' + x.message.replace('de l\'effet', 'du shader') });
    });
    var valeurs = {};
    Object.keys(vp.nombres).forEach(function (k) { valeurs[k] = vp.nombres[k]; });
    Object.keys(vp.couleurs).forEach(function (k) { valeurs[k] = Rr.couleurLineaire(vp.couleurs[k], {}); });
    return { valeurs: valeurs, erreurs: erreurs };
  }

  return {
    USAGES: USAGES,
    FONCTIONS: FONCTIONS,
    TAILLE_MAX: TAILLE_MAX,
    sansCommentaires: sansCommentaires,
    octets: octets,
    validerShader: validerShader,
    reglagesEnTexte: reglagesEnTexte,
    valeursShader: valeursShader,
  };
});
