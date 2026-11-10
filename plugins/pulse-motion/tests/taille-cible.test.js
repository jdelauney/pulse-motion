'use strict';
/* Spec Rendu et export, 5.3 : taille visée (usage courriel, --taille-max), dans les deux voies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { exporterVideo } = require('../scripts/exporter.js');
const F = require('../scripts/lib/ffmpeg.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sansNavigateur = !navigateur && 'Chrome ou Edge introuvable';
const sans = { skip: sansNavigateur || (!(outil.present && outil.versionOk) && 'ffmpeg absent') };
const EXEMPLE = path.join(__dirname, '..', 'exemples', 'chaine-du-froid');

function copierExemple() {
  const dir = dossierTemporaire('pm-courriel-');
  fs.cpSync(EXEMPLE, dir, { recursive: true });
  return dir;
}

test('taille-cible.test.js › chaine-du-froid en courriel, voie fidèle : fichier ≤ 10 Mo, définition choisie selon le débit calculé', sans, async () => {
  const dir = copierExemple();
  const r = await exporterFidele({ dossier: dir, pour: 'courriel', navigateur, outil });
  assert.equal(r.ok, true, r.message);
  assert.equal(path.basename(r.fichier), 'la-chaine-du-froid-courriel.mp4');
  assert.ok(fs.statSync(r.fichier).size <= 10e6, String(fs.statSync(r.fichier).size));
  // 62,5 s en 10 Mo : environ 1,1 Mbit/s pour l'image, donc 720p, à 30 images par seconde.
  assert.deepEqual([r.definition, r.largeur, r.hauteur, r.ips], ['720p', 1280, 720, 30]);
  const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: r.fichier, compter: 'aucun' });
  assert.deepEqual(s.couleurs, { espace: 'bt709', primaires: 'bt709', transfert: 'bt709', plage: 'tv' });
  assert.equal(r.tailleVisee, '10 Mo');
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8')).faites.includes('taille'));
  // Fichiers de travail des deux passes retirés.
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sortie', '.export')).filter((f) => /passe|courriel-source/.test(f)), []);
});

test('taille-cible.test.js › idem, voie navigateur', { skip: sansNavigateur }, async () => {
  const dir = copierExemple();
  const r = await exporterVideo({ dossier: dir, pour: 'courriel' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/la-chaine-du-froid-courriel.mp4');
  assert.ok(r.octets <= 10e6, String(r.octets));
  assert.equal(r.definition, '720p');
});

test('taille-cible.test.js › --taille-max 25 : fichier ≤ 25 Mo', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterFidele({ dossier: dir, tailleMax: 25, ips: 10, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.usage, 'web');
  assert.ok(r.octets <= 25e6);
  assert.equal(r.tailleVisee, '25 Mo');
});

test('taille-cible.test.js › vidéo trop longue : refus avant capture, message avec la taille nécessaire et deux propositions', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await exporterFidele({ dossier: dir, pour: 'courriel', tailleMax: 0.1, navigateur, outil, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.message, /^La vidéo dure 7 s : même en petite définition, elle ne tient pas en 0,1 Mo \(il faudrait environ \d+ Mo\)\. Je peux faire une version de \d+ Mo, ou une vidéo d'une seule scène\.$/);
  // Rien n'a été capturé ni écrit.
  assert.equal(fs.existsSync(path.join(dir, 'sortie', '.export')), false);
  const n = await exporterVideo({ dossier: dir, pour: 'courriel', tailleMax: 0.1, dossierStyles: STYLES, navigateur: null });
  assert.equal(n.ok, false);
  assert.match(n.message, /ne tient pas en 0,1 Mo/);
});

test('taille-cible.test.js › dépassement après la première passe : une seule reprise, puis réussite ou échec sans fichier', sans, async () => {
  const dir = copierProjet('projet-simple');
  // Taille de 1 Mo sur 7,25 s ; le premier essai vise vingt fois trop haut : une reprise, réussie.
  const essais = [];
  const r = await exporterFidele({ dossier: dir, pour: 'courriel', tailleMax: 1, ips: 10, navigateur, outil, dossierStyles: STYLES, paralleles: 1,
    debitCourriel: (v, essai) => { essais.push([essai, v]); return essai === 0 ? v * 20 : v; } });
  assert.equal(r.ok, true, r.message);
  assert.equal(essais.length, 2);
  assert.equal(r.reprises, 1);
  assert.ok(r.octets <= 1e6, String(r.octets));
  // Toujours vingt fois trop haut : échec après une seule reprise, message en français, aucun fichier final.
  fs.rmSync(r.fichier);
  const essais2 = [];
  const r2 = await exporterFidele({ dossier: dir, pour: 'courriel', tailleMax: 1, ips: 10, navigateur, outil, dossierStyles: STYLES, paralleles: 1,
    debitCourriel: (v, essai) => { essais2.push(essai); return v * 20; } });
  assert.equal(r2.ok, false);
  assert.deepEqual(essais2, [0, 1]);
  assert.match(r2.message, /^La version courriel fait \d+(,\d)? Mo, au-dessus des 1 Mo demandés : je peux viser \d+ Mo, ou exporter une seule scène\.$/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid-courriel.mp4')), false);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sortie')).filter((f) => f.endsWith('.part')), []);
});
