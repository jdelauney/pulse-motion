'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

const CHARTE = { primaire: '#0a6cff', accent: '#b45309', texte: '#1a1a1a', fond: '#ffffff' };
const compiler = (emetteurs, dur = 3) => R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 7, charte: CHARTE });
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.erreurs)); return r.effet; };
const erreurDe = (r) => { assert.equal(r.ok, false, 'erreur attendue'); return r.erreurs[0]; };
const corde = (structure = {}, extra = {}) => Object.assign({ nom: 'c', structure: Object.assign({ type: 'corde' }, structure) }, extra);
const tissu = (structure = {}, extra = {}) => Object.assign({ nom: 't', structure: Object.assign({ type: 'tissu' }, structure) }, extra);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const lin = (hex) => R.couleurLineaire(hex, {}).map(r6);

test('structures : corde et tissu par défaut (sommets, réglages, apparence), fenêtre de l\'effet, hors voie rapide', () => {
  const e = ok(compiler([corde(), tissu()]));
  const [c, t] = e.emetteurs;
  const l = Math.hypot(-0.4, -1);
  const apparence = { couleur: [1, 1, 1, 1], mode: 'couleur', sens: 'horizontal', bandes: false, mailles: false, source: null, lumiere: [r6(-0.4 / l), r6(-1 / l)] };
  assert.deepEqual(c.structure, { type: 'corde', code: 0, colonnes: 32, lignes: 1, nSommets: 32, attaches: [], raideur: 0.9, flexion: 0.1,
    amortissement: 0.02, dechirure: null, epaisseur: 0.4, perles: null, apparence });
  assert.deepEqual([t.structure.type, t.structure.code, t.structure.colonnes, t.structure.lignes, t.structure.nSommets], ['tissu', 1, 24, 16, 384]);
  for (const em of [c, t]) {
    assert.deepEqual(em.vie, [3, 3], 'présente pendant toute la fenêtre de l\'effet');
    assert.equal(em.fin, 3);
    assert.equal(em.voieRapide, false);
    assert.deepEqual(em.salves, []);
    assert.equal(em.debit, 0);
    assert.equal(em.perlesDe, -1);
  }
  assert.deepEqual([c.capacite, t.capacite, e.capacite], [32, 384, 416]);
  assert.deepEqual(e.elements, []);
  assert.equal(R.CODES.structure.tissu, 1);
  assert.equal(ok(compiler([{ nom: 'p', naissance: { salves: [{ t: 0, nombre: 5 }] } }])).emetteurs[0].structure, null, 'sans bloc : null');
  // Masse et profondeur des sommets : seuls champs de naissance d'une structure.
  const lourde = ok(compiler([corde({}, { naissance: { masse: 2, z: 0.5 } })])).emetteurs[0];
  assert.deepEqual([lourde.masse, lourde.z], [[2, 2], [0.5, 0.5]]);
});

test('structures : attaches (places, indices, ancre, #id, point de la zone, lâcher)', () => {
  const e = ok(compiler([tissu({ resolution: [4, 3], attaches: [
    { ou: 'haut', a: 'ancre' }, { ou: 'bas', a: '#barre', lacher: 2.5 }, { ou: 'gauche', a: '#mat' }, { ou: 'droite', a: '#barre' },
    { ou: 'coins' }, { ou: '5, 6', a: '#mat' }, { ou: 7, a: [0.5, 1] }, { ou: [1, 2] },
  ] }), corde({ resolution: 10, attaches: [{ ou: 'debut', a: [0, 0.5] }, { ou: 'fin', a: ['0.25 + 0.5', 0.5], lacher: 'dur - 1' }] })]));
  assert.deepEqual(e.elements, ['barre', 'mat']);
  assert.deepEqual(e.emetteurs[0].structure.attaches, [
    { sommets: [0, 1, 2, 3], cible: { genre: 'element', element: 0 }, lacher: null },
    { sommets: [8, 9, 10, 11], cible: { genre: 'element', element: 1 }, lacher: 2.5 },
    { sommets: [0, 4, 8], cible: { genre: 'element', element: 2 }, lacher: null },
    { sommets: [3, 7, 11], cible: { genre: 'element', element: 1 }, lacher: null },
    { sommets: [0, 3, 8, 11], cible: { genre: 'element', element: 0 }, lacher: null },
    { sommets: [5, 6], cible: { genre: 'element', element: 2 }, lacher: null },
    { sommets: [7], cible: { genre: 'point', point: [0.5, 1] }, lacher: null },
    { sommets: [1, 2], cible: { genre: 'element', element: 0 }, lacher: null },
  ]);
  assert.deepEqual(e.emetteurs[1].structure.attaches, [
    { sommets: [0], cible: { genre: 'point', point: [0, 0.5] }, lacher: null },
    { sommets: [9], cible: { genre: 'point', point: [0.75, 0.5] }, lacher: 2 },
  ]);
});

