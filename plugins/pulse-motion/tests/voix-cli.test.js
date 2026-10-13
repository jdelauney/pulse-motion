'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { importerVoix, voixProvisoire } = require('../scripts/voix.js');
const F = require('../scripts/lib/ffmpeg.js');
const W = require('../moteur/wav.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const lireDeroule = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
const avecTexte = (dir) => modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; d.scenes[1].voix = { texte: 'Les bactéries' }; });

test('revue : import d\'un WAV 44,1 kHz stéréo sans ffmpeg : prise mono écrite, déroulé mis à jour, copie d\'historique', async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const source = path.join(dossierTemporaire('pm-voix-'), 'ma voix.wav');
  fs.writeFileSync(source, wavSinus({ secondes: 2 }));
  const r = await importerVoix({ dossier: dir, fichier: source, scene: 'intro', outil: { present: false } });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'assets/voix/intro.wav');
  assert.ok(Math.abs(r.duree - 2) < 0.1, String(r.duree));
  assert.equal(lireDeroule(dir).scenes[0].voix.fichier, 'assets/voix/intro.wav');
  assert.ok(fs.existsSync(path.join(dir, '.historique', '001', 'deroule.json')));
  const lu = W.lire(new Uint8Array(fs.readFileSync(path.join(dir, r.fichier))));
  assert.equal(lu.canaux.length, 1);
  assert.equal(lu.taux, 44100);
});

test('import refusé : scène inconnue, scène sans texte de voix, MP3 sans ffmpeg', async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const source = path.join(dossierTemporaire('pm-voix-'), 'v.wav');
  fs.writeFileSync(source, wavSinus({ secondes: 1 }));
  assert.match((await importerVoix({ dossier: dir, fichier: source, scene: 'rien', outil: { present: false } })).message, /Scène inconnue : « rien »/);
  modifierDeroule(dir, (d) => { delete d.scenes[1].voix; });
  assert.match((await importerVoix({ dossier: dir, fichier: source, scene: 'chiffre', outil: { present: false } })).message, /n'a pas de texte de voix/);
  const mp3 = path.join(dossierTemporaire('pm-voix-'), 'v.mp3');
  fs.writeFileSync(mp3, 'x');
  assert.match((await importerVoix({ dossier: dir, fichier: mp3, scene: 'intro', outil: { present: false } })).message, /installez ffmpeg.*ou donnez un fichier WAV/);
});

const outil = F.trouverFfmpeg();
test('import d\'un MP3 avec ffmpeg : converti en WAV 48 kHz mono, Opus écrit', { skip: !(outil.present && outil.versionOk) && 'ffmpeg absent' }, async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const mp3 = path.join(dossierTemporaire('pm-voix-'), 'v.mp3');
  require('node:child_process').execFileSync(outil.chemin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', mp3]);
  const r = await importerVoix({ dossier: dir, fichier: mp3, scene: 'intro', outil });
  assert.equal(r.ok, true, r.message);
  assert.equal(W.lire(new Uint8Array(fs.readFileSync(path.join(dir, r.fichier)))).taux, 48000);
  assert.ok(fs.existsSync(path.join(dir, 'assets', 'voix', 'intro.opus')));
});

test('voix provisoire avec une synthèse fournie : une prise par scène qui a un texte, voix.provisoire activé', async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const dits = [];
  const synthetiser = (texte, sortie) => { dits.push(texte); fs.writeFileSync(sortie, wavSinus({ secondes: 1 })); return { ok: true }; };
  const r = await voixProvisoire({ dossier: dir, synthetiser, outil: { present: false } });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(dits, ['Pourquoi le froid', 'Les bactéries']);
  assert.deepEqual(r.scenes.map((s) => s.fichier), ['assets/voix/provisoire/intro.wav', 'assets/voix/provisoire/chiffre.wav']);
  assert.equal(lireDeroule(dir).voix.provisoire, true);
});

test('voix provisoire sans voix du système : message clair', async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const r = await voixProvisoire({ dossier: dir, synthetiser: () => ({ ok: false, message: 'aucune voix du système' }), outil: { present: false } });
  assert.equal(r.ok, false);
  assert.match(r.message, /aucune voix du système/);
});

test('voix du système réelle (Windows) : une prise lisible', { skip: process.platform !== 'win32' && 'Windows seulement' }, async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const r = await voixProvisoire({ dossier: dir, scene: 'intro', outil: { present: false } });
  assert.equal(r.ok, true, r.message);
  assert.ok(r.scenes[0].duree > 0.3, String(r.scenes[0].duree));
});

