'use strict';
/* Pulse Motion – lecture d'une scène sans navigateur : éléments minutés, textes, CSS.
 *
 * Les clés suivent la même règle que moteur/horloge.js : l'id de l'élément, sinon « _n »
 * (n-ième élément minuté sans id, dans l'ordre du document).
 */

const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUT = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function lireAttributs(texte) {
  const attrs = {};
  let m;
  ATTRIBUT.lastIndex = 0;
  while ((m = ATTRIBUT.exec(texte))) {
    const nom = m[1].toLowerCase();
    if (!(nom in attrs)) attrs[nom] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * extraireScene(html) -> {
 *   elements: [{ cle, balise, start, dur, tween, texte, effet, calque, shader, son, sonVolume }],   (éléments minutés, data-effet compris, ordre du document)
 *   textes: [clé data-texte],
 *   decoupes: [{ attribut: 'data-lettres' | 'data-mots', effet }],
 *   miseEnScene: [{ balise, camera, gel, vitesse, profondeur }]   (textes des attributs, undefined si absents)
 *   css: texte des blocs <style>, des attributs style et des attributs filter
 * }
 */
function extraireScene(html) {
  const css = [];
  const sansBlocs = String(html)
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (tout, contenu) => { css.push(contenu); return ''; })
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const elements = [];
  const textes = [];
  const decoupes = [];
  const miseEnScene = [];
  let n = 0;
  let m;
  BALISE.lastIndex = 0;
  while ((m = BALISE.exec(sansBlocs))) {
    const attrs = lireAttributs(m[2]);
    if ('data-texte' in attrs) textes.push(attrs['data-texte']);
    for (const attribut of ['data-lettres', 'data-mots']) if (attribut in attrs) decoupes.push({ attribut, effet: attrs[attribut] });
    if ('data-camera' in attrs || 'data-gel' in attrs || 'data-vitesse' in attrs || 'data-profondeur' in attrs) {
      miseEnScene.push({ balise: m[1].toLowerCase(), camera: attrs['data-camera'], gel: attrs['data-gel'], vitesse: attrs['data-vitesse'], profondeur: attrs['data-profondeur'] });
    }
    // Styles en ligne et filtre SVG comptent comme du CSS pour les contrôles.
    if (attrs.style) css.push(`[style] { ${attrs.style} }`);
    if (attrs.filter) css.push(`[filter] { filter: ${attrs.filter}; }`);
    // Un son (data-son) est minuté comme un élément animé : il part au début de l'élément.
    if ('data-start' in attrs || 'data-dur' in attrs || 'data-tween' in attrs || 'data-effet' in attrs || 'data-son' in attrs || 'data-shader' in attrs) {
      elements.push({
        cle: attrs.id || `_${++n}`,
        balise: m[1].toLowerCase(),
        start: attrs['data-start'],
        dur: attrs['data-dur'],
        tween: attrs['data-tween'],
        texte: attrs['data-texte'],
        effet: attrs['data-effet'],
        calque: attrs['data-calque'],
        shader: attrs['data-shader'],
        son: attrs['data-son'],
        sonVolume: attrs['data-son-volume'],
      });
    }
  }
  return { elements, textes, decoupes, miseEnScene, css: css.join('\n') };
}

// Entités nommées courantes en français ; les numériques sont décodées toutes, les inconnues retirées.
const ENTITES = {
  nbsp: '\u00a0', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', mdash: '—', ndash: '–', euro: '€', deg: '°', oelig: 'œ', OElig: 'Œ', ccedil: 'ç', Ccedil: 'Ç',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', agrave: 'à', acirc: 'â', Agrave: 'À',
  icirc: 'î', iuml: 'ï', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', uuml: 'ü',
};
const decoderEntites = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, nom) => {
  if (nom[0] === '#') {
    const code = nom[1] === 'x' || nom[1] === 'X' ? parseInt(nom.slice(2), 16) : parseInt(nom.slice(1), 10);
    try { return String.fromCodePoint(code); } catch { return ''; }
  }
  return ENTITES[nom] ?? '';
});

/** Textes écrits en dur dans une scène (hors commentaires, <style>, <script> et éléments data-texte). */
function textesEnDur(html) {
  const sans = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<([a-zA-Z][\w-]*)\b[^>]*\sdata-texte\b[^>]*>[\s\S]*?<\/\1>/g, '');
  return sans.split(/<[^>]*>/)
    .map((t) => decoderEntites(t).replace(/[ \t\r\n]+/g, ' ').trim())
    .filter((t) => /\p{L}/u.test(t));
}

module.exports = { extraireScene, lireAttributs, textesEnDur };
