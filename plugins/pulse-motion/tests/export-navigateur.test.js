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
