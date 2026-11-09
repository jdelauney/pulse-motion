'use strict';
/* Spec S2, 5.12 : séries d'images de l'export (images isolées, sauts, jointures entre segments). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { statsSerie, joindre, analyserSerie, evenementsExport } = require('../scripts/lib/series.js');
const SEUILS = require('../scripts/seuils.json');

const L = 192;
const H = 108;
/** Image en gris : fond, et un carré clair de 30 px à la position x (glissement régulier). */
function image(x, { carre = 230, fond = 60 } = {}) {
  const g = new Uint8Array(L * H).fill(fond);
  for (let j = 30; j < 60; j++) for (let i = x; i < x + 30 && i < L; i++) g[j * L + i] = carre;
  return g;
}
const glissement = (n) => Array.from({ length: n }, (_, k) => image(10 + k));
const scenes = [{ id: 'a', debut: 0, fin: 2 }, { id: 'b', debut: 2, fin: 4 }];

test('series.test.js › une image isolée à l\'image 40 est trouvée ; une coupe déclarée ne l\'est pas', () => {
  const imgs = glissement(90);
  imgs[40] = new Uint8Array(L * H).fill(250);
  const st = statsSerie(imgs);
  const serie = st.m.map((m, k) => ({ m, e: st.e[k], d: st.d[k], s: st.s[k] }));
  const r = analyserSerie(serie, { ips: 30, scenes, seuils: SEUILS });
  const p = r.problemes.filter((x) => x.regle === 'image-parasite');
  assert.equal(p.length, 1);
  assert.equal(p[0].instant, Math.round(40 / 30 * 100) / 100);
  assert.equal(p[0].scene, 'a');
  assert.match(p[0].message, /une image isolée apparaît le temps d'une seule image, puis disparaît/);
  assert.equal(r.problemes.filter((x) => x.regle === 'saut-image').length, 0, 'l\'image isolée n\'est pas aussi un saut');
  // Coupe déclarée à cet instant : rien.
  assert.deepEqual(analyserSerie(serie, { ips: 30, scenes, coupes: [40 / 30], seuils: SEUILS }).problemes, []);
  // Un glissement régulier : rien.
  const lisse = statsSerie(glissement(90));
  assert.deepEqual(analyserSerie(lisse.m.map((m, k) => ({ m, e: lisse.e[k], d: lisse.d[k], s: lisse.s[k] })), { ips: 30, scenes, seuils: SEUILS }).problemes, []);
});

test('series.test.js › un saut 3 fois au-dessus de ses voisines, hors coupe et hors mouvement brusque', () => {
  // Un élément apparaît d'un coup à l'image 60 et reste : un saut, pas une image isolée.
  const imgs = Array.from({ length: 90 }, (_, k) => {
    const g = image(10 + k);
    if (k >= 60) for (let j = 70; j < 100; j++) for (let i = 120; i < 180; i++) g[j * L + i] = 255;
    return g;
  });
  const st = statsSerie(imgs);
  const serie = st.m.map((m, k) => ({ m, e: st.e[k], d: st.d[k], s: st.s[k] }));
  const p = analyserSerie(serie, { ips: 30, scenes, seuils: SEUILS }).problemes;
  assert.deepEqual(p.map((x) => [x.regle, x.scene, x.instant]), [['saut-image', 'b', 2]]);
  assert.match(p[0].message, /l'image change d'un coup/);
  assert.deepEqual(analyserSerie(serie, { ips: 30, scenes, coupes: [2], seuils: SEUILS }).problemes, []);
  assert.deepEqual(analyserSerie(serie, { ips: 30, scenes, brusques: [[1.9, 2.3]], seuils: SEUILS }).problemes, []);
  assert.deepEqual(analyserSerie(serie, { ips: 30, scenes, sequences: [[1.5, 2.5]], seuils: SEUILS }).problemes, []);
});

test('series.test.js › jointure entre deux segments analysée grâce aux vignettes de bord', () => {
  const imgs = glissement(60);
  imgs[30] = new Uint8Array(L * H).fill(250);   // première image du second segment : isolée
  const a = statsSerie(imgs.slice(0, 30));
  const b = statsSerie(imgs.slice(30));
  assert.equal(a.bords.premieres.length, 2);
  assert.equal(a.bords.dernieres.length, 2);
  const j = joindre([{ images: 30, stats: a }, { images: 30, stats: b }]);
  assert.equal(j.nonAnalyses, 0);
  assert.ok(j.images[30].d > 100 && j.images[29].s !== null);
  const p = analyserSerie(j.images, { ips: 30, scenes, seuils: SEUILS }).problemes;
  assert.deepEqual(p.map((x) => x.regle), ['image-parasite']);
  // Un segment sans statistiques : non analysé, ses images ne comptent pas.
  const k = joindre([{ images: 30, stats: a }, { images: 30, stats: null }]);
  assert.equal(k.nonAnalyses, 1);
  assert.equal(k.images[45], null);
  assert.deepEqual(analyserSerie(k.images, { ips: 30, scenes, seuils: SEUILS }).problemes, []);
});

test('series.test.js › événements de l\'export : coupes, transitions et mouvements brusques du dictionnaire', () => {
  const dico = require('../references/mouvements/mouvements.json').mouvements;
  const minutage = {
    scenes: [{ id: 'a', debut: 0, fin: 3, entree: 0, rythme: 1 }, { id: 'b', debut: 3, fin: 6, entree: 0, rythme: 1 }, { id: 'c', debut: 5.5, fin: 9, entree: 0.5, rythme: 1 }],
    elements: { a: { t: { debut: 0.3, fin: 1 } }, b: { z: { debut: 3.2, fin: 4 } }, c: {} },
  };
  const ev = evenementsExport({ minutage, dico, elements: { a: [{ cle: 't', classe: 'pm-m-saccade' }], b: [{ cle: 'z', lettres: 'brouille' }], c: [] },
    transitions: { a: 'fondu', b: 'coupe', c: { shader: 'glitch', duree: 0.5 } }, camera: { a: [{ debut: 2, duree: 0.3 }] } });
  // Coupe en « b » ; la fin de la transition de « c » n'en est plus une (la scène qui sort ne disparaît plus d'un coup, 0.36.0).
  assert.deepEqual(ev.coupes, [3]);
  assert.deepEqual(ev.brusques, [[0.3, 1], [2, 2.3], [3.2, 4], [5.5, 6]]);
});
