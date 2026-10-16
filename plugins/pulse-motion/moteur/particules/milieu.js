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
 *   Les effets ne déposent qu'aux pas où le milieu avance (encoderPas(passe, n, milieuActif)).
 *   .avancer(tau, zones) -> [membre.positionner(k, τ, zones[i])]   (tau : s depuis le début du groupe ; zones[i] du membre i)
 *   .kFin, .detruire()
 *
 * P.emballerDepot(em, grille, capacite) -> ArrayBuffer (64)   uniforme « Depot » d'un émetteur à « injecte »
 * P.codeDepots() -> WGSL du module « pm-depots » ; P.creerDepots(device, sim, milieu) -> { encoder(passe), detruire() } | null :
 *   dépôts des émetteurs à « injecte » de sim dans la grille (un dispatch par émetteur, à la fin du pas de sim : particule
 *   vivante, cellule qui la contient, quantité × dt en entiers de 1/65536 ; encre fixe ou −ln de la couleur de la particule)
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
    ENCRE: 1,                // encre déposée par seconde et par particule (« injecte »)
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

  // Pipelines du module « pm-milieu », un par device ; disposition explicite (2 tampons de stockage, 3 textures de stockage).
  const parDevice = new WeakMap();
  function pipelinesMilieu(device) {
    let p = parDevice.get(device);
    if (p) return p;
    const V = GPUShaderStage.COMPUTE;
    const ecriture = (b) => ({ binding: b, visibility: V, storageTexture: { access: 'write-only', format: 'rgba32float' } });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 4, visibility: V, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } },
        { binding: 11, visibility: V, buffer: { type: 'uniform' } },
        { binding: 12, visibility: V, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
        { binding: 13, visibility: V, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 14, visibility: V, sampler: { type: 'filtering' } },
        { binding: 30, visibility: V, buffer: { type: 'uniform' } },
        { binding: 31, visibility: V, buffer: { type: 'storage' } },
        { binding: 32, visibility: V, buffer: { type: 'storage' } },
        ecriture(33), ecriture(34), ecriture(35),
        { binding: 36, visibility: V, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 16 } },
      ],
    });
    const module = device.createShaderModule({ label: 'pm-milieu', code: P.codeMilieu() });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipelines = {};
    P.NOYAUX_MILIEU.forEach((nom) => { pipelines[nom] = device.createComputePipeline({ layout: pl, compute: { module, entryPoint: nom } }); });
    p = {
      layout,
      pipelines,
      lisse: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
    };
    parDevice.set(device, p);
    return p;
  }

  class Milieu {
    constructor(device, effet, zone, monde, duree) {
      if (!effet || !effet.milieu) throw new Error('Milieu : la recette « ' + (effet && effet.nom) + ' » n\'a pas de bloc « milieu ».');
      const U = GPUBufferUsage;
      const T = GPUTextureUsage;
      this.device = device;
      this.effet = effet;
      this.zone = zone.slice();
      this.grille = P.grilleMilieu(zone, effet.milieu.resolution);
      const g = this.grille;
      this.d = P.dispositionMilieu(g.nx, g.ny);
      this.duree = Math.max(PAS, duree);
      this.nZones = Math.ceil(this.duree * GRILLE) + 2;
      this.kFin = Math.ceil(this.duree / PAS) + 1;
      this.k = 0;
      this.tau = 0;
      this.tailleEtat = this.d.etat * 4;
      this.monde = monde && monde.actif ? monde : null;
      this.champ = device.createBuffer({ size: this.d.total * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
      this.depots = device.createBuffer({ size: this.d.n * 5 * 4, usage: U.STORAGE | U.COPY_DST });
      this.uniforme = device.createBuffer({ size: C.OCTETS_GRILLE, usage: U.UNIFORM | U.COPY_DST });
      device.queue.writeBuffer(this.uniforme, 0, P.emballerGrille(effet, g, this.d, zone));
      // Itérations de Jacobi : source et destination alternées (tranches de 256 octets : A -> B, puis B -> A).
      this.iterations = device.createBuffer({ size: 512, usage: U.UNIFORM | U.COPY_DST });
      const it = new Uint32Array(128);
      it.set([this.d.pA, this.d.pB], 0);
      it.set([this.d.pB, this.d.pA], 64);
      device.queue.writeBuffer(this.iterations, 0, it);
      this.tamponPas = device.createBuffer({ size: 256 * PAS_PAR_LOT, usage: U.UNIFORM | U.COPY_DST });
      this.donneesPas = new ArrayBuffer(256 * PAS_PAR_LOT);
      this.u32Pas = new Uint32Array(this.donneesPas);
      this.f32Pas = new Float32Array(this.donneesPas);
      const texture = () => device.createTexture({ size: [g.nx, g.ny], format: 'rgba32float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
      this.texVent = texture();
      this.texA = texture();
      this.texB = texture();
      this.vueVent = this.texVent.createView();
      this.vueA = this.texA.createView();
      this.vueB = this.texB.createView();
      // Géométrie de la grille pour les effets qui lisent le vent (liaison 25 de simulation.js) : origine, côté, nx, ny.
      this.uniformeVent = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
      const v = new ArrayBuffer(32);
      new Float32Array(v).set([g.origine[0], g.origine[1], g.cote], 0);
      new Uint32Array(v).set([g.nx, g.ny], 4);
      device.queue.writeBuffer(this.uniformeVent, 0, v);
      this.p = pipelinesMilieu(device);
      if (this.monde) this.preparerMonde(); else this.mondeVide();
      this.groupe = device.createBindGroup({
        layout: this.p.layout,
        entries: [
          { binding: 4, resource: { buffer: this.tamponPas, size: 80 } },
          { binding: 11, resource: { buffer: this.uniformeMonde } },
          { binding: 12, resource: this.vueReperes },
          { binding: 13, resource: this.vueSdf },
          { binding: 14, resource: this.p.lisse },
          { binding: 30, resource: { buffer: this.uniforme } },
          { binding: 31, resource: { buffer: this.champ } },
          { binding: 32, resource: { buffer: this.depots } },
          { binding: 33, resource: this.vueVent },
          { binding: 34, resource: this.vueA },
          { binding: 35, resource: this.vueB },
          { binding: 36, resource: { buffer: this.iterations, size: 16 } },
        ],
      });
    }

    /** Obstacles : uniforme « Monde », texture des repères (une ligne par point de grille), champs de distance des formes. */
    preparerMonde() {
      const { device } = this;
      const O = M.obstacles;
      const entrees = this.monde.entrees;
      this.nObs = entrees.length;
      this.reperesConnus = new Uint8Array(this.nZones);
      this.texReperes = device.createTexture({
        size: [2 * this.nObs, Math.min(this.nZones, LIGNES_REPERES), Math.ceil(this.nZones / LIGNES_REPERES)],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.vueReperes = this.texReperes.createView({ dimension: '2d-array' });
      this.uniformeMonde = device.createBuffer({ size: O.OCTETS_MONDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(this.uniformeMonde, 0, O.emballerMonde(entrees, this.nZones, this.monde.largeurCqh, []));
      if (this.monde.formes) this.vueSdf = this.monde.formes.vue;
      else {
        this.sdfVide = device.createTexture({ size: [1, 1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING });
        this.vueSdf = this.sdfVide.createView({ dimension: '2d-array' });
      }
    }

    /** Sans obstacle : monde vide (n = 0), textures d'un texel. */
    mondeVide() {
      const { device } = this;
      this.uniformeMonde = device.createBuffer({ size: M.obstacles ? M.obstacles.OCTETS_MONDE : 816, usage: GPUBufferUsage.UNIFORM });
      this.texVide = device.createTexture({ size: [1, 1, 1], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING });
      this.sdfVide = device.createTexture({ size: [1, 1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING });
      this.vueReperes = this.texVide.createView({ dimension: '2d-array' });
      this.vueSdf = this.sdfVide.createView({ dimension: '2d-array' });
    }

    /** Repères des obstacles aux points de grille utiles au pas k (et à ses voisins), envoyés une fois chacun. */
    assurerReperes(k, zones) {
      const n = this.nObs;
      const g0 = Math.max(0, Math.floor(k * PAS * GRILLE) - 1);
      const g1 = Math.min(this.nZones - 1, Math.floor((k + 1) * PAS * GRILLE) + 2);
      for (let g = g0; g <= g1; g++) {
        if (this.reperesConnus[g]) continue;
        this.device.queue.writeTexture(
          { texture: this.texReperes, origin: [0, g % LIGNES_REPERES, Math.floor(g / LIGNES_REPERES)] },
          zones.reperes(g), { bytesPerRow: n * 2 * 16 }, [n * 2, 1, 1]);
        this.reperesConnus[g] = 1;
      }
    }

    /** Membre : données du pas k (local au milieu) dans la tranche o (mots) ; repères des obstacles utiles. */
    preparerPas(o, k, zones) {
      if (this.texReperes) this.assurerReperes(k, zones);
      const u = this.u32Pas;
      const f = this.f32Pas;
      const tau0 = Math.fround(k * PAS);
      const tau1 = Math.fround((k + 1) * PAS);
      u[o] = k;
      f[o + 1] = tau0;
      f[o + 2] = tau1;
      f[o + 3] = tau1 - tau0;
    }

    envoyerPas(n) {
      if (n) this.device.queue.writeBuffer(this.tamponPas, 0, this.donneesPas, 0, n * 256);
    }

    /** Membre : pas de la tranche n, une phase par dispatch (Jacobi : 40 dispatches, source et destination alternées). */
    encoderPas(passe, n) {
      const cellules = Math.ceil(this.d.n / 64);
      const faces = Math.ceil(this.d.nf / 64);
      const lancer = (nom, groupes, it = 0) => {
        passe.setPipeline(this.p.pipelines[nom]);
        passe.setBindGroup(0, this.groupe, [n * 256, it * 256]);
        passe.dispatchWorkgroups(groupes);
      };
      lancer('gObstacles', cellules);
      lancer('gInjecter', cellules);
      lancer('gAdvecterS', cellules);
      lancer('gCorrigerS', cellules);
      lancer('gRecopierS', cellules);
      lancer('gTourbillon', cellules);
      lancer('gForcer', faces);
      lancer('gAdvecterV', faces);
      lancer('gCorrigerV', faces);
      lancer('gLimites', faces);
      lancer('gDivergence', cellules);
      for (let it = 0; it < C.JACOBI; it++) lancer('gJacobi', cellules, it % 2);
      lancer('gProjeter', faces);
      lancer('gPublier', cellules);
    }

    /** Membre : pas et τ atteints (le rendu lit les textures publiées). */
    positionner(k, tau) {
      this.k = k;
      this.tau = tau;
      return null;
    }

    /** Textures recalculées depuis l'état (après vider ou restaurer : elles ne sont pas dans l'état). */
    republier(enc) {
      const p = enc.beginComputePass();
      p.setPipeline(this.p.pipelines.gPublier);
      p.setBindGroup(0, this.groupe, [0, 0]);
      p.dispatchWorkgroups(Math.ceil(this.d.n / 64));
      p.end();
    }

    viderEtat(enc) {
      enc.clearBuffer(this.champ);
      enc.clearBuffer(this.depots);
      this.republier(enc);
    }

    /** Copie de l'état (vitesse, scalaires, pression) dans un instantané ; créé à la première sauvegarde. */
    sauverEtat(enc, copie) {
      const c = copie || this.device.createBuffer({ size: this.tailleEtat, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      enc.copyBufferToBuffer(this.champ, 0, c, 0, this.tailleEtat);
      return c;
    }

    restaurerEtat(enc, c) {
      enc.copyBufferToBuffer(c, 0, this.champ, 0, this.tailleEtat);
      enc.clearBuffer(this.depots);
      this.republier(enc);
    }

    detruireCopie(c) { c.destroy(); }

    async lire() {
      const { device } = this;
      const lecture = device.createBuffer({ size: this.champ.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(this.champ, 0, lecture, 0, this.champ.size);
      device.queue.submit([enc.finish()]);
      await lecture.mapAsync(GPUMapMode.READ);
      const f = new Float32Array(lecture.getMappedRange().slice(0));
      lecture.unmap();
      lecture.destroy();
      const d = this.d;
      return {
        vitesse: f.slice(d.vA, d.vA + d.nf),
        scalaires: f.slice(d.sA, d.sA + 8 * d.n),
        pression: f.slice(d.pA, d.pA + d.n),
        divergence: f.slice(d.dv, d.dv + d.n),
        solide: f.slice(d.sol, d.sol + 4 * d.n),
        etat: new Uint32Array(f.buffer.slice(0, d.etat * 4)),
      };
    }

    /** Tests : scalaires de l'état imposés (8 valeurs par cellule), textures publiées. */
    ecrireScalaires(valeurs) {
      this.device.queue.writeBuffer(this.champ, this.d.sA * 4, valeurs);
      const enc = this.device.createCommandEncoder();
      this.republier(enc);
      this.device.queue.submit([enc.finish()]);
    }

    detruire() {
      [this.champ, this.depots, this.uniforme, this.iterations, this.tamponPas, this.uniformeVent, this.uniformeMonde].forEach((b) => b && b.destroy());
      [this.texVent, this.texA, this.texB, this.texReperes, this.texVide, this.sdfVide].forEach((t) => t && t.destroy());
    }
  }

  P.Milieu = Milieu;

  class Couplage {
    constructor(device, membres) {
      this.device = device;
      this.membres = membres.map((m) => ({ membre: m.membre, debut: Math.max(0, Math.round(m.debut)) }));
      this.kFin = Math.max(1, ...this.membres.map((m) => m.debut + m.membre.kFin));
      const tailleEtat = this.membres.reduce((s, m) => s + m.membre.tailleEtat, 0);
      this.planificateur = M.instantanes.creerPlanificateur({
        intervalle: M.instantanes.intervallePour({ tailleEtat, pasTotal: this.kFin, budget: BUDGET_INSTANTANES }),
      });
      this.instantanes = new Map();
      this.k = 0;
    }

    avancer(tau, zones) {
      const k = Math.min(this.kFin, Math.max(0, Math.floor(tau / PAS + 1e-6)));
      this.executer(this.planificateur.planifier(k), zones);
      this.k = k;
      return this.membres.map((m, i) => m.membre.positionner(Math.min(m.membre.kFin, Math.max(0, k - m.debut)), tau - m.debut * PAS, zones[i]));
    }

    executer(actions, zones) {
      if (!actions.length) return;
      const { device } = this;
      let enc = null;
      let passe = null;
      let n = 0;
      const ouvrir = () => { if (!enc) enc = device.createCommandEncoder(); };
      const fermerPasse = () => { if (passe) { passe.end(); passe = null; } };
      const envoyer = () => {
        fermerPasse();
        if (!enc) return;
        this.membres.forEach((m) => m.membre.envoyerPas(n));
        device.queue.submit([enc.finish()]);
        enc = null;
        n = 0;
      };
      for (const a of actions) {
        if (a.type === 'pas') {
          if (n === PAS_PAR_LOT) envoyer();
          ouvrir();
          // Membres actifs à ce pas du groupe, dans l'ordre : effets, puis le milieu (dernier) ; données d'abord, puis la passe.
          // Les effets ne déposent dans la grille qu'aux pas où le milieu avance aussi (sinon les dépôts s'accumuleraient hors
          // de l'état).
          const actifs = [];
          let milieuActif = false;
          this.membres.forEach((m, i) => {
            const k = a.k - m.debut;
            const milieu = m.membre instanceof Milieu;
            if (k >= 0 && k < m.membre.kFin) {
              actifs.push({ m, i, k });
              if (milieu) milieuActif = true;
            }
          });
          actifs.forEach((x) => x.m.membre.preparerPas(n * 64, x.k, zones[x.i]));
          if (!passe) passe = enc.beginComputePass();
          actifs.forEach((x) => x.m.membre.encoderPas(passe, n, milieuActif));
          n++;
          continue;
        }
        ouvrir();
        fermerPasse();
        if (a.type === 'vider') this.membres.forEach((m) => m.membre.viderEtat(enc));
        else if (a.type === 'restaurer') {
          const c = this.instantanes.get(a.k);
          this.membres.forEach((m, i) => m.membre.restaurerEtat(enc, c[i]));
        } else if (a.type === 'sauver') {
          const c = this.instantanes.get(a.k) || [];
          this.membres.forEach((m, i) => { c[i] = m.membre.sauverEtat(enc, c[i]); });
          this.instantanes.set(a.k, c);
        }
      }
      envoyer();
    }

    detruire() {
      this.instantanes.forEach((c) => c.forEach((x, i) => this.membres[i].membre.detruireCopie(x)));
      this.instantanes.clear();
    }
  }

  P.emballerDepot = function (em, grille, capacite) {
    const b = new ArrayBuffer(64);
    const f = new Float32Array(b);
    const u = new Uint32Array(b);
    const inj = em.injecte;
    f[0] = grille.origine[0]; f[1] = grille.origine[1]; f[2] = grille.cote; f[3] = PAS;
    u[4] = grille.nx; u[5] = grille.ny;
    u[6] = !inj.encre ? 0 : inj.encre.mode === 'fixe' ? 1 : 2;
    u[7] = capacite;
    f[8] = inj.fumee; f[9] = inj.chaleur; f[10] = inj.encre ? C.ENCRE : 0;
    f.set(inj.encre ? inj.encre.absorbance : [0, 0, 0], 12);
    return b;
  };

  const WGSL_DEPOTS = /* wgsl */ `
struct Depot { origine: vec2f, cote: f32, dt: f32, n: vec2u, mode: u32, capacite: u32, quantites: vec4f, encre: vec4f };
@group(0) @binding(0) var<storage, read> particules: array<Particule>;
@group(0) @binding(1) var<storage, read> T: array<f32>;
@group(0) @binding(2) var<storage, read_write> depots: array<atomic<u32>>;
@group(0) @binding(3) var<uniform> D: Depot;

// Quantité en entiers de 1/65536 (au plus 4 unités par dépôt).
fn entier(x: f32) -> u32 { return u32(round(clamp(x, 0.0, 4.0) * 65536.0)); }

// Couleur (linéaire) de la particule à son âge : table des couleurs de l'émetteur (64 RVBA).
fn couleurVie(p: Particule) -> vec3f {
  let x = clamp(p.age / max(p.vie, 1e-6), 0.0, 1.0) * 63.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 63u);
  let a = vec3f(T[i * 4u], T[i * 4u + 1u], T[i * 4u + 2u]);
  let b = vec3f(T[j * 4u], T[j * 4u + 1u], T[j * 4u + 2u]);
  return mix(a, b, x - f32(i));
}

// Dépôt d'une particule vivante dans la cellule de la grille qui la contient (fin du pas) : fumée, chaleur, encre (absorbance
// fixe, ou −ln de sa couleur) × quantité × dt ; additions entières (même somme dans tout ordre).
@compute @workgroup_size(64)
fn deposer(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= D.capacite || D.n.x == 0u) { return; }
  let p = particules[s];
  if (p.vivante != 1u) { return; }
  let g = (p.pos - D.origine) / D.cote;
  if (g.x < 0.0 || g.y < 0.0 || g.x >= f32(D.n.x) || g.y >= f32(D.n.y)) { return; }
  let b = (u32(g.y) * D.n.x + u32(g.x)) * 5u;
  if (D.quantites.x > 0.0) { atomicAdd(&depots[b], entier(D.quantites.x * D.dt)); }
  if (D.quantites.y > 0.0) { atomicAdd(&depots[b + 1u], entier(D.quantites.y * D.dt)); }
  if (D.mode > 0u) {
    var a = D.encre.xyz;
    if (D.mode == 2u) { a = -log(max(couleurVie(p), vec3f(0.02))); }
    let q = D.quantites.z * D.dt;
    atomicAdd(&depots[b + 2u], entier(a.x * q));
    atomicAdd(&depots[b + 3u], entier(a.y * q));
    atomicAdd(&depots[b + 4u], entier(a.z * q));
  }
}
`;

  P.codeDepots = function () { return P.WGSL_COMMUN + WGSL_DEPOTS; };

  const parDeviceDepots = new WeakMap();
  function pipelineDepots(device) {
    let p = parDeviceDepots.get(device);
    if (!p) {
      const module = device.createShaderModule({ label: 'pm-depots', code: P.codeDepots() });
      p = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'deposer' } });
      parDeviceDepots.set(device, p);
    }
    return p;
  }

  P.creerDepots = function (device, sim, milieu) {
    const liste = sim.emetteurs.filter((e) => e.em.injecte && !e.inerte && e.particules);
    if (!liste.length) return null;
    const pipeline = pipelineDepots(device);
    const lots = liste.map((e) => {
      const uniforme = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(uniforme, 0, P.emballerDepot(e.em, milieu.grille, e.capacite));
      return {
        e,
        uniforme,
        groupe: device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: e.particules } },
            { binding: 1, resource: { buffer: e.tables } },
            { binding: 2, resource: { buffer: milieu.depots } },
            { binding: 3, resource: { buffer: uniforme } },
          ],
        }),
      };
    });
    return {
      encoder(passe) {
        passe.setPipeline(pipeline);
        lots.forEach((l) => {
          passe.setBindGroup(0, l.groupe);
          passe.dispatchWorkgroups(Math.ceil(l.e.capacite / 64));
        });
      },
      detruire() { lots.forEach((l) => l.uniforme.destroy()); },
    };
  };

  P.Couplage = Couplage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
