/* Pulse Motion – export MP4 dans le navigateur (WebCodecs + Mediabunny).
 *
 * Servi par l'aperçu (/_pm/export.mjs), jamais embarqué dans la page livrée.
 * Dépend du moteur (global M : seek, modeCapture, capturer, duree, ips, donnees).
 * Export par usage (spec Rendu et export, 5.1, 5.3, 5.7) : réglages résolus par l'aperçu (/_pm/usage, scripts/usages.json),
 * définition, images par seconde, débit, image clé, mode de débit, accélération ; taille visée tenue par une seule
 * reconversion (Conversion) si le fichier dépasse ; erreur de script d'une scène : arrêt avec la scène et l'instant (5.23).
 * Couleurs (5.2, décision 16, mesurée sur la mire le 2026-11-10) : un canevas confié tel quel à l'encodeur sort étiqueté
 * sRGB en pleine plage, et Chrome le relit jusqu'à ΔE00 2,6 de la page ; chaque image passe donc par une conversion maison
 * en I420 BT.709 plage limitée (versI420), étiquetée comme dans la voie fidèle.
 * Livrables (spec Rendu et export, 5.10, 5.12, 5.15) : couverture JPEG sans sous-titres et vignette intégrée
 * (setMetadataTags, coverFront), titre en métadonnée ; extrait d'une scène ou passage seul (images f0 à f1, tranche du son
 * avec fondus de 0,1 s) ; cadre de téléphone (scène 9:16 dessinée à l'échelle dans l'écran, moteur/cadres/telephone.js).
 * Rendu avancé (5.8, 5.14) : flou de mouvement (mêmes N que la voie fidèle, moteur/flou.js ; sous-images accumulées sur 16 bits)
 * et fond transparent « pour le web » (WebM VP9 à couche alpha, I420A BT.709) si l'encodeur du navigateur sait garder l'alpha.
 */
import '/_pm/cadres/telephone.js';
import {
  Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, VideoSampleSource, VideoSample, AudioBufferSource,
  Input, BufferSource, ALL_FORMATS, CanvasSink, EncodedPacketSink, Conversion, canEncodeVideo, canEncodeAudio,
} from '/_pm/vendor/mediabunny.min.mjs';

const M = globalThis.M;
/** Horloge réelle, prise au chargement : en mode capture, performance.now suit le temps de la vidéo. */
const horloge = performance.now.bind(performance);

/** Taille de l'image exportée selon la définition et le format du déroulé (les mêmes que la voie fidèle). */
export const DEFINITIONS = {
  '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] },
  '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:5': [720, 900] },
  '540p': { '16:9': [960, 540], '9:16': [540, 960], '1:1': [540, 540], '4:5': [540, 676] },
};
export const TAILLES = DEFINITIONS['1080p'];
const TAUX_AUDIO = 48000;
/** Réglages de l'usage web, si l'aperçu ne les donne pas (bouton d'une page ancienne). */
const WEB = { usage: 'web', definition: '1080p', ips: null, navigateur: { debit: 6000, gop: 2, mode: 'variable', latence: 'quality', acceleration: 'no-preference', codec: null, audio: 160 }, tailleMax: null };

export function taille(ratio = M.donnees.format.ratio, definition = '1080p') {
  const t = DEFINITIONS[definition] || DEFINITIONS['1080p'];
  return t[ratio] || t['16:9'];
}

/** Scène montrée à l'instant t (celle qui entre pendant une transition). */
function sceneA(t) {
  const scenes = (M.minutage && M.minutage.scenes) || [];
  let id = scenes.length ? scenes[0].id : null;
  for (const s of scenes) if (s.debut <= t + 1e-9) id = s.id;
  return id;
}

/** Erreur de script d'une scène (spec Rendu et export, 5.23), en français. */
function erreurDeScript(t) {
  const instant = String(Math.round(t * 10) / 10).replace('.', ',');
  return new Error(`La scène « ${sceneA(t)} » a une erreur de script vers ${instant} s : l'export s'arrête, rien n'est écrit.`);
}

