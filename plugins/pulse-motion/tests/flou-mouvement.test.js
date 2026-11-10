'use strict';
/* Spec Rendu et export, 5.8 : flou de mouvement par sous-images (master), N adaptatif, jamais à travers une coupe, textes à
 * lire jamais floutés, mêmes N dans les deux voies, exports reproductibles. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const FL = require('../moteur/flou.js');
const PNG = require('../scripts/lib/png.js');
const F = require('../scripts/lib/ffmpeg.js');
const L = require('../scripts/lib/livrables.js');
const U = require('../scripts/lib/usages.js');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sansNavigateur = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const sans = { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };

/** Scène « mouvement » : un carré rouge de 20 px qui traverse 440 px par seconde jusqu'à la coupe ; scène « fin » : un aplat vert,
 *  immobile, entrée sans transition (coupe à 2,004 s : la fenêtre de l'image 60 la chevaucherait). */
function projetMouvement() {
  return miniProjet({
    scenes: [
      { id: 'mouvement', duree: 2.004, transition: 'aucune', html: '<div id="carre" data-decor data-start="0" data-dur="2.004" style="position:absolute;left:100px;top:300px;width:20px;height:20px;background:#d00000;transform:translateX(calc(var(--p) * 881.76px))"></div>' },
      { id: 'fin', duree: 1.5, transition: 'coupe', html: '<div id="vert" data-decor style="position:absolute;left:0;top:0;width:100%;height:100%;background:#00b000"></div>' },
    ],
  });
}

test('flou-mouvement.test.js › N adaptatif : 1 sous 4 px, 4 jusqu\'à 20 px, ⌈px / 5⌉ au-delà (16 au plus) ; un texte seul sous 20 px n\'est jamais flou', () => {
  assert.equal(FL.sousImages({ px: 3.9, pxHorsTexte: 3.9 }), 1);
  assert.equal(FL.sousImages({ px: 14.67, pxHorsTexte: 14.67 }), 4);
  assert.equal(FL.sousImages({ px: 20, pxHorsTexte: 20 }), 4);
  assert.equal(FL.sousImages({ px: 31, pxHorsTexte: 31 }), 7);
  assert.equal(FL.sousImages({ px: 300, pxHorsTexte: 300 }), 16);
  assert.equal(FL.sousImages({ px: 6, pxHorsTexte: 0 }), 1, 'texte qui dérive à 6 px par image');
  assert.equal(FL.sousImages({ px: 25, pxHorsTexte: 0 }), 5, 'un texte rapide (au-delà de 20 px) reste flou');
  // Formule centrée, obturateur à 180° : N = 4 à 30 images/s autour de l'image 30.
  assert.deepEqual(FL.instants(30, 30, 4, { duree: 10 }).map((t) => Math.round((t - 1) * 30 * 1e4) / 1e4), [-0.1875, -0.0625, 0.0625, 0.1875]);
  assert.deepEqual(FL.instants(30, 30, 1, { duree: 10 }), [1]);
});

test('flou-mouvement.test.js › l\'image avant une coupe ne contient aucun pixel de la scène suivante (instants ramenés dans la scène)', () => {
  const scenes = [{ debut: 0, fin: 2.004, entree: 0 }, { debut: 2.004, fin: 3.504, entree: 0 }];
  for (const t of FL.instants(60, 30, 4, { duree: 3.504, scenes })) assert.ok(t < 2.004, `${t} après la coupe`);
  // L'image d'après la coupe ne remonte pas dans la scène précédente ; une transition avec chevauchement, si.
  for (const t of FL.instants(61, 30, 4, { duree: 3.504, scenes })) assert.ok(t >= 2.004, `${t} avant la coupe`);
  const fondu = [{ debut: 0, fin: 2.5, entree: 0 }, { debut: 2, fin: 4, entree: 0.5 }];
  assert.ok(FL.instants(60, 30, 4, { duree: 4, scenes: fondu }).some((t) => t < 2));
  // Bornes de la vidéo.
  assert.ok(FL.instants(0, 30, 4, { duree: 2 }).every((t) => t >= 0));
});

test('flou-mouvement.test.js › moyenne des sous-images : exacte et arrondie, PNG relu par le décodeur rapide', () => {
  const img = (v) => PNG.encoder({ largeur: 2, hauteur: 1, canaux: 3, donnees: new Uint8Array([v, v, v, 255 - v, 0, v]) });
  const m = PNG.decoder(PNG.moyenne([img(0), img(10), img(20), img(31)]));
  assert.deepEqual([...m.donnees], [15, 15, 15, 240, 0, 15]);
  assert.equal(PNG.moyenne([img(7)]).equals(img(7)), true);
});

