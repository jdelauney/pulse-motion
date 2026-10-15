'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const historique = require('../scripts/historique.js');
const P = require('../scripts/lib/personnages.js');
const { SANS_CIBLE } = require('../scripts/lib/routes-personnages.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

function requete(url, { methode = 'GET', corps, type = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: methode, headers: corps === undefined ? {} : { 'Content-Type': type } }, (res) => {
      let texte = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { texte += d; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(texte); } catch { /* pas du JSON */ }
        resolve({ statut: res.statusCode, type: res.headers['content-type'], texte, json });
      });
    });
    r.on('error', reject);
    if (corps !== undefined) r.write(typeof corps === 'string' ? corps : JSON.stringify(corps));
    r.end();
  });
}

function bibliothequeDeTest() {
  const d = path.join(dossierTemporaire(), 'personnages');
  fs.cpSync(P.BIBLIOTHEQUE, d, { recursive: true });
  return d;
}
function videoDeTest() {
  const d = dossierTemporaire();
  fs.writeFileSync(path.join(d, 'deroule.json'), '{}');
  return d;
}
const GRATTE = { type: 'pose', nom: 'gratte-tete', objet: { description: 'se gratte la tête', angles: { brasAvant: -150, avantBrasAvant: -120 } } };

test('routes : modules du moteur servis, contexte d\'une vidéo', async () => {
  const video = videoDeTest();
  const a = await demarrerApercu({ dossier: video, port: 47561, bibliothequePersonnages: bibliothequeDeTest() });
  try {
    const m = await requete(`${a.url}_pm/personnages/modules/squelette.js`);
    assert.equal(m.statut, 200);
    assert.match(m.type, /javascript/);
    assert.match(m.texte, /M\.squelette = api/);
    const e = await requete(`${a.url}_pm/personnages/edition.mjs`);
    assert.match(e.texte, /export function creerEdition/);
    const c = await requete(`${a.url}_pm/personnages/contexte`);
    assert.equal(c.json.cible, 'video');
    assert.ok(c.json.lu.clips.marche && c.json.lu.poses.debout && c.json.lu.gabarits.standard);
    assert.equal(c.json.lu.sources.clips.marche, 'plugin');
    assert.deepEqual(c.json.erreurs, []);
    assert.equal((await requete(`${a.url}_pm/personnages/modules/../../scripts/pm.js`)).statut, 404);
  } finally { await a.fermer(); }
});

test('enregistrer dans la vidéo : fichier stable, historique, annule retire le fichier', async () => {
  const video = videoDeTest();
  const a = await demarrerApercu({ dossier: video, port: 47571, bibliothequePersonnages: bibliothequeDeTest() });
  try {
    const r = await requete(`${a.url}_pm/personnages/enregistrer`, { methode: 'POST', corps: GRATTE });
    assert.equal(r.statut, 200, r.texte);
    assert.deepEqual(r.json, { ok: true, cible: 'video', fichier: 'personnages/poses/gratte-tete.json' });
    const fichier = path.join(video, 'personnages', 'poses', 'gratte-tete.json');
    const texte = fs.readFileSync(fichier, 'utf8');
    assert.equal(P.serialiser('pose', JSON.parse(texte)), texte);
    assert.ok(fs.existsSync(path.join(video, '.historique')));
    historique.annuler(video);
    assert.equal(fs.existsSync(fichier), false);
  } finally { await a.fermer(); }
});

test('enregistrer : 409 puis remplacement confirmé ; 422 si invalide, rien n\'est écrit ; 415 sans JSON', async () => {
  const video = videoDeTest();
  const a = await demarrerApercu({ dossier: video, port: 47581, bibliothequePersonnages: bibliothequeDeTest() });
  try {
    const url = `${a.url}_pm/personnages/enregistrer`;
    assert.equal((await requete(url, { methode: 'POST', corps: GRATTE })).statut, 200);
    const deja = await requete(url, { methode: 'POST', corps: GRATTE });
    assert.equal(deja.statut, 409);
    assert.match(deja.json.message, /« gratte-tete » existe déjà dans cette vidéo/);
    const encore = await requete(url, { methode: 'POST', corps: Object.assign({}, GRATTE, { remplacer: true, objet: { angles: { brasAvant: -140 } } }) });
    assert.equal(encore.statut, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(video, 'personnages', 'poses', 'gratte-tete.json'), 'utf8')).angles.brasAvant, -140);
    const mal = await requete(url, { methode: 'POST', corps: { type: 'clip', nom: 'mal', objet: { boucle: true, duree: 1, cles: [{ t: 0, angles: { cuisseAvent: 1 } }] } } });
    assert.equal(mal.statut, 422);
    assert.ok(mal.json.erreurs.some((m) => /voulais-tu « cuisseAvant »/.test(m)));
    assert.equal(fs.existsSync(path.join(video, 'personnages', 'clips', 'mal.json')), false);
    const nom = await requete(url, { methode: 'POST', corps: Object.assign({}, GRATTE, { nom: '../x' }) });
    assert.equal(nom.statut, 422);
    assert.equal((await requete(url, { methode: 'POST', corps: 'a=1', type: 'application/x-www-form-urlencoded' })).statut, 415);
  } finally { await a.fermer(); }
});

test('hors d\'une vidéo : contexte sans cible, enregistrement refusé', async () => {
  const vide = dossierTemporaire();
  const a = await demarrerApercu({ dossier: vide, port: 47591, bibliothequePersonnages: bibliothequeDeTest() });
  try {
    const c = await requete(`${a.url}_pm/personnages/contexte`);
    assert.equal(c.json.cible, null);
    assert.equal(c.json.message, SANS_CIBLE);
    const r = await requete(`${a.url}_pm/personnages/enregistrer`, { methode: 'POST', corps: GRATTE });
    assert.equal(r.statut, 403);
    assert.equal(fs.existsSync(path.join(vide, 'personnages')), false);
  } finally { await a.fermer(); }
});

test('mode bibliothèque : écrit dans la bibliothèque, pas dans le dossier de l\'aperçu', async () => {
  const vide = dossierTemporaire();
  const bib = bibliothequeDeTest();
  const a = await demarrerApercu({ dossier: vide, port: 47601, bibliothequePersonnages: bib, ecrireBibliothequePersonnages: true });
  try {
    assert.equal((await requete(`${a.url}_pm/personnages/contexte`)).json.cible, 'bibliotheque');
    const r = await requete(`${a.url}_pm/personnages/enregistrer`, { methode: 'POST', corps: GRATTE });
    assert.equal(r.statut, 200, r.texte);
    assert.equal(r.json.fichier, 'personnages/poses/gratte-tete.json');
    assert.ok(fs.existsSync(path.join(bib, 'poses', 'gratte-tete.json')));
    const marche = await requete(`${a.url}_pm/personnages/enregistrer`, { methode: 'POST', corps: { type: 'clip', nom: 'marche', objet: { boucle: true, duree: 1, cles: [{ t: 0, pose: 'debout' }] } } });
    assert.equal(marche.statut, 409);
    assert.match(marche.json.message, /dans la bibliothèque/);
  } finally { await a.fermer(); }
});
