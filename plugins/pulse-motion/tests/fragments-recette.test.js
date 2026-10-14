'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

const compiler = (emetteurs, o = {}) => R.compiler({ version: 1, nom: 'essai', ...(o.recette || {}), emetteurs }, { dur: o.dur || 2, graine: 3, charte: {}, reglages: o.reglages || '' });
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.erreurs)); return r.effet; };
const erreur = (r) => { assert.equal(r.ok, false, 'compilation refusée attendue'); return r.erreurs[0]; };
const proche = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} au lieu de ${b}`);

test('fragments : naissance sur les pixels (densité, instant, libération, ordre)', () => {
  const em = ok(compiler([{ nom: 'grain', naissance: { forme: { type: 'pixels', densite: 9, instant: 1.5, liberation: 'dur', ordre: 'gauche-droite' } } }], { dur: 1.5 })).emetteurs[0];
  assert.deepEqual(em.pixels, { densite: 9, instant: 1.5, liberation: 1.5, ordre: 'gauche-droite', ordreCode: 1 });
  assert.equal(em.fragment, true);
  assert.equal(em.forme.code, 6);
  assert.deepEqual(em.salves, [{ t: 0, nombre: 1, debut: 0 }], 'une salve à τ = 0 ; nombre fixé à la photographie');
  assert.deepEqual([em.capacite, em.debit, em.nTotal, em.capContinu, em.k, em.G], [1, 0, 0, 0, 0, 1]);
  assert.equal(em.fin, 2.508333, 'tenue d\'un pas + libération + vie');
  assert.equal(em.voieRapide, true, 'sans autre force que gravité et traînée linéaire');
  const defauts = ok(compiler([{ nom: 'g', naissance: { forme: { type: 'pixels', instant: 'debut' } } }])).emetteurs[0].pixels;
  assert.deepEqual(defauts, { densite: 4, instant: null, liberation: 0, ordre: 'hasard', ordreCode: 0 });
});

test('fragments : contrat des émetteurs ordinaires inchangé', () => {
  const em = ok(compiler([{ nom: 'g', naissance: { salves: [{ t: 0, nombre: 3 }], forme: { type: 'cercle', densite: 2, liberation: 1 } }, rendu: { morceaux: 30 } }])).emetteurs[0];
  assert.deepEqual([em.pixels, em.eclats, em.cible, em.fragment], [null, null, null, false]);
  assert.deepEqual(Object.keys(em.forme), ['type', 'code', 'contour', 'rayon', 'rayonInterieur', 'largeur', 'hauteur', 'angle', 'decalage']);
  assert.deepEqual(Object.keys(em.rendu), ['type', 'code', 'texture', 'textureCode', 'textureFichier', 'melange', 'melangeCode', 'etirement', 'flou', 'longueur', 'planche']);
  assert.equal(em.tables.source.length, 64);
  assert.ok(em.tables.source.every((x) => x === 0));
});

test('fragments : éclats (morceaux, impact, impulsion, rotation)', () => {
  const em = ok(compiler([{ nom: 'eclat', naissance: { vie: [2, 3] }, forces: [{ type: 'gravite', valeur: 80 }],
    rendu: { type: 'eclats', morceaux: '2 * n', origine: [0.2, 0.9], impulsion: 60, rotation_max: 90, melange: 'alpha' } }],
  { recette: { parametres: { n: { defaut: 20, min: 4, max: 100 } } } })).emetteurs[0];
  assert.deepEqual([em.eclats.morceaux, em.eclats.origine, em.eclats.impulsion], [40, [0.2, 0.9], 60]);
  proche(em.eclats.rotationMax, Math.PI / 2);
  assert.deepEqual([em.rendu.type, em.rendu.code, em.rendu.texture, em.rendu.textureCode, em.rendu.textureFichier], ['eclats', 4, 'image', 6, null]);
  assert.deepEqual(em.salves, [{ t: 0, nombre: 40, debut: 0 }]);
  assert.equal(em.capacite, 40);
  assert.equal(em.fin, 3.008333);
  assert.equal(em.voieRapide, true);
  assert.deepEqual([em.pixels, em.cible, em.fragment], [null, null, true]);
});

test('fragments : cible (arrondi au pas, vie, fin, voie rapide chorégraphiée, bruit)', () => {
  const choree = ok(compiler([{ nom: 'g', naissance: { forme: { type: 'rectangle', largeur: 100, hauteur: 50 } },
    forces: [{ type: 'turbulence', echelle: 8, force: 30, vitesse: 0.4 }],
    cible: { source: 'cible', arrivee: 'choree', a: 1.234, echelonnement: 0.5, ordre: 'centre', densite: 2, courbe: 'quad-in' } }], { dur: 3 })).emetteurs[0];
  const c = choree.cible;
  assert.deepEqual([c.source, c.sourceCode, c.arrivee, c.arriveeCode, c.k, c.a], ['cible', 1, 'choree', 1, 148, 1.233333]);
  assert.deepEqual([c.echelonnement, c.ordre, c.ordreCode, c.guidage, c.densite], [0.5, 'centre', 2, 0.6, 2]);
  assert.deepEqual(c.bruit, [8, 3, 0.4]);
  assert.equal(c.progression.length, 64);
  assert.deepEqual([c.progression[0], c.progression[21], c.progression[63]], [0, 0.111111, 1]);
  assert.deepEqual(choree.vie, [1.233333, 1.233333], 'la particule vit jusqu\'à l\'arrivée');
  assert.equal(choree.fin, 1.233333);
  assert.equal(choree.voieRapide, true, 'arrivée chorégraphiée : voie rapide');
  const guidee = ok(compiler([{ nom: 'g', forces: [{ type: 'gravite', valeur: 10 }], cible: {} }], { dur: 3 })).emetteurs[0];
  assert.deepEqual([guidee.cible.source, guidee.cible.arrivee, guidee.cible.k, guidee.cible.a, guidee.cible.guidage], ['ancre', 'guidee', 360, 3, 0.6]);
  assert.deepEqual(guidee.cible.bruit, [1, 0, 0], 'sans turbulence, pas de bruit');
  assert.equal(guidee.voieRapide, false, 'arrivée guidée : simulée');
  assert.deepEqual(guidee.salves, [{ t: 0, nombre: 1, debut: 0 }]);
  assert.equal(ok(compiler([{ nom: 'g', cible: { a: 0 } }])).emetteurs[0].cible.k, 1, 'au moins un pas');
  assert.equal(ok(compiler([{ nom: 'g', cible: { a: 'fin' } }], { dur: 1.5 })).emetteurs[0].cible.k, 180);
});

test('fragments : couleur « source » (part de la couleur du pixel)', () => {
  const em = ok(compiler([{ nom: 'g', naissance: { forme: { type: 'pixels' } }, vie: { couleur: { degrade: ['source', '#ff0000'] } } }])).emetteurs[0];
  assert.deepEqual(em.tables.couleur.slice(0, 4), [1, 1, 1, 1], 'arrêt « source » : blanc dans le dégradé');
  assert.deepEqual(em.tables.couleur.slice(252, 256), [1, 0, 0, 1]);
  assert.equal(em.tables.source[0], 1);
  assert.equal(em.tables.source[63], 0);
  proche(em.tables.source[21], 1 - 21 / 63, 1e-6);
  const seule = ok(compiler([{ nom: 'g', cible: {}, vie: { couleur: 'source' } }])).emetteurs[0];
  assert.ok(seule.tables.source.every((x) => x === 1));
  assert.ok(seule.tables.couleur.every((x) => x === 1));
});

test('fragments : courbe de tons « neutre »', () => {
  const e = ok(compiler([{ nom: 'g', naissance: { salves: [{ t: 0, nombre: 1 }] } }], { recette: { rendu_calque: { bloom: 0, tons: 'neutre' } } }));
  assert.equal(e.rendu_calque.tons, 'neutre');
  assert.match(erreur(compiler([{ nom: 'g', naissance: { salves: [{ t: 0, nombre: 1 }] } }], { recette: { rendu_calque: { tons: 'cinema' } } })).message, /« cinema » inconnu \(douce, aces, neutre\)/);
});

test('fragments : codes et schéma', () => {
  assert.equal(R.CODES.forme.pixels, 6);
  assert.equal(R.CODES.rendu.eclats, 4);
  assert.equal(R.CODES.texture.pixel, 7);
  assert.deepEqual(R.CODES.ordre, { hasard: 0, 'gauche-droite': 1, centre: 2 });
  assert.deepEqual(R.CODES.arrivee, { guidee: 0, choree: 1 });
  assert.deepEqual(R.CODES.source, { ancre: 0, cible: 1 });
  const em = R.SCHEMA.champs.emetteurs.element.champs;
  assert.deepEqual(Object.keys(em.cible.champs), ['source', 'arrivee', 'a', 'echelonnement', 'ordre', 'guidage', 'densite', 'courbe']);
  assert.deepEqual(['densite', 'instant', 'liberation', 'ordre'].map((k) => k in em.naissance.champs.forme.champs), [true, true, true, true]);
  assert.deepEqual(['morceaux', 'origine', 'impulsion', 'rotation_max'].map((k) => k in em.rendu.champs), [true, true, true, true]);
  assert.deepEqual(R.SCHEMA.champs.rendu_calque.champs.tons.valeurs, ['douce', 'aces', 'neutre']);
  assert.deepEqual([R.DENSITE, R.DENSITE_MAX, R.MORCEAUX_MIN, R.MORCEAUX_MAX], [4, 64, 8, 512]);
});

test('fragments : erreurs (chemin et message)', () => {
  const cas = [
    [[{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 2 }] }, a_la_mort: { emetteur: 'b' } }, { nom: 'b', naissance: { nombre: 1, forme: { type: 'pixels' } } }],
      'emetteurs[b]', /un sous-émetteur ne naît pas d'une photographie/],
    [[{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 2 }], forme: { type: 'pixels' } } }], 'emetteurs[a].naissance', /retirer « debit » et « salves »/],
    [[{ nom: 'a', naissance: { debit: 10 }, rendu: { type: 'eclats' } }], 'emetteurs[a].naissance', /retirer « debit » et « salves »/],
    [[{ nom: 'a', naissance: { vie: [1, 2] }, cible: {} }], 'emetteurs[a].naissance.vie', /vit jusqu'à son arrivée : retirer « vie »/],
    [[{ nom: 'a', rendu: { type: 'eclats' }, cible: {} }], 'emetteurs[a].cible', /les éclats ne visent pas de cible/],
    [[{ nom: 'a', cible: { arrivee: 'choree' }, a_la_mort: { emetteur: 'b' } }, { nom: 'b', naissance: { nombre: 1 } }], 'emetteurs[a].cible.arrivee', /arrivée chorégraphiée \(calculée sans état\) n'a ni sous-émetteur ni traînée/],
    [[{ nom: 'a', rendu: { type: 'eclats', morceaux: 600 } }], 'emetteurs[a].rendu.morceaux', /entre 8 et 512 morceaux/],
    [[{ nom: 'a', rendu: { type: 'eclats', texture: 'etoile' } }], 'emetteurs[a].rendu.texture', /montre la photographie de son ancre : retirer « texture »/],
    [[{ nom: 'a', rendu: { type: 'eclats', rotation_max: -1 } }], 'emetteurs[a].rendu.rotation_max', /positive ou nulle/],
    [[{ nom: 'a', naissance: { forme: { type: 'pixels', densite: 0 } } }], 'emetteurs[a].naissance.forme.densite', /entre 1 et 64 pixels par particule/],
    [[{ nom: 'a', naissance: { forme: { type: 'pixels', liberation: -1 } } }], 'emetteurs[a].naissance.forme.liberation', /durée positive ou nulle/],
    [[{ nom: 'a', naissance: { forme: { type: 'pixels', instant: -2 } } }], 'emetteurs[a].naissance.forme.instant', /secondes de scène positives ou nulles, ou « debut »/],
    [[{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 1 }] }, vie: { couleur: 'source' } }], 'emetteurs[a].vie.couleur', /« source » est la couleur des pixels d'un élément photographié/],
    [[{ nom: 'a', rendu: { type: 'eclats' }, vie: { couleur: 'source' } }], 'emetteurs[a].vie.couleur', /« source » est la couleur des pixels/],
    [[{ nom: 'a', cible: { a: -1 } }], 'emetteurs[a].cible.a', /secondes de τ positives ou nulles, ou « fin »/],
    [[{ nom: 'a', cible: { echelonnement: 1.5 } }], 'emetteurs[a].cible.echelonnement', /entre 0 et 1/],
    [[{ nom: 'a', cible: { densite: 65 } }], 'emetteurs[a].cible.densite', /entre 1 et 64 pixels par particule/],
  ];
  for (const [emetteurs, chemin, motif] of cas) {
    const e = erreur(compiler(emetteurs));
    assert.equal(e.chemin, chemin, `${chemin} : ${e.message}`);
    assert.match(e.message, motif);
    assert.equal(e.regle, 'effet-invalide');
  }
  const poser = erreur(compiler([{ nom: 'a', cible: {}, collisions: { reponse: 'poser' } }]));
  assert.equal(poser.regle, 'collisions-invalides');
  assert.equal(poser.chemin, 'emetteurs[a].collisions.reponse');
  assert.match(poser.message, /seulement « rebond »/);
  const reserve = erreur(compiler([{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 1 }] } }], { recette: { parametres: { source: { defaut: 1 } } } }));
  assert.match(reserve.message, /« dur » et « source » sont réservés/);
});
