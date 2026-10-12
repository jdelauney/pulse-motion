'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const F = require('../scripts/lib/ffmpeg.js');
const { pngRGBA } = require('./aide/png.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const outil = F.trouverFfmpeg();
const sans = { skip: !(outil.present && outil.versionOk) && 'ffmpeg absent' };
/** Musique d'essai : son pur de 440 Hz, de la durée donnée. */
function musique(dir, duree) {
  const f = path.join(dir, `musique-${duree}.wav`);
  execFileSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duree}`, f]);
  return f;
}

test('musique : piste AAC 48 kHz stéréo, coupée à la durée exacte ; plus courte : complétée par du silence', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const longue = path.join(dir, 'a.m4a');
  await F.mixerMusique({ ffmpeg: outil.chemin, musique: musique(dir, 8), volume: 0.6, duree: 5, sortie: longue });
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: longue });
  assert.equal(s.audio, 'aac');
  assert.ok(Math.abs(s.dureeAudio - 5) < 0.05, String(s.dureeAudio));
  const courte = path.join(dir, 'b.m4a');
  await F.mixerMusique({ ffmpeg: outil.chemin, musique: musique(dir, 2), duree: 5, sortie: courte });
  assert.ok(Math.abs((await F.sonder({ ffprobe: outil.cheminProbe, fichier: courte })).dureeAudio - 5) < 0.05);
});

test('musique illisible : rejet « musique illisible »', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const faux = path.join(dir, 'faux.mp3');
  require('node:fs').writeFileSync(faux, 'pas du son');
  await assert.rejects(F.mixerMusique({ ffmpeg: outil.chemin, musique: faux, duree: 3, sortie: path.join(dir, 'x.m4a') }), /musique illisible/);
});

test('assemblage avec piste son : vidéo H.264 + AAC, même durée', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const seg = path.join(dir, 's.mp4');
  async function* images() { for (let k = 0; k < 60; k++) yield pngRGBA(64, 36, () => [k * 4, 0, 0, 255]); }
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: seg, ips: 30, crf: 21, images: images() });
  const son = path.join(dir, 'son.m4a');
  await F.mixerMusique({ ffmpeg: outil.chemin, musique: musique(dir, 5), duree: 2, sortie: son });
  const fin = path.join(dir, 'fin.mp4');
  await F.assemblerSegments({ ffmpeg: outil.chemin, segments: [seg], sortie: fin, audio: son });
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: fin });
  assert.deepEqual([s.video, s.audio, s.images], ['h264', 'aac', 60]);
  assert.ok(Math.abs(s.dureeAudio - 2) < 0.05, String(s.dureeAudio));
});

test('revue : vidéo plus courte que 1,5 s, le fondu de sortie tient dans la durée (son à zéro à la fin)', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const piste = path.join(dir, 'c.m4a');
  await F.mixerMusique({ ffmpeg: outil.chemin, musique: musique(dir, 3), duree: 0.7, sortie: piste });
  // Niveau des 0,1 dernière seconde : quasi silencieux.
  const r = require('node:child_process').spawnSync(outil.chemin, ['-hide_banner', '-ss', '0.6', '-i', piste, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const max = Number((/max_volume: (-?[\d.]+) dB/.exec(r.stderr) || [])[1]);
  assert.ok(max < -20, `niveau final ${max} dB`);
});
