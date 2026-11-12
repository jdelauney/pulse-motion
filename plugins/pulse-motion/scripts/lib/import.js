'use strict';
/* Pulse Motion – import d'une vidéo de l'écran ou d'une animation en prise (spec S6, 5.14) : films/<nom>/prise-NN/
 * (source « import »), lue par l'écran pm-ecran comme une prise filmée. Pas de tournage, pas de réseau.
 *
 * - Vidéo (.mp4, .webm, .mov, .mkv) : images à la cadence du film (30 i/s), plus grand côté au plus 1 920 px, JPEG q≈85 :
 *   avec ffmpeg (fps, scale ; une réduction de 64 × 36 en flux brut pour repérer les images semblables), sinon dans Chrome :
 *   une page d'aide servie sur 127.0.0.1 derrière la garde commune (lecture seule) décode avec Mediabunny (CanvasSink, à
 *   chaque instant k / cadence) ; les images sont encodées dans la page puis rapatriées par paquets.
 * - Animation (.gif, WebP ou PNG animés) : ImageDecoder (WebCodecs) dans la page, qui donne la durée de chaque image ; la
 *   durée de chaque image est gardée telle quelle.
 * - Allègement : une image semblable à la précédente gardée (écart moyen au plus 0,5 % et aucun point de la réduction à plus
 *   de 8 niveaux) est partagée : un enregistrement d'écran immobile n'écrit qu'une image.
 * - Une seule étape « lire » (reaction : [[ms, image]], duree en ms), et des repères (ajouterRepere) qui servent de cibles
 *   au pointeur, au projecteur et aux zooms (etape:N désigne le repère N).
 * - Son : la piste son est extraite en WAV (ffmpeg, ou AudioBufferSink et moteur/wav.js) dans la prise (son.wav).
 * - Longueur : au-delà de 3 min ou de 60 Mo d'images, { ok: false, besoin: 'extrait', duree } : demander un extrait (de, a).
 * - Planche : sortie/planche-film/<nom>-prise-NN/secondes-KK.png, une vignette par seconde (12 par planche).
 * Principes de argo (src/import.ts : formats acceptés, sonde de durée et de taille) et d'explainroo (src/clips.js : JPEG à
 * la cadence du projet, au plus 1 920 px) ; code écrit pour Pulse Motion.
 *
 * importer({ projet, fichier, nom?, de?, a?, navigateur, ffmpeg?, surAvancement? }) -> { ok, nom, prise, images, duree, poids, son, planche }
 *   | { ok: false, besoin: 'extrait', duree } | { ok: false, erreur, message }
 *   ffmpeg : outil de trouverFfmpeg() (défaut), ou null pour décoder dans Chrome.
 * ajouterRepere({ projet, nom, prise?, instant, point: [x%, y%], boite?: [x%, y%, l%, h%] }) -> { n, reperes }
 * lireInstant(« 1:05 » | « 12,5 ») -> secondes ou null.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const F = require('./film.js');
const Pa = require('./parcours.js');
const { ouvrirPage } = require('./cdp.js');
const { garder } = require('./garde-locale.js');

const RACINE = path.join(__dirname, '..', '..');
const VIDEOS = ['.mp4', '.webm', '.mov', '.mkv', '.m4v'];
const ANIMATIONS = { '.gif': 'image/gif', '.webp': 'image/webp', '.png': 'image/png', '.apng': 'image/apng' };
const CADENCE = 30;
const COTE = 1920;
const MAX_DUREE = 180;
const MAX_POIDS = 60 * 1024 * 1024;
const PARTAGE = { moyenne: 0.005, max: 8 };
const MESSAGE_FORMAT = 'Cette vidéo est dans un format que Chrome ne lit pas. Installez ffmpeg (je peux le faire) ou exportez-la en MP4.';

function lireInstant(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : null;
  const t = String(v).trim().replace(',', '.');
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const parts = [m[1], m[2], m[3]].filter((x) => x !== undefined).map(Number);
  return parts.reduce((s, x) => s * 60 + x, 0);
}

/** Deux réductions 64 × 36 (RVB) semblables : écart moyen ≤ 0,5 % et aucun écart de plus de 8 niveaux. */
function semblables(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let somme = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > PARTAGE.max) return false;
    somme += d;
  }
  return somme / a.length / 255 <= PARTAGE.moyenne;
}

