'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterVideo } = require('../scripts/exporter.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');

const navigateur = trouverNavigateur();
const sansNavigateur = !navigateur && 'Chrome ou Edge introuvable (variable PM_NAVIGATEUR pour l\'indiquer)';

test('export MP4 de bout en bout : fichier relu, nombre d\'images, progression suivie', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const vus = [];
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, surProgression: (n, total) => vus.push([n, total]) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/la-chaine-du-froid.mp4');
  assert.equal(r.images, 218);
  assert.equal(r.audio, false);
  const mp4 = fs.readFileSync(path.join(dir, r.fichier));
  assert.equal(mp4.toString('latin1', 4, 8), 'ftyp');
  assert.ok(vus.length > 0 && vus[vus.length - 1][1] === 218);
  assert.equal(fs.readdirSync(path.join(dir, 'sortie')).some((f) => f.endsWith('.part')), false);
});

test('export avec musique : piste audio AAC (si le navigateur sait l\'encoder)', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.wav'), wavSinus({ secondes: 3 }));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav', volume: 0.6 }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  if (process.platform === 'win32' || process.platform === 'darwin') assert.equal(r.audio, true);
});

const F = require('../scripts/lib/ffmpeg.js');
const outil = F.trouverFfmpeg();

test('export navigateur : le son exporté vient du mixage de la page (sonie de référence −16 LUFS, moins le volume, lue par ffmpeg)', { skip: sansNavigateur || (!outil.present && 'ffmpeg absent') }, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.wav'), wavSinus({ secondes: 10 }));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav', volume: 0.3 }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  if (!r.audio) return; // navigateur sans AAC
  const m = await F.mesurerSonie({ ffmpeg: outil.chemin, fichier: path.join(dir, r.fichier) });
  // Volume 0,3 : 20·log10(0,3) ≈ −10,5 dB sous la sonie de référence (−16 LUFS).
  assert.ok(Math.abs(m.integree - (-16 + 20 * Math.log10(0.3))) < 1, String(m.integree));
});

test('planche : 3 images par scène demandée, hors des transitions, page de planche', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: ['intro', 'chiffre'] });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/planche/planche.html');
  assert.deepEqual(r.images, ['intro-1', 'intro-2', 'intro-3', 'chiffre-1', 'chiffre-2', 'chiffre-3'].map((n) => `sortie/planche/${n}.png`));
  for (const image of r.images) assert.equal(fs.readFileSync(path.join(dir, image)).subarray(1, 4).toString(), 'PNG');
});

test('planche sans scène précisée : les deux premières scènes ; scène inconnue refusée', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: true });
  assert.equal(r.images.length, 6);
  const inconnue = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: ['rien'] });
  assert.equal(inconnue.ok, false);
  assert.match(inconnue.message, /Scène inconnue : rien/);
});

test('vidéo sur fond noir : la relecture ne la prend pas pour une image noire', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.charte.couleurs = { primaire: '#4c8dff', fond: '#000000', texte: '#ffffff', accent: '#ffb000' }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
});

test('musique illisible : vidéo exportée sans son, avertissement en français', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.mp3'), Buffer.alloc(2000, 7));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.mp3', volume: 0.6 }; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, false);
  assert.match(r.avertissement, /musique n'a pas pu être lue/);
});

test('planche avec ouverture : la page de planche est ouverte une fois finie', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  const ouverts = [];
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, planche: ['intro'], ouvrir: true, ouvrirFichier: (f) => ouverts.push(f) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(ouverts, [path.join(dir, 'sortie', 'planche', 'planche.html')]);
});

test('navigateur qui se ferme aussitôt : échec rapide et clair', async () => {
  const dir = copierProjet('projet-simple');
  const debut = Date.now();
  // Node lancé avec les options de Chrome s'arrête aussitôt : il joue le navigateur qui plante.
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, navigateur: process.execPath });
  assert.equal(r.ok, false);
  assert.match(r.message, /navigateur s'est fermé/);
  assert.ok(Date.now() - debut < 20000, 'échec en moins de 20 s');
});

test('export qui ne démarre pas (page en erreur) : échec après le délai de démarrage', { skip: sansNavigateur }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.style = 'inexistant'; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, delaiDemarrage: 4000 });
  assert.equal(r.ok, false);
  assert.match(r.message, /n'a pas démarré/);
});

