'use strict';
/* Pulse Motion – routes des retouches directes de l'aperçu (spec Retouches et ergonomie, 5.8 à 5.12).
 *
 *   GET  /_pm/apercu/<nom>.mjs     modules de la page de l'aperçu (remarques, réglages, piste, comparaison)
 *   GET  /_pm/remarques            remarques de la vidéo, ré-ancrées (lib/remarques.js)
 *   POST /_pm/remarques            (JSON) nouvelle remarque ; image en data:image/jpeg;base64,…
 *   POST /_pm/remarques/<id>       (JSON) { texte } modifié, ou { retirer: true }
 *   POST /_pm/remarques/envoyer    (JSON) « Envoyer à Claude »
 *   GET  /_pm/remarques/<id>.jpg   image de la remarque ; /_pm/remarques/<id>-apres.png : l'image d'après (fichierServi)
 *   GET  /_pm/reglages             réglages rapides et valeurs actuelles (lib/reglages-rapides.js)
 *   POST /_pm/reglages             (JSON) { cle, valeur } : liste fermée, historique, déroulé réécrit
 *   GET  /_pm/versions             versions du journal de l'historique (menu « Comparer avec… »)
 *   GET  /_pm/version/<n|nom|courante>   version assemblée en mémoire (jamais écrite dans le projet), capture.js seul ajouté ;
 *                                  reconstituée par historique.materialiser dans un dossier temporaire, en cache par empreinte
 *   GET  /_pm/comparer?avec=<n>    deux cadres pilotés par une seule barre (moteur/apercu/comparer.html)
 * Toutes passent d'abord par la garde commune de l'aperçu (lib/garde-locale.js) : les écritures exigent l'origine de la page
 * et application/json (TYPES_ECRITURE de scripts/apercu.js).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assembler } = require('../assembler.js');
const { fichierServi } = require('./garde-locale.js');
const R = require('./remarques.js');
const G = require('./reglages-rapides.js');
const H = require('../historique.js');

const RACINE = path.resolve(__dirname, '..', '..');
const MODULES = path.join(RACINE, 'moteur', 'apercu');
const JS = 'text/javascript; charset=utf-8';
/** Corps d'une remarque : image de 3 Mo au plus en base64 (4/3), texte et champs. */
const MAX_CORPS = 4.5 * 1024 * 1024;
const MAX_PETIT = 64 * 1024;
const VERSIONS_EN_CACHE = 4;

function repondre(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corps));
}

/** Corps JSON borné ; au-delà, la requête est lue jusqu'au bout puis refusée (413). -> Promise<objet> */
function lireCorps(req, max) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    let taille = 0;
    let tropGros = false;
    req.on('data', (m) => {
      taille += m.length;
      if (taille > max) tropGros = true;
      else morceaux.push(m);
    });
    req.on('end', () => {
      if (tropGros) { const e = new Error('Envoi trop gros.'); e.statut = 413; reject(e); return; }
      try { resolve(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')); } catch { const e = new Error('Envoi illisible.'); e.statut = 400; reject(e); }
    });
    req.on('error', reject);
  });
}

function echec(res, e) {
  repondre(res, e.statut || 500, { erreur: e.message });
}

/** Page d'une version : assemblée sans être écrite, avec capture.js seul (vignettes, comparaison), sans l'interface de l'aperçu. */
function pageVersion(html) {
  return html.replace('</head>', '<script>window.__PM_VERSION__ = true;</script>\n<script src="/_pm/capture.js"></script>\n</head>');
}

/**
 * creerRoutesRetouches(projet, { optionsAssemblage, pageCourante }) -> (req, res, url) => bool
 * pageCourante() : la dernière page assemblée par l'aperçu ({ ok, html, erreurs }).
 */
