'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js', 'particules/voisinage.js',
  'particules/maillage.js', 'particules/structures.js', 'particules/milieu.js', 'particules/rendu.js'];

const compiler = (recette) => {
  const r = R.compiler({ version: 1, nom: 'perf', ...recette }, { dur: 8, graine: 1, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
};
// Grille de 256 × 144 (résolution 256 sur une scène 16:9) : panache chaud au pied de la scène.
const MILIEU = compiler({ milieu: { resolution: 256, sources: [{ type: 'fumee', forme: { type: 'rectangle', largeur: 40, hauteur: 4, decalage: [0, 40] }, debit: 4, temperature: 1 }] } });
// 100 000 particules couplées (force « milieu »), nées en une salve sur toute la scène.
const PARTICULES = compiler({ emetteurs: [{ nom: 'p', naissance: { salves: [{ t: 0, nombre: 100000 }], vie: [8, 8], taille: [0.2, 0.2] },
  forces: [{ type: 'gravite', valeur: 5 }, { type: 'milieu', coef: 2 }], rendu: { type: 'sprite', melange: 'additif' } }] });

const CODE = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = 1600 / 9;
const ZONE = [0, 0, L, 100];
const milieu = new P.Milieu(device, DONNEES.milieu, ZONE, null, 8);
const sim = new P.Simulation(device, DONNEES.particules, null, null, L, milieu);
const groupe = new P.Couplage(device, [{ membre: sim, debut: 0 }, { membre: milieu, debut: 0 }]);
const zones = [{ a: () => ZONE, grille: () => ZONE }, { reperes: () => new Float32Array(0) }];
const canvas = document.createElement('canvas');
canvas.width = 1920;
canvas.height = 1080;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
sim.emetteurs.forEach((e) => rendu.preparerEmetteur(e));
groupe.avancer(0.5, zones);
await device.queue.onSubmittedWorkDone();
let t = 0.5;
// Simulation seule : 30 images de capture (4 pas chacune).
let debut = performance.now();
for (let n = 0; n < 30; n++) {
  t += 1 / 30;
  groupe.avancer(t, zones);
  await device.queue.onSubmittedWorkDone();
}
const ms = (performance.now() - debut) / 30;
// Image complète en 1080p : simulation, particules et milieu dessinés.
debut = performance.now();
for (let n = 0; n < 30; n++) {
  t += 1 / 30;
  const r = groupe.avancer(t, zones);
  rendu.dessiner(cible, r[0].map((delta, i) => ({ sim, i, delta })), { largeurCqh: L, dureeImage: 1 / 30, bloom: 0.6, seuil: 1, tons: 'douce', milieu });
  await device.queue.onSubmittedWorkDone();
}
const msImage = (performance.now() - debut) / 30;
const g = milieu.grille;
groupe.detruire();
rendu.oublier(sim);
rendu.oublierMilieu(milieu);
sim.detruire();
milieu.detruire();
const info = gpu.adaptateur && gpu.adaptateur.info ? gpu.adaptateur.info : {};
await envoyer({ webgpu: true, ms, msImage, nx: g.nx, ny: g.ny, adaptateur: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') });
`;

test('performances : grille de 256 × 144 et 100 000 particules couplées en moins de 6 ms de simulation par image ; 30 im/s en 1080p', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: { milieu: MILIEU, particules: PARTICULES }, code: CODE }), { delai: 600000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual([r.nx, r.ny], [256, 144]);
  t.diagnostic(`adaptateur : ${r.adaptateur || 'inconnu'}`);
  t.diagnostic(`grille ${r.nx} × ${r.ny} et 100 000 particules couplées : ${r.ms.toFixed(2)} ms de simulation par image (spec : < 6 ms)`);
  t.diagnostic(`image complète 1080p (simulation, particules, milieu) : ${r.msImage.toFixed(2)} ms (30 im/s : < 33 ms)`);
  if (process.env.PM_PERF === '1') {
    assert.ok(r.ms < 6, `simulation : ${r.ms.toFixed(2)} ms par image`);
    assert.ok(r.msImage < 33, `image 1080p : ${r.msImage.toFixed(2)} ms`);
  }
});
