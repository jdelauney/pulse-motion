/* Pulse Motion – simulation des particules sur le GPU (WebGPU).
 *
 * new P.Simulation(device, effet, monde?)   effet : recette compilée ; monde : obstacles de l'effet (collisions), facultatif
 *   monde = { entrees: [{ type, categorie, forme, profil }], largeurCqh, actif, formes?: { vue } }   (obstacles.js)
 *   .avancer(tau, zones) -> deltas  amène chaque émetteur à τ ; δ = τ − k/120 pour les simulés, 0 pour la voie rapide
 *   .lireEtat(i)          -> Promise<Float32Array> (16 nombres par case, disposition « Particule »)
 *   .lireHistorique(i)    -> Promise<Float32Array> (2 nombres par entrée de traînée)
 *   .lireContacts(i)      -> Promise<Float32Array> (8 nombres par case, disposition « Contact » ; vide sans collisions)
 *   .detruire()
 * zones.a(τ) et zones.grille(g) -> [x, y, largeur, hauteur] en cqh (zone d'émission à τ, au point g / 30 de la grille) ;
 * zones.reperes(g) -> Float32Array (8 nombres par obstacle de monde.entrees, disposition « Repere » de obstacles.js)
 * au point g de la grille ; demandé seulement quand un émetteur a des collisions actives.
 *
 * Pas fixe de 1/120 s de τ, intégrateur exponentiel (exact pour gravité et traînée linéaire), naissances calculées,
 * instantanés pour revenir en arrière. Collisions (monde actif et recette avec « collisions ») : test balayé du
 * déplacement de chaque pas contre les obstacles, dans leur repère local aux deux bouts du pas ; rebond, pose (la
 * particule suit son obstacle), mort au contact ; impacts notés pour « a_la_collision ». Événements d'un parent :
 * morts dans les cases [0, capacité), impacts dans [capacité, 2 × capacité).
 * Hachage PCG d'après M. O'Neill (pcg-random.org, domaine public).
 * Navigateur seulement (Chrome, Edge) ; dépend de instantanes.js (M.instantanes) et, avec un monde, de obstacles.js.
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const PAS = 1 / 120;
  const GRILLE = 30;
  const E_TAILLE = 160;
  const TABLES = 448;
  const OCTETS_PARTICULE = 64;
  const OCTETS_MORT = 48;
  const OCTETS_CONTACT = 32;
  const PAS_PAR_LOT = 256;
  const BUDGET_INSTANTANES = 256 * 1024 * 1024;
  const LIGNES_REPERES = 8192;
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

  const WGSL_STRUCTS = /* wgsl */ `
struct Mort { pos: vec2f, vel: vec2f, t: f32, n: u32, gen: u32, pas: u32, normale: vec2f, r0: u32, r1: u32 };
struct Eval { tau: f32, nZones: u32, a: u32, b: u32 };
struct Naissance { ok: bool, n: u32, gen: u32, t: f32, pos: vec2f, vel: vec2f, normale: vec2f };
struct Etat { pos: vec2f, vel: vec2f };
`;

  const WGSL_DECL_P1 = /* wgsl */ `
struct Pas { k: u32, tau0: f32, tau1: f32, dt: f32, zoneA: vec4f, zoneB: vec4f };
@group(0) @binding(0) var<storage, read> E: array<f32>;
@group(0) @binding(1) var<storage, read_write> particules: array<Particule>;
@group(0) @binding(2) var<storage, read> mortsParent: array<Mort>;
@group(0) @binding(3) var<storage, read_write> morts: array<Mort>;
@group(0) @binding(4) var<uniform> P: Pas;
@group(0) @binding(5) var<uniform> V: Eval;
@group(0) @binding(6) var<storage, read> zones: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> historique: array<vec2f>;
`;

  const WGSL_FONCTIONS = /* wgsl */ `
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

fn naissanceVide() -> Naissance { return Naissance(false, 0u, 0u, 0.0, vec2f(0.0), vec2f(0.0), vec2f(0.0)); }

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

// Naissance dans la case s pendant le pas [tau0, tau1) : racine, ou enfant d'une mort (ou d'un impact) du parent.
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
  let m = mortsParent[eu(137u) + s / (k * G)];
  var r = naissanceVide();
  if (m.pas == P.k + 1u && m.gen % G == (s / k) % G) {
    r.ok = true;
    r.n = m.n * k + s % k;
    r.gen = m.gen / G;
    r.t = clamp(m.t, P.tau0, P.tau1);
    r.pos = m.pos;
    r.vel = m.vel;
    r.normale = m.normale;
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
  if (dot(ne.normale, ne.normale) > 0.25) {
    // Enfant d'un impact : direction donnée dans le repère de la surface ([0, -1] = le long de la normale).
    let nn = ne.normale;
    base = vec2f(-nn.y * base.x - nn.x * base.y, nn.x * base.x - nn.y * base.y);
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
  if (eu(10u) == 1u) { morts[s] = Mort(p.pos, p.vel, p.naissance + p.vie, p.n, p.gen, P.k + 1u, vec2f(0.0), 0u, 0u); }
  return p;
}
`;

  const WGSL_ENTREES_P1 = /* wgsl */ `
@compute @workgroup_size(64)
fn pas(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= eu(0u)) { return; }
  let N = eu(136u);
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
    for (var i = 0u; i < N; i++) { historique[s * N + i] = p.pos; }
    let reste = P.tau1 - ne.t;
    p = integrer(p, reste, ne.t, z);
    p.age = reste;
    if (p.age >= p.vie) { p = mourir(p, s); }
  }
  // Traînée : une position tous les 2 pas (1/60 s de τ).
  if (N > 0u && p.vivante == 1u && (P.k + 1u) % 2u == 0u) {
    historique[s * N + ((P.k + 1u) / 2u) % N] = p.pos;
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

  const WGSL_DECL_C = /* wgsl */ `
