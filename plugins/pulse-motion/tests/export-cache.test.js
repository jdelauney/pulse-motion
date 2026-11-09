'use strict';
/* Cache d'export par scène (spec Rapidité 5.16) : segments alignés sur les scènes, empreinte des pixels et empreinte du
 * fichier dérivé séparées, réexport qui ne recapture que les scènes changées, verrou, ancien dossier de travail. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { assembler } = require('../scripts/assembler.js');
const F = require('../scripts/lib/ffmpeg.js');
const { decouperSegments, empreintesPixels, empreinteDerivee } = require('../scripts/lib/empreintes.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };
const exporter = (dir, options = {}) => exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1, ...options });

/** Projet de 3 scènes coupées (aucune entrée ne chevauche la précédente) : intro, chiffre, fin. */
function projet3() {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '03-fin.html'), fs.readFileSync(path.join(dir, 'scenes', '01-intro.html'), 'utf8').replace('data-scene="intro"', 'data-scene="fin"'));
  modifierDeroule(dir, (d) => {
    d.scenes[0].transition = 'coupe';
    d.scenes[1].transition = 'coupe';
    d.scenes.push({ id: 'fin', fichier: 'scenes/03-fin.html', duree: 4, textes: { titre: 'À retenir', sous: 'Le froid protège' }, transition: 'coupe' });
  });
  return dir;
}

