'use strict';
/* Pulse Motion – typographie d'un texte : corrections sûres (espaces insécables, guillemets,
 * apostrophe, points de suspension, unités, majuscules accentuées) et constats (mots doublés, termes
 * écrits de deux façons, ponctuation ouvrante de l'espagnol). Fonctions pures.
 * Langue de la vidéo (spec S9, 5.1 point 6) : les règles sont nommées (REGLES) ; chaque langue de moteur/langues.js dit
 * lesquelles s'appliquent, dans l'ordre (« typographie ») ; le français garde ses règles et leur ordre. Communes : points de
 * suspension, apostrophe. Majuscules accentuées : français seulement ; mots doublés : répétitions correctes de la langue. */
const Langues = require('../../moteur/langues.js');

const FINE = '\u202f';
const INSECABLE = '\u00a0';
// « L » seul est trop souvent une initiale (« Tome 3 L », « 2 L’eau ») : seul « mL » est reconnu.
const UNITES = '%|°C|°F|€|\\$|kg|km|cm|mm|ml|mL|min|h|Mo|Go|Ko';
const UNITES_SANS_POURCENT = UNITES.replace('%|', '');
const ESPACES = '[ \\u00a0\\u202f]';

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

// Guillemets droits "…" (jamais après un chiffre : pouces, 27") et guillemets français « … » d'un texte -> ouvrant et fermant.
const remplacerGuillemets = (t, ouvre, ferme) => (/[«»]/.test(t)
  ? t.replace(new RegExp(`«${ESPACES}*`, 'g'), ouvre).replace(new RegExp(`${ESPACES}*»`, 'g'), ferme)
  : t.replace(/(?<!\d)"([^"]+)"/g, (m, dedans) => `${ouvre}${dedans.trim()}${ferme}`));
const uniteInsecable = (unites) => (t) => t.replace(new RegExp(`(\\d) ?(${unites})(?![\\p{L}\\p{N}])`, 'gu'), `$1${INSECABLE}$2`);

