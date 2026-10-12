'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const V = require('../scripts/vocabulaire.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');

function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  try { return fn(process.env.PULSE_MOTION_DOSSIER); } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
}

test('sans lexique : le modèle, avec les images fixes et un tableau vide', () => avecPersonnel(() => {
  const l = V.lireLexique();
  assert.match(l.texte, /\*\*déroulé\*\* : la liste des scènes dans l'ordre, comme le conducteur d'une émission/);
  assert.deepEqual(l.termes, []);
}));

test('noter : ajout trié sans tenir compte des accents, doublon ignoré, cellules nettoyées', () => avecPersonnel((perso) => {
  assert.deepEqual(V.noterLexique({ terme: 'transition', phrase: 'Le passage | d\'une scène à l\'autre', comme: 'un fondu au cinéma', commande: '/pulse-motion:creer', date: '2026-10-11' }), { ajoute: true, fichier: path.join(perso, 'lexique.md') });
  V.noterLexique({ terme: 'Écran', phrase: 'Ce qu\'on voit', comme: 'une page', date: '2026-10-11' });
  V.noterLexique({ terme: 'aperçu', phrase: 'La vidéo dans le navigateur', comme: 'une répétition', date: '2026-10-12' });
  assert.equal(V.noterLexique({ terme: 'Ecran', phrase: 'doublon' }).ajoute, false);
  const { termes, texte } = V.lireLexique();
  assert.deepEqual(termes.map((t) => t.terme), ['aperçu', 'Écran', 'transition']);
  assert.equal(termes[2].phrase, 'Le passage / d\'une scène à l\'autre');
  assert.equal(termes[2].vuLe, '2026-10-11 · /pulse-motion:creer');
  assert.equal(termes[2].statut, 'vu');
  assert.match(texte, /<!-- Statut/);
}));

test('lexique corrigé à la main sans tableau : le tableau est recréé à la fin', () => avecPersonnel((perso) => {
  fs.writeFileSync(path.join(perso, 'lexique.md'), '# Mon lexique\n\nMes notes.\n');
  V.noterLexique({ terme: 'scène', phrase: 'Un écran animé', comme: 'une diapositive qui bouge', date: '2026-10-11' });
  const texte = fs.readFileSync(path.join(perso, 'lexique.md'), 'utf8');
  assert.match(texte, /^# Mon lexique\n\nMes notes\.\n/);
  assert.match(texte, /\| Terme \| En une phrase \| Comme… \| Vu le \| Statut \|\n\|---\|---\|---\|---\|---\|\n\| scène \| Un écran animé \|/);
}));

test('refus : terme ou phrase vide ; dossier impossible à écrire : message avec la variable', () => avecPersonnel((perso) => {
  assert.throws(() => V.noterLexique({ terme: ' ', phrase: 'x' }), /au moins un terme et une phrase/);
  fs.writeFileSync(path.join(perso, 'bloque'), 'fichier, pas dossier');
  process.env.PULSE_MOTION_DOSSIER = path.join(perso, 'bloque');
  assert.throws(() => V.noterLexique({ terme: 'scène', phrase: 'x' }), /PULSE_MOTION_DOSSIER/);
}));

test('ligne de commande : lexique et lexique noter', () => avecPersonnel((perso) => {
  const pm = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), ...a], { encoding: 'utf8', env: { ...process.env, PULSE_MOTION_DOSSIER: perso } });
  const ajout = pm('lexique', 'noter', 'style', 'L\'allure de la vidéo', 'un thème de présentation', '/pulse-motion:creer');
  assert.equal(ajout.status, 0, ajout.stderr);
  assert.match(pm('lexique').stdout, /\| style \| L'allure de la vidéo \|/);
  assert.equal(pm('lexique', 'oublier').status, 2);
}));

test('lexique corrigé à la main : cellule avec « \| » et rangée sans « | » final gardées telles quelles', () => avecPersonnel((perso) => {
  const modele = fs.readFileSync(path.join(__dirname, '..', 'modeles', 'lexique.md'), 'utf8');
  const echappee = '| zoom | grossir \| rapprocher | une loupe | 2026-10-01 | vu |';
  const sansFin = '| balayage | passer d\'un côté à l\'autre | un essuie-glace | 2026-10-02 | vu';
  fs.writeFileSync(path.join(perso, 'lexique.md'), modele.replace('|---|---|---|---|---|\n', `|---|---|---|---|---|\n${echappee}\n${sansFin}\n`));
  V.noterLexique({ terme: 'aperçu', phrase: 'La vidéo dans le navigateur', date: '2026-10-12' });
  const texte = fs.readFileSync(path.join(perso, 'lexique.md'), 'utf8');
  assert.ok(texte.includes(echappee), texte);
  assert.ok(texte.includes(sansFin), texte);
  assert.match(texte, /\| aperçu \| La vidéo dans le navigateur \|/);
  assert.equal(V.lireLexique().termes.find((t) => t.terme === 'zoom').phrase, 'grossir \| rapprocher');
}));
