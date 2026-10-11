'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validerDeroule, lireDeroule } = require('../scripts/lib/deroule.js');

const valide = () => ({
  version: 1,
  titre: 'La chaîne du froid',
  genre: 'formation',
  parcours: 'rapide',
  format: { ratio: '16:9', ips: 30 },
  style: 'test',
  charte: { couleurs: { primaire: '#0a6cff' }, polices: { titres: 'Figtree' } },
  musique: { fichier: 'assets/musique.mp3', volume: 0.6 },
  scenes: [{ id: 'intro', fichier: 'scenes/01-intro.html', duree: 6, textes: { titre: 'Pourquoi 4 °C ?' }, transition: 'fondu' }],
});

test('un déroulé complet est valide', () => {
  assert.deepEqual(validerDeroule(valide()), []);
});

test('les champs facultatifs peuvent manquer', () => {
  const d = valide();
  delete d.charte; delete d.musique; delete d.format.ips; delete d.scenes[0].transition;
  assert.deepEqual(validerDeroule(d), []);
});

test('chaque erreur nomme le champ et la scène', () => {
  const d = valide();
  d.genre = 'tuto';
  d.charte.couleurs.primaire = 'bleu';
  d.scenes.push({ id: 'intro', fichier: 'x.html', duree: 0, textes: { a: 3 }, transition: 'zoom', rythme: -1 });
  const e = validerDeroule(d);
  assert.ok(e.some((m) => m.startsWith('« genre » doit être')));
  assert.ok(e.some((m) => m.includes('« charte.couleurs.primaire »') && m.includes('"bleu"')));
  for (const champ of ['« id » est déjà utilisé', '« duree »', '« textes.a »', '« transition »', '« rythme »']) {
    assert.ok(e.some((m) => m.startsWith('La scène « intro »') && m.includes(champ)), `manque : ${champ}`);
  }
});

test('id de scène invalide, aucune scène, pas un objet', () => {
  const d = valide();
  d.scenes[0].id = 'Intro !';
  assert.ok(validerDeroule(d).some((m) => m.includes('a-z, 0-9')));
  assert.deepEqual(validerDeroule({ ...valide(), scenes: [] }).slice(-1), ['« scenes » doit contenir au moins une scène.']);
  assert.deepEqual(validerDeroule([]), ['Le déroulé doit être un objet JSON.']);
});

test('lireDeroule : fichier absent, JSON invalide, BOM accepté', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  assert.match(lireDeroule(dir).erreurs[0], /Fichier introuvable/);
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{ titre: ');
  assert.match(lireDeroule(dir).erreurs[0], /n'est pas un JSON valide/);
  fs.writeFileSync(path.join(dir, 'deroule.json'), '\uFEFF' + JSON.stringify(valide()));
  assert.deepEqual(lireDeroule(dir).erreurs, []);
});
