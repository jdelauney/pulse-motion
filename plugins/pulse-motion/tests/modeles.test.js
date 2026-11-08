'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { listerModeles, lireModele, validerModele, trouverModele, copierExemple, stylesLivres } = require('../scripts/modeles.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const PM = path.join(__dirname, '..', 'scripts', 'pm.js');
const IDS = ['accueil', 'annonce', 'formation-courte', 'histoire', 'pitch', 'presentation-produit', 'publication-sociale'];
const GENRE = { 'formation-courte': 'formation', 'presentation-produit': 'produit', histoire: 'storytelling', 'publication-sociale': 'social', accueil: 'formation', pitch: 'produit', annonce: 'social' };

test('modeles : les sept modèles existent, valides, avec leur genre', () => {
  assert.deepEqual(listerModeles().map((m) => m.id), IDS);
  for (const id of IDS) {
    const m = lireModele(id);
    assert.deepEqual(validerModele(m), [], id);
    assert.equal(m.genre, GENRE[id], id);
  }
  assert.equal(lireModele('annonce').format, '9:16');
  assert.equal(lireModele('publication-sociale').format, '9:16');
  assert.equal(lireModele('../styles'), null);
});

test('modeles : validation des types et longueurs', () => {
  const m = structuredClone(lireModele('pitch'));
  m.scenes[0].type = 'galerie';
  m.scenes[1].textes.slogan = 'une phrase';
  m.scenes[2].mouvements = ['999'];
  m.scenes[3].effet = 'arc-en-ciel';
  m.scenes[4].transition = 'tourbillon';
  m.scenes[5].duree = 1;
  const err = validerModele(m);
  assert.ok(err.some((e) => /type inconnu « galerie »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /clé de texte inconnue « slogan »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /mouvement introuvable « 999 »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /effet inconnu « arc-en-ciel »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /« transition »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /au moins 1,5 s/.test(e)), err.join('\n'));
  const long = structuredClone(lireModele('pitch'));
  long.scenes.push({ ...long.scenes[0], id: 'bis', duree: 30 });
  assert.ok(validerModele(long).some((e) => /±15 %/.test(e)));
});

test('modeles : styles conseillés connus (trois styles livrés, rendus en 9:16 comme en 16:9)', () => {
  const livres = stylesLivres();
  for (const m of listerModeles()) {
    assert.equal(m.styles.length, 3, m.id);
    for (const s of m.styles) assert.ok(livres.includes(s), `${m.id} : ${s}`);
  }
  const faux = structuredClone(lireModele('annonce'));
  faux.styles = ['energique', 'fluo', 'minimal'];
  assert.ok(validerModele(faux).some((e) => /Style inconnu « fluo »/.test(e)));
});

test('modeles : trouver le modèle d\'après le sujet', () => {
  assert.equal(trouverModele('pitch pour nos investisseurs').id, 'pitch');
  assert.equal(trouverModele('lancement de notre nouvelle offre').id, 'annonce');
  assert.equal(trouverModele('une vidéo de bienvenue pour les nouveaux arrivants').id, 'accueil');
  assert.equal(trouverModele('3 astuces pour Instagram').id, 'publication-sociale');
  assert.equal(trouverModele('la présentation de notre application').id, 'presentation-produit');
  assert.equal(trouverModele("l'histoire de notre association").id, 'histoire');
  assert.equal(trouverModele('une formation sur les gestes barrières').id, 'formation-courte');
});

test('modeles : trouver sans correspondance rend null', () => {
  assert.equal(trouverModele('anniversaire de ma grand-mère'), null);
  assert.equal(trouverModele(''), null);
});

test('modeles : chaque phrase publiée retrouve son propre modèle', () => {
  for (const m of listerModeles()) {
    for (const p of m.phrases) {
      const t = trouverModele(p.replace(/^\/pulse-motion:creer /, ''));
      assert.equal(t && t.id, m.id, p);
    }
  }
});

test('exemple : copie dans un dossier vide', () => {
  const dir = path.join(dossierTemporaire('pm-modele-'), 'video');
  const r = copierExemple('formation-courte', dir);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.titre, 'La chaîne du froid');
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'exemples', 'chaine-du-froid', 'deroule.json'), 'utf8'));
  const copie = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  assert.equal(copie.scenes.length, source.scenes.length);
  assert.ok(!fs.existsSync(path.join(dir, 'sortie')));
});

test('exemple : dossier déjà occupé refusé', () => {
  const dir = dossierTemporaire('pm-modele-');
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{"titre":"Ma vidéo"}');
  const r = copierExemple('formation-courte', dir);
  assert.equal(r.ok, false);
  assert.match(r.message, /contient déjà une vidéo/);
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), '{"titre":"Ma vidéo"}');
  assert.deepEqual(fs.readdirSync(dir), ['deroule.json']);
});

test('exemple : modèle inconnu, la liste des modèles est donnée', () => {
  const r = copierExemple('cuisine', dossierTemporaire('pm-modele-'));
  assert.equal(r.ok, false);
  assert.match(r.message, /Modèle inconnu « cuisine »/);
  assert.match(r.message, /pitch/);
});

test('pm modeles : liste, afficher, trouver, exemple', () => {
  const liste = spawnSync(process.execPath, [PM, 'modeles', 'liste'], { encoding: 'utf8' });
  assert.equal(liste.status, 0, liste.stderr);
  assert.equal(JSON.parse(liste.stdout).length, 7);
  const fiche = spawnSync(process.execPath, [PM, 'modeles', 'afficher', 'pitch'], { encoding: 'utf8' });
  assert.equal(JSON.parse(fiche.stdout).genre, 'produit');
  const rien = spawnSync(process.execPath, [PM, 'modeles', 'trouver', 'anniversaire de ma grand-mère'], { encoding: 'utf8' });
  assert.equal(rien.status, 1);
  assert.equal(rien.stdout.trim(), 'null');
  const dir = dossierTemporaire('pm-modele-');
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{}');
  const refus = spawnSync(process.execPath, [PM, 'modeles', 'exemple', 'pitch', dir], { encoding: 'utf8' });
  assert.equal(refus.status, 1);
  assert.equal(JSON.parse(refus.stdout).ok, false);
});
