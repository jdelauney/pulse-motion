'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');
const { STYLE, CATALOGUE, texteDeLongueur, projetCatalogue } = require('./aide/catalogue.js');

test('texteDeLongueur : mots réels, longueur maximale respectée', () => {
  for (const n of [20, 40, 45, 60, 80]) {
    const t = texteDeLongueur(n);
    assert.ok(t.length <= n && t.length > n - 15, `${n} : « ${t} »`);
  }
});

test('catalogue : chaque scène existe, porte data-scene = son nom, et ses textes sont ceux annoncés', () => {
  const fichiers = fs.readdirSync(path.join(STYLE, 'scenes')).sort();
  assert.deepEqual(fichiers, CATALOGUE.scenes.map((s) => `${s.nom}.html`).sort());
  for (const s of CATALOGUE.scenes) {
    const html = fs.readFileSync(path.join(STYLE, 'scenes', `${s.nom}.html`), 'utf8');
    assert.match(html, new RegExp(`<section data-scene="${s.nom}"`));
    assert.deepEqual([...new Set(extraireScene(html).textes)].sort(), Object.keys(s.textes).sort(), s.nom);
  }
});

test('style : polices fournies avec leur licence, aucun effet exclu de l\'export rapide', () => {
  for (const f of ['Figtree.woff2', 'Inter.woff2']) {
    assert.equal(fs.readFileSync(path.join(STYLE, 'polices', f)).subarray(0, 4).toString(), 'wOF2', f);
  }
  assert.match(fs.readFileSync(path.join(STYLE, 'polices', 'LICENCES.md'), 'utf8'), /SIL Open Font License/);
  const css = fs.readFileSync(path.join(STYLE, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /mix-blend-mode\s*:|backdrop-filter\s*:|filter\s*:[^;]*url\(/);
});

test('les 8 scènes, textes au maximum : assemblage et contrôles sans aucun problème', () => {
  const dir = projetCatalogue();
  const r = assembler({ dossier: dir });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /@font-face \{ font-family: 'Figtree'/);
  assert.match(r.html, /@font-face \{ font-family: 'Inter'/);
  assert.deepEqual(controler({ dossier: dir }).problemes, []);
});

const navigateur = trouverNavigateur();
test('dans le navigateur : polices chargées, aucun débordement, aucune erreur du moteur', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = projetCatalogue();
  const { html } = assembler({ dossier: dir, ecrire: false });
  const verification = `<script>M.pret.then(function () { return document.fonts.ready; }).then(function () {
    var r = { debordements: M.detecterDebordements(), erreurs: M.erreurs,
      polices: [document.fonts.check('800 40px Figtree'), document.fonts.check('400 20px Inter')] };
    var pre = document.createElement('pre'); pre.id = 'verification'; pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
  });</script>`;
  const fichier = path.join(dir, 'verification.html');
  fs.writeFileSync(fichier, html.replace('</body>', `${verification}\n</body>`));
  const dom = await rendreDOM(navigateur, fichier);
  const m = /<pre id="verification">([^<]*)<\/pre>/.exec(dom);
  assert.ok(m, 'vérification absente');
  const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.polices, [true, true]);
  assert.deepEqual(r.debordements, []);
});
