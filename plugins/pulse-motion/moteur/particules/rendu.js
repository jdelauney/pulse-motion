/* Pulse Motion – rendu « AAA » des particules d'un calque (WebGPU).
 *
 * new P.Rendu(device, format)
 *   .preparer(effets) -> Promise<Set> textures des images de assets/ (avant le premier rendu) ;
 *                                     résout l'ensemble des images illisibles (URL data:)
 *   .cible(canvas)                    cible HDR, niveaux de bloom, copie lisible, contexte du canvas
 *   .oublierCible(canvas)             libère la cible (scène masquée) ; .cible la recrée au retour
 *   .dessiner(cible, liste, o)        liste : [{ sim, i, delta }] ; o : { largeurCqh, dureeImage, bloom, seuil, tons, couches?, fonds?, photoScene?, milieu? } ;
 *                                     fonds : [(passe) => void] fonds par shader (P6), dessinés dans la cible HDR en premier ;
 *                                     pose cible.vide (rien à dessiner) ; couches : [{ tampon (f32, cqh), debut (case),
 *                                     repere, genre (type d'obstacle), couleur [r, v, b, a], flou (cqh) }] couches héritées
 *                                     des obstacles de la vidéo, dessinées sous les particules
 *   .lirePixels(cible) -> Promise<{ largeur, hauteur, donnees }>  (RVBA 8 bits, prémultiplié, sRGB)
 *   .lireOrdre(e) -> Promise<Uint32Array>                          (paires clé, index après tri ; tests)
 *
 * Modules (P6) : em.modulesWGSL.couleur (couleur au cours de la vie, avant intensité et opacité ; quad, traînée, éclat) et
 * .forme (alpha du motif, fsQuad) insérés aux marques du WGSL ; variantes de pipelines mises en cache par empreintes
 * (pipelinesDe) ; verifierModules(effets) -> Map(effet -> message) des effets dont un module (force compris) ne compile pas.
 *
 * Fragments (P4) : liaison 9 = tampon E de l'émetteur (P.WGSL_FRAGMENTS) ; couleur du pixel d'origine (« source »), de A
 * vers B le long du trajet, particules en trop en fondu, taille vers celle des pixels de la cible ; éclats : polygones
 * texturés par la photographie de l'ancre (e.photo) ; texture « pixel » (carré plein) ; tons « neutre ». Un émetteur de
 * fragments à profondeur constante n'est pas trié (même ordre).
 * Rendu « fluide » (P5a) : em.fluide ; chaque particule en demi-sphère (hauteur au maximum, épaisseur additionnée) dans une
 * texture de demi-résolution, flou bilatéral séparable (bords gardés), puis ombrage plein écran dans la cible HDR : teinte,
 * absorption selon l'épaisseur, réfraction de la photographie de la scène (o.photoScene, refraction > 0), reflet ; ressources
 * par (émetteur, cible) ; .photo(cle, bitmap) -> vue, .oublierPhoto(cle) : photographies de scène (calques.js).
 * Cordes et tissus (P5b) : module « pm-structures-rendu », lu dans les tampons des structures (sim.structures : sommets,
 * liens rompus, longueurs de repos) ; tissu en triangles de ses cellules (un triangle dont un lien est rompu est retiré),
 * plis éclairés (axe comprimé relevé hors du plan, normale tournée vers l'œil ; tissu plat : éclairage 1 exactement),
 * revers assombri (face arrière) ; corde en ruban de son épaisseur ; couleur, dégradé (e.tables, en bandes si « bandes »),
 * image de assets/ ou photographie de l'élément (e.photo), mailles ; dessinée à sa place dans la liste, mélange alpha.
 * Son réactif (P7) : couleur et taille × coefSon (P.WGSL_SON) à C.tau.
 * Milieu fluide (P5c) : o.milieu (P.Milieu, milieu.js) dessiné dans la cible HDR après les fonds, avant les couches
 * héritées et les particules : triangle plein écran, textures de la grille échantillonnées en bicubique (Catmull-Rom,
 * 16 lectures) ; fumée : couleur × (0,35 + 0,65 × lumière reçue), alpha 1 − e^(−1,5 ρ) ; feu : la fumée, plus l'émission
 * de la table du corps noir selon la température (HDR, nourrit le bloom) ; encre : transmission T = e^(−σ), sortie
 * prémultipliée (T − min T, alpha 1 − min T) : exacte sur fond blanc (mélange soustractif). .oublierMilieu(milieu).
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

  const WGSL_PARTICULES = P.WGSL_COMMUN + P.WGSL_FRAGMENTS + P.WGSL_SON + /* wgsl */ `
struct Calque { largeur: f32, hauteur: f32, delta: f32, dureeImage: f32, k: u32, trie: u32, flou: u32, fondu: u32,
  tau: f32, r0: f32, r1: f32, r2: f32 };
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
@group(0) @binding(9) var<storage, read> E: array<f32>;

fn ef(i: u32) -> f32 { return E[i]; }
fn eu(i: u32) -> u32 { return bitcast<u32>(E[i]); }

fn versLineaire(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

struct Fragment { couleur: vec4f, opacite: f32, taille: f32 };

// Fragment à τ : couleur du pixel de l'ancre, de la cible, ou de l'un à l'autre le long du trajet (RVB linéaire, alpha
// du pixel) ; une particule en trop entre (côté ancre) ou sort (côté cible) en fondu ; taille de la naissance vers celle
// d'un pixel de la cible.
fn fragmentRendu(p: Particule) -> Fragment {
  let tau = C.tau;
  var s = 0.0;
  if (aFragment(F_CIBLE)) { s = progression(p.n, tau); }
  var ca = vec4f(1.0);
  var opacite = 1.0;
  if (aFragment(F_PIXELS)) {
    let a = pixelF(p.n, 0u);
    ca = vec4f(versLineaire(a.couleur.rgb), a.couleur.a);
    if ((a.drapeaux & 1u) != 0u) { opacite = s; }
  }
  var cb = ca;
  var taille = p.taille;
  if (aFragment(F_CIBLE)) {
    let b = pixelF(p.n, 1u);
    cb = vec4f(versLineaire(b.couleur.rgb), b.couleur.a);
    if (!aFragment(F_PIXELS)) { ca = cb; }
    if ((b.drapeaux & 2u) != 0u) { opacite = opacite * (1.0 - s); }
    let rb = repereElement(1u, tau);
    taille = mix(p.taille, ef(169u) * max(rb.echelle.x, rb.echelle.y), s);
  }
  return Fragment(mix(ca, cb, s), opacite, taille);
}

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
  @location(5) @interpolate(flat) idx: u32,
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
  // Fragments : couleur du pixel d'origine, fondu des particules en trop, taille vers celle des pixels de la cible.
  var fr = Fragment(vec4f(1.0), 1.0, p.taille);
  if (aFragment(F_PIXELS | F_CIBLE)) { fr = fragmentRendu(p); }
  // Son réactif (P7) : taille et éclat × coefficients à τ de l'image.
  let taille = fr.taille * table(256u, u) * f * coefSon(3u, C.tau);
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
  // Couleur « source » : le dégradé multiplié par mix(1, couleur du pixel, part de la source).
  let w = table(448u, u);
  let teinteVie = teinte(u);
  var couleur = vec4f(teinteVie.rgb * mix(vec3f(1.0), fr.couleur.rgb, w), teinteVie.a * mix(1.0, fr.couleur.a, w));
  // [module-couleur]
  o.pos = ecran(centre + q);
  o.uv = c;
  o.uvTex = uvTex;
  o.couleur = vec4f(couleur.rgb * table(320u, u) * coefSon(2u, C.tau), couleur.a * table(384u, u) * fondu(idx) * fr.opacite);
  o.alea = p.alea;
  o.echantillons = f32(echantillons);
  o.idx = idx;
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
  let demiLargeur = p.taille * table(256u, u) * f * 0.5 * k * coefSon(3u, C.tau);
  let cote = select(-1.0, 1.0, (vi & 1u) == 1u);
  o.pos = ecran(perspective(a, p.z) + normale * demiLargeur * cote);
  o.uv = vec2f(0.0, cote);
  o.uvTex = vec2f(f32(j) / f32(N), cote * 0.5 + 0.5);
  var couleur = teinte(u);
  // [module-couleur]
  o.couleur = vec4f(couleur.rgb * table(320u, u) * coefSon(2u, C.tau), couleur.a * table(384u, u) * k * fondu(idx));
  o.alea = p.alea;
  o.echantillons = 1.0;
  o.idx = idx;
  return o;
}

// Éclat : polygone de la photographie de l'ancre (éventail de triangles, 16 sommets au plus) autour de la particule,
// sommets à l'échelle de l'ancre à la naissance et selon la table de taille, tournés de l'angle de la particule ;
// coordonnées de texture d'origine (la photographie couvre la boîte opaque de l'ancre : centre E[184..185], demi E[164..165]).
@vertex
fn vsEclat(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Sortie {
  let idx = indice(ii);
  if (idx >= arrayLength(&particules)) { return cachee(); }
  let p = particules[idx];
  if (p.vivante == 0u) { return cachee(); }
  let b = eu(179u) + p.n * 36u;
  let k = u32(ef(b + 2u));
  let tri = vi / 3u;
  if (tri + 2u >= k) { return cachee(); }
  let coin = vi % 3u;
  var j = 0u;
  if (coin > 0u) { j = tri + coin; }
  let decal = vec2f(ef(b + 4u + 2u * j), ef(b + 5u + 2u * j));
  let centre = vec2f(ef(b), ef(b + 1u));
  let r0 = repereElement(0u, p.naissance);
  let u = p.age / p.vie;
  let w = p.pos + p.vel * C.delta + tournerF(p.rot + p.vrot * C.delta, decal * r0.echelle) * table(256u, u);
  var sortie: Sortie;
  sortie.pos = ecran(w);
  sortie.uv = vec2f(0.0);
  sortie.uvTex = (centre + decal - vec2f(ef(184u), ef(185u))) / max(2.0 * vec2f(ef(164u), ef(165u)), vec2f(1e-6)) + 0.5;
  var couleur = teinte(u);
  // [module-couleur]
  sortie.couleur = vec4f(couleur.rgb * table(320u, u) * coefSon(2u, C.tau), couleur.a * table(384u, u) * fondu(idx));
  sortie.alea = p.alea;
  sortie.echantillons = 1.0;
  sortie.idx = idx;
  return sortie;
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
    // Pixel (fragments) : carré plein, sans lissage : des grains voisins pavent exactement l'élément.
    case 7u: { return vec4f(1.0); }
    default: { }
  }
  return textureSample(image, lisse, e.uvTex);
}

// Mélanges (R.melange) : 0 additif, 1 alpha, 2 prémultiplié (émission qui n'occulte qu'à hauteur de
// son alpha : la couleur n'est pas multipliée par l'alpha).
@fragment
fn fsQuad(e: Sortie) -> @location(0) vec4f {
  var t = motif(e);
  // [module-forme]
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

// Nappe d'un émetteur « fluide » (P5a) : chaque particule en demi-sphère de rayon taille / 2 (table de taille), sans
// perspective ; hauteur (rvb, mélange max) et épaisseur 2 h × opacité de vie (alpha, mélange additif), en demi-résolution.
@vertex
fn vsSphere(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Sortie {
  let idx = ii;
  if (idx >= arrayLength(&particules)) { return cachee(); }
  let p = particules[idx];
  if (p.vivante == 0u) { return cachee(); }
  let u = p.age / p.vie;
  let rayon = 0.5 * p.taille * table(256u, u);
  var coins = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = coins[vi];
  var o: Sortie;
  o.pos = ecran(p.pos + p.vel * C.delta + c * rayon);
  o.uv = c;
  o.uvTex = vec2f(rayon, table(384u, u) * fondu(idx));
  o.couleur = vec4f(0.0);
  o.alea = p.alea;
  o.echantillons = 1.0;
  o.idx = idx;
  return o;
}

@fragment
fn fsSphere(e: Sortie) -> @location(0) vec4f {
  let r2 = dot(e.uv, e.uv);
  if (r2 >= 1.0) { discard; }
  let h = e.uvTex.x * sqrt(1.0 - r2);
  return vec4f(h, h, h, 2.0 * h * e.uvTex.y);
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
  if (F.tons == 1u) { rgb = tonsAces(rgb); } else if (F.tons == 2u) { rgb = clamp(rgb, vec3f(0.0), vec3f(1.0)); } else { rgb = tonsDouce(rgb); }
  let a = clamp(max(c.a, max(rgb.r, max(rgb.g, rgb.b))), 0.0, 1.0);
  var o = vec4f(0.0);
  if (a > 0.5 / 255.0) {
    let encode = versSRGB(min(rgb / a, vec3f(1.0))) + vec3f(tramage(pos.xy));
    o = vec4f(clamp(encode, vec3f(0.0), vec3f(1.0)) * a, a);
  }
  return Sorties(o, o);
}
`;

  // Nappe (P5a) : flou bilatéral séparable et ombrage plein écran.
  const WGSL_NAPPE = WGSL_FINAL_COMMUN + /* wgsl */ `
struct Flou { pas: vec2f, rayon: f32, sigmaH: f32 };
struct Nappe { teinte: vec4f, taille: vec2f, cqhTexel: f32, opacite: f32, absorption: f32, refraction: f32, avecPhoto: u32, r0: u32 };
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var lisse: sampler;
@group(0) @binding(2) var<uniform> B: Flou;
@group(0) @binding(3) var<uniform> N: Nappe;
@group(0) @binding(4) var photo: texture_2d<f32>;

// Flou bilatéral (une direction par passe) : hauteur (r) pondérée par la gaussienne et l'écart de hauteur (bords gardés) ;
// épaisseur (a) en flou gaussien simple. Lecture au texel près.
@fragment
fn fsFlou(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let taille = vec2i(textureDimensions(source));
  let c = vec2i(pos.xy);
  let centre = textureLoad(source, c, 0);
  let R = i32(B.rayon);
  let sigma = max(B.rayon * 0.5, 0.5);
  var h = 0.0;
  var wh = 0.0;
  var e = 0.0;
  var we = 0.0;
  for (var k = -R; k <= R; k++) {
    let q = clamp(c + vec2i(B.pas) * k, vec2i(0), taille - vec2i(1));
    let s = textureLoad(source, q, 0);
    let g = exp(-f32(k * k) / (2.0 * sigma * sigma));
    let dh = (s.r - centre.r) / max(B.sigmaH, 1e-4);
    let w = g * exp(-0.5 * dh * dh);
    h += s.r * w;
    wh += w;
    e += s.a * g;
    we += g;
  }
  let hl = h / max(wh, 1e-6);
  return vec4f(hl, hl, hl, e / max(we, 1e-6));
}

// Ombrage : normale de la hauteur lissée, couverture selon l'épaisseur (absorption), teinte, réfraction de la photographie
// de la scène (prémultipliée, linéaire), reflet spéculaire ; alpha prémultiplié.
@fragment
fn fsNappe(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / N.taille;
  let n0 = textureSampleLevel(source, lisse, uv, 0.0);
  let ep = n0.a;
  if (ep <= 1e-3) { return vec4f(0.0); }
  let t = 1.0 / vec2f(textureDimensions(source));
  let hx = textureSampleLevel(source, lisse, uv + vec2f(t.x, 0.0), 0.0).r - textureSampleLevel(source, lisse, uv - vec2f(t.x, 0.0), 0.0).r;
  let hy = textureSampleLevel(source, lisse, uv + vec2f(0.0, t.y), 0.0).r - textureSampleLevel(source, lisse, uv - vec2f(0.0, t.y), 0.0).r;
  let n = normalize(vec3f(-hx, -hy, 2.0 * N.cqhTexel));
  let bord = smoothstep(0.0, 0.15, ep);
  let a = clamp(N.opacite * (1.0 - exp(-N.absorption * ep)), 0.0, 1.0) * bord;
  var rgb = N.teinte.rgb * a;
  var alpha = a;
  if (N.avecPhoto == 1u) {
    let fond = textureSampleLevel(photo, lisse, clamp(uv + n.xy * N.refraction * 0.05, vec2f(0.0), vec2f(1.0)), 0.0);
    let k = N.refraction * bord * (1.0 - a);
    rgb += k * fond.rgb;
    alpha += k * fond.a;
  }
  let l = normalize(vec3f(-0.4, -0.6, 0.7));
  let hv = normalize(l + vec3f(0.0, 0.0, 1.0));
  let spec = pow(max(dot(n, hv), 0.0), 60.0) * 0.8 * bord;
  rgb += vec3f(spec);
  alpha = clamp(alpha + spec, 0.0, 1.0);
  return vec4f(rgb, alpha);
}
`;

  // Cordes et tissus (P5b) : maillage d'un tissu et ruban d'une corde, depuis le tampon commun des sommets.
  const WGSL_STRUCTURES_RENDU = P.WGSL_COMMUN + /* wgsl */ `
struct Tissu { largeur: f32, hauteur: f32, delta: f32, mode: u32, base: u32, colonnes: u32, lignes: u32, sens: u32,
  couleur: vec4f, lumiere: vec2f, epaisseur: f32, bandes: u32, mailles: u32, structure: u32, genre: u32, r1: u32 };
@group(0) @binding(0) var<storage, read> sommets: array<Particule>;
@group(0) @binding(1) var<storage, read> T: array<f32>;
@group(0) @binding(2) var<uniform> S: Tissu;
@group(0) @binding(3) var<storage, read> rompus: array<u32>;
@group(0) @binding(4) var<storage, read> infos: array<vec4f>;
@group(0) @binding(5) var image: texture_2d<f32>;
@group(0) @binding(6) var lisse: sampler;

const REVERS = 0.55;   // revers d'un tissu (face arrière) assombri
const RELIEF = 0.8;    // force de l'éclairage des plis

struct SortieS { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) ombre: f32, @location(2) travers: f32 };

fn ecranS(w: vec2f) -> vec4f { return vec4f(w.x / S.largeur * 2.0 - 1.0, 1.0 - w.y / S.hauteur * 2.0, 0.0, 1.0); }

fn cacheeS() -> SortieS {
  var o: SortieS;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  return o;
}

// Sommet (r, c) de la structure à l'instant de l'image (extrapolé de delta).
fn sommetS(r: u32, c: u32) -> vec2f {
  let p = sommets[S.base + r * S.colonnes + c];
  return p.pos + p.vel * S.delta;
}

fn rompu(v: u32, genre: u32) -> bool { return ((rompus[S.base + v] >> genre) & 1u) != 0u; }

// Pente hors du plan d'un axe du tissu (t : axe dans le plan rapporté à sa longueur de repos) : la longueur manquante d'un
// axe comprimé part hors du plan, du côté de sa courbure k ; axe étiré ou à sa longueur : à plat.
fn pente(t: vec2f, k: vec2f) -> f32 {
  let z = sqrt(max(1.0 - dot(t, t), 0.0));
  return select(-z, z, t.x * k.y - t.y * k.x >= 0.0);
}

// Éclairage d'un sommet : normale du tissu relevé (différences centrées sur les voisins), tournée vers l'œil ; lumière
// directionnelle ; tissu plat : 1 exactement.
fn ombreTissu(r: u32, c: u32) -> f32 {
  let L = infos[S.structure];
  let c0 = select(c - 1u, c, c == 0u);
  let c1 = min(c + 1u, S.colonnes - 1u);
  let r0 = select(r - 1u, r, r == 0u);
  let r1 = min(r + 1u, S.lignes - 1u);
  let p = sommetS(r, c);
  let tu = (sommetS(r, c1) - sommetS(r, c0)) / max(f32(c1 - c0) * L.x, 1e-6);
  let tv = (sommetS(r1, c) - sommetS(r0, c)) / max(f32(r1 - r0) * L.y, 1e-6);
  let ku = sommetS(r, c1) + sommetS(r, c0) - 2.0 * p;
  let kv = sommetS(r1, c) + sommetS(r0, c) - 2.0 * p;
  let x = cross(vec3f(tu, pente(tu, ku)), vec3f(tv, pente(tv, kv)));
  if (dot(x, x) < 1e-12) { return 1.0; }
  var n = normalize(x);
  if (n.z < 0.0) { n = -n; }
  let l = normalize(vec3f(S.lumiere, 1.0));
  return clamp(1.0 + RELIEF * (dot(n, l) - l.z), 0.3, 1.6);
}

// Tissu : 6 sommets par cellule (triangles A et B) ; triangle retiré si l'un de ses liens est rompu.
@vertex
fn vsTissu(@builtin(vertex_index) vi: u32) -> SortieS {
  let C = S.colonnes;
  let q = vi / 6u;
  let k = vi % 6u;
  let r = q / (C - 1u);
  let c = q % (C - 1u);
  let v = r * C + c;
  if (k < 3u) {
    if (rompu(v, 0u) || rompu(v + 1u, 1u) || rompu(v, 2u)) { return cacheeS(); }
  } else if (rompu(v, 1u) || rompu(v + C, 0u) || rompu(v, 2u)) { return cacheeS(); }
  var dr = array<u32, 6>(0u, 0u, 1u, 0u, 1u, 1u);
  var dc = array<u32, 6>(0u, 1u, 1u, 0u, 1u, 0u);
  let rr = r + dr[k];
  let cc = c + dc[k];
  var o: SortieS;
  o.pos = ecranS(sommetS(rr, cc));
  o.uv = vec2f(f32(cc) / f32(C - 1u), f32(rr) / f32(S.lignes - 1u));
  o.ombre = ombreTissu(rr, cc);
  o.travers = 0.0;
  return o;
}

// Corde : 6 sommets par segment (ruban de largeur « epaisseur ») ; segment rompu retiré ; tangente sur les voisins reliés.
@vertex
fn vsCorde(@builtin(vertex_index) vi: u32) -> SortieS {
  let C = S.colonnes;
  let seg = vi / 6u;
  let k = vi % 6u;
  if (rompu(seg, 0u)) { return cacheeS(); }
  var dj = array<u32, 6>(0u, 1u, 0u, 0u, 1u, 1u);
  var cote = array<f32, 6>(-1.0, -1.0, 1.0, 1.0, -1.0, 1.0);
  let j = seg + dj[k];
  var a = j;
  var b = j;
  if (j > 0u && !rompu(j - 1u, 0u)) { a = j - 1u; }
  if (j + 1u < C && !rompu(j, 0u)) { b = j + 1u; }
  let t = sommetS(0u, b) - sommetS(0u, a);
  let l = length(t);
  var n = vec2f(0.0, 1.0);
  if (l > 1e-6) { n = vec2f(-t.y, t.x) / l; }
  var o: SortieS;
  o.pos = ecranS(sommetS(0u, j) + n * (0.5 * S.epaisseur * cote[k]));
  o.uv = vec2f(f32(j) / f32(C - 1u), cote[k] * 0.5 + 0.5);
  o.ombre = 1.0;
  o.travers = cote[k];
  return o;
}

// Dégradé (64 RVBA linéaires) : interpolé, ou au plus proche en bandes.
fn teinteS(x: f32) -> vec4f {
  let u = clamp(x, 0.0, 1.0) * 63.0;
  var i = u32(floor(u));
  var j = min(i + 1u, 63u);
  var f = u - f32(i);
  if (S.bandes == 1u) {
    i = min(u32(floor(clamp(x, 0.0, 0.99999) * 64.0)), 63u);
    j = i;
    f = 0.0;
  }
  let a = vec4f(T[i * 4u], T[i * 4u + 1u], T[i * 4u + 2u], T[i * 4u + 3u]);
  let b = vec4f(T[j * 4u], T[j * 4u + 1u], T[j * 4u + 2u], T[j * 4u + 3u]);
  return mix(a, b, f);
}

// Couleur (mode 0), dégradé (1) ou image prémultipliée (2), multipliée par « couleur » ; éclairage, revers, mailles (tissu),
// ombrage de cylindre (corde) ; alpha prémultiplié.
@fragment
fn fsStructure(e: SortieS, @builtin(front_facing) face: bool) -> @location(0) vec4f {
  var rgb = vec3f(1.0);
  var a = 1.0;
  if (S.mode == 1u) {
    let t = teinteS(select(e.uv.x, e.uv.y, S.sens == 1u));
    rgb = t.rgb;
    a = t.a;
  } else if (S.mode == 2u) {
    let t = textureSample(image, lisse, e.uv);
    a = t.a;
    rgb = select(vec3f(0.0), t.rgb / max(t.a, 1e-4), t.a > 1e-4);
  }
  var ombre = e.ombre;
  if (S.genre == 1u) {
    if (!face) { ombre = ombre * REVERS; }
    if (S.mailles == 1u) {
      let g = fract(e.uv * vec2f(f32(S.colonnes - 1u), f32(S.lignes - 1u)) + 0.5) - 0.5;
      a = a * (1.0 - smoothstep(0.06, 0.12, min(abs(g.x), abs(g.y))));
    }
  } else {
    ombre = ombre * (0.7 + 0.3 * sqrt(max(1.0 - e.travers * e.travers, 0.0)));
  }
  let k = a * S.couleur.a;
  return vec4f(rgb * S.couleur.rgb * ombre * k, k);
}
`;
  const MODES_STRUCTURE = { couleur: 0, degrade: 1, image: 2, source: 2 };

  const MELANGES = {
    additif: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } },
    alpha: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } },
  };

  // Milieu fluide (P5c) : plein écran ; textures de la grille échantillonnées en bicubique.
  const WGSL_MILIEU_RENDU = /* wgsl */ `
struct RenduMilieu {
  scene: vec2f, origine: vec2f,
  cote: f32, genre: u32, opacite: f32, r0: f32,
  n: vec2u, ecran: vec2f,
  couleur: vec4f,
  feu: array<vec4f, 64>,
};
@group(0) @binding(0) var texA: texture_2d<f32>;
@group(0) @binding(1) var texB: texture_2d<f32>;
@group(0) @binding(2) var<uniform> RM: RenduMilieu;

const AMBIANT = 0.35;        // lumière reçue par la fumée à l'ombre d'elle-même
const OPACITE_FUMEE = 1.5;   // opacité par unité de densité de fumée
const ENCRE = 1.0;           // absorption par unité d'encre transportée

@vertex
fn vsMilieu(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

// Poids de Catmull-Rom des quatre échantillons qui entourent la fraction f.
fn poidsCR(f: f32) -> vec4f {
  let f2 = f * f;
  let f3 = f2 * f;
  return vec4f(-0.5 * f3 + f2 - 0.5 * f, 1.5 * f3 - 2.5 * f2 + 1.0, -1.5 * f3 + 2.0 * f2 + 0.5 * f, 0.5 * f3 - 0.5 * f2);
}

// Échantillonnage bicubique (16 lectures, indices bornés à la grille) au point q (centres des cellules aux entiers).
fn bicubique(t: texture_2d<f32>, q: vec2f) -> vec4f {
  let b = floor(q);
  let f = q - b;
  let wx = poidsCR(f.x);
  let wy = poidsCR(f.y);
  let nmax = vec2i(RM.n) - 1;
  var s = vec4f(0.0);
  for (var j = 0; j < 4; j++) {
    var ligne = vec4f(0.0);
    for (var i = 0; i < 4; i++) {
      ligne += textureLoad(t, clamp(vec2i(b) + vec2i(i - 1, j - 1), vec2i(0), nmax), 0) * wx[i];
    }
    s += ligne * wy[j];
  }
  return s;
}

// Émission du feu à la température T (table du corps noir, 64 valeurs, T bornée à [0, 1]).
fn emission(T: f32) -> vec3f {
  let x = clamp(T, 0.0, 1.0) * 63.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 63u);
  return mix(RM.feu[i].rgb, RM.feu[j].rgb, x - f32(i));
}

@fragment
fn fsMilieu(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let w = pos.xy / RM.ecran * RM.scene;
  let q = (w - RM.origine) / RM.cote - 0.5;
  let nf = vec2f(RM.n);
  if (q.x < -0.5 || q.y < -0.5 || q.x > nf.x - 0.5 || q.y > nf.y - 0.5) { discard; }
  if (RM.genre == 2u) {
    // Encre : transmission par canal ; exacte sur fond blanc (alpha 1 − min T, couleur T − min T).
    let T = exp(-max(bicubique(texB, q).xyz, vec3f(0.0)) * ENCRE);
    let tmin = min(T.x, min(T.y, T.z));
    return vec4f((T - vec3f(tmin)) * RM.opacite, (1.0 - tmin) * RM.opacite);
  }
  let a = bicubique(texA, q);
  let alpha = (1.0 - exp(-OPACITE_FUMEE * max(a.x, 0.0))) * RM.opacite;
  var c = RM.couleur.rgb * (AMBIANT + (1.0 - AMBIANT) * clamp(a.z, 0.0, 1.0)) * alpha;
  if (RM.genre == 1u) { c += emission(a.y); }
  return vec4f(c, alpha);
}
`;

  // Nappe : hauteur au maximum (couleur), épaisseur additionnée (alpha).
  const MELANGE_NAPPE = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
  const FLOU_MAX = 32;
  function detruireNappe(r) {
    [r.a, r.b].forEach((t) => t.destroy());
    [r.uniforme, r.flouH, r.flouV].forEach((b) => b.destroy());
  }

  function puissanceDeDeux(n) { let p = 64; while (p < n) p *= 2; return p; }
  const SOMMETS_ECLAT = 16;
  // Pipelines de dessin des particules : entrées et topologie par genre.
  const GENRES = {
    quad: { sommets: 'vsQuad', fragment: 'fsQuad', topologie: 'triangle-list' },
    trainee: { sommets: 'vsTrainee', fragment: 'fsTrainee', topologie: 'triangle-strip' },
    eclat: { sommets: 'vsEclat', fragment: 'fsQuad', topologie: 'triangle-list' },
  };

  function detruireCible(c) {
    c.detruite = true;
    [c.hdr, c.sortie, ...c.niveaux.map((n) => n.texture), c.uniformeFinal, ...c.bas.map((b) => b.uniforme), ...c.haut.map((b) => b.uniforme)].forEach((t) => t.destroy());
  }

  const MARQUE_COULEUR = '// [module-couleur]';
  const MARQUE_FORME = '// [module-forme]';

  /** Rendu des particules avec les modules de couleur et de forme d'un émetteur (P6) : appels aux marques, prélude, modules. */
  function codeParticules(couleur, forme) {
    let code = WGSL_PARTICULES;
    if (couleur) code = code.split(MARQUE_COULEUR).join('couleur = ' + couleur.appel + '(p, u, couleur);');
    if (forme) code = code.split(MARQUE_FORME).join('t = vec4f(' + forme.appel + '(e.uv, particules[e.idx]));');
    if (couleur || forme) code += P.WGSL_BRUIT + M.codeShader.OUTILS + (couleur ? couleur.wgsl : '') + (forme ? forme.wgsl : '');
    return code;
  }
  P.codeParticules = codeParticules;

  function messageModule(mod, erreurs) {
    return erreurs.length ? M.codeShader.messageErreur(mod.nom, mod.fichier || 'shaders/' + mod.nom + '.wgsl', erreurs) : null;
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
          { binding: 0, visibility: V | Fr, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: V, buffer: { type: 'uniform' } },
          { binding: 3, visibility: V | Fr, buffer: { type: 'uniform' } },
          { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 5, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 6, visibility: Fr, texture: { sampleType: 'float' } },
          { binding: 7, visibility: Fr, sampler: { type: 'filtering' } },
          { binding: 8, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 9, visibility: V, buffer: { type: 'read-only-storage' } },
        ],
      });
      this.layoutParticules = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      const moduleParticules = device.createShaderModule({ label: 'pm-particules', code: WGSL_PARTICULES });
      this.pipelines = this.creerPipelines(moduleParticules);
      this.variantes = new Map();

      // Rendu « fluide » (P5a) : sphères de la nappe, flou bilatéral, ombrage.
      this.pipelineSphere = device.createRenderPipeline({
        layout: this.layoutParticules,
        vertex: { module: moduleParticules, entryPoint: 'vsSphere' },
        fragment: { module: moduleParticules, entryPoint: 'fsSphere', targets: [{ format: 'rgba16float', blend: MELANGE_NAPPE }] },
        primitive: { topology: 'triangle-list' },
      });
      const moduleNappe = device.createShaderModule({ label: 'pm-nappe', code: WGSL_NAPPE });
      this.pipelineFlou = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: moduleNappe, entryPoint: 'vsPlein' },
        fragment: { module: moduleNappe, entryPoint: 'fsFlou', targets: [{ format: 'rgba16float' }] },
      });
      this.pipelineNappe = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: moduleNappe, entryPoint: 'vsPlein' },
        fragment: { module: moduleNappe, entryPoint: 'fsNappe', targets: [{ format: 'rgba16float', blend: MELANGES.alpha }] },
      });
      this.fluides = new WeakMap();
      this.photos = new Map();

      // Cordes et tissus (P5b) : maillage et ruban, depuis les tampons des structures ; endroit du tissu dans le sens horaire.
      this.layoutStructure = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: Fr, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: V | Fr, buffer: { type: 'uniform' } },
          { binding: 3, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
          { binding: 5, visibility: Fr, texture: { sampleType: 'float' } },
          { binding: 6, visibility: Fr, sampler: { type: 'filtering' } },
        ],
      });
      const moduleStructures = device.createShaderModule({ label: 'pm-structures-rendu', code: WGSL_STRUCTURES_RENDU });
      const layoutStructures = device.createPipelineLayout({ bindGroupLayouts: [this.layoutStructure] });
      const pipelineStructure = (sommets, frontFace) => device.createRenderPipeline({
        layout: layoutStructures,
        vertex: { module: moduleStructures, entryPoint: sommets },
        fragment: { module: moduleStructures, entryPoint: 'fsStructure', targets: [{ format: 'rgba16float', blend: MELANGES.alpha }] },
        primitive: { topology: 'triangle-list', frontFace, cullMode: 'none' },
      });
      this.pipelineTissu = pipelineStructure('vsTissu', 'cw');
      this.pipelineCorde = pipelineStructure('vsCorde', 'cw');
      this.structuresRendu = new WeakMap();

      // Milieu fluide (P5c) : plein écran, textures de la grille (non filtrables : lectures directes).
      this.layoutMilieu = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: Fr, texture: { sampleType: 'unfilterable-float' } },
          { binding: 1, visibility: Fr, texture: { sampleType: 'unfilterable-float' } },
          { binding: 2, visibility: Fr, buffer: { type: 'uniform' } },
        ],
      });
      const moduleMilieu = device.createShaderModule({ label: 'pm-milieu-rendu', code: WGSL_MILIEU_RENDU });
      this.pipelineMilieu = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.layoutMilieu] }),
        vertex: { module: moduleMilieu, entryPoint: 'vsMilieu' },
        fragment: { module: moduleMilieu, entryPoint: 'fsMilieu', targets: [{ format: 'rgba16float', blend: MELANGES.alpha }] },
      });
      this.milieux = new WeakMap();

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
      this.vueBlanc = this.blanc.createView();
      this.images = new Map();
      this.groupes = new WeakMap();
      this.tris = new WeakMap();
      this.styles = new WeakMap();
    }

    /** Pipelines des genres × mélanges pour un module WGSL compilé. */
    creerPipelines(module) {
      const p = {};
      Object.keys(GENRES).forEach((genre) => Object.keys(MELANGES).forEach((melange) => {
        const g = GENRES[genre];
        p[genre + '-' + melange] = this.device.createRenderPipeline({
          layout: this.layoutParticules,
          vertex: { module, entryPoint: g.sommets },
          fragment: { module, entryPoint: g.fragment, targets: [{ format: 'rgba16float', blend: MELANGES[melange] }] },
          primitive: { topology: g.topologie },
        });
      }));
      return p;
    }

    /** Pipelines d'un émetteur : ceux des particules, ou la variante de ses modules de couleur et de forme (cache par empreintes). */
    pipelinesDe(e) {
      const m = e.em.modulesWGSL;
      const couleur = m ? m.couleur : null;
      const forme = m ? m.forme : null;
      if (!couleur && !forme) return this.pipelines;
      const cle = (couleur ? couleur.empreinte : '-') + '|' + (forme ? forme.empreinte : '-');
      let v = this.variantes.get(cle);
      if (!v) {
        v = this.creerPipelines(this.device.createShaderModule({ label: 'pm-particules-modules', code: codeParticules(couleur, forme) }));
        this.variantes.set(cle, v);
      }
      return v;
    }

    /** Erreurs d'un module de couleur ou de forme, compilé seul avec le rendu, situées dans son fichier. */
    async situerRendu(mod) {
      const code = mod.usage === 'module-couleur' ? codeParticules(mod, null) : codeParticules(null, mod);
      const module = this.device.createShaderModule({ label: 'pm-verification-' + mod.nom, code });
      const info = await module.getCompilationInfo();
      const debut = (code.slice(0, code.lastIndexOf(mod.wgsl)).match(/\n/g) || []).length;
      return M.codeShader.situerModule(info.messages, mod, debut);
    }

    /** Modules WGSL des effets (force, couleur, forme) compilés une fois chacun -> Map(effet -> message) des échecs. */
    async verifierModules(effets) {
      const echecs = new Map();
      const vus = new Map();
      const verifier = async (mod) => {
        const cle = mod.usage + '|' + mod.empreinte;
        if (!vus.has(cle)) vus.set(cle, messageModule(mod, mod.usage === 'module-force' ? await P.verifierForce(this.device, mod) : await this.situerRendu(mod)));
        return vus.get(cle);
      };
      for (const effet of effets) {
        for (const em of effet.emetteurs) {
          const m = em.modulesWGSL;
          if (!m) continue;
          for (const mod of [m.force, m.couleur, m.forme]) {
            if (!mod || echecs.has(effet)) continue;
            const msg = await verifier(mod);
            if (msg) echecs.set(effet, msg);
          }
        }
      }
      return echecs;
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
          bitmap.close();
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

    /** Mélange alpha : tri par z ; sauf un émetteur de fragments à z constant (l'ordre trié est alors celui des cases) et un
     *  émetteur « fluide » (nappe : hauteur au maximum, épaisseur additionnée, sans ordre) et une corde ou un tissu (surface d'un seul tenant). */
    estTrie(e) { return !e.structure && !e.em.fluide && e.em.rendu.melange !== 'additif' && !(e.em.fragment && e.em.z[0] === e.em.z[1]); }

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

    /** Uniforme et groupe de liaisons du dessin d'un milieu (P5c), créés une fois. */
    milieuRendu(milieu) {
      let r = this.milieux.get(milieu);
      if (!r) {
        const uniforme = this.device.createBuffer({ size: 1088, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        r = {
          uniforme,
          groupe: this.device.createBindGroup({
            layout: this.layoutMilieu,
            entries: [
              { binding: 0, resource: milieu.vueA },
              { binding: 1, resource: milieu.vueB },
              { binding: 2, resource: { buffer: uniforme } },
            ],
          }),
        };
        this.milieux.set(milieu, r);
      }
      return r;
    }

    /** Uniforme « RenduMilieu » pour l'image : scène (cqh), grille, genre, opacité, couleur, table du feu. */
    ecrireMilieu(milieu, cible, o) {
      const r = this.milieuRendu(milieu);
      const rd = milieu.effet.milieu.rendu;
      const g = milieu.grille;
      const v = new ArrayBuffer(1088);
      const f = new Float32Array(v);
      const u = new Uint32Array(v);
      f[0] = o.largeurCqh; f[1] = 100; f[2] = g.origine[0]; f[3] = g.origine[1];
      f[4] = g.cote; u[5] = rd.code; f[6] = rd.opacite;
      u[8] = g.nx; u[9] = g.ny; f[10] = cible.largeur; f[11] = cible.hauteur;
      f.set(rd.couleur, 12);
      f.set(rd.feu, 16);
      this.device.queue.writeBuffer(r.uniforme, 0, v);
      return r;
    }

    /** Libère l'uniforme du dessin d'un milieu détruit. */
    oublierMilieu(milieu) {
      const r = this.milieux.get(milieu);
      if (!r) return;
      r.uniforme.destroy();
      this.milieux.delete(milieu);
    }

    /** Libère les tampons de rendu des émetteurs d'une simulation détruite. */
    oublier(sim) {
      const couches = sim.hauteursBase && this.couches.get(sim.hauteursBase);
      if (couches) { couches.forEach((c) => c.uniforme.destroy()); this.couches.delete(sim.hauteursBase); }
      sim.emetteurs.forEach((e) => {
        const sr = this.structuresRendu.get(e);
        if (sr) { sr.uniforme.destroy(); this.structuresRendu.delete(e); }
        const t = this.tris.get(e);
        if (t) t.ordre.destroy();
        const s = this.styles.get(e);
        if (s) s.destroy();
        const fl = this.fluides.get(e);
        if (fl) { fl.forEach(detruireNappe); this.fluides.delete(e); }
        this.tris.delete(e);
        this.styles.delete(e);
        this.groupes.delete(e);
      });
    }

    /** Tampons propres à un émetteur, créés d'avance (dans la portée d'erreur mémoire de l'effet). */
    preparerEmetteur(e) {
      // Corde ou tissu : uniforme et liaisons créés au premier dessin (tampons des structures).
      if (e.structure) return;
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
        // Éclats : la photographie de l'ancre (plan 2) ; sinon l'image de assets/ de la recette.
        const image = e.photo ? e.photo.vue : e.em.rendu.textureImage && this.images.get(e.em.rendu.textureImage);
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
            { binding: 9, resource: { buffer: e.params } },
          ],
        });
        this.groupes.set(e, g);
      }
      return g;
    }

    /** Uniforme « Calque » d'un émetteur pour l'image : scène (cqh), extrapolation, k, tri, flou, fondu, τ. */
    ecrireCalque(sim, e, delta, o) {
      const r = e.em.rendu;
      const v = new ArrayBuffer(48);
      const f = new Float32Array(v);
      const u = new Uint32Array(v);
      f[0] = o.largeurCqh; f[1] = 100; f[2] = delta; f[3] = o.dureeImage;
      u[4] = sim.k || 0; u[5] = this.estTrie(e) ? 1 : 0; u[6] = r.flou ? 1 : 0; u[7] = e.contacts ? 1 : 0;
      f[8] = sim.tau || 0;
      this.device.queue.writeBuffer(e.uniformeRendu, 0, v);
    }

    /** Uniforme « Tissu » et groupe de liaisons d'un émetteur de structure, créés une fois. */
    structureRendu(sim, e) {
      let s = this.structuresRendu.get(e);
      if (!s) {
        const st = sim.structures;
        const ap = e.em.structure.apparence;
        const image = ap.mode === 'source' ? e.photo && e.photo.vue : ap.mode === 'image' ? this.images.get(e.em.rendu.textureImage) : null;
        const uniforme = this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        s = {
          uniforme,
          groupe: this.device.createBindGroup({
            layout: this.layoutStructure,
            entries: [
              { binding: 0, resource: { buffer: st.sommets } },
              { binding: 1, resource: { buffer: e.tables } },
              { binding: 2, resource: { buffer: uniforme } },
              { binding: 3, resource: { buffer: st.rompus } },
              { binding: 4, resource: { buffer: st.infos } },
              { binding: 5, resource: image || this.vueBlanc },
              { binding: 6, resource: this.lisse },
            ],
          }),
        };
        this.structuresRendu.set(e, s);
      }
      return s;
    }

    /** Uniforme « Tissu » d'un émetteur de structure pour l'image : scène (cqh), extrapolation, apparence, sommets. */
    ecrireStructure(sim, e, delta, o) {
      const s = this.structureRendu(sim, e);
      const st = e.em.structure;
      const ap = st.apparence;
      const i = e.infoStructure;
      const v = new ArrayBuffer(80);
      const f = new Float32Array(v);
      const u = new Uint32Array(v);
      f[0] = o.largeurCqh; f[1] = 100; f[2] = delta; u[3] = MODES_STRUCTURE[ap.mode];
      u[4] = i.base; u[5] = i.colonnes; u[6] = i.lignes; u[7] = ap.sens === 'vertical' ? 1 : 0;
      f.set(ap.couleur, 8);
      f[12] = ap.lumiere[0]; f[13] = ap.lumiere[1]; f[14] = st.epaisseur; u[15] = ap.bandes ? 1 : 0;
      u[16] = ap.mailles ? 1 : 0; u[17] = i.s; u[18] = st.code;
      this.device.queue.writeBuffer(s.uniforme, 0, v);
    }

    /** Textures de la nappe d'un émetteur « fluide » dans une cible (demi-résolution, A et B pour le flou), uniformes, groupes
     *  du flou ; créées une fois par cible ; celles des cibles détruites (canvas redimensionné, scène masquée) libérées. */
    nappe(e, cible) {
      let parCible = this.fluides.get(e);
      if (!parCible) { parCible = new Map(); this.fluides.set(e, parCible); }
      parCible.forEach((r, c) => { if (c.detruite) { detruireNappe(r); parCible.delete(c); } });
      let r = parCible.get(cible);
      if (r) return r;
      const { device } = this;
      const T = GPUTextureUsage;
      const U = GPUBufferUsage;
      const largeur = Math.max(1, Math.ceil(cible.largeur / 2));
      const hauteur = Math.max(1, Math.ceil(cible.hauteur / 2));
      const texture = () => device.createTexture({ size: [largeur, hauteur], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
      const uniforme = (octets) => device.createBuffer({ size: octets, usage: U.UNIFORM | U.COPY_DST });
      r = { a: texture(), b: texture(), largeur, hauteur, uniforme: uniforme(48), flouH: uniforme(16), flouV: uniforme(16), photo: undefined, groupe: null };
      r.vueA = r.a.createView();
      r.vueB = r.b.createView();
      const flou = (vue, u) => device.createBindGroup({
        layout: this.pipelineFlou.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: vue }, { binding: 2, resource: { buffer: u } }],
      });
      r.groupeH = flou(r.vueA, r.flouH);
      r.groupeV = flou(r.vueB, r.flouV);
      parCible.set(cible, r);
      return r;
    }

    /** Sphères de la nappe dans A, flou horizontal A -> B, vertical B -> A (rayon : « lissage » cqh en texels de
     *  demi-résolution, FLOU_MAX au plus ; écart de hauteur toléré : un quart de la taille moyenne des particules). */
    preparerNappe(enc, cible, e) {
      const r = this.nappe(e, cible);
      const fl = e.em.fluide;
      const rayon = Math.min(FLOU_MAX, Math.round(fl.lissage * r.hauteur / 100));
      const sigmaH = Math.max(0.05, 0.125 * (e.em.taille[0] + e.em.taille[1]));
      this.device.queue.writeBuffer(r.flouH, 0, new Float32Array([1, 0, rayon, sigmaH]));
      this.device.queue.writeBuffer(r.flouV, 0, new Float32Array([0, 1, rayon, sigmaH]));
      const spheres = enc.beginRenderPass({ colorAttachments: [{ view: r.vueA, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      spheres.setPipeline(this.pipelineSphere);
      spheres.setBindGroup(0, this.groupe(e));
      spheres.draw(6, e.capacite);
      spheres.end();
      [[r.vueB, r.groupeH], [r.vueA, r.groupeV]].forEach(([vue, groupe]) => {
        const p = enc.beginRenderPass({ colorAttachments: [{ view: vue, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
        p.setPipeline(this.pipelineFlou);
        p.setBindGroup(0, groupe);
        p.draw(3);
        p.end();
      });
    }

    /** Uniforme et groupe de l'ombrage d'une nappe ; photo : photographie de la scène (GPUTextureView) ou null (réfraction
     *  ignorée). Groupe recréé quand la photographie change. */
    groupeNappe(e, cible, photo) {
      const r = this.nappe(e, cible);
      const fl = e.em.fluide;
      const v = new ArrayBuffer(48);
      const f = new Float32Array(v);
      const u = new Uint32Array(v);
      f.set(fl.teinte, 0);
      f[4] = cible.largeur; f[5] = cible.hauteur; f[6] = 100 / r.hauteur; f[7] = fl.opacite;
      f[8] = fl.absorption; f[9] = fl.refraction; u[10] = photo && fl.refraction > 0 ? 1 : 0;
      this.device.queue.writeBuffer(r.uniforme, 0, v);
      if (!r.groupe || r.photo !== photo) {
        r.photo = photo;
        r.groupe = this.device.createBindGroup({
          layout: this.pipelineNappe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: r.vueA },
            { binding: 1, resource: this.lisse },
            { binding: 3, resource: { buffer: r.uniforme } },
            { binding: 4, resource: photo || this.vueBlanc },
          ],
        });
      }
      return r.groupe;
    }

    /** Photographie d'une scène (réfraction des fluides) en texture sRGB prémultipliée, lue en linéaire ; gardée par clé et
     *  réutilisée (même vue) tant que sa taille ne change pas. -> GPUTextureView */
    photo(cle, bitmap) {
      const { device } = this;
      let p = this.photos.get(cle);
      if (!p || p.largeur !== bitmap.width || p.hauteur !== bitmap.height) {
        if (p) p.texture.destroy();
        const texture = device.createTexture({
          size: [bitmap.width, bitmap.height],
          format: 'rgba8unorm-srgb',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        p = { texture, vue: texture.createView(), largeur: bitmap.width, hauteur: bitmap.height };
        this.photos.set(cle, p);
      }
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: p.texture, premultipliedAlpha: true }, [bitmap.width, bitmap.height]);
      return p.vue;
    }

    oublierPhoto(cle) {
      const p = this.photos.get(cle);
      if (!p) return;
      p.texture.destroy();
      this.photos.delete(cle);
    }

    dessiner(cible, liste, o) {
      const { device } = this;
      const enc = device.createCommandEncoder();
      const couches = o.couches || [];
      const fonds = o.fonds || [];
      cible.vide = liste.length === 0 && couches.length === 0 && fonds.length === 0 && !o.milieu;
      // Uniforme « Calque » de chaque émetteur, une fois par image (lu par les sphères des nappes et par le dessin).
      liste.forEach(({ sim, i, delta }) => {
        const e = sim.emetteurs[i];
        if (e.structure) this.ecrireStructure(sim, e, delta, o);
        else this.ecrireCalque(sim, e, delta, o);
      });

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

      // 1 bis. Nappes des émetteurs « fluide » (P5a) : sphères en demi-résolution, flou bilatéral.
      liste.forEach(({ sim, i }) => { if (sim.emetteurs[i].em.fluide) this.preparerNappe(enc, cible, sim.emetteurs[i]); });

      // 2. Particules dans la cible HDR.
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: cible.vueHdr, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      // Fonds et auras par shader (P6) : sous les couches héritées et les particules du calque.
      fonds.forEach((dessinerFond) => dessinerFond(rp));
      // Milieu fluide (P5c) : sous les couches héritées et les particules du calque.
      if (o.milieu) {
        const m = this.ecrireMilieu(o.milieu, cible, o);
        rp.setPipeline(this.pipelineMilieu);
        rp.setBindGroup(0, m.groupe);
        rp.draw(3);
      }
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
      liste.forEach(({ sim, i }) => {
        const e = sim.emetteurs[i];
        const r = e.em.rendu;
        if (e.structure) {
          // Corde ou tissu (P5b) : maillage (6 sommets par cellule) ou ruban (6 par segment).
          const inf = e.infoStructure;
          rp.setPipeline(inf.type === 'tissu' ? this.pipelineTissu : this.pipelineCorde);
          rp.setBindGroup(0, this.structureRendu(sim, e).groupe);
          rp.draw(inf.type === 'tissu' ? 6 * (inf.colonnes - 1) * (inf.lignes - 1) : 6 * (inf.colonnes - 1));
          return;
        }
        if (e.em.fluide) {
          // Nappe : ombrage plein écran (teinte, absorption, réfraction de la photographie de la scène, reflet).
          rp.setPipeline(this.pipelineNappe);
          rp.setBindGroup(0, this.groupeNappe(e, cible, o.photoScene || null));
          rp.draw(3);
          return;
        }
        const genre = r.type === 'trainee' ? 'trainee' : r.type === 'eclats' ? 'eclat' : 'quad';
        rp.setPipeline(this.pipelinesDe(e)[genre + '-' + (r.melange === 'additif' ? 'additif' : 'alpha')]);
        rp.setBindGroup(0, this.groupe(e));
        if (genre === 'trainee') rp.draw(2 * (r.longueur + 1), e.capacite);
        else if (genre === 'eclat') rp.draw(3 * (SOMMETS_ECLAT - 2), e.capacite);
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
      new Uint32Array(fu)[1] = ({ aces: 1, neutre: 2 })[o.tons] || 0;
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