/** Empreinte MD5 de chaque image décodée d'une vidéo (ffmpeg -f framemd5). */
function imagesDecodees(fichier) {
  const r = spawnSync(outil.chemin, ['-hide_banner', '-loglevel', 'error', '-i', fichier, '-map', '0:v:0', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
}

// ---------- Découpage et empreintes (fonctions pures) ----------

test('decouperSegments : un segment par scène, de son entrée (chevauchement compris) à l\'entrée de la suivante ; scène longue en morceaux égaux', () => {
  const minutage = { duree: 25, scenes: [{ id: 'a', debut: 0 }, { id: 'b', debut: 3.5 }, { id: 'c', debut: 7 }] };
  const s = decouperSegments(minutage, 10, 10);
  assert.deepEqual(s.map((g) => [g.scene, g.morceau, g.debut, g.fin]), [['a', 0, 0, 35], ['b', 0, 35, 70], ['c', 0, 70, 160], ['c', 1, 160, 250]]);
  // Début entre deux images : la première image affichée après le début de la scène.
  assert.deepEqual(decouperSegments({ duree: 2, scenes: [{ id: 'a', debut: 0 }, { id: 'b', debut: 1.01 }] }, 10).map((g) => g.debut), [0, 11]);
  // Scène plus courte qu'une image : aucun segment ; la vidéo reste couverte.
  const court = decouperSegments({ duree: 2, scenes: [{ id: 'a', debut: 0 }, { id: 'b', debut: 1.01 }, { id: 'c', debut: 1.04 }] }, 10);
  assert.deepEqual(court.map((g) => g.scene), ['a', 'c']);
  assert.equal(court.reduce((n, g) => n + g.fin - g.debut, 0), 20);
});

/** Assemblage de projet3, segments et réglages de référence. */
function reference() {
  const dir = projet3();
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const segments = [{ scene: 'intro', morceau: 0, debut: 0, fin: 20 }, { scene: 'chiffre', morceau: 0, debut: 20, fin: 39 }, { scene: 'fin', morceau: 0, debut: 39, fin: 59 }];
  const reglages = { moteur: 'moteur', options: {}, segments, cadence: 5, largeur: 1280, hauteur: 720, extra: { navigateur: 'Chrome/1', gpu: false, pixels: {} } };
  return { dir, a, segments, reglages };
}
const copie = (x) => JSON.parse(JSON.stringify(x));

test('cache-scene-jamais-de-scene-perimee : chaque champ des deux empreintes, modifié tour à tour, invalide les segments qu\'il touche', () => {
  const { a, reglages } = reference();
  const base = empreintesPixels(a, reglages);
  assert.equal(new Set(base).size, 3);
  const scene = (id) => a.parScene.findIndex((p) => p.id === id);
  /** Modifie la section d'une scène dans l'assemblage et dans la page (comme le ferait l'assemblage). */
  const section = (x, id, fn) => { const p = x.parScene[scene(id)]; const neuve = fn(p.section); x.html = x.html.split(p.section).join(neuve); p.section = neuve; };
  const cas = {
    // Champs propres à la scène « chiffre » : seul son segment change.
    'section de la scène': [(x) => section(x, 'chiffre', (t) => t.replace('</section>', '<p>x</p></section>')), ['chiffre']],
    'scripts de la scène': [(x) => {
      // Comme l'assemblage : le script est aussi dans la page.
      const p = x.parScene[scene('chiffre')];
      if (p.scripts.length) x.html = x.html.split(p.scripts[0]).join('M.x = 1;');
      else x.html = x.html.replace('</body>', '<script>M.x = 1;</script></body>');
      p.scripts = ['M.x = 1;', ...p.scripts.slice(1)];
    }, ['chiffre']],
    'données de la scène': [(x) => { x.donnees.scenes[1].textes = { legende: 'autre' }; }, ['chiffre']],
    'rythme (minutage)': [(x) => { x.donnees.scenes[1].rythme = 0.5; }, ['chiffre', 'fin']],
    'effets de la scène': [(x) => { x.effets = [{ scene: 'chiffre', effet: { nom: 'etincelles' } }]; }, ['chiffre']],
    'milieux de la scène': [(x) => { x.milieux = [{ scene: 'chiffre', effet: { nom: 'brume' } }]; }, ['chiffre']],
    'shaders de la scène': [(x) => { x.shaders = [{ scene: 'chiffre', usage: 'fond', code: 'x' }]; }, ['chiffre']],
    'obstacles de la scène': [(x) => { x.donnees.obstacles = [{ scene: 'chiffre', forme: 'boite' }]; }, ['chiffre']],
    'sous-titres de la scène': [(x) => { x.donnees.sousTitres = { mode: 'auto', incrustes: true, position: 'bas', cartons: [{ scene: 'chiffre', debut: 4.5, fin: 5, lignes: [] }] }; }, null],
    // Champs communs : tous les segments changent.
    'CSS de la page': [(x) => { x.cssPage = `${x.cssPage} .a{}`; }, ['intro', 'chiffre', 'fin']],
    format: [(x) => { x.donnees.format = { ...x.donnees.format, ratio: '1:1' }; }, ['intro', 'chiffre', 'fin']],
    tempo: [(x) => { x.donnees.tempo = { bpm: 100, decalage: 0 }; }, ['intro', 'chiffre', 'fin']],
    'son réactif': [(x) => { x.donnees.son = { pistes: ['musique'] }; }, ['intro', 'chiffre', 'fin']],
    'obstacles de la vidéo': [(x) => { x.donnees.obstaclesVideo = [{ forme: 'sol' }]; }, ['intro', 'chiffre', 'fin']],
    modules: [(x) => { x.donnees.modules = { a: 'x' }; }, ['intro', 'chiffre', 'fin']],
    personnages: [(x) => { x.donnees.personnages = { touffu: {} }; }, ['intro', 'chiffre', 'fin']],
    'post-traitement de la vidéo': [(x) => { x.shaders = [{ scene: null, usage: 'post', code: 'x' }]; }, ['intro', 'chiffre', 'fin']],
    'squelette de la page (attribut de #pm-scene)': [(x) => { x.html = x.html.replace('<div id="pm-scene"', '<div id="pm-scene" data-camera="zoom 1→2 0+9"'); }, ['intro', 'chiffre', 'fin']],
  };
  for (const [nom, [modifier, touchees]] of Object.entries(cas)) {
    const x = copie(a);
    modifier(x);
    const e = empreintesPixels(x, reglages);
    const changees = ['intro', 'chiffre', 'fin'].filter((id, i) => e[i] !== base[i]);
    if (touchees) assert.deepEqual(changees, touchees, nom);
    else assert.ok(changees.includes('chiffre'), nom);
  }
  // Réglages de capture : moteur, cadence, taille, première image, nombre d'images, navigateur, GPU, réglages de pixels.
  const reglagesCas = {
    moteur: { moteur: 'autre moteur' },
    cadence: { cadence: 10 },
    taille: { largeur: 1920, hauteur: 1080 },
    navigateur: { extra: { ...reglages.extra, navigateur: 'Chrome/2' } },
    gpu: { extra: { ...reglages.extra, gpu: true } },
    'réglages de pixels (S5)': { extra: { ...reglages.extra, pixels: { flou: 0.5 } } },
  };
  for (const [nom, r] of Object.entries(reglagesCas)) {
    const e = empreintesPixels(a, { ...reglages, ...r });
    assert.ok(e.every((v, i) => v !== base[i]), nom);
  }
  const decale = copie(reglages.segments); decale[2].debut = 40;
  assert.deepEqual(empreintesPixels(a, { ...reglages, segments: decale }).map((v, i) => v !== base[i]), [false, false, true], 'première image');
  const raccourci = copie(reglages.segments); raccourci[2].fin = 58;
  assert.deepEqual(empreintesPixels(a, { ...reglages, segments: raccourci }).map((v, i) => v !== base[i]), [false, false, true], 'nombre d\'images');
  // Fichier dérivé : pixels et chaque réglage d'encodage ; les réglages d'encodage ne touchent jamais les pixels.
  const enc = { crf: 21, preset: 'medium' };
  const d0 = empreinteDerivee(base[0], enc);
  assert.notEqual(empreinteDerivee(base[1], enc), d0);
  assert.notEqual(empreinteDerivee(base[0], { ...enc, crf: 23 }), d0);
  assert.notEqual(empreinteDerivee(base[0], { ...enc, preset: 'slow' }), d0);
  assert.notEqual(empreinteDerivee(base[0], { ...enc, tune: 'animation' }), d0);
  assert.equal(empreinteDerivee(base[0], { preset: 'medium', crf: 21 }), d0, 'ordre des champs indifférent');
});

test('cache-scene-post-global-invalide-tout : post-traitement de la vidéo, son réactif, caméra hors des scènes → une empreinte commune change', () => {
  const { a, reglages } = reference();
  const base = empreintesPixels(a, reglages);
  const avecPost = copie(a); avecPost.shaders = [...(avecPost.shaders || []), { scene: null, usage: 'post', nom: 'grain', code: 'x' }];
  assert.ok(empreintesPixels(avecPost, reglages).every((v, i) => v !== base[i]), 'post-traitement');
  const reactif = copie(a); reactif.donnees.son = { pistes: ['musique'] };
  const e1 = empreintesPixels(reactif, reglages);
  assert.ok(e1.every((v, i) => v !== base[i]), 'son réactif');
  // Son réactif : changer la musique change toutes les images.
  const autreSon = copie(reactif); autreSon.html = autreSon.html.replace('</body>', '<script type="text/plain" id="pm-son-musique">data:audio/wav;base64,AAAA</script></body>');
  assert.ok(empreintesPixels(autreSon, reglages).every((v, i) => v !== e1[i]), 'son réactif, autre musique');
  // Sans son réactif, une source sonore ne change aucune image.
  const sonSeul = copie(a); sonSeul.html = sonSeul.html.replace('</body>', '<script type="text/plain" id="pm-son-musique">data:audio/wav;base64,AAAA</script></body>');
  assert.deepEqual(empreintesPixels(sonSeul, reglages), base, 'source sonore sans son réactif');
});

// ---------- Export réel ----------

test('cache-scene-recapture-seulement-la-scene-changee : une scène retouchée est seule recapturée ; entrée qui chevauche : la suivante aussi', sans, async () => {
  const dir = projet3();
  const r1 = await exporter(dir);
  assert.equal(r1.ok, true, r1.message);
  assert.deepEqual(r1.scenesRecapturees, ['intro', 'chiffre', 'fin']);
  assert.equal(r1.segmentsRepris, 0);
  modifierDeroule(dir, (d) => { d.scenes[1].textes.legende = 'bactéries en 2 h'; });
  const r2 = await exporter(dir);
  assert.equal(r2.ok, true, r2.message);
  assert.deepEqual(r2.scenesRecapturees, ['chiffre']);
  assert.equal(r2.segmentsRepris, r2.segments - 1);
  // La scène « fin » entre en fondu : son segment commence plus tôt (« chiffre » encore visible), celui de « chiffre » finit
  // plus tôt ; l'intro est reprise.
  modifierDeroule(dir, (d) => { d.scenes[2].transition = 'fondu'; });
  const r3 = await exporter(dir);
  assert.equal(r3.ok, true, r3.message);
  assert.deepEqual(r3.scenesRecapturees, ['chiffre', 'fin']);
  // Puis « chiffre » retouchée : « fin », qui la montre pendant son entrée, est refaite aussi.
  modifierDeroule(dir, (d) => { d.scenes[1].textes.legende = 'bactéries en 3 h'; });
  const r4 = await exporter(dir);
  assert.equal(r4.ok, true, r4.message);
  assert.deepEqual(r4.scenesRecapturees, ['chiffre', 'fin']);
  assert.deepEqual(r4.images, Math.round(r4.duree * 5));
});

test('cache-scene-duree-changee-invalide-les-suivantes : allonger une scène refait la suivante, pas la précédente', sans, async () => {
  const dir = projet3();
  assert.equal((await exporter(dir)).ok, true);
  modifierDeroule(dir, (d) => { d.scenes[1].duree = 4; });
  const r = await exporter(dir);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.scenesRecapturees, ['chiffre', 'fin']);
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 5; });
  const r2 = await exporter(dir);
  assert.deepEqual(r2.scenesRecapturees, ['intro', 'chiffre', 'fin']);
});

