'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/rendu.js'];

test('rendu : une particule posée s\'efface après repos_apres, puis meurt', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const { effet, ok, erreurs } = R.compiler({ version: 1, nom: 'fondu', rendu_calque: { bloom: 0 }, emetteurs: [{
    nom: 'a', naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vie: [10, 10], taille: [20, 20] },
    forces: [{ type: 'gravite', valeur: 400 }], collisions: { cibles: ['sol'], reponse: 'poser', repos_apres: 0.5 },
    vie: { couleur: '#ffffff' }, rendu: { melange: 'alpha' },
  }] }, { dur: 0.1, graine: 1, charte: {} });
  assert.equal(ok, true, JSON.stringify(erreurs));
  const code = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
const table = O.construireTable({ largeurCqh: L, solRecette: 80 });
const ligne = new Float32Array(table.entrees.length * 8);
table.entrees.forEach((e, i) => O.ecrireRepere(ligne, i * 8, O.repereFixe(e.source, L, table.sol)));
const z = { a: () => [80, 55, 10, 10], grille: () => [80, 55, 10, 10], reperes: () => ligne };
const canvas = document.createElement('canvas');
canvas.width = 320; canvas.height = 180;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
const sim = new P.Simulation(device, DONNEES, { entrees: table.entrees, largeurCqh: L, actif: true });
sim.emetteurs.forEach((e) => rendu.preparerEmetteur(e));
const options = { largeurCqh: L, dureeImage: 1 / 30, bloom: 0, seuil: 1, tons: 'douce' };
async function somme(tau) {
  const d = sim.avancer(tau, z);
  rendu.dessiner(cible, [{ sim, i: 0, delta: d[0] }], options);
  const p = await rendu.lirePixels(cible);
  let s = 0;
  for (let i = 3; i < p.donnees.length; i += 4) s += p.donnees[i];
  const c = await sim.lireContacts(0);
  const e = new Uint32Array((await sim.lireEtat(0)).buffer);
  return { s, opacite: c[6], vivante: e[14] };
}
// Pose à 0,224 s (chute de 10 cqh à 400 cqh/s²) ; fondu de 0,724 à 1,224 s.
const plein = await somme(0.5);
const moitie = await somme(0.974);
const fin = await somme(1.3);
await envoyer({ webgpu: true, plein, moitie, fin });`;
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: effet, code })));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.plein.s > 0, 'particule dessinée');
  assert.equal(r.plein.opacite, 1);
  assert.ok(Math.abs(r.moitie.opacite - 0.5) < 0.03, `opacité à mi-fondu : ${r.moitie.opacite}`);
  assert.ok(r.moitie.s > 0.3 * r.plein.s && r.moitie.s < 0.7 * r.plein.s, `alpha à mi-fondu : ${r.moitie.s} / ${r.plein.s}`);
  assert.equal(r.fin.vivante, 0, 'morte après le fondu');
  assert.equal(r.fin.s, 0);
});
