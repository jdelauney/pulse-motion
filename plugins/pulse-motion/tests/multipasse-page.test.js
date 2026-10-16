'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const PROPRES = {
  'compteur.json': { version: 1, nom: 'compteur', usage: 'fond', passes: [{ nom: 'A', lit: ['A'], echelle: 0.25 }, { nom: 'image', lit: ['A'] }], pas_par_seconde: 60 },
  'compteur.wgsl': '// Compteur de pas.\nfn passeA(coord: vec2f) -> vec4f {\n  return vec4f(f32(iFrame + 1) / 1000.0, 0.0, 0.0, 1.0);\n}\nfn image(coord: vec2f) -> vec4f {\n  return vec4f(canal0(coord / iResolution.xy).r * 10.0, 0.0, 0.0, 1.0);\n}\n',
  'casse-b.json': { version: 1, nom: 'casse-b', usage: 'fond', passes: [{ nom: 'A' }, { nom: 'image', lit: ['A'] }] },
  'casse-b.wgsl': '// Passe A fausse.\nfn passeA(coord: vec2f) -> vec4f {\n  let x: f32 = vec2f(1.0);\n  return vec4f(x);\n}\nfn image(coord: vec2f) -> vec4f {\n  return canal0(coord / iResolution.xy);\n}\n',
};

function page({ balise, script }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes = [{ id: 'a', fichier: 'scenes/a.html', duree: 6, textes: {} }]; });
  for (const [f, c] of Object.entries(PROPRES)) ecrire(dir, `shaders/${f}`, c);
  ecrire(dir, 'scenes/a.html', `<section data-scene="a">${balise}</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  return a.html.replace('</body>', `<script>
(async () => {
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
const px = (p, x, y) => Array.from(p.donnees.slice((y * p.largeur + x) * 4, (y * p.largeur + x) * 4 + 4));
const image = async (t) => { await M.seek(t); return Array.from((await M.particules.lirePixels('a', 'arriere')).donnees); };
const egal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
try {
  await M.pret;
  await M.particules.pret;
  if (!M.particules.disponible) { await envoyer({ webgpu: false }); return; }
${script}
} catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}
async function executer(o) {
  const r = JSON.parse(await executerPage(page(o), { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('multipasse : état ⌊τ × pas par seconde⌋, quel que soit l\'affichage', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ balise: '<div data-shader="compteur"></div>', script: `
await M.seek(1); const un = await M.particules.lirePixels('a', 'arriere');
await M.seek(0.5); const demi = await M.particules.lirePixels('a', 'arriere');
await envoyer({ un: px(un, 10, 10), demi: px(demi, 10, 10), erreurs: M.shaders.erreurs() });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.erreurs, []);
  // 60 pas à τ = 1 : 0,060 × 10 = 0,6 linéaire -> 203 en sRGB ; 30 pas à τ = 0,5 : 0,3 -> 149.
  assert.ok(Math.abs(r.un[0] - 203) <= 2, `τ = 1 : ${r.un}`);
  assert.ok(Math.abs(r.demi[0] - 149) <= 2, `τ = 0,5 : ${r.demi}`);
});

test('réaction-diffusion (WGSL) : même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ balise: '<div data-shader="reaction-diffusion"></div>', script: `
const direct = await image(2.5);
await image(0.4); await image(3.6); await image(1.2);
const detour = await image(2.5);
await envoyer({ egal: egal(direct, detour), varie: new Set(direct.filter((x, i) => i % 4 === 1)).size, erreurs: M.shaders.erreurs() });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.egal, true, 'même image par deux chemins');
  assert.ok(r.varie > 2, 'des motifs se sont formés');
});

test('ondes (GLSL) : même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ balise: '<div data-shader="ondes-glsl"></div>', script: `
const direct = await image(3.3);
await image(5.1); await image(0.7);
const detour = await image(3.3);
await envoyer({ egal: egal(direct, detour), erreurs: M.shaders.erreurs() });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.egal, true, 'même image par deux chemins');
});

test('multipasse : une passe qui ne compile pas -> panneau, export refusé', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ balise: '<div data-shader="casse-b"></div>', script: `
await M.seek(1);
const panneau = document.querySelector('[data-shader] .pm-effet-panneau');
let refus = null;
M.modeCapture(true);
try { await M.particules.preparerCapture(); } catch (e) { refus = e.message; }
M.modeCapture(false);
await envoyer({ panneau: panneau && panneau.textContent, refus });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.match(r.panneau, /Shader « casse-b » \(shaders\/casse-b\.wgsl\) ne compile pas : ligne 3/);
  assert.match(r.refus, /ne compile pas/);
});
