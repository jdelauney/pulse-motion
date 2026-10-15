'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js',
  'particules/maillage.js', 'particules/structures.js', 'particules/rendu.js'];
const NEUTRE = { bloom: 0, tons: 'neutre' };

function compiler(emetteurs, dur = 2) {
  const r = R.compiler({ version: 1, nom: 'essai', rendu_calque: NEUTRE, emetteurs }, { dur, graine: 5, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

/** Canvas de 1777 × 1000 : 1 cqh = 10 pixels (largeur 177,7 cqh). */
const COMMUN = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const canvas = document.createElement('canvas');
canvas.width = 1777;
canvas.height = 1000;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
const OPTIONS = { largeurCqh: 177.7, dureeImage: 1 / 30, bloom: 0, seuil: 1, tons: 'neutre' };
const pixel = (px, x, y) => Array.from(px.donnees.slice((y * px.largeur + x) * 4, (y * px.largeur + x) * 4 + 4));
const boite = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2, 0, 1, b[2] / 2, b[3] / 2, 1, 1];
/** Zones : zone fixe (élément 0) et autres éléments d'attache donnés par autres(g). */
const zones = (z, autres = () => []) => ({ a: () => z, grille: () => z, attaches: (g) => new Float32Array(boite(z).concat(...autres(g).map(boite))) });
/** Image de l'effet à τ : simulation, dessin de tous ses émetteurs, pixels. */
async function image(effet, zs, tau, fragments = null) {
  const sim = new P.Simulation(device, effet, null, fragments, 177.7);
  const d = sim.avancer(tau, zs);
  sim.emetteurs.forEach((e) => rendu.preparerEmetteur(e));
  rendu.dessiner(cible, d.map((delta, i) => ({ sim, i, delta })), OPTIONS);
  const px = await rendu.lirePixels(cible);
  rendu.oublier(sim);
  sim.detruire();
  return px;
}
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const proche = (a, b, tol, quoi) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `${quoi} : ${a} au lieu de ${b}`));

