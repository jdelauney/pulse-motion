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

test('couleurs.test.js › suggererCouleur : couleur de la charte qui passe d\'abord, sinon même teinte ajustée ; le contraste de la proposition passe le seuil', () => {
  // Orange illisible sur blanc ; la charte a un orange foncé (proche en teinte) et un bleu foncé : l'orange foncé d'abord.
  const charte = { secondaire: '#1d4ed8', profond: '#9a3412' };
  const s = C.suggererCouleur('#f59e0b', '#ffffff', 4.5, charte);
  assert.deepEqual(s, { hex: '#9a3412', depuis: 'charte', nom: 'profond' });
  // Rien dans la charte : la même teinte, plus sombre, vérifiée sur la valeur arrondie.
  const t = C.suggererCouleur('#f59e0b', '#ffffff', 4.5, { clair: '#fde68a' });
  assert.equal(t.depuis, 'teinte');
  assert.equal(t.plus, 'plus sombre');
  assert.ok(C.contraste(t.hex, '#ffffff') >= 4.5);
  assert.ok(Math.abs(C.versOklch(t.hex).h - C.versOklch('#f59e0b').h) < 12);
  // Sur fond sombre : plus claire.
  const u = C.suggererCouleur('#1d4ed8', '#0b1020', 4.5);
  assert.equal(u.plus, 'plus claire');
  assert.ok(C.contraste(u.hex, '#0b1020') >= 4.5);
  assert.match(C.phraseProposition(s), /couleur lisible proposée : #9a3412 \(la couleur « profond » de la charte\)/);
  assert.match(C.phraseProposition(t), /la même teinte, plus sombre/);
});

test('couleurs.test.js › CIEDE2000 : paires de référence de Sharma, Wu et Dalal (2005) ; identiques : 0', () => {
  // Extraits du jeu de 34 paires publié avec la formule : L, a, b de chaque couleur, écart attendu (4 décimales).
  const PAIRES = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  for (const [a, b, attendu] of PAIRES) assert.equal(Math.round(C.deltaE00Lab(a, b) * 1e4) / 1e4, attendu, JSON.stringify([a, b]));
  assert.equal(C.deltaE00([51, 102, 204], [51, 102, 204]), 0);
  assert.ok(C.deltaE00([255, 255, 255], [0, 0, 0]) > 99);
});