/** -> { video: bool, audio: bool } : ce que ce navigateur sait encoder. */
export async function verifierSupport(largeur, hauteur, debit = 8e6) {
  if (typeof VideoEncoder === 'undefined') return { video: false, audio: false };
  const video = await canEncodeVideo('avc', { width: largeur, height: hauteur, bitrate: debit }).catch(() => false);
  const audio = typeof AudioEncoder !== 'undefined' && await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: TAUX_AUDIO, bitrate: 192e3 }).catch(() => false);
  return { video, audio };
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

/** Fond transparent (5.14) : l'encodeur VP9 du navigateur garde-t-il la couche alpha à cette taille ? */
export async function alphaPossible(largeur, hauteur, debit = 8e6) {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) return false;
  try {
    const r = await VideoEncoder.isConfigSupported({ codec: 'vp09.00.10.08', width: largeur, height: hauteur, bitrate: debit, alpha: 'keep' });
    return Boolean(r && r.supported);
  } catch { return false; }
}

/** Message d'un fond transparent impossible dans le navigateur (5.14, point 4). */
export const MESSAGE_ALPHA = 'La vidéo à fond transparent a besoin de ffmpeg sur cet ordinateur.';

/** Espace de couleurs des images confiées à l'encodeur : celui de la voie fidèle. */
const BT709 = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };

/**
 * Image RVBA (sRGB, alpha ignoré) -> I420 BT.709 plage limitée (Y 16–235, Cb et Cr 16–240 ; chrominance moyennée par
 * blocs de 2 × 2). largeur et hauteur paires. Coefficients de la recommandation UIT-R BT.709 (Kr 0,2126, Kb 0,0722).
 */
export function versI420(rgba, largeur, hauteur, sortie = new Uint8Array(largeur * hauteur * 1.5), alpha = false) {
  const Y = sortie;
  const U = largeur * hauteur;
  const V = U + (largeur * hauteur) / 4;
  const l2 = largeur / 2;
  for (let y = 0; y < hauteur; y += 2) {
    for (let x = 0; x < largeur; x += 2) {
      let r = 0; let v = 0; let b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y + dy) * largeur + x + dx) * 4;
          const R = rgba[i]; const G = rgba[i + 1]; const B = rgba[i + 2];
          Y[(y + dy) * largeur + x + dx] = Math.round(16 + (219 / 255) * (0.2126 * R + 0.7152 * G + 0.0722 * B));
          r += R; v += G; b += B;
        }
      }
      r /= 4; v /= 4; b /= 4;
      const k = (y / 2) * l2 + x / 2;
      sortie[U + k] = Math.round(128 + (224 / 255) * (-0.114572 * r - 0.385428 * v + 0.5 * b));
      sortie[V + k] = Math.round(128 + (224 / 255) * (0.5 * r - 0.454153 * v - 0.045847 * b));
    }
  }
  // I420A (fond transparent, 5.14) : plan alpha en pleine définition après les trois plans.
  if (alpha) { const A = largeur * hauteur * 1.5; for (let i = 0, j = 3; i < largeur * hauteur; i++, j += 4) sortie[A + i] = rgba[j]; }
  return sortie;
}

/** Réglages de l'encodeur vidéo (VideoSampleSource) d'un usage : débit, image clé, mode de débit, latence, accélération. */
function configVideo(n, debit) {
  return {
    codec: 'avc', bitrate: Math.max(1, Math.round(debit * 1000)), keyFrameInterval: n.gop || 2,
    bitrateMode: n.mode === 'constant' ? 'constant' : 'variable', latencyMode: n.latence === 'realtime' ? 'realtime' : 'quality',
    hardwareAcceleration: n.acceleration || 'no-preference', ...(n.codec ? { fullCodecString: n.codec } : {}),
  };
}

/** Taille visée (5.3, point 4) : une seule reconversion du tampon produit, au débit ramené à la taille, sans recapture. */
async function reconvertir(buffer, { debit, octetsMax, gop }) {
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const nouveau = Math.max(50, Math.floor(debit * (octetsMax / buffer.byteLength) * 0.95));
  const conversion = await Conversion.init({ input, output, video: { codec: 'avc', bitrate: nouveau * 1000, keyFrameInterval: gop || 2, forceTranscode: true } });
  if (!conversion.isValid) throw new Error('La version légère n\'a pas pu être recompressée dans ce navigateur.');
  await conversion.execute();
  return { buffer: output.target.buffer, debit: nouveau };
}

