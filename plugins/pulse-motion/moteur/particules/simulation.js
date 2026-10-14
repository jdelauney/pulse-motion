/* Pulse Motion – simulation des particules sur le GPU (WebGPU).
 *
 * new P.Simulation(device, effet, monde?, fragments?)   effet : recette compilée ; monde : obstacles de l'effet (collisions),
 *   facultatif ; fragments : données des émetteurs de fragments (P4), un élément par émetteur (null hors fragments) :
 *   { a, b (listes de pixels, 4 nombres par particule), eclats (36 nombres par éclat), image (ImageBitmap, éclats),
 *     demiA, demiB, centreA, centreB (boîtes opaques des photographies), coteA, coteB } (fragments.js, calques.js)
 *   monde = { entrees: [{ type, categorie, forme, profil }], largeurCqh, actif, formes?: { vue } }   (obstacles.js)
 *   .tau                  dernier τ demandé (rendu des fragments)
 *   .avancer(tau, zones) -> deltas  amène chaque émetteur à τ ; δ = τ − k/120 pour les simulés, 0 pour la voie rapide
 *   .emetteurs[i].inerte  enfant « a_la_collision » d'un parent sans collisions actives : ni simulé ni dessiné
 *   .lireEtat(i)          -> Promise<Float32Array> (16 nombres par case, disposition « Particule »)
 *   .lireHistorique(i)    -> Promise<Float32Array> (2 nombres par entrée de traînée)
 *   .lireContacts(i)      -> Promise<Float32Array> (8 nombres par case, disposition « Contact » ; vide sans collisions)
 *   .detruire()
 *   .lireHauteurs()       -> Promise<Float32Array> (profils d'empilement, 256 hauteurs par profil, cqh)
 *   .contributionVideo()  -> GPUBuffer (MAX_VIDEO × 256 entiers : sommes propres du dernier pas, par obstacle de la vidéo)
 * P.additionnerProfils(device, cible, source)   cible += source (tampons d'entiers de même taille)
 * Modules de force (P6) : em.modulesWGSL.force (M.codeShader.attacherModules) ; l'appel est inséré dans integrer (pas et
 * pasCollisions), le module et le prélude des shaders ajoutés au noyau ; pipelines mis en cache par empreinte (même mise en
 * page) ; e.pipelinePas : pipeline du pas d'un émetteur simulé. P.verifierForce(device, force) -> erreurs situées dans le
 * fichier du module ; P.avecForce(code, force) -> code du noyau avec le module.
 * monde.tans (tan du talus par profil), monde.bases (GPUBuffer nProfils × 256 entiers, contributions de la vidéo ;
 * la simulation le détruit avec elle) ; .hauteursBase (GPUBuffer nProfils × 256 f32, cqh) : ces bases relaxées au talus,
 * sans les particules de l'effet (couche héritée dessinée par le rendu), null sans bases. Empilement : sommes entières atomiques (seule opération atomique), puis relaxation.
 * zones.a(τ) et zones.grille(g) -> [x, y, largeur, hauteur] en cqh (zone d'émission à τ, au point g / 30 de la grille) ;
 * zones.reperes(g) -> Float32Array (8 nombres par obstacle de monde.entrees, disposition « Repere » de obstacles.js)
 * au point g de la grille ; demandé seulement quand un émetteur a des collisions actives.
 * zones.ancres(g) -> Float32Array(16) : repères de l'ancre et de l'élément visé au point g (émetteurs de fragments),
 * écrits une fois chacun dans la queue du tampon E de ces émetteurs.
 * Fragments (P4) : naissance sur un pixel de l'ancre ou au centre d'un éclat, tenue à sa place (au moins un pas : l'état
 * du pas 1 est l'élément intact), libération étalée ; éclats en corps rigides ; arrivée sur une cible, guidée (forces puis
 * rattrapage critique, pose exacte) ou chorégraphiée (voie rapide) ; mort au pas de l'arrivée.
 *
 * Pas fixe de 1/120 s de τ, intégrateur exponentiel (exact pour gravité et traînée linéaire), naissances calculées,
 * instantanés pour revenir en arrière. Collisions (monde actif et recette avec « collisions ») : test balayé du
 * déplacement de chaque pas contre les obstacles, dans leur repère local aux deux bouts du pas ; rebond, pose (la
 * particule suit son obstacle), mort au contact ; impacts notés pour « a_la_collision ». Événements d'un parent :
 * morts dans les cases [0, capacité), impacts dans [capacité, 2 × capacité).
 * P.WGSL_BRUIT : bruit de valeurs et rotationnel (prélude des shaders, P6).
 * Hachage PCG d'après M. O'Neill (pcg-random.org, domaine public).
 * Navigateur seulement (Chrome, Edge) ; dépend de instantanes.js (M.instantanes) et, avec un monde, de obstacles.js.
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const PAS = 1 / 120;
  const GRILLE = 30;
  const E_TAILLE = 256;     // en-tête de E ; fragments : repères, listes et éclats à la suite
  const TABLES = 512;
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

  // Bruit de valeurs 3D et rotationnel : noyaux des particules, et prélude des shaders (P6, particules/shaders.js).
  P.WGSL_BRUIT = /* wgsl */ `
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
`;

  // Fragments (P4), commun à la simulation et au rendu (demande E, ef, eu et alea). En-tête de E : mots 154 à 191, courbe
  // du trajet 192 à 255 ; à la suite : repères des éléments (16 nombres par point de grille), listes de pixels, éclats.
  P.WGSL_FRAGMENTS = /* wgsl */ `
const F_PIXELS = 1u;
const F_CIBLE = 2u;
const F_ECLATS = 4u;
const PAS_TAU = 0.0083333333;

struct RepereF { centre: vec2f, angle: f32, actif: f32, demi: vec2f, echelle: vec2f };
struct PixelF { pos: vec2f, couleur: vec4f, drapeaux: u32 };
struct Trajet { depart: f32, arrivee: f32 };

// Vrai si l'émetteur a l'un des genres de fragments demandés.
fn aFragment(genres: u32) -> bool { return (eu(154u) & genres) != 0u; }

fn repereGrilleF(g: u32, quel: u32) -> RepereF {
  let b = eu(176u) + min(g, eu(175u) - 1u) * 16u + quel * 8u;
  return RepereF(vec2f(ef(b), ef(b + 1u)), ef(b + 2u), ef(b + 3u), vec2f(ef(b + 4u), ef(b + 5u)), vec2f(ef(b + 6u), ef(b + 7u)));
}

// Repère d'un élément à τ (quel : 0 l'ancre, 1 l'élément visé) : grille de 30 points par seconde, position et échelle
// linéaires, angle par le plus court chemin (comme les obstacles, P3).
fn repereElement(quel: u32, tau: f32) -> RepereF {
  let x = max(tau, 0.0) * 30.0;
  let i = u32(floor(x));
  let f = x - f32(i);
  let a = repereGrilleF(i, quel);
  let b = repereGrilleF(i + 1u, quel);
  var d = b.angle - a.angle;
  d = d - 6.2831853 * round(d / 6.2831853);
  return RepereF(mix(a.centre, b.centre, f), a.angle + d * f, a.actif, mix(a.demi, b.demi, f), mix(a.echelle, b.echelle, f));
}

fn tournerF(angle: f32, v: vec2f) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

// Point local d'un élément (cqh sans échelle, relatif au centre de sa boîte) dans la scène.
fn versMondeF(r: RepereF, l: vec2f) -> vec2f { return r.centre + tournerF(r.angle, l * r.echelle); }

// Pixel i d'une liste (quel : 0 naissance, 1 cible) : position locale, couleur sRGB non prémultipliée dans [0, 1],
// drapeaux (1 : particule en trop qui entre en fondu, 2 : qui sort en fondu). Entiers exacts en f32 (fragments.js).
fn pixelF(i: u32, quel: u32) -> PixelF {
  let b = eu(177u + quel) + i * 4u;
  let rv = ef(b + 2u);
  let w = ef(b + 3u);
  let r = floor(rv / 256.0);
  let drapeaux = floor(w / 65536.0);
  let ba = w - drapeaux * 65536.0;
  let bl = floor(ba / 256.0);
  return PixelF(vec2f(ef(b), ef(b + 1u)), vec4f(r, rv - r * 256.0, bl, ba - bl * 256.0) / 255.0, u32(drapeaux));
}

// Rang dans l'ordre demandé, dans [0, 1] : 0 hasard, 1 de gauche à droite, 2 du centre vers les bords. l : point local
// relatif au centre de la boîte opaque de la photographie (demi : sa demi-taille).
fn fractionOrdre(code: u32, l: vec2f, demi: vec2f, n: u32, canal: u32) -> f32 {
  if (code == 1u) { return clamp(l.x / max(2.0 * demi.x, 1e-6) + 0.5, 0.0, 1.0); }
  if (code == 2u) { return clamp(length(l / max(demi, vec2f(1e-6))) * 0.70710678, 0.0, 1.0); }
  return alea(eu(5u), eu(6u), n, canal);
}

// Instant de libération d'un fragment tenu à sa place (pixel ou éclat) : au plus tôt la fin du pas 0 (E[183], le τ1 du
// pas 0 en f32), puis étalée sur « liberation » selon l'ordre (pixels).
fn liberation(n: u32) -> f32 {
  if (!aFragment(F_PIXELS | F_ECLATS)) { return 0.0; }
  var l = ef(183u);
  if (aFragment(F_PIXELS) && ef(162u) > 0.0) {
    l = l + ef(162u) * fractionOrdre(eu(163u), pixelF(n, 0u).pos - vec2f(ef(184u), ef(185u)), vec2f(ef(164u), ef(165u)), n, 21u);
  }
  return l;
}

// Fenêtre du trajet vers la cible : départ échelonné selon l'ordre (rang du pixel visé), arrivée au plus tard à celle de
// l'effet.
fn trajet(n: u32) -> Trajet {
  let D = ef(158u);
  let e = ef(159u);
  let depart = fractionOrdre(eu(160u), pixelF(n, 1u).pos - vec2f(ef(186u), ef(187u)), vec2f(ef(166u), ef(167u)), n, 20u) * e * D;
  return Trajet(depart, depart + (1.0 - e) * D);
}

// Avancement du trajet à τ, dans [0, 1].
fn progression(n: u32, tau: f32) -> f32 {
  let t = trajet(n);
  return clamp((tau - t.depart) / max(t.arrivee - t.depart, 1e-4), 0.0, 1.0);
}

// Courbe du trajet chorégraphié (64 valeurs, mots 192 à 255).
fn courbeTrajet(s: f32) -> f32 {
  let x = clamp(s, 0.0, 1.0) * 63.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 63u);
  return mix(ef(192u + i), ef(192u + j), x - f32(i));
}

// Cible d'une particule à τ : son pixel de la liste « cible », dans le repère de l'élément visé.
fn cibleF(n: u32, tau: f32) -> vec2f { return versMondeF(repereElement(1u, tau), pixelF(n, 1u).pos); }
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

${P.WGSL_BRUIT}
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

// Vitesse de départ : cône autour de la direction (radiale : depuis le centre), repère de la surface pour l'enfant d'un
// impact, part de la vitesse du parent.
fn vitesseDepart(n: u32, origine: vec2f, centre: vec2f, ne: Naissance) -> vec2f {
  let g = eu(5u);
  let e = eu(6u);
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
  return vec2f(cos(angle), sin(angle)) * mix(ef(24u), ef(25u), alea(g, e, n, 4u)) + ef(30u) * ne.vel;
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
  if (aFragment(F_PIXELS | F_ECLATS)) {
    // Fragment : né sur son pixel ou au centre de son éclat, tenu à sa place (vitesse de départ à sa libération).
    naitreFragment(&p, ne);
    return p;
  }
  let decalage = vec2f(ef(38u), ef(39u));
  var centre = zone.xy + 0.5 * zone.zw + decalage;
  var taille = zone.zw;
  if (eu(7u) > 0u) { centre = ne.pos + decalage; taille = vec2f(0.0); }
  let origine = forme(centre, taille, g, e, n);
  p.pos = origine;
  p.vel = vitesseDepart(n, origine, centre, ne);
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
  // [module-force]
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

  // Fragments (P4), simulation seulement : naissance, tenue, libération, pilotage, mort.
  const WGSL_FRAGMENTS_SIM = /* wgsl */ `
