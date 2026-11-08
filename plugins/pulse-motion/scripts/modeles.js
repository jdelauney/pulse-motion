#!/usr/bin/env node
'use strict';
/* Pulse Motion – modèles de vidéo : partir d'une structure éprouvée plutôt que d'une page blanche. Chaque modèle
 * (modeles/videos/<id>.json) donne le genre, le format, la durée, les styles conseillés, l'ambiance musicale, des phrases
 * de départ et ses scènes (type, intention, durée, transition, consignes de texte, mouvements, effet). Chacun a un exemple
 * fini dans exemples/<exemple>/.
 *
 *   node scripts/modeles.js liste                      les modèles (id, nom, genre, format, durée, description)
 *   node scripts/modeles.js afficher <id>              le modèle complet
 *   node scripts/modeles.js trouver "<sujet>"          le modèle qui correspond au sujet, ou null
 *   node scripts/modeles.js exemple <id> <dossier>     copie l'exemple fini du modèle dans un dossier sans vidéo
 *
 * Sortie JSON. Code 1 si rien n'est trouvé ou si la copie est refusée.
 */
const fs = require('node:fs');
const path = require('node:path');
const { GENRES, RATIOS, TRANSITIONS, TYPES_SCENE } = require('./lib/deroule.js');
const { AMBIANCES } = require('../moteur/synthe/catalogue.js');

const RACINE = path.join(__dirname, '..');
const DOSSIER_MODELES = path.join(RACINE, 'modeles', 'videos');
const DOSSIER_EXEMPLES = path.join(RACINE, 'exemples');
const ECART_DUREE = 0.15;

/** Styles livrés avec le plugin (ceux qui ont un catalogue de scènes toutes faites). */
function stylesLivres() {
  const dossier = path.join(RACINE, 'styles');
  return fs.readdirSync(dossier).filter((s) => fs.existsSync(path.join(dossier, s, 'catalogue.json'))).sort();
}

/** Scènes toutes faites d'un style : { <type>: [clés de texte] }. */
function typesDuStyle(style) {
  const c = JSON.parse(fs.readFileSync(path.join(RACINE, 'styles', style, 'catalogue.json'), 'utf8'));
  return Object.fromEntries(c.scenes.map((s) => [s.nom, Object.keys(s.textes || {})]));
}

function listerModeles() {
  if (!fs.existsSync(DOSSIER_MODELES)) return [];
  return fs.readdirSync(DOSSIER_MODELES).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DOSSIER_MODELES, f), 'utf8')));
}

function lireModele(id) {
  if (!/^[a-z0-9-]+$/.test(String(id || ''))) return null;
  const fichier = path.join(DOSSIER_MODELES, `${id}.json`);
  return fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : null;
}

const estTexte = (x) => typeof x === 'string' && x.trim().length > 0;

/**
 * -> messages (vide si le modèle est bon). Les valeurs de `textes` sont des consignes (« le sujet en quelques mots ») : la
 * longueur du texte réellement écrit est vérifiée à la création par le contrôle, d'après le catalogue du style.
 */
