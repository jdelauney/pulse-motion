'use strict';
/* Corrections de la revue du plan Audio-2 (voix). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { importerVoix } = require('../scripts/voix.js');
const { assembler } = require('../scripts/assembler.js');
const { exporterVideo } = require('../scripts/exporter.js');
const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const V = require('../scripts/lib/voix.js');
const F = require('../scripts/lib/ffmpeg.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { ouvrirPageSon } = require('./aide/page-son.js');

const outil = F.trouverFfmpeg();
const navigateur = trouverNavigateur();
const avecTexte = (dir) => modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; });

test('revue : WAV 24 bits avec ffmpeg : importé (converti en 16 bits)', { skip: !(outil.present && outil.versionOk) && 'ffmpeg absent' }, async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const source = path.join(dossierTemporaire('pm-voix-'), 'studio.wav');
  require('node:child_process').execFileSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-c:a', 'pcm_s24le', source]);
  const r = await importerVoix({ dossier: dir, fichier: source, scene: 'intro', outil });
  assert.equal(r.ok, true, r.message);
});

test('revue : WAV 24 bits sans ffmpeg : message qui dit quoi faire, aucune copie d\'historique', async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const octets = Buffer.from(wavSinus({ secondes: 1 }));
  octets.writeUInt16LE(24, 34);
  const source = path.join(dossierTemporaire('pm-voix-'), 'studio.wav');
  fs.writeFileSync(source, octets);
  const r = await importerVoix({ dossier: dir, fichier: source, scene: 'intro', outil: { present: false } });
  assert.equal(r.ok, false);
  assert.match(r.message, /installez ffmpeg.*WAV 16 bits/);
  assert.equal(fs.existsSync(path.join(dir, '.historique')), false);
});

test('revue : voix.fichier hors du projet ou non WAV : erreur voix-illisible qui renvoie vers « voix importer »', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Bonjour', fichier: '../hors.wav' }; d.scenes[1].voix = { texte: 'Salut', fichier: 'assets/v.mp3' }; });
  fs.writeFileSync(path.join(dir, 'assets', 'v.mp3'), 'mp3');
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const erreurs = r.erreurs.filter((e) => e.regle === 'voix-illisible');
  assert.equal(erreurs.length, 2, JSON.stringify(r.erreurs));
  assert.match(erreurs[0].message, /dans le dossier du projet.*pulse-motion voix importer/);
  assert.match(erreurs[1].message, /pulse-motion voix importer/);
});

test('revue : une information (gravité info) n\'ouvre pas le bandeau d\'erreur de la page', { skip: !navigateur && 'Chrome absent' }, async () => {
  const page = await ouvrirPageSon({ dir: copierProjet('projet-simple'), navigateur, prelude: 'window.__PM_ERREURS__ = [{ "regle": "calage-approche", "gravite": "info", "message": "mots approchés" }];' });
  try {
    assert.equal(await page.evaluer('document.getElementById("pm-bandeau").hidden'), true);
  } finally {
    await page.fermer();
  }
});

test('revue : calage-approche renvoie vers pulse-motion whisper (la commande existe)', async () => {
  const dir = copierProjet('projet-simple');
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: new Uint8Array(wavSinus({ secondes: 1 })), texte: 'Bonjour' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Bonjour', fichier: 'assets/voix/intro.wav' }; });
  const info = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).erreurs.find((e) => e.regle === 'calage-approche');
  assert.match(info.message, /pulse-motion whisper/);
  assert.ok(require('../scripts/pm.js') && fs.existsSync(path.join(__dirname, '..', 'scripts', 'whisper.js')));
});

async function projetProvisoire() {
  const dir = copierProjet('projet-simple');
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: new Uint8Array(wavSinus({ secondes: 1 })), texte: 'Bonjour', provisoire: true });
  modifierDeroule(dir, (d) => { d.voix = { provisoire: true }; d.scenes[0].voix = { texte: 'Bonjour' }; });
  return dir;
}

test('revue : bouton MP4 de l\'aperçu : la voix provisoire est refusée (message dans le suivi)', { skip: !navigateur && 'Chrome absent' }, async () => {
  const dir = await projetProvisoire();
  const apercu = await demarrerApercu({ dossier: dir, dossierStyles: STYLES, port: 47331 });
  const page = await ouvrirPage({ navigateur, largeur: 800, hauteur: 450 });
  try {
    await page.aller(apercu.url);
    const r = await page.evaluer('M.pret.then(function () { return import("/_pm/export-ui.mjs"); }).then(function (m) { return m.lancerExport(); }).then(function () { return document.getElementById("pm-export").textContent; })');
    assert.match(r, /voix provisoire/);
    const suivi = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'export.json'), 'utf8'));
    assert.equal(suivi.etat, 'erreur');
    assert.match(suivi.message, /voix provisoire/);
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
});

test('revue : exporter avec avecProvisoire dans le navigateur : la page accepte (paramètre transmis)', { skip: !navigateur && 'Chrome absent' }, async () => {
  const r = await exporterVideo({ dossier: await projetProvisoire(), dossierStyles: STYLES, avecProvisoire: true });
  assert.equal(r.ok, true, r.message);
});
