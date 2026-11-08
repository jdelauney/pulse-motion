'use strict';
/* Pulse Motion – projets de démonstration : une scène courte par mouvement du dictionnaire (ou par effet, par mouvement de
 * personnage), dans un vrai style, pour les voir jouer. Sert à la page de choix (pulse-motion mouvements choisir) et aux
 * aperçus du wiki (outils/site/medias.js).
 *
 *   projetDeDemos(dossier, demos, { style, ratio, titre }) -> { deroule, plages: [{ id, debut, fin }] }
 *   demosDeMouvements(entrees) -> demos       (une scène par entrée ; deux pour une transition : avant, puis l'entrée)
 *   projetDeMouvements(dossier, entrees, options) -> { deroule, plages: [{ no, debut, fin }] }
 */
const fs = require('node:fs');
const path = require('node:path');
const { calculerMinutage } = require('../../moteur/minutage.js');

// Mise en page des démonstrations, lisibles même en vignette : contenu centré dans un conteneur qui couvre la scène (la
// section elle-même garde son affichage, que le moteur règle), titre et texte grands ; un motif à la couleur de la charte sur
// chaque décor vide de l'extrait, pour voir bouger la caméra (un plan lointain porte un motif plus large). Une démo `sombre`
// (un effet de particules : étincelles, confettis) passe sur un fond sombre, où les lumières additives se voient.
const DECOR = `<style>@scope {
  .pm-demo { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 2cqh; padding: 6cqh; text-align: center; }
  h2 { font-size: 11cqh !important; line-height: 1.1; margin: 0; }
  p { font-size: 9cqh !important; margin: 0; }
  .decor:empty { position: absolute; inset: -10%; pointer-events: none;
    background: radial-gradient(circle, color-mix(in srgb, var(--c-primaire) 28%, transparent) 0 0.7cqh, transparent 0.8cqh) 0 0 / 6cqh 6cqh; }
  .decor[data-profondeur="0.2"]:empty { background: radial-gradient(circle, color-mix(in srgb, var(--c-accent) 22%, transparent) 0 3cqh, transparent 3.1cqh) 0 0 / 16cqh 16cqh; }
  :scope[data-demo-sombre] { background: #15131a !important; color: #f4f1f8 !important; }
  :scope[data-demo-sombre] h2, :scope[data-demo-sombre] p { color: #f4f1f8 !important; }
} </style>`;

/** Écrit le projet (déroulé et scènes) dans `dossier` ; les démos s'enchaînent en coupe franche, sauf transition demandée. */
function projetDeDemos(dossier, demos, { style = 'clair-pedagogique', ratio = '16:9', titre = 'Démonstrations' } = {}) {
  fs.mkdirSync(path.join(dossier, 'scenes'), { recursive: true });
  const scenes = demos.map((d) => {
    const fichier = `scenes/${d.id}.html`;
    fs.writeFileSync(path.join(dossier, fichier), `<section data-scene="${d.id}"${d.sombre ? ' data-demo-sombre' : ''}>\n${DECOR}\n<div class="pm-demo">\n${d.html}\n</div>\n</section>\n`);
    return { id: d.id, fichier, duree: d.duree, textes: d.textes || {}, transition: d.transition || 'coupe' };
  });
  const deroule = { version: 1, titre, genre: 'formation', parcours: 'rapide', format: { ratio, ips: 30 }, style, scenes };
  fs.writeFileSync(path.join(dossier, 'deroule.json'), JSON.stringify(deroule, null, 2));
  const min = calculerMinutage(scenes, {});
  return { deroule, plages: min.scenes.map((s) => ({ id: s.id, debut: s.debut, fin: s.fin })) };
}

/** Démos des entrées du dictionnaire : `m<no>` (3 s, sur fond sombre pour un effet), ou `m<no>a` puis `m<no>` (1,5 s chacune) pour une transition. */
function demosDeMouvements(entrees) {
  const demos = [];
  for (const e of entrees) {
    const textes = { titre: e.nom.fr, texte: e.nom.metier };
    if (e.recette.type === 'transition') {
      const transition = JSON.parse(`{${e.recette.exemple}}`).transition;
      demos.push({ id: `m${e.no}a`, duree: 1.5, textes: { titre: 'Avant' }, html: '<h2 data-texte="titre" data-start="0"></h2>' });
      demos.push({ id: `m${e.no}`, duree: 1.5, textes, transition, html: '<h2 data-texte="titre" data-start="0"></h2>' });
    } else {
      demos.push({ id: `m${e.no}`, duree: 3, textes, html: e.recette.exemple, sombre: e.recette.type === 'effet' });
    }
  }
  return demos;
}

/** -> { deroule, plages: [{ no, debut, fin }] } : une plage par entrée (une transition couvre ses deux scènes). */
function projetDeMouvements(dossier, entrees, options = {}) {
  const { deroule, plages } = projetDeDemos(dossier, demosDeMouvements(entrees), { titre: 'Mouvements', ...options });
  const parId = new Map(plages.map((p) => [p.id, p]));
  return {
    deroule,
    plages: entrees.map((e) => {
      const p = parId.get(`m${e.no}`);
      const avant = parId.get(`m${e.no}a`);
      return { no: e.no, debut: avant ? avant.debut : p.debut, fin: p.fin };
    }),
  };
}

