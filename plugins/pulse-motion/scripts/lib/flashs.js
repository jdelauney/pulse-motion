'use strict';
/* Pulse Motion – flashs (WCAG 2.3.1) menés depuis Node, sur des captures réduites de la page de contrôle (spec Rapidité
 * 5.10). Même algorithme que moteur/pixels.js (mesurerFlashs), réécrit ici : passe rapide à instants irréguliers
 * (graine fixe 20261012, un clignotement régulier ne tombe pas toujours sur la même phase), passages où la lumière
 * change fusionnés, puis examinés à la cadence de la vidéo ; plus de flashMax flashs dans une seconde sur au moins
 * flashAire de l'image (grille de flashCases × flashCases cases), et le premier trouvé seulement.
 * Idées de video-director (frame_stats, image d'analyse réduite) et de reanimate (clip.scale), réécrites.
 *
 * Fonctions pures : instantsFlashs, casesImage, change, fusionnerPassages, chercherFlash, vignetteGrise, statsGris,
 * partChangee, analyserImages (images figées et vides, spec S2, 5.10).
 * mesurerFlashs({ duree, ips, seuils, relever(t) -> Promise<cases | { cases, gris }> | releverTous([t]) -> Promise<[…]>,
 *   sceneA(t) -> id | null, plages?, images? }) -> Promise<constats> ; releverTous peut répartir les instants sur plusieurs pages
 *   (l'ordre est gardé). plages : [[debut, fin]] ; seuls les instants de la passe rapide qui y tombent sont relevés (contrôle
 *   partiel). images : contexte d'analyserImages ; les relevés de la passe rapide portent alors leur vignette en gris.
 */

const DEFAUTS = { flashIps: 12, flashVariation: 0.1, flashSombre: 0.8, flashAire: 0.25, flashMax: 3, flashCases: 4, largeurFlash: 64 };
const GRAINE = 20261012;

function lineaire(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function luminance(r, g, b) { return 0.2126 * lineaire(r) + 0.7152 * lineaire(g) + 0.0722 * lineaire(b); }
const arrondi = (x) => Math.round(x * 10) / 10;

function seuilsFlashs(seuils) {
  const S = {};
  for (const k of Object.keys(DEFAUTS)) S[k] = seuils && typeof seuils[k] === 'number' ? seuils[k] : DEFAUTS[k];
  return S;
}

/** Instants de la passe rapide (mêmes que dans la page). */
function instantsFlashs(duree, flashIps) {
  let graine = GRAINE;
  const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const instants = [];
  for (let k = 0; k < duree * flashIps; k++) instants.push(Math.min(duree, (k + 0.5 + 0.8 * (alea() - 0.5)) / flashIps));
  return instants;
}

/** Luminance moyenne de chaque case d'une grille n×n ; pixel(x, y) -> [r, g, b, a]. */
function casesImage(pixel, l, h, n) {
  const sommes = new Array(n * n).fill(0);
  const nombres = new Array(n * n).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const p = pixel(x, y);
      const c = Math.min(n - 1, Math.floor(y * n / h)) * n + Math.min(n - 1, Math.floor(x * n / l));
      sommes[c] += luminance(p[0], p[1], p[2]);
      nombres[c]++;
    }
  }
  return sommes.map((s, i) => s / nombres[i]);
}

/** La lumière change entre deux relevés (une case au moins, dont l'un est assez sombre). */
function change(a, b, S) {
  return b.some((v, c) => Math.abs(v - a[c]) >= S.flashVariation && Math.min(v, a[c]) < S.flashSombre);
}

function fusionnerPassages(passages) {
  const tries = passages.map((p) => p.slice()).sort((a, b) => a[0] - b[0]);
  const fusion = [];
  for (const p of tries) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && p[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], p[1]); else fusion.push(p);
  }
  return fusion;
}

/** Série de relevés image par image -> { debut, maxFlashs } (indice du premier changement de la seconde fautive) | null. */
function chercherFlash(series, { n, ips, S }) {
  const changements = [];
  for (let k = 1; k < series.length; k++) {
    changements.push(series[k].map((v, c) => {
      const a = series[k - 1][c];
      return Math.abs(v - a) >= S.flashVariation && Math.min(v, a) < S.flashSombre ? (v > a ? 1 : -1) : 0;
    }));
  }
  for (let debut = 0; debut < changements.length; debut++) {
    const fin = Math.min(changements.length, debut + ips);
    let touchees = 0;
    let maxFlashs = 0;
    for (let c = 0; c < n * n; c++) {
      let signe = 0;
      let alternances = 0;
      for (let k = debut; k < fin; k++) {
        const d = changements[k][c];
        if (d && d !== signe) { alternances++; signe = d; }
      }
      const flashs = alternances / 2;
      if (flashs > S.flashMax) { touchees++; maxFlashs = Math.max(maxFlashs, flashs); }
    }
    if (touchees / (n * n) >= S.flashAire) return { debut, maxFlashs };
  }
  return null;
}

