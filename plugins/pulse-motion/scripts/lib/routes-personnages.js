'use strict';
/* Pulse Motion – routes de l'atelier des personnages (aperçu seulement, jamais dans la page livrée).
 *
 *   GET  /_pm/personnages                        page de l'atelier (moteur/personnages/atelier.html)
 *   GET  /_pm/personnages/atelier.mjs, edition.mjs, atelier.css
 *   GET  /_pm/personnages/modules/<module>       modules du moteur (courbes, squelette, clips, habillage-batonnets)
 *   GET  /_pm/personnages/contexte               { cible: 'video' | 'bibliotheque' | null, message, lu: { poses, clips, gabarits, expressions, dessins, sources }, erreurs }
 *   GET  /_pm/personnages/decoupe?nom=…        page de découpe (formes de l'illustration, pivots, aperçu)
 *   GET  /_pm/personnages/decoupe/donnees?nom=  { cible, decoupe, source (préparée), gabarit, dessin, lu }
 *   POST /_pm/personnages/decoupe/enregistrer   { nom, decoupe, partiel } -> { ok, fichiers } (vidéo seulement ; 422 si invalide)
 *   POST /_pm/personnages/enregistrer            { type, nom, objet, remplacer? } -> { ok, cible, fichier }
 *        403 sans cible ; 409 { existe } si le fichier existe déjà dans la cible (sans « remplacer ») ; 415 sans JSON ;
 *        422 { message, erreurs } si invalide.
 * Cible : la bibliothèque du plugin si l'aperçu a été démarré pour elle, sinon la vidéo ouverte (copie dans
 * .historique/ avant d'écrire : « annule » la défait), sinon aucune. Écritures : JSON seulement (une autre origine
 * est arrêtée par la requête préalable CORS), écriture atomique.
 */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./personnages.js');
const { MODULES } = require('./planche-personnages.js');
const D = require('./decoupe-personnages.js');
const historique = require('../historique.js');

const RACINE = path.resolve(__dirname, '..', '..');
const PAGE = path.join(RACINE, 'moteur', 'personnages');
const MOTEUR = path.join(RACINE, 'moteur');
const JS = 'text/javascript; charset=utf-8';
const STATIQUES = {
  '/_pm/personnages': { fichier: path.join(PAGE, 'atelier.html'), type: 'text/html; charset=utf-8' },
  '/_pm/personnages/atelier.mjs': { fichier: path.join(PAGE, 'atelier.mjs'), type: JS },
  '/_pm/personnages/edition.mjs': { fichier: path.join(PAGE, 'edition.mjs'), type: JS },
  '/_pm/personnages/atelier.css': { fichier: path.join(PAGE, 'atelier.css'), type: 'text/css; charset=utf-8' },
};
for (const m of MODULES) STATIQUES[`/_pm/personnages/modules/${m}`] = { fichier: path.join(MOTEUR, m), type: JS };
STATIQUES['/_pm/personnages/modules/personnages/decoupe.js'] = { fichier: path.join(PAGE, 'decoupe.js'), type: JS };
STATIQUES['/_pm/personnages/decoupe'] = { fichier: path.join(PAGE, 'decoupe-atelier.html'), type: 'text/html; charset=utf-8' };
STATIQUES['/_pm/personnages/decoupe-atelier.mjs'] = { fichier: path.join(PAGE, 'decoupe-atelier.mjs'), type: JS };
const NOM = /^[a-z0-9-]+$/;
const MAX_CORPS = 1e6;
const SANS_CIBLE = 'Aucune vidéo ouverte : lancez l\'atelier depuis le dossier d\'une vidéo pour enregistrer vos poses et vos mouvements.';
const MESSAGES = {
  video: 'Les enregistrements vont dans les personnages de cette vidéo (« annule » les défait).',
  bibliotheque: 'Les enregistrements vont dans la bibliothèque du plugin.',
};

function repondre(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}

