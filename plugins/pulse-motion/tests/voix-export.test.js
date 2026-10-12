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
  assert.match(r.message, /voix provisoire \(scènes : intro\).*--avec-provisoire/);
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