test('structures : apparence (dégradé lissé ou en bandes, image de assets/, photographie de l\'ancre, mailles, lumière)', () => {
  const [a, b, c, d] = ok(compiler([
    tissu({ apparence: { couleur: 'primaire', degrade: ['#ff0000', '#0000ff'], sens: 'vertical' } }, { nom: 'a' }),
    tissu({ apparence: { degrade: ['primaire', 'fond', 'accent'], bandes: true } }, { nom: 'b' }),
    tissu({ apparence: { image: 'assets/toile.png', mailles: true, lumiere: [3, 4] } }, { nom: 'c' }),
    tissu({ apparence: { source: 'ancre' } }, { nom: 'd' }),
  ])).emetteurs;
  assert.deepEqual([a.structure.apparence.mode, a.structure.apparence.sens], ['degrade', 'vertical']);
  assert.deepEqual(a.structure.apparence.couleur.map(r6), lin('#0a6cff'), 'teinte qui multiplie le dégradé');
  assert.deepEqual(a.tables.couleur.slice(0, 4), [1, 0, 0, 1]);
  assert.deepEqual(a.tables.couleur.slice(252, 256), [0, 0, 1, 1]);
  assert.ok(Math.abs(a.tables.couleur[124] - (1 - 31 / 63)) < 1e-6, 'dégradé lissé (entrée 31)');
  // Bandes : trois aplats de 22, 21 et 21 entrées.
  const t = b.tables.couleur;
  const entree = (i) => t.slice(i * 4, i * 4 + 4).map(r6);
  for (const [i, hex] of [[0, '#0a6cff'], [21, '#0a6cff'], [22, '#ffffff'], [42, '#ffffff'], [43, '#b45309'], [63, '#b45309']]) assert.deepEqual(entree(i), lin(hex), `entrée ${i}`);
  assert.equal(b.structure.apparence.bandes, true);
  assert.deepEqual([c.structure.apparence.mode, c.structure.apparence.mailles, c.structure.apparence.lumiere], ['image', true, [0.6, 0.8]]);
  assert.deepEqual([c.rendu.texture, c.rendu.textureCode, c.rendu.textureFichier], ['image', R.CODES.texture.image, 'assets/toile.png']);
  assert.deepEqual([d.structure.apparence.mode, d.structure.apparence.source], ['source', 'ancre']);
  assert.equal(d.rendu.textureFichier, null);
});

