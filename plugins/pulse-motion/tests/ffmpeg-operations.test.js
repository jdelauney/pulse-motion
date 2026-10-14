'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../scripts/lib/ffmpeg.js');
const { pngRGBA } = require('./aide/png.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const outil = F.trouverFfmpeg();
const sans = { skip: !(outil.present && outil.versionOk) && 'ffmpeg absent' };
const uni = (r, g, b, l = 64, h = 36) => pngRGBA(l, h, () => [r, g, b, 255]);
async function* images(n, fn) { for (let k = 0; k < n; k++) yield fn(k); }

test('segment : 30 PNG à 30 i/s donnent 1 s de H.264, à la bonne taille', sans, async () => {
  const dir = dossierTemporaire('pm-ff-');
  const sortie = path.join(dir, 'a.mp4');
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie, ips: 30, crf: 21, images: images(30, (k) => uni(k < 15 ? 255 : 0, 0, 0)) });
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: sortie });
  assert.equal(s.video, 'h264');
  assert.equal(s.audio, null);
  assert.deepEqual([s.largeur, s.hauteur, s.images], [64, 36, 30]);
  assert.ok(Math.abs(s.duree - 1) < 0.04, String(s.duree));
});

test('assemblage de deux segments sans réencodage ; image extraite et comparée', sans, async () => {
  const dir = dossierTemporaire('pm-ff-');
  const a = path.join(dir, 'a.mp4');
  const b = path.join(dir, 'b.mp4');
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: a, ips: 30, crf: 21, images: images(30, () => uni(255, 0, 0)) });
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: b, ips: 30, crf: 21, images: images(15, () => uni(0, 0, 255)) });
  const fin = path.join(dir, 'fin.mp4');
  await F.assemblerSegments({ ffmpeg: outil.chemin, segments: [a, b], sortie: fin });
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: fin });
  assert.equal(s.images, 45);
  const rouge = await F.extraireImage({ ffmpeg: outil.chemin, fichier: fin, t: 0.5 });
  const bleu = await F.extraireImage({ ffmpeg: outil.chemin, fichier: fin, t: 1.2 });
  assert.ok(F.ecartImages(rouge, uni(255, 0, 0)) < 0.02);
  assert.ok(F.ecartImages(bleu, uni(0, 0, 255)) < 0.02);
  assert.ok(F.ecartImages(bleu, uni(255, 0, 0)) > 0.3);
  assert.equal(F.ecartImages(uni(0, 0, 0, 10, 10), uni(0, 0, 0, 20, 10)), 1);
});

test("ecartImages : un motif décalé de plus d'un bloc compte ; un bruit de moyenne nulle se compense", () => {
  // 1920 × 1080 : blocs de 7 px. Bandes verticales de 24 px (64 / 192), décalées de 12 px ; bruit ±20 (graine fixe).
  const L = 1920;
  const H = 1080;
  const bande = (x) => (Math.floor(x / 24) % 2 ? 192 : 64);
  let graine = 12345;
  const alea = () => { graine = (Math.imul(graine, 1103515245) + 12345) >>> 0; return graine / 4294967296; };
  const motif = pngRGBA(L, H, (x) => { const v = bande(x); return [v, v, v, 255]; });
  const decale = pngRGBA(L, H, (x) => { const v = bande(x + 12); return [v, v, v, 255]; });
  const bruite = pngRGBA(L, H, (x) => { const v = bande(x); return [v + Math.round((alea() * 2 - 1) * 20), v + Math.round((alea() * 2 - 1) * 20), v + Math.round((alea() * 2 - 1) * 20), 255]; });
  const ecartDecale = F.ecartImages(motif, decale);
  const ecartBruit = F.ecartImages(motif, bruite);
  assert.ok(ecartDecale > 0.02, `motif décalé : ${ecartDecale}`);
  assert.ok(ecartBruit < 0.02, `bruit de moyenne nulle : ${ecartBruit}`);
});

test('segment annulé : ffmpeg arrêté, rejet « export annulé »', sans, async () => {
  const dir = dossierTemporaire('pm-ff-');
  const controle = new AbortController();
  async function* lentes() { for (let k = 0; k < 300; k++) { if (k === 5) controle.abort(); yield uni(0, 0, 0); await new Promise((r) => setTimeout(r, 5)); } }
  await assert.rejects(F.encoderSegment({ ffmpeg: outil.chemin, sortie: path.join(dir, 'x.mp4'), ips: 30, crf: 21, images: lentes(), signal: controle.signal }), /export annulé/);
});

test('ffmpeg en échec (image illisible) : rejet avec sa sortie d\'erreur', sans, async () => {
  const dir = dossierTemporaire('pm-ff-');
  await assert.rejects(F.encoderSegment({ ffmpeg: outil.chemin, sortie: path.join(dir, 'x.mp4'), ips: 30, crf: 21, images: images(3, () => Buffer.from('pas une image')) }), /ffmpeg/);
});

test('revue : capture qui échoue pendant un segment : rejet seulement après l\'arrêt de ffmpeg (fichier libre aussitôt)', sans, async () => {
  const dir = dossierTemporaire('pm-ff-');
  const sortie = path.join(dir, 'x.mp4');
  async function* cassees() { for (let k = 0; k < 40; k++) { if (k === 20) throw new Error('capture cassée'); yield uni(0, 0, 0); } }
  await assert.rejects(F.encoderSegment({ ffmpeg: outil.chemin, sortie, ips: 30, crf: 21, images: cassees() }), /capture cassée/);
  fs.rmSync(sortie, { force: true });
  assert.equal(fs.existsSync(sortie), false);
});
