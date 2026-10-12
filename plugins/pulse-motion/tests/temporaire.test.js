'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('dossiers temporaires des tests : supprimés à la fin du processus, contenu compris', () => {
  const aide = path.join(__dirname, 'aide', 'temporaire.js');
  const code = `const fs = require('node:fs'); const { dossierTemporaire } = require(${JSON.stringify(aide)});
    const d = dossierTemporaire('pm-sortie-'); fs.mkdirSync(d + '/sous'); fs.writeFileSync(d + '/sous/f.txt', 'x'); console.log(d);`;
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const dossier = r.stdout.trim();
  assert.match(path.basename(dossier), /^pm-sortie-/);
  assert.equal(fs.existsSync(dossier), false);
});
