'use strict';
/* Pulse Motion – typographie française d'un texte : corrections sûres (espaces insécables, guillemets,
 * apostrophe, points de suspension, unités, majuscules accentuées) et constats (mots doublés, termes
 * écrits de deux façons). Fonctions pures. */

const FINE = '\u202f';
const INSECABLE = '\u00a0';
const UNITES = '%|°C|°F|€|\\$|kg|km|cm|mm|ml|mL|min|h|Mo|Go|Ko|L';

function appliquer(texte, regles) {
  const corrections = [];
  let t = String(texte);
  for (const [description, fn] of regles) {
    const avant = t;
    t = fn(t);
    if (t !== avant) corrections.push(description);
  }
  return { texte: t, corrections };
}

const REGLES = [
  ['points de suspension « … »', (t) => t.replace(/\.{3}/g, '…')],
  ['apostrophe « ’ »', (t) => t.replace(/(\p{L})'(?=\p{L})/gu, '$1’')],
  ['guillemets « »', (t) => t.replace(/"([^"]+)"/g, (m, dedans) => `«${INSECABLE}${dedans.trim()}${INSECABLE}»`)],
  ['espace insécable dans les guillemets', (t) => t
    .replace(/«(?![\u00a0\u202f]) ?/g, `«${INSECABLE}`)
    .replace(/(?<![\u00a0\u202f]) ?»/g, `${INSECABLE}»`)],
  // Une espace (ordinaire ou absente) avant ; ! ? devient fine ; une insécable déjà posée est gardée.
  ['espace fine avant « ? », « ! », « ; »', (t) => t.replace(/([^\s\u00a0\u202f]) ?([;!?]+)(?=\s|$|[»"')\]…])/g, `$1${FINE}$2`)],
  // Deux-points suivis d'une espace ou en fin de texte : jamais « 12:30 », « 16:9 », « https: ».
  ['espace insécable avant « : »', (t) => t.replace(/([^\s\u00a0\u202f]) ?:(?=\s|$)/g, `$1${INSECABLE}:`)],
  ['espace fine entre un nombre et son unité', (t) => t.replace(new RegExp(`(\\d) ?(${UNITES})(?![\\p{L}\\p{N}])`, 'gu'), `$1${FINE}$2`)],
];

/** -> { texte, corrections: [description] } */
function corrigerTypographie(texte) {
  // Ordre d'affichage des descriptions : celui des règles, filtrées sur celles qui ont servi.
  return appliquer(texte, REGLES);
}

// Mots courants qui prennent un accent sur leur majuscule initiale (clé : sans accent, en minuscules).
const ACCENTUES = {
  etape: 'Étape', etapes: 'Étapes', equipe: 'Équipe', equipes: 'Équipes', ecole: 'École', ecoles: 'Écoles',
  etat: 'État', etats: 'États', eviter: 'Éviter', evitez: 'Évitez', electricite: 'Électricité', energie: 'Énergie',
  energies: 'Énergies', eleve: 'Élève', eleves: 'Élèves', etude: 'Étude', etudes: 'Études', evaluation: 'Évaluation',
  evaluations: 'Évaluations', echange: 'Échange', echanges: 'Échanges', element: 'Élément', elements: 'Éléments',
};
const sansAccent = (m) => m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Premier mot d'un texte ou d'une phrase, sans accent, de la liste ACCENTUES. -> { texte, corrections } */
function corrigerMajuscules(texte) {
  const corrections = [];
  const t = String(texte).replace(/(^|[.!?…][\s\u00a0\u202f]+)(E\p{Ll}+)/gu, (tout, avant, mot) => {
    const juste = ACCENTUES[sansAccent(mot)];
    if (!juste) return tout;
    corrections.push(`majuscule accentuée « ${juste} »`);
    return avant + juste;
  });
  return { texte: t, corrections };
}

/** Mots répétés (« le le ») ; « nous nous » et « vous vous » sont corrects. */
function motsDoubles(texte) {
  const t = String(texte);
  const resultats = [];
  const re = /(?<![\p{L}\p{N}])(\p{L}+)[ \u00a0\u202f]+\1(?![\p{L}\p{N}])/giu;
  let m;
  while ((m = re.exec(t))) {
    if (['nous', 'vous'].includes(m[1].toLowerCase())) continue;
    resultats.push({ mot: m[1], propose: t.slice(0, m.index) + m[1] + t.slice(m.index + m[0].length) });
  }
  return resultats;
}

/** Clé de comparaison : minuscules, sans trait d'union, apostrophe unifiée (les accents comptent). */
const cleTerme = (mot) => String(mot).toLowerCase().replace(/['’]/g, '’').replace(/-/g, '');
// Forme comparée : majuscule de début de phrase ignorée, apostrophe unifiée.
const formeComparee = (mot) => (mot.charAt(0).toLowerCase() + mot.slice(1)).replace(/'/g, '’');

/** Mots écrits de plusieurs façons (casse, trait d'union), hors textes tout en capitales et termes exclus. */
function termesVariables(entrees, exclus = new Set()) {
  const groupes = new Map();
  for (const { scene, texte } of entrees) {
    const t = String(texte);
    if (/\p{L}/u.test(t) && t === t.toUpperCase()) continue;
    for (const forme of t.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []) {
      if ((forme.match(/\p{L}/gu) || []).length < 3 || /\p{N}/u.test(forme)) continue;
      const cle = cleTerme(forme);
      if (exclus.has(cle)) continue;
      if (!groupes.has(cle)) groupes.set(cle, new Map());
      const formes = groupes.get(cle);
      const comparee = formeComparee(forme);
      if (!formes.has(comparee)) formes.set(comparee, { forme, scene });
    }
  }
  return [...groupes.values()].filter((f) => f.size > 1).map((f) => ({ formes: [...f.values()] }));
}

module.exports = { corrigerTypographie, corrigerMajuscules, motsDoubles, termesVariables, cleTerme };
