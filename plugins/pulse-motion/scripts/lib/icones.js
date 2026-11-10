'use strict';
/* Pulse Motion – icônes Lucide (spec S9, 5.3) : source unique des icônes du plugin, partagée avec les blocs de S6
 * (`data-icone`) et le calque de dessin de S7 (`d.icone`). Données : vendor/lucide/ (icones.json, etiquettes.json) et
 * references/icones-fr.json (mots-clés français). Tout est lu à la première demande : une page sans icône ne lit rien.
 *
 * charger() -> { version, icones: { nom: [chemin] }, alias: { ancien: nom } } ; chemin : `d`, ou { d, plein: true }
 * resoudre(nom) -> nom de Lucide (un alias mène à son icône), ou null      existe(nom), chemins(nom) -> [chemin] | null
 * cheminsPour(noms) -> { nom: [chemin] } pour les noms connus (table à embarquer, pour d.icone de S7)
 * svgIcone(nom, attributs = '') -> `<svg …>` en ligne : viewBox 24 × 24, currentColor, trait var(--pm-icone-trait, 2),
 *   pathLength="100" sur chaque chemin (recette du #011 « Tracé de ligne ») ; les attributs donnés sont gardés
 * chercher(mots, { max = 12 }) -> [{ nom, raison }] : nom exact (ou alias), puis mot-clé français, puis étiquette anglaise ;
 *   sans accents ni casse
 * motsFrancais(nom) -> [mots-clés français de l'icône]      nomsProches(nom) -> [noms] (proches, puis leurs autres noms)
 * preparerIcones(html, { scene }) -> { html, utilisees: [noms], erreurs } : chaque <svg data-icone="nom"> remplacé par son
 *   SVG en ligne ; règles icone-inconnue et icone-mal-placee (data-icone sur une autre balise que <svg>).
 */
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..', '..');
const FICHIER_ICONES = path.join(RACINE, 'vendor', 'lucide', 'icones.json');
const FICHIER_ETIQUETTES = path.join(RACINE, 'vendor', 'lucide', 'etiquettes.json');
const FICHIER_FR = path.join(RACINE, 'references', 'icones-fr.json');
const TRAIT = 'stroke-width: var(--pm-icone-trait, 2)';

let donnees = null;
let index = null;

function charger() {
  if (!donnees) donnees = JSON.parse(fs.readFileSync(FICHIER_ICONES, 'utf8'));
  return donnees;
}

function resoudre(nom) {
  const d = charger();
  const n = String(nom ?? '').trim();
  if (Object.hasOwn(d.icones, n)) return n;
  if (Object.hasOwn(d.alias, n)) return d.alias[n];
  return null;
}

const existe = (nom) => resoudre(nom) !== null;

function chemins(nom) {
  const n = resoudre(nom);
  return n ? charger().icones[n] : null;
}

function cheminsPour(noms) {
  const r = {};
  for (const nom of noms) { const c = chemins(nom); if (c) r[nom] = c; }
  return r;
}

const echapper = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Attributs d'une balise (texte entre le nom et « > ») -> [{ nom, brut, valeur }] dans l'ordre. */
function lireAttributs(texte) {
  const r = [];
  const motif = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const m of String(texte).matchAll(motif)) {
    r.push({ nom: m[1], brut: m[0], valeur: m[2] ?? m[3] ?? m[4] ?? '' });
  }
  return r;
}

/** Corps du SVG : un <path> par chemin, pathLength="100" ; un point plein garde son remplissage. */
function corpsIcone(liste) {
  return liste.map((c) => (typeof c === 'string'
    ? `<path d="${c}" pathLength="100"/>`
    : `<path d="${c.d}" pathLength="100" fill="currentColor"/>`)).join('');
}

