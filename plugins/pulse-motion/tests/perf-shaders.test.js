'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');
const S = require('../moteur/shaders/code.js');
const { chargeurShaders, donneeShader } = require('../scripts/lib/shaders.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const charger = chargeurShaders(dossierTemporaire('pm-sh-vide-'), path.join(__dirname, '..', 'shaders'));
const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'particules/rendu.js', 'shaders/code.js', 'particules/shaders.js', 'particules/composition.js'];

test('performances : module de force sur 100 000 particules (simulation en capture)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const { effet } = R.compiler({ version: 1, nom: 'perf-module', emetteurs: [{ nom: 'nuee',
    naissance: { debit: 50000, forme: { type: 'ancre' }, vitesse: { cone: 360, valeur: [5, 30] }, vie: [2, 2], taille: [0.3, 0.6] },
    forces: [{ type: 'trainee', coef: 0.5 }], modules: { force: 'spirale' }, rendu: { type: 'etincelle', melange: 'additif' } }] },
  { dur: 8, graine: 1, charte: CHARTE });
  assert.deepEqual(S.attacherModules(effet, (n) => charger(n), CHARTE), []);
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: effet, code: `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const sim = new P.Simulation(device, DONNEES);
const ZONE = [60, 30, 58, 40];
const zones = { a: () => ZONE, grille: () => ZONE };
sim.avancer(2.5, zones);
await device.queue.onSubmittedWorkDone();
let t = 2.5;
const debut = performance.now();
for (let n = 0; n < 60; n++) { t += 1 / 30; sim.avancer(t, zones); await device.queue.onSubmittedWorkDone(); }
await envoyer({ webgpu: true, capture: (performance.now() - debut) / 60 });` }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`module de force : ${r.capture.toFixed(2)} ms de simulation par image (budget de P1 : < 5 ms)`);
  if (process.env.PM_PERF === '1') assert.ok(r.capture < 5, `simulation avec module : ${r.capture.toFixed(2)} ms par image`);
});

test('performances : composition 1080p (transition dissolution, grain, vignettage)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const donnees = ['dissolution', 'grain', 'vignettage'].map((n) => {
    const src = charger(n);
    return donneeShader(src, { usage: src.json.usage, valeurs: S.valeursShader(src.json, '', CHARTE).valeurs });
  });
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const sh = new P.Shaders(device);
const co = new P.Composition(device, gpu.format, sh);
const canvas = document.createElement('canvas');
canvas.width = 1920; canvas.height = 1080;
document.body.appendChild(canvas);
const cible = co.cible(canvas);
const [dissolution, grain, vignettage] = await Promise.all(DONNEES.map(async (d) => (await sh.compiler(d)).shader));
async function photo(couleur) {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 540;
  const x = c.getContext('2d');
  x.fillStyle = couleur; x.fillRect(0, 0, 960, 540);
  return createImageBitmap(c);
}
const a = co.photo('a', await photo('#c0392b'));
const b = co.photo('b', await photo('#2471a3'));
const L = 1920 / 1080 * 100;
const E = (temps, progres) => ({ temps, progres, duree: 1, mode: 1, resolution: [L, 100, 1920, 1080], scene: [L, 100, 1920, 1080] });
co.dessiner(cible, { couches: [{ vue: a, posts: [] }, { vue: b, posts: [] }], transition: { shader: dissolution, entrees: E(0, 0), sortante: 0, entrante: 1 }, postsVideo: [] });
await device.queue.onSubmittedWorkDone();
const debut = performance.now();
for (let n = 0; n < 60; n++) {
  const q = n / 60;
  co.dessiner(cible, { couches: [{ vue: a, posts: [] }, { vue: b, posts: [] }], transition: { shader: dissolution, entrees: E(q, q), sortante: 0, entrante: 1 },
    postsVideo: [{ shader: grain, entrees: E(q, q) }, { shader: vignettage, entrees: E(q, q) }] });
  await device.queue.onSubmittedWorkDone();
}
const duree = (performance.now() - debut) / 60;
const debutPhoto = performance.now();
for (let n = 0; n < 10; n++) co.photo('a', await photo('#c0392b'));
await device.queue.onSubmittedWorkDone();
await envoyer({ webgpu: true, duree, photo: (performance.now() - debutPhoto) / 10 });` }), { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  t.diagnostic(`composition 1080p : ${r.duree.toFixed(2)} ms par image (critère : < 8 ms sur un GPU)`);
  t.diagnostic(`envoi d'une photographie demi-résolution au GPU : ${r.photo.toFixed(2)} ms`);
  if (process.env.PM_PERF === '1') assert.ok(r.duree < 8, `composition : ${r.duree.toFixed(2)} ms par image`);
});
