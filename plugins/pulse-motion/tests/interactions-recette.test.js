'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

const PARAMETRES = { k: { defaut: 0.5, min: 0, max: 1 } };
const compiler = (emetteurs) => R.compiler({ version: 1, nom: 'essai', parametres: PARAMETRES, emetteurs }, { dur: 2, graine: 3, charte: {} });
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.erreurs)); return r.effet; };
const erreurDe = (r) => { assert.equal(r.ok, false); return r.erreurs[0]; };
/** Émetteur racine d'une salve de 50 particules, bloc « interactions » donné (absent si undefined). */
const em = (nom, interactions, extra = {}) => Object.assign({ nom, naissance: { salves: [{ t: 0, nombre: 50 }], vie: [3, 3], taille: [0.5, 0.5] } },
  interactions === undefined ? {} : { interactions }, extra);

test('interactions : absentes par défaut, défauts de la spec pour les trois types, voie rapide quittée', () => {
  const sans = ok(compiler([em('a')])).emetteurs[0];
  assert.equal(sans.interactions, null);
  assert.equal(sans.voieRapide, true);
  assert.deepEqual(R.CODES.interaction, { essaim: 0, fluide: 1, grains: 2 });
  assert.deepEqual(R.LIMITES_INTERACTIONS, { essaim: 100000, fluide: 60000, grains: 60000 });
  assert.deepEqual([R.RAYON_INTERACTION, R.RAYON_MIN, R.RAYON_MAX, R.GROUPE_MAX, R.ITERATIONS_GRAINS], [2, 0.25, 20, 8, 3]);
  const e = ok(compiler([em('a', { type: 'essaim' })])).emetteurs[0];
  assert.equal(e.voieRapide, false, 'interactions : simulé pas à pas');
  const sansGroupe = (x) => { const c = Object.assign({}, x); delete c.groupe; return c; };
  assert.deepEqual(sansGroupe(e.interactions), { type: 'essaim', code: 0, rayon: 2, avec: [], separation: 1.5, alignement: 1, cohesion: 1,
    vision: { rayon: 6, angle: 270 * Math.PI / 180 }, vitesse: [5, 20], cible: null, fuite: 30, cote: 6 });
  const f = ok(compiler([em('a', { type: 'fluide' })])).emetteurs[0].interactions;
  assert.deepEqual(sansGroupe(f), { type: 'fluide', code: 1, rayon: 2, avec: [], densite: 6, viscosite: 0.05, tension: 0.1, incompressibilite: 4, rho0: 4.712389, cote: 2 });
  const g = ok(compiler([em('a', { type: 'grains' })])).emetteurs[0].interactions;
  assert.deepEqual(sansGroupe(g), { type: 'grains', code: 2, rayon: 2, avec: [], frottement: { statique: 0.6, dynamique: 0.4 }, cohesion: 0, restitution: 0.1, cote: 2 });
});

test('interactions : réglages, expressions des réglages exposés, cible « ancre » ou fraction de la zone', () => {
  const e = ok(compiler([em('a', { type: 'essaim', rayon: '4 * k', separation: 0, alignement: 5, cohesion: '2 * k', vision: { rayon: 3, angle: 360 },
    vitesse: [0, 'k * 10'], cible: 'ancre', fuite: 0 })])).emetteurs[0].interactions;
  assert.deepEqual([e.rayon, e.separation, e.alignement, e.cohesion, e.vision.rayon, e.vitesse, e.cible, e.fuite, e.cote], [2, 0, 5, 1, 3, [0, 5], [0.5, 0.5], 0, 3]);
  assert.ok(Math.abs(e.vision.angle - 2 * Math.PI) < 1e-12, 'angle en radians');
  assert.deepEqual(ok(compiler([em('a', { type: 'essaim', cible: [0.2, 0.8] })])).emetteurs[0].interactions.cible, [0.2, 0.8]);
  const f = ok(compiler([em('a', { type: 'fluide', densite: 10, viscosite: 0.6, tension: 0.5, incompressibilite: 6 })])).emetteurs[0].interactions;
  assert.deepEqual([f.densite, f.viscosite, f.tension, f.incompressibilite, f.rho0], [10, 0.6, 0.5, 6, 7.853982]);
  const g = ok(compiler([em('a', { type: 'grains', rayon: 1, frottement: { statique: 0.8, dynamique: 0.5 }, cohesion: 0.3, restitution: 0 })])).emetteurs[0].interactions;
  assert.deepEqual([g.rayon, g.frottement, g.cohesion, g.restitution, g.cote], [1, { statique: 0.8, dynamique: 0.5 }, 0.3, 0, 1]);
});