function creerRoutesRetouches(projet, { optionsAssemblage = {}, pageCourante = null } = {}) {
  const dossierStyles = optionsAssemblage.dossierStyles;
  // Versions reconstituées : un dossier temporaire par projet, une page en cache par empreinte du manifeste.
  const temporaire = path.join(os.tmpdir(), 'pulse-motion', 'versions', crypto.createHash('sha256').update(projet).digest('hex').slice(0, 12));
  const cache = new Map();

  function versionAssemblee(reference) {
    if (reference === 'courante') {
      const d = pageCourante ? pageCourante() : assembler({ ...optionsAssemblage, dossier: projet, ecrire: false });
      if (!d || !d.ok) throw Object.assign(new Error('La vidéo actuelle ne s\'assemble pas.'), { statut: 500 });
      return d.html;
    }
    const id = H.identifier(projet, reference);
    if (cache.has(id.empreinte)) return cache.get(id.empreinte);
    const dossier = path.join(temporaire, 'travail');
    const m = H.materialiser(projet, reference, dossier);
    const a = assembler({ ...optionsAssemblage, dossier, ecrire: false });
    if (!a.ok) throw Object.assign(new Error(`La version ${m.nom ? `« ${m.nom} »` : m.numero} ne s'assemble plus : ${a.erreurs.map((e) => e.message).join(' ')}`), { statut: 500 });
    cache.set(m.empreinte, a.html);
    while (cache.size > VERSIONS_EN_CACHE) cache.delete(cache.keys().next().value);
    return a.html;
  }

  return function routes(req, res, url) {
    const p = url.pathname;
    const get = req.method === 'GET' || req.method === 'HEAD';

    const module = /^\/_pm\/apercu\/([a-z-]+)\.(mjs|html)$/.exec(p);
    if (module && get) {
      const fichier = path.join(MODULES, `${module[1]}.${module[2]}`);
      if (!fs.existsSync(fichier)) { repondre(res, 404, { erreur: 'Introuvable.' }); return true; }
      res.writeHead(200, { 'Content-Type': module[2] === 'mjs' ? JS : 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(fichier));
      return true;
    }
    if (p === '/_pm/comparer' && get) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(MODULES, 'comparer.html')));
      return true;
    }

    // Remarques.
    if (p === '/_pm/remarques' || p.startsWith('/_pm/remarques/')) {
      const image = /^\/_pm\/remarques\/(r-\d{4,}(?:\.jpg|-apres\.png))$/.exec(p);
      if (get && image) {
        const fichier = fichierServi(projet, `sortie/remarques/${image[1]}`, { dossiers: ['sortie'], extensions: ['.jpg', '.png'] });
        if (!fichier) { repondre(res, 404, { erreur: 'Image introuvable.' }); return true; }
        res.writeHead(200, { 'Content-Type': image[1].endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
        res.end(fs.readFileSync(fichier));
        return true;
      }
      if (get && p === '/_pm/remarques') {
        try { repondre(res, 200, R.liste(projet)); } catch (e) { echec(res, e); }
        return true;
      }
      if (req.method === 'POST') {
        const id = /^\/_pm\/remarques\/(r-\d{4,})$/.exec(p);
        const action = p === '/_pm/remarques' ? 'creer' : p === '/_pm/remarques/envoyer' ? 'envoyer' : id ? 'modifier' : null;
        if (!action) { repondre(res, 404, { erreur: 'Introuvable.' }); return true; }
        lireCorps(req, action === 'creer' ? MAX_CORPS : MAX_PETIT).then((corps) => {
          if (action === 'creer') repondre(res, 201, R.creer(projet, corps));
          else if (action === 'envoyer') repondre(res, 200, R.envoyer(projet));
          else repondre(res, 200, R.modifier(projet, id[1], { texte: corps.texte, retirer: corps.retirer === true }));
        }).catch((e) => echec(res, e));
        return true;
      }
      repondre(res, 404, { erreur: 'Introuvable.' });
      return true;
    }

    // Réglages rapides.
    if (p === '/_pm/reglages') {
      if (get) {
        try { repondre(res, 200, G.reglagesActuels(projet, { dossierStyles })); } catch (e) { echec(res, e); }
        return true;
      }
      if (req.method === 'POST') {
        lireCorps(req, MAX_PETIT).then((corps) => {
          repondre(res, 200, G.appliquer(projet, { cle: corps.cle, valeur: corps.valeur }, { dossierStyles }));
        }).catch((e) => echec(res, e));
        return true;
      }
    }

    // Versions (avant / après dans l'aperçu).
    if (p === '/_pm/versions' && get) {
      const j = H.journal(projet);
      repondre(res, 200, { versions: [...j.entrees].reverse(), aRetablir: j.retablir.length });
      return true;
    }
    const version = /^\/_pm\/version\/([^/]+)$/.exec(p);
    if (version && get) {
      let reference;
      try { reference = decodeURIComponent(version[1]); } catch { repondre(res, 400, { erreur: 'Version illisible.' }); return true; }
      try {
        const html = versionAssemblee(reference);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageVersion(html));
      } catch (e) {
        res.writeHead(e.statut || 404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(e.message);
      }
      return true;
    }
    return false;
  };
}

module.exports = { creerRoutesRetouches, pageVersion, MAX_CORPS };
