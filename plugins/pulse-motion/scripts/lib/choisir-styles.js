'use strict';
/* Pulse Motion – choisir un style en le regardant (spec Styles et réalisation, 5.6 point 4) : une page locale où les styles
 * livrés et les styles personnels vérifiés jouent le même contenu témoin (la boucle de leurs huit scènes, « la chaîne du
 * froid ») en direct dans le moteur, rangés et filtrés par catégorie. La personne en coche un, ajoute une note, clique sur
 * « Envoyer à Claude » : la commande rend { ok: true, style, note } et s'arrête.
 *
 *   choisirStyles({ categorie?, delai?, port?, surPret?, dossierStyles? }) -> Promise<{ ok, style, note } | { ok: false, message }>
 *
 * Servie comme « pulse-motion mouvements choisir » (lib/page-choix.js : garde commune, JSON seulement, délai). */
const fs = require('node:fs');
const path = require('node:path');
const { servirChoix, injecterDonnees, DELAI_DEFAUT, MESSAGE_DELAI } = require('./page-choix.js');
const { CATEGORIES } = require('./contrat.js');

const NOTE_MAX = 300;

/** Styles proposés, dans l'ordre des catégories puis des noms : [{ style, personnel, categorie, nomCategorie, … }]. */
function stylesAChoisir({ categorie = null, dossierStyles } = {}) {
  const { listerStyles, trouverStyle, lireJSON } = require('../styles.js');
  const rang = (c) => { const i = CATEGORIES.findIndex((x) => x.id === c); return i < 0 ? CATEGORIES.length : i; };
  return listerStyles(dossierStyles)
    .filter((f) => f.verifie && (!categorie || f.categorie === categorie))
    .map((f) => {
      const identite = lireJSON(path.join(trouverStyle(f.style, dossierStyles).dossier, 'identite.json')) || {};
      const c = CATEGORIES.find((x) => x.id === f.categorie);
      return {
        style: f.style, personnel: f.personnel, categorie: f.categorie || 'autres', nomCategorie: c ? c.nom : 'Autres styles',
        personnalite: f.personnalite, usages: f.usages, nonPas: typeof identite.nonPas === 'string' ? identite.nonPas : '', signature: f.signature,
      };
    })
    .sort((a, b) => rang(a.categorie) - rang(b.categorie) || (a.personnel === b.personnel ? 0 : a.personnel ? 1 : -1) || (a.style < b.style ? -1 : 1));
}

/** Page de la boucle témoin d'un style, assemblée à la demande (elle est autonome : polices et images comprises). */
function pageBoucle(st, dossierStyles) {
  const { projetBoucle } = require('./temoin.js');
  const { assembler } = require('../assembler.js');
  const dossier = projetBoucle({ dossierStyle: st.dossier });
  try {
    const r = assembler({ dossier, dossierStyles, ecrire: false });
    if (!r.ok) throw new Error(r.erreurs.map((x) => x.message || x).join(' '));
    return r.html;
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 3 });
  }
}

function choisirStyles({ categorie = null, delai = DELAI_DEFAUT, port = 0, surPret = () => {}, dossierStyles } = {}) {
  const { trouverStyle } = require('../styles.js');
  if (categorie && !CATEGORIES.some((c) => c.id === categorie)) {
    return Promise.resolve({ ok: false, message: `Catégorie inconnue « ${categorie} ». Catégories : ${CATEGORIES.map((c) => c.id).join(', ')}.` });
  }
  let styles;
  let pageChoix;
  try {
    styles = stylesAChoisir({ categorie, dossierStyles });
    if (!styles.length) return Promise.resolve({ ok: false, message: 'Aucun style à montrer dans cette catégorie.' });
    pageChoix = injecterDonnees(fs.readFileSync(path.join(__dirname, '..', '..', 'moteur', 'choisir', 'styles.html'), 'utf8'), { styles });
  } catch (e) {
    return Promise.resolve({ ok: false, message: `La page de choix n'a pas pu être préparée : ${e.message}` });
  }
  const noms = new Set(styles.map((s) => s.style));
  const videos = new Map();
  return servirChoix({
    delai, port, surPret,
    pages: (chemin) => {
      if (chemin === '/') return pageChoix;
      const m = /^\/video\/([a-z0-9-]+)$/.exec(chemin);
      if (!m || !noms.has(m[1])) return null;
      if (!videos.has(m[1])) videos.set(m[1], pageBoucle(trouverStyle(m[1], dossierStyles), dossierStyles));
      return videos.get(m[1]);
    },
    lireEnvoi: (corps) => {
      if (!corps || !noms.has(corps.style)) throw new Error('style inconnu');
      return { style: corps.style, note: String(corps.note || '').trim().slice(0, NOTE_MAX) };
    },
  });
}

module.exports = { choisirStyles, stylesAChoisir, pageBoucle, MESSAGE_DELAI, NOTE_MAX };
