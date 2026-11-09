'use strict';
/* Pulse Motion – page de contrôle ouverte en temps réel dans Chrome ou Edge sans fenêtre : servie sur un
 * serveur local (127.0.0.1, port libre), elle exécute un script de mesure après M.pret et les polices, puis
 * renvoie son résultat par POST. Le temps virtuel de --dump-dom n'attend pas les captures asynchrones (M.capturer).
 * Seule la page répond : adresse d'envoi avec un jeton aléatoire, en-tête Host vérifié, réponse limitée à 10 Mo.
 * ouvrirPageControle() : la même page, servie de la même façon (jeton dans l'adresse, Host vérifié), mais pilotée par le
 * protocole DevTools (cdp.js) : les mesures passent par page.evaluer et les flashs par des captures réduites
 * (spec Rapidité 5.10). mesurerPage reste pour lib/rendu-style.js, --gpu et le repli du contrôle. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { ouvrirSansFenetre } = require('./navigateur.js');
const { ouvrirPage } = require('./cdp.js');
const { garder } = require('./garde-locale.js');

// Code injecté dans toute page de mesure : les modules du contrôle (jamais dans la page livrée : moteur à la carte, spec
// Rapidité 5.19), puis la capture.
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'moteur', f), 'utf8');
const CONTROLE = ['mesures.js', 'pixels.js', 'ecoute.js'].map(lire).join('\n;\n');
const CAPTURE = lire('capture.js');
const enScript = (code) => `<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`;
const injecte = () => `${enScript(CONTROLE)}\n${enScript(CAPTURE)}`;
// Erreurs du code des scènes (spec S2, 5.8, erreur-de-scene) : le moteur les écrit dans la console (« [Pulse Motion] Scène « id » :
// … »), au chargement comme à chaque image ; gardées dans window.__pmErreursScenes (une par scène). Posé en tête de page, avant
// les scripts des scènes.
const GARDE_CONSOLE = `<script>(function () {
  var liste = window.__pmErreursScenes = [];
  var vues = {};
  var avant = console.error;
  console.error = function () {
    var texte = Array.prototype.map.call(arguments, String).join(' ');
    var m = /^\\[Pulse Motion\\] Scène « ([^»]+) » : (.*)$/.exec(texte);
    if (m && !vues[m[1]] && liste.length < 50) { vues[m[1]] = true; liste.push({ scene: m[1], message: m[2] }); }
    return avant.apply(console, arguments);
  };
})();</script>`;
const avecGardeConsole = (html) => (/<head[^>]*>/i.test(html) ? String(html).replace(/<head[^>]*>/i, (h) => `${h}\n${GARDE_CONSOLE}`) : `${GARDE_CONSOLE}\n${html}`);
const TAILLE_MAX = 10 * 1024 * 1024;

function pageAvecMesure(html, script, jeton) {
  const envoi = `<script>(function () {
  M.sansSon = true;
  function envoyer(objet) {
    return fetch('/pm-resultat/${jeton}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(objet) });
  }
  window.addEventListener('error', function (e) { envoyer({ erreur: String(e.message || e) }); });
  window.addEventListener('unhandledrejection', function (e) { envoyer({ erreur: String((e.reason && e.reason.message) || e.reason) }); });
  M.pret.then(function () { return document.fonts ? document.fonts.ready : null; })
    .then(async function () { ${script}\n })
    .then(function (resultat) { return envoyer({ resultat: resultat === undefined ? null : resultat }); },
      function (e) { return envoyer({ erreur: String((e && e.message) || e) }); });
})();</script>`;
  return avecGardeConsole(html).replace('</body>', () => `${injecte()}\n${envoi}\n</body>`);
}

/**
 * -> Promise<{ resultat } | { erreur, code? }> ; le navigateur et le serveur sont toujours fermés.
 * surPort(port) : appelé quand le serveur écoute (tests) ; gpu : WebGPU actif (compilation des shaders, --gpu).
 */
