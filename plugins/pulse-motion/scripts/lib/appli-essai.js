'use strict';
/* Pulse Motion – serveur de l'application d'essai (spec S6, 5.17) : exemples/tutoriel-logiciel/appli/, servie sur 127.0.0.1
 * le temps d'un tournage (« appli-essai ») et dans les tests. Lecture seule : aucune route qui écrit (la garde commune
 * refuse tout envoi), seulement les fichiers de l'application et /api/attente?ms=… (réponse lente, au plus 5 s), qui
 * simule une requête d'enregistrement.
 *
 * servirAppliEssai({ port = 0 }) -> Promise<{ url, port, fermer() }>
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { garder } = require('./garde-locale.js');

const DOSSIER = path.join(__dirname, '..', '..', 'exemples', 'tutoriel-logiciel', 'appli');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function servirAppliEssai({ port = 0 } = {}) {
  // Liste fixe des fichiers servis : rien d'autre n'est lisible.
  const fichiers = new Set(fs.readdirSync(DOSSIER).filter((f) => TYPES[path.extname(f)]));
  let ecoute = port;
  const serveur = http.createServer((req, res) => {
    if (!garder(req, res, { port: ecoute, types: null })) return;
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/api/attente') {
      const ms = Math.max(0, Math.min(5000, Number(u.searchParams.get('ms')) || 0));
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":true}');
      }, ms);
      return;
    }
    const nom = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
    if (!fichiers.has(nom)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable.'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(nom)] });
    res.end(fs.readFileSync(path.join(DOSSIER, nom)));
  });
  return new Promise((resoudre, rejeter) => {
    serveur.once('error', rejeter);
    serveur.listen(port, '127.0.0.1', () => {
      ecoute = serveur.address().port;
      resoudre({
        url: `http://127.0.0.1:${ecoute}/`,
        port: ecoute,
        fermer: () => new Promise((ok) => { serveur.closeAllConnections?.(); serveur.close(() => ok()); }),
      });
    });
  });
}

module.exports = { servirAppliEssai, DOSSIER };
