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
  // Segments : intermédiaires (pixels/) et fichiers dérivés du web, écrits ensemble (spec Rendu et export, 5.1.7).
  const rangement = fs.readdirSync(path.join(dir, 'sortie', '.export', 'segments'));
  assert.deepEqual(rangement.filter((f) => !f.endsWith('.mp4')).sort(), ['dernier.json', 'pixels']);
  assert.equal(rangement.filter((f) => f.endsWith('.mp4')).length, r.segments);
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
  // L'intermédiaire et le fichier dérivé du web (écrits ensemble, S5) : tous deux remplacés par des images noires.
  const segments = [...cache(dir).pixels, ...cache(dir).derives];
  assert.equal(segments.length, 2);
  const { images } = await F.sonder({ ffprobe: outil.cheminProbe, fichier: segments[0], compter: 'paquets' });
  const { pngRGBA } = require('./aide/png.js');
  const noir = pngRGBA(1280, 720, () => [0, 0, 0, 255]);
  async function* noires() { for (let k = 0; k < images; k++) yield noir; }
  for (const segment of segments) {
    fs.rmSync(segment);
    await F.encoderSegment({ ffmpeg: outil.chemin, sortie: segment, ips: 10, crf: 21, images: noires() });
  }
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

// --- Spec S2, 5.12 : vérification de l'export -------------------------------------------------------------------------

test('export-fidele.test.js › statistiques écrites à côté de chaque segment, sans seconde capture', sans, async () => {
  const dir = copierProjet('projet-simple');
  let captures = 0;
  const surOuverture = (c) => { const avant = c.capturer; c.capturer = (...a) => { captures++; return avant(...a); }; };
  const r = await exporter(dir, { surOuverture });
  assert.equal(r.ok, true, r.message);
  assert.equal(captures, r.images, 'une capture par image, pas une de plus');
  for (const segment of cache(dir).pixels) {
    const st = JSON.parse(fs.readFileSync(`${segment}.stats.json`, 'utf8'));
    const { images } = await F.sonder({ ffprobe: outil.cheminProbe, fichier: segment, compter: 'paquets' });
    assert.equal(st.images, images);
    assert.equal(st.largeur, 192);
    assert.equal(st.hauteur, 108);
    assert.equal(st.m.length, images);
    assert.equal(st.d[0], null);
    assert.equal(st.bords.premieres.length, 2);
  }
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  assert.equal(v.version, 1);
  assert.equal(v.fichier, 'sortie/la-chaine-du-froid.mp4');
  // S5 ajoute ses vérifications propres (5.22 point 4) : les couleurs étiquetées.
  // La vignette intégrée (spec Rendu et export, 5.10) est vérifiée sur le fichier de l'usage web.
  assert.deepEqual(v.faites, ['images', 'noirs', 'couleurs', 'vignette']);
  assert.deepEqual(v.nonFaites, [{ quoi: 'son', pourquoi: 'la vidéo n\'a pas de son' }]);
  // Le style de test n'anime pas les entrées : le titre et le compteur apparaissent d'un coup (saut-image, à juste titre).
  assert.deepEqual(r.verification, { erreurs: 0, alertes: v.problemes.length, fichier: 'sortie/verification.json' });
  assert.ok(v.problemes.length >= 1 && v.problemes.every((p) => p.regle === 'saut-image' && p.gravite === 'alerte'), JSON.stringify(v.problemes));
  assert.ok(v.problemes.some((p) => p.scene === 'intro' && p.instant === 0.3), 'le titre qui apparaît d’un coup à 0,3 s');
  // Repris au second export : ses statistiques restent, la vérification les relit.
  const r2 = await exporter(dir);
  assert.equal(r2.segmentsRepris, r2.segments);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8')).faites.includes('images'));
});

