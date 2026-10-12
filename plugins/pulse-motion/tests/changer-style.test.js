'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { changerStyle } = require('../scripts/changer-style.js');
const { annuler } = require('../scripts/historique.js');
const { assembler } = require('../scripts/assembler.js');
const { stylesEssai, projetTypes } = require('./aide/styles.js');

const lire = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const deroule = (dir) => JSON.parse(lire(dir, 'deroule.json'));

test('alpha → beta : scènes toutes faites recopiées avec leurs textes, scène libre à réécrire, annulable', () => {
  const racine = stylesEssai(['alpha', 'beta']);
  const dir = projetTypes(racine);
  const carteAvant = lire(dir, 'scenes/04-carte.html');
  const r = changerStyle({ dossier: dir, style: 'beta', dossierStyles: racine });
  assert.deepEqual(r, { ok: true, style: 'beta', recopiees: ['intro', 'regles', 'seuil'], aReecrire: ['carte'] });
  assert.equal(deroule(dir).style, 'beta');
  assert.equal(deroule(dir).scenes[1].textes.point3, 'Noter');
  const regles = lire(dir, 'scenes/02-regles.html');
  assert.match(regles, /<!-- style:beta -->/);
  assert.match(regles, /data-scene="regles"/);
  assert.match(regles, /data-texte="point3"/);
  assert.doesNotMatch(regles, /data-texte="point4"/);
  assert.match(regles, /data-decor[^>]*data-dur="9"/);
  assert.match(lire(dir, 'scenes/03-seuil.html'), /nombre 0→4 /);
  assert.equal(lire(dir, 'scenes/04-carte.html'), carteAvant);
  assert.equal(assembler({ dossier: dir, dossierStyles: racine, ecrire: false }).erreurs.length, 0);
  annuler(dir);
  assert.equal(deroule(dir).style, 'alpha');
  assert.match(lire(dir, 'scenes/02-regles.html'), /<!-- style:alpha -->/);
});

test('style inconnu, même style, fichier hors du projet : rien n\'est modifié', () => {
  const racine = stylesEssai(['alpha', 'beta']);
  const dir = projetTypes(racine);
  const inconnu = changerStyle({ dossier: dir, style: 'neon', dossierStyles: racine });
  assert.equal(inconnu.ok, false);
  assert.match(inconnu.message, /Style « neon » introuvable/);
  assert.deepEqual(changerStyle({ dossier: dir, style: 'alpha', dossierStyles: racine }), { ok: true, style: 'alpha', recopiees: [], aReecrire: [], inchange: true });
  const d = deroule(dir);
  d.scenes[0].fichier = '../ailleurs.html';
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d));
  const dehors = changerStyle({ dossier: dir, style: 'beta', dossierStyles: racine });
  assert.equal(dehors.ok, false);
  assert.match(dehors.message, /« intro » .*sort du dossier du projet/);
  assert.equal(fs.existsSync(path.join(dir, '.historique')), false);
  assert.equal(deroule(dir).style, 'alpha');
});

test('fichier de scène hors de scenes/, déroulé visé ou fichier partagé : refus avant toute écriture', () => {
  const racine = stylesEssai(['alpha', 'beta']);
  for (const [fichiers, motif] of [
    [['deroule.json'], /« intro » .*scenes\//],
    [['.'], /« intro » .*scenes\//],
    [['scenes/a.html', 'scenes/a.html'], /« regles » .*déjà utilisé par la scène « intro »/],
  ]) {
    const dir = projetTypes(racine);
    const d = deroule(dir);
    fichiers.forEach((f, i) => { d.scenes[i].fichier = f; });
    fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d));
    const avant = lire(dir, 'deroule.json');
    const r = changerStyle({ dossier: dir, style: 'beta', dossierStyles: racine });
    assert.equal(r.ok, false, fichiers.join());
    assert.match(r.message, motif);
    assert.equal(lire(dir, 'deroule.json'), avant);
    assert.equal(fs.existsSync(path.join(dir, '.historique')), false);
  }
});

test('styles livrés : clair-pedagogique puis les cinq autres, scènes recopiées, assemblage sans erreur', () => {
  const { projetCatalogue } = require('./aide/catalogue.js');
  const dir = projetCatalogue('clair-pedagogique');
  for (const style of ['energique', 'minimal', 'tech-sombre', 'chaleureux', 'editorial']) {
    const r = changerStyle({ dossier: dir, style });
    assert.equal(r.ok, true, `${style} : ${r.message}`);
    assert.equal(r.recopiees.length, 8, style);
    assert.deepEqual(assembler({ dossier: dir, ecrire: false }).erreurs, [], style);
  }
});
