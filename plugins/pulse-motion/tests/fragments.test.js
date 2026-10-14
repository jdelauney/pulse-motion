'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../moteur/particules/fragments.js');
const R = require('../moteur/particules/recette.js');

/** Photo de L × H pixels ; couleur(x, y) -> [r, v, b, a]. */
function photo(L, H, couleur, largeurCqh = L, hauteurCqh = H) {
  const rgba = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) rgba.set(couleur(x, y), (y * L + x) * 4);
  return { largeur: L, hauteur: H, rgba, largeurCqh, hauteurCqh };
}
const effetDe = (emetteurs, dur = 2) => {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 3, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
};
/** Liste dont le pixel i a x = i (y = 0), pour suivre les rangs. */
const rangs = (n) => ({ total: n, donnees: Float32Array.from({ length: 4 * n }, (_, k) => (k % 4 === 0 ? k / 4 : k % 4 === 3 ? 255 : 0)), cote: 1, demi: [n / 2, 0.5] });

test('dimensionsPhoto : pixels de sortie, √densité, 1024 px au plus sur le grand côté', () => {
  assert.deepEqual(F.dimensionsPhoto(50, 20, 1080, 1), { largeur: 540, hauteur: 216 });
  assert.deepEqual(F.dimensionsPhoto(50, 20, 1080, 4), { largeur: 270, hauteur: 108 });
  assert.deepEqual(F.dimensionsPhoto(150, 50, 1080, 1), { largeur: 1024, hauteur: 341 });
  assert.deepEqual(F.dimensionsPhoto(0.01, 0.01, 1080, 64), { largeur: 1, hauteur: 1 });
});

test('listerPixels : alpha > 0,1, ordre des lignes, position locale, couleur en entiers exacts', () => {
  const p = photo(4, 2, (x, y) => {
    if (x === 0 && y === 0) return [255, 0, 0, 255];
    if (x === 1 && y === 0) return [9, 9, 9, 25];
    if (x === 2 && y === 0) return [0, 255, 0, 26];
    if (x === 3 && y === 1) return [1, 2, 3, 255];
    return [0, 0, 0, 0];
  }, 8, 4);
  const l = F.listerPixels(p);
  assert.equal(l.total, 3);
  assert.equal(l.cote, 2);
  assert.deepEqual(l.demi, [4, 2]);
  assert.deepEqual(Array.from(l.donnees), [-3, -1, 65280, 255, 1, -1, 255, 26, 3, 1, 258, 1023]);
});

test('pasPremier, permuter : pas premier avec le total, permutation des pixels', () => {
  const pgcd = (a, b) => (b ? pgcd(b, a % b) : a);
  for (let total = 1; total <= 300; total++) {
    for (const graine of [0, 7, 123456]) {
      const pas = F.pasPremier(total, graine);
      assert.ok(pas >= 1 && (total === 1 || pas < total), `pas ${pas} pour ${total}`);
      assert.equal(pgcd(pas, total), 1, `pas ${pas} premier avec ${total}`);
    }
  }
  const l = rangs(10);
  const p = F.permuter(l, 3);
  assert.deepEqual(Array.from({ length: 10 }, (_, n) => p.donnees[n * 4]), [0, 3, 6, 9, 2, 5, 8, 1, 4, 7]);
  assert.deepEqual([p.total, p.cote, p.demi], [10, 1, [5, 0.5]]);
});

test('cleHilbert : ordre 1 connu ; ordre 3 : bijection, voisins successifs', () => {
  assert.deepEqual([[0, 0], [0, 1], [1, 1], [1, 0]].map(([x, y]) => F.cleHilbert(x, y, 1)), [0, 1, 2, 3]);
  const parCle = new Map();
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) parCle.set(F.cleHilbert(x, y, 3), [x, y]);
  assert.equal(parCle.size, 64);
  for (let d = 0; d < 63; d++) {
    const [a, b] = [parCle.get(d), parCle.get(d + 1)];
    assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1, `cases ${d} et ${d + 1} voisines`);
  }
});