// Page d'aide (module) : décodage dans Chrome, avec Mediabunny pour une vidéo et ImageDecoder pour une animation.
const PAGE = `<!doctype html><meta charset="utf-8"><title>Pulse Motion – import</title>
<script src="/_pm/wav.js"></script>
<script type="module">
import { Input, BlobSource, ALL_FORMATS, CanvasSink, AudioBufferSink } from '/_pm/vendor/mediabunny.min.mjs';
const PARTAGE = ${JSON.stringify(PARTAGE)};
const S = {};
function en64(blob) { return new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1]); f.readAsDataURL(blob); }); }
function reduction(source) {
  const c = new OffscreenCanvas(64, 36); const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, 64, 36);
  const d = x.getImageData(0, 0, 64, 36).data; const r = new Uint8Array(64 * 36 * 3);
  for (let i = 0, j = 0; i < d.length; i += 4) { r[j++] = d[i]; r[j++] = d[i + 1]; r[j++] = d[i + 2]; }
  return r;
}
function semblables(a, b) {
  if (!a || !b) return false; let s = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > PARTAGE.max) return false; s += d; }
  return s / a.length / 255 <= PARTAGE.moyenne;
}
async function image(source, largeur, hauteur) {
  const r = reduction(source);
  if (semblables(r, S.derniere)) return { partage: true };
  S.derniere = r;
  const c = new OffscreenCanvas(largeur, hauteur); const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(source, 0, 0, largeur, hauteur);
  return { partage: false, data: await en64(await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })) };
}
window.__pmImport = {
  async sonder(sorte, type) {
    S.blob = await (await fetch('/_pm/source')).blob();
    S.sorte = sorte;
    if (sorte === 'animation') {
      if (typeof ImageDecoder === 'undefined') return { erreur: 'format' };
      S.dec = new ImageDecoder({ data: await S.blob.arrayBuffer(), type });
      await S.dec.tracks.ready; await S.dec.completed;
      const n = S.dec.tracks.selectedTrack.frameCount;
      S.temps = []; let t = 0, L = 0, H = 0;
      for (let k = 0; k < n; k++) {
        const { image: f } = await S.dec.decode({ frameIndex: k });
        S.temps.push(t); t += (f.duration || 100000) / 1e6; L = f.displayWidth; H = f.displayHeight; f.close();
      }
      return { duree: t, largeur: L, hauteur: H, decodable: true, son: false };
    }
    S.input = new Input({ source: new BlobSource(S.blob), formats: ALL_FORMATS });
    let piste;
    try { piste = await S.input.getPrimaryVideoTrack(); } catch (e) { return { erreur: 'format' }; }
    if (!piste) return { erreur: 'piste' };
    S.piste = piste;
    const decodable = await piste.canDecode();
    let son = false;
    try { S.audio = await S.input.getPrimaryAudioTrack(); son = !!S.audio && await S.audio.canDecode(); } catch (e) { son = false; }
    return { duree: await S.input.computeDuration(), largeur: piste.displayWidth, hauteur: piste.displayHeight, decodable, son };
  },
  demarrer({ cadence, de, a, largeur, hauteur }) {
    S.L = largeur; S.H = hauteur; S.derniere = null; S.k = 0;
    if (S.sorte === 'animation') {
      S.indices = S.temps.map((t, k) => k).filter((k) => S.temps[k] + 1e-6 >= de && S.temps[k] < a);
      // L'image en cours au début de l'extrait.
      const avant = S.temps.map((t, k) => k).filter((k) => S.temps[k] < de).pop();
      if (avant !== undefined && (!S.indices.length || S.temps[S.indices[0]] > de + 1e-6)) S.indices.unshift(avant);
      S.de = de;
      return S.indices.length;
    }
    const n = Math.max(1, Math.round((a - de) * cadence));
    const instants = Array.from({ length: n }, (_, k) => de + k / cadence);
    S.instants = instants;
    S.iter = new CanvasSink(S.piste, { width: largeur, height: hauteur, fit: 'fill', poolSize: 2 }).canvasesAtTimestamps(instants)[Symbol.asyncIterator]();
    S.precedent = null;
    return n;
  },
  async suivantes(n) {
    const r = [];
    for (let i = 0; i < n; i++) {
      if (S.sorte === 'animation') {
        if (S.k >= S.indices.length) break;
        const k = S.indices[S.k++];
        const { image: f } = await S.dec.decode({ frameIndex: k });
        const ms = Math.max(0, Math.round((S.temps[k] - S.de) * 1000));
        const im = await image(f, S.L, S.H); f.close();
        r.push({ ms, ...im });
        continue;
      }
      const x = await S.iter.next();
      if (x.done) break;
      const ms = Math.round((S.instants[S.k] - S.instants[0]) * 1000); S.k++;
      const c = x.value ? x.value.canvas : S.precedent;
      if (!c) { r.push({ ms, partage: true }); continue; }
      if (x.value) S.precedent = c;
      r.push({ ms, ...(await image(c, S.L, S.H)) });
    }
    return r;
  },
  async son({ de, a }) {
    if (!S.audio) return 0;
    const morceaux = []; let taux = 48000, nc = 1, total = 0;
    for await (const { buffer } of new AudioBufferSink(S.audio).buffers(de, a)) {
      taux = buffer.sampleRate; nc = Math.min(2, buffer.numberOfChannels);
      const c = []; for (let k = 0; k < nc; k++) c.push(buffer.getChannelData(k).slice());
      morceaux.push(c); total += c[0].length;
    }
    if (!total) return 0;
    const canaux = Array.from({ length: nc }, () => new Float32Array(total));
    let pos = 0;
    for (const m of morceaux) { for (let k = 0; k < nc; k++) canaux[k].set(m[k], pos); pos += m[0].length; }
    window.__pmSon = M.wav.base64(M.wav.ecrire({ taux, canaux }));
    return window.__pmSon.length;
  },
};
window.__pmImportPret = true;
</script>`;

