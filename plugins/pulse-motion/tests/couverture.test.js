'use strict';
/* Spec Rendu et export, 5.10 : couverture sans sous-titres, vignette intégrée au MP4 dans les deux voies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo } = require('../scripts/exporter.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { instantCouverture, partieVisible } = require('../moteur/minutage.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const F = require('../scripts/lib/ffmpeg.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };

/** Sous-titres incrustés : un texte dit sur chaque scène. */
const avecSousTitres = (d) => {
  d.sousTitres = {};
  d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' };
  d.scenes[1].voix = { texte: 'Les bactéries ralentissent.' };
};
const jpegEnPng = (fichier) => F.extraireImage({ ffmpeg: outil.chemin, fichier, t: null });

/** Vignettes lues par Mediabunny (getMetadataTags().images), dans Node. */
async function imagesMediabunny(fichier) {
  const mb = await import('../vendor/mediabunny/mediabunny.min.mjs');
  const octets = fs.readFileSync(fichier);
  const input = new mb.Input({ source: new mb.BufferSource(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.length)), formats: mb.ALL_FORMATS });
  const t = await input.getMetadataTags();
  return { images: t.images || [], titre: t.title };
}

test('couverture.test.js › instant par défaut : la scène 1 à 95 % de sa partie visible ; instant du déroulé validé', () => {
  const min = { duree: 10, scenes: [{ id: 'a', debut: 0, fin: 4.5, entree: 0 }, { id: 'b', debut: 4, fin: 10, entree: 0.5 }] };
  const v = partieVisible(min, 0);
  assert.deepEqual(v, { debut: 0, fin: 4 });
  assert.equal(instantCouverture(min, null), 3.8);
  assert.equal(instantCouverture(min, { scene: 'b', instant: 2 }), 6);
  // Instant au-delà de la scène : borné à sa fin.
  assert.ok(instantCouverture(min, { scene: 'b', instant: 99 }) < 10);
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'projet-simple', 'deroule.json'), 'utf8'));
  d.couverture = { scene: 'absente', instant: 1 };
  assert.ok(validerDeroule(d).some((e) => /la scène « absente » n'existe pas/.test(e)));
  d.couverture = { scene: 'intro', instant: -1 };
  assert.ok(validerDeroule(d).some((e) => /« couverture » doit être/.test(e)));
  d.couverture = { scene: 'intro', instant: 1.5 };
  assert.deepEqual(validerDeroule(d), []);
});

test('couverture.test.js › couverture sans sous-titres, même incrustés ; à l\'instant demandé : écart ≤ 2 % avec la capture de cet instant', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { avecSousTitres(d); d.couverture = { scene: 'intro', instant: 2 }; });
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichiers.couverture, 'sortie/la-chaine-du-froid-couverture.jpg');
  const couverture = await jpegEnPng(path.join(dir, r.fichiers.couverture));
  // Captures du même instant, avec et sans les sous-titres.
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const page = path.join(dir, 'sortie', 'page-essai.html');
  fs.writeFileSync(page, a.html);
  const c = await ouvrirCapture({ fichierHtml: page, largeur: 1280, hauteur: 720, navigateur });
  let avec;
  let sansSt;
  try {
    const t = instantCouverture(c.minutage, { scene: 'intro', instant: 2 });
    assert.equal(t, 2);
    fs.writeFileSync(path.join(dir, 'sans.jpg'), await c.capturerJpeg(t, { sansSousTitres: true }));
    sansSt = await jpegEnPng(path.join(dir, 'sans.jpg'));
    fs.writeFileSync(path.join(dir, 'avec.jpg'), await c.capturerJpeg(t, { sansSousTitres: false }));
    avec = await jpegEnPng(path.join(dir, 'avec.jpg'));
  } finally { await c.fermer(); }
  const ecartSans = F.ecartImages(couverture, sansSt);
  const ecartAvec = F.ecartImages(couverture, avec);
  assert.ok(ecartSans <= 0.02, `écart ${ecartSans}`);
  assert.ok(F.ecartImages(avec, sansSt) > 0.001, 'un sous-titre est bien visible à cet instant dans la vidéo');
  assert.ok(ecartAvec > ecartSans, `la couverture n'a pas le sous-titre (${ecartAvec} contre ${ecartSans})`);
});

test('couverture.test.js › vignette lue par ffprobe (attached_pic) et par Mediabunny (getMetadataTags().images), dans les deux voies ; la vignette ne change ni le nombre d\'images ni la durée', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, dossierStyles: STYLES, dureeSegment: 3, paralleles: 1 });
  assert.equal(r.ok, true, r.message);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier });
  assert.equal(s.vignette, true);
  assert.deepEqual([s.images, s.largeur, s.hauteur], [73, 1280, 720]);
  assert.ok(Math.abs(s.duree - 7.3) <= 0.11, String(s.duree));
  const mb = await imagesMediabunny(r.fichier);
  assert.equal(mb.images.length, 1);
  assert.equal(mb.images[0].mimeType, 'image/jpeg');
  assert.ok(mb.images[0].data.length <= 200000);
  assert.equal(mb.titre, 'La chaîne du froid');
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8')).faites.includes('vignette'));
  // Voie navigateur.
  const dirN = copierProjet('projet-simple');
  const n = await exporterVideo({ dossier: dirN, dossierStyles: STYLES, ips: 10, qualite: '720p' });
  assert.equal(n.ok, true, n.message);
  const cheminN = path.resolve(dirN, n.fichier);
  const sN = await F.sonder({ ffprobe: outil.cheminProbe, fichier: cheminN });
  assert.equal(sN.vignette, true);
  assert.equal(sN.images, 73);
  const mbN = await imagesMediabunny(cheminN);
  assert.equal(mbN.images.length, 1);
  assert.equal(mbN.titre, 'La chaîne du froid');
  assert.equal(n.fichiers.couverture, 'sortie/la-chaine-du-froid-couverture.jpg', JSON.stringify(n.fichiers));
  assert.ok(fs.existsSync(path.join(dirN, n.fichiers.couverture)));
});
