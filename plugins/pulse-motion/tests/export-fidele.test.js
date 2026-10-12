'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterFidele } = require('../scripts/export-fidele.js');
const F = require('../scripts/lib/ffmpeg.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };
const exporter = (dir, options = {}) => exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, ...options });

test('export fidèle 720p : segments (7,25 s en 3 s), MP4 vérifié, suivi et dossier de travail retirés', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporter(dir);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'la-chaine-du-froid.mp4'));
  assert.deepEqual([r.largeur, r.hauteur, r.images, r.audio], [1280, 720, 73, false]);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.deepEqual([s.video, s.largeur, s.hauteur, s.images], ['h264', 1280, 720, 73]);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', '.export')), false);
  const suivi = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'export.json'), 'utf8'));
  assert.equal(suivi.etat, 'fini');
  assert.equal(suivi.mode, 'fidele');
});

test('interrompu après un segment : le segment fini est repris au second export ; page modifiée : rien n\'est repris', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r1 = await exporter(dir, { arreterApres: 1 });
  assert.equal(r1.ok, false);
  assert.match(r1.message, /annulé/);
  const travail = path.join(dir, 'sortie', '.export');
  assert.deepEqual(fs.readdirSync(travail).filter((f) => f.endsWith('.part')), []);
  assert.ok(fs.existsSync(path.join(travail, 'segment-00.mp4')));
  const r2 = await exporter(dir);
  assert.equal(r2.ok, true, r2.message);
  assert.equal(r2.segmentsRepris, 1);
  const r3 = await exporter(dir, { arreterApres: 1 });
  assert.equal(r3.ok, false);
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Autre titre'; });
  const r4 = await exporter(dir);
  assert.equal(r4.ok, true, r4.message);
  assert.equal(r4.segmentsRepris, 0);
});

test('vertical 9:16 en 720p : 720×1280', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.format.ratio = '9:16'; });
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual([r.largeur, r.hauteur], [720, 1280]);
});

test('sans ffmpeg utilisable : refus clair, rien d\'écrit', async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterFidele({ dossier: dir, navigateur: navigateur || 'absent', outil: { present: false, message: 'ffmpeg n\'est pas installé' }, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.message, /ffmpeg n'est pas installé/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', '.export')), false);
});

test('revue : segment gardé mais faux (images noires) : détecté à la reprise, refait ; jamais repris indéfiniment', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r1 = await exporter(dir, { arreterApres: 1 });
  assert.equal(r1.ok, false);
  const segment = path.join(dir, 'sortie', '.export', 'segment-00.mp4');
  const { pngRGBA } = require('./aide/png.js');
  const noir = pngRGBA(1280, 720, () => [0, 0, 0, 255]);
  async function* noires() { for (let k = 0; k < 30; k++) yield noir; }
  fs.rmSync(segment);
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: segment, ips: 10, crf: 21, images: noires() });
  const r2 = await exporter(dir);
  assert.equal(r2.ok, true, r2.message);
  assert.equal(r2.segmentsRepris, 0);
});

test('revue : vidéo finale ouverte ailleurs (fichier verrouillé) : message en français, segments gardés', { skip: sans.skip || (process.platform !== 'win32' && 'verrou propre à Windows') }, async () => {
  const dir = copierProjet('projet-simple');
  const final = path.join(dir, 'sortie', 'la-chaine-du-froid.mp4');
  fs.mkdirSync(path.dirname(final), { recursive: true });
  fs.writeFileSync(final, 'ancienne vidéo');
  const verrou = fs.openSync(final, 'r');
  try {
    const r = await exporter(dir, { ips: 5 });
    assert.equal(r.ok, false);
    assert.match(r.message, /fermez la vidéo/);
  } finally {
    fs.closeSync(verrou);
  }
  const r2 = await exporter(dir, { ips: 5 });
  assert.equal(r2.ok, true, r2.message);
  assert.ok(r2.segmentsRepris > 0);
});