/** Balise <svg> d'une icône : les attributs de l'auteur d'abord (gardés, sauf viewBox), puis ce qui manque. */
function ouvrirSvg(attributs) {
  const lus = lireAttributs(attributs).filter((a) => a.nom.toLowerCase() !== 'viewbox');
  const a = new Set(lus.map((x) => x.nom.toLowerCase()));
  const garde = lus.filter((x) => x.nom.toLowerCase() !== 'style').map((x) => x.brut);
  const style = lus.find((x) => x.nom.toLowerCase() === 'style');
  const ajout = ['viewBox="0 0 24 24"'];
  if (!a.has('fill')) ajout.push('fill="none"');
  if (!a.has('stroke')) ajout.push('stroke="currentColor"');
  if (!a.has('stroke-linecap')) ajout.push('stroke-linecap="round"');
  if (!a.has('stroke-linejoin')) ajout.push('stroke-linejoin="round"');
  if (!a.has('aria-hidden') && !a.has('aria-label') && !a.has('role')) ajout.push('aria-hidden="true"');
  const propre = style ? style.valeur.trim().replace(/;?$/, ';') : '';
  ajout.push(`style="${TRAIT};${propre ? ` ${propre.replace(/"/g, "'")}` : ''}"`);
  return `<svg${garde.map((x) => ` ${x}`).join('')} ${ajout.join(' ')}>`;
}

function svgIcone(nom, attributs = '') {
  const liste = chemins(nom);
  if (!liste) return null;
  const avecNom = /\sdata-icone\s*=/.test(` ${attributs}`) ? attributs : `data-icone="${echapper(nom)}" ${attributs}`;
  return `${ouvrirSvg(avecNom)}${corpsIcone(liste)}</svg>`;
}

// --- Recherche ---------------------------------------------------------------------------------------------------------

/** Minuscules, sans accents ; tirets, apostrophes et soulignés deviennent des espaces. */
function normaliser(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase()
    .replace(/[-_'’/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const MOTS_VIDES = new Set(['a', 'au', 'aux', 'avec', 'de', 'des', 'du', 'en', 'et', 'la', 'le', 'les', 'l', 'd', 'un', 'une',
  'sur', 'pour', 'par', 'icone', 'icones', 'the', 'of', 'an', 'icon']);
const racine = (mot) => (mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot);
const termesDe = (texte) => normaliser(texte).split(' ').filter((t) => t && !MOTS_VIDES.has(t)).map(racine);

function construireIndex() {
  if (index) return index;
  const d = charger();
  const etiquettes = JSON.parse(fs.readFileSync(FICHIER_ETIQUETTES, 'utf8'));
  const fr = JSON.parse(fs.readFileSync(FICHIER_FR, 'utf8'));
  const parIcone = new Map(Object.keys(d.icones).map((nom) => [nom, { nom, noms: [nom], fr: [], en: etiquettes[nom] || [] }]));
  for (const [ancien, nom] of Object.entries(d.alias)) parIcone.get(nom).noms.push(ancien);
  for (const [mot, liste] of Object.entries(fr)) {
    liste.forEach((n, rang) => { const c = resoudre(n); if (c) parIcone.get(c).fr.push({ mot, rang }); });
  }
  for (const e of parIcone.values()) {
    e.nomsN = e.noms.map((x) => termesDe(x).join(' '));
    e.frN = e.fr.map((x) => ({ ...x, termes: termesDe(x.mot) }));
    e.enN = e.en.map((x) => ({ tag: x, termes: termesDe(x) }));
  }
  index = { icones: [...parIcone.values()], fr };
  return index;
}

/** Part des termes cherchés présents dans une liste de termes : 1 (tous), une fraction, ou 0. */
function couverture(termes, cible) {
  if (!termes.length) return 0;
  return termes.filter((t) => cible.includes(t)).length / termes.length;
}

function chercher(mots, { max = 12 } = {}) {
  const termes = termesDe(Array.isArray(mots) ? mots.join(' ') : mots);
  if (!termes.length) return [];
  const requete = termes.join(' ');
  const r = [];
  for (const e of construireIndex().icones) {
    let score = 0;
    let raison = '';
    const essayer = (s, pourquoi) => { if (s > score) { score = s; raison = pourquoi; } };
    // 1. Nom de Lucide exact (ou un de ses anciens noms), puis nom qui contient tous les mots.
    e.nomsN.forEach((n, k) => {
      if (n === requete) essayer(1000, k ? `ancien nom « ${e.noms[k]} »` : 'nom');
      else { const c = couverture(termes, n.split(' ')); if (c === 1) essayer(700 - n.split(' ').length, 'nom'); else if (c) essayer(150 * c, 'nom'); }
    });
    // 2. Mot-clé français : exact, puis tous les mots, puis une partie (les premiers de la liste d'abord).
    for (const f of e.frN) {
      const n = f.termes.join(' ');
      if (n === requete) essayer(900 - f.rang, `mot-clé « ${f.mot} »`);
      else { const c = couverture(termes, f.termes); if (c === 1) essayer(600 - f.rang - f.termes.length, `mot-clé « ${f.mot} »`); else if (c) essayer(300 * c - f.rang, `mot-clé « ${f.mot} »`); }
    }
    // 3. Étiquette anglaise de Lucide.
    for (const t of e.enN) {
      const n = t.termes.join(' ');
      if (n === requete) essayer(400, `étiquette « ${t.tag} »`);
      else { const c = couverture(termes, t.termes); if (c === 1) essayer(350 - t.termes.length, `étiquette « ${t.tag} »`); else if (c) essayer(100 * c, `étiquette « ${t.tag} »`); }
    }
    if (score > 0) r.push({ nom: e.nom, raison, score, courante: e.fr.length > 0 });
  }
  // À score égal : une icône courante (qui a des mots-clés français) d'abord, puis le nom le plus court.
  r.sort((a, b) => b.score - a.score || b.courante - a.courante || a.nom.length - b.nom.length || a.nom.localeCompare(b.nom));
  return r.slice(0, max).map(({ nom, raison }) => ({ nom, raison }));
}

function motsFrancais(nom) {
  const c = resoudre(nom);
  if (!c) return [];
  return construireIndex().icones.find((e) => e.nom === c).fr.map((x) => x.mot);
}

/** Noms proches d'un nom inconnu : les plus proches (moteur/proches.js), chacun suivi des autres noms de la même icône. */
function nomsProches(nom, { max = 4 } = {}) {
  const d = charger();
  const P = require('../../moteur/proches.js');
  const tous = [...Object.keys(d.icones), ...Object.keys(d.alias)];
  const r = [];
  for (const p of P.proches(nom, tous, { max: 3 })) {
    const c = resoudre(p);
    const autres = [c, ...Object.keys(d.alias).filter((a) => d.alias[a] === c)];
    for (const x of [p, ...autres.sort((a, b) => (a === c ? -1 : b === c ? 1 : 0))]) if (!r.includes(x)) r.push(x);
  }
  return r.slice(0, max);
}

// --- Dans une scène -----------------------------------------------------------------------------------------------------

const BALISE = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUT_ICONE = /\sdata-icone\s*=\s*(?:"([^"]*)"|'([^']*)')/;

function preparerIcones(html, { scene = '' } = {}) {
  const texte = String(html);
  if (!/data-icone/.test(texte)) return { html: texte, utilisees: [], erreurs: [] };
  const erreurs = [];
  const utilisees = [];
  const ou = scene ? `Scène « ${scene} » : ` : '';
  let sortie = '';
  let depuis = 0;
  BALISE.lastIndex = 0;
  let m;
  while ((m = BALISE.exec(texte))) {
    const [tout, balise, attributs] = m;
    const a = ATTRIBUT_ICONE.exec(attributs);
    if (!a) continue;
    const nom = (a[1] ?? a[2] ?? '').trim();
    if (balise.toLowerCase() !== 'svg') {
      erreurs.push({ regle: 'icone-mal-placee', gravite: 'erreur', ...(scene ? { scene } : {}),
        message: `${ou}data-icone="${nom}" est posé sur <${balise}> : une icône s'écrit <svg data-icone="${nom}"></svg>.` });
      continue;
    }
    // Fin de l'élément : balise auto-fermée, ou le </svg> qui suit.
    const autoFermee = /\/\s*$/.test(attributs);
    let fin = m.index + tout.length;
    if (!autoFermee) {
      const k = texte.toLowerCase().indexOf('</svg>', fin);
      if (k >= 0) fin = k + '</svg>'.length;
    }
    const liste = nom ? chemins(nom) : null;
    if (!liste) {
      const proches = nom ? nomsProches(nom) : [];
      erreurs.push({ regle: 'icone-inconnue', gravite: 'erreur', ...(scene ? { scene } : {}),
        message: `${ou}icône « ${nom} » inconnue ; ${proches.length ? `noms proches : ${proches.join(', ')}.` : 'cherchez-en une par un mot avec « pulse-motion icones chercher <mot> ».'}` });
      BALISE.lastIndex = fin;
      continue;
    }
    const propres = autoFermee ? attributs.replace(/\/\s*$/, '') : attributs;
    sortie += texte.slice(depuis, m.index) + ouvrirSvg(propres) + corpsIcone(liste) + '</svg>';
    depuis = fin;
    BALISE.lastIndex = fin;
    if (!utilisees.includes(nom)) utilisees.push(nom);
  }
  return { html: sortie + texte.slice(depuis), utilisees, erreurs };
}

module.exports = { charger, resoudre, existe, chemins, cheminsPour, svgIcone, chercher, motsFrancais, nomsProches, normaliser,
  preparerIcones, FICHIER_ICONES, FICHIER_FR };
