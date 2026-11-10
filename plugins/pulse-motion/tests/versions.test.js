'use strict';
/* Versions (spec S2, 5.17) : package.json suit plugin.json (le numéro qui compte pour la personne). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lire = (...p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));

test('versions.test.js › package.json et plugin.json ont la même version', () => {
  const plugin = lire('.claude-plugin', 'plugin.json').version;
  assert.match(plugin, /^\d+\.\d+\.\d+$/);
  assert.equal(lire('package.json').version, plugin);
});
