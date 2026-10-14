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

test('shaders : mode 0 sur un repère tourné (quad, coord depuis le coin de la boîte, débord)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page(`
const c = await sh.compiler(donnee([
  'fn image(coord: vec2f) -> vec4f {',
  '  if (coord.x < 0.0 || coord.y < 0.0 || coord.x > iResolution.x || coord.y > iResolution.y) { return vec4f(0.0, 0.0, 1.0, 1.0); }',
  '  return vec4f(coord.x / iResolution.x, coord.y / iResolution.y, 0.0, 1.0);',
  '}'].join('\\n')));
// Boîte de 40 × 20 cqh tournée de 90°, centrée en (88,9 ; 50) cqh = (80 ; 45) px, débord de 5 cqh.
const lire = await dessiner(c.shader, { temps: 0, progres: 0, duree: 1, mode: 0, resolution: [40, 20, 36, 18], scene: [LCQH, 100, L, H],
  repere: [80 / 0.9, 50, Math.PI / 2, 5], demi: [20, 10, 0, 0] });
await envoyer({ webgpu: true, centre: lire(80, 45), basBoite: lire(80, 62), deborde: lire(91, 45), dehors: lire(95, 45), coin: lire(5, 5) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const proche = (a, b, tol, quoi) => assert.ok(Math.abs(a - b) <= tol, `${quoi} : ${a} au lieu de ${b}`);
  // Centre : coord = (20,6 ; 9,4) cqh -> (0,51 ; 0,47).
  proche(r.centre[0], 0.514, 0.03, 'centre x'); proche(r.centre[1], 0.472, 0.03, 'centre y');
  // 17,5 px plus bas = +19,4 cqh le long de l'axe x local (rotation de 90°) : coord.x proche de la largeur.
  proche(r.basBoite[0], 0.986, 0.03, 'bas de la boîte'); proche(r.basBoite[1], 0.47, 0.03, 'bas de la boîte, y');
  assert.deepEqual(r.deborde, [0, 0, 1, 1], 'dans le débord (coord.y < 0)');
  assert.deepEqual(r.dehors, [0, 0, 0, 0], 'au-delà du débord : rien');
  assert.deepEqual(r.coin, [0, 0, 0, 0]);
});

test('shaders : même image par deux chemins (iTime, fbm, bruit)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page(`
const c = await sh.compiler(donnee('fn image(coord: vec2f) -> vec4f {\\n  let n = fbm(vec3f(coord * 0.05, iTime));\\n  let b = canal3(coord / 64.0);\\n  return vec4f(0.5 + 0.5 * n, b.r, b.g, 1.0);\\n}\\n'));
const a = (await dessiner(c.shader, PLEIN({ temps: 1.3 }))).tout.slice();
const b = (await dessiner(c.shader, PLEIN({ temps: 0.2 }))).tout.slice();
const a2 = (await dessiner(c.shader, PLEIN({ temps: 1.3 }))).tout.slice();
let ecartAA = 0;
let ecartAB = 0;
for (let i = 0; i < a.length; i++) { ecartAA = Math.max(ecartAA, Math.abs(a[i] - a2[i])); ecartAB = Math.max(ecartAB, Math.abs(a[i] - b[i])); }
await envoyer({ webgpu: true, ecartAA, ecartAB });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.ecartAA, 0, 'même instant, même image');
  assert.ok(r.ecartAB > 0.01, 'un autre instant change l\'image');
});

test('canaux : image de assets/ en iChannel2, bruit fixe en iChannel3, iChannel0 donné par l\'appelant', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page(`
// Image de 2 × 1 : rouge à gauche, bleu à droite.
const c2 = document.createElement('canvas');
c2.width = 2; c2.height = 1;
const ctx = c2.getContext('2d');
ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1, 1);
ctx.fillStyle = '#0000ff'; ctx.fillRect(1, 0, 1, 1);
const img = await sh.compiler(donnee('fn image(coord: vec2f) -> vec4f { return canal2(coord / iResolution.xy); }', { image: c2.toDataURL('image/png') }));
const lImg = await dessiner(img.shader, PLEIN());
const brt = await sh.compiler(donnee('fn image(coord: vec2f) -> vec4f { return canal3(vec2f(0.5, 0.5) / 256.0); }'));
const lBrt = await dessiner(brt.shader, PLEIN());
const tex = P.texelsBruit();
// iChannel0 : une texture de l'appelant (vert opaque).
const verte = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
device.queue.writeTexture({ texture: verte }, new Uint8Array([0, 255, 0, 255]), { bytesPerRow: 4 }, [1, 1]);
const post = await sh.compiler(donnee('fn post(coord: vec2f) -> vec4f { return canal0(coord / iResolution.xy) + canal1(vec2f(0.5)); }', { usage: 'post' }));
const lPost = await dessiner(post.shader, PLEIN(), [verte.createView(), null, null], 'composition');
await envoyer({ webgpu: true, gauche: lImg(10, 45), droite: lImg(150, 45), bruit: lBrt(80, 45), attendu: Array.from(tex.slice(0, 4)).map((x) => Math.round(x / 255 * 1000) / 1000),
  bruit2: Array.from(P.texelsBruit().slice(0, 16)), bruit1: Array.from(tex.slice(0, 16)), post: lPost(80, 45) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.gauche.map((x) => Math.round(x * 100) / 100), [1, 0, 0, 1], 'rouge pur lu en linéaire');
  assert.deepEqual(r.droite.map((x) => Math.round(x * 100) / 100), [0, 0, 1, 1]);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(r.bruit[i] - r.attendu[i]) < 0.003, `bruit ${r.bruit} / ${r.attendu}`);
  assert.deepEqual(r.bruit2, r.bruit1, 'même texture de bruit à chaque calcul');
  assert.deepEqual(r.post.map((x) => Math.round(x * 100) / 100), [0, 1, 0, 1], 'iChannel0 de l\'appelant, iChannel1 transparent');
});
