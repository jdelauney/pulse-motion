'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');

const BIBLIOTHEQUE = path.join(__dirname, '..', 'effets');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(BIBLIOTHEQUE, `${nom}.json`), 'utf8'));
const charger = (nom) => (fs.existsSync(path.join(BIBLIOTHEQUE, `${nom}.json`)) ? lire(nom) : null);
const copie = (o) => JSON.parse(JSON.stringify(o));

test('egal : profond, ordre des clés indifférent', () => {
  assert.equal(R.egal({ a: [1, { b: 2, c: 3 }] }, { a: [1, { c: 3, b: 2 }] }), true);
  assert.equal(R.egal({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(R.egal({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(R.egal(null, {}), false);
  assert.equal(R.egal('1', 1), false);
});

test('differences : recette inchangée -> objet vide', () => {
  const base = R.resoudre('etincelles', charger);
  assert.deepEqual(R.differences(base, copie(base)), {});
});

test('differences : seuls les champs changés, émetteurs par nom ; fusionner redonne la recette', () => {
  const base = R.resoudre('etincelles', charger);
  const r = copie(base);
  r.parametres.couleur.defaut = '#9fd3ff';
  r.parametres.densite = { defaut: 2, min: 0, max: 5 };
  r.rendu_calque.bloom = 1.5;
  r.emetteurs[0].forces = [{ type: 'gravite', valeur: '30 * gravite' }];
  r.emetteurs[0].vie.couleur.degrade[1] = '#0000ff';
  r.emetteurs[1].vie.intensite.de = 5;
  r.emetteurs.push({ nom: 'fumee', naissance: { debit: 10 } });
  const d = R.differences(base, r);
  assert.deepEqual(d, {
    parametres: { couleur: { defaut: '#9fd3ff' }, densite: { defaut: 2, min: 0, max: 5 } },
    rendu_calque: { bloom: 1.5 },
    emetteurs: [
      { nom: 'gerbe', forces: [{ type: 'gravite', valeur: '30 * gravite' }], vie: { couleur: { degrade: ['#ffffff', '#0000ff', 'couleur', '#00000000'] } } },
      { nom: 'braise', vie: { intensite: { de: 5 } } },
      { nom: 'fumee', naissance: { debit: 10 } },
    ],
  });
  assert.deepEqual(R.fusionner(base, d), r);
});

test('differences : braises (dérivée d\'etincelles dans la bibliothèque) se réécrit par etend', () => {
  assert.equal(lire('braises').etend, 'etincelles');
  const base = R.resoudre('etincelles', charger);
  const braises = R.resoudre('braises', charger);
  const memesMeta = { ...braises, nom: base.nom, description: base.description };
  const d = R.differences(base, memesMeta);
  assert.deepEqual(R.fusionner(base, d), memesMeta);
  const ecrite = { version: 1, nom: 'braises-bis', etend: 'etincelles', description: braises.description, ...d };
  const relue = R.resoudre('braises-bis', (n) => (n === 'braises-bis' ? ecrite : charger(n)));
  assert.deepEqual({ ...relue, nom: 'braises' }, braises);
});

test('differences : retrait et réordonnancement refusés, avec la raison', () => {
  const base = R.resoudre('etincelles', charger);
  const sansBraise = copie(base);
  sansBraise.emetteurs.pop();
  assert.throws(() => R.differences(base, sansBraise), (e) => e.regle === 'effet-invalide' && /Impossible à écrire par « etend » : l'émetteur « braise » est retiré\./.test(e.message));
  const sansSeuil = copie(base);
  delete sansSeuil.rendu_calque.seuil_bloom;
  assert.throws(() => R.differences(base, sansSeuil), /le champ « rendu_calque\.seuil_bloom » est retiré/);
  const inverse = copie(base);
  inverse.emetteurs.reverse();
  assert.throws(() => R.differences(base, inverse), /l'ordre des émetteurs change/);
  const sansMort = copie(base);
  delete sansMort.emetteurs[0].a_la_mort;
  assert.throws(() => R.differences(base, sansMort), /le champ « emetteurs\[gerbe\]\.a_la_mort » est retiré/);
});
