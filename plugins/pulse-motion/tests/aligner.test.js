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

test('correctifs : nombre dit en plusieurs mots (« vingt et un ») : un seul mot du script, du début du premier à la fin du dernier', () => {
  const A = require('../moteur/aligner.js');
  const r = A.aligner('il fait 21 degrés', [{ w: 'il', t0: 0, t1: 0.2 }, { w: 'fait', t0: 0.3, t1: 0.5 }, { w: 'vingt', t0: 0.6, t1: 0.8 }, { w: 'et', t0: 0.85, t1: 0.9 }, { w: 'un', t0: 0.95, t1: 1.1 }, { w: 'degrés', t0: 1.2, t1: 1.6 }]);
  assert.deepEqual(r.mots[2], { w: '21', t0: 0.6, t1: 1.1 });
  assert.equal(r.reconnus, 4);
});

test('correctifs : mots interpolés croissants (mots entendus qui se chevauchent) et bornés à la durée de la prise', () => {
  const A = require('../moteur/aligner.js');
  // « froid » entendu avant la fin de « le » : le mot manquant entre eux ne recule pas.
  const r = A.aligner('pourquoi le grand froid', [{ w: 'pourquoi', t0: 0, t1: 0.5 }, { w: 'le', t0: 0.6, t1: 1.0 }, { w: 'froid', t0: 0.9, t1: 1.3 }], 3);
  r.mots.forEach((m) => assert.ok(m.t1 >= m.t0, JSON.stringify(m)));
  for (let k = 1; k < r.mots.length; k++) assert.ok(r.mots[k].t0 >= r.mots[k - 1].t0, JSON.stringify(r.mots));
  // Mots manquants après le dernier mot entendu : jamais au-delà de la prise.
  const fin = A.aligner('pourquoi le froid est si important pour vous', [{ w: 'pourquoi', t0: 0, t1: 0.5 }, { w: 'le', t0: 0.6, t1: 0.8 }, { w: 'froid', t0: 0.9, t1: 1.8 }], 2);
  fin.mots.forEach((m) => assert.ok(m.t1 <= 2 + 1e-9, JSON.stringify(m)));
});

test('correctifs : découpe d\'un enregistrement entier : ponctuation de tête gardée par la scène qui commence', () => {
  const A = require('../moteur/aligner.js');
  const e = [{ w: 'bonjour', t0: 0, t1: 0.5 }, { w: 'et', t0: 1.5, t1: 1.7 }, { w: 'puis', t0: 1.8, t1: 2.1 }];
  const r = A.decouperEnScenes(['Bonjour.', '… et puis'], e, 2.5);
  assert.equal(r[0].mots[0].w, 'Bonjour.');
  assert.equal(r[1].mots[0].w, '… et');
  assert.equal(r[1].mots[0].t0, 1.5);
});
