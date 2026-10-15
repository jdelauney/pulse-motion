'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifierSVG } = require('../scripts/lib/svg-sur.js');

test('svg-sur : formes simples acceptées', () => {
  assert.deepEqual(verifierSVG(`<g transform='translate(0 -44)'><path d="M -8 6 C -7 -8 2 -36 8 6 Z" fill='var(--touffe)' stroke-width='2.5'/><ellipse rx='21' ry='9'/></g>`), []);
  assert.deepEqual(verifierSVG('<rect x="-7" y="-7" width="14" height="82" rx="7" fill="var(--teinte-loin, var(--corps))"/>'), []);
  assert.deepEqual(verifierSVG('  <circle r="6"></circle>\n'), []);
});

test('svg-sur : refus', () => {
  const cas = [
    ['<script>alert(1)</script>', /élément « script » interdit/],
    ['<path d="M0 0" onload="x()"/>', /attribut « onload » interdit/],
    ['<image href="http://x/y.png"/>', /élément « image » interdit/],
    ['<path d="M0 0" style="fill:red"/>', /attribut « style » interdit/],
    ['<rect fill="url(#d)" width="1" height="1"/>', /« url\( » interdit/],
    ['<foreignObject></foreignObject>', /élément « foreignObject » interdit/],
    ['<!-- note --><path d="M0 0"/>', /commentaire/],
    ['bonjour<path d="M0 0"/>', /texte hors des balises/],
    ['<g><path d="M0 0"/>', /balise « g » non fermée/],
    ['<path d="M0 0"></g>', /fermeture « g » inattendue/],
    ['<path d=M0/>', /illisible/],
    ['<a xlink:href="x"><path d="M0 0"/></a>', /élément « a » interdit/],
  ];
  for (const [svg, motif] of cas) assert.ok(verifierSVG(svg).some((m) => motif.test(m)), `${svg} : ${verifierSVG(svg).join(' | ')}`);
});
