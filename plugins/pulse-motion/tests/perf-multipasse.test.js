'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const S = require('../moteur/shaders/code.js');
const { chargeurShaders, donneeShader } = require('../scripts/lib/shaders.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const charger = chargeurShaders(dossierTemporaire('pm-mp-vide-'), path.join(__dirname, '..', 'shaders'));
const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'shaders/glsl.js', 'shaders/code.js', 'particules/glsl.js', 'particules/shaders.js'];

for (const nom of ['reaction-diffusion', 'ondes-glsl']) {
  test(`performances : ${nom} 1080p (seek de 10 s, puis une image de lecture)`, async (t) => {
    if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
    const src = charger(nom);
    const donnee = donneeShader(src, { usage: 'fond', valeurs: S.valeursShader(src.json, '', CHARTE).valeurs });
    const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: donnee, code: `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const sh = new P.Shaders(device);
const c = await sh.compiler(DONNEES);
if (!c.ok) { await envoyer({ erreur: c.message }); return; }
const o = (tau) => ({ tau, debut: 0, rythme: 1, fin: 20, largeurZone: 1600 / 9, hauteurZone: 100, hauteurSortie: 1080, son: () => null, textures: () => {} });
let debut = performance.now();
sh.avancerMultipasse(c.shader, o(10));
await device.queue.onSubmittedWorkDone();
const seek = performance.now() - debut;
let tau = 10;
debut = performance.now();
for (let n = 0; n < 60; n++) { tau += 1 / 30; sh.avancerMultipasse(c.shader, o(tau)); await device.queue.onSubmittedWorkDone(); }
await envoyer({ webgpu: true, seek, image: (performance.now() - debut) / 60 });` }), { delai: 300000 }));
    assert.equal(r.erreur, undefined, r.erreur);
    if (r.webgpu === false) return t.skip('WebGPU indisponible');
    t.diagnostic(`${nom} : seek de 10 s en ${r.seek.toFixed(0)} ms ; ${r.image.toFixed(2)} ms de tampons par image de lecture`);
    if (process.env.PM_PERF === '1') {
      assert.ok(r.seek < 3000, `seek de 10 s : ${r.seek.toFixed(0)} ms`);
      assert.ok(r.image < 8, `par image : ${r.image.toFixed(2)} ms`);
    }
  });
}