const dans = (t, plages) => !plages || plages.some(([a, b]) => t >= a - 1e-9 && t <= b + 1e-9);

/** Vignette en gris (luma 601, 0 à 255) d'une image ; pixel(x, y) -> [r, g, b, a]. */
function vignetteGrise(pixel, l, h) {
  const g = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) { const p = pixel(x, y); g[y * l + x] = Math.round(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]); }
  return g;
}

/** Moyenne et écart-type (niveaux de 0 à 255) d'une vignette en gris. */
function statsGris(g) {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < g.length; i++) { s += g[i]; s2 += g[i] * g[i]; }
  const m = s / Math.max(1, g.length);
  return { moyenne: m, ecart: Math.sqrt(Math.max(0, s2 / Math.max(1, g.length) - m * m)) };
}

/** Part des pixels qui changent de plus de niveau entre deux vignettes de même taille. */
function partChangee(a, b, niveau) {
  if (!a || !b || a.length !== b.length) return 1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > niveau) n++;
  return n / a.length;
}

const DEFAUTS_IMAGES = { tempsMort: 2.5, pauseFinale: 0.5, figeeSurface: 0.005, figeeNiveau: 2, imageVideEcart: 6, imageVideDuree: 1 };

/**
 * Images figées et vides (spec S2, 5.10), sur les vignettes de la passe rapide des flashs (aucune capture de plus).
 * releves : [{ t, gris }] dans l'ordre, null entre deux plages (la comparaison reprend après) ; contexte : { duree, scenes:
 * [{ id, debut, fin, entree, exclue, mouvements: [[debut, fin]] }] } (exclue : effets de particules, shaders ou data-gel ;
 * mouvements : éléments minutés du contenu).
 * - image-figee : moins de figeeSurface de l'image a changé (de plus de figeeNiveau niveaux) depuis le début du passage, pendant
 *   plus de tempsMort, alors qu'un élément du contenu (mouvements : décors exclus) est minuté pour bouger pendant tempsMort au
 *   moins de ce passage (sinon temps-mort le dit déjà) ; pause finale de la vidéo exclue.
 * - image-vide : des vignettes d'écart-type sous imageVideEcart pendant imageVideDuree ; entrée de la première scène depuis le fond et dernière
 *   demi-seconde exclues ; une par scène.
 * Idées : frame_stats et analyse_picture de video-director (MIT, © 2026 win4r), air mort de take-one (principe seulement).
 */
