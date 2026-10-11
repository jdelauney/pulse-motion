'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');

const EFFETS = path.join(__dirname, 'fixtures', 'effets');
const depuisDossier = (nom) => {
  const f = path.join(EFFETS, `${nom}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const depuisObjet = (o) => (nom) => o[nom] || null;
const proche = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

test('resoudre : héritage, fusion profonde, émetteurs fusionnés par nom', () => {
  const r = R.resoudre('fille', depuisDossier);
  assert.equal(r.nom, 'fille');
  assert.equal(r.etend, null);
  assert.deepEqual(r.parametres.nombre, { defaut: 200, min: 10, max: 1000 });
  assert.equal(r.emetteurs.length, 2);
  assert.deepEqual(r.emetteurs[0].forces, [{ type: 'gravite', valeur: 10 }], 'les tableaux sont remplacés');
  assert.equal(r.emetteurs[0].naissance.debit, 'nombre / dur', 'le reste de l\'émetteur est hérité');
  assert.equal(r.emetteurs[1].nom, 'eclat');
});

test('resoudre : inconnu, etend introuvable, héritage circulaire', () => {
  assert.throws(() => R.resoudre('absent', depuisObjet({})), (e) => e.regle === 'effet-inconnu' && /Effet « absent » introuvable/.test(e.message));
  assert.throws(() => R.resoudre('a', depuisObjet({ a: { version: 1, etend: 'z' } })), (e) => e.regle === 'effet-invalide' && /« etend » vise « z », introuvable/.test(e.message));
  assert.throws(() => R.resoudre('a', depuisObjet({ a: { etend: 'b' }, b: { etend: 'a' } })), (e) => e.regle === 'effet-invalide' && /héritage circulaire \(a → b → a\)/.test(e.message));
});

test('analyserReglages : espaces et point-virgule final tolérés', () => {
  assert.deepEqual(R.analyserReglages('nombre:300 ; couleur: accent;'), { valeurs: { nombre: '300', couleur: 'accent' }, erreurs: [] });
  assert.deepEqual(R.analyserReglages(''), { valeurs: {}, erreurs: [] });
  assert.deepEqual(R.analyserReglages('nombre 300').erreurs, ['réglage « nombre 300 » illisible (attendu « nom: valeur »)']);
});

test('couleurLineaire : hex courts et longs, charte, paramètre', () => {
  assert.deepEqual(R.couleurLineaire('#fff', {}), [1, 1, 1, 1]);
  const c = R.couleurLineaire('#ff880080', {});
  assert.ok(proche(c[0], 1) && proche(c[1], 0.2462) && c[2] === 0 && proche(c[3], 128 / 255), String(c));
  assert.deepEqual(R.couleurLineaire('accent', { charte: { accent: '#0000ff' } }), [0, 0, 1, 1]);
  assert.deepEqual(R.couleurLineaire('teinte', { couleurs: { teinte: 'accent' }, charte: { accent: '#000' } }), [0, 0, 0, 1]);
  assert.throws(() => R.couleurLineaire('rouge', {}), /couleur « rouge » inconnue/);
});
