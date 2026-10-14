/* Pulse Motion – voisinage des particules (P5a) : grille de hachage, comptage, somme préfixe, tri stable par cellule.
 *
 * P.grilleInteractions(largeurCqh, cote) -> { origine: [x, y], cote, nx, ny, n }   grille fixe : la scène élargie de 25 %
 *   de chaque côté (cqh), cellules de côté « cote » ; Error au-delà de CELLULES_MAX cellules
 * P.iterationsGroupe(def, membres) -> itérations du solveur (fluide 2 × max(incompressibilite), grains 2 × ITERATIONS_GRAINS, essaim 0)
 * P.emballerGroupe(def, membres, grille, nCorps) -> ArrayBuffer   uniforme « Groupe » (560 octets) ; membres :
 *   [{ em, base, capacite }] (émetteurs simulés du groupe, dans l'ordre de la recette)
 * P.WGSL_GROUPE    structures WGSL partagées (ParamsMembre, Groupe, Membre, Corps) ; P.WGSL_PAS_GROUPE : struct Pas (48 octets)
 * P.WGSL_VOISINAGE module des noyaux du groupe
 * new P.Groupe(device, sim, def)   def : effet.groupes[g] ; sim : P.Simulation (emetteurs, tamponPas, largeurCqh, lireTampon)
 *   .noter(passe)          grains : position au début du pas (avant le pas des émetteurs)
 *   .executer(passe, n)    après le pas des émetteurs : corps, comptage, préfixe, rangement, tri, solveur du type
 *                          (SOLVEURS), rendu aux particules (n : rang du pas dans le lot, décalage n × 256 du tampon des pas)
 * Solveurs (Jacobi, sommes dans l'ordre trié des 9 cellules voisines) : essaim (Reynolds), fluide (PBF), grains (PBD) ;
 * positions de travail en ping-pong (résultat dans posA). Rendu aux particules : module « pm-rendre », ou, pour un émetteur
 * à collisions, module des collisions de P3 augmenté (« rendreC » : correction arrêtée aux obstacles, fuite de l'essaim) ;
 * grains soutenus et presque immobiles mis au repos.
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
  const PLEINE = 96;   // même valeur que PLEINE_VOISINAGE de recette.js (contrôles)
  const OCTETS_GROUPE = 560;
  const OCTETS_CORPS = 32;
  const ITERATIONS_GRAINS = 6;
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
@group(0) @binding(14) var<storage, read_write> parcours: array<u32>;
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
  if (gid.x <= GR.nCellules) { atomicStore(&comptes[gid.x], 0u); }
}

// Grains : position au début du pas et numéro de la particule qui occupe la case (avant le pas des émetteurs).
@compute @workgroup_size(64)
fn noter(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= MB.capacite) { return; }
  let p = particules[s];
  anciennes[MB.base + s] = vec4f(p.pos, f32(p.n), f32(p.vivante));
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

// Rangement : chaque corps prend une place de sa cellule (ordre d'arrivée quelconque, trié ensuite). Parcours des
// solveurs : les corps de la grille cellule par cellule, puis les autres (compteur comptes[nCellules]) ; un fil par corps,
// voisins des fils proches dans la mémoire (le résultat de chaque corps ne dépend pas du fil qui le calcule).
@compute @workgroup_size(64)
fn ranger(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= GR.nCorps) { return; }
  let c = cles[i];
  if (c == AUCUN) {
    parcours[debuts[GR.nCellules] + atomicAdd(&comptes[GR.nCellules], 1u)] = i;
    return;
  }
  let k = debuts[c] + atomicAdd(&comptes[c], 1u);
  ordre[k] = i;
  parcours[k] = i;
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

  // Bornes de vitesse et direction de repli (essaim ; rendu aux particules : fuite).
  const WGSL_BORNER = /* wgsl */ `
// Direction de repli d'une vitesse nulle, tirée du numéro de la particule.
fn repli(n: u32) -> vec2f {
  let a = f32(pcg(n ^ 0x9e3779b9u) >> 8u) / 16777216.0 * 6.2831853;
  return vec2f(cos(a), sin(a));
}

// Vitesse bornée à [vmin, vmax] ; une vitesse nulle part dans la direction d.
fn borner(v: vec2f, vmin: f32, vmax: f32, d: vec2f) -> vec2f {
  let l = length(v);
  if (l > vmax) { return v * (vmax / l); }
  if (l < vmin) {
    if (l > 1e-6) { return v * (vmin / l); }
    return d * vmin;
  }
  return v;
}
`;

  // Voisines : 9 cellules dans l'ordre des cellules (ligne par ligne), corps de chacune dans l'ordre trié.
  const WGSL_VOISINS = /* wgsl */ `
struct Plage { a: u32, b: u32 };

// Corps dans la grille et dans une cellule non pleine : il a des voisines ce pas-ci.
fn dansGrille(i: u32) -> bool {
  let c = cles[i];
  return c != AUCUN && debuts[c + 1u] - debuts[c] <= PLEINE;
}

// Plage (dans ordre) de la cellule voisine numéro v (0 à 8, de (−1, −1) à (1, 1) ligne par ligne) de la cellule c ; vide
// hors de la grille ou pour une cellule pleine.
fn plage(c: u32, v: u32) -> Plage {
  let x = i32(c % GR.nx) + i32(v % 3u) - 1;
  let y = i32(c / GR.nx) + i32(v / 3u) - 1;
  if (x < 0 || y < 0 || x >= i32(GR.nx) || y >= i32(GR.ny)) { return Plage(0u, 0u); }
  let w = u32(y) * GR.nx + u32(x);
  let a = debuts[w];
  let b = debuts[w + 1u];
  if (b - a > PLEINE) { return Plage(0u, 0u); }
  return Plage(a, b);
}

// Direction de j vers i (d = pi − pj, r = |d|) ; corps confondus : direction tirée de la paire, opposée pour (j, i),
// pour qu'ils se séparent (coin d'un obstacle, naissance en un point).
fn direction(i: u32, j: u32, d: vec2f, r: f32) -> vec2f {
  if (r > 1e-6) { return d / r; }
  let a = f32(pcg((min(i, j) * 2654435761u) ^ max(i, j)) >> 8u) / 16777216.0 * 6.2831853;
  let u = vec2f(cos(a), sin(a));
  if (i < j) { return u; }
  return -u;
}
`;

  // Essaim (Reynolds).
  const WGSL_ESSAIM = /* wgsl */ `
// Séparation (rayon R), alignement et cohésion (voisines vues dans le cône, à moins du rayon de vision), attraction vers
// la cible (zone à τ1), vitesse bornée ; écart minimal R / 2 tenu par une correction de position (moitié de la moyenne
// des recouvrements). Position finale : prédiction + (vitesse pilotée − vitesse prédite) × dt.
@compute @workgroup_size(64)
fn essaim(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GR.nCorps) { return; }
  let i = parcours[gid.x];
  let ci = corps[i];
  posE[i] = ci.pos;
  vitesses[i] = ci.vel;
  if (ci.membre == AUCUN) { return; }
  let m = GR.m[ci.membre];
  let R = m.c.w;
  let vision = m.b.x;
  let vmax = m.b.w;
  var a = vec2f(0.0);
  var pousse = vec2f(0.0);
  var nPousse = 0.0;
  if (dansGrille(i)) {
    var sep = vec2f(0.0);
    var vMoy = vec2f(0.0);
    var pMoy = vec2f(0.0);
    var nVus = 0.0;
    var dir = vec2f(0.0);
    if (dot(ci.vel, ci.vel) > 1e-8) { dir = normalize(ci.vel); }
    for (var vc = 0u; vc < 9u; vc++) {
      let pl = plage(cles[i], vc);
      for (var k = pl.a; k < pl.b; k++) {
        let j = ordre[k];
        if (j == i) { continue; }
        let cj = corps[j];
        let d = ci.pos - cj.pos;
        let l = length(d);
        if (l >= vision) { continue; }
        let u = direction(i, j, d, l);
        if (l < R) { sep += u * (1.0 - l / R); }
        if (l < 0.5 * R) {
          pousse += u * (0.5 * R - l);
          nPousse += 1.0;
        }
        // Cône de vision : direction de i vers j à moins du demi-angle de la vitesse de i (vitesse nulle : tout est vu).
        if (dot(dir, dir) < 0.5 || dot(-u, dir) >= m.b.y) {
          vMoy += cj.vel;
          pMoy += cj.pos;
          nVus += 1.0;
        }
      }
    }
    a = m.a.x * 32.0 * vmax / R * sep;
    if (nVus > 0.0) {
      a += m.a.y * 2.0 * (vMoy / nVus - ci.vel);
      a += m.a.z * 2.0 * vmax * (pMoy / nVus - ci.pos) / vision;
    }
  }
  if (m.c.z > 0.5) {
    let d = P.zoneB.xy + P.zoneB.zw * m.c.xy - ci.pos;
    let l = length(d);
    if (l > 1e-6) { a += 4.0 * vmax * (d / l) * min(1.0, l / vision); }
  }
  let v = borner(ci.vel + a * P.dt, m.b.z, vmax, repli(ci.n));
  var x = ci.pos + (v - ci.vel) * P.dt;
  if (nPousse > 0.0) { x += 0.5 * pousse / nPousse; }
  posE[i] = x;
  vitesses[i] = v;
}
`;

  // Fluide (PBF) en unités de h : q = r / h.
  const WGSL_FLUIDE = /* wgsl */ `
const EPS_PBF = 0.1;        // relaxation du multiplicateur
const K_CORR = 0.1;         // répulsion artificielle (anti-amas)
const W_DQ = 0.884736;      // W(0,2) = (1 − 0,04)³
const PAS_MAX = 0.1;        // déplacement d'une itération au plus, en fraction de h

// Noyau de densité poly6 sans normalisation (W(0) = 1).
fn noyauW(q: f32) -> f32 {
  let a = 1.0 - q * q;
  return a * a * a;
}

// Gradient du noyau « spiky » par rapport à la position de i (u : direction de j vers i), en unités de q.
fn gradW(q: f32, u: vec2f) -> vec2f {
  let a = 1.0 - q;
  return -3.0 * a * a * u;
}

// PBF, étape 1 : densité ρ_i = 1 + Σ W (lue dans posL), contrainte C_i = ρ_i / ρ0 − 1 (dépression gardée à hauteur de
// « tension »), multiplicateur λ_i = −C_i / (Σ |∇C|² + ε).
@compute @workgroup_size(64)
fn densite(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GR.nCorps) { return; }
  let i = parcours[gid.x];
  if (corps[i].membre == AUCUN || !dansGrille(i)) {
    lambdas[i] = 0.0;
    return;
  }
  let m = GR.m[corps[i].membre];
  let rho0 = m.a.x;
  let h = m.b.x;
  let pi = posL[i];
  var rho = 1.0;
  var gi = vec2f(0.0);
  var somme = 0.0;
  for (var vc = 0u; vc < 9u; vc++) {
    let pl = plage(cles[i], vc);
    for (var k = pl.a; k < pl.b; k++) {
      let j = ordre[k];
      if (j == i) { continue; }
      let d = pi - posL[j];
      let r = length(d);
      let q = r / h;
      if (q >= 1.0) { continue; }
      rho += noyauW(q);
      let g = gradW(q, direction(i, j, d, r)) / rho0;
      gi += g;
      somme += dot(g, g);
    }
  }
  var C = rho / rho0 - 1.0;
  if (C < 0.0) { C = C * m.a.z; }
  lambdas[i] = -C / (somme + dot(gi, gi) + EPS_PBF);
}

// PBF, étape 2 : Δp_i = h / ρ0 · Σ (λ_i + λ_j + s) ∇W, s = −K (W(q) / W(0,2))⁴ ; posL -> posE, déplacement borné.
@compute @workgroup_size(64)
fn corriger(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GR.nCorps) { return; }
  let i = parcours[gid.x];
  let pi = posL[i];
  if (corps[i].membre == AUCUN || !dansGrille(i)) {
    posE[i] = pi;
    return;
  }
  let m = GR.m[corps[i].membre];
  let h = m.b.x;
  let li = lambdas[i];
  var dq = vec2f(0.0);
  for (var vc = 0u; vc < 9u; vc++) {
    let pl = plage(cles[i], vc);
    for (var k = pl.a; k < pl.b; k++) {
      let j = ordre[k];
      if (j == i) { continue; }
      let d = pi - posL[j];
      let r = length(d);
      let q = r / h;
      if (q >= 1.0) { continue; }
      let w = noyauW(q) / W_DQ;
      let s = -K_CORR * w * w * w * w;
      dq += (li + lambdas[j] + s) * gradW(q, direction(i, j, d, r));
    }
  }
  var dp = dq / m.a.x * h;
  let l = length(dp);
  if (l > PAS_MAX * h) { dp = dp * (PAS_MAX * h / l); }
  posE[i] = pi + dp;
}

// Vitesse corrigée d'un corps : prédiction + déplacement des contraintes / dt (positions finales dans posL).
fn vitesseCorrigee(j: u32) -> vec2f { return corps[j].vel + (posL[j] - corps[j].pos) / P.dt; }

// Vitesse finale du fluide : vitesse corrigée, puis viscosité XSPH v_i += c Σ (v_j − v_i) W / ρ0.
@compute @workgroup_size(64)
fn viscosite(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GR.nCorps) { return; }
  let i = parcours[gid.x];
  let vi = vitesseCorrigee(i);
  if (corps[i].membre == AUCUN || !dansGrille(i)) {
    vitesses[i] = vi;
    return;
  }
  let m = GR.m[corps[i].membre];
  let h = m.b.x;
  var dv = vec2f(0.0);
  for (var vc = 0u; vc < 9u; vc++) {
    let pl = plage(cles[i], vc);
    for (var k = pl.a; k < pl.b; k++) {
      let j = ordre[k];
      if (j == i) { continue; }
      let q = length(posL[i] - posL[j]) / h;
      if (q >= 1.0) { continue; }
      dv += (vitesseCorrigee(j) - vi) * noyauW(q);
    }
  }
  vitesses[i] = vi + m.a.y * dv / m.a.x;
}
`;

  // Grains (PBD).
  const WGSL_GRAINS = /* wgsl */ `
const RELAXATION = 1.5;     // surrelaxation de la moyenne des corrections (Jacobi)

// Position au début du pas : notée avant le pas des émetteurs (même particule), sinon déduite de la prédiction.
fn ancienne(i: u32) -> vec2f {
  let a = anciennes[i];
  if (a.w > 0.5 && a.z == f32(corps[i].n)) { return a.xy; }
  return corps[i].pos - corps[i].vel * P.dt;
}

// Contacts entre grains (posL -> posE) : chaque grain prend la moitié de la pénétration le long de la normale ; frottement
// sur le déplacement relatif tangentiel depuis le début du pas (annulé sous statique × pénétration, réduit à dynamique ×
// pénétration au-delà) ; cohésion : attraction jusqu'à (r_i + r_j)(1 + 0,25 cohésion) ; moyenne surrelaxée.
@compute @workgroup_size(64)
fn contacts(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GR.nCorps) { return; }
  let i = parcours[gid.x];
  let pi = posL[i];
  if (corps[i].membre == AUCUN || !dansGrille(i)) {
    posE[i] = pi;
    return;
  }
  let m = GR.m[corps[i].membre];
  let ri = corps[i].rayon;
  let dep = pi - ancienne(i);
  var dp = vec2f(0.0);
  var nb = 0.0;
  for (var vc = 0u; vc < 9u; vc++) {
    let pl = plage(cles[i], vc);
    for (var k = pl.a; k < pl.b; k++) {
      let j = ordre[k];
      if (j == i) { continue; }
      let pj = posL[j];
      let d = pi - pj;
      let r = length(d);
      let contact = ri + corps[j].rayon;
      if (r >= contact * (1.0 + 0.25 * m.a.z)) { continue; }
      let u = direction(i, j, d, r);
      let pen = contact - r;
      if (pen > 0.0) {
        var c = 0.5 * pen * u;
        let rel = dep - (pj - ancienne(j));
        let tg = rel - dot(rel, u) * u;
        let lt = length(tg);
        if (lt < m.a.x * pen) { c -= 0.5 * tg; } else if (lt > 1e-9) { c -= 0.5 * tg * min(m.a.y * pen / lt, 1.0); }
        dp += c;
      } else {
        dp += 0.5 * m.a.z * pen * u;
      }
      nb += 1.0;
    }
  }
  if (nb > 0.0) { posE[i] = pi + RELAXATION * dp / nb; } else { posE[i] = pi; }
}

// Vitesse finale des grains : prédiction + déplacement des contacts / dt, bornée par la vitesse prédite du grain (les
// contacts entre grains dissipent sans donner de vitesse : un amas né serré ne se disperse pas en éclatant, un grain qui
// tombe sur le tas n'y creuse pas de cratère) ; rebond entre grains (restitution) sur la vitesse normale d'approche prédite.
@compute @workgroup_size(64)
fn vitessesGrains(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GR.nCorps) { return; }
  let i = parcours[gid.x];
  let ci = corps[i];
  var v = ci.vel + (posL[i] - ci.pos) / P.dt;
  if (ci.membre == AUCUN || !dansGrille(i)) {
    vitesses[i] = v;
    return;
  }
  let e = GR.m[ci.membre].a.w;
  var dv = vec2f(0.0);
  var vlim = length(ci.vel);
  for (var vc = 0u; vc < 9u; vc++) {
    let pl = plage(cles[i], vc);
    for (var k = pl.a; k < pl.b; k++) {
      let j = ordre[k];
      if (j == i) { continue; }
      let d = posL[i] - posL[j];
      let r = length(d);
      if (r >= (ci.rayon + corps[j].rayon) * 1.01) { continue; }
      let u = direction(i, j, d, r);
      let vn = dot(ci.vel - corps[j].vel, u);
      if (vn < 0.0) { dv -= 0.5 * e * vn * u; }
    }
  }
  let lv = length(v);
  if (lv > vlim) { v = v * (vlim / lv); }
  vitesses[i] = v + dv;
}
`;

  // Rendu aux particules : déclarations et code communs aux deux modules.
  const WGSL_RENDRE_DECL = /* wgsl */ `
struct Limite { ok: bool, pos: vec2f, n: vec2f, f: f32 };
const SEUIL_REPOS = 4.0;   // cqh/s : un grain soutenu plus lent que cela est mis au repos
@group(0) @binding(15) var<uniform> GR: Groupe;
@group(0) @binding(16) var<uniform> MB: Membre;
@group(0) @binding(17) var<storage, read> corps: array<Corps>;
@group(0) @binding(18) var<storage, read> posF: array<vec2f>;
@group(0) @binding(19) var<storage, read> vitesses: array<vec2f>;
@group(0) @binding(20) var<storage, read> anciennes: array<vec4f>;
`;

  const WGSL_RENDRE = /* wgsl */ `
// Position au début du pas : notée avant le pas des émetteurs (même particule), sinon déduite de la prédiction.
fn ancienneR(i: u32) -> vec2f {
  let a = anciennes[i];
  if (a.w > 0.5 && a.z == f32(corps[i].n)) { return a.xy; }
  return corps[i].pos - corps[i].vel * P.dt;
}

// Résultat du voisinage rendu à la case s du membre : position et vitesse finales ; grain soutenu (la correction annule au
// moins la moitié du déplacement prédit) et presque immobile depuis le début du pas : laissé à sa place, vitesse nulle ;
// déplacement de correction arrêté aux obstacles ; fuite des obstacles (essaim).
fn rendreCorps(s: u32) {
  if (s >= MB.capacite) { return; }
  let i = MB.base + s;
  let c = corps[i];
  if (c.membre == AUCUN) { return; }
  var p = particules[s];
  var x = posF[i];
  var v = vitesses[i];
  if (GR.genre == 2u) {
    let a = ancienneR(i);
    let prevu = c.pos - a;
    if (dot(x - c.pos, prevu) < -0.5 * dot(prevu, prevu) && length(x - a) < SEUIL_REPOS * P.dt) {
      x = a;
      v = vec2f(0.0);
    }
  }
  let l = limiter(c.pos, x, c.rayon);
  x = l.pos;
  if (l.ok) {
    let vn = dot(v, l.n);
    if (vn < 0.0) { v = v - vn * l.n; }
    let vt = v - dot(v, l.n) * l.n;
    v = v - (1.0 - l.f) * vt;
  }
  if (GR.genre == 0u) { v = fuir(x, v, c.rayon, GR.m[c.membre]); }
  p.pos = x;
  p.vel = v;
  particules[s] = p;
}
`;

  // Sans collisions actives : ni arrêt aux obstacles ni fuite.
  const WGSL_RENDRE_SIMPLE = /* wgsl */ `
const AUCUN = 0xffffffffu;
@group(0) @binding(1) var<storage, read_write> particules: array<Particule>;
@group(0) @binding(4) var<uniform> P: Pas;

fn limiter(p0: vec2f, p1: vec2f, r: f32) -> Limite { return Limite(false, p1, vec2f(0.0), 1.0); }
fn fuir(x: vec2f, v: vec2f, r: f32, m: ParamsMembre) -> vec2f { return v; }

@compute @workgroup_size(64)
fn rendre(@builtin(global_invocation_id) gid: vec3u) { rendreCorps(gid.x); }
`;

  // Avec collisions actives : ajouté au module des collisions de P3 (ses liaisons 0, 1, 4, 11 à 14, ses fonctions).
  const WGSL_RENDRE_OBSTACLES = /* wgsl */ `
// Déplacement de correction de p0 (hors des obstacles après le pas des émetteurs) à p1 : arrêté au premier obstacle touché
// (repères à τ1 aux deux bouts : obstacles immobiles le temps de la correction), replacé hors de la surface.
fn limiter(p0: vec2f, p1: vec2f, r: f32) -> Limite {
  if (eu(140u) != 1u) { return Limite(false, p1, vec2f(0.0), 1.0); }
  let t = chercher(p0, p1, P.tau1, true, r);
  if (!t.ok) { return Limite(false, p1, vec2f(0.0), 1.0); }
  let B = cadresB[t.o];
  let n = normalize(tourner(B, t.n));
  let q = versMonde(B, t.l) + n * MARGE;
  // Reste du déplacement glissé le long de la surface (sans quoi un grain posé, poussé de biais vers le sol, ne bouge
  // plus et ses voisins s'enfoncent en lui), freiné par le frottement de l'émetteur (Coulomb : la part tangentielle perd
  // frottement × la part normale), arrêté au second obstacle touché ; f : part de la vitesse tangentielle gardée.
  let reste = (p1 - p0) * (1.0 - t.t);
  let rn = max(-dot(reste, n), 0.0);
  let rt = reste + rn * n;
  let lt = length(rt);
  var f = 1.0;
  if (lt > 1e-9) { f = max(0.0, 1.0 - 0.5 * (ef(145u) + ef(146u)) * rn / lt); }
  var x = q + rt * f;
  let t2 = chercher(q, x, P.tau1, true, r);
  if (t2.ok) {
    let B2 = cadresB[t2.o];
    x = versMonde(B2, t2.l) + normalize(tourner(B2, t2.n)) * MARGE;
  }
  return Limite(true, x, n, f);
}

// Fuite (essaim) : un obstacle vu devant, à moins du rayon de vision, détourne la vitesse le long de sa normale, d'autant
// plus qu'il est proche (fuite × vmax / vision × (1 − t) × dt) ; vitesse bornée de nouveau.
fn fuir(x: vec2f, v: vec2f, r: f32, m: ParamsMembre) -> vec2f {
  let l = length(v);
  if (eu(140u) != 1u || m.a.w <= 0.0 || l < 1e-6) { return v; }
  let t = chercher(x, x + v / l * m.b.x, P.tau1, true, r);
  if (!t.ok) { return v; }
  let n = normalize(tourner(cadresB[t.o], t.n));
  return borner(v + n * (m.a.w * m.b.w / m.b.x * (1.0 - t.t) * P.dt), m.b.z, m.b.w, v / l);
}

@compute @workgroup_size(64)
fn rendreC(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li < Mo.n) {
    let r = repere(li, P.tau1);
    cadresA[li] = r;
    cadresB[li] = r;
  }
  workgroupBarrier();
  rendreCorps(gid.x);
}
`;

  /** Code du module de rendu aux particules : sans collisions (« pm-rendre »), ou module des collisions de P3 augmenté. */
  function codeRendre(collisions) {
    const commun = P.WGSL_GROUPE + WGSL_RENDRE_DECL + WGSL_BORNER + WGSL_RENDRE;
    if (!collisions) return P.WGSL_COMMUN + WGSL_PAS + commun + WGSL_RENDRE_SIMPLE;
    return P.WGSL_MODULE_COLLISIONS() + commun + WGSL_RENDRE_OBSTACLES;
  }
  P.codeRendreInteractions = codeRendre;

  P.WGSL_VOISINAGE = P.WGSL_COMMUN + WGSL_PAS + P.WGSL_GROUPE + WGSL_LIAISONS + WGSL_GRILLE + WGSL_BORNER + WGSL_VOISINS + WGSL_ESSAIM + WGSL_FLUIDE + WGSL_GRAINS;

  // Liaisons de chaque noyau (disposition explicite : 8 tampons de stockage au plus chacune). Liaison 0 : décalage dynamique.
  const NOYAUX = {
    effacer: [1, 6],
    noter: [2, 3, 13],
    rassembler: [1, 2, 3, 4, 5, 6, 10],
    prefixe: [1, 6, 7],
    ranger: [1, 5, 6, 7, 8, 14],
    trier: [1, 7, 8],
    essaim: [0, 1, 4, 5, 7, 8, 10, 12, 14],
    densite: [1, 4, 5, 7, 8, 9, 11, 14],
    corriger: [1, 4, 5, 7, 8, 9, 10, 11, 14],
    viscosite: [0, 1, 4, 5, 7, 8, 9, 12, 14],
    contacts: [0, 1, 4, 5, 7, 8, 9, 10, 13, 14],
    vitessesGrains: [0, 1, 4, 5, 7, 8, 9, 12, 14],
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

  // Rendu aux particules : un pipeline par variante (sans collisions, avec collisions), créé au premier besoin.
  const parDeviceRendre = new WeakMap();
  function pipelinesRendre(device, collisions) {
    let p = parDeviceRendre.get(device);
    if (!p) { p = {}; parDeviceRendre.set(device, p); }
    const cle = collisions ? 'c' : 's';
    if (p[cle]) return p[cle];
    const C = GPUShaderStage.COMPUTE;
    const entrees = [
      { binding: 1, visibility: C, buffer: { type: 'storage' } },
      { binding: 4, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: collisions ? 80 : 48 } },
      { binding: 15, visibility: C, buffer: { type: 'uniform' } },
      { binding: 16, visibility: C, buffer: { type: 'uniform' } },
      { binding: 17, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 18, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 19, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 20, visibility: C, buffer: { type: 'read-only-storage' } },
    ];
    if (collisions) {
      entrees.push(
        { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 11, visibility: C, buffer: { type: 'uniform' } },
        { binding: 12, visibility: C, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
        { binding: 13, visibility: C, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 14, visibility: C, sampler: { type: 'filtering' } });
    }
    const layout = device.createBindGroupLayout({ entries: entrees });
    const module = device.createShaderModule({ label: collisions ? 'pm-rendre-collisions' : 'pm-rendre', code: codeRendre(collisions) });
    p[cle] = {
      layout,
      pipeline: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint: collisions ? 'rendreC' : 'rendre' } }),
    };
    return p[cle];
  }

  // Solveur de chaque type : dispatches entre le tri et le rendu aux particules (positions finales dans posA).
  const SOLVEURS = {
    essaim(g, passe, n, blocs) { g.lancer(passe, 'essaim', 'BA', null, blocs, n); },
    // Itérations en ping-pong (nombre pair : résultat dans posA), puis vitesses (lecture de posA).
    fluide(g, passe, n, blocs) {
      for (let k = 0; k < g.iterations; k++) {
        const v = k % 2 === 0 ? 'AB' : 'BA';
        g.lancer(passe, 'densite', v, null, blocs, n);
        g.lancer(passe, 'corriger', v, null, blocs, n);
      }
      g.lancer(passe, 'viscosite', 'AB', null, blocs, n);
    },
    // Itérations de contacts en ping-pong (2 × ITERATIONS_GRAINS, nombre pair : résultat dans posA), puis vitesses ; mise au repos au rendu.
    grains(g, passe, n, blocs) {
      for (let k = 0; k < g.iterations; k++) g.lancer(passe, 'contacts', k % 2 === 0 ? 'AB' : 'BA', null, blocs, n);
      g.lancer(passe, 'vitessesGrains', 'AB', null, blocs, n);
    },
  };

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
      this.comptes = tampon((this.grille.n + 1) * 4);
      this.debuts = tampon((this.grille.n + 1) * 4);
      this.ordre = tampon(n * 4);
      this.posA = tampon(n * 8);
      this.posB = tampon(n * 8);
      this.lambdas = tampon(n * 4);
      this.vitesses = tampon(n * 8);
      this.anciennes = tampon(n * 16);
      this.parcours = tampon(n * 4);
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
        case 13: return { buffer: this.anciennes };
        default: return { buffer: this.parcours };
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

    /** Pas n du lot : voisinage (corps, comptage, préfixe, rangement, tri), solveur du type, rendu aux particules. */
    executer(passe, n) {
      const cellules = Math.ceil(this.grille.n / 64);
      const cellules1 = Math.ceil((this.grille.n + 1) / 64);
      const blocs = Math.ceil(this.nCorps / 64);
      this.lancer(passe, 'effacer', 'AB', null, cellules1, n);
      for (const m of this.membres) this.lancer(passe, 'rassembler', 'BA', m, Math.ceil(m.capacite / 64), n);
      this.lancer(passe, 'prefixe', 'AB', null, 1, n);
      this.lancer(passe, 'ranger', 'AB', null, blocs, n);
      this.lancer(passe, 'trier', 'AB', null, cellules, n);
      SOLVEURS[this.def.type](this, passe, n, blocs);
      for (const m of this.membres) {
        const r = pipelinesRendre(this.device, m.e.collisions);
        passe.setPipeline(r.pipeline);
        passe.setBindGroup(0, this.liaisonRendre(m, r), [n * 256]);
        passe.dispatchWorkgroups(Math.max(1, Math.ceil(m.capacite / 64)));
      }
    }

    /** Liaisons du rendu aux particules d'un membre ; avec collisions, ressources du monde de la simulation (P3). */
    liaisonRendre(m, r) {
      const cle = 'rendre|' + m.rang;
      let g = this.liaisons.get(cle);
      if (!g) {
        const sim = this.sim;
        const entrees = [
          { binding: 1, resource: { buffer: m.e.particules } },
          { binding: 4, resource: { buffer: sim.tamponPas, size: m.e.collisions ? 80 : 48 } },
          { binding: 15, resource: { buffer: this.uniforme } },
          { binding: 16, resource: { buffer: m.uniforme } },
          { binding: 17, resource: { buffer: this.corps } },
          { binding: 18, resource: { buffer: this.posA } },
          { binding: 19, resource: { buffer: this.vitesses } },
          { binding: 20, resource: { buffer: this.anciennes } },
        ];
        if (m.e.collisions) {
          entrees.push(
            { binding: 0, resource: { buffer: m.e.params } },
            { binding: 11, resource: { buffer: sim.uniformeMonde } },
            { binding: 12, resource: sim.vueReperes },
            { binding: 13, resource: sim.monde.formes ? sim.monde.formes.vue : sim.pc.vueSdfVide },
            { binding: 14, resource: sim.pc.lisse });
        }
        g = this.device.createBindGroup({ layout: r.layout, entries: entrees });
        this.liaisons.set(cle, g);
      }
      return g;
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
      [this.uniforme, this.corps, this.cles, this.comptes, this.debuts, this.ordre, this.posA, this.posB, this.lambdas, this.vitesses, this.anciennes, this.parcours]
        .forEach((b) => b.destroy());
      this.membres.forEach((m) => m.uniforme.destroy());
      this.liaisons.clear();
    }
  }

  P.Groupe = Groupe;
})(typeof globalThis !== 'undefined' ? globalThis : this);