test('sans Chrome ni Edge : message qui renvoie vers l\'aperçu et le bouton MP4', async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, navigateur: null });
  assert.equal(r.ok, false);
  assert.match(r.message, /Chrome ou Edge introuvable.*« MP4 »/);
});

test('déroulé invalide : pas d\'export, erreurs du déroulé', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.version = 9; });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.message, /« version » doit valoir 1/);
});

test('voie de l\'export : fidèle si ffmpeg est utilisable, sinon (ou --rapide, ou planche) dans le navigateur', () => {
  const { choisirVoie } = require('../scripts/exporter.js');
  const pret = { present: true, versionOk: true };
  assert.equal(choisirVoie({ outil: pret }), 'fidele');
  assert.equal(choisirVoie({ outil: pret, rapide: true }), 'navigateur');
  assert.equal(choisirVoie({ outil: pret, planche: ['intro'] }), 'navigateur');
  assert.equal(choisirVoie({ outil: { present: false } }), 'navigateur');
  assert.equal(choisirVoie({ outil: { present: true, versionOk: false } }), 'navigateur');
});

test('ligne de commande : export fidèle de l\'exemple en 720p, mode et son dans le résumé', { skip: (!trouverNavigateur() && 'Chrome ou Edge introuvable') || (!require('../scripts/lib/ffmpeg.js').trouverFfmpeg().present && 'ffmpeg absent') }, () => {
  const { spawnSync } = require('node:child_process');
  const { dossierTemporaire } = require('./aide/temporaire.js');
  const dir = dossierTemporaire('pm-exp-');
  fs.cpSync(path.join(__dirname, '..', 'exemples', 'chaine-du-froid'), dir, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'exporter', dir, '--qualite', '720p', '--ips', '2'], { encoding: 'utf8', timeout: 280000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.mode, 'fidele');
  assert.equal(j.ok, true);
  assert.ok(fs.existsSync(j.fichier));
});

test('exporter.test.js › verification.json : faites et nonFaites, réécoute non faite sans transcription', { skip: sansNavigateur || (!require('../scripts/lib/ffmpeg.js').trouverFfmpeg().present && 'ffmpeg absent') }, async () => {
  const { exporterFidele } = require('../scripts/export-fidele.js');
  const V = require('../scripts/lib/voix.js');
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi garder le froid' }; });
  const prise = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavSinus({ secondes: 2, frequence: 300, taux: 48000 }), texte: 'Pourquoi garder le froid' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix.fichier = prise.relatif; });
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1, whisper: { pret: false } });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.verification.fichier, 'sortie/verification.json');
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  assert.ok(v.faites.includes('images') && v.faites.includes('noirs') && v.faites.includes('silences'), JSON.stringify(v.faites));
  assert.ok(!v.faites.includes('reecoute'));
  assert.deepEqual(v.nonFaites.find((x) => x.quoi === 'reecoute'), { quoi: 'reecoute', pourquoi: 'la transcription n\'est pas installée' });
  // Transcription prête mais aucune scène signalée par le contrôle : non faite, et dit pourquoi.
  const r2 = await exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1, whisper: { pret: true, transcrire: async () => ({ ok: true, mots: [] }) } });
  assert.equal(r2.ok, true, r2.message);
  const v2 = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  assert.match(v2.nonFaites.find((x) => x.quoi === 'reecoute').pourquoi, /aucune scène/);
  // Scène signalée (voix couverte au dernier contrôle) : réécoutée ; la transcription n'entend rien : voix-inaudible.
  fs.writeFileSync(path.join(dir, 'sortie', 'controle.json'), JSON.stringify({ problemes: [{ regle: 'voix-couverte', scene: 'intro' }] }));
  const r3 = await exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1, whisper: { pret: true, transcrire: async () => ({ ok: true, mots: [{ w: 'garder' }] }) } });
  assert.equal(r3.ok, true, r3.message);
  const v3 = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  assert.ok(v3.faites.includes('reecoute'));
  const p = v3.problemes.find((x) => x.regle === 'voix-inaudible');
  assert.ok(p, JSON.stringify(v3.problemes));
  assert.equal(p.scene, 'intro');
  assert.match(p.message, /la transcription ne reconnaît que 25 % des mots dits \(100 % dans la prise seule\)/);
});