test('voix studio : aperçu lancé : ouvre le studio sur la scène ; sinon dit de lancer l\'aperçu', async () => {
  const { ouvrirStudio } = require('../scripts/voix.js');
  const { demarrerApercu } = require('../scripts/apercu.js');
  const { STYLES } = require('./aide/projet.js');
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const sans = ouvrirStudio({ dossier: dir, scene: 'intro', ouvrir: () => {} });
  assert.equal(sans.ok, false);
  assert.match(sans.message, /pulse-motion apercu/);
  const apercu = await demarrerApercu({ dossier: dir, port: 47361, dossierStyles: STYLES });
  try {
    const ouverts = [];
    const r = ouvrirStudio({ dossier: dir, scene: 'intro', ouvrir: (u) => ouverts.push(u) });
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(ouverts, [`${apercu.url}?studio=intro`]);
    assert.match(ouvrirStudio({ dossier: dir, scene: 'rien', ouvrir: () => {} }).message, /Scène inconnue/);
  } finally { await apercu.fermer(); }
});

test('correctifs : voix du système : le texte passe par un fichier, jamais en argument (texte qui commence par « - »)', () => {
  const { synthetiserSysteme } = require('../scripts/voix.js');
  for (const plateforme of ['linux', 'darwin']) {
    const appels = [];
    const lancer = (cmd, args) => {
      appels.push(args);
      const f = args[args.indexOf('-f') + 1];
      appels.lu = fs.readFileSync(f, 'utf8');
      fs.writeFileSync(args[args.indexOf(cmd === 'say' ? '-o' : '-w') + 1], 'RIFF');
      return { status: 0 };
    };
    const sortie = path.join(dossierTemporaire('pm-sys-'), 'v.wav');
    const r = synthetiserSysteme('-v en "bonjour"', sortie, { plateforme, lancer });
    assert.equal(r.ok, true, plateforme);
    assert.ok(!appels[0].includes('-v en "bonjour"'), plateforme);
    assert.equal(appels.lu, '-v en "bonjour"');
  }
});

test('correctifs : macOS : Thomas, puis Amélie, puis la voix par défaut', () => {
  const { synthetiserSysteme } = require('../scripts/voix.js');
  const voix = [];
  const lancer = (cmd, args) => {
    const i = args.indexOf('-v');
    voix.push(i >= 0 ? args[i + 1] : null);
    if (i >= 0 && args[i + 1] === 'Thomas') return { status: 1 };
    fs.writeFileSync(args[args.indexOf('-o') + 1], 'RIFF');
    return { status: 0 };
  };
  const r = synthetiserSysteme('Bonjour', path.join(dossierTemporaire('pm-sys-'), 'v.wav'), { plateforme: 'darwin', lancer });
  assert.equal(r.ok, true);
  assert.deepEqual(voix, ['Thomas', 'Amélie']);
});

test('correctifs : voix provisoire : copie d\'historique, scène qui a déjà une vraie prise laissée telle quelle', async () => {
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  modifierDeroule(dir, (d) => { d.scenes[0].voix.fichier = 'assets/voix/intro.wav'; });
  fs.mkdirSync(path.join(dir, 'assets', 'voix'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), wavSinus({ secondes: 1 }));
  const dits = [];
  const synthetiser = (texte, sortie) => { dits.push(texte); fs.writeFileSync(sortie, wavSinus({ secondes: 1 })); return { ok: true }; };
  const r = await voixProvisoire({ dossier: dir, synthetiser, outil: { present: false } });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(dits, ['Les bactéries']);
  assert.ok(fs.existsSync(path.join(dir, '.historique', '001', 'deroule.json')));
  const seule = await voixProvisoire({ dossier: dir, scene: 'intro', synthetiser, outil: { present: false } });
  assert.equal(seule.ok, true);
  assert.deepEqual(dits, ['Les bactéries', 'Pourquoi le froid']);
});

test('correctifs : durée de la vidéo pour les délais maximaux : voix comprises (scène allongée)', async () => {
  const V = require('../scripts/lib/voix.js');
  const { lireDeroule: lire } = require('../scripts/lib/deroule.js');
  const dir = copierProjet('projet-simple');
  avecTexte(dir);
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavSinus({ secondes: 9, taux: 48000 }), texte: 'Pourquoi le froid' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix.fichier = r.relatif; });
  const { deroule } = lire(dir);
  const ecrite = deroule.scenes.reduce((n, s) => n + s.duree / (s.rythme || 1), 0);
  assert.ok(V.dureeVideo(dir, deroule) > ecrite + 2, `${V.dureeVideo(dir, deroule)} contre ${ecrite}`);
});
