'use strict';
// Critères de S8 J3 « Galerie à témoin » côté plugin (spec Styles et réalisation, 5.6) : contenu témoin unique, images A et B
// rendues par le plugin pour tout style, page locale « styles choisir ».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const T = require('../scripts/lib/temoin.js');
const { projetEssai, texteExemple } = require('../scripts/lib/projet-essai.js');
const { choisirStyles, stylesAChoisir, MESSAGE_DELAI } = require('../scripts/lib/choisir-styles.js');
const { CATEGORIES } = require('../scripts/lib/contrat.js');
const P = require('../scripts/style-perso.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const RACINE = path.join(__dirname, '..');
const LIVRES = path.join(RACINE, 'styles');
const navigateur = trouverNavigateur();

async function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  try { return await fn(process.env.PULSE_MOTION_DOSSIER); } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
}

function requete(url, { methode = 'GET', corps, hote, entetes = {} } = {}) {
  return new Promise((resoudre, rejeter) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: methode, headers: { ...(hote ? { Host: hote } : {}), ...(corps ? { 'Content-Type': 'application/json' } : {}), ...entetes } }, (res) => {
      let texte = '';
      res.on('data', (m) => { texte += m; });
      res.on('end', () => resoudre({ statut: res.statusCode, texte }));
    });
    req.on('error', rejeter);
    if (corps) req.write(typeof corps === 'string' ? corps : JSON.stringify(corps));
    req.end();
  });
}

const deroule = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));

test('témoin : textes, images A et B et boucle d\'un même fichier, pour chaque style livré', () => {
  const temoin = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'styles', 'temoin.json'), 'utf8'));
  assert.deepEqual(T.TEMOIN, temoin);
  assert.deepEqual(temoin.images, { A: { scene: 'titre', part: 0.8 }, B: { scene: 'chiffre', part: 0.8, valeur: 1250 } });
  for (const style of fs.readdirSync(LIVRES)) {
    const dossierStyle = path.join(LIVRES, style);
    const catalogue = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'catalogue.json'), 'utf8'));
    // A et B : les scènes titre et chiffre aux durées du catalogue, instants à 80 %.
    const a = T.projetTemoin({ dossierStyle });
    const d = deroule(a);
    assert.deepEqual(d.scenes.map((s) => s.id), ['titre', 'chiffre'], style);
    assert.deepEqual(d.scenes.map((s) => s.duree), ['titre', 'chiffre'].map((n) => catalogue.scenes.find((s) => s.nom === n).duree), style);
    for (const s of d.scenes) for (const [cle, texte] of Object.entries(s.textes)) assert.equal(texte, texteExemple(cle, catalogue.scenes.find((x) => x.nom === s.id).textes[cle]), `${style} ${s.id}.${cle}`);
    assert.equal(d.scenes[0].textes.titre, temoin.textes.titre[0]);
    const { A, B } = T.instantsTemoin(d);
    const { calculerMinutage } = require('../moteur/minutage.js');
    const min = calculerMinutage(d.scenes, {}).scenes;
    assert.ok(Math.abs(A - (min[0].debut + 0.8 * (min[0].fin - min[0].debut))) < 1e-9, style);
    assert.ok(Math.abs(B - (min[1].debut + 0.8 * (min[1].fin - min[1].debut))) < 1e-9, style);
    assert.match(fs.readFileSync(path.join(a, 'scenes', 'chiffre.html'), 'utf8'), /nombre\s+0\s*→\s*1250\b/, style);
    // La boucle : les huit scènes, 2,5 s chacune, mêmes textes.
    const b = deroule(T.projetBoucle({ dossierStyle }));
    assert.deepEqual(b.scenes.map((s) => s.id), catalogue.scenes.map((s) => s.nom), style);
    assert.ok(b.scenes.every((s) => s.duree === 2.5), style);
    assert.deepEqual(b.scenes[0].textes, d.scenes[0].textes, style);
  }
  // Le compteur d'un style personnel qui a changé sa valeur revient à 1 250 dans le témoin, pas ailleurs.
  const { avecValeur } = require('../scripts/lib/projet-essai.js');
  assert.equal(avecValeur('<span data-tween="nombre 0→48 expo-out">0</span>', 1250), '<span data-tween="nombre 0→1250 expo-out">0</span>');
  assert.equal(avecValeur('<span data-tween="scale 0.9→1.05">', 1250), '<span data-tween="scale 0.9→1.05">');
  const essai = deroule(projetEssai({ dossierStyle: path.join(LIVRES, 'minimal'), textes: 'exemple' }));
  assert.ok(essai.scenes.every((s, i) => s.duree === JSON.parse(fs.readFileSync(path.join(LIVRES, 'minimal', 'catalogue.json'), 'utf8')).scenes[i].duree));
});