test('structures : erreurs (structure-invalide, chemin du champ en cause)', () => {
  const cas = [
    [[{ nom: 'c', structure: { type: 'ruban' } }], 'emetteurs[c].structure.type', /« ruban » inconnu \(corde, tissu\)/],
    [[corde({ resolution: 7 })], 'emetteurs[c].structure.resolution', /entre 8 et 128 sommets/],
    [[corde({ resolution: [4, 3] })], 'emetteurs[c].structure.resolution', /nombre de sommets attendu pour une corde/],
    [[tissu({ resolution: 32 })], 'emetteurs[t].structure.resolution', /\[colonnes, lignes\] attendu pour un tissu/],
    [[tissu({ resolution: [1, 4] })], 'emetteurs[t].structure.resolution', /colonnes et lignes entre 2 et 128/],
    [[corde({ attaches: [{ ou: 'haut' }] })], 'emetteurs[c].structure.attaches[0].ou', /« haut » inconnu : debut, fin \(corde\), ou indices de sommets/],
    [[tissu({ attaches: [{ ou: 384 }] })], 'emetteurs[t].structure.attaches[0].ou', /indice de sommet 384 hors de \[0, 383\]/],
    [[tissu({ attaches: [{ a: 'ancre' }] })], 'emetteurs[t].structure.attaches[0].ou', /valeur obligatoire \(haut, bas, gauche, droite, coins, ou indices de sommets\)/],
    [[tissu({ attaches: [{ ou: 'haut', a: [0.5, 0] }] })], 'emetteurs[t].structure.attaches[0].a', /un point de la zone tient un seul sommet/],
    [[corde({ attaches: [{ ou: 'debut', a: 'logo' }] })], 'emetteurs[c].structure.attaches[0].a', /« ancre », « #id » ou point \[x, y\] de la zone attendu/],
    [[corde({ attaches: [{ ou: 'debut', lacher: -1 }] })], 'emetteurs[c].structure.attaches[0].lacher', /secondes de τ positives ou nulles attendues/],
    [[corde({ attaches: Array.from({ length: 17 }, () => ({ ou: 'debut' })) })], 'emetteurs[c].structure.attaches', /16 attaches au plus/],
    [[corde({ attaches: Array.from({ length: 8 }, (_, i) => ({ ou: 'debut', a: '#e' + i })) })], 'emetteurs[c].structure.attaches[7].a', /7 éléments « #id » au plus par effet/],
    [[corde({ raideur: 1.5 })], 'emetteurs[c].structure.raideur', /valeur entre 0 et 1 attendue/],
    [[corde({ dechirure: 1.01 })], 'emetteurs[c].structure.dechirure', /rapport d'étirement d'au moins 1\.05 attendu/],
    [[corde({ epaisseur: 0 })], 'emetteurs[c].structure.epaisseur', /valeur entre 0\.05 et 10 attendue/],
    [[tissu({ apparence: { degrade: [] } })], 'emetteurs[t].structure.apparence.degrade', /liste non vide de couleurs attendue/],
    [[tissu({ apparence: { degrade: ['#ffffff', '#000000'], image: 'assets/a.png' } })], 'emetteurs[t].structure.apparence', /une seule texture : « degrade », « image » ou « source » \(ici degrade, image\)/],
    [[tissu({ apparence: { image: 'toile.png' } })], 'emetteurs[t].structure.apparence.image', /image de assets\/ \(PNG, WebP, JPEG ou SVG\) attendue/],
    [[corde({ apparence: { mailles: true } })], 'emetteurs[c].structure.apparence.mailles', /mailles : tissu seulement/],
    [[tissu({ apparence: { lumiere: [0, 0] } })], 'emetteurs[t].structure.apparence.lumiere', /direction nulle/],
    [[corde({}, { naissance: { debit: 10 } })], 'emetteurs[c].naissance.debit', /seuls « masse » et « z » s'y règlent/],
    [[corde({}, { rendu: { type: 'trainee' } })], 'emetteurs[c].rendu', /une structure ne prend pas « rendu »/],
    [[corde({}, { vie: { couleur: '#ff0000' } })], 'emetteurs[c].vie', /une structure ne prend pas « vie »/],
    [[corde({}, { collisions: { reponse: 'poser' } })], 'emetteurs[c].collisions.reponse', /seulement « rebond »/],
    [[{ nom: 'p', naissance: { salves: [{ t: 0, nombre: 2 }], vie: [1, 1] }, a_la_mort: { emetteur: 'c' } }, corde()], 'emetteurs[c]', /une structure est posée par la scène, pas lancée par « p »/],
  ];
  for (const [emetteurs, chemin, message] of cas) {
    const e = erreurDe(compiler(emetteurs));
    assert.equal(e.regle, 'structure-invalide', chemin);
    assert.equal(e.chemin, chemin);
    assert.match(e.message, message, chemin);
  }
  const trop = Array.from({ length: 33 }, (_, i) => corde({ resolution: 8 }, { nom: 'c' + i }));
  const e = erreurDe(compiler(trop));
  assert.deepEqual([e.regle, e.chemin], ['structure-invalide', 'emetteurs']);
  assert.match(e.message, /32 cordes et tissus au plus par effet \(ici 33\)/);
});

test('structures : schéma (variantes corde et tissu, attaches, apparence)', () => {
  const n = R.SCHEMA.champs.emetteurs.element.champs.structure;
  assert.deepEqual(n.champs.type.valeurs, Object.keys(R.CODES.structure));
  assert.deepEqual(Object.keys(n.variantes.types), ['corde', 'tissu']);
  assert.deepEqual(Object.keys(n.variantes.types.corde.champs), ['resolution', 'perles']);
  assert.deepEqual(Object.keys(n.variantes.types.tissu.champs), ['resolution']);
  assert.deepEqual(Object.keys(n.champs.attaches.element.champs), ['ou', 'a', 'lacher']);
  assert.deepEqual(Object.keys(n.champs.apparence.champs), ['couleur', 'degrade', 'sens', 'bandes', 'image', 'source', 'mailles', 'lumiere']);
  assert.equal(n.champs.attaches.maximum, R.ATTACHES_MAX);
  assert.equal(n.champs.dechirure.min, R.DECHIRURE_MIN);
  // Champ inconnu dans le bloc : refusé avec la liste des champs du type.
  const r = erreurDe(compiler([corde({ longueur: 3 })]));
  assert.equal(r.regle, 'structure-invalide');
  assert.match(r.message, /emetteurs\[c\]\.structure\.longueur : champ inconnu \(champs possibles : type, attaches, raideur, flexion, amortissement, dechirure, epaisseur, apparence, resolution, perles\)/);
});
