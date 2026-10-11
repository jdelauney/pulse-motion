'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../scripts/charte.js');
const { annuler } = require('../scripts/historique.js');
const { etatProjet } = require('../scripts/etat.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');
const { pngRGBA } = require('./aide/png.js');

function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  try { return fn(process.env.PULSE_MOTION_DOSSIER); } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
}
const lireJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('enregistrer : charte/ + réglages du déroulé, logo et police des assets recopiés', () => avecPersonnel((perso) => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'charte'));
  fs.writeFileSync(path.join(dir, 'charte', 'charte.json'), JSON.stringify({ couleurs: { accent: '#b45309' } }));
  fs.writeFileSync(path.join(dir, 'charte', 'glossaire.md'), '# Glossaire\n');
  fs.writeFileSync(path.join(dir, 'assets', 'Marque.woff2'), 'police');
  modifierDeroule(dir, (d) => { d.charte.polices = { titres: 'assets/Marque.woff2' }; d.charte.ton = 'clair'; });
  assert.deepEqual(K.enregistrerCharte({ nom: 'client-dupont', dossier: dir }), { ok: true, nom: 'client-dupont', dossier: path.join(perso, 'chartes', 'client-dupont') });
  const sauvee = path.join(perso, 'chartes', 'client-dupont');
  assert.deepEqual(lireJSON(path.join(sauvee, 'charte.json')), {
    couleurs: { accent: '#b45309', primaire: '#0a6cff' }, polices: { titres: { famille: 'Marque', fichier: 'polices/Marque.woff2' } }, ton: 'clair', logo: 'logo.svg',
  });
  assert.ok(fs.existsSync(path.join(sauvee, 'logo.svg')) && fs.existsSync(path.join(sauvee, 'polices', 'Marque.woff2')) && fs.existsSync(path.join(sauvee, 'glossaire.md')));
  assert.deepEqual(K.listerChartes().map((c) => [c.nom, c.logo, c.glossaire]), [['client-dupont', true, true]]);
  assert.match(K.enregistrerCharte({ nom: 'Client Dupont', dossier: dir }).message, /lettres minuscules/);
}));

test('appliquer : recopie dans charte/, déroulé réduit à modele, annulable ; état signale une charte modifiée ou supprimée', () => avecPersonnel((perso) => {
  const source = copierProjet('projet-simple');
  K.enregistrerCharte({ nom: 'dupont', dossier: source });
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { delete d.charte; });
  assert.deepEqual(K.appliquerCharte({ nom: 'dupont', dossier: dir }), { ok: true, nom: 'dupont' });
  assert.deepEqual(lireJSON(path.join(dir, 'deroule.json')).charte, { modele: 'dupont' });
  assert.ok(fs.existsSync(path.join(dir, 'charte', 'logo.svg')));
  assert.deepEqual(etatProjet(dir).charte, { modele: 'dupont', existe: true, aJour: true });
  fs.writeFileSync(path.join(perso, 'chartes', 'dupont', 'charte.json'), JSON.stringify({ couleurs: { primaire: '#000000' } }));
  assert.equal(etatProjet(dir).charte.aJour, false);
  fs.rmSync(path.join(perso, 'chartes', 'dupont'), { recursive: true });
  assert.deepEqual(etatProjet(dir).charte, { modele: 'dupont', existe: false, aJour: false });
  annuler(dir);
  assert.equal(fs.existsSync(path.join(dir, 'charte')), false);
  assert.equal(lireJSON(path.join(dir, 'deroule.json')).charte, undefined);
  assert.match(K.appliquerCharte({ nom: 'absente', dossier: dir }).message, /Charte « absente » introuvable\. Chartes enregistrées : aucune/);
}));

test('dossier personnel impossible à écrire : message avec la variable', () => avecPersonnel((perso) => {
  fs.writeFileSync(path.join(perso, 'chartes'), 'fichier');
  const r = K.enregistrerCharte({ nom: 'x', dossier: copierProjet('projet-simple') });
  assert.equal(r.ok, false);
  assert.match(r.message, /PULSE_MOTION_DOSSIER/);
}));

test('depuis-logo : couleurs du logo rendues lisibles sur le fond du style, ajustement expliqué', () => {
  const dir = copierProjet('projet-simple');
  const logo = path.join(dir, 'charte-logo.png');
  fs.writeFileSync(logo, pngRGBA(60, 40, (x, y) => (x < 40 ? [0x1d, 0x4e, 0xd8, 255] : y < 30 ? [0xf5, 0x9e, 0x0b, 255] : [0, 0, 0, 0])));
  const r = K.depuisLogo({ fichier: logo });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.logo, { primaire: '#1d4ed8', accent: '#f59e0b' });
  assert.equal(r.couleurs.primaire, '#1d4ed8');
  assert.notEqual(r.couleurs.accent, '#f59e0b');
  assert.match(r.ajustements.join(), /couleur d'accent foncée de \d+ % pour rester lisible/);
  assert.match(K.depuisLogo({ fichier: path.join(dir, 'assets', 'logo.svg'), style: 'neon' }).message, /Style « neon » introuvable/);
  assert.match(K.depuisLogo({ fichier: path.join(dir, 'x.jpg') }).message, /introuvable|PNG ou en SVG/);
});
