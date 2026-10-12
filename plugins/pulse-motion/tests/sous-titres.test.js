'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/sous-titres.js');

const texteDe = (c) => c.lignes.map((l) => l.map((m) => m.w).join(' '));
// Mots réguliers : un mot toutes les 0,3 s à partir de debut.
function mots(texte, debut = 0, pas = 0.3) {
  return texte.split(' ').map((w, i) => ({ w, t0: debut + i * pas, t1: debut + i * pas + pas - 0.05 }));
}
const scene = (texte, debut = 0, fin = 30, pas) => ({ id: 'a', debut, fin, mots: mots(texte, debut, pas) });

test('phrase courte : un carton d\'une ligne, du premier au dernier mot (allongé à 1,25 s)', () => {
  const c = S.cartons([scene('Bonjour à tous.')], { ratio: '16:9' });
  assert.equal(c.length, 1);
  assert.deepEqual(texteDe(c[0]), ['Bonjour à tous.']);
  assert.equal(c[0].debut, 0);
  assert.equal(c[0].fin, 1.25);
});

test('deux phrases : deux cartons, coupe après la ponctuation forte', () => {
  const c = S.cartons([scene('Le froid ralentit les bactéries. Il ne les tue pas.')], { ratio: '16:9' });
  assert.deepEqual(c.map(texteDe), [['Le froid ralentit les bactéries.'], ['Il ne les tue pas.']]);
});

test('lignes de 42 caractères au plus (32 en 9:16), deux lignes par carton', () => {
  const t = 'Pour garder les aliments en bonne santé il faut respecter la chaîne du froid du producteur jusqu\'à votre assiette sans aucune interruption';
  for (const [ratio, max] of [['16:9', 42], ['9:16', 32]]) {
    const c = S.cartons([scene(t)], { ratio });
    for (const carton of c) {
      assert.ok(carton.lignes.length <= 2);
      for (const l of texteDe(carton)) assert.ok(l.length <= max, `${ratio} : « ${l} » (${l.length})`);
    }
    assert.deepEqual(c.flatMap((x) => x.lignes.flat().map((m) => m.w)).join(' '), t);
  }
});

test('jamais de coupe après un article ou un déterminant', () => {
  const c = S.cartons([scene('Nous gardons toujours les produits frais au réfrigérateur et les surgelés au congélateur bien fermé')], { ratio: '9:16' });
  for (const l of c.flatMap(texteDe)) assert.doesNotMatch(l, /\b(les|le|la|au|du|des|un|une)$/, l);
});

test('revue : ponctuation française espacée jamais seule en début de ligne ; mot trop long : carton quand même', () => {
  const c = S.cartons([scene('Vraiment ? Oui : https://exemple.fr/une/adresse/vraiment/beaucoup/trop/longue/pour/une/ligne fin.')], { ratio: '9:16' });
  for (const l of c.flatMap(texteDe)) assert.doesNotMatch(l, /^[?:!;]/, l);
  assert.ok(c.length >= 2);
});

test('débit : au plus 3,5 mots par seconde (carton allongé sur le silence), 0,1 s d\'écart avec le suivant', () => {
  const s = { id: 'a', debut: 0, fin: 10, mots: [...mots('un deux trois quatre cinq six sept.', 0, 0.1), ...mots('Huit neuf.', 2.5, 0.3)] };
  const c = S.cartons([s], { ratio: '16:9' });
  assert.ok(c[0].fin - c[0].debut >= 7 / 3.5 - 0.01, JSON.stringify(c[0]));
  assert.ok(c[0].fin <= c[1].debut - 0.1 + 1e-9);
});

test('revue : scène très courte : cartons bornés à la scène, fin jamais avant le début', () => {
  const c = S.cartons([{ id: 'a', debut: 5, fin: 5.8, mots: mots('un deux trois quatre cinq six sept huit neuf dix onze douze', 5, 0.05) }], { ratio: '16:9' });
  for (const x of c) { assert.ok(x.fin <= 5.8 + 1e-9); assert.ok(x.fin > x.debut); }
});

test('jamais à cheval sur deux scènes', () => {
  const c = S.cartons([scene('Première scène ici', 0, 2), { id: 'b', debut: 2, fin: 4, mots: mots('Deuxième scène', 2) }], { ratio: '16:9' });
  assert.deepEqual(c.map((x) => x.scene), ['a', 'b']);
  assert.ok(c[0].fin <= 2);
});

test('mots d\'une scène : avec voix (début de la prise + temps) ; sans voix : répartis sur la scène', () => {
  const avec = S.motsDeScene({ debut: 10, fin: 14, texte: 'un deux', voix: { debut: 0.3, mots: [{ w: 'un', t0: 0, t1: 0.4 }, { w: 'deux', t0: 0.5, t1: 0.9 }] } });
  assert.deepEqual(avec.map((m) => m.t0), [10.3, 10.8]);
  const sans = S.motsDeScene({ debut: 10, fin: 14, texte: 'aa bb', voix: null });
  assert.equal(sans[0].t0, 10.3);
  assert.equal(sans[1].t1, 13.7);
});

test('SRT et VTT', () => {
  const c = [{ scene: 'a', debut: 1.25, fin: 3, lignes: [mots('Bonjour à'), mots('tous')] }, { scene: 'a', debut: 61.5, fin: 3723.004, lignes: [mots('Fin')] }];
  assert.equal(S.versSRT(c), '1\n00:00:01,250 --> 00:00:03,000\nBonjour à\ntous\n\n2\n00:01:01,500 --> 01:02:03,004\nFin\n');
  assert.equal(S.versVTT(c), 'WEBVTT\n\n00:00:01.250 --> 00:00:03.000\nBonjour à\ntous\n\n00:01:01.500 --> 01:02:03.004\nFin\n');
});
