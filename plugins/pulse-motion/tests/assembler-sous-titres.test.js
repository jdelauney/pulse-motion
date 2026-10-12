'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const avecTextes = (dir, sousTitres = {}) => modifierDeroule(dir, (d) => {
  d.sousTitres = sousTitres;
  d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' };
  d.scenes[1].voix = { texte: 'Les bactéries ralentissent.' };
});

test('sous-titres : cartons dans les données, fichiers SRT et VTT écrits', () => {
  const dir = copierProjet('projet-simple');
  avecTextes(dir);
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  const st = r.donnees.sousTitres;
  assert.deepEqual([st.mode, st.incrustes, st.position], ['ligne', true, null]);
  assert.deepEqual(st.cartons.map((c) => c.scene), ['intro', 'chiffre']);
  assert.ok(st.cartons[1].debut >= 3.5, JSON.stringify(st.cartons[1]));
  const srt = fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.srt'), 'utf8');
  assert.match(srt, /^1\n00:00:00,300 --> /);
  assert.match(srt, /Les bactéries ralentissent\./);
  assert.match(fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.vtt'), 'utf8'), /^WEBVTT\n/);
});

test('revue : incrustes false : réglages transmis, fichiers quand même', () => {
  const dir = copierProjet('projet-simple');
  avecTextes(dir, { incrustes: false, mode: 'mot', position: 'haut' });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual([r.donnees.sousTitres.incrustes, r.donnees.sousTitres.mode, r.donnees.sousTitres.position], [false, 'mot', 'haut']);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.srt')));
});

test('revue : texte retouché : cartons et fichiers recalculés', () => {
  const dir = copierProjet('projet-simple');
  avecTextes(dir);
  assembler({ dossier: dir, dossierStyles: STYLES });
  modifierDeroule(dir, (d) => { d.scenes[1].voix.texte = 'Elles se multiplient moins vite.'; });
  assembler({ dossier: dir, dossierStyles: STYLES });
  const srt = fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.srt'), 'utf8');
  assert.match(srt, /Elles se multiplient moins vite\./);
  assert.doesNotMatch(srt, /ralentissent/);
});

test('sans champ sousTitres, ou sans texte dit : rien', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Bonjour' }; });
  assert.equal(assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).donnees.sousTitres, null);
  const dir2 = copierProjet('projet-simple');
  modifierDeroule(dir2, (d) => { d.sousTitres = {}; });
  assert.equal(assembler({ dossier: dir2, dossierStyles: STYLES }).donnees.sousTitres, null);
  assert.equal(fs.existsSync(path.join(dir2, 'sortie', 'la-chaine-du-froid.srt')), false);
});

test('validation de sousTitres', () => {
  const d = { version: 1, titre: 'T', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 's', scenes: [{ id: 'a', fichier: 'a.html', duree: 1, textes: {} }],
    sousTitres: { mode: 'karaoke', incrustes: 'oui', position: 'milieu' } };
  const e = validerDeroule(d).join(' ');
  assert.match(e, /« sousTitres\.mode » doit être « ligne » ou « mot »/);
  assert.match(e, /« sousTitres\.incrustes » doit valoir true ou false/);
  assert.match(e, /« sousTitres\.position » doit être « bas » ou « haut »/);
});