struct Pas { k: u32, tau0: f32, tau1: f32, dt: f32, zoneA: vec4f, zoneB: vec4f, largeurs: array<vec4f, 2> };
struct Monde { n: u32, nGrille: u32, largeur: f32, nProfils: u32, tans: array<vec4f, 2>, o: array<vec4u, 48> };
struct Contact { local: vec2f, obstacle: u32, pose: f32, impact: f32, nImpacts: u32, opacite: f32, cellule: u32 };
@group(0) @binding(0) var<storage, read> E: array<f32>;
@group(0) @binding(1) var<storage, read_write> particules: array<Particule>;
@group(0) @binding(2) var<storage, read> mortsParent: array<Mort>;
@group(0) @binding(3) var<storage, read_write> morts: array<Mort>;
@group(0) @binding(4) var<uniform> P: Pas;
@group(0) @binding(7) var<storage, read_write> historique: array<vec2f>;
@group(0) @binding(8) var<storage, read_write> contacts: array<Contact>;
@group(0) @binding(9) var<storage, read_write> profils: array<atomic<u32>>;
@group(0) @binding(10) var<storage, read> hauteurs: array<f32>;
@group(0) @binding(11) var<uniform> Mo: Monde;
@group(0) @binding(12) var reperes: texture_2d_array<f32>;
@group(0) @binding(13) var sdf: texture_2d_array<f32>;
@group(0) @binding(14) var lisse: sampler;
`;

  const WGSL_COLLISIONS = /* wgsl */ `
const AUCUN = 0xffffffffu;
const MARGE = 0.001;      // cqh : replacement hors de la surface après un rebond
const FONDU = 0.5;        // s de τ : durée du fondu après repos_apres
const SEUIL_CHOC = 5.0;   // cqh/s : sous cette vitesse normale, contact doux (glissement, Coulomb)
const LIGNES = 8192u;

struct Repere { centre: vec2f, angle: f32, actif: f32, demi: vec2f, echelle: vec2f };
struct Coup { ok: bool, t: f32, n: vec2f, l: vec2f };
struct Touche { ok: bool, t: f32, o: u32, l: vec2f, n: vec2f };

var<workgroup> cadresA: array<Repere, 48>;
var<workgroup> cadresB: array<Repere, 48>;
var<private> mortEcrite: bool;
var<private> impactEcrit: bool;

fn texel(o: u32, g: u32, c: u32) -> vec4f {
  return textureLoad(reperes, vec2u(2u * o + c, g % LIGNES), g / LIGNES, 0);
}

fn repereGrille(o: u32, g: u32) -> Repere {
  let a = texel(o, g, 0u);
  let b = texel(o, g, 1u);
  return Repere(a.xy, a.z, a.w, b.xy, b.zw);
}

fn melange(A: Repere, B: Repere, f: f32) -> Repere {
  var d = B.angle - A.angle;
  d = d - 6.2831853 * round(d / 6.2831853);
  return Repere(mix(A.centre, B.centre, f), A.angle + d * f, A.actif, mix(A.demi, B.demi, f), mix(A.echelle, B.echelle, f));
}

// Repère d'un obstacle à τ : grille de 30 points par seconde, position et échelle linéaires, angle par le plus court.
fn repere(o: u32, tau: f32) -> Repere {
  let x = max(tau, 0.0) * 30.0;
  let i = min(u32(floor(x)), Mo.nGrille - 1u);
  let j = min(i + 1u, Mo.nGrille - 1u);
  return melange(repereGrille(o, i), repereGrille(o, j), clamp(x - f32(i), 0.0, 1.0));
}

