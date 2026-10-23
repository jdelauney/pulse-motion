'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { projetDeMouvements, choisirMouvements, MESSAGE_DELAI } = require('../scripts/lib/choisir-mouvements.js');
const { charger } = require('../scripts/mouvements.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

function requete(url, { methode = 'GET', corps, hote } = {}) {
  return new Promise((resoudre, rejeter) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: methode, headers: { ...(hote ? { Host: hote } : {}), ...(corps ? { 'Content-Type': 'application/json' } : {}) } }, (res) => {
      let texte = '';
      res.on('data', (m) => { texte += m; });
      res.on('end', () => resoudre({ statut: res.statusCode, texte }));
    });
    req.on('error', rejeter);
    if (corps) req.write(JSON.stringify(corps));
    req.end();
  });
}

const dossiersChoisir = () => fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('pm-choisir-'));

test('projetDeMouvements : une plage par entrée, contiguës, déroulé valide', () => {
  const dir = dossierTemporaire('pm-projet-mouvements-');
  const entrees = charger().mouvements;
  const { deroule, plages } = projetDeMouvements(dir, entrees);
  assert.equal(plages.length, entrees.length);
  assert.equal(plages[0].debut, 0);
  for (let i = 1; i < plages.length; i++) assert.ok(Math.abs(plages[i].debut - plages[i - 1].fin) < 1e-6);
  assert.deepEqual(validerDeroule(deroule), []);
});

test('choisir : délai dépassé, rien d\'envoyé, dossier temporaire supprimé', async () => {
  const avant = new Set(dossiersChoisir());
  const r = await choisirMouvements({ categorie: 'temps', delai: 300 });
  assert.deepEqual(r, { ok: false, message: MESSAGE_DELAI });
  assert.deepEqual(dossiersChoisir().filter((d) => !avant.has(d)), []);
});

test('choisir : pages servies, autre hôte refusé, choix envoyés avec leurs notes', async () => {
  let url;
  const fin = choisirMouvements({ categorie: 'entrees', delai: 20000, surPret: (u) => { url = u; } });
  while (!url) await new Promise((r) => setTimeout(r, 20));
  const page = await requete(url);
  assert.equal(page.statut, 200);
  assert.match(page.texte, /Envoyer à Claude/);
  assert.match(page.texte, /"no":"001"/);
  assert.equal((await requete(url + 'video')).statut, 200);
  assert.equal((await requete(url, { hote: 'exemple.fr' })).statut, 403);
  const envoi = await requete(url + 'envoyer', { methode: 'POST', corps: { choix: [{ no: '001', note: 'pour le titre' }, { no: '006' }, { no: '999' }] } });
  assert.equal(envoi.statut, 200);
  const r = await fin;
  assert.equal(r.ok, true);
  assert.deepEqual(r.choix, [
    { no: '001', nom: 'Apparition rebondie', metier: 'Pop-in', note: 'pour le titre' },
    { no: '006', nom: 'Révélé par masque', metier: 'Mask reveal', note: '' },
  ]);
});

test('choisir : catégorie inconnue', async () => {
  const r = await choisirMouvements({ categorie: 'cuisine', delai: 1000 });
  assert.equal(r.ok, false);
  assert.match(r.message, /Catégorie inconnue « cuisine »/);
});

const { trouverNavigateur } = require('./aide/navigateur.js');
const navigateur = trouverNavigateur();
test('démonstrations : une seule scène affichée à la fois (la mise en page ne force pas leur affichage)', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const { assembler } = require('../scripts/assembler.js');
  const { ouvrirPage } = require('../scripts/lib/cdp.js');
  const { pathToFileURL } = require('node:url');
  const dir = dossierTemporaire('pm-demos-');
  const { plages } = projetDeMouvements(dir, charger().mouvements.slice(0, 4));
  const r = assembler({ dossier: dir });
  const page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 400 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const visibles = await page.evaluer(`M.pret.then(() => { M.rendre(${(plages[2].debut + plages[2].fin) / 2});
      return Array.from(document.querySelectorAll('section[data-scene]')).filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.dataset.scene); })`);
    assert.deepEqual(visibles, ['m003']);
  } finally {
    await page.fermer();
  }
});
