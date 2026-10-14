/* Pulse Motion – canvas de composition (P6) : transitions et post-traitements par shader.
 *
 * new P.Composition(device, format, shaders)       shaders : P.Shaders du même device
 *   .cible(canvas) -> cible       contexte WebGPU du canvas, 4 textures de travail rgba16float (taille du canvas), copie lisible
 *   .oublierCible(canvas)
 *   .photo(id, bitmap) -> vue     photographie d'une scène en texture rgba8unorm-srgb prémultipliée (lue en linéaire), gardée
 *                                 par scène et réutilisée tant que sa taille ne change pas
 *   .oublierPhotos(garder)        libère les photographies des scènes absentes de garder (Set d'id)
 *   .dessiner(cible, e)           e : { couches: [{ vue, posts: [{ shader, entrees }] }], transition: { shader, entrees,
 *                                 sortante (rang | -1), entrante } | null, postsVideo: [{ shader, entrees }] } :
 *                                 chaque couche passe par ses post-traitements ; puis la transition (iChannel0 = sortante ou
 *                                 transparent, iChannel1 = entrante) ou l'empilement des couches dans l'ordre (prémultiplié) ;
 *                                 puis les post-traitements de la vidéo ; enfin sRGB prémultiplié dans le canvas et la copie.
 *   .lirePixels(cible) -> Promise<{ largeur, hauteur, donnees }>   (RVBA 8 bits, prémultiplié, sRGB)
 * Navigateur seulement ; dépend de shaders.js (P.Shaders).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};
  const TRAVAIL = 4;
  const PAR_DESSUS = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };

  const WGSL = /* wgsl */ `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var lisse: sampler;

struct Sortie { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vsPlein(@builtin(vertex_index) i: u32) -> Sortie {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: Sortie;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f((p[i].x + 1.0) * 0.5, (1.0 - p[i].y) * 0.5);
  return o;
}

@fragment
fn fsCopier(e: Sortie) -> @location(0) vec4f { return textureSampleLevel(source, lisse, e.uv, 0.0); }

fn versSRGB(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

struct Sorties { @location(0) ecran: vec4f, @location(1) copie: vec4f };

// Linéaire prémultiplié -> sRGB prémultiplié (sans tramage : les photographies exactes sont rendues à l'identique).
@fragment
fn fsFinal(e: Sortie) -> Sorties {
  let c = textureLoad(source, vec2i(e.pos.xy), 0);
  let a = clamp(c.a, 0.0, 1.0);
  var o = vec4f(0.0);
  if (a > 0.5 / 255.0) {
    o = vec4f(clamp(versSRGB(max(c.rgb, vec3f(0.0)) / a), vec3f(0.0), vec3f(1.0)) * a, a);
  }
  return Sorties(o, o);
}
`;

  function detruire(c) {
    c.travail.forEach((t) => t.texture.destroy());
    c.sortie.destroy();
  }

  class Composition {
    constructor(device, format, shaders) {
      this.device = device;
      this.format = format;
      this.shaders = shaders;
      const module = device.createShaderModule({ label: 'pm-composition', code: WGSL });
      const F = GPUShaderStage.FRAGMENT;
      this.layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: F, texture: { sampleType: 'float' } },
          { binding: 1, visibility: F, sampler: { type: 'filtering' } },
        ],
      });
      const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      this.pipelineCopier = device.createRenderPipeline({
        layout, vertex: { module, entryPoint: 'vsPlein' },
        fragment: { module, entryPoint: 'fsCopier', targets: [{ format: 'rgba16float', blend: PAR_DESSUS }] },
      });
      this.pipelineFinal = device.createRenderPipeline({
        layout, vertex: { module, entryPoint: 'vsPlein' },
        fragment: { module, entryPoint: 'fsFinal', targets: [{ format }, { format: 'rgba8unorm' }] },
      });
      this.lisse = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      this.photos = new Map();
    }

    cible(canvas) {
      const { device } = this;
      const largeur = canvas.width;
      const hauteur = canvas.height;
      let c = canvas.__pmCible;
      if (c && c.device === device && c.largeur === largeur && c.hauteur === hauteur) return c;
      if (c && c.device === device) detruire(c);
      const contexte = canvas.getContext('webgpu');
      contexte.configure({ device, format: this.format, alphaMode: 'premultiplied' });
      const T = GPUTextureUsage;
      const travail = [];
      for (let i = 0; i < TRAVAIL; i++) {
        const texture = device.createTexture({ size: [largeur, hauteur], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
        travail.push({ texture, vue: texture.createView() });
      }
      const sortie = device.createTexture({ size: [largeur, hauteur], format: 'rgba8unorm', usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
      c = { device, contexte, largeur, hauteur, travail, sortie };
      canvas.__pmCible = c;
      return c;
    }

    oublierCible(canvas) {
      const c = canvas.__pmCible;
      if (!c) return;
      delete canvas.__pmCible;
      if (c.device === this.device) detruire(c);
      try { c.contexte.unconfigure(); } catch (e) { /* contexte déjà perdu */ }
    }

    photo(id, bitmap) {
      const { device } = this;
      let p = this.photos.get(id);
      if (!p || p.largeur !== bitmap.width || p.hauteur !== bitmap.height) {
        if (p) p.texture.destroy();
        const T = GPUTextureUsage;
        const texture = device.createTexture({ size: [bitmap.width, bitmap.height], format: 'rgba8unorm-srgb', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
        p = { texture, vue: texture.createView(), largeur: bitmap.width, hauteur: bitmap.height };
        this.photos.set(id, p);
      }
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: p.texture, premultipliedAlpha: true }, [bitmap.width, bitmap.height]);
      return p.vue;
    }

    oublierPhotos(garder) {
      Array.from(this.photos.keys()).forEach((id) => {
        if (garder.has(id)) return;
        this.photos.get(id).texture.destroy();
        this.photos.delete(id);
      });
    }

    dessiner(cible, e) {
      const { device } = this;
      const enc = device.createCommandEncoder();
      const libres = cible.travail.slice();
      const prendre = () => {
        const t = libres.shift();
        if (!t) throw new Error('Composition : textures de travail épuisées.');
        return t;
      };
      const passe = (vers, fn) => {
        const p = enc.beginRenderPass({ colorAttachments: [{ view: vers.vue, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
        fn(p);
        p.end();
      };
      const groupe = (vue) => device.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: vue }, { binding: 1, resource: this.lisse }] });
      const copier = (p, vue) => { p.setPipeline(this.pipelineCopier); p.setBindGroup(0, groupe(vue)); p.draw(3); };
      const chaine = (depart, posts) => (posts || []).reduce((cur, post) => {
        const suivante = prendre();
        passe(suivante, (p) => this.shaders.dessiner(p, post.shader, post.entrees, [cur.vue, null, null], 'composition'));
        libres.push(cur);
        return suivante;
      }, depart);
      // 1. Chaque scène : sa photographie, puis ses post-traitements.
      const scenes = e.couches.map((c) => {
        const t = prendre();
        passe(t, (p) => copier(p, c.vue));
        return chaine(t, c.posts);
      });
      // 2. Transition, ou empilement dans l'ordre du document.
      const image = prendre();
      if (e.transition) {
        const tr = e.transition;
        const sortante = tr.sortante >= 0 ? scenes[tr.sortante].vue : null;
        passe(image, (p) => this.shaders.dessiner(p, tr.shader, tr.entrees, [sortante, scenes[tr.entrante].vue, null], 'composition'));
      } else {
        passe(image, (p) => scenes.forEach((s) => copier(p, s.vue)));
      }
      scenes.forEach((s) => libres.push(s));
      // 3. Post-traitements de la vidéo, puis sRGB.
      const fin = chaine(image, e.postsVideo);
      const pf = enc.beginRenderPass({
        colorAttachments: [
          { view: cible.contexte.getCurrentTexture().createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
          { view: cible.sortie.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
        ],
      });
      pf.setPipeline(this.pipelineFinal);
      pf.setBindGroup(0, groupe(fin.vue));
      pf.draw(3);
      pf.end();
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

  P.Composition = Composition;
})(typeof globalThis !== 'undefined' ? globalThis : this);
