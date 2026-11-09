'use strict';
/* Plugin installé (spec S2, 5.17) : le plugin copié hors du dépôt, sans ses tests, fabrique, contrôle et exporte
 * chaine-du-froid, comme chez la personne. Idées d'argo (pack-smoke, describeWithCapability). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { optionsWebGPU } = require('./aide/gpu.js');
const { copierPlugin, RACINE } = require('./aide/copie-plugin.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { trouverFfmpeg } = require('../scripts/lib/ffmpeg.js');
const { decoderPNG } = require('../scripts/logo.js');

const navigateur = trouverNavigateur();
const SEUILS = JSON.parse(fs.readFileSync(path.join(RACINE, 'scripts', 'seuils.json'), 'utf8'));
const DELAI = 10 * 60 * 1000;

function lancer(copie, projet, args) {
  const r = spawnSync(process.execPath, [path.join(copie, 'scripts', 'pm.js'), ...args], {
    cwd: projet, encoding: 'utf8', timeout: DELAI, env: { ...process.env, PM_SANS_OUVRIR: '1' }, maxBuffer: 1 << 26,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* sortie non JSON */ }
  return { status: r.status, json, stderr: r.stderr };
}

/** Écart-type de luminance de l'image du milieu du MP4 (extraite par ffmpeg). */
function ecartMilieu(ffmpeg, mp4, duree, dossier) {
  const png = path.join(dossier, 'milieu.png');
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(duree / 2), '-i', mp4, '-frames:v', '1', '-vf', 'scale=320:-2', png], { timeout: 60000 });
  assert.equal(r.status, 0, String(r.stderr));
  const { largeur, hauteur, pixel } = decoderPNG(fs.readFileSync(png));
  const v = [];
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) { const [a, b, c] = pixel(x, y); v.push(0.299 * a + 0.587 * b + 0.114 * c); }
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

test('installe.test.js › le plugin copié hors du dépôt fabrique et exporte chaine-du-froid', { skip: !navigateur && 'Chrome ou Edge introuvable : test du plugin installé sauté', timeout: 3 * DELAI }, async (t) => {
  const copie = copierPlugin();
  assert.equal(fs.existsSync(path.join(copie, 'tests')), false, 'copie sans ses tests');
  assert.equal(path.relative(RACINE, copie).startsWith('..'), true, 'copie hors du dépôt');
  const projet = path.join(dossierTemporaire('pm-installe-'), 'chaine-du-froid');
  fs.cpSync(path.join(copie, 'exemples', 'chaine-du-froid'), projet, { recursive: true });
  if (!(await optionsWebGPU())) {
    // Sans WebGPU (CI sans carte graphique), l'effet d'étincelles ne peut pas être capturé : il est retiré.
    const seuil = path.join(projet, 'scenes', '02-seuil.html');
    fs.writeFileSync(seuil, fs.readFileSync(seuil, 'utf8').replace(/<div data-effet=[^\n]*<\/div>\n/, ''), 'utf8');
    t.diagnostic('WebGPU indisponible : effet de particules retiré de la copie');
  }
  const duree = 60;

  const a = lancer(copie, projet, ['assembler', '.']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.json.ok, true);
  const c = lancer(copie, projet, ['controler', '.']);
  assert.ok(c.json, c.stderr);
  assert.equal(c.json.erreurs, 0, JSON.stringify(c.json));
  assert.equal(c.json.renduVerifie, true);

  const ff = trouverFfmpeg();
  const avecFfmpeg = Boolean(ff.present && ff.versionOk);
  /** Taille de l'image du MP4, lue par ffprobe. */
  const taille = (mp4) => {
    const r = spawnSync(ff.cheminProbe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', mp4], { encoding: 'utf8', timeout: 60000 });
    return String(r.stdout).trim().split(',').map(Number);
  };
  const verifier = (e, voie) => {
    assert.equal(e.status, 0, `${voie} : ${e.stderr}`);
    assert.equal(e.json.ok, true, voie);
    const mp4 = path.resolve(projet, e.json.fichier);
    assert.ok(fs.existsSync(mp4), voie);
    assert.ok(Math.abs(e.json.duree - duree) <= 1 / 30 + 1e-6, `${voie} : durée ${e.json.duree}`);
    if (e.json.images !== undefined) assert.ok(Math.abs(e.json.images - duree * 30) <= 1, `${voie} : ${e.json.images} images`);
    if (e.json.largeur !== undefined) assert.deepEqual([e.json.largeur, e.json.hauteur], [1920, 1080], voie);
    if (avecFfmpeg && ff.cheminProbe) assert.deepEqual(taille(mp4), [1920, 1080], voie);
    return mp4;
  };
  verifier(lancer(copie, projet, ['exporter', '.', '--rapide']), 'export dans le navigateur');
  if (!avecFfmpeg) return t.diagnostic('ffmpeg absent : export fidèle et image du milieu non vérifiés');
  const mp4 = verifier(lancer(copie, projet, ['exporter', '.']), 'export fidèle');
  const ecart = ecartMilieu(ff.chemin, mp4, duree, path.dirname(projet));
  assert.ok(ecart > SEUILS.imageVideEcart, `image du milieu unie (écart-type ${ecart.toFixed(1)})`);
});
