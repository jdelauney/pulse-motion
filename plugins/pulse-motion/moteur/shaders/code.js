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
 * dispositionReglages(parametres) -> { wgsl, taille, champs }   struct « Reglages » (uniforme) : f32 ou vec4f (couleur)
 * ecrireReglages(disposition, valeurs) -> Float32Array           contenu de l'uniforme des réglages
 * ecrireEntrees(o) -> ArrayBuffer (OCTETS_ENTREES)               uniforme « PmEntrees » (iTime, iProgres, iResolution…)
 * assemblerShader({ code, usage, disposition, prelude }) -> { wgsl, ligneCode, lignesCode }
 *   fond, transition, post : prélude (particules) + OUTILS + entrées + code de la personne (tel quel) + enveloppe
 *   (sommets pmSommets, fragment pmImage) ; ligneCode : nombre de lignes avant le code.
 * situer(messages, assemblage) -> [{ ligne, colonne, message }]  erreurs de getCompilationInfo ramenées au fichier .wgsl
 *   (ligne null : hors du code de la personne) ; messageErreur(nom, fichier, erreurs) -> texte du panneau
 * empreinte(texte) -> 8 chiffres hexadécimaux (FNV-1a 32 bits)
 * assemblerModule({ code, usage, nom, parametres, valeurs }) -> { nom, usage, wgsl, appel, empreinte, ligneCode, carte }
 *   module de particules (force, couleur, forme) : noms déclarés au niveau du module et R.x préfixés (pmForce_, pmCouleur_,
 *   pmForme_), réglages en constantes ; appel : nom de la fonction attendue préfixée ; carte : décalages de colonnes par ligne.
 * situerModule(messages, module, debut) -> erreurs dans le fichier du module (debut : lignes avant le module dans le noyau)
 * planComposition({ scenes, t, transitions, posts, postsVideo }) -> null | { couches, transition, postsVideo }
 *   composition à l'instant t : scènes visibles (ordre du document) à photographier, transition par shader en cours
 *   ({ sortante: id | null, entrante, progres, temps, duree }) ; null sans transition par shader ni post-traitement.
 * attacherModules(effet, charger, charte) -> [{ regle, message }]   em.modulesWGSL de chaque émetteur ; charger(nom) ->
 *   { json, code, erreurs } | null ; réglages d'un module : défauts, remplacés par ceux de la recette de même nom.
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

  // ---- Uniformes ----

  /** struct Reglages : un f32 par nombre, un vec4f par couleur, dans l'ordre de « parametres » ; taille multiple de 16. */
  function dispositionReglages(parametres) {
    var champs = [];
    var lignes = [];
    var o = 0;
    Object.keys(parametres || {}).forEach(function (nom) {
      var couleur = (parametres[nom] || {}).type === 'couleur';
      var align = couleur ? 16 : 4;
      o = Math.ceil(o / align) * align;
      champs.push({ nom: nom, type: couleur ? 'vec4f' : 'f32', decalage: o });
      lignes.push('  ' + nom + ': ' + (couleur ? 'vec4f' : 'f32') + ',');
      o += couleur ? 16 : 4;
    });
    // Une structure WGSL ne peut pas être vide.
    if (!champs.length) { lignes.push('  pm_vide: f32,'); o = 4; }
    return { wgsl: 'struct Reglages {\n' + lignes.join('\n') + '\n};\n', taille: Math.max(16, Math.ceil(o / 16) * 16), champs: champs };
  }

  function ecrireReglages(disposition, valeurs) {
    var f = new Float32Array(disposition.taille / 4);
    disposition.champs.forEach(function (c) {
      var v = valeurs ? valeurs[c.nom] : undefined;
      if (c.type === 'vec4f') f.set(Array.isArray(v) ? v : [0, 0, 0, 0], c.decalage / 4);
      else f[c.decalage / 4] = typeof v === 'number' ? v : 0;
    });
    return f;
  }

  var OCTETS_ENTREES = 80;
  var ENTREES = [
    'struct PmEntrees {',
    '  temps: f32, progres: f32, duree: f32, mode: u32,',
    '  resolution: vec4f,',
    '  scene: vec4f,',
    '  repere: vec4f,',
    '  demi: vec4f,',
    '};',
    '',
  ].join('\n');

  function ecrireEntrees(o) {
    var b = new ArrayBuffer(OCTETS_ENTREES);
    var f = new Float32Array(b);
    var u = new Uint32Array(b);
    f[0] = o.temps || 0;
    f[1] = o.progres || 0;
    f[2] = o.duree || 0;
    u[3] = o.mode || 0;
    f.set(o.resolution || [0, 0, 0, 0], 4);
    f.set(o.scene || [0, 0, 0, 0], 8);
    f.set(o.repere || [0, 0, 0, 0], 12);
    f.set(o.demi || [0, 0, 0, 0], 16);
    return b;
  }

  // ---- Prélude propre aux shaders (pcg, alea, bruit, curl : ceux des particules) ----

  var OUTILS = [
    '// Prélude des shaders (P6) : hasard 2D, bruit fractal, palettes, rotations, distances signées.',
    'fn alea2(p: vec2f) -> f32 {',
    '  let q = vec2u(vec2i(floor(p)) + vec2i(65536));',
    '  return f32(pcg(q.x ^ pcg(q.y)) >> 8u) / 16777216.0;',
    '}',
    '// Bruit fractal (5 octaves) du bruit de valeurs 3D, dans [-1, 1] environ.',
    'fn fbm(p: vec3f) -> f32 {',
    '  var s = 0.0;',
    '  var a = 0.5;',
    '  var q = p;',
    '  for (var i = 0; i < 5; i++) {',
    '    s += a * bruit(q);',
    '    q = q * 2.03 + vec3f(17.0, 31.0, 7.0);',
    '    a *= 0.5;',
    '  }',
    '  return s;',
    '}',
    '// Palette cosinus : a + b cos(2π (c t + d)).',
    'fn palette(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f { return a + b * cos(6.2831853 * (c * t + d)); }',
    'fn rot2(angle: f32) -> mat2x2f { let c = cos(angle); let s = sin(angle); return mat2x2f(c, s, -s, c); }',
    'fn sdCercle(p: vec2f, r: f32) -> f32 { return length(p) - r; }',
    'fn sdBoite(p: vec2f, demi: vec2f) -> f32 {',
    '  let d = abs(p) - demi;',
    '  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);',
    '}',
    'fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {',
    '  let pa = p - a;',
    '  let ba = b - a;',
    '  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
    '  return length(pa - ba * h);',
    '}',
    '// Étoile à n branches : rayon extérieur r, rayon des creux r × creux (distance approchée, négative dedans).',
    'fn sdEtoile(p: vec2f, r: f32, n: f32, creux: f32) -> f32 {',
    '  let secteur = 6.2831853 / n;',
    '  let b = abs(fract(atan2(p.y, p.x) / secteur + 0.5) - 0.5) * secteur;',
    '  let q = length(p) * vec2f(cos(b), sin(b));',
    '  let A = vec2f(r, 0.0);',
    '  let B = r * creux * vec2f(cos(secteur * 0.5), sin(secteur * 0.5));',
    '  let e = B - A;',
    '  let w = q - A;',
    '  let h = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);',
    '  let d = length(w - e * h);',
    '  return select(d, -d, e.x * w.y - e.y * w.x > 0.0);',
    '}',
    '',
  ].join('\n');

  // ---- Assemblage d'un shader complet (fond, transition, post) ----

  var LIAISONS = [
    '@group(0) @binding(0) var<uniform> PM: PmEntrees;',
    '@group(0) @binding(1) var<uniform> PM_R: Reglages;',
    '@group(0) @binding(2) var iChannel0: texture_2d<f32>;',
    '@group(0) @binding(3) var iChannel1: texture_2d<f32>;',
    '@group(0) @binding(4) var iChannel2: texture_2d<f32>;',
    '@group(0) @binding(5) var iChannel3: texture_2d<f32>;',
    '@group(0) @binding(6) var iEchantillon: sampler;',
    '@group(0) @binding(7) var iRepete: sampler;',
    'var<private> iTime: f32;',
    'var<private> iProgres: f32;',
    'var<private> iResolution: vec4f;',
    'var<private> R: Reglages;',
    'fn canal0(uv: vec2f) -> vec4f { return textureSampleLevel(iChannel0, iEchantillon, uv, 0.0); }',
    'fn canal1(uv: vec2f) -> vec4f { return textureSampleLevel(iChannel1, iEchantillon, uv, 0.0); }',
    'fn canal2(uv: vec2f) -> vec4f { return textureSampleLevel(iChannel2, iEchantillon, uv, 0.0); }',
    'fn canal3(uv: vec2f) -> vec4f { return textureSampleLevel(iChannel3, iRepete, uv, 0.0); }',
    '',
  ].join('\n');

  // Sommets : mode 1, triangle plein cadre (coord en cqh de l'image) ; mode 0, quad sur le repère d'un élément (boîte
  // agrandie du débord ; coord en cqh depuis le coin haut gauche de la boîte, négative dans le débord).
  var ENVELOPPE = [
    'struct PmSortie { @builtin(position) pos: vec4f, @location(0) coord: vec2f };',
    '',
    '@vertex',
    'fn pmSommets(@builtin(vertex_index) i: u32) -> PmSortie {',
    '  var o: PmSortie;',
    '  if (PM.mode == 1u) {',
    '    var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));',
    '    let c = p[i];',
    '    o.pos = vec4f(c, 0.0, 1.0);',
    '    o.coord = vec2f((c.x + 1.0) * 0.5 * PM.scene.x, (1.0 - c.y) * 0.5 * PM.scene.y);',
    '    return o;',
    '  }',
    '  var coins = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));',
    '  let d = PM.demi.xy + vec2f(PM.repere.w);',
    '  let l = coins[i] * d;',
    '  let a = PM.repere.z;',
    '  let w = PM.repere.xy + vec2f(cos(a) * l.x - sin(a) * l.y, sin(a) * l.x + cos(a) * l.y);',
    '  o.pos = vec4f(w.x / PM.scene.x * 2.0 - 1.0, 1.0 - w.y / PM.scene.y * 2.0, 0.0, 1.0);',
    '  o.coord = l + PM.demi.xy;',
    '  return o;',
    '}',
    '',
    '@fragment',
    'fn pmImage(e: PmSortie) -> @location(0) vec4f {',
    '  iTime = PM.temps;',
    '  iProgres = PM.progres;',
    '  iResolution = PM.resolution;',
    '  R = PM_R;',
    '  return /*APPEL*/;',
    '}',
    '',
  ].join('\n');

  var APPELS = { fond: 'image(e.coord)', transition: 'transition(e.coord, iProgres)', post: 'post(e.coord)' };

  function compterLignes(t) { return (String(t).match(/\n/g) || []).length; }

  function assemblerShader(o) {
    if (!APPELS[o.usage]) throw new Error('assemblerShader : usage « ' + o.usage + ' » (fond, transition ou post attendu).');
    var avant = [o.prelude || '', OUTILS, ENTREES, o.disposition.wgsl, LIAISONS].join('\n') + '\n// ---- code du shader ----\n';
    var code = String(o.code).replace(/\r\n?/g, '\n');
    return {
      wgsl: avant + code + '\n// ---- enveloppe du moteur ----\n' + ENVELOPPE.replace('/*APPEL*/', APPELS[o.usage]),
      ligneCode: compterLignes(avant),
      lignesCode: code.split('\n').length,
    };
  }

  /** Messages de compilation (getCompilationInfo) -> erreurs dans le fichier .wgsl (lignes à partir de 1). */
  function situer(messages, a) {
    return (messages || []).filter(function (m) { return m.type === 'error'; }).map(function (m) {
      var l = m.lineNum - a.ligneCode;
      var dedans = l >= 1 && l <= a.lignesCode;
      return { ligne: dedans ? l : null, colonne: dedans ? m.linePos : null, message: String(m.message) };
    });
  }

  function messageErreur(nom, fichier, erreurs) {
    var liste = erreurs.slice(0, 3).map(function (e) {
      return (e.ligne ? 'ligne ' + e.ligne + ', colonne ' + e.colonne : 'hors du code du shader (nom déjà pris par le moteur ?)') + ' : ' + e.message;
    });
    return 'Shader « ' + nom + ' » (' + fichier + ') ne compile pas : ' + liste.join(' ; ') +
      (erreurs.length > 3 ? ' (et ' + (erreurs.length - 3) + ' autre(s))' : '') + '.';
  }

  /** FNV-1a 32 bits sur l'UTF-8 du texte (une paire de substitution compte comme deux caractères de 3 octets). */
  function empreinte(texte) {
    var h = 0x811c9dc5;
    var s = String(texte);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      var o = c < 0x80 ? [c] : c < 0x800 ? [0xc0 | (c >> 6), 0x80 | (c & 63)] : [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
      for (var k = 0; k < o.length; k++) { h ^= o[k]; h = Math.imul(h, 0x01000193) >>> 0; }
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // ---- Modules de particules ----

  var PREFIXES = { 'module-force': 'pmForce_', 'module-couleur': 'pmCouleur_', 'module-forme': 'pmForme_' };
  var CLES_MODULES = ['force', 'couleur', 'forme'];

  /** Noms déclarés au niveau du module (hors des accolades) : fn, const, struct, alias, override, var. */
  function declarations(nu) {
    var profs = new Array(nu.length);
    var p = 0;
    for (var i = 0; i < nu.length; i++) {
      profs[i] = p;
      if (nu[i] === '{') p++;
      else if (nu[i] === '}') p--;
    }
    var noms = [];
    var re = /\b(?:fn|const|struct|alias|override|var)\b(?:\s*<[^>]*>)?\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    var m;
    while ((m = re.exec(nu))) if (profs[m.index] === 0 && noms.indexOf(m[1]) < 0) noms.push(m[1]);
    return noms;
  }

  /** Noms déclarés et R.x préfixés, ligne par ligne, hors commentaires et hors accès à un champ ; carte des colonnes. */
  function reecrireModule(code, prefixe, noms) {
    var lignes = code.split('\n');
    var nus = sansCommentaires(code).split('\n');
    var motifNoms = noms.length ? new RegExp('(^|[^.A-Za-z0-9_])(' + noms.join('|') + ')(?![A-Za-z0-9_])', 'g') : null;
    var motifR = /(^|[^.A-Za-z0-9_])R\.([A-Za-z_][A-Za-z0-9_]*)/g;
    var carte = [];
    var texte = lignes.map(function (ligne, n) {
      var nu = nus[n];
      var morceaux = [];
      var m;
      if (motifNoms) {
        motifNoms.lastIndex = 0;
        while ((m = motifNoms.exec(nu))) {
          var d = m.index + m[1].length;
          morceaux.push({ debut: d, fin: d + m[2].length, texte: prefixe + m[2] });
          motifNoms.lastIndex = d + m[2].length;
        }
      }
      motifR.lastIndex = 0;
      while ((m = motifR.exec(nu))) {
        var d2 = m.index + m[1].length;
        morceaux.push({ debut: d2, fin: d2 + 2 + m[2].length, texte: prefixe + 'R_' + m[2] });
        motifR.lastIndex = d2 + 2 + m[2].length;
      }
      morceaux.sort(function (a, b) { return a.debut - b.debut; });
      var r = '';
      var pos = 0;
      var decal = 0;
      var points = [];
      morceaux.forEach(function (k) {
        if (k.debut < pos) return;
        r += ligne.slice(pos, k.debut) + k.texte;
        decal += k.texte.length - (k.fin - k.debut);
        pos = k.fin;
        points.push([r.length + 1, decal]);
      });
      carte.push(points);
      return r + ligne.slice(pos);
    });
    return { texte: texte.join('\n'), carte: carte };
  }

  function flottant(x) {
    var s = String(Number(x));
    return /[.eE]/.test(s) ? s : s + '.0';
  }

  function assemblerModule(o) {
    var prefixe = PREFIXES[o.usage];
    if (!prefixe) throw new Error('assemblerModule : usage « ' + o.usage + ' » (module-force, module-couleur ou module-forme attendu).');
    var code = String(o.code).replace(/\r\n?/g, '\n');
    var r = reecrireModule(code, prefixe, declarations(sansCommentaires(code)));
    var params = o.parametres || {};
    var consts = Object.keys(params).map(function (k) {
      var v = o.valeurs ? o.valeurs[k] : undefined;
      if (Array.isArray(v)) return 'const ' + prefixe + 'R_' + k + ': vec4f = vec4f(' + v.map(flottant).join(', ') + ');';
      return 'const ' + prefixe + 'R_' + k + ': f32 = ' + flottant(typeof v === 'number' ? v : 0) + ';';
    });
    var tete = '// Module « ' + o.nom + ' » (' + o.usage + ')\n' + (consts.length ? consts.join('\n') + '\n' : '');
    var wgsl = tete + r.texte + '\n';
    return { nom: o.nom, usage: o.usage, wgsl: wgsl, appel: prefixe + FONCTIONS[o.usage].nom, empreinte: empreinte(wgsl), ligneCode: compterLignes(tete), carte: r.carte };
  }

  function situerModule(messages, mod, debut) {
    return (messages || []).filter(function (m) { return m.type === 'error'; }).map(function (m) {
      var l = m.lineNum - debut - mod.ligneCode;
      if (l < 1 || l > mod.carte.length) return { ligne: null, colonne: null, message: String(m.message) };
      var d = 0;
      mod.carte[l - 1].forEach(function (p) { if (p[0] <= m.linePos) d = p[1]; });
      return { ligne: l, colonne: Math.max(1, m.linePos - d), message: String(m.message) };
    });
  }

  function attacherModules(effet, charger, charte) {
    var erreurs = [];
    var reg = effet.reglages || { nombres: {}, couleurs: {} };
    var possede = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    effet.emetteurs.forEach(function (em) {
      em.modulesWGSL = { force: null, couleur: null, forme: null };
      CLES_MODULES.forEach(function (cle) {
        var nom = em.modules && em.modules[cle];
        if (!nom) return;
        var pre = 'Effet « ' + effet.nom + ' », émetteur « ' + em.nom + ' », module ' + cle + ' « ' + nom + ' »';
        var src = charger(nom);
        if (!src) { erreurs.push({ regle: 'shader-inconnu', message: pre + ' : shader introuvable (ni dans shaders/ du projet, ni dans la bibliothèque).' }); return; }
        if (src.erreurs && src.erreurs.length) {
          src.erreurs.forEach(function (e) { erreurs.push({ regle: e.regle, message: pre + ' : ' + e.message }); });
          return;
        }
        if (src.json.usage !== 'module-' + cle) {
          erreurs.push({ regle: 'usage-incompatible', message: pre + ' : ce shader est un « ' + src.json.usage + ' », « module-' + cle + ' » attendu.' });
          return;
        }
        var herites = {};
        Object.keys(src.json.parametres || {}).forEach(function (k) {
          if (possede(reg.nombres, k)) herites[k] = reg.nombres[k];
          else if (possede(reg.couleurs, k)) herites[k] = reg.couleurs[k];
        });
        var v = valeursShader(src.json, herites, charte);
        if (v.erreurs.length) {
          v.erreurs.forEach(function (e) { erreurs.push({ regle: 'reglage-invalide', message: pre + ' : ' + e.message }); });
          return;
        }
        var mod = assemblerModule({ code: src.code, usage: 'module-' + cle, nom: nom, parametres: src.json.parametres || {}, valeurs: v.valeurs });
        // Fichier du module dans les messages de compilation (sources de l'atelier : pas de « fichier »).
        mod.fichier = src.fichier || 'shaders/' + nom + '.wgsl';
        em.modulesWGSL[cle] = mod;
      });
    });
    return erreurs;
  }

  // ---- Composition (transitions et post-traitements par shader) ----

  function planComposition(o) {
    var visibles = o.scenes.filter(function (s) { return o.t >= s.debut && o.t < s.fin; });
    if (!visibles.length && o.scenes.length) visibles = [o.scenes[o.scenes.length - 1]];
    var transition = null;
    var derniere = visibles[visibles.length - 1];
    if (derniere && o.transitions[derniere.id] && derniere.dureeTransition > 0) {
      var q = (o.t - derniere.debut) / derniere.dureeTransition;
      if (q < 1) {
        transition = {
          sortante: visibles.length > 1 ? visibles[visibles.length - 2].id : null,
          entrante: derniere.id,
          progres: Math.max(0, q),
          temps: Math.max(0, o.t - derniere.debut),
          duree: derniere.dureeTransition,
        };
      }
    }
    var avecPosts = o.postsVideo > 0 || visibles.some(function (s) { return (o.posts[s.id] || 0) > 0; });
    if (!transition && !avecPosts) return null;
    return { couches: visibles.map(function (s) { return s.id; }), transition: transition, postsVideo: o.postsVideo };
  }

  return {
    planComposition: planComposition,
    USAGES: USAGES,
    FONCTIONS: FONCTIONS,
    TAILLE_MAX: TAILLE_MAX,
    sansCommentaires: sansCommentaires,
    octets: octets,
    validerShader: validerShader,
    reglagesEnTexte: reglagesEnTexte,
    valeursShader: valeursShader,
    dispositionReglages: dispositionReglages,
    ecrireReglages: ecrireReglages,
    OCTETS_ENTREES: OCTETS_ENTREES,
    ENTREES: ENTREES,
    ecrireEntrees: ecrireEntrees,
    OUTILS: OUTILS,
    assemblerShader: assemblerShader,
    situer: situer,
    messageErreur: messageErreur,
    empreinte: empreinte,
    CLES_MODULES: CLES_MODULES,
    assemblerModule: assemblerModule,
    situerModule: situerModule,
    attacherModules: attacherModules,
  };
});