test('export-fidele.test.js › une seule passe ffmpeg pour sonie, crête, noirs et silences', sans, async () => {
  const dir = copierProjet('projet-simple');
  ajouterMusique(dir, 9);
  const appels = { verifier: 0, sonie: 0, compter: [] };
  const avant = { verifier: F.verifierFichier, sonie: F.mesurerSonie, sonder: F.sonder };
  F.verifierFichier = (o) => { appels.verifier++; return avant.verifier(o); };
  F.mesurerSonie = (o) => { appels.sonie++; return avant.sonie(o); };
  F.sonder = (o) => { if (/la-chaine-du-froid\.mp4\.part$/.test(o.fichier)) appels.compter.push(o.compter || 'images'); return avant.sonder(o); };
  try {
    const r = await exporter(dir, { ips: 5 });
    assert.equal(r.ok, true, r.message);
  } finally {
    Object.assign(F, { verifierFichier: avant.verifier, mesurerSonie: avant.sonie, sonder: avant.sonder });
  }
  assert.equal(appels.verifier, 1);
  assert.equal(appels.sonie, 0);
  assert.deepEqual(appels.compter, ['aucun'], 'ffprobe ne décode plus le fichier final');
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  for (const f of ['images', 'noirs', 'silences', 'sonie', 'crete']) assert.ok(v.faites.includes(f), f);
  assert.ok(Number.isFinite(v.mesures.sonie) && Number.isFinite(v.mesures.crete), JSON.stringify(v.mesures));
});

test('export-fidele.test.js › noir-export : un segment noirci après coup fait échouer l\'export et il est retiré', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r1 = await exporter(dir);
  assert.equal(r1.ok, true, r1.message);
  // Le deuxième segment du web (fichier dérivé, S5) garde sa première image (il est repris) mais devient noir ensuite ; les
  // statistiques de son intermédiaire disent la page.
  const inter = cache(dir).pixels.sort().find((f) => /-01\.mp4$/.test(f) && fs.existsSync(`${f}.stats.json`) && JSON.parse(fs.readFileSync(`${f}.stats.json`, 'utf8')).images >= 10);
  assert.ok(inter, 'un segment d\'au moins une seconde');
  let segment = null;
  let images = 0;
  for (const f of cache(dir).derives.filter((x) => /-01\.mp4$/.test(x)).sort()) {
    const n = (await F.sonder({ ffprobe: outil.cheminProbe, fichier: f, compter: 'paquets' })).images;
    if (n >= 10) { segment = f; images = n; break; }
  }
  assert.ok(segment, 'un fichier dérivé d\'au moins une seconde');
  const premiere = await F.extraireImage({ ffmpeg: outil.chemin, fichier: segment, t: 0 });
  const { pngRGBA } = require('./aide/png.js');
  const noir = pngRGBA(1280, 720, () => [0, 0, 0, 255]);
  async function* noircies() { for (let k = 0; k < images; k++) yield k < 2 ? premiere : noir; }
  fs.rmSync(segment);
  await F.encoderSegment({ ffmpeg: outil.chemin, sortie: segment, ips: 10, crf: 21, images: noircies() });
  const r2 = await exporter(dir);
  assert.equal(r2.ok, false);
  assert.match(r2.message, /La vidéo exportée a [\d,]+ s d'images noires vers [\d,]+ s qui n'existent pas dans la page ; l'export est abîmé : relancez-le\./);
  assert.equal(r2.verification.erreurs, 1);
  assert.equal(fs.existsSync(segment), false, 'le segment noirci est retiré');
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  assert.ok(v.problemes.some((p) => p.regle === 'noir-export' && p.gravite === 'erreur'));
  // Relancé : refait, et juste.
  const r3 = await exporter(dir);
  assert.equal(r3.ok, true, r3.message);
});

// --- Spec Rendu et export (S5), jalon 1 ---------------------------------------------------------------------------------

/** Options x264 inscrites par l'encodeur dans le premier segment du fichier (« x264 - core … options: … »). */
function optionsX264(fichier) {
  const octets = fs.readFileSync(fichier);
  const debut = octets.indexOf('x264 - core');
  assert.ok(debut >= 0, 'en-tête x264 absent');
  const texte = octets.toString('latin1', debut, Math.min(octets.length, debut + 4000));
  const options = texte.slice(texte.indexOf('options: ') + 9).split('\0')[0];
  return Object.fromEntries(options.split(' ').map((o) => o.split('=')));
}

