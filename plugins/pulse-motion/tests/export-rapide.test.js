'use strict';
/* Export plus rapide (spec Rapidité 5.14, 5.15, 5.17, 5.18) : capture PNG optimizeForSpeed sans changer un pixel, profil
 * par phase, navigateurs en parallèle selon la machine, segment repris après l'arrêt d'un navigateur, vérifications
 * par paquets, voie navigateur en recouvrement. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo } = require('../scripts/exporter.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { navigateursParalleles } = require('../scripts/lib/paralleles.js');
const { assembler } = require('../scripts/assembler.js');
const { decoderPNG } = require('../scripts/logo.js');
const F = require('../scripts/lib/ffmpeg.js');
const { pngRGBA } = require('./aide/png.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sansFfmpeg = !(outil.present && outil.versionOk) && 'ffmpeg absent';
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || sansFfmpeg };
const exporter = (dir, options = {}) => exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1, ...options });
const Go = 1024 ** 3;

function imagesDecodees(fichier) {
  const r = spawnSync(outil.chemin, ['-hide_banner', '-loglevel', 'error', '-i', fichier, '-map', '0:v:0', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
}

/** Pixels décodés d'un PNG (RGBA), pour une comparaison exacte. */
function pixels(png) {
  const i = decoderPNG(png);
  const b = Buffer.alloc(i.largeur * i.hauteur * 4);
  for (let y = 0; y < i.hauteur; y++) for (let x = 0; x < i.largeur; x++) Buffer.from(i.pixel(x, y)).copy(b, (y * i.largeur + x) * 4);
  return { largeur: i.largeur, hauteur: i.hauteur, b };
}

// ---------- 5.14 Capture et profil ----------

test('capture-rapide-memes-pixels : PNG décodés identiques avec et sans optimizeForSpeed ; échelle : image réduite', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, html);
  const page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 360 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    for (const t of [0.4, 2.2, 5.1]) {
      await page.evaluer(`M.pret.then(() => M.seek(${t})).then(() => true)`);
      const lent = await page.capturer({ rapide: false });
      const rapide = await page.capturer();
      const a = pixels(lent);
      const b = pixels(rapide);
      assert.deepEqual([b.largeur, b.hauteur], [640, 360]);
      assert.ok(a.b.equals(b.b), `t = ${t} : pixels différents`);
      assert.notEqual(lent.length, 0);
    }
    const petit = decoderPNG(await page.capturer({ echelle: 0.25 }));
    // Drapeaux qui changent des images (mesures de S1-4) : exclus des pages de capture de l'export.
    const { OPTIONS_CAPTURE } = require('../scripts/lib/capture-fidele.js');
    for (const d of ['--disable-frame-rate-limit', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows']) assert.equal(OPTIONS_CAPTURE.includes(d), false, d);
    assert.deepEqual([petit.largeur, petit.hauteur], [160, 90]);
  } finally {
    await page.fermer();
  }
});

test('profil-export-par-phase : PM_PROFIL écrit sortie/.export/profil.json, temps cumulé par phase', sans, async () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  spawnSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=8', path.join(dir, 'assets', 'musique.wav')]);
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav', volume: 0.7 }; });
  const r = await exporter(dir, { profil: true });
  assert.equal(r.ok, true, r.message);
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', '.export', 'profil.json'), 'utf8'));
  for (const phase of ['seek', 'particules', 'capture', 'base64', 'ecriture', 'finEncodage', 'encodageSon', 'rendreSon', 'ouverture', 'assemblage', 'verifications']) {
    assert.equal(typeof p.phases[phase], 'number', phase);
    assert.ok(p.phases[phase] >= 0, phase);
  }
  assert.ok(p.phases.capture > 0);
  assert.equal(p.imagesCapturees, r.images);
  assert.equal(p.segments, r.segments);
  assert.ok(p.totalMs > 0);
  // Sans profil demandé : pas de fichier.
  const dir2 = copierProjet('projet-simple');
  assert.equal((await exporter(dir2, { profil: false })).ok, true);
  assert.equal(fs.existsSync(path.join(dir2, 'sortie', '.export', 'profil.json')), false);
});

// ---------- 5.15 Parallélisme ----------

