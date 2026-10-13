'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { balisesEffets, reecrireBalise, modifierEffet, preparerEffets, graineParDefaut, fnv1a } = require('../scripts/lib/effets.js');
const { EFFETS, copierProjet } = require('./aide/projet.js');

const SCENE = `<section data-scene="s">
  <!-- <div data-effet="commente"></div> -->
  <script>const x = '<div data-effet="dans-un-script">';</script>
  <div data-effet="gerbe" data-reglages='nombre: 3'/>
  <div data-effet="inconnu"></div>
  <div
    data-effet="simple" data-graine=7 data-calque="arriere"></div>
</section>`;

test('balises : rang des data-effet hors commentaires et scripts, identique à celui de l\'assemblage', () => {
  const b = balisesEffets(SCENE);
  assert.deepEqual(b.map((x) => [x.ordre, x.attributs['data-effet']]), [[0, 'gerbe'], [1, 'inconnu'], [2, 'simple']]);
  assert.equal(SCENE.slice(b[0].debut, b[0].fin), `<div data-effet="gerbe" data-reglages='nombre: 3'/>`);
  assert.equal(b[0].texte, SCENE.slice(b[0].debut, b[0].fin));
  assert.equal(b[2].attributs['data-graine'], '7');
  // L'assemblage retire les scripts de la scène avant de chercher les effets.
  const projet = copierProjet('projet-effets');
  const sansScripts = SCENE.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const valide = sansScripts.replace("nombre: 3'", "nombre: 30'"); // « gerbe » exige nombre >= 10
  const r =preparerEffets(valide, { scene: 's', projet, bibliotheque: EFFETS });
  assert.deepEqual(r.effets.map((e) => e.ordre), [0, 2], 'l\'effet en erreur garde son rang');
  assert.equal(graineParDefaut('s', 2, 'simple'), fnv1a('s|2|simple'));
});

test('reecrireBalise : remplace, ajoute ou retire, quels que soient les guillemets ; le reste intact', () => {
  assert.equal(reecrireBalise(`<div data-effet="gerbe" data-reglages='nombre: 3'/>`, { 'data-reglages': 'nombre: 9', 'data-graine': '4' }),
    '<div data-effet="gerbe" data-reglages="nombre: 9" data-graine="4"/>');
  assert.equal(reecrireBalise('<div\n    data-effet="simple" data-graine=7 data-calque="arriere">', { 'data-graine': null, 'data-reglages': 'nombre: 2' }),
    '<div\n    data-effet="simple" data-calque="arriere" data-reglages="nombre: 2">');
  assert.equal(reecrireBalise('<div data-effet="a" class="x" />', { 'data-effet': 'b' }), '<div data-effet="b" class="x" />');
  assert.equal(reecrireBalise('<div data-effet="a">', { 'data-reglages': null }), '<div data-effet="a">');
  assert.equal(reecrireBalise('<div data-effet="a">', { 'data-reglages': 'couleur: #f00 & "x"' }),
    '<div data-effet="a" data-reglages="couleur: #f00 &amp; &quot;x&quot;">');
});

test('modifierEffet : seule la balise de ce rang change ; rang absent -> null', () => {
  assert.equal(modifierEffet(SCENE, 1, { 'data-reglages': 'nombre: 5' }),
    SCENE.replace('<div data-effet="inconnu">', '<div data-effet="inconnu" data-reglages="nombre: 5">'));
  assert.equal(modifierEffet(SCENE, 3, { 'data-reglages': 'x: 1' }), null);
});
