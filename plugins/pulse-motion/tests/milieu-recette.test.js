'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

const CHARTE = { primaire: '#0a6cff', accent: '#b45309', texte: '#1a1a1a', fond: '#ffffff' };
const compiler = (r, o = {}) => R.compiler({ version: 1, nom: 'essai', ...r }, { dur: 4, graine: 3, charte: CHARTE, ...o });
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.erreurs)); return r.effet; };
const erreurDe = (r) => { assert.equal(r.ok, false, 'compilation refusée'); return r.erreurs[0]; };
const r6 = (x) => Math.round(x * 1e6) / 1e6;

test('milieu : recette par défaut (grille, réglages, rendu), sans émetteurs ni capacité', () => {
  const e = ok(compiler({ milieu: {} }));
  assert.deepEqual([e.capacite, e.fin, e.emetteurs, e.groupes, e.elements], [0, 4, [], [], []]);
  assert.deepEqual(e.couplage, { vent: false, injecte: false });
  assert.deepEqual(e.rendu_calque, { bloom: 0.6, seuil_bloom: 1, tons: 'douce' });
  const m = e.milieu;
  assert.deepEqual([m.resolution, m.flottaison, m.refroidissement, m.dissipation, m.vorticite, m.viscosite, m.bords, m.bordsCode],
    [192, 1, 0.6, 0.3, 0.4, 0, 'ouverts', 0]);
  assert.deepEqual(m.sources, []);
  const l = Math.hypot(-0.4, -1);
  assert.deepEqual([m.rendu.type, m.rendu.code, m.rendu.corpsNoir, m.rendu.opacite, m.rendu.intensite, m.rendu.lumiere],
    ['fumee', 0, true, 0.8, 3, [r6(-0.4 / l), r6(-1 / l)]]);
  assert.deepEqual(m.rendu.couleur, R.couleurLineaire('#8a8f99', {}));
  assert.equal(m.rendu.feu.length, 256);
  assert.deepEqual([R.RESOLUTION_MILIEU, R.RESOLUTION_MILIEU_ALERTE, R.SOURCES_MILIEU_MAX], [[64, 1024], 512, 8]);
  assert.deepEqual(R.CODES.sourceMilieu, { fumee: 0, chaleur: 1, encre: 2 });
  assert.deepEqual(R.CODES.renduMilieu, { fumee: 0, feu: 1, encre: 2 });
});

test('milieu : sources (forme de P1, débit, température, encre en absorbance), réglages exposés', () => {
  const e = ok(compiler({
    parametres: { resolution: { defaut: 128, min: 64, max: 512 }, teinte: { type: 'couleur', defaut: '#2050c0' } },
    milieu: {
      resolution: 'resolution', flottaison: -0.5, bords: 'fermes',
      sources: [
        { type: 'fumee', forme: { type: 'cercle', rayon: 6, decalage: [0, 30] }, debit: 2, temperature: 0.8 },
        { type: 'chaleur', forme: { type: 'rectangle', largeur: 20, hauteur: 3 } },
        { type: 'encre', forme: { type: 'point' }, couleur: 'teinte', debit: '2 * 3' },
      ],
    },
  }, { reglages: 'resolution: 256' }));
  const m = e.milieu;
  assert.equal(m.resolution, 256);
  assert.deepEqual([m.flottaison, m.bords, m.bordsCode], [-0.5, 'fermes', 1]);
  assert.deepEqual(m.sources.map((s) => [s.type, s.code, s.forme.type, s.debit, s.temperature]),
    [['fumee', 0, 'cercle', 2, 0.8], ['chaleur', 1, 'rectangle', 1, 0], ['encre', 2, 'point', 6, 0]]);
  assert.deepEqual([m.sources[0].forme.rayon, m.sources[0].forme.decalage, m.sources[1].forme.largeur], [6, [0, 30], 20]);
  assert.deepEqual(m.sources[0].encre, [0, 0, 0]);
  assert.deepEqual(m.sources[2].encre, R.absorbanceEncre(R.couleurLineaire('#2050c0', {})));
  assert.ok(m.sources[2].encre[0] > m.sources[2].encre[2], 'encre bleue : absorbe le rouge plus que le bleu');
  assert.deepEqual(R.absorbanceEncre([1, 1, 1, 1]), [0, 0, 0], 'encre blanche : n\'absorbe rien');
  assert.equal(ok(compiler({ milieu: { resolution: 100.4 } })).milieu.resolution, 100, 'résolution entière');
});

