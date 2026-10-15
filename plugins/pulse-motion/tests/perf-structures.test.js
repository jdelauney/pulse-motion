'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js',
  'particules/maillage.js', 'particules/structures.js'];

// 16 tissus de 64 × 64 sommets (bord haut tenu, vent, turbulence, déchirure possible) dans un même effet.
const TISSUS = (() => {
  const emetteurs = Array.from({ length: 16 }, (_, i) => ({
    nom: 't' + i,
    structure: { type: 'tissu', resolution: [64, 64], attaches: [{ ou: 'haut', a: 'ancre' }], dechirure: 1.5 },
    forces: [{ type: 'gravite', valeur: 40 }, { type: 'vent', vitesse: [30, 0], coef: 1 }, { type: 'turbulence', echelle: 10, force: 20 }],
  }));
  const r = R.compiler({ version: 1, nom: 'perf', emetteurs }, { dur: 8, graine: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
})();

const CODE = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const zones = { a: () => [40, 10, 60, 60], grille: () => [40, 10, 60, 60] };
const sim = new P.Simulation(device, DONNEES.tissus, null, null, 177.78);
sim.avancer(0.5, zones);
await device.queue.onSubmittedWorkDone();
let t = 0.5;
const debut = performance.now();
for (let n = 0; n < 30; n++) {
  t += 1 / 30;
  sim.avancer(t, zones);
  await device.queue.onSubmittedWorkDone();
}
const ms = (performance.now() - debut) / 30;
sim.detruire();
const info = gpu.adaptateur && gpu.adaptateur.info ? gpu.adaptateur.info : {};
await envoyer({ webgpu: true, ms, adaptateur: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') });
`;

test('performances : 16 tissus de 64 × 64 sommets en moins de 4 ms de simulation par image', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: { tissus: TISSUS }, code: CODE }), { delai: 600000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`adaptateur : ${r.adaptateur || 'inconnu'}`);
  t.diagnostic(`16 tissus de 64 × 64 : ${r.ms.toFixed(2)} ms de simulation par image (spec : < 4 ms)`);
  if (process.env.PM_PERF === '1') assert.ok(r.ms < 4, `16 tissus : ${r.ms.toFixed(2)} ms par image`);
});
