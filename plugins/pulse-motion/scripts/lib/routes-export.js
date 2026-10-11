'use strict';
/* Pulse Motion – routes d'export de l'aperçu : modules du navigateur, réception du MP4 et de la planche.
 *
 *   GET  /_pm/capture.js, /_pm/export.mjs, /_pm/export-ui.mjs, /_pm/vendor/mediabunny.min.mjs
 *   POST /_pm/export           (video/mp4, en-tête X-PM-Relecture) → sortie/<titre>.mp4
 *   POST /_pm/export-etat      (JSON) → sortie/export.json (suivi par « pulse-motion exporter »)
 *   POST /_pm/planche/<nom>.png (image/png) → sortie/planche/<nom>.png
 *   POST /_pm/planche-fin      (JSON { images }) → sortie/planche/planche.html
 * Les types non « simples » (video/mp4, image/png, application/json) imposent une requête
 * préalable CORS : une autre origine ne peut pas écrire ici.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./deroule.js');
const { slug } = require('../assembler.js');

const RACINE = path.resolve(__dirname, '..', '..');
const STATIQUES = {
  '/_pm/capture.js': path.join(RACINE, 'moteur', 'capture.js'),
  '/_pm/export.mjs': path.join(RACINE, 'moteur', 'export.mjs'),
  '/_pm/export-ui.mjs': path.join(RACINE, 'moteur', 'export-ui.mjs'),
  '/_pm/vendor/mediabunny.min.mjs': path.join(RACINE, 'vendor', 'mediabunny', 'mediabunny.min.mjs'),
};
const MAX_VIDEO = 4 * 1024 ** 3;
const MAX_IMAGE = 20 * 1024 ** 2;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOM_IMAGE = /^\/_pm\/planche\/([a-z0-9-]+)\.png$/;

function repondre(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corps));
}

function lireJSON(req, max = 1e6) {
  return new Promise((resolve, reject) => {
    let corps = '';
    req.setEncoding('utf8');
    req.on('data', (m) => { corps += m; if (corps.length > max) { req.destroy(); reject(new Error('trop gros')); } });
    req.on('end', () => { try { resolve(JSON.parse(corps)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function typeEst(req, type) {
  return String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim() === type;
}

/** creerRoutesExport(projet) -> (req, res, url) => bool (true si la route a été traitée) */
function creerRoutesExport(projet) {
  const sortie = path.join(projet, 'sortie');
  const etatExport = path.join(sortie, 'export.json');

  function ecrireEtatExport(etat) {
    fs.mkdirSync(sortie, { recursive: true });
    fs.writeFileSync(etatExport, JSON.stringify({ ...etat, date: new Date().toISOString() }, null, 2));
  }

  let envoiEnCours = false;

  /** Une erreur de disque ne doit jamais arrêter l'aperçu : message en français. */
  function messageDisque(e) {
    if (e && ['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EISDIR'].includes(e.code)) {
      return 'La vidéo n\'a pas pu être enregistrée : l\'ancienne vidéo est peut-être ouverte dans un autre programme (lecteur vidéo). Fermez-la puis relancez l\'export.';
    }
    return `La vidéo n'a pas pu être enregistrée : ${e && e.message ? e.message : 'erreur inconnue'}.`;
  }

  function recevoirVideo(req, res) {
    if (!typeEst(req, 'video/mp4')) return repondre(res, 415, { message: 'Vidéo MP4 attendue.' });
    let relecture;
    try { relecture = JSON.parse(decodeURIComponent(req.headers['x-pm-relecture'] || '')); } catch {
      return repondre(res, 400, { message: 'Relecture de la vidéo absente.' });
    }
    if (envoiEnCours) return repondre(res, 409, { message: 'Une vidéo est déjà en cours d\'enregistrement : attendez la fin de l\'export précédent.' });
    envoiEnCours = true;
    const { deroule } = lireDeroule(projet);
    const nom = `${slug(deroule && deroule.titre ? deroule.titre : 'video')}.mp4`;
    // Nom unique : un envoi interrompu ne peut pas se mélanger avec le suivant.
    const partiel = path.join(sortie, `.${nom}.${process.pid}-${Date.now()}.part`);
    let flux = null;
    let taille = 0;
    let fini = false;
    const echec = (statut, message) => {
      if (fini) return;
      fini = true;
      envoiEnCours = false;
      if (flux) flux.destroy();
      try { fs.rmSync(partiel, { force: true }); } catch { /* rien à nettoyer */ }
      try { ecrireEtatExport({ etat: 'erreur', message }); } catch { /* le message part quand même dans la réponse */ }
      if (!res.headersSent) repondre(res, statut, { message });
    };
    try {
      fs.mkdirSync(sortie, { recursive: true });
      flux = fs.createWriteStream(partiel);
    } catch (e) { return echec(500, messageDisque(e)); }
    flux.on('error', (e) => echec(500, messageDisque(e)));
    req.on('data', (morceau) => {
      if (fini) return;
      taille += morceau.length;
      if (taille > MAX_VIDEO) { echec(413, 'Vidéo trop lourde.'); req.destroy(); return; }
      flux.write(morceau);
    });
    req.on('close', () => { if (!req.complete) echec(400, 'Envoi de la vidéo interrompu.'); });
    req.on('end', () => {
      if (fini) return;
      flux.end(() => {
        if (fini) return;
        try {
          const debut = Buffer.alloc(8);
          const fd = fs.openSync(partiel, 'r');
          fs.readSync(fd, debut, 0, 8, 0);
          fs.closeSync(fd);
          if (debut.toString('latin1', 4, 8) !== 'ftyp') return echec(422, 'Le fichier reçu n\'est pas une vidéo MP4.');
          if (!relecture || relecture.ok !== true) {
            return echec(422, `La relecture de la vidéo a échoué : ${(relecture && relecture.erreurs || []).join(' ') || 'raison inconnue'}`);
          }
          const final = path.join(sortie, nom);
          fs.renameSync(partiel, final);
          const fichier = path.relative(projet, final).split(path.sep).join('/');
          ecrireEtatExport({
            etat: 'fini', fichier, octets: taille, duree: relecture.duree, images: relecture.images, audio: !!relecture.audio,
            avertissement: relecture.avertissement ? String(relecture.avertissement) : undefined,
          });
          fini = true;
          envoiEnCours = false;
          repondre(res, 200, { fichier });
        } catch (e) { echec(500, messageDisque(e)); }
      });
    });
  }

  async function recevoirEtat(req, res) {
    if (!typeEst(req, 'application/json')) return repondre(res, 415, { message: 'JSON attendu.' });
    try {
      const e = await lireJSON(req);
      const etat = ['en-cours', 'erreur', 'annule'].includes(e.etat) ? e.etat : null;
      if (!etat) return repondre(res, 400, { message: 'État inconnu.' });
      ecrireEtatExport({ etat, message: e.message ? String(e.message) : undefined, images: Number(e.images) || undefined, total: Number(e.total) || undefined });
      return repondre(res, 200, {});
    } catch { return repondre(res, 400, { message: 'État illisible.' }); }
  }

  function recevoirImage(req, res, nom) {
    if (!typeEst(req, 'image/png')) return repondre(res, 415, { message: 'Image PNG attendue.' });
    const morceaux = [];
    let taille = 0;
    req.on('data', (m) => { taille += m.length; if (taille > MAX_IMAGE) req.destroy(); else morceaux.push(m); });
    req.on('end', () => {
      const image = Buffer.concat(morceaux);
      if (!image.subarray(0, 8).equals(PNG)) return repondre(res, 422, { message: 'Le fichier reçu n\'est pas une image PNG.' });
      try {
        fs.mkdirSync(path.join(sortie, 'planche'), { recursive: true });
        fs.writeFileSync(path.join(sortie, 'planche', `${nom}.png`), image);
      } catch (e) {
        return repondre(res, 500, { message: `L'image « ${nom} » n'a pas pu être enregistrée : ${e.message}.` });
      }
      return repondre(res, 200, {});
    });
  }

  async function terminerPlanche(req, res) {
    if (!typeEst(req, 'application/json')) return repondre(res, 415, { message: 'JSON attendu.' });
    try {
      const { images } = await lireJSON(req);
      const valides = (Array.isArray(images) ? images : []).filter((n) => /^[a-z0-9-]+\.png$/.test(n) && fs.existsSync(path.join(sortie, 'planche', n)));
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planche</title>
<style>body{margin:24px;font:15px system-ui,sans-serif;background:#f4f4f5}div{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}img{width:100%;border-radius:6px;box-shadow:0 2px 8px rgb(0 0 0/.15)}</style>
</head><body><h1>Planche d'images clés</h1><div>${valides.map((n) => `<img src="${n}" alt="${n}">`).join('')}</div></body></html>`;
      fs.writeFileSync(path.join(sortie, 'planche', 'planche.html'), html);
      ecrireEtatExport({ etat: 'planche', images: valides.map((n) => `sortie/planche/${n}`), fichier: 'sortie/planche/planche.html' });
      return repondre(res, 200, { fichier: 'sortie/planche/planche.html' });
    } catch { return repondre(res, 400, { message: 'Liste d\'images illisible.' }); }
  }

  return function routes(req, res, url) {
    if (req.method === 'GET' && STATIQUES[url.pathname]) {
      const fichier = STATIQUES[url.pathname];
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(fichier));
      return true;
    }
    if (req.method !== 'POST') return false;
    if (url.pathname === '/_pm/export') { recevoirVideo(req, res); return true; }
    if (url.pathname === '/_pm/export-etat') { recevoirEtat(req, res); return true; }
    if (url.pathname === '/_pm/planche-fin') { terminerPlanche(req, res); return true; }
    const m = NOM_IMAGE.exec(url.pathname);
    if (m) { recevoirImage(req, res, m[1]); return true; }
    return false;
  };
}

module.exports = { creerRoutesExport };
