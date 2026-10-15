'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { executer } = require('../scripts/personnages.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const PM = path.join(__dirname, '..', 'scripts', 'pm.js');

test('personnages liste : bibliothèque et fichiers de la vidéo', async () => {
  const video = dossierTemporaire();
  fs.mkdirSync(path.join(video, 'personnages', 'poses'), { recursive: true });
  fs.writeFileSync(path.join(video, 'personnages', 'poses', 'gratte-tete.json'), JSON.stringify({ nom: 'gratte-tete', description: 'se gratte la tête', angles: { brasAvant: -150, avantBrasAvant: -120 } }));
  const r = await executer(['liste', '--dossier', video]);
  assert.equal(r.code, 0, r.erreur);
  const l = JSON.parse(r.sortie);
  assert.ok(l.clips.some((c) => c.nom === 'marche' && c.source === 'plugin' && c.boucle === true && c.duree === 1));
  assert.ok(l.poses.some((p) => p.nom === 'gratte-tete' && p.source === 'video'));
  assert.deepEqual(l.erreurs, []);
});

test('personnages afficher : le fichier, au format stable ; nom inconnu', async () => {
  const r = await executer(['afficher', 'marche']);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.sortie).foulee, 248);
  const g = await executer(['afficher', 'standard', '--type', 'gabarit']);
  assert.equal(JSON.parse(g.sortie).cuisse, 68);
  const x = await executer(['afficher', 'marcher']);
  assert.equal(x.code, 1);
  assert.match(x.erreur, /« marcher » introuvable.*marche/);
});

test('personnages verifier : code 1 et messages si un fichier est invalide', async () => {
  const ok = await executer(['verifier']);
  assert.equal(ok.code, 0);
  assert.match(ok.sortie, /6 poses, 10 clips, 2 gabarits, aucune erreur/);
  const video = dossierTemporaire();
  fs.mkdirSync(path.join(video, 'personnages', 'clips'), { recursive: true });
  fs.writeFileSync(path.join(video, 'personnages', 'clips', 'mal.json'), JSON.stringify({ nom: 'mal', boucle: true, cles: [{ t: 2, angles: {} }] }));
  const ko = await executer(['verifier', '--dossier', video]);
  assert.equal(ko.code, 1);
  assert.match(ko.erreur, /clips\/mal\.json \(vidéo\) : .*duree/);
});

test('pm personnages : branché sur le point d\'entrée, usage', () => {
  const r = spawnSync(process.execPath, [PM, 'personnages', 'verifier'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const u = spawnSync(process.execPath, [PM, 'personnages'], { encoding: 'utf8' });
  assert.equal(u.status, 2);
  assert.match(u.stderr, /Usage : pulse-motion personnages liste/);
});
