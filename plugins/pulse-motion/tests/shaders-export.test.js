'use strict';
/* Spec Rendu et export, 5.9 : grain plus léger. Le post-traitement « grain » est tiré au plus 12 fois par seconde pour le
 * courriel et le brouillon (grainMax dans l'adresse de la page, ou ?pour= dans l'aperçu) ; inchangé pour les autres. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const F = require('../scripts/lib/ffmpeg.js');
const U = require('../scripts/lib/usages.js');
const C = require('../moteur/shaders/code.js');
const { decoderPNG } = require('../scripts/logo.js');
const { optionsWebGPU } = require('./aide/gpu.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const GRAIN = { usage: 'post', nom: 'grain', parametres: { force: { defaut: 0.06 }, taille: { defaut: 0.15 }, vitesse: { defaut: 24, min: 1, max: 60 } } };

/** Écart moyen par pixel (0–255), sans moyenne par blocs : le grain est un bruit fin. */
function ecartPixels(a, b) {
  const x = decoderPNG(a);
  const y = decoderPNG(b);
  let s = 0;
  for (let j = 0; j < x.hauteur; j += 2) for (let i = 0; i < x.largeur; i += 2) { const p = x.pixel(i, j); const q = y.pixel(i, j); s += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); }
  return s / ((x.largeur / 2) * (x.hauteur / 2) * 3);
}

/** Page du projet d'essai avec un grain fort sur toute la vidéo. -> chemin du fichier HTML */
async function pageAvecGrain() {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.post = [{ shader: 'grain', reglages: { force: 0.3 } }]; });
  const a = await assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  const f = path.join(dir, 'page.html');
  fs.writeFileSync(f, a.html);
  return f;
}

async function captures(fichierHtml, instants, parametres = {}) {
  const c = await ouvrirCapture({ fichierHtml, largeur: 640, hauteur: 360, navigateur, gpu: true, delai: 60000, parametres });
  try {
    const r = [];
    for (const t of instants) r.push(await c.capturer(t));
    r.grainMax = await c.evaluer('M.grainMax');
    return r;
  } finally { await c.fermer(); }
}

test('shaders-export.test.js › plafonnerGrain : seul le grain est plafonné, jamais relevé', () => {
  assert.deepEqual(C.plafonnerGrain(GRAIN, { force: 0.3, vitesse: 24 }, 12), { force: 0.3, vitesse: 12 });
  assert.deepEqual(C.plafonnerGrain(GRAIN, { force: 0.3 }, 12), { force: 0.3, vitesse: 12 }, 'vitesse par défaut (24) plafonnée');
  assert.deepEqual(C.plafonnerGrain(GRAIN, { vitesse: 8 }, 12), { vitesse: 8 }, 'un grain plus lent reste lent');
  assert.deepEqual(C.plafonnerGrain(GRAIN, { vitesse: 24 }, null), { vitesse: 24 });
  assert.deepEqual(C.plafonnerGrain({ ...GRAIN, nom: 'vignettage' }, { vitesse: 24 }, 12), { vitesse: 24 });
  assert.deepEqual(C.plafonnerGrain({ ...GRAIN, usage: 'fond' }, { vitesse: 24 }, 12), { vitesse: 24 });
  // Le shader tire son grain à floor(iTime × vitesse) : plafonné à 12, le tirage à l'instant t est floor(t × 12).
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'shaders', 'grain.wgsl'), 'utf8'), /let image = floor\(iTime \* R\.vitesse\);/);
  assert.deepEqual(['courriel', 'brouillon'].map((p) => U.resoudreUsage({ pour: p, duree: 5 }).grainMax), [12, 12]);
  assert.deepEqual(['web', 'reseaux', 'presentation', 'master'].map((p) => U.resoudreUsage({ pour: p, duree: 5 }).grainMax), [null, null, null, null]);
});

test('shaders-export.test.js › courriel : le tirage du grain à l\'instant t est floor(t × 12)', async (t) => {
  if (!navigateur || !(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const page = await pageAvecGrain();
  // 3,01 et 3,07 s : même tirage à 12 par seconde (36), deux tirages à 24 (72 et 73) ; 3,09 s : tirage suivant à 12 (37).
  const [a, b, c] = await captures(page, [3.01, 3.07, 3.09], { grainMax: 12 });
  assert.equal(ecartPixels(a, b), 0, 'même tirage dans le même douzième de seconde');
  assert.ok(ecartPixels(b, c) > 1, `tirage suivant : ${ecartPixels(b, c)}`);
});

test('shaders-export.test.js › web et master : grain inchangé', async (t) => {
  if (!navigateur || !(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const page = await pageAvecGrain();
  const r = await captures(page, [3.01, 3.07]);
  assert.equal(r.grainMax, null);
  assert.ok(ecartPixels(r[0], r[1]) > 1, 'à 24 par seconde, deux tirages');
});

test('shaders-export.test.js › à réglage d\'encodage égal, le plafond allège le fichier (mesure notée, sans seuil)', async (t) => {
  if (!navigateur || !(await optionsWebGPU()) || !(outil.present && outil.versionOk)) return t.skip('WebGPU ou ffmpeg indisponible');
  const page = await pageAvecGrain();
  const instants = Array.from({ length: 24 }, (_, k) => 3 + k / 24);
  const tailles = {};
  for (const [nom, parametres] of [['24', {}], ['12', { grainMax: 12 }]]) {
    const pngs = await captures(page, instants, parametres);
    const sortie = path.join(path.dirname(page), `grain-${nom}.mp4`);
    async function* images() { for (const p of pngs) yield p; }
    await F.encoderSegment({ ffmpeg: outil.chemin, sortie, ips: 24, reglages: { crf: 18, preset: 'medium', gop: 2, profil: 'high' }, images: images() });
    tailles[nom] = fs.statSync(sortie).size;
  }
  t.diagnostic(`grain à 24 par seconde : ${tailles['24']} o ; plafonné à 12 : ${tailles['12']} o (${Math.round((100 * tailles['12']) / tailles['24'])} %)`);
  assert.ok(tailles['12'] < tailles['24'], JSON.stringify(tailles));
});
