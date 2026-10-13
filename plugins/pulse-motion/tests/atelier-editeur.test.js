'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const R = require('../moteur/particules/recette.js');

const editeur = () => import(pathToFileURL(path.join(__dirname, '..', 'moteur', 'atelier', 'editeur.mjs')).href);
const CHARTE = { primaire: '#0a6cff', accent: '#b45309', texte: '#1a1a1a', fond: '#ffffff' };

test('éditeur : chaque type de nœud du schéma est pris en charge', async () => {
  const E = await editeur();
  const vus = new Set();
  (function parcourir(n) {
    vus.add(n.type);
    if (n.champs) Object.values(n.champs).forEach(parcourir);
    if (n.variantes) Object.values(n.variantes.types).forEach((v) => Object.values(v.champs).forEach(parcourir));
    if (n.element) parcourir(n.element);
  })(R.SCHEMA);
  for (const t of vus) assert.ok(E.TYPES.includes(t), `type « ${t} »`);
});

test('chemins : lire et écrire avec la notation du compilateur', async () => {
  const E = await editeur();
  const r = { emetteurs: [{ nom: 'gerbe', forces: [{ type: 'gravite', valeur: 40 }] }, { nom: 'eclat' }] };
  assert.deepEqual(E.decouperChemin('emetteurs[gerbe].forces[0].valeur'), ['emetteurs', { nom: 'gerbe' }, 'forces', 0, 'valeur']);
  assert.equal(E.lireChemin(r, 'emetteurs[gerbe].forces[0].valeur'), 40);
  assert.equal(E.lireChemin(r, 'emetteurs[absent].nom'), undefined);
  E.ecrireChemin(r, 'emetteurs[eclat].naissance.vie', [0.2, 0.4]);
  assert.deepEqual(r.emetteurs[1].naissance, { vie: [0.2, 0.4] });
  E.ecrireChemin(r, 'emetteurs[gerbe].forces[0].valeur', undefined);
  assert.deepEqual(r.emetteurs[0].forces[0], { type: 'gravite' });
  E.ecrireChemin(r, 'rendu_calque.bloom', 2);
  assert.deepEqual(r.rendu_calque, { bloom: 2 });
  assert.throws(() => E.ecrireChemin(r, 'emetteurs[absent].nom', 'x'), /émetteur « absent » introuvable/);
});

test('erreurs du compilateur : rattachées au champ le plus proche', async () => {
  const E = await editeur();
  const recette = { version: 1, nom: 'e', emetteurs: [{ nom: 'a', naissance: { debit: 10, vie: [-1, 1] } }] };
  const erreur = R.compiler(recette, { dur: 2, graine: 1 }).erreurs[0];
  const chemins = ['emetteurs', 'emetteurs[a]', 'emetteurs[a].naissance', 'emetteurs[a].naissance.vie', 'emetteurs[a].naissance.vitesse'];
  assert.equal(E.champPourErreur(chemins, erreur.chemin), 'emetteurs[a].naissance.vie');
  assert.equal(E.champPourErreur(chemins, 'emetteurs[a].naissance.vie[0]'), 'emetteurs[a].naissance.vie');
  assert.equal(E.champPourErreur(chemins, 'emetteurs[a].naissance.vitesse_angulaire'), 'emetteurs[a].naissance');
  assert.equal(E.champPourErreur(chemins, 'reglages.nombre'), null);
});

test('saisies et réglages : nombres, expressions, texte de data-reglages relu par le compilateur', async () => {
  const E = await editeur();
  assert.equal(E.valeurSaisie('12'), 12);
  assert.equal(E.valeurSaisie(' -0.5 '), -0.5);
  assert.equal(E.valeurSaisie('1e3'), 1000);
  assert.equal(E.valeurSaisie('30 * vitesse'), '30 * vitesse');
  assert.equal(E.valeurSaisie('  '), undefined);
  const texte = E.reglagesEnTexte({ nombre: '900', couleur: 'accent', vide: '' });
  assert.equal(texte, 'nombre: 900; couleur: accent');
  assert.deepEqual({ ...R.analyserReglages(texte).valeurs }, { nombre: '900', couleur: 'accent' });
});

test('valeurs neuves : un élément ajouté est valide d\'emblée', async () => {
  const E = await editeur();
  const em = R.SCHEMA.champs.emetteurs.element;
  assert.deepEqual(E.valeurNeuve(em.champs.forces.element), { type: 'gravite' });
  assert.deepEqual(E.valeurNeuve(em.champs.naissance.champs.salves.element), { nombre: 10 });
  assert.equal(E.valeurNeuve(em.champs.vie.champs.couleur.champs.degrade.element), '#ffffff');
  assert.deepEqual(E.valeurNeuve(em), { nom: 'emetteur', naissance: { debit: 50, vie: [0.5, 1] } });
});

test('limiter : au plus un appel par période, le dernier n\'est jamais perdu', async () => {
  const E = await editeur();
  const appels = [];
  const f = E.limiter((x) => appels.push(x), 100);
  for (let i = 0; i < 25; i++) {
    f(i);
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(appels.length >= 2 && appels.length <= 6, String(appels));
  assert.equal(appels[0], 0);
  assert.equal(appels[appels.length - 1], 24);
});

test('recette vide et compilerPourPage : compile, textures connues reprises', async () => {
  const E = await editeur();
  const r = await E.compilerPourPage(R, E.nouvelleRecette(), { dur: 2, graine: 1, charte: CHARTE }, new Map());
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.notEqual(E.nouvelleRecette(), E.nouvelleRecette(), 'copies distinctes');
  const avec = E.nouvelleRecette();
  avec.emetteurs[0].rendu.texture = 'assets/etoile.png';
  const t = await E.compilerPourPage(R, avec, { dur: 2, graine: 1, charte: CHARTE }, new Map([['assets/etoile.png', 'data:image/png;base64,AAAA']]));
  assert.equal(t.effet.emetteurs[0].rendu.textureImage, 'data:image/png;base64,AAAA');
  const fausse = E.nouvelleRecette();
  fausse.emetteurs[0].naissance.vie = [-1, 1];
  const f = await E.compilerPourPage(R, fausse, { dur: 2, graine: 1, charte: CHARTE }, new Map());
  assert.equal(f.ok, false);
  assert.equal(f.erreurs[0].chemin, 'emetteurs[emetteur].naissance.vie');
});