/** Serveur de la page d'aide, sur 127.0.0.1, lecture seule (garde commune : aucune écriture admise). page et routes : ceux
 *  d'une autre page d'aide (imitation, spec S9 5.15) ; routes : { chemin: [() => Buffer, type] }, ou une fonction
 *  (chemin) -> [() => Buffer, type] | null pour les chemins variables. */
function servirAide(fichier, type, { page = PAGE, routes = {}, routeVariable = null } = {}) {
  const ROUTES = {
    ...routes,
    '/': [() => Buffer.from(page, 'utf8'), 'text/html; charset=utf-8'],
    '/_pm/vendor/mediabunny.min.mjs': [() => fs.readFileSync(path.join(RACINE, 'vendor', 'mediabunny', 'mediabunny.min.mjs')), 'text/javascript; charset=utf-8'],
    '/_pm/wav.js': [() => fs.readFileSync(path.join(RACINE, 'moteur', 'wav.js')), 'text/javascript; charset=utf-8'],
  };
  let port = 0;
  const serveur = http.createServer((req, res) => {
    if (!garder(req, res, { port, types: null })) return;
    const chemin = new URL(req.url, 'http://127.0.0.1').pathname;
    if (chemin === '/_pm/source') {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': fs.statSync(fichier).size });
      fs.createReadStream(fichier).pipe(res);
      return;
    }
    const r = ROUTES[chemin] || (routeVariable ? routeVariable(chemin) : null);
    if (!r) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable.'); return; }
    res.writeHead(200, { 'Content-Type': r[1] });
    res.end(r[0]());
  });
  return new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(0, '127.0.0.1', () => {
      port = serveur.address().port;
      ok({ url: `http://127.0.0.1:${port}/`, fermer: () => new Promise((f) => { serveur.closeAllConnections?.(); serveur.close(() => f()); }) });
    });
  });
}

