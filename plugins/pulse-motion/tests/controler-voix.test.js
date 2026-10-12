'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controler } = require('../scripts/controler.js');
const V = require('../scripts/lib/voix.js');
const W = require('../moteur/wav.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const taux = 48000;
function wavParole(secondes) {
  const x = new Float32Array(Math.round((secondes + 1) * taux));
  for (let i = taux / 2; i < (secondes + 0.5) * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  return W.ecrire({ taux, canaux: [x] });
}

test('voix plus longue que la scène : information voix-allonge avec la durée à reporter ; ancre introuvable : erreur', async () => {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(6), texte: 'Pourquoi le froid compte' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid compte', fichier: r.relatif }; });
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('</section>', '<p data-start="mot:chaud">x</p></section>'));
  const c = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const allonge = c.problemes.find((p) => p.regle === 'voix-allonge');
  assert.ok(allonge, JSON.stringify(c.problemes.map((p) => p.regle)));
  assert.equal(allonge.gravite, 'info');
  assert.match(allonge.message, /allongée à 6,9 s/);
  assert.ok(c.problemes.some((p) => p.regle === 'ancre-mot-introuvable' && p.gravite === 'erreur'));
});

test('scène avec voix : jamais de correction automatique de sa durée', async () => {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(0.5), texte: 'Bonjour' });
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 30; d.scenes[0].voix = { texte: 'Bonjour', fichier: r.relatif }; });
  const c = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const corrections = c.problemes.filter((p) => p.correction && p.correction.scene === 'intro');
  assert.deepEqual(corrections, []);
});

test('sans voix : la correction automatique de durée reste (témoin)', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 30; });
  const c = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.ok(c.problemes.some((p) => p.correction && p.correction.scene === 'intro'), JSON.stringify(c.problemes.map((p) => p.regle)));
});
