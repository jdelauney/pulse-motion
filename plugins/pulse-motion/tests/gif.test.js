'use strict';
/* Spec Rendu et export, 5.13 : GIF par ffmpeg (palette en deux passes, 15 images par seconde, 960 px, boucle infinie). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { verifierSortie } = require('../scripts/exporter.js');
const L = require('../scripts/lib/livrables.js');
const F = require('../scripts/lib/ffmpeg.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };

test('gif.test.js › GIF de 6 s : 90 images, boucle infinie, 960 px, lu par ffprobe et par Chrome (ImageDecoder)', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterFidele({ dossier: dir, ips: 30, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, gif: true, plage: '0-6' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'la-chaine-du-froid-de-0s-a-6s.gif'));
  assert.equal(r.fichiers.gif, 'sortie/la-chaine-du-froid-de-0s-a-6s.gif');
  assert.equal(r.audio, false);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.deepEqual([s.video, s.largeur, s.hauteur, s.images], ['gif', 960, 540, 90]);
  // Boucle infinie : extension NETSCAPE2.0, nombre de répétitions 0.
  const octets = fs.readFileSync(r.fichier);
  const i = octets.indexOf(Buffer.from('NETSCAPE2.0'));
  assert.ok(i > 0, 'extension de boucle');
  assert.deepEqual([...octets.subarray(i + 11, i + 15)], [3, 1, 0, 0]);
  // Chrome le décode : 90 images, répétition infinie.
  const page = await ouvrirPage({ navigateur, largeur: 320, hauteur: 200 });
  try {
    const html = path.join(dir, 'gif.html');
    fs.writeFileSync(html, '<!doctype html><title>gif</title>');
    await page.aller(pathToFileURL(html).href);
    const lu = await page.evaluer(`(async function () {
      var d = new ImageDecoder({ data: Uint8Array.from(atob(${JSON.stringify(octets.toString('base64'))}), function (c) { return c.charCodeAt(0); }), type: 'image/gif' });
      await d.tracks.ready;
      await d.completed;
      var t = d.tracks.selectedTrack;
      var image = await d.decode({ frameIndex: 0 });
      return { images: t.frameCount, repetitions: String(t.repetitionCount), largeur: image.image.displayWidth };
    })()`);
    assert.deepEqual(lu, { images: 90, repetitions: 'Infinity', largeur: 960 });
  } finally { await page.fermer(); }
  // Largeurs : 640 pour le courriel, 1 280 au plus sur demande.
  assert.deepEqual(L.tailleGif(1920, 1080, { usage: 'courriel' }), [640, 360]);
  assert.deepEqual(L.tailleGif(1080, 1920, {}), [540, 960]);
  assert.deepEqual(L.tailleGif(1920, 1080, { largeur: 4000 }), [1280, 720]);
});

test('gif.test.js › 25 s demandés : refus avec proposition d\'une scène', () => {
  const min = { duree: 40, scenes: [{ id: 'intro', debut: 0, fin: 30, entree: 0 }, { id: 'fin', debut: 29.5, fin: 40, entree: 0.5 }] };
  const deroule = { format: { ratio: '16:9' } };
  const r = L.preparerSortie({ deroule, minutage: min, ips: 30, gif: true, plage: '0-25' });
  assert.match(r.erreur, /^Un GIF de 25 s serait très lourd : je vous propose celui d'une scène plus courte \(laquelle \?\) ou d'un passage de 20 s au plus\.$/);
  assert.match(L.preparerSortie({ deroule, minutage: min, ips: 30, gif: true, scene: 'intro' }).erreur, /scène « intro » \(30 s\)/);
  assert.match(L.preparerSortie({ deroule, minutage: min, ips: 30, gif: true }).erreur, /serait très lourd/);
  assert.equal(L.preparerSortie({ deroule, minutage: min, ips: 30, gif: true, scene: 'fin' }).erreur, undefined);
});

test('gif.test.js › sans ffmpeg, avant le jalon 5 : message français, rien d\'écrit', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 4; });
  const refus = verifierSortie({ dossier: dir, voie: 'navigateur', outil: { present: false }, gif: true, scenes: ['intro'] });
  assert.equal(refus, 'Le GIF a besoin de ffmpeg, qui n\'est pas installé : je peux l\'installer une fois, ou faire un MP4 léger de la scène.');
  assert.equal(fs.existsSync(path.join(dir, 'sortie')), false);
});
