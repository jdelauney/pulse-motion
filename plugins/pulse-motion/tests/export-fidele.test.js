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
const exporter = (dir, options = {}) => exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1, ...options });

/** Segments du cache : intermédiaires (segments/pixels) et fichiers dérivés (segments). */
const cache = (dir) => {
  const seg = path.join(dir, 'sortie', '.export', 'segments');
  const lire = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.mp4') || f.endsWith('.part')).map((f) => path.join(d, f)) : []);
  return { pixels: lire(path.join(seg, 'pixels')), derives: lire(seg) };
};

test('export fidèle 720p : segments par scène (7,25 s, morceaux de 3 s au plus), MP4 vérifié, suivi ; seuls les segments restent', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporter(dir);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'la-chaine-du-froid.mp4'));
  assert.deepEqual([r.largeur, r.hauteur, r.images, r.audio], [1280, 720, 73, false]);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.deepEqual([s.video, s.largeur, s.hauteur, s.images], ['h264', 1280, 720, 73]);
  // Dossier de travail : seulement le cache des segments (page, son et verrou retirés).
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sortie', '.export')), ['segments']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sortie', '.export', 'segments')).sort(), ['dernier.json', 'pixels']);
  assert.equal(cache(dir).pixels.length, r.segments);
  assert.ok(r.segments >= 4, String(r.segments));
  const suivi = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'export.json'), 'utf8'));
  assert.equal(suivi.etat, 'fini');
  assert.equal(suivi.mode, 'fidele');
});