/** Règles nommées : [description, correction]. */
const REGLES = {
  suspension: ['points de suspension « … »', (t) => t.replace(/\.{3}/g, '…')],
  apostrophe: ['apostrophe « ’ »', (t) => t.replace(/(\p{L})'(?=\p{L})/gu, '$1’')],
  // Pas de conversion si le texte a déjà des « » (guillemets imbriqués) ni après un chiffre (pouces : 27").
  'guillemets-francais': ['guillemets « »', (t) => (/[«»]/.test(t) ? t : t.replace(/(?<!\d)"([^"]+)"/g, (m, dedans) => `«${INSECABLE}${dedans.trim()}${INSECABLE}»`))],
  'espace-guillemets': ['espace insécable dans les guillemets', (t) => t
    .replace(/«(?![\u00a0\u202f]) ?/g, `«${INSECABLE}`)
    .replace(/(?<![\u00a0\u202f]) ?»/g, `${INSECABLE}»`)],
  // Une espace (ordinaire ou absente) avant ; ! ? devient fine ; une insécable déjà posée est gardée.
  'espace-fine': ['espace fine avant « ? », « ! », « ; »', (t) => t.replace(/([^\s\u00a0\u202f;!?]) ?([;!?]+)(?=\s|$|[»"')\]…])/g, `$1${FINE}$2`)],
  // Deux-points suivis d'une espace ou en fin de texte : jamais « 12:30 », « 16:9 », « https: ».
  'espace-deux-points': ['espace insécable avant « : »', (t) => t.replace(/([^\s\u00a0\u202f]) ?:(?=\s|$)/g, `$1${INSECABLE}:`)],
  'unite-fine': ['espace fine entre un nombre et son unité', (t) => t.replace(new RegExp(`(\\d) ?(${UNITES})(?![\\p{L}\\p{N}])`, 'gu'), `$1${FINE}$2`)],
  // Anglais, néerlandais, portugais du Brésil : “ ” ; une paire d'apostrophes droites autour d'un mot : ‘ ’.
  'guillemets-anglais': ['guillemets “ ”', (t) => remplacerGuillemets(t, '“', '”').replace(/(?<![\p{L}\p{N}])'([^'\n]+)'(?![\p{L}\p{N}])/gu, '‘$1’')],
  'guillemets-allemands': ['guillemets „ “', (t) => remplacerGuillemets(t, '„', '“')],
  // Espagnol, italien, portugais : « » sans espace intérieure.
  'guillemets-chevrons': ['guillemets « » sans espace', (t) => remplacerGuillemets(t, '«', '»')],
  // Habitude française dans un texte d'une autre langue : l'espace avant ? ! : ; est retirée (jamais dans « 12:30 »).
  'sans-espace-ponctuation': ['pas d\'espace avant « ? », « ! », « : », « ; »', (t) => t.replace(new RegExp(`(\\S)${ESPACES}+([?!:;]+)(?=\\s|$|[»”“"')\\]…])`, 'g'), '$1$2')],
  'unite-insecable': ['espace insécable entre un nombre et son unité', uniteInsecable(UNITES)],
  'unite-insecable-sauf-pourcent': ['espace insécable entre un nombre et son unité', uniteInsecable(UNITES_SANS_POURCENT)],
};

/** Règles d'une langue (étiquette), dans leur ordre. */
const reglesDe = (langue) => Langues.de(langue).typographie.map((id) => REGLES[id]);

/** -> { texte, corrections: [description] } ; langue : étiquette de la vidéo (français par défaut). */
function corrigerTypographie(texte, langue = 'fr') {
  // Ordre d'affichage des descriptions : celui des règles, filtrées sur celles qui ont servi.
  return appliquer(texte, reglesDe(langue));
}

/** Espagnol (spec S9, 5.1 point 6) : phrases qui finissent par « ? » ou « ! » sans « ¿ » ou « ¡ » ouvrant ; constat seulement.
 *  -> [{ signe, ouvrant, phrase }] */
function ponctuationOuvrante(texte, langue = 'fr') {
  if (Langues.principale(langue) !== 'es') return [];
  const r = [];
  for (const phrase of String(texte).split(/(?<=[.!?…])\s+/)) {
    const m = /([?!])["»”’)]*$/.exec(phrase.trim());
    if (!m) continue;
    const ouvrant = m[1] === '?' ? '¿' : '¡';
    if (!phrase.includes(ouvrant)) r.push({ signe: m[1], ouvrant, phrase: phrase.trim() });
  }
  return r;
}

// Mots courants qui prennent un accent sur leur majuscule initiale (clé : sans accent, en minuscules).
const ACCENTUES = {
  etape: 'Étape', etapes: 'Étapes', equipe: 'Équipe', equipes: 'Équipes', ecole: 'École', ecoles: 'Écoles',
  etat: 'État', etats: 'États', eviter: 'Éviter', evitez: 'Évitez', electricite: 'Électricité', energie: 'Énergie',
  energies: 'Énergies', eleve: 'Élève', eleves: 'Élèves', etude: 'Étude', etudes: 'Études', evaluation: 'Évaluation',
  evaluations: 'Évaluations', echange: 'Échange', echanges: 'Échanges', element: 'Élément', elements: 'Éléments',
};
const sansAccent = (m) => m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Premier mot d'un texte ou d'une phrase, sans accent, de la liste ACCENTUES (français seulement). -> { texte, corrections } */
function corrigerMajuscules(texte, langue = 'fr') {
  const corrections = [];
  if (!Langues.estFrancais(langue)) return { texte: String(texte), corrections };
  const t = String(texte).replace(/(^|[.!?…][\s\u00a0\u202f]+)(E\p{Ll}+)/gu, (tout, avant, mot) => {
    const juste = ACCENTUES[sansAccent(mot)];
    if (!juste) return tout;
    corrections.push(`majuscule accentuée « ${juste} »`);
    return avant + juste;
  });
  return { texte: t, corrections };
}

// Répétitions correctes ou volontaires (oral) : « nous nous lavons », « très très bien », « si si » ; celles de chaque langue
// sont dans moteur/langues.js (« repetitions » : « that that », « had had » en anglais, « die die » en allemand).

/** Mots répétés (« le le »), hors répétitions correctes de la langue. */
function motsDoubles(texte, langue = 'fr') {
  const REPETITIONS = Langues.de(langue).repetitions;
  const t = String(texte);
  const resultats = [];
  const re = /(?<![\p{L}\p{N}])(\p{L}+)[ \u00a0\u202f]+\1(?![\p{L}\p{N}])/giu;
  let m;
  while ((m = re.exec(t))) {
    if (REPETITIONS.includes(m[1].toLowerCase())) continue;
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

module.exports = { REGLES, corrigerTypographie, ponctuationOuvrante, corrigerMajuscules, motsDoubles, termesVariables, cleTerme };
