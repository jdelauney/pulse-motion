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
 *   node scripts/modeles.js apercu <id>                ouvre l'exemple fini du modèle (page autonome), assemblé dans un dossier
 *                                                      temporaire : rien n'est écrit dans le dossier courant (spec Retouches et
 *                                                      ergonomie, 5.3, point 5) ; PM_SANS_OUVRIR=1 : rien n'est ouvert
 *
 * Sortie JSON. Code 1 si le modèle demandé n'existe pas ou si la copie est refusée ; `trouver` rend null (code 0) sans modèle.
 */
const fs = require('node:fs');
const path = require('node:path');
const { GENRES, RATIOS, TRANSITIONS, TYPES_SCENE } = require('./lib/deroule.js');
const { AMBIANCES } = require('../moteur/synthe/catalogue.js');

const RACINE = path.join(__dirname, '..');
const DOSSIER_MODELES = path.join(RACINE, 'modeles', 'videos');
const DOSSIER_EXEMPLES = path.join(RACINE, 'exemples');
const ECART_DUREE = 0.15;
const CLES_FACULTATIVES = ['point3', 'point4'];
const APPAREILS = ['ordinateur', 'tablette', 'telephone'];

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
  // Réglages du déroulé allumés d'office par le modèle (spec S7, décision 7.8) : caméra automatique, bruitages automatiques.
  if (m.reglages !== undefined) {
    const r = m.reglages;
    if (!r || typeof r !== 'object' || Array.isArray(r)) err.push('« reglages » doit être un objet, ex. { "camera": "auto", "bruitages": { "auto": true } }.');
    else {
      for (const cle of Object.keys(r)) if (!['camera', 'bruitages'].includes(cle)) err.push(`« reglages.${cle} » inconnu : seuls « camera » et « bruitages » se règlent par un modèle.`);
      if (r.camera !== undefined && !['auto', 'fixe'].includes(r.camera)) err.push('« reglages.camera » doit valoir « auto » ou « fixe ».');
      if (r.bruitages !== undefined && !(r.bruitages && typeof r.bruitages === 'object' && [true, false, 'minimal'].includes(r.bruitages.auto))) err.push('« reglages.bruitages » doit être { "auto": true }, { "auto": "minimal" } ou { "auto": false }.');
    }
  }

  const typesParStyle = Object.fromEntries(styles.filter((s) => livres.includes(s)).map((s) => [s, typesDuStyle(s)]));
  err.push(...validerScenes(m.scenes, m.duree, typesParStyle, ''));
  // Déclinaison (spec S6, 5.17) : une variante d'un autre format, avec ses propres scènes (« astuce en 30 s » en 9:16).
  if (m.declinaison !== undefined) {
    const v = m.declinaison;
    if (!v || typeof v !== 'object') err.push('« declinaison » doit être un objet.');
    else {
      for (const champ of ['id', 'nom']) if (!estTexte(v[champ])) err.push(`« declinaison.${champ} » manque.`);
      if (!RATIOS.includes(v.format)) err.push(`« declinaison.format » doit être l'un de : ${RATIOS.join(', ')}.`);
      if (!(typeof v.duree === 'number' && v.duree > 0)) err.push('« declinaison.duree » doit être un nombre de secondes.');
      if (v.appareil !== undefined && !APPAREILS.includes(v.appareil)) err.push(`« declinaison.appareil » doit être l'un de : ${APPAREILS.join(', ')}.`);
      if (v.etapes !== undefined && !(Number.isInteger(v.etapes) && v.etapes > 0)) err.push('« declinaison.etapes » doit être un nombre d\'étapes.');
      err.push(...validerScenes(v.scenes, v.duree, typesParStyle, 'déclinaison, '));
    }
  }
  return err;
}

/**
 * Scènes d'un modèle (ou de sa déclinaison). Une scène a un `type` (scène toute faite, vérifiée contre chaque style conseillé)
 * ou est une scène d'écran (spec S6, 5.17) : `{ "ecran": true, "etapes": "<quelles étapes du film>" }`, montrée dans le
 * composant commun `pm-ecran`, sans `type` ; ses `textes` sont libres (une consigne, un titre posé sur l'écran), `suivre`
 * (la caméra suit les clics) et `projecteur` (l'étape mise en valeur) facultatifs. Une scène d'écran d'un modèle tient la place
 * de toutes les scènes filmées de ce passage (une pour 1 à 3 étapes) : sa durée est la leur, en tout.
 */
