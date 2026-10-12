'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../moteur/aligner.js');

const e = (w, t0, t1) => ({ w, t0, t1 });

test('nombres en lettres (forme normalisée)', () => {
  assert.deepEqual([4, 16, 17, 21, 70, 71, 80, 81, 91, 100].map(A.nombreEnLettres),
    ['quatre', 'seize', 'dixsept', 'vingtetun', 'soixantedix', 'soixanteetonze', 'quatrevingts', 'quatrevingtun', 'quatrevingtonze', 'cent']);
});

test('aligner : mots du script gardés, temps de la parole ; mot mal reconnu au même endroit : ses temps', () => {
  const r = A.aligner('Pourquoi garder le froid ?', [e(' Pourquoi', 0.1, 0.5), e(' garde', 0.6, 0.9), e(' le', 1.0, 1.1), e(' froid?', 1.2, 1.6)]);
  assert.deepEqual(r.mots, [e('Pourquoi', 0.1, 0.5), e('garder', 0.6, 0.9), e('le', 1.0, 1.1), e('froid ?', 1.2, 1.6)]);
  assert.equal(r.reconnus, 4); // « garde » ~ « garder » : une lettre d'écart sur un mot de plus de 4 lettres
});

test('revue : aligner : chiffres et lettres appariés ; mot omis par la transcription interpolé entre ses voisins', () => {
  const r = A.aligner('À 4 degrés vraiment', [e('à', 0, 0.2), e('quatre', 0.3, 0.6), e('vraiment', 1.2, 1.8)]);
  assert.equal(r.mots[1].t0, 0.3);
  assert.ok(r.mots[2].t0 >= 0.6 && r.mots[2].t1 <= 1.2, JSON.stringify(r.mots[2]));
  assert.equal(r.reconnus, 3);
});

test('aligner : rien de reconnu -> null', () => {
  assert.equal(A.aligner('Bonjour à tous', [e('hello', 0, 1), e('everyone', 1, 2)]), null);
  assert.equal(A.aligner('Bonjour', []), null);
});

test('découper en scènes : coupe au milieu du silence entre deux scènes, mots de chaque scène', () => {
  const entendus = [e('un', 0.5, 0.9), e('deux', 1.0, 1.4), e('trois', 3.0, 3.4), e('quatre', 3.5, 4.0)];
  const d = A.decouperEnScenes(['un deux', 'trois quatre'], entendus, 5);
  assert.deepEqual(d.map((s) => [s.debut, s.fin]), [[0, 2.2], [2.2, 5]]);
  assert.deepEqual(d[1].mots.map((m) => m.w), ['trois', 'quatre']);
  assert.deepEqual(d.map((s) => [s.reconnus, s.total]), [[2, 2], [2, 2]]);
});

test('découper : une scène peu reconnue le dit (reconnus / total)', () => {
  const entendus = [e('un', 0.5, 0.9), e('deux', 1.0, 1.4), e('zzz', 3.0, 3.4), e('quatre', 3.5, 4.0)];
  const d = A.decouperEnScenes(['un deux', 'trois cinq six quatre'], entendus, 5);
  assert.deepEqual([d[1].reconnus, d[1].total], [1, 4]);
});

test('mot à trait d\'union entendu en deux morceaux (« faut » « -il ») : calé sur le début du premier', () => {
  const r = A.aligner('Pourquoi faut-il garder', [e('Pourquoi', 0, 0.4), e('faut', 0.46, 0.7), e('-il', 0.78, 1.0), e('garder', 1.04, 1.3)]);
  assert.equal(r.mots[1].t0, 0.46);
  assert.equal(r.mots[2].t0, 1.04);
});
