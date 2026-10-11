/* Pulse Motion – rendu des particules d'un calque (WebGPU), version minimale.
 *
 * new P.Rendu(device, format)
 *   .cible(canvas)                 cible HDR (rgba16float), copie lisible (rgba8unorm) et contexte du canvas
 *   .dessiner(cible, liste, largeurCqh)   liste : [{ sim, i, delta }] dans l'ordre de dessin
 *   .lirePixels(cible)             -> Promise<{ largeur, hauteur, donnees }> (RVBA, alpha prémultiplié, sRGB)
 * Disque doux, mélange additif ou alpha ; passe finale : alpha = max(alpha, max(r, g, b)), encodage sRGB.
 * Navigateur seulement ; dépend de simulation.js (P.WGSL_COMMUN).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const WGSL_PARTICULES = P.WGSL_COMMUN + /* wgsl */ `
struct Calque { largeur: f32, hauteur: f32, delta: f32, a: f32 };
@group(0) @binding(0) var<storage, read> particules: array<Particule>;
@group(0) @binding(1) var<storage, read> T: array<f32>;
@group(0) @binding(2) var<uniform> C: Calque;

struct Sortie { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) couleur: vec4f };

fn table(debut: u32, u: f32) -> f32 {
  let x = clamp(u, 0.0, 1.0) * 63.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 63u);
  return mix(T[debut + i], T[debut + j], x - f32(i));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Sortie {
  var o: Sortie;
  let p = particules[ii];
  if (p.vivante == 0u) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let u = p.age / p.vie;
  let x = clamp(u, 0.0, 1.0) * 63.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 63u);
  let c0 = vec4f(T[i * 4u], T[i * 4u + 1u], T[i * 4u + 2u], T[i * 4u + 3u]);
  let c1 = vec4f(T[j * 4u], T[j * 4u + 1u], T[j * 4u + 2u], T[j * 4u + 3u]);
  let teinte = mix(c0, c1, x - f32(i));
  let taille = p.taille * table(256u, u);
  var coins = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = coins[vi];
  let centre = vec2f(C.largeur * 0.5, C.hauteur * 0.5);
  let f = 1.0 + 0.35 * p.z;
  let pos = centre + (p.pos + p.vel * C.delta - centre) * f;
  let rot = p.rot + p.vrot * C.delta;
  let q = vec2f(cos(rot) * c.x - sin(rot) * c.y, sin(rot) * c.x + cos(rot) * c.y) * taille * f * 0.5;
  let w = pos + q;
  o.pos = vec4f(w.x / C.largeur * 2.0 - 1.0, 1.0 - w.y / C.hauteur * 2.0, 0.0, 1.0);
  o.uv = c;
  o.couleur = vec4f(teinte.rgb * table(320u, u), teinte.a * table(384u, u));
  return o;
}

@fragment
fn fs(e: Sortie) -> @location(0) vec4f {
  let r = length(e.uv);
  let a = e.couleur.a * (1.0 - smoothstep(0.0, 1.0, r));
  return vec4f(e.couleur.rgb * a, a);
}
`;

  const WGSL_FINAL = /* wgsl */ `
@group(0) @binding(0) var hdr: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn versSRGB(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

struct Sorties { @location(0) ecran: vec4f, @location(1) copie: vec4f };

@fragment
fn fs(@builtin(position) pos: vec4f) -> Sorties {
  let c = textureLoad(hdr, vec2i(pos.xy), 0);
  let rgb = max(c.rgb, vec3f(0.0));
  let a = clamp(max(c.a, max(rgb.r, max(rgb.g, rgb.b))), 0.0, 1.0);
  var o = vec4f(0.0);
  if (a > 0.0) { o = vec4f(versSRGB(min(rgb / a, vec3f(1.0))) * a, a); }
  return Sorties(o, o);
}
`;

  const MELANGES = {
    additif: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } },
    alpha: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } },
  };

  class Rendu {
    constructor(device, format) {
      this.device = device;
      this.format = format;
      const V = GPUShaderStage.VERTEX;
      this.layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: V, buffer: { type: 'uniform' } },
        ],
      });
      const module = device.createShaderModule({ label: 'pm-particules', code: WGSL_PARTICULES });
      const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      this.pipelines = {};
      Object.keys(MELANGES).forEach((nom) => {
        this.pipelines[nom] = device.createRenderPipeline({
          layout,
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: MELANGES[nom] }] },
          primitive: { topology: 'triangle-list' },
        });
      });
      const final = device.createShaderModule({ label: 'pm-final', code: WGSL_FINAL });
      this.final = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: final, entryPoint: 'vs' },
        fragment: { module: final, entryPoint: 'fs', targets: [{ format }, { format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      });
      this.groupes = new WeakMap();
    }

    cible(canvas) {
      const { device } = this;
      const largeur = canvas.width;
      const hauteur = canvas.height;
      let c = canvas.__pmCible;
      if (c && c.device === device && c.largeur === largeur && c.hauteur === hauteur) return c;
      if (c && c.device === device) { c.hdr.destroy(); c.sortie.destroy(); }
      const contexte = canvas.getContext('webgpu');
      contexte.configure({ device, format: this.format, alphaMode: 'premultiplied' });
      const U = GPUTextureUsage;
      const hdr = device.createTexture({ size: [largeur, hauteur], format: 'rgba16float', usage: U.RENDER_ATTACHMENT | U.TEXTURE_BINDING });
      const sortie = device.createTexture({ size: [largeur, hauteur], format: 'rgba8unorm', usage: U.RENDER_ATTACHMENT | U.COPY_SRC | U.TEXTURE_BINDING });
      c = {
        device, contexte, largeur, hauteur, hdr, sortie,
        groupeFinal: device.createBindGroup({ layout: this.final.getBindGroupLayout(0), entries: [{ binding: 0, resource: hdr.createView() }] }),
      };
      canvas.__pmCible = c;
      return c;
    }

    groupe(e) {
      let g = this.groupes.get(e);
      if (!g) {
        g = this.device.createBindGroup({
          layout: this.layout,
          entries: [
            { binding: 0, resource: { buffer: e.particules } },
            { binding: 1, resource: { buffer: e.tables } },
            { binding: 2, resource: { buffer: e.uniformeRendu } },
          ],
        });
        this.groupes.set(e, g);
      }
      return g;
    }

    dessiner(cible, liste, largeurCqh) {
      const { device } = this;
      const enc = device.createCommandEncoder();
      const passe = enc.beginRenderPass({
        colorAttachments: [{ view: cible.hdr.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      });
      for (const { sim, i, delta } of liste) {
        const e = sim.emetteurs[i];
        device.queue.writeBuffer(e.uniformeRendu, 0, new Float32Array([largeurCqh, 100, delta, 0]));
        passe.setPipeline(this.pipelines[e.em.rendu.melange === 'additif' ? 'additif' : 'alpha']);
        passe.setBindGroup(0, this.groupe(e));
        passe.draw(6, e.capacite);
      }
      passe.end();
      const fin = enc.beginRenderPass({
        colorAttachments: [
          { view: cible.contexte.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
          { view: cible.sortie.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
        ],
      });
      fin.setPipeline(this.final);
      fin.setBindGroup(0, cible.groupeFinal);
      fin.draw(3);
      fin.end();
      device.queue.submit([enc.finish()]);
    }

    async lirePixels(cible) {
      const { device } = this;
      const { largeur, hauteur } = cible;
      const ligne = Math.ceil(largeur * 4 / 256) * 256;
      const tampon = device.createBuffer({ size: ligne * hauteur, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: cible.sortie }, { buffer: tampon, bytesPerRow: ligne }, [largeur, hauteur]);
      device.queue.submit([enc.finish()]);
      await tampon.mapAsync(GPUMapMode.READ);
      const brut = new Uint8Array(tampon.getMappedRange());
      const donnees = new Uint8Array(largeur * hauteur * 4);
      for (let y = 0; y < hauteur; y++) donnees.set(brut.subarray(y * ligne, y * ligne + largeur * 4), y * largeur * 4);
      tampon.unmap();
      tampon.destroy();
      return { largeur, hauteur, donnees };
    }
  }

  P.Rendu = Rendu;
})(typeof globalThis !== 'undefined' ? globalThis : this);
