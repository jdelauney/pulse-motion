'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js', 'particules/voisinage.js', 'particules/rendu.js'];

// Image de 3 × 1 : rouge à 50 %, blanc à 50 %, orange opaque (200, 100, 50). Chaque copie d'image du moteur est relue texel
// par texel (textureLoad) dans une cible rgba8unorm-srgb : on y lit sRGB(linéaire prémultiplié lu), soit sRGB(linéaire(c)·a).
const CODE = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const c = document.createElement('canvas');
c.width = 3;
c.height = 1;
const ctx = c.getContext('2d');
ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; ctx.fillRect(0, 0, 1, 1);
ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.fillRect(1, 0, 1, 1);
ctx.fillStyle = 'rgb(200, 100, 50)'; ctx.fillRect(2, 0, 1, 1);
const url = c.toDataURL('image/png');
const bitmap = () => createImageBitmap(c);

const module = device.createShaderModule({ code: \`
@group(0) @binding(0) var t: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f { return textureLoad(t, vec2i(pos.xy), 0); }\` });
const pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb' }] } });
async function lire(vue) {
  const T = GPUTextureUsage;
  const cible = device.createTexture({ size: [3, 1], format: 'rgba8unorm-srgb', usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
  const tampon = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  const p = enc.beginRenderPass({ colorAttachments: [{ view: cible.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
  p.setPipeline(pipeline);
  p.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: vue }] }));
  p.draw(3);
  p.end();
  enc.copyTextureToBuffer({ texture: cible }, { buffer: tampon, bytesPerRow: 256 }, [3, 1]);
  device.queue.submit([enc.finish()]);
  await tampon.mapAsync(GPUMapMode.READ);
  const d = Array.from(new Uint8Array(tampon.getMappedRange()).slice(0, 12));
  tampon.unmap();
  return [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12)];
}

const rendu = new P.Rendu(device, gpu.format);
const illisibles = await rendu.preparer([{ emetteurs: [{ rendu: { textureImage: url } }] }]);
const r = {};
r.assets = await lire(rendu.images.get(url));
r.refraction = await lire(rendu.photo('refraction|s', await bitmap()));
r.refraction2 = await lire(rendu.photo('refraction|s', await bitmap()));
rendu.oublierPhoto('refraction|s');
const photo = P.creerPhoto(device, await bitmap());
r.ancre = await lire(photo.vue);
photo.texture.destroy();
await envoyer({ webgpu: true, illisibles: illisibles.size, copies: r });
`;

const ecarts = (a, b, tol, quoi) => (a.some((x, i) => Math.abs(x - b[i]) > tol) ? [`${quoi} : ${a} au lieu de ${b}`] : []);

test('copies d\'images du rendu et de la simulation : rouge et blanc à 50 % justes (linéaire prémultiplié), opaque inchangé', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, code: CODE }), { delai: 120000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.illisibles, 0);
  // Linéaire prémultiplié : rouge 50 % -> (0,5, 0, 0, 0,5), relu en sRGB (188, 0, 0, 128) ; une prémultiplication dans
  // l'espace encodé donnerait (128, 0, 0, 128) (bords assombris).
  const quoi = { assets: 'images de assets/ (textures des particules)', refraction: 'photographie de réfraction (fluides)', refraction2: 'photographie de réfraction réutilisée',
    ancre: 'photographie d\'ancre (éclats, tissus photographiés)' };
  const fautes = Object.entries(r.copies).flatMap(([cle, [rouge, blanc, opaque]]) => [
    ...ecarts(rouge, [188, 0, 0, 128], 3, `${quoi[cle]} : rouge à 50 %`),
    ...ecarts(blanc, [188, 188, 188, 128], 3, `${quoi[cle]} : blanc à 50 %`),
    ...ecarts(opaque, [200, 100, 50, 255], 0, `${quoi[cle]} : pixel opaque`)]);
  assert.deepEqual(fautes, []);
});