function validerScenes(liste, dureeTotale, typesParStyle, prefixe) {
  const err = [];
  const scenes = Array.isArray(liste) ? liste : [];
  if (!scenes.length) err.push(`« ${prefixe ? 'declinaison.' : ''}scenes » doit lister au moins une scène.`);
  const { trouver } = require('./mouvements.js');
  const ids = new Set();
  scenes.forEach((s, i) => {
    const nom = `${prefixe}scène ${i + 1}${s && s.id ? ` (${s.id})` : ''}`;
    if (!s || !/^[a-z0-9-]+$/.test(String(s.id || ''))) err.push(`La ${nom} : « id » en minuscules et tirets.`);
    else if (ids.has(s.id)) err.push(`La ${nom} : id en double.`);
    else ids.add(s.id);
    if (!s) return;
    if (!estTexte(s.intention)) err.push(`La ${nom} : « intention » manque.`);
    if (!(typeof s.duree === 'number' && s.duree >= 1.5)) err.push(`La ${nom} : « duree » doit être un nombre d'au moins 1,5 s.`);
    if (!TRANSITIONS.includes(s.transition)) err.push(`La ${nom} : « transition » doit être l'une de : ${TRANSITIONS.join(', ')}.`);
    if (s.ecran !== undefined) {
      if (s.ecran !== true) err.push(`La ${nom} : « ecran » vaut true (scène d'écran) ou manque.`);
      if (s.type !== undefined) err.push(`La ${nom} : une scène d'écran n'a pas de « type » (elle est montrée dans l'écran commun).`);
      if (!estTexte(s.etapes)) err.push(`La ${nom} : « etapes » doit dire quelles étapes du film la scène montre.`);
      if (s.suivre !== undefined && typeof s.suivre !== 'boolean') err.push(`La ${nom} : « suivre » vaut true ou false.`);
      if (s.projecteur !== undefined && !estTexte(s.projecteur)) err.push(`La ${nom} : « projecteur » doit dire quelle étape mettre en valeur.`);
      if (s.textes !== undefined) {
        if (!s.textes || typeof s.textes !== 'object') err.push(`La ${nom} : « textes » doit donner une consigne par texte.`);
        else for (const [cle, consigne] of Object.entries(s.textes)) if (!estTexte(consigne)) err.push(`La ${nom} : consigne vide pour « ${cle} ».`);
      }
    } else {
      if (!TYPES_SCENE.includes(s.type)) {
        err.push(`La ${nom} : type inconnu « ${s.type} » ; types : ${TYPES_SCENE.join(', ')} (ou une scène d'écran : "ecran": true).`);
      } else {
        for (const [style, types] of Object.entries(typesParStyle)) {
          if (!types[s.type]) { err.push(`La ${nom} : le style « ${style} » n'a pas de scène « ${s.type} ».`); continue; }
          for (const cle of Object.keys(s.textes || {})) {
            if (!types[s.type].includes(cle)) err.push(`La ${nom} : clé de texte inconnue « ${cle} » pour « ${s.type} » (${style}) ; clés : ${types[s.type].join(', ')}.`);
          }
          // Toutes les clés du type sont attendues, sauf les 3e et 4e points d'une liste (2 à 4 points).
          for (const cle of types[s.type].filter((k) => !CLES_FACULTATIVES.includes(k))) {
            if (s.textes && !Object.hasOwn(s.textes, cle)) err.push(`La ${nom} : il manque la consigne de « ${cle} » (${s.type}).`);
          }
        }
      }
      if (!s.textes || typeof s.textes !== 'object' || !Object.keys(s.textes).length) err.push(`La ${nom} : « textes » doit donner une consigne par texte.`);
      else for (const [cle, consigne] of Object.entries(s.textes)) if (!estTexte(consigne)) err.push(`La ${nom} : consigne vide pour « ${cle} ».`);
    }
    for (const mv of s.mouvements || []) {
      const cle = typeof mv === 'string' ? mv : mv && mv.mouvement;
      if (!trouver(cle)) err.push(`La ${nom} : mouvement introuvable « ${cle} » dans le dictionnaire.`);
    }
    if (s.effet !== undefined && !fs.existsSync(path.join(RACINE, 'effets', `${s.effet}.json`))) err.push(`La ${nom} : effet inconnu « ${s.effet} ».`);
  });
  if (scenes.length && typeof dureeTotale === 'number') {
    const total = scenes.reduce((t, s) => t + (s && typeof s.duree === 'number' ? s.duree : 0), 0);
    if (Math.abs(total - dureeTotale) > dureeTotale * ECART_DUREE) err.push(`Les scènes ${prefixe ? 'de la déclinaison ' : ''}durent ${total} s en tout, trop loin des ${dureeTotale} s annoncées (±15 %).`);
  }
  return err;
}

