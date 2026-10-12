'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../scripts/lib/typographie.js');

const FINE = '\u202f';
const INS = '\u00a0';

test('typographie : espaces avant ; ! ? et :, guillemets, apostrophe, points de suspension, unités', () => {
  assert.equal(T.corrigerTypographie('Pourquoi 4 °C ?').texte, `Pourquoi 4${FINE}°C${FINE}?`);
  assert.equal(T.corrigerTypographie('Attention!').texte, `Attention${FINE}!`);
  assert.equal(T.corrigerTypographie('Quoi ?!').texte, `Quoi${FINE}?!`);
  assert.equal(T.corrigerTypographie('Se consomme vite : le recongeler').texte, `Se consomme vite${INS}: le recongeler`);
  assert.equal(T.corrigerTypographie('Étape 1 : ranger').texte, `Étape 1${INS}: ranger`);
  assert.equal(T.corrigerTypographie('Il dit "non" !').texte, `Il dit «${INS}non${INS}»${FINE}!`);
  assert.equal(T.corrigerTypographie('« oui »').texte, `«${INS}oui${INS}»`);
  assert.equal(T.corrigerTypographie("l'essentiel, c'est tout").texte, 'l’essentiel, c’est tout');
  assert.equal(T.corrigerTypographie('Et ensuite...').texte, 'Et ensuite…');
  assert.equal(T.corrigerTypographie('50% en 2 h, 12kg et 25 €').texte, `50${FINE}% en 2${FINE}h, 12${FINE}kg et 25${FINE}€`);
  assert.deepEqual(T.corrigerTypographie('Pourquoi 4 °C ?').corrections, ['espace fine avant « ? », « ! », « ; »', 'espace fine entre un nombre et son unité']);
});

test('typographie : heures, ratios, adresses et mots collés inchangés', () => {
  for (const t of ['Rendez-vous à 12:30', 'Format 16:9', 'Voir https://a.fr/?x=1', '8h30 précises', '3 Lapins', 'Un texte sans rien']) {
    assert.deepEqual(T.corrigerTypographie(t), { texte: t, corrections: [] }, t);
  }
});

test('typographie : texte déjà correct inchangé, insécable ordinaire acceptée, corriger deux fois ne change rien', () => {
  for (const t of [`Pourquoi 4${FINE}°C${FINE}?`, `Attention${INS}!`, `«${FINE}oui${FINE}»`, `vite${INS}: oui`]) {
    assert.deepEqual(T.corrigerTypographie(t), { texte: t, corrections: [] }, t);
  }
  const une = T.corrigerTypographie('Il dit "non" ! 50% ... c\'est : fini').texte;
  assert.equal(T.corrigerTypographie(une).texte, une);
});

test('majuscules accentuées : début de texte et de phrase, liste fermée, jamais « A »', () => {
  assert.equal(T.corrigerMajuscules('Etape 2').texte, 'Étape 2');
  assert.equal(T.corrigerMajuscules('Fini. Equipe prête').texte, 'Fini. Équipe prête');
  assert.equal(T.corrigerMajuscules('Electricite').texte, 'Électricité');
  assert.equal(T.corrigerMajuscules('Etats-Unis').texte, 'États-Unis');
  assert.deepEqual(T.corrigerMajuscules('A ou B'), { texte: 'A ou B', corrections: [] });
  assert.deepEqual(T.corrigerMajuscules('Entrer ici'), { texte: 'Entrer ici', corrections: [] });
  assert.deepEqual(T.corrigerMajuscules('une Etape'), { texte: 'une Etape', corrections: [] });
  assert.deepEqual(T.corrigerMajuscules('Etape 2').corrections, ['majuscule accentuée « Étape »']);
});

test('mots doublés : signalés avec le texte proposé, sauf « nous nous », « vous vous »', () => {
  assert.deepEqual(T.motsDoubles('Ranger le le produit'), [{ mot: 'le', propose: 'Ranger le produit' }]);
  assert.deepEqual(T.motsDoubles('Nous nous lavons les mains, vous vous aussi'), []);
  assert.deepEqual(T.motsDoubles('Le lendemain'), []);
});

test('termes variables : casse et trait d\'union, pas les accents ni la majuscule de début de phrase', () => {
  const entrees = [
    { scene: 'a', cle: 'titre', texte: 'Un e-mail suffit' },
    { scene: 'b', cle: 'texte', texte: 'Envoyez un email' },
    { scene: 'b', cle: 'sous', texte: 'Le Covid et la COVID' },
    { scene: 'c', cle: 'titre', texte: 'Marché ou marche' },
    { scene: 'c', cle: 'sous', texte: 'Email envoyé' },
    { scene: 'c', cle: 'point1', texte: 'TOUT EN CAPITALES COVID' },
  ];
  assert.deepEqual(T.termesVariables(entrees, new Set()), [
    { formes: [{ forme: 'e-mail', scene: 'a' }, { forme: 'email', scene: 'b' }] },
    { formes: [{ forme: 'Covid', scene: 'b' }, { forme: 'COVID', scene: 'b' }] },
  ]);
  assert.deepEqual(T.termesVariables(entrees, new Set([T.cleTerme('email'), T.cleTerme('Covid')])), []);
});

test('revue : ponctuation enchaînée, une seule espace, et corriger deux fois ne change rien', () => {
  for (const [t, attendu] of [['Quoi ?!', 'Quoi\u202f?!'], ['Super !!!', 'Super\u202f!!!'], ['Vraiment?!', 'Vraiment\u202f?!'], ['Et alors… ?', 'Et alors…\u202f?']]) {
    const une = T.corrigerTypographie(t).texte;
    assert.equal(une, attendu, t);
    assert.deepEqual(T.corrigerTypographie(une), { texte: une, corrections: [] }, t);
  }
});

test('revue : « L » n\'est pas une unité après un nombre suivi d\'un mot ; mL et l\'unité seule le restent', () => {
  for (const t of ['Étape 2 L’eau', 'Tome 3 L']) assert.deepEqual(T.corrigerTypographie(t), { texte: t, corrections: [] }, t);
  assert.equal(T.corrigerTypographie('Verser 20 mL').texte, 'Verser 20\u202fmL');
});

test('revue : guillemets droits laissés quand le texte a déjà des « » ou qu\'il s\'agit de pouces', () => {
  for (const t of ['27" et 32"', 'Écran 15"']) assert.equal(T.corrigerTypographie(t).texte, t, t);
  assert.equal(T.corrigerTypographie('«\u00a0Il a dit "oui"\u00a0»').texte, '«\u00a0Il a dit "oui"\u00a0»');
});

test('revue : répétitions volontaires de l\'oral non signalées', () => {
  for (const t of ['C\'est très très bien', 'Si si, vraiment', 'Bla bla bla', 'Non non', 'Oui oui']) assert.deepEqual(T.motsDoubles(t), [], t);
});
