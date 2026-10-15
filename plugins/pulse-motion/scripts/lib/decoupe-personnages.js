'use strict';
/* Pulse Motion – découper une illustration SVG en personnage dessiné (côté Node).
 *
 *   analyserFichier({ fichier, sortie })   -> { analyse, png }        formes, sélecteurs, boîtes, couleurs ; PNG annoté avec grille
 *   decouperVideo({ dossier, nom })        -> { fichier, signalees, profilCopie, echelle, couleurs }
 *   fusionnerDessin(ancien, partiel, vue)  -> { dessin, profilCopie }  (pur) la vue découpée remplace l'ancienne, le reste est gardé
 *   renommerCouleur(dessin, ancien, nouveau) -> dessin                  (pur) clé de « couleurs » et var(--ancien) partout
 *
 * Le calcul se fait dans Chrome sans fenêtre (moteur/personnages/decoupe.js, le même module que l'atelier) sur le SVG
 * réellement rendu. La source est préparée avant : prologue, DOCTYPE, <script> et attributs on… retirés.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const P = require('./personnages.js');

const MODULE = path.resolve(__dirname, '..', '..', 'moteur', 'personnages', 'decoupe.js');
const NOM_COULEUR = /^[a-z][a-z0-9-]*$/;
const SANS_NAVIGATEUR = 'Chrome ou Edge introuvable : la découpe se calcule dans un navigateur. Lancez « pulse-motion outils » pour voir quoi installer.';

function ErreurDecoupe(message) { return Object.assign(new Error(message), { decoupe: true }); }

/** Source SVG sûre à ouvrir : ni script, ni attribut on…, ni prologue. */
function preparerSource(texte) {
  let s = String(texte).replace(/^﻿/, '');
  s = s.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/>/gi, '');
  s = s.replace(/[\s/](on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
  s = s.replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#');
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)[A-Za-z_][\w.-]*;/i.test(s)) throw ErreurDecoupe('Ce SVG utilise des styles « par entités » (export Illustrator) : le réexporter avec « Propriétés CSS : éléments de style » ou « attributs de présentation ».');
  const debut = s.search(/<svg[\s>]/i);
  if (debut < 0) throw ErreurDecoupe('Ce fichier n\'est pas un SVG (aucune balise <svg>).');
  return s.slice(debut).trim();
}

const clone = (x) => JSON.parse(JSON.stringify(x));

function fusionnerDessin(ancien, partiel, vue) {
  const d = ancien ? clone(ancien) : {};
  delete d.nom;
  d.pieces = d.pieces || {};
  let profilCopie = false;
  for (const k of Object.keys(d.pieces)) {
    // Un profil identique à l'ancienne vue découpée en était une copie : il est remplacé lui aussi.
    if (vue !== 'profil' && d.pieces[k][vue] !== undefined && d.pieces[k].profil === d.pieces[k][vue]) delete d.pieces[k].profil;
    delete d.pieces[k][vue];
    if (!Object.keys(d.pieces[k]).length) delete d.pieces[k];
  }
  for (const [k, svg] of Object.entries(partiel.pieces)) {
    d.pieces[k] = d.pieces[k] || {};
    d.pieces[k][vue] = svg;
    if (!d.pieces[k].profil) { d.pieces[k].profil = svg; profilCopie = profilCopie || vue !== 'profil'; }
  }
  d.gabarit = partiel.gabarit;
  // Couleurs : celles de la découpe, plus celles que le dessin utilisait ailleurs (autres vues, bouches ajoutées).
  d.couleurs = Object.assign({}, d.couleurs || {}, partiel.couleurs);
  if (partiel.visage && vue !== 'dos') {
    const v = d.visage || {};
    v.oeil = Object.assign({}, partiel.visage.oeil);
    v.bouches = v.bouches || {};
    const neutre = Object.assign({}, v.bouches.neutre || {});
    if (vue !== 'profil' && neutre[vue] !== undefined && neutre.profil === neutre[vue]) delete neutre.profil;
    v.bouches.neutre = Object.assign(neutre, { [vue]: partiel.visage.bouche });
    v.vues = v.vues || {};
    if (vue !== 'profil' && v.vues[vue] && JSON.stringify(v.vues.profil) === JSON.stringify(v.vues[vue])) delete v.vues.profil;
    if (!v.bouches.neutre.profil) v.bouches.neutre.profil = partiel.visage.bouche;
    v.vues = v.vues || {};
    v.vues[vue] = partiel.visage.vue;
    if (!v.vues.profil) v.vues.profil = partiel.visage.vue;
    d.visage = v;
  }
  return { dessin: d, profilCopie };
}

