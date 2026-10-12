'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
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
  d.scenes.push({ id: 'intro', fichier: 'x.html', duree: 0, textes: { a: 3 }, transition: 'tourbillon', rythme: -1 });
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

test('charte ou musique à null : message nommant le champ, pas de plantage', () => {
  assert.ok(validerDeroule({ ...valide(), charte: null }).includes('« charte » doit être un objet.'));
  assert.ok(validerDeroule({ ...valide(), musique: null }).includes('« musique » doit être un objet.'));
});

test('noms de police et clés de charte : caractères sûrs seulement', () => {
  const d = valide();
  d.charte.polices = { titres: 'x</style><script>alert(1)</script>', texte: 'Gill Sans', logo2: 'assets/Ma-Police_2.woff2' };
  d.charte.couleurs = { 'pri maire': '#000000' };
  const e = validerDeroule(d);
  assert.ok(e.some((m) => m.startsWith('« charte.polices.titres »')), e.join('\n'));
  assert.ok(!e.some((m) => m.includes('charte.polices.texte')));
  assert.ok(!e.some((m) => m.includes('charte.polices.logo2')));
  assert.ok(e.some((m) => m.includes('« charte.couleurs.pri maire »') && m.includes('a-z, 0-9')));
});

test('lireDeroule : fichier absent, JSON invalide, BOM accepté', () => {
  const dir = dossierTemporaire('pm-');
  assert.match(lireDeroule(dir).erreurs[0], /Fichier introuvable/);
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{ titre: ');
  assert.match(lireDeroule(dir).erreurs[0], /n'est pas un JSON valide/);
  fs.writeFileSync(path.join(dir, 'deroule.json'), '\uFEFF' + JSON.stringify(valide()));
  assert.deepEqual(lireDeroule(dir).erreurs, []);
});

test('scenes[].type : facultatif, un des 8 types de scène toute faite', () => {
  const base = { version: 1, titre: 'T', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'x' };
  const scene = { id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} };
  assert.deepEqual(validerDeroule({ ...base, scenes: [{ ...scene, type: 'liste' }] }), []);
  assert.deepEqual(validerDeroule({ ...base, scenes: [scene] }), []);
  assert.match(validerDeroule({ ...base, scenes: [{ ...scene, type: 'carte' }] })[0], /« type » doit être l'un de : titre, liste/);
});