test('milieu : table du feu (corps noir, du rouge sombre au blanc ; teinte fixe sans corps noir)', () => {
  const rouge = R.corpsNoir(1500);
  assert.ok(rouge[0] === 1 && rouge[1] < 0.5 && rouge[2] === 0, `1500 K : ${rouge}`);
  assert.ok(R.corpsNoir(6500).every((x) => x > 0.95), `6500 K : ${R.corpsNoir(6500)}`);
  const t = ok(compiler({ milieu: { rendu: { type: 'feu', intensite: 4 } } })).milieu.rendu.feu;
  const entree = (i) => t.slice(i * 4, i * 4 + 4);
  assert.deepEqual(entree(0).slice(0, 3), [0, 0, 0], 'froid : aucune émission');
  const tiede = entree(16);
  assert.ok(tiede[0] > 2 * tiede[1] && tiede[2] < 0.1 * tiede[0], `tiède : rouge (${tiede})`);
  const chaud = entree(63);
  assert.ok(chaud[1] > 0.9 * chaud[0] && chaud[2] > 0.8 * chaud[0], `chaud : blanc (${chaud})`);
  assert.ok(Math.abs(chaud[0] - 4) < 1e-6, 'intensité au plus chaud');
  const somme = (i) => entree(i)[0] + entree(i)[1] + entree(i)[2];
  for (let i = 1; i < 64; i++) assert.ok(somme(i) >= somme(i - 1), `de plus en plus lumineux (${i})`);
  const fixe = ok(compiler({ milieu: { rendu: { type: 'feu', corps_noir: false, couleur: '#ff0000', intensite: 2 } } })).milieu.rendu.feu;
  assert.deepEqual(fixe.slice(63 * 4, 63 * 4 + 3), [2, 0, 0], 'teinte fixe × intensité');
  assert.deepEqual(R.tableFeu(null, 4), t);
});

