/* Pulse Motion – export MP4 dans le navigateur (WebCodecs + Mediabunny).
 *
 * Servi par l'aperçu (/_pm/export.mjs), jamais embarqué dans la page livrée.
 * Dépend du moteur (global M : seek, modeCapture, capturer, duree, ips, donnees).
 */
import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH,
  Input, BufferSource, ALL_FORMATS, CanvasSink, EncodedPacketSink, canEncodeVideo, canEncodeAudio,
} from '/_pm/vendor/mediabunny.min.mjs';

const M = globalThis.M;

/** Taille de l'image exportée selon le format du déroulé. */
export const TAILLES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const FONDU_ENTREE = 0.5;
const FONDU_SORTIE = 1.5;
const TAUX_AUDIO = 48000;

export function taille(ratio = M.donnees.format.ratio) {
  return TAILLES[ratio] || TAILLES['16:9'];
}

/** -> { video: bool, audio: bool } : ce que ce navigateur sait encoder. */
export async function verifierSupport(largeur, hauteur) {
  if (typeof VideoEncoder === 'undefined') return { video: false, audio: false };
  const video = await canEncodeVideo('avc', { width: largeur, height: hauteur, bitrate: 8e6 }).catch(() => false);
  const audio = typeof AudioEncoder !== 'undefined' && await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: TAUX_AUDIO, bitrate: 192e3 }).catch(() => false);
  return { video, audio };
}

/** Musique mixée hors temps réel : volume, fondu d'entrée 0,5 s, de sortie 1,5 s. -> AudioBuffer | null */
export async function preparerAudio(duree) {
  const element = document.getElementById('pm-musique');
  if (!element || !element.src) return null;
  const volume = M.donnees.musique && typeof M.donnees.musique.volume === 'number' ? M.donnees.musique.volume : 1;
  const donnees = await (await fetch(element.src)).arrayBuffer();
  const contexte = new OfflineAudioContext(2, Math.max(1, Math.ceil(duree * TAUX_AUDIO)), TAUX_AUDIO);
  const decode = await contexte.decodeAudioData(donnees);
  const source = contexte.createBufferSource();
  source.buffer = decode;
  const gain = contexte.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(volume, Math.min(FONDU_ENTREE, duree / 2));
  gain.gain.setValueAtTime(volume, Math.max(duree - FONDU_SORTIE, duree / 2));
  gain.gain.linearRampToValueAtTime(0, duree);
  source.connect(gain).connect(contexte.destination);
  source.start(0);
  return contexte.startRendering();
}

/** Force la scène à la taille exportée le temps de l'export. -> fonction de remise en état */
function preparerScene(largeur, hauteur) {
  const scene = document.getElementById('pm-scene');
  const avant = scene.getAttribute('style');
  document.documentElement.classList.add('pm-export');
  scene.style.cssText += `;flex:none;width:${largeur}px !important;height:${hauteur}px;max-width:none;`;
  return () => {
    document.documentElement.classList.remove('pm-export');
    if (avant === null) scene.removeAttribute('style'); else scene.setAttribute('style', avant);
  };
}

/**
 * exporter({ surProgression?(n, total), signal? })
 * -> { buffer: ArrayBuffer, images, duree, largeur, hauteur, audio: bool }
 */
export async function exporter({ surProgression = () => {}, signal } = {}) {
  const [largeur, hauteur] = taille();
  const support = await verifierSupport(largeur, hauteur);
  if (!support.video) throw new Error('Ce navigateur ne sait pas encoder la vidéo (H.264) : ouvrez l\'aperçu dans Chrome ou Edge.');
  const ips = M.ips;
  const total = Math.round(M.duree * ips);
  const depart = M.temps();
  const audio = support.audio ? await preparerAudio(total / ips) : null;

  const canvas = new OffscreenCanvas(largeur, hauteur);
  const ctx = canvas.getContext('2d');
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: ips });
  let pisteAudio = null;
  if (audio) {
    pisteAudio = new AudioBufferSource({ codec: 'aac', bitrate: 192e3 });
    output.addAudioTrack(pisteAudio);
  }

  const remettre = preparerScene(largeur, hauteur);
  M.modeCapture(true);
  try {
    await output.start();
    if (pisteAudio) await pisteAudio.add(audio);
    for (let n = 0; n < total; n++) {
      if (signal && signal.aborted) throw new DOMException('Export annulé.', 'AbortError');
      await M.seek(n / ips);
      await M.capturer(ctx, largeur, hauteur);
      await video.add(n / ips, 1 / ips);
      surProgression(n + 1, total);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    M.modeCapture(false);
    remettre();
    M.rendre(depart);
  }
  return { buffer: output.target.buffer, images: total, duree: total / ips, largeur, hauteur, audio: !!audio };
}

