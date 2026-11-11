'use strict';
/* Vidéos de test fabriquées dans Chrome avec Mediabunny (déjà embarqué) : aucune dépendance, aucun fichier binaire livré.
 * fabriquerVideo({ navigateur, duree, ips, largeur, hauteur, immobile, son }) -> { octets, ext } (MP4 H.264, sinon WebM VP9).
 * Chaque image est différente (une barre qui avance et un damier qui change) sauf si immobile. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ouvrirPage } = require('../../scripts/lib/cdp.js');
const { servirAide } = require('../../scripts/lib/import.js');

async function fabriquerVideo({ navigateur, duree = 5, ips = 30, largeur = 320, hauteur = 180, immobile = false, son = false }) {
  const vide = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-video-')), 'vide.bin');
  fs.writeFileSync(vide, Buffer.alloc(1));
  const aide = await servirAide(vide, 'application/octet-stream');
  const page = await ouvrirPage({ navigateur, largeur: 400, hauteur: 300, delai: 180000 });
  try {
    await page.aller(aide.url);
    const r = await page.evaluer(`(async () => {
      const MB = await import('/_pm/vendor/mediabunny.min.mjs');
      const L = ${largeur}, H = ${hauteur}, n = Math.round(${duree} * ${ips});
      const avc = await MB.canEncodeVideo('avc', { width: L, height: H });
      const format = avc ? new MB.Mp4OutputFormat({ fastStart: 'in-memory' }) : new MB.WebMOutputFormat();
      const output = new MB.Output({ format, target: new MB.BufferTarget() });
      const c = new OffscreenCanvas(L, H); const x = c.getContext('2d');
      const source = new MB.CanvasSource(c, { codec: avc ? 'avc' : 'vp9', bitrate: 2e6, keyFrameInterval: 1 });
      output.addVideoTrack(source, { frameRate: ${ips} });
      let audio = null;
      if (${son ? 'true' : 'false'}) {
        const codec = avc ? 'aac' : 'opus';
        if (await MB.canEncodeAudio(codec)) { audio = new MB.AudioBufferSource({ codec, bitrate: 96000 }); output.addAudioTrack(audio); }
      }
      await output.start();
      for (let k = 0; k < n; k++) {
        x.fillStyle = '#f0f0f0'; x.fillRect(0, 0, L, H);
        const p = ${immobile ? '0' : 'k'};
        x.fillStyle = '#1d4ed8'; x.fillRect((p * 7) % L, 0, 24, H);
        for (let i = 0; i < 8; i++) { x.fillStyle = ((p >> i) & 1) ? '#111' : '#eee'; x.fillRect(i * (L / 8), H - 30, L / 8, 30); }
        await source.add(k / ${ips}, 1 / ${ips});
      }
      if (audio) {
        const taux = 48000, ctx = new OfflineAudioContext(1, Math.round(${duree} * taux), taux);
        const b = ctx.createBuffer(1, Math.round(${duree} * taux), taux); const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = 0.2 * Math.sin(i / 8);
        await audio.add(b);
      }
      await output.finalize();
      const octets = new Uint8Array(output.target.buffer);
      let s = ''; for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
      return { b64: btoa(s), ext: avc ? '.mp4' : '.webm', son: !!audio };
    })()`);
    return { octets: Buffer.from(r.b64, 'base64'), ext: r.ext, son: r.son };
  } finally {
    await page.fermer();
    await aide.fermer();
  }
}

module.exports = { fabriquerVideo };
