'use strict';
/* Pulse Motion – messages du contrôle sans jargon (spec Retouches et ergonomie, 5.15 ; friction 6) : chaque problème de
 * sortie/controle.json porte deux champs,
 *   message  : pour la personne, ce qui se voit, où et quand, en français simple (dit tel quel par les compétences) ;
 *   consigne : pour Claude, la correction technique (attributs, variables, champs), c'est-à-dire le texte complet de la règle.
 * Le champ machine « correction » reste.
 *
 * Les règles écrivent un seul texte, constat puis consigne ; ce module en tire le message : il garde les morceaux de phrase
 * (séparés par « ; » ou par un point) sans terme technique, et réécrit le constat s'il en contient (« 2 cqh » devient
 * « 2 % de la hauteur de l'image », une parenthèse technique est retirée, un attribut devient « un réglage »).
 *
 * estTechnique(texte) -> bool ; separerMessage(texte, { scene? }) -> { message, consigne }
 * avecConsigne(probleme) -> probleme avec message et consigne ; avecConsignes(problemes) -> [problèmes]
 */

/** Termes interdits dans un message pour la personne (critère « aucun terme technique » de la spec). */
const TECHNIQUE = /data-|--pm-|--c-|cqh|aria-|alt=|[{}]|\bJSON\b|\bCSS\b|\bHTML\b|pulse-motion/;

const estTechnique = (t) => TECHNIQUE.test(String(t || ''));

/** Constat réécrit sans terme technique, au plus près du texte de la règle. */
function nettoyer(texte) {
  let t = String(texte);
  // Parenthèses et accolades techniques retirées : « (ou alt="" pour une image…) », « { « position »: « haut » } ».
  t = t.replace(/\s*\{[^{}]*\}/g, '');
  for (let k = 0; k < 3; k++) t = t.replace(/\s*\(([^()]*)\)/g, (m, dedans) => (estTechnique(dedans) ? '' : m));
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*cqh²/g, '$1 % de la hauteur de l\'image, au carré')
    .replace(/(\d+(?:[.,]\d+)?)\s*cqh/g, '$1 % de la hauteur de l\'image')
    .replace(/\bcqh\b/g, 'centièmes de la hauteur de l\'image')
    .replace(/\bdata-texte\s*=\s*"([^"]*)"/g, 'le texte « $1 »')
    .replace(/\bdata-[a-z0-9-]+(?:\s*=\s*("[^"]*"|'[^']*'))?/g, 'un réglage de la scène')
    .replace(/--(?:pm|c)-[a-z0-9-]+/g, 'un réglage du style')
    .replace(/\baria-[a-z-]+(?:\s*=\s*("[^"]*"|'[^']*'))?/g, 'un réglage')
    .replace(/\balt\s*=\s*("[^"]*"|'[^']*')?/g, 'un réglage')
    .replace(/\bJSON\b/g, 'fichier').replace(/\bCSS\b/g, 'style').replace(/\bHTML\b/g, 'page')
    .replace(/pulse-motion\s+[^,;.)»]*/g, 'l\'outil');
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

const finir = (t) => (/[.?!…]$/.test(t) ? t : `${t}.`);

function separerMessage(texte, { scene = null } = {}) {
  const original = String(texte === undefined || texte === null ? '' : texte);
  if (!estTechnique(original)) return { message: original, consigne: original };
  // Morceaux et séparateurs : « ; » ou fin de phrase (point suivi d'une majuscule ou d'un guillemet).
  const parts = original.split(/(\s*;\s+|(?<=\.)\s+(?=[A-ZÀ-ÝÉ«]))/);
  const garde = [];
  for (let k = 0; k < parts.length; k += 2) {
    const morceau = parts[k];
    if (!morceau || !morceau.trim()) continue;
    if (k === 0) garde.push({ sep: '', texte: estTechnique(morceau) ? nettoyer(morceau) : morceau });
    else if (!estTechnique(morceau)) garde.push({ sep: parts[k - 1], texte: morceau });
  }
  let message = garde.map((g, i) => (i ? g.sep : '') + g.texte).join('').trim().replace(/[;:,]\s*$/, '');
  if (estTechnique(message)) message = nettoyer(message);
  if (!message || estTechnique(message)) message = scene ? `Scène « ${scene} » : un réglage est à revoir.` : 'Un réglage de la vidéo est à revoir.';
  return { message: finir(message), consigne: original };
}

/** Un problème avec ses deux champs ; une consigne déjà écrite par la règle est gardée (et complétée du texte d'origine si
 *  le message a dû être réécrit). */
function avecConsigne(p) {
  if (!p || typeof p.message !== 'string') return p;
  const s = separerMessage(p.message, { scene: p.scene || null });
  const consigne = p.consigne ? (s.consigne !== s.message ? `${s.consigne} ${p.consigne}` : p.consigne) : s.consigne;
  return { ...p, message: s.message, consigne };
}

const avecConsignes = (liste) => (Array.isArray(liste) ? liste.map(avecConsigne) : liste);

module.exports = { TECHNIQUE, estTechnique, separerMessage, avecConsigne, avecConsignes, nettoyer };
