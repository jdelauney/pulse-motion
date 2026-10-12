'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extraireScene } = require('../scripts/lib/extraire.js');

test('éléments minutés : clés comme le moteur (id, sinon _n)', () => {
  const { elements } = extraireScene(`
    <section data-scene="s">
      <h1 id="titre" data-texte="titre" data-start="0.3">T</h1>
      <p data-start="#titre:fin+0.2" data-dur='2'>a</p>
      <span data-tween="opacity 0→1">b</span>
      <p>sans minutage</p>
      <img src="x.png" data-start=1 alt="">
    </section>`);
  assert.deepEqual(elements.map((e) => [e.cle, e.balise, e.start, e.dur]), [
    ['titre', 'h1', '0.3', undefined],
    ['_1', 'p', '#titre:fin+0.2', '2'],
    ['_2', 'span', undefined, undefined],
    ['_3', 'img', '1', undefined],
  ]);
  assert.equal(elements[2].tween, 'opacity 0→1');
  assert.equal(elements[0].texte, 'titre');
});

test('textes, CSS et contenu ignoré (scripts, commentaires)', () => {
  const r = extraireScene(`
    <section data-scene="s">
      <style>@scope { h1 { font-size: 7cqh; } }</style>
      <!-- <p data-start="9" data-texte="commente"></p> -->
      <h1 data-texte="titre"></h1><p data-texte="sous"></p>
      <script>var x = '<p data-start="5">';</script>
    </section>`);
  assert.deepEqual(r.textes, ['titre', 'sous']);
  assert.deepEqual(r.elements, []);
  assert.match(r.css, /font-size: 7cqh/);
});

test('attribut contenant > entre guillemets', () => {
  const { elements } = extraireScene('<p data-tween="--x 0→1 cubic-out" title="a > b" data-start="2">x</p>');
  assert.equal(elements[0].start, '2');
});

test('textes écrits en dur dans une scène : sans commentaires, styles, scripts ni textes du déroulé', () => {
  const { textesEnDur } = require('../scripts/lib/extraire.js');
  const html = '<!-- Durée : 8 s --><section><style>.a{}</style><h1 data-texte="titre">Provisoire</h1><p>Attention!</p><p>0</p><span>Voir&nbsp;:</span><script>x()</script></section>';
  assert.deepEqual(textesEnDur(html), ['Attention!', 'Voir\u00a0:']);
});

test('revue : entités HTML décodées (numériques et nommées courantes) avant le contrôle', () => {
  const { textesEnDur } = require('../scripts/lib/extraire.js');
  assert.deepEqual(textesEnDur('<p>Caf&eacute; ouvert</p><p>&laquo;&nbsp;Bonjour&nbsp;&raquo;</p><p>Prix&#160;: 5</p><p>Voir&#x202F;!</p><p>L&rsquo;eau</p>'),
    ['Café ouvert', '«\u00a0Bonjour\u00a0»', 'Prix\u00a0: 5', 'Voir\u202f!', 'L’eau']);
  assert.deepEqual(textesEnDur('<p>A&inconnue;B</p>'), ['AB']);
});
