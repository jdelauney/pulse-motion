'use strict';
/* Spec Retouches et ergonomie (S4) 5.8 et 5.10 : planche des instants (image d'après d'une remarque) et planche avant /
 * après d'une retouche (trois colonnes, scènes modifiées seules, différences). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../scripts/planche-retouche.js');
const R = require('../scripts/lib/remarques.js');
const H = require('../scripts/historique.js');
const { miseEnPage } = require('../scripts/regard.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { decoderPNG } = require('../scripts/logo.js');
const { encoderPng } = require('../scripts/lib/vignette.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sansNavigateur = !navigateur && 'Chrome ou Edge introuvable';
const taillePng = (f) => { const d = decoderPNG(fs.readFileSync(f)); return [d.largeur, d.hauteur]; };

test('planche --instants : l\'image de chaque instant, posée sur une image, et l\'image d\'après d\'une remarque', { skip: sansNavigateur, timeout: 120000 }, async () => {
  const dir = copierProjet('projet-simple');
  const r = R.creer(dir, { portee: 'epingle', t: 1, x: 0.5, y: 0.4, texte: 'le titre arrive trop tôt' });
  H.sauvegarder(dir, { phrase: r.texte });
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Pourquoi 4 °C ?'; });
  const sortie = await P.plancheInstants({ dossier: dir, instants: [1, 2.51], dossierStyles: STYLES });
  assert.equal(sortie.ok, true, sortie.message);
  assert.deepEqual(sortie.images, [{ t: 1, fichier: 'sortie/planche/instant-1000.png' }, { t: 2.5, fichier: 'sortie/planche/instant-2500.png' }]);
  assert.deepEqual(taillePng(path.join(dir, 'sortie', 'planche', 'instant-1000.png')), [960, 540]);
  // L'image d'après de la remarque est celle-ci.
  const faite = R.faite(dir, r.id, 'Le titre arrive un peu plus tard.');
  assert.ok(fs.readFileSync(path.join(R.dossierRemarques(dir), faite.imageApres)).equals(fs.readFileSync(path.join(dir, 'sortie', 'planche', 'instant-1000.png'))));
  // Demandes invalides.
  assert.match((await P.plancheInstants({ dossier: dir, instants: [], dossierStyles: STYLES })).message, /un ou plusieurs instants/);
  assert.deepEqual(P.lireArguments(['.', '--instants', '18.4,22']).instants, [18.4, 22]);
  assert.deepEqual(P.lireArguments(['video', '--avant', 'precedente', 'intro,chiffre']), { dossier: 'video', ids: ['intro', 'chiffre'], instants: null, avant: 'precedente' });
});

test('planche --avant : trois colonnes pour chaque scène modifiée et pour elles seules', { skip: sansNavigateur, timeout: 180000 }, async () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir, { phrase: 'change la légende' });
  modifierDeroule(dir, (d) => { d.scenes[1].textes.legende = 'bactéries en une heure, à 20 °C'; });
  const r = await P.plancheAvant({ dossier: dir, version: 'precedente', dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.version, { numero: '001', nom: null });
  assert.deepEqual(r.scenes.map((s) => s.id), ['chiffre'], 'la scène modifiée seule');
  assert.equal(r.global, false);
  const s = r.scenes[0];
  assert.equal(s.planche, 'sortie/planche/avant-apres-chiffre.png');
  assert.equal(s.pixelsDifferents.length, 3, 'trois instants');
  assert.ok(s.pixelsDifferents.every((n) => n > 0), `différences : ${s.pixelsDifferents}`);
  const mise = miseEnPage({ ratio: '16:9', colonnes: 3, rangees: 3 });
  const [largeur, hauteur] = taillePng(path.join(dir, s.planche));
  assert.equal(largeur, 3 * mise.largeur + 4 * 12, 'trois colonnes');
  assert.equal(hauteur, 3 * (mise.hauteur + 24) + 4 * 12, 'trois rangées');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sortie', 'planche')).filter((f) => f.startsWith('avant-apres-')), ['avant-apres-chiffre.png']);
  // Restreinte aux scènes demandées : la scène non modifiée n'a jamais de planche.
  const seule = await P.plancheAvant({ dossier: dir, version: '1', ids: ['intro'], dossierStyles: STYLES });
  assert.deepEqual(seule.scenes, []);
  assert.match(seule.message, /Aucune scène n'a changé/);
});

test('planche --avant : image de différence vide quand rien ne change', { skip: sansNavigateur, timeout: 180000 }, async () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir, { phrase: 'retouche sans effet visible' });
  const scene = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(scene, `${fs.readFileSync(scene, 'utf8')}\n<!-- une note qui ne change pas l'image -->\n`);
  const r = await P.plancheAvant({ dossier: dir, version: 'precedente', dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.scenes.map((s) => s.id), ['intro'], 'le fichier de la scène a changé');
  assert.deepEqual(r.scenes[0].pixelsDifferents, [0, 0, 0], 'aucun pixel différent');
});

test('planche --avant : différences en rouge sur l\'après en gris, scènes d\'un réglage global', () => {
  const l = 4, h = 2;
  const gris = new Uint8Array(l * h * 3).fill(100);
  const a = encoderPng(l, h, gris);
  const autre = Uint8Array.from(gris);
  autre[0] = 100 + P.SEUIL; // à la limite : pas une différence
  autre[3] = 100 + P.SEUIL + 1; // au-delà : une différence
  const b = encoderPng(l, h, autre);
  const d = P.imageDifferences(a, b);
  assert.equal(d.pixels, 1);
  const px = decoderPNG(d.png).pixel;
  const [r0, v0] = px(0, 0);
  assert.equal(r0, v0, 'pas de différence : gris');
  const [r1, v1, b1] = px(1, 0);
  assert.ok(r1 > v1 + 100 && v1 === b1, `rouge à 60 % : ${r1}, ${v1}, ${b1}`);
  assert.equal(P.imageDifferences(a, a).pixels, 0);
  assert.deepEqual(P.POSITIONS, [0.35, 0.65, 0.95]);
  // Un réglage visuel de toute la vidéo (charte) : toutes les scènes ; un changement de son : aucune.
  const dir = copierProjet('projet-simple');
  const copie = path.join(dossierTemporaire('pm-avant-'), 'v');
  fs.cpSync(dir, copie, { recursive: true });
  const lire = (d) => lireDeroule(d).deroule;
  modifierDeroule(copie, (d) => { d.musique = { generee: 'calme' }; d.titre = 'Autre titre'; });
  assert.deepEqual(P.scenesModifiees(dir, copie, lire(dir), lire(copie)).ids, []);
  modifierDeroule(copie, (d) => { d.charte.couleurs.accent = '#123456'; });
  const g = P.scenesModifiees(dir, copie, lire(dir), lire(copie));
  assert.deepEqual([g.ids, g.global], [['intro', 'chiffre'], true]);
  // Un média cité par une scène.
  const copie2 = path.join(dossierTemporaire('pm-avant-'), 'v');
  fs.cpSync(dir, copie2, { recursive: true });
  fs.writeFileSync(path.join(copie2, 'assets', 'photo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.deepEqual(P.scenesModifiees(dir, copie2, lire(dir), lire(copie2)).ids, ['intro']);
});
