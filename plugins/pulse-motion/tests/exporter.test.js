'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterVideo } = require('../scripts/exporter.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');

const navigateur = trouverNavigateur();
const sansNavigateur = !navigateur && 'Chrome ou Edge introuvable (variable PM_NAVIGATEUR pour l\'indiquer)';

test('export MP4 de bout en bout : fichier relu, nombre d\'images, progression suivie', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const vus = [];
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, surProgression: (n, total) => vus.push([n, total]) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/la-chaine-du-froid.mp4');
  assert.equal(r.images, 218);
  assert.equal(r.audio, false);
  const mp4 = fs.readFileSync(path.join(dir, r.fichier));
  assert.equal(mp4.toString('latin1', 4, 8), 'ftyp');
  assert.ok(vus.length > 0 && vus[vus.length - 1][1] === 218);
  assert.equal(fs.readdirSync(path.join(dir, 'sortie')).some((f) => f.endsWith('.part')), false);
});

test('export avec musique : piste audio AAC (si le navigateur sait l\'encoder)', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.wav'), wavSinus({ secondes: 3 }));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav', volume: 0.6 }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  if (process.platform === 'win32' || process.platform === 'darwin') assert.equal(r.audio, true);
});

test('planche : 3 images par scène demandée, hors des transitions, page de planche', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: ['intro', 'chiffre'] });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/planche/planche.html');
  assert.deepEqual(r.images, ['intro-1', 'intro-2', 'intro-3', 'chiffre-1', 'chiffre-2', 'chiffre-3'].map((n) => `sortie/planche/${n}.png`));
  for (const image of r.images) assert.equal(fs.readFileSync(path.join(dir, image)).subarray(1, 4).toString(), 'PNG');
});

test('planche sans scène précisée : les deux premières scènes ; scène inconnue refusée', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: true });
  assert.equal(r.images.length, 6);
  const inconnue = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: ['rien'] });
  assert.equal(inconnue.ok, false);
  assert.match(inconnue.message, /Scène inconnue : rien/);
});

test('sans Chrome ni Edge : message qui renvoie vers l\'aperçu et le bouton MP4', async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, navigateur: null });
  assert.equal(r.ok, false);
  assert.match(r.message, /Chrome ou Edge introuvable.*« MP4 »/);
});

test('déroulé invalide : pas d\'export, erreurs du déroulé', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.version = 9; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.message, /« version » doit valoir 1/);
});
