/* Pulse Motion – milieu fluide sur grille (P5c) : fumée, feu, encre dans la scène ; groupe couplé avec les effets.
 *
 * P.MILIEU                    constantes (flottaison, confinement, viscosité, absorption, frottement des parois, Jacobi…)
 * P.grilleMilieu(zone, resolution) -> { origine: [x, y], cote, nx, ny }   cellules carrées (cqh), « resolution » cellules sur
 *   le grand côté de la zone [x, y, largeur, hauteur], grille centrée sur la zone
 * P.dispositionMilieu(nx, ny) -> { n, nu, nf, vA, sA, pA, etat, vB, vC, sB, sC, pB, dv, sol, total }   régions (mots) du
 *   tampon « champ » : l'état [0, etat) (vitesse, scalaires, pression), puis le travail
 * P.emballerGrille(effet, grille, d, zone) -> ArrayBuffer (OCTETS_GRILLE)   uniforme « Grille » du WGSL
 * P.codeMilieu() -> WGSL du module « pm-milieu » : module des collisions de P3 (repères des obstacles, champs de distance des
 *   formes) et noyaux de la grille (P.NOYAUX_MILIEU, une phase chacun)
 * new P.Milieu(device, effet, zone, monde, duree)   effet.milieu (recette compilée) ; zone (cqh, mesurée au début du milieu) ;
 *   monde : obstacles ({ entrees, largeurCqh, actif, formes? }) ou null ; duree : fenêtre du milieu (s de τ)
 *   membre d'un P.Couplage : .kFin, .tailleEtat, .preparerPas(o, k, zones), .envoyerPas(n), .encoderPas(passe, n),
 *   .positionner(k, tau) -> null, .viderEtat(enc), .sauverEtat(enc, copie) -> copie, .restaurerEtat(enc, copie),
 *   .detruireCopie(copie) ; zones.reperes(g) -> Float32Array (8 nombres par obstacle de monde.entrees, disposition
 *   « Repere » de obstacles.js) au point g / 30 de la fenêtre du milieu
 *   .vueVent, .uniformeVent (vent lu par les particules, simulation.js), .vueA, .vueB (rendu), .depots (dépôts des effets),
 *   .grille, .d, .lire() -> Promise<{ vitesse, scalaires, pression, divergence, solide, etat }> (tests),
 *   .ecrireScalaires(valeurs) (tests : scalaires imposés, textures publiées), .detruire()
 * new P.Couplage(device, membres)   groupe couplé : membres = [{ membre, debut }] (debut : pas du groupe où le membre fait son
 *   pas 0) ; à chaque pas du groupe, les membres actifs avancent dans l'ordre (effets, puis le milieu en dernier : les effets
 *   lisent le vent du pas précédent et déposent, la grille avance), dans une même passe de calcul ; instantanés communs (P1).
 *   .avancer(tau, zones) -> [membre.positionner(k, τ, zones[i])]   (tau : s depuis le début du groupe ; zones[i] du membre i)
 *   .kFin, .detruire()
 *
 * Pas de la grille (1/120 s de τ, un dispatch par phase) : obstacles de P3 rastérisés à τ1 (vitesse du point matériel) ;
 * injection (sources ; dépôts des effets en entiers de 1/65536, remis à zéro) ; advection MacCormack des scalaires (fumée,
 * température, encre ; départ RK2 ; bornée ; dissipation, refroidissement) ; tourbillon ; forces (flottaison, confinement
 * de vorticité), viscosité, frottement des parois ; advection MacCormack de la vitesse ; limites (obstacles, bords fermés) ;
 * divergence ; pression par Jacobi (40 itérations, nombre fixe, départ : pression du pas précédent, dans l'état) ;
 * projection ; textures publiées (vent ; A : fumée, température, lumière reçue (16 pas vers la lumière), plein ; B : encre).
 * Aucune opération dont le résultat dépend de l'ordre des fils (dépôts : additions entières).
 * Fluides stables : J. Stam (1999) ; MacCormack : A. Selle et al. (2008) ; confinement de vorticité : R. Fedkiw et al.
 * (2001). Algorithmes publics, réimplémentés.
 * Navigateur seulement ; dépend de simulation.js (P.WGSL_MODULE_COLLISIONS), instantanes.js et, avec des obstacles,
 * obstacles.js.
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const PAS = 1 / 120;
  const GRILLE = 30;
  const PAS_PAR_LOT = 256;
  const LIGNES_REPERES = 8192;
  const BUDGET_INSTANTANES = 256 * 1024 * 1024;
  const C = {
    OCTETS_GRILLE: 656,
    SOURCES_MAX: 8,
    JACOBI: 40,              // itérations de pression par pas (nombre fixe, spec)
    FLOTTAISON: 40,          // cqh/s² par unité de température et de « flottaison »
    CONFINEMENT: 2,          // confinement de vorticité par unité de « vorticite »
    VISCOSITE: 10,           // cqh²/s d'une viscosité 1 (bornée à 0,2 h²/dt)
    ABSORPTION: 0.6,         // absorption de la lumière par unité de densité de fumée et par cqh
    PAROI: 60,               // frottement des parois (par seconde)
    MASQUE: 4 | 8,           // obstacles contournés : éléments et formes déclarés (catégories de P3)
  };
  P.MILIEU = C;
  P.NOYAUX_MILIEU = ['gObstacles', 'gInjecter', 'gAdvecterS', 'gCorrigerS', 'gRecopierS', 'gTourbillon', 'gForcer', 'gAdvecterV',
    'gCorrigerV', 'gLimites', 'gDivergence', 'gJacobi', 'gProjeter', 'gPublier'];

  P.grilleMilieu = function (zone, resolution) {
    const w = Math.max(zone[2], 1e-3);
    const h = Math.max(zone[3], 1e-3);
    const cote = Math.max(w, h) / resolution;
    const nx = Math.max(1, Math.round(w / cote));
    const ny = Math.max(1, Math.round(h / cote));
    return { origine: [zone[0] + w / 2 - nx * cote / 2, zone[1] + h / 2 - ny * cote / 2], cote, nx, ny };
  };

  P.dispositionMilieu = function (nx, ny) {
    const n = nx * ny;
    const nu = (nx + 1) * ny;
    const nf = nu + nx * (ny + 1);
    const vA = 0;
    const sA = nf;
    const pA = nf + 8 * n;
    const etat = pA + n;
    const vB = etat;
    const vC = vB + nf;
    const sB = vC + nf;
    const sC = sB + 8 * n;
    const pB = sC + 8 * n;
    const dv = pB + n;
    const sol = dv + n;
    return { n, nu, nf, vA, sA, pA, etat, vB, vC, sB, sC, pB, dv, sol, total: sol + 4 * n };
  };

  P.emballerGrille = function (effet, g, d, zone) {
    const m = effet.milieu;
    const b = new ArrayBuffer(C.OCTETS_GRILLE);
    const f = new Float32Array(b);
    const u = new Uint32Array(b);
    f[0] = g.origine[0]; f[1] = g.origine[1]; f[2] = g.cote; f[3] = PAS;
    f.set(zone, 4);
    u.set([g.nx, g.ny, d.n, d.nu, d.nf, d.vA, d.vB, d.vC, d.sA, d.sB, d.sC, d.pA, d.pB, d.dv, d.sol, m.sources.length], 8);
    f[24] = m.flottaison * C.FLOTTAISON;
    f[25] = m.refroidissement;
    f[26] = m.dissipation;
    f[27] = m.vorticite * C.CONFINEMENT;
    f[28] = Math.min(m.viscosite * C.VISCOSITE, 0.2 * g.cote * g.cote / PAS);
    u[29] = m.bordsCode;
    f[30] = C.ABSORPTION;
    u[31] = C.MASQUE;
    f[32] = m.rendu.lumiere[0];
    f[33] = m.rendu.lumiere[1];
    m.sources.forEach((s, k) => {
      const o = 36 + 16 * k;
      u[o] = s.code; u[o + 1] = s.forme.code; u[o + 2] = s.forme.contour ? 1 : 0;
      f.set([s.forme.rayon, s.forme.rayonInterieur, s.forme.largeur, s.forme.hauteur], o + 4);
      f.set([s.forme.angle, s.forme.decalage[0], s.forme.decalage[1], s.debit], o + 8);
      f.set([s.temperature, s.encre[0], s.encre[1], s.encre[2]], o + 12);
    });
    return b;
  };

  const WGSL_MILIEU = /* wgsl */ `
// ---- Milieu (P5c) : fluide stable sur grille décalée (MAC), advection MacCormack, pression de Jacobi ----
struct SourceG { a: vec4u, b: vec4f, c: vec4f, d: vec4f };
struct Grille {
  origine: vec2f, cote: f32, dt: f32,
  zone: vec4f,
  nx: u32, ny: u32, n: u32, nu: u32,
  nf: u32, vA: u32, vB: u32, vC: u32,
  sA: u32, sB: u32, sC: u32, pA: u32,
  pB: u32, dv: u32, sol: u32, nSources: u32,
  flottaison: f32, refroidissement: f32, dissipation: f32, vorticite: f32,
  viscosite: f32, bords: u32, absorption: f32, masque: u32,
  lumiere: vec2f, r0: f32, r1: f32,
  sources: array<SourceG, ${C.SOURCES_MAX}>,
};
struct Iteration { src: u32, dst: u32, r0: u32, r1: u32 };

@group(0) @binding(30) var<uniform> GR: Grille;
@group(0) @binding(31) var<storage, read_write> champ: array<f32>;
@group(0) @binding(32) var<storage, read_write> depots: array<atomic<u32>>;
@group(0) @binding(33) var texVent: texture_storage_2d<rgba32float, write>;
@group(0) @binding(34) var texA: texture_storage_2d<rgba32float, write>;
@group(0) @binding(35) var texB: texture_storage_2d<rgba32float, write>;
@group(0) @binding(36) var<uniform> IT: Iteration;

const G_FIXE = 65536.0;
const G_PAS_LUMIERE = 16u;
const G_PAROI = ${C.PAROI}.0;

fn dansG(i: i32, j: i32) -> bool { return i >= 0 && j >= 0 && i < i32(GR.nx) && j < i32(GR.ny); }
fn celluleG(i: i32, j: i32) -> u32 { return u32(j) * GR.nx + u32(i); }
fn solideG(i: i32, j: i32) -> bool { return dansG(i, j) && champ[GR.sol + celluleG(i, j) * 4u] > 0.5; }
fn vitesseSolideG(i: i32, j: i32) -> vec2f {
  let b = GR.sol + celluleG(i, j) * 4u;
  return vec2f(champ[b + 1u], champ[b + 2u]);
}
// Face u (i, j) : i dans [0, nx], j dans [0, ny) ; face v (i, j) : i dans [0, nx), j dans [0, ny].
fn indiceU(i: u32, j: u32) -> u32 { return j * (GR.nx + 1u) + i; }
fn indiceV(i: u32, j: u32) -> u32 { return GR.nu + j * GR.nx + i; }
// Point de grille (en cellules : coin haut gauche de la grille en 0) vers la scène (cqh).
fn versScene(g: vec2f) -> vec2f { return GR.origine + g * GR.cote; }

// Valeur bilinéaire d'un tableau de largeur × hauteur valeurs (pas entre deux valeurs, décalage k) au point q (indices
// fractionnaires), bornée au bord ; avec le minimum et le maximum des quatre valeurs voisines (MacCormack).
struct Echantillon { v: f32, mn: f32, mx: f32 };
fn bilinG(base: u32, largeur: u32, hauteur: u32, pas: u32, k: u32, q: vec2f) -> Echantillon {
  let qc = clamp(q, vec2f(0.0), vec2f(f32(largeur - 1u), f32(hauteur - 1u)));
  let i = min(u32(floor(qc.x)), largeur - 1u);
  let j = min(u32(floor(qc.y)), hauteur - 1u);
  let i1 = min(i + 1u, largeur - 1u);
  let j1 = min(j + 1u, hauteur - 1u);
  let f = qc - vec2f(f32(i), f32(j));
  let a = champ[base + (j * largeur + i) * pas + k];
  let b = champ[base + (j * largeur + i1) * pas + k];
  let c = champ[base + (j1 * largeur + i) * pas + k];
  let d = champ[base + (j1 * largeur + i1) * pas + k];
  return Echantillon(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
}

// Composantes de la vitesse au point g (en cellules) d'un champ de faces commençant au mot « base ».
fn uEn(base: u32, g: vec2f) -> Echantillon { return bilinG(base, GR.nx + 1u, GR.ny, 1u, 0u, g - vec2f(0.0, 0.5)); }
fn vEn(base: u32, g: vec2f) -> Echantillon { return bilinG(base + GR.nu, GR.nx, GR.ny + 1u, 1u, 0u, g - vec2f(0.5, 0.0)); }
fn vitesseG(base: u32, g: vec2f) -> vec2f { return vec2f(uEn(base, g).v, vEn(base, g).v); }
// Scalaire k (0 fumée, 1 température, 4 à 6 encre) au point g d'un champ de cellules (8 valeurs par cellule).
fn scalG(base: u32, k: u32, g: vec2f) -> Echantillon { return bilinG(base, GR.nx, GR.ny, 8u, k, g - vec2f(0.5)); }

// Point de départ (RK2, en cellules) du fluide arrivé en g à la fin du pas (sens 1), ou point d'arrivée du fluide parti de g
// (sens −1), selon le champ de vitesse « base ».
fn departG(base: u32, g: vec2f, sens: f32) -> vec2f {
  let h = sens * GR.dt / GR.cote;
  let m = g - 0.5 * h * vitesseG(base, g);
  return g - h * vitesseG(base, m);
}

// Source s : contient-elle le point x (cqh) ? Forme de P1 centrée sur la zone (décalage en cqh), tournée de son angle ;
// rayon et dimensions négatifs : ceux de la zone ; contour : bande d'une cellule.
fn dansSourceG(s: SourceG, x: vec2f) -> bool {
  let z = GR.zone;
  let d = x - (z.xy + 0.5 * z.zw + s.c.yz);
  let ca = cos(s.c.x);
  let sa = sin(s.c.x);
  let l = vec2f(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  let demi = 0.5 * GR.cote;
  let contour = s.a.z == 1u;
  switch s.a.y {
    case 0u: { return all(abs(l) <= vec2f(demi)); }
    case 1u, 2u: {
      var R = s.b.x;
      if (R < 0.0) { R = 0.5 * min(z.z, z.w); }
      let r = length(l);
      if (contour) { return abs(r - R) <= demi; }
      var ri = 0.0;
      if (s.a.y == 2u) { ri = s.b.y; }
      return r <= R && r >= ri;
    }
    case 3u, 5u: {
      var W = z.z;
      var H = z.w;
      if (s.a.y == 3u) {
        if (s.b.z >= 0.0) { W = s.b.z; }
        if (s.b.w >= 0.0) { H = s.b.w; }
      }
      let a = abs(l);
      let dedans = a.x <= 0.5 * W && a.y <= 0.5 * H;
      if (contour) { return dedans && (a.x >= 0.5 * W - 2.0 * demi || a.y >= 0.5 * H - 2.0 * demi); }
      return dedans;
    }
    case 4u: {
      var Lg = s.b.z;
      if (Lg < 0.0) { Lg = z.z; }
      return abs(l.x) <= 0.5 * Lg && abs(l.y) <= demi;
    }
    default: { return false; }
  }
}

// 1. Obstacles de P3 rastérisés à τ1 : cellule pleine (centre dans un obstacle des catégories visées, actif) et vitesse du
// point matériel (translation, rotation, échelle) entre τ0 et τ1.
@compute @workgroup_size(64)
fn gObstacles(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let x = versScene(vec2f(f32(c % GR.nx) + 0.5, f32(c / GR.nx) + 0.5));
  var plein = 0.0;
  var v = vec2f(0.0);
  for (var o = 0u; o < Mo.n; o++) {
    if ((Mo.o[o].y & GR.masque) == 0u) { continue; }
    let B = repere(o, P.tau1);
    if (B.actif < 0.5) { continue; }
    let l = versLocal(B, x);
    var dedans = false;
    switch Mo.o[o].x {
      case 1u: { dedans = all(abs(l) <= B.demi); }
      case 2u: { let q = l / sur(B.demi); dedans = dot(q, q) <= 1.0; }
      case 3u: { dedans = abs(l.x) <= B.demi.x && abs(l.y) <= 0.5 * GR.cote; }
      case 4u: { dedans = distanceForme(o, B, l) <= 0.0; }
      default: { }
    }
    if (dedans) {
      plein = 1.0;
      let A = repere(o, P.tau0);
      if (A.actif > 0.5) { v = (x - materiel(A, l / sur(B.echelle))) / max(P.dt, 1e-6); }
      break;
    }
  }
  let b = GR.sol + c * 4u;
  champ[b] = plein;
  champ[b + 1u] = v.x;
  champ[b + 2u] = v.y;
  champ[b + 3u] = 0.0;
}

// 2. Injection : sources posées (débit × dt), puis dépôts des effets du pas (entiers en 1/65536, remis à zéro).
@compute @workgroup_size(64)
fn gInjecter(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let i = i32(c % GR.nx);
  let j = i32(c / GR.nx);
  let b = GR.sA + c * 8u;
  let x = versScene(vec2f(f32(i) + 0.5, f32(j) + 0.5));
  var fumee = champ[b];
  var chaleur = champ[b + 1u];
  var encre = vec3f(champ[b + 4u], champ[b + 5u], champ[b + 6u]);
  let plein = solideG(i, j);
  if (!plein) {
    for (var k = 0u; k < GR.nSources; k++) {
      let s = GR.sources[k];
      if (!dansSourceG(s, x)) { continue; }
      let q = s.c.w * GR.dt;
      if (s.a.x == 0u) { fumee += q; chaleur += s.d.x * q; }
      else if (s.a.x == 1u) { chaleur += q; }
      else { encre += s.d.yzw * q; chaleur += s.d.x * q; }
    }
  }
  let d = c * 5u;
  let f = f32(atomicExchange(&depots[d], 0u)) / G_FIXE;
  let t = f32(atomicExchange(&depots[d + 1u], 0u)) / G_FIXE;
  let e = vec3f(f32(atomicExchange(&depots[d + 2u], 0u)), f32(atomicExchange(&depots[d + 3u], 0u)), f32(atomicExchange(&depots[d + 4u], 0u))) / G_FIXE;
  if (!plein) {
    fumee += f;
    chaleur += t;
    encre += e;
  }
  champ[b] = fumee;
  champ[b + 1u] = chaleur;
  champ[b + 4u] = encre.x;
  champ[b + 5u] = encre.y;
  champ[b + 6u] = encre.z;
}

// 3. Advection des scalaires (fumée, température, encre) : semi-lagrangienne vers l'avant, départ en RK2 (vitesse du pas
// précédent, sans divergence) -> sB.
@compute @workgroup_size(64)
fn gAdvecterS(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let d = departG(GR.vA, vec2f(f32(c % GR.nx) + 0.5, f32(c / GR.nx) + 0.5), 1.0);
  for (var k = 0u; k < 8u; k++) { champ[GR.sB + c * 8u + k] = scalG(GR.sA, k, d).v; }
}

// 4. Correction de MacCormack : φ̂ + (φ − φ̃) / 2, φ̃ = φ̂ ramené en arrière ; bornée par les quatre valeurs de départ (aucun
// extremum nouveau) ; dissipation de la fumée et de l'encre, refroidissement ; rien dans un obstacle -> sC.
@compute @workgroup_size(64)
fn gCorrigerS(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let i = i32(c % GR.nx);
  let j = i32(c / GR.nx);
  let g = vec2f(f32(i) + 0.5, f32(j) + 0.5);
  let d = departG(GR.vA, g, 1.0);
  let a = departG(GR.vA, g, -1.0);
  let plein = solideG(i, j);
  let kd = exp(-GR.dissipation * GR.dt);
  let kt = exp(-GR.refroidissement * GR.dt);
  for (var k = 0u; k < 8u; k++) {
    let o = c * 8u + k;
    let s = scalG(GR.sA, k, d);
    var r = clamp(champ[GR.sB + o] + 0.5 * (champ[GR.sA + o] - scalG(GR.sB, k, a).v), s.mn, s.mx);
    if (k == 1u) { r = r * kt; } else { r = r * kd; }
    if (plein) { r = 0.0; }
    champ[GR.sC + o] = r;
  }
}

// 5. Scalaires corrigés recopiés dans l'état (une cellule par fil : 8 valeurs).
@compute @workgroup_size(64)
fn gRecopierS(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  for (var k = 0u; k < 8u; k++) { champ[GR.sA + c * 8u + k] = champ[GR.sC + c * 8u + k]; }
}

// Vitesse au centre de la cellule (i, j) (moyenne des faces ; bornée à la grille).
fn centreG(base: u32, i: i32, j: i32) -> vec2f {
  let ii = u32(clamp(i, 0, i32(GR.nx) - 1));
  let jj = u32(clamp(j, 0, i32(GR.ny) - 1));
  return vec2f(0.5 * (champ[base + indiceU(ii, jj)] + champ[base + indiceU(ii + 1u, jj)]),
               0.5 * (champ[base + indiceV(ii, jj)] + champ[base + indiceV(ii, jj + 1u)]));
}

// 6. Tourbillon (∂v/∂x − ∂u/∂y, y vers le bas : positif dans le sens des angles croissants) au centre de chaque cellule -> dv.
@compute @workgroup_size(64)
fn gTourbillon(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let i = i32(c % GR.nx);
  let j = i32(c / GR.nx);
  champ[GR.dv + c] = (centreG(GR.vA, i + 1, j).y - centreG(GR.vA, i - 1, j).y - centreG(GR.vA, i, j + 1).x + centreG(GR.vA, i, j - 1).x) / (2.0 * GR.cote);
}

fn tourbillonG(i: i32, j: i32) -> f32 {
  return champ[GR.dv + celluleG(clamp(i, 0, i32(GR.nx) - 1), clamp(j, 0, i32(GR.ny) - 1))];
}

// Force au centre de la cellule (i, j) (bornée à la grille) : flottaison (la chaleur monte : y vers le haut négatif) et
// confinement de vorticité ε h (N × ω), N : direction du gradient de |ω|.
fn forceG(i: i32, j: i32) -> vec2f {
  let ii = clamp(i, 0, i32(GR.nx) - 1);
  let jj = clamp(j, 0, i32(GR.ny) - 1);
  let c = celluleG(ii, jj);
  let w = champ[GR.dv + c];
  let eta = vec2f(abs(tourbillonG(ii + 1, jj)) - abs(tourbillonG(ii - 1, jj)), abs(tourbillonG(ii, jj + 1)) - abs(tourbillonG(ii, jj - 1))) / (2.0 * GR.cote);
  let N = eta / (length(eta) + 1e-5);
  return vec2f(0.0, -GR.flottaison * champ[GR.sA + c * 8u + 1u]) + GR.vorticite * GR.cote * vec2f(N.y * w, -N.x * w);
}

// Face f : composante (u ou v), indices, position (en cellules), cellules voisines a (avant) et b (après).
struct FaceG { estU: bool, i: i32, j: i32, g: vec2f, ai: i32, aj: i32, bi: i32, bj: i32 };
fn faceDe(f: u32) -> FaceG {
  if (f < GR.nu) {
    let i = i32(f % (GR.nx + 1u));
    let j = i32(f / (GR.nx + 1u));
    return FaceG(true, i, j, vec2f(f32(i), f32(j) + 0.5), i - 1, j, i, j);
  }
  let k = f - GR.nu;
  let i = i32(k % GR.nx);
  let j = i32(k / GR.nx);
  return FaceG(false, i, j, vec2f(f32(i) + 0.5, f32(j)), i, j - 1, i, j);
}
fn composanteEn(base: u32, estU: bool, g: vec2f) -> Echantillon {
  if (estU) { return uEn(base, g); }
  return vEn(base, g);
}
// Valeur d'une grille de faces (largeur × hauteur, bornée) : laplacien de la viscosité.
fn faceG(base: u32, largeur: i32, hauteur: i32, i: i32, j: i32) -> f32 {
  return champ[base + u32(clamp(j, 0, hauteur - 1) * largeur + clamp(i, 0, largeur - 1))];
}
// Parois : cellules pleines voisines latérales de la face (le long de la face) -> (nombre, somme de leur composante).
fn paroiG(F: FaceG) -> vec2f {
  var cases: array<vec2i, 4>;
  if (F.estU) {
    cases = array<vec2i, 4>(vec2i(F.ai, F.aj - 1), vec2i(F.ai, F.aj + 1), vec2i(F.bi, F.bj - 1), vec2i(F.bi, F.bj + 1));
  } else {
    cases = array<vec2i, 4>(vec2i(F.ai - 1, F.aj), vec2i(F.ai + 1, F.aj), vec2i(F.bi - 1, F.bj), vec2i(F.bi + 1, F.bj));
  }
  var n = 0.0;
  var s = 0.0;
  for (var k = 0; k < 4; k++) {
    let q = cases[k];
    if (solideG(q.x, q.y)) {
      let v = vitesseSolideG(q.x, q.y);
      n += 1.0;
      s += select(v.y, v.x, F.estU);
    }
  }
  return vec2f(n, s);
}

// 7. Forces (flottaison, confinement), viscosité et frottement des parois appliqués aux faces -> vB.
@compute @workgroup_size(64)
fn gForcer(@builtin(global_invocation_id) gid: vec3u) {
  let f = gid.x;
  if (f >= GR.nf) { return; }
  let F = faceDe(f);
  var base = GR.vA;
  var largeur = i32(GR.nx) + 1;
  var hauteur = i32(GR.ny);
  var force = 0.5 * (forceG(F.ai, F.aj).x + forceG(F.bi, F.bj).x);
  if (!F.estU) {
    base = GR.vA + GR.nu;
    largeur = i32(GR.nx);
    hauteur = i32(GR.ny) + 1;
    force = 0.5 * (forceG(F.ai, F.aj).y + forceG(F.bi, F.bj).y);
  }
  let u = champ[GR.vA + f];
  let lap = faceG(base, largeur, hauteur, F.i + 1, F.j) + faceG(base, largeur, hauteur, F.i - 1, F.j)
    + faceG(base, largeur, hauteur, F.i, F.j + 1) + faceG(base, largeur, hauteur, F.i, F.j - 1) - 4.0 * u;
  var r = u + GR.dt * (force + GR.viscosite * lap / (GR.cote * GR.cote));
  let w = paroiG(F);
  if (w.x > 0.0) { r = mix(r, w.y / w.x, 1.0 - exp(-G_PAROI * GR.dt)); }
  champ[GR.vB + f] = r;
}

// 8. Advection de la vitesse par elle-même (après les forces) : vers l'avant -> vC.
@compute @workgroup_size(64)
fn gAdvecterV(@builtin(global_invocation_id) gid: vec3u) {
  let f = gid.x;
  if (f >= GR.nf) { return; }
  let F = faceDe(f);
  champ[GR.vC + f] = composanteEn(GR.vB, F.estU, departG(GR.vB, F.g, 1.0)).v;
}

// 9. Correction de MacCormack de la vitesse, bornée -> vA (état).
@compute @workgroup_size(64)
fn gCorrigerV(@builtin(global_invocation_id) gid: vec3u) {
  let f = gid.x;
  if (f >= GR.nf) { return; }
  let F = faceDe(f);
  let s = composanteEn(GR.vB, F.estU, departG(GR.vB, F.g, 1.0));
  let retour = composanteEn(GR.vC, F.estU, departG(GR.vB, F.g, -1.0)).v;
  champ[GR.vA + f] = clamp(champ[GR.vC + f] + 0.5 * (champ[GR.vB + f] - retour), s.mn, s.mx);
}

// Face bloquée : elle touche un obstacle (vitesse de l'obstacle, moyenne s'il y en a deux) ou un bord fermé (nulle).
struct BordG { bloque: bool, v: f32 };
fn bordG(F: FaceG) -> BordG {
  let sa = solideG(F.ai, F.aj);
  let sb = solideG(F.bi, F.bj);
  if (sa || sb) {
    var v = vec2f(0.0);
    var n = 0.0;
    if (sa) { v += vitesseSolideG(F.ai, F.aj); n += 1.0; }
    if (sb) { v += vitesseSolideG(F.bi, F.bj); n += 1.0; }
    v = v / n;
    return BordG(true, select(v.y, v.x, F.estU));
  }
  if (GR.bords == 1u && (!dansG(F.ai, F.aj) || !dansG(F.bi, F.bj))) { return BordG(true, 0.0); }
  return BordG(false, 0.0);
}

// 10. Limites : vitesse des faces bloquées imposée (obstacles, bords fermés).
@compute @workgroup_size(64)
fn gLimites(@builtin(global_invocation_id) gid: vec3u) {
  let f = gid.x;
  if (f >= GR.nf) { return; }
  let b = bordG(faceDe(f));
  if (b.bloque) { champ[GR.vA + f] = b.v; }
}

// 11. Divergence (flux sortant de la cellule, cqh/s) de chaque cellule libre -> dv.
@compute @workgroup_size(64)
fn gDivergence(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let i = c % GR.nx;
  let j = c / GR.nx;
  var D = 0.0;
  if (!solideG(i32(i), i32(j))) {
    D = champ[GR.vA + indiceU(i + 1u, j)] - champ[GR.vA + indiceU(i, j)] + champ[GR.vA + indiceV(i, j + 1u)] - champ[GR.vA + indiceV(i, j)];
  }
  champ[GR.dv + c] = D;
}

// Voisine d'une cellule pour Jacobi : (compte, pression) ; obstacle ou bord fermé : absente ; bord ouvert : pression nulle.
fn voisineP(src: u32, i: i32, j: i32) -> vec2f {
  if (!dansG(i, j)) {
    if (GR.bords == 1u) { return vec2f(0.0); }
    return vec2f(1.0, 0.0);
  }
  if (solideG(i, j)) { return vec2f(0.0); }
  return vec2f(1.0, champ[src + celluleG(i, j)]);
}

// 12. Une itération de Jacobi (40 par pas, nombre fixe ; source et destination alternées par IT) : chaque cellule ne lit que
// l'itération précédente (résultat indépendant de l'ordre des fils).
@compute @workgroup_size(64)
fn gJacobi(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let i = i32(c % GR.nx);
  let j = i32(c / GR.nx);
  var p = 0.0;
  if (!solideG(i, j)) {
    let s = voisineP(IT.src, i + 1, j) + voisineP(IT.src, i - 1, j) + voisineP(IT.src, i, j + 1) + voisineP(IT.src, i, j - 1);
    if (s.x > 0.0) { p = (s.y - champ[GR.dv + c]) / s.x; }
  }
  champ[IT.dst + c] = p;
}

fn pressionG(i: i32, j: i32) -> f32 {
  if (!dansG(i, j)) { return 0.0; }
  return champ[GR.pA + celluleG(i, j)];
}

// 13. Projection : gradient de pression retiré des faces libres (bord ouvert : pression nulle dehors).
@compute @workgroup_size(64)
fn gProjeter(@builtin(global_invocation_id) gid: vec3u) {
  let f = gid.x;
  if (f >= GR.nf) { return; }
  let F = faceDe(f);
  if (bordG(F).bloque) { return; }
  champ[GR.vA + f] = champ[GR.vA + f] - (pressionG(F.bi, F.bj) - pressionG(F.ai, F.aj));
}

// 14. Textures publiées : vent (vitesse au centre, plein), A (fumée, température, lumière reçue, plein), B (encre).
// Lumière : 16 pas d'une cellule vers la lumière dans la grille, densité de fumée accumulée, transmission exp(−a Σ ρ h).
@compute @workgroup_size(64)
fn gPublier(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= GR.n) { return; }
  let i = i32(c % GR.nx);
  let j = i32(c / GR.nx);
  let g = vec2f(f32(i) + 0.5, f32(j) + 0.5);
  let b = GR.sA + c * 8u;
  let plein = select(0.0, 1.0, solideG(i, j));
  var somme = 0.0;
  for (var k = 1u; k <= G_PAS_LUMIERE; k++) {
    let ql = g + GR.lumiere * f32(k);
    if (ql.x < 0.0 || ql.y < 0.0 || ql.x > f32(GR.nx) || ql.y > f32(GR.ny)) { break; }
    somme += max(scalG(GR.sA, 0u, ql).v, 0.0);
  }
  let lum = exp(-GR.absorption * somme * GR.cote);
  let q = vec2u(u32(i), u32(j));
  textureStore(texVent, q, vec4f(centreG(GR.vA, i, j), plein, 0.0));
  textureStore(texA, q, vec4f(champ[b], champ[b + 1u], lum, plein));
  textureStore(texB, q, vec4f(champ[b + 4u], champ[b + 5u], champ[b + 6u], 0.0));
}
`;

  let code = null;
  /** Module « pm-milieu » : module des collisions de P3 (repères, formes) et noyaux de la grille. */
  P.codeMilieu = function () {
    if (!code) code = P.WGSL_MODULE_COLLISIONS() + WGSL_MILIEU;
    return code;
  };

  // La classe P.Milieu et P.Couplage : tâche 2.
})(typeof globalThis !== 'undefined' ? globalThis : this);
