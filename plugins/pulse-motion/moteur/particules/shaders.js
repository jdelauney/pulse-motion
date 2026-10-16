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
 *   .copierImage(source, porteur, l, h)     image du navigateur (canvas, ImageBitmap : sRGB, alpha droit ou prémultiplié)
 *       copiée dans porteur.texture (rgba8unorm-srgb, l × h) en linéaire prémultiplié ; .oublierBrut(porteur)
 *   .ecrireSon(piste, spectre, onde), .vueSon(piste)   texture du son (P7), liaison 8 (iSonTexture)
 * Multipasse (P7) : P.etatMultipasse (planificateur de P1) ; .avancerMultipasse(shader, o) amène les tampons d'un fond
 * (rgba16float, ping-pong, une soumission par pas, instantanés par copie de textures) à l'état ⌊τ × pps⌋ ; la passe image
 * lit les tampons de son « lit ». .libererMultipasse(shader) : tampons et instantanés libérés (recréés au prochain avancement,
 * même état : il ne dépend que de τ) ; .oublier(shader) : en plus, programmes WebGL2 d'un shader GLSL (perte du GPU).
 * Fond GLSL : shader.transparent (vrai si sa première image, hors multipasse, est entièrement transparente).
 * GLSL (P7) : donnee.langage « glsl » compilé par P.Glsl (contexte WebGL2 partagé) ; fond : image WebGL2 de la zone et de
 * son débord copiée (copyExternalImageToTexture) puis relais WGSL sur le repère ; .imageGLSLComposition pour la composition.
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

  // Relais d'un fond GLSL (P7) : l'image du contexte WebGL2 (canal0), qui couvre la boîte du fond et son débord, placée
  // sur le repère du fond comme un fond WGSL (aura comprise).
  const RELAIS = [
    'fn image(coord: vec2f) -> vec4f {',
    '  let d = PM.repere.w;',
    '  return canal0((coord + vec2f(d)) / (iResolution.xy + vec2f(2.0 * d)));',
    '}',
    '',
  ].join('\n');

  // Conversion d'une image du navigateur (P6, reliquats) : copyExternalImageToTexture prémultiplie dans l'espace encodé
  // (sRGB(c)·a), ce qui, lu en linéaire, assombrit les bords semi-transparents. L'image est donc copiée telle quelle (alpha
  // droit) dans une texture brute rgba8unorm, puis réécrite en linéaire prémultiplié (linéaire(c)·a) dans la texture sRGB.
  // Une image opaque garde exactement ses octets (décodage puis réencodage sRGB).
  const CONVERSION = /* wgsl */ `
@group(0) @binding(0) var brut: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn versLineaire(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = textureLoad(brut, vec2i(pos.xy), 0);
  return vec4f(versLineaire(c.rgb) * c.a, c.a);
}
`;

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

  const BUDGET_MULTIPASSE = 256 * 1024 * 1024;

  /** Évolution d'un multipasse par pas fixes de τ (P7) : planificateur de P1 (M.instantanes), un instantané tous les pps pas
   *  (1 s de τ), intervalle doublé tant que les instantanés ne tiennent pas dans le budget (256 Mio).
   *  ops : { tailleEtat, vider(), pas(k), sauver(k), restaurer(k), oublierTout() } -> { intervalle, avancer(k), oublier() } */
  function etatMultipasse(ops, pps, pasTotal) {
    let intervalle = pps;
    const max = Math.max(1, Math.floor(BUDGET_MULTIPASSE / Math.max(1, ops.tailleEtat)));
    while (Math.ceil(pasTotal / intervalle) > max) intervalle *= 2;
    const plan = M.instantanes.creerPlanificateur({ intervalle });
    return {
      intervalle,
      avancer(k) {
        plan.planifier(k).forEach((a) => {
          if (a.type === 'vider') ops.vider();
          else if (a.type === 'restaurer') ops.restaurer(a.k);
          else if (a.type === 'pas') ops.pas(a.k);
          else ops.sauver(a.k);
        });
      },
      oublier() { plan.oublier(); ops.oublierTout(); },
    };
  }
  P.etatMultipasse = etatMultipasse;

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
          texture(8),
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
      this.sons = new Map();
    }

    async image(uri) {
      if (this.images.has(uri)) return this.images.get(uri);
      const img = new Image();
      img.src = uri;
      await img.decode();
      const bitmap = await createImageBitmap(img);
      const T = GPUTextureUsage;
      const texture = this.device.createTexture({ size: [bitmap.width, bitmap.height], format: 'rgba8unorm-srgb', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
      const porteur = { texture };
      this.copierImage(bitmap, porteur, bitmap.width, bitmap.height);
      this.oublierBrut(porteur);
      bitmap.close();
      const vue = texture.createView();
      this.images.set(uri, vue);
      return vue;
    }

    /** Image du navigateur copiée dans porteur.texture (rgba8unorm-srgb, largeur × hauteur) en linéaire prémultiplié, par
     *  la texture brute porteur.brut (rgba8unorm, gardée pour les copies suivantes, recréée si sa taille change). */
    copierImage(source, porteur, largeur, hauteur) {
      const { device } = this;
      const T = GPUTextureUsage;
      if (!this.conversion) {
        const module = device.createShaderModule({ label: 'pm-conversion', code: CONVERSION });
        this.conversion = device.createRenderPipeline({
          layout: 'auto', vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb' }] },
        });
      }
      let b = porteur.brut;
      if (!b || b.largeur !== largeur || b.hauteur !== hauteur) {
        if (b) b.texture.destroy();
        const texture = device.createTexture({ size: [largeur, hauteur], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
        b = porteur.brut = { texture, largeur, hauteur };
        b.groupe = device.createBindGroup({ layout: this.conversion.getBindGroupLayout(0), entries: [{ binding: 0, resource: texture.createView() }] });
      }
      device.queue.copyExternalImageToTexture({ source }, { texture: b.texture, premultipliedAlpha: false }, [largeur, hauteur]);
      const enc = device.createCommandEncoder();
      const p = enc.beginRenderPass({ colorAttachments: [{ view: porteur.texture.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      p.setPipeline(this.conversion);
      p.setBindGroup(0, b.groupe);
      p.draw(3);
      p.end();
      device.queue.submit([enc.finish()]);
    }

    oublierBrut(porteur) {
      if (porteur && porteur.brut) { try { porteur.brut.texture.destroy(); } catch (e) { /* device déjà perdu */ } porteur.brut = null; }
    }

    /** Son réactif (P7) : texture r8unorm 512 × 2 d'une piste (ligne 0 spectre, ligne 1 onde), créée à la première écriture. */
    ecrireSon(piste, spectre, onde) {
      const { device } = this;
      let s = this.sons.get(piste);
      if (!s) {
        const texture = device.createTexture({ size: [512, 2], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        s = { texture, vue: texture.createView() };
        this.sons.set(piste, s);
      }
      const texels = new Uint8Array(1024);
      texels.set(spectre, 0);
      texels.set(onde, 512);
      device.queue.writeTexture({ texture: s.texture }, texels, { bytesPerRow: 512 }, [512, 2]);
      if (this.glslActif) P.Glsl.partage().ecrireSon(piste, spectre, onde);
    }

    vueSon(piste) { const s = this.sons.get(piste); return s ? s.vue : this.vueVide; }

    async compiler(donnee) {
      if (donnee.langage === 'glsl') return this.compilerGLSL(donnee);
      return this.compilerWGSL(donnee);
    }

    /** Pipelines du relais des fonds GLSL, compilés une fois par device. -> { ok, disposition, pipelines, erreurs } */
    async relaisPour() {
      if (!this.relais) {
        const r = await this.compilerWGSL({ nom: 'pm-relais', fichier: 'moteur', usage: 'fond', code: RELAIS, parametres: {}, valeurs: {} });
        this.relais = r.ok ? { ok: true, disposition: r.shader.disposition, pipelines: r.shader.pipelines, erreurs: [] } : { ok: false, erreurs: r.erreurs };
      }
      return this.relais;
    }

    async compilerGLSL(donnee) {
      const S = M.codeShader;
      const { device } = this;
      const echec = (erreurs) => ({ ok: false, erreurs, message: S.messageErreur(donnee.nom, donnee.fichier, erreurs) });
      let gl;
      try { gl = P.Glsl.partage(); } catch (e) { return echec([{ ligne: null, colonne: null, message: String(e && e.message || e) }]); }
      this.glslActif = true;
      const r = gl.compiler(donnee);
      if (!r.ok) return echec(r.erreurs);
      // Multipasse (P7) : un programme par tampon (appel passeX) ; tampons flottants indispensables.
      let multi = null;
      if (donnee.passes) {
        if (!gl.flottant) return echec([{ ligne: null, colonne: null, message: 'tampons flottants indisponibles en WebGL2 (EXT_color_buffer_float) : shader multipasse non affiché' }]);
        multi = { pps: donnee.pas_par_seconde || 60, image: donnee.passes[donnee.passes.length - 1], passes: [], etat: null };
        for (const p of donnee.passes.slice(0, -1)) {
          const rp = gl.compiler(donnee, 'passe' + p.nom);
          if (!rp.ok) return echec(rp.erreurs);
          multi.passes.push({ nom: p.nom, lit: p.lit, echelle: p.echelle, prog: rp.prog });
        }
      }
      let imageGL = null;
      if (donnee.image) {
        try { imageGL = await gl.image(donnee.image); } catch (e) { return echec([{ ligne: null, colonne: null, message: 'image de iChannel2 illisible' }]); }
      }
      const relais = await this.relaisPour();
      if (!relais.ok) return echec(relais.erreurs);
      const U = GPUBufferUsage;
      const shader = {
        donnee, glsl: r.prog, moteurGL: gl, imageGL, multi, valeurs: null, texture: null, vue: null, largeur: 0, hauteur: 0,
        // Relais propre au shader (ses uniformes) : deux fonds GLSL peuvent être dessinés dans la même soumission.
        relais: {
          donnee: { nom: 'pm-relais', piste: donnee.piste }, disposition: relais.disposition, pipelines: relais.pipelines, image: null, valeurs: {},
          entrees: device.createBuffer({ size: S.OCTETS_ENTREES, usage: U.UNIFORM | U.COPY_DST }),
          reglages: device.createBuffer({ size: relais.disposition.taille, usage: U.UNIFORM | U.COPY_DST }),
        },
      };
      this.regler(shader, donnee.valeurs || {});
      return { ok: true, shader, erreurs: [] };
    }

    async compilerWGSL(donnee) {
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
      // Multipasse (P7) : un module et un pipeline par tampon (cible rgba16float, sans mélange), même code, appel passeX.
      let multi = null;
      if (donnee.passes) {
        multi = { pps: donnee.pas_par_seconde || 60, image: donnee.passes[donnee.passes.length - 1], passes: [], etat: null };
        for (const p of donnee.passes.slice(0, -1)) {
          const a = S.assemblerShader({ code: donnee.code, usage: 'fond', disposition, prelude: P.WGSL_COMMUN + P.WGSL_BRUIT, appel: 'passe' + p.nom + '(e.coord)' });
          const mod = device.createShaderModule({ label: 'pm-shader-' + donnee.nom + '-' + p.nom, code: a.wgsl });
          const err = S.situer((await mod.getCompilationInfo()).messages, a);
          if (err.length) return echec(err);
          let pipeline;
          try {
            pipeline = await device.createRenderPipelineAsync({
              layout: this.layoutPipeline,
              vertex: { module: mod, entryPoint: 'pmSommets' },
              fragment: { module: mod, entryPoint: 'pmImage', targets: [{ format: 'rgba16float' }] },
              primitive: { topology: 'triangle-list' },
            });
          } catch (e) { return echec([{ ligne: null, colonne: null, message: String(e && e.message || e) }]); }
          multi.passes.push({ nom: p.nom, lit: p.lit, echelle: p.echelle, pipeline, entrees: device.createBuffer({ size: S.OCTETS_ENTREES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) });
        }
      }
      const U = GPUBufferUsage;
      const shader = {
        donnee, disposition, pipelines, image, valeurs: null,
        entrees: device.createBuffer({ size: S.OCTETS_ENTREES, usage: U.UNIFORM | U.COPY_DST }),
        reglages: device.createBuffer({ size: disposition.taille, usage: U.UNIFORM | U.COPY_DST }),
      };
      shader.multi = multi;
      // Chaque passe se dessine comme un shader (ses entrées, les réglages du shader), pipeline « passe ».
      if (multi) multi.passes.forEach((p) => {
        p.objet = { donnee: { nom: donnee.nom + ' (' + p.nom + ')', piste: donnee.piste }, disposition, pipelines: { passe: p.pipeline }, image, valeurs: null, entrees: p.entrees, reglages: shader.reglages };
      });
      this.regler(shader, donnee.valeurs || {});
      return { ok: true, shader, erreurs: [] };
    }

    regler(shader, valeurs) {
      // Multipasse : l'état dépend des réglages, il repart de 0.
      if (shader.multi && shader.multi.etat) shader.multi.etat.oublier();
      shader.valeurs = valeurs;
      // GLSL : réglages relus à chaque dessin (uniformes WebGL2).
      if (shader.glsl) return;
      this.device.queue.writeBuffer(shader.reglages, 0, M.codeShader.ecrireReglages(shader.disposition, valeurs));
    }

    /** Fond multipasse (P7) : tampons créés à la première image (zone du fond à son début × hauteur de sortie / 100 ×
     *  échelle), amenés à l'état ⌊τ × pps⌋. */
    avancerMultipasse(shader, o) {
      const m = shader.multi;
      if (!m) return;
      if (!m.etat) m.etat = shader.glsl ? this.etatGLSL(shader, o) : this.etatWGSL(shader, o);
      m.etat.avancer(Math.max(0, Math.floor(o.tau * m.pps + 1e-6)));
    }

    etatWGSL(shader, o) {
      const { device } = this;
      const m = shader.multi;
      const T = GPUTextureUsage;
      const k = o.hauteurSortie / 100;
      const tampons = {};
      m.passes.forEach((p) => {
        const largeur = Math.max(1, Math.round(o.largeurZone * k * p.echelle));
        const hauteur = Math.max(1, Math.round(o.hauteurZone * k * p.echelle));
        const cree = () => device.createTexture({ size: [largeur, hauteur], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC | T.COPY_DST });
        const faces = [cree(), cree()];
        tampons[p.nom] = { largeur, hauteur, cree, faces, vues: faces.map((f) => f.createView()), courant: 0 };
      });
      const vueLue = (n) => tampons[n].vues[tampons[n].courant];
      const canaux = (lit) => [0, 1, 2, 3].map((i) => (lit[i] ? vueLue(lit[i]) : null));
      const vers = (enc, vue, fn) => {
        const rp = enc.beginRenderPass({ colorAttachments: [{ view: vue, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
        if (fn) fn(rp);
        rp.end();
      };
      const instantanes = new Map();
      const ops = {
        tailleEtat: Object.values(tampons).reduce((s, t) => s + t.largeur * t.hauteur * 8, 0),
        vider: () => {
          const enc = device.createCommandEncoder();
          Object.values(tampons).forEach((t) => vers(enc, t.vues[t.courant], null));
          device.queue.submit([enc.finish()]);
        },
        pas: (kk) => {
          const temps = kk / m.pps;
          const instant = o.debut + temps / o.rythme;
          o.textures(instant);
          const enc = device.createCommandEncoder();
          m.passes.forEach((p) => {
            const t = tampons[p.nom];
            const entrees = { temps, progres: 0, duree: 0, mode: 1, resolution: [o.largeurZone, o.hauteurZone, t.largeur, t.hauteur],
              scene: [o.largeurZone, o.hauteurZone, t.largeur, t.hauteur], son: o.son(instant), image: [kk, 1 / m.pps], instant };
            vers(enc, t.vues[1 - t.courant], (rp) => this.dessiner(rp, p.objet, entrees, canaux(p.lit), 'passe'));
          });
          device.queue.submit([enc.finish()]);
          // Échange après toutes les passes : chaque passe a lu l'état précédent des tampons.
          m.passes.forEach((p) => { tampons[p.nom].courant = 1 - tampons[p.nom].courant; });
        },
        sauver: (kk) => {
          const enc = device.createCommandEncoder();
          instantanes.set(kk, m.passes.map((p) => {
            const t = tampons[p.nom];
            const copie = t.cree();
            enc.copyTextureToTexture({ texture: t.faces[t.courant] }, { texture: copie }, [t.largeur, t.hauteur]);
            return copie;
          }));
          device.queue.submit([enc.finish()]);
        },
        restaurer: (kk) => {
          const enc = device.createCommandEncoder();
          instantanes.get(kk).forEach((copie, i) => {
            const t = tampons[m.passes[i].nom];
            enc.copyTextureToTexture({ texture: copie }, { texture: t.faces[t.courant] }, [t.largeur, t.hauteur]);
          });
          device.queue.submit([enc.finish()]);
        },
        oublierTout: () => {
          instantanes.forEach((copies) => copies.forEach((c) => c.destroy()));
          instantanes.clear();
        },
      };
      const etat = P.etatMultipasse(ops, m.pps, Math.ceil(o.fin * m.pps) + 1);
      etat.canauxImage = () => canaux(m.image.lit);
      etat.instantanes = () => instantanes.size;
      etat.liberer = () => {
        etat.oublier();
        Object.values(tampons).forEach((t) => t.faces.forEach((f) => f.destroy()));
      };
      return etat;
    }

    etatGLSL(shader, o) {
      const gl = shader.moteurGL;
      const m = shader.multi;
      const k = o.hauteurSortie / 100;
      const tampons = {};
      m.passes.forEach((p) => {
        tampons[p.nom] = gl.tampon(Math.max(1, Math.round(o.largeurZone * k * p.echelle)), Math.max(1, Math.round(o.hauteurZone * k * p.echelle)));
      });
      const lu = (n) => { const t = tampons[n]; return { texture: t.faces[t.courant].texture, largeur: t.largeur, hauteur: t.hauteur }; };
      const parDefaut = (i) => (i === 2 ? shader.imageGL : i === 3 ? gl.texSon(shader.donnee.piste || 'musique') : null);
      const canaux = (lit) => [0, 1, 2, 3].map((i) => (lit[i] ? lu(lit[i]) : parDefaut(i)));
      const instantanes = new Map();
      const ops = {
        tailleEtat: Object.values(tampons).reduce((s, t) => s + t.largeur * t.hauteur * 8, 0),
        vider: () => Object.values(tampons).forEach((t) => gl.viderFace(t.faces[t.courant], t.largeur, t.hauteur)),
        pas: (kk) => {
          const temps = kk / m.pps;
          const instant = o.debut + temps / o.rythme;
          o.textures(instant);
          const entrees = { temps, image: [kk, 1 / m.pps], son: o.son(instant), instant };
          m.passes.forEach((p) => {
            const t = tampons[p.nom];
            gl.executer(p.prog, { entrees, valeurs: shader.valeurs, canaux: canaux(p.lit) }, t.faces[1 - t.courant].fb, t.largeur, t.hauteur);
          });
          m.passes.forEach((p) => { tampons[p.nom].courant = 1 - tampons[p.nom].courant; });
        },
        sauver: (kk) => {
          instantanes.set(kk, m.passes.map((p) => {
            const t = tampons[p.nom];
            const copie = gl.face(t.largeur, t.hauteur);
            gl.copierFace(t.faces[t.courant], copie, t.largeur, t.hauteur);
            return copie;
          }));
        },
        restaurer: (kk) => {
          instantanes.get(kk).forEach((copie, i) => {
            const t = tampons[m.passes[i].nom];
            gl.copierFace(copie, t.faces[t.courant], t.largeur, t.hauteur);
          });
        },
        oublierTout: () => {
          instantanes.forEach((copies) => copies.forEach((c) => gl.libererFace(c)));
          instantanes.clear();
        },
      };
      const etat = P.etatMultipasse(ops, m.pps, Math.ceil(o.fin * m.pps) + 1);
      etat.canauxImage = () => canaux(m.image.lit);
      etat.instantanes = () => instantanes.size;
      etat.liberer = () => {
        etat.oublier();
        Object.values(tampons).forEach((t) => t.faces.forEach((f) => gl.libererFace(f)));
      };
      return etat;
    }

    /** Tampons et instantanés d'un fond multipasse libérés ; recréés au prochain avancement (même état, fonction de τ). */
    libererMultipasse(shader) {
      const m = shader && shader.multi;
      if (!m || !m.etat) return;
      const etat = m.etat;
      m.etat = null;
      etat.liberer();
    }

    /** Shader abandonné (perte du GPU, piste illisible) : multipasse libéré, texture de copie, programmes WebGL2. */
    oublier(shader) {
      if (!shader) return;
      try { this.libererMultipasse(shader); } catch (e) { /* device déjà perdu */ }
      if (shader.texture) { try { shader.texture.destroy(); } catch (e) { /* device déjà perdu */ } shader.texture = null; }
      this.oublierBrut(shader);
      if (shader.glsl) {
        const gl = shader.moteurGL.gl;
        gl.deleteProgram(shader.glsl.programme);
        if (shader.multi) shader.multi.passes.forEach((p) => gl.deleteProgram(p.prog.programme));
        shader.glsl = null;
      }
    }

    /** Image WebGL2 (sRGB, alpha droit) copiée dans la texture du shader (rgba8unorm-srgb, linéaire prémultiplié, comme une
     *  sortie WGSL) ; recréée si sa taille change. */
    copierGLSL(shader, canvas, largeur, hauteur) {
      const { device } = this;
      if (!shader.texture || shader.largeur !== largeur || shader.hauteur !== hauteur) {
        if (shader.texture) shader.texture.destroy();
        const T = GPUTextureUsage;
        shader.texture = device.createTexture({ size: [largeur, hauteur], format: 'rgba8unorm-srgb', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
        shader.vue = shader.texture.createView();
        shader.largeur = largeur;
        shader.hauteur = hauteur;
      }
      this.copierImage(canvas, shader, largeur, hauteur);
      return shader.vue;
    }

    canauxGL(shader, premiers) {
      if (shader.multi && shader.multi.etat) return shader.multi.etat.canauxImage();
      const son = shader.moteurGL.texSon(shader.donnee.piste || 'musique');
      return [premiers[0] || null, premiers[1] || null, shader.imageGL, son];
    }

    /** Fond GLSL : dessiné en WebGL2 à la taille de sa zone et de son débord (pixels du calque), copié. -> vue */
    imageGLSL(shader, entrees) {
      const k = entrees.scene[3] / 100;
      const d = entrees.repere[3];
      const largeur = Math.max(1, Math.round((entrees.resolution[0] + 2 * d) * k));
      const hauteur = Math.max(1, Math.round((entrees.resolution[1] + 2 * d) * k));
      const canvas = shader.moteurGL.dessiner(shader.glsl, { largeur, hauteur, entrees, valeurs: shader.valeurs, canaux: this.canauxGL(shader, []) });
      // Première image d'un fond (hors multipasse, dont les tampons partent de 0) : sortie entièrement transparente ?
      if (shader.transparent === undefined) shader.transparent = shader.multi ? false : shader.moteurGL.toutTransparent(largeur, hauteur);
      return this.copierGLSL(shader, canvas, largeur, hauteur);
    }

    /** Transition ou post-traitement GLSL (composition) : images d'entrée (ImageBitmap, ou null). -> vue */
    imageGLSLComposition(shader, entrees, bitmaps, largeur, hauteur) {
      const canvas = shader.moteurGL.dessiner(shader.glsl, { largeur, hauteur, entrees, valeurs: shader.valeurs, canaux: this.canauxGL(shader, bitmaps) });
      return this.copierGLSL(shader, canvas, largeur, hauteur);
    }

    dessiner(passe, shader, entrees, canaux, genre) {
      if (shader.glsl) {
        // Fond GLSL : image WebGL2 copiée, puis relais WGSL sur le repère du fond. La composition dessine les autres usages.
        if (genre !== 'fond') throw new Error('Shader GLSL « ' + shader.donnee.nom + ' » : dessiné par la composition.');
        const vue = this.imageGLSL(shader, entrees);
        this.dessiner(passe, shader.relais, entrees, [vue, null, null], 'fond');
        return;
      }
      const { device } = this;
      device.queue.writeBuffer(shader.entrees, 0, M.codeShader.ecrireEntrees(entrees));
      const c = shader.multi && genre === 'fond' ? (shader.multi.etat ? shader.multi.etat.canauxImage() : []) : (canaux || []);
      const vue = (i) => c[i] || (i === 2 && shader.image) || this.vueVide;
      const groupe = device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: shader.entrees } },
          { binding: 1, resource: { buffer: shader.reglages } },
          { binding: 2, resource: vue(0) },
          { binding: 3, resource: vue(1) },
          { binding: 4, resource: vue(2) },
          { binding: 5, resource: c[3] || this.vueBruit },
          { binding: 6, resource: this.lisse },
          { binding: 7, resource: this.repete },
          { binding: 8, resource: this.vueSon(shader.donnee.piste || 'musique') },
        ],
      });
      passe.setPipeline(shader.pipelines[genre]);
      passe.setBindGroup(0, groupe);
      passe.draw(entrees.mode === 1 ? 3 : 6);
    }
  }

  P.Shaders = Shaders;
})(typeof globalThis !== 'undefined' ? globalThis : this);
