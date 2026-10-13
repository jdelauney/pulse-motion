'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

const compiler = (emetteurs, o = {}) => R.compiler({ version: 1, nom: 'essai', parametres: { k: { defaut: 0.5, min: 0, max: 1 } }, emetteurs }, { dur: 2, graine: 3, ...o });
const salve = (extra = {}) => ({ nom: 'a', naissance: { salves: [{ t: 0, nombre: 10 }] }, ...extra });
const erreurDe = (r) => { assert.equal(r.ok, false); return r.erreurs[0]; };

test('collisions : absentes par défaut, valeurs par défaut de la spec', () => {
  assert.equal(compiler([salve()]).effet.emetteurs[0].collisions, null);
  const c = compiler([salve({ collisions: {} })]).effet.emetteurs[0].collisions;
  assert.deepEqual(c, {
    masque: 15, reponse: 'rebond', reponseCode: 0, restitution: [0.4, 0.4], frottement: [0.2, 0.2],
    reposApres: null, empiler: false, epaisseur: null, talus: 35, sol: null,
  });
  assert.deepEqual(R.CODES.reponse, { rebond: 0, poser: 1, mourir: 2 });
  assert.deepEqual(R.CODES.cible, { sol: 1, murs: 2, elements: 4, formes: 8 });
});

test('collisions : cibles, réponse, intervalles et expressions', () => {
  const c = compiler([salve({ collisions: {
    cibles: ['sol', 'formes'], reponse: 'poser', restitution: ['k', 0.8], frottement: '2 * k', repos_apres: [1, 3],
    empiler: true, epaisseur: 0.5, talus: '30 + 10', sol: 90,
  } })]).effet.emetteurs[0].collisions;
  assert.equal(c.masque, 1 | 8);
  assert.equal(c.reponse, 'poser');
  assert.equal(c.reponseCode, 1);
  assert.deepEqual(c.restitution, [0.5, 0.8]);
  assert.deepEqual(c.frottement, [1, 1]);
  assert.deepEqual(c.reposApres, [1, 3]);
  assert.equal(c.empiler, true);
  assert.deepEqual(c.epaisseur, [0.5, 0.5]);
  assert.equal(c.talus, 40);
  assert.equal(c.sol, 90);
  assert.equal(compiler([salve({ collisions: { reponse: 'mourir', cibles: ['murs', 'murs'] } })]).effet.emetteurs[0].collisions.masque, 2);
});

test('collisions : erreurs nommées « collisions-invalides », avec le chemin du champ', () => {
  const cas = [
    [{ cibles: ['plafond'] }, 'emetteurs[a].collisions.cibles[0]', /« plafond » inconnu \(sol, murs, elements, formes\)/],
    [{ cibles: [] }, 'emetteurs[a].collisions.cibles', /liste non vide/],
    [{ cibles: ['sol', 'murs', 'elements', 'formes', 'sol'] }, 'emetteurs[a].collisions.cibles', /4 cibles au plus/],
    [{ reponse: 'coller' }, 'emetteurs[a].collisions.reponse', /« coller » inconnu \(rebond, poser, mourir\)/],
    [{ restitution: 1.5 }, 'emetteurs[a].collisions.restitution', /entre 0 et 1/],
    [{ frottement: [-0.1, 0.2] }, 'emetteurs[a].collisions.frottement', /entre 0 et 1/],
    [{ repos_apres: -1 }, 'emetteurs[a].collisions.repos_apres', /positive ou nulle/],
    [{ epaisseur: [-1, 1] }, 'emetteurs[a].collisions.epaisseur', /positive ou nulle/],
    [{ talus: 90 }, 'emetteurs[a].collisions.talus', /entre 5 et 80/],
    [{ talus: [30, 40] }, 'emetteurs[a].collisions.talus', /nombre ou expression attendu/],
    [{ empiler: true }, 'emetteurs[a].collisions.empiler', /« reponse »: « poser »/],
    [{ empiler: 'oui' }, 'emetteurs[a].collisions.empiler', /true ou false/],
    [{ sol: 'haut' }, 'emetteurs[a].collisions.sol', /« haut » inconnu/],
    [{ rebond: 1 }, 'emetteurs[a].collisions.rebond', /champ inconnu \(champs possibles : cibles, reponse, restitution, frottement, repos_apres, empiler, epaisseur, talus, sol\)/],
    ['oui', 'emetteurs[a].collisions', /objet attendu/],
  ];
  for (const [collisions, chemin, message] of cas) {
    const e = erreurDe(compiler([salve({ collisions })]));
    assert.equal(e.regle, 'collisions-invalides', JSON.stringify(collisions));
    assert.equal(e.chemin, chemin, JSON.stringify(collisions));
    assert.match(e.message, message, JSON.stringify(collisions));
  }
  // Ailleurs dans la recette, la règle reste effet-invalide.
  assert.equal(erreurDe(compiler([salve({ naissance: { vie: [-1, 1], salves: [{ t: 0, nombre: 1 }] } })])).regle, 'effet-invalide');
});