function validerModele(m) {
  const err = [];
  if (!m || typeof m !== 'object') return ['Le modèle doit être un objet.'];
  for (const champ of ['id', 'nom', 'description', 'pourQui']) if (!estTexte(m[champ])) err.push(`« ${champ} » manque.`);
  if (!GENRES.includes(m.genre)) err.push(`« genre » doit être l'un de : ${GENRES.join(', ')}.`);
  if (!RATIOS.includes(m.format)) err.push(`« format » doit être l'un de : ${RATIOS.join(', ')}.`);
  if (!(typeof m.duree === 'number' && m.duree > 0)) err.push('« duree » doit être un nombre de secondes.');
  if (typeof m.sousTitres !== 'boolean') err.push('« sousTitres » doit valoir true ou false.');
  if (!m.musique || !Object.hasOwn(AMBIANCES, m.musique.ambiance)) err.push(`« musique.ambiance » doit être l'une de : ${Object.keys(AMBIANCES).join(', ')}.`);
  const livres = stylesLivres();
  const styles = Array.isArray(m.styles) ? m.styles : [];
  if (styles.length !== 3) err.push('« styles » doit citer 3 styles, le recommandé en premier.');
  for (const s of styles) if (!livres.includes(s)) err.push(`Style inconnu « ${s} » ; styles livrés : ${livres.join(', ')}.`);
  const phrases = Array.isArray(m.phrases) ? m.phrases : [];
  if (phrases.length < 2 || phrases.length > 3) err.push('« phrases » doit donner 2 ou 3 phrases.');
  for (const p of phrases) if (!/^\/pulse-motion:creer \S/.test(String(p))) err.push(`Phrase « ${p} » : elle doit commencer par « /pulse-motion:creer ».`);
  for (const v of ['grandPublic', 'professionnels', 'eleves']) {
    if (!m.variantes || !/^\/pulse-motion:creer \S/.test(String(m.variantes[v] || ''))) err.push(`« variantes.${v} » doit être une phrase « /pulse-motion:creer … ».`);
  }
  if (m.exemple !== undefined && !/^[a-z0-9-]+$/.test(String(m.exemple))) err.push('« exemple » doit être un nom de dossier d\'exemples/.');

  const scenes = Array.isArray(m.scenes) ? m.scenes : [];
  if (!scenes.length) err.push('« scenes » doit lister au moins une scène.');
  const typesParStyle = Object.fromEntries(styles.filter((s) => livres.includes(s)).map((s) => [s, typesDuStyle(s)]));
  const { trouver } = require('./mouvements.js');
  const ids = new Set();
  scenes.forEach((s, i) => {
    const nom = `scène ${i + 1}${s && s.id ? ` (${s.id})` : ''}`;
    if (!s || !/^[a-z0-9-]+$/.test(String(s.id || ''))) err.push(`La ${nom} : « id » en minuscules et tirets.`);
    else if (ids.has(s.id)) err.push(`La ${nom} : id en double.`);
    else ids.add(s.id);
    if (!s) return;
    if (!estTexte(s.intention)) err.push(`La ${nom} : « intention » manque.`);
    if (!(typeof s.duree === 'number' && s.duree >= 1.5)) err.push(`La ${nom} : « duree » doit être un nombre d'au moins 1,5 s.`);
    if (!TRANSITIONS.includes(s.transition)) err.push(`La ${nom} : « transition » doit être l'une de : ${TRANSITIONS.join(', ')}.`);
    if (!TYPES_SCENE.includes(s.type)) {
      err.push(`La ${nom} : type inconnu « ${s.type} » ; types : ${TYPES_SCENE.join(', ')}.`);
    } else {
      for (const [style, types] of Object.entries(typesParStyle)) {
        if (!types[s.type]) { err.push(`La ${nom} : le style « ${style} » n'a pas de scène « ${s.type} ».`); continue; }
        for (const cle of Object.keys(s.textes || {})) {
          if (!types[s.type].includes(cle)) err.push(`La ${nom} : clé de texte inconnue « ${cle} » pour « ${s.type} » (${style}) ; clés : ${types[s.type].join(', ')}.`);
        }
      }
    }
    if (!s.textes || typeof s.textes !== 'object' || !Object.keys(s.textes).length) err.push(`La ${nom} : « textes » doit donner une consigne par texte.`);
    else for (const [cle, consigne] of Object.entries(s.textes)) if (!estTexte(consigne)) err.push(`La ${nom} : consigne vide pour « ${cle} ».`);
    for (const mv of s.mouvements || []) {
      const cle = typeof mv === 'string' ? mv : mv && mv.mouvement;
      if (!trouver(cle)) err.push(`La ${nom} : mouvement introuvable « ${cle} » dans le dictionnaire.`);
    }
    if (s.effet !== undefined && !fs.existsSync(path.join(RACINE, 'effets', `${s.effet}.json`))) err.push(`La ${nom} : effet inconnu « ${s.effet} ».`);
  });
  if (scenes.length && typeof m.duree === 'number') {
    const total = scenes.reduce((t, s) => t + (s && typeof s.duree === 'number' ? s.duree : 0), 0);
    if (Math.abs(total - m.duree) > m.duree * ECART_DUREE) err.push(`Les scènes durent ${total} s en tout, trop loin des ${m.duree} s annoncées (±15 %).`);
  }
  return err;
}

