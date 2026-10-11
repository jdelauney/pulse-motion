#!/usr/bin/env node
'use strict';
/* Pulse Motion – aperçu : serveur local qui sert la page et la recharge à chaque modification.
 *
 *   node scripts/apercu.js <dossier-du-projet> [--port 4321] [--ouvrir]
 *
 * Écoute seulement 127.0.0.1. Surveille deroule.json, scenes/ et assets/ ; à chaque
 * changement, réassemble et prévient la page (événement « recharger » ou « erreur »).
 * Le port retenu est écrit dans .pulse-motion/etat.json.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { assembler } = require('./assembler.js');

const IGNORES = /^(sortie|\.pulse-motion|\.historique|\.git)([\\/]|$)/;
const ESSAIS_PORT = 20;

function echapper(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pageErreur(erreurs) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Pulse Motion – erreur</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#7b1d14}</style>
<script>new EventSource('/_pm/evenements').addEventListener('recharger', function () { location.reload(); });</script>
</head><body><h1>La vidéo n'a pas pu être assemblée</h1><ul>${erreurs.map((e) => `<li>${echapper(e.message)}</li>`).join('')}</ul>
<p>La page se rechargera seule dès que le problème sera corrigé.</p></body></html>`;
}

function injecterApercu(html, erreurs) {
  const script = `<script>window.__PM_APERCU__ = true; window.__PM_ERREURS__ = ${JSON.stringify(erreurs).replace(/</g, '\\u003c')};</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

function ecrireEtat(dossier, apercu) {
  const dossierEtat = path.join(dossier, '.pulse-motion');
  const fichier = path.join(dossierEtat, 'etat.json');
  fs.mkdirSync(dossierEtat, { recursive: true });
  let etat = {};
  try { etat = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { /* premier lancement */ }
  etat.apercu = apercu;
  fs.writeFileSync(fichier, JSON.stringify(etat, null, 2));
}

function ecouter(serveur, hote, port) {
  return new Promise((resolve, reject) => {
    const surErreur = (e) => { serveur.off('listening', surEcoute); reject(e); };
    const surEcoute = () => { serveur.off('error', surErreur); resolve(serveur.address().port); };
    serveur.once('error', surErreur);
    serveur.once('listening', surEcoute);
    serveur.listen(port, hote);
  });
}

/**
 * demarrerApercu({ dossier, port?, dossierStyles?, delai? })
 * -> Promise<{ port, url, fermer(): Promise }>
 */
async function demarrerApercu({ dossier, port = 4321, dossierStyles, delai = 150 }) {
  const projet = path.resolve(dossier);
  const optionsAssemblage = dossierStyles ? { dossier: projet, dossierStyles } : { dossier: projet };
  let dernier = assembler(optionsAssemblage);
  const clients = new Set();

  function diffuser(evenement, donnees) {
    const message = `event: ${evenement}\ndata: ${JSON.stringify(donnees)}\n\n`;
    clients.forEach((res) => res.write(message));
  }

  const rapportPage = path.join(projet, 'sortie', 'controle-page.json');

  /** Rapport de débordement envoyé par la page : JSON seulement (une autre origine serait bloquée par CORS). */
  function recevoirControle(req, res) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      res.writeHead(415, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('JSON attendu');
      return;
    }
    let corps = '';
    let tropGros = false;
    req.setEncoding('utf8');
    req.on('data', (morceau) => {
      corps += morceau;
      if (corps.length > 1e6) { tropGros = true; req.destroy(); }
    });
    req.on('end', () => {
      if (tropGros) return;
      let debordements;
      try {
        debordements = JSON.parse(corps).debordements;
        if (!Array.isArray(debordements)) throw new Error('liste attendue');
        debordements = debordements.map((d) => ({ scene: String(d.scene), element: String(d.element), message: String(d.message) }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Rapport illisible');
        return;
      }
      fs.mkdirSync(path.dirname(rapportPage), { recursive: true });
      fs.writeFileSync(rapportPage, JSON.stringify({ debordements }, null, 2));
      res.writeHead(204);
      res.end();
    });
  }

  const serveur = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      const corps = dernier.ok ? injecterApercu(dernier.html, dernier.erreurs) : pageErreur(dernier.erreurs);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(corps);
    } else if (req.method === 'GET' && url.pathname === '/_pm/evenements') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': connecté\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    } else if (req.method === 'POST' && url.pathname === '/_pm/controle') {
      recevoirControle(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable');
    }
  });
  const battement = setInterval(() => clients.forEach((res) => res.write(': battement\n\n')), 15000);

  let portRetenu = null;
  for (let p = port, essai = 0; essai < ESSAIS_PORT; essai++, p++) {
    try { portRetenu = await ecouter(serveur, '127.0.0.1', p); break; } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }
  if (portRetenu === null) {
    clearInterval(battement);
    throw new Error(`Aucun port libre entre ${port} et ${port + ESSAIS_PORT - 1}.`);
  }
  const adresse = `http://127.0.0.1:${portRetenu}/`;
  ecrireEtat(projet, { port: portRetenu, url: adresse, pid: process.pid });

  let minuterie = null;
  const surveillant = fs.watch(projet, { recursive: true }, (type, nom) => {
    if (nom && IGNORES.test(String(nom))) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      let resultat;
      // Une erreur imprévue (fichier verrouillé par un éditeur ou un antivirus…) ne doit pas arrêter l'aperçu.
      try { resultat = assembler(optionsAssemblage); } catch (e) {
        resultat = { ok: false, erreurs: [{ regle: 'assemblage-impossible', gravite: 'erreur', message: `Assemblage impossible : ${e.message}` }] };
      }
      if (resultat.ok) {
        dernier = resultat;
        // Le rapport de la page portait sur l'ancienne version : la page rechargée en enverra un nouveau.
        fs.rmSync(rapportPage, { force: true });
        diffuser('recharger', { erreurs: resultat.erreurs.length });
      } else {
        if (!dernier.ok) dernier = resultat;
        diffuser('erreur', { message: resultat.erreurs.map((e) => e.message).join(' · ') });
      }
    }, delai);
  });
  surveillant.on('error', (e) => diffuser('erreur', { message: `Surveillance du projet interrompue : ${e.message}` }));

  function fermer() {
    clearTimeout(minuterie);
    clearInterval(battement);
    surveillant.close();
    clients.forEach((res) => res.end());
    return new Promise((resolve) => serveur.close(() => resolve()));
  }

  return { port: portRetenu, url: adresse, fermer };
}

function ouvrirNavigateur(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--'));
  const iPort = args.indexOf('--port');
  const port = iPort >= 0 ? parseInt(args[iPort + 1], 10) : 4321;
  if (!dossier || !Number.isInteger(port)) {
    console.error('Usage : node scripts/apercu.js <dossier-du-projet> [--port 4321] [--ouvrir]');
    process.exit(2);
  }
  demarrerApercu({ dossier, port }).then(({ url }) => {
    console.log(`Aperçu : ${url}`);
    if (args.includes('--ouvrir')) ouvrirNavigateur(url);
  }, (e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { demarrerApercu, injecterApercu };