/**
 * exporter({ surProgression?(n, total), signal?, reglages? })
 * reglages : ceux de l'aperçu (/_pm/usage) : { usage, definition, ips, navigateur: { debit, gop, mode, latence, acceleration,
 * codec, audio }, tailleMax } ; sans eux, l'usage web.
 * -> { buffer: ArrayBuffer, images, duree, largeur, hauteur, audio: bool, avertissement?, fondSombre: bool, usage,
 *      definition, ips, imagesParSeconde, finalesParSeconde, reprises }
 */
/** Tranche [debut, fin) d'un AudioBuffer, avec des fondus de fondu secondes aux bords (extrait, 5.12). */
function trancheSon(buffer, debut, fin, fondu = 0.1) {
  const taux = buffer.sampleRate;
  const a = Math.max(0, Math.round(debut * taux));
  const longueur = Math.max(1, Math.round((fin - debut) * taux));
  const sortie = new AudioBuffer({ length: longueur, numberOfChannels: buffer.numberOfChannels, sampleRate: taux });
  const f = Math.max(1, Math.round(fondu * taux));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = sortie.getChannelData(c);
    for (let i = 0; i < longueur; i++) {
      const v = a + i < src.length ? src[a + i] : 0;
      dst[i] = v * Math.min(1, i / f, (longueur - 1 - i) / f);
    }
  }
  return sortie;
}

/** Couverture (5.10) : image de l'instant t, sous-titres masqués, en JPEG 0,9 ; vignette de 1 280 px et 200 Ko au plus. */
async function prendreCouverture(t, largeur, hauteur) {
  const st = document.getElementById('pm-sous-titres');
  if (st) st.classList.add('pm-sans-sous-titres');
  const toile = new OffscreenCanvas(largeur, hauteur);
  try {
    await M.seek(t);
    await M.capturer(toile.getContext('2d'), largeur, hauteur);
  } finally {
    if (st) st.classList.remove('pm-sans-sous-titres');
  }
  const couverture = await toile.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  const k = Math.min(1, 1280 / Math.max(largeur, hauteur));
  const petite = new OffscreenCanvas(Math.round(largeur * k / 2) * 2, Math.round(hauteur * k / 2) * 2);
  const c = petite.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(toile, 0, 0, petite.width, petite.height);
  let vignette = null;
  for (const q of [0.85, 0.75, 0.6, 0.45, 0.3]) {
    vignette = await petite.convertToBlob({ type: 'image/jpeg', quality: q });
    if (vignette.size <= 200000) break;
  }
  return { couverture, vignette: new Uint8Array(await vignette.arrayBuffer()) };
}

/** Cadre de téléphone (5.15) : géométrie et cadre dessiné une fois (SVG -> image), au fond de la charte. */
async function preparerCadre(largeur, hauteur) {
  const T = M.cadreTelephone;
  const g = T.geometrie({ sortie: [largeur, hauteur], scene: [1080, 1920] });
  const fond = getComputedStyle(document.getElementById('pm-scene')).backgroundColor;
  const image = await createImageBitmap(new Blob([T.svg(g, { fond })], { type: 'image/svg+xml' }));
  return { g, image };
}

