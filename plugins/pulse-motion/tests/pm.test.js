'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { copierProjet } = require('./aide/projet.js');

const PM = path.join(__dirname, '..', 'scripts', 'pm.js');
const pm = (...args) => spawnSync(process.execPath, [PM, ...args], { encoding: 'utf8' });

test('reference, scene et styles affichent les fichiers du plugin', () => {
  assert.match(pm('reference', 'moteur').stdout, /^# /);
  assert.match(pm('reference', 'styles/clair-pedagogique').stdout, /clair-pedagogique/);
  assert.match(pm('scene', 'clair-pedagogique', 'titre').stdout, /<section data-scene="titre"/);
  const styles = JSON.parse(pm('styles').stdout);
  assert.deepEqual(styles.map((s) => s.style), ['clair-pedagogique']);
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
