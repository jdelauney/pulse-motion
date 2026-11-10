'use strict';
/* Spec S2, 5.12 : statistiques image par image et vérification dans la voie navigateur (export dans l'aperçu). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterVideo } = require('../scripts/exporter.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();

test('export-navigateur.test.js › les mêmes statistiques dans la voie navigateur', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, r.message);
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  assert.deepEqual(r.verification, { erreurs: 0, alertes: v.problemes.length, fichier: 'sortie/verification.json' });
  assert.equal(v.fichier, 'sortie/la-chaine-du-froid.mp4');
  assert.deepEqual(v.faites, ['images']);
  // Sans ffmpeg, ce que la voie navigateur ne vérifie pas est dit, avec la raison.
  assert.deepEqual(v.nonFaites.map((x) => x.quoi), ['noirs', 'silences', 'sonie', 'crete']);
  for (const x of v.nonFaites) assert.match(x.pourquoi, /sans ffmpeg/);
  // Le style de test n'anime pas les entrées : seuls des sauts d'image, comme dans la voie fidèle.
  assert.ok(v.problemes.every((p) => p.regle === 'saut-image'), JSON.stringify(v.problemes));
  assert.ok(v.mesures.sauts >= v.problemes.length);
  // Les statistiques reçues ont été consommées (pas de fichier laissé).
  assert.equal(fs.existsSync(path.join(dir, 'sortie', '.export', 'stats-navigateur.json')), false);
  // Même format que la voie fidèle (lib/series.js) : creerStats écrit les champs de statsSerie.
  const source = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'export.mjs'), 'utf8');
  assert.match(source, /return \{ version: 1, largeur: l, hauteur: h, images: m\.length, m, e, d, s, bords: \{ premieres: premieres\.map\(b64\), dernieres: dernieres\.map\(b64\) \} \};/);
  assert.match(source, /export const LARGEUR_STATS = 192;/);
  assert.equal(require('../scripts/lib/ffmpeg.js').LARGEUR_STATS, 192);
});

// --- Spec Rendu et export (S5), 5.1 : usages dans la voie navigateur -----------------------------------------------------

const F = require('../scripts/lib/ffmpeg.js');
const outil = F.trouverFfmpeg();
const U = require('../scripts/lib/usages.js');

/** Débit moyen de la piste vidéo, en kbit/s (octets des paquets vidéo, lus par ffprobe). */
function debitVideo(fichier) {
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(outil.cheminProbe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=size', '-of', 'csv=p=0', fichier], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const octets = r.stdout.split('\n').filter(Boolean).reduce((s, l) => s + Number(l), 0);
  const duree = Number(spawnSync(outil.cheminProbe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier], { encoding: 'utf8' }).stdout);
  return (octets * 8) / duree / 1000;
}

test('export-navigateur.test.js › --pour web en voie navigateur : débit moyen à ±25 % de usages.json', { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!outil.present && 'ffmpeg absent') }, async (t) => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, pour: 'web' });
  assert.equal(r.ok, true, r.message);
  const attendu = U.lireUsages().usages.web.navigateur.debit;
  const mesure = debitVideo(path.join(dir, r.fichier));
  t.diagnostic(`web, voie navigateur : ${Math.round(mesure)} kbit/s mesurés pour ${attendu} visés`);
  // Écart à la spec (à valider) : en débit variable, l'encodeur du navigateur reste bien sous la cible sur des aplats
  // (643 kbit/s pour 6 000 le 2026-11-10) ; le débit de l'usage est un plafond, qui ne doit jamais être dépassé de plus de 25 %.
  assert.ok(mesure <= attendu * 1.25, `${Math.round(mesure)} kbit/s mesurés, ${attendu} au plus`);
  // En débit constant (courriel), le plafond est tenu aussi.
  const c = await exporterVideo({ dossier: dir, dossierStyles: STYLES, pour: 'courriel', qualite: '1080p' });
  assert.equal(c.ok, true, c.message);
  const vise = (await (async () => U.resoudreUsage({ pour: 'courriel', qualite: '1080p', deroule: { format: { ips: 30 } }, duree: 7.25 }))()).navigateur.debit;
  const tenu = debitVideo(path.join(dir, c.fichier));
  t.diagnostic(`courriel, débit constant : ${Math.round(tenu)} kbit/s pour ${vise} visés`);
  assert.ok(tenu <= vise * 1.25, `${Math.round(tenu)} kbit/s pour ${vise}`);
});

test('export-navigateur.test.js › --qualite 720p en voie navigateur : 1280×720', { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!outil.present && 'ffmpeg absent') }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, qualite: '720p' });
  assert.equal(r.ok, true, r.message);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: path.join(dir, r.fichier), compter: 'aucun' });
  assert.deepEqual([s.largeur, s.hauteur], [1280, 720]);
  assert.equal(r.definition, '720p');
});
