'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/formes.js'];

test('formes GPU : pluie sur un disque (pose sur le contour), rebond vertical, forme étirée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const compiler = (emetteurs) => {
    const r = R.compiler({ version: 1, nom: 'f', emetteurs }, { dur: 0.1, graine: 9, charte: {} });
    assert.equal(r.ok, true, JSON.stringify(r.erreurs));
    return r.effet;
  };
  const pluie = compiler([{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 40 }], forme: { type: 'ligne', largeur: 16 }, vie: [10, 10], taille: [0.2, 0.2] },
    forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['formes'], reponse: 'poser' } }]);
  const rebond = compiler([{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vie: [10, 10], taille: [0.2, 0.2] },
    forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['formes'], restitution: 0.5, frottement: 0 } }]);
  const large = compiler([{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 60 }], forme: { type: 'ligne', largeur: 36 }, vie: [10, 10], taille: [0.2, 0.2] },
    forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['formes'], reponse: 'poser' } }]);
  const code = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 177.78;
const disque = new Uint8ClampedArray(64 * 64);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) disque[y * 64 + x] = (x + 0.5 - 32) ** 2 + (y + 0.5 - 32) ** 2 < 32 * 32 ? 255 : 0;
const formes = P.creerFormes(device, [{ largeur: 64, hauteur: 64, alpha: disque, hauteurCqh: 20 }]);
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [{ scene: 's', genre: 'forme', video: false, index: 0 }] });
O.attacherFormes(table, () => 0);
const monde = { entrees: table.entrees, largeurCqh: L, actif: true, formes: { vue: formes.vue } };
function zones(ZONE, cadreForme) {
  const t = new Float32Array(table.entrees.length * 8);
  table.entrees.forEach((e, i) => O.ecrireRepere(t, i * 8, i < 3 ? O.repereFixe(e.source, L, table.sol) : cadreForme));
  return { a: () => ZONE, grille: () => ZONE, reperes: () => t };
}
const cercle = { centre: [50, 50], angle: 0, demi: [10, 10], echelle: [1, 1], actif: true };
const ellipse = { centre: [50, 50], angle: 0, demi: [20, 10], echelle: [2, 1], actif: true };
async function lire(effet, z, tau) {
  const sim = new P.Simulation(device, effet, monde);
  sim.avancer(tau, z);
  const f = await sim.lireEtat(0);
  const c = new Uint32Array((await sim.lireContacts(0)).buffer);
  const u = new Uint32Array(f.buffer);
  const l = [];
  for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ x: f[s * 16], y: f[s * 16 + 1], vx: f[s * 16 + 4], vy: f[s * 16 + 5], obstacle: c[s * 8 + 2] });
  sim.detruire();
  return l;
}
const pluie = await lire(DONNEES.pluie, zones([42, 20, 16, 0], cercle), 2);
const rebond = await lire(DONNEES.rebond, zones([45, 15, 10, 10], cercle), 1.3);
const large = await lire(DONNEES.large, zones([32, 20, 36, 0], ellipse), 2.5);
await envoyer({ webgpu: true, pluie, rebond, large });`;
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: { pluie, rebond, large }, code })));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  // Disque de rayon 10 en (50, 50), particules de rayon 0,1 : posées à 10,1 du centre, sur le haut.
  const posees = r.pluie.filter((p) => p.obstacle === 3);
  assert.equal(posees.length, 40, 'toutes posées (x entre 42 et 58)');
  for (const p of posees) {
    const d = Math.hypot(p.x - 50, p.y - 50);
    assert.ok(Math.abs(d - 10.1) < 0.35, `distance au centre ${d}`);
    assert.ok(p.y < 50, 'sur le dessus');
  }
  // Rebond au sommet du disque (impact vers t = 1 s) : remonte à la verticale.
  assert.equal(r.rebond.length, 1);
  assert.ok(r.rebond[0].vy < -5, `vy ${r.rebond[0].vy}`);
  assert.ok(Math.abs(r.rebond[0].vx) < 1, `vx ${r.rebond[0].vx}`);
  // Forme étirée 2 × 1 : ellipse de demi-axes 20 et 10 (gonflée de 0,1).
  const surEllipse = r.large.filter((p) => p.obstacle === 3);
  assert.ok(surEllipse.length >= 50, `${surEllipse.length} posées sur l'ellipse`);
  for (const p of surEllipse) {
    const e = ((p.x - 50) / 20.1) ** 2 + ((p.y - 50) / 10.1) ** 2;
    assert.ok(Math.abs(e - 1) < 0.08, `équation de l'ellipse : ${e}`);
  }
});
