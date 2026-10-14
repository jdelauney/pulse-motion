'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js', 'particules/rendu.js'];
const compiler = (emetteur) => {
  const r = R.compiler({ version: 1, nom: 'perf', rendu_calque: { bloom: 0.6 }, emetteurs: [emetteur] }, { dur: 8, graine: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
};

// 60 000 particules de fluide à la densité de repos (h = 1 : 6 par cqh² sur 100 × 100 cqh), rendu « fluide ».
const FLUIDE = compiler({ nom: 'eau', naissance: { salves: [{ t: 0, nombre: 60000 }], forme: { type: 'rectangle' }, vie: [30, 30], taille: [0.6, 0.6] },
  interactions: { type: 'fluide', rayon: 1, densite: 6 }, rendu: { type: 'fluide', teinte: '#3a9bdc', lissage: 0.5 } });
// 60 000 grains serrés (taille 0,4 sur 158 × 80 cqh : beaucoup de contacts).
const GRAINS = compiler({ nom: 'sable', naissance: { salves: [{ t: 0, nombre: 60000 }], forme: { type: 'rectangle' }, vie: [30, 30], taille: [0.4, 0.4] },
  interactions: { type: 'grains', rayon: 0.5 } });
// 100 000 oiseaux sur toute l'image (vision 2 cqh : une vingtaine par cellule).
const ESSAIM = compiler({ nom: 'nuee', naissance: { salves: [{ t: 0, nombre: 100000 }], forme: { type: 'rectangle' }, vitesse: { cone: 360, valeur: [5, 15] }, vie: [30, 30], taille: [0.3, 0.3] },
  interactions: { type: 'essaim', rayon: 1, vision: { rayon: 2 }, vitesse: [5, 15] }, rendu: { type: 'etincelle' } });

const CODE = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const canvas = document.createElement('canvas');
canvas.width = 1920;
canvas.height = 1080;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
const options = { largeurCqh: 177.78, dureeImage: 1 / 30, bloom: 0.6, seuil: 1, tons: 'douce' };
/** ms de simulation par image de capture (1/30 s : 4 pas), après 0,5 s de mise en place hors mesure ; τ toujours croissant. */
async function mesurer(effet, zone) {
  const zones = { a: () => zone, grille: () => zone };
  const sim = new P.Simulation(device, effet, null, null, 177.78);
  sim.avancer(0.5, zones);
  await device.queue.onSubmittedWorkDone();
  let t = 0.5;
  const debut = performance.now();
  for (let n = 0; n < 30; n++) {
    t += 1 / 30;
    sim.avancer(t, zones);
    await device.queue.onSubmittedWorkDone();
  }
  return { sim, zones, t, capture: (performance.now() - debut) / 30 };
}
const f = await mesurer(DONNEES.fluide, [40, 0, 100, 100]);
// Aperçu 1080p : simulation et nappe dessinée à chaque image de 1/30 s (échauffement hors mesure).
rendu.dessiner(cible, [{ sim: f.sim, i: 0, delta: 0 }], options);
await device.queue.onSubmittedWorkDone();
let t = f.t;
const debut = performance.now();
for (let n = 0; n < 30; n++) {
  t += 1 / 30;
  const d = f.sim.avancer(t, f.zones);
  rendu.dessiner(cible, [{ sim: f.sim, i: 0, delta: d[0] }], options);
  await device.queue.onSubmittedWorkDone();
}
const apercu = (performance.now() - debut) / 30;
rendu.oublier(f.sim);
f.sim.detruire();
const g = await mesurer(DONNEES.grains, [10, 10, 158, 80]);
g.sim.detruire();
const e = await mesurer(DONNEES.essaim, [0, 0, 177, 100]);
e.sim.detruire();
const info = gpu.adaptateur && gpu.adaptateur.info ? gpu.adaptateur.info : {};
await envoyer({ webgpu: true, fluide: f.capture, apercu, grains: g.capture, essaim: e.capture,
  adaptateur: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') });
`;

test('performances : interactions (fluide et grains 60 000 < 8 ms, essaim 100 000 < 5 ms, aperçu fluide 1080p ≥ 30 im/s)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: { fluide: FLUIDE, grains: GRAINS, essaim: ESSAIM }, code: CODE }), { delai: 600000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`adaptateur : ${r.adaptateur || 'inconnu'}`);
  t.diagnostic(`fluide (60 000) : ${r.fluide.toFixed(2)} ms de simulation par image (spec : < 8 ms)`);
  t.diagnostic(`grains (60 000) : ${r.grains.toFixed(2)} ms de simulation par image (spec : < 8 ms)`);
  t.diagnostic(`essaim (100 000) : ${r.essaim.toFixed(2)} ms de simulation par image (spec : < 5 ms)`);
  t.diagnostic(`aperçu fluide 1080p : ${r.apercu.toFixed(2)} ms par image (spec : ≥ 30 im/s, < 33,3 ms)`);
  if (process.env.PM_PERF === '1') {
    assert.ok(r.fluide < 8, `fluide : ${r.fluide.toFixed(2)} ms`);
    assert.ok(r.grains < 8, `grains : ${r.grains.toFixed(2)} ms`);
    assert.ok(r.essaim < 5, `essaim : ${r.essaim.toFixed(2)} ms`);
    assert.ok(r.apercu < 1000 / 30, `aperçu : ${r.apercu.toFixed(2)} ms`);
  }
});