test('export-fidele.test.js › les options x264 inscrites dans le fichier (crf, aq-mode, tune, keyint) sont celles de l\'usage', sans, async () => {
  const dir = copierProjet('projet-simple');
  const web = await exporter(dir);
  assert.equal(web.ok, true, web.message);
  const w = optionsX264(web.fichier);
  // Web : CRF 18, aq-mode 3 à 0,8, tune animation (déblocage 1:1, psy-rd 0,4), image clé toutes les 2 s (10 i/s), 8 Mbit/s au plus (×0,5 en 720p).
  assert.deepEqual([w.crf, w.aq, w.deblock, w.psy_rd, w.keyint, w.vbv_maxrate, w.vbv_bufsize], ['18.0', '3:0.80', '1:1:1', '0.40:0.00', '20', '4000', '8000']);
  const reseaux = await exporter(dir, { pour: 'reseaux' });
  assert.equal(reseaux.ok, true, reseaux.message);
  const r = optionsX264(reseaux.fichier);
  assert.deepEqual([r.crf, r.aq, r.keyint, r.vbv_maxrate], ['17.0', '3:0.80', '10', '6000']);
});

test('export-fidele.test.js › web puis reseaux : le second ne recapture aucune image', sans, async () => {
  const dir = copierProjet('projet-simple');
  const web = await exporter(dir);
  assert.equal(web.ok, true, web.message);
  let captures = 0;
  const surOuverture = (c) => { const avant = c.capturer; c.capturer = (...a) => { captures++; return avant(...a); }; };
  const reseaux = await exporter(dir, { pour: 'reseaux', surOuverture });
  assert.equal(reseaux.ok, true, reseaux.message);
  assert.deepEqual(reseaux.scenesRecapturees, []);
  assert.equal(reseaux.segmentsReencodes, reseaux.segments, 'chaque segment dérivé de l\'intermédiaire commun');
  // Seules les images témoins et la première de chaque segment sont capturées, pour vérifier : aucune image du film.
  assert.ok(captures <= reseaux.segments + 3, String(captures));
  assert.equal(path.basename(reseaux.fichier), 'la-chaine-du-froid-reseaux.mp4');
  assert.ok(fs.existsSync(web.fichier));
});

test('export-fidele.test.js › master : son propre intermédiaire, sans transcodage', sans, async () => {
  const dir = copierProjet('projet-simple');
  const web = await exporter(dir);
  assert.equal(web.ok, true, web.message);
  const communs = cache(dir).pixels.length;
  const master = await exporter(dir, { pour: 'master' });
  assert.equal(master.ok, true, master.message);
  assert.equal(master.segmentsReencodes, 0);
  assert.deepEqual(master.scenesRecapturees.sort(), ['chiffre', 'intro']);
  const m = optionsX264(master.fichier);
  assert.deepEqual([m.crf, m.subme], ['14.0', '8'], 'CRF 14, preset slow');
  // Deux intermédiaires gardés (le commun et celui du master), aucun fichier dérivé pour le master.
  assert.equal(cache(dir).pixels.length, communs + master.segments);
  assert.equal(path.basename(master.fichier), 'la-chaine-du-froid-master.mp4');
  // Réexport du master : repris tel quel.
  const encore = await exporter(dir, { pour: 'master' });
  assert.equal(encore.segmentsRepris, encore.segments);
});

test('export-fidele.test.js › vignette absente, étiquette de couleur absente ou taille dépassée : échec avec message, aucun fichier final', sans, async () => {
  const bon = { couleurs: { espace: 'bt709', primaires: 'bt709', transfert: 'bt709', plage: 'tv' }, octets: 9e6, vignette: true, chapitres: 3, alpha: true };
  assert.deepEqual(F.controlesSortie(bon, { etiquettes: true, octetsMax: 10e6, vignette: true, chapitres: true, alpha: true }), []);
  assert.match(F.controlesSortie({ ...bon, vignette: false }, { vignette: true })[0], /^La vignette n'a pas pu être intégrée à la vidéo : l'export s'arrête, rien n'est écrit\.$/);
  assert.match(F.controlesSortie({ ...bon, couleurs: { espace: null } }, { etiquettes: true })[0], /^Les couleurs de la vidéo ne sont pas marquées comme il faut/);
  assert.equal(F.controlesSortie({ ...bon, octets: 10.6e6 }, { octetsMax: 10e6, nom: 'courriel' })[0], 'La version courriel fait 10,6 Mo, au-dessus des 10 Mo demandés : je peux viser 12 Mo, ou exporter une seule scène.');
  // Dans l'export : un fichier sans étiquettes de couleur (ffprobe simulé) n'est jamais écrit.
  const dir = copierProjet('projet-simple');
  const avant = F.sonder;
  F.sonder = async (o) => { const s = await avant(o); return /la-chaine-du-froid\.mp4\.part$/.test(o.fichier) ? { ...s, couleurs: { espace: null } } : s; };
  try {
    const r = await exporter(dir);
    assert.equal(r.ok, false);
    assert.match(r.message, /^Les couleurs de la vidéo ne sont pas marquées comme il faut/);
  } finally { F.sonder = avant; }
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4')), false);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sortie')).filter((f) => f.endsWith('.part')), []);
  // Relancé normalement : écrit, avec les couleurs vérifiées.
  const r2 = await exporter(dir);
  assert.equal(r2.ok, true, r2.message);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8')).faites.includes('couleurs'));
});

