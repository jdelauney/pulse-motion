'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js'];
const L = 177.78;

function compiler(emetteurs, dur = 2) {
  const r = R.compiler({ version: 1, nom: 'tas', emetteurs }, { dur, graine: 4, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}
const COLLISIONS = { cibles: ['sol', 'elements'], reponse: 'poser', empiler: true, epaisseur: 0.5, talus: 45 };

test('empilement GPU : tas (masse conservée, hauteur, pente), arrivée sur la couche, trois chemins, surface penchée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // 800 particules sur 20 cqh de large (28,8 cases de 0,694 cqh), épaisseur 0,5 : bloc de 13,9 cqh relaxé à 45°.
  const effet = compiler([
    { nom: 'flux', naissance: { debit: 400, forme: { type: 'ligne', largeur: 20 }, vie: [30, 30], taille: [0.2, 0.2] },
      forces: [{ type: 'gravite', valeur: 60 }], collisions: COLLISIONS },
    // Particule lente (vitesse limite 8 cqh/s), lâchée à y = 60 à τ = 3, quand le tas est fini : elle entre dans la couche.
    { nom: 'tard', naissance: { salves: [{ t: 3, nombre: 1 }], forme: { type: 'point', decalage: [0, 20] }, vie: [30, 30], taille: [0.2, 0.2] },
      forces: [{ type: 'gravite', valeur: 60 }, { type: 'trainee', coef: 7.5 }], collisions: COLLISIONS },
  ]);
  const penche = compiler([{ nom: 'flux', naissance: { debit: 200, forme: { type: 'ligne', largeur: 10 }, vie: [30, 30], taille: [0.2, 0.2] },
    forces: [{ type: 'gravite', valeur: 60 }], collisions: COLLISIONS }]);
  const code = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = ${L};
function preparer(effet, cadreBoite) {
  const propres = cadreBoite ? [{ scene: 's', genre: 'element', video: false, index: 0 }] : [];
  const table = O.construireTable({ largeurCqh: L, solRecette: 80, propres, effet });
  const cadres = table.entrees.map((e, i) => (i < 3 ? O.repereFixe(e.source, L, table.sol) : cadreBoite));
  const ligne = new Float32Array(table.entrees.length * 8);
  cadres.forEach((r, i) => O.ecrireRepere(ligne, i * 8, r));
  return { monde: { entrees: table.entrees, largeurCqh: L, actif: true, tans: table.tans }, zones: { a: () => [78.89, 40, 20, 0], grille: () => [78.89, 40, 20, 0], reperes: () => ligne } };
}
async function lire(effet, chemin, cadreBoite) {
  const { monde, zones } = preparer(effet, cadreBoite);
  const sim = new P.Simulation(device, effet, monde);
  for (const t of chemin) sim.avancer(t, zones);
  const h = await sim.lireHauteurs();
  const etats = [];
  for (let i = 0; i < effet.emetteurs.length; i++) etats.push(Array.from(new Uint32Array((await sim.lireEtat(i)).buffer)));
  const tard = await sim.lireEtat(effet.emetteurs.length - 1);
  sim.detruire();
  return { h: Array.from(h), etats, tard: { x: tard[0], y: tard[1], vivante: new Uint32Array(tard.buffer)[14] } };
}
// Lecture à τ = 4,5 : la tardive (≈ 1,1 s de chute jusqu'au haut du tas, creux possible au centre) est posée.
const direct = await lire(DONNEES.effet, [4.5]);
const detour = await lire(DONNEES.effet, [6, 1, 3.4, 4.5]);
const pasAPas = await lire(DONNEES.effet, Array.from({ length: 135 }, (_, i) => (i + 1) / 30));
// Boîte tournée de 70° : pas de profil (cos 70° < 0,5).
const boite = await lire(DONNEES.penche, [3], { centre: [88.89, 60], angle: 70 * Math.PI / 180, demi: [15, 3], echelle: [1, 1], actif: true });
await envoyer({ webgpu: true, direct, memes: JSON.stringify(direct) === JSON.stringify(detour) && JSON.stringify(direct) === JSON.stringify(pasAPas), boite: boite.h });`;
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: { effet, penche }, code })));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const sol = r.direct.h.slice(0, 256);
  // Masse : 801 particules posées (800 du flux, 1 tardive) × 0,5, exactement (sommes entières).
  const masse = sol.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(masse - 801 * 0.5) < 0.01, `masse ${masse}`);
  // Hauteur : bloc de 400 / 28,8 = 13,9 cqh, dont les bords s'écroulent à 45° sans abaisser le centre.
  const H = Math.max(...sol);
  assert.ok(Math.abs(H - 400 / 28.8) < 0.15 * (400 / 28.8), `hauteur ${H}`);
  // Pente : jamais au-delà de tan(45°) × largeur de case, atteinte sur les flancs.
  const pente = L / 256;
  const ecarts = sol.slice(1).map((x, i) => Math.abs(x - sol[i]));
  assert.ok(Math.max(...ecarts) <= pente * 1.02 + 1e-3, `écart maximal ${Math.max(...ecarts)} pour une pente ${pente}`);
  assert.ok(Math.max(...ecarts) >= pente * 0.9, 'les flancs sont au talus');
  // La particule tardive (lente, 8 cqh/s) se pose au haut de la couche de sa case (centre), pas sur le sol.
  assert.equal(r.direct.tard.vivante, 1);
  const caseCentre = Math.floor(88.89 / pente);
  assert.ok(Math.abs(r.direct.tard.y - (80 - 0.1 - sol[caseCentre])) < 0.6, `y ${r.direct.tard.y}, couche ${sol[caseCentre]}`);
  assert.equal(r.memes, true, 'même profil et même état par trois chemins');
  // Surface trop penchée : seul le sol (non ciblé ici par les particules qui tombent sur la boîte) porte un profil.
  assert.ok(r.boite.slice(256).every((x) => x === 0), 'pas de couche sur une boîte tournée de 70°');
});
