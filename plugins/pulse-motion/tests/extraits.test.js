'use strict';
/* Spec Rendu et export, 5.12 : extrait d'une scène (--scene) et passage seul (--plage), sans toucher au fichier complet,
 * à partir des images déjà en cache. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo, verifierSortie } = require('../scripts/exporter.js');
const L = require('../scripts/lib/livrables.js');
const F = require('../scripts/lib/ffmpeg.js');
const { minutageVideo } = require('../scripts/lib/voix.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };
const empreinte = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('extraits.test.js › images d\'un passage (convention de take-one) et d\'une scène (partie visible), noms des fichiers', () => {
  assert.deepEqual(L.imagesDePlage({ debut: 12, fin: 18 }, 30, 60), { f0: 360, f1: 540 });
  assert.deepEqual(L.imagesDePlage({ debut: 12.5, fin: 18 }, 30, 60), { f0: 375, f1: 540 });
  assert.match(L.imagesDePlage({ debut: 70, fin: 80 }, 30, 60).erreur, /commence après la fin/);
  assert.deepEqual(L.lirePlage('12,5-18'), { debut: 12.5, fin: 18 });
  assert.match(L.lirePlage('douze').erreur, /« 12,5-18 »/);
  const min = { duree: 10, scenes: [{ id: 'a', debut: 0, fin: 4.5, entree: 0 }, { id: 'b', debut: 4, fin: 10, entree: 0.5 }] };
  assert.deepEqual(L.imagesDeScene(min, 1, 10), { f0: 45, f1: 100 });
  assert.equal(L.nomSortie('la-chaine', { usage: 'web', scene: 'intro' }), 'la-chaine-intro.mp4');
  assert.equal(L.nomSortie('la-chaine', { usage: 'courriel', scene: 'intro' }), 'la-chaine-courriel-intro.mp4');
  assert.equal(L.nomSortie('la-chaine', { usage: 'web', plage: { debut: 12.5, fin: 18 } }), 'la-chaine-de-12,5s-a-18s.mp4');
  assert.match(require('../scripts/lib/routes-export.js').MOTIF_NOM.source, /de-/);
  assert.ok(require('../scripts/lib/routes-export.js').MOTIF_NOM.test('la-chaine-de-12,5s-a-18s.mp4'));
});

test('extraits.test.js › scène inconnue : message avec la liste des scènes, avant toute capture', () => {
  const dir = copierProjet('projet-simple');
  const refus = verifierSortie({ dossier: dir, voie: 'fidele', outil, scenes: ['absente'] });
  assert.equal(refus, 'Scène « absente » inconnue : intro, chiffre.');
  const { deroule } = lireDeroule(dir);
  assert.match(L.preparerSortie({ deroule, minutage: minutageVideo(dir, deroule), ips: 30, scene: 'intro', plage: '1-2' }).erreur, /une scène ou un passage, pas les deux/);
});

test('extraits.test.js › --scene : durée de la partie visible à une image près, aucun pixel des scènes voisines', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1, scene: 'chiffre' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'la-chaine-du-froid-chiffre.mp4'));
  const { deroule } = lireDeroule(dir);
  const min = minutageVideo(dir, deroule);
  const i = min.scenes.findIndex((s) => s.id === 'chiffre');
  const precedente = min.scenes[i - 1];
  const debutVisible = min.scenes[i].debut + min.scenes[i].entree;
  const finVisible = min.duree;
  // Partie visible, à une image près ; la première image vient après la fin de la transition (la scène « intro » est sortie).
  assert.ok(Math.abs(r.duree - (finVisible - debutVisible)) <= 1 / 10 + 1e-6, `${r.duree} au lieu de ${finVisible - debutVisible}`);
  assert.ok(r.extrait.debut >= debutVisible - 1e-9 && r.extrait.debut >= precedente.fin - 1e-9, JSON.stringify(r.extrait));
  // Dernière image (f1 − 1) dans la partie visible ; fin : borne exclue.
  assert.ok(r.extrait.fin - 1 / 10 < finVisible, JSON.stringify(r.extrait));
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.deepEqual([s.video, s.largeur, s.hauteur, s.images], ['h264', 1280, 720, r.images]);
  assert.equal(s.couleurs.espace, 'bt709');
  // Pas de couverture ni de chapitres pour un extrait ; les crédits, oui.
  assert.equal(r.fichiers.couverture, undefined);
  assert.equal(r.fichiers.credits, 'sortie/la-chaine-du-froid-credits.txt');
});

test('extraits.test.js › --plage 12-18 à 30 images/s : 180 images, la première identique à l\'image 360 du master (écart ≤ 2 %) ; le fichier complet n\'est jamais modifié, rien n\'est recapturé', sans, async () => {
  const dir = copierProjet('projet-simple');
  // Vidéo de 22,5 s : intro 10 s, chiffre 10 s au rythme 0,8 (12,5 s).
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 10; d.scenes[1].duree = 10; });
  const options = { dossier: dir, qualite: '720p', ips: 30, navigateur, outil, dossierStyles: STYLES, dureeSegment: 5, pour: 'master' };
  const m = await exporterFidele(options);
  assert.equal(m.ok, true, m.message);
  const avant = empreinte(m.fichier);
  const dernier = fs.readFileSync(path.join(dir, 'sortie', '.export', 'segments', 'dernier.json'), 'utf8');
  const verification = fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8');
  const r = await exporterFidele({ ...options, plage: '12-18' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'la-chaine-du-froid-master-de-12s-a-18s.mp4'));
  assert.equal(r.images, 180);
  assert.equal((await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier })).images, 180);
  // Images déjà en cache (intermédiaires du master) : aucune nouvelle capture.
  assert.deepEqual(r.scenesRecapturees, []);
  assert.equal(r.segmentsRepris, r.segmentsUtiles);
  assert.ok(r.segmentsUtiles < r.segments);
  const premiere = await F.extraireImage({ ffmpeg: outil.chemin, fichier: r.fichier, t: 0 });
  const image360 = await F.extraireImage({ ffmpeg: outil.chemin, fichier: m.fichier, t: 360 / 30 - 0.001 });
  assert.ok(F.ecartImages(premiere, image360) <= 0.02);
  // Le fichier complet, le dernier export et sa vérification ne changent pas.
  assert.equal(empreinte(m.fichier), avant);
  assert.equal(fs.readFileSync(path.join(dir, 'sortie', '.export', 'segments', 'dernier.json'), 'utf8'), dernier);
  assert.equal(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'), verification);
});

test('extraits.test.js › voie navigateur : extrait d\'une scène, même nombre d\'images, nom de l\'extrait', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, ips: 10, qualite: '720p', scene: 'chiffre' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/la-chaine-du-froid-chiffre.mp4');
  const { deroule } = lireDeroule(dir);
  const min = minutageVideo(dir, deroule);
  const { f0, f1 } = L.imagesDeScene(min, 1, 10);
  assert.equal(r.images, f1 - f0);
  assert.equal(r.fichiers.couverture, undefined);
  // La vérification de la vidéo entière n'est pas remplacée par celle de l'extrait.
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'verification.json')), false);
});
