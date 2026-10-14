/* Pulse Motion – shaders WGSL sur le GPU : compilation, pipelines, entrées, textures (P6).
 *
 * new P.Shaders(device)
 *   .compiler(donnee) -> Promise<{ ok, shader?, erreurs, message? }>   donnee : entrée de M.donnees.shaders (fond,
 *       transition, post) ; erreurs [{ ligne, colonne, message }] situées dans le fichier .wgsl ; message : texte du panneau.
 *       Pipelines « fond » (cible rgba16float, mélange prémultiplié : un calque HDR) et « composition » (rgba16float,
 *       remplacement) créés à la compilation.
 *   .regler(shader, valeurs)                réglages réécrits (atelier), sans recompiler
 *   .dessiner(passe, shader, entrees, canaux, genre)   entrees : objet de M.codeShader.ecrireEntrees ; canaux : [vue | null] pour
 *       iChannel0–2 (null : image du shader pour iChannel2, transparent sinon) ; iChannel3 : bruit ; genre : 'fond' | 'composition'.
 *       Un shader n'est dessiné qu'une fois par soumission (son uniforme d'entrées est réécrit à chaque dessin).
 *   .image(uri) -> Promise<vue>             image (data:) en texture sRGB prémultipliée, gardée par URI
 *   .vueBruit, .vueVide                     texture de bruit 256 × 256 (P.texelsBruit), texture transparente 1 × 1
 * P.pcg(v), P.texelsBruit() -> Uint8Array   hachage PCG (comme le WGSL) ; texels du bruit, les mêmes à chaque chargement
 * Hachage PCG d'après M. O'Neill (pcg-random.org, domaine public).
 * Navigateur seulement ; dépend de simulation.js (P.WGSL_COMMUN, P.WGSL_BRUIT) et de shaders/code.js (M.codeShader).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};
  const COTE_BRUIT = 256;
  const PREMULTIPLIE = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };

  function pcg(v) {
    const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
    const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
    return ((w >>> 22) ^ w) >>> 0;
  }
  P.pcg = pcg;

  function texelsBruit() {
    const d = new Uint8Array(COTE_BRUIT * COTE_BRUIT * 4);
    for (let y = 0; y < COTE_BRUIT; y++) {
      for (let x = 0; x < COTE_BRUIT; x++) {
        for (let c = 0; c < 4; c++) d[(y * COTE_BRUIT + x) * 4 + c] = pcg((x ^ pcg((y ^ pcg(c + 0x9e37)) >>> 0)) >>> 0) >>> 24;
      }
    }
    return d;
  }
  P.texelsBruit = texelsBruit;

  class Shaders {
    constructor(device) {
      this.device = device;
      const V = GPUShaderStage.VERTEX;
      const F = GPUShaderStage.FRAGMENT;
      const T = GPUTextureUsage;
      const texture = (b) => ({ binding: b, visibility: F, texture: { sampleType: 'float' } });
      this.layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: V | F, buffer: { type: 'uniform' } },
          { binding: 1, visibility: F, buffer: { type: 'uniform' } },
          texture(2), texture(3), texture(4), texture(5),
          { binding: 6, visibility: F, sampler: { type: 'filtering' } },
          { binding: 7, visibility: F, sampler: { type: 'filtering' } },
        ],
      });
      this.layoutPipeline = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      this.lisse = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      this.repete = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
      this.vide = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
      device.queue.writeTexture({ texture: this.vide }, new Uint8Array(4), { bytesPerRow: 4 }, [1, 1]);
      this.vueVide = this.vide.createView();
      this.bruit = device.createTexture({ size: [COTE_BRUIT, COTE_BRUIT], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
      device.queue.writeTexture({ texture: this.bruit }, texelsBruit(), { bytesPerRow: COTE_BRUIT * 4 }, [COTE_BRUIT, COTE_BRUIT]);
      this.vueBruit = this.bruit.createView();
      this.images = new Map();
    }

    async image(uri) {
      if (this.images.has(uri)) return this.images.get(uri);
      const img = new Image();
      img.src = uri;
      await img.decode();
      const bitmap = await createImageBitmap(img);
      const T = GPUTextureUsage;
      const texture = this.device.createTexture({ size: [bitmap.width, bitmap.height], format: 'rgba8unorm-srgb', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
      this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture, premultipliedAlpha: true }, [bitmap.width, bitmap.height]);
      const vue = texture.createView();
      this.images.set(uri, vue);
      return vue;
    }

    async compiler(donnee) {
      const S = M.codeShader;
      const { device } = this;
      const echec = (erreurs) => ({ ok: false, erreurs, message: S.messageErreur(donnee.nom, donnee.fichier, erreurs) });
      const disposition = S.dispositionReglages(donnee.parametres || {});
      const assemblage = S.assemblerShader({ code: donnee.code, usage: donnee.usage, disposition, prelude: P.WGSL_COMMUN + P.WGSL_BRUIT });
      const module = device.createShaderModule({ label: 'pm-shader-' + donnee.nom, code: assemblage.wgsl });
      const info = await module.getCompilationInfo();
      const erreurs = S.situer(info.messages, assemblage);
      if (erreurs.length) return echec(erreurs);
      const pipeline = (blend) => device.createRenderPipelineAsync({
        layout: this.layoutPipeline,
        vertex: { module, entryPoint: 'pmSommets' },
        fragment: { module, entryPoint: 'pmImage', targets: [blend ? { format: 'rgba16float', blend } : { format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' },
      });
      let pipelines;
      try {
        pipelines = { fond: await pipeline(PREMULTIPLIE), composition: await pipeline(null) };
      } catch (e) {
        return echec([{ ligne: null, colonne: null, message: String(e && e.message || e) }]);
      }
      let image = null;
      if (donnee.image) {
        try { image = await this.image(donnee.image); } catch (e) {
          return echec([{ ligne: null, colonne: null, message: 'image de iChannel2 illisible' }]);
        }
      }
      const U = GPUBufferUsage;
      const shader = {
        donnee, disposition, pipelines, image, valeurs: null,
        entrees: device.createBuffer({ size: S.OCTETS_ENTREES, usage: U.UNIFORM | U.COPY_DST }),
        reglages: device.createBuffer({ size: disposition.taille, usage: U.UNIFORM | U.COPY_DST }),
      };
      this.regler(shader, donnee.valeurs || {});
      return { ok: true, shader, erreurs: [] };
    }

    regler(shader, valeurs) {
      shader.valeurs = valeurs;
      this.device.queue.writeBuffer(shader.reglages, 0, M.codeShader.ecrireReglages(shader.disposition, valeurs));
    }

    dessiner(passe, shader, entrees, canaux, genre) {
      const { device } = this;
      device.queue.writeBuffer(shader.entrees, 0, M.codeShader.ecrireEntrees(entrees));
      const c = canaux || [];
      const vue = (i) => c[i] || (i === 2 && shader.image) || this.vueVide;
      const groupe = device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: shader.entrees } },
          { binding: 1, resource: { buffer: shader.reglages } },
          { binding: 2, resource: vue(0) },
          { binding: 3, resource: vue(1) },
          { binding: 4, resource: vue(2) },
          { binding: 5, resource: this.vueBruit },
          { binding: 6, resource: this.lisse },
          { binding: 7, resource: this.repete },
        ],
      });
      passe.setPipeline(shader.pipelines[genre]);
      passe.setBindGroup(0, groupe);
      passe.draw(entrees.mode === 1 ? 3 : 6);
    }
  }

  P.Shaders = Shaders;
})(typeof globalThis !== 'undefined' ? globalThis : this);