/** Taille des images : plus grand côté au plus 1 920 px, dimensions paires. */
function tailleImages(largeur, hauteur) {
  const k = Math.min(1, COTE / Math.max(largeur, hauteur));
  const pair = (x) => Math.max(2, 2 * Math.round(x * k / 2));
  return [pair(largeur), pair(hauteur)];
}

function sonder(outil, fichier) {
  const sortie = execFileSync(outil.cheminProbe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', fichier], { encoding: 'utf8', timeout: 60000 });
  const j = JSON.parse(sortie);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  return { duree: Number(j.format && j.format.duration) || 0, largeur: v ? v.width : 0, hauteur: v ? v.height : 0, son: (j.streams || []).some((s) => s.codec_type === 'audio'), video: !!v };
}

function lancer(chemin, args, { surSortie } = {}) {
  return new Promise((ok, ko) => {
    const p = spawn(chemin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let erreurs = '';
    p.stdout.on('data', (b) => { if (surSortie) surSortie(b); });
    p.stderr.on('data', (b) => { erreurs += b.toString('utf8'); if (erreurs.length > 20000) erreurs = erreurs.slice(-20000); });
    p.on('error', ko);
    p.on('close', (code) => (code === 0 ? ok() : ko(new Error(erreurs.trim().split('\n').pop() || `ffmpeg : code ${code}`))));
  });
}

/** Décodage par ffmpeg : JPEG à la cadence, réductions brutes 64 × 36 pour le partage. -> [{ ms, fichier | null }] */
async function decoderFfmpeg(outil, fichier, { de, a, largeur, hauteur, dossier }) {
  const brut = [];
  let reste = Buffer.alloc(0);
  const T = 64 * 36 * 3;
  const filtre = `[0:v]fps=${CADENCE},split=2[g][p];[g]scale=${largeur}:${hauteur}:flags=lanczos[gs];[p]scale=64:36:flags=area,format=rgb24[ps]`;
  await lancer(outil.chemin, ['-v', 'error', '-ss', String(de), '-t', String(a - de), '-i', fichier, '-filter_complex', filtre,
    '-map', '[gs]', '-q:v', '3', path.join(dossier, '%06d.jpg'), '-map', '[ps]', '-f', 'rawvideo', 'pipe:1'], {
    surSortie: (b) => {
      reste = Buffer.concat([reste, b]);
      while (reste.length >= T) { brut.push(reste.subarray(0, T)); reste = reste.subarray(T); }
    },
  });
  const jpegs = fs.readdirSync(dossier).filter((f) => /^\d{6}\.jpg$/.test(f)).sort();
  const r = [];
  let derniere = null;
  jpegs.forEach((f, k) => {
    const ms = Math.round(k * 1000 / CADENCE);
    if (derniere && semblables(brut[k], derniere)) { r.push({ ms, fichier: null }); fs.rmSync(path.join(dossier, f), { force: true }); return; }
    derniere = brut[k] || null;
    r.push({ ms, fichier: path.join(dossier, f) });
  });
  return r;
}

const OUTIL_PLANCHE = `(function () {
  async function bitmap(b64, mime) { var s = atob(b64), o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return createImageBitmap(new Blob([o], { type: mime })); }
  function en64(blob) { return new Promise(function (ok) { var f = new FileReader(); f.onload = function () { ok(String(f.result).split(',')[1]); }; f.readAsDataURL(blob); }); }
  window.__pmPlancheImport = async function (vignettes, titre) {
    var L = 1280, col = 4, l = L / col, premiere = await bitmap(vignettes[0].b64, vignettes[0].mime);
    var h = Math.round(l * premiere.height / premiere.width), lignes = Math.ceil(vignettes.length / col), H = lignes * (h + 30) + 48;
    var c = new OffscreenCanvas(L, H), x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, L, H);
    x.fillStyle = '#fff'; x.font = '600 22px system-ui, sans-serif'; x.textBaseline = 'middle'; x.fillText(titre, 14, 24);
    for (var i = 0; i < vignettes.length; i++) {
      var b = i === 0 ? premiere : await bitmap(vignettes[i].b64, vignettes[i].mime);
      var X = (i % col) * l, Y = 48 + Math.floor(i / col) * (h + 30);
      x.drawImage(b, X + 2, Y, l - 4, h);
      x.fillStyle = '#fff'; x.font = '600 18px system-ui, sans-serif'; x.fillText(vignettes[i].texte, X + 8, Y + h + 15);
    }
    return en64(await c.convertToBlob({ type: 'image/png' }));
  };
  return true;
})()`;

const MIMES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/** Planche d'une prise importée : une vignette par seconde, 12 par planche, avec l'instant. -> chemin. */
async function ecrirePlancheImport(page, { projet, nom, prise, film, dossier }) {
  await page.evaluer(OUTIL_PLANCHE);
  const e = film.etapes[0];
  const planche = path.join(projet, 'sortie', 'planche-film', `${nom}-${prise}`);
  fs.rmSync(planche, { recursive: true, force: true });
  fs.mkdirSync(planche, { recursive: true });
  const duree = Math.max(1, Math.ceil((e.duree || 0) / 1000));
  const imageA = (ms) => { let n = e.avant; for (const [t, im] of e.reaction || []) { if (t <= ms + 1e-6) n = im; else break; } return n; };
  for (let s0 = 0, k = 1; s0 < duree; s0 += 12, k++) {
    const vignettes = [];
    for (let s = s0; s < Math.min(duree, s0 + 12); s++) {
      const n = imageA(s * 1000);
      vignettes.push({ b64: fs.readFileSync(path.join(dossier, 'images', n)).toString('base64'), mime: MIMES[path.extname(n)] || 'image/jpeg', texte: `${s} s` });
    }
    const png = await page.evaluer(`window.__pmPlancheImport(${JSON.stringify(vignettes)}, ${JSON.stringify(`${nom} · ${prise} · de ${s0} à ${Math.min(duree, s0 + 12)} s`)})`);
    fs.writeFileSync(path.join(planche, `secondes-${String(k).padStart(2, '0')}.png`), Buffer.from(png, 'base64'));
  }
  return planche;
}

async function importer({ projet, fichier, nom, de, a, navigateur, ffmpeg, surAvancement = () => {} }) {
  projet = path.resolve(projet);
  const source = path.resolve(projet, String(fichier || ''));
  if (!fichier || !fs.existsSync(source) || !fs.statSync(source).isFile()) return { ok: false, erreur: 'fichier', message: `Fichier « ${fichier} » introuvable.` };
  const ext = path.extname(source).toLowerCase();
  const sorte = VIDEOS.includes(ext) ? 'video' : ANIMATIONS[ext] ? 'animation' : null;
  if (!sorte) return { ok: false, erreur: 'format', message: `« ${path.basename(source)} » : une vidéo (${VIDEOS.join(', ')}) ou une animation (.gif, WebP ou PNG animés). Une capture d'écran fixe se montre telle quelle dans un écran, sans import.` };
  nom = nom || Pa.siteReduit(path.basename(source, ext));
  if (!Pa.NOM.test(nom)) return { ok: false, erreur: 'nom', message: `« ${nom} » : a-z, 0-9 et des tirets.` };
  const debut = lireInstant(de);
  const fin = lireInstant(a);
  if ((de !== undefined && de !== null && debut === null) || (a !== undefined && a !== null && fin === null)) return { ok: false, erreur: 'extrait', message: 'Extrait illisible : « 0:12 », « 1:05 » ou un nombre de secondes.' };
  if (!navigateur) return { ok: false, erreur: 'navigateur', message: 'Chrome ou Edge est introuvable : il en faut un pour importer.' };
  if (ffmpeg === undefined) { try { const o = require('./ffmpeg.js').trouverFfmpeg(); ffmpeg = o.present && o.versionOk ? o : null; } catch { ffmpeg = null; } }
  const parFfmpeg = sorte === 'video' && ffmpeg && ffmpeg.chemin && ffmpeg.cheminProbe;

  const prise = F.prochainePrise(projet, nom);
  const dossierFilm = F.dossierFilm(projet, nom);
  const temporaire = path.join(dossierFilm, `.${prise}-en-cours`);
  fs.rmSync(temporaire, { recursive: true, force: true });
  fs.mkdirSync(path.join(temporaire, 'images'), { recursive: true });
  let aide = null;
  let page = null;
  try {
    aide = await servirAide(source, sorte === 'animation' ? ANIMATIONS[ext] : 'application/octet-stream');
    page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 400, delai: 120000 });
    await page.aller(aide.url);
    for (let i = 0; i < 100 && !(await page.evaluer('!!window.__pmImportPret')); i++) await new Promise((r) => setTimeout(r, 50));
    // Sonde : durée, taille, son.
    let s;
    if (parFfmpeg) {
      try { s = sonder(ffmpeg, source); } catch { s = null; }
      if (!s || !s.video) return { ok: false, erreur: 'format', message: 'ffmpeg ne trouve aucune image dans ce fichier : est-ce bien une vidéo ?' };
      s.decodable = true;
    } else {
      s = await page.evaluer(`window.__pmImport.sonder(${JSON.stringify(sorte)}, ${JSON.stringify(ANIMATIONS[ext] || '')})`);
      if (s.erreur === 'piste') return { ok: false, erreur: 'format', message: 'Ce fichier ne contient aucune image vidéo.' };
      if (s.erreur || !s.decodable) return { ok: false, erreur: 'format', message: MESSAGE_FORMAT };
    }
    const t0 = Math.min(debut || 0, s.duree);
    const t1 = Math.min(fin === null ? s.duree : fin, s.duree);
    if (!(t1 > t0)) return { ok: false, erreur: 'extrait', message: `L'extrait est vide (la vidéo dure ${Math.round(s.duree * 10) / 10} s).` };
    if (t1 - t0 > MAX_DUREE + 1e-6) return { ok: false, besoin: 'extrait', duree: Math.round(s.duree * 10) / 10, message: `La vidéo dure ${Math.round(s.duree)} s : au-delà de 3 minutes, choisir un extrait.` };
    const [L, H] = tailleImages(s.largeur, s.hauteur);
    surAvancement({ etape: 'decodage', duree: t1 - t0 });

    // Images : nommées dans l'ordre, une image semblable à la précédente partagée.
    const reaction = [];
    let n = 0;
    let poids = 0;
    let derniere = null;
    let instants = 0;   // images à la cadence (partagées comprises) : la durée d'une vidéo
    const nomSuivant = () => `${String(++n).padStart(4, '0')}.jpg`;
    const trop = () => Object.assign(new Error('trop'), { trop: true });
    if (parFfmpeg) {
      const brut = path.join(temporaire, 'brut');
      fs.mkdirSync(brut, { recursive: true });
      for (const im of await decoderFfmpeg(ffmpeg, source, { de: t0, a: t1, largeur: L, hauteur: H, dossier: brut })) {
        instants++;
        if (im.fichier) {
          derniere = nomSuivant();
          fs.renameSync(im.fichier, path.join(temporaire, 'images', derniere));
          poids += fs.statSync(path.join(temporaire, 'images', derniere)).size;
          if (poids > MAX_POIDS) throw trop();
        }
        if (derniere && (!reaction.length || reaction[reaction.length - 1][1] !== derniere)) reaction.push([im.ms, derniere]);
      }
      fs.rmSync(brut, { recursive: true, force: true });
    } else {
      await page.evaluer(`window.__pmImport.demarrer(${JSON.stringify({ cadence: CADENCE, de: t0, a: t1, largeur: L, hauteur: H })})`);
      for (;;) {
        const paquet = await page.evaluer('window.__pmImport.suivantes(8)');
        if (!paquet.length) break;
        for (const im of paquet) {
          instants++;
          if (!im.partage) {
            derniere = nomSuivant();
            const octets = Buffer.from(im.data, 'base64');
            fs.writeFileSync(path.join(temporaire, 'images', derniere), octets);
            poids += octets.length;
            if (poids > MAX_POIDS) throw trop();
          }
          if (derniere && (!reaction.length || reaction[reaction.length - 1][1] !== derniere)) reaction.push([im.ms, derniere]);
        }
        surAvancement({ etape: 'images', images: n });
      }
    }
    if (!reaction.length) return { ok: false, erreur: 'format', message: MESSAGE_FORMAT };
    if (reaction[0][0] !== 0) reaction[0][0] = 0;

    // Son.
    let son = null;
    if (s.son && sorte === 'video') {
      const wav = path.join(temporaire, 'son.wav');
      try {
        if (parFfmpeg) await lancer(ffmpeg.chemin, ['-v', 'error', '-ss', String(t0), '-t', String(t1 - t0), '-i', source, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav]);
        else {
          const longueur = await page.evaluer(`window.__pmImport.son(${JSON.stringify({ de: t0, a: t1 })})`);
          let b64 = '';
          for (let i = 0; i < longueur; i += 4 * 1024 * 1024) b64 += await page.evaluer(`window.__pmSon.slice(${i}, ${i + 4 * 1024 * 1024})`);
          if (longueur) fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
        }
        if (fs.existsSync(wav)) son = path.relative(projet, path.join(dossierFilm, prise, 'son.wav')).split(path.sep).join('/');
      } catch { son = null; }
    }

    // Couleurs des bords (cadre « présentation ») et film.json.
    const { OUTILS_IMAGES } = require('./tournage.js');
    await page.evaluer(OUTILS_IMAGES);
    const premiere = fs.readFileSync(path.join(temporaire, 'images', reaction[0][1]));
    const hex = (c) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
    const bords = (await page.evaluer(`window.__pmImages.bords(${JSON.stringify(premiere.toString('base64'))}, 'image/jpeg')`)).map(hex);
    // Vidéo : autant d'images que d'instants à la cadence ; animation : la durée de ses images.
    const dureeMs = sorte === 'video' ? Math.round(instants * 1000 / CADENCE) : Math.round((t1 - t0) * 1000);
    const film = {
      version: F.VERSION, source: 'import', date: new Date().toISOString(), navigateur: parFfmpeg ? `ffmpeg ${ffmpeg.version || ''}`.trim() : await page.version(),
      appareil: H > L ? 'telephone' : 'ordinateur', largeur: L, hauteur: H, echelle: 1, cadence: CADENCE, bords,
      origine: { fichier: path.basename(source), de: Math.round(t0 * 1000) / 1000, a: Math.round(t1 * 1000) / 1000, sorte },
      etapes: [{ n: 1, faire: 'lire', dit: '', url: '', cible: null, point: null, avant: reaction[0][1], reaction, duree: dureeMs, apres: reaction[reaction.length - 1][1],
        coupes: [], reperes: [], flous: { auto: 0, cible: 0, apres: 0 }, alertes: [] }],
      alertes: [],
    };
    film.poids = F.poidsPrise(temporaire);
    fs.writeFileSync(path.join(temporaire, 'film.json'), `${JSON.stringify(film, null, 2)}\n`, 'utf8');
    if (!fs.existsSync(path.join(dossierFilm, 'parcours.json'))) {
      require('./fichiers.js').ecrireJSON(path.join(dossierFilm, 'parcours.json'), { nom, import: path.basename(source) });
    }
    const dossierPrise = path.join(dossierFilm, prise);
    fs.renameSync(temporaire, dossierPrise);
    const planche = await ecrirePlancheImport(page, { projet, nom, prise, film, dossier: dossierPrise });
    return { ok: true, nom, prise, images: n, instants: reaction.length, duree: dureeMs / 1000, poids: film.poids, son,
      planche: path.relative(projet, planche).split(path.sep).join('/') };
  } catch (e) {
    if (e.trop) return { ok: false, besoin: 'extrait', duree: null, message: 'Plus de 60 Mo d\'images : choisir un extrait plus court.' };
    if (/decod|codec|format/i.test(e.message)) return { ok: false, erreur: 'format', message: MESSAGE_FORMAT };
    return { ok: false, erreur: 'import', message: `L'import s'est arrêté : ${e.message}` };
  } finally {
    if (page) await page.fermer().catch(() => {});
    if (aide) await aide.fermer().catch(() => {});
    fs.rmSync(temporaire, { recursive: true, force: true });
  }
}

