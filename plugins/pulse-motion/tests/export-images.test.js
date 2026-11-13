'use strict';
/* Spec « Lacunes créatives » (S9), 5.14 : séquence d'images pour un monteur, par la capture fidèle, sans ffmpeg. Nombre
 * d'images, numérotation, empreintes stables d'un export à l'autre, son de la plage, reprise après une interruption,
 * estimation et accord au-delà de 2 Go. Petite vidéo à 10 images par seconde, pour aller vite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { miniProjet } = require('./aide/mini-projet.js');
const { musiqueEssai } = require('./aide/musique-essai.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const I = require('../scripts/lib/export-images.js');
const W = require('../moteur/wav.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const IPS = 10;

function video() {
  return miniProjet({
    scenes: [
      { id: 'titre', duree: 1.5, html: '<h1 class="pm-in-up" data-start="0.2">Bonjour</h1>', transition: 'coupe' },
      { id: 'fin', duree: 1.5, html: '<h2 class="pm-in-fade" data-start="0.3">Au revoir</h2>', transition: 'coupe' },
    ],
    deroule: { musique: { fichier: 'assets/musique.wav', volume: 0.6 } },
    assets: { 'musique.wav': musiqueEssai({ duree: 4, tempo: 120 }) },
  });
}

/** Fichiers numérotés d'une séquence, triés. */
const images = (dossier) => fs.readdirSync(dossier).filter((f) => /^\d{6}\.(png|jpg)$/.test(f)).sort();

/** Toute commande ffmpeg lancée pendant fn échoue le test. */
async function sansFfmpeg(fn) {
  const noms = ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync'];
  const avant = Object.fromEntries(noms.map((n) => [n, childProcess[n]]));
  const lances = [];
  for (const n of noms) childProcess[n] = (cmd, ...reste) => { lances.push(String(cmd)); if (/ffmpeg|ffprobe/i.test(String(cmd))) throw new Error('ffmpeg lancé'); return avant[n](cmd, ...reste); };
  try { return await fn(); } finally { Object.assign(childProcess, avant); assert.deepEqual(lances.filter((c) => /ffmpeg|ffprobe/i.test(c)), []); }
}

test('images : nombre d\'images = durée × ips, numérotées sans trou', { ...SANS, timeout: 180000 }, async () => {
  const dir = video();
  const r = await sansFfmpeg(() => I.exporterImages({ dossier: dir, ips: IPS, navigateur }));
  assert.equal(r.ok, true, r.message);
  const duree = require('../scripts/lib/voix.js').minutageVideo(dir, require('../scripts/lib/deroule.js').lireDeroule(dir).deroule).duree;
  assert.equal(r.nombre, Math.round(duree * IPS));
  const cible = path.join(dir, r.dossier);
  const noms = images(cible);
  assert.deepEqual(noms, Array.from({ length: r.nombre }, (_, k) => `${String(k + 1).padStart(6, '0')}.png`));
  const info = JSON.parse(fs.readFileSync(path.join(cible, 'images.json'), 'utf8'));
  assert.deepEqual([info.ips, info.largeur, info.hauteur, info.debut, info.nombre, info.format], [IPS, 1920, 1080, 0, r.nombre, 'png']);
  assert.ok(Math.abs(info.duree - r.nombre / IPS) < 1e-9);
  assert.match(info.empreinte, /^[0-9a-f]{64}$/);
  // Le son de la même plage, à part.
  const son = W.lire(new Uint8Array(fs.readFileSync(path.join(cible, 'son.wav'))));
  assert.ok(Math.abs(son.canaux[0].length / son.taux - info.duree) < 0.01, `son de ${son.canaux[0].length / son.taux} s`);
  assert.ok(!fs.existsSync(path.join(cible, '.reprise.json')));
  // Un passage, en JPEG : numéroté depuis 000001, début noté.
  const p = await I.exporterImages({ dossier: dir, ips: IPS, format: 'jpeg', de: '1,5', a: '2.5', navigateur });
  assert.equal(p.ok, true, p.message);
  assert.equal(p.nombre, 10);
  assert.deepEqual(images(path.join(dir, p.dossier)), Array.from({ length: 10 }, (_, k) => `${String(k + 1).padStart(6, '0')}.jpg`));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, p.dossier, 'images.json'), 'utf8')).debut, 1.5);
});

