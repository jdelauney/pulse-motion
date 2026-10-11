/* Pulse Motion – simulation des particules sur le GPU (WebGPU).
 *
 * new P.Simulation(device, effet)   effet : recette compilée (plan 1)
 *   .avancer(tau, zones) -> deltas  amène chaque émetteur à τ ; δ = τ − k/120 pour les simulés, 0 pour la voie rapide
 *   .lireEtat(i)          -> Promise<Float32Array> (16 nombres par case, disposition « Particule »)
 *   .detruire()
 * zones.a(τ) et zones.grille(g) -> [x, y, largeur, hauteur] en cqh (zone d'émission à τ, au point g / 30 de la grille).
 *
 * Pas fixe de 1/120 s de τ, intégrateur exponentiel (exact pour gravité et traînée linéaire),
 * naissances calculées, aucune opération atomique, instantanés pour revenir en arrière.
 * Hachage PCG d'après M. O'Neill (pcg-random.org, domaine public).
 * Navigateur seulement (Chrome, Edge) ; dépend de instantanes.js (M.instantanes).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const PAS = 1 / 120;
  const GRILLE = 30;
  const E_TAILLE = 136;
  const TABLES = 448;
  const OCTETS_PARTICULE = 64;
  const OCTETS_MORT = 32;
  const PAS_PAR_LOT = 256;
  const BUDGET_INSTANTANES = 256 * 1024 * 1024;
  P.PAS = PAS;
  P.GRILLE = GRILLE;

  P.WGSL_COMMUN = /* wgsl */ `
struct Particule {
  pos: vec2f, z: f32, age: f32,
  vel: vec2f, vie: f32, taille: f32,
  masse: f32, rot: f32, vrot: f32, alea: f32,
  n: u32, gen: u32, vivante: u32, naissance: f32,
};

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

// Hasard reproductible dans [0, 1) : graine de l'effet, émetteur, numéro de naissance, canal.
fn alea(graine: u32, emetteur: u32, n: u32, canal: u32) -> f32 {
  let h = pcg(graine ^ pcg(emetteur ^ pcg(n ^ pcg(canal))));
  return f32(h >> 8u) / 16777216.0;
}
`;

  const WGSL_SIMULATION = P.WGSL_COMMUN + /* wgsl */ `
struct Mort { pos: vec2f, vel: vec2f, t: f32, n: u32, gen: u32, pas: u32 };
struct Pas { k: u32, tau0: f32, tau1: f32, dt: f32, zoneA: vec4f, zoneB: vec4f };
struct Eval { tau: f32, nZones: u32, a: u32, b: u32 };
struct Naissance { ok: bool, n: u32, gen: u32, t: f32, pos: vec2f, vel: vec2f };
struct Etat { pos: vec2f, vel: vec2f };

@group(0) @binding(0) var<storage, read> E: array<f32>;
@group(0) @binding(1) var<storage, read_write> particules: array<Particule>;
@group(0) @binding(2) var<storage, read> mortsParent: array<Mort>;
@group(0) @binding(3) var<storage, read_write> morts: array<Mort>;
@group(0) @binding(4) var<uniform> P: Pas;
@group(0) @binding(5) var<uniform> V: Eval;
@group(0) @binding(6) var<storage, read> zones: array<vec4f>;

fn ef(i: u32) -> f32 { return E[i]; }
fn eu(i: u32) -> u32 { return bitcast<u32>(E[i]); }

fn bruitCoin(c: vec3f) -> f32 {
  let q = vec3u(vec3i(c));
  return f32(pcg(q.x ^ pcg(q.y ^ pcg(q.z))) >> 8u) / 8388608.0 - 1.0;
}

// Bruit de valeurs 3D lissé, dans [-1, 1].
fn bruit(p: vec3f) -> f32 {
  let c = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(bruitCoin(c), bruitCoin(c + vec3f(1.0, 0.0, 0.0)), u.x);
  let b = mix(bruitCoin(c + vec3f(0.0, 1.0, 0.0)), bruitCoin(c + vec3f(1.0, 1.0, 0.0)), u.x);
  let d = mix(bruitCoin(c + vec3f(0.0, 0.0, 1.0)), bruitCoin(c + vec3f(1.0, 0.0, 1.0)), u.x);
  let e = mix(bruitCoin(c + vec3f(0.0, 1.0, 1.0)), bruitCoin(c + vec3f(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(d, e, u.y), u.z);
}

// Rotationnel 2D d'un bruit 3D (x, y, temps) : écoulement sans source ni puits.
fn curl(p: vec2f, t: f32) -> vec2f {
  let h = 0.01;
  let dy = bruit(vec3f(p.x, p.y + h, t)) - bruit(vec3f(p.x, p.y - h, t));
  let dx = bruit(vec3f(p.x + h, p.y, t)) - bruit(vec3f(p.x - h, p.y, t));
  return vec2f(dy, -dx) / (2.0 * h);
}

// v' = A − K v sur une durée t, exact (miroir de forme-close.js).
fn balistique(p: vec2f, v: vec2f, A: vec2f, K: f32, t: f32) -> Etat {
  let x = K * t;
  var f: f32;
  var g: f32;
  if (x < 0.1) {
    let x2 = x * x;
    f = t * (1.0 - x * 0.5 + x2 / 6.0 - x2 * x / 24.0 + x2 * x2 / 120.0 - x2 * x2 * x / 720.0);
    g = t * t * (0.5 - x / 6.0 + x2 / 24.0 - x2 * x / 120.0 + x2 * x2 / 720.0 - x2 * x2 * x / 5040.0);
  } else {
    f = (1.0 - exp(-x)) / K;
    g = (t - f) / K;
  }
  return Etat(p + v * f + A * g, v * (1.0 - K * f) + A * f);
}

fn pointContour(u: f32, W: f32, H: f32) -> vec2f {
  let per = 2.0 * (W + H);
  if (per <= 0.0) { return vec2f(0.0); }
  var d = u * per;
  if (d < W) { return vec2f(d - 0.5 * W, -0.5 * H); }
  d -= W;
  if (d < H) { return vec2f(0.5 * W, d - 0.5 * H); }
  d -= H;
  if (d < W) { return vec2f(0.5 * W - d, 0.5 * H); }
  d -= W;
  return vec2f(-0.5 * W, 0.5 * H - d);
}

// Point de naissance tiré dans la forme, centrée sur « centre », taille de zone « wh ».
fn forme(centre: vec2f, wh: vec2f, g: u32, e: u32, n: u32) -> vec2f {
  let code = eu(31u);
  let contour = eu(32u) == 1u;
  let u = alea(g, e, n, 0u);
  let v = alea(g, e, n, 1u);
  var q = vec2f(0.0);
  switch code {
    case 1u, 2u: {
      var R = ef(33u);
      if (R < 0.0) { R = 0.5 * min(wh.x, wh.y); }
      var r = R;
      if (code == 2u) {
        if (!contour) { let ri = ef(34u); r = sqrt(mix(ri * ri, R * R, v)); }
      } else if (!contour) {
        r = R * sqrt(v);
      }
      let th = 6.2831853 * u;
      q = vec2f(cos(th), sin(th)) * r;
    }
    case 3u, 5u: {
      var W = wh.x;
      var H = wh.y;
      if (code == 3u) {
        if (ef(35u) >= 0.0) { W = ef(35u); }
        if (ef(36u) >= 0.0) { H = ef(36u); }
      }
      if (contour) { q = pointContour(u, W, H); } else { q = vec2f((u - 0.5) * W, (v - 0.5) * H); }
    }
    case 4u: {
      var L = ef(35u);
      if (L < 0.0) { L = wh.x; }
      q = vec2f((u - 0.5) * L, 0.0);
    }
    default: { }
  }
  let a = ef(37u);
  return centre + vec2f(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
}

fn naissanceVide() -> Naissance { return Naissance(false, 0u, 0u, 0.0, vec2f(0.0), vec2f(0.0)); }

// Occupant d'une case racine parmi les naissances strictement avant tau (miroir de naissances.js).
fn occupant(s: u32, tau: f32) -> Naissance {
  var r = naissanceVide();
  let capC = eu(1u);
  let nTot = eu(2u);
  if (s < capC) {
    let nes = min(nTot, u32(max(ceil(tau * ef(4u)), 0.0)));
    if (nes > s) {
      let n = s + capC * ((nes - 1u - s) / capC);
      r.ok = true; r.n = n; r.gen = n / capC; r.t = f32(n) / ef(4u);
    }
    return r;
  }
  for (var i = 0u; i < eu(3u); i++) {
    let b = 40u + i * 4u;
    let debut = eu(b + 2u);
    if (s >= debut && s < debut + eu(b + 1u)) {
      if (ef(b) < tau) { r.ok = true; r.n = nTot + (s - capC); r.gen = 0u; r.t = ef(b); }
      return r;
    }
  }
  return r;
}

// Naissance dans la case s pendant le pas [tau0, tau1) : racine, ou enfant d'une mort du parent.
fn naissanceDuPas(s: u32) -> Naissance {
  let k = eu(7u);
  if (k == 0u) {
    var r = occupant(s, P.tau1);
    if (r.ok) {
      let capC = eu(1u);
      if (s < capC) {
        if (r.n < min(eu(2u), u32(max(ceil(P.tau0 * ef(4u)), 0.0)))) { r.ok = false; }
      } else if (r.t < P.tau0) { r.ok = false; }
    }
    return r;
  }
  let G = eu(8u);
  let m = mortsParent[s / (k * G)];
  var r = naissanceVide();
  if (m.pas == P.k + 1u && m.gen % G == (s / k) % G) {
    r.ok = true;
    r.n = m.n * k + s % k;
    r.gen = m.gen / G;
    r.t = clamp(m.t, P.tau0, P.tau1);
    r.pos = m.pos;
    r.vel = m.vel;
  }
  return r;
}

fn initialiser(ne: Naissance, zone: vec4f) -> Particule {
  let g = eu(5u);
  let e = eu(6u);
  let n = ne.n;
  var p: Particule;
  p.n = n; p.gen = ne.gen; p.vivante = 1u; p.naissance = ne.t; p.age = 0.0;
  p.vie = mix(ef(12u), ef(13u), alea(g, e, n, 5u));
  p.taille = mix(ef(14u), ef(15u), alea(g, e, n, 6u));
  p.masse = mix(ef(16u), ef(17u), alea(g, e, n, 7u));
  p.z = mix(ef(18u), ef(19u), alea(g, e, n, 8u));
  p.rot = mix(ef(20u), ef(21u), alea(g, e, n, 9u));
  p.vrot = mix(ef(22u), ef(23u), alea(g, e, n, 10u));
  p.alea = alea(g, e, n, 11u);
  let decalage = vec2f(ef(38u), ef(39u));
  var centre = zone.xy + 0.5 * zone.zw + decalage;
  var taille = zone.zw;
  if (eu(7u) > 0u) { centre = ne.pos + decalage; taille = vec2f(0.0); }
  let origine = forme(centre, taille, g, e, n);
  var base = vec2f(ef(26u), ef(27u));
  if (eu(29u) == 1u) {
    let d = origine - centre;
    if (dot(d, d) > 1e-10) { base = normalize(d); }
  }
  let angle = atan2(base.y, base.x) + (alea(g, e, n, 3u) - 0.5) * ef(28u);
  p.pos = origine;
  p.vel = vec2f(cos(angle), sin(angle)) * mix(ef(24u), ef(25u), alea(g, e, n, 4u)) + ef(30u) * ne.vel;
  return p;
}

// Avance une particule de dt : forces prises constantes sur le pas, traînée intégrée exactement.
fn integrer(pIn: Particule, dt: f32, t: f32, zone: vec4f) -> Particule {
  var p = pIn;
  var A = vec2f(0.0);
  var K = 0.0;
  let invm = 1.0 / p.masse;
  for (var i = 0u; i < eu(11u); i++) {
    let b = 72u + i * 8u;
    let code = eu(b);
    switch code {
      case 0u: { A += vec2f(ef(b + 2u), ef(b + 3u)); }
      case 1u: {
        var c = ef(b + 2u);
        if (eu(b + 1u) == 1u) { c = c * length(p.vel); }
        K += c * invm;
      }
      case 2u: {
        let c = ef(b + 4u) * invm;
        K += c;
        A += c * vec2f(ef(b + 2u), ef(b + 3u));
      }
      case 3u: { A += ef(b + 3u) * invm * curl(p.pos / ef(b + 2u), t * ef(b + 4u)); }
      case 4u, 5u: {
        let centre = zone.xy + zone.zw * vec2f(ef(b + 4u), ef(b + 5u));
        let d = centre - p.pos;
        let R = ef(b + 3u);
        let f = ef(b + 2u) * R / (dot(d, d) + R * R) * invm;
        if (code == 4u) { A += f * d; } else { A += f * vec2f(-d.y, d.x); }
      }
      case 6u: {
        let centre = zone.xy + zone.zw * vec2f(ef(b + 4u), ef(b + 5u));
        A += -ef(b + 2u) * invm * (p.pos - centre);
        K += ef(b + 3u) * invm;
      }
      default: { }
    }
  }
  let r = balistique(p.pos, p.vel, A, K, dt);
  p.pos = r.pos;
  p.vel = r.vel;
  p.rot = p.rot + p.vrot * dt;
  return p;
}

fn mourir(pIn: Particule, s: u32) -> Particule {
  var p = pIn;
  p.vivante = 0u;
  if (eu(10u) == 1u) { morts[s] = Mort(p.pos, p.vel, p.naissance + p.vie, p.n, p.gen, P.k + 1u); }
  return p;
}

@compute @workgroup_size(64)
fn pas(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= eu(0u)) { return; }
  var p = particules[s];
  if (p.vivante == 1u) {
    p = integrer(p, P.dt, P.tau0, P.zoneA);
    p.age += P.dt;
    if (p.age >= p.vie) { p = mourir(p, s); }
  }
  let ne = naissanceDuPas(s);
  if (ne.ok) {
    let z = mix(P.zoneA, P.zoneB, clamp((ne.t - P.tau0) / P.dt, 0.0, 1.0));
    p = initialiser(ne, z);
    let reste = P.tau1 - ne.t;
    p = integrer(p, reste, ne.t, z);
    p.age = reste;
    if (p.age >= p.vie) { p = mourir(p, s); }
  }
  particules[s] = p;
}

fn zoneGrille(t: f32) -> vec4f {
  let x = max(t, 0.0) * 30.0;
  let i = min(u32(floor(x)), V.nZones - 1u);
  let j = min(i + 1u, V.nZones - 1u);
  return mix(zones[i], zones[j], fract(x));
}

// Voie rapide : état à τ exact, en forme close, sans pas ni instantanés.
@compute @workgroup_size(64)
fn evaluer(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= eu(0u)) { return; }
  var p: Particule;
  p.vivante = 0u;
  let ne = occupant(s, V.tau);
  if (ne.ok) {
    let q = initialiser(ne, zoneGrille(ne.t));
    let age = V.tau - ne.t;
    if (age < q.vie) {
      var A = vec2f(0.0);
      var K = 0.0;
      for (var i = 0u; i < eu(11u); i++) {
        let b = 72u + i * 8u;
        if (eu(b) == 0u) { A += vec2f(ef(b + 2u), ef(b + 3u)); }
        if (eu(b) == 1u) { K += ef(b + 2u) / q.masse; }
      }
      let r = balistique(q.pos, q.vel, A, K, age);
      p = q;
      p.pos = r.pos;
      p.vel = r.vel;
      p.age = age;
      p.rot = q.rot + q.vrot * age;
    }
  }
  particules[s] = p;
}
`;

  function parametresForce(f) {
    switch (f.type) {
      case 'gravite': return [f.a[0], f.a[1]];
      case 'trainee': return [f.coef];
      case 'vent': return [f.vitesse[0], f.vitesse[1], f.coef];
      case 'turbulence': return [f.echelle, f.force, f.vitesse];
      case 'attracteur': case 'vortex': return [f.force, f.rayon, f.centre[0], f.centre[1]];
      default: return [f.raideur, f.amortissement, f.centre[0], f.centre[1]];
    }
  }

  /** Paramètres d'un émetteur (disposition « E » : 136 mots). */
  function emballer(em, effet) {
    const tampon = new ArrayBuffer(E_TAILLE * 4);
    const f = new Float32Array(tampon);
    const u = new Uint32Array(tampon);
    u[0] = em.capacite; u[1] = em.capContinu; u[2] = em.nTotal; u[3] = em.salves.length;
    f[4] = em.debit; u[5] = effet.graine; u[6] = em.index; u[7] = em.k;
    u[8] = em.G; u[9] = em.parent >= 0 ? effet.emetteurs[em.parent].capacite : 0; u[10] = em.aLaMort >= 0 ? 1 : 0; u[11] = em.forces.length;
    f.set([em.vie[0], em.vie[1], em.taille[0], em.taille[1], em.masse[0], em.masse[1], em.z[0], em.z[1],
      em.rotation[0], em.rotation[1], em.vitesseAngulaire[0], em.vitesseAngulaire[1],
      em.vitesse.valeur[0], em.vitesse.valeur[1], em.vitesse.direction[0], em.vitesse.direction[1]], 12);
    f[28] = em.vitesse.cone; u[29] = em.vitesse.radiale ? 1 : 0; f[30] = em.vitesse.heritage; u[31] = em.forme.code;
    u[32] = em.forme.contour ? 1 : 0; f[33] = em.forme.rayon; f[34] = em.forme.rayonInterieur; f[35] = em.forme.largeur;
    f[36] = em.forme.hauteur; f[37] = em.forme.angle; f[38] = em.forme.decalage[0]; f[39] = em.forme.decalage[1];
    em.salves.forEach((s, i) => { f[40 + i * 4] = s.t; u[41 + i * 4] = s.nombre; u[42 + i * 4] = s.debut; });
    em.forces.forEach((fo, i) => {
      const b = 72 + i * 8;
      u[b] = fo.code;
      u[b + 1] = fo.quadratique ? 1 : 0;
      f.set(parametresForce(fo), b + 2);
    });
    return tampon;
  }

  function tables(em) {
    const t = new Float32Array(TABLES);
    t.set(em.tables.couleur, 0);
    t.set(em.tables.taille, 256);
    t.set(em.tables.intensite, 320);
    t.set(em.tables.opacite, 384);
    return t;
  }

  function tamponAvec(device, octets, usage, contenu) {
    const b = device.createBuffer({ size: Math.max(16, octets), usage });
    if (contenu) device.queue.writeBuffer(b, 0, contenu);
    return b;
  }

  const parDevice = new WeakMap();
  function pipelinesPour(device) {
    let p = parDevice.get(device);
    if (p) return p;
    const module = device.createShaderModule({ label: 'pm-simulation', code: WGSL_SIMULATION });
    const C = GPUShaderStage.COMPUTE;
    const layoutPas = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: C, buffer: { type: 'storage' } },
        { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: C, buffer: { type: 'storage' } },
        { binding: 4, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 } },
      ],
    });
    const U = GPUBufferUsage;
    p = {
      layoutPas,
      pas: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layoutPas] }), compute: { module, entryPoint: 'pas' } }),
      evaluer: device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'evaluer' } }),
      videLecture: device.createBuffer({ size: OCTETS_MORT, usage: U.STORAGE }),
      videEcriture: device.createBuffer({ size: OCTETS_MORT, usage: U.STORAGE }),
    };
    parDevice.set(device, p);
    return p;
  }

  class Simulation {
    constructor(device, effet) {
      const U = GPUBufferUsage;
      this.device = device;
      this.effet = effet;
      this.p = pipelinesPour(device);
      this.emetteurs = effet.emetteurs.map((em) => {
        const capacite = Math.max(1, em.capacite);
        return {
          em,
          rapide: em.voieRapide,
          capacite,
          params: tamponAvec(device, E_TAILLE * 4, U.STORAGE | U.COPY_DST, emballer(em, effet)),
          tables: tamponAvec(device, TABLES * 4, U.STORAGE | U.COPY_DST, tables(em)),
          particules: device.createBuffer({ size: capacite * OCTETS_PARTICULE, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }),
          morts: em.aLaMort >= 0 ? device.createBuffer({ size: capacite * OCTETS_MORT, usage: U.STORAGE | U.COPY_DST }) : null,
          uniformeRendu: device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }),
        };
      });

      // Émetteurs simulés, parents avant enfants.
      this.simules = this.emetteurs.filter((e) => !e.rapide).sort((a, b) => a.em.profondeur - b.em.profondeur || a.em.index - b.em.index);
      this.tamponPas = device.createBuffer({ size: 256 * PAS_PAR_LOT, usage: U.UNIFORM | U.COPY_DST });
      this.simules.forEach((e) => {
        const parent = e.em.parent >= 0 ? this.emetteurs[e.em.parent] : null;
        e.groupePas = device.createBindGroup({
          layout: this.p.layoutPas,
          entries: [
            { binding: 0, resource: { buffer: e.params } },
            { binding: 1, resource: { buffer: e.particules } },
            { binding: 2, resource: { buffer: parent ? parent.morts : this.p.videLecture } },
            { binding: 3, resource: { buffer: e.morts || this.p.videEcriture } },
            { binding: 4, resource: { buffer: this.tamponPas, size: 48 } },
          ],
        });
      });

      // Voie rapide : zones de la grille (points g / 30) envoyées au GPU.
      this.nZones = Math.ceil(effet.fin * GRILLE) + 2;
      this.zones = new Float32Array(this.nZones * 4);
      this.zonesConnues = new Uint8Array(this.nZones);
      this.rapides = this.emetteurs.filter((e) => e.rapide);
      if (this.rapides.length) {
        this.tamponZones = device.createBuffer({ size: this.nZones * 16, usage: U.STORAGE | U.COPY_DST });
        this.rapides.forEach((e) => {
          e.uniformeEval = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
          e.groupeEval = device.createBindGroup({
            layout: this.p.evaluer.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: e.params } },
              { binding: 1, resource: { buffer: e.particules } },
              { binding: 5, resource: { buffer: e.uniformeEval } },
              { binding: 6, resource: { buffer: this.tamponZones } },
            ],
          });
        });
      }

      this.kFin = Math.ceil(effet.fin / PAS) + 1;
      const tailleEtat = this.simules.reduce((s, e) => s + e.capacite * OCTETS_PARTICULE, 0);
      this.planificateur = M.instantanes.creerPlanificateur({
        intervalle: M.instantanes.intervallePour({ tailleEtat, pasTotal: this.kFin, budget: BUDGET_INSTANTANES }),
      });
      this.instantanes = new Map();
    }

    avancer(tau, zones) {
      const k = Math.min(this.kFin, Math.max(0, Math.floor(tau / PAS + 1e-6)));
      const delta = Math.max(0, tau - k * PAS);
      if (this.simules.length) this.executer(this.planificateur.planifier(k), zones);
      if (this.rapides.length) this.evaluer(tau, zones);
      return this.emetteurs.map((e) => (e.rapide ? 0 : delta));
    }

    executer(actions, zones) {
      if (!actions.length) return;
      const { device } = this;
      const donnees = new ArrayBuffer(256 * PAS_PAR_LOT);
      const u = new Uint32Array(donnees);
      const f = new Float32Array(donnees);
      let enc = null;
      let passe = null;
      let n = 0;
      const ouvrir = () => { if (!enc) enc = device.createCommandEncoder(); };
      const fermerPasse = () => { if (passe) { passe.end(); passe = null; } };
      const envoyer = () => {
        fermerPasse();
        if (!enc) return;
        if (n) device.queue.writeBuffer(this.tamponPas, 0, donnees, 0, n * 256);
        device.queue.submit([enc.finish()]);
        enc = null;
        n = 0;
      };
      for (const a of actions) {
        if (a.type === 'pas') {
          if (n === PAS_PAR_LOT) envoyer();
          ouvrir();
          const o = n * 64;
          const tau0 = Math.fround(a.k * PAS);
          const tau1 = Math.fround((a.k + 1) * PAS);
          u[o] = a.k;
          f[o + 1] = tau0;
          f[o + 2] = tau1;
          f[o + 3] = tau1 - tau0;
          f.set(zones.a(a.k * PAS), o + 4);
          f.set(zones.a((a.k + 1) * PAS), o + 8);
          if (!passe) passe = enc.beginComputePass();
          passe.setPipeline(this.p.pas);
          for (const e of this.simules) {
            passe.setBindGroup(0, e.groupePas, [n * 256]);
            passe.dispatchWorkgroups(Math.ceil(e.capacite / 64));
          }
          n++;
          continue;
        }
        ouvrir();
        fermerPasse();
        if (a.type === 'vider') {
          this.simules.forEach((e) => { enc.clearBuffer(e.particules); if (e.morts) enc.clearBuffer(e.morts); });
        } else if (a.type === 'restaurer') {
          const copie = this.instantanes.get(a.k);
          this.simules.forEach((e, i) => enc.copyBufferToBuffer(copie[i], 0, e.particules, 0, e.capacite * OCTETS_PARTICULE));
        } else if (a.type === 'sauver') {
          let copie = this.instantanes.get(a.k);
          if (!copie) {
            copie = this.simules.map((e) => device.createBuffer({ size: e.capacite * OCTETS_PARTICULE, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
            this.instantanes.set(a.k, copie);
          }
          this.simules.forEach((e, i) => enc.copyBufferToBuffer(e.particules, 0, copie[i], 0, e.capacite * OCTETS_PARTICULE));
        }
      }
      envoyer();
    }

    evaluer(tau, zones) {
      const { device } = this;
      const gMax = Math.min(this.nZones - 1, Math.floor(tau * GRILLE) + 1);
      let gMin = gMax;
      this.rapides.forEach((e) => { gMin = Math.min(gMin, Math.floor(Math.max(0, tau - e.em.vie[1]) * GRILLE)); });
      let change = false;
      for (let g = Math.max(0, gMin); g <= gMax; g++) {
        if (this.zonesConnues[g]) continue;
        this.zones.set(zones.grille(g), g * 4);
        this.zonesConnues[g] = 1;
        change = true;
      }
      if (change) device.queue.writeBuffer(this.tamponZones, 0, this.zones);
      const enc = device.createCommandEncoder();
      const passe = enc.beginComputePass();
      passe.setPipeline(this.p.evaluer);
      this.rapides.forEach((e) => {
        const v = new ArrayBuffer(16);
        new Float32Array(v)[0] = tau;
        new Uint32Array(v)[1] = this.nZones;
        device.queue.writeBuffer(e.uniformeEval, 0, v);
        passe.setBindGroup(0, e.groupeEval);
        passe.dispatchWorkgroups(Math.ceil(e.capacite / 64));
      });
      passe.end();
      device.queue.submit([enc.finish()]);
    }

    async lireEtat(i) {
      const e = this.emetteurs[i];
      const octets = e.capacite * OCTETS_PARTICULE;
      const lecture = this.device.createBuffer({ size: octets, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(e.particules, 0, lecture, 0, octets);
      this.device.queue.submit([enc.finish()]);
      await lecture.mapAsync(GPUMapMode.READ);
      const copie = new Float32Array(lecture.getMappedRange().slice(0));
      lecture.unmap();
      lecture.destroy();
      return copie;
    }

    detruire() {
      this.emetteurs.forEach((e) => [e.params, e.tables, e.particules, e.morts, e.uniformeRendu, e.uniformeEval].forEach((b) => b && b.destroy()));
      this.instantanes.forEach((copie) => copie.forEach((b) => b.destroy()));
      this.instantanes.clear();
      this.tamponPas.destroy();
      if (this.tamponZones) this.tamponZones.destroy();
    }
  }

  P.Simulation = Simulation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
