'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { repartir } = require('../scripts/lancer-tests.js');

test('lancer-tests : les fichiers qui pilotent un navigateur vont dans la phase navigateur', () => {
  const d = dossierTemporaire('pm-repartir-');
  const ecrire = (nom, contenu) => fs.writeFileSync(path.join(d, nom), contenu);
  ecrire('pur.test.js', "const x = require('../scripts/lib/couleurs.js');\n");
  ecrire('gpu.test.js', "const { optionsWebGPU } = require('./aide/gpu.js');\n");
  ecrire('cdp.test.js', "const { ouvrirPage } = require('../scripts/lib/cdp.js');\n");
  ecrire('nav.test.js', 'const { trouverNavigateur } = require("./aide/navigateur.js");\n');
  ecrire('export.test.js', "const e = require('../scripts/exporter.js');\n");
  ecrire('notes.txt', 'ignoré');
  const r = repartir(d);
  assert.deepEqual(r.unitaires.map((f) => path.basename(f)), ['pur.test.js']);
  assert.deepEqual(r.navigateur.map((f) => path.basename(f)), ['cdp.test.js', 'export.test.js', 'gpu.test.js', 'nav.test.js']);
});

test('lancer-tests : les fichiers de tests réels sont tous répartis', () => {
  const r = repartir();
  const tous = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js'));
  assert.equal(r.unitaires.length + r.navigateur.length, tous.length);
  assert.ok(r.navigateur.some((f) => f.endsWith('atelier-panneau.test.js')));
  assert.ok(r.unitaires.some((f) => f.endsWith('atelier-routes.test.js')));
});
