'use strict';
/* Spec Rendu et export, 5.14 : vidéo à fond transparent (--transparent), MOV ProRes 4444 pour le montage, WebM VP9 à couche
 * alpha pour le web ; règle fond-opaque ; voie du navigateur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../scripts/lib/ffmpeg.js');
const L = require('../scripts/lib/livrables.js');
const PNG = require('../scripts/lib/png.js');
const T = require('../scripts/lib/export-transparent.js');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo, verifierSortie } = require('../scripts/exporter.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };
const sansNavigateur = { skip: !navigateur && 'Chrome ou Edge introuvable' };

/** Un titre et un bloc opaque au centre, sans décor de fond. */
const projetTitre = () => miniProjet({ scenes: [{ id: 'titre', duree: 1.5, html: '<h1 data-texte="titre" data-start="0">Bienvenue</h1>'
  + '<div id="bloc" data-decor style="position:absolute;left:calc(50% - 60px);top:calc(50% - 60px);width:120px;height:120px;background:#123456"></div>', textes: { titre: 'Bienvenue' } }] });

test('transparent.test.js › combinaisons refusées et noms des fichiers', () => {
  assert.match(L.combinaisonRefusee({ transparent: 'mov', usage: 'courriel' }), /montage/);
  assert.match(L.combinaisonRefusee({ transparent: 'mov', tailleMax: 20 }), /taille visée/);
  assert.match(L.combinaisonRefusee({ transparent: 'mov', usage: 'brouillon' }), /version de travail/);
  assert.match(L.combinaisonRefusee({ transparent: 'mov', gif: true }), /GIF/);
  assert.match(L.combinaisonRefusee({ transparent: 'mov', cadre: 'telephone' }), /cadre/);
  assert.match(L.combinaisonRefusee({ transparent: 'mov', flou: true }), /flou/);
  assert.match(L.combinaisonRefusee({ transparent: 'avi' }), /inconnu/);
  assert.equal(L.combinaisonRefusee({ transparent: 'webm', avecFfmpeg: false }), null);
  assert.equal(L.nomSortie('essai', { usage: 'web', transparent: true, extension: 'mov' }), 'essai-transparent.mov');
  assert.equal(L.nomSortie('essai', { usage: 'master', transparent: true, scene: 'intro', extension: 'webm' }), 'essai-master-transparent-intro.webm');
  assert.deepEqual(T.fondOpaque({ a: [0.95, 0.99, 0.91], b: [0.95, 0.2, 0.99] }), ['a']);
  assert.match(T.messageFondOpaque(['intro']), /^La scène « intro » a un fond plein : rien n'y serait transparent\. Je peux retirer son fond pour cette version\.$/);
});

test('transparent.test.js › ProRes sans ffmpeg : message, rien d\'écrit', () => {
  const dir = projetTitre();
  const refus = verifierSortie({ dossier: dir, voie: 'navigateur', outil: { present: false }, transparent: 'mov' });
  assert.match(refus, /La vidéo à fond transparent a besoin de ffmpeg sur cet ordinateur/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie')), false);
});

test('transparent.test.js › coin d\'une scène sans décor : alpha nul dans la vidéo décodée ; centre d\'un titre opaque : alpha 255 (MOV ProRes 4444 et WebM VP9)', sans, async () => {
  const dir = projetTitre();
  for (const format of ['mov', 'webm']) {
    const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, paralleles: 1, transparent: format });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.fichier, path.join(dir, 'sortie', `essai-transparent.${format}`));
    assert.equal(r.transparent, format);
    const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier, compter: 'paquets' });
    assert.equal(s.video, format === 'mov' ? 'prores' : 'vp9');
    assert.equal(s.alpha, true);
    assert.equal(s.images, 15);
    assert.equal(s.couleurs.primaires, 'bt709');
    const img = PNG.decoder(await F.extraireImage({ ffmpeg: outil.chemin, fichier: r.fichier, t: 0.7, decodeur: format === 'webm' ? 'libvpx-vp9' : null, pixels: 'rgba' }));
    assert.equal(img.canaux, 4);
    const alpha = (x, y) => img.donnees[(y * img.largeur + x) * 4 + 3];
    assert.equal(alpha(4, 4), 0, `${format} : coin`);
    assert.equal(alpha(img.largeur / 2, img.hauteur / 2), 255, `${format} : centre`);
  }
});

test('transparent.test.js › scène à fond plein : export refusé avec le nom de la scène, rien d\'écrit', sans, async () => {
  const dir = miniProjet({ scenes: [{ id: 'intro', duree: 1.5, html: '<div id="plein" data-decor style="position:absolute;inset:0;background:#fafafa"></div><h1 data-texte="titre">Bonjour</h1>', textes: { titre: 'Bonjour' } },
    { id: 'suite', duree: 1.5, html: '<h1 data-texte="titre">Suite</h1>', textes: { titre: 'Suite' } }] });
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 10, navigateur, outil, paralleles: 1, transparent: 'mov' });
  assert.equal(r.ok, false);
  assert.equal(r.message, 'La scène « intro » a un fond plein : rien n\'y serait transparent. Je peux retirer son fond pour cette version.');
  assert.deepEqual(r.fondOpaque, ['intro']);
  assert.equal(r.probleme.regle, 'fond-opaque');
  assert.ok(!fs.readdirSync(path.join(dir, 'sortie')).some((f) => /\.(mov|webm)$/.test(f)));
});

test('transparent.test.js › voie navigateur : WebM VP9 à alpha si le navigateur le sait, sinon message « exige ffmpeg »', sansNavigateur, async () => {
  const dir = projetTitre();
  const r = await exporterVideo({ dossier: dir, qualite: '720p', ips: 10, transparent: 'webm', navigateur });
  if (r.ok) {
    assert.match(r.fichier, /essai-transparent\.webm$/);
    if (outil.present && outil.versionOk) {
      const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: path.join(dir, r.fichier), compter: 'paquets' });
      assert.equal(s.video, 'vp9');
      assert.equal(s.alpha, true);
    }
  } else {
    assert.equal(r.message, 'La vidéo à fond transparent a besoin de ffmpeg sur cet ordinateur.');
  }
  // Le montage (MOV) ne se fait jamais dans le navigateur.
  const mov = await exporterVideo({ dossier: dir, qualite: '720p', ips: 10, transparent: 'mov', navigateur });
  assert.equal(mov.ok, false);
  assert.match(mov.message, /La vidéo à fond transparent a besoin de ffmpeg/);
});
