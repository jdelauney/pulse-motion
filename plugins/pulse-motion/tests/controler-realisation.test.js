'use strict';
/* Spec S2, 5.7 : règles de réalisation sans navigateur (rien-de-nouveau, comparaison-courte, camera-repetee). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { controler } = require('../scripts/controler.js');
const W = require('../moteur/wav.js');
const { miniProjet, poserVoix } = require('./aide/mini-projet.js');

const controle = (dir) => controler({ dossier: dir, ecrire: false }).problemes;
const de = (problemes, regle) => problemes.filter((p) => p.regle === regle);

/** Scène de formation : un titre à 0,3 s, puis plus rien pendant la durée. */
const titreSeul = (id, duree, extra = {}) => ({ id, duree, textes: { titre: 'Garder le froid' }, html: '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2>', ...extra });
const fin = { id: 'fin', duree: 3, transition: 'coupe', textes: { titre: 'Merci' }, html: '<h2 data-texte="titre" data-start="0" data-dur="0.5"></h2>' };

async function avecVoix(dir, scene, secondes, texte = 'Gardez toujours vos produits frais au froid, dans le réfrigérateur, sans attendre, car la chaleur fait grandir les bactéries') {
  const x = new Float32Array(48000 * secondes);
  for (let i = 4800; i < x.length - 4800; i++) x[i] = 0.3 * Math.sin(i / 5);
  await poserVoix(dir, scene, W.ecrire({ taux: 48000, canaux: [x] }), texte);
}

test('controler-realisation.test.js › rien-de-nouveau : 9 s sans entrée en formation, alerte ; même scène sous une voix, rien ; social, 4 s', async () => {
  const p = de(controle(miniProjet({ scenes: [titreSeul('longue', 10), fin] })), 'rien-de-nouveau');
  assert.equal(p.length, 1);
  assert.equal(p[0].scene, 'longue');
  assert.equal(p[0].gravite, 'alerte');
  assert.match(p[0].message, /rien de nouveau n'apparaît pendant 9,7 s \(de 0,3 s à 10 s\) ; au-delà de 8 s, la scène ressemble à une diapositive/);
  // Sous une voix (qui parle presque toute la scène) : 12 s.
  const voix = miniProjet({ scenes: [titreSeul('longue', 10, { voix: { texte: 'Gardez toujours vos produits frais au froid, dans le réfrigérateur, sans attendre, car la chaleur fait grandir les bactéries' } }), fin] });
  await avecVoix(voix, 'longue', 9.5);
  assert.deepEqual(de(controle(voix), 'rien-de-nouveau'), []);
  // Genre social : 4 s.
  const social = de(controle(miniProjet({ scenes: [titreSeul('courte', 5), fin], deroule: { genre: 'social', format: { ratio: '9:16', ips: 30 } } })), 'rien-de-nouveau');
  assert.equal(social.length, 1);
  assert.match(social[0].message, /au-delà de 4 s/);
});

test('controler-realisation.test.js › rien-de-nouveau ne passe jamais sous le temps de lecture de la scène', () => {
  // 30 mots : 1,5 + 0,3 × 30 = 10,5 s de lecture ; 9,7 s sans entrée reste sous ce temps.
  const long = 'un texte assez long pour que sa lecture demande plus de dix secondes à qui le découvre sans voix et sans hâte avec soin dans une formation posée et claire pour tous';
  const p = de(controle(miniProjet({ scenes: [{ ...titreSeul('longue', 11), textes: { titre: long } }, fin] })), 'rien-de-nouveau');
  assert.deepEqual(p, []);
});

const colonnes = (gauche, droite) => `<h2 data-texte="titre" data-start="0.2" data-dur="0.6"></h2>
<div id="g" data-start="${gauche}" data-dur="0.6"><p data-texte="a"></p></div>
<div id="d" data-start="${droite}" data-dur="0.6"><p data-texte="b"></p></div>`;

test('controler-realisation.test.js › comparaison-courte : alerte et correction de durée, aucune sous une voix', async () => {
  const scene = (extra) => ({ id: 'duo', type: 'comparaison', duree: 6, textes: { titre: 'Avant, après', a: 'Avant', b: 'Après' }, html: colonnes(0.8, 4.4), ...extra });
  const dir = miniProjet({ scenes: [scene(), fin] });
  const p = de(controle(dir), 'comparaison-courte');
  assert.equal(p.length, 1);
  assert.match(p[0].message, /ne restent visibles ensemble que 1 s ; il faut au moins 2,5 s/);
  assert.deepEqual(p[0].correction, { scene: 'duo', duree: 7.5 });
  // Corrigée seule par le contrôle, comme « lecture ».
  const r = controler({ dossier: dir, ecrire: false, corriger: true });
  assert.ok(r.corrections.some((c) => c.regle === 'comparaison-courte' && c.apres === 7.5), JSON.stringify(r.corrections));
  // Sous une voix : l'alerte, jamais la correction.
  const voix = miniProjet({ scenes: [scene({ voix: { texte: 'Avant et après.' } }), fin] });
  await avecVoix(voix, 'duo', 5, 'Avant et après.');
  const pv = de(controle(voix), 'comparaison-courte');
  assert.ok(pv.length <= 1);
  for (const x of pv) assert.equal(x.correction, undefined);
  // Colonnes entrées tôt : rien.
  assert.deepEqual(de(controle(miniProjet({ scenes: [scene({ html: colonnes(0.8, 1.6) }), fin] })), 'comparaison-courte'), []);
});

const zoom = (de1, a) => `<div data-camera="zoom ${de1}→${a} 0+4"><h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2></div>`;

test('controler-realisation.test.js › camera-repetee : deux zooms avant voisins, alerte ; une dérive de 3 %, rien', () => {
  const s = (id, html) => ({ id, duree: 5, textes: { titre: 'Le froid' }, html });
  const p = de(controle(miniProjet({ scenes: [s('a', zoom(1, 1.1)), s('b', zoom(1, 1.2)), fin] })), 'camera-repetee');
  assert.equal(p.length, 1);
  assert.equal(p[0].scene, 'b');
  assert.match(p[0].message, /Scènes « a » et « b » : le même mouvement de caméra \(zoom avant\) deux fois de suite/);
  assert.deepEqual(de(controle(miniProjet({ scenes: [s('a', zoom(1, 1.1)), s('b', zoom(1, 1.03)), fin] })), 'camera-repetee'), []);
  assert.deepEqual(de(controle(miniProjet({ scenes: [s('a', zoom(1, 1.1)), s('b', zoom(1.1, 1)), fin] })), 'camera-repetee'), []);
});
