'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../moteur/aligner.js');

test('normaliser : accents, majuscules, ponctuation, ligatures', () => {
  assert.equal(A.normaliserMot('Été,'), 'ete');
  assert.equal(A.normaliserMot('« Œuf »'), 'oeuf');
  assert.equal(A.normaliserMot('4 °C'), '4c');
});

test('découper : mots tels qu\'écrits, clés normalisées et parties (apostrophe, trait d\'union)', () => {
  const m = A.decouperMots("Pourquoi l'eau, peut-être ?");
  assert.deepEqual(m.map((x) => x.w), ['Pourquoi', "l'eau,", 'peut-être ?']);
  assert.deepEqual(m[1].cles, ['leau', 'l', 'eau']);
  assert.deepEqual(m[2].cles, ['peutetre', 'peut', 'etre']);
});

test('ponctuation isolée (« ? », « : ») rattachée au mot précédent, jamais un mot à part', () => {
  assert.deepEqual(A.decouperMots('Vraiment ? Oui : non').map((x) => x.w), ['Vraiment ?', 'Oui :', 'non']);
});

const taux = 16000;
function parole(segments, total) {
  const x = new Float32Array(Math.round(total * taux));
  for (const [a, b] of segments) for (let i = Math.round(a * taux); i < Math.round(b * taux); i++) x[i] = 0.5 * Math.sin(i / 3);
  return x;
}

test('calage approché : mots répartis dans la parole au prorata des lettres, silences sautés', () => {
  // « aaaa bbbb » : deux groupes de parole, 0,5–1,5 s et 2,5–3,5 s.
  const m = A.calageApproche('aaaa bbbb', parole([[0.5, 1.5], [2.5, 3.5]], 4), taux);
  assert.equal(m.length, 2);
  assert.ok(Math.abs(m[0].t0 - 0.5) < 0.05 && Math.abs(m[0].t1 - 1.5) < 0.05, JSON.stringify(m[0]));
  assert.ok(Math.abs(m[1].t0 - 2.5) < 0.05 && Math.abs(m[1].t1 - 3.5) < 0.05, JSON.stringify(m[1]));
});

test('calage approché sans parole détectée : réparti sur toute la prise ; texte vide : aucun mot', () => {
  const m = A.calageApproche('un deux', new Float32Array(taux * 2), taux);
  assert.equal(m[0].t0, 0);
  assert.ok(Math.abs(m[1].t1 - 2) < 0.01);
  assert.deepEqual(A.calageApproche('   ', new Float32Array(10), taux), []);
});