function analyserImages(releves, contexte, seuils) {
  const S = { ...DEFAUTS_IMAGES };
  for (const k of Object.keys(S)) if (seuils && typeof seuils[k] === 'number') S[k] = seuils[k];
  const scenes = (contexte && contexte.scenes) || [];
  const duree = (contexte && contexte.duree) || 0;
  const sceneEn = (t) => { const v = scenes.filter((s) => t >= s.debut - 1e-9 && t < s.fin); return v.length ? v[v.length - 1] : scenes[scenes.length - 1] || null; };
  const constats = [];
  const vues = new Set();
  const finVideo = duree - S.pauseFinale;
  // Images figées : passages où presque rien ne change depuis leur premier relevé.
  const fermer = (a, b) => {
    if (!a || !b || b.t - a.t <= S.tempsMort + 1e-6) return;
    const debut = a.t;
    const fin = Math.min(b.t, finVideo);
    if (fin - debut <= S.tempsMort + 1e-6) return;
    const s = sceneEn((debut + fin) / 2);
    if (!s || s.exclue || vues.has(`figee|${s.id}`)) return;
    // Un élément du contenu minuté pour bouger pendant tempsMort au moins de ce passage : une entrée brève à son bord ne suffit pas.
    const bouge = (s.mouvements || []).some(([x, y]) => Math.min(y, fin) - Math.max(x, debut) >= S.tempsMort - 1e-6);
    if (!bouge) return;
    vues.add(`figee|${s.id}`);
    constats.push({ regle: 'image-figee', scene: s.id, element: null, instant: Math.round(debut * 100) / 100, valeur: { d: Math.round((fin - debut) * 10) / 10, a: Math.round(debut * 10) / 10, b: Math.round(fin * 10) / 10 } });
  };
  let ref = null;
  let precedent = null;
  for (const r of releves) {
    if (!r || !r.gris) { fermer(ref, precedent); ref = null; precedent = null; continue; }
    if (!ref) { ref = r; precedent = r; continue; }
    if (partChangee(ref.gris, r.gris, S.figeeNiveau) >= S.figeeSurface) { fermer(ref, precedent); ref = r; }
    precedent = r;
  }
  fermer(ref, precedent);
  // Images vides : unies pendant imageVideDuree au moins (un titre qui entre 0,2 s après le début de sa scène ne compte pas).
  const premiere = scenes[0];
  const finEntree = premiere ? premiere.debut + (premiere.entree || 0) : 0;
  let debutVide = null;
  for (const r of releves) {
    const unie = r && r.gris && r.t >= finEntree - 1e-9 && r.t <= duree - 0.5 && statsGris(r.gris).ecart < S.imageVideEcart;
    if (!unie) { debutVide = null; continue; }
    // Un passage uni se compte dans une seule scène : il recommence quand la scène change.
    if (debutVide === null || sceneEn(debutVide) !== sceneEn(r.t)) debutVide = r.t;
    if (r.t - debutVide < S.imageVideDuree - 1e-6) continue;
    const s = sceneEn(debutVide);
    if (!s || s.exclue || vues.has(`vide|${s.id}`)) continue;
    vues.add(`vide|${s.id}`);
    constats.push({ regle: 'image-vide', scene: s.id, element: null, instant: Math.round(debutVide * 100) / 100, valeur: null });
  }
  return constats;
}

const casesDe = (v) => (Array.isArray(v) ? v : v.cases);

async function mesurerFlashs({ duree, ips = 30, seuils, relever, releverTous, sceneA, plages = null, images = null }) {
  const S = seuilsFlashs(seuils);
  const n = S.flashCases;
  // releverTous(instants) -> Promise<[cases | { cases, gris }]> (plusieurs pages en même temps) ; sinon relever(t), un instant
  // après l'autre. images : contexte de analyserImages (les relevés portent alors leur vignette en gris).
  const tous0 = releverTous || (async (liste) => { const r = []; for (const t of liste) r.push(await relever(t)); return r; });
  const instants = instantsFlashs(duree, S.flashIps);
  const retenus = instants.map((t, i) => i).filter((i) => dans(instants[i], plages));
  const bruts = await tous0(retenus.map((i) => instants[i]));
  const valeurs = bruts.map(casesDe);
  const tous = async (liste) => (await tous0(liste)).map(casesDe);
  const passages = [];
  for (let k = 1; k < retenus.length; k++) {
    const i = retenus[k];
    // Hors des plages : la comparaison reprend au prochain instant mesuré (jamais entre deux plages).
    if (retenus[k - 1] !== i - 1) continue;
    if (change(valeurs[k - 1], valeurs[k], S)) passages.push([Math.max(0, instants[i - 1] - 1), Math.min(duree, instants[i] + 1)]);
  }
  const constats = [];
  if (images) {
    // Vignettes de la passe rapide, dans l'ordre ; un trou (hors des plages) coupe les passages immobiles.
    const releves = [];
    retenus.forEach((i, k) => {
      if (k > 0 && retenus[k - 1] !== i - 1) releves.push(null);
      releves.push(bruts[k] && bruts[k].gris ? { t: instants[i], gris: bruts[k].gris } : null);
    });
    constats.push(...analyserImages(releves, images, seuils));
  }
  for (const p of fusionnerPassages(passages)) {
    const premiere = Math.ceil(p[0] * ips);
    const derniere = Math.floor(p[1] * ips);
    const imagesPassage = [];
    for (let f = premiere; f <= derniere; f++) imagesPassage.push(f / ips);
    const series = await tous(imagesPassage);
    const trouve = chercherFlash(series, { n, ips, S });
    if (trouve) {
      const t = (premiere + trouve.debut + 1) / ips;
      constats.push({ regle: 'flash', scene: sceneA(t), element: null, instant: Math.round(t * 100) / 100, valeur: arrondi(trouve.maxFlashs) });
      break;
    }
  }
  return constats;
}

module.exports = { DEFAUTS, seuilsFlashs, instantsFlashs, casesImage, change, fusionnerPassages, chercherFlash, mesurerFlashs, luminance, vignetteGrise, statsGris, partChangee, analyserImages };
