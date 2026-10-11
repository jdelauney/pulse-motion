'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'particules/rendu.js'];

// 100 000 particules simultanées : débit 50 000/s, vie 2 s, turbulence (voie simulée), étincelles additives.
const { effet } = R.compiler({
  version: 1, nom: 'perf',
  emetteurs: [{ nom: 'nuee',
    naissance: { debit: 50000, forme: { type: 'ancre' }, vitesse: { cone: 360, valeur: [5, 30] }, vie: [2, 2], taille: [0.3, 0.6] },
    forces: [{ type: 'gravite', valeur: 10 }, { type: 'trainee', coef: 0.5 }, { type: 'turbulence', echelle: 10, force: 20 }],
    rendu: { type: 'etincelle', melange: 'additif' } }],
}, { dur: 6, graine: 1 });

const CODE = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const canvas = document.createElement('canvas');
canvas.width = 1920; canvas.height = 1080;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
const sim = new P.Simulation(device, DONNEES);
const ZONE = [60, 30, 58, 40];
const zones = { a: () => ZONE, grille: () => ZONE };
const options = { largeurCqh: 177.78, dureeImage: 1 / 30, bloom: 0.8, seuil: 1, tons: 'douce' };
// Montée en régime : 2,5 s de simulation pour atteindre 100 000 particules vivantes.
sim.avancer(2.5, zones);
await device.queue.onSubmittedWorkDone();
const etat = new Uint32Array((await sim.lireEtat(0)).buffer);
let vivantes = 0;
for (let s = 14; s < etat.length; s += 16) if (etat[s] === 1) vivantes++;
async function chrono(images, pas, avecRendu) {
  let t = 2.5;
  const debut = performance.now();
  for (let n = 0; n < images; n++) {
    t += pas;
    const deltas = sim.avancer(t, zones);
    if (avecRendu) rendu.dessiner(cible, [{ sim, i: 0, delta: deltas[0] }], options);
    await device.queue.onSubmittedWorkDone();
  }
  return (performance.now() - debut) / images;
}
const capture = await chrono(60, 1 / 30, false);
const apercu = await chrono(120, 1 / 60, true);
const info = gpu.adaptateur && gpu.adaptateur.info ? gpu.adaptateur.info : {};
await envoyer({ webgpu: true, vivantes, capture, apercu, adaptateur: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') });
`;

test('performances : 100 000 particules (simulation en capture, rendu 1080p en aperçu)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: effet, code: CODE }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  t.diagnostic(`adaptateur : ${r.adaptateur || 'inconnu'}`);
  t.diagnostic(`particules vivantes : ${r.vivantes}`);
  t.diagnostic(`capture : ${r.capture.toFixed(2)} ms de simulation par image (spec : < 5 ms)`);
  t.diagnostic(`aperçu : ${r.apercu.toFixed(2)} ms par image avec rendu 1080p (spec : < 16,7 ms pour 60 ips)`);
  assert.ok(r.vivantes > 90000, `${r.vivantes} particules vivantes`);
  if (process.env.PM_PERF === '1') {
    assert.ok(r.capture < 5, `simulation : ${r.capture.toFixed(2)} ms par image`);
    assert.ok(r.apercu < 1000 / 60, `aperçu : ${r.apercu.toFixed(2)} ms par image`);
  }
});
