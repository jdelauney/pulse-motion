'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { validerDeroule, dureeTemps } = require('../scripts/lib/deroule.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const base = () => ({ version: 1, titre: 'T', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 's', scenes: [{ id: 'a', fichier: 'a.html', duree: 1, textes: {} }] });

test('musique : exactement une forme ; réglages d\'une ambiance validés', () => {
  const d = base();
  d.musique = { generee: 'inspirant', tempo: 100, tonalite: 're', intensite: 0.6, graine: 7, volume: 0.5 };
  assert.deepEqual(validerDeroule(d), []);
  d.musique = { fichier: 'assets/m.mp3', generee: 'calme' };
  assert.match(validerDeroule(d).join(' '), /un seul de « fichier », « generee » ou « partition »/);
  d.musique = { generee: 'jazz', tempo: 300, tonalite: 'h', intensite: 2, graine: -1 };
  const e = validerDeroule(d).join(' ');
  for (const motif of [/« musique\.generee » doit être l'une de/, /« musique\.tempo »/, /« musique\.tonalite »/, /« musique\.intensite »/, /« musique\.graine »/]) assert.match(e, motif);
  d.musique = { generee: 'calme', tempo: 80 };
  d.tempo = { bpm: 90 };
  assert.match(validerDeroule(d).join(' '), /le tempo de la musique générée \(80\) et « tempo\.bpm » \(90\) diffèrent/i);
});

test('tempo d\'une musique générée = tempo du déroulé', () => {
  const d = base();
  d.musique = { generee: 'calme' };
  assert.equal(dureeTemps(d), 60 / 72);
  d.musique.tempo = 120;
  assert.equal(dureeTemps(d), 0.5);
});

test('bruitages validés', () => {
  const d = base();
  d.bruitages = { transitions: 'oui', volume: 3 };
  const e = validerDeroule(d).join(' ');
  assert.match(e, /« bruitages\.transitions » doit valoir true ou false/);
  assert.match(e, /« bruitages\.volume » doit être un nombre entre 0 et 1/);
});

test('musique générée : partition valide dans les données, tempo transmis, bruitages transmis', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { generee: 'inspirant', graine: 2, volume: 0.6 }; d.bruitages = { transitions: true, volume: 0.8 }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(r.ok, true);
  assert.equal(r.donnees.musique.volume, 0.6);
  assert.equal(r.donnees.musique.partition.tempo, 100);
  assert.deepEqual(r.donnees.tempo, { bpm: 100, decalage: 0 });
  assert.deepEqual(r.donnees.bruitages, { transitions: true, volume: 0.8 });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
});

test('partition libre : lue depuis assets/, erreurs nommées si elle est invalide', () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'partition.json'), JSON.stringify({ tempo: 90, mesures: 4, pistes: [{ instrument: 'pad', motif: ['do3+mi3+sol3 1'] }] }));
  modifierDeroule(dir, (d) => { d.musique = { partition: 'assets/partition.json' }; });
  assert.equal(assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).donnees.musique.partition.tempo, 90);
  fs.writeFileSync(path.join(dir, 'assets', 'partition.json'), JSON.stringify({ tempo: 90, mesures: 4, pistes: [{ instrument: 'violon', motif: ['do3 1'] }] }));
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const e = r.erreurs.find((x) => x.regle === 'partition-invalide');
  assert.ok(e && e.gravite === 'erreur');
  assert.match(e.message, /instrument « violon » inconnu/);
  assert.equal(r.donnees.musique.partition, null);
});