test('cache-scene-meme-mp4-que-export-complet : après une retouche, le réexport donne les mêmes images qu\'un export complet', sans, async () => {
  const dir = projet3();
  assert.equal((await exporter(dir, { dureeSegment: 2 })).ok, true);
  const retouche = (d) => { d.scenes[1].textes.legende = 'bactéries en 2 h'; };
  modifierDeroule(dir, retouche);
  const partiel = await exporter(dir, { dureeSegment: 2 });
  assert.equal(partiel.ok, true, partiel.message);
  assert.deepEqual(partiel.scenesRecapturees, ['chiffre']);
  const neuf = projet3();
  modifierDeroule(neuf, retouche);
  const complet = await exporter(neuf, { dureeSegment: 2, paralleles: 2 });
  assert.equal(complet.ok, true, complet.message);
  assert.equal(complet.segmentsRepris, 0);
  const a = imagesDecodees(partiel.fichier);
  const b = imagesDecodees(complet.fichier);
  assert.equal(a.length, partiel.images);
  assert.deepEqual(a, b);
});

test('cache-scene-autre-encodage-sans-recapture : seul un réglage d\'encodage change, aucune image recapturée, segments réencodés depuis l\'intermédiaire', sans, async () => {
  const dir = projet3();
  const r1 = await exporter(dir);
  assert.equal(r1.ok, true, r1.message);
  const taille1 = fs.statSync(r1.fichier).size;
  const r2 = await exporter(dir, { encodage: { crf: 35 } });
  assert.equal(r2.ok, true, r2.message);
  assert.deepEqual(r2.scenesRecapturees, []);
  assert.equal(r2.segmentsReencodes, r2.segments);
  assert.equal(r2.segmentsRepris, 0);
  assert.ok(fs.statSync(r2.fichier).size < taille1, 'CRF 35 : fichier plus léger');
  const seg = path.join(dir, 'sortie', '.export', 'segments');
  assert.equal(fs.readdirSync(seg).filter((f) => f.endsWith('.mp4')).length, r2.segments, 'fichiers dérivés');
  assert.equal(fs.readdirSync(path.join(seg, 'pixels')).filter((f) => f.endsWith('.mp4')).length, r2.segments, 'intermédiaires gardés');
  const r3 = await exporter(dir, { encodage: { crf: 35 } });
  assert.equal(r3.segmentsRepris, r3.segments);
  assert.equal(r3.segmentsReencodes, 0);
  // Retour aux réglages par défaut : l'intermédiaire sert tel quel.
  const r4 = await exporter(dir);
  assert.equal(r4.segmentsRepris, r4.segments);
  assert.equal(fs.readdirSync(seg).filter((f) => f.endsWith('.mp4')).length, 0, 'fichiers dérivés de l\'autre usage retirés après succès');
});