function renommerCouleur(dessin, ancien, nouveau) {
  if (!NOM_COULEUR.test(nouveau)) throw ErreurDecoupe(`Nom de couleur « ${nouveau} » invalide (minuscules, chiffres, tirets ; ex. peau).`);
  const couleurs = dessin.couleurs || {};
  if (couleurs[ancien] === undefined) throw ErreurDecoupe(`Couleur « ${ancien} » introuvable (couleurs : ${Object.keys(couleurs).join(', ') || 'aucune'}).`);
  if (couleurs[nouveau] !== undefined) throw ErreurDecoupe(`La couleur « ${nouveau} » existe déjà.`);
  const echappe = ancien.replace(/[-]/g, '\\-');
  const motif = new RegExp(`var\\(--${echappe}(?=[,)\\s])`, 'g');
  const d = JSON.parse(JSON.stringify(dessin).replace(motif, `var(--${nouveau}`));
  d.couleurs = {};
  for (const [k, v] of Object.entries(couleurs)) d.couleurs[k === ancien ? nouveau : k] = v;
  return d;
}

/* ---------- pages exécutées dans Chrome ---------- */
const enLigne = (t) => t.replace(/<\/script/gi, '<\\/script');
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function page(source, donnees, script) {
  // La source vient de la personne : la politique de sécurité n'autorise que nos trois scripts (nonce) et aucun
  // chargement extérieur (images, polices, feuilles importées, cadres). Le nettoyage de preparerSource s'y ajoute.
  const nonce = require('node:crypto').randomBytes(16).toString('base64');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<style>html,body{margin:0;background:#FFFFFF}#cadre{position:relative;display:inline-block}#cadre>svg{display:block}#calque{position:absolute;left:0;top:0;pointer-events:none}</style></head>
<body><div id="cadre"><div id="source">${source}</div></div>
<script type="application/json" id="donnees">${json(donnees)}</script>
<script nonce="${nonce}">${enLigne(fs.readFileSync(MODULE, 'utf8'))}</script>
<script nonce="${nonce}">${script}</script></body></html>`;
}

const SCRIPT_ANALYSE = `
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.querySelector('#source svg');
  try {
    var a = M.decoupe.analyser(svg);
    var vb = a.viewBox, k = 1000 / Math.max(vb[2], vb[3]);
    var L = Math.round(vb[2] * k), H = Math.round(vb[3] * k);
    svg.setAttribute('width', L); svg.setAttribute('height', H);
    var c = document.createElementNS(NS, 'svg');
    c.setAttribute('id', 'calque'); c.setAttribute('width', L); c.setAttribute('height', H); c.setAttribute('viewBox', vb.join(' '));
    document.getElementById('cadre').appendChild(c);
    function el(tag, at, parent) { var e = document.createElementNS(NS, tag); for (var n in at) e.setAttribute(n, at[n]); (parent || c).appendChild(e); return e; }
    var pas = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].filter(function (p) { return Math.max(vb[2], vb[3]) / p <= 25; })[0] || 5000;
    var u = 1 / k;
    for (var x = Math.ceil(vb[0] / pas) * pas; x <= vb[0] + vb[2]; x += pas) {
      el('line', { x1: x, y1: vb[1], x2: x, y2: vb[1] + vb[3], stroke: '#00A3FF', 'stroke-width': u, opacity: 0.35 });
      el('text', { x: x + 2 * u, y: vb[1] + 12 * u, 'font-size': 11 * u, fill: '#0077BB', 'font-family': 'sans-serif' }).textContent = x;
    }
    for (var y = Math.ceil(vb[1] / pas) * pas; y <= vb[1] + vb[3]; y += pas) {
      el('line', { x1: vb[0], y1: y, x2: vb[0] + vb[2], y2: y, stroke: '#00A3FF', 'stroke-width': u, opacity: 0.35 });
      el('text', { x: vb[0] + 2 * u, y: y - 2 * u, 'font-size': 11 * u, fill: '#0077BB', 'font-family': 'sans-serif' }).textContent = y;
    }
    var teintes = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4', '#42D4F4', '#F032E6', '#9A6324', '#800000', '#469990'];
    a.formes.forEach(function (f, i) {
      var t = teintes[i % teintes.length], b = f.boite;
      el('rect', { x: b[0], y: b[1], width: b[2], height: b[3], fill: 'none', stroke: t, 'stroke-width': 1.5 * u, 'stroke-dasharray': (4 * u) + ' ' + (2 * u) });
      var g = el('g', {});
      el('rect', { x: b[0], y: b[1] - 13 * u, width: (String(f.n).length * 7 + 6) * u, height: 13 * u, fill: t }, g);
      el('text', { x: b[0] + 3 * u, y: b[1] - 3 * u, 'font-size': 11 * u, fill: '#FFFFFF', 'font-family': 'sans-serif', 'font-weight': 'bold' }, g).textContent = f.n;
    });
    window.__resultat = { analyse: a, largeur: L, hauteur: H };
  } catch (e) { window.__resultat = { erreur: e.message }; }
})();`;

const SCRIPT_DECOUPE = `
(function () {
  var D = JSON.parse(document.getElementById('donnees').textContent);
  var svg = document.querySelector('#source svg');
  try { window.__resultat = M.decoupe.decouper(svg, D.decoupe, D.gabarit); } catch (e) { window.__resultat = { erreur: e.message }; }
})();`;

async function executer(html, { navigateur, largeur = 1100, hauteur = 1100, capture = null } = {}) {
  const nav = navigateur === undefined ? require('./navigateur.js').trouverNavigateur() : navigateur;
  if (!nav) throw ErreurDecoupe(SANS_NAVIGATEUR);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-decoupe-'));
  let p = null;
  try {
    const fichier = path.join(dossier, 'page.html');
    fs.writeFileSync(fichier, html);
    p = await require('./cdp.js').ouvrirPage({ navigateur: nav, largeur, hauteur });
    await p.aller(pathToFileURL(fichier).href);
    const r = await p.evaluer('window.__resultat || { erreur: "la page n\'a pas fini" }');
    if (r.erreur) throw ErreurDecoupe(`Découpe : ${r.erreur}`);
    if (capture && r.largeur) {
      await p.envoyer('Emulation.setDeviceMetricsOverride', { width: r.largeur, height: r.hauteur, deviceScaleFactor: 1, mobile: false });
      fs.mkdirSync(path.dirname(capture), { recursive: true });
      fs.writeFileSync(capture, await p.capturer());
    }
    return r;
  } finally {
    if (p) await p.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

function lireSource(fichier) {
  if (!fs.existsSync(fichier)) throw ErreurDecoupe(`Fichier « ${fichier} » introuvable.`);
  return preparerSource(fs.readFileSync(fichier, 'utf8'));
}

async function analyserFichier({ fichier, sortie, navigateur }) {
  const r = await executer(page(lireSource(fichier), {}, SCRIPT_ANALYSE), { navigateur, capture: sortie });
  return { analyse: r.analyse, png: sortie };
}

async function decouperVideo({ dossier, nom, navigateur, ecrire }) {
  if (!fs.existsSync(path.join(dossier, 'deroule.json'))) throw ErreurDecoupe('Découper : ouvrez le dossier d\'une vidéo (le dessin s\'y range).');
  const lu = P.lire(dossier);
  const erreursDecoupe = lu.erreurs.filter((e) => e.type === 'decoupe' && e.nom === nom);
  if (erreursDecoupe.length) throw ErreurDecoupe(erreursDecoupe.map((e) => e.message).join('\n'));
  const decoupe = Object.hasOwn(lu.decoupes, nom) ? lu.decoupes[nom] : null;
  if (!decoupe) throw ErreurDecoupe(`Découpe « ${nom} » introuvable (personnages/decoupes/${nom}.json).`);
  const gabarit = lu.gabarits[decoupe.gabarit || 'standard'] || {};
  const r = await executer(page(lireSource(path.join(dossier, decoupe.source)), { decoupe: avecAlias(decoupe, lu, nom), gabarit }, SCRIPT_DECOUPE), { navigateur });
  if (r.erreurs.length) throw ErreurDecoupe(r.erreurs.join('\n'));
  const e = enregistrerDecoupe({ dossier, nom, partiel: r.partiel, vue: decoupe.vue, lu, ecrire });
  return Object.assign(e, { signalees: r.signalees, echelle: r.echelle, couleurs: r.partiel.couleurs });
}

/** Découpe complétée des noms de couleurs déjà donnés dans le dessin de la vidéo (les autres vues s'y réfèrent). */
function avecAlias(decoupe, lu, nom) {
  const ancien = Object.hasOwn(lu.dessins, nom) && lu.sources.dessins[nom] === 'video' ? lu.dessins[nom] : null;
  const alias = {};
  for (const [n, h] of Object.entries((ancien && ancien.couleurs) || {})) if (/^#[0-9a-f]{6}$/i.test(h)) alias[h.toUpperCase()] = n;
  return Object.assign({}, decoupe, { couleurs: Object.assign(alias, decoupe.couleurs || {}) });
}

/** Fusionne le résultat d'une découpe dans le dessin de la vidéo et l'enregistre (historique avant ; découpe aussi si donnée). */
function enregistrerDecoupe({ dossier, nom, partiel, vue, decoupe = null, lu = P.lire(dossier), ecrire }) {
  const ancien = Object.hasOwn(lu.dessins, nom) && lu.sources.dessins[nom] === 'video' ? lu.dessins[nom] : null;
  const { dessin, profilCopie } = fusionnerDessin(ancien, partiel, vue);
  const cible = path.join(dossier, 'personnages');
  // Tout est validé avant d'écrire : une découpe ou un dessin refusés ne laissent rien à moitié fait.
  const ctx = Object.assign({ nom }, P.contexteDe(lu));
  const erreurs = [...(decoupe ? P.valider('decoupe', Object.assign({}, decoupe, { nom }), ctx) : []), ...P.valider('dessin', Object.assign({}, dessin, { nom }), ctx)];
  if (erreurs.length) throw Object.assign(ErreurDecoupe(erreurs.join('\n')), { erreurs });
  require('../historique.js').sauvegarder(dossier);
  if (decoupe) P.enregistrer({ dossier: cible, type: 'decoupe', nom, objet: decoupe, lu, ecrire });
  const { fichier } = P.enregistrer({ dossier: cible, type: 'dessin', nom, objet: dessin, lu, ecrire });
  return { fichier, profilCopie };
}

module.exports = { preparerSource, fusionnerDessin, renommerCouleur, analyserFichier, decouperVideo, enregistrerDecoupe, avecAlias, lireSource, page, SANS_NAVIGATEUR };
