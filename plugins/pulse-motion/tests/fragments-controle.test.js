'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { traduirePhotos } = require('../scripts/lib/rendu-controle.js');

test('contrôle de la vidéo rendue : problèmes de photographie des fragments', () => {
  const p = traduirePhotos([
    { scene: 's', element: 'titre', regle: 'ancre-vide', message: 'm1' },
    { scene: 's', element: 'fond', regle: 'photographie-trop-grande', message: 'm2' },
  ]);
  assert.deepEqual(p, [
    { regle: 'ancre-vide', gravite: 'erreur', scene: 's', element: 'titre', message: 'm1' },
    { regle: 'photographie-trop-grande', gravite: 'alerte', scene: 's', element: 'fond', message: 'm2' },
  ]);
  assert.deepEqual(traduirePhotos(undefined), []);
});