// Mots qui désignent chaque modèle. Un mot fort dit le genre de vidéo (« formation », « pitch », « bienvenue ») et compte 3 ; un
// mot faible le suggère seulement (« application », « ouverture ») et compte 1. Le modèle au plus haut score l'emporte ; à
// égalité, le premier de cette liste (du plus particulier au plus général).
const NOUVEAUX = 'nouvel|nouvelle|nouveau|nouveaux|nouvelles';
const ARRIVANTS = 'arrivant|salarie|employe|collegue|collaborateur|benevole|adherent|membre|eleve|habitant|recrue|stagiaire|infirmier|agent';
const MOTS_CLES = [
  ['pitch', ['pitch', 'pitcher', 'investisseur', 'levee de fonds', 'lever des fonds', 'jury', 'appel a projets', 'business angel', 'financement participatif', 'mini entreprise'], ['concours', 'startup']],
  ['annonce', ['annonce', 'annoncer', 'lancement', 'nouveaute', 'evenement', 'inauguration', 'portes ouvertes', 'marche de noel'], ['ouverture', 'fete', 'salon', 'inscription', 'webinaire', 'bientot', 'lancer']],
  ['accueil', ['bienvenue', 'accueil', 'accueillir', `(${NOUVEAUX}) (${ARRIVANTS})`, 'prise en main', 'onboarding', 'premier jour'], ['integration']],
  ['publication-sociale', ['reseaux sociaux', 'reseau social', 'reseaux', 'instagram', 'tiktok', 'linkedin', 'facebook', 'reels', 'stories'], ['publication', 'post', 'story', 'short']],
  ['presentation-produit', ['produit', 'presentation', 'presenter'], ['application', 'appli', 'logiciel', 'service', 'offre', 'outil', 'fonctionnalite', 'plateforme']],
  ['histoire', ['histoire', 'raconter', 'raconte', 'recit', 'storytelling', 'est ne', 'est nee'], ['parcours', 'aventure', 'origine']],
  // Vidéo explicative (spec S7, 5.17) : un mécanisme, un trajet, « comment ça marche » ; avant la formation (« expliquer »
  // seul reste une formation).
  ['explication', ['video explicative', 'explicative', 'explication', 'explique comment', 'expliquer comment', 'comment fonctionne', 'comment ca marche', 'mecanisme', 'trajet'], ['schema', 'circuit', 'fonctionnement', 'processus', 'cycle']],
  ['formation-courte', ['formation', 'former', 'tutoriel', 'apprendre', 'expliquer', 'consigne', 'procedure', 'regle', 'bonnes pratiques', 'geste', 'sensibilisation', 'rappel'], ['securite', 'hygiene', 'comprendre', 'prevention']],
  // Tutoriel de logiciel (spec S6, 5.16) : une adresse de site, « filme… », un logiciel ; « tutoriel » seul reste une formation
  // courte (égalité : la formation, plus haut), « tutoriel » et un mot de logiciel donnent le tutoriel logiciel.
  ['tutoriel-logiciel', ['tutoriel', 'logiciel', 'filme', 'filmer', 'tutoriel logiciel', 'appli d essai', 'http', 'https', 'www', '[a-z0-9]+ (fr|com|net|org|io|eu|be|ch)'], ['application', 'appli', 'site', 'intranet', 'extranet', 'plateforme', 'espace numerique', 'formulaire', 'saisir', 'en ligne', 'comment [a-z]+ .*dans']],
];

/** Expression d'un mot-clé : mots entiers, pluriel en s ou x permis (« règles », « nouveaux arrivants »). */
const motif = (mot) => new RegExp(` ${mot.split(' ').map((x) => `${x}[sx]?`).join(' ')} `);

