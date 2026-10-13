'use strict';
/* Pulse Motion – page de contrôle ouverte en temps réel dans Chrome ou Edge sans fenêtre : servie sur un
 * serveur local (127.0.0.1, port libre), elle exécute un script de mesure après M.pret et les polices, puis
 * renvoie son résultat par POST. Le temps virtuel de --dump-dom n'attend pas les captures asynchrones (M.capturer).
 * Seule la page répond : adresse d'envoi avec un jeton aléatoire, en-tête Host vérifié, réponse limitée à 10 Mo. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { ouvrirSansFenetre } = require('./navigateur.js');

const CAPTURE = fs.readFileSync(path.join(__dirname, '..', '..', 'moteur', 'capture.js'), 'utf8');
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
  return String(html).replace('</body>', `<script>${CAPTURE.replace(/<\/script/gi, '<\\/script')}</script>\n${envoi}\n</body>`);
}

/**
 * -> Promise<{ resultat } | { erreur, code? }> ; le navigateur et le serveur sont toujours fermés.
 * surPort(port) : appelé quand le serveur écoute (tests).
 */
function mesurerPage({ html, script, navigateur, delai = 60000, surPort }) {
  const jeton = crypto.randomBytes(16).toString('hex');
  const page = pageAvecMesure(html, script, jeton);
  return new Promise((resolve) => {
    let nav = null;
    let fini = false;
    let surveillance = null;
    let minuteur = null;
    let hote = null;
    const serveur = http.createServer((req, res) => {
      // Une page web d'une autre adresse (rebinding DNS) ou sans le jeton ne peut ni lire la page ni répondre.
      if (req.headers.host !== hote) { res.writeHead(403); res.end(); return; }
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
        nav = ouvrirSansFenetre(navigateur, `http://${hote}/`);
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

module.exports = { mesurerPage };
