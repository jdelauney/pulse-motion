'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const S = require('../scripts/lib/scenes.js');
const { embarquerRessources, cheminDansProjet } = require('../scripts/lib/embarquer.js');

test('verifierSection : une seule section, bon identifiant', () => {
  assert.equal(S.verifierSection('<section data-scene="a"></section>', 'a'), null);
  assert.match(S.verifierSection('<div></div>', 'a'), /exactement une <section> \(trouvé : 0\)/);
  assert.match(S.verifierSection('<section data-scene="a"></section><section data-scene="b"></section>', 'a'), /trouvé : 2/);
  assert.match(S.verifierSection('<section></section>', 'a'), /doit porter data-scene="a"/);
  assert.match(S.verifierSection('<section data-scene="b"></section>', 'a'), /porte data-scene="b" au lieu de "a"/);
});

test('injecterTextes : textes échappés, sauts de ligne, clés manquantes signalées', () => {
  const { html, manquants } = S.injecterTextes(
    '<h1 class="t" data-texte="titre">x</h1><p data-texte="corps"></p><span data-texte="absent">y</span>',
    { titre: 'Pourquoi <4 °C> ?', corps: 'ligne 1\nligne 2' },
  );
  assert.equal(html, '<h1 class="t" data-texte="titre">Pourquoi &lt;4 °C&gt; ?</h1><p data-texte="corps">ligne 1<br>ligne 2</p><span data-texte="absent">[texte « absent » manquant]</span>');
  assert.deepEqual(manquants, ['absent']);
});

test('extraireScripts et injecterLogo', () => {
  const { html, scripts } = S.extraireScripts('<p>a</p><script>M.x(1)</script><p>b</p>');
  assert.equal(html, '<p>a</p><p>b</p>');
  assert.deepEqual(scripts, ['M.x(1)']);
  assert.equal(S.injecterLogo('<img data-logo alt="L" src="old.png">', 'data:x'), '<img data-logo alt="L" src="data:x">');
  assert.equal(S.injecterLogo('<img data-logo>', null), '<img data-logo>');
});

test('panneauErreur : section visible, texte échappé', () => {
  assert.equal(S.panneauErreur('a', 'fichier <x> introuvable'),
    '<section data-scene="a" data-pm-erreur><div class="pm-erreur">Scène « a » : fichier &lt;x&gt; introuvable</div></section>');
});

test('embarquerRessources : data:, distantes, hors projet, introuvables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-emb-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'a b.svg'), '<svg/>');
  const { html, erreurs } = embarquerRessources(
    '<img src="assets/a%20b.svg"><div style="background:url(\'assets/a%20b.svg\')"></div>' +
    '<img src="https://exemple.fr/x.png"><img src="../secret.png"><img src="assets/zz.png"><a href="#ancre"></a>',
    dir, 'scène « t »',
  );
  const uri = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64');
  assert.ok(html.startsWith(`<img src="${uri}"><div style="background:url("${uri}")">`));
  assert.ok(html.includes('href="#ancre"'));
  assert.deepEqual(erreurs.map((e) => e.regle), ['ressource-distante', 'chemin-hors-projet', 'fichier-introuvable']);
  assert.match(erreurs[0].message, /hors ligne/);
  assert.match(erreurs[0].message, /\(scène « t »\)/);
});

test('cheminDansProjet refuse de sortir du projet', () => {
  assert.equal(cheminDansProjet('/p', '../x'), null);
  assert.ok(cheminDansProjet('/p', 'assets/x.png').endsWith(path.join('assets', 'x.png')));
});

test('embarquerRessources : apostrophe et parenthèses dans les noms', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-emb-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', "l'été.svg"), '<svg/>');
  fs.writeFileSync(path.join(dir, 'assets', 'photo (1).svg'), '<svg/>');
  const { html, erreurs } = embarquerRessources(
    `<img src="assets/l'été.svg"><div style="background:url('assets/photo (1).svg')"></div><i style='background:url("assets/photo (1).svg")'></i>`,
    dir,
  );
  assert.deepEqual(erreurs, []);
  assert.equal((html.match(/data:image\/svg\+xml;base64,/g) || []).length, 3, html);
});

test('embarquerRessources : nom de fichier avec % et accents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-emb-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', '100%.svg'), '<svg/>');
  fs.writeFileSync(path.join(dir, 'assets', 'été.svg'), '<svg/>');
  const { html, erreurs } = embarquerRessources('<img src="assets/100%.svg"><img src="assets/été.svg">', dir);
  assert.deepEqual(erreurs, []);
  assert.equal((html.match(/data:image\/svg\+xml;base64,/g) || []).length, 2);
});