test('ordonnerHilbert : permutation des pixels, pas de grand saut, repère commun', () => {
  const l = F.listerPixels(photo(16, 16, () => [10, 20, 30, 255], 16, 16));
  const id = { centre: [50, 50], angle: 0, echelle: [1, 1] };
  const [a] = F.ordonnerHilbert([{ liste: l, repere: id }]);
  assert.equal(a.total, 256);
  const cles = (d) => Array.from({ length: d.length / 4 }, (_, i) => `${d[i * 4]},${d[i * 4 + 1]}`).sort();
  assert.deepEqual(cles(a.donnees), cles(l.donnees));
  let pire = 0;
  for (let i = 1; i < 256; i++) pire = Math.max(pire, Math.hypot(a.donnees[i * 4] - a.donnees[i * 4 - 4], a.donnees[i * 4 + 1] - a.donnees[i * 4 - 3]));
  assert.ok(pire < 4, `saut le plus long ${pire} cqh (ordre des lignes : 15)`);
  const [b, c] = F.ordonnerHilbert([{ liste: l, repere: id }, { liste: l, repere: id }]);
  assert.deepEqual(Array.from(b.donnees), Array.from(c.donnees), 'même liste au même endroit : même ordre');
});

test('apparier : bijection sur le plus petit ensemble, particules en trop en fondu', () => {
  const drapeau = (d, i) => Math.floor(d[i * 4 + 3] / 65536);
  const r = F.apparier(rangs(10), rangs(4));
  assert.equal(r.total, 10);
  const sansSortie = [];
  for (let i = 0; i < 10; i++) {
    assert.equal(r.a[i * 4], i, 'chaque pixel de A une fois');
    assert.equal(drapeau(r.a, i), 0, 'aucune entrée : A est le plus grand');
    if (drapeau(r.b, i) === 0) sansSortie.push(r.b[i * 4]);
    else assert.equal(drapeau(r.b, i), 2);
  }
  assert.deepEqual(sansSortie, [0, 1, 2, 3], 'chaque pixel de B reçoit exactement une particule qui reste');
  const s = F.apparier(rangs(3), rangs(7));
  const entrantes = Array.from({ length: 7 }, (_, i) => drapeau(s.a, i)).filter((x) => x === 1).length;
  assert.equal(entrantes, 4);
  const restantes = Array.from({ length: 7 }, (_, i) => i).filter((i) => drapeau(s.a, i) === 0).map((i) => s.a[i * 4]);
  assert.deepEqual(restantes, [0, 1, 2]);
  assert.equal(s.b[6 * 4 + 3] % 65536, 255, 'couleur gardée sous les drapeaux');
});

test('ajusterCapacites : nombre fixé à la photographie, sous-émetteurs recalculés, effet d\'origine intact', () => {
  const effet = effetDe([
    { nom: 'g', naissance: { forme: { type: 'pixels' } }, a_la_mort: { emetteur: 'b' } },
    { nom: 'b', naissance: { nombre: 2 } },
  ]);
  const e = F.ajusterCapacites(effet, { 0: 500 });
  assert.deepEqual(e.emetteurs[0].salves, [{ t: 0, nombre: 500, debut: 0 }]);
  assert.deepEqual([e.emetteurs[0].capacite, e.emetteurs[1].capacite, e.capacite], [500, 1000, 1500]);
  assert.deepEqual([effet.emetteurs[0].capacite, effet.capacite], [1, 3]);
});

test('raccord : éléments cachés selon τ (pas de 1/120 s)', () => {
  const desint = effetDe([{ nom: 'g', naissance: { forme: { type: 'pixels' } } }]);
  const assemble = effetDe([{ nom: 'g', cible: { a: 1 } }]);
  const meta = effetDe([{ nom: 'g', naissance: { forme: { type: 'pixels' } }, cible: { source: 'cible', a: 1 } }]);
  const retour = effetDe([{ nom: 'g', naissance: { forme: { type: 'pixels' } }, cible: { a: 1 } }]);
  const cas = [
    [desint, -1, false, false], [desint, 0.5 / 120, false, false], [desint, 1 / 120, true, false], [desint, 5, true, false],
    [assemble, -2, true, false], [assemble, 1 - 0.5 / 120, true, false], [assemble, 1, false, false], [assemble, 3, false, false],
    [meta, -1, false, true], [meta, 0.5, true, true], [meta, 1, true, false],
    [retour, -1, false, false], [retour, 0.5, true, false], [retour, 1, false, false],
  ];
  for (const [effet, tau, ancre, cible] of cas) assert.deepEqual(F.raccord(effet, tau), { ancre, cible }, `τ = ${tau}`);
  assert.deepEqual([F.pasDe(1 / 120), F.pasDe(0.999 / 120), F.pasDe(-0.1)], [1, 0, -12]);
});

