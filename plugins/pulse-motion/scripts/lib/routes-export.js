'use strict';
/* Pulse Motion – routes d'export de l'aperçu : modules du navigateur, réception du MP4 et de la planche.
 *
 *   GET  /_pm/capture.js, /_pm/export.mjs, /_pm/export-ui.mjs, /_pm/estimation.js, /_pm/vendor/mediabunny.min.mjs
 *   GET  /_pm/usages.json      usages d'export (scripts/usages.json : noms, réglages)
 *   GET  /_pm/usage?pour=&qualite=&ips=&taille=&scene=&plage=&cadre=&cadreFormat=   réglages effectifs d'un export (lib/usages.js,
 *                              comme la voie fidèle), nom du fichier, images d'un extrait (sortie) et couverture compris ;
 *                              { erreur } si l'usage, la scène ou le passage sont inconnus ou la taille impossible
 *   GET  /_pm/cadres/telephone.js   dessin du cadre de téléphone (spec Rendu et export, 5.15)
 *   POST /_pm/export           (video/mp4, video/webm ou image/gif ; en-têtes X-PM-Relecture, X-PM-Nom, X-PM-Extrait) → sortie/<nom>
 *                              (X-PM-Nom vérifié par son motif et le slug du titre ; sans lui, sortie/<titre>.mp4) ; livrables
 *                              écrits par Node (crédits, chapitres : lib/livrables.js) ; un extrait (X-PM-Extrait: 1) ne
 *                              refait pas la vérification de la vidéo entière
 *   POST /_pm/couverture       (image/jpeg) → sortie/<titre>-couverture.jpg
 *   POST /_pm/export-etat      (JSON) → sortie/export.json (suivi par « pulse-motion exporter »)
 *   POST /_pm/export-stats     (JSON) → sortie/.export/stats-navigateur.json (statistiques image par image, analysées à la
 *                              réception de la vidéo : sortie/verification.json)
 *   POST /_pm/planche/<nom>.png (image/png) → sortie/planche/<nom>.png
 *   POST /_pm/planche-fin      (JSON { images }) → sortie/planche/planche.html
 * Les types non « simples » (video/mp4, image/png, application/json) imposent une requête
 * préalable CORS : une autre origine ne peut pas écrire ici.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./deroule.js');
const { slug } = require('../assembler.js');
const { ecrireAtomique, ecrireJSON } = require('./fichiers.js');
const { verifierNavigateur, resume } = require('./verification.js');
const U = require('./usages.js');
const { minutageVideo } = require('./voix.js');
const L = require('./livrables.js');

const RACINE = path.resolve(__dirname, '..', '..');
const STATIQUES = {
  '/_pm/capture.js': path.join(RACINE, 'moteur', 'capture.js'),
  '/_pm/export.mjs': path.join(RACINE, 'moteur', 'export.mjs'),
  '/_pm/export-ui.mjs': path.join(RACINE, 'moteur', 'export-ui.mjs'),
  '/_pm/estimation.js': path.join(RACINE, 'moteur', 'estimation.js'),
  '/_pm/cadres/telephone.js': path.join(RACINE, 'moteur', 'cadres', 'telephone.js'),
  '/_pm/vendor/mediabunny.min.mjs': path.join(RACINE, 'vendor', 'mediabunny', 'mediabunny.min.mjs'),
};
const MAX_VIDEO = 4 * 1024 ** 3;
const MAX_IMAGE = 20 * 1024 ** 2;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOM_IMAGE = /^\/_pm\/planche\/([a-z0-9-]+)\.png$/;
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
/** Noms des fichiers envoyés par la page (spec Rendu et export, 5.6) : usage, scène ou passage seul, extension. */
const MOTIF_NOM = /^[a-z0-9-]+(-de-[0-9,]+s-a-[0-9,]+s)?\.(mp4|webm|gif)$/;
const TYPE_DE_L_EXTENSION = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif' };