fn tourner(r: Repere, v: vec2f) -> vec2f {
  let c = cos(r.angle);
  let s = sin(r.angle);
  return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

fn versLocal(r: Repere, p: vec2f) -> vec2f {
  let c = cos(r.angle);
  let s = sin(r.angle);
  let d = p - r.centre;
  return vec2f(c * d.x + s * d.y, -s * d.x + c * d.y);
}

fn versMonde(r: Repere, l: vec2f) -> vec2f { return r.centre + tourner(r, l); }
fn sur(v: vec2f) -> vec2f { return max(v, vec2f(1e-6)); }
// Point matériel m (repère local sans échelle) de l'obstacle, dans le monde.
fn materiel(r: Repere, m: vec2f) -> vec2f { return versMonde(r, m * r.echelle); }

fn cadreDebut(o: u32, ta: f32, entier: bool) -> Repere {
  if (entier) { return cadresA[o]; }
  return repere(o, ta);
}

fn rien() -> Coup { return Coup(false, 0.0, vec2f(0.0), vec2f(0.0)); }

// Demi-plan plein pour y > 0 (local), gonflé du rayon r : entrée par le côté vide seulement.
fn coupDemiPlan(l0: vec2f, l1: vec2f, r: f32) -> Coup {
  let h = -r;
  if (l0.y > h || l1.y <= h) { return rien(); }
  let t = (h - l0.y) / (l1.y - l0.y);
  return Coup(true, t, vec2f(0.0, -1.0), vec2f(mix(l0.x, l1.x, t), h));
}

// Boîte [-1, 1]² en coordonnées normalisées : entrée seulement (départ dedans : aucun contact), face d'entrée.
fn coupBoiteNorm(q0: vec2f, q1: vec2f) -> Coup {
  if (all(abs(q0) < vec2f(1.0))) { return rien(); }
  let v = q1 - q0;
  var tE = -1e30;
  var tS = 1e30;
  var n = vec2f(0.0);
  for (var a = 0u; a < 2u; a++) {
    let p = q0[a];
    let w = v[a];
    if (abs(w) < 1e-12) {
      if (p < -1.0 || p > 1.0) { return rien(); }
      continue;
    }
    var t1 = (-1.0 - p) / w;
    var t2 = (1.0 - p) / w;
    var face = -1.0;
    if (t1 > t2) { let x = t1; t1 = t2; t2 = x; face = 1.0; }
    if (t1 > tE) { tE = t1; n = vec2f(0.0); n[a] = face; }
    tS = min(tS, t2);
  }
  if (tE > tS || tE < 0.0 || tE > 1.0) { return rien(); }
  return Coup(true, tE, n, mix(q0, q1, tE));
}

// Cercle unité en coordonnées normalisées : entrée seulement.
fn coupCercleNorm(q0: vec2f, q1: vec2f) -> Coup {
  if (dot(q0, q0) < 1.0) { return rien(); }
  let v = q1 - q0;
  let a = dot(v, v);
  if (a < 1e-12) { return rien(); }
  let b = dot(q0, v);
  let c = dot(q0, q0) - 1.0;
  let disc = b * b - a * c;
  if (disc < 0.0) { return rien(); }
  let t = (-b - sqrt(disc)) / a;
  if (t < 0.0 || t > 1.0) { return rien(); }
  let q = q0 + v * t;
  return Coup(true, t, q, q);
}

// Demi-dimensions gonflées du rayon : segment = boîte mince (épaisseur 2 r), sinon boîte ou cercle agrandis.
fn dimensions(genre: u32, R: Repere, r: f32) -> vec2f {
  if (genre == 3u) { return vec2f(R.demi.x + r, r); }
  return R.demi + vec2f(r);
}

// Distance (cqh à l'échelle) au contour d'une forme exacte : champ de distance dans la boîte, distance à la boîte dehors.
fn distanceForme(o: u32, R: Repere, l: vec2f) -> f32 {
  let dehors = abs(l) - R.demi;
  if (dehors.x > 0.0 || dehors.y > 0.0) { return length(max(dehors, vec2f(0.0))); }
  let uv = clamp(l / sur(R.demi) * 0.5 + 0.5, vec2f(0.5 / 256.0), vec2f(1.0 - 0.5 / 256.0));
  return textureSampleLevel(sdf, lisse, uv, i32(Mo.o[o].z), 0.0).r * min(R.echelle.x, R.echelle.y);
}

fn normaleForme(o: u32, R: Repere, l: vec2f) -> vec2f {
  let h = 0.25;
  let g = vec2f(distanceForme(o, R, l + vec2f(h, 0.0)) - distanceForme(o, R, l - vec2f(h, 0.0)),
                distanceForme(o, R, l + vec2f(0.0, h)) - distanceForme(o, R, l - vec2f(0.0, h)));
  if (dot(g, g) < 1e-12) { return vec2f(0.0, -1.0); }
  return normalize(g);
}

// Marche dans le champ (8 étapes au plus), depuis l'entrée du segment dans la boîte gonflée du rayon.
fn coupForme(o: u32, A: Repere, B: Repere, l0: vec2f, l1: vec2f, r: f32) -> Coup {
  let q0 = l0 / sur(A.demi + vec2f(r));
  let q1 = l1 / sur(B.demi + vec2f(r));
  var t = 0.0;
  if (!all(abs(q0) <= vec2f(1.0))) {
    let b = coupBoiteNorm(q0, q1);
    if (!b.ok) { return rien(); }
    t = b.t;
  } else if (distanceForme(o, A, l0) - r <= 0.0) {
    return rien();   // départ dans la forme : elle en sort librement
  }
  let longueur = length(l1 - l0);
  if (longueur < 1e-6) { return rien(); }
  for (var i = 0u; i < 8u; i++) {
    let R = melange(A, B, t);
    let l = mix(l0, l1, t);
    let d = distanceForme(o, R, l) - r;
    if (d < 0.01) { return Coup(true, t, normaleForme(o, R, l), l); }
    t += d / longueur;
    if (t > 1.0) { return rien(); }
  }
  // Marche épuisée : contact seulement si l'arrivée est dans la forme.
  if (distanceForme(o, B, l1) - r < 0.0) {
    let l = mix(l0, l1, t);
    return Coup(true, t, normaleForme(o, B, l), l);
  }
  return rien();
}

// Contact du segment [p0 à ta, p1 à τ1] avec l'obstacle o : segment pris dans le repère local aux deux instants,
// boîtes et cercles normalisés par leurs dimensions à ces instants (obstacles qui grandissent compris).
fn coupObstacle(o: u32, A: Repere, B: Repere, p0: vec2f, p1: vec2f, r: f32) -> Coup {
  let genre = Mo.o[o].x;
  let l0 = versLocal(A, p0);
  let l1 = versLocal(B, p1);
  if (genre == 0u) { return coupDemiPlan(l0, l1, r); }
  if (genre == 4u) { return coupForme(o, A, B, l0, l1, r); }
  let DA = dimensions(genre, A, r);
  let DB = dimensions(genre, B, r);
  var c: Coup;
  if (genre == 2u) { c = coupCercleNorm(l0 / sur(DA), l1 / sur(DB)); } else { c = coupBoiteNorm(l0 / sur(DA), l1 / sur(DB)); }
  if (!c.ok) { return c; }
  let D = mix(DA, DB, c.t);
  c.n = normalize(c.n / sur(D));
  c.l = c.l * D;
  return c;
}

// Premier contact parmi les obstacles ciblés (masque E[141]) et actifs.
fn chercher(p0: vec2f, p1: vec2f, ta: f32, entier: bool, r: f32) -> Touche {
  var meilleur = Touche(false, 2.0, 0u, vec2f(0.0), vec2f(0.0));
  let masque = eu(141u);
  for (var o = 0u; o < Mo.n; o++) {
    if ((Mo.o[o].y & masque) == 0u) { continue; }
    let A = cadreDebut(o, ta, entier);
    if (A.actif < 0.5) { continue; }
    let c = coupObstacle(o, A, cadresB[o], p0, p1, r);
    if (c.ok && c.t < meilleur.t) { meilleur = Touche(true, c.t, o, c.l, c.n); }
  }
  return meilleur;
}

// Valeur tirée par particule dans l'intervalle [E[mot], E[mot + 1]].
fn tirage(p: Particule, canal: u32, mot: u32) -> f32 {
  return mix(ef(mot), ef(mot + 1u), alea(eu(5u), eu(6u), p.n, canal));
}

// Mort notée pour les enfants « a_la_mort » (une par case et par pas : la première).
fn noterMort(p: Particule, s: u32, t: f32) {
  if (eu(10u) == 1u && !mortEcrite) {
    morts[s] = Mort(p.pos, p.vel, t, p.n, p.gen, P.k + 1u, vec2f(0.0), 0u, 0u);
    mortEcrite = true;
  }
}

// Impact noté pour les enfants « a_la_collision », espacé d'au moins la vie de l'enfant (E[153]).
fn noterImpact(p: ptr<function, Particule>, c: ptr<function, Contact>, s: u32, pos: vec2f, vel: vec2f, n: vec2f, t: f32) {
  if (eu(152u) == 0u || impactEcrit || t - (*c).impact < ef(153u)) { return; }
  let numero = pcg((*p).n ^ ((*c).nImpacts * 2654435769u));
  morts[eu(0u) + s] = Mort(pos, vel, t, numero, (*p).gen, P.k + 1u, n, 0u, 0u);
  (*c).impact = t;
  (*c).nImpacts = (*c).nImpacts + 1u;
  impactEcrit = true;
}

// Déplacement libre de p0 (à ta) à (*p).pos (à τ1) : premier contact et réponse.
fn collisionner(p: ptr<function, Particule>, c: ptr<function, Contact>, p0: vec2f, ta: f32, entier: bool, s: u32) {
  let tb = P.tau1;
  let rayon = 0.5 * (*p).taille;
  let t = chercher(p0, (*p).pos, ta, entier, rayon);
  if (!t.ok) { return; }
  let A = cadreDebut(t.o, ta, entier);
  let B = cadresB[t.o];
  let Rc = melange(A, B, t.t);
  let tc = mix(ta, tb, t.t);
  let duree = max(tb - ta, 1e-6);
  let n = normalize(tourner(Rc, t.n));
  let m = t.l / sur(Rc.echelle);
  let vs = (materiel(B, m) - materiel(A, m)) / duree;
  let point = versMonde(Rc, t.l);
  let v = (*p).vel;
  let vr = v - vs;
  let vn = dot(vr, n);
  noterImpact(p, c, s, point, vs + vr - 2.0 * min(vn, 0.0) * n, n, tc);
  let code = eu(142u);
  if (code == 2u) {
    (*p).pos = point;
    noterMort(*p, s, tc);
    (*p).vivante = 0u;
    return;
  }
  if (code == 1u) {
    (*c).obstacle = t.o;
    (*c).local = m;
    (*c).pose = tc;
    (*c).opacite = 1.0;
    (*c).cellule = AUCUN;
    (*p).pos = materiel(B, m);
    (*p).vel = vs;
    (*p).vrot = 0.0;
    return;
  }
  var vNouv = v;
  if (vn < 0.0) {
    let vt = vr - vn * n;
    let f = tirage(*p, 13u, 145u);
    var e = tirage(*p, 12u, 143u);
    var vtN = vt * (1.0 - f);
    if (-vn < SEUIL_CHOC) {
      e = 0.0;
      vtN = vt * max(0.0, 1.0 - f * (-vn) / max(length(vt), 1e-6));
    }
    vNouv = vs + vtN - e * vn * n;
  }
  (*p).vel = vNouv;
  (*p).pos = materiel(B, m) + normalize(tourner(B, t.n)) * MARGE + (vNouv - vs) * (1.0 - t.t) * duree;
}

// Particule posée : elle suit son point d'appui ; fondu puis mort après repos_apres ; repart si l'obstacle disparaît.
fn suivre(p: ptr<function, Particule>, c: ptr<function, Contact>, s: u32) {
  let o = (*c).obstacle;
  let A = cadresA[o];
  let B = cadresB[o];
  if (B.actif < 0.5) {
    (*c).obstacle = AUCUN;
    (*c).cellule = AUCUN;
    return;
  }
  let a = materiel(A, (*c).local);
  let b = materiel(B, (*c).local);
  (*p).pos = b;
  (*p).vel = (b - a) / P.dt;
  if (ef(147u) >= 0.0) {
    let x = (P.tau1 - (*c).pose - tirage(*p, 14u, 147u)) / FONDU;
    (*c).opacite = 1.0 - clamp(x, 0.0, 1.0);
    if (x >= 1.0) {
      noterMort(*p, s, P.tau1);
      (*p).vivante = 0u;
    }
  }
}

@compute @workgroup_size(64)
fn pasCollisions(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32) {
  // Repères des obstacles aux deux bouts du pas, lus une fois par groupe.
  if (li < Mo.n) {
    cadresA[li] = repere(li, P.tau0);
    cadresB[li] = repere(li, P.tau1);
  }
  workgroupBarrier();
  let s = gid.x;
  if (s >= eu(0u)) { return; }
  mortEcrite = false;
  impactEcrit = false;
  let N = eu(136u);
  var p = particules[s];
  var c = contacts[s];
  if (p.vivante == 1u) {
    if (c.obstacle != AUCUN) {
      suivre(&p, &c, s);
    } else {
      let p0 = p.pos;
      p = integrer(p, P.dt, P.tau0, P.zoneA);
      collisionner(&p, &c, p0, P.tau0, true, s);
    }
    if (p.vivante == 1u) {
      p.age += P.dt;
      if (p.age >= p.vie) { noterMort(p, s, p.naissance + p.vie); p.vivante = 0u; }
    }
  }
  let ne = naissanceDuPas(s);
  if (ne.ok) {
    let z = mix(P.zoneA, P.zoneB, clamp((ne.t - P.tau0) / P.dt, 0.0, 1.0));
    p = initialiser(ne, z);
    c = Contact(vec2f(0.0), AUCUN, -1.0, -1e9, 0u, 1.0, AUCUN);
    for (var i = 0u; i < N; i++) { historique[s * N + i] = p.pos; }
    let reste = P.tau1 - ne.t;
    let p0 = p.pos;
    p = integrer(p, reste, ne.t, z);
    collisionner(&p, &c, p0, ne.t, false, s);
    if (p.vivante == 1u) {
      p.age = reste;
      if (p.age >= p.vie) { noterMort(p, s, p.naissance + p.vie); p.vivante = 0u; }
    }
  }
  if (N > 0u && p.vivante == 1u && (P.k + 1u) % 2u == 0u) {
    historique[s * N + ((P.k + 1u) / 2u) % N] = p.pos;
  }
  particules[s] = p;
  contacts[s] = c;
}
`;

  const WGSL_SIMULATION = P.WGSL_COMMUN + WGSL_STRUCTS + WGSL_DECL_P1 + WGSL_FONCTIONS + WGSL_ENTREES_P1;
  const WGSL_MODULE_COLLISIONS = P.WGSL_COMMUN + WGSL_STRUCTS + WGSL_DECL_C + WGSL_FONCTIONS + WGSL_COLLISIONS;
  P.WGSL_MODULE_COLLISIONS = () => WGSL_MODULE_COLLISIONS;

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

  /** Paramètres d'un émetteur (disposition « E » : 160 mots). collisions : collisions actives pour cet émetteur. */
  function emballer(em, effet, collisions) {
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
    u[136] = em.rendu.type === 'trainee' ? em.rendu.longueur : 0;
    // Enfant d'une collision : il lit les impacts du parent, rangés après ses morts.
    u[137] = em.declencheur === 'collision' ? effet.emetteurs[em.parent].capacite : 0;
    const c = collisions ? em.collisions : null;
    if (c) {
      u[140] = 1;
      u[141] = c.masque;
      u[142] = c.reponseCode;
      f[143] = c.restitution[0]; f[144] = c.restitution[1];
      f[145] = c.frottement[0]; f[146] = c.frottement[1];
      f[147] = c.reposApres ? c.reposApres[0] : -1; f[148] = c.reposApres ? c.reposApres[1] : -1;
      u[149] = c.empiler ? 1 : 0;
      f[150] = c.epaisseur ? c.epaisseur[0] : -1; f[151] = c.epaisseur ? c.epaisseur[1] : -1;
      u[152] = em.aLaCollision >= 0 ? 1 : 0;
      f[153] = em.aLaCollision >= 0 ? effet.emetteurs[em.aLaCollision].vie[1] + PAS : 0;
    }
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
        { binding: 7, visibility: C, buffer: { type: 'storage' } },
      ],
    });
    const U = GPUBufferUsage;
    p = {
      layoutPas,
      pas: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layoutPas] }), compute: { module, entryPoint: 'pas' } }),
      evaluer: device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'evaluer' } }),
      videLecture: device.createBuffer({ size: OCTETS_MORT, usage: U.STORAGE }),
      videEcriture: device.createBuffer({ size: OCTETS_MORT, usage: U.STORAGE }),
      videHistorique: device.createBuffer({ size: 16, usage: U.STORAGE }),
    };
    parDevice.set(device, p);
    return p;
  }

  // Module « collisions » : créé au premier effet qui en a besoin.
  const parDeviceC = new WeakMap();
  function pipelinesCollisions(device) {
    let p = parDeviceC.get(device);
    if (p) return p;
    const module = device.createShaderModule({ label: 'pm-collisions', code: WGSL_MODULE_COLLISIONS });
    const C = GPUShaderStage.COMPUTE;
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: C, buffer: { type: 'storage' } },
        { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: C, buffer: { type: 'storage' } },
        { binding: 4, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } },
        { binding: 7, visibility: C, buffer: { type: 'storage' } },
        { binding: 8, visibility: C, buffer: { type: 'storage' } },
        { binding: 9, visibility: C, buffer: { type: 'storage' } },
        { binding: 10, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 11, visibility: C, buffer: { type: 'uniform' } },
        { binding: 12, visibility: C, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
        { binding: 13, visibility: C, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 14, visibility: C, sampler: { type: 'filtering' } },
      ],
    });
    const U = GPUBufferUsage;
    const sdfVide = device.createTexture({ size: [1, 1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING });
    p = {
      layout,
      module,
      pas: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint: 'pasCollisions' } }),
      videProfils: device.createBuffer({ size: 16, usage: U.STORAGE }),
      videHauteurs: device.createBuffer({ size: 16, usage: U.STORAGE }),
      vueSdfVide: sdfVide.createView({ dimension: '2d-array' }),
      lisse: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
    };
    parDeviceC.set(device, p);
    return p;
  }

  class Simulation {
    constructor(device, effet, monde) {
      const U = GPUBufferUsage;
      this.device = device;
      this.effet = effet;
      this.p = pipelinesPour(device);
      this.monde = monde && monde.actif ? monde : null;
      this.nZones = Math.ceil(effet.fin * GRILLE) + 2;
      this.emetteurs = effet.emetteurs.map((em) => {
        const capacite = Math.max(1, em.capacite);
        const collisions = !!(this.monde && em.collisions);
        const evenements = em.aLaMort >= 0 || em.aLaCollision >= 0;
        return {
          em,
          collisions,
          rapide: em.voieRapide && !collisions,
          capacite,
          params: tamponAvec(device, E_TAILLE * 4, U.STORAGE | U.COPY_DST, emballer(em, effet, collisions)),
          tables: tamponAvec(device, TABLES * 4, U.STORAGE | U.COPY_DST, tables(em)),
          particules: device.createBuffer({ size: capacite * OCTETS_PARTICULE, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }),
          // Morts dans [0, capacité), impacts dans [capacité, 2 × capacité) : lus par les enfants.
          morts: evenements ? device.createBuffer({ size: 2 * capacite * OCTETS_MORT, usage: U.STORAGE | U.COPY_DST }) : null,
          contacts: collisions ? device.createBuffer({ size: capacite * OCTETS_CONTACT, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }) : null,
          historique: em.rendu.type === 'trainee'
            ? device.createBuffer({ size: capacite * em.rendu.longueur * 8, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST })
            : null,
          uniformeRendu: device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST }),
        };
      });

      // Émetteurs simulés, parents avant enfants.
      this.simules = this.emetteurs.filter((e) => !e.rapide).sort((a, b) => a.em.profondeur - b.em.profondeur || a.em.index - b.em.index);
      this.tamponPas = device.createBuffer({ size: 256 * PAS_PAR_LOT, usage: U.UNIFORM | U.COPY_DST });
      this.donneesPas = new ArrayBuffer(256 * PAS_PAR_LOT);
      this.u32Pas = new Uint32Array(this.donneesPas);
      this.f32Pas = new Float32Array(this.donneesPas);
      if (this.emetteurs.some((e) => e.collisions)) this.preparerMonde();
      this.simules.forEach((e) => {
        const parent = e.em.parent >= 0 ? this.emetteurs[e.em.parent] : null;
        e.groupePas = e.collisions ? this.groupeCollisions(e, parent) : device.createBindGroup({
          layout: this.p.layoutPas,
          entries: [
            { binding: 0, resource: { buffer: e.params } },
            { binding: 1, resource: { buffer: e.particules } },
            { binding: 2, resource: { buffer: parent ? parent.morts : this.p.videLecture } },
            { binding: 3, resource: { buffer: e.morts || this.p.videEcriture } },
            { binding: 4, resource: { buffer: this.tamponPas, size: 48 } },
            { binding: 7, resource: { buffer: e.historique || this.p.videHistorique } },
          ],
        });
      });

      // Voie rapide : zones de la grille (points g / 30) envoyées au GPU.
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
      const tailleEtat = this.simules.reduce((s, e) => s + e.capacite * OCTETS_PARTICULE + (e.historique ? e.historique.size : 0) + (e.contacts ? e.contacts.size : 0), 0);
      this.k = 0;
      this.planificateur = M.instantanes.creerPlanificateur({
        intervalle: M.instantanes.intervallePour({ tailleEtat, pasTotal: this.kFin, budget: BUDGET_INSTANTANES }),
      });
      this.instantanes = new Map();
    }

    /** Repères des obstacles (texture, une ligne par point de grille) et uniforme « Monde ». */
    preparerMonde() {
      const { device } = this;
      const O = M.obstacles;
      const entrees = this.monde.entrees;
      this.pc = pipelinesCollisions(device);
      this.nObs = entrees.length;
      this.reperesCPU = new Float32Array(this.nZones * this.nObs * O.REPERE);
      this.reperesConnus = new Uint8Array(this.nZones);
      this.texReperes = device.createTexture({
        size: [2 * this.nObs, Math.min(this.nZones, LIGNES_REPERES), Math.ceil(this.nZones / LIGNES_REPERES)],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.vueReperes = this.texReperes.createView({ dimension: '2d-array' });
      this.uniformeMonde = tamponAvec(device, O.OCTETS_MONDE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        O.emballerMonde(entrees, this.nZones, this.monde.largeurCqh, []));
    }

    groupeCollisions(e, parent) {
      return this.device.createBindGroup({
        layout: this.pc.layout,
        entries: [
          { binding: 0, resource: { buffer: e.params } },
          { binding: 1, resource: { buffer: e.particules } },
          { binding: 2, resource: { buffer: parent ? parent.morts : this.p.videLecture } },
          { binding: 3, resource: { buffer: e.morts || this.p.videEcriture } },
          { binding: 4, resource: { buffer: this.tamponPas, size: 80 } },
          { binding: 7, resource: { buffer: e.historique || this.p.videHistorique } },
          { binding: 8, resource: { buffer: e.contacts } },
          { binding: 9, resource: { buffer: this.profils || this.pc.videProfils } },
          { binding: 10, resource: { buffer: this.hauteurs || this.pc.videHauteurs } },
          { binding: 11, resource: { buffer: this.uniformeMonde } },
          { binding: 12, resource: this.vueReperes },
          { binding: 13, resource: this.monde.formes ? this.monde.formes.vue : this.pc.vueSdfVide },
          { binding: 14, resource: this.pc.lisse },
        ],
      });
    }

    /** Repères des points de grille utiles au pas k (et à ses voisins) envoyés au GPU, une fois chacun. */
    assurerReperes(k, zones) {
      const n = this.nObs;
      const g0 = Math.max(0, Math.floor(k * PAS * GRILLE) - 1);
      const g1 = Math.min(this.nZones - 1, Math.floor((k + 1) * PAS * GRILLE) + 2);
      for (let g = g0; g <= g1; g++) {
        if (this.reperesConnus[g]) continue;
        const r = zones.reperes(g);
        this.reperesCPU.set(r, g * n * 8);
        this.device.queue.writeTexture(
          { texture: this.texReperes, origin: [0, g % LIGNES_REPERES, Math.floor(g / LIGNES_REPERES)] },
          r, { bytesPerRow: n * 2 * 16 }, [n * 2, 1, 1]);
        this.reperesConnus[g] = 1;
      }
    }

    avancer(tau, zones) {
      const k = Math.min(this.kFin, Math.max(0, Math.floor(tau / PAS + 1e-6)));
      const delta = Math.max(0, tau - k * PAS);
      this.k = k;
      if (this.simules.length) this.executer(this.planificateur.planifier(k), zones);
      if (this.rapides.length) this.evaluer(tau, zones);
      return this.emetteurs.map((e) => (e.rapide ? 0 : delta));
    }

    /** Données propres au pas (après zones et repères) ; complété par le plan 5 (largeurs des profils). */
    ecrirePas(o, k) {
      const u = this.u32Pas;
      const f = this.f32Pas;
      const tau0 = Math.fround(k * PAS);
      const tau1 = Math.fround((k + 1) * PAS);
      u[o] = k;
      f[o + 1] = tau0;
      f[o + 2] = tau1;
      f[o + 3] = tau1 - tau0;
    }

    executer(actions, zones) {
      if (!actions.length) return;
      const { device } = this;
      const donnees = this.donneesPas;
      const f = this.f32Pas;
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
          f.set(zones.a(a.k * PAS), o + 4);
          f.set(zones.a((a.k + 1) * PAS), o + 8);
          if (this.texReperes) this.assurerReperes(a.k, zones);
          this.ecrirePas(o, a.k);
          if (!passe) passe = enc.beginComputePass();
          for (const e of this.simules) {
            passe.setPipeline(e.collisions ? this.pc.pas : this.p.pas);
            passe.setBindGroup(0, e.groupePas, [n * 256]);
            passe.dispatchWorkgroups(Math.ceil(e.capacite / 64));
          }
          n++;
          continue;
        }
        ouvrir();
        fermerPasse();
        if (a.type === 'vider') {
          this.simules.forEach((e) => {
            enc.clearBuffer(e.particules);
            if (e.morts) enc.clearBuffer(e.morts);
            if (e.historique) enc.clearBuffer(e.historique);
            if (e.contacts) enc.clearBuffer(e.contacts);
          });
        } else if (a.type === 'restaurer') {
          const copie = this.instantanes.get(a.k);
          this.simules.forEach((e, i) => {
            enc.copyBufferToBuffer(copie[i].particules, 0, e.particules, 0, e.capacite * OCTETS_PARTICULE);
            if (e.historique) enc.copyBufferToBuffer(copie[i].historique, 0, e.historique, 0, e.historique.size);
            if (e.contacts) enc.copyBufferToBuffer(copie[i].contacts, 0, e.contacts, 0, e.contacts.size);
          });
        } else if (a.type === 'sauver') {
          let copie = this.instantanes.get(a.k);
          if (!copie) {
            const U = GPUBufferUsage;
            copie = this.simules.map((e) => ({
              particules: device.createBuffer({ size: e.capacite * OCTETS_PARTICULE, usage: U.COPY_SRC | U.COPY_DST }),
              historique: e.historique ? device.createBuffer({ size: e.historique.size, usage: U.COPY_SRC | U.COPY_DST }) : null,
              contacts: e.contacts ? device.createBuffer({ size: e.contacts.size, usage: U.COPY_SRC | U.COPY_DST }) : null,
            }));
            this.instantanes.set(a.k, copie);
          }
          this.simules.forEach((e, i) => {
            enc.copyBufferToBuffer(e.particules, 0, copie[i].particules, 0, e.capacite * OCTETS_PARTICULE);
            if (e.historique) enc.copyBufferToBuffer(e.historique, 0, copie[i].historique, 0, e.historique.size);
            if (e.contacts) enc.copyBufferToBuffer(e.contacts, 0, copie[i].contacts, 0, e.contacts.size);
          });
        }
      }
      envoyer();
    }

    evaluer(tau, zones) {
      const { device } = this;
      const gMax = Math.min(this.nZones - 1, Math.floor(tau * GRILLE) + 1);
      let gMin = gMax;
      this.rapides.forEach((e) => { gMin = Math.min(gMin, Math.floor(Math.max(0, tau - e.em.vie[1]) * GRILLE)); });
      let premier = -1;
      let dernier = -1;
      for (let g = Math.max(0, gMin); g <= gMax; g++) {
        if (this.zonesConnues[g]) continue;
        this.zones.set(zones.grille(g), g * 4);
        this.zonesConnues[g] = 1;
        if (premier < 0) premier = g;
        dernier = g;
      }
      if (premier >= 0) device.queue.writeBuffer(this.tamponZones, premier * 16, this.zones, premier * 4, (dernier - premier + 1) * 4);
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

    async lireTampon(tampon) {
      const lecture = this.device.createBuffer({ size: tampon.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(tampon, 0, lecture, 0, tampon.size);
      this.device.queue.submit([enc.finish()]);
      await lecture.mapAsync(GPUMapMode.READ);
      const copie = new Float32Array(lecture.getMappedRange().slice(0));
      lecture.unmap();
      lecture.destroy();
      return copie;
    }

    lireEtat(i) { return this.lireTampon(this.emetteurs[i].particules); }

    lireHistorique(i) {
      const e = this.emetteurs[i];
      return e.historique ? this.lireTampon(e.historique) : Promise.resolve(new Float32Array(0));
    }

    lireContacts(i) {
      const e = this.emetteurs[i];
      return e.contacts ? this.lireTampon(e.contacts) : Promise.resolve(new Float32Array(0));
    }

    detruire() {
      this.emetteurs.forEach((e) => [e.params, e.tables, e.particules, e.morts, e.contacts, e.historique, e.uniformeRendu, e.uniformeEval].forEach((b) => b && b.destroy()));
      this.instantanes.forEach((copie) => copie.forEach((c) => [c.particules, c.historique, c.contacts].forEach((b) => b && b.destroy())));
      this.instantanes.clear();
      this.tamponPas.destroy();
      if (this.tamponZones) this.tamponZones.destroy();
      if (this.texReperes) this.texReperes.destroy();
      if (this.uniformeMonde) this.uniformeMonde.destroy();
    }
  }

  P.Simulation = Simulation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