test('rendu des structures : tissu plat aux couleurs exactes, bandes nettes, mailles, corde de l\'épaisseur voulue', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const donnees = {
    plat: compiler([{ nom: 'a', structure: { type: 'tissu', resolution: [11, 6], apparence: { couleur: '#2060ff' } } }]),
    bandes: compiler([{ nom: 'b', structure: { type: 'tissu', resolution: [13, 4], apparence: { degrade: ['#ff0000', '#00ff00', '#0000ff'], bandes: true } } }]),
    mailles: compiler([{ nom: 'm', structure: { type: 'tissu', resolution: [5, 3], apparence: { mailles: true } } }]),
    corde: compiler([{ nom: 'c', structure: { type: 'corde', resolution: 41, epaisseur: 1, apparence: { couleur: '#ff8000' } } }]),
  };
  // Sans force ni attache, chaque structure reste au repos sur sa zone.
  const r = await page(donnees, `
const a = await image(DONNEES.plat, zones([60, 40, 20, 10]), 0.1);
const b = await image(DONNEES.bandes, zones([20, 10, 30, 10]), 0.1);
const m = await image(DONNEES.mailles, zones([100, 10, 40, 20]), 0.1);
const c = await image(DONNEES.corde, zones([60, 80, 40, 1]), 0.1);
await envoyer({ webgpu: true, trie: rendu.estTrie({ structure: true, em: { rendu: { melange: 'alpha' } } }),
  plat: pixel(a, 700, 450), dehors: pixel(a, 300, 450),
  bandes: [pixel(b, 250, 150), pixel(b, 350, 150), pixel(b, 450, 150)],
  ligne: pixel(m, 1100, 150), cellule: pixel(m, 1050, 150),
  milieu: pixel(c, 800, 805), interieur: pixel(c, 800, 802), dessus: pixel(c, 800, 797) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.trie, false, 'une structure n\'est pas triée');
  proche(r.plat, [32, 96, 255, 255], 2, 'tissu plat : couleur exacte (éclairage 1)');
  assert.deepEqual(r.dehors, [0, 0, 0, 0]);
  proche(r.bandes[0], [255, 0, 0, 255], 2, 'première bande');
  proche(r.bandes[1], [0, 255, 0, 255], 2, 'deuxième bande');
  proche(r.bandes[2], [0, 0, 255, 255], 2, 'troisième bande');
  assert.ok(r.ligne[3] > 200, `mailles : ligne du maillage opaque (${r.ligne})`);
  assert.equal(r.cellule[3], 0, 'mailles : centre de la cellule transparent');
  proche(r.milieu, [255, 128, 0, 255], 3, 'corde : couleur au milieu');
  assert.equal(r.interieur[3], 255, 'corde : 0,25 cqh du milieu, dans le ruban');
  assert.equal(r.dessus[3], 0, 'corde : 0,8 cqh du milieu, hors du ruban (épaisseur 1)');
});

test('rendu des structures : trou à la place des liens rompus, revers assombri, photographie de l\'élément plaquée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const gauche = [0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27];
  const donnees = {
    // 8 × 4 sommets sur [60, 40, 28, 12] : moitié gauche tenue par #gauche (fixe), moitié droite par #droite, qui part à
    // 20 cqh/s : liens du milieu rompus.
    dechire: compiler([{ nom: 'd', structure: { type: 'tissu', resolution: [8, 4], raideur: 1, dechirure: 1.2, apparence: { couleur: '#ffffff' },
      attaches: [{ ou: gauche.join(', '), a: '#gauche' }, { ou: gauche.map((v) => v + 4).join(', '), a: '#droite' }] } }]),
    // 2 × 2 sommets tenus en miroir : le tissu montre son revers.
    revers: compiler([{ nom: 'r', structure: { type: 'tissu', resolution: [2, 2], apparence: { couleur: '#ffffff' },
      attaches: [{ ou: 0, a: [1, 0] }, { ou: 1, a: [0, 0] }, { ou: 2, a: [1, 1] }, { ou: 3, a: [0, 1] }] } }]),
    photo: compiler([{ nom: 'p', structure: { type: 'tissu', resolution: [9, 5], apparence: { source: 'ancre' } } }]),
  };
  const r = await page(donnees, `
const Z = [60, 40, 28, 12];
const d = await image(DONNEES.dechire, zones(Z, (g) => [Z, [60 + 20 * g / 30, 40, 28, 12]]), 1);
const v = await image(DONNEES.revers, zones([20, 60, 20, 10]), 0.1);
// Photographie : moitié gauche rouge, moitié droite bleue (rectangle local de 20 × 10 cqh centré).
const ph = document.createElement('canvas');
ph.width = 64;
ph.height = 32;
const g2 = ph.getContext('2d');
g2.fillStyle = '#ff0000';
g2.fillRect(0, 0, 32, 32);
g2.fillStyle = '#0000ff';
g2.fillRect(32, 0, 32, 32);
const bitmap = await createImageBitmap(ph);
const f = await image(DONNEES.photo, zones([120, 60, 20, 10]), 0.1, [{ image: bitmap, centreA: [0, 0], demiA: [10, 5] }]);
await envoyer({ webgpu: true, gauche: pixel(d, 660, 460), trou: pixel(d, 840, 460), droite: pixel(d, 1000, 460),
  revers: pixel(v, 300, 650), rouge: pixel(f, 1250, 650), bleu: pixel(f, 1350, 650) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  proche(r.gauche, [255, 255, 255, 255], 2, 'moitié gauche dessinée');
  proche(r.droite, [255, 255, 255, 255], 2, 'moitié droite dessinée');
  assert.equal(r.trou[3], 0, 'trou à la place des liens rompus');
  // Revers : blanc × 0,55 en linéaire, soit 196 en sRVB.
  assert.equal(r.revers[3], 255);
  assert.ok(r.revers[0] >= 186 && r.revers[0] <= 206, `revers assombri une fois : ${r.revers}`);
  proche(r.rouge, [255, 0, 0, 255], 3, 'photographie : moitié gauche');
  proche(r.bleu, [0, 0, 255, 255], 3, 'photographie : moitié droite');
});
