/* Pulse Motion – cordes et tissus (P5b) : simulation XPBD sur le GPU, toutes les structures d'un effet ensemble.
 *
 * P.MOTS_STRUCTURE    mots de l'en-tête d'une structure dans son bloc de paramètres (après l'en-tête E de l'émetteur)
 * P.emballerStructure(em, effet, collisions, nZones, liens, photo) -> Uint32Array   bloc de paramètres d'une structure :
 *   mots [0, 256) : en-tête E de l'émetteur (P.emballerE : forces, collisions, graine) ; [256, 320) : en-tête de la
 *   structure ; attaches (8 mots chacune, à partir de 320) ; attache de chaque sommet (AUCUN : libre) ; codes des liens
 *   (M.maillage.liens, triés par couleur). photo : { centreA, demiA } (rectangle local de la photographie, source « ancre »)
 * P.complianceStructure(k)   compliance XPBD d'une raideur k (0 à 1)
 * P.codeStructures() -> WGSL du module « pm-structures » : module des collisions de P3, ef et eu lisant le bloc de la
 *   structure du groupe de travail (baseE), et noyau « structures »
 * new P.Structures(device, sim)   structures de sim.effet (émetteurs e.structure) ; un groupe de travail de 256 fils par
 *   structure, une seule passe par pas de 1/120 s (sim.tamponPas, décalage n × 256), toutes les structures dans un dispatch :
 *   .assurerElements(k, zones)   repères des éléments d'attache aux points de grille du pas k et au point 0, une fois chacun
 *     (zones.attaches(g) : 8 nombres par élément ; sans elle, élément 0 = zone d'émission, autres inactifs)
 *   .executer(passe, n)          pas n du lot (après les groupes d'interactions)
 *   .vider(enc), .sauver(enc, copie) -> copie, .restaurer(enc, copie)   état (sommets, liens rompus) ; instantanés
 *   .lireSommets(e) -> Promise<Float32Array>, .lireRompus(e) -> Promise<Uint32Array>   (tests, M.particules.lireEtat)
 *   .tailleEtat (octets), .sommets, .rompus, .infos, .poussees (GPUBuffer), .detruire()
 *   e.infoStructure = { s, base, n, colonnes, lignes, type, mots, liens } pour chaque émetteur de structure.
 * Pas d'une structure : au pas 0, sommets posés au repos (rectangle de l'élément 0 au point de grille 0 : ancre ou balise,
 * ou rectangle de sa photographie ; corde tenue aux deux bouts : entre ses deux points d'attache) ; puis 4 sous-pas de
 * 1/480 s : sommets tenus posés sur leur attache (vitesse de l'attache), autres prédits par les forces de la recette
 * (integrer de P1, exact sur le sous-pas) ; 4 itérations XPBD (λ remis à zéro à chaque sous-pas) qui résolvent chacune les
 * 12 couleurs de liens dans l'ordre, une passe parallèle par couleur (aucun sommet partagé dans une couleur) ; contacts
 * avec les obstacles de P3 (émetteur à collisions actives : repères aux deux bouts du sous-pas, chaque sommet libre balayé,
 * puis le centre de chaque cellule d'un tissu en 4 couleurs, ses sommets libres déplacés avec lui ; arrêt, replacement à
 * MARGE, glissement freiné par le frottement) ;
 * vitesse = déplacement / h, amortie ; déchirure : chaque sommet marque ses propres liens (bit du genre dans son mot de
 * « rompus ») étirés au-delà de dechirure × longueur de repos, d'après les positions de fin de sous-pas seulement (aucune
 * position ne bouge pendant la décision : même résultat dans tout ordre) ; un lien rompu n'est plus résolu, ses triangles
 * ne sont plus dessinés (rendu). Phases séparées par des barrières de stockage ; boucles à barrière de bornes constantes.
 * Navigateur seulement ; dépend de simulation.js (P.WGSL_MODULE_COLLISIONS, P.emballerE) et de maillage.js (M.maillage).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const STRUCTURES_MAX = 32;           // par effet (uniforme ST) ; recette.js : STRUCTURES_EFFET_MAX
  const ATTACHES = 320;                // premier mot des attaches dans un bloc
  const COMPLIANCE = 1e-4;             // compliance d'un lien de raideur 0,5 (cqh par unité de force)
  const AMORTISSEMENT = 10;            // taux d'amortissement (par seconde) d'un amortissement 1
  const AUCUN = 0xffffffff;
  const OCTETS_UNIFORME = 16 + STRUCTURES_MAX * 16;
  const S = {
    TYPE: 256, C: 257, R: 258, N: 259, NATT: 260, ATT: 261, SEL: 262, LIENS: 263, COUL: 264, ALPHA: 277, ALPHA_B: 278,
    AMORTI: 279, DECH: 280, EPAIS: 281, MASSE: 282, CL: 283, DL: 285, FIN: 287, Z: 288,
  };
  P.MOTS_STRUCTURE = S;
  P.STRUCTURES_MAX = STRUCTURES_MAX;

  /** Compliance XPBD d'une raideur k de 0 à 1 : nulle à 1 (lien rigide), (1 − k) / k × COMPLIANCE sinon. */
  function compliance(k) { return (1 - k) / Math.max(k, 1e-3) * COMPLIANCE; }
  P.complianceStructure = compliance;

  P.emballerStructure = function (em, effet, collisions, nZones, liens, photo) {
    const st = em.structure;
    const nAtt = st.attaches.length;
    const sel = ATTACHES + 8 * nAtt;
    const offLiens = sel + st.nSommets;
    const taille = Math.ceil((offLiens + liens.codes.length) / 4) * 4;
    const b = new ArrayBuffer(taille * 4);
    const u = new Uint32Array(b);
    const f = new Float32Array(b);
    u.set(new Uint32Array(P.emballerE(em, effet, collisions, nZones, null)), 0);
    u[S.TYPE] = st.code; u[S.C] = st.colonnes; u[S.R] = st.lignes; u[S.N] = st.nSommets;
    u[S.NATT] = nAtt; u[S.ATT] = ATTACHES; u[S.SEL] = sel; u[S.LIENS] = offLiens;
    u.set(liens.debuts, S.COUL);
    f[S.ALPHA] = compliance(st.raideur);
    f[S.ALPHA_B] = st.flexion > 0 ? compliance(st.flexion) : -1;
    f[S.AMORTI] = AMORTISSEMENT * st.amortissement;
    f[S.DECH] = st.dechirure === null ? -1 : st.dechirure;
    f[S.EPAIS] = st.epaisseur;
    f[S.MASSE] = em.masse[0];
    f[S.CL] = photo ? photo.centreA[0] : 0;
    f[S.CL + 1] = photo ? photo.centreA[1] : 0;
    f[S.DL] = photo ? photo.demiA[0] : -1;
    f[S.DL + 1] = photo ? photo.demiA[1] : -1;
    f[S.FIN] = em.vie[1];
    f[S.Z] = em.z[0];
    st.attaches.forEach((a, k) => {
      const o = ATTACHES + 8 * k;
      const point = a.cible.genre === 'point';
      u[o] = point ? 0 : 1;
      u[o + 1] = point ? 0 : a.cible.element;
      f[o + 2] = a.lacher === null ? -1 : a.lacher;
      if (point) { f[o + 3] = a.cible.point[0]; f[o + 4] = a.cible.point[1]; }
    });
    u.fill(AUCUN, sel, sel + st.nSommets);
    st.attaches.forEach((a, k) => a.sommets.forEach((v) => { if (u[sel + v] === AUCUN) u[sel + v] = k; }));
    u.set(liens.codes, offLiens);
    return u;
  };

  const WGSL_STRUCTURES = /* wgsl */ `
// ---- Structures (P5b) : cordes et tissus, XPBD (sous-pas, liens colorés) ----
const S_SOUS_PAS = 4u;
const S_ITERATIONS = 4u;
const S_COULEURS = 12u;
const S_FILS = 256u;
const S_TYPE = ${S.TYPE}u;
const S_C = ${S.C}u;
const S_R = ${S.R}u;
const S_N = ${S.N}u;
const S_NATT = ${S.NATT}u;
const S_ATT = ${S.ATT}u;
const S_SEL = ${S.SEL}u;
const S_LIENS = ${S.LIENS}u;
const S_COUL = ${S.COUL}u;
const S_ALPHA = ${S.ALPHA}u;
const S_ALPHA_B = ${S.ALPHA_B}u;
const S_AMORTI = ${S.AMORTI}u;
const S_DECH = ${S.DECH}u;
const S_EPAIS = ${S.EPAIS}u;
const S_MASSE = ${S.MASSE}u;
const S_CL = ${S.CL}u;
const S_DL = ${S.DL}u;
const S_FIN = ${S.FIN}u;
const S_Z = ${S.Z}u;

struct UStructures { n: u32, nElements: u32, nGrille: u32, r0: u32, s: array<vec4u, ${STRUCTURES_MAX}> };
struct Repos { centre: vec2f, angle: f32, demi: vec2f, Lu: f32, Lv: f32 };
struct CibleS { ok: bool, pos: vec2f };

@group(0) @binding(15) var<storage, read_write> sommets: array<Particule>;
@group(0) @binding(16) var<storage, read_write> anciennes: array<vec2f>;
@group(0) @binding(17) var<storage, read_write> lambdas: array<f32>;
@group(0) @binding(18) var<storage, read_write> rompus: array<u32>;
@group(0) @binding(19) var<storage, read> elements: array<vec4f>;
@group(0) @binding(20) var<storage, read> poussees: array<vec2f>;
@group(0) @binding(21) var<uniform> ST: UStructures;
@group(0) @binding(22) var<storage, read_write> infos: array<vec4f>;

// Bloc de paramètres de la structure du groupe de travail : ef et eu y lisent.
var<private> baseE: u32;

// Fin d'une phase : écritures des sommets et des liens visibles de tout le groupe de travail.
fn barriere() {
  storageBarrier();
  workgroupBarrier();
}

// Repère de l'élément d'attache k au point de grille g (disposition « Repere » des obstacles, 2 vec4).
fn repereElGrille(k: u32, g: u32) -> RepereF {
  let i = (min(g, ST.nGrille - 1u) * ST.nElements + k) * 2u;
  let a = elements[i];
  let b = elements[i + 1u];
  return RepereF(a.xy, a.z, a.w, b.xy, b.zw);
}

// Repère d'un élément à τ : grille de 30 points par seconde, position et échelle linéaires, angle par le plus court
// chemin ; inactif si l'un des deux points l'est (comme les obstacles de P3).
fn repereEl(k: u32, tau: f32) -> RepereF {
  let x = max(tau, 0.0) * 30.0;
  let i = min(u32(floor(x)), ST.nGrille - 1u);
  let j = min(i + 1u, ST.nGrille - 1u);
  let f = clamp(x - f32(i), 0.0, 1.0);
  let A = repereElGrille(k, i);
  let B = repereElGrille(k, j);
  if (A.actif < 0.5 || (B.actif < 0.5 && f > 0.0)) { return RepereF(A.centre, A.angle, 0.0, A.demi, A.echelle); }
  var d = B.angle - A.angle;
  d = d - 6.2831853 * round(d / 6.2831853);
  return RepereF(mix(A.centre, B.centre, f), A.angle + d * f, 1.0, mix(A.demi, B.demi, f), mix(A.echelle, B.echelle, f));
}

// Rectangle de repos : élément 0 (ancre, ou balise de l'effet) au point de grille 0 ; rectangle local de la photographie
// (source « ancre », mots CL et DL) ou boîte de l'élément ; longueurs de repos entre deux colonnes et deux lignes.
fn reposStructure() -> Repos {
  let R0 = repereElGrille(0u, 0u);
  var cl = vec2f(ef(S_CL), ef(S_CL + 1u));
  var dl = vec2f(ef(S_DL), ef(S_DL + 1u));
  if (dl.x < 0.0) {
    cl = vec2f(0.0);
    dl = R0.demi / max(R0.echelle, vec2f(1e-6));
  }
  let demi = dl * R0.echelle;
  let C = f32(eu(S_C));
  let R = f32(eu(S_R));
  return Repos(versMondeF(R0, cl), R0.angle, demi, 2.0 * demi.x / max(C - 1.0, 1.0), 2.0 * demi.y / max(R - 1.0, 1.0));
}

// Coordonnée de repos d'un sommet dans [0, 1]² (corde : ligne médiane).
fn uDe(v: u32) -> vec2f {
  let C = eu(S_C);
  let R = eu(S_R);
  var u = vec2f(f32(v % C) / f32(max(C, 2u) - 1u), 0.5);
  if (R > 1u) { u.y = f32(v / C) / f32(R - 1u); }
  return u;
}

fn pointRepos(rp: Repos, u: vec2f) -> vec2f { return rp.centre + tournerF(rp.angle, (2.0 * u - 1.0) * rp.demi); }

// Zone d'émission à l'instant t du pas (zones de P1 au début et à la fin du pas).
fn zoneS(t: f32) -> vec4f { return mix(P.zoneA, P.zoneB, clamp((t - P.tau0) / max(P.dt, 1e-6), 0.0, 1.0)); }

// Attache d'un sommet (première attache qui le cite), ou AUCUN.
fn attacheDe(v: u32) -> u32 { return eu(eu(S_SEL) + v); }

// Point tenu par l'attache a pour le sommet de coordonnée u à l'instant t : point de la zone, ou point du rectangle de
// l'élément visé (élément 0 : rectangle de repos) à cet instant ; libre après le lâcher ou si l'élément est inactif.
fn cibleAttache(a: u32, u: vec2f, t: f32) -> CibleS {
  let b = eu(S_ATT) + a * 8u;
  let lacher = ef(b + 2u);
  if (lacher >= 0.0 && t >= lacher) { return CibleS(false, vec2f(0.0)); }
  if (eu(b) == 0u) {
    let z = zoneS(t);
    return CibleS(true, z.xy + z.zw * vec2f(ef(b + 3u), ef(b + 4u)));
  }
  let k = eu(b + 1u);
  let R = repereEl(k, t);
  if (R.actif < 0.5) { return CibleS(false, vec2f(0.0)); }
  var cl = vec2f(0.0);
  var demi = R.demi;
  if (k == 0u && ef(S_DL) >= 0.0) {
    cl = vec2f(ef(S_CL), ef(S_CL + 1u)) * R.echelle;
    demi = vec2f(ef(S_DL), ef(S_DL + 1u)) * R.echelle;
  }
  return CibleS(true, R.centre + tournerF(R.angle, cl + (2.0 * u - 1.0) * demi));
}

// Extrémités du lien (v, genre) : H, V, D1, D2, BH, BV (maillage.js).
fn extremites(v: u32, genre: u32) -> vec2u {
  let C = eu(S_C);
  switch genre {
    case 0u: { return vec2u(v, v + 1u); }
    case 1u: { return vec2u(v, v + C); }
    case 2u: { return vec2u(v, v + C + 1u); }
    case 3u: { return vec2u(v + 1u, v + C); }
    case 4u: { return vec2u(v, v + 2u); }
    default: { return vec2u(v, v + 2u * C); }
  }
}

fn existeLien(genre: u32, v: u32) -> bool {
  let C = eu(S_C);
  let R = eu(S_R);
  let c = v % C;
  let r = v / C;
  switch genre {
    case 0u: { return c + 1u < C; }
    case 1u: { return r + 1u < R; }
    case 2u, 3u: { return c + 1u < C && r + 1u < R; }
    case 4u: { return c + 2u < C; }
    default: { return r + 2u < R; }
  }
}

fn longueurRepos(genre: u32, rp: Repos) -> f32 {
  switch genre {
    case 0u: { return rp.Lu; }
    case 1u: { return rp.Lv; }
    case 2u, 3u: { return sqrt(rp.Lu * rp.Lu + rp.Lv * rp.Lv); }
    case 4u: { return 2.0 * rp.Lu; }
    default: { return 2.0 * rp.Lv; }
  }
}

// Inverse de la masse : nul pour un sommet tenu pendant ce sous-pas.
fn invMasse(p: Particule) -> f32 {
  if (p.gen == 1u) { return 0.0; }
  return 1.0 / p.masse;
}

// Pas 0 : sommet posé au repos ; corde tenue aux deux bouts : entre ses deux points d'attache (elle pend : longueur de
// repos inchangée) ; tenue à un bout : ligne médiane décalée sur ce point.
fn initialiserSommet(v: u32, base: u32, rp: Repos) {
  let u = uDe(v);
  var x = pointRepos(rp, u);
  if (eu(S_R) == 1u) {
    let n = eu(S_N);
    let a0 = attacheDe(0u);
    let a1 = attacheDe(n - 1u);
    var c0 = CibleS(false, vec2f(0.0));
    var c1 = CibleS(false, vec2f(0.0));
    if (a0 != AUCUN) { c0 = cibleAttache(a0, uDe(0u), 0.0); }
    if (a1 != AUCUN) { c1 = cibleAttache(a1, uDe(n - 1u), 0.0); }
    if (c0.ok && c1.ok) {
      x = mix(c0.pos, c1.pos, u.x);
    } else if (c0.ok) {
      x = c0.pos + x - pointRepos(rp, uDe(0u));
    } else if (c1.ok) {
      x = c1.pos + x - pointRepos(rp, uDe(n - 1u));
    }
  }
  var p: Particule;
  p.pos = x;
  p.vel = vec2f(0.0);
  p.z = ef(S_Z);
  p.age = 0.0;
  p.vie = ef(S_FIN);
  p.taille = ef(S_EPAIS);
  p.masse = ef(S_MASSE);
  p.rot = 0.0;
  p.vrot = 0.0;
  p.alea = alea(eu(5u), eu(6u), v, 11u);
  p.n = v;
  p.gen = 0u;
  p.vivante = 1u;
  p.naissance = 0.0;
  sommets[base + v] = p;
  rompus[base + v] = 0u;
}

// Début d'un sous-pas [ta, tb] : position notée ; sommet tenu posé sur son attache à tb (vitesse de l'attache, masse
// infinie : gen = 1) ; autre sommet prédit par les forces de la recette (exact sur le sous-pas) ; au premier sous-pas, la
// poussée des particules liées (P5a) s'ajoute à sa vitesse.
fn predire(v: u32, base: u32, sp: u32, ta: f32, tb: f32, h: f32) {
  let i = base + v;
  var p = sommets[i];
  anciennes[i] = p.pos;
  if (sp == 0u) { p.vel = p.vel + poussees[i]; }
  p.gen = 0u;
  let a = attacheDe(v);
  if (a != AUCUN) {
    let c = cibleAttache(a, uDe(v), tb);
    if (c.ok) {
      p.vel = (c.pos - p.pos) / h;
      p.pos = c.pos;
      p.gen = 1u;
    }
  }
  if (p.gen == 0u) { p = integrer(p, h, ta, zoneS(ta)); }
  p.age = p.age + h;
  sommets[i] = p;
}

// XPBD, contrainte de distance du lien j (rang dans la liste rangée par couleur) : Δλ = (−C − α̃ λ) / (wa + wb + α̃),
// α̃ = α / h² ; lien rompu ou de flexion sans raideur : ignoré.
fn resoudreLien(j: u32, base: u32, lb: u32, h: f32, rp: Repos) {
  let code = eu(eu(S_LIENS) + j);
  let v = code >> 3u;
  let genre = code & 7u;
  if (((rompus[base + v] >> genre) & 1u) != 0u) { return; }
  var alpha = ef(S_ALPHA);
  if (genre >= 4u) { alpha = ef(S_ALPHA_B); }
  if (alpha < 0.0) { return; }
  let ab = extremites(v, genre);
  let ia = base + ab.x;
  let ib = base + ab.y;
  let pa = sommets[ia];
  let pb = sommets[ib];
  let wa = invMasse(pa);
  let wb = invMasse(pb);
  let at = alpha / (h * h);
  let den = wa + wb + at;
  if (den <= 0.0) { return; }
  let d = pa.pos - pb.pos;
  let L = length(d);
  if (L < 1e-9) { return; }
  let dl = (-(L - longueurRepos(genre, rp)) - at * lambdas[lb + j]) / den;
  lambdas[lb + j] = lambdas[lb + j] + dl;
  let nrm = d / L;
  sommets[ia].pos = pa.pos + wa * dl * nrm;
  sommets[ib].pos = pb.pos - wb * dl * nrm;
}

struct ContactS { ok: bool, pos: vec2f };

// Point balayé de p0 (début du sous-pas, obstacles à ta : cadresA) à p1 (fin, à tb : cadresB) : arrêté au premier obstacle
// ciblé touché, replacé à MARGE de sa surface ; reste du déplacement glissé le long de la surface, freiné par le
// frottement de la recette (Coulomb : la part tangentielle perd frottement × la part normale), arrêté au second obstacle.
fn contactPoint(p0: vec2f, p1: vec2f, r: f32, tb: f32) -> ContactS {
  let t = chercher(p0, p1, 0.0, true, r);
  if (!t.ok) { return ContactS(false, p1); }
  let B = cadresB[t.o];
  let nrm = normalize(tourner(B, t.n));
  let q = versMonde(B, t.l) + nrm * MARGE;
  let reste = (p1 - p0) * (1.0 - t.t);
  let rn = max(-dot(reste, nrm), 0.0);
  let rt = reste + rn * nrm;
  let lt = length(rt);
  var f = 1.0;
  if (lt > 1e-9) { f = max(0.0, 1.0 - 0.5 * (ef(145u) + ef(146u)) * rn / lt); }
  var x = q + rt * f;
  let t2 = chercher(q, x, tb, false, r);
  if (t2.ok) {
    let B2 = cadresB[t2.o];
    x = versMonde(B2, t2.l) + normalize(tourner(B2, t2.n)) * MARGE;
  }
  return ContactS(true, x);
}

// Sommet libre balayé de sa position du début du sous-pas à sa position corrigée (rayon : épaisseur / 2).
fn contactSommet(i: u32, tb: f32) {
  let p = sommets[i];
  if (p.gen == 1u) { return; }
  let c = contactPoint(anciennes[i], p.pos, 0.5 * p.taille, tb);
  if (c.ok) { sommets[i].pos = c.pos; }
}

// Cellule (r, c) d'un tissu : son centre (moyenne de ses 4 sommets) balayé ; au contact, ses sommets libres sont déplacés
// du déplacement de son centre. Cellule dont un lien est rompu (H, V, diagonales du sommet v ; V de v + 1 ; H de v + C) :
// ignorée.
fn contactCellule(base: u32, r: u32, c: u32, tb: f32) {
  let C = eu(S_C);
  let v = r * C + c;
  if ((rompus[base + v] & 15u) != 0u || (rompus[base + v + 1u] & 2u) != 0u || (rompus[base + v + C] & 1u) != 0u) { return; }
  var ids = array<u32, 4>(base + v, base + v + 1u, base + v + C, base + v + C + 1u);
  var c0 = vec2f(0.0);
  var c1 = vec2f(0.0);
  var libres = 0u;
  var rayon = 0.0;
  for (var k = 0u; k < 4u; k++) {
    let p = sommets[ids[k]];
    c0 += 0.25 * anciennes[ids[k]];
    c1 += 0.25 * p.pos;
    rayon = max(rayon, 0.5 * p.taille);
    if (p.gen == 0u) { libres += 1u; }
  }
  if (libres == 0u) { return; }
  let ct = contactPoint(c0, c1, rayon, tb);
  if (!ct.ok) { return; }
  let dx = ct.pos - c1;
  for (var k = 0u; k < 4u; k++) {
    if (sommets[ids[k]].gen == 0u) { sommets[ids[k]].pos = sommets[ids[k]].pos + dx; }
  }
}

// Contacts du sous-pas [ta, tb] avec les obstacles de P3 (émetteur à collisions actives) : repères aux deux bouts, une
// fois par groupe de travail ; sommets ; puis cellules d'un tissu en 4 couleurs (r mod 2, c mod 2), aucune cellule d'une
// couleur ne partageant de sommet. Barrières entre les phases (bornes constantes).
fn contactsStructure(base: u32, n: u32, li: u32, ta: f32, tb: f32) {
  if (li < Mo.n) {
    cadresA[li] = repere(li, ta);
    cadresB[li] = repere(li, tb);
  }
  barriere();
  let actif = eu(140u) == 1u;
  if (actif) {
    for (var v = li; v < n; v += S_FILS) { contactSommet(base + v, tb); }
  }
  barriere();
  let C = eu(S_C);
  let R = eu(S_R);
  for (var k = 0u; k < 4u; k++) {
    let pr = k / 2u;
    let pc = k % 2u;
    var nr = 0u;
    var nc = 0u;
    if (R > pr + 1u) { nr = (R - pr) / 2u; }
    if (C > pc + 1u) { nc = (C - pc) / 2u; }
    if (actif) {
      for (var j = li; j < nr * nc; j += S_FILS) { contactCellule(base, pr + 2u * (j / nc), pc + 2u * (j % nc), tb); }
    }
    barriere();
  }
}

// Fin du sous-pas : vitesse = déplacement / h, amortie (sommet tenu : vitesse de son attache).
fn vitesseSommet(v: u32, base: u32, h: f32) {
  let i = base + v;
  var p = sommets[i];
  if (p.gen == 0u) { p.vel = (p.pos - anciennes[i]) / h * exp(-ef(S_AMORTI) * h); }
  sommets[i] = p;
}

// Déchirure en fin de sous-pas : le sommet v décide de ses propres liens (sommet propriétaire), sur les positions de fin
// de sous-pas ; un lien marqué le reste (état de la simulation, instantanés compris).
fn dechirer(v: u32, base: u32, rp: Repos) {
  let seuil = ef(S_DECH);
  if (seuil <= 0.0) { return; }
  let i = base + v;
  var m = rompus[i];
  for (var g = 0u; g < 6u; g++) {
    if (((m >> g) & 1u) != 0u || !existeLien(g, v)) { continue; }
    let ab = extremites(v, g);
    if (length(sommets[base + ab.x].pos - sommets[base + ab.y].pos) > seuil * longueurRepos(g, rp)) { m = m | (1u << g); }
  }
  rompus[i] = m;
}

// Un pas de 1/120 s d'une structure (groupe de travail wg.x) : pose au pas 0, puis 4 sous-pas (prédiction, 4 itérations
// sur les 12 couleurs, contacts, vitesses, déchirure).
@compute @workgroup_size(256)
fn structures(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let d = ST.s[wg.x];
  baseE = d.x;
  let base = d.y;
  let lb = d.z;
  let n = d.w;
  let rp = reposStructure();
  if (li == 0u) { infos[wg.x] = vec4f(rp.Lu, rp.Lv, 0.0, 0.0); }
  let h = P.dt / f32(S_SOUS_PAS);
  if (P.k == 0u) {
    for (var v = li; v < n; v += S_FILS) { initialiserSommet(v, base, rp); }
  }
  barriere();
  for (var sp = 0u; sp < S_SOUS_PAS; sp++) {
    let ta = P.tau0 + f32(sp) * h;
    let tb = ta + h;
    for (var v = li; v < n; v += S_FILS) { predire(v, base, sp, ta, tb, h); }
    for (var j = li; j < eu(S_COUL + S_COULEURS); j += S_FILS) { lambdas[lb + j] = 0.0; }
    barriere();
    for (var it = 0u; it < S_ITERATIONS; it++) {
      for (var k = 0u; k < S_COULEURS; k++) {
        for (var j = eu(S_COUL + k) + li; j < eu(S_COUL + k + 1u); j += S_FILS) { resoudreLien(j, base, lb, h, rp); }
        barriere();
      }
    }
    contactsStructure(base, n, li, ta, tb);
    for (var v = li; v < n; v += S_FILS) { vitesseSommet(v, base, h); }
    barriere();
    for (var v = li; v < n; v += S_FILS) { dechirer(v, base, rp); }
    barriere();
  }
}
`;

  const EF = 'fn ef(i: u32) -> f32 { return E[i]; }';
  const EU = 'fn eu(i: u32) -> u32 { return bitcast<u32>(E[i]); }';
  let code = null;

  /** Module « pm-structures » : module des collisions de P3 (ef et eu lisent le bloc de la structure) et noyau. */
  P.codeStructures = function () {
    if (code) return code;
    const base = P.WGSL_MODULE_COLLISIONS();
    if (base.indexOf(EF) < 0 || base.indexOf(EU) < 0) throw new Error('Structures : lecture des paramètres (ef, eu) introuvable dans le module des collisions.');
    code = base.replace(EF, 'fn ef(i: u32) -> f32 { return E[baseE + i]; }').replace(EU, 'fn eu(i: u32) -> u32 { return bitcast<u32>(E[baseE + i]); }') + WGSL_STRUCTURES;
    return code;
  };

  // Pipeline du noyau « structures », un par device ; disposition explicite (8 tampons de stockage).
  const parDevice = new WeakMap();
  function pipeline(device) {
    let p = parDevice.get(device);
    if (p) return p;
    const C = GPUShaderStage.COMPUTE;
    const stockage = (b, lecture) => ({ binding: b, visibility: C, buffer: { type: lecture ? 'read-only-storage' : 'storage' } });
    const layout = device.createBindGroupLayout({
      entries: [
        stockage(0, true),
        { binding: 4, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } },
        { binding: 11, visibility: C, buffer: { type: 'uniform' } },
        { binding: 12, visibility: C, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
        { binding: 13, visibility: C, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 14, visibility: C, sampler: { type: 'filtering' } },
        stockage(15), stockage(16), stockage(17), stockage(18), stockage(19, true), stockage(20, true),
        { binding: 21, visibility: C, buffer: { type: 'uniform' } },
        stockage(22),
      ],
    });
    const module = device.createShaderModule({ label: 'pm-structures', code: P.codeStructures() });
    p = { layout, pipeline: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint: 'structures' } }) };
    parDevice.set(device, p);
    return p;
  }

  class Structures {
    constructor(device, sim) {
      const U = GPUBufferUsage;
      this.device = device;
      this.sim = sim;
      this.liste = sim.emetteurs.filter((e) => e.structure);
      if (this.liste.length > STRUCTURES_MAX) throw new Error('Structures : ' + this.liste.length + ' cordes et tissus dans un effet, au-delà de ' + STRUCTURES_MAX + '.');
      this.nElements = 1 + (sim.effet.elements || []).length;
      this.nGrille = sim.nZones;
      let mots = 0;
      let sommets = 0;
      let liens = 0;
      const blocs = this.liste.map((e, s) => {
        const st = e.em.structure;
        const l = M.maillage.liens(st.colonnes, st.lignes);
        const bloc = P.emballerStructure(e.em, sim.effet, e.collisions, sim.nZones, l, e.photoStructure);
        e.infoStructure = { s, base: sommets, n: st.nSommets, colonnes: st.colonnes, lignes: st.lignes, type: st.type, mots, liens };
        mots += bloc.length;
        // Base des sommets multiple de 4 : liaison d'une structure dans un groupe d'interactions alignée sur 256 octets.
        sommets += Math.ceil(st.nSommets / 4) * 4;
        liens += l.codes.length;
        return bloc;
      });
      this.nSommets = Math.max(4, sommets);
      const tout = new Uint32Array(Math.max(4, mots));
      let o = 0;
      blocs.forEach((b) => { tout.set(b, o); o += b.length; });
      const tampon = (octets, usage) => device.createBuffer({ size: Math.max(16, octets), usage });
      this.params = tampon(tout.byteLength, U.STORAGE | U.COPY_DST);
      device.queue.writeBuffer(this.params, 0, tout);
      this.sommets = tampon(this.nSommets * P.OCTETS_PARTICULE, U.STORAGE | U.COPY_SRC | U.COPY_DST);
      this.anciennes = tampon(this.nSommets * 8, U.STORAGE);
      this.lambdas = tampon(Math.max(1, liens) * 4, U.STORAGE);
      this.rompus = tampon(this.nSommets * 4, U.STORAGE | U.COPY_SRC | U.COPY_DST);
      this.elements = tampon(this.nGrille * this.nElements * 32, U.STORAGE | U.COPY_DST);
      this.elementsConnus = new Uint8Array(this.nGrille);
      this.poussees = tampon(this.nSommets * 8, U.STORAGE);
      this.infos = tampon(this.liste.length * 16, U.STORAGE | U.COPY_SRC);
      this.uniforme = tampon(OCTETS_UNIFORME, U.UNIFORM | U.COPY_DST);
      const u = new Uint32Array(OCTETS_UNIFORME / 4);
      u[0] = this.liste.length;
      u[1] = this.nElements;
      u[2] = this.nGrille;
      this.liste.forEach((e) => {
        const i = e.infoStructure;
        u.set([i.mots, i.base, i.liens, i.n], 4 + i.s * 4);
      });
      device.queue.writeBuffer(this.uniforme, 0, u);
      this.tailleEtat = this.nSommets * (P.OCTETS_PARTICULE + 4);
      this.perles = [];

      // Monde des obstacles : celui de la simulation, ou un monde vide (aucun obstacle, n = 0).
      const T = GPUTextureUsage;
      if (!sim.uniformeMonde) {
        this.mondeVide = tampon(M.obstacles ? M.obstacles.OCTETS_MONDE : 816, U.UNIFORM);
        this.texVide = device.createTexture({ size: [1, 1, 1], format: 'rgba32float', usage: T.TEXTURE_BINDING });
        this.sdfVide = device.createTexture({ size: [1, 1, 1], format: 'rgba16float', usage: T.TEXTURE_BINDING });
        this.lisse = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      }
      const sdf = sim.uniformeMonde
        ? (sim.monde && sim.monde.formes ? sim.monde.formes.vue : sim.pc.vueSdfVide)
        : this.sdfVide.createView({ dimension: '2d-array' });
      this.p = pipeline(device);
      this.groupe = device.createBindGroup({
        layout: this.p.layout,
        entries: [
          { binding: 0, resource: { buffer: this.params } },
          { binding: 4, resource: { buffer: sim.tamponPas, size: 80 } },
          { binding: 11, resource: { buffer: sim.uniformeMonde || this.mondeVide } },
          { binding: 12, resource: sim.uniformeMonde ? sim.vueReperes : this.texVide.createView({ dimension: '2d-array' }) },
          { binding: 13, resource: sdf },
          { binding: 14, resource: sim.uniformeMonde ? sim.pc.lisse : this.lisse },
          { binding: 15, resource: { buffer: this.sommets } },
          { binding: 16, resource: { buffer: this.anciennes } },
          { binding: 17, resource: { buffer: this.lambdas } },
          { binding: 18, resource: { buffer: this.rompus } },
          { binding: 19, resource: { buffer: this.elements } },
          { binding: 20, resource: { buffer: this.poussees } },
          { binding: 21, resource: { buffer: this.uniforme } },
          { binding: 22, resource: { buffer: this.infos } },
        ],
      });
    }

    /** Repères des éléments d'attache au point de grille 0 (repos) et autour du pas k, envoyés une fois chacun. */
    assurerElements(k, zones) {
      const K = this.nElements;
      const ecrire = (g) => {
        if (g < 0 || g >= this.nGrille || this.elementsConnus[g]) return;
        const r = zones.attaches ? zones.attaches(g) : this.depuisZone(zones.grille(g));
        this.device.queue.writeBuffer(this.elements, g * K * 32, r, 0, K * 8);
        this.elementsConnus[g] = 1;
      };
      ecrire(0);
      const g1 = Math.floor((k + 1) * P.PAS * P.GRILLE) + 2;
      for (let g = Math.floor(k * P.PAS * P.GRILLE) - 1; g <= g1; g++) ecrire(g);
    }

    /** Sans zones.attaches : élément 0 = zone d'émission [x, y, largeur, hauteur] (boîte sans rotation), autres inactifs. */
    depuisZone(z) {
      const r = new Float32Array(this.nElements * 8);
      r.set([z[0] + z[2] / 2, z[1] + z[3] / 2, 0, 1, z[2] / 2, z[3] / 2, 1, 1]);
      return r;
    }

    /** Pas n du lot : toutes les structures, un groupe de travail chacune. */
    executer(passe, n) {
      passe.setPipeline(this.p.pipeline);
      passe.setBindGroup(0, this.groupe, [n * 256]);
      passe.dispatchWorkgroups(this.liste.length);
    }

    vider(enc) {
      enc.clearBuffer(this.sommets);
      enc.clearBuffer(this.rompus);
    }

    /** Copie de l'état (sommets, liens rompus) dans un instantané ; créé à la première sauvegarde. */
    sauver(enc, copie) {
      const U = GPUBufferUsage;
      const c = copie || {
        sommets: this.device.createBuffer({ size: this.sommets.size, usage: U.COPY_SRC | U.COPY_DST }),
        rompus: this.device.createBuffer({ size: this.rompus.size, usage: U.COPY_SRC | U.COPY_DST }),
      };
      enc.copyBufferToBuffer(this.sommets, 0, c.sommets, 0, this.sommets.size);
      enc.copyBufferToBuffer(this.rompus, 0, c.rompus, 0, this.rompus.size);
      return c;
    }

    restaurer(enc, c) {
      enc.copyBufferToBuffer(c.sommets, 0, this.sommets, 0, this.sommets.size);
      enc.copyBufferToBuffer(c.rompus, 0, this.rompus, 0, this.rompus.size);
    }

    detruireCopie(c) {
      c.sommets.destroy();
      c.rompus.destroy();
    }

    async lireSommets(e) {
      const f = await this.sim.lireTampon(this.sommets);
      const i = e.infoStructure;
      return f.slice(i.base * 16, (i.base + i.n) * 16);
    }

    async lireRompus(e) {
      const f = await this.sim.lireTampon(this.rompus);
      const i = e.infoStructure;
      return new Uint32Array(f.buffer).slice(i.base, i.base + i.n);
    }

    detruire() {
      [this.params, this.sommets, this.anciennes, this.lambdas, this.rompus, this.elements, this.poussees, this.infos, this.uniforme, this.mondeVide]
        .forEach((b) => b && b.destroy());
      [this.texVide, this.sdfVide].forEach((t) => t && t.destroy());
    }
  }

  P.Structures = Structures;
})(typeof globalThis !== 'undefined' ? globalThis : this);