// --- Spec Rendu et export (S5), jalon 1 : usages, résultat, temps restant, estimation ---------------------------------

const avecFfmpeg = sansNavigateur || (!outil.present && 'ffmpeg absent');

test('exporter.test.js › sans --pour : usage web, nom de fichier inchangé `<slug>.mp4`', { skip: avecFfmpeg }, async () => {
  const { exporterFidele } = require('../scripts/export-fidele.js');
  const dir = copierProjet('projet-simple');
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.usage, 'web');
  assert.equal(path.basename(r.fichier), 'la-chaine-du-froid.mp4');
  const n = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(n.ok, true, n.message);
  assert.equal(n.usage, 'web');
  assert.equal(n.fichier, 'sortie/la-chaine-du-froid.mp4');
});

test('exporter.test.js › --qualite et --ips priment sur l\'usage, dans les deux voies', { skip: avecFfmpeg }, async () => {
  const { exporterFidele } = require('../scripts/export-fidele.js');
  const dir = copierProjet('projet-simple');
  // La présentation est en 1080p à 30 images par seconde ; --qualite 720p et --ips 12 l'emportent.
  const f = await exporterFidele({ dossier: dir, pour: 'presentation', qualite: '720p', ips: 12, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
  assert.equal(f.ok, true, f.message);
  assert.deepEqual([f.largeur, f.hauteur, f.ips, f.images, f.definition], [1280, 720, 12, Math.round(7.25 * 12), '720p']);
  assert.equal(path.basename(f.fichier), 'la-chaine-du-froid-presentation.mp4');
  const n = await exporterVideo({ dossier: dir, dossierStyles: STYLES, pour: 'presentation', qualite: '720p', ips: 12 });
  assert.equal(n.ok, true, n.message);
  assert.equal(n.fichier, 'sortie/la-chaine-du-froid-presentation.mp4');
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: path.join(dir, n.fichier) });
  assert.deepEqual([s.largeur, s.hauteur, s.images], [1280, 720, Math.round(7.25 * 12)]);
  assert.deepEqual([n.definition, n.ips], ['720p', 12]);
});

