'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { appliquerCorrections } = require('../scripts/lib/corriger.js');
const { annuler } = require('../scripts/historique.js');
const { copierProjet } = require('./aide/projet.js');

const lire = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
const copies = (dir) => (fs.existsSync(path.join(dir, '.historique')) ? fs.readdirSync(path.join(dir, '.historique')) : []);

test('corrections : textes dans l\'ordre, une durée par scène (la plus longue), une seule copie d\'historique', () => {
  const dir = copierProjet('projet-simple');
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8');
  const r = appliquerCorrections(dir, [
    { regle: 'typographie', correction: { scene: 'intro', texte: 'sous', valeur: 'a\u202f!' } },
    { regle: 'majuscule-accentuee', correction: { scene: 'intro', texte: 'sous', valeur: 'A\u202f!' } },
    { regle: 'temps-mort', correction: { scene: 'intro', duree: 3.5 } },
    { regle: 'lecture', correction: { scene: 'intro', duree: 5 } },
    { regle: 'pause-finale', correction: { scene: 'chiffre', duree: 3.4 } },
    { regle: 'contraste' },
  ]);
  assert.equal(r.erreur, undefined);
  const d = lire(dir);
  assert.equal(d.scenes[0].textes.sous, 'A\u202f!');
  assert.equal(d.scenes[0].duree, 5);
  assert.equal(d.scenes[1].duree, 3.4);
  assert.deepEqual(r.corrections.map((c) => [c.regle, c.scene, c.element, c.avant, c.apres]), [
    ['typographie', 'intro', 'sous', '3 minutes <pour> comprendre', 'a\u202f!'],
    ['majuscule-accentuee', 'intro', 'sous', 'a\u202f!', 'A\u202f!'],
    ['lecture', 'intro', undefined, 4, 5],
    ['pause-finale', 'chiffre', undefined, 3, 3.4],
  ]);
  assert.match(r.corrections[2].message, /Scène « intro » : durée 4 s → 5 s \(temps de lecture\)/);
  assert.equal(copies(dir).length, 1);
  annuler(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), avant);
});

test('rien à corriger : aucune écriture, aucune copie d\'historique', () => {
  const dir = copierProjet('projet-simple');
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8');
  assert.deepEqual(appliquerCorrections(dir, [{ regle: 'contraste' }, { regle: 'typographie', correction: { scene: 'absente', texte: 'x', valeur: 'y' } }]), { corrections: [] });
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), avant);
  assert.deepEqual(copies(dir), []);
});

test('déroulé impossible à écrire : rien de changé, aucune copie laissée, message clair', () => {
  const dir = copierProjet('projet-simple');
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8');
  fs.mkdirSync(path.join(dir, `deroule.json.${process.pid}.tmp`));
  const r = appliquerCorrections(dir, [{ regle: 'lecture', correction: { scene: 'intro', duree: 6 } }]);
  assert.deepEqual(r.corrections, []);
  assert.match(r.erreur, /n'ont pas pu être écrites dans deroule\.json.*Rien n'a été changé/);
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), avant);
  assert.deepEqual(copies(dir), []);
});

test('revue : message d\'une correction de texte lisible (la règle appliquée, pas des espaces invisibles)', () => {
  const dir = copierProjet('projet-simple');
  const r = appliquerCorrections(dir, [{ regle: 'typographie', details: 'espace fine avant « ? », « ! », « ; »', correction: { scene: 'intro', texte: 'sous', valeur: 'Voir\u202f!' } }]);
  assert.equal(r.corrections[0].message, 'Scène « intro », texte « sous » : typographie française (espace fine avant « ? », « ! », « ; »).');
});

test('revue : copie d\'historique impossible, message en français, rien de changé', () => {
  const dir = copierProjet('projet-simple');
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8');
  fs.writeFileSync(path.join(dir, '.historique'), 'un fichier à la place du dossier');
  const r = appliquerCorrections(dir, [{ regle: 'lecture', correction: { scene: 'intro', duree: 6 } }]);
  assert.deepEqual(r.corrections, []);
  assert.match(r.erreur, /Rien n'a été changé/);
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), avant);
});

test('revue : écriture ratée, seule la copie de ce passage est retirée (pas de recopie du projet)', () => {
  const dir = copierProjet('projet-simple');
  const scene = path.join(dir, 'scenes', '01-intro.html');
  fs.mkdirSync(path.join(dir, `deroule.json.${process.pid}.tmp`));
  // Une recopie du projet (annuler) recrée les fichiers des scènes : leur identifiant changerait.
  const identifiant = fs.statSync(scene, { bigint: true }).ino;
  const r = appliquerCorrections(dir, [{ regle: 'lecture', correction: { scene: 'intro', duree: 6 } }]);
  assert.match(r.erreur, /Rien n'a été changé/);
  assert.equal(fs.statSync(scene, { bigint: true }).ino, identifiant);
  assert.deepEqual(copies(dir), []);
});

test('ajustement de taille appliqué, message lisible ; copieFaite : pas de seconde copie', () => {
  const dir = copierProjet('projet-simple');
  const r = appliquerCorrections(dir, [{ regle: 'debordement', correction: { scene: 'intro', ajustement: { cle: 'titre', taille: 0.85 } } }], { copieFaite: true });
  assert.deepEqual(lire(dir).scenes[0].ajustements, { titre: { taille: 0.85 } });
  assert.equal(r.corrections[0].message, 'Scène « intro », texte « titre » : taille réduite à 85 % (le texte débordait de son cadre).');
  assert.deepEqual(copies(dir), []);
});