function lireJSON(req) {
  return new Promise((resolve, reject) => {
    let corps = '';
    req.setEncoding('utf8');
    req.on('data', (m) => { corps += m; if (corps.length > MAX_CORPS) { req.destroy(); reject(new Error('trop gros')); } });
    req.on('end', () => { try { resolve(JSON.parse(corps)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const estJSON = (req) => String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim() === 'application/json';

function creerRoutesPersonnages(projet, { bibliotheque = P.BIBLIOTHEQUE, ecrireBibliotheque = false, ecrire } = {}) {
  const projetOuvert = () => fs.existsSync(path.join(projet, 'deroule.json'));
  const cible = () => (ecrireBibliotheque ? 'bibliotheque' : projetOuvert() ? 'video' : null);
  const lireTout = () => P.lire(!ecrireBibliotheque && projetOuvert() ? projet : null, { bibliotheque });
  const dossierCible = (c) => (c === 'bibliotheque' ? bibliotheque : path.join(projet, 'personnages'));

  async function enregistrer(req, res) {
    if (!estJSON(req)) return repondre(res, 415, { message: 'JSON attendu.' });
    let corps;
    try { corps = await lireJSON(req); } catch { return repondre(res, 400, { message: 'Requête illisible.' }); }
    const c = cible();
    if (!c) return repondre(res, 403, { message: SANS_CIBLE });
    const { type, nom, objet, remplacer } = corps || {};
    const dossier = dossierCible(c);
    const lu = lireTout();
    if (!P.TYPES[type]) return repondre(res, 422, { message: `Type « ${type} » inconnu (pose, clip ou gabarit).`, erreurs: [`Type « ${type} » inconnu (pose, clip ou gabarit).`] });
    if (typeof nom !== 'string' || !NOM.test(nom)) {
      const m = `Nom « ${nom} » invalide (minuscules, chiffres, tirets ; ex. gratte-tete).`;
      return repondre(res, 422, { message: m, erreurs: [m] });
    }
    const erreurs = P.valider(type, Object.assign({}, objet, { nom }), Object.assign({ nom }, P.contexteDe(lu)));
    if (erreurs.length) return repondre(res, 422, { message: erreurs[0], erreurs });
    if (!remplacer && fs.existsSync(path.join(dossier, P.TYPES[type], `${nom}.json`))) {
      return repondre(res, 409, { existe: true, message: `« ${nom} » existe déjà ${c === 'video' ? 'dans cette vidéo' : 'dans la bibliothèque'} : le remplacer ?` });
    }
    try {
      if (c === 'video') historique.sauvegarder(projet);
      const { fichier } = P.enregistrer({ dossier, type, nom, objet, lu, ecrire });
      const base = c === 'video' ? projet : path.dirname(bibliotheque);
      return repondre(res, 200, { ok: true, cible: c, fichier: path.relative(base, fichier).split(path.sep).join('/') });
    } catch (e) {
      if (e.erreurs) return repondre(res, 422, { message: e.erreurs[0], erreurs: e.erreurs });
      return repondre(res, 500, { message: `Écriture impossible (${e.code || e.message}) : rien n'a été modifié. Vérifiez que le fichier n'est pas ouvert ailleurs et que le disque n'est pas plein.` });
    }
  }

  function donneesDecoupe(res, nom) {
    const lu = lireTout();
    if (!NOM.test(nom) || !Object.hasOwn(lu.decoupes, nom)) return repondre(res, 404, { message: `Découpe « ${nom} » introuvable (personnages/decoupes/${nom}.json de la vidéo).` });
    const decoupe = lu.decoupes[nom];
    let source;
    try { source = D.lireSource(path.join(projet, decoupe.source)); } catch (e) { return repondre(res, 422, { message: e.message }); }
    const dessin = Object.hasOwn(lu.dessins, nom) ? lu.dessins[nom] : null;
    return repondre(res, 200, { cible: cible(), decoupe: D.avecAlias(decoupe, lu, nom), source, gabarit: lu.gabarits[decoupe.gabarit || 'standard'] || {}, dessin,
      lu: { poses: lu.poses, clips: lu.clips, gabarits: lu.gabarits, expressions: lu.expressions } });
  }

  async function enregistrerDecoupe(req, res) {
    if (!estJSON(req)) return repondre(res, 415, { message: 'JSON attendu.' });
    let corps;
    try { corps = await lireJSON(req); } catch { return repondre(res, 400, { message: 'Requête illisible.' }); }
    if (cible() !== 'video') return repondre(res, 403, { message: 'La découpe s\'enregistre dans le dossier d\'une vidéo (son illustration est dans assets/).' });
    const { nom, decoupe, partiel } = corps || {};
    if (typeof nom !== 'string' || !NOM.test(nom)) return repondre(res, 422, { message: `Nom « ${nom} » invalide.`, erreurs: [`Nom « ${nom} » invalide.`] });
    const okPartiel = partiel && typeof partiel === 'object' && partiel.pieces && typeof partiel.pieces === 'object' && Object.values(partiel.pieces).every((v) => typeof v === 'string');
    if (!okPartiel || !decoupe || typeof decoupe !== 'object') return repondre(res, 422, { message: 'Découpe ou résultat illisibles.', erreurs: ['Découpe ou résultat illisibles.'] });
    try {
      const { fichier } = D.enregistrerDecoupe({ dossier: projet, nom, partiel, vue: decoupe.vue, decoupe: Object.assign({}, decoupe, { nom }), lu: lireTout(), ecrire });
      return repondre(res, 200, { ok: true, fichiers: [`personnages/decoupes/${nom}.json`, path.relative(projet, fichier).split(path.sep).join('/')] });
    } catch (e) {
      if (e.erreurs) return repondre(res, 422, { message: e.erreurs[0], erreurs: e.erreurs });
      return repondre(res, 500, { message: `Écriture impossible (${e.code || e.message}) : rien n'a été modifié.` });
    }
  }

  return (req, res, url) => {
    if (url.pathname !== '/_pm/personnages' && !url.pathname.startsWith('/_pm/personnages/')) return false;
    const statique = STATIQUES[url.pathname];
    if (req.method === 'GET' && statique) {
      let contenu;
      try { contenu = fs.readFileSync(statique.fichier); } catch { repondre(res, 404, { message: 'Introuvable.' }); return true; }
      res.writeHead(200, { 'Content-Type': statique.type, 'Cache-Control': 'no-store' });
      res.end(contenu);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/_pm/personnages/contexte') {
      const lu = lireTout();
      const c = cible();
      repondre(res, 200, { cible: c, message: c ? MESSAGES[c] : SANS_CIBLE, lu: { poses: lu.poses, clips: lu.clips, gabarits: lu.gabarits, expressions: lu.expressions, dessins: lu.dessins, sources: lu.sources }, erreurs: lu.erreurs.map((e) => e.message) });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/_pm/personnages/decoupe/donnees') {
      donneesDecoupe(res, url.searchParams.get('nom') || '');
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/_pm/personnages/decoupe/enregistrer') {
      enregistrerDecoupe(req, res).catch((e) => repondre(res, 500, { message: e.message }));
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/_pm/personnages/enregistrer') {
      enregistrer(req, res).catch((e) => repondre(res, 500, { message: e.message }));
      return true;
    }
    repondre(res, 404, { message: 'Introuvable.' });
    return true;
  };
}

module.exports = { creerRoutesPersonnages, SANS_CIBLE, STATIQUES };
