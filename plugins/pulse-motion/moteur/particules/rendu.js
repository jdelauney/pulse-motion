/* Pulse Motion – rendu « AAA » des particules d'un calque (WebGPU).
 *
 * new P.Rendu(device, format)
 *   .preparer(effets) -> Promise<Set> textures des images de assets/ (avant le premier rendu) ;
 *                                     résout l'ensemble des images illisibles (URL data:)
 *   .cible(canvas)                    cible HDR, niveaux de bloom, copie lisible, contexte du canvas
 *   .oublierCible(canvas)             libère la cible (scène masquée) ; .cible la recrée au retour
 *   .dessiner(cible, liste, o)        liste : [{ sim, i, delta }] ; o : { largeurCqh, dureeImage, bloom, seuil, tons, couches? } ;
 *                                     pose cible.vide (rien à dessiner) ; couches : [{ tampon (f32, cqh), debut (case),
 *                                     repere, genre (type d'obstacle), couleur [r, v, b, a], flou (cqh) }] couches héritées
 *                                     des obstacles de la vidéo, dessinées sous les particules
 *   .lirePixels(cible) -> Promise<{ largeur, hauteur, donnees }>  (RVBA 8 bits, prémultiplié, sRGB)
 *   .lireOrdre(e) -> Promise<Uint32Array>                          (paires clé, index après tri ; tests)
 *
 * Chaîne : tri bitonique des émetteurs en mélange alpha (clé z) -> particules dans une cible rgba16float
 * (sprite, étincelle étirée, traînée en ruban, planche ; textures procédurales ou image ; flou de
 * mouvement en 4 échantillons ; perspective selon z, sauf pour les émetteurs à collisions) -> bloom (seuil, dual Kawase sur 5 niveaux dans un
 * espace fixe de 540 px de haut : portée en cqh indépendante de la taille du canvas ; somme des niveaux
 * divisée par leur nombre ; HDR borné à 6e4 contre le débordement des flottants 16 bits) ->
 * courbe de tons (douce ou ACES) -> tramage -> sRGB, alpha = max(alpha, max(r, g, b)), prémultiplié.
 * Tri bitonique : K. Batcher (1968). ACES : approximation de K. Narkowicz (2015). Dual Kawase :
 * M. Bjørge (2015). Algorithmes publics, réimplémentés.
 * Navigateur seulement ; dépend de simulation.js (P.WGSL_COMMUN).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  const NIVEAUX = 5;
  const HAUTEUR_BLOOM = 540;
  const TRI_LOG_MAX = 22;

  const WGSL_FINAL_COMMUN = /* wgsl */ `
@vertex
fn vsPlein(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}
`;

  const WGSL_PARTICULES = P.WGSL_COMMUN + /* wgsl */ `
struct Calque { largeur: f32, hauteur: f32, delta: f32, dureeImage: f32, k: u32, trie: u32, flou: u32, fondu: u32 };
struct Contact { local: vec2f, obstacle: u32, pose: f32, impact: f32, nImpacts: u32, opacite: f32, cellule: u32 };
struct Style { genre: u32, texture: u32, etirement: f32, longueur: u32, colonnes: u32, lignes: u32, ips: f32, melange: u32 };
@group(0) @binding(0) var<storage, read> particules: array<Particule>;
@group(0) @binding(1) var<storage, read> T: array<f32>;
@group(0) @binding(2) var<uniform> C: Calque;
@group(0) @binding(3) var<uniform> R: Style;
@group(0) @binding(4) var<storage, read> ordre: array<vec2u>;
@group(0) @binding(5) var<storage, read> historique: array<vec2f>;
@group(0) @binding(6) var image: texture_2d<f32>;
@group(0) @binding(7) var lisse: sampler;
@group(0) @binding(8) var<storage, read> contacts: array<Contact>;

// Fondu d'une particule posée (collisions) : 1 sans contacts.
fn fondu(idx: u32) -> f32 {
  if (C.fondu == 1u) { return contacts[idx].opacite; }
  return 1.0;
}

struct Sortie {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) uvTex: vec2f,
  @location(2) couleur: vec4f,
  @location(3) alea: f32,
  @location(4) @interpolate(flat) echantillons: f32,
};

fn table(debut: u32, u: f32) -> f32 {
  let x = clamp(u, 0.0, 1.0) * 63.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 63u);
  return mix(T[debut + i], T[debut + j], x - f32(i));
}

fn teinte(u: f32) -> vec4f {
  let x = clamp(u, 0.0, 1.0) * 63.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 63u);
  let c0 = vec4f(T[i * 4u], T[i * 4u + 1u], T[i * 4u + 2u], T[i * 4u + 3u]);
  let c1 = vec4f(T[j * 4u], T[j * 4u + 1u], T[j * 4u + 2u], T[j * 4u + 3u]);
  return mix(c0, c1, x - f32(i));
}

fn ecran(w: vec2f) -> vec4f { return vec4f(w.x / C.largeur * 2.0 - 1.0, 1.0 - w.y / C.hauteur * 2.0, 0.0, 1.0); }

// Décalage de perspective selon z. Émetteur à collisions (contacts liés) : aucun décalage, la position dessinée est celle
// de la simulation (sinon une particule posée apparaît à côté de son obstacle) ; la taille suit toujours z.
fn perspective(p: vec2f, z: f32) -> vec2f {
  if (C.fondu == 1u) { return p; }
  let c = vec2f(C.largeur, C.hauteur) * 0.5;
  return c + (p - c) * (1.0 + 0.35 * z);
}

fn cachee() -> Sortie {
  var o: Sortie;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  return o;
}

fn indice(rang: u32) -> u32 {
  if (C.trie == 1u) { return ordre[rang].y; }
  return rang;
}

@vertex
fn vsQuad(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Sortie {
  let echantillons = select(1u, 4u, C.flou == 1u);
  let idx = indice(ii / echantillons);
  if (idx >= arrayLength(&particules)) { return cachee(); }
  let p = particules[idx];
  if (p.vivante == 0u) { return cachee(); }
  var o: Sortie;
  let u = p.age / p.vie;
  let f = 1.0 + 0.35 * p.z;
  let taille = p.taille * table(256u, u) * f;
  let recul = f32(ii % echantillons) / f32(echantillons) * C.dureeImage;
  let centre = perspective(p.pos + p.vel * (C.delta - recul), p.z);
  var coins = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = coins[vi];
  var uvTex = c * 0.5 + 0.5;
  var q: vec2f;
  if (R.genre == 1u) {
    // Étincelle : étirée le long de la vitesse.
    let v = p.vel * f;
    let l = length(v);
    var dir = vec2f(1.0, 0.0);
    if (l > 1e-6) { dir = v / l; }
    let long = 0.5 * taille + 0.5 * l * R.etirement;
    q = dir * c.x * long + vec2f(-dir.y, dir.x) * c.y * 0.5 * taille;
  } else {
    let rot = p.rot + p.vrot * C.delta;
    var cc = c;
    if (R.texture == 5u) {
      // Confetti : rectangle qui tourne aussi sur lui-même (largeur apparente qui bat).
      cc = vec2f(c.x * abs(cos(rot * 2.0 + p.alea * 6.2831853)), c.y * 0.5);
    }
    q = vec2f(cos(rot) * cc.x - sin(rot) * cc.y, sin(rot) * cc.x + cos(rot) * cc.y) * 0.5 * taille;
    if (R.genre == 3u) {
      let nb = R.colonnes * R.lignes;
      var cadre = u32(floor(clamp(u, 0.0, 0.9999) * f32(nb)));
      if (R.ips > 0.0) { cadre = u32(floor(p.age * R.ips)) % nb; }
      cadre = min(cadre, nb - 1u);
      let cel = vec2f(f32(cadre % R.colonnes), f32(cadre / R.colonnes));
      uvTex = (cel + uvTex) / vec2f(f32(R.colonnes), f32(R.lignes));
    }
  }
  let couleur = teinte(u);
  o.pos = ecran(centre + q);
  o.uv = c;
  o.uvTex = uvTex;
  o.couleur = vec4f(couleur.rgb * table(320u, u), couleur.a * table(384u, u) * fondu(idx));
  o.alea = p.alea;
  o.echantillons = f32(echantillons);
  return o;
}

fn pointTrainee(p: Particule, j: u32, idx: u32) -> vec2f {
  if (j == 0u) { return p.pos + p.vel * C.delta; }
  let N = R.longueur;
  let h = (C.k / 2u) % N;
  let i = (h + N - ((j - 1u) % N)) % N;
  return historique[idx * N + i];
}

@vertex
fn vsTrainee(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Sortie {
  let idx = indice(ii);
  if (idx >= arrayLength(&particules)) { return cachee(); }
  let p = particules[idx];
  if (p.vivante == 0u) { return cachee(); }
  var o: Sortie;
  let N = R.longueur;
  let j = vi / 2u;
  let a = pointTrainee(p, j, idx);
  var tangente: vec2f;
  if (j < N) { tangente = a - pointTrainee(p, j + 1u, idx); } else { tangente = pointTrainee(p, j - 1u, idx) - a; }
  let l = length(tangente);
  var normale = vec2f(0.0, 1.0);
  if (l > 1e-6) { normale = vec2f(-tangente.y, tangente.x) / l; }
  let u = p.age / p.vie;
  let k = 1.0 - f32(j) / f32(N);
  let f = 1.0 + 0.35 * p.z;
  let demiLargeur = p.taille * table(256u, u) * f * 0.5 * k;
  let cote = select(-1.0, 1.0, (vi & 1u) == 1u);
  o.pos = ecran(perspective(a, p.z) + normale * demiLargeur * cote);
  o.uv = vec2f(0.0, cote);
  o.uvTex = vec2f(f32(j) / f32(N), cote * 0.5 + 0.5);
  let couleur = teinte(u);
  o.couleur = vec4f(couleur.rgb * table(320u, u), couleur.a * table(384u, u) * k * fondu(idx));
  o.alea = p.alea;
  o.echantillons = 1.0;
  return o;
}

fn coin2(c: vec2f) -> f32 {
  let q = vec2u(vec2i(c));
  return f32(pcg(q.x ^ pcg(q.y)) >> 8u) / 16777216.0;
}

fn bruit2(p: vec2f) -> f32 {
  let c = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(coin2(c), coin2(c + vec2f(1.0, 0.0)), u.x), mix(coin2(c + vec2f(0.0, 1.0)), coin2(c + vec2f(1.0, 1.0)), u.x), u.y);
}

// Motif de la particule, alpha prémultiplié (blanc pour les textures procédurales).
fn motif(e: Sortie) -> vec4f {
  let r = length(e.uv);
  switch R.texture {
    case 0u: { return vec4f(1.0 - smoothstep(0.0, 1.0, r)); }
    case 1u: {
      let coeur = exp(-r * r * 10.0);
      let rayons = exp(-abs(e.uv.x) * 18.0) * max(0.0, 1.0 - abs(e.uv.y)) + exp(-abs(e.uv.y) * 18.0) * max(0.0, 1.0 - abs(e.uv.x));
      return vec4f(clamp(coeur + 0.7 * rayons, 0.0, 1.0));
    }
    case 2u: {
      let n = bruit2(e.uv * 2.2 + vec2f(e.alea * 37.0, e.alea * 11.0));
      return vec4f((1.0 - smoothstep(0.15, 1.0, r)) * (0.55 + 0.45 * n));
    }
    case 3u: {
      let d = length(vec2f(e.uv.x * (1.4 + 0.6 * e.uv.y), (e.uv.y + 0.2) * 0.8));
      let n = bruit2(e.uv * 3.0 + vec2f(e.alea * 13.0, 0.0));
      return vec4f((1.0 - smoothstep(0.2, 1.0, d)) * (0.75 + 0.25 * n));
    }
    case 4u: {
      let d = abs(e.uv.x) * (0.6 + 0.4 * e.alea) + abs(e.uv.y);
      return vec4f(1.0 - smoothstep(0.85, 1.0, d));
    }
    case 5u: {
      return vec4f((1.0 - smoothstep(0.9, 1.0, abs(e.uv.x))) * (1.0 - smoothstep(0.9, 1.0, abs(e.uv.y))));
    }
    default: { }
  }
  return textureSample(image, lisse, e.uvTex);
}

// Mélanges (R.melange) : 0 additif, 1 alpha, 2 prémultiplié (émission qui n'occulte qu'à hauteur de
// son alpha : la couleur n'est pas multipliée par l'alpha).
@fragment
fn fsQuad(e: Sortie) -> @location(0) vec4f {
  let t = motif(e);
  let n = e.echantillons;
  let a = t.a * e.couleur.a;
  if (R.melange == 0u) { return vec4f(t.rgb * e.couleur.rgb * e.couleur.a, a) / n; }
  // Flou : n échantillons superposés au même endroit rendent l'opacité a, car 1 − (1 − aEch)^n = a.
  let aEch = 1.0 - pow(max(1.0 - a, 0.0), 1.0 / n);
  if (R.melange == 2u) { return vec4f(t.rgb * e.couleur.rgb / n, aEch); }
  return vec4f(t.rgb * e.couleur.rgb * e.couleur.a * (aEch / max(a, 1e-6)), aEch);
}

@fragment
fn fsTrainee(e: Sortie) -> @location(0) vec4f {
  let m = 1.0 - smoothstep(0.3, 1.0, abs(e.uv.y));
  let a = m * e.couleur.a;
  if (R.melange == 2u) { return vec4f(e.couleur.rgb * m, a); }
  return vec4f(e.couleur.rgb * a, a);
}
`;

  const WGSL_TRI = P.WGSL_COMMUN + /* wgsl */ `
struct Passe { j: u32, k: u32, a: u32, b: u32 };
@group(0) @binding(0) var<storage, read> particules: array<Particule>;
@group(0) @binding(1) var<storage, read_write> ordre: array<vec2u>;
@group(0) @binding(2) var<uniform> S: Passe;

// Clé croissante avec z (flottant rendu triable) ; cases mortes et bourrage à la fin.
@compute @workgroup_size(64)
fn cles(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= arrayLength(&ordre)) { return; }
  var cle = 0xffffffffu;
  if (i < arrayLength(&particules) && particules[i].vivante == 1u) {
    let b = bitcast<u32>(particules[i].z);
    cle = select(b | 0x80000000u, ~b, (b & 0x80000000u) != 0u);
    cle = min(cle, 0xfffffffeu);
  }
  ordre[i] = vec2u(cle, i);
}

@compute @workgroup_size(64)
fn etape(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= arrayLength(&ordre)) { return; }
  let l = i ^ S.j;
  if (l <= i) { return; }
  let a = ordre[i];
  let b = ordre[l];
  let croissant = (i & S.k) == 0u;
  let plusGrand = a.x > b.x || (a.x == b.x && a.y > b.y);
  if (plusGrand == croissant) {
    ordre[i] = b;
    ordre[l] = a;
  }
}
`;

  // Couche héritée d'un obstacle de la vidéo (neige tombée dans une scène précédente) : bande qui suit le profil (256 cases,
  // cqh, sur le dessus de l'obstacle dans son repère), bord haut adouci sur K.flou cqh. Alpha prémultiplié.
  const WGSL_COUCHE = /* wgsl */ `
struct Couche { centre: vec2f, angle: f32, demiX: f32, couleur: vec4f, largeur: f32, hauteur: f32, debut: u32, flou: f32,
  genre: u32, demiY: f32, a: f32, b: f32 };
@group(0) @binding(0) var<storage, read> H: array<f32>;
@group(0) @binding(1) var<uniform> K: Couche;
struct SortieCouche { @builtin(position) pos: vec4f, @location(0) sousHaut: f32 };

// Dessus de l'obstacle en x local (y vers le bas) : demi-plan et segment 0, boîte -demiY, cercle sur son arc.
fn dessus(x: f32) -> f32 {
  if (K.genre == 1u) { return -K.demiY; }
  if (K.genre == 2u) { let u = x / max(K.demiX, 1e-6); return -K.demiY * sqrt(max(1.0 - u * u, 0.0)); }
  return 0.0;
}

@vertex
fn vsCouche(@builtin(vertex_index) vi: u32) -> SortieCouche {
  let c = min(vi / 2u, 255u);
  let h = max(H[K.debut + c], 0.0);
  let x = ((f32(c) + 0.5) / 256.0 * 2.0 - 1.0) * K.demiX;
  let haut = (vi & 1u) == 1u;
  var l = vec2f(x, dessus(x));
  if (haut) { l.y = l.y - h; }
  let co = cos(K.angle);
  let si = sin(K.angle);
  let w = K.centre + vec2f(co * l.x - si * l.y, si * l.x + co * l.y);
  var o: SortieCouche;
  o.pos = vec4f(w.x / K.largeur * 2.0 - 1.0, 1.0 - w.y / K.hauteur * 2.0, 0.0, 1.0);
  o.sousHaut = select(h, 0.0, haut);
  return o;
}

@fragment
fn fsCouche(e: SortieCouche) -> @location(0) vec4f {
  let a = K.couleur.a * smoothstep(0.0, K.flou, e.sousHaut);
  return vec4f(K.couleur.rgb * a, a);
}
`;
  const GENRES_COUCHE = { 0: 0, 3: 0, 1: 1, 2: 2 };

  // Borne du HDR : au-delà de 65504, les flottants 16 bits débordent (infini, puis NaN dans le flou).
  const WGSL_BORNE = /* wgsl */ `
const BORNE = vec3f(6e4);
`;

  const WGSL_BLOOM = WGSL_FINAL_COMMUN + WGSL_BORNE + /* wgsl */ `
struct Flou { texelSource: vec2f, texelSortie: vec2f, seuil: f32, a: f32, b: f32, c: f32 };
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var lisse: sampler;
@group(0) @binding(2) var<uniform> B: Flou;

fn lire(uv: vec2f) -> vec3f { return min(textureSample(source, lisse, uv).rgb, BORNE); }

@fragment
fn bas(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy * B.texelSortie;
  let h = B.texelSource * 0.5;
  var c = lire(uv) * 4.0;
  c += lire(uv - h);
  c += lire(uv + h);
  c += lire(uv + vec2f(h.x, -h.y));
  c += lire(uv - vec2f(h.x, -h.y));
  c = c / 8.0;
  if (B.seuil >= 0.0) {
    let l = max(c.r, max(c.g, c.b));
    c = c * (max(l - B.seuil, 0.0) / max(l, 1e-4));
  }
  return vec4f(c, 0.0);
}

@fragment
fn haut(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy * B.texelSortie;
  let h = B.texelSource * 0.5;
  var c = textureSample(source, lisse, uv + vec2f(-h.x * 2.0, 0.0)).rgb;
  c += textureSample(source, lisse, uv + vec2f(-h.x, h.y)).rgb * 2.0;
  c += textureSample(source, lisse, uv + vec2f(0.0, h.y * 2.0)).rgb;
  c += textureSample(source, lisse, uv + vec2f(h.x, h.y)).rgb * 2.0;
  c += textureSample(source, lisse, uv + vec2f(h.x * 2.0, 0.0)).rgb;
  c += textureSample(source, lisse, uv + vec2f(h.x, -h.y)).rgb * 2.0;
  c += textureSample(source, lisse, uv + vec2f(0.0, -h.y * 2.0)).rgb;
  c += textureSample(source, lisse, uv + vec2f(-h.x, -h.y)).rgb * 2.0;
  return vec4f(c / 12.0, 0.0);
}
`;

  const WGSL_FINAL = P.WGSL_COMMUN + WGSL_FINAL_COMMUN + WGSL_BORNE + /* wgsl */ `
struct Final { intensite: f32, tons: u32, a: u32, b: u32 };
@group(0) @binding(0) var hdr: texture_2d<f32>;
@group(0) @binding(1) var bloom: texture_2d<f32>;
@group(0) @binding(2) var lisse: sampler;
@group(0) @binding(3) var<uniform> F: Final;

fn versSRGB(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

// Identité jusqu'à 0,8, puis épaule exponentielle : les couleurs de la charte restent justes.
fn tonsDouce(x: vec3f) -> vec3f {
  let s = 0.8;
  return select(s + (1.0 - s) * (1.0 - exp(-(x - s) / (1.0 - s))), x, x <= vec3f(s));
}

fn tonsAces(x: vec3f) -> vec3f {
  return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn tramage(p: vec2f) -> f32 {
  let h = pcg(u32(p.x) ^ pcg(u32(p.y)));
  return (f32(h >> 8u) / 16777216.0 - 0.5) / 255.0;
}

struct Sorties { @location(0) ecran: vec4f, @location(1) copie: vec4f };

@fragment
fn fsFinal(@builtin(position) pos: vec4f) -> Sorties {
  let taille = vec2f(textureDimensions(hdr));
  let c = textureLoad(hdr, vec2i(pos.xy), 0);
  // Chaque niveau du bloom porte l'excès seuillé : la somme des niveaux est ramenée à une fois l'excès.
  let lumiere = min(textureSample(bloom, lisse, pos.xy / taille).rgb, BORNE) * (F.intensite / ${NIVEAUX}.0);
  var rgb = min(max(c.rgb, vec3f(0.0)) + lumiere, BORNE);
  if (F.tons == 1u) { rgb = tonsAces(rgb); } else { rgb = tonsDouce(rgb); }
  let a = clamp(max(c.a, max(rgb.r, max(rgb.g, rgb.b))), 0.0, 1.0);
  var o = vec4f(0.0);
  if (a > 0.5 / 255.0) {
    let encode = versSRGB(min(rgb / a, vec3f(1.0))) + vec3f(tramage(pos.xy));
    o = vec4f(clamp(encode, vec3f(0.0), vec3f(1.0)) * a, a);
  }
  return Sorties(o, o);
}
`;

  const MELANGES = {
    additif: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } },
    alpha: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } },
  };

  function puissanceDeDeux(n) { let p = 64; while (p < n) p *= 2; return p; }

  function detruireCible(c) {
    [c.hdr, c.sortie, ...c.niveaux.map((n) => n.texture), c.uniformeFinal, ...c.bas.map((b) => b.uniforme), ...c.haut.map((b) => b.uniforme)].forEach((t) => t.destroy());
  }

  class Rendu {
    constructor(device, format) {
      this.device = device;
      this.format = format;
      const V = GPUShaderStage.VERTEX;
      const Fr = GPUShaderStage.FRAGMENT;
      const C = GPUShaderStage.COMPUTE;
      const U = GPUBufferUsage;

      // Particules.
      this.layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: V, buffer: { type: 'uniform' } },
          { binding: 3, visibility: V | Fr, buffer: { type: 'uniform' } },
          { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 5, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 6, visibility: Fr, texture: { sampleType: 'float' } },
          { binding: 7, visibility: Fr, sampler: { type: 'filtering' } },
          { binding: 8, visibility: V, buffer: { type: 'read-only-storage' } },
        ],
      });
      const module = device.createShaderModule({ label: 'pm-particules', code: WGSL_PARTICULES });
      const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      this.pipelines = {};
      ['quad', 'trainee'].forEach((forme) => Object.keys(MELANGES).forEach((melange) => {
        this.pipelines[forme + '-' + melange] = device.createRenderPipeline({
          layout,
          vertex: { module, entryPoint: forme === 'quad' ? 'vsQuad' : 'vsTrainee' },
          fragment: { module, entryPoint: forme === 'quad' ? 'fsQuad' : 'fsTrainee', targets: [{ format: 'rgba16float', blend: MELANGES[melange] }] },
          primitive: { topology: forme === 'quad' ? 'triangle-list' : 'triangle-strip' },
        });
      }));

      // Couches héritées des obstacles de la vidéo.
      this.layoutCouche = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: V | Fr, buffer: { type: 'uniform' } },
        ],
      });
      const moduleCouche = device.createShaderModule({ label: 'pm-couche', code: WGSL_COUCHE });
      this.pipelineCouche = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.layoutCouche] }),
        vertex: { module: moduleCouche, entryPoint: 'vsCouche' },
        fragment: { module: moduleCouche, entryPoint: 'fsCouche', targets: [{ format: 'rgba16float', blend: MELANGES.alpha }] },
        primitive: { topology: 'triangle-strip' },
      });
      this.couches = new WeakMap();

      // Tri bitonique : tableau de passes (j, k) partagé jusqu'à 2^22 particules.
      this.layoutTri = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: C, buffer: { type: 'storage' } },
          { binding: 2, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 16 } },
        ],
      });
      const moduleTri = device.createShaderModule({ label: 'pm-tri', code: WGSL_TRI });
      const layoutTri = device.createPipelineLayout({ bindGroupLayouts: [this.layoutTri] });
      this.pipelineCles = device.createComputePipeline({ layout: layoutTri, compute: { module: moduleTri, entryPoint: 'cles' } });
      this.pipelineEtape = device.createComputePipeline({ layout: layoutTri, compute: { module: moduleTri, entryPoint: 'etape' } });
      const passes = [];
      for (let k = 2; k <= 1 << TRI_LOG_MAX; k *= 2) for (let j = k / 2; j >= 1; j /= 2) passes.push([j, k]);
      const table = new Uint32Array(passes.length * 64);
      passes.forEach(([j, k], i) => { table[i * 64] = j; table[i * 64 + 1] = k; });
      this.tablePasses = device.createBuffer({ size: table.byteLength, usage: U.UNIFORM | U.COPY_DST });
      device.queue.writeBuffer(this.tablePasses, 0, table);

      // Bloom.
      this.layoutBloom = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: Fr, texture: { sampleType: 'float' } },
          { binding: 1, visibility: Fr, sampler: { type: 'filtering' } },
          { binding: 2, visibility: Fr, buffer: { type: 'uniform' } },
        ],
      });
      const moduleBloom = device.createShaderModule({ label: 'pm-bloom', code: WGSL_BLOOM });
      const layoutBloom = device.createPipelineLayout({ bindGroupLayouts: [this.layoutBloom] });
      this.pipelineBas = device.createRenderPipeline({
        layout: layoutBloom,
        vertex: { module: moduleBloom, entryPoint: 'vsPlein' },
        fragment: { module: moduleBloom, entryPoint: 'bas', targets: [{ format: 'rgba16float' }] },
      });
      this.pipelineHaut = device.createRenderPipeline({
        layout: layoutBloom,
        vertex: { module: moduleBloom, entryPoint: 'vsPlein' },
        fragment: { module: moduleBloom, entryPoint: 'haut', targets: [{ format: 'rgba16float', blend: MELANGES.additif }] },
      });

      // Passe finale.
      const moduleFinal = device.createShaderModule({ label: 'pm-final', code: WGSL_FINAL });
      this.final = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: moduleFinal, entryPoint: 'vsPlein' },
        fragment: { module: moduleFinal, entryPoint: 'fsFinal', targets: [{ format }, { format: 'rgba8unorm' }] },
      });

      this.lisse = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      this.vide = device.createBuffer({ size: 16, usage: U.STORAGE });
      this.videContacts = device.createBuffer({ size: 32, usage: U.STORAGE });
      this.blanc = device.createTexture({ size: [1, 1], format: 'rgba8unorm-srgb', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      device.queue.writeTexture({ texture: this.blanc }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
      this.images = new Map();
      this.groupes = new WeakMap();
      this.tris = new WeakMap();
      this.styles = new WeakMap();
    }

    async preparer(effets) {
      const { device } = this;
      const illisibles = new Set();
      for (const effet of effets) {
        for (const em of effet.emetteurs) {
          const url = em.rendu.textureImage;
          if (!url || this.images.has(url) || illisibles.has(url)) continue;
          let bitmap;
          try {
            const img = new Image();
            img.src = url;
            await img.decode();
            bitmap = await createImageBitmap(img);
          } catch (e) {
            console.error('[Pulse Motion] Image de particules illisible (' + url.slice(0, 64) + '…) : ' + String(e && e.message || e));
            illisibles.add(url);
            continue;
          }
          const texture = device.createTexture({
            size: [bitmap.width, bitmap.height],
            format: 'rgba8unorm-srgb',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
          });
          device.queue.copyExternalImageToTexture({ source: bitmap }, { texture, premultipliedAlpha: true }, [bitmap.width, bitmap.height]);
          this.images.set(url, texture.createView());
        }
      }
      return illisibles;
    }

    cible(canvas) {
      const { device } = this;
      const largeur = canvas.width;
      const hauteur = canvas.height;
      let c = canvas.__pmCible;
      if (c && c.device === device && c.largeur === largeur && c.hauteur === hauteur) return c;
      if (c && c.device === device) detruireCible(c);
      const contexte = canvas.getContext('webgpu');
      contexte.configure({ device, format: this.format, alphaMode: 'premultiplied' });
      const T = GPUTextureUsage;
      const hdr = device.createTexture({ size: [largeur, hauteur], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
      const sortie = device.createTexture({ size: [largeur, hauteur], format: 'rgba8unorm', usage: T.RENDER_ATTACHMENT | T.COPY_SRC | T.TEXTURE_BINDING });
      // Niveaux du bloom dans un espace fixe (540 px de haut au niveau 0) : même portée en cqh à toute taille.
      const largeurBloom = Math.max(1, Math.round(HAUTEUR_BLOOM * largeur / hauteur));
      const niveaux = [];
      for (let i = 0; i < NIVEAUX; i++) {
        const l = Math.max(1, Math.round(largeurBloom / (1 << i)));
        const h = Math.max(1, Math.round(HAUTEUR_BLOOM / (1 << i)));
        const texture = device.createTexture({ size: [l, h], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
        niveaux.push({ texture, vue: texture.createView(), largeur: l, hauteur: h });
      }
      const vueHdr = hdr.createView();
      const groupeFlou = (source, sl, sh, sortieL, sortieH, seuil) => {
        const u = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(u, 0, new Float32Array([1 / sl, 1 / sh, 1 / sortieL, 1 / sortieH, seuil, 0, 0, 0]));
        return { uniforme: u, groupe: device.createBindGroup({ layout: this.layoutBloom, entries: [{ binding: 0, resource: source }, { binding: 1, resource: this.lisse }, { binding: 2, resource: { buffer: u } }] }) };
      };
      const bas = niveaux.map((n, i) => (i === 0
        // Prises du premier niveau écartées d'au moins un demi-texel de sortie (canvas de plus de 1080 px).
        ? groupeFlou(vueHdr, Math.min(largeur, 2 * n.largeur), Math.min(hauteur, 2 * n.hauteur), n.largeur, n.hauteur, 1)
        : groupeFlou(niveaux[i - 1].vue, niveaux[i - 1].largeur, niveaux[i - 1].hauteur, n.largeur, n.hauteur, -1)));
      const haut = niveaux.slice(0, NIVEAUX - 1).map((n, i) => groupeFlou(niveaux[i + 1].vue, niveaux[i + 1].largeur, niveaux[i + 1].hauteur, n.largeur, n.hauteur, -1));
      const uniformeFinal = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      c = {
        device, contexte, largeur, hauteur, hdr, vueHdr, sortie, niveaux, bas, haut, uniformeFinal,
        groupeFinal: device.createBindGroup({
          layout: this.final.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: vueHdr },
            { binding: 1, resource: niveaux[0].vue },
            { binding: 2, resource: this.lisse },
            { binding: 3, resource: { buffer: uniformeFinal } },
          ],
        }),
      };
      canvas.__pmCible = c;
      return c;
    }

    oublierCible(canvas) {
      const c = canvas.__pmCible;
      if (!c) return;
      delete canvas.__pmCible;
      if (c.device === this.device) detruireCible(c);
      try { c.contexte.unconfigure(); } catch (e) { /* contexte déjà perdu */ }
    }

    estTrie(e) { return e.em.rendu.melange !== 'additif'; }

    tri(e) {
      let t = this.tris.get(e);
      if (!t) {
        const n = puissanceDeDeux(e.capacite);
        const ordre = this.device.createBuffer({ size: n * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        t = {
          n, ordre, log: Math.round(Math.log2(n)),
          groupe: this.device.createBindGroup({
            layout: this.layoutTri,
            entries: [
              { binding: 0, resource: { buffer: e.particules } },
              { binding: 1, resource: { buffer: ordre } },
              { binding: 2, resource: { buffer: this.tablePasses, size: 16 } },
            ],
          }),
        };
        this.tris.set(e, t);
      }
      return t;
    }

    /** Uniforme et groupe d'une couche héritée (tampon de hauteurs, profil), créés une fois. */
    couche(tampon, debut) {
      let parTampon = this.couches.get(tampon);
      if (!parTampon) { parTampon = new Map(); this.couches.set(tampon, parTampon); }
      let c = parTampon.get(debut);
      if (!c) {
        const uniforme = this.device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        c = {
          uniforme,
          groupe: this.device.createBindGroup({ layout: this.layoutCouche, entries: [{ binding: 0, resource: { buffer: tampon } }, { binding: 1, resource: { buffer: uniforme } }] }),
        };
        parTampon.set(debut, c);
      }
      return c;
    }

    /** Libère les tampons de rendu des émetteurs d'une simulation détruite. */
    oublier(sim) {
      const couches = sim.hauteursBase && this.couches.get(sim.hauteursBase);
      if (couches) { couches.forEach((c) => c.uniforme.destroy()); this.couches.delete(sim.hauteursBase); }
      sim.emetteurs.forEach((e) => {
        const t = this.tris.get(e);
        if (t) t.ordre.destroy();
        const s = this.styles.get(e);
        if (s) s.destroy();
        this.tris.delete(e);
        this.styles.delete(e);
        this.groupes.delete(e);
      });
    }

    /** Tampons propres à un émetteur, créés d'avance (dans la portée d'erreur mémoire de l'effet). */
    preparerEmetteur(e) {
      if (this.estTrie(e)) this.tri(e);
      this.style(e);
    }

    style(e) {
      let s = this.styles.get(e);
      if (!s) {
        const r = e.em.rendu;
        const v = new ArrayBuffer(32);
        const f = new Float32Array(v);
        const u = new Uint32Array(v);
        u[0] = r.code;
        u[1] = r.textureCode;
        f[2] = r.etirement;
        u[3] = r.longueur;
        u[4] = r.planche ? r.planche.colonnes : 1;
        u[5] = r.planche ? r.planche.lignes : 1;
        f[6] = r.planche ? r.planche.ips : 0;
        u[7] = r.melangeCode;
        s = this.device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(s, 0, v);
        this.styles.set(e, s);
      }
      return s;
    }

    groupe(e) {
      let g = this.groupes.get(e);
      if (!g) {
        const image = e.em.rendu.textureImage && this.images.get(e.em.rendu.textureImage);
        g = this.device.createBindGroup({
          layout: this.layout,
          entries: [
            { binding: 0, resource: { buffer: e.particules } },
            { binding: 1, resource: { buffer: e.tables } },
            { binding: 2, resource: { buffer: e.uniformeRendu } },
            { binding: 3, resource: { buffer: this.style(e) } },
            { binding: 4, resource: { buffer: this.estTrie(e) ? this.tri(e).ordre : this.vide } },
            { binding: 5, resource: { buffer: e.historique || this.vide } },
            { binding: 6, resource: image || this.blanc.createView() },
            { binding: 7, resource: this.lisse },
            { binding: 8, resource: { buffer: e.contacts || this.videContacts } },
          ],
        });
        this.groupes.set(e, g);
      }
      return g;
    }

    dessiner(cible, liste, o) {
      const { device } = this;
      const enc = device.createCommandEncoder();
      const couches = o.couches || [];
      cible.vide = liste.length === 0 && couches.length === 0;

      // 1. Tri des émetteurs en mélange alpha (clé z croissante : du plus loin au plus proche).
      const aTrier = liste.filter(({ sim, i }) => this.estTrie(sim.emetteurs[i]));
      if (aTrier.length) {
        const passe = enc.beginComputePass();
        aTrier.forEach(({ sim, i }) => {
          const t = this.tri(sim.emetteurs[i]);
          passe.setPipeline(this.pipelineCles);
          passe.setBindGroup(0, t.groupe, [0]);
          passe.dispatchWorkgroups(t.n / 64);
          passe.setPipeline(this.pipelineEtape);
          const nb = t.log * (t.log + 1) / 2;
          for (let p = 0; p < nb; p++) {
            passe.setBindGroup(0, t.groupe, [p * 256]);
            passe.dispatchWorkgroups(t.n / 64);
          }
        });
        passe.end();
      }

      // 2. Particules dans la cible HDR.
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: cible.vueHdr, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      // Couches héritées d'abord : les particules de l'effet se dessinent dessus.
      couches.forEach((k) => {
        const c = this.couche(k.tampon, k.debut);
        const v = new ArrayBuffer(64);
        const f = new Float32Array(v);
        const u = new Uint32Array(v);
        f[0] = k.repere.centre[0]; f[1] = k.repere.centre[1]; f[2] = k.repere.angle; f[3] = k.repere.demi[0];
        f.set(k.couleur, 4);
        f[8] = o.largeurCqh; f[9] = 100; u[10] = k.debut; f[11] = k.flou;
        u[12] = GENRES_COUCHE[k.genre] || 0; f[13] = k.repere.demi[1];
        device.queue.writeBuffer(c.uniforme, 0, v);
        rp.setPipeline(this.pipelineCouche);
        rp.setBindGroup(0, c.groupe);
        rp.draw(512);
      });
      liste.forEach(({ sim, i, delta }) => {
        const e = sim.emetteurs[i];
        const r = e.em.rendu;
        const v = new ArrayBuffer(32);
        const f = new Float32Array(v);
        const u = new Uint32Array(v);
        f[0] = o.largeurCqh; f[1] = 100; f[2] = delta; f[3] = o.dureeImage;
        u[4] = sim.k || 0; u[5] = this.estTrie(e) ? 1 : 0; u[6] = r.flou ? 1 : 0; u[7] = e.contacts ? 1 : 0;
        device.queue.writeBuffer(e.uniformeRendu, 0, v);
        const trainee = r.type === 'trainee';
        rp.setPipeline(this.pipelines[(trainee ? 'trainee-' : 'quad-') + (r.melange === 'additif' ? 'additif' : 'alpha')]);
        rp.setBindGroup(0, this.groupe(e));
        if (trainee) rp.draw(2 * (r.longueur + 1), e.capacite);
        else rp.draw(6, e.capacite * (r.flou ? 4 : 1));
      });
      rp.end();

      // 3. Bloom : seuil puis dual Kawase.
      if (o.bloom > 0) {
        device.queue.writeBuffer(cible.bas[0].uniforme, 16, new Float32Array([o.seuil]));
        cible.niveaux.forEach((n, i) => {
          const p = enc.beginRenderPass({ colorAttachments: [{ view: n.vue, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
          p.setPipeline(this.pipelineBas);
          p.setBindGroup(0, cible.bas[i].groupe);
          p.draw(3);
          p.end();
        });
        for (let i = NIVEAUX - 2; i >= 0; i--) {
          const p = enc.beginRenderPass({ colorAttachments: [{ view: cible.niveaux[i].vue, loadOp: 'load', storeOp: 'store' }] });
          p.setPipeline(this.pipelineHaut);
          p.setBindGroup(0, cible.haut[i].groupe);
          p.draw(3);
          p.end();
        }
      }

      // 4. Tons, tramage, sRGB : canvas et copie lisible.
      const fu = new ArrayBuffer(16);
      new Float32Array(fu)[0] = o.bloom > 0 ? o.bloom : 0;
      new Uint32Array(fu)[1] = o.tons === 'aces' ? 1 : 0;
      device.queue.writeBuffer(cible.uniformeFinal, 0, fu);
      const fin = enc.beginRenderPass({
        colorAttachments: [
          { view: cible.contexte.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
          { view: cible.sortie.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
        ],
      });
      fin.setPipeline(this.final);
      fin.setBindGroup(0, cible.groupeFinal);
      fin.draw(3);
      fin.end();
      device.queue.submit([enc.finish()]);
    }

    async lirePixels(cible) {
      const { device } = this;
      const { largeur, hauteur } = cible;
      const ligne = Math.ceil(largeur * 4 / 256) * 256;
      const tampon = device.createBuffer({ size: ligne * hauteur, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: cible.sortie }, { buffer: tampon, bytesPerRow: ligne }, [largeur, hauteur]);
      device.queue.submit([enc.finish()]);
      await tampon.mapAsync(GPUMapMode.READ);
      const brut = new Uint8Array(tampon.getMappedRange());
      const donnees = new Uint8Array(largeur * hauteur * 4);
      for (let y = 0; y < hauteur; y++) donnees.set(brut.subarray(y * ligne, y * ligne + largeur * 4), y * largeur * 4);
      tampon.unmap();
      tampon.destroy();
      return { largeur, hauteur, donnees };
    }

    async lireOrdre(e) {
      const t = this.tri(e);
      const lecture = this.device.createBuffer({ size: t.n * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(t.ordre, 0, lecture, 0, t.n * 8);
      this.device.queue.submit([enc.finish()]);
      await lecture.mapAsync(GPUMapMode.READ);
      const copie = new Uint32Array(lecture.getMappedRange().slice(0));
      lecture.unmap();
      lecture.destroy();
      return copie;
    }
  }

  P.Rendu = Rendu;
})(typeof globalThis !== 'undefined' ? globalThis : this);
