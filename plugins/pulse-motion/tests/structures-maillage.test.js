'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Mm = require('../moteur/particules/maillage.js');

/** Nombre de liens attendu d'une grille C × R : structure, diagonales (deux par cellule), flexion. */
function attendus(C, R) {
  return R * (C - 1) + (R - 1) * C + 2 * (R - 1) * (C - 1) + R * Math.max(C - 2, 0) + Math.max(R - 2, 0) * C;
}

test('maillage : liens d\'une corde et d\'un tissu, chacun une fois, extrémités dans la grille', () => {
  for (const [C, R] of [[8, 1], [33, 1], [128, 1], [2, 2], [3, 5], [24, 16], [64, 64]]) {
    const { codes, debuts } = Mm.liens(C, R);
    assert.equal(codes.length, attendus(C, R), `${C} × ${R}`);
    assert.equal(debuts.length, Mm.COULEURS + 1);
    assert.equal(debuts[0], 0);
    assert.equal(debuts[Mm.COULEURS], codes.length);
    assert.equal(new Set(codes).size, codes.length, 'chaque lien une fois');
    for (const code of codes) {
      const [a, b] = Mm.extremites(code, C);
      assert.ok(a >= 0 && b < C * R && a !== b, `${C} × ${R} : lien ${code}`);
    }
  }
  assert.deepEqual(Array.from(Mm.liens(8, 1).codes).map((c) => [c >> 3, c & 7]).slice(0, 4), [[0, 0], [2, 0], [4, 0], [6, 0]], 'couleur 0 : segments pairs');
  assert.deepEqual(Mm.extremites(5 * 8 + 3, 4), [6, 9], 'D2 de la cellule (1, 1) d\'une grille de 4 colonnes');
  assert.deepEqual(Mm.extremites(5 * 8 + 5, 4), [5, 13], 'BV : deux lignes plus bas');
});

test('maillage : coloration (aucun sommet partagé au sein d\'une couleur), 4 couleurs pour une corde, 12 pour un tissu', () => {
  for (const [C, R] of [[33, 1], [2, 2], [3, 5], [24, 16], [64, 64]]) {
    const { codes, debuts } = Mm.liens(C, R);
    const utilisees = [];
    for (let k = 0; k < Mm.COULEURS; k++) {
      const vus = new Set();
      for (let j = debuts[k]; j < debuts[k + 1]; j++) {
        const code = codes[j];
        if (j > debuts[k]) assert.ok(code > codes[j - 1], 'rangés par code dans une couleur');
        const v = code >> 3;
        assert.equal(Mm.couleur(code & 7, Math.floor(v / C), v % C), k, `${C} × ${R} : lien ${code} dans sa couleur`);
        for (const s of Mm.extremites(code, C)) {
          assert.ok(!vus.has(s), `${C} × ${R}, couleur ${k} : sommet ${s} partagé`);
          vus.add(s);
        }
      }
      if (debuts[k + 1] > debuts[k]) utilisees.push(k);
    }
    if (R === 1) assert.deepEqual(utilisees, [0, 1, 8, 9], 'corde : segments et flexion, 4 couleurs');
    if (C >= 4 && R >= 4) assert.equal(utilisees.length, 12, `${C} × ${R} : 12 couleurs`);
  }
  // Un sommet intérieur touche 12 liens : 12 couleurs sont nécessaires (borne atteinte).
  const { codes } = Mm.liens(24, 16);
  const v = 5 * 24 + 5;
  const couleurs = new Set();
  for (const code of codes) if (Mm.extremites(code, 24).includes(v)) couleurs.add(Mm.couleur(code & 7, Math.floor((code >> 3) / 24), (code >> 3) % 24));
  assert.equal(couleurs.size, 12);
});
