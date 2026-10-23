#!/usr/bin/env node
'use strict';
/* Pulse Motion – dictionnaire de mouvements : les mots du motion design, numérotés, chacun avec une phrase pour le
 * demander et la recette exacte que le moteur réalise (references/mouvements/mouvements.json).
 *
 *   node scripts/mouvements.js liste [--categorie <id>] [--json]   les mouvements, par catégorie
 *   node scripts/mouvements.js chercher <mots…> [--json]           par nom (français ou du métier), sens, mot-clé
 *   node scripts/mouvements.js afficher <n° ou nom> [--json]       la fiche complète, avec sa recette
 *   node scripts/mouvements.js reference                            le dictionnaire pour les animateurs (Markdown)
 *
 * Un numéro s'écrit 5, 05, 005 ou #005. Code 1 si rien n'est trouvé.
 */
const fs = require('node:fs');
const path = require('node:path');

const FICHIER = path.join(__dirname, '..', 'references', 'mouvements', 'mouvements.json');
let cache = null;

/** -> { version, source, categories, mouvements } */
function charger() {
  if (!cache) cache = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  return cache;
}

/** Minuscules, sans accents, tirets, apostrophes et espaces unifiés. */
function normaliser(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[-_'’&/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Numéro sous toutes ses écritures (5, 05, 005, #005), slug, nom français ou du métier -> entrée, ou null. */
function trouver(cle) {
  const { mouvements } = charger();
  const brut = String(cle ?? '').trim();
  const numero = /^#?(\d{1,3})$/.exec(brut);
  if (numero) return mouvements.find((e) => e.no === numero[1].padStart(3, '0')) || null;
  const n = normaliser(brut);
  if (!n) return null;
  return mouvements.find((e) => normaliser(e.slug) === n || normaliser(e.nom.fr) === n || normaliser(e.nom.metier) === n) || null;
}

// Petits mots ignorés dans une recherche (« un pop-in sur le titre », « squash and stretch »).
const MOTS_VIDES = new Set(['a', 'au', 'aux', 'avec', 'and', 'de', 'des', 'du', 'en', 'et', 'la', 'le', 'les', 'l', 'd', 'un', 'une',
  'sur', 'pour', 'par', 'the', 'of', 'in', 'on', 'mets', 'met', 'fais', 'fait', 'titre', 'texte', 'scene']);
// Pluriel ou variante simple : « rebonds » → « rebond », « lettres » → « lettre ».
const racine = (mot) => (mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot);

/**
 * Entrées proches des mots cherchés (nom, sens, mots-clés, slug), les plus proches d'abord : celles qui contiennent tous les
 * mots, puis, s'il n'y en a aucune, celles qui en contiennent le plus.
 */
function chercher(mots) {
  const normal = normaliser(Array.isArray(mots) ? mots.join(' ') : mots);
  const termes = normal.split(' ').filter((t) => t && !MOTS_VIDES.has(t)).map(racine);
  if (!termes.length) return [];
  const requete = termes.join(' ');
  const resultats = [];
  for (const e of charger().mouvements) {
    const noms = [e.nom.fr, e.nom.metier, e.slug].map(normaliser);
    const cles = e.motsCles.map(normaliser);
    const tout = [...noms, ...cles, normaliser(e.sens)].join(' | ');
    const trouves = termes.filter((t) => tout.includes(t)).length;
    if (!trouves) continue;
    let score = 0;
    if (noms.includes(normal) || noms.includes(requete)) score += 100;
    else if (noms.some((x) => x.includes(requete))) score += 50;
    if (cles.includes(requete)) score += 30;
    else if (cles.some((x) => x.includes(requete))) score += 15;
    resultats.push({ e, score, complet: trouves === termes.length, trouves });
  }
  const complets = resultats.filter((r) => r.complet);
  const choisis = complets.length ? complets : resultats;
  return choisis.sort((a, b) => b.trouves - a.trouves || b.score - a.score || a.e.no.localeCompare(b.e.no)).map((x) => x.e);
}

/** Recette résumée sur une ligne. */
function recetteCourte(e) {
  const ligne = e.recette.exemple.replace(/\s*\n\s*/g, ' ');
  return ligne.length > 140 ? ligne.slice(0, 137) + '…' : ligne;
}

const ligneListe = (e) => `#${e.no}  ${e.nom.fr} (${e.nom.metier}) — ${e.sens}`;

function fiche(e) {
  const cat = charger().categories.find((c) => c.id === e.categorie);
  return [
    `#${e.no} ${e.nom.fr} — ${e.nom.metier}`,
    `Catégorie : ${cat ? cat.nom : e.categorie}`,
    `Sens : ${e.sens}`,
    `Pour le demander : « ${e.demande} »`,
    `Quand : ${e.quand}`,
    `Recette (${e.recette.type}) :`,
    e.recette.exemple,
    ...(e.recette.reglages.length ? ['Réglages :', ...e.recette.reglages.map((r) => `- ${r.nom} (${r.defaut}) : ${r.effet}`)] : []),
    ...(e.recette.note ? [`Note : ${e.recette.note}`] : []),
    ...(e.motionPrompt ? [`Motion Prompt : #${e.motionPrompt}`] : []),
  ].join('\n');
}

/** Le dictionnaire pour les animateurs : par catégorie, une ligne par entrée, puis la façon de l'appliquer. */
function referenceMarkdown() {
  const { categories, mouvements, source } = charger();
  const lignes = ['# Dictionnaire de mouvements', '',
    'Chaque mouvement a un numéro stable (#001…) et un nom : la personne peut demander « un pop-in sur le titre » ou « #001 ».',
    'Fiche complète, avec l\'extrait à copier : `pulse-motion mouvements afficher <n° ou nom>` ; recherche : `pulse-motion mouvements chercher <mot>`.', ''];
  for (const c of categories) {
    lignes.push(`## ${c.nom}`, '');
    for (const e of mouvements.filter((x) => x.categorie === c.id)) {
      lignes.push(`- **#${e.no} ${e.nom.fr}** (${e.nom.metier}) — ${e.sens}. \`${recetteCourte(e)}\``);
    }
    lignes.push('');
  }
  lignes.push('## Comment l\'appliquer', '',
    '- Lire la fiche (`afficher`) et reprendre son extrait : classe, attributs et chiffres **du mouvement** (durée, ampleur, courbe, répétitions) tels quels. Le moment d\'entrée (`data-start`) et les textes (`data-texte`), couleurs (variables de la charte) et images viennent de la scène.',
    '- Sur un élément d\'une scène toute faite, la classe `pm-m-*` remplace son entrée : retirer la classe d\'entrée du style (`entre-bas`, `tombe`, `claque`…) pour que le mouvement demandé soit le seul.',
    '- Reflet et soulignement se posent sur un `<span>` autour du texte, ou sur un conteneur autour d\'une image (une `<img>` ne peut pas les porter).',
    '- Les réglages se changent seulement si la personne le demande (« plus lent » : `--pm-dur` ; « plus fort » : `--pm-ampleur`).',
    '- Une transition (catégorie « Transitions entre scènes ») se règle dans `deroule.json`, sur la scène qui **entre** (`transition`), jamais dans le HTML.',
    '- Les mouvements qui se répètent (battement, tremblotement, aller-retour) s\'arrêtent toujours (`--pm-fois`) : la vidéo finit sur une image stable.',
    '', `_${source}_`, '');
  return lignes.join('\n');
}

function principal(args) {
  const json = args.includes('--json');
  const reste = args.filter((a) => a !== '--json');
  const [commande, ...mots] = reste;
  const ecrire = (valeur, texte) => console.log(json ? JSON.stringify(valeur, null, 2) : texte);
  const introuvable = (quoi) => {
    console.error(`Aucun mouvement « ${quoi} ». Essayez : pulse-motion mouvements chercher <mot>`);
    return 1;
  };
  if (commande === 'liste') {
    const i = mots.indexOf('--categorie');
    const cat = i >= 0 ? (mots[i + 1] || '') : null;
    const { categories, mouvements } = charger();
    if (cat !== null && !categories.some((c) => c.id === cat)) {
      console.error(`Catégorie inconnue « ${cat} ». Catégories : ${categories.map((c) => c.id).join(', ')}.`);
      return 1;
    }
    const choisis = mouvements.filter((e) => !cat || e.categorie === cat);
    const texte = categories.filter((c) => !cat || c.id === cat)
      .map((c) => [`${c.nom} :`, ...choisis.filter((e) => e.categorie === c.id).map((e) => '  ' + ligneListe(e))].join('\n')).join('\n\n');
    ecrire(choisis, texte);
    return 0;
  }
  if (commande === 'chercher') {
    const r = chercher(mots);
    if (!r.length) return introuvable(mots.join(' '));
    ecrire(r, r.map(ligneListe).join('\n'));
    return 0;
  }
  if (commande === 'afficher') {
    const e = trouver(mots.join(' '));
    if (!e) return introuvable(mots.join(' '));
    ecrire(e, fiche(e));
    return 0;
  }
  if (commande === 'reference') {
    process.stdout.write(referenceMarkdown());
    return 0;
  }
  console.error('Usage : pulse-motion mouvements liste [--categorie <id>] | chercher <mots…> | afficher <n° ou nom> | reference  [--json]');
  return 2;
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2));

module.exports = { charger, normaliser, trouver, chercher, referenceMarkdown, principal };
