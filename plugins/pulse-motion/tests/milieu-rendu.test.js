'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js',
  'particules/maillage.js', 'particules/structures.js', 'particules/milieu.js', 'particules/rendu.js'];

function compilerMilieu(milieu) {
  const r = R.compiler({ version: 1, nom: 'air', rendu_calque: { bloom: 0, tons: 'neutre' }, milieu }, { dur: 2, graine: 1, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}

/** Canvas de 1777 × 1000 : 1 cqh = 10 pixels ; milieu de 64 cellules sur la largeur de la scène (177,7 cqh). */
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
const ZONE = [0, 0, 177.7, 100];
const pixel = (px, x, y) => Array.from(px.donnees.slice((y * px.largeur + x) * 4, (y * px.largeur + x) * 4 + 4));
/** Image du milieu dont les scalaires valent valeurs(i, j) (8 par cellule), sans pas de simulation. */
async function image(effet, valeurs) {
  const m = new P.Milieu(device, effet, ZONE, null, effet.fin);
  const g = m.grille;
  const s = new Float32Array(g.nx * g.ny * 8);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) s.set(valeurs(i, j, g), (j * g.nx + i) * 8);
  m.ecrireScalaires(s);
  rendu.dessiner(cible, [], { largeurCqh: 177.7, dureeImage: 1 / 30, bloom: 0, seuil: 1, tons: 'neutre', milieu: m });
  const px = await rendu.lirePixels(cible);
  rendu.oublierMilieu(m);
  m.detruire();
  return { px, g };
}
/** Pixel (x, y) du centre de la cellule (i, j). */
const centre = (g, i, j) => [Math.round((g.origine[0] + (i + 0.5) * g.cote) * 10), Math.round((g.origine[1] + (j + 0.5) * g.cote) * 10)];
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('rendu du milieu : feu du rouge au jaune-blanc selon la température (corps noir, HDR), sans palier entre deux pixels', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const feu = compilerMilieu({ resolution: 64, rendu: { type: 'feu', intensite: 3 } });
  const r = await page({ feu }, `
// Température croissante de gauche à droite (0,05 à 1), sans fumée.
const { px, g } = await image(DONNEES.feu, (i, j, grille) => [0, 0.05 + 0.95 * i / (grille.nx - 1), 0, 0, 0, 0, 0, 0]);
const tiede = pixel(px, ...centre(g, 13, 18));
const moyen = pixel(px, ...centre(g, 38, 18));
const chaud = pixel(px, ...centre(g, 60, 18));
// Deux pixels voisins au milieu d'une cellule : écart minime (aucun palier de cellule).
const [x, y] = centre(g, 30, 18);
const a = pixel(px, x, y), b = pixel(px, x + 1, y);
await envoyer({ webgpu: true, tiede, moyen, chaud, saut: Math.max(...a.map((v, k) => Math.abs(v - b[k]))) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`tiède ${r.tiede}, moyen ${r.moyen}, chaud ${r.chaud}`);
  const [rt, vt, bt] = r.tiede;
  // Émission intensite × t² (un feu tiède luit à peine) : à t ≈ 0,25, 0,18 en linéaire, lue prémultipliée (alpha = luminance) : ≈ 46.
  assert.ok(rt > 30 && rt > 1.6 * vt && bt < 0.25 * rt, `tiède : rouge sombre (${r.tiede})`);
  const [rm, vm, bm] = r.moyen;
  assert.ok(rm >= vm && vm > bm && vm > 0.6 * rm, `moyen : orangé à jaune (${r.moyen})`);
  const [rc, vc, bc] = r.chaud;
  assert.ok(rc > 240 && vc > 0.85 * rc && bc > 0.6 * rc, `chaud : jaune-blanc (${r.chaud})`);
  assert.ok(r.saut <= 4, `écart entre deux pixels voisins : ${r.saut}`);
});

test('rendu du milieu : fumée ombrée (côté de la lumière plus clair), rien hors de la grille ni sans fumée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const fumee = compilerMilieu({ resolution: 64, rendu: { type: 'fumee', couleur: '#ffffff', opacite: 1, lumiere: [-1, 0] } });
  const r = await page({ fumee }, `
// Bloc de fumée (densité 0,3) de la colonne 20 à 43, lignes 10 à 25 ; lumière venue de la gauche.
const { px, g } = await image(DONNEES.fumee, (i, j) => (i >= 20 && i < 44 && j >= 10 && j < 26 ? [0.3, 0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0]));
await envoyer({ webgpu: true, gauche: pixel(px, ...centre(g, 21, 18)), droite: pixel(px, ...centre(g, 42, 18)), vide: pixel(px, ...centre(g, 5, 5)) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`côté éclairé ${r.gauche}, côté à l'ombre ${r.droite}`);
  assert.ok(r.gauche[3] > 60 && Math.abs(r.gauche[3] - r.droite[3]) <= 3, 'même opacité des deux côtés');
  assert.ok(r.gauche[0] > 1.2 * r.droite[0], 'le côté de la lumière est plus clair');
  assert.deepEqual(r.vide, [0, 0, 0, 0]);
});

test('rendu du milieu : encre par absorption (exacte sur fond blanc : la couleur de l\'encre)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const encre = compilerMilieu({ resolution: 64, rendu: { type: 'encre', opacite: 1 } });
  const sigma = R.absorbanceEncre(R.couleurLineaire('#2050c0', {}));
  const r = await page({ encre, sigma }, `
const { px, g } = await image(DONNEES.encre, (i, j) => (i >= 20 && i < 44 && j >= 10 && j < 26 ? [0, 0, 0, 0, ...DONNEES.sigma, 0] : [0, 0, 0, 0, 0, 0, 0, 0]));
await envoyer({ webgpu: true, dedans: pixel(px, ...centre(g, 32, 18)), dehors: pixel(px, ...centre(g, 5, 5)) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const [rr, vv, bb, a] = r.dedans;
  assert.ok(a > 240, `encre presque opaque sur fond blanc (${r.dedans})`);
  assert.ok(bb > 3 * rr && bb > vv, `bleu dominant : la couleur de l'encre (${r.dedans})`);
  assert.deepEqual(r.dehors, [0, 0, 0, 0]);
});
