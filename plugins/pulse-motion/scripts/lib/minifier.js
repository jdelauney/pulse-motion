'use strict';
/* Pulse Motion – minification du moteur sans dépendance (spec Rapidité 5.19.4). Un petit analyseur lexical reconnaît les
 * chaînes, les gabarits (avec leurs ${…} imbriqués), les expressions régulières et les commentaires. Hors des littéraux, il
 * retire les commentaires, l'indentation, les espaces en fin de ligne, les espaces répétés et les lignes vides ; il garde
 * les fins de ligne (aucun risque lié à l'insertion automatique des points-virgules) et les commentaires de licence
 * (« licence », « license », « copyright », « MIT »). Le contenu des littéraux (WGSL et GLSL des gabarits compris) n'est
 * jamais touché.
 *
 * minifier(code) -> code
 */

// Après ces mots, une barre oblique ouvre une expression régulière (et non une division).
const MOTS_AVANT_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'instanceof', 'yield', 'await']);
// Après ces signes aussi ; après « ) », « ] », un nom, un nombre ou un littéral : division.
const SIGNES_AVANT_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const LICENCE = /licen[cs]e|copyright|\bMIT\b/i;

const estDebutNom = (c) => /[A-Za-z_$\u00C0-\uFFFF]/.test(c);
const estNom = (c) => /[A-Za-z0-9_$\u00C0-\uFFFF]/.test(c);

function minifier(source) {
  const src = String(source);
  const n = src.length;
  const parts = [];
  let enAttente = false;
  // Dernier élément significatif du code : { genre: 'signe' | 'nom' | 'mot' | 'valeur', texte }.
  let dernier = null;
  let debutLigne = true;

  const regexPermise = () => !dernier
    || (dernier.genre === 'signe' && SIGNES_AVANT_REGEX.has(dernier.texte))
    || (dernier.genre === 'mot');

  // Une fin de ligne de code : gardée, sauf en tête ou après une autre (lignes vides retirées) ; l'espace en attente tombe.
  function finDeLigne() {
    enAttente = false;
    if (!debutLigne) parts.push('\n');
    debutLigne = true;
  }
  // Un blanc de code : un seul espace, émis seulement si un élément suit sur la même ligne.
  function espace() {
    if (!debutLigne) enAttente = true;
  }
  function emettre(texte) {
    if (!texte) return;
    if (enAttente) parts.push(' ');
    enAttente = false;
    parts.push(texte);
    debutLigne = false;
  }

  // Littéral de chaîne entre guillemets simples ou doubles, depuis i ; -> indice après la fin.
  function chaine(i) {
    const q = src[i];
    let j = i + 1;
    while (j < n && src[j] !== q) {
      if (src[j] === '\\') j += 2;
      else if (src[j] === '\n') break; // chaîne non fermée : on s'arrête à la ligne (code invalide, rendu tel quel)
      else j++;
    }
    return Math.min(n, j + 1);
  }

  // Expression régulière depuis i (sur « / ») ; -> indice après les drapeaux.
  function regex(i) {
    let j = i + 1;
    let classe = false;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '\n') break;
      if (classe) { if (c === ']') classe = false; } else if (c === '[') classe = true; else if (c === '/') break;
      j++;
    }
    j++;
    while (j < n && /[a-z]/i.test(src[j])) j++;
    return Math.min(n, j);
  }

  // Gabarit depuis i (sur « ` ») : texte gardé tel quel, ${…} analysés comme du code. -> indice après le « ` » final.
  function gabarit(i) {
    emettre('`');
    let j = i + 1;
    let debutTexte = j;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') break;
      if (c === '$' && src[j + 1] === '{') {
        emettre(src.slice(debutTexte, j + 2));
        const precedent = dernier;
        dernier = { genre: 'signe', texte: '{' };
        j = code(j + 2, true);
        emettre('}');
        dernier = precedent;
        j++;
        debutTexte = j;
        continue;
      }
      j++;
    }
    emettre(src.slice(debutTexte, Math.min(n, j + 1)));
    return Math.min(n, j + 1);
  }

  // Code depuis i ; dansGabarit : s'arrête sur l'accolade fermante de ${…} (indice rendu : celui de « } »).
  function code(i, dansGabarit) {
    let profondeur = 0;
    while (i < n) {
      const c = src[i];
      if (c === '\r') { i++; continue; }
      if (c === '\n') { finDeLigne(); i++; continue; }
      if (c === ' ' || c === '\t' || c === '\f' || c === '\v' || c === '\u00A0' || c === '\uFEFF') {
        espace();
        i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        let j = i;
        while (j < n && src[j] !== '\n') j++;
        const texte = src.slice(i, j).replace(/\r$/, '');
        if (LICENCE.test(texte)) emettre(texte);
        i = j;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const fin = src.indexOf('*/', i + 2);
        const j = fin < 0 ? n : fin + 2;
        const texte = src.slice(i, j);
        if (LICENCE.test(texte)) emettre(texte.replace(/\r/g, ''));
        else if (texte.includes('\n')) finDeLigne();
        else espace();
        i = j;
        continue;
      }
      if (c === '\'' || c === '"') {
        const j = chaine(i);
        emettre(src.slice(i, j));
        dernier = { genre: 'valeur', texte: c };
        i = j;
        continue;
      }
      if (c === '`') {
        i = gabarit(i);
        dernier = { genre: 'valeur', texte: '`' };
        continue;
      }
      if (c === '/' && regexPermise()) {
        const j = regex(i);
        emettre(src.slice(i, j));
        dernier = { genre: 'valeur', texte: '/' };
        i = j;
        continue;
      }
      if (estDebutNom(c)) {
        let j = i + 1;
        while (j < n && estNom(src[j])) j++;
        const mot = src.slice(i, j);
        // « a.of / 2 » : un nom après un point est une propriété, jamais un mot-clé.
        const propriete = dernier && dernier.genre === 'signe' && dernier.texte === '.';
        emettre(mot);
        dernier = { genre: !propriete && MOTS_AVANT_REGEX.has(mot) ? 'mot' : 'nom', texte: mot };
        i = j;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i + 1;
        while (j < n && /[0-9A-Za-z_.]/.test(src[j])) {
          if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '+' || src[j + 1] === '-')) j++;
          j++;
        }
        emettre(src.slice(i, j));
        dernier = { genre: 'valeur', texte: '0' };
        i = j;
        continue;
      }
      // « a++ / 2 » : après ++ ou --, une barre oblique divise.
      if ((c === '+' || c === '-') && src[i + 1] === c) {
        emettre(c + c);
        dernier = { genre: 'valeur', texte: c + c };
        i += 2;
        continue;
      }
      if (c === '{') profondeur++;
      if (c === '}') {
        if (dansGabarit && profondeur === 0) return i;
        profondeur--;
      }
      emettre(c);
      dernier = { genre: c === ')' || c === ']' ? 'valeur' : 'signe', texte: c };
      i++;
    }
    return i;
  }

  code(0, false);
  const resultat = parts.join('');
  return resultat.endsWith('\n') ? resultat : `${resultat}\n`;
}

module.exports = { minifier };
