'use strict';
/* Pulse Motion – routes de l'atelier des effets de particules (aperçu seulement, jamais dans la page livrée).
 *
 *   GET  /_pm/atelier/contexte              { projet, charte, recettes: { bibliotheque: [noms], projet: [noms] } }
 *   GET  /_pm/atelier/recette?nom=<nom>     { nom, source: 'projet' | 'bibliotheque', recette (résolue) }
 *   GET  /_pm/atelier/scenes                { charte, scenes: [{ id, fichier, empreinte, effets: [effet] }] }
 *   GET  /_pm/atelier/texture?chemin=assets/…   { uri } : image du projet en data:
 *   POST /_pm/atelier/reglages              { fichier, empreinte, scene, ordre, reglages, graine } -> { ok, empreinte }
 *   POST /_pm/atelier/recette               { nom, etend, recette, description?, dur?, remplacer?,
 *                                             cible?: { scene, ordre, empreinte, reglages, graine } } -> { ok, fichier, complete, empreinte? }
 *   effet : { ordre, nom, calque, ancre, reglages, graine, graineEcrite, dur, recette | null, erreur | null }
 * Écritures : JSON seulement (une autre origine est arrêtée par la requête préalable CORS), copie dans
 * .historique/ avant, fichier temporaire puis renommage ; 409 si la scène a changé sur le disque ({ conflit: true })
 * ou si le nom de la recette est invalide ou pris. Jamais d'écriture dans la bibliothèque du plugin.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { lireDeroule, dureeTemps } = require('./deroule.js');
const { chargeurRecettes, balisesEffets, modifierEffet, graineParDefaut } = require('./effets.js');
const { cheminDansProjet, versDataURI } = require('./embarquer.js');
const { charteFinale, CHARTE_DEFAUT } = require('./fusion-charte.js');
const { trouverStyle } = require('../styles.js');
const { lireSecondes } = require('../../moteur/minutage.js');
const R = require('../../moteur/particules/recette.js');
const historique = require('../historique.js');

const RACINE = path.resolve(__dirname, '..', '..');
const BIBLIOTHEQUE = path.join(RACINE, 'effets');
const NOM = /^[a-z0-9-]+$/;
const REGLAGES_SURS = /^[^"<>&\r\n]*$/;
const MAX_CORPS = 2e6;
// Fichiers servis tels quels : { chemin: { fichier, type } } (modules de l'atelier, plans 3 et 4).
const STATIQUES = {};
// Contenus fabriqués à la demande : { chemin: () => ({ type, corps }) } (page d'atelier, plan 4).
const GENERES = {};

const CONFLIT = 'La scène a été modifiée sur le disque depuis l\'ouverture de la page (par exemple par une retouche) : rechargez la page. Les réglages non enregistrés seront perdus ; le fichier, lui, n\'a pas été touché.';
const SANS_PROJET = 'Aucune vidéo ouverte : lancez l\'atelier depuis le dossier d\'une vidéo (pulse-motion atelier) pour enregistrer vos effets.';

function repondre(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}

/** Empreinte d'un fichier : 16 caractères hexadécimaux du SHA-256 de ses octets. */
function empreinte(octets) {
  return crypto.createHash('sha256').update(octets).digest('hex').slice(0, 16);
}

const attendre = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Écrit dans un fichier temporaire voisin puis renomme : jamais de fichier à moitié écrit. Sous Windows, le
 *  renommage est réessayé quelques fois si le fichier est un instant verrouillé (antivirus, surveillance). */
function ecrireAtomique(fichier, contenu) {
  const temporaire = `${fichier}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaire, contenu);
    for (let essai = 0; ; essai++) {
      try {
        fs.renameSync(temporaire, fichier);
        break;
      } catch (e) {
        if (essai >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        attendre(40);
      }
    }
  } catch (e) {
    try { fs.rmSync(temporaire, { force: true }); } catch { /* rien à nettoyer */ }
    throw e;
  }
}

function messageDisque(e) {
  return `Écriture impossible (${e && (e.code || e.message)}) : rien n'a été modifié. Vérifiez que le fichier n'est pas ouvert dans un autre programme et que le disque n'est pas plein.`;
}

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const graineValide = (g) => g === null || g === undefined || (Number.isInteger(g) && g >= 0 && g <= 0xffffffff);
const typeEst = (req, type) => String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim() === type;

