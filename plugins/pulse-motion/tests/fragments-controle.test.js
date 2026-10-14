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

const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { trouverNavigateur } = require('../scripts/lib/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

test('contrôle de la vidéo rendue : métamorphose sur place, sans GPU (raccords posés selon t : pas de chevauchement)', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'Avant', apres: 'Après' }; d.scenes[0].duree = 5; });
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <h1 id="titre" data-texte="titre" data-start="0.2" style="position:absolute; left:20cqh; top:30cqh;"></h1>
  <h1 id="apres" data-texte="apres" data-start="0.2" style="position:absolute; left:20cqh; top:30cqh;"></h1>
  <div data-effet="metamorphose" data-ancre="#titre" data-cible="#apres" data-start="2" data-dur="1.5"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: path.join(__dirname, '..', 'effets'), ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const html = a.html.replace('<head>', '<head><script>window.__PM_SANS_GPU__ = true;</script>');
  const r = await controlerRendu({ html, ratio: '16:9', duree: 5 });
  assert.equal(r.renduVerifie, true, JSON.stringify(r.problemes));
  assert.deepEqual(r.problemes.filter((p) => p.regle === 'chevauchement'), [], 'A caché dès le début, B jusqu\'à l\'arrivée');
  assert.deepEqual(r.problemes.filter((p) => p.regle === 'ancre-vide'), []);
});
