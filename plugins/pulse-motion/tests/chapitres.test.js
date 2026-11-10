'use strict';
/* Spec Rendu et export, 5.11 : chapitres déclarés (scenes[].chapitre), texte YouTube, WebVTT, intégrés au MP4 (ffmpeg). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../scripts/lib/livrables.js');
const F = require('../scripts/lib/ffmpeg.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo } = require('../scripts/exporter.js');
const { assembler } = require('../scripts/assembler.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };
const MIN = { duree: 40, scenes: [{ id: 'a', debut: 0, fin: 15, entree: 0 }, { id: 'b', debut: 14.5, fin: 30, entree: 0.5 }, { id: 'c', debut: 29.5, fin: 40, entree: 0.5 }] };
const deroule = (chapitres) => ({ titre: 'La chaîne du froid', scenes: [{ id: 'a', chapitre: chapitres[0] }, { id: 'b', chapitre: chapitres[1] }, { id: 'c', chapitre: chapitres[2] }] });

/** Chapitres lus par ffprobe : [{ debut, fin, titre }]. */
async function chapitresLus(fichier) {
  const r = await F.lancer(outil.cheminProbe, ['-v', 'error', '-show_chapters', '-show_format', '-of', 'json', fichier]);
  const j = JSON.parse(r.sortie.toString('utf8'));
  return { chapitres: (j.chapters || []).map((c) => ({ debut: Number(c.start_time), fin: Number(c.end_time), titre: c.tags && c.tags.title })), titre: j.format.tags && j.format.tags.title };
}

test('chapitres.test.js › texte YouTube : première ligne 0:00 ; sans chapitre sur la première scène, le titre de la vidéo', () => {
  const c = L.chapitresDe(deroule([undefined, 'Le seuil', 'Les bons gestes']), MIN);
  assert.deepEqual(c.map((x) => [x.debut, x.titre]), [[0, 'La chaîne du froid'], [14.5, 'Le seuil'], [29.5, 'Les bons gestes']]);
  const texte = L.texteYouTube(c);
  assert.equal(texte.split('\n')[0], '0:00 La chaîne du froid');
  assert.equal(texte, '0:00 La chaîne du froid\n0:14 Le seuil\n0:29 Les bons gestes\n');
  assert.equal(L.horodatage(3723.4), '1:02:03');
  assert.match(L.vttChapitres(c), /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:14\.500\nLa chaîne du froid\n/);
  // Sans aucun chapitre déclaré : rien (jamais déduits en silence, décision 5).
  assert.deepEqual(L.chapitresDe(deroule([undefined, undefined, undefined]), MIN), []);
});

test('chapitres.test.js › deux chapitres : alerte des 3 chapitres ; un chapitre court : alerte des 10 s', () => {
  const deux = L.chapitresDe({ titre: 'T', scenes: [{ id: 'a', chapitre: 'Un' }, { id: 'b', chapitre: 'Deux' }] }, { duree: 30, scenes: MIN.scenes.slice(0, 2) });
  assert.deepEqual(L.alertesChapitres(deux), ['Il y a 2 chapitres : YouTube ne les affiche qu\'à partir de 3.']);
  const court = L.chapitresDe(deroule(['A', 'B', 'Conclusion']), { ...MIN, duree: 35.5 });
  assert.deepEqual(L.alertesChapitres(court), ['Le chapitre « Conclusion » dure 6 s : YouTube demande au moins 10 s par chapitre.']);
});

test('chapitres.test.js › titre avec = ; # : échappé', () => {
  const meta = L.ffmetadata([{ debut: 0, fin: 2, titre: 'Prix = 4 € ; #1 \\ fin' }], 'Titre = ; #');
  assert.match(meta, /^;FFMETADATA1\ntitle=Titre \\= \\; \\#\n/);
  assert.match(meta, /\[CHAPTER\]\nTIMEBASE=1\/1000\nSTART=0\nEND=2000\ntitle=Prix \\= 4 € \\; \\#1 \\\\ fin\n/);
});

test('chapitres.test.js › déroulé : chapitre de 60 caractères au plus', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'projet-simple', 'deroule.json'), 'utf8'));
  d.scenes[0].chapitre = 'x'.repeat(61);
  assert.ok(validerDeroule(d).some((e) => /chapitre » doit être un titre de 60 caractères au plus/.test(e)));
  d.scenes[0].chapitre = 'Pourquoi 4 °C';
  assert.deepEqual(validerDeroule(d), []);
});

test('chapitres.test.js › ffprobe -show_chapters lit les débuts des scènes à une image près ; titre échappé relu tel quel', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.titre = 'La chaîne = froid ; #1'; d.scenes[0].chapitre = 'Pourquoi = 4 °C ; #'; d.scenes[1].chapitre = 'Le chiffre'; });
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.chapitresIntegres, true);
  const min = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).minutage;
  const lu = await chapitresLus(r.fichier);
  assert.equal(lu.titre, 'La chaîne = froid ; #1');
  assert.deepEqual(lu.chapitres.map((c) => c.titre), ['Pourquoi = 4 °C ; #', 'Le chiffre']);
  min.scenes.forEach((s, i) => assert.ok(Math.abs(lu.chapitres[i].debut - (i ? s.debut : 0)) <= 1 / 10 + 1e-6, `${s.id} : ${lu.chapitres[i].debut} au lieu de ${s.debut}`));
  // Fichiers texte joints, alerte des 3 chapitres dans le résultat, chapitres vérifiés par l'export.
  assert.deepEqual(r.fichiers.chapitres, ['sortie/la-chaine-froid-1-chapitres.txt', 'sortie/la-chaine-froid-1-chapitres.vtt']);
  assert.match(fs.readFileSync(path.join(dir, r.fichiers.chapitres[0]), 'utf8'), /^0:00 Pourquoi = 4 °C ; #\n0:0\d Le chiffre\n$/);
  assert.deepEqual(r.alertes.filter((a) => /3\.$/.test(a)), ['Il y a 2 chapitres : YouTube ne les affiche qu\'à partir de 3.']);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8')).faites.includes('chapitres'));
  // Le courriel ne joint pas les chapitres (usages.json) : aucun intégré.
  const c = await exporterFidele({ dossier: dir, pour: 'courriel', ips: 10, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1 });
  assert.equal(c.ok, true, c.message);
  assert.equal(c.chapitresIntegres, false);
  assert.equal((await chapitresLus(c.fichier)).chapitres.length, 0);
});

test('chapitres.test.js › voie navigateur : txt et vtt écrits, chapitresIntegres faux', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[1].chapitre = 'Le chiffre'; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, ips: 10, qualite: '720p' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.chapitresIntegres, false);
  assert.deepEqual(r.fichiers.chapitres, ['sortie/la-chaine-du-froid-chapitres.txt', 'sortie/la-chaine-du-froid-chapitres.vtt']);
  assert.equal(fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid-chapitres.txt'), 'utf8').split('\n')[0], '0:00 La chaîne du froid');
  assert.match(fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid-chapitres.vtt'), 'utf8'), /^WEBVTT\n/);
  assert.equal(r.fichiers.credits, 'sortie/la-chaine-du-froid-credits.txt');
});
