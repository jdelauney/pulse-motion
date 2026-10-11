'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');
const { SEUILS } = require('../scripts/controler.js');

const DOSSIER = path.join(__dirname, '..', 'effets');
const NOMS = ['braises', 'confettis', 'energie', 'etincelles', 'explosion', 'feu', 'feu-artifice', 'fumee', 'neige', 'paillettes', 'pluie', 'poussiere'];
const CHARTE = { primaire: '#0a6cff', accent: '#b45309', fond: '#ffffff', texte: '#1a1a1a' };
const charger = (nom) => {
  const f = path.join(DOSSIER, `${nom}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const compiler = (nom, reglages = '', dur = 3) => R.compiler(R.resoudre(nom, charger), { reglages, charte: CHARTE, dur, graine: 1 });

test('bibliothèque : les 12 effets de la spec, nommés comme leur fichier, décrits', () => {
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(fichiers, NOMS);
  for (const nom of NOMS) {
    const brute = charger(nom);
    assert.equal(brute.version, 1, nom);
    assert.equal(brute.nom, nom, `${nom} : « nom » = nom du fichier`);
    assert.ok(typeof brute.description === 'string' && brute.description.length > 30, `${nom} : description`);
  }
  assert.equal(charger('braises').etend, 'etincelles', 'braises dérive des étincelles');
});

test('bibliothèque : 3 à 6 paramètres, compilation par défaut sous le budget', () => {
  for (const nom of NOMS) {
    const recette = R.resoudre(nom, charger);
    const n = Object.keys(recette.parametres || {}).length;
    assert.ok(n >= 3 && n <= 6, `${nom} : ${n} paramètres`);
    const r = compiler(nom);
    assert.equal(r.ok, true, `${nom} : ${JSON.stringify(r.erreurs)}`);
    assert.ok(r.effet.capacite <= SEUILS.budgetParticules, `${nom} : ${r.effet.capacite} particules par défaut`);
    assert.ok(r.effet.fin > 0 && r.effet.fin < 30, `${nom} : fin ${r.effet.fin}`);
  }
});

test('bibliothèque : compilation aux bornes', () => {
  for (const nom of NOMS) {
    const params = R.resoudre(nom, charger).parametres;
    for (const borne of ['min', 'max']) {
      const reglages = Object.entries(params)
        .map(([cle, p]) => (p.type === 'couleur' ? `${cle}: accent` : `${cle}: ${p[borne] !== undefined ? p[borne] : p.defaut}`))
        .join('; ');
      const r = compiler(nom, reglages);
      assert.equal(r.ok, true, `${nom} à ${borne} (${reglages}) : ${JSON.stringify(r.erreurs)}`);
    }
  }
});

test('bibliothèque : charte par défaut (accent et primaire du style)', () => {
  for (const nom of ['confettis', 'feu-artifice', 'energie']) {
    const r = R.compiler(R.resoudre(nom, charger), { charte: CHARTE, dur: 3, graine: 1 });
    assert.equal(r.ok, true, `${nom} : ${JSON.stringify(r.erreurs)}`);
  }
  const confettis = compiler('confettis');
  const bleu = R.couleurLineaire('#0a6cff', {});
  assert.deepEqual(confettis.effet.emetteurs[0].tables.couleur.slice(0, 3).map((x) => Math.round(x * 1e4)), bleu.slice(0, 3).map((x) => Math.round(x * 1e4)));
});

test('bibliothèque : la bibliothèque couvre toutes les familles utiles', () => {
  const types = new Set();
  const textures = new Set();
  const forces = new Set();
  for (const nom of NOMS) {
    for (const em of compiler(nom).effet.emetteurs) {
      types.add(em.rendu.type);
      textures.add(em.rendu.texture);
      em.forces.forEach((f) => forces.add(f.type));
    }
  }
  assert.deepEqual([...types].sort(), ['etincelle', 'sprite', 'trainee'], 'la planche demande une image : pas dans la bibliothèque');
  assert.deepEqual([...textures].sort(), ['confetti', 'disque-doux', 'etoile', 'flamme', 'fumee']);
  assert.deepEqual([...forces].sort(), ['attracteur', 'gravite', 'trainee', 'turbulence', 'vent', 'vortex']);
});

test('bibliothèque : neige : les flocons traversent l\'image à leurs réglages par défaut', () => {
  const flocon = compiler('neige').effet.emetteurs.find((e) => e.nom === 'flocon');
  const g = flocon.forces.find((f) => f.type === 'gravite').a[1];
  // Vitesse limite = g / K, avec K = somme des coefficients de traînée et de vent (masse 1).
  const K = flocon.forces.filter((f) => f.type === 'trainee' || f.type === 'vent').reduce((s, f) => s + f.coef, 0);
  const vieMin = Math.min(...flocon.vie);
  const parcours = vieMin * (g / K);
  assert.ok(parcours >= 102, `un flocon né 52 cqh au-dessus du centre doit atteindre le bas (102 cqh) : ${parcours.toFixed(1)} cqh parcourus`);
});
