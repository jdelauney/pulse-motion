'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { assembler } = require('../scripts/assembler.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const page = () => assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false }).html;

test('page de mesures : le résultat asynchrone de la page revient, capture comprise', sans, async () => {
  const r = await mesurerPage({ html: page(), navigateur, delai: 30000, script: `
    var c = document.createElement('canvas'); c.width = 16; c.height = 9;
    await M.capturer(c.getContext('2d'), 16, 9);
    return { duree: M.duree, capture: typeof M.capturer };` });
  assert.deepEqual(r, { resultat: { duree: 7.25, capture: 'function' } });
});

test('page de mesures : erreur de la page rapportée, sans attendre le délai', sans, async () => {
  const debut = Date.now();
  const r = await mesurerPage({ html: page(), navigateur, delai: 30000, script: 'throw new Error("mesure cassée");' });
  assert.match(r.erreur, /mesure cassée/);
  assert.ok(Date.now() - debut < 20000);
});

test('page de mesures : page qui ne répond pas, délai dépassé', sans, async () => {
  const r = await mesurerPage({ html: page(), navigateur, delai: 3000, script: 'await new Promise(function () {});' });
  assert.equal(r.erreur, 'délai dépassé');
});

test('page de mesures : navigateur introuvable, code ENOENT', async () => {
  const r = await mesurerPage({ html: '<html><body></body></html>', navigateur: path.join(__dirname, 'absent.exe'), delai: 5000, script: 'return 1;' });
  assert.equal(r.code, 'ENOENT');
});

test('page de mesures : plusieurs pages en même temps, chacune son résultat', sans, async () => {
  const r = await Promise.all([1, 2, 3].map((n) => mesurerPage({ html: page(), navigateur, delai: 30000, script: `return ${n};` })));
  assert.deepEqual(r.map((x) => x.resultat), [1, 2, 3]);
});
