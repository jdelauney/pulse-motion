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

// --- Spec Rendu et export (S5), 5.2 : couleurs étiquetées, concaténation sans réencodage ---------------------------------

test('ffmpeg-operations.test.js › segment encodé : ffprobe lit color_space, color_primaries et color_transfer bt709, color_range tv', sans, async () => {
  const dir = dossierTemporaire('pm-ff-');
  const sortie = path.join(dir, 'a.mp4');
  const derive = path.join(dir, 'b.mp4');
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie, ips: 30, reglages: { crf: 14, preset: 'medium', tune: 'animation', gop: 2, profil: 'high' },
    derive: { sortie: derive, reglages: { crf: 18, preset: 'medium', tune: 'animation', gop: 2, profil: 'high', debitMax: 8000, tampon: 16000 } },
    images: images(30, (k) => uni(29, 78, 216 - k)) });
  for (const f of [sortie, derive]) {
    const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: f });
    assert.deepEqual(s.couleurs, { espace: 'bt709', primaires: 'bt709', transfert: 'bt709', plage: 'tv' }, f);
    assert.equal(s.images, 30);
  }
  // Réencodé (dérivé sans recapture), réduit, ou en deux passes : mêmes étiquettes.
  const reduit = path.join(dir, 'c.mp4');
  await F.reencoderSegment({ ffmpeg: outil.chemin, entree: sortie, sortie: reduit, ips: 30, reglages: { crf: 20, gop: 2 }, taille: [32, 18] });
  const leger = path.join(dir, 'd.mp4');
  await F.transcoderDeuxPasses({ ffmpeg: outil.chemin, entree: sortie, sortie: leger, ips: 30, reglages: { debit: 200, gop: 2 }, journal: path.join(dir, 'passe') });
  for (const f of [reduit, leger]) assert.deepEqual((await F.sonder({ ffprobe: outil.cheminProbe, fichier: f })).couleurs, { espace: 'bt709', primaires: 'bt709', transfert: 'bt709', plage: 'tv' }, f);
  assert.deepEqual((await F.sonder({ ffprobe: outil.cheminProbe, fichier: reduit })).largeur, 32);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('passe')), [], 'journal des deux passes retiré');
});

test('ffmpeg-operations.test.js › deux segments concaténés : aucun avertissement de paramètres différents', sans, async () => {
  const { spawnSync } = require('node:child_process');
  const dir = dossierTemporaire('pm-ff-');
  const reglages = { crf: 18, preset: 'medium', tune: 'animation', gop: 1, profil: 'high', debitMax: 12000, tampon: 24000 };
  const a = path.join(dir, 'a.mp4');
  const b = path.join(dir, 'b.mp4');
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: a, ips: 30, reglages, images: images(30, () => uni(200, 40, 40)) });
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: b, ips: 30, reglages, images: images(15, () => uni(40, 200, 40)) });
  const liste = path.join(dir, 'liste.txt');
  fs.writeFileSync(liste, [a, b].map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
  const r = spawnSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', '-movflags', '+faststart', '-video_track_timescale', '90000', path.join(dir, 'tout.mp4')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.trim(), '', 'aucun avertissement');
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: path.join(dir, 'tout.mp4') });
  assert.equal(s.images, 45);
  assert.deepEqual(s.couleurs, { espace: 'bt709', primaires: 'bt709', transfert: 'bt709', plage: 'tv' });
  // Et par la fonction de l'export (son facultatif, sans réencodage).
  await F.assemblerSegments({ ffmpeg: outil.chemin, segments: [a, b], sortie: path.join(dir, 'export.mp4') });
  assert.equal((await F.sonder({ ffprobe: outil.cheminProbe, fichier: path.join(dir, 'export.mp4') })).images, 45);
});
