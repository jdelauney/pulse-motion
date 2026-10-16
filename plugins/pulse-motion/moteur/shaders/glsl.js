/* Pulse Motion – shaders GLSL façon Shadertoy (P7) : contrôle du code, assemblage, erreurs du compilateur (module pur).
 *
 * verifierCodeGLSL(json, code, appels?) -> [{ regle, message }]   (messages sans le nom du shader) liaison-reservee
 *   (uniform, #version), fonction-absente (appels : ['mainImage'] par défaut), nom-reserve (main, entrées du moteur
 *   redéclarées), reglage-inconnu (R_<nom> hors de « parametres »)
 * assemblerGLSL({ code, parametres, appel }) -> { glsl, ligneCode, lignesCode }   #version 300 es, précisions, entrées
 *   Shadertoy (ENTREES_GLSL), iSon, réglages en uniformes R_<nom> (float ; vec4 pour une couleur, en sRGB), le code tel
 *   quel, puis main() qui appelle « appel » avec gl_FragCoord.xy ; ligneCode : lignes avant le code.
 * situerGLSL(journal, assemblage) -> [{ ligne, colonne: null, message }]   lignes « ERROR: 0:N: … » ramenées au fichier
 * pistesGLSL(json, code) -> [piste]   [« piste » du .json, musique par défaut] si le code lit iSon ou iChannel3
 * SOMMETS : shader de sommets GLSL (triangle plein cadre, sans attributs).
 *
 * Module pur : chargé tel quel dans la page (global M.codeGLSL) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.codeGLSL = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ENTREES_GLSL = ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iFrameRate', 'iProgres', 'iMouse', 'iDate', 'iChannelResolution',
    'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3', 'iSon', 'pmSortie'];
  var TYPES = '(?:float|int|uint|bool|[biu]?vec[234]|mat[234](?:x[234])?|sampler2D|PmSon)';
  var REDECLARE = new RegExp('\\b' + TYPES + '\\s+(' + ENTREES_GLSL.join('|') + '|R_[A-Za-z0-9_]+|pm[A-Za-z0-9_]*|PM[A-Za-z0-9_]*)\\b');
  var MAIN = /\bvoid\s+main\s*\(/;
  var LIAISON = /\buniform\b|#\s*version\b/;
  var REFS_R = /\bR_([A-Za-z_][A-Za-z0-9_]*)/g;
  var LIT_LE_SON = /\biSon\b|\biChannel3\b/;
  var TAILLE_MAX = 65536;

  var SOMMETS = [
    '#version 300 es',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}',
    '',
  ].join('\n');

  var PRELUDE = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'precision highp sampler2D;',
    'uniform vec3 iResolution;',
    'uniform float iTime;',
    'uniform float iTimeDelta;',
    'uniform int iFrame;',
    'uniform float iFrameRate;',
    'uniform float iProgres;',
    'uniform vec4 iMouse;',
    'uniform vec4 iDate;',
    'uniform vec3 iChannelResolution[4];',
    'uniform sampler2D iChannel0;',
    'uniform sampler2D iChannel1;',
    'uniform sampler2D iChannel2;',
    'uniform sampler2D iChannel3;',
    'struct PmSon { float volume; float basses; float mediums; float aigus; float battement; float phase; float enveloppe; float syllabe; };',
    'uniform PmSon iSon;',
  ].join('\n');

  /** Commentaires // et blocs remplacés par des espaces (lignes gardées). */
  function sansCommentaires(code) {
    return String(code).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, function (m) { return m.replace(/[^\n]/g, ' '); });
  }

  function motifFonction(nom) {
    return new RegExp('\\bvoid\\s+' + nom + '\\s*\\(\\s*out\\s+vec4\\s+[A-Za-z_]\\w*\\s*,\\s*(?:in\\s+)?vec2\\s+[A-Za-z_]\\w*\\s*\\)');
  }

  function verifierCodeGLSL(json, code, appels) {
    var err = [];
    var nu = sansCommentaires(code);
    if (LIAISON.test(nu)) err.push({ regle: 'liaison-reservee', message: '« uniform » et « #version » sont posés par le moteur : lire iTime, iResolution, iChannel0 à iChannel3, iSon et les réglages R_<nom>' });
    (appels || ['mainImage']).forEach(function (nom) {
      if (!motifFonction(nom).test(nu)) err.push({ regle: 'fonction-absente', message: 'fonction attendue absente : « void ' + nom + '(out vec4 fragColor, in vec2 fragCoord) »' });
    });
    if (MAIN.test(nu)) err.push({ regle: 'nom-reserve', message: '« main » est écrite par le moteur : garder seulement mainImage' });
    var r = REDECLARE.exec(nu);
    if (r) err.push({ regle: 'nom-reserve', message: '« ' + r[1] + ' » est une entrée du moteur : ne pas la déclarer' });
    var params = (json && json.parametres) || {};
    var vus = {};
    var m;
    REFS_R.lastIndex = 0;
    while ((m = REFS_R.exec(nu))) {
      if (!Object.prototype.hasOwnProperty.call(params, m[1]) && !vus[m[1]]) {
        vus[m[1]] = true;
        err.push({ regle: 'reglage-inconnu', message: 'R_' + m[1] + ' n\'est pas un réglage de « parametres » (réglages : ' + (Object.keys(params).join(', ') || 'aucun') + ')' });
      }
    }
    return err;
  }

  function compterLignes(t) { return (String(t).match(/\n/g) || []).length; }

  function assemblerGLSL(o) {
    var params = o.parametres || {};
    var reglages = Object.keys(params).map(function (k) { return 'uniform ' + ((params[k] || {}).type === 'couleur' ? 'vec4' : 'float') + ' R_' + k + ';'; });
    var avant = [PRELUDE].concat(reglages, ['out vec4 pmSortie;', '// ---- code du shader ----']).join('\n') + '\n';
    var code = String(o.code).replace(/\r\n?/g, '\n');
    var fin = '\n// ---- enveloppe du moteur ----\nvoid main() {\n  vec4 c = vec4(0.0);\n  ' + (o.appel || 'mainImage') + '(c, gl_FragCoord.xy);\n  pmSortie = c;\n}\n';
    return { glsl: avant + code + fin, ligneCode: compterLignes(avant), lignesCode: code.replace(/\n$/, '').split('\n').length };
  }

  function situerGLSL(journal, a) {
    var r = [];
    String(journal || '').split('\n').forEach(function (l) {
      var m = /^ERROR:\s*\d+:(\d+):\s*(.*)$/.exec(l.trim());
      if (!m) return;
      var n = Number(m[1]) - a.ligneCode;
      var dedans = n >= 1 && n <= a.lignesCode;
      r.push({ ligne: dedans ? n : null, colonne: null, message: m[2].trim() });
    });
    return r;
  }

  function pistesGLSL(json, code) {
    return LIT_LE_SON.test(sansCommentaires(code || '')) ? [(json && json.piste) || 'musique'] : [];
  }

  return {
    ENTREES_GLSL: ENTREES_GLSL, SOMMETS: SOMMETS, TAILLE_MAX: TAILLE_MAX, sansCommentaires: sansCommentaires,
    verifierCodeGLSL: verifierCodeGLSL, assemblerGLSL: assemblerGLSL, situerGLSL: situerGLSL, pistesGLSL: pistesGLSL,
  };
});