test('cache : seuls les segments du dernier export réussi et de l\'export en cours restent sur le disque', sans, async () => {
  const dir = projet3();
  assert.equal((await exporter(dir)).ok, true);
  const pixels = path.join(dir, 'sortie', '.export', 'segments', 'pixels');
  // Segments seulement (chacun a aussi ses statistiques, <segment>.stats.json, gardées et retirées avec lui).
  const segments = () => fs.readdirSync(pixels).filter((f) => f.endsWith('.mp4')).sort();
  const premiers = segments();
  const statistiques = () => fs.readdirSync(pixels).filter((f) => f.endsWith('.stats.json')).map((f) => f.slice(0, -'.stats.json'.length)).sort();
  assert.deepEqual(statistiques(), premiers);
  modifierDeroule(dir, (d) => { d.scenes[1].textes.legende = 'autre'; });
  // Interrompu : les segments du dernier export réussi restent, avec celui de l'export en cours.
  assert.equal((await exporter(dir, { arreterApres: 1 })).ok, false);
  const pendant = segments();
  assert.ok(premiers.every((f) => pendant.includes(f)));
  assert.equal(pendant.length, premiers.length + 1);
  assert.equal((await exporter(dir)).ok, true);
  const apres = segments();
  assert.equal(apres.length, premiers.length);
  assert.deepEqual(statistiques(), apres);
  assert.equal(apres.filter((f) => !premiers.includes(f)).length, 1);
});

