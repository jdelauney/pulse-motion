'use strict';
/* Spec Rendu et export, 5.2 : couleurs justes dans le MP4, mesurées sur la mire (tests/fixtures/mire-couleurs), lues par
 * ffmpeg et par Chrome, dans les deux voies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo } = require('../scripts/exporter.js');
const F = require('../scripts/lib/ffmpeg.js');
const M = require('./aide/mire.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };
const BT709 = { espace: 'bt709', primaires: 'bt709', transfert: 'bt709', plage: 'tv' };

const ecartsLisibles = (e) => e.map((x) => `${x.hex} → ${x.mesure.join(',')} (ΔE ${x.deltaE})`).join(' ; ');

let fidele = null;
async function exportFidele() {
  if (!fidele) {
    const dir = copierProjet('mire-couleurs');
    const r = await exporterFidele({ dossier: dir, navigateur, outil, paralleles: 1 });
    assert.equal(r.ok, true, r.message);
    fidele = r.fichier;
  }
  return fidele;
}

test('couleurs-export.test.js › mire, voie fidèle : chaque aplat décodé par ffmpeg reste à ΔE00 ≤ 2 de la capture', sans, async () => {
  const fichier = await exportFidele();
  const e = M.ecartsPNG(await F.extraireImage({ ffmpeg: outil.chemin, fichier, t: 0.5 }));
  assert.equal(e.length, 23);
  assert.ok(e.every((x) => x.deltaE <= 2), ecartsLisibles(e));
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier, compter: 'aucun' });
  assert.deepEqual(s.couleurs, BT709);
});

test('couleurs-export.test.js › mire, voie fidèle : chaque aplat lu par Chrome (balise video, image dessinée dans un canevas) reste à ΔE00 ≤ 2', sans, async () => {
  const fichier = await exportFidele();
  const e = await M.ecartsChrome({ navigateur, fichier, t: 0.5 });
  assert.ok(e.every((x) => x.deltaE <= 2), ecartsLisibles(e));
});

test('couleurs-export.test.js › mire, voie navigateur : idem, et piste étiquetée bt709', sans, async () => {
  const dir = copierProjet('mire-couleurs');
  const r = await exporterVideo({ dossier: dir, navigateur });
  assert.equal(r.ok, true, r.message);
  const fichier = path.join(dir, r.fichier);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier, compter: 'aucun' });
  assert.deepEqual(s.couleurs, BT709);
  // La relecture de la page lit les mêmes étiquettes (getColorSpace de Mediabunny).
  assert.deepEqual(r.couleurs, { primaires: 'bt709', transfert: 'bt709', matrice: 'bt709', pleinePlage: false });
  const parFfmpeg = M.ecartsPNG(await F.extraireImage({ ffmpeg: outil.chemin, fichier, t: 0.5 }));
  assert.ok(parFfmpeg.every((x) => x.deltaE <= 2), ecartsLisibles(parFfmpeg));
  const parChrome = await M.ecartsChrome({ navigateur, fichier, t: 0.5 });
  assert.ok(parChrome.every((x) => x.deltaE <= 2), ecartsLisibles(parChrome));
});
