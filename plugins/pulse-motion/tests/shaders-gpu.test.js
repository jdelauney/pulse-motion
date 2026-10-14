'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'shaders/code.js', 'particules/shaders.js'];

/** Cible rgba16float de 160 × 90 (0,9 px par cqh), lecture des demi-flottants, dessin d'un shader. */
const COMMUN = `
const P = M.particulesInterne;
const S = M.codeShader;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const sh = new P.Shaders(device);
const L = 160;
const H = 90;
const LCQH = L / H * 100;
const cible = device.createTexture({ size: [L, H], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
function demi(h) {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}
async function dessiner(shader, entrees, canaux = null, genre = 'fond') {
  const enc = device.createCommandEncoder();
  const p = enc.beginRenderPass({ colorAttachments: [{ view: cible.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
  sh.dessiner(p, shader, entrees, canaux, genre);
  p.end();
  const ligne = Math.ceil(L * 8 / 256) * 256;
  const tampon = device.createBuffer({ size: ligne * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  enc.copyTextureToBuffer({ texture: cible }, { buffer: tampon, bytesPerRow: ligne }, [L, H]);
  device.queue.submit([enc.finish()]);
  await tampon.mapAsync(GPUMapMode.READ);
  const brut = new Uint16Array(tampon.getMappedRange());
  const px = new Float32Array(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L * 4; x++) px[y * L * 4 + x] = demi(brut[y * ligne / 2 + x]);
  tampon.unmap();
  tampon.destroy();
  const lire = (x, y) => Array.from(px.slice((y * L + x) * 4, (y * L + x) * 4 + 4)).map((v) => Math.round(v * 1000) / 1000);
  lire.tout = px;
  return lire;
}
const donnee = (code, o = {}) => Object.assign({ nom: 'essai', fichier: 'shaders/essai.wgsl', usage: 'fond', code, parametres: {}, valeurs: {}, image: null, debord: 0 }, o);
const PLEIN = (o = {}) => Object.assign({ temps: 0, progres: 0, duree: 1, mode: 1, resolution: [LCQH, 100, L, H], scene: [LCQH, 100, L, H] }, o);
`;

async function page(code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, code: COMMUN + code })));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('shaders : compile et dessine un fond plein cadre ; réglages et iTime', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page(`
const c = await sh.compiler(donnee('fn image(coord: vec2f) -> vec4f {\\n  return vec4f(coord.x / iResolution.x, R.niveau, fract(iTime), 1.0);\\n}\\n',
  { parametres: { niveau: { defaut: 0.25, min: 0, max: 1 } }, valeurs: { niveau: 0.25 } }));
if (!c.ok) { await envoyer({ webgpu: true, compile: c.message }); return; }
const lire = await dessiner(c.shader, PLEIN({ temps: 1.3 }));
sh.regler(c.shader, { niveau: 0.75 });
const lire2 = await dessiner(c.shader, PLEIN({ temps: 1.3 }));
await envoyer({ webgpu: true, gauche: lire(0, 45), droite: lire(159, 45), regle: lire2(80, 45), bruit: typeof P.WGSL_BRUIT, fbm: /fn fbm\\(/.test(S.OUTILS) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.compile, undefined, r.compile);
  assert.ok(r.gauche[0] < 0.01 && r.droite[0] > 0.99, `${r.gauche} ${r.droite}`);
  assert.ok(Math.abs(r.gauche[1] - 0.25) < 0.002 && Math.abs(r.gauche[2] - 0.3) < 0.002 && r.gauche[3] === 1, `${r.gauche}`);
  assert.ok(Math.abs(r.regle[1] - 0.75) < 0.002, `réglage réécrit : ${r.regle}`);
  assert.equal(r.bruit, 'string');
});

test('shaders : erreur de compilation située dans le fichier', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page(`
const faux = await sh.compiler(donnee('fn image(coord: vec2f) -> vec4f {\\n  let x: f32 = vec2f(1.0);\\n  return vec4f(x);\\n}\\n'));
const nom = await sh.compiler(donnee('fn bruit(p: vec3f) -> f32 { return 0.0; }\\nfn image(coord: vec2f) -> vec4f { return vec4f(0.0); }\\n'));
await envoyer({ webgpu: true, faux: { ok: faux.ok, erreurs: faux.erreurs, message: faux.message }, nom: { ok: nom.ok, message: nom.message } });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.faux.ok, false);
  assert.equal(r.faux.erreurs[0].ligne, 2);
  assert.ok(r.faux.erreurs[0].colonne >= 1);
  assert.match(r.faux.message, /^Shader « essai » \(shaders\/essai\.wgsl\) ne compile pas : ligne 2, colonne \d+ : /);
  assert.equal(r.nom.ok, false, 'redéfinir une fonction du prélude ne compile pas');
  assert.match(r.nom.message, /ne compile pas/);
});