test('flou-mouvement.test.js › usages : flou pour le master seulement, --flou le force ; combinaisons refusées', () => {
  assert.equal(U.resoudreUsage({ pour: 'master' }).flou, true);
  assert.equal(U.resoudreUsage({ pour: 'web' }).flou, false);
  assert.equal(U.resoudreUsage({ pour: 'web', flou: 'oui' }).flou, true);
  assert.equal(U.resoudreUsage({ pour: 'master', flou: 'non' }).flou, false);
  assert.match(U.resoudreUsage({ flou: 'beaucoup' }).erreur, /oui ou non/);
  assert.match(L.combinaisonRefusee({ gif: true, flou: true }), /GIF/);
  assert.match(L.combinaisonRefusee({ usage: 'brouillon', flou: true }), /version de travail/);
  assert.equal(L.combinaisonRefusee({ usage: 'master', flou: true }), null);
  // Un style « en pas » refuse le flou.
  const st = dossierTemporaire('pm-style-');
  fs.writeFileSync(path.join(st, 'identite.json'), JSON.stringify({ flou: false }));
  assert.equal(U.flouDuStyle(st), false);
  assert.equal(U.flouDuStyle(path.join(__dirname, '..', 'styles', 'clair-pedagogique')), true);
});

test('flou-mouvement.test.js › scène immobile : N = 1 ; texte qui dérive à 6 px par image : pas de flou ; le même mouvement hors texte : N = 4', sansNavigateur, async () => {
  const dir = miniProjet({ scenes: [{ id: 'derive', duree: 2, html: '<p data-texte="phrase" data-start="0" data-dur="2" style="position:absolute;left:100px;top:300px;transform:translateX(calc(var(--p) * 360px))">Un texte à lire</p>'
    + '<div id="fixe" data-decor style="position:absolute;left:600px;top:500px;width:40px;height:40px;background:#333"></div>' },
  { id: 'bloc', duree: 2, html: '<div id="b" data-decor data-start="0" data-dur="2" style="position:absolute;left:100px;top:300px;width:40px;height:40px;background:#333;transform:translateX(calc(var(--p) * 360px))"></div>' }] });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true);
  const page = path.join(dossierTemporaire('pm-flou-'), 'page.html');
  fs.writeFileSync(page, a.html);
  const c = await ouvrirCapture({ fichierHtml: page, largeur: 1920, hauteur: 1080, navigateur });
  try {
    const debut = await c.evaluer('M.minutage.scenes[1].debut');
    const derive = await c.evaluer('M.flou.nParImage([10, 20, 30, 40], 30, 1)');
    assert.deepEqual(derive, [1, 1, 1, 1], 'texte à 6 px par image');
    const n0 = Math.ceil((debut + 0.6) * 30);
    const bloc = await c.evaluer(`M.flou.nParImage([${n0}, ${n0 + 10}], 30, 1)`);
    assert.deepEqual(bloc, [4, 4], 'bloc à 6 px par image');
    const v = await c.evaluer('M.vitesseMax(1, 1 / 30, 1)');
    assert.ok(Math.abs(v.px - 6) < 0.5 && v.pxHorsTexte === 0, JSON.stringify(v));
  } finally { await c.fermer(); }
});

test('flou-mouvement.test.js › voie fidèle et voie navigateur : même N pour chaque image', sansNavigateur, async () => {
  const dir = projetMouvement();
  const a = assembler({ dossier: dir, ecrire: false });
  const page = path.join(dossierTemporaire('pm-flou-'), 'page.html');
  fs.writeFileSync(page, a.html);
  const images = Array.from({ length: 105 }, (_, i) => i);
  const c = await ouvrirCapture({ fichierHtml: page, largeur: 1280, hauteur: 720, navigateur });
  let fidele;
  try { fidele = await c.evaluer(`M.flou.nParImage(${JSON.stringify(images)}, 30, 1)`); } finally { await c.fermer(); }
  // Voie du navigateur : la page de l'aperçu, dans une fenêtre d'une autre taille, la scène forcée à la taille exportée.
  const p = await ouvrirPage({ navigateur, largeur: 1500, hauteur: 900 });
  let nav;
  try {
    await p.aller(pathToFileURL(page).href);
    nav = await p.evaluer(`(async function () {
      await M.pret;
      var scene = document.getElementById('pm-scene');
      document.documentElement.classList.add('pm-export');
      scene.style.cssText += ';flex:none;width:1280px !important;height:720px;max-width:none;';
      M.modeCapture(true);
      var b = scene.getBoundingClientRect();
      return M.flou.nParImage(${JSON.stringify(images)}, 30, 1280 / b.width);
    })()`);
  } finally { await p.fermer(); }
  assert.deepEqual(nav, fidele);
  assert.ok(fidele.slice(1, 59).every((n) => n === 4), fidele.join(','));
  assert.ok(fidele.slice(62).every((n) => n === 1), 'scène immobile après la coupe');
});

