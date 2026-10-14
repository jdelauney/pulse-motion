'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controler } = require('../scripts/controler.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');

const controler2 = (dir) => controler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
/** Recette d'une salve de n particules, émetteur « e » à interactions du type donné. */
const recette = (nom, type, n, extra = {}) => ({ version: 1, nom, emetteurs: [{ nom: 'e', naissance: { salves: [{ t: 0, nombre: n }], vie: [1, 1] }, interactions: Object.assign({ type }, extra) }] });
const scene = (effets) => `<section data-scene="etincelles">
  <h1 id="titre" data-texte="titre" data-start="0.2"></h1>
${effets.map((n) => `  <div data-effet="${n}" data-calque="arriere"></div>`).join('\n')}
</section>`;

test('contrôles : limites des interactions par émetteur (alerte budget-interactions)', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/nuee-dense.json', recette('nuee-dense', 'essaim', 120000));
  ecrire(dir, 'effets/flaque.json', recette('flaque', 'fluide', 70000));
  ecrire(dir, 'effets/sable-fin.json', recette('sable-fin', 'grains', 50000));
  ecrire(dir, 'scenes/01-etincelles.html', scene(['nuee-dense', 'flaque', 'sable-fin']));
  const problemes = controler2(dir).problemes;
  assert.equal(problemes.filter((x) => x.regle === 'budget-particules').length, 0, '240 000 particules : sous le budget de la scène');
  const p = problemes.filter((x) => x.regle === 'budget-interactions');
  assert.equal(p.length, 2, JSON.stringify(p));
  assert.ok(p.every((x) => x.gravite === 'alerte' && x.scene === 'etincelles'));
  assert.match(p[0].message, /Scène « etincelles » : l'effet « nuee-dense », émetteur « e » \(essaim\), peut compter 120000 particules ; au-delà de 100000 par émetteur, la simulation des interactions dépasse son temps \(aperçu saccadé\)\. Baisser « nombre », « debit » ou la durée de vie\./);
  assert.match(p[1].message, /l'effet « flaque », émetteur « e » \(fluide\), peut compter 70000 particules ; au-delà de 60000 par émetteur/);
});

test('contrôles : recette d\'interactions invalide : erreur « interactions-invalides » reprise de l\'assemblage', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/nuee-cassee.json', recette('nuee-cassee', 'essaim', 50, { avec: ['inconnu'] }));
  ecrire(dir, 'scenes/01-etincelles.html', scene(['nuee-cassee']));
  const p = controler2(dir).problemes.find((x) => x.regle === 'interactions-invalides');
  assert.ok(p, 'erreur présente');
  assert.equal(p.gravite, 'erreur');
  assert.equal(p.scene, 'etincelles');
  assert.match(p.message, /Effet « nuee-cassee », emetteurs\[e\]\.interactions\.avec\[0\] : « inconnu » n'est pas un émetteur de cet effet \(émetteurs : e\)\./);
});
