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
/** Son d'essai : son pur de 440 Hz, de la durée donnée, en WAV. */
function musique(dir, duree) {
  const f = path.join(dir, `musique-${duree}.wav`);
  execFileSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duree}`, f]);
  return f;
}

test('son : WAV -> AAC 48 kHz stéréo, à la durée exacte (plus long : coupé ; plus court : silence)', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const longue = path.join(dir, 'a.m4a');
  await F.encoderSon({ ffmpeg: outil.chemin, wav: musique(dir, 8), duree: 5, sortie: longue });
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: longue });
  assert.equal(s.audio, 'aac');
  assert.ok(Math.abs(s.dureeAudio - 5) < 0.05, String(s.dureeAudio));
  const courte = path.join(dir, 'b.m4a');
  await F.encoderSon({ ffmpeg: outil.chemin, wav: musique(dir, 2), duree: 5, sortie: courte });
  assert.ok(Math.abs((await F.sonder({ ffprobe: outil.cheminProbe, fichier: courte })).dureeAudio - 5) < 0.05);
});

test('son illisible : rejet « son illisible »', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const faux = path.join(dir, 'faux.wav');
  require('node:fs').writeFileSync(faux, 'pas du son');
  await assert.rejects(F.encoderSon({ ffmpeg: outil.chemin, wav: faux, duree: 3, sortie: path.join(dir, 'x.m4a') }), /son illisible/);
});

test('sonie mesurée par ebur128 : sinusoïde stéréo à −20 dBFS ≈ −20 LUFS', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const f = path.join(dir, 's.wav');
  execFileSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0.1*sin(2*PI*1000*t)|0.1*sin(2*PI*1000*t):s=48000:d=5', f]);
  const m = await F.mesurerSonie({ ffmpeg: outil.chemin, fichier: f });
  assert.ok(Math.abs(m.integree + 20) < 0.3, String(m.integree));
  assert.ok(m.crete < -19 && m.crete > -21, String(m.crete));
});

test('assemblage avec piste son : vidéo H.264 + AAC, même durée', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const seg = path.join(dir, 's.mp4');
  async function* images() { for (let k = 0; k < 60; k++) yield pngRGBA(64, 36, () => [k * 4, 0, 0, 255]); }
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: seg, ips: 30, crf: 21, images: images() });
  const son = path.join(dir, 'son.m4a');
  await F.encoderSon({ ffmpeg: outil.chemin, wav: musique(dir, 5), duree: 2, sortie: son });
  const fin = path.join(dir, 'fin.mp4');
  await F.assemblerSegments({ ffmpeg: outil.chemin, segments: [seg], sortie: fin, audio: son });
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: fin });
  assert.deepEqual([s.video, s.audio, s.images], ['h264', 'aac', 60]);
  assert.ok(Math.abs(s.dureeAudio - 2) < 0.05, String(s.dureeAudio));
});

// Les fondus sont faits par la page (mixage du moteur) : ffmpeg garde seulement la durée exacte.
test('revue : vidéo plus courte que 1,5 s, piste à la durée exacte', sans, async () => {
  const dir = dossierTemporaire('pm-son-');
  const piste = path.join(dir, 'c.m4a');
  await F.encoderSon({ ffmpeg: outil.chemin, wav: musique(dir, 3), duree: 0.7, sortie: piste });
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: piste });
  assert.ok(Math.abs(s.dureeAudio - 0.7) < 0.05, String(s.dureeAudio));
});
