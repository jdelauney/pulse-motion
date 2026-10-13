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

const parent = (extra = {}) => ({ nom: 'p', naissance: { debit: 100, vie: [1, 1] }, collisions: { reponse: 'rebond' }, ...extra });
const enfant = (nom = 'e', extra = {}) => ({ nom, naissance: { nombre: 2, vie: [0.5, 0.5] }, ...extra });

test('a_la_collision : lien, déclencheur, capacité de l\'enfant (générations)', () => {
  const r = compiler([parent({ a_la_collision: { emetteur: 'e' } }), enfant()]);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const [p, e] = r.effet.emetteurs;
  assert.equal(p.aLaCollision, 1);
  assert.equal(p.aLaMort, -1);
  assert.equal(p.declencheur, null);
  assert.equal(e.parent, 0);
  assert.equal(e.declencheur, 'collision');
  // Parent : debit 100, vie 1, dur 2 -> capContinu 101, espacement 1,01 s, gigue 0.
  // Collision : G = ceil((0,5 + 0 + 1) / 1,01) = 2 -> 101 × 2 × 2 = 404 cases.
  assert.equal(p.capacite, 101);
  assert.equal(e.G, 2);
  assert.equal(e.capacite, 404);
  // Même enfant par a_la_mort : G = ceil((0,5 + 0) / 1,01) = 1.
  const m = compiler([{ ...parent(), a_la_mort: { emetteur: 'e' } }, enfant()]).effet.emetteurs;
  assert.equal(m[1].declencheur, 'mort');
  assert.equal(m[1].G, 1);
  assert.equal(m[1].capacite, 202);
  // La voie rapide ne regarde pas les collisions (décidé à l'exécution).
  assert.equal(compiler([parent()]).effet.emetteurs[0].voieRapide, true);
});

test('a_la_collision : morts avancées élargissent la gigue des enfants « a_la_mort »', () => {
  // Parent qui meurt au contact : ses morts tombent n'importe où dans [0, 1] s de vie -> gigue 1.
  const r = compiler([
    { nom: 'p', naissance: { debit: 100, vie: [1, 1] }, collisions: { reponse: 'mourir' }, a_la_mort: { emetteur: 'e' } },
    enfant(),
  ]);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  // G = ceil((0,5 + 1) / 1,01) = 2 (au lieu de 1 sans morts avancées).
  assert.equal(r.effet.emetteurs[1].G, 2);
  const repos = compiler([
    { nom: 'p', naissance: { debit: 100, vie: [1, 1] }, collisions: { reponse: 'poser', repos_apres: 0.2 }, a_la_mort: { emetteur: 'e' } },
    enfant(),
  ]);
  assert.equal(repos.effet.emetteurs[1].G, 2);
});

test('a_la_collision : un seul parent, profondeur comptée, collisions exigées', () => {
  const deuxHooks = compiler([parent({ a_la_mort: { emetteur: 'e' }, a_la_collision: { emetteur: 'e' } }), enfant()]);
  assert.equal(erreurDe(deuxHooks).chemin, 'emetteurs[p].a_la_collision.emetteur');
  assert.match(erreurDe(deuxHooks).message, /« e » est déjà lancé par « p »/);
  assert.equal(erreurDe(deuxHooks).regle, 'collisions-invalides');
  const deuxParents = compiler([parent({ a_la_collision: { emetteur: 'e' } }), { nom: 'q', naissance: { debit: 10 }, a_la_mort: { emetteur: 'e' } }, enfant()]);
  assert.match(erreurDe(deuxParents).message, /« e » est déjà lancé par « q »/);
  assert.match(erreurDe(compiler([parent({ a_la_collision: { emetteur: 'z' } })])).message, /a_la_collision\.emetteur : émetteur « z » inconnu/);
  assert.match(erreurDe(compiler([parent({ a_la_collision: { emetteur: 'p' } })])).message, /ne peut pas se lancer lui-même/);
  const sansCollisions = compiler([{ nom: 'p', naissance: { debit: 10 }, a_la_collision: { emetteur: 'e' } }, enfant()]);
  assert.match(erreurDe(sansCollisions).message, /« a_la_collision » demande « collisions » sur « p »/);
  assert.equal(erreurDe(sansCollisions).regle, 'collisions-invalides');
  // Profondeur : p -(collision)-> e -(mort)-> f -(collision)-> g : 3 niveaux, refusé.
  const profond = compiler([
    parent({ a_la_collision: { emetteur: 'e' } }),
    enfant('e', { a_la_mort: { emetteur: 'f' } }),
    enfant('f', { collisions: {}, a_la_collision: { emetteur: 'g' } }),
    enfant('g'),
  ]);
  assert.match(erreurDe(profond).message, /trop de niveaux de sous-émetteurs \(2 au plus\)/);
  // Deux niveaux : accepté.
  assert.equal(compiler([parent({ a_la_collision: { emetteur: 'e' } }), enfant('e', { collisions: {}, a_la_collision: { emetteur: 'f' } }), enfant('f')]).ok, true);
});