/** Nom demandé par la page (en-tête X-PM-Nom), ou celui de l'usage web par défaut. -> { nom } | { erreur } */
function nomDemande(req, titre) {
  const base = slug(titre || 'video');
  const brut = req.headers['x-pm-nom'];
  if (brut === undefined) return { nom: `${base}.mp4` };
  let nom;
  try { nom = decodeURIComponent(String(brut)); } catch { return { erreur: 'Nom de fichier illisible.' }; }
  if (!MOTIF_NOM.test(nom) || !(nom.startsWith(`${base}.`) || nom.startsWith(`${base}-`))) return { erreur: `Nom de fichier refusé : « ${nom} ».` };
  return { nom };
}

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

/** creerRoutesExport(projet, { optionsAssemblage? }) -> (req, res, url) => bool (true si la route a été traitée) ;
 *  optionsAssemblage : celles de l'aperçu (styles), pour analyser la vidéo reçue comme elle a été assemblée. */
function creerRoutesExport(projet, { optionsAssemblage = {} } = {}) {
  const sortie = path.join(projet, 'sortie');
  const etatExport = path.join(sortie, 'export.json');
  const fichierStats = path.join(sortie, '.export', 'stats-navigateur.json');

  function ecrireEtatExport(etat) {
    ecrireJSON(etatExport, { ...etat, date: new Date().toISOString() });
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
    const { deroule } = lireDeroule(projet);
    const demande = nomDemande(req, deroule && deroule.titre);
    if (demande.erreur) return repondre(res, 400, { message: demande.erreur });
    const { nom } = demande;
    const extension = nom.slice(nom.lastIndexOf('.') + 1);
    if (!typeEst(req, TYPE_DE_L_EXTENSION[extension])) return repondre(res, 415, { message: `Fichier ${extension.toUpperCase()} attendu.` });
    let relecture;
    try { relecture = JSON.parse(decodeURIComponent(req.headers['x-pm-relecture'] || '')); } catch {
      return repondre(res, 400, { message: 'Relecture de la vidéo absente.' });
    }
    if (envoiEnCours) return repondre(res, 409, { message: 'Une vidéo est déjà en cours d\'enregistrement : attendez la fin de l\'export précédent.' });
    envoiEnCours = true;
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
          const signatures = { mp4: debut.toString('latin1', 4, 8) === 'ftyp', webm: debut.readUInt32BE(0) === 0x1a45dfa3, gif: debut.toString('latin1', 0, 4) === 'GIF8' };
          if (!signatures[extension]) return echec(422, `Le fichier reçu n'est pas un fichier ${extension.toUpperCase()}.`);
          if (!relecture || relecture.ok !== true) {
            return echec(422, `La relecture de la vidéo a échoué : ${(relecture && relecture.erreurs || []).join(' ') || 'raison inconnue'}`);
          }
          const final = path.join(sortie, nom);
          fs.renameSync(partiel, final);
          const fichier = path.relative(projet, final).split(path.sep).join('/');
          // Vérification de la vidéo (spec S2, 5.12) : statistiques envoyées par la page juste avant, analysées ici. Un extrait
          // ne remplace pas la vérification de la vidéo entière.
          const extrait = req.headers['x-pm-extrait'] === '1';
          let verification;
          if (!extrait) try {
            let stats = null;
            try { stats = JSON.parse(fs.readFileSync(fichierStats, 'utf8')); } catch { /* pas de statistiques reçues */ }
            fs.rmSync(fichierStats, { force: true });
            verification = resume(verifierNavigateur({ projet, stats, fichier, optionsAssemblage }));
          } catch { verification = undefined; }
          const nombre = (x) => (Number.isFinite(Number(x)) ? Number(x) : undefined);
          // Livrables (spec Rendu et export, 5.10, 5.11, 5.20) : crédits toujours, chapitres de la vidéo entière, couverture reçue.
          let livrables = { fichiers: {}, creditsAPreciser: [], alertes: [] };
          try {
            const assemblage = require('../assembler.js').assembler({ dossier: projet, ...optionsAssemblage, ecrire: false });
            const usage = U.lireUsages().usages[relecture.usage] || U.lireUsages().usages.web;
            livrables = L.ecrireLivrables({ projet, deroule, assemblage: assemblage.ok ? assemblage : null, usage, extrait, minutage: assemblage.ok ? assemblage.minutage : minutageVideo(projet, deroule) });
          } catch { /* livrables facultatifs : la vidéo est enregistrée */ }
          const couverture = path.join(sortie, `${slug(deroule && deroule.titre ? deroule.titre : 'video')}-couverture.jpg`);
          if (relecture.couverture === true && !extrait && fs.existsSync(couverture)) livrables.fichiers.couverture = path.relative(projet, couverture).split(path.sep).join('/');
          ecrireEtatExport({
            etat: 'fini', fichier, octets: taille, duree: relecture.duree, images: relecture.images, audio: !!relecture.audio,
            avertissement: relecture.avertissement ? String(relecture.avertissement) : undefined, verification,
            usage: typeof relecture.usage === 'string' ? relecture.usage : undefined,
            definition: typeof relecture.definition === 'string' ? relecture.definition : undefined,
            ips: nombre(relecture.ips), imagesParSeconde: nombre(relecture.imagesParSeconde), finalesParSeconde: nombre(relecture.finalesParSeconde),
            couleurs: relecture.couleurs && typeof relecture.couleurs === 'object' ? relecture.couleurs : undefined,
            fichiers: livrables.fichiers, creditsAPreciser: livrables.creditsAPreciser, alertes: livrables.alertes.length ? livrables.alertes : undefined,
            chapitresIntegres: false, extrait: extrait || undefined,
          });
          fini = true;
          envoiEnCours = false;
          repondre(res, 200, { fichier });
        } catch (e) { echec(500, messageDisque(e)); }
      });
    });
  }

  /** Statistiques image par image de l'export dans le navigateur (JSON, 32 Mo au plus) -> sortie/.export/stats-navigateur.json. */
  async function recevoirStats(req, res) {
    if (!typeEst(req, 'application/json')) return repondre(res, 415, { message: 'JSON attendu.' });
    try {
      const stats = await lireJSON(req, 32e6);
      if (!stats || !Array.isArray(stats.m)) return repondre(res, 400, { message: 'Statistiques illisibles.' });
      ecrireAtomique(fichierStats, JSON.stringify(stats));
      return repondre(res, 200, {});
    } catch { return repondre(res, 400, { message: 'Statistiques illisibles.' }); }
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
        ecrireAtomique(path.join(sortie, 'planche', `${nom}.png`), image);
      } catch (e) {
        return repondre(res, 500, { message: `L'image « ${nom} » n'a pas pu être enregistrée : ${e.message}.` });
      }
      return repondre(res, 200, {});
    });
  }

  /** Couverture JPEG (jalon 2 de la spec Rendu et export) -> sortie/<titre>-couverture.jpg. */
  function recevoirCouverture(req, res) {
    if (!typeEst(req, 'image/jpeg')) return repondre(res, 415, { message: 'Image JPEG attendue.' });
    const morceaux = [];
    let taille = 0;
    req.on('data', (m) => { taille += m.length; if (taille > MAX_IMAGE) req.destroy(); else morceaux.push(m); });
    req.on('end', () => {
      const image = Buffer.concat(morceaux);
      if (!image.subarray(0, 3).equals(JPEG)) return repondre(res, 422, { message: 'Le fichier reçu n\'est pas une image JPEG.' });
      const { deroule } = lireDeroule(projet);
      const nom = `${slug(deroule && deroule.titre ? deroule.titre : 'video')}-couverture.jpg`;
      try {
        ecrireAtomique(path.join(sortie, nom), image);
      } catch (e) {
        return repondre(res, 500, { message: `La couverture n'a pas pu être enregistrée : ${e.message}.` });
      }
      return repondre(res, 200, { fichier: `sortie/${nom}` });
    });
  }

  /** Réglages effectifs d'un export, résolus comme dans la voie fidèle (même module, même déroulé). */
  function usageResolu(res, url) {
    const { deroule, erreurs } = lireDeroule(projet);
    if (erreurs && erreurs.length) return repondre(res, 400, { erreur: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` });
    const p = (k) => { const v = url.searchParams.get(k); return v === null || v === '' ? undefined : v; };
    const minutage = minutageVideo(projet, deroule);
    let u = U.resoudreUsage({ pour: p('pour'), qualite: p('qualite'), ips: p('ips'), tailleMax: p('taille'), deroule, duree: minutage.duree });
    if (u.erreur) return repondre(res, 400, { erreur: u.erreur });
    // Extrait, passage seul, cadre de téléphone (spec Rendu et export, 5.12, 5.15) : images et nom du fichier.
    const sortieDemandee = L.preparerSortie({ deroule, minutage, ips: u.ips, scene: p('scene'), plage: p('plage'), cadre: p('cadre'), cadreFormat: p('cadreFormat') });
    if (sortieDemandee.erreur) return repondre(res, 400, { erreur: sortieDemandee.erreur });
    if (sortieDemandee.extrait && u.tailleMax) {
      u = U.resoudreUsage({ pour: p('pour'), qualite: p('qualite'), ips: p('ips'), tailleMax: p('taille'), deroule, duree: sortieDemandee.duree });
      if (u.erreur) return repondre(res, 400, { erreur: u.erreur });
    }
    const base = slug(deroule.titre || 'video');
    const special = sortieDemandee.extrait || sortieDemandee.cadre;
    const nomFichier = special ? L.nomSortie(base, { usage: u.usage, scene: sortieDemandee.scene, plage: sortieDemandee.plage, cadre: sortieDemandee.cadre }) : U.nomFichier(base, u.usage);
    const couverture = !special && (u.fichiers || []).includes('couverture');
    return repondre(res, 200, { ...u, nomFichier, couverture, titre: deroule.titre, sortie: sortieDemandee });
  }

  async function terminerPlanche(req, res) {
    if (!typeEst(req, 'application/json')) return repondre(res, 415, { message: 'JSON attendu.' });
    try {
      const { images } = await lireJSON(req);
      const valides = (Array.isArray(images) ? images : []).filter((n) => /^[a-z0-9-]+\.png$/.test(n) && fs.existsSync(path.join(sortie, 'planche', n)));
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planche</title>
<style>body{margin:24px;font:15px system-ui,sans-serif;background:#f4f4f5}div{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}img{width:100%;border-radius:6px;box-shadow:0 2px 8px rgb(0 0 0/.15)}</style>
</head><body><h1>Planche d'images clés</h1><div>${valides.map((n) => `<img src="${n}" alt="${n}">`).join('')}</div></body></html>`;
      ecrireAtomique(path.join(sortie, 'planche', 'planche.html'), html);
      ecrireEtatExport({ etat: 'planche', images: valides.map((n) => `sortie/planche/${n}`), fichier: 'sortie/planche/planche.html' });
      return repondre(res, 200, { fichier: 'sortie/planche/planche.html' });
    } catch { return repondre(res, 400, { message: 'Liste d\'images illisible.' }); }
  }

  return function routes(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/_pm/usages.json') { repondre(res, 200, U.lireUsages()); return true; }
    if (req.method === 'GET' && url.pathname === '/_pm/usage') { usageResolu(res, url); return true; }
    if (req.method === 'GET' && STATIQUES[url.pathname]) {
      const fichier = STATIQUES[url.pathname];
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(fichier));
      return true;
    }
    if (req.method !== 'POST') return false;
    if (url.pathname === '/_pm/export') { recevoirVideo(req, res); return true; }
    if (url.pathname === '/_pm/export-etat') { recevoirEtat(req, res); return true; }
    if (url.pathname === '/_pm/export-stats') { recevoirStats(req, res); return true; }
    if (url.pathname === '/_pm/couverture') { recevoirCouverture(req, res); return true; }
    if (url.pathname === '/_pm/planche-fin') { terminerPlanche(req, res); return true; }
    const m = NOM_IMAGE.exec(url.pathname);
    if (m) { recevoirImage(req, res, m[1]); return true; }
    return false;
  };
}

module.exports = { creerRoutesExport, nomDemande, MOTIF_NOM };
