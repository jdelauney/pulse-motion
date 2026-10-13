'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { execFileSync } = require('node:child_process');
const { sauvegarder, annuler, CONSERVEES } = require('../scripts/historique.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const lire = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('sauvegarder puis annuler restaure déroulé, scènes et assets', () => {
  const dir = copierProjet('projet-simple');
  const avant = lire(dir, 'deroule.json');
  const sceneAvant = lire(dir, 'scenes/01-intro.html');
  assert.deepEqual(sauvegarder(dir).numero, '001');

  modifierDeroule(dir, (d) => { d.titre = 'Retouché'; });
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), '<section data-scene="intro">changé</section>');
  fs.writeFileSync(path.join(dir, 'assets', 'nouveau.svg'), '<svg/>');
  fs.rmSync(path.join(dir, 'assets', 'logo.svg'));

  assert.deepEqual(annuler(dir), { numero: '001' });
  assert.equal(lire(dir, 'deroule.json'), avant);
  assert.equal(lire(dir, 'scenes/01-intro.html'), sceneAvant);
  assert.ok(fs.existsSync(path.join(dir, 'assets', 'logo.svg')));
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'nouveau.svg')), false);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.historique')), []);
});

test('annuler deux fois remonte deux retouches ; sans copie, message clair', () => {
  const dir = copierProjet('projet-simple');
  sauvegarder(dir);
  modifierDeroule(dir, (d) => { d.titre = 'Un'; });
  sauvegarder(dir);
  modifierDeroule(dir, (d) => { d.titre = 'Deux'; });
  annuler(dir);
  assert.equal(JSON.parse(lire(dir, 'deroule.json')).titre, 'Un');
  annuler(dir);
  assert.equal(JSON.parse(lire(dir, 'deroule.json')).titre, 'La chaîne du froid');
  assert.throws(() => annuler(dir), /Aucune retouche à annuler/);
});

test(`seules les ${CONSERVEES} dernières copies sont gardées, la numérotation continue`, () => {
  const dir = copierProjet('projet-simple');
  for (let i = 0; i < CONSERVEES + 3; i++) sauvegarder(dir);
  const restantes = fs.readdirSync(path.join(dir, '.historique')).sort();
  assert.equal(restantes.length, CONSERVEES);
  assert.equal(restantes[0], '004');
  assert.equal(restantes[restantes.length - 1], '023');
});

test('ligne de commande : sans déroulé, code 1 et message en français', () => {
  const dir = dossierTemporaire('pm-vide-');
  let code = 0, erreur = '';
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'historique.js'), 'sauvegarder', dir], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) {
    code = e.status; erreur = e.stderr;
  }
  assert.equal(code, 1);
  assert.match(erreur, /Aucun déroulé à sauvegarder/);
});

test('« annule » après l\'ajout d\'une police ou d\'un terme : seul ce dernier ajout est défait', () => {
  const { annuler } = require('../scripts/historique.js');
  const { installerFichier } = require('../scripts/polices.js');
  const { noterGlossaire, lireGlossaire } = require('../scripts/vocabulaire.js');
  const { police } = require('./aide/polices.js');
  const dir = copierProjet('projet-simple');
  noterGlossaire({ dossier: dir, terme: 'HACCP', sens: 'Méthode' });
  noterGlossaire({ dossier: dir, terme: 'DLC', sens: 'Date limite' });
  annuler(dir);
  assert.deepEqual(lireGlossaire(dir).termes.map((t) => t.terme), ['HACCP']);
  const src = path.join(dir, 'Marque.woff2');
  fs.writeFileSync(src, police({ format: 'woff2' }));
  assert.equal(installerFichier({ fichier: src, dans: path.join(dir, 'charte', 'polices') }).ok, true);
  assert.ok(fs.existsSync(path.join(dir, 'charte', 'polices', 'Marque.woff2')));
  annuler(dir);
  assert.equal(fs.existsSync(path.join(dir, 'charte', 'polices', 'Marque.woff2')), false);
  assert.deepEqual(lireGlossaire(dir).termes.map((t) => t.terme), ['HACCP']);
});

test('correctifs : voix provisoires hors des copies, et gardées par « annule »', () => {
  const dir = copierProjet('projet-simple');
  const prov = path.join(dir, 'assets', 'voix', 'provisoire');
  fs.mkdirSync(prov, { recursive: true });
  fs.writeFileSync(path.join(prov, 'intro.wav'), 'prise provisoire');
  fs.writeFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), 'vraie prise');
  const { dossier } = sauvegarder(dir);
  assert.equal(fs.existsSync(path.join(dossier, 'assets', 'voix', 'provisoire')), false);
  assert.equal(fs.existsSync(path.join(dossier, 'assets', 'voix', 'intro.wav')), true);
  fs.writeFileSync(path.join(prov, 'intro.wav'), 'nouvelle prise provisoire');
  annuler(dir);
  assert.equal(fs.readFileSync(path.join(prov, 'intro.wav'), 'utf8'), 'nouvelle prise provisoire');
  assert.equal(fs.readFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), 'utf8'), 'vraie prise');
});