test('style planche --temoin : deux images, pour un style livré et pour un style personnel', { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 240000 }, () => avecPersonnel(async (perso) => {
  P.nouveauStyle({ nom: 'papercraft', depuis: 'chaleureux' });
  const { decoder } = require('../scripts/lib/png.js');
  for (const nom of ['minimal', 'papercraft']) {
    const r = await P.plancheStyle({ nom, temoin: true, navigateur });
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(r.images.map((f) => path.basename(f)), ['temoin-a.png', 'temoin-b.png'], nom);
    for (const f of r.images) {
      const png = decoder(fs.readFileSync(f));
      assert.deepEqual([png.largeur, png.hauteur], [960, 540], `${nom} ${path.basename(f)}`);
    }
    assert.notDeepEqual(fs.readFileSync(r.images[0]), fs.readFileSync(r.images[1]), `${nom} : A et B diffèrent`);
    assert.equal(r.fichier, path.join(perso, 'essais', nom, 'planche.html'));
    assert.match(fs.readFileSync(r.fichier, 'utf8'), /<th class="colonne">Style : /);
  }
  // Même style, même instant : la même image (déterminisme).
  const a1 = fs.readFileSync(path.join(perso, 'essais', 'papercraft', 'temoin-a.png'));
  await P.plancheStyle({ nom: 'papercraft', temoin: true, navigateur });
  assert.ok(a1.equals(fs.readFileSync(path.join(perso, 'essais', 'papercraft', 'temoin-a.png'))), 'image A identique d\'un rendu à l\'autre');
}));

test('styles choisir : envoi rend { style, note } ; envoi d\'une autre origine refusé', { timeout: 120000 }, () => avecPersonnel(async () => {
  // Les styles à choisir : livrés et personnels vérifiés seulement, dans l'ordre des catégories.
  P.nouveauStyle({ nom: 'brouillon', depuis: 'minimal' });
  const liste = stylesAChoisir();
  assert.equal(liste.some((s) => s.style === 'brouillon'), false, 'style personnel non vérifié : pas montré');
  assert.deepEqual(liste.map((s) => s.style), fs.readdirSync(LIVRES).sort());
  assert.ok(liste.every((s) => s.categorie === 'essentiels' && s.nomCategorie === CATEGORIES[0].nom && s.usages.length === 3 && s.nonPas));
  let url;
  const fin = choisirStyles({ delai: 60000, surPret: (u) => { url = u; } });
  while (!url) await new Promise((r) => setTimeout(r, 20));
  const page = await requete(url);
  assert.equal(page.statut, 200);
  assert.match(page.texte, /Envoyer à Claude/);
  assert.match(page.texte, /"style":"clair-pedagogique"/);
  assert.doesNotMatch(page.texte, /\/\*DONNEES\*\/null/);
  // La boucle témoin d'un style, assemblée à la demande ; un style inconnu : rien.
  const video = await requete(url + 'video/minimal');
  assert.equal(video.statut, 200);
  assert.match(video.texte, /Garder la chaîne du froid/);
  assert.equal((await requete(url + 'video/neon')).statut, 404);
  assert.equal((await requete(url, { hote: 'exemple.fr' })).statut, 403);
  // Envois refusés : autre origine, autre site, type simple, style inconnu ; la page attend toujours.
  const origine = url.replace(/\/$/, '');
  const corps = { style: 'editorial', note: '  plus sobre pour le client  ' };
  assert.equal((await requete(url + 'envoyer', { methode: 'POST', corps, entetes: { Origin: 'https://exemple.fr' } })).statut, 403);
  assert.equal((await requete(url + 'envoyer', { methode: 'POST', corps, entetes: { Origin: origine, 'Sec-Fetch-Site': 'cross-site' } })).statut, 403);
  assert.equal((await requete(url + 'envoyer', { methode: 'POST', corps, entetes: { Origin: origine, 'Content-Type': 'text/plain' } })).statut, 415);
  assert.equal((await requete(url + 'envoyer', { methode: 'POST', corps: { style: 'neon' }, entetes: { Origin: origine } })).statut, 400);
  assert.equal((await requete(url + 'envoyer', { methode: 'POST', corps, entetes: { Origin: origine, 'Sec-Fetch-Site': 'same-origin' } })).statut, 200);
  assert.deepEqual(await fin, { ok: true, style: 'editorial', note: 'plus sobre pour le client' });
  // Catégorie inconnue, délai passé.
  assert.match((await choisirStyles({ categorie: 'cuisine' })).message, /Catégorie inconnue « cuisine »/);
  assert.deepEqual(await choisirStyles({ delai: 200 }), { ok: false, message: MESSAGE_DELAI });
}));

test('styles choisir : la page se lit sans données injectées ailleurs, une seule note, filtre par catégorie', () => {
  const page = fs.readFileSync(path.join(RACINE, 'moteur', 'choisir', 'styles.html'), 'utf8');
  assert.equal((page.match(/\/\*DONNEES\*\/null/g) || []).length, 1);
  assert.match(page, /type = 'radio'/);
  assert.match(page, /JSON\.stringify\(\{ style: choisi, note:/);
  assert.match(page, /aria-label="Catégories"/);
  assert.doesNotMatch(page, /https?:\/\//, 'aucune ressource en ligne');
  // Ligne de commande et aide.
  assert.match(fs.readFileSync(path.join(RACINE, 'scripts', 'pm.js'), 'utf8'), /styles choisir \[--categorie <id>\] \[--ouvrir\]/);
  assert.match(fs.readFileSync(path.join(RACINE, 'skills', 'creer', 'SKILL.md'), 'utf8'), /« Voir tous les styles » : `pulse-motion styles choisir --ouvrir` en arrière-plan/);
  assert.match(fs.readFileSync(path.join(RACINE, 'skills', 'retoucher', 'SKILL.md'), 'utf8').split('\n').find((l) => l.startsWith('| Style |')), /« montre-moi les autres styles »[\s\S]*`pulse-motion styles choisir --ouvrir` en arrière-plan/);
});
