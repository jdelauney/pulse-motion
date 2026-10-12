'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { execFileSync } = require('node:child_process');
const { etatProjet, donnerAccord, choisirParcours, verifierNode } = require('../scripts/etat.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const vide = () => dossierTemporaire('pm-vide-');

test('version de Node : 20 ou plus', () => {
  assert.deepEqual(verifierNode('20.0.0'), { version: '20.0.0', ok: true });
  const ancien = verifierNode('18.19.1');
  assert.equal(ancien.ok, false);
  assert.match(ancien.message, /Node\.js 18\.19\.1 est trop ancien.*20 ou plus.*https:\/\/nodejs\.org/);
});

test('dossier sans vidéo : étape « questions »', () => {
  const e = etatProjet(vide());
  assert.equal(e.projet, false);
  assert.equal(e.etape, 'questions');
  assert.match(e.prochaine, /\/pulse-motion:creer/);
});

test('parcours rapide : déroulé à valider, puis fabrication, puis aperçu', () => {
  const dir = copierProjet('projet-simple');
  assert.equal(etatProjet(dir).etape, 'deroule-a-valider');
  fs.rmSync(path.join(dir, 'scenes', '02-chiffre.html'));
  const e = donnerAccord(dir, 'deroule');
  assert.equal(e.etape, 'fabrication');
  assert.deepEqual(e.scenesManquantes, ['chiffre']);
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), '<section data-scene="chiffre"></section>');
  assert.equal(etatProjet(dir).etape, 'apercu');
  assert.equal(etatProjet(dir).titre, 'La chaîne du froid');
});

test('parcours accompagné : accords du style puis de la vidéo', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.parcours = 'accompagne'; });
  donnerAccord(dir, 'deroule');
  assert.equal(etatProjet(dir).etape, 'style-a-valider');
  donnerAccord(dir, 'style');
  assert.equal(etatProjet(dir).etape, 'video-a-valider');
  assert.equal(donnerAccord(dir, 'video').etape, 'apercu');
});

test('parcours choisi avant que le déroulé existe', () => {
  const dir = vide();
  assert.equal(choisirParcours(dir, 'accompagne').parcours, 'accompagne');
  assert.throws(() => choisirParcours(dir, 'lent'), /Parcours inconnu : « lent »/);
});

test('déroulé invalide : étape « deroule-a-corriger » avec les erreurs', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.genre = 'tuto'; });
  const e = etatProjet(dir);
  assert.equal(e.etape, 'deroule-a-corriger');
  assert.match(e.erreurs[0], /« genre »/);
});

test('accords et aperçu conservés avec les autres clés d\'etat.json', () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, '.pulse-motion'));
  fs.writeFileSync(path.join(dir, '.pulse-motion', 'etat.json'), JSON.stringify({ apercu: { port: 4321, url: 'http://127.0.0.1:4321/', pid: process.pid } }));
  const e = donnerAccord(dir, 'deroule');
  assert.deepEqual(e.apercu, { url: 'http://127.0.0.1:4321/', actif: true });
  const memo = JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'etat.json'), 'utf8'));
  assert.equal(memo.apercu.port, 4321);
  assert.equal(memo.accords.deroule, true);
  assert.throws(() => donnerAccord(dir, 'musique'), /Accord inconnu/);
});

test('ligne de commande : JSON de l\'état', () => {
  const dir = copierProjet('projet-simple');
  const sortie = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'etat.js'), dir, '--accord', 'deroule'], { encoding: 'utf8' });
  assert.equal(JSON.parse(sortie).etape, 'apercu');
});

test('parcours accompagné : le style se choisit avant la fabrication des scènes', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.parcours = 'accompagne'; });
  fs.rmSync(path.join(dir, 'scenes', '02-chiffre.html'));
  donnerAccord(dir, 'deroule');
  const e = etatProjet(dir);
  assert.equal(e.etape, 'style-a-valider');
  assert.match(e.prochaine, /comparaison des styles/);
  donnerAccord(dir, 'style');
  assert.equal(etatProjet(dir).etape, 'fabrication');
});