test('export-verrou : un second export du même projet est refusé ; un verrou dont le processus n\'existe plus est repris', sans, async () => {
  const dir = projet3();
  const travail = path.join(dir, 'sortie', '.export');
  fs.mkdirSync(travail, { recursive: true });
  const verrou = path.join(travail, 'verrou');
  fs.writeFileSync(verrou, JSON.stringify({ pid: process.pid, date: new Date().toISOString() }));
  const refus = await exporter(dir);
  assert.equal(refus.ok, false);
  assert.match(refus.message, /^Un export de cette vidéo est déjà en cours/);
  assert.ok(fs.existsSync(verrou), 'verrou d\'un autre export laissé en place');
  // Deux exports lancés ensemble : un seul passe.
  fs.rmSync(verrou);
  const [x, y] = await Promise.all([exporter(dir), exporter(dir)]);
  assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
  assert.match((x.ok ? y : x).message, /déjà en cours/);
  // Processus arrêté : verrou repris.
  const mort = spawnSync(process.execPath, ['-e', '0']).pid;
  fs.writeFileSync(verrou, JSON.stringify({ pid: mort, date: new Date().toISOString() }));
  const r = await exporter(dir);
  assert.equal(r.ok, true, r.message);
  assert.equal(fs.existsSync(verrou), false, 'verrou retiré à la fin');
});

test('export-ancien-dossier-de-travail-ignore : un sortie/.export d\'une version précédente est retiré sans erreur, rien n\'en est repris', sans, async () => {
  const dir = projet3();
  const travail = path.join(dir, 'sortie', '.export');
  fs.mkdirSync(travail, { recursive: true });
  fs.writeFileSync(path.join(travail, 'empreinte'), 'a'.repeat(64));
  fs.writeFileSync(path.join(travail, 'segment-00.mp4'), 'pas une vidéo');
  fs.writeFileSync(path.join(travail, 'segment-01.mp4.part'), '');
  fs.writeFileSync(path.join(travail, 'page.html'), '<html></html>');
  fs.writeFileSync(path.join(travail, 'son.wav'), '');
  const r = await exporter(dir);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.segmentsRepris, 0);
  assert.deepEqual(fs.readdirSync(travail), ['segments']);
});

