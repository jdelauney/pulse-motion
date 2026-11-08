'use strict';
/* Pulse Motion – flashs (WCAG 2.3.1) menés depuis Node, sur des captures réduites de la page de contrôle (spec Rapidité
 * 5.10). Même algorithme que moteur/pixels.js (mesurerFlashs), réécrit ici : passe rapide à instants irréguliers
 * (graine fixe 20261012, un clignotement régulier ne tombe pas toujours sur la même phase), passages où la lumière
 * change fusionnés, puis examinés à la cadence de la vidéo ; plus de flashMax flashs dans une seconde sur au moins
 * flashAire de l'image (grille de flashCases × flashCases cases), et le premier trouvé seulement.
 * Idées de video-director (frame_stats, image d'analyse réduite) et de reanimate (clip.scale), réécrites.
 *
 * Fonctions pures : instantsFlashs, casesImage, change, fusionnerPassages, chercherFlash.
 * mesurerFlashs({ duree, ips, seuils, relever(t) -> Promise<cases> | releverTous([t]) -> Promise<[cases]>, sceneA(t) -> id | null,
 *   plages? }) -> Promise<constats> ; releverTous peut répartir les instants sur plusieurs pages (l'ordre est gardé).
 *   plages : [[debut, fin]] ; seuls les instants de la passe rapide qui y tombent sont relevés (contrôle partiel).
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

async function mesurerFlashs({ duree, ips = 30, seuils, relever, releverTous, sceneA, plages = null }) {
  const S = seuilsFlashs(seuils);
  const n = S.flashCases;
  // releverTous(instants) -> Promise<[cases]> (plusieurs pages en même temps) ; sinon relever(t), un instant après l'autre.
  const tous = releverTous || (async (liste) => { const r = []; for (const t of liste) r.push(await relever(t)); return r; });
  const instants = instantsFlashs(duree, S.flashIps);
  const retenus = instants.map((t, i) => i).filter((i) => dans(instants[i], plages));
  const valeurs = await tous(retenus.map((i) => instants[i]));
  const passages = [];
  for (let k = 1; k < retenus.length; k++) {
    const i = retenus[k];
    // Hors des plages : la comparaison reprend au prochain instant mesuré (jamais entre deux plages).
    if (retenus[k - 1] !== i - 1) continue;
    if (change(valeurs[k - 1], valeurs[k], S)) passages.push([Math.max(0, instants[i - 1] - 1), Math.min(duree, instants[i] + 1)]);
  }
  const constats = [];
  for (const p of fusionnerPassages(passages)) {
    const premiere = Math.ceil(p[0] * ips);
    const derniere = Math.floor(p[1] * ips);
    const images = [];
    for (let f = premiere; f <= derniere; f++) images.push(f / ips);
    const series = await tous(images);
    const trouve = chercherFlash(series, { n, ips, S });
    if (trouve) {
      const t = (premiere + trouve.debut + 1) / ips;
      constats.push({ regle: 'flash', scene: sceneA(t), element: null, instant: Math.round(t * 100) / 100, valeur: arrondi(trouve.maxFlashs) });
      break;
    }
  }
  return constats;
}

module.exports = { DEFAUTS, seuilsFlashs, instantsFlashs, casesImage, change, fusionnerPassages, chercherFlash, mesurerFlashs, luminance };