test('paralleles-regle-coeurs-memoire-segments : min(fils / 2, 4, mémoire libre − 1,5 Go par navigateur, segments), au moins 1', () => {
  assert.deepEqual(navigateursParalleles({ taches: 18, fils: 32, memoireLibre: 64 * Go, force: undefined }), { nombre: 4, regle: 'plafond' });
  assert.deepEqual(navigateursParalleles({ taches: 18, fils: 6, memoireLibre: 64 * Go, force: undefined }), { nombre: 3, regle: 'fils' });
  // 1,5 Go gardés : 2,9 Go libres → (2,9 − 1,5) / 0,7 = 2 navigateurs.
  assert.deepEqual(navigateursParalleles({ taches: 18, fils: 32, memoireLibre: 2.9 * Go, force: undefined }), { nombre: 2, regle: 'memoire' });
  assert.equal(navigateursParalleles({ taches: 18, fils: 32, memoireLibre: 1.2 * Go, force: undefined }).nombre, 1);
  assert.deepEqual(navigateursParalleles({ taches: 2, fils: 32, memoireLibre: 64 * Go, force: undefined }), { nombre: 2, regle: 'taches' });
  assert.equal(navigateursParalleles({ taches: 0, fils: 1, memoireLibre: 0, force: undefined }).nombre, 1);
});

test('paralleles-plafond-gpu : vidéo à effets (WebGPU), 2 navigateurs au plus', () => {
  assert.deepEqual(navigateursParalleles({ taches: 18, fils: 32, memoireLibre: 64 * Go, gpu: true, force: undefined }), { nombre: 2, regle: 'gpu' });
  assert.equal(navigateursParalleles({ taches: 18, fils: 2, memoireLibre: 64 * Go, gpu: true, force: undefined }).nombre, 1);
  // L'export passe bien le GPU à la règle : une vidéo à effets est reconnue.
  const { avecEffets } = require('../scripts/export-fidele.js');
  const { lireDeroule } = require('../scripts/lib/deroule.js');
  const dir = copierProjet('projet-particules');
  assert.equal(avecEffets(dir, lireDeroule(dir).deroule), true);
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'export-fidele.js'), 'utf8');
  assert.match(source, /navigateursParalleles\(\{ taches: [^}]*gpu \}\)/);
});

test('paralleles-variable-d-environnement : PM_PARALLELES (1 à 8) force le nombre de navigateurs de l\'export', sans, async () => {
  const avant = process.env.PM_PARALLELES;
  try {
    process.env.PM_PARALLELES = '3';
    assert.deepEqual(navigateursParalleles({ taches: 18, fils: 2, memoireLibre: 1 * Go }), { nombre: 3, regle: 'PM_PARALLELES' });
    assert.deepEqual(navigateursParalleles({ taches: 2, fils: 2, memoireLibre: 1 * Go }), { nombre: 2, regle: 'PM_PARALLELES' });
    process.env.PM_PARALLELES = '9';
    assert.notEqual(navigateursParalleles({ taches: 18, fils: 32, memoireLibre: 64 * Go }).regle, 'PM_PARALLELES');
    process.env.PM_PARALLELES = '2';
    const dir = copierProjet('projet-simple');
    const r = await exporter(dir, { paralleles: undefined, dureeSegment: 2 });
    assert.equal(r.ok, true, r.message);
    assert.deepEqual([r.paralleles, r.regleParalleles], [2, 'PM_PARALLELES']);
  } finally {
    if (avant === undefined) delete process.env.PM_PARALLELES; else process.env.PM_PARALLELES = avant;
  }
});

test('paralleles-navigateur-arrete-segment-repris : un navigateur arrêté remet son segment dans la file, une fois, avec une page neuve', sans, async () => {
  const dir = copierProjet('projet-simple');
  let ouvertes = [];
  let tue = false;
  const r = await exporter(dir, {
    dureeSegment: 2,
    surOuverture: (c) => ouvertes.push(c),
    surProgression: (n) => { if (!tue && n >= 3) { tue = true; ouvertes[0].processus.kill(); } },
  });
  assert.equal(r.ok, true, r.message);
  assert.equal(ouvertes.length, 2, 'une page neuve');
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.equal(s.images, r.images);
  // Au second arrêt du même segment : l'export échoue avec le message habituel.
  const dir2 = copierProjet('projet-simple');
  ouvertes = [];
  let derniere = null;
  const r2 = await exporter(dir2, {
    dureeSegment: 2,
    surOuverture: (c) => { ouvertes.push(c); derniere = c; },
    surProgression: () => { if (derniere) { const c = derniere; derniere = null; c.processus.kill(); } },
  });
  assert.equal(r2.ok, false);
  assert.match(r2.message, /^L'export fidèle a échoué \(le navigateur s'est arrêté\) : relancez-le/);
  assert.equal(ouvertes.length, 2);
});

