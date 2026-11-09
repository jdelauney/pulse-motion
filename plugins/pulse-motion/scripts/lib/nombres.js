'use strict';
/* Pulse Motion – nombres d'un texte, écrits en chiffres ou en lettres (spec S2, 5.7 : chiffre-invente).
 *
 * lireNombresEnLettres(texte) -> [valeurs]   de zéro à neuf mille neuf cent quatre-vingt-dix-neuf, « vingt et un »,
 *   « soixante-dix », « quatre-vingts », « trois virgule cinq » (3,5) ; « pour cent », « degrés » ignorés (le nombre reste).
 *   Un « un » ou « une » d'article compte pour 1 : la liste sert à dire qu'un nombre affiché a bien été dit, jamais l'inverse.
 * nombresEnChiffres(texte) -> [valeurs]      « 1 250 », « 1 250 » (espace fine), « 3,5 », « 3.5 », « 50 % » (50).
 * nombresDuTexte(texte) -> [valeurs]         les deux.
 * memeNombre(a, b) -> bool
 * Module pur.
 */

const UNITES = { zero: 0, 'zéro': 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
const DIZAINES = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, septante: 70, huitante: 80, octante: 80, nonante: 90 };
const MOTS = new Set([...Object.keys(UNITES), ...Object.keys(DIZAINES), 'cent', 'cents', 'mille', 'et', 'virgule']);

/** Mots d'un texte, en minuscules, traits d'union coupés. */
const motsDe = (texte) => (String(texte).toLowerCase().match(/[\p{L}]+/gu) || []);

/** Suite de mots de nombre (sans « virgule ») -> valeur entière, ou null. */
function valeurEntiere(mots) {
  let total = 0;
  let courant = 0;
  let vu = false;
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    if (m === 'et') continue;
    if (m in UNITES) { courant += UNITES[m]; vu = true; continue; }
    if (m === 'vingt' || m === 'vingts') {
      // Quatre-vingt(s) : 4 × 20.
      if (i > 0 && mots[i - 1] === 'quatre' && courant % 100 >= 4) { courant += 80 - 4; vu = true; continue; }
      courant += 20; vu = true; continue;
    }
    if (m in DIZAINES) { courant += DIZAINES[m]; vu = true; continue; }
    if (m === 'cent' || m === 'cents') { courant = (courant % 100 || 1) * 100 + Math.floor(courant / 100) * 100; vu = true; continue; }
    if (m === 'mille') { total += (courant || 1) * 1000; courant = 0; vu = true; continue; }
    return null;
  }
  return vu ? total + courant : null;
}

function lireNombresEnLettres(texte) {
  const mots = motsDe(texte);
  const valeurs = [];
  for (let i = 0; i < mots.length;) {
    // « pour cent » : l'unité du nombre qui précède, pas un nombre.
    const pourCent = (mots[i] === 'cent' || mots[i] === 'cents') && i > 0 && mots[i - 1] === 'pour';
    if (!MOTS.has(mots[i]) || mots[i] === 'et' || mots[i] === 'virgule' || pourCent) { i++; continue; }
    let j = i;
    while (j < mots.length && MOTS.has(mots[j]) && mots[j] !== 'virgule') j++;
    // « et » final (« un et deux ») : ne fait pas partie du nombre.
    let fin = j;
    while (fin > i && mots[fin - 1] === 'et') fin--;
    const entier = valeurEntiere(mots.slice(i, fin));
    if (entier === null) { i = j; continue; }
    if (fin === j && mots[j] === 'virgule') {
      let k = j + 1;
      while (k < mots.length && MOTS.has(mots[k]) && mots[k] !== 'virgule') k++;
      const apres = mots.slice(j + 1, k);
      // « virgule zéro cinq » : les zéros de tête comptent.
      let zeros = '';
      while (apres.length && (apres[0] === 'zero' || apres[0] === 'zéro')) { zeros += '0'; apres.shift(); }
      const decimales = apres.length ? valeurEntiere(apres) : 0;
      if (decimales !== null && (apres.length || zeros)) {
        valeurs.push(Number(`${entier}.${zeros}${apres.length ? decimales : ''}`));
        i = k;
        continue;
      }
    }
    valeurs.push(entier);
    i = j;
  }
  return valeurs;
}

const NOMBRE = /\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

function nombresEnChiffres(texte) {
  return (String(texte).match(NOMBRE) || []).map((n) => Number(n.replace(/[   ]/g, '').replace(',', '.'))).filter((v) => Number.isFinite(v));
}

const nombresDuTexte = (texte) => [...nombresEnChiffres(texte), ...lireNombresEnLettres(texte)];
const memeNombre = (a, b) => Math.abs(a - b) < 1e-9;

module.exports = { lireNombresEnLettres, nombresEnChiffres, nombresDuTexte, memeNombre };
