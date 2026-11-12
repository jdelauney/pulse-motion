'use strict';
/* Spec Retouches et ergonomie, 5.14 : charte proposée depuis le site de l'entreprise, lue par Chrome ou Edge sans fenêtre sur
 * une page locale de test (serveur sur 127.0.0.1) ; aucune police téléchargée ; délai dépassé annoncé en français. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { trouverNavigateur } = require('../scripts/lib/navigateur.js');
const { copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

const LOGO = '<svg class="logo-acme" viewBox="0 0 40 20" aria-label="Logo ACME"><title>ACME</title><rect width="40" height="20" fill="#0a5c8a"/><circle cx="10" cy="10" r="6" fill="#f2a900"/></svg>';
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>ACME</title>
<style>
@font-face { font-family: 'Marque Titres'; src: url('/polices/titres.woff2') format('woff2'); }
body { margin: 0; background: #fafaf7; color: #1d1d1b; font-family: 'Texte Maison', sans-serif; }
header { padding: 20px; background: #fafaf7; }
h1 { color: #0a5c8a; font-family: 'Marque Titres', serif; font-size: 48px; }
.bouton { display: inline-block; padding: 20px 60px; background: #e4572e; color: #fff; }
a.discret { color: #555; }
</style></head><body>
<header><a href="/" class="lien-logo">${LOGO}</a></header>
<main><h1>Des machines qui durent</h1><p>Nous fabriquons des pièces pour l'industrie depuis 1950, et nous les réparons.</p>
<a class="bouton" href="/contact">Nous contacter</a> <a class="discret" href="/mentions">Mentions</a></main>
</body></html>`;

function serveur(gerer) {
  return new Promise((resoudre) => {
    const demandes = [];
    const s = http.createServer((req, res) => { demandes.push(req.url); gerer(req, res); });
    s.listen(0, '127.0.0.1', () => resoudre({ adresse: `http://127.0.0.1:${s.address().port}/`, demandes, fermer: () => new Promise((r) => { s.closeAllConnections && s.closeAllConnections(); s.close(r); }) }));
  });
}

test('charte depuis-site : couleurs, ton, polices et logo tirés d\'une page locale de test', sans, async () => {
  const site = await serveur((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
    res.writeHead(404); res.end();
  });
  try {
    const dir = copierProjet('projet-simple');
    const { depuisSite } = require('../scripts/charte.js');
    const r = await depuisSite({ adresse: site.adresse, style: 'clair-pedagogique', dossier: dir });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.site.fond, '#fafaf7');
    assert.equal(r.site.titres, '#0a5c8a');
    assert.equal(r.site.accent, '#e4572e', 'accent : le fond saturé le plus étendu des boutons et des liens');
    assert.equal(r.ton, 'clair');
    assert.deepEqual(r.polices, { titres: 'Marque Titres', texte: 'Texte Maison' });
    assert.ok(r.logo, 'logo trouvé dans l\'en-tête');
    const logo = fs.readFileSync(path.join(dir, r.logo), 'utf8');
    assert.match(logo, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 40 20"><rect /);
    assert.doesNotMatch(logo, /title|class|aria/);
    assert.equal(r.source, undefined, 'la proposition n\'est pas encore la charte');
  } finally { await site.fermer(); }
});

test('charte depuis-site : aucune police téléchargée depuis le site', sans, async () => {
  const site = await serveur((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
    res.writeHead(200, { 'Content-Type': 'font/woff2' }); res.end(Buffer.alloc(64));
  });
  try {
    const dir = copierProjet('projet-simple');
    const { depuisSite, appliquerSite } = require('../scripts/charte.js');
    const r = await depuisSite({ adresse: site.adresse, style: 'clair-pedagogique', dossier: dir });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(!site.demandes.some((u) => /\.woff2?|\.ttf|\.otf|polices/.test(u)), `demandes : ${site.demandes.join(', ')}`);
    appliquerSite({ dossier: dir });
    const fichiers = fs.readdirSync(path.join(dir, 'charte'), { recursive: true }).map(String);
    assert.ok(!fichiers.some((f) => /\.(woff2?|ttf|otf)$/.test(f)), fichiers.join(', '));
  } finally { await site.fermer(); }
});

test('charte depuis-site : adresse non http refusée, délai dépassé annoncé en français', sans, async () => {
  const { analyserSite } = require('../scripts/lib/charte-site.js');
  const refus = await analyserSite({ adresse: 'file:///etc/passwd' });
  assert.equal(refus.ok, false);
  assert.match(refus.message, /seulement l'adresse d'un site, qui commence par http:\/\/ ou https:\/\//);
  // Un site qui ne répond jamais.
  const muet = await serveur(() => { /* aucune réponse */ });
  try {
    const debut = Date.now();
    const r = await analyserSite({ adresse: muet.adresse, delai: 4000, attente: 0 });
    assert.equal(r.ok, false);
    assert.match(r.message, /n'a pas répondu en 4 s : vérifiez l'adresse, ou réessayez plus tard\./);
    assert.ok(Date.now() - debut < 20000, 'abandon au délai');
  } finally { await muet.fermer(); }
});
