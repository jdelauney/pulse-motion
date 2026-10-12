'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { projetEssai } = require('../scripts/lib/projet-essai.js');
const { verifierRendu } = require('../scripts/lib/rendu-style.js');
const { trouverNavigateur } = require('../scripts/lib/navigateur.js');

const CLAIR = path.join(__dirname, '..', 'styles', 'clair-pedagogique');

test('projet d\'essai : scènes du style, textes à la longueur maximale, sélection de types possible', () => {
  const dir = projetEssai({ dossierStyle: CLAIR, ratio: '9:16', ton: 'sombre', types: ['liste', 'titre'] });
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  assert.deepEqual(d.scenes.map((s) => s.id), ['liste', 'titre']);
  assert.equal(d.format.ratio, '9:16');
  assert.equal(d.charte.ton, 'sombre');
  assert.equal(d.style, 'clair-pedagogique');
  assert.ok(d.scenes[0].textes.point1.length > 30 && d.scenes[0].textes.point1.length <= 45);
  assert.ok(fs.existsSync(path.join(dir, 'scenes', 'liste.html')));
});

test('rendu sans navigateur : non vérifié, dit clairement', async () => {
  const r = await verifierRendu({ dossierStyle: CLAIR, navigateur: null });
  assert.equal(r.ok, null);
  assert.match(r.message, /Chrome ou Edge introuvable/);
});

const navigateur = trouverNavigateur();
test('rendu dans le navigateur : style livré sans problème ; titre géant : débordement nommé avec le format', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  assert.deepEqual((await verifierRendu({ dossierStyle: CLAIR, navigateur })).problemes, []);
  const racine = dossierTemporaire('pm-rendu-');
  const d = path.join(racine, 'geant');
  fs.cpSync(CLAIR, d, { recursive: true });
  for (const f of ['catalogue.json', 'identite.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); j.style = 'geant'; fs.writeFileSync(path.join(d, f), JSON.stringify(j));
  }
  fs.appendFileSync(path.join(d, 'style.css'), '\n@container (orientation: portrait) { .titre { font-size: 14cqh; } }\n');
  const r = await verifierRendu({ dossierStyle: d, navigateur, dossierStyles: racine });
  assert.equal(r.ok, false);
  assert.ok(r.problemes.some((p) => /^9:16 : Scène « titre » : le texte « titre » (déborde|sort de l'image)/.test(p)), r.problemes.join('\n'));
  assert.ok(!r.problemes.some((p) => p.startsWith('16:9')), r.problemes.join('\n'));
});