test('interrompu après un segment : le segment fini est repris au second export ; page modifiée : rien n\'est repris', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r1 = await exporter(dir, { arreterApres: 1 });
  assert.equal(r1.ok, false);
  assert.match(r1.message, /annulé/);
  assert.deepEqual([...cache(dir).pixels, ...cache(dir).derives].filter((f) => f.endsWith('.part')), []);
  assert.equal(cache(dir).pixels.length, 1);
  const r2 = await exporter(dir);
  assert.equal(r2.ok, true, r2.message);
  assert.equal(r2.segmentsRepris, 1);
  // Titre de l'intro changé : l'intro, et « chiffre » dont l'entrée la chevauche, sont refaites.
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Autre titre'; });
  const r4 = await exporter(dir);
  assert.equal(r4.ok, true, r4.message);
  assert.equal(r4.segmentsRepris, 0);
  assert.deepEqual(r4.scenesRecapturees, ['intro', 'chiffre']);
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
  const [segment] = cache(dir).pixels;
  const { images } = await F.sonder({ ffprobe: outil.cheminProbe, fichier: segment, compter: 'paquets' });
  const { pngRGBA } = require('./aide/png.js');
  const noir = pngRGBA(1280, 720, () => [0, 0, 0, 255]);
  async function* noires() { for (let k = 0; k < images; k++) yield noir; }
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

const ajouterMusique = (dir, duree) => {
  const { execFileSync } = require('node:child_process');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  execFileSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${duree}`, path.join(dir, 'assets', 'musique.wav')]);
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav', volume: 0.7 }; });
};

test('son : musique du déroulé ajoutée (AAC, durée de l\'image) ; plus courte : silence ensuite', sans, async () => {
  const dir = copierProjet('projet-simple');
  ajouterMusique(dir, 4);
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, true);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.equal(s.audio, 'aac');
  assert.ok(Math.abs(s.dureeAudio - r.duree) < 0.1, `${s.dureeAudio} / ${r.duree}`);
});

test('son : musique illisible, vidéo muette exportée avec un avertissement', sans, async () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'musique.mp3'), 'pas du son');
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.mp3' }; });
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, false);
  assert.match(r.avertissement, /musique n'a pas pu être lue.*pas de son/);
});

test('deux navigateurs en parallèle : même résultat ; interruption : tout arrêté, aucun .part', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporter(dir, { paralleles: 2, dureeSegment: 2 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.paralleles, 2);
  assert.equal(r.images, 73);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.equal(s.images, 73);
  const dir2 = copierProjet('projet-simple');
  const controle = new AbortController();
  setTimeout(() => controle.abort(), 1500);
  const r2 = await exporter(dir2, { paralleles: 2, dureeSegment: 2, signal: controle.signal });
  assert.equal(r2.ok, false);
  assert.deepEqual([...cache(dir2).pixels, ...cache(dir2).derives].filter((f) => f.endsWith('.part')), []);
  assert.equal(fs.existsSync(path.join(dir2, 'sortie', '.export', 'verrou')), false);
});

test('revue : musique et durée qui ne tombe pas juste (7,25 s à 30 i/s) : toutes les images gardées', sans, async () => {
  const dir = copierProjet('projet-simple');
  ajouterMusique(dir, 9);
  const r = await exporter(dir, { ips: 30, dureeSegment: 10 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, true);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.equal(s.images, 218);
});

test('revue : musique absente du disque, avertissement « introuvable »', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/absente.mp3' }; });
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  assert.match(r.avertissement, /musique est introuvable/);
});

test('son : sonie du MP4 égale à celle annoncée par la page (±1 LU) ; changer seulement la musique ou son volume ne refait pas les images', sans, async () => {
  const dir = copierProjet('projet-simple');
  ajouterMusique(dir, 10);
  const r = await exporter(dir, { ips: 5, dureeSegment: 3 });
  assert.equal(r.ok, true, r.message);
  const m = await F.mesurerSonie({ ffmpeg: outil.chemin, fichier: r.fichier });
  // Volume 0,7 : 20·log10(0,7) ≈ −3,1 dB sous la sonie de référence (−16 LUFS).
  assert.ok(Math.abs(m.integree - (-16 + 20 * Math.log10(0.7))) < 1, String(m.integree));
  // Seuls la musique et son volume changent : toutes les images sont reprises.
  const { execFileSync } = require('node:child_process');
  execFileSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=550:duration=10', path.join(dir, 'assets', 'musique.wav')]);
  modifierDeroule(dir, (d) => { d.musique.volume = 0.5; });
  const r2 = await exporter(dir, { ips: 5, dureeSegment: 3 });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(r2.segmentsRepris, r2.segments);
  assert.deepEqual(r2.scenesRecapturees, []);
});

test('revue : vidéo de 0,3 s avec musique : exportée (sonie non vérifiable sous 0,4 s)', sans, async () => {
  const dir = copierProjet('projet-simple');
  ajouterMusique(dir, 2);
  modifierDeroule(dir, (d) => { d.scenes = [{ ...d.scenes[0], duree: 0.3, transition: 'aucune' }]; });
  const r = await exporter(dir, { ips: 10 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, true);
});

test('revue : musique muette (volume 0) : exportée avec sa piste, sans vérification de sonie', sans, async () => {
  const dir = copierProjet('projet-simple');
  ajouterMusique(dir, 8);
  modifierDeroule(dir, (d) => { d.musique.volume = 0; });
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, true);
});

test('revue : musique dans un format non embarquable (.flac) : avertissement, vidéo muette', sans, async () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'musique.flac'), Buffer.alloc(100, 1));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.flac' }; });
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, false);
  assert.match(r.avertissement, /musique « assets\/musique\.flac » n'a pas pu être embarquée/);
});

test('revue : l\'export fidèle écrit les sous-titres du texte actuel (sans passer par l\'aperçu)', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.sousTitres = {}; d.scenes[0].voix = { texte: 'Un texte ancien.' }; });
  require('../scripts/assembler.js').assembler({ dossier: dir, dossierStyles: STYLES });
  modifierDeroule(dir, (d) => { d.scenes[0].voix.texte = 'Un texte retouché.'; });
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  const srt = fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.srt'), 'utf8');
  assert.match(srt, /Un texte retouché\./);
  assert.match(fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.vtt'), 'utf8'), /Un texte retouché\./);
});

test('correctifs : empreinte des pixels indépendante des volumes et de la partition', () => {
  const { empreintesPixels } = require('../scripts/lib/empreintes.js');
  const { assembler } = require('../scripts/assembler.js');
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.bruitages = { transitions: true, volume: 1 }; });
  const base = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  base.donnees.musique = { volume: 1, source: 'pm-son-musique', partition: null };
  const segments = [{ scene: 'intro', morceau: 0, debut: 0, fin: 10 }, { scene: 'chiffre', morceau: 0, debut: 10, fin: 20 }];
  const reglages = { moteur: 'm', segments, cadence: 30, largeur: 1920, hauteur: 1080 };
  const autre = JSON.parse(JSON.stringify(base));
  autre.donnees.musique.volume = 0.4; autre.donnees.bruitages.volume = 0.2; autre.donnees.musique.partition = { tempo: 90, pistes: [] };
  assert.deepEqual(empreintesPixels(base, reglages), empreintesPixels(autre, reglages));
  const plusLong = JSON.parse(JSON.stringify(base)); plusLong.donnees.scenes[0].duree = 5;
  assert.notDeepEqual(empreintesPixels(base, reglages), empreintesPixels(plusLong, reglages));
  assert.notDeepEqual(empreintesPixels(base, reglages), empreintesPixels(base, { ...reglages, cadence: 60 }));
});