// Mots qui désignent chaque modèle, du plus particulier au plus général : « le lancement de notre nouvelle offre » est une
// annonce avant d'être une présentation de produit.
const MOTS_CLES = [
  ['pitch', ['pitch', 'investisseur', 'levee de fonds', 'lever des fonds', 'jury', 'appel a projets', 'business angel', 'financement participatif', 'mini entreprise']],
  ['annonce', ['annonce', 'annoncer', 'lancement', 'lancer', 'nouveaute', 'evenement', 'inauguration', 'ouverture', 'portes ouvertes', 'fete', 'salon', 'inscription', 'webinaire', 'bientot', 'marche de noel']],
  ['accueil', ['bienvenue', 'accueil', 'accueillir', 'nouvel arrivant', 'nouveaux arrivants', 'nouvelle recrue', 'nouveau salarie', 'nouveaux salaries', 'nouveaux benevoles', 'nouveaux adherents', 'nouveaux eleves', 'prise en main', 'integration', 'onboarding', 'premier jour']],
  ['publication-sociale', ['reseaux sociaux', 'reseau social', 'reseaux', 'instagram', 'tiktok', 'linkedin', 'facebook', 'reel', 'story', 'short', 'publication', 'post']],
  ['presentation-produit', ['produit', 'application', 'appli', 'logiciel', 'service', 'offre', 'outil', 'fonctionnalite', 'plateforme', 'presenter notre', 'presentation de notre']],
  ['histoire', ['histoire', 'raconter', 'raconte', 'recit', 'parcours', 'storytelling', 'aventure', 'origine', 'est ne', 'est nee']],
  ['formation-courte', ['formation', 'former', 'tutoriel', 'apprendre', 'expliquer', 'comprendre', 'consigne', 'securite', 'hygiene', 'procedure', 'regle', 'bonnes pratiques', 'geste', 'sensibilisation', 'rappel', 'cours']],
];

/** Modèle qui correspond au sujet (mots-clés, sans accents ni casse, pluriels compris), ou null. */
function trouverModele(sujet) {
  const { normaliser } = require('./mouvements.js');
  const texte = ` ${normaliser(sujet).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (!texte.trim()) return null;
  for (const [id, mots] of MOTS_CLES) {
    const ok = mots.some((mot) => new RegExp(` ${mot.split(' ').map((x) => `${x}[sx]?`).join(' ')} `).test(texte));
    if (ok) return lireModele(id);
  }
  return null;
}

/** Copie l'exemple fini du modèle `id` dans `dossier` (sans vidéo) ; -> { ok, dossier, titre } ou { ok: false, message }. */
function copierExemple(id, dossier) {
  const m = lireModele(id);
  if (!m) return { ok: false, message: `Modèle inconnu « ${id} ». Modèles : ${listerModeles().map((x) => x.id).join(', ')}.` };
  const source = path.join(DOSSIER_EXEMPLES, m.exemple || m.id);
  if (!fs.existsSync(path.join(source, 'deroule.json'))) return { ok: false, message: `Le modèle « ${id} » n'a pas encore d'exemple fini.` };
  const cible = path.resolve(dossier || '.');
  if (fs.existsSync(path.join(cible, 'deroule.json'))) {
    return { ok: false, message: 'Ce dossier contient déjà une vidéo : rien n\'a été copié. Choisissez un dossier vide.' };
  }
  fs.mkdirSync(cible, { recursive: true });
  // Ni les sorties ni l'état d'une séance, ni son récit (exemple.json) : seulement la vidéo.
  fs.cpSync(source, cible, { recursive: true, filter: (f) => !/^(sortie|\.pulse-motion|\.historique|exemple\.json)([\\/]|$)/.test(path.relative(source, f)) });
  const titre = JSON.parse(fs.readFileSync(path.join(cible, 'deroule.json'), 'utf8')).titre;
  return { ok: true, dossier: cible, titre };
}

function principal(args) {
  const [commande, ...reste] = args;
  const ecrire = (x) => console.log(JSON.stringify(x, null, 2));
  if (commande === 'liste') {
    ecrire(listerModeles().map(({ id, nom, genre, format, duree, description }) => ({ id, nom, genre, format, duree, description })));
    return 0;
  }
  if (commande === 'afficher') {
    const m = lireModele(reste[0]);
    if (!m) { console.error(`Modèle inconnu « ${reste[0] || ''} ». Modèles : ${listerModeles().map((x) => x.id).join(', ')}.`); return 1; }
    ecrire(m);
    return 0;
  }
  if (commande === 'trouver') {
    const m = trouverModele(reste.join(' '));
    ecrire(m);
    return m ? 0 : 1;
  }
  if (commande === 'exemple') {
    const r = copierExemple(reste[0], reste[1] || '.');
    ecrire(r);
    return r.ok ? 0 : 1;
  }
  console.error('Usage : pulse-motion modeles liste | afficher <id> | trouver "<sujet>" | exemple <id> <dossier>');
  return 2;
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2));

module.exports = { listerModeles, lireModele, validerModele, trouverModele, copierExemple, stylesLivres, principal };