/** Point dans un polygone convexe (marge > 0 : strictement dedans, < 0 : bords compris). */
function dedans(poly, p, marge = 0) {
  const s = Math.sign(F.aire(poly));
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (s * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < marge) return false;
  }
  return true;
}

test('decouper, aire : demi-plan d\'un carré', () => {
  const carre = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  assert.equal(F.aire(carre), 4);
  const moitie = F.decouper(carre, 1, 0, 0);
  assert.equal(Math.abs(F.aire(moitie)), 2);
  assert.ok(moitie.every(([x]) => x <= 1e-12));
  assert.deepEqual(F.decouper(carre, 1, 0, -5), []);
});

test('voronoi : cellules disjointes qui pavent la boîte, germe dans sa cellule, tirage reproductible', () => {
  const o = { largeur: 80, hauteur: 30, morceaux: 64, graine: 7, origine: [0.3, 0.6] };
  const cellules = F.voronoi(o);
  assert.equal(cellules.length, 64);
  const somme = cellules.reduce((s, c) => s + Math.abs(F.aire(c.sommets)), 0);
  assert.ok(Math.abs(somme - 2400) < 2400 * 1e-9, `aire totale ${somme}`);
  for (const c of cellules) {
    assert.ok(c.sommets.length >= 3, 'cellule non vide');
    assert.ok(dedans(c.sommets, c.germe, -1e-9), 'germe dans sa cellule');
    assert.ok(c.sommets.every(([x, y]) => Math.abs(x) <= 40 + 1e-9 && Math.abs(y) <= 15 + 1e-9), 'dans la boîte');
  }
  let g = 1;
  const hasard = () => (g = (Math.imul(g, 48271) >>> 0) % 2147483647) / 2147483647;
  for (let i = 0; i < 2000; i++) {
    const p = [(hasard() - 0.5) * 80, (hasard() - 0.5) * 30];
    assert.equal(cellules.filter((c) => dedans(c.sommets, p)).length, 1, `point ${p} dans une seule cellule`);
  }
  assert.deepEqual(F.voronoi(o), cellules, 'même graine : même pavage');
  assert.notDeepEqual(F.voronoi({ ...o, graine: 8 }), cellules);
  // Morceaux plus petits près du point d'impact.
  const impact = [(0.3 - 0.5) * 80, (0.6 - 0.5) * 30];
  const tries = cellules.slice().sort((a, b) => Math.hypot(a.germe[0] - impact[0], a.germe[1] - impact[1]) - Math.hypot(b.germe[0] - impact[0], b.germe[1] - impact[1]));
  const moyenne = (l) => l.reduce((s, c) => s + Math.abs(F.aire(c.sommets)), 0) / l.length;
  assert.ok(moyenne(tries.slice(0, 16)) < moyenne(tries.slice(-16)), 'éclats proches de l\'impact plus petits');
});

