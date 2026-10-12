'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/lib/couleurs.js');

test('OKLab : aller-retour exact sur quelques couleurs', () => {
  for (const hex of ['#b45309', '#1d4ed8', '#000000', '#ffffff', '#f59e0b']) assert.equal(C.oklabVersHex(C.hexVersOklab(hex)), hex);
  const { L, C: chroma, h } = C.versOklch('#1d4ed8');
  assert.ok(L > 0.4 && L < 0.6 && chroma > 0.15 && h > 250 && h < 275, `${L} ${chroma} ${h}`);
  assert.equal(C.depuisOklch(C.versOklch('#b45309')), '#b45309');
});

test('ajusterContraste : fonce sur fond clair, éclaircit sur fond sombre, garde la teinte', () => {
  const r = C.ajusterContraste('#f59e0b', '#ffffff', 4.5);
  assert.equal(r.ok, true);
  assert.ok(C.contraste(r.hex, '#ffffff') >= 4.5);
  assert.ok(r.ecart < 0);
  assert.ok(Math.abs(C.versOklch(r.hex).h - C.versOklch('#f59e0b').h) < 15);
  const s = C.ajusterContraste('#1d4ed8', '#0b1020', 4.5);
  assert.ok(s.ok && s.ecart > 0 && C.contraste(s.hex, '#0b1020') >= 4.5);
  assert.deepEqual(C.ajusterContraste('#1d4ed8', '#ffffff', 3), { hex: '#1d4ed8', ecart: 0, ok: true });
  assert.equal(C.ajusterContraste('#808080', '#808080', 7).ok, false);
});

test('meilleurSur : texte noir ou blanc selon le fond', () => {
  assert.equal(C.meilleurSur('#ffd000'), '#000000');
  assert.equal(C.meilleurSur('#1d4ed8'), '#ffffff');
});