test('interactions : erreurs nommées « interactions-invalides », avec le chemin du champ', () => {
  const cas = [
    [{ type: 'nuage' }, 'emetteurs[a].interactions.type', /« nuage » inconnu \(essaim, fluide, grains\)/],
    [{}, 'emetteurs[a].interactions.type', /valeur obligatoire \(essaim, fluide, grains\)/],
    [{ type: 'essaim', rayon: 0.1 }, 'emetteurs[a].interactions.rayon', /valeur entre 0.25 et 20 attendue/],
    [{ type: 'essaim', separation: 6 }, 'emetteurs[a].interactions.separation', /valeur entre 0 et 5 attendue/],
    [{ type: 'essaim', vision: { angle: 400 } }, 'emetteurs[a].interactions.vision.angle', /valeur entre 10 et 360 attendue/],
    [{ type: 'essaim', vision: 3 }, 'emetteurs[a].interactions.vision', /objet attendu/],
    [{ type: 'essaim', vitesse: [0, 0] }, 'emetteurs[a].interactions.vitesse', /vitesses positives attendues/],
    [{ type: 'essaim', fuite: -1 }, 'emetteurs[a].interactions.fuite', /valeur supérieure ou égale à 0 attendue/],
    [{ type: 'essaim', cible: [1] }, 'emetteurs[a].interactions.cible', /paire \[x, y\] attendue/],
    [{ type: 'fluide', incompressibilite: 8 }, 'emetteurs[a].interactions.incompressibilite', /valeur entre 2 et 6 attendue/],
    [{ type: 'fluide', viscosite: 1.5 }, 'emetteurs[a].interactions.viscosite', /valeur entre 0 et 1 attendue/],
    [{ type: 'grains', frottement: { statique: 2 } }, 'emetteurs[a].interactions.frottement.statique', /valeur entre 0 et 1.5 attendue/],
    [{ type: 'grains', densite: 6 }, 'emetteurs[a].interactions.densite', /champ inconnu \(champs possibles : type, rayon, avec, frottement, cohesion, restitution\)/],
    [{ type: 'essaim', avec: 'b' }, 'emetteurs[a].interactions.avec', /liste de noms d'émetteurs attendue/],
    [{ type: 'essaim', avec: [3] }, 'emetteurs[a].interactions.avec[0]', /nom d'émetteur attendu/],
    ['oui', 'emetteurs[a].interactions', /objet attendu/],
  ];
  for (const [interactions, chemin, message] of cas) {
    const e = erreurDe(compiler([em('a', interactions)]));
    assert.equal(e.regle, 'interactions-invalides', JSON.stringify(interactions));
    assert.equal(e.chemin, chemin, JSON.stringify(interactions));
    assert.match(e.message, message, JSON.stringify(interactions));
  }
  // Ailleurs dans la recette, les règles ne changent pas.
  assert.equal(erreurDe(compiler([em('a', { type: 'essaim' }, { naissance: { vie: [-1, 1], salves: [{ t: 0, nombre: 1 }] } })])).regle, 'effet-invalide');
  assert.equal(erreurDe(compiler([em('a', { type: 'essaim' }, { collisions: { reponse: 'coller' } })])).regle, 'collisions-invalides');
});

test('interactions : schéma (variantes par type, valeurs du compilateur, exemples)', () => {
  const n = R.SCHEMA.champs.emetteurs.element.champs.interactions;
  assert.equal(n.type, 'objet');
  assert.deepEqual(n.champs.type.valeurs, Object.keys(R.CODES.interaction));
  assert.deepEqual(Object.keys(n.variantes.types), Object.keys(R.CODES.interaction));
  assert.deepEqual(Object.keys(n.champs), ['type', 'rayon', 'avec']);
  assert.deepEqual(Object.keys(n.variantes.types.essaim.champs), ['separation', 'alignement', 'cohesion', 'vision', 'vitesse', 'cible', 'fuite']);
  assert.deepEqual(Object.keys(n.variantes.types.fluide.champs), ['densite', 'viscosite', 'tension', 'incompressibilite']);
  assert.deepEqual(Object.keys(n.variantes.types.grains.champs), ['frottement', 'cohesion', 'restitution']);
  assert.equal(n.champs.avec.maximum, R.GROUPE_MAX - 1);
  assert.deepEqual(n.exemple, { type: 'essaim' });
});
