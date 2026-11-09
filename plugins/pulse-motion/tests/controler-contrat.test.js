'use strict';
/* Spec S2, 5.7 : contrat du code des scènes (script-interdit). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { controler } = require('../scripts/controler.js');
const { analyserScript } = require('../scripts/lib/realisation-regles.js');
const { miniProjet } = require('./aide/mini-projet.js');

const titre = '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2>';
const avecScript = (code) => miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Le froid' }, html: `${titre}<p id="x" data-start="1">0</p><script>${code}</script>` }] });
const de = (dir) => controler({ dossier: dir, ecrire: false }).problemes.filter((p) => p.regle === 'script-interdit');

test('controler-contrat.test.js › script-interdit : setTimeout, Date.now, requestAnimationFrame hors de M.chaqueImage', () => {
  for (const [code, quoi] of [
    ["setTimeout(function () { document.getElementById('x').textContent = '1'; }, 500);", /minuterie/],
    ["M.chaqueImage('a', function (p) { document.getElementById('x').textContent = String(Date.now()); });", /l'heure/],
    ['requestAnimationFrame(function () {});', /l'image du navigateur/],
    ["document.getElementById('x').textContent = 'fixé au chargement';", /une seule fois, au chargement/],
  ]) {
    const p = de(avecScript(code));
    assert.equal(p.length, 1, code);
    assert.equal(p[0].gravite, 'erreur');
    assert.match(p[0].message, quoi, code);
  }
  // Le contrat respecté : tout dans M.chaqueImage, aléa de la page, déclarations, chaînes qui citent les mots interdits.
  const juste = `'use strict';
const COULEURS = [
  '#fff', '#000',
];
function teinte(p) { return COULEURS[Math.round(p)]; }
M.chaqueImage('a', function (p, t) {
  // setTimeout n'est pas appelé : c'est un commentaire.
  document.getElementById('x').textContent = teinte(p) + ' Date ' + Math.random().toFixed(2) + t;
});`;
  assert.deepEqual(analyserScript(juste), []);
  assert.deepEqual(de(avecScript(juste)), []);
});