function mesurerPage({ html, script, navigateur, delai = 60000, surPort, gpu = false }) {
  const jeton = crypto.randomBytes(16).toString('hex');
  const page = pageAvecMesure(html, script, jeton);
  return new Promise((resolve) => {
    let nav = null;
    let fini = false;
    let surveillance = null;
    let minuteur = null;
    let hote = null;
    const serveur = http.createServer((req, res) => {
      // Une page web d'une autre adresse (rebinding DNS) ou sans le jeton ne peut ni lire la page ni répondre. La garde
      // commune ajoute l'origine obligatoire des envois, le type JSON et les en-têtes défensifs (lib/garde-locale.js).
      if (req.headers.host !== hote) { res.writeHead(403); res.end(); return; }
      if (!garder(req, res, { port: serveur.address().port, types: [[/^\/pm-resultat\/[0-9a-f]+$/, ['application/json']]] })) return;
      if (req.method === 'POST') {
        if (req.url !== `/pm-resultat/${jeton}`) { res.writeHead(403); res.end(); return; }
        let corps = '';
        req.on('data', (d) => {
          corps += d;
          if (corps.length > TAILLE_MAX) { req.destroy(); terminer({ erreur: 'réponse de la page trop volumineuse' }); }
        });
        req.on('end', () => {
          res.end('ok');
          let r;
          try { r = JSON.parse(corps); } catch { r = { erreur: 'réponse illisible de la page' }; }
          terminer(r.erreur !== undefined ? { erreur: r.erreur } : { resultat: r.resultat });
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page);
    });
    function terminer(r) {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      clearInterval(surveillance);
      serveur.close();
      (nav ? nav.fermer() : Promise.resolve()).then(() => resolve(r), () => resolve(r));
    }
    serveur.on('error', (e) => terminer({ erreur: `serveur local impossible (${e.code || e.message})` }));
    serveur.listen(0, '127.0.0.1', () => {
      const port = serveur.address().port;
      hote = `127.0.0.1:${port}`;
      if (surPort) surPort(port);
      try {
        nav = ouvrirSansFenetre(navigateur, `http://${hote}/`, { gpu });
      } catch (e) {
        terminer({ erreur: `navigateur impossible à lancer (${e.code || e.message})`, ...(e.code === 'ENOENT' ? { code: 'ENOENT' } : {}) });
        return;
      }
      minuteur = setTimeout(() => terminer({ erreur: 'délai dépassé' }), delai);
      surveillance = setInterval(() => {
        if (nav.aQuitte()) terminer(nav.cause() === 'ENOENT' ? { erreur: 'navigateur introuvable', code: 'ENOENT' } : { erreur: `le navigateur s'est arrêté (${nav.cause() || 'sans message'})` });
      }, 200);
    });
  });
}

// Fenêtre de la page de contrôle (comme ouvrirSansFenetre) : les mesures ne changent pas avec le CDP.
const LARGEUR_CONTROLE = 1280;
const HAUTEUR_CONTROLE = 800;

/** Page à mesurer par le CDP : modules du contrôle et capture.js, son coupé, premières erreurs de la page gardées (window.__pmErreur). */
function pageControle(html) {
  const garde = `<script>(function () {
  M.sansSon = true;
  function noter(m) { if (window.__pmErreur === undefined) window.__pmErreur = String(m); }
  window.addEventListener('error', function (e) { noter(e.message || e); });
  window.addEventListener('unhandledrejection', function (e) { noter((e.reason && e.reason.message) || e.reason); });
})();</script>`;
  return avecGardeConsole(html).replace('</body>', () => `${injecte()}\n${garde}\n</body>`);
}

/**
 * ouvrirPageControle({ html, navigateur, delai?, gpu?, ouvrir? }) -> Promise<{ page, fermer() }>
 * La page est servie sur 127.0.0.1 (port libre) à une adresse qui porte un jeton ; toute autre adresse, ou un autre
 * en-tête Host, est refusée. page : celle de cdp.js (evaluer, envoyer…), chargée, M.pret et polices attendus.
 * Rejette (code ENOENT si le navigateur est introuvable) ; le serveur et le navigateur sont alors fermés.
 * ouvrir : remplace ouvrirPage (tests).
 */
async function ouvrirPageControle({ html, navigateur, delai = 60000, gpu = false, ouvrir = ouvrirPage }) {
  const jeton = crypto.randomBytes(16).toString('hex');
  const corps = pageControle(html);
  let hote = null;
  const serveur = http.createServer((req, res) => {
    if (req.headers.host !== hote) { res.writeHead(403); res.end(); return; }
    if (!garder(req, res, { port: serveur.address().port, types: [] })) return;
    if (req.method !== 'GET' || req.url.split('?')[0] !== `/pm-controle/${jeton}`) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(corps);
  });
  await new Promise((resolve, reject) => {
    serveur.once('error', reject);
    serveur.listen(0, '127.0.0.1', () => { hote = `127.0.0.1:${serveur.address().port}`; resolve(); });
  });
  let page = null;
  const fermer = async () => {
    serveur.close();
    if (page) await page.fermer().catch(() => {});
  };
  try {
    // Sans limite de cadence : une capture d'écran attend la prochaine image du navigateur (48 ms sinon, 17 ms ainsi).
    page = await ouvrir({ navigateur, largeur: LARGEUR_CONTROLE, hauteur: HAUTEUR_CONTROLE, gpu, delai, options: ['--disable-frame-rate-limit'] });
    await page.aller(`http://${hote}/pm-controle/${jeton}`);
    await page.evaluer('(async function () { await M.pret; if (document.fonts) await document.fonts.ready; return true; })()');
  } catch (e) {
    await fermer();
    throw e;
  }
  return { page, fermer };
}

module.exports = { mesurerPage, ouvrirPageControle, LARGEUR_CONTROLE, HAUTEUR_CONTROLE };
