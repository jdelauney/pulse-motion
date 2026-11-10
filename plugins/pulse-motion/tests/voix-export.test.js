'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo } = require('../scripts/exporter.js');
const V = require('../scripts/lib/voix.js');
const F = require('../scripts/lib/ffmpeg.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');

async function projetProvisoire() {
  const dir = copierProjet('projet-simple');
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: new Uint8Array(wavSinus({ secondes: 1 })), texte: 'Bonjour', provisoire: true });
  modifierDeroule(dir, (d) => { d.voix = { provisoire: true }; d.scenes[0].voix = { texte: 'Bonjour' }; });
  return dir;
}

test('scenesProvisoires : les scènes qui jouent la voix du système', async () => {
  const dir = await projetProvisoire();
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  assert.deepEqual(V.scenesProvisoires(dir, d), ['intro']);
});

test('export dans le navigateur : refusé avec la voix provisoire', async () => {
  const r = await exporterVideo({ dossier: await projetProvisoire(), dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.message, /voix provisoire \(scènes : intro\).*version de travail/);
  assert.doesNotMatch(r.message, /--avec-provisoire/);
});

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
test('export fidèle : refusé, puis accepté avec avecProvisoire', { skip: (!navigateur && 'Chrome absent') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') }, async () => {
  const dir = await projetProvisoire();
  const options = { dossier: dir, qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1 };
  const refus = await exporterFidele(options);
  assert.equal(refus.ok, false);
  assert.match(refus.message, /voix provisoire/);
  const r = await exporterFidele({ ...options, avecProvisoire: true });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, true);
});

// --- Spec Retouches et ergonomie (S4) 5.17 : un accord par version, une version de travail nommée --------------------

test('etat : accord voix provisoire tombe quand une prise provisoire change', async () => {
  const { donnerAccord, etatProjet } = require('../scripts/etat.js');
  const dir = await projetProvisoire();
  assert.equal(etatProjet(dir).accords.voixProvisoire, false);
  assert.equal(donnerAccord(dir, 'voix-provisoire').accords.voixProvisoire, true);
  // L'accord est gardé avec l'empreinte des prises, pas un simple « oui ».
  const memo = JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'etat.json'), 'utf8'));
  assert.match(memo.accords['voix-provisoire'], /^[0-9a-f]{32}$/);
  assert.equal(etatProjet(dir).accords.voixProvisoire, true);
  // Une prise provisoire refaite : l'accord tombe.
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: new Uint8Array(wavSinus({ secondes: 1.5 })), texte: 'Bonjour à tous', provisoire: true });
  assert.equal(etatProjet(dir).accords.voixProvisoire, false);
  // Sans voix provisoire : rien à accorder.
  assert.throws(() => donnerAccord(copierProjet('projet-simple'), 'voix-provisoire'), /pas de voix provisoire/);
});

test('exporter : version de travail nommée à part, le MP4 définitif intact', { skip: (!navigateur && 'Chrome absent') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') }, async () => {
  assert.equal(V.nomVersionDeTravail('la-chaine-du-froid.mp4'), 'la-chaine-du-froid-version-de-travail.mp4');
  assert.equal(V.nomVersionDeTravail('la-chaine-du-froid-reseaux.mp4'), 'la-chaine-du-froid-reseaux-version-de-travail.mp4');
  const dir = await projetProvisoire();
  const definitif = path.join(dir, 'sortie', 'la-chaine-du-froid.mp4');
  fs.mkdirSync(path.dirname(definitif), { recursive: true });
  fs.writeFileSync(definitif, 'définitif');
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1, avecProvisoire: true });
  assert.equal(r.ok, true, r.message);
  assert.equal(path.basename(r.fichier), 'la-chaine-du-froid-version-de-travail.mp4');
  assert.equal(r.versionDeTravail, true);
  assert.equal(fs.readFileSync(definitif, 'utf8'), 'définitif');
  // La voie du navigateur reçoit le même nom (réglages résolus par l'aperçu).
  const { demarrerApercu } = require('../scripts/apercu.js');
  const apercu = await demarrerApercu({ dossier: dir, dossierStyles: STYLES, port: 47811 });
  try {
    const u = await (await fetch(`${apercu.url}_pm/usage`)).json();
    assert.equal(u.nomFichier, 'la-chaine-du-froid-version-de-travail.mp4');
    assert.equal(u.versionDeTravail, true);
    assert.equal(u.couverture, false);
  } finally { await apercu.fermer(); }
});

test('export-ui : choix proposé au lieu d\'un refus', { skip: !navigateur && 'Chrome absent', timeout: 120000 }, async () => {
  const { demarrerApercu } = require('../scripts/apercu.js');
  const { ouvrirPage } = require('../scripts/lib/cdp.js');
  const dir = await projetProvisoire();
  const apercu = await demarrerApercu({ dossier: dir, dossierStyles: STYLES, port: 47812 });
  let page = null;
  try {
    page = await ouvrirPage({ navigateur, largeur: 1000, hauteur: 600, delai: 120000 });
    await page.aller(apercu.url);
    await page.evaluer('M.pret.then(function () { return document.fonts.ready; }).then(function () { return import("/_pm/export-ui.mjs"); }).then(function (m) { m.lancerExport(); return new Promise(function (r) { setTimeout(r, 300); }); })');
    const choix = await page.evaluer(`(function () {
      var p = document.getElementById('pm-export');
      return p ? { titre: p.querySelector('.pm-export-titre').textContent, boutons: Array.from(p.querySelectorAll('button')).map(function (b) { return b.textContent; }) } : null;
    })()`);
    assert.deepEqual(choix.boutons, ['Enregistrer ma voix d\'abord (Recommandé)', 'Exporter une version de travail']);
    assert.match(choix.titre, /voix de l'ordinateur/);
    assert.doesNotMatch(choix.titre, /impossible/i);
  } finally {
    if (page) await page.fermer();
    await apercu.fermer();
  }
});

test('plugin : exporter ne redemande pas l\'accord tant qu\'il vaut', () => {
  const e = fs.readFileSync(path.join(__dirname, '..', 'skills', 'exporter', 'SKILL.md'), 'utf8');
  assert.match(e, /si `accords\.voixProvisoire` de l'état est vrai, ne pas redemander/);
  assert.match(e, /`pulse-motion etat \. --accord voix-provisoire`, puis `--avec-provisoire`/);
  assert.match(e, /`sortie\/<titre>-version-de-travail\.mp4`/);
  // La commande d'export elle-même reprend l'accord gardé.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'exporter.js'), 'utf8'), /accords\.voixProvisoire/);
});
