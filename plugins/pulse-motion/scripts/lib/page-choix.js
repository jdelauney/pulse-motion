'use strict';
/* Pulse Motion – serveur commun des pages locales de choix (mouvements, styles) : la page et ses vidéos servies en lecture,
 * un seul envoi accepté (POST /envoyer, JSON), puis la commande s'arrête et rend le choix. Écoute seulement 127.0.0.1 ;
 * garde commune (lib/garde-locale.js) : autre hôte refusé, envoi venu d'une autre origine refusé, JSON seulement.
 *
 *   servirChoix({ pages, lireEnvoi, delai, port, surPret, nettoyer })
 *     pages(chemin) -> html | null           (GET : null -> 404)
 *     lireEnvoi(corpsJSON) -> résultat       (lève : 400 « Choix illisible. ») ; la commande rend { ok: true, ...résultat }
 *   -> Promise<{ ok: true, ... } | { ok: false, message }> une fois le choix reçu ou le délai passé.
 */
const http = require('node:http');
const { garder } = require('./garde-locale.js');

const DELAI_DEFAUT = 30 * 60 * 1000;
const MESSAGE_DELAI = 'Aucun choix envoyé : la page a été fermée ou laissée ouverte trop longtemps.';

function servirChoix({ pages, lireEnvoi, delai = DELAI_DEFAUT, port = 0, surPret = () => {}, nettoyer = () => {} }) {
  return new Promise((resoudre) => {
    let fini = false;
    let minuteur;
    const serveur = http.createServer((req, res) => {
      // Garde commune : hôte, envoi venu de cette page seulement (Origin obligatoire), JSON seulement.
      const { port: portEcoute } = serveur.address();
      if (!garder(req, res, { port: portEcoute, types: [['/envoyer', ['application/json']]] })) return;
      const chemin = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET') {
        let html = null;
        try { html = pages(chemin); } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Page impossible à préparer : ${e.message}`);
          return;
        }
        if (html !== null && html !== undefined) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(html);
          return;
        }
      }
      if (req.method === 'POST' && chemin === '/envoyer') {
        // Origine et type déjà vérifiés par la garde : seule la page servie ici a pu envoyer ce choix.
        let corps = '';
        req.on('data', (m) => { corps += m; if (corps.length > 1e6) req.destroy(); });
        req.on('end', () => {
          let resultat;
          try {
            resultat = lireEnvoi(JSON.parse(corps));
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Choix illisible.');
            return;
          }
          // Terminer seulement une fois la réponse partie : fermer les connexions plus tôt la couperait.
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const fin = () => terminer({ ok: true, ...resultat });
          res.once('close', fin); // la page partie avant la fin de la réponse : le choix est reçu quand même
          res.end('{"ok":true}', fin);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable.');
    });
    // Ctrl+C ou arrêt de la commande : le dossier temporaire part avec elle.
    const surSignal = (signal) => { nettoyer(); process.exit(signal === 'SIGINT' ? 130 : 143); };
    function terminer(resultat) {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      process.removeListener('SIGINT', surSignal);
      process.removeListener('SIGTERM', surSignal);
      serveur.close();
      serveur.closeAllConnections?.();
      nettoyer();
      resoudre(resultat);
    }
    process.once('SIGINT', surSignal);
    process.once('SIGTERM', surSignal);
    minuteur = setTimeout(() => terminer({ ok: false, message: MESSAGE_DELAI }), delai);
    serveur.on('error', (e) => terminer({ ok: false, message: `La page de choix n'a pas pu être ouverte : ${e.message}` }));
    serveur.listen(port, '127.0.0.1', () => surPret(`http://127.0.0.1:${serveur.address().port}/`));
  });
}

/** Données injectées dans une page : JSON sans « < » (aucune balise ne peut se fermer) ; remplacement par une fonction (un
 * « $ » des données ne doit pas être lu comme un motif de remplacement). */
function injecterDonnees(page, donnees) {
  const json = JSON.stringify(donnees).replace(/</g, '\\u003c');
  return page.replace('/*DONNEES*/null', () => json);
}

module.exports = { servirChoix, injecterDonnees, DELAI_DEFAUT, MESSAGE_DELAI };
