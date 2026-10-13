/* Pulse Motion – formes exactes des obstacles : champs de distance signés sur le GPU (Jump Flooding).
 *
 * P.creerFormes(device, masques) -> { texture, vue, nombre }
 *   masques : [{ largeur, hauteur, alpha (largeur × hauteur), hauteurCqh }] (moteur/figer.js, 256 px au plus sur le grand
 *   côté). Une couche 256 × 256 rgba16float par masque, couvrant la boîte locale de l'élément :
 *     r : distance signée au contour, en cqh locaux sans échelle (négative dedans), calculée sur le masque à son rapport
 *         d'aspect (pixels carrés) ;
 *     g : dessus de la colonne (y local du premier pixel plein depuis le haut, relatif au centre) ; P.FORME_VIDE si vide.
 *   vue : GPUTextureView « 2d-array » (liaison 13 de la simulation).
 * Jump Flooding : G. Rong et T.-S. Tan (2006), variante JFA+1 (un saut de 1 en plus) ; algorithme public, réimplémenté.
 * Navigateur seulement.
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};
  const COTE = 256;
  const VIDE = 1e4;
  P.FORME_VIDE = VIDE;

  const WGSL_JFA = /* wgsl */ `
struct Jfa { largeur: u32, hauteur: u32, pas: u32, dedans: u32 };
@group(0) @binding(0) var<storage, read> masque: array<u32>;
@group(0) @binding(1) var<storage, read> source: array<vec2i>;
@group(0) @binding(2) var<storage, read_write> cible: array<vec2i>;
@group(0) @binding(3) var<uniform> J: Jfa;

// Graines : pixels pleins (dedans = 1) ou vides (dedans = 0) ; (-1, -1) ailleurs.
@compute @workgroup_size(8, 8)
fn graines(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= J.largeur || g.y >= J.hauteur) { return; }
  let i = g.y * J.largeur + g.x;
  let plein = masque[i] >= 128u;
  cible[i] = select(vec2i(-1), vec2i(g.xy), plein == (J.dedans == 1u));
}

// Un saut : la graine la plus proche parmi les 9 voisins à la distance « pas ».
@compute @workgroup_size(8, 8)
fn sauter(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= J.largeur || g.y >= J.hauteur) { return; }
  let p = vec2i(g.xy);
  var meilleur = source[g.y * J.largeur + g.x];
  var d = 3.0e38;
  if (meilleur.x >= 0) { let e = vec2f(meilleur - p); d = dot(e, e); }
  let k = i32(J.pas);
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let q = p + vec2i(dx, dy) * k;
      if (q.x < 0 || q.y < 0 || q.x >= i32(J.largeur) || q.y >= i32(J.hauteur)) { continue; }
      let s = source[u32(q.y) * J.largeur + u32(q.x)];
      if (s.x < 0) { continue; }
      let e = vec2f(s - p);
      let ds = dot(e, e);
      if (ds < d) { d = ds; meilleur = s; }
    }
  }
  cible[g.y * J.largeur + g.x] = meilleur;
}
`;

  const WGSL_SORTIE = /* wgsl */ `
struct Sortie { largeur: u32, hauteur: u32, couche: u32, cote: u32, echelle: f32, r0: f32, r1: f32, r2: f32 };
@group(0) @binding(0) var<storage, read> dedans: array<vec2i>;
@group(0) @binding(1) var<storage, read> dehors: array<vec2i>;
@group(0) @binding(2) var<storage, read> masque: array<u32>;
@group(0) @binding(3) var<storage, read> dessus: array<f32>;
@group(0) @binding(4) var<uniform> S: Sortie;
@group(0) @binding(5) var champ: texture_storage_2d_array<rgba16float, write>;

// Texel (i, j) de la couche : point du masque correspondant ; distance au centre du pixel le plus proche de l'autre côté.
@compute @workgroup_size(8, 8)
fn ecrire(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= S.cote || g.y >= S.cote) { return; }
  let pos = (vec2f(g.xy) + 0.5) / f32(S.cote) * vec2f(f32(S.largeur), f32(S.hauteur));
  let p = vec2u(min(floor(pos), vec2f(f32(S.largeur - 1u), f32(S.hauteur - 1u))));
  let i = p.y * S.largeur + p.x;
  var d = 0.0;
  if (masque[i] >= 128u) {
    let s = dehors[i];
    d = select(-1.0e4, -(length(vec2f(s) + 0.5 - pos) - 0.5) * S.echelle, s.x >= 0);
  } else {
    let s = dedans[i];
    d = select(1.0e4, (length(vec2f(s) + 0.5 - pos) - 0.5) * S.echelle, s.x >= 0);
  }
  textureStore(champ, vec2u(g.xy), S.couche, vec4f(clamp(d, -1.0e4, 1.0e4), dessus[g.x], 0.0, 1.0));
}
`;

  const parDevice = new WeakMap();
  function pipelines(device) {
    let p = parDevice.get(device);
    if (p) return p;
    const C = GPUShaderStage.COMPUTE;
    const layoutJfa = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: C, buffer: { type: 'storage' } },
        { binding: 3, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 16 } },
      ],
    });
    const layoutSortie = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: C, buffer: { type: 'uniform' } },
        { binding: 5, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '2d-array' } },
      ],
    });
    const jfa = device.createShaderModule({ label: 'pm-jfa', code: WGSL_JFA });
    const sortie = device.createShaderModule({ label: 'pm-champ-distance', code: WGSL_SORTIE });
    const lj = device.createPipelineLayout({ bindGroupLayouts: [layoutJfa] });
    p = {
      layoutJfa,
      layoutSortie,
      graines: device.createComputePipeline({ layout: lj, compute: { module: jfa, entryPoint: 'graines' } }),
      sauter: device.createComputePipeline({ layout: lj, compute: { module: jfa, entryPoint: 'sauter' } }),
      ecrire: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layoutSortie] }), compute: { module: sortie, entryPoint: 'ecrire' } }),
    };
    parDevice.set(device, p);
    return p;
  }

  /** Dessus de chaque colonne de la couche (cqh locaux sans échelle, relatif au centre), VIDE si la colonne est vide. */
  function colonnes(m) {
    const d = new Float32Array(COTE);
    for (let x = 0; x < COTE; x++) {
      const px = Math.min(m.largeur - 1, Math.floor((x + 0.5) / COTE * m.largeur));
      let y = 0;
      while (y < m.hauteur && m.alpha[y * m.largeur + px] < 128) y++;
      d[x] = y < m.hauteur ? (y / m.hauteur - 0.5) * m.hauteurCqh : VIDE;
    }
    return d;
  }

  P.creerFormes = function (device, masques) {
    const p = pipelines(device);
    const U = GPUBufferUsage;
    const nombre = Math.max(1, masques.length);
    const texture = device.createTexture({
      size: [COTE, COTE, nombre],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    const vueEcriture = texture.createView({ dimension: '2d-array' });
    const jetables = [];
    const tampon = (octets, usage, contenu) => {
      const b = device.createBuffer({ size: Math.max(16, octets), usage });
      if (contenu) device.queue.writeBuffer(b, 0, contenu);
      jetables.push(b);
      return b;
    };
    const enc = device.createCommandEncoder();
    masques.forEach((m, couche) => {
      const N = m.largeur * m.hauteur;
      if (!N) return;
      const masque = tampon(N * 4, U.STORAGE | U.COPY_DST, Uint32Array.from(m.alpha));
      const a = tampon(N * 8, U.STORAGE | U.COPY_SRC);
      const b = tampon(N * 8, U.STORAGE | U.COPY_SRC);
      const plusProches = [tampon(N * 8, U.STORAGE | U.COPY_DST), tampon(N * 8, U.STORAGE | U.COPY_DST)]; // [dehors, dedans]
      const pas = [];
      for (let k = 1 << Math.max(0, Math.ceil(Math.log2(Math.max(m.largeur, m.hauteur))) - 1); k >= 1; k >>= 1) pas.push(k);
      pas.push(1);
      const tranches = 2 * (pas.length + 1);
      const uniforme = tampon(256 * tranches, U.UNIFORM | U.COPY_DST);
      const donnees = new Uint32Array(64 * tranches);
      const groupe = (source, cible) => device.createBindGroup({
        layout: p.layoutJfa,
        entries: [
          { binding: 0, resource: { buffer: masque } },
          { binding: 1, resource: { buffer: source } },
          { binding: 2, resource: { buffer: cible } },
          { binding: 3, resource: { buffer: uniforme, size: 16 } },
        ],
      });
      const versB = groupe(a, b);
      const versA = groupe(b, a);
      const gx = Math.ceil(m.largeur / 8);
      const gy = Math.ceil(m.hauteur / 8);
      [0, 1].forEach((dedans) => {
        const base = dedans * (pas.length + 1);
        donnees.set([m.largeur, m.hauteur, 0, dedans], base * 64);
        pas.forEach((k, j) => donnees.set([m.largeur, m.hauteur, k, dedans], (base + 1 + j) * 64));
        const passe = enc.beginComputePass();
        passe.setPipeline(p.graines);
        passe.setBindGroup(0, versA, [base * 256]);
        passe.dispatchWorkgroups(gx, gy);
        passe.setPipeline(p.sauter);
        let dansA = true;
        pas.forEach((k, j) => {
          passe.setBindGroup(0, dansA ? versB : versA, [(base + 1 + j) * 256]);
          passe.dispatchWorkgroups(gx, gy);
          dansA = !dansA;
        });
        passe.end();
        enc.copyBufferToBuffer(dansA ? a : b, 0, plusProches[dedans], 0, N * 8);
      });
      device.queue.writeBuffer(uniforme, 0, donnees);
      const s = new ArrayBuffer(32);
      const su = new Uint32Array(s);
      su[0] = m.largeur; su[1] = m.hauteur; su[2] = couche; su[3] = COTE;
      new Float32Array(s)[4] = m.hauteurCqh / m.hauteur;
      const sortie = tampon(32, U.UNIFORM | U.COPY_DST, s);
      const dessus = tampon(COTE * 4, U.STORAGE | U.COPY_DST, colonnes(m));
      const passe = enc.beginComputePass();
      passe.setPipeline(p.ecrire);
      passe.setBindGroup(0, device.createBindGroup({
        layout: p.layoutSortie,
        entries: [
          { binding: 0, resource: { buffer: plusProches[1] } },
          { binding: 1, resource: { buffer: plusProches[0] } },
          { binding: 2, resource: { buffer: masque } },
          { binding: 3, resource: { buffer: dessus } },
          { binding: 4, resource: { buffer: sortie } },
          { binding: 5, resource: vueEcriture },
        ],
      }));
      passe.dispatchWorkgroups(COTE / 8, COTE / 8);
      passe.end();
    });
    device.queue.submit([enc.finish()]);
    device.queue.onSubmittedWorkDone().then(() => jetables.forEach((t) => t.destroy()), () => {});
    return { texture, vue: texture.createView({ dimension: '2d-array' }), nombre };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