function luminanceMoyenne(canvas) {
  const c = new OffscreenCanvas(64, 64);
  const x = c.getContext('2d');
  x.drawImage(canvas, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  let somme = 0;
  for (let i = 0; i < d.length; i += 4) somme += d[i] + d[i + 1] + d[i + 2];
  return somme / (d.length / 4) / 3;
}

/**
 * Relit le MP4 produit : durée, nombre d'images, première et dernière images non noires.
 * -> { ok, duree, images, premiereNoire, derniereNoire, erreurs: [message] }
 */
export async function relire(buffer, { images: attendues, ips }) {
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  const duree = await input.computeDuration();
  const piste = await input.getPrimaryVideoTrack();
  let images = 0;
  for await (const paquet of new EncodedPacketSink(piste).packets()) { if (paquet) images++; }
  const vignettes = new CanvasSink(piste, { width: 160, poolSize: 1 });
  const premiere = await vignettes.getCanvas(0);
  const premiereNoire = !premiere || luminanceMoyenne(premiere.canvas) < 8;
  const derniere = await vignettes.getCanvas(Math.max(0, duree - 1 / ips));
  const derniereNoire = !derniere || luminanceMoyenne(derniere.canvas) < 8;
  const erreurs = [];
  if (images !== attendues) erreurs.push(`${images} images au lieu de ${attendues}.`);
  if (Math.abs(duree - attendues / ips) > 1 / ips + 0.05) erreurs.push(`durée ${duree.toFixed(2)} s au lieu de ${(attendues / ips).toFixed(2)} s.`);
  if (premiereNoire) erreurs.push('la première image est noire.');
  if (derniereNoire) erreurs.push('la dernière image est noire.');
  return { ok: erreurs.length === 0, duree, images, premiereNoire, derniereNoire, erreurs };
}

/** Envoie le MP4 relu à l'aperçu, qui l'écrit dans sortie/. -> { fichier } */
export async function envoyer(buffer, relecture) {
  const reponse = await fetch('/_pm/export', {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4', 'X-PM-Relecture': encodeURIComponent(JSON.stringify(relecture)) },
    body: buffer,
  });
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(corps.message || `Enregistrement refusé (${reponse.status}).`);
  return corps;
}

/** Signale l'état de l'export à l'aperçu (suivi par la commande pulse-motion exporter). */
export function signaler(etat) {
  return fetch('/_pm/export-etat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(etat),
  }).catch(() => {});
}

/** Capture des images clés en PNG (planche du parcours accompagné). -> [{ nom, blob }] */
export async function capturerPlanche(scenes, { largeur = 1280 } = {}) {
  const [l, h] = taille();
  const hauteur = Math.round(largeur * h / l);
  const canvas = new OffscreenCanvas(l, h);
  const ctx = canvas.getContext('2d');
  const petit = new OffscreenCanvas(largeur, hauteur);
  const depart = M.temps();
  const remettre = preparerScene(l, h);
  const images = [];
  try {
    for (const id of scenes) {
      const i = M.minutage.scenes.findIndex((x) => x.id === id);
      if (i < 0) throw new Error(`Scène « ${id} » inconnue.`);
      // Instants pris hors des transitions : sinon la scène voisine apparaît dans l'image.
      const s = M.minutage.scenes[i];
      const suivante = M.minutage.scenes[i + 1];
      const debut = s.debut + s.entree;
      const fin = s.fin - (suivante ? suivante.entree : 0);
      for (const [k, part] of [0.35, 0.65, 0.95].entries()) {
        await M.seek(debut + (fin - debut) * part);
        await M.capturer(ctx, l, h);
        petit.getContext('2d').drawImage(canvas, 0, 0, largeur, hauteur);
        images.push({ nom: `${id}-${k + 1}`, blob: await petit.convertToBlob({ type: 'image/png' }) });
      }
    }
  } finally {
    remettre();
    M.rendre(depart);
  }
  return images;
}