// Point local tenu d'un fragment : son pixel de l'ancre, ou le centre de son éclat.
fn pointTenu(n: u32) -> vec2f {
  if (aFragment(F_ECLATS)) {
    let b = eu(179u) + n * 36u;
    return vec2f(ef(b), ef(b + 1u));
  }
  return pixelF(n, 0u).pos;
}

// Vitesse d'un point local de l'ancre (différence sur 1/120 s de τ).
fn vitesseElement(l: vec2f, t: f32) -> vec2f {
  return (versMondeF(repereElement(0u, t + PAS_TAU), l) - versMondeF(repereElement(0u, t), l)) / PAS_TAU;
}

// Vitesse d'un fragment à sa libération : vitesse de départ de la recette (radiale : depuis le centre de l'ancre) et
// vitesse de l'ancre.
// Éclat : + impulsion radiale depuis le point d'impact, plus forte près de lui (1 − 0,6 d / diagonale), tirée dans
// [0,8 ; 1,2].
fn vitesseLiberation(n: u32, t: f32) -> vec2f {
  let r = repereElement(0u, t);
  let l = pointTenu(n);
  var v = vitesseDepart(n, versMondeF(r, l), r.centre, naissanceVide()) + vitesseElement(l, t);
  if (aFragment(F_ECLATS)) {
    let demi = vec2f(ef(164u), ef(165u));
    let d = l - vec2f(ef(184u), ef(185u)) - (vec2f(ef(172u), ef(173u)) - 0.5) * 2.0 * demi;
    let ld = length(d);
    var dir = vec2f(0.0, -1.0);
    if (ld > 1e-6) { dir = d / ld; }
    let force = ef(170u) * (1.0 - 0.6 * clamp(ld / max(length(2.0 * demi), 1e-6), 0.0, 1.0)) * (0.8 + 0.4 * alea(eu(5u), eu(6u), n, 23u));
    v = v + tournerF(r.angle, dir) * force;
  }
  return v;
}

