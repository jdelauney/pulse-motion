'use strict';
/* Spec S6, plan 4 (import d'une vidéo, d'une animation ou d'une capture d'écran, 5.14) : prise importée sans ffmpeg
 * (Mediabunny) et avec, durée de chaque image d'un GIF, enregistrement immobile, extrait demandé, repère qui sert de cible
 * au pointeur. Les vidéos sont fabriquées dans Chrome par Mediabunny (aucun fichier livré, aucun réseau). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../scripts/lib/import.js');
const F = require('../scripts/lib/film.js');
const Fm = require('../moteur/film.js');
const Pa = require('../scripts/lib/parcours.js');
const { trouverFfmpeg } = require('../scripts/lib/ffmpeg.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { principal } = require('../scripts/filmer.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { gifAnime } = require('./aide/gif.js');
const { fabriquerVideo } = require('./aide/video.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const outil = (() => { try { const o = trouverFfmpeg(); return o.present && o.versionOk ? o : null; } catch { return null; } })();

const videos = {};
async function video(cle, options) {
  if (!videos[cle]) videos[cle] = await fabriquerVideo({ navigateur, ...options });
  return videos[cle];
}
function deposer(dir, nom, v) {
  const f = path.join(dir, `${nom}${v.ext}`);
  fs.writeFileSync(f, v.octets);
  return path.basename(f);
}
const lireFilm = (dir, nom, prise = 'prise-01') => JSON.parse(fs.readFileSync(path.join(dir, 'films', nom, prise, 'film.json'), 'utf8'));

// --- Purs -----------------------------------------------------------------------------------------------------------

test('importer : instants, partage des images semblables, taille des images, parcours d\'une vidéo importée', () => {
  assert.equal(I.lireInstant('1:05'), 65);
  assert.equal(I.lireInstant('12,5'), 12.5);
  assert.equal(I.lireInstant('1:02:03'), 3723);
  assert.equal(I.lireInstant('x'), null);
  const a = new Uint8Array(64 * 36 * 3).fill(100);
  const b = a.slice(); b[10] = 106;
  assert.equal(I.semblables(a, b), true, 'bruit léger : partagée');
  const c = a.slice(); c[10] = 140;
  assert.equal(I.semblables(a, c), false, 'une lettre tapée : gardée');
  assert.deepEqual(I.tailleImages(3840, 2160), [1920, 1080]);
  assert.deepEqual(I.tailleImages(390, 844), [390, 844]);
  assert.deepEqual(Pa.validerParcours({ nom: 'ecran', import: 'ecran.mp4' }).erreurs, []);
  // Durée d'une étape « lire » : celle de la vidéo (une animation garde la durée de sa dernière image).
  assert.equal(Fm.dureeReaction({ faire: 'lire', reaction: [[0, 'a'], [100, 'b'], [400, 'c']], duree: 600 }, 30), 0.6);
  assert.deepEqual(Fm.reperesDe({ etapes: [{ n: 1, faire: 'lire', reperes: [{ instant: 1, point: [1, 2] }] }] }), [{ instant: 1, point: [1, 2] }]);
  assert.equal(Fm.reperesDe({ etapes: [{ n: 1, faire: 'cliquer' }] }), null);
});

// --- Dans Chrome ----------------------------------------------------------------------------------------------------

test('importer : un MP4 de 5 s devient une prise de 150 images à 30 i/s sans ffmpeg (Mediabunny) ; avec ffmpeg, même nombre d\'images et mêmes instants', { ...SANS, timeout: 300000 }, async (t) => {
  const v = await video('mobile', { duree: 5, ips: 30, son: true });
  const dir = dossierTemporaire('pm-import-');
  const fichier = deposer(dir, 'ecran', v);
  const r = await I.importer({ projet: dir, fichier, navigateur, ffmpeg: null });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.prise, 'prise-01');
  const film = lireFilm(dir, 'ecran');
  assert.deepEqual(F.validerFilm(film, { dossier: path.join(dir, 'films', 'ecran', 'prise-01') }), []);
  assert.equal(film.source, 'import');
  assert.equal(film.cadence, 30);
  const e = film.etapes[0];
  assert.equal(e.faire, 'lire');
  assert.equal(e.reaction.length, 150, `${e.reaction.length} images`);
  assert.deepEqual(e.reaction.map((x) => x[0]), Array.from({ length: 150 }, (_, k) => Math.round(k * 1000 / 30)));
  assert.equal(r.images, 150);
  assert.equal(e.duree, 5000);
  assert.ok(fs.existsSync(path.join(dir, r.planche, 'secondes-01.png')), 'planche d\'une image par seconde');
  if (v.son) assert.ok(r.son && fs.existsSync(path.join(dir, r.son)), `son : ${r.son}`);
  // Parcours d'une vidéo importée, prise à choisir (seule la personne choisit).
  assert.deepEqual(Pa.lireParcours(dir, 'ecran').erreurs, []);
  if (!outil) { t.diagnostic('ffmpeg absent : la comparaison avec ffmpeg est sautée'); return; }
  const r2 = await I.importer({ projet: dir, fichier, nom: 'ecran-ffmpeg', navigateur, ffmpeg: outil });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  const e2 = lireFilm(dir, 'ecran-ffmpeg').etapes[0];
  assert.equal(e2.reaction.length, e.reaction.length);
  assert.deepEqual(e2.reaction.map((x) => x[0]), e.reaction.map((x) => x[0]));
  assert.equal(e2.duree, e.duree);
});

test('importer : un GIF animé garde la durée de chacune de ses images', { ...SANS, timeout: 120000 }, async () => {
  const dir = dossierTemporaire('pm-import-gif-');
  fs.writeFileSync(path.join(dir, 'anime.gif'), gifAnime({ images: [{ couleur: 0, centiemes: 10 }, { couleur: 1, centiemes: 30 }, { couleur: 2, centiemes: 20 }] }));
  const r = await I.importer({ projet: dir, fichier: 'anime.gif', navigateur, ffmpeg: outil });
  assert.equal(r.ok, true, JSON.stringify(r));
  const e = lireFilm(dir, 'anime').etapes[0];
  assert.deepEqual(e.reaction.map((x) => x[0]), [0, 100, 400]);
  assert.equal(new Set(e.reaction.map((x) => x[1])).size, 3);
  assert.equal(e.duree, 600);
  assert.equal(Fm.dureeReaction(e, 30), 0.6);
});

test('importer : un enregistrement immobile de 10 s n\'écrit qu\'une image', { ...SANS, timeout: 300000 }, async () => {
  const v = await video('immobile', { duree: 10, ips: 30, immobile: true });
  const dir = dossierTemporaire('pm-import-immobile-');
  const r = await I.importer({ projet: dir, fichier: deposer(dir, 'immobile', v), navigateur, ffmpeg: null });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'films', 'immobile', 'prise-01', 'images')), ['0001.jpg']);
  const e = lireFilm(dir, 'immobile').etapes[0];
  assert.deepEqual(e.reaction, [[0, '0001.jpg']]);
  assert.equal(e.duree, 10000);
  if (outil) {
    const r2 = await I.importer({ projet: dir, fichier: deposer(dir, 'immobile', v), nom: 'immobile-ffmpeg', navigateur, ffmpeg: outil });
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.equal(fs.readdirSync(path.join(dir, 'films', 'immobile-ffmpeg', 'prise-01', 'images')).length, 1);
  }
});

test('importer : une vidéo de 4 min sans extrait rend besoin « extrait » ; avec un extrait, la prise est faite', { ...SANS, timeout: 300000 }, async () => {
  const v = await video('longue', { duree: 240, ips: 1, largeur: 64, hauteur: 36 });
  const dir = dossierTemporaire('pm-import-longue-');
  const fichier = deposer(dir, 'longue', v);
  const r = await I.importer({ projet: dir, fichier, navigateur, ffmpeg: null });
  assert.equal(r.ok, false);
  assert.equal(r.besoin, 'extrait');
  assert.ok(Math.abs(r.duree - 240) < 2, `${r.duree} s`);
  assert.ok(!fs.existsSync(path.join(dir, 'films', 'longue', 'prise-01')), 'rien d\'écrit');
  const r2 = await I.importer({ projet: dir, fichier, navigateur, ffmpeg: null, de: '0:10', a: '0:14' });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(lireFilm(dir, 'longue').etapes[0].duree, 4000);
});

test('importer : un repère ajouté sert de cible au pointeur', { ...SANS, timeout: 300000 }, async () => {
  const v = await video('mobile', { duree: 5, ips: 30, son: true });
  const dir = miniProjet({ scenes: [{ id: 's', duree: 6, textes: {}, transition: 'coupe',
    html: '<div class="pm-ecran" data-film="ecran" data-etapes="1" data-cadre="aucun" data-start="0" style="--pm-ecran-l: 100cqh"><i class="pm-etape" data-etape="1" data-start="0.5"></i><i class="pm-clic" data-cible="etape:1" data-start="3"></i></div>' }] });
  const r = await I.importer({ projet: dir, fichier: deposer(dir, 'ecran', v), navigateur, ffmpeg: null });
  assert.equal(r.ok, true, JSON.stringify(r));
  const sortie = [];
  const ecrire = process.stdout.write;
  process.stdout.write = (x) => { sortie.push(String(x)); return true; };
  try {
    await principal(['repere', dir, 'ecran', '2,5', '40,60']);
    await principal(['choisir', dir, 'ecran', 'prise-01']);
  } finally { process.stdout.write = ecrire; }
  assert.equal(JSON.parse(sortie[0]).n, 1, sortie[0]);
  const film = lireFilm(dir, 'ecran');
  const rp = film.etapes[0].reperes[0];
  assert.deepEqual(rp, { instant: 2.5, point: [0.4 * film.largeur, 0.6 * film.hauteur] });
  assert.throws(() => I.ajouterRepere({ projet: dir, nom: 'ecran', instant: '1', point: [120, 3] }), /Point/);
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, a.html);
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 });
  try {
    await c.capturer(3);
    const pointe = await c.evaluer(`(function () { var r = document.querySelector(".pm-pointeur").getBoundingClientRect(); var s = document.querySelector(".pm-ecran-surface").getBoundingClientRect(); return [(r.left - s.left) / s.width * ${film.largeur}, (r.top - s.top) / s.height * ${film.hauteur}]; })()`);
    assert.ok(Math.abs(pointe[0] - rp.point[0]) < 4 && Math.abs(pointe[1] - rp.point[1]) < 4, `${JSON.stringify(pointe)} / ${JSON.stringify(rp.point)}`);
  } finally { await c.fermer(); }
});
