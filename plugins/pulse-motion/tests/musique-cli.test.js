'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ecouterMusique } = require('../scripts/musique.js');
const W = require('../moteur/wav.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();

test('musique ecouter : WAV de la musique seule, à la durée de la vidéo', { skip: !navigateur && 'Chrome absent' }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { generee: 'calme' }; d.bruitages = { transitions: true }; });
  const r = await ecouterMusique({ dossier: dir, navigateur, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/musique.wav');
  const lu = W.lire(new Uint8Array(fs.readFileSync(path.join(dir, r.fichier))));
  assert.ok(Math.abs(lu.canaux[0].length / lu.taux - r.duree) < 0.05);
});

test('sans musique : message', { skip: !navigateur && 'Chrome absent' }, async () => {
  const r = await ecouterMusique({ dossier: copierProjet('projet-simple'), navigateur, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.message, /pas de musique/);
});
