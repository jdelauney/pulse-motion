'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

const EXEMPLE = path.join(__dirname, '..', 'exemples', 'chaine-du-froid');

function copierExemple() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-exemple-'));
  fs.cpSync(EXEMPLE, dir, { recursive: true });
  return dir;
}

test('« La chaîne du froid » : 6 scènes, 60 s', () => {
  const d = JSON.parse(fs.readFileSync(path.join(EXEMPLE, 'deroule.json'), 'utf8'));
  assert.equal(d.scenes.length, 6);
  assert.equal(calculerMinutage(d.scenes, {}).duree, 60);
});

test('« La chaîne du froid » : assemblée et contrôlée sans aucun problème', () => {
  const dir = copierExemple();
  const r = assembler({ dossier: dir });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.html')));
  assert.deepEqual(controler({ dossier: dir }).problemes, []);
});

const navigateur = trouverNavigateur();
test('« La chaîne du froid » dans le navigateur : aucun débordement, chiffre « 4 » affiché à la fin', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierExemple();
  const { html } = assembler({ dossier: dir, ecrire: false });
  const verification = `<script>M.pret.then(function () { return document.fonts.ready; }).then(function () {
    var d = M.detecterDebordements(); M.rendre(16);
    var r = { debordements: d, erreurs: M.erreurs, valeur: document.getElementById('valeur').textContent };
    var pre = document.createElement('pre'); pre.id = 'verification'; pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
  });</script>`;
  const fichier = path.join(dir, 'verification.html');
  fs.writeFileSync(fichier, html.replace('</body>', `${verification}\n</body>`));
  const m = /<pre id="verification">([^<]*)<\/pre>/.exec(await rendreDOM(navigateur, fichier));
  assert.ok(m, 'vérification absente');
  const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(r, { debordements: [], erreurs: [], valeur: '4' });
});
