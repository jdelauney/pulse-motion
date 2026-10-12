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

const F = require('../scripts/lib/ffmpeg.js');
const outil = F.trouverFfmpeg();

test('export navigateur : le son exporté vient du mixage de la page (sonie −16 LUFS lue par ffmpeg)', { skip: sansNavigateur || (!outil.present && 'ffmpeg absent') }, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.wav'), wavSinus({ secondes: 10 }));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav', volume: 0.3 }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  if (!r.audio) return; // navigateur sans AAC
  const m = await F.mesurerSonie({ ffmpeg: outil.chemin, fichier: path.join(dir, r.fichier) });
  assert.ok(Math.abs(m.integree + 16) < 1, String(m.integree));
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

test('vidéo sur fond noir : la relecture ne la prend pas pour une image noire', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.charte.couleurs = { primaire: '#4c8dff', fond: '#000000', texte: '#ffffff', accent: '#ffb000' }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
});

test('musique illisible : vidéo exportée sans son, avertissement en français', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.mp3'), Buffer.alloc(2000, 7));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.mp3', volume: 0.6 }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, false);
  assert.match(r.avertissement, /musique n'a pas pu être lue/);
});

test('planche avec ouverture : la page de planche est ouverte une fois finie', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const ouverts = [];
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: ['intro'], ouvrir: true, ouvrirFichier: (f) => ouverts.push(f) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(ouverts, [path.join(dir, 'sortie', 'planche', 'planche.html')]);
});

test('navigateur qui se ferme aussitôt : échec rapide et clair', async () => {
  const dir = copierProjet('projet-simple');
  const debut = Date.now();
  // Node lancé avec les options de Chrome s'arrête aussitôt : il joue le navigateur qui plante.
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, navigateur: process.execPath });
  assert.equal(r.ok, false);
  assert.match(r.message, /navigateur s'est fermé/);
  assert.ok(Date.now() - debut < 20000, 'échec en moins de 20 s');
});

test('export qui ne démarre pas (page en erreur) : échec après le délai de démarrage', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.style = 'inexistant'; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, delaiDemarrage: 4000 });
  assert.equal(r.ok, false);
  assert.match(r.message, /n'a pas démarré/);
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

test('voie de l\'export : fidèle si ffmpeg est utilisable, sinon (ou --rapide, ou planche) dans le navigateur', () => {
  const { choisirVoie } = require('../scripts/exporter.js');
  const pret = { present: true, versionOk: true };
  assert.equal(choisirVoie({ outil: pret }), 'fidele');
  assert.equal(choisirVoie({ outil: pret, rapide: true }), 'navigateur');
  assert.equal(choisirVoie({ outil: pret, planche: ['intro'] }), 'navigateur');
  assert.equal(choisirVoie({ outil: { present: false } }), 'navigateur');
  assert.equal(choisirVoie({ outil: { present: true, versionOk: false } }), 'navigateur');
});

test('ligne de commande : export fidèle de l\'exemple en 720p, mode et son dans le résumé', { skip: (!trouverNavigateur() && 'Chrome ou Edge introuvable') || (!require('../scripts/lib/ffmpeg.js').trouverFfmpeg().present && 'ffmpeg absent') }, () => {
  const { spawnSync } = require('node:child_process');
  const { dossierTemporaire } = require('./aide/temporaire.js');
  const dir = dossierTemporaire('pm-exp-');
  fs.cpSync(path.join(__dirname, '..', 'exemples', 'chaine-du-froid'), dir, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'exporter', dir, '--qualite', '720p', '--ips', '2'], { encoding: 'utf8', timeout: 280000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.mode, 'fidele');
  assert.equal(j.ok, true);
  assert.ok(fs.existsSync(j.fichier));
});