test('exporter.test.js › le résultat donne usage, octets, taille à la française et fichiers joints, dans les deux voies', { skip: avecFfmpeg }, async () => {
  const { exporterFidele } = require('../scripts/export-fidele.js');
  const dir = copierProjet('projet-simple');
  const f = await exporterFidele({ dossier: dir, pour: 'reseaux', qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
  const n = await exporterVideo({ dossier: dir, dossierStyles: STYLES, pour: 'brouillon' });
  for (const [voie, r] of [['fidele', f], ['navigateur', n]]) {
    assert.equal(r.ok, true, `${voie} : ${r.message}`);
    const fichier = path.isAbsolute(r.fichier) ? r.fichier : path.join(dir, r.fichier);
    assert.equal(r.octets, fs.statSync(fichier).size, voie);
    assert.match(r.taille, /^\d+(,\d)? (Ko|Mo)$/, voie);
    assert.equal(r.fichiers.video, path.relative(dir, fichier).replace(/\\/g, '/'), voie);
    assert.ok(['definition', 'ips', 'flou', 'chapitresIntegres', 'verification'].every((k) => k in r), `${voie} : ${Object.keys(r)}`);
    assert.equal(r.chapitresIntegres, false, voie);
  }
  assert.equal(f.usage, 'reseaux');
  assert.equal(n.usage, 'brouillon');
  assert.equal(n.fichier, 'sortie/la-chaine-du-froid-brouillon.mp4');
});

test('exporter.test.js › web puis courriel : deux fichiers distincts, aucun écrasé', { skip: avecFfmpeg }, async () => {
  const { exporterFidele } = require('../scripts/export-fidele.js');
  const dir = copierProjet('projet-simple');
  const web = await exporterFidele({ dossier: dir, ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
  assert.equal(web.ok, true, web.message);
  const avant = fs.readFileSync(web.fichier);
  const courriel = await exporterFidele({ dossier: dir, pour: 'courriel', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
  assert.equal(courriel.ok, true, courriel.message);
  assert.notEqual(courriel.fichier, web.fichier);
  assert.equal(path.basename(courriel.fichier), 'la-chaine-du-froid-courriel.mp4');
  assert.deepEqual(fs.readFileSync(web.fichier), avant, 'la version web est intacte');
  // Le courriel dérive de l'intermédiaire du web : aucune image recapturée.
  assert.deepEqual(courriel.scenesRecapturees, []);
});

test('exporter.test.js › une ligne « encore environ » au moins toutes les 15 s', () => {
  const { suiviProgression } = require('../scripts/exporter.js');
  const lignes = [];
  let t = 0;
  const suivre = suiviProgression({ ecrire: (l) => lignes.push([t, l]), maintenant: () => t });
  // 1 000 images à 2 par seconde (500 s) : 10 % toutes les 50 s, donc une ligne au moins toutes les 15 s.
  for (let n = 1; n <= 1000; n++) { t = n / 2; suivre(n, 1000, { reprises: 0 }); }
  const avecReste = lignes.filter(([, l]) => /– encore environ \d/.test(l));
  assert.ok(avecReste.length >= 30, String(avecReste.length));
  for (let k = 1; k < lignes.length; k++) assert.ok(lignes[k][0] - lignes[k - 1][0] <= 15 + 1e-9, `écart de ${lignes[k][0] - lignes[k - 1][0]} s`);
  assert.match(lignes[0][1], /^Export : 0 % \(image 1 \/ 1000\)$/);
  assert.match(lignes[lignes.length - 1][1], /^Export : 100 % \(image 1000 \/ 1000\)/);
  // Rapide : une ligne tous les 10 %.
  const vite = [];
  let u = 0;
  const suivre2 = suiviProgression({ ecrire: (l) => vite.push(l), maintenant: () => u });
  for (let n = 1; n <= 100; n++) { u = n / 100; suivre2(n, 100, {}); }
  assert.equal(vite.length, 11);
});

test('exporter.test.js › --estimer : durée annoncée sans navigateur', () => {
  const { spawnSync } = require('node:child_process');
  const dir = copierProjet('projet-simple');
  const debut = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'exporter', dir, '--pour', 'web', '--estimer'],
    { encoding: 'utf8', env: { ...process.env, PM_NAVIGATEUR: path.join(dir, 'aucun-navigateur.exe') } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.ok(Number.isInteger(j.secondesEstimees) && j.secondesEstimees > 0, r.stdout);
  assert.equal(j.usage, 'web');
  assert.ok(Date.now() - debut < 10000);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'export.json')), false, 'aucun export lancé');
  const refus = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'exporter', dir, '--pour', 'tele', '--estimer'], { encoding: 'utf8' });
  assert.equal(refus.status, 1);
  assert.match(JSON.parse(refus.stdout).message, /Usage « tele » inconnu/);
});

test('exporter.test.js › après un export, mesures-export.json garde les 5 dernières vitesses', { skip: avecFfmpeg }, async () => {
  const ME = require('../scripts/lib/mesures-export.js');
  const { dossierTemporaire } = require('./aide/temporaire.js');
  const { exporterFidele } = require('../scripts/export-fidele.js');
  const avant = process.env.PULSE_MOTION_DOSSIER;
  const dossier = dossierTemporaire('pm-perso-');
  process.env.PULSE_MOTION_DOSSIER = dossier;
  try {
    for (let k = 0; k < 5; k++) ME.noterMesure({ voie: 'navigateur', definition: '1080p', ips: 30, flou: false, imagesParSeconde: 1 + k, finalesParSeconde: 0 }, { dossier });
    const r = await exporterFidele({ dossier: copierProjet('projet-simple'), qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
    assert.equal(r.ok, true, r.message);
    const m = ME.lireMesures({ dossier });
    assert.equal(m.length, 5);
    assert.deepEqual(m.slice(0, 4).map((x) => x.imagesParSeconde), [2, 3, 4, 5]);
    assert.deepEqual([m[4].voie, m[4].definition, m[4].ips], ['fidele', '720p', 5]);
    assert.ok(m[4].imagesParSeconde > 0 && m[4].finalesParSeconde >= 0);
  } finally {
    process.env.PULSE_MOTION_DOSSIER = avant;
  }
});