test('images : même projet, mêmes images (empreintes identiques à deux exports)', { ...SANS, timeout: 180000 }, async () => {
  const a = await I.exporterImages({ dossier: video(), ips: IPS, de: 0, a: 2, navigateur });
  const b = await I.exporterImages({ dossier: video(), ips: IPS, de: 0, a: 2, navigateur });
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.empreinte, b.empreinte);
});

test('images : fonctionne sans ffmpeg', { ...SANS, timeout: 180000 }, async () => {
  const avant = process.env.PM_FFMPEG;
  process.env.PM_FFMPEG = path.join(path.parse(process.cwd()).root, 'introuvable', 'ffmpeg.exe');
  try {
    const r = await sansFfmpeg(() => I.exporterImages({ dossier: video(), ips: IPS, de: 0, a: 1, format: 'jpeg', navigateur }));
    assert.equal(r.ok, true, r.message);
    assert.equal(r.nombre, 10);
  } finally {
    if (avant === undefined) delete process.env.PM_FFMPEG; else process.env.PM_FFMPEG = avant;
  }
});

test('images : reprise après interruption sans réécrire les images valides', { ...SANS, timeout: 180000 }, async () => {
  const dir = video();
  const coupe = await I.exporterImages({ dossier: dir, ips: IPS, de: 0, a: 2, navigateur, arreterApres: 6 });
  assert.equal(coupe.ok, false);
  assert.equal(coupe.interrompu, true);
  const cible = path.join(dir, 'sortie', 'images', 'essai');
  assert.equal(images(cible).length, 6);
  // Une image abîmée (écriture coupée) est refaite ; les autres restent telles quelles.
  fs.writeFileSync(path.join(cible, '000006.png'), fs.readFileSync(path.join(cible, '000006.png')).subarray(0, 100));
  const dates = Object.fromEntries(images(cible).slice(0, 5).map((f) => [f, fs.statSync(path.join(cible, f)).mtimeMs]));
  const r = await I.exporterImages({ dossier: dir, ips: IPS, de: 0, a: 2, navigateur });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.reprises, 5);
  assert.equal(images(cible).length, 20);
  for (const [f, d] of Object.entries(dates)) assert.equal(fs.statSync(path.join(cible, f)).mtimeMs, d, `${f} réécrite`);
  assert.equal(I.imageValide(fs.readFileSync(path.join(cible, '000006.png')), 'png'), true);
  // Même empreinte qu'un export d'une traite.
  const entier = await I.exporterImages({ dossier: video(), ips: IPS, de: 0, a: 2, navigateur });
  assert.equal(r.empreinte, entier.empreinte);
  // La vidéo change : l'ancienne séquence est effacée, rien n'est repris.
  const f = path.join(dir, 'scenes', '01-titre.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Bonjour', 'Bonsoir'), 'utf8');
  const apres = await I.exporterImages({ dossier: dir, ips: IPS, de: 0, a: 2, navigateur });
  assert.equal(apres.reprises, 0);
  assert.notEqual(apres.empreinte, r.empreinte);
});

test('images : taille estimée avant de commencer, accord demandé au-delà de 2 Go', async () => {
  const petite = I.estimer({ nombre: 300, largeur: 1920, hauteur: 1080, format: 'png' });
  assert.equal(petite.octets, 600e6);
  assert.equal(petite.accordNecessaire, false);
  assert.equal(I.estimer({ nombre: 300, largeur: 1920, hauteur: 1080, format: 'jpeg' }).octets, 120e6);
  assert.equal(I.estimer({ nombre: 5400, largeur: 1920, hauteur: 1080, format: 'png' }).accordNecessaire, true);
  const dir = video();
  const e = await I.exporterImages({ dossier: dir, estimer: true, navigateur: null });
  assert.equal(e.ok, true);
  assert.equal(e.estimation.nombre, 90);
  const longue = miniProjet({ scenes: [{ id: 'long', duree: 60, html: '<h1>Long</h1>' }] });
  const refus = await I.exporterImages({ dossier: longue, ips: 60, navigateur: null });
  assert.equal(refus.ok, false);
  assert.equal(refus.raison, 'accord');
  assert.match(refus.message, /accord/);
  assert.equal((await I.exporterImages({ dossier: dir, format: 'tiff' })).ok, false);
  assert.match((await I.exporterImages({ dossier: dir, de: 2, a: 1 })).message, /après le début/);
});