function nomsRecettes(dossier) {
  try { return fs.readdirSync(dossier).filter((f) => /^[a-z0-9-]+\.json$/.test(f)).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
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

/**
 * creerRoutesAtelier(projet, { dossierStyles?, bibliotheque?, ecrire? }) -> (req, res, url) => bool (true si traitée)
 * bibliotheque : dossier des recettes livrées (tests : tests/fixtures/effets) ; ecrire(fichier, contenu) : écriture
 * atomique, remplaçable dans les tests pour simuler un disque plein.
 */
function creerRoutesAtelier(projet, { dossierStyles, bibliotheque = BIBLIOTHEQUE, ecrire = ecrireAtomique } = {}) {
  const projetOuvert = () => fs.existsSync(path.join(projet, 'deroule.json'));
  const charger = () => chargeurRecettes(projet, bibliotheque);

  function lireLeDeroule() {
    const { deroule } = lireDeroule(projet);
    return deroule && Array.isArray(deroule.scenes) ? deroule : null;
  }

  /** Couleurs de la charte, comme à l'assemblage ; charte par défaut hors projet ou si le style manque. */
  function charte(deroule = lireLeDeroule()) {
    try {
      const style = deroule && trouverStyle(deroule.style, dossierStyles);
      if (style) return charteFinale(deroule, style.dossier, projet).couleurs;
    } catch { /* déroulé incomplet : charte par défaut */ }
    return { ...CHARTE_DEFAUT.couleurs };
  }

  function contexte(res) {
    repondre(res, 200, { projet: projetOuvert(), charte: charte(), recettes: { bibliotheque: nomsRecettes(bibliotheque), projet: nomsRecettes(path.join(projet, 'effets')) } });
  }

  function recette(res, url) {
    const nom = url.searchParams.get('nom') || '';
    if (!NOM.test(nom)) return repondre(res, 400, { message: `Nom d'effet « ${nom} » invalide (minuscules, chiffres, tirets).` });
    const source = fs.existsSync(path.join(projet, 'effets', `${nom}.json`)) ? 'projet'
      : fs.existsSync(path.join(bibliotheque, `${nom}.json`)) ? 'bibliotheque' : null;
    if (!source) return repondre(res, 404, { message: `Effet « ${nom} » introuvable (ni dans effets/ du projet, ni dans la bibliothèque).` });
    try { return repondre(res, 200, { nom, source, recette: R.resoudre(nom, charger()) }); } catch (e) {
      if (!e.regle) throw e;
      return repondre(res, 422, { message: e.message });
    }
  }

  function decrireEffet(scene, b, ctx) {
    const a = b.attributs;
    const nom = a['data-effet'].trim();
    const lu = lireSecondes(String(a['data-dur'] || ''), ctx.temps);
    const dur = lu.erreur ? 1 : lu.valeur;
    const graineEcrite = a['data-graine'] !== undefined && /^\d+$/.test(a['data-graine'].trim());
    const graine = graineEcrite ? Number(a['data-graine'].trim()) >>> 0 : graineParDefaut(scene, b.ordre, nom);
    const reglages = a['data-reglages'] || '';
    let resolue = null;
    let erreur = null;
    try { resolue = R.resoudre(nom, ctx.charger); } catch (e) {
      if (!e.regle) throw e;
      erreur = e.message;
    }
    if (resolue) {
      const c = R.compiler(resolue, { reglages, charte: ctx.charte, dur, graine });
      if (!c.ok) erreur = c.erreurs.map((x) => x.message).join(' ');
    }
    return {
      ordre: b.ordre, nom, calque: (a['data-calque'] || 'avant').trim(),
      ancre: a['data-ancre'] ? a['data-ancre'].trim().replace(/^#/, '') : null,
      reglages, graine, graineEcrite, dur, recette: resolue, erreur,
    };
  }

  function scenes(res) {
    const deroule = lireLeDeroule();
    if (!deroule) return repondre(res, 200, { charte: charte(null), scenes: [] });
    const ctx = { charte: charte(deroule), temps: dureeTemps(deroule), charger: charger() };
    const liste = deroule.scenes.map((s) => {
      const absolu = cheminDansProjet(projet, String(s.fichier || ''));
      let brut = null;
      try { brut = absolu ? fs.readFileSync(absolu) : null; } catch { brut = null; }
      if (!brut) return { id: s.id, fichier: s.fichier, empreinte: null, effets: [] };
      return { id: s.id, fichier: s.fichier, empreinte: empreinte(brut), effets: balisesEffets(brut.toString('utf8')).map((b) => decrireEffet(s.id, b, ctx)) };
    });
    return repondre(res, 200, { charte: ctx.charte, scenes: liste });
  }

  function texture(res, url) {
    const chemin = url.searchParams.get('chemin') || '';
    const absolu = /^assets\//.test(chemin) ? cheminDansProjet(path.join(projet, 'assets'), chemin.slice('assets/'.length)) : null;
    if (!absolu || !fs.existsSync(absolu)) return repondre(res, 404, { message: `Image « ${chemin} » introuvable dans assets/ du projet.` });
    try { return repondre(res, 200, { uri: versDataURI(absolu) }); } catch (e) { return repondre(res, 415, { message: e.message }); }
  }

  /** Corps JSON d'une écriture, ou null (réponse 415 ou 400 déjà envoyée). */
  function lireDemande(req, res) {
    if (!typeEst(req, 'application/json')) {
      req.resume();
      repondre(res, 415, { message: 'JSON attendu.' });
      return Promise.resolve(null);
    }
    return lireJSON(req).then((c) => {
      if (!estObjet(c)) throw new Error('objet attendu');
      return c;
    }).catch(() => {
      if (!res.headersSent) repondre(res, 400, { message: 'Demande illisible.' });
      return null;
    });
  }

  const ecritures = {};

  return function routes(req, res, url) {
    const p = url.pathname;
    if (p !== '/_pm/atelier' && !p.startsWith('/_pm/atelier/')) return false;
    if (req.method === 'GET') {
      if (STATIQUES[p]) {
        res.writeHead(200, { 'Content-Type': STATIQUES[p].type, 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(STATIQUES[p].fichier));
        return true;
      }
      if (GENERES[p]) {
        const { type, corps } = GENERES[p]();
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(corps);
        return true;
      }
      if (p === '/_pm/atelier/contexte') { contexte(res); return true; }
      if (p === '/_pm/atelier/recette') { recette(res, url); return true; }
      if (p === '/_pm/atelier/scenes') { scenes(res); return true; }
      if (p === '/_pm/atelier/texture') { texture(res, url); return true; }
      return false;
    }
    if (req.method === 'POST' && ecritures[p]) {
      lireDemande(req, res).then((c) => {
        if (!c) return;
        try { ecritures[p](c, res); } catch (e) {
          if (!res.headersSent) repondre(res, 500, { message: messageDisque(e) });
        }
      });
      return true;
    }
    return false;
  };
}

module.exports = { creerRoutesAtelier, ecrireAtomique, empreinte, STATIQUES, GENERES, CONFLIT, SANS_PROJET };