test('eclats : centre, sommets relatifs, rayon englobant, 36 nombres par éclat ; simplification au-delà de 16 sommets', () => {
  const cellules = F.voronoi({ largeur: 40, hauteur: 20, morceaux: 12, graine: 3 });
  const e = F.eclats(cellules);
  assert.equal(e.length, 12 * F.FLOTTANTS_ECLAT);
  cellules.forEach((c, i) => {
    const b = i * 36;
    const k = e[b + 2];
    assert.equal(k, Math.min(c.sommets.length, 16));
    assert.ok(dedans(c.sommets, [e[b], e[b + 1]], 1e-9), 'centre dans l\'éclat');
    for (let j = 0; j < k; j++) {
      assert.ok(Math.abs(e[b + 4 + 2 * j] + e[b] - c.sommets[j][0]) < 1e-4);
      assert.ok(Math.abs(e[b + 5 + 2 * j] + e[b + 1] - c.sommets[j][1]) < 1e-4);
      assert.ok(Math.hypot(e[b + 4 + 2 * j], e[b + 5 + 2 * j]) <= e[b + 3] + 1e-4, 'rayon englobant');
    }
  });
  const cercle = Array.from({ length: 20 }, (_, i) => [10 * Math.cos(i * Math.PI / 10), 10 * Math.sin(i * Math.PI / 10)]);
  const s = F.eclats([{ germe: [0, 0], sommets: cercle }]);
  assert.equal(s[2], 16);
  const garde = Array.from({ length: 16 }, (_, j) => [s[4 + 2 * j] + s[0], s[5 + 2 * j] + s[1]]);
  assert.ok(garde.every((p) => cercle.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-4)), 'sommets d\'origine');
  assert.ok(Math.abs(F.aire(garde)) > 0.95 * Math.abs(F.aire(cercle)), 'aire presque gardée');
});

test('boiteOpaque, recadrer, listerPixels : photographie réduite à ses pixels opaques, positions gardées dans la boîte', () => {
  // Boîte de 20 × 10 pixels pour 40 × 20 cqh ; pixels opaques en x 2 à 5, y 6 à 7 (texte à gauche d'un bloc large).
  const p = photo(20, 10, (x, y) => (x >= 2 && x <= 5 && y >= 6 && y <= 7 ? [x, y, 0, 255] : [0, 0, 0, 0]), 40, 20);
  const b = F.boiteOpaque(p);
  assert.deepEqual(b, { x0: 2, y0: 6, x1: 6, y1: 8 });
  assert.equal(F.boiteOpaque(photo(3, 3, () => [0, 0, 0, 25])), null);
  const r = F.recadrer(p, b);
  assert.deepEqual([r.largeur, r.hauteur, r.largeurCqh, r.hauteurCqh], [4, 2, 8, 4]);
  assert.deepEqual(r.centre, [(4 - 10) * 2, (7 - 5) * 2]);
  const avant = F.listerPixels(p);
  const apres = F.listerPixels(r);
  assert.deepEqual(Array.from(apres.donnees), Array.from(avant.donnees), 'mêmes pixels aux mêmes positions locales');
  assert.deepEqual([apres.demi, apres.centre], [[4, 2], [-12, 4]]);
  // Recadrage d'une photographie déjà décalée : les centres s'ajoutent.
  const rr = F.recadrer(r, { x0: 1, y0: 0, x1: 4, y1: 2 });
  assert.deepEqual(rr.centre, [-12 + 1, 4]);
  assert.deepEqual(Array.from(F.listerPixels(rr).donnees), Array.from(avant.donnees).slice(4, 16).concat(Array.from(avant.donnees).slice(20)));
});

test('voronoi : pavage d\'une boîte décalée (boîte opaque d\'un texte en bloc), impact relatif à cette boîte', () => {
  const o = { largeur: 30, hauteur: 10, morceaux: 40, graine: 5, origine: [0.5, 0.5], centre: [-60, 3] };
  const cellules = F.voronoi(o);
  const somme = cellules.reduce((s, c) => s + Math.abs(F.aire(c.sommets)), 0);
  assert.ok(Math.abs(somme - 300) < 300 * 1e-9, `aire totale ${somme}`);
  for (const c of cellules) {
    assert.ok(c.sommets.length >= 3);
    assert.ok(c.sommets.every(([x, y]) => x >= -75 - 1e-9 && x <= -45 + 1e-9 && y >= -2 - 1e-9 && y <= 8 + 1e-9), 'dans la boîte décalée');
    assert.ok(dedans(c.sommets, c.germe, -1e-9));
  }
  // Même pavage que sans décalage, translaté.
  const sans = F.voronoi({ ...o, centre: undefined });
  cellules.forEach((c, i) => c.sommets.forEach((s, k) => {
    assert.ok(Math.abs(s[0] - sans[i].sommets[k][0] + 60) < 1e-9 && Math.abs(s[1] - sans[i].sommets[k][1] - 3) < 1e-9);
  }));
});