/** Repère d'une prise importée (point visé, boîte facultative), en % de l'image ; trié par instant. */
function ajouterRepere({ projet, nom, prise, instant, point, boite }) {
  const parcours = F.lireParcoursBrut(projet, nom) || {};
  const liste = F.prises(projet, nom);
  const p = prise || parcours.prise || (liste.length ? liste[liste.length - 1].prise : null);
  if (!p) throw new Error(`Film « ${nom} » : aucune prise.`);
  const { film, dossier, erreurs } = F.lireFilm(projet, nom, p);
  if (!film || erreurs.length) throw new Error(erreurs[0] || `Film « ${nom} » illisible.`);
  if (film.source !== 'import') throw new Error(`Film « ${nom} » : les repères servent aux vidéos importées ; une prise filmée a déjà ses cibles (etape:N).`);
  const t = lireInstant(instant);
  if (t === null) throw new Error('Instant illisible : « 12 », « 12,5 » ou « 1:05 ».');
  const pc = (v, n) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && x >= 0 && x <= 100);
  if (!pc(point, 2)) throw new Error('Point : « x,y » en % de l\'image.');
  if (boite !== undefined && boite !== null && !pc(boite, 4)) throw new Error('Boîte : « x,y,l,h » en % de l\'image.');
  const e = film.etapes[0];
  const r = (x) => Math.round(x * 100) / 100;
  const repere = { instant: r(t), point: [r(point[0] / 100 * film.largeur), r(point[1] / 100 * film.hauteur)] };
  if (boite) repere.boite = [r(boite[0] / 100 * film.largeur), r(boite[1] / 100 * film.hauteur), r(boite[2] / 100 * film.largeur), r(boite[3] / 100 * film.hauteur)];
  e.reperes = [...(e.reperes || []), repere].sort((x, y) => x.instant - y.instant);
  fs.writeFileSync(path.join(dossier, 'film.json'), `${JSON.stringify(film, null, 2)}\n`, 'utf8');
  return { nom, prise: p, n: e.reperes.indexOf(repere) + 1, reperes: e.reperes };
}

module.exports = { importer, ajouterRepere, ecrirePlancheImport, servirAide, lireInstant, semblables, tailleImages, VIDEOS, ANIMATIONS, MAX_DUREE, MAX_POIDS, PAGE };
