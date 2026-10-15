'use strict';
/* Pulse Motion – filtrage du SVG des personnages dessinés : seules des formes simples passent.
 *
 *   verifierSVG(texte) -> [messages]   (vide : le fragment est sûr et s'insère tel quel)
 *
 * Liste blanche d'éléments et d'attributs de dessin ; refusés : tout autre élément (script, image, use,
 * foreignObject, a…), tout autre attribut (on…, href, style…), « url( », « javascript: », « & » et « \ » dans une valeur,
 * commentaires, texte hors des balises, balises mal fermées.
 */
const ELEMENTS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const ATTRIBUTS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points', 'x1', 'y1', 'x2', 'y2',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity',
  'transform', 'fill-rule']);
const BALISE = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTRIBUT = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function verifierSVG(texte) {
  const erreurs = [];
  const s = String(texte);
  const pile = [];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    const avant = s.slice(i, lt < 0 ? s.length : lt);
    if (avant.trim()) { erreurs.push(`texte hors des balises (« ${avant.trim().slice(0, 20)} »)`); }
    if (lt < 0) break;
    if (s.startsWith('<!--', lt)) { erreurs.push('commentaire interdit'); const f = s.indexOf('-->', lt); i = f < 0 ? s.length : f + 3; continue; }
    BALISE.lastIndex = lt;
    const m = BALISE.exec(s);
    if (!m) { erreurs.push(`balise illisible près de « ${s.slice(lt, lt + 24)} »`); break; }
    i = BALISE.lastIndex;
    const [, fermeture, nom, attributs, autoFermee] = m;
    if (!ELEMENTS.has(nom)) { erreurs.push(`élément « ${nom} » interdit (permis : ${[...ELEMENTS].join(', ')})`); continue; }
    if (fermeture) {
      if (pile[pile.length - 1] !== nom) erreurs.push(`fermeture « ${nom} » inattendue`);
      else pile.pop();
      continue;
    }
    for (const a of attributs.matchAll(ATTRIBUT)) {
      const valeur = a[2] !== undefined ? a[2] : a[3];
      if (!ATTRIBUTS.has(a[1])) erreurs.push(`attribut « ${a[1]} » interdit sur « ${nom} »`);
      else if (/url\(/i.test(valeur)) erreurs.push(`« url( » interdit dans « ${a[1]} »`);
      else if (/javascript:/i.test(valeur)) erreurs.push(`« javascript: » interdit dans « ${a[1]} »`);
      else if (/[&\\]/.test(valeur)) erreurs.push(`« & » et « \\ » interdits dans « ${a[1]} » (entités et échappements : écrire la valeur en clair)`);
    }
    if (!autoFermee) pile.push(nom);
  }
  for (const nom of pile.reverse()) erreurs.push(`balise « ${nom} » non fermée`);
  return erreurs;
}

module.exports = { verifierSVG, ELEMENTS, ATTRIBUTS };