test('milieu : erreurs (milieu-invalide, chemin du champ en cause)', () => {
  const cas = [
    [{ milieu: { resolution: 32 } }, 'milieu.resolution', /entre 64 et 1024/],
    [{ milieu: { flottaison: 9 } }, 'milieu.flottaison', /valeur entre -5 et 5 attendue/],
    [{ milieu: { bords: 'murs' } }, 'milieu.bords', /« murs » inconnu \(ouverts, fermes\)/],
    [{ milieu: { sources: [{ type: 'vapeur' }] } }, 'milieu.sources[0].type', /« vapeur » inconnu \(fumee, chaleur, encre\)/],
    [{ milieu: { sources: [{ type: 'encre' }] } }, 'milieu.sources[0].couleur', /une source d'encre a une couleur/],
    [{ milieu: { sources: [{ type: 'fumee', forme: { type: 'pixels' } }] } }, 'milieu.sources[0].forme.type', /pas sur les pixels/],
    [{ milieu: { sources: [{ type: 'fumee', debit: -1 }] } }, 'milieu.sources[0].debit', /positive ou nulle/],
    [{ milieu: { sources: Array.from({ length: 9 }, () => ({ type: 'fumee' })) } }, 'milieu.sources', /8 sources au plus/],
    [{ milieu: { rendu: { type: 'plasma' } } }, 'milieu.rendu.type', /« plasma » inconnu \(fumee, feu, encre\)/],
    [{ milieu: { rendu: { corps_noir: 'oui' } } }, 'milieu.rendu.corps_noir', /true ou false attendu/],
    [{ milieu: { rendu: { lumiere: [0, 0] } } }, 'milieu.rendu.lumiere', /direction nulle/],
    [{ milieu: { vent: 3 } }, 'milieu.vent', /champ inconnu \(champs possibles : resolution, flottaison, refroidissement, dissipation, vorticite, viscosite, bords, sources, rendu\)/],
    [{ milieu: {}, emetteurs: [{ nom: 'a', naissance: { debit: 5 } }] }, 'milieu', /une recette de milieu n'a pas d'« emetteurs »/],
  ];
  for (const [r, chemin, motif] of cas) {
    const e = erreurDe(compiler(r));
    assert.deepEqual([e.regle, e.chemin], ['milieu-invalide', chemin], JSON.stringify(r));
    assert.match(e.message, motif, JSON.stringify(r));
  }
  // Sans milieu ni émetteurs : l'erreur des effets, inchangée.
  assert.equal(erreurDe(compiler({})).regle, 'effet-invalide');
});

test('milieu : schéma (champs du bloc, sources sans les champs des pixels, rendu)', () => {
  const n = R.SCHEMA.champs.milieu;
  assert.deepEqual(Object.keys(n.champs), ['resolution', 'flottaison', 'refroidissement', 'dissipation', 'vorticite', 'viscosite', 'bords', 'sources', 'rendu']);
  assert.deepEqual([n.champs.resolution.min, n.champs.resolution.max], R.RESOLUTION_MILIEU);
  assert.equal(n.champs.sources.maximum, R.SOURCES_MILIEU_MAX);
  const s = n.champs.sources.element.champs;
  assert.deepEqual(Object.keys(s), ['type', 'forme', 'debit', 'temperature', 'couleur']);
  assert.deepEqual(s.type.valeurs, Object.keys(R.CODES.sourceMilieu));
  assert.deepEqual(Object.keys(s.forme.champs), ['type', 'zone', 'rayon', 'rayon_interieur', 'largeur', 'hauteur', 'angle', 'decalage']);
  assert.ok(!s.forme.champs.type.valeurs.includes('pixels'));
  assert.deepEqual(Object.keys(n.champs.rendu.champs), ['type', 'couleur', 'corps_noir', 'opacite', 'intensite', 'lumiere']);
  assert.deepEqual(n.champs.rendu.champs.type.valeurs, Object.keys(R.CODES.renduMilieu));
  assert.equal(n.champs.rendu.champs.corps_noir.defaut, true);
  // La forme des émetteurs garde ses champs (pixels de l'ancre compris).
  assert.deepEqual(Object.keys(R.SCHEMA.champs.emetteurs.element.champs.naissance.champs.forme.champs),
    ['type', 'zone', 'rayon', 'rayon_interieur', 'largeur', 'hauteur', 'angle', 'decalage', 'densite', 'instant', 'liberation', 'ordre']);
});

test('couplages : force « milieu », « injecte », structure.milieu ; hors voie rapide ; effet.couplage', () => {
  const e = ok(compiler({ emetteurs: [
    { nom: 'braise', naissance: { debit: 20 }, forces: [{ type: 'gravite', valeur: 10 }, { type: 'milieu', coef: 2 }] },
    { nom: 'fusee', naissance: { salves: [{ t: 0, nombre: 1 }] }, injecte: { fumee: 0.5, chaleur: 0.2, encre: 'couleur' } },
    { nom: 'plume', naissance: { salves: [{ t: 0, nombre: 1 }] }, injecte: { encre: '#2050c0' } },
    { nom: 'drapeau', structure: { type: 'tissu', resolution: [8, 6], milieu: { coef: 3 } } },
    { nom: 'calme', naissance: { debit: 5 }, forces: [{ type: 'gravite' }] },
  ] }));
  const [braise, fusee, plume, drapeau, calme] = e.emetteurs;
  assert.equal(R.CODES.force.milieu, 7);
  assert.deepEqual(braise.forces[1], { type: 'milieu', code: 7, coef: 2 });
  assert.deepEqual(fusee.injecte, { fumee: 0.5, chaleur: 0.2, encre: { mode: 'particule', absorbance: [0, 0, 0] } });
  assert.deepEqual(plume.injecte, { fumee: 0, chaleur: 0, encre: { mode: 'fixe', absorbance: R.absorbanceEncre(R.couleurLineaire('#2050c0', {})) } });
  assert.deepEqual(drapeau.structure.milieu, { coef: 3 });
  assert.deepEqual(drapeau.forces[drapeau.forces.length - 1], { type: 'milieu', code: 7, coef: 3 }, 'poussée du milieu : une force de la structure');
  assert.deepEqual([braise.voieRapide, fusee.voieRapide, plume.voieRapide, drapeau.voieRapide, calme.voieRapide], [false, false, false, false, true]);
  assert.equal(calme.injecte, null);
  assert.equal(calme.structure, null);
  assert.deepEqual(e.couplage, { vent: true, injecte: true });
  const rien = ok(compiler({ emetteurs: [{ nom: 'a', naissance: { debit: 5 }, injecte: {} }, { nom: 'b', naissance: { debit: 5 }, injecte: { fumee: 0 } }] }));
  assert.deepEqual([rien.emetteurs[0].injecte, rien.emetteurs[1].injecte], [null, null], 'rien à déposer');
  assert.deepEqual(rien.couplage, { vent: false, injecte: false }, 'pas de couplage');
  assert.deepEqual(ok(compiler({ emetteurs: [{ nom: 'a', naissance: { debit: 5 } }] })).couplage, { vent: false, injecte: false });
});

test('couplages : erreurs (force « milieu » sur une structure, dépôt d\'une structure ou de perles, coefficients, encre, forces en trop)', () => {
  const huit = Array.from({ length: 8 }, () => ({ type: 'gravite' }));
  const cas = [
    [[{ nom: 'd', structure: { type: 'corde' }, forces: [{ type: 'milieu' }] }], 'structure-invalide', 'emetteurs[d].forces[0]', /« structure\.milieu »/],
    [[{ nom: 'd', structure: { type: 'corde' }, injecte: { fumee: 1 } }], 'structure-invalide', 'emetteurs[d].injecte', /une structure ne dépose rien/],
    [[{ nom: 'c', structure: { type: 'corde', perles: { emetteur: 'b' } } }, { nom: 'b', injecte: { fumee: 1 } }], 'structure-invalide', 'emetteurs[b].injecte', /retirer « injecte »/],
    [[{ nom: 'a', naissance: { debit: 5 }, forces: [{ type: 'milieu', coef: -1 }] }], 'effet-invalide', 'emetteurs[a].forces[0].coef', /positive ou nulle/],
    [[{ nom: 'a', naissance: { debit: 5 }, injecte: { fumee: -1 } }], 'effet-invalide', 'emetteurs[a].injecte.fumee', /positive ou nulle/],
    [[{ nom: 'a', naissance: { debit: 5 }, injecte: { encre: 'violet' } }], 'effet-invalide', 'emetteurs[a].injecte.encre', /couleur « violet » inconnue/],
    [[{ nom: 'd', structure: { type: 'corde', milieu: { coef: -2 } } }], 'structure-invalide', 'emetteurs[d].structure.milieu.coef', /positive ou nulle/],
    [[{ nom: 'd', structure: { type: 'corde', milieu: {} }, forces: huit }], 'structure-invalide', 'emetteurs[d].structure.milieu', /8 forces au plus, poussée du milieu comprise/],
  ];
  for (const [emetteurs, regle, chemin, motif] of cas) {
    const e = erreurDe(compiler({ emetteurs }));
    assert.deepEqual([e.regle, e.chemin], [regle, chemin], JSON.stringify(emetteurs));
    assert.match(e.message, motif, JSON.stringify(emetteurs));
  }
});

test('couplages : schéma (variante de force « milieu », bloc « injecte », structure.milieu)', () => {
  const em = R.SCHEMA.champs.emetteurs.element.champs;
  assert.deepEqual(Object.keys(em.forces.element.variantes.types.milieu.champs), ['coef']);
  assert.deepEqual(Object.keys(em.injecte.champs), ['fumee', 'chaleur', 'encre']);
  assert.deepEqual(Object.keys(em.structure.champs.milieu.champs), ['coef']);
  assert.equal(em.structure.champs.milieu.champs.coef.defaut, 1);
});
