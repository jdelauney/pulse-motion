'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { repartir, aRelancer } = require('../scripts/lancer-tests.js');
const rapport = require('../scripts/lib/rapport-tests.js');

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

test('lancer-tests : rapporteur des échecs (délai dépassé ou non), fichiers à relancer seuls', async () => {
  const delaiPage = Object.assign(new Error('test failed'), { failureType: 'testCodeFailure', cause: new Error('Pas de résultat de la page après 90000 ms.') });
  const delaiTest = Object.assign(new Error('test timed out after 1000ms'), { failureType: 'testTimeoutFailure' });
  const autre = Object.assign(new Error('test failed'), { failureType: 'testCodeFailure', cause: new Error('Expected values to be strictly equal') });
  async function* evenements() {
    yield { type: 'test:pass', data: { name: 'ok', file: 'a.test.js' } };
    yield { type: 'test:fail', data: { name: 'page', file: 'a.test.js', details: { error: delaiPage } } };
    yield { type: 'test:fail', data: { name: 'lent', file: 'b.test.js', details: { error: delaiTest } } };
    yield { type: 'test:fail', data: { name: 'faux', file: 'c.test.js', details: { error: autre } } };
  }
  let texte = '';
  for await (const l of rapport(evenements())) texte += l;
  assert.deepEqual(texte.trim().split('\n').map((l) => JSON.parse(l)), [
    { fichier: 'a.test.js', nom: 'page', delai: true }, { fichier: 'b.test.js', nom: 'lent', delai: true }, { fichier: 'c.test.js', nom: 'faux', delai: false }]);
  assert.deepEqual(aRelancer(texte), { relancer: ['a.test.js', 'b.test.js'], autres: ['c.test.js'], inconnu: false });
  // Un fichier qui a dépassé un délai et a aussi un autre échec : relancé (son résultat seul décide).
  assert.deepEqual(aRelancer(texte + JSON.stringify({ fichier: 'a.test.js', nom: 'x', delai: false }) + '\n').autres, ['c.test.js']);
  assert.equal(aRelancer('{"nom":"sans fichier","delai":true}\n').inconnu, true);
});
