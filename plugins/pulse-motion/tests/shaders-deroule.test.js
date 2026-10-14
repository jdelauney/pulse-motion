'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validerDeroule, MAX_POST } = require('../scripts/lib/deroule.js');

const base = () => ({
  version: 1, titre: 'Essai', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'test',
  scenes: [
    { id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} },
    { id: 'b', fichier: 'scenes/b.html', duree: 3, textes: {}, transition: 'fondu' },
  ],
});

test('déroulé : transition objet et post-traitements', () => {
  const d = base();
  d.scenes[1].transition = { shader: 'dissolution', duree: 0.8, reglages: { grain: 0.5, couleur: 'accent' }, image: 'assets/motif.png' };
  d.scenes[0].post = [{ shader: 'grain', reglages: { force: 0.3 } }];
  d.post = [{ shader: 'vignettage' }, { shader: 'aberration', reglages: { ecart: 0.4 } }];
  assert.deepEqual(validerDeroule(d), []);
  assert.deepEqual(validerDeroule(base()), [], 'transitions CSS inchangées');
  assert.equal(MAX_POST, 4);
});

test('déroulé : transitions et post-traitements mal écrits', () => {
  const cas = [
    [(d) => { d.scenes[1].transition = 'tourbillon'; }, /« transition » doit être l'une de : aucune, fondu.*ou un shader \{ "shader": "dissolution", "duree": 0\.8 \}/],
    [(d) => { d.scenes[1].transition = { duree: 1 }; }, /« transition » : « shader » doit être le nom d'un shader/],
    [(d) => { d.scenes[1].transition = { shader: 'Dissolution!' }; }, /« shader » doit être le nom d'un shader/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', duree: 9 }; }, /« transition\.duree » doit être un nombre de secondes entre 0,1 et 5/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', vitesse: 2 }; }, /champ « vitesse » inconnu \(champs : shader, duree, reglages, image\)/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', reglages: [1] }; }, /« reglages » doit être un objet/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', image: 'motif.png' }; }, /« image » doit être un fichier de assets\//],
    [(d) => { d.scenes[0].post = { shader: 'grain' }; }, /La scène « a » : « post » doit être une liste/],
    [(d) => { d.post = [{ shader: 'grain', duree: 2 }]; }, /« post »\[1\] : champ « duree » inconnu \(champs : shader, reglages, image\)/],
    [(d) => { d.post = Array.from({ length: 5 }, () => ({ shader: 'grain' })); }, /« post » : 4 post-traitements au plus/],
  ];
  for (const [modifier, motif] of cas) {
    const d = base();
    modifier(d);
    const err = validerDeroule(d);
    assert.ok(err.some((m) => motif.test(m)), `${motif} dans ${JSON.stringify(err)}`);
  }
});
