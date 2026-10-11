'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

const navigateur = trouverNavigateur();

test('capture de l\'image courante fidèle (tests/capture.html)', { skip: !navigateur && 'Chrome ou Edge introuvable (variable PM_NAVIGATEUR pour l\'indiquer)' }, async () => {
  const dom = await rendreDOM(navigateur, path.join(__dirname, 'capture.html'));
  const m = /<pre id="resultat">([^<]*)<\/pre>/.exec(dom);
  assert.ok(m, 'résultat absent de la page');
  assert.match(m[1], /^RESULTAT: OK/, m[1]);
});