const DELAI_DEFAUT = 30 * 60 * 1000;
const MESSAGE_DELAI = 'Aucun choix envoyé : la page a été fermée ou laissée ouverte trop longtemps.';

/**
 * Page locale de choix : les mouvements (d'une catégorie, ou tous) jouent en direct dans le moteur ; la personne coche,
 * annote, puis envoie. Écoute seulement 127.0.0.1 ; refuse un autre nom d'hôte (même règle que l'aperçu).
 * -> Promise<{ ok: true, choix: [{ no, nom, metier, note }] } | { ok: false, message }>, une fois les choix reçus ou le délai passé.
 * surPret(url) est appelé quand la page est servie.
 */
function choisirMouvements({ categorie = null, delai = DELAI_DEFAUT, port = 0, surPret = () => {} } = {}) {
  const http = require('node:http');
  const os = require('node:os');
  const { charger } = require('../mouvements.js');
  const { assembler } = require('../assembler.js');
  const { categories, mouvements } = charger();
  const entrees = mouvements.filter((e) => !categorie || e.categorie === categorie);
  if (!entrees.length) return Promise.resolve({ ok: false, message: `Catégorie inconnue « ${categorie} ». Catégories : ${categories.map((c) => c.id).join(', ')}.` });

  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-choisir-'));
  const nettoyer = () => { try { fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 3 }); } catch { /* dossier verrouillé : laissé au système */ } };
  let pageVideo;
  let pageChoix;
  try {
    const { plages } = projetDeMouvements(dossier, entrees);
    const r = assembler({ dossier });
    if (!r.ok) throw new Error(r.erreurs.map((x) => x.message || x).join(' '));
    pageVideo = fs.readFileSync(r.fichier, 'utf8');
    const nomCategorie = (id) => (categories.find((c) => c.id === id) || {}).nom || id;
    const donnees = { mouvements: entrees.map((e, i) => ({ no: e.no, nom: e.nom.fr, metier: e.nom.metier, sens: e.sens, categorie: e.categorie, nomCategorie: nomCategorie(e.categorie), debut: plages[i].debut, fin: plages[i].fin })) };
    const json = JSON.stringify(donnees).replace(/</g, '\\u003c');
    // Remplacement par une fonction : un « $ » des données ($&, $') ne doit pas être lu comme un motif de remplacement.
    pageChoix = fs.readFileSync(path.join(__dirname, '..', '..', 'moteur', 'choisir', 'page.html'), 'utf8')
      .replace('/*DONNEES*/null', () => json);
  } catch (e) {
    nettoyer();
    return Promise.resolve({ ok: false, message: `La page de choix n'a pas pu être préparée : ${e.message}` });
  }

  return new Promise((resoudre) => {
    let fini = false;
    let minuteur;
    const serveur = http.createServer((req, res) => {
      const { port: portEcoute } = serveur.address();
      if (![`127.0.0.1:${portEcoute}`, `localhost:${portEcoute}`].includes(String(req.headers.host || '').toLowerCase())) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Refusé.');
        return;
      }
      const chemin = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && (chemin === '/' || chemin === '/video')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(chemin === '/' ? pageChoix : pageVideo);
        return;
      }
      if (req.method === 'POST' && chemin === '/envoyer') {
        // Seule la page servie ici peut envoyer : une autre origine (un site ouvert dans le même navigateur) est refusée, et
        // le corps doit être du JSON (un autre site ne peut pas en envoyer sans une requête préalable, à laquelle on ne répond pas).
        const origine = req.headers.origin;
        const site = req.headers['sec-fetch-site'];
        if ((origine && ![`http://127.0.0.1:${portEcoute}`, `http://localhost:${portEcoute}`].includes(String(origine).toLowerCase()))
          || (site && site !== 'same-origin' && site !== 'none')) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Refusé : envoi venant d\'une autre page.');
          return;
        }
        if (!/^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] || ''))) {
          res.writeHead(415, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Refusé : le choix doit être envoyé en JSON.');
          return;
        }
        let corps = '';
        req.on('data', (m) => { corps += m; if (corps.length > 1e6) req.destroy(); });
        req.on('end', () => {
          let choix;
          try {
            choix = JSON.parse(corps).choix
              .map((c) => ({ e: entrees.find((x) => x.no === String(c.no)), note: String(c.note || '').trim().slice(0, 200) }))
              .filter((c) => c.e)
              .map((c) => ({ no: c.e.no, nom: c.e.nom.fr, metier: c.e.nom.metier, note: c.note }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Choix illisible.');
            return;
          }
          // Terminer seulement une fois la réponse partie : fermer les connexions plus tôt la couperait.
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const fin = () => terminer({ ok: true, choix });
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

module.exports = { projetDeDemos, demosDeMouvements, projetDeMouvements, choisirMouvements, MESSAGE_DELAI };
