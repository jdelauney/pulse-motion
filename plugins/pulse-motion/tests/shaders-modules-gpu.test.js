'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const S = require('../moteur/shaders/code.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js', 'particules/rendu.js', 'shaders/code.js'];
const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const SOURCES = {
  'pousse-x': { fichier: 'shaders/pousse-x.wgsl', json: { version: 1, nom: 'pousse-x', usage: 'module-force', parametres: { ax: { defaut: 10, min: -100, max: 100 } } },
    code: '// Poussée constante vers la droite.\nfn force(p: Particule, t: f32, zone: vec4f) -> vec2f {\n  return vec2f(R.ax, 0.0);\n}\n' },
  'casse-f': { fichier: 'shaders/casse-f.wgsl', json: { version: 1, nom: 'casse-f', usage: 'module-force' },
    code: 'fn force(p: Particule, t: f32, zone: vec4f) -> vec2f {\n  let x: f32 = vec2f(1.0);\n  return vec2f(x);\n}\n' },
  vert: { fichier: 'shaders/vert.wgsl', json: { version: 1, nom: 'vert', usage: 'module-couleur' },
    code: 'fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f { return vec4f(0.0, 1.0, 0.0, 1.0); }\n' },
  carre: { fichier: 'shaders/carre.wgsl', json: { version: 1, nom: 'carre', usage: 'module-forme' },
    code: 'fn forme(uv: vec2f, p: Particule) -> f32 { return select(0.0, 1.0, max(abs(uv.x), abs(uv.y)) < 0.5); }\n' },
  'rouge-casse': { fichier: 'shaders/rouge-casse.wgsl', json: { version: 1, nom: 'rouge-casse', usage: 'module-couleur' },
    code: 'fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f {\n  return vec3f(1.0);\n}\n' },
};

/** Effet compilé (Node) avec ses modules attachés. */
function effet(emetteurs, rendu_calque = { bloom: 0, tons: 'neutre' }) {
  const r = R.compiler({ version: 1, nom: 'essai', rendu_calque, emetteurs }, { dur: 1, graine: 3, charte: CHARTE });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.deepEqual(S.attacherModules(r.effet, (n) => SOURCES[n] || null, CHARTE), []);
  return r.effet;
}
const UN = { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vitesse: { valeur: 0 }, vie: [3, 3], taille: [20, 20] };

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const ZONE = [78.85, 40, 20, 20];
const zones = { a: () => ZONE, grille: () => ZONE };
const vivantes = (f) => { const u = new Uint32Array(f.buffer); const l = []; for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push([f[s * 16], f[s * 16 + 1]]); return l; };
` + code })));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('module de force : dévie les particules comme prévu (x = ½ a t²), pas pour un autre émetteur', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const fx = effet([
    { nom: 'pousse', naissance: UN, modules: { force: 'pousse-x' } },
    { nom: 'libre', naissance: UN },
  ]);
  assert.equal(fx.emetteurs[0].voieRapide, false);
  const r = await page({ fx }, `
const sim = new P.Simulation(device, DONNEES.fx, null, null);
sim.avancer(1, zones);
const pousse = vivantes(await sim.lireEtat(0));
const libre = vivantes(await sim.lireEtat(1));
const rapides = sim.emetteurs.map((e) => e.rapide);
sim.detruire();
await envoyer({ webgpu: true, pousse, libre, rapides });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.rapides, [false, true]);
  assert.equal(r.pousse.length, 1);
  assert.ok(Math.abs(r.pousse[0][0] - (88.85 + 5)) < 0.05, `x = ${r.pousse[0][0]} (attendu 93,85 : ½ × 10 × 1²)`);
  assert.ok(Math.abs(r.pousse[0][1] - 50) < 1e-3);
  assert.ok(Math.abs(r.libre[0][0] - 88.85) < 1e-3, 'l\'autre émetteur n\'est pas poussé');
});

test('module de force : erreurs situées dans le fichier du module', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const fx = effet([{ nom: 'e', naissance: UN, modules: { force: 'casse-f' } }]);
  const r = await page({ force: fx.emetteurs[0].modulesWGSL.force, juste: effet([{ nom: 'e', naissance: UN, modules: { force: 'pousse-x' } }]).emetteurs[0].modulesWGSL.force }, `
await envoyer({ webgpu: true, erreurs: await P.verifierForce(device, DONNEES.force), juste: await P.verifierForce(device, DONNEES.juste) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.erreurs[0].ligne, 2);
  assert.ok(r.erreurs[0].colonne >= 1);
  assert.deepEqual(r.juste, []);
});