// Vitesse de rotation d'un fragment libéré : celle de la recette (pixels), ou tirée dans ±rotation_max (éclats).
fn vrotLiberation(n: u32) -> f32 {
  if (aFragment(F_ECLATS)) { return (alea(eu(5u), eu(6u), n, 24u) * 2.0 - 1.0) * ef(171u); }
  return mix(ef(22u), ef(23u), alea(eu(5u), eu(6u), n, 10u));
}

// Naissance d'un fragment, tenu à sa place : position, angle et taille dans le repère de l'ancre (rotation, échelle) ;
// sans rotation propre tant qu'il est tenu (le rendu extrapole l'angle : l'image du pas 1 doit être l'élément intact).
fn naitreFragment(p: ptr<function, Particule>, ne: Naissance) {
  let n = (*p).n;
  let r = repereElement(0u, ne.t);
  let l = pointTenu(n);
  (*p).pos = versMondeF(r, l);
  (*p).vel = vitesseElement(l, ne.t);
  (*p).rot = r.angle;
  (*p).vrot = 0.0;
  if (aFragment(F_ECLATS)) {
    // Éclat : disque englobant (collisions).
    (*p).taille = 2.0 * ef(eu(179u) + n * 36u + 3u) * max(r.echelle.x, r.echelle.y);
  } else {
    (*p).taille = ef(168u) * max(r.echelle.x, r.echelle.y);
  }
}

// Fragment tenu à sa place à τ (voie rapide).
fn tenir(q: Particule, t: f32) -> Particule {
  var p = q;
  let l = pointTenu(q.n);
  let r = repereElement(0u, t);
  p.pos = versMondeF(r, l);
  p.vel = vitesseElement(l, t);
  p.rot = r.angle;
  p.age = 0.0;
  return p;
}

// Mouvement de t0 à t1 : forces de la recette (integrer), sauf pour un fragment tenu à sa place avant sa libération (il
// suit l'ancre sans vieillir). Renvoie 0 libre, 1 tenu, 2 posé sur sa cible, 3 rattrapage ; 1 et 2 sans collisions.
fn piloter(p: ptr<function, Particule>, t0: f32, t1: f32, zone: vec4f) -> u32 {
  let n = (*p).n;
  var debut = t0;
  if (aFragment(F_PIXELS | F_ECLATS)) {
    let lib = liberation(n);
    if (t1 <= lib) {
      let l = pointTenu(n);
      let a = versMondeF(repereElement(0u, t0), l);
      let b = versMondeF(repereElement(0u, t1), l);
      (*p).pos = b;
      (*p).vel = (b - a) / max(t1 - t0, 1e-6);
      (*p).rot = repereElement(0u, t1).angle;
      return 1u;
    }
    if (t0 <= lib) {
      // Libération pendant le pas : départ de sa place à l'instant lib (comme la voie rapide).
      (*p).pos = versMondeF(repereElement(0u, lib), pointTenu(n));
      (*p).vel = vitesseLiberation(n, lib);
      (*p).vrot = vrotLiberation(n);
      debut = lib;
    }
  }
  if (aFragment(F_CIBLE)) {
    let tr = trajet(n);
    if (t1 >= tr.arrivee) {
      // Arrivée propre : posée exactement sur sa cible, qu'elle suit ensuite.
      let a = cibleF(n, t0);
      let b = cibleF(n, t1);
      (*p).pos = b;
      (*p).vel = (b - a) / max(t1 - t0, 1e-6);
      (*p).rot = repereElement(1u, t1).angle;
      (*p).vrot = 0.0;
      return 2u;
    }
    if (eu(156u) == 0u && debut >= tr.depart + ef(161u) * (tr.arrivee - tr.depart)) {
      // Rattrapage critique : position de la cible et vitesse nulle visées au temps restant T (Hermite cubique,
      // accélération recalculée à chaque pas) ; les forces de la recette ne comptent plus.
      let T = max(tr.arrivee - debut, 1e-4);
      let dt = t1 - debut;
      let c = cibleF(n, t1);
      let acc = (6.0 * (c - (*p).pos) - 4.0 * (*p).vel * T) / (T * T);
      (*p).pos = (*p).pos + (*p).vel * dt + 0.5 * acc * dt * dt;
      (*p).vel = (*p).vel + acc * dt;
      var d = repereElement(1u, t1).angle - (*p).rot;
      d = d - 6.2831853 * round(d / 6.2831853);
      (*p).rot = (*p).rot + d * clamp(dt / T, 0.0, 1.0);
      return 3u;
    }
  }
  *p = integrer(*p, t1 - debut, debut, zone);
  return 0u;
}

// Mort par l'âge ; une particule qui vise une cible s'éteint au pas de l'arrivée de l'effet (l'élément réel la remplace).
fn meurt(p: Particule) -> bool {
  if (aFragment(F_CIBLE)) { return P.k + 1u >= eu(157u); }
  return p.age >= p.vie;
}

// Trajet chorégraphié : Bézier quadratique du départ q.pos à la cible (point de contrôle : milieu + perpendiculaire
// tirée), bruit qui s'éteint au départ et à l'arrivée ; s : avancement après la courbe du trajet.
fn positionChoree(q: Particule, tau: f32, s: f32) -> vec2f {
  let c = cibleF(q.n, tau);
  let d = c - q.pos;
  let ctrl = q.pos + 0.5 * d + vec2f(-d.y, d.x) * (alea(eu(5u), eu(6u), q.n, 22u) - 0.5) * 0.6;
  let u = 1.0 - s;
  var x = u * u * q.pos + 2.0 * u * s * ctrl + s * s * c;
  if (ef(181u) > 0.0) {
    let b = vec3f(x / max(ef(180u), 1e-3), tau * ef(182u));
    x = x + vec2f(bruit(b), bruit(b + vec3f(17.3, 5.1, 0.0))) * ef(181u) * sin(3.14159265 * s);
  }
  return x;
}

