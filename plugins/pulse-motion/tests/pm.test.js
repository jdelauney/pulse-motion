'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { copierProjet } = require('./aide/projet.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');

const PM = path.join(__dirname, '..', 'scripts', 'pm.js');
// Dossier personnel isolé : les styles de la personne qui lance les tests n'interviennent pas.
const PERSO = dossierPersonnelEssai();
const pm = (...args) => spawnSync(process.execPath, [PM, ...args], { encoding: 'utf8', env: { ...process.env, PULSE_MOTION_DOSSIER: PERSO } });

test('styles --genre classe les styles ; styles verifier contrôle le contrat', () => {
  const liste = JSON.parse(pm('styles', '--genre', 'formation').stdout);
  assert.equal(liste[0].style, 'clair-pedagogique');
  assert.equal(liste[0].famille, 'moderne');
  const v = pm('styles', 'verifier', 'clair-pedagogique');
  assert.equal(v.status, 0, v.stderr);
  assert.equal(JSON.parse(v.stdout).ok, true);
  const inconnu = pm('styles', 'verifier', 'neon');
  assert.equal(inconnu.status, 1);
  assert.match(inconnu.stderr, /Style « neon » introuvable/);
  assert.equal(pm('styles', '--genre', 'cuisine').status, 1);
});

test('reference, scene et styles affichent les fichiers du plugin', () => {
  assert.match(pm('reference', 'moteur').stdout, /^# /);
  assert.match(pm('reference', 'styles/clair-pedagogique').stdout, /clair-pedagogique/);
  assert.match(pm('scene', 'clair-pedagogique', 'titre').stdout, /<section data-scene="titre"/);
  const styles = JSON.parse(pm('styles').stdout);
  assert.deepEqual(styles.map((s) => s.style), fs.readdirSync(path.join(__dirname, '..', 'styles')).sort());
});

test('noms dangereux ou inconnus refusés, sans lire hors du plugin', () => {
  const r = pm('reference', '../package');
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(pm('scene', 'clair-pedagogique', '../../package').status, 2);
  const absent = pm('reference', 'inconnue');
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /Référence « inconnue » introuvable/);
  assert.equal(pm('commande-inconnue').status, 2);
});

test('les commandes de scripts transmettent arguments et code de sortie', () => {
  const dir = copierProjet('projet-simple');
  const r = pm('etat', dir);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).etape, 'deroule-a-valider');
  const h = pm('historique', 'annuler', dir);
  assert.equal(h.status, 1);
  assert.match(h.stderr, /Aucune retouche à annuler/);
});

test('planche et exporter relaient vers scripts/exporter.js', () => {
  const dir = copierProjet('projet-simple');
  const r = pm('planche', dir, 'rien');
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).message, /Scène inconnue : rien/);
  const invalide = copierProjet('projet-simple');
  fs.writeFileSync(path.join(invalide, 'deroule.json'), '{}');
  const e = pm('exporter', invalide);
  assert.equal(e.status, 1);
  assert.match(JSON.parse(e.stdout).message, /Le déroulé contient des erreurs/);
});

const sh = spawnSync('sh', ['-c', 'echo ok'], { encoding: 'utf8' });
test('bin/pulse-motion (sh) relaie vers scripts/pm.js', { skip: sh.status !== 0 && 'sh introuvable' }, () => {
  const bin = path.join(__dirname, '..', 'bin', 'pulse-motion');
  assert.doesNotMatch(fs.readFileSync(bin, 'utf8'), /\r/, 'fins de ligne LF obligatoires');
  const r = spawnSync('sh', [bin, 'scene', 'clair-pedagogique', 'liste'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-scene="liste"/);
});

test('mouvements : reference, afficher, chercher et introuvable', () => {
  const ref = pm('reference', 'mouvements');
  assert.equal(ref.status, 0, ref.stderr);
  assert.match(ref.stdout, /^# Dictionnaire de mouvements/);
  const fiche = pm('mouvements', 'afficher', '#001');
  assert.equal(fiche.status, 0, fiche.stderr);
  assert.match(fiche.stdout, /Pop-in/);
  assert.equal(JSON.parse(pm('mouvements', 'chercher', 'whip', '--json').stdout)[0].slug, 'whip-pan');
  const rien = pm('mouvements', 'afficher', 'tourbillon');
  assert.equal(rien.status, 1);
  assert.match(rien.stderr, /pulse-motion mouvements chercher/);
});
