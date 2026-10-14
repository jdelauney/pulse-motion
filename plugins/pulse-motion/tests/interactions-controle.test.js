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
  const tous = problemes.filter((x) => x.regle === 'budget-interactions');
  const p = tous.filter((x) => /par émetteur/.test(x.message));
  assert.equal(p.length, 2, JSON.stringify(tous));
  // 120 000 oiseaux, cellules de 6 cqh (vision) : plus de 48 par cellule même étalés sur la scène.
  assert.equal(tous.length, 3, JSON.stringify(tous));
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

test("contrôles : cellules de voisinage pleines (alerte budget-interactions) ; grains trop petits pour leur rayon refusés", () => {
  const dir = copierProjet('projet-effets');
  // 20 000 oiseaux, vision de 20 cqh : 20 000 × 400 / (177,78 × 100) = 450 par cellule en moyenne (au-delà de 48).
  ecrire(dir, 'effets/nuee-large.json', recette('nuee-large', 'essaim', 20000, { vision: { rayon: 20 } }));
  // 2 000 oiseaux, vision par défaut (6 cqh) : 4 par cellule, aucune alerte.
  ecrire(dir, 'effets/nuee-legere.json', recette('nuee-legere', 'essaim', 2000));
  ecrire(dir, 'scenes/01-etincelles.html', scene(['nuee-large', 'nuee-legere']));
  const p = controler2(dir).problemes.filter((x) => x.regle === 'budget-interactions');
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.equal(p[0].gravite, 'alerte');
  assert.match(p[0].message, /l'effet « nuee-large », émetteur « e » \(essaim\), peut compter 20000 particules pour des cellules de voisinage de 20 cqh de côté : 450 par cellule en moyenne sur toute la scène ; au-delà de 96 dans une cellule, ses particules s'ignorent entre elles\. Baisser « vision\.rayon » et « rayon »/);
  // Grains de 0,3 cqh pour un rayon de 20 : des milliers par cellule ; refusés.
  const R = require('../moteur/particules/recette.js');
  const grains = (rayon) => R.compiler({ version: 1, nom: 'g', emetteurs: [{ nom: 'e', naissance: { salves: [{ t: 0, nombre: 10 }], vie: [1, 1], taille: [0.3, 0.3] },
    interactions: { type: 'grains', rayon } }] }, { dur: 1, graine: 1, charte: {} });
  const r = grains(20);
  assert.equal(r.ok, false);
  assert.equal(r.erreurs[0].regle, 'interactions-invalides');
  assert.match(r.erreurs[0].message, /rayon 20 cqh trop grand pour des grains de 0\.3 cqh : une cellule de voisinage en tiendrait plus de 96/);
  assert.equal(grains(2.5).ok, true, '(2,5 / 0,3)² = 69 grains par cellule au plus : accepté');
});