/** Modèle qui correspond au sujet (mots-clés, sans accents ni casse, pluriels compris), ou null. */
function trouverModele(sujet) {
  const { normaliser } = require('./mouvements.js');
  const texte = ` ${normaliser(sujet).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (!texte.trim()) return null;
  let meilleur = null;
  let score = 0;
  for (const [id, forts, faibles] of MOTS_CLES) {
    const s = 3 * forts.filter((m) => motif(m).test(texte)).length + faibles.filter((m) => motif(m).test(texte)).length;
    if (s > score) { score = s; meilleur = id; }
  }
  return meilleur ? lireModele(meilleur) : null;
}

/** Copie l'exemple fini du modèle `id` dans `dossier` (sans vidéo) ; -> { ok, dossier, titre } ou { ok: false, message }. */
function copierExemple(id, dossier) {
  const m = lireModele(id);
  if (!m) return { ok: false, message: `Modèle inconnu « ${id} ». Modèles : ${listerModeles().map((x) => x.id).join(', ')}.` };
  const source = path.join(DOSSIER_EXEMPLES, m.exemple || m.id);
  if (!fs.existsSync(path.join(source, 'deroule.json'))) return { ok: false, message: `Le modèle « ${id} » n'a pas encore d'exemple fini.` };
  const cible = path.resolve(dossier || '.');
  if (['deroule.json', 'scenes'].some((f) => fs.existsSync(path.join(cible, f)))) {
    return { ok: false, message: 'Ce dossier contient déjà une vidéo : rien n\'a été copié. Choisissez un dossier vide.' };
  }
  fs.mkdirSync(cible, { recursive: true });
  // Ni les sorties ni l'état d'une séance, ni son récit (exemple.json), ni l'appli d'essai du tutoriel logiciel (appli/,
  // servie par le plugin lui-même) : seulement la vidéo.
  fs.cpSync(source, cible, { recursive: true, force: false, filter: (f) => !/^(sortie|\.pulse-motion|\.historique|exemple\.json|appli)([\\/]|$)/.test(path.relative(source, f)) });
  // La vidéo est finie : son déroulé et son style sont déjà acceptés (reprendre ouvre l'aperçu au lieu de redemander l'accord).
  const { donnerAccord } = require('./etat.js');
  donnerAccord(cible, 'deroule');
  donnerAccord(cible, 'style');
  const titre = JSON.parse(fs.readFileSync(path.join(cible, 'deroule.json'), 'utf8')).titre;
  return { ok: true, dossier: cible, titre };
}

/** Dossier temporaire fixe d'un exemple (vidé à chaque ouverture : un seul exemplaire par modèle). */
const dossierApercu = (id) => path.join(require('node:os').tmpdir(), 'pulse-motion', 'exemples', id);

/**
 * Exemple fini du modèle assemblé dans un dossier temporaire, puis ouvert dans le navigateur.
 * -> { ok, id, dossier, fichier, titre } | { ok: false, message }
 */
function apercuExemple(id, { ouvrir = true, ouvrirFichier = null, dossier = null } = {}) {
  const m = lireModele(id);
  if (!m) return { ok: false, message: `Modèle inconnu « ${id || ''} ». Modèles : ${listerModeles().map((x) => x.id).join(', ')}.` };
  const cible = dossier ? path.resolve(dossier) : dossierApercu(m.id);
  fs.rmSync(cible, { recursive: true, force: true });
  const copie = copierExemple(m.id, cible);
  if (!copie.ok) return copie;
  const a = require('./assembler.js').assembler({ dossier: cible });
  if (!a.ok || !a.fichier) return { ok: false, message: `L'exemple du modèle « ${m.nom} » n'a pas pu être assemblé.` };
  if (ouvrir) {
    const ouvre = ouvrirFichier || ((f) => require('./apercu.js').ouvrirNavigateur(require('node:url').pathToFileURL(f).href));
    ouvre(a.fichier);
  }
  return { ok: true, id: m.id, nom: m.nom, dossier: cible, fichier: a.fichier, titre: copie.titre };
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
    // Aucun modèle n'est pas une erreur : la création continue sans modèle.
    ecrire(trouverModele(reste.join(' ')));
    return 0;
  }
  if (commande === 'exemple') {
    const r = copierExemple(reste[0], reste[1] || '.');
    ecrire(r);
    return r.ok ? 0 : 1;
  }
  if (commande === 'apercu') {
    const r = apercuExemple(reste[0]);
    ecrire(r);
    return r.ok ? 0 : 1;
  }
  console.error('Usage : pulse-motion modeles liste | afficher <id> | trouver "<sujet>" | exemple <id> <dossier> | apercu <id>');
  return 2;
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2));

module.exports = { listerModeles, lireModele, validerModele, trouverModele, copierExemple, apercuExemple, dossierApercu, stylesLivres, principal };
