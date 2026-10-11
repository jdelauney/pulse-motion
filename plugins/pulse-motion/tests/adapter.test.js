'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../scripts/lib/adapter.js');
const { verifierSection } = require('../scripts/lib/scenes.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { CLAIR } = require('./aide/styles.js');

const modele = (type) => fs.readFileSync(path.join(CLAIR, 'scenes', `${type}.html`), 'utf8');

test('adapterScene : id, décor étiré à la durée, dernière scène 1 s plus tôt', () => {
  const html = A.adapterScene(modele('titre'), { type: 'titre', id: 'intro', duree: 5, textes: {} });
  assert.equal(verifierSection(html, 'intro'), null);
  const decors = html.match(/<span[^>]*data-decor[^>]*>/g);
  assert.equal(decors.length, 2);
  for (const d of decors) assert.match(d, /data-dur="5"/);
  const fin = A.adapterScene(modele('conclusion'), { type: 'conclusion', id: 'fin', duree: 6, textes: {}, derniere: true, logo: true });
  assert.match(fin, /data-decor[^>]*data-dur="5"/);
  assert.match(fin, /data-logo/);
});

test('adapterScene : points facultatifs vides et logo absent retirés, minutage intact', () => {
  const html = A.adapterScene(modele('liste'), { type: 'liste', id: 'regles', duree: 9, textes: { titre: 'T', point1: 'a', point2: 'b', point3: 'c', point4: ' ' } });
  assert.deepEqual(extraireScene(html).textes, ['titre', 'point1', 'point2', 'point3']);
  assert.doesNotMatch(html, /data-texte="point4"/);
  const sansLogo = A.adapterScene(modele('conclusion'), { type: 'conclusion', id: 'fin', duree: 6, textes: {}, logo: false });
  assert.doesNotMatch(sansLogo, /<img[^>]*data-logo/);
});

test('compteur : valeur reprise de l\'ancienne scène', () => {
  const ancien = A.adapterScene(modele('chiffre'), { type: 'chiffre', id: 'seuil', duree: 7, textes: {}, nombre: '3.5' });
  assert.equal(A.lireNombre(ancien), '3.5');
  assert.match(ancien, /data-tween="nombre 0→3\.5 cubic-out"/);
  assert.equal(A.lireNombre('<p>rien</p>'), null);
});

test('choisirType et textesPour : type déclaré, sinon le plus proche ; textes restants recasés', () => {
  assert.equal(A.choisirType({ type: 'alerte', textes: {} }), 'alerte');
  assert.equal(A.choisirType({ textes: { titre: 'x', a: '1', b: '2', c: '3' } }), 'schema');
  assert.equal(A.choisirType({ textes: { legende: 'x' } }), 'chiffre');
  assert.equal(A.choisirType({ textes: { question: 'x' } }), 'titre');
  assert.deepEqual(A.textesPour('titre', { question: 'Pourquoi ?', detail: 'En bref' }), { etiquette: 'Pourquoi ?', titre: 'En bref', sous: '' });
  assert.deepEqual(A.textesPour('liste', { titre: 'T', point1: 'a', point2: 'b' }), { titre: 'T', point1: 'a', point2: 'b', point3: '', point4: '' });
});
