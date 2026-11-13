'use strict';
/* Animation Lottie d'essai (spec S9, 5.11), écrite à la main pour les tests : une balle orange qui traverse en 1 s (courbe
 * symétrique), un trait gris qui se trace en 2 s (tracé tronqué), un carré bleu masqué par un cercle qui grandit, un losange
 * vert vu à travers un cache alpha (calque source au-dessus), sur un fond clair. 200 × 200, 30 images/s, 2 s. */

const fixe = (k) => ({ a: 0, k });
const IDENTITE = { o: fixe(100), r: fixe(0), p: fixe([0, 0, 0]), a: fixe([0, 0, 0]), s: fixe([100, 100, 100]) };
const ORANGE = [1, 0.3529, 0, 1]; // #ff5a00
const GRIS = [0.1333, 0.1333, 0.1333, 1]; // #222222

function animationEssai() {
  return {
    v: '5.7.0', fr: 30, ip: 0, op: 60, w: 200, h: 200, nm: 'essai', ddd: 0, assets: [],
    layers: [
      { ddd: 0, ind: 1, ty: 4, nm: 'balle', sr: 1, ip: 0, op: 60, st: 0,
        ks: { ...IDENTITE, p: { a: 1, k: [{ t: 0, s: [50, 60, 0], o: { x: [0.33], y: [0] }, i: { x: [0.67], y: [1] } }, { t: 30, s: [150, 60, 0] }] } },
        shapes: [{ ty: 'gr', it: [
          { ty: 'el', p: fixe([0, 0]), s: fixe([40, 40]) },
          { ty: 'fl', c: fixe(ORANGE), o: fixe(100), r: 1 },
          { ty: 'tr', p: fixe([0, 0]), a: fixe([0, 0]), s: fixe([100, 100]), r: fixe(0), o: fixe(100) },
        ] }] },
      { ddd: 0, ind: 2, ty: 4, nm: 'trait', sr: 1, ip: 0, op: 60, st: 0, ks: IDENTITE,
        shapes: [
          { ty: 'rc', p: fixe([100, 175]), s: fixe([160, 14]), r: fixe(0) },
          { ty: 'tm', s: fixe(0), e: { a: 1, k: [{ t: 0, s: [0], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: 60, s: [100] }] }, o: fixe(0), m: 1 },
          { ty: 'st', c: fixe(GRIS), o: fixe(100), w: fixe(6), lc: 2, lj: 2 },
        ] },
      // Cache : la forme source (td) juste au-dessus du calque qu'elle découpe (tt = 1, alpha).
      { ddd: 0, ind: 3, ty: 4, nm: 'source du cache', sr: 1, ip: 0, op: 60, st: 0, td: 1, ks: IDENTITE,
        shapes: [{ ty: 'rc', p: fixe([150, 120]), s: fixe([60, 30]), r: fixe(0) }, { ty: 'fl', c: fixe([1, 1, 1, 1]), o: fixe(100), r: 1 }] },
      { ddd: 0, ind: 4, ty: 4, nm: 'losange', sr: 1, ip: 0, op: 60, st: 0, tt: 1,
        ks: { ...IDENTITE, r: { a: 1, k: [{ t: 0, s: [0], o: { x: [0.5], y: [0] }, i: { x: [0.5], y: [1] } }, { t: 60, s: [90] }] }, p: fixe([150, 120, 0]) },
        shapes: [{ ty: 'sr', sy: 2, pt: fixe(4), p: fixe([0, 0]), r: fixe(0), or: fixe(30), os: fixe(0) }, { ty: 'fl', c: fixe([0, 0.55, 0.2, 1]), o: fixe(100), r: 1 }] },
      { ddd: 0, ind: 5, ty: 4, nm: 'carré masqué', sr: 1, ip: 0, op: 60, st: 0, ks: IDENTITE, hasMask: true,
        masksProperties: [{ mode: 'a', inv: false, o: fixe(100),
          pt: { a: 1, k: [
            { t: 0, s: [{ c: true, v: [[50, 100], [60, 110], [50, 120], [40, 110]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }], o: { x: [0.4], y: [0] }, i: { x: [0.6], y: [1] } },
            { t: 45, s: [{ c: true, v: [[50, 80], [80, 110], [50, 140], [20, 110]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] }] } }],
        shapes: [{ ty: 'rc', p: fixe([50, 110]), s: fixe([60, 60]), r: fixe(6) }, { ty: 'fl', c: fixe([0.1, 0.3, 0.9, 1]), o: fixe(100), r: 1 }] },
      { ddd: 0, ind: 6, ty: 1, nm: 'fond', sr: 1, ip: 0, op: 60, st: 0, ks: IDENTITE, sw: 200, sh: 200, sc: '#f2f2f2' },
    ],
  };
}

module.exports = { animationEssai, ORANGE, GRIS };