test('export-fidele.test.js › le champ verification est présent dans les deux voies', sans, async () => {
  const { exporterVideo } = require('../scripts/exporter.js');
  const dir = copierProjet('projet-simple');
  const f = await exporter(dir);
  const n = await exporterVideo({ dossier: dir, dossierStyles: STYLES, navigateur });
  for (const [voie, r] of [['fidele', f], ['navigateur', n]]) {
    assert.equal(r.ok, true, `${voie} : ${r.message}`);
    assert.equal(r.verification.fichier, 'sortie/verification.json', voie);
    assert.ok(Number.isInteger(r.verification.erreurs) && Number.isInteger(r.verification.alertes), voie);
  }
});

test('export-fidele.test.js › deux exports simultanés du même projet : le second refusé avec l\'heure du premier', sans, async () => {
  const dir = copierProjet('projet-simple');
  const travail = path.join(dir, 'sortie', '.export');
  fs.mkdirSync(travail, { recursive: true });
  const date = new Date(2026, 10, 10, 14, 2, 0);
  fs.writeFileSync(path.join(travail, 'verrou'), JSON.stringify({ pid: process.pid, date: new Date(Date.now() - 60000).toISOString() }));
  const r = await exporter(dir);
  assert.equal(r.ok, false);
  assert.match(r.message, /^Un export de cette vidéo est déjà en cours \(commencé à \d{1,2} h \d{2}\) : attendez sa fin\.$/);
  // Deux exports lancés ensemble : un seul passe, l'autre dit l'heure du premier.
  fs.rmSync(path.join(travail, 'verrou'));
  const [x, y] = await Promise.all([exporter(dir, { ips: 5 }), exporter(dir, { ips: 5 })]);
  assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
  assert.match((x.ok ? y : x).message, /^Un export de cette vidéo est déjà en cours \(commencé à \d{1,2} h \d{2}\) : attendez sa fin\.$/);
  const { messageVerrou } = require('../scripts/export-fidele.js');
  assert.equal(messageVerrou(date.toISOString()), 'Un export de cette vidéo est déjà en cours (commencé à 14 h 02) : attendez sa fin.');
});

test('export-fidele.test.js › verrou d\'un processus mort : ignoré', sans, async () => {
  const { spawnSync } = require('node:child_process');
  const dir = copierProjet('projet-simple');
  const travail = path.join(dir, 'sortie', '.export');
  fs.mkdirSync(travail, { recursive: true });
  const mort = spawnSync(process.execPath, ['-e', '0']).pid;
  fs.writeFileSync(path.join(travail, 'verrou'), JSON.stringify({ pid: mort, date: new Date().toISOString() }));
  const r = await exporter(dir, { ips: 5 });
  assert.equal(r.ok, true, r.message);
  assert.equal(fs.existsSync(path.join(travail, 'verrou')), false);
});

test('export-fidele.test.js › exception dans une scène pendant l\'export : échec avec le nom de la scène et l\'instant', sans, async () => {
  const dir = copierProjet('projet-simple');
  // Le script de la page échoue à partir de 5 s (scène « chiffre ») : rejet non traité, vu par Runtime.exceptionThrown.
  const surOuverture = (c) => c.evaluer(`(function () {
    var seek = M.seek;
    M.seek = function (t) { return Promise.resolve(seek.call(M, t)).then(function (r) { if (t >= 5) Promise.reject(new Error('boum')); return r; }); };
    return true;
  })()`);
  const r = await exporter(dir, { surOuverture: (c) => { surOuverture(c); } });
  assert.equal(r.ok, false);
  assert.match(r.message, /^La scène « chiffre » a une erreur de script vers 5(,\d)? s : l'export s'arrête, rien n'est écrit\.$/);
  assert.equal(r.erreurScript.scene, 'chiffre');
  assert.match(r.erreurScript.detail, /boum/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4')), false);
});