test('flou-mouvement.test.js › point qui traverse 440 px en 1 s à 30 images/s : N = 4, traînée d\'environ la moitié du trajet d\'une image (±1 px) ; scène immobile identique sans flou ; rien de la scène suivante avant la coupe ; deux exports master : segments identiques', sans, async () => {
  const dir = projetMouvement();
  const options = { dossier: dir, pour: 'master', qualite: '720p', navigateur, outil, dureeSegment: 10, paralleles: 1 };
  const r = await exporterFidele(options);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.flou.applique, true);
  assert.equal(r.flou.sousImages, 4);
  assert.ok(r.flou.imagesFloues >= 55, JSON.stringify(r.flou));
  const segments = path.join(dir, 'sortie', '.export', 'segments', 'pixels');
  const empreintes = () => fs.readdirSync(segments).filter((f) => f.endsWith('.mp4')).sort().map((f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(segments, f))).digest('hex'));
  const premieres = empreintes();
  // Image 30 (t = 1 s) : rangée du carré ; fond clair, carré rouge (plus sombre).
  const image = PNG.decoder(await F.extraireImage({ ffmpeg: outil.chemin, fichier: r.fichier, t: 1 - 0.001, pixels: 'rgb24' }));
  const y = 310;
  // Luminance (le rouge seul passerait par la chrominance, sous-échantillonnée de moitié) : l'écart au fond clair.
  const rouge = (x) => { const i = (y * image.largeur + x) * image.canaux; return 255 - (0.299 * image.donnees[i] + 0.587 * image.donnees[i + 1] + 0.114 * image.donnees[i + 2]); };
  const fond = rouge(5);
  const plein = Math.max(...Array.from({ length: image.largeur }, (_, x) => rouge(x)));
  const seuil = fond + (plein - fond) * 0.12;
  const couvertes = Array.from({ length: image.largeur }, (_, x) => x).filter((x) => rouge(x) > seuil);
  const largeurTrace = couvertes[couvertes.length - 1] - couvertes[0] + 1;
  // Traînée : l'étalement des quatre positions, chacune valant sa tranche de temps (N / (N − 1)) ; attendue : 0,5 × 440 / 30.
  const trainee = ((largeurTrace - 20) * 4) / 3;
  assert.ok(Math.abs(trainee - (0.5 * 440) / 30) <= 1, `traînée de ${trainee.toFixed(2)} px (${largeurTrace} px de trace)`);
  // Image 60 (dernière avant la coupe, ses sous-images ramenées dans la scène) : aucun pixel vert.
  const avant = PNG.decoder(await F.extraireImage({ ffmpeg: outil.chemin, fichier: r.fichier, t: 60 / 30 - 0.001, pixels: 'rgb24' }));
  let verts = 0;
  for (let i = 0; i < avant.donnees.length; i += avant.canaux) if (avant.donnees[i + 1] > 140 && avant.donnees[i] < 90 && avant.donnees[i + 2] < 90) verts++;
  assert.equal(verts, 0, `${verts} pixels de la scène suivante`);
  // Scène immobile : la même image que l'export sans flou.
  const t = 3;
  const flou = await F.extraireImage({ ffmpeg: outil.chemin, fichier: r.fichier, t });
  const net = await exporterFidele({ ...options, flou: 'non' });
  assert.equal(net.ok, true, net.message);
  assert.equal(net.flou.applique, false);
  assert.ok(F.ecartImages(flou, await F.extraireImage({ ffmpeg: outil.chemin, fichier: net.fichier, t })) < 0.002);
  // Deux exports master depuis rien : mêmes segments.
  fs.rmSync(path.join(dir, 'sortie', '.export'), { recursive: true, force: true });
  const r2 = await exporterFidele(options);
  assert.equal(r2.ok, true, r2.message);
  assert.deepEqual(empreintes(), premieres);
});