// Particule chorégraphiée à τ (voie rapide, sans état) : posée sur sa cible dès son arrivée propre.
fn choree(q: Particule, tau: f32) -> Particule {
  var p = q;
  let s = courbeTrajet(progression(q.n, tau));
  p.pos = positionChoree(q, tau, s);
  let s2 = courbeTrajet(progression(q.n, tau + PAS_TAU));
  p.vel = (positionChoree(q, tau + PAS_TAU, s2) - p.pos) / PAS_TAU;
  p.age = tau - q.naissance;
  var d = repereElement(1u, tau).angle - q.rot;
  d = d - 6.2831853 * round(d / 6.2831853);
  p.rot = q.rot + d * s;
  p.vrot = 0.0;
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
    // Un fragment tenu à sa place ne vieillit pas.
    if (piloter(&p, P.tau0, P.tau1, P.zoneA) != 1u) { p.age += P.dt; }
    if (meurt(p)) { p = mourir(p, s); }
  }
  let ne = naissanceDuPas(s);
  if (ne.ok) {
    let z = mix(P.zoneA, P.zoneB, clamp((ne.t - P.tau0) / P.dt, 0.0, 1.0));
    p = initialiser(ne, z);
    for (var i = 0u; i < N; i++) { historique[s * N + i] = p.pos; }
    let reste = P.tau1 - ne.t;
    if (piloter(&p, ne.t, P.tau1, z) != 1u) { p.age = reste; }
    if (meurt(p)) { p = mourir(p, s); }
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

// Voie rapide : état à τ exact, en forme close, sans pas ni instantanés. Fragment : tenu à sa place jusqu'à sa
// libération, balistique ensuite.
@compute @workgroup_size(64)
fn evaluer(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  if (s >= eu(0u)) { return; }
  var p: Particule;
  p.vivante = 0u;
  let ne = occupant(s, V.tau);
  if (ne.ok) {
    var q = initialiser(ne, zoneGrille(ne.t));
    var t0 = ne.t;
    if (aFragment(F_PIXELS | F_ECLATS)) {
      let lib = liberation(q.n);
      if (V.tau < lib) {
        particules[s] = tenir(q, V.tau);
        return;
      }
      let rl = repereElement(0u, lib);
      q.pos = versMondeF(rl, pointTenu(q.n));
      q.vel = vitesseLiberation(q.n, lib);
      q.vrot = vrotLiberation(q.n);
      q.rot = rl.angle;
      t0 = lib;
    }
    if (aFragment(F_CIBLE)) {
      // Arrivée chorégraphiée : position fonction directe de τ, éteinte au pas de l'arrivée (V.a : pas courant).
      if (V.a < eu(157u)) { p = choree(q, V.tau); }
      particules[s] = p;
      return;
    }
    let age = V.tau - t0;
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
// Un point de grille inactif (obstacle absent : scène voisine cachée, élément masqué) rend le repère inactif : jamais
// d'interpolation vers le repère vide (les particules posées seraient projetées vers l'origine) ; elles sont libérées.
fn repere(o: u32, tau: f32) -> Repere {
  let x = max(tau, 0.0) * 30.0;
  let i = min(u32(floor(x)), Mo.nGrille - 1u);
  let j = min(i + 1u, Mo.nGrille - 1u);
  let f = clamp(x - f32(i), 0.0, 1.0);
  let A = repereGrille(o, i);
  let B = repereGrille(o, j);
  if (A.actif < 0.5 || (B.actif < 0.5 && f > 0.0)) { return Repere(A.centre, A.angle, 0.0, A.demi, A.echelle); }
  return melange(A, B, f);
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

// Distance (cqh à l'échelle) au contour d'une forme exacte : champ de distance dans la boîte. Dehors, minorant qui reste
// une vraie distance à la forme : max(distance à la boîte b, champ au point q le plus proche de la boîte − b) (inégalité
// triangulaire) ; la seule distance à la boîte posait les particules sur la boîte, pas sur la forme.
fn distanceForme(o: u32, R: Repere, l: vec2f) -> f32 {
  let dehors = abs(l) - R.demi;
  let uv = clamp(l / sur(R.demi) * 0.5 + 0.5, vec2f(0.5 / 256.0), vec2f(1.0 - 0.5 / 256.0));
  let champ = textureSampleLevel(sdf, lisse, uv, i32(Mo.o[o].z), 0.0).r * min(R.echelle.x, R.echelle.y);
  if (dehors.x > 0.0 || dehors.y > 0.0) {
    let b = length(max(dehors, vec2f(0.0)));
    return max(b, champ - b);
  }
  return champ;
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
    if (A.actif < 0.5 || cadresB[o].actif < 0.5) { continue; }
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

// Case du profil sous le point local x (à l'échelle) : 256 cases sur la largeur de l'obstacle.
fn celluleDe(R: Repere, x: f32) -> u32 {
  return u32(clamp(floor((x / sur(R.demi).x * 0.5 + 0.5) * 256.0), 0.0, 255.0));
}

// Dessus de l'obstacle en x local (y local à l'échelle ; vers le haut négatif), avant gonflement du rayon.
fn dessusLocal(o: u32, R: Repere, x: f32) -> f32 {
  switch Mo.o[o].x {
    case 1u: { return -R.demi.y; }
    case 2u: { let u = x / sur(R.demi).x; return -R.demi.y * sqrt(max(1.0 - u * u, 0.0)); }
    case 4u: { return textureLoad(sdf, vec2i(i32(celluleDe(R, x)), 0), i32(Mo.o[o].z), 0).g * R.echelle.y; }
    default: { return 0.0; }
  }
}

fn hauteurCouche(o: u32, cel: u32) -> f32 { return hauteurs[Mo.o[o].w * 256u + cel]; }

// Couche possible : l'émetteur empile, l'obstacle porte un profil et regarde vers le haut (à 60° près).
fn empilable(o: u32, R: Repere) -> bool {
  return eu(149u) == 1u && Mo.o[o].w != AUCUN && cos(R.angle) > 0.5;
}

// Particule libre entrée dans la couche d'un obstacle sans toucher sa surface : contact au haut de la couche.
fn dansCouche(p: Particule, r: f32) -> Touche {
  for (var o = 0u; o < Mo.n; o++) {
    if ((Mo.o[o].y & eu(141u)) == 0u) { continue; }
    let B = cadresB[o];
    if (B.actif < 0.5 || !empilable(o, B)) { continue; }
    let l = versLocal(B, p.pos);
    if (abs(l.x) > B.demi.x) { continue; }
    let h = hauteurCouche(o, celluleDe(B, l.x));
    if (h <= 0.0) { continue; }
    let haut = dessusLocal(o, B, l.x) - r;
    if (haut > 1000.0) { continue; }
    let descend = dot(tourner(B, vec2f(0.0, 1.0)), p.vel) > 0.0;
    if (descend && l.y > haut - h && l.y <= haut + MARGE) {
      return Touche(true, 1.0, o, vec2f(l.x, haut - h), vec2f(0.0, -1.0));
    }
  }
  return Touche(false, 2.0, 0u, vec2f(0.0), vec2f(0.0));
}

// Déplacement libre de p0 (à ta) à (*p).pos (à τ1) : premier contact et réponse.
fn collisionner(p: ptr<function, Particule>, c: ptr<function, Contact>, p0: vec2f, ta: f32, entier: bool, s: u32) {
  let tb = P.tau1;
  let rayon = 0.5 * (*p).taille;
  var t = chercher(p0, (*p).pos, ta, entier, rayon);
  var couche = false;
  if (!t.ok && eu(142u) == 1u && eu(149u) == 1u) {
    t = dansCouche(*p, rayon);
    couche = t.ok;
  }
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
    // Pose : sur la surface augmentée de la hauteur de sa case (profil du pas précédent), ou au haut de la couche.
    var lPose = t.l;
    var cel = AUCUN;
    if (empilable(t.o, B)) {
      cel = celluleDe(B, t.l.x);
      if (!couche) { lPose.y = lPose.y - hauteurCouche(t.o, cel); }
    }
    let mPose = lPose / sur(Rc.echelle);
    (*c).obstacle = t.o;
    (*c).local = mPose;
    (*c).pose = tc;
    (*c).opacite = 1.0;
    (*c).cellule = cel;
    (*p).pos = materiel(B, mPose);
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
  if (aFragment(F_ECLATS)) {
    // Éclat (disque englobant, moment d'inertie ½ m r²) : l'impulsion au point de contact −n r le fait aussi tourner.
    let dv = vNouv - v;
    (*p).vrot = (*p).vrot - 2.0 * (n.x * dv.y - n.y * dv.x) / max(rayon, 1e-4);
  }
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
    var tenue = false;
    if (c.obstacle != AUCUN) {
      suivre(&p, &c, s);
    } else {
      let p0 = p.pos;
      let mode = piloter(&p, P.tau0, P.tau1, P.zoneA);
      tenue = mode == 1u;
      // Fragment tenu ou posé sur sa cible : pas de collision.
      if (mode == 0u || mode == 3u) { collisionner(&p, &c, p0, P.tau0, true, s); }
    }
    if (p.vivante == 1u) {
      if (!tenue) { p.age += P.dt; }
      if (meurt(p)) { noterMort(p, s, p.naissance + p.vie); p.vivante = 0u; }
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
    let mode = piloter(&p, ne.t, P.tau1, z);
    if (mode == 0u || mode == 3u) { collisionner(&p, &c, p0, ne.t, false, s); }
    if (p.vivante == 1u) {
      if (mode != 1u) { p.age = reste; }
      if (meurt(p)) { noterMort(p, s, p.naissance + p.vie); p.vivante = 0u; }
    }
  }
  if (N > 0u && p.vivante == 1u && (P.k + 1u) % 2u == 0u) {
    historique[s * N + ((P.k + 1u) / 2u) % N] = p.pos;
  }
  // Empilement : l'épaisseur de chaque particule posée s'ajoute à sa case (entiers : même somme dans tout ordre).
  if (p.vivante == 1u && c.obstacle != AUCUN && c.cellule != AUCUN && Mo.o[c.obstacle].w != AUCUN) {
    var ep = p.taille;
    if (ef(150u) >= 0.0) { ep = tirage(p, 15u, 150u); }
    atomicAdd(&profils[Mo.o[c.obstacle].w * 256u + c.cellule], u32(round(ep * 1024.0)));
  }
  particules[s] = p;
  contacts[s] = c;
}
`;

  const WGSL_RELAXER = /* wgsl */ `
struct Pas { k: u32, tau0: f32, tau1: f32, dt: f32, zoneA: vec4f, zoneB: vec4f, largeurs: array<vec4f, 2> };
struct Monde { n: u32, nGrille: u32, largeur: f32, nProfils: u32, tans: array<vec4f, 2>, o: array<vec4u, 48> };
@group(0) @binding(0) var<storage, read_write> profils: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> hauteurs: array<f32>;
@group(0) @binding(2) var<storage, read> bases: array<u32>;
@group(0) @binding(3) var<storage, read_write> brut: array<u32>;
@group(0) @binding(4) var<uniform> P: Pas;
@group(0) @binding(5) var<uniform> Mo: Monde;

// Ramène l'écart entre les cases i et i + 1 à la pente : la moitié de l'excès passe de la plus haute à la plus basse.
fn egaliser(h: ptr<function, array<f32, 256>>, i: u32, pente: f32) -> bool {
  let d = (*h)[i] - (*h)[i + 1u];
  if (abs(d) <= pente + 1e-4) { return false; }
  let m = 0.5 * (abs(d) - pente) * sign(d);
  (*h)[i] = (*h)[i] - m;
  (*h)[i + 1u] = (*h)[i + 1u] + m;
  return true;
}

// Un profil par invocation : sommes du pas (lues et remises à zéro) + base de la vidéo, relaxées au talus.
@compute @workgroup_size(1)
fn relaxer(@builtin(workgroup_id) g: vec3u) {
  let k = g.x;
  if (k >= Mo.nProfils) { return; }
  let b = k * 256u;
  var h: array<f32, 256>;
  for (var i = 0u; i < 256u; i++) {
    let u = atomicExchange(&profils[b + i], 0u);
    brut[b + i] = u;
    h[i] = f32(u + bases[b + i]) / 1024.0;
  }
  let pente = Mo.tans[k / 4u][k % 4u] * P.largeurs[k / 4u][k % 4u];
  for (var it = 0u; it < 128u; it++) {
    var change = false;
    for (var i = 0u; i < 255u; i++) { change = egaliser(&h, i, pente) || change; }
    for (var j = 255u; j > 0u; j--) { change = egaliser(&h, j - 1u, pente) || change; }
    if (!change) { break; }
  }
  for (var i = 0u; i < 256u; i++) { hauteurs[b + i] = h[i]; }
}
`;

  const WGSL_ADDITION = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> cible: array<u32>;
@group(0) @binding(1) var<storage, read> source: array<u32>;
@compute @workgroup_size(64)
fn additionner(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= arrayLength(&cible)) { return; }
  cible[g.x] = cible[g.x] + source[g.x];
}
`;

  const WGSL_SIMULATION = P.WGSL_COMMUN + WGSL_STRUCTS + WGSL_DECL_P1 + WGSL_FONCTIONS + P.WGSL_FRAGMENTS + WGSL_FRAGMENTS_SIM + WGSL_ENTREES_P1;
  const WGSL_MODULE_COLLISIONS = P.WGSL_COMMUN + WGSL_STRUCTS + WGSL_DECL_C + WGSL_FONCTIONS + P.WGSL_FRAGMENTS + WGSL_FRAGMENTS_SIM + WGSL_COLLISIONS;
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

  /** Mots du tampon E d'un émetteur : en-tête, puis (fragments) repères des éléments, listes et éclats. */
  function tailleE(nZones, frag) {
    if (!frag) return E_TAILLE;
    return E_TAILLE + nZones * 16 + (frag.a ? frag.a.length : 0) + (frag.b ? frag.b.length : 0) + (frag.eclats ? frag.eclats.length : 0);
  }

  /** Paramètres d'un émetteur (disposition « E » : en-tête de 256 mots ; fragments : queue, voir tailleE). collisions :
   *  collisions actives pour cet émetteur ; frag : données de fragments (repères des éléments écrits ensuite, assurerAncres). */
  function emballer(em, effet, collisions, nZones, frag) {
    const tampon = new ArrayBuffer(tailleE(nZones, frag) * 4);
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
    if (frag) {
      u[154] = (em.pixels ? 1 : 0) | (em.cible ? 2 : 0) | (em.eclats ? 4 : 0);
      if (em.cible) {
        // Fenêtre des trajets : jusqu'au pas kA − 1, pour que l'image d'avant l'arrivée montre toutes les particules posées.
        u[156] = em.cible.arriveeCode; u[157] = em.cible.k; f[158] = (em.cible.k - 1) * PAS; f[159] = em.cible.echelonnement;
        u[160] = em.cible.ordreCode; f[161] = em.cible.guidage;
        f.set(em.cible.bruit, 180);
        f.set(em.cible.progression, 192);
      }
      if (em.pixels) { f[162] = em.pixels.liberation; u[163] = em.pixels.ordreCode; }
      f[164] = frag.demiA[0]; f[165] = frag.demiA[1]; f[166] = frag.demiB[0]; f[167] = frag.demiB[1];
      f[168] = frag.coteA; f[169] = frag.coteB;
      const cA = frag.centreA || [0, 0];
      const cB = frag.centreB || [0, 0];
      f[184] = cA[0]; f[185] = cA[1]; f[186] = cB[0]; f[187] = cB[1];
      if (em.eclats) {
        f[170] = em.eclats.impulsion; f[171] = em.eclats.rotationMax;
        f[172] = em.eclats.origine[0]; f[173] = em.eclats.origine[1]; u[174] = em.eclats.morceaux;
      }
      u[175] = nZones;
      u[176] = E_TAILLE;
      // Tenue minimale : le τ1 du pas 0, en f32 (comme ecrirePas).
      f[183] = PAS;
      let o = E_TAILLE + nZones * 16;
      if (frag.a) { u[177] = o; f.set(frag.a, o); o += frag.a.length; }
      if (frag.b) { u[178] = o; f.set(frag.b, o); o += frag.b.length; }
      if (frag.eclats) { u[179] = o; f.set(frag.eclats, o); }
    }
    return tampon;
  }

  function tables(em) {
    const t = new Float32Array(TABLES);
    t.set(em.tables.couleur, 0);
    t.set(em.tables.taille, 256);
    t.set(em.tables.intensite, 320);
    t.set(em.tables.opacite, 384);
    t.set(em.tables.source, 448);
    return t;
  }

  function tamponAvec(device, octets, usage, contenu) {
    const b = device.createBuffer({ size: Math.max(16, octets), usage });
    if (contenu) device.queue.writeBuffer(b, 0, contenu);
    return b;
  }

  /** Photographie de l'ancre (éclats) en texture sRGB prémultipliée, comme les images de assets/ (rendu, liaison 6). */
  function creerPhoto(device, image) {
    const texture = device.createTexture({
      size: [image.width, image.height],
      format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: image }, { texture, premultipliedAlpha: true }, [image.width, image.height]);
    return { texture, vue: texture.createView() };
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
      layoutRelax: device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: C, buffer: { type: 'storage' } },
          { binding: 1, visibility: C, buffer: { type: 'storage' } },
          { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: C, buffer: { type: 'storage' } },
          { binding: 4, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } },
          { binding: 5, visibility: C, buffer: { type: 'uniform' } },
        ],
      }),
      addition: device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ label: 'pm-addition', code: WGSL_ADDITION }), entryPoint: 'additionner' } }),
      videProfils: device.createBuffer({ size: 16, usage: U.STORAGE }),
      videHauteurs: device.createBuffer({ size: 16, usage: U.STORAGE }),
      vueSdfVide: sdfVide.createView({ dimension: '2d-array' }),
      lisse: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
    };
    p.relaxer = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [p.layoutRelax] }),
      compute: { module: device.createShaderModule({ label: 'pm-relaxer', code: WGSL_RELAXER }), entryPoint: 'relaxer' },
    });
    parDeviceC.set(device, p);
    return p;
  }

  const MARQUE_FORCE = '  // [module-force]';

  /** Code d'un noyau avec le module de force d'un émetteur : appel inséré dans integrer, prélude et module à la suite. */
  function avecForce(code, force) {
    if (!force) return code;
    return code.replace(MARQUE_FORCE, '  A += ' + force.appel + '(p, t, zone);') + M.codeShader.OUTILS + force.wgsl;
  }
  P.avecForce = avecForce;

  /** Pipeline du pas sans collisions : celui des particules, ou une variante avec un module de force (cache par empreinte). */
  function pipelinePas(device, force) {
    const p = pipelinesPour(device);
    if (!force) return p.pas;
    if (!p.variantes) p.variantes = new Map();
    let v = p.variantes.get(force.empreinte);
    if (!v) {
      const module = device.createShaderModule({ label: 'pm-simulation-' + force.nom, code: avecForce(WGSL_SIMULATION, force) });
      v = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [p.layoutPas] }), compute: { module, entryPoint: 'pas' } });
      p.variantes.set(force.empreinte, v);
    }
    return v;
  }

  /** Pipeline du pas avec collisions, ou sa variante avec un module de force (cache par empreinte). */
  function pipelineCollisions(device, force) {
    const p = pipelinesCollisions(device);
    if (!force) return p.pas;
    if (!p.variantes) p.variantes = new Map();
    let v = p.variantes.get(force.empreinte);
    if (!v) {
      const module = device.createShaderModule({ label: 'pm-collisions-' + force.nom, code: avecForce(WGSL_MODULE_COLLISIONS, force) });
      v = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [p.layout] }), compute: { module, entryPoint: 'pasCollisions' } });
      p.variantes.set(force.empreinte, v);
    }
    return v;
  }

  /** Compile le noyau avec un module de force -> erreurs situées dans le fichier du module ([] s'il compile). */
  P.verifierForce = async function (device, force) {
    const code = avecForce(WGSL_SIMULATION, force);
    const module = device.createShaderModule({ label: 'pm-verification-' + force.nom, code });
    const info = await module.getCompilationInfo();
    const debut = (code.slice(0, code.length - force.wgsl.length).match(/\n/g) || []).length;
    return M.codeShader.situerModule(info.messages, force, debut);
  };

  /** cible += source (tampons d'entiers de même taille, usage STORAGE). */
  P.additionnerProfils = function (device, cible, source) {
    const p = pipelinesCollisions(device);
    const enc = device.createCommandEncoder();
    const passe = enc.beginComputePass();
    passe.setPipeline(p.addition);
    passe.setBindGroup(0, device.createBindGroup({
      layout: p.addition.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: cible } }, { binding: 1, resource: { buffer: source } }],
    }));
    passe.dispatchWorkgroups(Math.ceil(cible.size / 4 / 64));
    passe.end();
    device.queue.submit([enc.finish()]);
  };

  class Simulation {
    constructor(device, effet, monde, fragments) {
      const U = GPUBufferUsage;
      this.device = device;
      this.effet = effet;
      this.p = pipelinesPour(device);
      this.monde = monde && monde.actif ? monde : null;
      this.nZones = Math.ceil(effet.fin * GRILLE) + 2;
      this.tau = 0;
      this.emetteurs = effet.emetteurs.map((em) => {
        const capacite = Math.max(1, em.capacite);
        const frag = em.fragment ? (fragments && fragments[em.index]) || null : null;
        if (em.fragment && !frag) throw new Error('Effet « ' + effet.nom + ' », émetteur « ' + em.nom + ' » : photographie de son élément manquante.');
        // L'arrivée chorégraphiée ignore les obstacles (voie rapide).
        const collisions = !!(this.monde && em.collisions) && !(em.cible && em.cible.arrivee === 'choree');
        const evenements = em.aLaMort >= 0 || em.aLaCollision >= 0;
        return {
          em,
          frag,
          collisions,
          rapide: em.voieRapide && !collisions,
          capacite,
          params: tamponAvec(device, tailleE(this.nZones, frag) * 4, U.STORAGE | U.COPY_DST, emballer(em, effet, collisions, this.nZones, frag)),
          tables: tamponAvec(device, TABLES * 4, U.STORAGE | U.COPY_DST, tables(em)),
          particules: device.createBuffer({ size: capacite * OCTETS_PARTICULE, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }),
          // Morts dans [0, capacité), impacts dans [capacité, 2 × capacité) : lus par les enfants.
          morts: evenements ? device.createBuffer({ size: 2 * capacite * OCTETS_MORT, usage: U.STORAGE | U.COPY_DST }) : null,
          contacts: collisions ? device.createBuffer({ size: capacite * OCTETS_CONTACT, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }) : null,
          historique: em.rendu.type === 'trainee'
            ? device.createBuffer({ size: capacite * em.rendu.longueur * 8, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST })
            : null,
          uniformeRendu: device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST }),
          photo: frag && frag.image ? creerPhoto(device, frag.image) : null,
        };
      });
      // Fragments : repères de l'ancre et de l'élément visé, écrits dans leur tampon E au fil des pas (assurerAncres).
      this.fragmentes = this.emetteurs.filter((e) => e.frag);
      this.ancresConnues = new Uint8Array(this.nZones);

      // Inertes : enfants « a_la_collision » d'un parent sans collisions actives (et leurs descendants) ; rien n'y naît,
      // ils ne sont ni simulés ni dessinés (le parent garde la voie rapide).
      this.emetteurs.slice().sort((a, b) => a.em.profondeur - b.em.profondeur).forEach((e) => {
        const parent = e.em.parent >= 0 ? this.emetteurs[e.em.parent] : null;
        e.inerte = !!parent && (parent.inerte || (e.em.declencheur === 'collision' && !parent.collisions));
        if (e.inerte) e.rapide = false;
      });
      // Émetteurs simulés, parents avant enfants.
      this.simules = this.emetteurs.filter((e) => !e.rapide && !e.inerte).sort((a, b) => a.em.profondeur - b.em.profondeur || a.em.index - b.em.index);
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

      // Pipeline du pas de chaque émetteur simulé : variante avec son module de force (P6), mise en cache par empreinte.
      this.simules.forEach((e) => {
        const force = e.em.modulesWGSL ? e.em.modulesWGSL.force : null;
        e.pipelinePas = e.collisions ? pipelineCollisions(device, force) : pipelinePas(device, force);
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
      const tailleEtat = this.simules.reduce((s, e) => s + e.capacite * OCTETS_PARTICULE + (e.historique ? e.historique.size : 0) + (e.contacts ? e.contacts.size : 0), 0)
        + (this.hauteurs ? this.hauteurs.size : 0);
      this.k = 0;
      this.planificateur = M.instantanes.creerPlanificateur({
        intervalle: M.instantanes.intervallePour({ tailleEtat, pasTotal: this.kFin, budget: BUDGET_INSTANTANES }),
      });
      this.instantanes = new Map();
    }

    /** Repères des obstacles (texture, une ligne par point de grille), uniforme « Monde », profils d'empilement. */
    preparerMonde() {
      const { device } = this;
      const O = M.obstacles;
      const U = GPUBufferUsage;
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
      this.uniformeMonde = tamponAvec(device, O.OCTETS_MONDE, U.UNIFORM | U.COPY_DST,
        O.emballerMonde(entrees, this.nZones, this.monde.largeurCqh, this.monde.tans || []));
      this.nProfils = entrees.filter((e) => e.profil !== O.AUCUN).length;
      if (!this.nProfils) return;
      const octets = this.nProfils * O.CASES * 4;
      this.profils = device.createBuffer({ size: octets, usage: U.STORAGE | U.COPY_DST });
      this.hauteurs = device.createBuffer({ size: octets, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
      this.brut = device.createBuffer({ size: octets, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
      this.bases = this.monde.bases || device.createBuffer({ size: octets, usage: U.STORAGE | U.COPY_DST });
      this.groupeRelax = device.createBindGroup({
        layout: this.pc.layoutRelax,
        entries: [
          { binding: 0, resource: { buffer: this.profils } },
          { binding: 1, resource: { buffer: this.hauteurs } },
          { binding: 2, resource: { buffer: this.bases } },
          { binding: 3, resource: { buffer: this.brut } },
          { binding: 4, resource: { buffer: this.tamponPas, size: 80 } },
          { binding: 5, resource: { buffer: this.uniformeMonde } },
        ],
      });
      if (this.monde.bases) this.relaxerBases(octets);
    }

    /** Couche héritée seule (bases de la vidéo relaxées au talus, sans les particules de l'effet), calculée une fois :
     *  le rendu la dessine (hauteursBase, nProfils × 256 hauteurs en cqh). Obstacles de la vidéo : repères fixes. */
    relaxerBases(octets) {
      const { device } = this;
      const O = M.obstacles;
      const U = GPUBufferUsage;
      const entrees = this.monde.entrees;
      this.hauteursBase = device.createBuffer({ size: octets, usage: U.STORAGE | U.COPY_SRC });
      const zero = device.createBuffer({ size: octets, usage: U.STORAGE });
      const brut = device.createBuffer({ size: octets, usage: U.STORAGE });
      const pas = device.createBuffer({ size: 256, usage: U.UNIFORM | U.COPY_DST });
      const cadres = entrees.map((e) => (e.source && e.source.video !== undefined ? O.repereFixe(e.source, this.monde.largeurCqh, 100) : O.INACTIF));
      const v = new Float32Array(20);
      v.set(O.largeursCases(entrees, cadres), 12);
      device.queue.writeBuffer(pas, 0, v);
      const groupe = device.createBindGroup({
        layout: this.pc.layoutRelax,
        entries: [
          { binding: 0, resource: { buffer: zero } },
          { binding: 1, resource: { buffer: this.hauteursBase } },
          { binding: 2, resource: { buffer: this.bases } },
          { binding: 3, resource: { buffer: brut } },
          { binding: 4, resource: { buffer: pas, size: 80 } },
          { binding: 5, resource: { buffer: this.uniformeMonde } },
        ],
      });
      const enc = device.createCommandEncoder();
      const passe = enc.beginComputePass();
      passe.setPipeline(this.pc.relaxer);
      passe.setBindGroup(0, groupe, [0]);
      passe.dispatchWorkgroups(this.nProfils);
      passe.end();
      device.queue.submit([enc.finish()]);
      device.queue.onSubmittedWorkDone().then(() => [zero, brut, pas].forEach((b) => b.destroy()), () => {});
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

    /** Repères de l'ancre et de l'élément visé aux points de grille [g0, g1], écrits une fois chacun dans le tampon E des
     *  émetteurs de fragments (queue de E, 16 nombres par point). */
    assurerAncres(g0, g1, zones) {
      if (!this.fragmentes.length) return;
      for (let g = Math.max(0, g0); g <= Math.min(this.nZones - 1, g1); g++) {
        if (this.ancresConnues[g]) continue;
        const r = zones.ancres(g);
        this.fragmentes.forEach((e) => this.device.queue.writeBuffer(e.params, (E_TAILLE + g * 16) * 4, r));
        this.ancresConnues[g] = 1;
      }
    }

    avancer(tau, zones) {
      const k = Math.min(this.kFin, Math.max(0, Math.floor(tau / PAS + 1e-6)));
      const delta = Math.max(0, tau - k * PAS);
      this.k = k;
      this.tau = tau;
      if (this.simules.length) this.executer(this.planificateur.planifier(k), zones);
      if (this.rapides.length) this.evaluer(tau, zones, k);
      return this.emetteurs.map((e) => (e.rapide || e.inerte ? 0 : delta));
    }

    /** Données propres au pas, après zones et repères : temps, largeurs de case des profils à τ1. */
    ecrirePas(o, k) {
      const u = this.u32Pas;
      const f = this.f32Pas;
      const tau0 = Math.fround(k * PAS);
      const tau1 = Math.fround((k + 1) * PAS);
      u[o] = k;
      f[o + 1] = tau0;
      f[o + 2] = tau1;
      f[o + 3] = tau1 - tau0;
      if (this.nProfils) {
        const O = M.obstacles;
        const x = (k + 1) * PAS * GRILLE;
        const g = Math.min(this.nZones - 1, Math.floor(x));
        const h = Math.min(this.nZones - 1, g + 1);
        const t = this.reperesCPU;
        const n = this.nObs;
        const cadres = this.monde.entrees.map((e, i) => O.interpolerRepere(O.lireRepere(t, (g * n + i) * 8), O.lireRepere(t, (h * n + i) * 8), Math.min(1, x - g)));
        f.set(O.largeursCases(this.monde.entrees, cadres), o + 12);
      }
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
          this.assurerAncres(Math.floor(a.k * PAS * GRILLE) - 1, Math.floor((a.k + 1) * PAS * GRILLE) + 2, zones);
          this.ecrirePas(o, a.k);
          if (!passe) passe = enc.beginComputePass();
          for (const e of this.simules) {
            passe.setPipeline(e.pipelinePas);
            passe.setBindGroup(0, e.groupePas, [n * 256]);
            passe.dispatchWorkgroups(Math.ceil(e.capacite / 64));
          }
          if (this.nProfils) {
            passe.setPipeline(this.pc.relaxer);
            passe.setBindGroup(0, this.groupeRelax, [n * 256]);
            passe.dispatchWorkgroups(this.nProfils);
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
          if (this.nProfils) { enc.clearBuffer(this.profils); enc.clearBuffer(this.hauteurs); enc.clearBuffer(this.brut); }
        } else if (a.type === 'restaurer') {
          const copie = this.instantanes.get(a.k);
          this.simules.forEach((e, i) => {
            enc.copyBufferToBuffer(copie[i].particules, 0, e.particules, 0, e.capacite * OCTETS_PARTICULE);
            if (e.historique) enc.copyBufferToBuffer(copie[i].historique, 0, e.historique, 0, e.historique.size);
            if (e.contacts) enc.copyBufferToBuffer(copie[i].contacts, 0, e.contacts, 0, e.contacts.size);
          });
          if (this.nProfils) enc.copyBufferToBuffer(copie.hauteurs, 0, this.hauteurs, 0, this.hauteurs.size);
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
            if (this.nProfils) copie.hauteurs = device.createBuffer({ size: this.hauteurs.size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
          }
          this.simules.forEach((e, i) => {
            enc.copyBufferToBuffer(e.particules, 0, copie[i].particules, 0, e.capacite * OCTETS_PARTICULE);
            if (e.historique) enc.copyBufferToBuffer(e.historique, 0, copie[i].historique, 0, e.historique.size);
            if (e.contacts) enc.copyBufferToBuffer(e.contacts, 0, copie[i].contacts, 0, e.contacts.size);
          });
          if (this.nProfils) enc.copyBufferToBuffer(this.hauteurs, 0, copie.hauteurs, 0, this.hauteurs.size);
        }
      }
      envoyer();
    }

    evaluer(tau, zones, k) {
      const { device } = this;
      // Fragments : repères de τ = 0 jusqu'autour de τ (naissance, instants de libération entre les deux, τ).
      this.assurerAncres(0, Math.floor(tau * GRILLE) + 2, zones);
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
        new Uint32Array(v)[2] = k;
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

    lireHauteurs() {
      return this.nProfils ? this.lireTampon(this.hauteurs) : Promise.resolve(new Float32Array(0));
    }

    /** Sommes propres du dernier pas, rangées par obstacle de la vidéo (contribution de l'effet à la couche commune). */
    contributionVideo() {
      const O = M.obstacles;
      const U = GPUBufferUsage;
      const c = this.device.createBuffer({ size: O.MAX_VIDEO * O.CASES * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
      if (!this.nProfils) return c;
      const enc = this.device.createCommandEncoder();
      this.monde.entrees.forEach((e) => {
        if (e.profil !== O.AUCUN && e.source && e.source.video !== undefined) enc.copyBufferToBuffer(this.brut, e.profil * O.CASES * 4, c, e.source.video * O.CASES * 4, O.CASES * 4);
      });
      this.device.queue.submit([enc.finish()]);
      return c;
    }

    detruire() {
      this.emetteurs.forEach((e) => {
        [e.params, e.tables, e.particules, e.morts, e.contacts, e.historique, e.uniformeRendu, e.uniformeEval].forEach((b) => b && b.destroy());
        if (e.photo) e.photo.texture.destroy();
      });
      this.instantanes.forEach((copie) => {
        copie.forEach((c) => [c.particules, c.historique, c.contacts].forEach((b) => b && b.destroy()));
        if (copie.hauteurs) copie.hauteurs.destroy();
      });
      this.instantanes.clear();
      this.tamponPas.destroy();
      if (this.tamponZones) this.tamponZones.destroy();
      if (this.texReperes) this.texReperes.destroy();
      if (this.uniformeMonde) this.uniformeMonde.destroy();
      [this.profils, this.hauteurs, this.brut, this.bases, this.hauteursBase].forEach((b) => b && b.destroy());
    }
  }

  P.Simulation = Simulation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