// ---------- 5.18 Vérifications par paquets ----------

test('sonder-par-paquets-meme-nombre-d-images : -count_packets compte les images d\'un segment comme -count_frames', { skip: sansFfmpeg }, async () => {
  const dir = dossierTemporaire('pm-paquets-');
  for (const n of [1, 7, 31]) {
    const fichier = path.join(dir, `s${n}.mp4`);
    async function* images() { for (let k = 0; k < n; k++) yield pngRGBA(64, 36, (x) => [(x * 4 + k * 8) % 256, k % 256, 90, 255]); }
    await F.encoderSegment({ ffmpeg: outil.chemin, sortie: fichier, ips: 30, crf: 18, images: images() });
    const parImages = await F.sonder({ ffprobe: outil.cheminProbe, fichier });
    const parPaquets = await F.sonder({ ffprobe: outil.cheminProbe, fichier, compter: 'paquets' });
    assert.equal(parImages.images, n);
    assert.equal(parPaquets.images, n);
    assert.deepEqual([parPaquets.largeur, parPaquets.hauteur, parPaquets.video], [64, 36, 'h264']);
  }
});

test('segment-tronque-detecte-par-paquets : un segment tronqué n\'est pas repris, il est recapturé', sans, async () => {
  const dir = dossierTemporaire('pm-tronque-');
  const fichier = path.join(dir, 's.mp4');
  async function* images() { for (let k = 0; k < 30; k++) yield pngRGBA(64, 36, () => [k * 8, 40, 90, 255]); }
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: fichier, ips: 30, crf: 18, images: images() });
  const octets = fs.readFileSync(fichier);
  fs.writeFileSync(fichier, octets.subarray(0, Math.floor(octets.length / 2)));
  const lu = await F.sonder({ ffprobe: outil.cheminProbe, fichier, compter: 'paquets' }).then((s) => s.images, () => null);
  assert.notEqual(lu, 30);
  // Dans l'export : l'intermédiaire tronqué est recapturé, les autres sont repris.
  const projet = copierProjet('projet-simple');
  const r1 = await exporter(projet);
  assert.equal(r1.ok, true, r1.message);
  const pixelsDir = path.join(projet, 'sortie', '.export', 'segments', 'pixels');
  const [premier] = fs.readdirSync(pixelsDir).filter((f) => f.endsWith('.mp4')).sort();
  const p = path.join(pixelsDir, premier);
  const contenu = fs.readFileSync(p);
  fs.writeFileSync(p, contenu.subarray(0, Math.floor(contenu.length * 0.6)));
  const r2 = await exporter(projet);
  assert.equal(r2.ok, true, r2.message);
  assert.equal(r2.segmentsRepris, r2.segments - 1);
  assert.equal(r2.scenesRecapturees.length, 1);
});

test('vérifications : la validité d\'un segment passe par les paquets, le fichier final garde un décodage complet', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'export-fidele.js'), 'utf8');
  assert.match(source, /async function segmentValide[\s\S]*?compter: 'paquets'/);
  assert.match(source, /F\.sonder\(\{ ffprobe: outil\.cheminProbe, fichier: partiel \}\)/);
});

// ---------- 5.17 Voie navigateur ----------

test('export-navigateur-memes-images : deux exports dans le navigateur donnent les mêmes images (recouvrement de l\'encodage abandonné, gain mesuré −1 %)', { skip: (!navigateur && 'Chrome ou Edge introuvable') || sansFfmpeg }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.format.ips = 12; });
  const premier = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(premier.ok, true, premier.message);
  const a = path.join(dir, 'sortie', 'a.mp4');
  fs.renameSync(path.join(dir, premier.fichier), a);
  const second = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(second.ok, true, second.message);
  const x = imagesDecodees(a);
  assert.equal(x.length, 87);
  assert.deepEqual(imagesDecodees(path.join(dir, second.fichier)), x);
  // La boucle attend toujours l'encodage de l'image avant de dessiner la suivante.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'moteur', 'export.mjs'), 'utf8'), /await M\.capturer\(ctx, largeur, hauteur\);\s*await video\.add\(/);
});
