'use strict';
// Pulse Motion – garde commune des serveurs locaux (aperçu, ateliers, page de choix, page de mesure).
// Les serveurs n'écoutent que sur 127.0.0.1, mais une page d'un autre site ouverte dans le même navigateur peut encore
// leur parler : par un nom de domaine rebranché sur 127.0.0.1 (« DNS rebinding »), par un envoi de formulaire, ou en
// incluant un script ou une image. La garde refuse tout ce qui ne vient pas de la page servie par Pulse Motion :
// - Host : seulement 127.0.0.1:<port> ou localhost:<port> ;
// - écritures (tout sauf GET et HEAD) : Origin obligatoire et égale à la page, Sec-Fetch-Site absent ou same-origin,
//   type de contenu déclaré par la route (jamais text/plain, formulaire ou multipart, qu'un autre site peut envoyer
//   sans demander la permission) ;
// - lectures de /_pm/… : pas depuis un autre site (Sec-Fetch-Site cross-site ou same-site) ;
// - OPTIONS : refusé, sans aucun en-tête CORS ;
// - toutes les réponses : nosniff, Cross-Origin-Resource-Policy same-origin, Referrer-Policy same-origin, no-store.
// Referrer-Policy vaut same-origin et non no-referrer : avec no-referrer, Chrome enverrait « Origin: null » sur les envois
// de la page elle-même (norme Fetch, « append a request Origin header »), que la garde refuserait.
// Principes repris d'explainroo (src/server.js : Host et Origin, fichiers filtrés, realpath, lstat ; MIT, voir
// THIRD-PARTY-NOTICES.md) ; rien n'est copié de lemo-opuscar ni de take-one.

const fs = require('node:fs');
const path = require('node:path');

/** Types qu'un autre site peut envoyer sans requête préalable : jamais admis pour une écriture. */
const TYPES_SIMPLES = ['text/plain', 'multipart/form-data', 'application/x-www-form-urlencoded'];

const MESSAGES = {
  hote: 'Accès refusé.',
  origine: 'Envoi refusé : il ne vient pas de la page de Pulse Motion.',
  lecture: 'Accès refusé : cette adresse ne sert que la page de Pulse Motion.',
  options: 'Méthode refusée.',
  type: 'Envoi refusé : type de contenu non accepté par cette adresse.',
  inconnue: 'Introuvable.',
};

const EN_TETES = {
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

const ECRITURE = (methode) => methode !== 'GET' && methode !== 'HEAD';

/** Type de contenu d'une requête, sans paramètres (« application/json; charset=utf-8 » -> « application/json »). */
function typeDe(req) {
  return String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
}

function origines(port) {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

function refuser(req, res, statut, cle) {
  req.resume();
  if (!res.headersSent) {
    res.writeHead(statut, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  res.end(MESSAGES[cle]);
  return false;
}

/**
 * Types déclarés pour une écriture. `types` est :
 * - une liste (la même pour toutes les écritures du serveur) ;
 * - ou une liste de paires [motif, types] : le premier motif qui correspond au chemin donne les types ; aucun motif ->
 *   la route n'existe pas (null).
 */
function typesDeclares(types, chemin) {
  if (!types) return null;
  if (types.length && Array.isArray(types[0])) {
    const route = types.find(([motif]) => (motif instanceof RegExp ? motif.test(chemin) : motif === chemin));
    return route ? route[1] : null;
  }
  return types;
}

/**
 * garder(req, res, { port, types }) -> true si la requête passe ; sinon la réponse (403, 404 ou 415) est déjà envoyée.
 * port : port d'écoute du serveur ; types : voir typesDeclares.
 */
function garder(req, res, { port, types } = {}) {
  for (const [nom, valeur] of Object.entries(EN_TETES)) res.setHeader(nom, valeur);
  const hote = String(req.headers.host || '').toLowerCase();
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(hote)) return refuser(req, res, 403, 'hote');

  const methode = req.method;
  const chemin = new URL(req.url, 'http://localhost').pathname;
  const site = req.headers['sec-fetch-site'];

  if (methode === 'OPTIONS') return refuser(req, res, 403, 'options');

  if (!ECRITURE(methode)) {
    if (chemin.startsWith('/_pm/') && site && !['same-origin', 'none'].includes(site)) return refuser(req, res, 403, 'lecture');
    return true;
  }

  const origine = String(req.headers.origin || '').toLowerCase();
  if (!origines(port).includes(origine) || (site && site !== 'same-origin')) return refuser(req, res, 403, 'origine');

  const admis = typesDeclares(types, chemin);
  if (!admis) return refuser(req, res, 404, 'inconnue');
  const type = typeDe(req);
  if (TYPES_SIMPLES.includes(type) || !admis.includes(type)) return refuser(req, res, 415, 'type');
  return true;
}

/** Extensions servies telles quelles depuis le projet : images, sons, polices. Jamais .json, .md, .html, .js. */
const EXTENSIONS_SERVIES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.woff', '.woff2', '.ttf', '.otf'];

/**
 * fichierServi(projet, relatif, { dossiers?, extensions? }) -> chemin absolu, ou null si le fichier ne doit pas être servi.
 * Refuse : un segment qui commence par « . », une extension hors liste, un premier dossier hors de `dossiers`, un chemin
 * qui sort du projet (y compris par un lien symbolique), un fichier absent ou qui n'est pas un fichier ordinaire.
 */
function fichierServi(projet, relatif, { dossiers = null, extensions = EXTENSIONS_SERVIES } = {}) {
  if (typeof relatif !== 'string' || !relatif || relatif.includes('\0')) return null;
  const segments = relatif.split(/[\\/]+/).filter(Boolean);
  if (!segments.length || segments.some((s) => s.startsWith('.'))) return null;
  if (path.isAbsolute(relatif) || /^[a-z]:/i.test(relatif)) return null;
  if (dossiers && !dossiers.includes(segments[0])) return null;
  if (!extensions.includes(path.extname(segments[segments.length - 1]).toLowerCase())) return null;

  let racine;
  try { racine = fs.realpathSync(path.resolve(projet)); } catch { return null; }
  const absolu = path.resolve(racine, ...segments);
  const dedans = (p) => p === racine || p.startsWith(racine + path.sep);
  if (!dedans(absolu)) return null;

  // Chaque segment est examiné : un lien symbolique, à quelque niveau qu'il soit, ne doit pas mener hors du projet.
  let courant = racine;
  for (const s of segments) {
    courant = path.join(courant, s);
    let infos;
    try { infos = fs.lstatSync(courant); } catch { return null; }
    if (infos.isSymbolicLink()) {
      let cible;
      try { cible = fs.realpathSync(courant); } catch { return null; }
      if (!dedans(cible)) return null;
    }
  }
  let reel;
  try { reel = fs.realpathSync(absolu); } catch { return null; }
  if (!dedans(reel)) return null;
  try { if (!fs.statSync(reel).isFile()) return null; } catch { return null; }
  return reel;
}

module.exports = { garder, fichierServi, typeDe, TYPES_SIMPLES, EXTENSIONS_SERVIES, EN_TETES, MESSAGES };