export async function exporter({ surProgression = () => {}, signal, reglages = WEB } = {}) {
  const r = { ...WEB, ...(reglages || {}), navigateur: { ...WEB.navigateur, ...((reglages && reglages.navigateur) || {}) } };
  const sortie = r.sortie || {};
  const transparent = sortie.transparent === 'webm';
  if (sortie.transparent && !transparent) throw new Error(MESSAGE_ALPHA);
  const cadre = sortie.cadre === 'telephone' && M.cadreTelephone ? sortie : null;
  // Cadre : la sortie a la taille du cadre ; la scène est capturée en 9:16 à sa propre définition.
  const [largeurScene, hauteurScene] = taille(M.donnees.format.ratio, r.definition);
  const facteur = { '1080p': 1, '720p': 2 / 3, '540p': 0.5 }[r.definition] || 1;
  const [largeur, hauteur] = cadre ? M.cadreTelephone.FORMATS[cadre.cadreFormat || '16:9'].map((x) => Math.round((x * facteur) / 2) * 2) : [largeurScene, hauteurScene];
  const n = { ...r.navigateur };
  const support = await verifierSupport(largeur, hauteur, n.debit * 1000);
  // Encodeur de la carte graphique demandé (brouillon) mais absent : l'encodeur du navigateur, sans le dire (5.7).
  if (n.acceleration === 'prefer-hardware' && !(await canEncodeVideo('avc', { width: largeur, height: hauteur, bitrate: n.debit * 1000, hardwareAcceleration: 'prefer-hardware' }).catch(() => false))) {
    n.acceleration = 'no-preference';
  }
  if (!support.video) throw new Error('Ce navigateur ne sait pas encoder la vidéo (H.264) : ouvrez l\'aperçu dans Chrome ou Edge.');
  if (transparent && !(await alphaPossible(largeur, hauteur, n.debit * 1000))) throw new Error(MESSAGE_ALPHA);
  if (M.particules) await M.particules.verifierExport();
  // --qualite et --ips priment (résolus par l'aperçu) ; sinon les images par seconde du déroulé.
  const ips = r.ips || M.ips;
  const toutes = Math.round(M.duree * ips);
  // Extrait (5.12) : images [f0, f1) résolues par l'aperçu ; sinon toute la vidéo.
  const f0 = sortie.extrait ? Math.max(0, Math.min(toutes, sortie.f0 | 0)) : 0;
  const f1 = sortie.extrait ? Math.max(f0 + 1, Math.min(toutes, sortie.f1 | 0)) : toutes;
  const total = f1 - f0;
  const depart = M.temps();
  // Le son est le mixage de la page (le même que la lecture) ; illisible ou navigateur sans AAC : vidéo muette.
  let audio = null;
  let avertissement;
  if (M.aSon()) {
    if (!support.audio) avertissement = 'Ce navigateur ne sait pas encoder le son : vidéo exportée sans son.';
    else {
      try {
        const son = await M.rendreSon();
        audio = son.buffer && sortie.extrait ? trancheSon(son.buffer, f0 / ips, f1 / ips) : son.buffer;
        if (son.avertissements.length) avertissement = son.avertissements.join(' ');
      } catch {
        avertissement = 'Le son n\'a pas pu être préparé : vidéo exportée sans son.';
      }
    }
  }
  const fondSombre = luminanceCouleur(getComputedStyle(document.getElementById('pm-scene')).backgroundColor) < 24;

  const canvas = new OffscreenCanvas(largeur, hauteur);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Cadre : la scène est capturée dans une toile de travail, puis dessinée à l'échelle sur le cadre.
  const decor = cadre ? await preparerCadre(largeur, hauteur) : null;
  const travail = decor ? new OffscreenCanvas(largeurScene, hauteurScene) : null;
  const output = new Output({ format: transparent ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  // Couverture et vignette intégrée (5.10) : avant start(), comme l'exige setMetadataTags ; titre de la vidéo en métadonnée.
  let couverture = null;
  const tags = { title: M.donnees.titre || '' };
  if (r.couverture && !sortie.extrait && !cadre && !transparent) {
    const remettreCouv = preparerScene(largeurScene, hauteurScene);
    M.modeCapture(true);
    try {
      const c = await prendreCouverture(M.instantCouverture(M.minutage, M.donnees.couverture), largeurScene, hauteurScene);
      couverture = c.couverture;
      tags.images = [{ data: c.vignette, mimeType: 'image/jpeg', kind: 'coverFront' }];
    } finally {
      M.modeCapture(false);
      remettreCouv();
    }
  }
  output.setMetadataTags(tags);
  const video = new VideoSampleSource(transparent ? { codec: 'vp9', bitrate: Math.max(1, Math.round(n.debit * 1000)), keyFrameInterval: n.gop || 2, alpha: 'keep' } : configVideo(n, n.debit));
  const i420 = new Uint8Array(largeur * hauteur * (transparent ? 2.5 : 1.5));
  output.addVideoTrack(video, { frameRate: ips });
  let pisteAudio = null;
  if (audio) {
    pisteAudio = new AudioBufferSource({ codec: transparent ? 'opus' : 'aac', bitrate: (n.audio || 160) * 1000 });
    // Langue de la vidéo (spec S9, 5.1) : piste son étiquetée (ISO 639-2/T) quand le déroulé la déclare.
    const langue = M.donnees.langue && M.langues ? M.langues.de(M.donnees.langue).iso6392 : null;
    output.addAudioTrack(pisteAudio, langue ? { languageCode: langue } : undefined);
  }

  // Erreur de script d'une scène pendant l'export (5.23, point 2) : relevée, puis l'export s'arrête à l'image suivante.
  let erreurScript = null;
  // « ResizeObserver loop… » : avertissement du navigateur quand la scène change de taille, jamais une erreur de la vidéo.
  const surErreur = (e) => { if (!/ResizeObserver/.test(String((e && (e.message || (e.reason && e.reason.message))) || ''))) erreurScript = true; };
  window.addEventListener('error', surErreur);
  window.addEventListener('unhandledrejection', surErreur);
  const remettre = preparerScene(largeurScene, hauteurScene);
  if (transparent) document.documentElement.classList.add('pm-transparent');
  const stats = creerStats(largeur, hauteur);
  M.modeCapture(true);
  // Flou de mouvement (5.8) : N de chaque image par la même fonction que la voie fidèle (boîtes en pixels de la sortie).
  const boite = document.getElementById('pm-scene').getBoundingClientRect();
  const echelle = boite.width > 0 ? largeurScene / boite.width : 1;
  const ns = r.flou && !transparent && M.flou ? M.flou.nParImage(Array.from({ length: total }, (_, k) => f0 + k), ips, echelle) : null;
  const somme = ns && ns.some((x) => x > 1) ? new Uint16Array(largeur * hauteur * 4) : null;
  let imagesFloues = 0;
  /** Image de l'instant t dans ctx (cadre compris). */
  const dessinerA = async (t) => {
    try {
      await M.seek(t);
    } catch (e) {
      throw erreurDeScript(t);
    }
    if (decor) {
      await M.capturer(travail.getContext('2d'), largeurScene, hauteurScene);
      const e = decor.g.ecran;
      ctx.drawImage(decor.image, 0, 0, largeur, hauteur);
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(e.x, e.y, e.largeur, e.hauteur, e.rayon); else ctx.rect(e.x, e.y, e.largeur, e.hauteur);
      ctx.clip();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(travail, e.x, e.y, e.largeur, e.hauteur);
      ctx.restore();
    } else await M.capturer(ctx, largeur, hauteur);
    if (erreurScript) throw erreurDeScript(t);
  };
  const debut = horloge();
  let finImages = debut;
  try {
    await output.start();
    if (pisteAudio) await pisteAudio.add(audio);
    for (let k = 0; k < total; k++) {
      if (signal && signal.aborted) throw new DOMException('Export annulé.', 'AbortError');
      const N = ns ? ns[k] : 1;
      if (N === 1) await dessinerA((f0 + k) / ips);
      else {
        // Sous-images accumulées sur 16 bits, moyenne arrondie posée dans la toile encodée.
        somme.fill(0);
        for (const tk of M.flou.instants(f0 + k, ips, N, { duree: M.duree, scenes: M.minutage.scenes })) {
          await dessinerA(tk);
          const d = ctx.getImageData(0, 0, largeur, hauteur).data;
          for (let i = 0; i < d.length; i++) somme[i] += d[i];
        }
        const moyenne = ctx.createImageData(largeur, hauteur);
        const demi = N >> 1;
        for (let i = 0; i < somme.length; i++) moyenne.data[i] = ((somme[i] + demi) / N) | 0;
        ctx.putImageData(moyenne, 0, 0);
        imagesFloues++;
      }
      versI420(ctx.getImageData(0, 0, largeur, hauteur).data, largeur, hauteur, i420, transparent);
      const image = new VideoSample(i420, { format: transparent ? 'I420A' : 'I420', codedWidth: largeur, codedHeight: hauteur, timestamp: k / ips, duration: 1 / ips, colorSpace: BT709 });
      try { await video.add(image); } finally { image.close(); }
      stats.ajouter(canvas);
      surProgression(k + 1, total);
    }
    finImages = horloge();
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    window.removeEventListener('error', surErreur);
    window.removeEventListener('unhandledrejection', surErreur);
    M.modeCapture(false);
    document.documentElement.classList.remove('pm-transparent');
    remettre();
    M.rendre(depart);
  }
  let buffer = output.target.buffer;
  let reprises = 0;
  // Taille visée : au-dessus, une seule reconversion ; encore au-dessus, échec sans fichier (5.3, points 4 et 5).
  if (r.tailleMax && buffer.byteLength > r.tailleMax) {
    reprises = 1;
    buffer = (await reconvertir(buffer, { debit: n.debit, octetsMax: r.tailleMax, gop: n.gop })).buffer;
    if (buffer.byteLength > r.tailleMax) {
      const mo = (x) => String(Math.round((x / 1e6) * 10) / 10).replace('.', ',');
      throw new Error(`La version courriel fait ${mo(buffer.byteLength)} Mo, au-dessus des ${mo(r.tailleMax)} Mo demandés : je peux viser ${Math.ceil((buffer.byteLength / 1e6) * 1.1)} Mo, ou exporter une seule scène.`);
    }
  }
  const secondes = Math.max(0.001, (finImages - debut) / 1000);
  const finales = Math.max(0, (horloge() - finImages) / 1000);
  return {
    buffer, images: total, duree: total / ips, largeur, hauteur, audio: !!audio, avertissement, fondSombre, stats: sortie.extrait ? null : stats.finir(),
    usage: r.usage, definition: r.definition, ips, reprises, couverture, vignette: Boolean(tags.images), extrait: Boolean(sortie.extrait), transparent,
    flou: { applique: Boolean(ns), sousImages: ns ? Math.max(1, ...ns) : 1, imagesFloues },
    imagesParSeconde: Math.round((total / secondes) * 10) / 10, finalesParSeconde: Math.round((finales / (total / ips)) * 1000) / 1000,
  };
}

/** Largeur des vignettes en gris (la même que la voie fidèle, scripts/lib/ffmpeg.js LARGEUR_STATS). */
export const LARGEUR_STATS = 192;

/**
 * Statistiques image par image de la voie navigateur (spec S2, 5.12), au même format que scripts/lib/series.js (statsSerie) :
 * chaque image dessinée dans une toile de 192 px, en gris (luma 601), moyenne, écart-type, d(n), saut s(n) ; seules les deux
 * images précédentes sont gardées (une vidéo longue ne pèse rien de plus), et les deux premières et dernières (bords).
 */
export function creerStats(largeur, hauteur) {
  const l = LARGEUR_STATS;
  const h = Math.max(2, Math.round(l * hauteur / largeur / 2) * 2);
  const toile = new OffscreenCanvas(l, h);
  const c = toile.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingQuality = 'high';
  const m = [];
  const e = [];
  const d = [];
  const s = [];
  const premieres = [];
  let avant = null;
  let avantAvant = null;
  const r2 = (x) => Math.round(x * 100) / 100;
  const ecart = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
  const b64 = (g) => { let t = ''; for (let i = 0; i < g.length; i += 0x8000) t += String.fromCharCode.apply(null, g.subarray(i, i + 0x8000)); return btoa(t); };
  return {
    ajouter(source) {
      c.drawImage(source, 0, 0, l, h);
      const px = c.getImageData(0, 0, l, h).data;
      const g = new Uint8Array(l * h);
      let somme = 0;
      let carres = 0;
      for (let i = 0, j = 0; j < g.length; i += 4, j++) {
        const v = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
        g[j] = v; somme += v; carres += v * v;
      }
      const moy = somme / g.length;
      m.push(r2(moy));
      e.push(r2(Math.sqrt(Math.max(0, carres / g.length - moy * moy))));
      d.push(avant ? r2(ecart(g, avant)) : null);
      if (s.length) s[s.length - 1] = avantAvant ? r2(ecart(g, avantAvant)) : null;
      s.push(null);
      if (premieres.length < 2) premieres.push(g);
      avantAvant = avant;
      avant = g;
    },
    finir() {
      const dernieres = [avantAvant, avant].filter(Boolean);
      return { version: 1, largeur: l, hauteur: h, images: m.length, m, e, d, s, bords: { premieres: premieres.map(b64), dernieres: dernieres.map(b64) } };
    },
  };
}

/** Luminance moyenne (0–255) d'une couleur CSS calculée « rgb(…) » ou « rgba(…) ». */
function luminanceCouleur(couleur) {
  const v = String(couleur).match(/[\d.]+/g);
  if (!v || v.length < 3) return 255;
  return (Number(v[0]) + Number(v[1]) + Number(v[2])) / 3;
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
 * Relit le MP4 produit : durée, nombre d'images, première et dernière images non noires
 * (sauf si le fond de la vidéo est lui-même sombre : fondSombre).
 * -> { ok, duree, images, premiereNoire, derniereNoire, erreurs: [message] }
 */
export async function relire(buffer, { images: attendues, ips, fondSombre = false, vignette = false }) {
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  const duree = await input.computeDuration();
  const piste = await input.getPrimaryVideoTrack();
  // Espace de couleurs écrit dans la piste (spec Rendu et export, 5.2 point 2) : rapporté, mesuré par la mire.
  let couleurs = null;
  try {
    const c = await piste.getColorSpace();
    couleurs = c ? { primaires: c.primaries || null, transfert: c.transfer || null, matrice: c.matrix || null, pleinePlage: c.fullRange === undefined ? null : c.fullRange } : null;
  } catch { couleurs = null; }
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
  if (premiereNoire && !fondSombre) erreurs.push('la première image est noire.');
  if (derniereNoire && !fondSombre) erreurs.push('la dernière image est noire.');
  // Vignette intégrée (5.10, 5.22 point 4) : relue dans les métadonnées du fichier.
  let vignetteLue = false;
  try { const t = await input.getMetadataTags(); vignetteLue = Boolean(t && t.images && t.images.length); } catch { vignetteLue = false; }
  if (vignette && !vignetteLue) erreurs.push('la vignette n\'a pas pu être intégrée à la vidéo.');
  return { ok: erreurs.length === 0, duree, images, premiereNoire, derniereNoire, erreurs, couleurs, vignette: vignetteLue };
}

/** Envoie le MP4 relu à l'aperçu, qui l'écrit dans sortie/<nom> (nom : celui de l'usage, vérifié par l'aperçu). -> { fichier } */
export async function envoyer(buffer, relecture, nom, { extrait = false } = {}) {
  const reponse = await fetch('/_pm/export', {
    method: 'POST',
    headers: { 'Content-Type': /\.webm$/.test(nom || '') ? 'video/webm' : 'video/mp4', 'X-PM-Relecture': encodeURIComponent(JSON.stringify(relecture)), ...(nom ? { 'X-PM-Nom': encodeURIComponent(nom) } : {}),
      ...(extrait ? { 'X-PM-Extrait': '1' } : {}) },
    body: buffer,
  });
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(corps.message || `Enregistrement refusé (${reponse.status}).`);
  return corps;
}

/** Envoie la couverture JPEG à l'aperçu (sortie/<titre>-couverture.jpg). -> { fichier } */
export async function envoyerCouverture(blob) {
  const reponse = await fetch('/_pm/couverture', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(corps.message || `Couverture refusée (${reponse.status}).`);
  return corps;
}

/** Envoie les statistiques image par image à l'aperçu (sortie/.export/stats-navigateur.json) ; un échec ne bloque pas l'export. */
export function envoyerStats(stats) {
  if (!stats) return Promise.resolve();
  return fetch('/_pm/export-stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stats) }).catch(() => {});
}

/** Signale l'état de l'export à l'aperçu (suivi par la commande pulse-motion exporter). */
export function signaler(etat) {
  return fetch('/_pm/export-etat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(etat),
  }).catch(() => {});
}

/** Capture des images clés en PNG (planche du parcours accompagné). -> [{ nom, blob }] */
export async function capturerPlanche(scenes, { largeur = 1280 } = {}) {
  if (M.particules) await M.particules.verifierExport();
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
