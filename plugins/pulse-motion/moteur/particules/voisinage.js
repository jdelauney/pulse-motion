/* Pulse Motion – voisinage des particules (P5a) : grille de hachage, comptage, somme préfixe, tri stable par cellule.
 *
 * P.grilleInteractions(largeurCqh, cote) -> { origine: [x, y], cote, nx, ny, n }   grille fixe : la scène élargie de 25 %
 *   de chaque côté (cqh), cellules de côté « cote » ; Error au-delà de CELLULES_MAX cellules
 * P.iterationsGroupe(def, membres) -> itérations du solveur (fluide 2 × max(incompressibilite), grains 2 × 3, essaim 0)
 * P.emballerGroupe(def, membres, grille, nCorps) -> ArrayBuffer   uniforme « Groupe » (560 octets) ; membres :
 *   [{ em, base, capacite }] (émetteurs simulés du groupe, dans l'ordre de la recette)
 * P.WGSL_GROUPE    structures WGSL partagées (ParamsMembre, Groupe, Membre, Corps) ; P.WGSL_PAS_GROUPE : struct Pas (48 octets)
 * P.WGSL_VOISINAGE module des noyaux du groupe
 * new P.Groupe(device, sim, def)   def : effet.groupes[g] ; sim : P.Simulation (emetteurs, tamponPas, largeurCqh, lireTampon)
 *   .noter(passe)          grains : position au début du pas (avant le pas des émetteurs)
 *   .executer(passe, n)    après le pas des émetteurs : corps, comptage, préfixe, rangement, tri (n : rang du pas dans le
 *                          lot, décalage n × 256 du tampon des pas)
 *   .lire() -> Promise<{ corps, cles, debuts, ordre, grille, membres }>   (tests)
 *   .detruire()
 * Corps du groupe : les cases des émetteurs membres à la suite (base de chacun : somme des capacités avant lui) ; indice
 * d'un corps = base + case : l'ordre des indices est celui de la clé (émetteur, case). Comptage en additions entières
 * atomiques (seule opération atomique) ; rangement dans un ordre quelconque, puis tri de chaque cellule par indice : même
 * ordre quel que soit l'ordre des fils. Une cellule de plus de PLEINE corps est remplie d'AUCUN et ignorée pour ce pas.
 * Tampons recalculés à chaque pas : aucun n'entre dans les instantanés.
 * Navigateur seulement (Chrome, Edge) ; dépend de simulation.js (P.WGSL_COMMUN).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const CELLULES_MAX = 1 << 20;
  const PLEINE = 96;
  const OCTETS_GROUPE = 560;
  const OCTETS_CORPS = 32;
  const ITERATIONS_GRAINS = 3;
  const MEMBRES_MAX = 8;
  P.PLEINE = PLEINE;
  P.CELLULES_MAX = CELLULES_MAX;

  /** Grille fixe du voisinage : la scène (largeurCqh × 100 cqh) élargie de 25 % de chaque côté. */
  P.grilleInteractions = function (largeurCqh, cote) {
    const nx = Math.ceil(1.5 * largeurCqh / cote);
    const ny = Math.ceil(150 / cote);
    if (nx * ny > CELLULES_MAX) throw new Error('grille de voisinage de ' + nx * ny + ' cellules, au-delà de ' + CELLULES_MAX + ' : augmenter « rayon »');
    return { origine: [-0.25 * largeurCqh, -25], cote, nx, ny, n: nx * ny };
  };

  P.iterationsGroupe = function (def, membres) {
    if (def.type === 'fluide') return 2 * Math.max(...membres.map((m) => m.em.interactions.incompressibilite));
    if (def.type === 'grains') return 2 * ITERATIONS_GRAINS;
    return 0;
  };

  /** Paramètres a, b, c (12 nombres) d'un membre selon son type (contrat « Groupe »). */
  function parametres(it) {
    if (it.type === 'essaim') {
      return [it.separation, it.alignement, it.cohesion, it.fuite,
        it.vision.rayon, Math.cos(it.vision.angle / 2), it.vitesse[0], it.vitesse[1],
        it.cible ? it.cible[0] : 0, it.cible ? it.cible[1] : 0, it.cible ? 1 : 0, it.rayon];
    }
    if (it.type === 'fluide') return [it.rho0, it.viscosite, it.tension, it.incompressibilite, it.rayon, 0, 0, 0, 0, 0, 0, 0];
    return [it.frottement.statique, it.frottement.dynamique, it.cohesion, it.restitution, it.rayon, 0, 0, 0, 0, 0, 0, 0];
  }

  P.emballerGroupe = function (def, membres, grille, nCorps) {
    const b = new ArrayBuffer(OCTETS_GROUPE);
    const f = new Float32Array(b);
    const u = new Uint32Array(b);
    f[0] = grille.origine[0]; f[1] = grille.origine[1]; f[2] = grille.cote; u[3] = grille.n;
    u[4] = grille.nx; u[5] = grille.ny; u[6] = nCorps; u[7] = def.code;
    u[8] = P.iterationsGroupe(def, membres); u[9] = membres.length;
    membres.forEach((m, r) => {
      const o = 12 + r * 16;
      f.set(parametres(m.em.interactions), o);
      u[o + 12] = m.base; u[o + 13] = m.capacite; u[o + 14] = def.code;
    });
    return b;
  };

  // Pas de la simulation (48 premiers octets de chaque tranche de 256 du tampon des pas) ; le module des collisions a le
  // sien (80 octets) : les structures du groupe ne le déclarent pas.
  const WGSL_PAS = /* wgsl */ `
struct Pas { k: u32, tau0: f32, tau1: f32, dt: f32, zoneA: vec4f, zoneB: vec4f };
`;
  P.WGSL_PAS_GROUPE = WGSL_PAS;

  P.WGSL_GROUPE = /* wgsl */ `
struct ParamsMembre { a: vec4f, b: vec4f, c: vec4f, d: vec4u };
struct Groupe {
  origine: vec2f, cote: f32, nCellules: u32,
  nx: u32, ny: u32, nCorps: u32, genre: u32,
  iterations: u32, nMembres: u32, r0: u32, r1: u32,
  m: array<ParamsMembre, ${MEMBRES_MAX}>,
};
struct Membre { rang: u32, base: u32, capacite: u32, r0: u32 };
struct Corps { pos: vec2f, vel: vec2f, rayon: f32, membre: u32, n: u32, r0: u32 };
`;

  const WGSL_LIAISONS = /* wgsl */ `
const AUCUN = 0xffffffffu;
const PLEINE = ${PLEINE}u;

@group(0) @binding(0) var<uniform> P: Pas;
@group(0) @binding(1) var<uniform> GR: Groupe;
@group(0) @binding(2) var<uniform> MB: Membre;
@group(0) @binding(3) var<storage, read_write> particules: array<Particule>;
@group(0) @binding(4) var<storage, read_write> corps: array<Corps>;
@group(0) @binding(5) var<storage, read_write> cles: array<u32>;
@group(0) @binding(6) var<storage, read_write> comptes: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> debuts: array<u32>;
@group(0) @binding(8) var<storage, read_write> ordre: array<u32>;
@group(0) @binding(9) var<storage, read_write> posL: array<vec2f>;
@group(0) @binding(10) var<storage, read_write> posE: array<vec2f>;
@group(0) @binding(11) var<storage, read_write> lambdas: array<f32>;
@group(0) @binding(12) var<storage, read_write> vitesses: array<vec2f>;
@group(0) @binding(13) var<storage, read_write> anciennes: array<vec4f>;
`;

  const WGSL_GRILLE = /* wgsl */ `
var<workgroup> partielles: array<u32, 256>;

// Cellule de la grille sous le point p, ou AUCUN hors de la grille (NaN compris).
fn cellule(p: vec2f) -> u32 {
  let q = floor((p - GR.origine) / GR.cote);
  if (!(q.x >= 0.0 && q.y >= 0.0 && q.x < f32(GR.nx) && q.y < f32(GR.ny))) { return AUCUN; }
  return u32(q.y) * GR.nx + u32(q.x);
}

@compute @workgroup_size(64)
fn effacer(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x < GR.nCellules) { atomicStore(&comptes[gid.x], 0u); }
}

// Grains : position au début du pas et numéro de la particule qui occupe la case (avant le pas des émetteurs).
@compute @workgroup_size(64)
fn noter(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= MB.capacite) { return; }
  let p = particules[s];
  anciennes[MB.base + s] = vec4f(p.pos, bitcast<f32>(p.n), f32(p.vivante));
}

// Corps du groupe : état de chaque particule du membre après son pas (prédiction), cellule, comptage par cellule
// (additions entières atomiques : le total ne dépend pas de l'ordre des fils) ; position de travail initiale (posE).
@compute @workgroup_size(64)
fn rassembler(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= MB.capacite) { return; }
  let i = MB.base + s;
  let p = particules[s];
  var c = Corps(p.pos, p.vel, 0.5 * p.taille, AUCUN, p.n, 0u);
  var cle = AUCUN;
  if (p.vivante == 1u) {
    c.membre = MB.rang;
    cle = cellule(p.pos);
    if (cle != AUCUN) { atomicAdd(&comptes[cle], 1u); }
  }
  corps[i] = c;
  cles[i] = cle;
  posE[i] = p.pos;
}

// Somme préfixe exclusive des comptes (un groupe de 256 fils, une tranche contiguë de cellules par fil, balayage de
// Hillis et Steele des sommes partielles) ; debuts[n] = total ; comptes remis à zéro (curseurs du rangement).
@compute @workgroup_size(256)
fn prefixe(@builtin(local_invocation_index) li: u32) {
  let n = GR.nCellules;
  let tranche = (n + 255u) / 256u;
  let a = min(li * tranche, n);
  let b = min(a + tranche, n);
  var somme = 0u;
  for (var c = a; c < b; c++) { somme += atomicLoad(&comptes[c]); }
  partielles[li] = somme;
  workgroupBarrier();
  for (var d = 1u; d < 256u; d = d * 2u) {
    var v = 0u;
    if (li >= d) { v = partielles[li - d]; }
    workgroupBarrier();
    partielles[li] = partielles[li] + v;
    workgroupBarrier();
  }
  var debut = partielles[li] - somme;
  for (var c = a; c < b; c++) {
    let k = atomicLoad(&comptes[c]);
    debuts[c] = debut;
    debut += k;
    atomicStore(&comptes[c], 0u);
  }
  if (li == 255u) { debuts[n] = partielles[255]; }
}

// Rangement : chaque corps prend une place de sa cellule (ordre d'arrivée quelconque, trié ensuite).
@compute @workgroup_size(64)
fn ranger(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= GR.nCorps) { return; }
  let c = cles[i];
  if (c == AUCUN) { return; }
  ordre[debuts[c] + atomicAdd(&comptes[c], 1u)] = i;
}

// Tri de chaque cellule par indice croissant (insertion) : ordre (cellule, émetteur, case) indépendant des fils. Cellule
// de plus de PLEINE corps : remplie d'AUCUN (ignorée par le voisinage pour ce pas).
@compute @workgroup_size(64)
fn trier(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.nCellules) { return; }
  let a = debuts[c];
  let b = debuts[c + 1u];
  if (b - a > PLEINE) {
    for (var k = a; k < b; k++) { ordre[k] = AUCUN; }
    return;
  }
  for (var k = a + 1u; k < b; k++) {
    let x = ordre[k];
    var j = k;
    while (j > a && ordre[j - 1u] > x) {
      ordre[j] = ordre[j - 1u];
      j--;
    }
    ordre[j] = x;
  }
}
`;

  P.WGSL_VOISINAGE = P.WGSL_COMMUN + WGSL_PAS + P.WGSL_GROUPE + WGSL_LIAISONS + WGSL_GRILLE;

  // Liaisons de chaque noyau (disposition explicite : 8 tampons de stockage au plus chacune). Liaison 0 : décalage dynamique.
  const NOYAUX = {
    effacer: [1, 6],
    noter: [2, 3, 13],
    rassembler: [1, 2, 3, 4, 5, 6, 10],
    prefixe: [1, 6, 7],
    ranger: [1, 5, 6, 7, 8],
    trier: [1, 7, 8],
  };
  P.NOYAUX_VOISINAGE = NOYAUX;

  function entree(b) {
    const C = GPUShaderStage.COMPUTE;
    if (b === 0) return { binding: 0, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 } };
    if (b === 1 || b === 2) return { binding: b, visibility: C, buffer: { type: 'uniform' } };
    return { binding: b, visibility: C, buffer: { type: 'storage' } };
  }

  const parDevice = new WeakMap();
  function pipelines(device) {
    let p = parDevice.get(device);
    if (p) return p;
    const module = device.createShaderModule({ label: 'pm-voisinage', code: P.WGSL_VOISINAGE });
    p = { noyaux: {} };
    Object.keys(NOYAUX).forEach((nom) => {
      const layout = device.createBindGroupLayout({ entries: NOYAUX[nom].map(entree) });
      p.noyaux[nom] = {
        layout,
        pipeline: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint: nom } }),
      };
    });
    parDevice.set(device, p);
    return p;
  }

  class Groupe {
    constructor(device, sim, def) {
      const U = GPUBufferUsage;
      this.device = device;
      this.sim = sim;
      this.def = def;
      this.p = pipelines(device);
      let base = 0;
      this.membres = def.membres.map((i) => sim.emetteurs[i]).filter((e) => !e.inerte).map((e, rang) => {
        const m = { e, em: e.em, rang, base, capacite: e.capacite };
        base += e.capacite;
        m.uniforme = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
        device.queue.writeBuffer(m.uniforme, 0, new Uint32Array([rang, m.base, m.capacite, 0]));
        return m;
      });
      this.nCorps = base;
      if (this.nCorps > 65535 * 64) throw new Error('Interactions : ' + this.nCorps + ' particules liées dans un même groupe, au-delà de ' + 65535 * 64 + '.');
      this.grille = P.grilleInteractions(sim.largeurCqh, def.cote);
      this.iterations = P.iterationsGroupe(def, this.membres);
      const n = Math.max(1, this.nCorps);
      const S = U.STORAGE | U.COPY_SRC;
      const tampon = (octets) => device.createBuffer({ size: Math.max(16, octets), usage: S });
      this.uniforme = device.createBuffer({ size: OCTETS_GROUPE, usage: U.UNIFORM | U.COPY_DST });
      device.queue.writeBuffer(this.uniforme, 0, P.emballerGroupe(def, this.membres, this.grille, this.nCorps));
      this.corps = tampon(n * OCTETS_CORPS);
      this.cles = tampon(n * 4);
      this.comptes = tampon(this.grille.n * 4);
      this.debuts = tampon((this.grille.n + 1) * 4);
      this.ordre = tampon(n * 4);
      this.posA = tampon(n * 8);
      this.posB = tampon(n * 8);
      this.lambdas = tampon(n * 4);
      this.vitesses = tampon(n * 8);
      this.anciennes = tampon(n * 16);
      this.liaisons = new Map();
    }

    /** Ressource de la liaison b ; variante 'AB' (lecture A, écriture B) ou 'BA' ; m : membre (liaisons 2 et 3). */
    ressource(b, variante, m) {
      switch (b) {
        case 0: return { buffer: this.sim.tamponPas, size: 48 };
        case 1: return { buffer: this.uniforme };
        case 2: return { buffer: m.uniforme };
        case 3: return { buffer: m.e.particules };
        case 4: return { buffer: this.corps };
        case 5: return { buffer: this.cles };
        case 6: return { buffer: this.comptes };
        case 7: return { buffer: this.debuts };
        case 8: return { buffer: this.ordre };
        case 9: return { buffer: variante === 'BA' ? this.posB : this.posA };
        case 10: return { buffer: variante === 'BA' ? this.posA : this.posB };
        case 11: return { buffer: this.lambdas };
        case 12: return { buffer: this.vitesses };
        default: return { buffer: this.anciennes };
      }
    }

    /** Groupe de liaisons d'un noyau, créé une fois par (noyau, variante, membre). */
    liaison(nom, variante, m) {
      const cle = nom + '|' + variante + '|' + (m ? m.rang : -1);
      let g = this.liaisons.get(cle);
      if (!g) {
        g = this.device.createBindGroup({
          layout: this.p.noyaux[nom].layout,
          entries: NOYAUX[nom].map((b) => ({ binding: b, resource: this.ressource(b, variante, m) })),
        });
        this.liaisons.set(cle, g);
      }
      return g;
    }

    /** Dispatch d'un noyau : liaison 0 au pas n du lot quand le noyau la lit. */
    lancer(passe, nom, variante, m, groupes, n) {
      passe.setPipeline(this.p.noyaux[nom].pipeline);
      if (NOYAUX[nom][0] === 0) passe.setBindGroup(0, this.liaison(nom, variante, m), [n * 256]);
      else passe.setBindGroup(0, this.liaison(nom, variante, m));
      passe.dispatchWorkgroups(Math.max(1, groupes));
    }

    /** Grains : positions au début du pas (avant le pas des émetteurs). */
    noter(passe) {
      if (this.def.type !== 'grains') return;
      for (const m of this.membres) this.lancer(passe, 'noter', 'AB', m, Math.ceil(m.capacite / 64), 0);
    }

    /** Voisinage du pas n du lot : corps, comptage, préfixe, rangement, tri. */
    executer(passe, n) {
      const cellules = Math.ceil(this.grille.n / 64);
      this.lancer(passe, 'effacer', 'AB', null, cellules, n);
      for (const m of this.membres) this.lancer(passe, 'rassembler', 'BA', m, Math.ceil(m.capacite / 64), n);
      this.lancer(passe, 'prefixe', 'AB', null, 1, n);
      this.lancer(passe, 'ranger', 'AB', null, Math.ceil(this.nCorps / 64), n);
      this.lancer(passe, 'trier', 'AB', null, cellules, n);
    }

    /** Voisinage du dernier pas (tests) ; ordre réduit aux places écrites ce pas-ci (au-delà : restes de pas antérieurs). */
    async lire() {
      const [corps, cles, debuts, ordre] = await Promise.all([this.corps, this.cles, this.debuts, this.ordre].map((b) => this.sim.lireTampon(b)));
      const n = Math.max(1, this.nCorps);
      const d = new Uint32Array(debuts.buffer).slice(0, this.grille.n + 1);
      return {
        corps: corps.slice(0, n * 8),
        cles: new Uint32Array(cles.buffer).slice(0, this.nCorps),
        debuts: d,
        ordre: new Uint32Array(ordre.buffer).slice(0, d[this.grille.n]),
        grille: this.grille,
        membres: this.membres.map((m) => ({ emetteur: m.em.index, base: m.base, capacite: m.capacite })),
      };
    }

    detruire() {
      [this.uniforme, this.corps, this.cles, this.comptes, this.debuts, this.ordre, this.posA, this.posB, this.lambdas, this.vitesses, this.anciennes]
        .forEach((b) => b.destroy());
      this.membres.forEach((m) => m.uniforme.destroy());
      this.liaisons.clear();
    }
  }

  P.Groupe = Groupe;
})(typeof globalThis !== 'undefined' ? globalThis : this);
