'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../scripts/vocabulaire.js');
const { controler } = require('../scripts/controler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

test('glossaire : modèle, ajout trié, doublon (casse ignorée) refusé, formes à éviter en liste', () => {
  const dir = copierProjet('projet-simple');
  assert.deepEqual(V.lireGlossaire(dir).termes, []);
  assert.deepEqual(V.noterGlossaire({ dossier: dir, terme: 'HACCP', sens: 'Méthode de maîtrise des dangers', eviter: 'Haccp, haccp' }), { ajoute: true, fichier: path.join(dir, 'charte', 'glossaire.md') });
  V.noterGlossaire({ dossier: dir, terme: 'enceinte réfrigérée', sens: 'Chambre froide', eviter: 'chambre froide', prononciation: 'an-sinte' });
  assert.equal(V.noterGlossaire({ dossier: dir, terme: 'haccp', sens: 'doublon' }).ajoute, false);
  const { termes } = V.lireGlossaire(dir);
  assert.deepEqual(termes.map((t) => t.terme), ['enceinte réfrigérée', 'HACCP']);
  assert.deepEqual(termes[1].eviter, ['Haccp', 'haccp']);
  assert.equal(termes[0].prononciation, 'an-sinte');
  assert.match(fs.readFileSync(path.join(dir, 'charte', 'glossaire.md'), 'utf8'), /^# Glossaire/);
});

test('verifierGlossaire : forme à éviter et mauvaise casse d\'un sigle ; pas de faux positif en début de phrase', () => {
  const termes = [{ terme: 'HACCP', sens: '', eviter: [], prononciation: '' }, { terme: 'enceinte réfrigérée', sens: '', eviter: ['chambre froide'], prononciation: '' }];
  const scenes = [
    { id: 'a', textes: { titre: 'La méthode Haccp', sous: 'Enceinte réfrigérée à 4 °C' } },
    { id: 'b', textes: { titre: 'Ranger la Chambre froide', texte: 'HACCP, chambres froides' } },
  ];
  assert.deepEqual(V.verifierGlossaire(scenes, termes).map((p) => [p.scene, p.message]), [
    ['a', 'Scène « a », texte « titre » : « Haccp » s\'écrit « HACCP » (glossaire).'],
    ['b', 'Scène « b », texte « titre » : « Chambre froide » est à éviter (glossaire) ; écrire « enceinte réfrigérée ».'],
  ]);
});

test('contrôle de la vidéo : alertes du glossaire', () => {
  const dir = copierProjet('projet-simple');
  V.noterGlossaire({ dossier: dir, terme: 'HACCP', sens: 'Méthode', eviter: '' });
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Le Haccp en 3 points'; });
  const r = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const g = r.problemes.filter((p) => p.regle === 'glossaire');
  assert.equal(g.length, 1);
  assert.equal(g[0].gravite, 'alerte');
});
