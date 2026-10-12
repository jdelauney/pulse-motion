'use strict';
/* Pulse Motion – pages de test WebGPU : Chrome ou Edge sans fenêtre, GPU actif (tests seulement).
 *
 * La page est servie sur 127.0.0.1 et envoie son résultat par POST /_resultat.
 * Les options qui donnent un adaptateur WebGPU sont cherchées une fois parmi les candidates
 * (GPU de la machine, puis repli logiciel SwiftShader) ; PM_OPTIONS_WEBGPU les impose.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./temporaire.js');
const { spawn } = require('node:child_process');
const { trouverNavigateur } = require('./navigateur.js');

const MOTEUR = path.join(__dirname, '..', '..', 'moteur');
const CANDIDATES = [
  ['--enable-unsafe-webgpu'],
  ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'],
];
const SONDE = `<!doctype html><meta charset="utf-8"><script>
(async () => {
  let r = 'SANS';
  try {
    const a = navigator.gpu && await navigator.gpu.requestAdapter();
    if (a && await a.requestDevice()) r = 'OK';
  } catch (e) { r = 'SANS ' + e.message; }
  await fetch('/_resultat', { method: 'POST', body: r });
})();
</script>`;

/** Sert html sur 127.0.0.1 ; -> { url, resultat: Promise<string>, fermer() } */
function servir(html) {
  let recu;
  const resultat = new Promise((ok) => { recu = ok; });
  const serveur = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/_resultat') {
      let corps = '';
      req.setEncoding('utf8');
      req.on('data', (m) => { corps += m; });
      req.on('end', () => { res.end('ok'); recu(corps); });
      return;
    }
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(0, '127.0.0.1', () => ok({
      url: `http://127.0.0.1:${serveur.address().port}/`,
      resultat,
      fermer: () => new Promise((fin) => serveur.close(() => fin())),
    }));
  });
}

function lancer(navigateur, url, options) {
  const profil = dossierTemporaire('pm-gpu-');
  const processus = spawn(navigateur, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--user-data-dir=${profil}`, '--window-size=1280,720', ...options, url,
  ], { stdio: 'ignore' });
  const echec = new Promise((ok, ko) => {
    processus.once('error', (e) => ko(new Error(`Lancement du navigateur impossible : ${e.message}`)));
  });
  echec.catch(() => {});
  const fermer = () => new Promise((fin) => {
    const nettoyer = () => setTimeout(() => {
      try {
        fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch { /* profil temporaire : on n'échoue pas au nettoyage */ }
      fin();
    }, 200);
    if (processus.exitCode !== null || processus.signalCode !== null || processus.pid === undefined) return nettoyer();
    processus.once('exit', nettoyer);
    processus.kill();
  });
  return { echec, fermer };
}

async function ouvrir(html, options, delai) {
  const navigateur = trouverNavigateur();
  if (!navigateur) throw new Error("Chrome ou Edge introuvable (PM_NAVIGATEUR pour l'indiquer).");
  let serveur;
  let navigation;
  let minuterie;
  try {
    serveur = await servir(html);
    navigation = lancer(navigateur, serveur.url, options);
    return await Promise.race([
      serveur.resultat,
      navigation.echec,
      new Promise((ok, ko) => { minuterie = setTimeout(() => ko(new Error(`Pas de résultat de la page après ${delai} ms.`)), delai); }),
    ]);
  } finally {
    clearTimeout(minuterie);
    if (navigation) await navigation.fermer();
    if (serveur) await serveur.fermer();
  }
}

let sondage;

/** Options de Chrome qui donnent un device WebGPU sans fenêtre, ou null. */
function optionsWebGPU() {
  if (!sondage) {
    sondage = (async () => {
      if (!trouverNavigateur()) return null;
      const candidates = process.env.PM_OPTIONS_WEBGPU ? [process.env.PM_OPTIONS_WEBGPU.split(/\s+/).filter(Boolean)] : CANDIDATES;
      for (const options of candidates) {
        const r = await ouvrir(SONDE, options, 20000).catch(() => 'SANS');
        if (r === 'OK') return options;
      }
      return null;
    })();
  }
  return sondage;
}

/** Ouvre html sans fenêtre avec WebGPU ; -> texte envoyé par la page. */
async function executerPage(html, { delai = 90000 } = {}) {
  const options = await optionsWebGPU();
  if (!options) throw new Error('WebGPU indisponible sans fenêtre.');
  return ouvrir(html, options, delai);
}

/** Page minimale : fichiers du moteur embarqués, DONNEES, code asynchrone, envoyer(objet). */
function pageMoteur({ fichiers = [], donnees = {}, code }) {
  const scripts = fichiers.map((f) => `<script>\n${fs.readFileSync(path.join(MOTEUR, f), 'utf8')}\n</script>`).join('\n');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Pulse Motion – test WebGPU</title></head>
<body>
<script>
const DONNEES = ${JSON.stringify(donnees).replace(/</g, '\\u003c')};
function envoyer(objet) { return fetch('/_resultat', { method: 'POST', body: JSON.stringify(objet) }); }
</script>
${scripts}
<script>
(async () => {
${code}
})().catch((e) => envoyer({ erreur: String(e && e.stack || e) }));
</script>
</body></html>`;
}

module.exports = { optionsWebGPU, executerPage, pageMoteur };
