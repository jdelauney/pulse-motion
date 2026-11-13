'use strict';
/* Spec « Lacunes créatives » (S9), 5.10 : les fonds de carte livrés dans le plugin (cartes/, Natural Earth, préparés par
 * outils/cartes/preparer.js ; cartes/PROVENANCE.md). Les tests de l'outil et de l'assemblage sur des fonds inventés sont dans
 * tests/cartes.test.js ; ici, les vrais fichiers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

delete process.env.PM_CARTES_DOSSIER;
const K = require('../moteur/cartes.js');
const C = require('../scripts/lib/cartes.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { OUTIL } = require('./aide/fonds-essai.js');

// Régions de 2016, d'après la table de l'outil qui a préparé les fonds (source unique).
const { REGIONS } = require(OUTIL);

const CARTES = path.join(__dirname, '..', 'cartes');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(CARTES, nom), 'utf8'));
const dedans = (b, p) => p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];

test('cartes livrées : chaque pays a un code ISO et un nom français ; poids des fichiers sous les plafonds', () => {
  const PLAFONDS = { 'monde.json': 150, 'france.json': 60, 'villes.json': 30 };
  for (const [nom, ko] of Object.entries(PLAFONDS)) assert.ok(fs.statSync(path.join(CARTES, nom)).size <= ko * 1024, nom);
  const monde = lire('monde.json');
  assert.ok(monde.pays.length > 150, `${monde.pays.length} pays`);
  for (const p of monde.pays) {
    assert.match(p.code, /^[A-Z]{2}$/);
    assert.ok(p.nom && p.d && p.centre && p.boite, p.code);
  }
  assert.equal(new Set(monde.pays.map((p) => p.code)).size, monde.pays.length, 'codes uniques');
  assert.equal(monde.pays.find((p) => p.code === 'FR').nom, 'France');
  assert.equal(monde.pays.find((p) => p.code === 'DE').nom, 'Allemagne');
  assert.match(monde.source, /Natural Earth/);
  assert.equal(monde.licence, 'domaine public (Natural Earth)');
  const paris = K.projeter(monde, 2.3522, 48.8566);
  assert.ok(dedans(monde.pays.find((p) => p.code === 'FR').boite, paris));
  assert.ok(C.donneesPresentes());
});

test('cartes livrées : 13 régions et 5 d\'outre-mer en encarts, 18 chefs-lieux', () => {
  const france = lire('france.json');
  const metro = france.pays.filter((p) => !p.outreMer).map((p) => p.code).sort();
  const outreMer = france.pays.filter((p) => p.outreMer).map((p) => p.code).sort();
  assert.deepEqual(metro, REGIONS.filter((r) => !r.outreMer).map((r) => r.code).sort());
  assert.equal(metro.length, 13);
  assert.deepEqual(outreMer, REGIONS.filter((r) => r.outreMer).map((r) => r.code).sort());
  assert.equal(outreMer.length, 5);
  assert.deepEqual(france.encarts.map((e) => e.code).sort(), outreMer);
  for (const e of france.encarts) assert.ok(e.cadre[2] <= 200, `encart ${e.code} à gauche`);
  const lyon = K.projeter(france, 4.8357, 45.764);
  assert.ok(dedans(france.pays.find((p) => p.code === 'ARA').boite, lyon));
  const villes = lire('villes.json').villes;
  const chefsLieux = villes.filter((v) => v.chefLieu);
  assert.deepEqual(chefsLieux.map((v) => v.nom).sort(), REGIONS.map((r) => r.chefLieu).sort());
  assert.deepEqual([...new Set(chefsLieux.map((v) => v.chefLieu))].sort(), france.pays.map((p) => p.code).sort());
  for (const v of chefsLieux) assert.equal(v.pays, 'FR', v.nom);
  for (const v of villes) assert.ok(v.nom && Number.isFinite(v.lat) && Number.isFinite(v.lon), JSON.stringify(v));
});

test('cartes livrées : repères et liaisons posés sur les vrais fonds', () => {
  const dir = miniProjet({ scenes: [{ id: 'carte', html: `<svg data-carte="france" data-carte-regions="ARA,GUA">
  <g data-repere="Lyon"></g><g data-repere="Basse-Terre"></g><path data-liaison="Rennes→Lyon"></path></svg>
  <svg data-carte="monde" data-carte-pays="FR,DE"><path data-liaison="Paris→New York"></path><g data-repere="Berlin"></g></svg>` }] });
  const r = require('../scripts/assembler.js').assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => /carte|pays|ville/.test(e.regle || '')), []);
  assert.ok(r.groupes.includes('cartes'));
  assert.equal((r.html.match(/class="pm-liaison"|pm-liaison/g) || []).length > 0, true);
});
