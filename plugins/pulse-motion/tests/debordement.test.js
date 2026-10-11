'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

const navigateur = trouverNavigateur();

test('débordements détectés dans le navigateur (tests/debordement.html)', { skip: !navigateur && 'Chrome ou Edge introuvable (variable PM_NAVIGATEUR pour l\'indiquer)' }, async () => {
  const dom = await rendreDOM(navigateur, path.join(__dirname, 'debordement.html'));
  const m = /<pre id="resultat">([^<]*)<\/pre>/.exec(dom);
  assert.ok(m, 'résultat absent de la page');
  assert.equal(m[1], 'RESULTAT: OK');
});
