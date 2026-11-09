'use strict';
/* Pulse Motion – séries d'images de l'export (spec S2, 5.12) : statistiques image par image, calculées pendant la capture
 * (voie fidèle : seconde sortie de ffmpeg, en gris, 192 px de large ; voie navigateur : toile de 192 px), puis analysées.
 *
 * statsSerie(images) -> { m, e, d, s, bords } : par image, moyenne et écart-type (niveaux de 0 à 255), différence avec la
 *   précédente d(n) (moyenne des écarts absolus ; null pour la première) et saut s(n) = |f(n+1) − f(n−1)| (null aux bouts) ;
 *   bords : les deux premières et les deux dernières vignettes (base64), pour analyser les jointures entre segments.
 * joindre(segments) -> { images: [{ m, e, d, s } | null], nonAnalyses } : segments [{ debut, images, stats | null }] mis bout à
 *   bout ; d et s des images de jointure calculés depuis les vignettes de bord ; un segment sans statistiques : images null.
 * analyserSerie(images, { ips, coupes, brusques, sequences, scenes, seuils }) -> { problemes, parasites, sauts }
 *   image-parasite : d(n) et d(n+1) au-dessus de max(parasitePlancher, parasiteFacteur × médiane locale) et s(n) sous
 *   parasiteRetour × min(d(n), d(n+1)) : une image isolée, qui apparaît puis disparaît.
 *   saut-image : d(n) au-dessus de sautFacteur × la médiane de ses sautVoisines voisines et de parasitePlancher ; hors coupes
 *   (débuts de scène en coupe ou sans transition), mouvements brusques (dictionnaire : « brusque ») et séquences.
 * Idées : analyse_picture de video-director (images d'un seul pas, skip ; MIT, © 2026 win4r), seuils de saut de take-one
 * (3 × la médiane de 6 voisines : principe seulement). Fonctions pures.
 */

const DEFAUTS = { parasiteFacteur: 4, parasitePlancher: 2, parasiteRetour: 0.35, sautFacteur: 3, sautVoisines: 6 };

function ecart(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / Math.max(1, a.length);
}

function moments(g) {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < g.length; i++) { s += g[i]; s2 += g[i] * g[i]; }
  const m = s / Math.max(1, g.length);
  return { m, e: Math.sqrt(Math.max(0, s2 / Math.max(1, g.length) - m * m)) };
}

const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100);
const b64 = (g) => Buffer.from(g.buffer, g.byteOffset, g.byteLength).toString('base64');
const deB64 = (t) => (t ? new Uint8Array(Buffer.from(t, 'base64')) : null);

/** images : [Uint8Array] (vignettes en gris de même taille). */
function statsSerie(images, { largeur = 192 } = {}) {
  const n = images.length;
  const m = [];
  const e = [];
  const d = [];
  const s = [];
  for (let k = 0; k < n; k++) {
    const x = moments(images[k]);
    m.push(r2(x.m));
    e.push(r2(x.e));
    d.push(k ? r2(ecart(images[k], images[k - 1])) : null);
    s.push(k > 0 && k < n - 1 ? r2(ecart(images[k + 1], images[k - 1])) : null);
  }
  const bords = { premieres: images.slice(0, 2).map(b64), dernieres: images.slice(Math.max(0, n - 2)).map(b64) };
  return { version: 1, largeur, hauteur: n ? images[0].length / largeur : 0, images: n, m, e, d, s, bords };
}

/** Segments bout à bout -> images [{ m, e, d, s } | null] ; les jointures sont reprises sur les vignettes de bord. */
function joindre(segments) {
  const images = [];
  let nonAnalyses = 0;
  let precedent = null;
  for (const g of segments) {
    const st = g.stats && Array.isArray(g.stats.m) && g.stats.m.length === g.images ? g.stats : null;
    if (!st) {
      nonAnalyses++;
      for (let k = 0; k < g.images; k++) images.push(null);
      precedent = null;
      continue;
    }
    const premieres = (st.bords && st.bords.premieres || []).map(deB64);
    const dernieres = (st.bords && st.bords.dernieres || []).map(deB64);
    for (let k = 0; k < st.images; k++) images.push({ m: st.m[k], e: st.e[k], d: st.d[k], s: st.s[k] });
    if (precedent) {
      const i = images.length - st.images;
      const [avantDerniere, derniere] = precedent.dernieres.length > 1 ? precedent.dernieres : [null, precedent.dernieres[0]];
      images[i].d = r2(ecart(premieres[0], derniere));
      if (images[i - 1]) images[i - 1].s = r2(ecart(premieres[0], avantDerniere));
      if (premieres[1]) images[i].s = r2(ecart(premieres[1], derniere));
    }
    precedent = { dernieres };
  }
  return { images, nonAnalyses };
}

function mediane(v) {
  const t = v.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!t.length) return 0;
  const k = Math.floor(t.length / 2);
  return t.length % 2 ? t[k] : (t[k - 1] + t[k]) / 2;
}

/** Images exclues : coupes (l'image de la coupe et la suivante), mouvements brusques et séquences ([debut, fin] en s). */
function exclusions(n, { ips, coupes = [], brusques = [], sequences = [] }) {
  const exclu = new Uint8Array(n);
  const marquer = (a, b) => { for (let k = Math.max(0, a); k <= Math.min(n - 1, b); k++) exclu[k] = 1; };
  for (const t of coupes) { const k = Math.round(t * ips); marquer(k - 1, k + 1); }
  for (const [a, b] of [...brusques, ...sequences]) marquer(Math.floor(a * ips) - 1, Math.ceil(b * ips) + 1);
  return exclu;
}

function analyserSerie(images, { ips = 30, coupes = [], brusques = [], sequences = [], scenes = [], seuils = {} } = {}) {
  const S = { ...DEFAUTS };
  for (const k of Object.keys(S)) if (typeof seuils[k] === 'number') S[k] = seuils[k];
  const n = images.length;
  const exclu = exclusions(n, { ips, coupes, brusques, sequences });
  const d = images.map((x) => (x && typeof x.d === 'number' ? x.d : null));
  const sceneA = (t) => { const v = scenes.filter((s) => t >= s.debut - 1e-9 && t < s.fin); return v.length ? v[v.length - 1].id : (scenes.length ? scenes[scenes.length - 1].id : null); };
  const demi = Math.max(1, Math.floor(S.sautVoisines / 2));
  const voisines = (k, sauf) => { const r = []; for (let j = k - demi; j <= k + demi + (sauf - 1); j++) if (j >= 0 && j < n && (j < k || j > k + sauf - 1)) r.push(d[j]); return r; };
  const problemes = [];
  const vues = new Set();
  const parasitesVus = new Set();
  let parasites = 0;
  let sauts = 0;
  const instant = (k) => Math.round(k / ips * 100) / 100;
  for (let k = 1; k + 1 < n; k++) {
    if (d[k] === null || d[k + 1] === null || !images[k] || typeof images[k].s !== 'number' || exclu[k] || exclu[k + 1]) continue;
    const seuil = Math.max(S.parasitePlancher, S.parasiteFacteur * mediane(voisines(k, 2)));
    if (d[k] > seuil && d[k + 1] > seuil && images[k].s < S.parasiteRetour * Math.min(d[k], d[k + 1])) {
      parasites++;
      parasitesVus.add(k).add(k + 1);
      const t = instant(k);
      const scene = sceneA(t);
      if (!vues.has(`p|${scene}`)) {
        vues.add(`p|${scene}`);
        problemes.push({ regle: 'image-parasite', gravite: 'alerte', scene, instant: t,
          message: `Vers ${String(Math.round(t * 10) / 10).replace('.', ',')} s (scène « ${scene} »), une image isolée apparaît le temps d'une seule image, puis disparaît ; un élément commence ou finit une image trop tôt.` });
      }
    }
  }
  for (let k = 1; k < n; k++) {
    if (d[k] === null || exclu[k] || parasitesVus.has(k)) continue;
    if (d[k] > S.parasitePlancher && d[k] > S.sautFacteur * mediane(voisines(k, 1))) {
      sauts++;
      const t = instant(k);
      const scene = sceneA(t);
      if (!vues.has(`s|${scene}`)) {
        vues.add(`s|${scene}`);
        problemes.push({ regle: 'saut-image', gravite: 'alerte', scene, instant: t,
          message: `Vers ${String(Math.round(t * 10) / 10).replace('.', ',')} s (scène « ${scene} »), l'image change d'un coup ; un élément apparaît ou disparaît sans transition.` });
      }
    }
  }
  return { problemes, parasites, sauts };
}

/**
 * Coupes, mouvements brusques et séquences d'une page assemblée, en secondes de la vidéo (pour analyserSerie).
 * minutage : calculerMinutage avec les éléments des scènes ; dico : mouvements du dictionnaire ; elements : { id: éléments
 * d'extraireScene } ; transitions : { id: transition du déroulé } ; camera : { id: [{ debut, duree }] } (secousses).
 * Brusque : élément d'une classe ou d'un découpage de lettres d'un mouvement « brusque » (de son début à sa fin), effet de
 * particules (de son début à sa fin), secousse de caméra, temps figé ; transition brusque (coupe, shader « pixels », « glitch ») :
 * une coupe. Séquences (vidéo figée dans une scène) : celles que S6 déclarera ; aucune pour l'instant.
 */
function evenementsExport({ minutage, dico = [], elements = {}, transitions = {}, camera = {} }) {
  const brusques = dico.filter((m) => m.brusque === true);
  const classes = new Set(brusques.flatMap((m) => [...String(m.recette && m.recette.exemple || '').matchAll(/class="([^"]+)"/g)].flatMap((x) => x[1].split(/\s+/)).filter((c) => /^pm-m-/.test(c) && m.recette.type === 'classe')));
  const lettres = new Set(brusques.flatMap((m) => [...String(m.recette && m.recette.exemple || '').matchAll(/data-(?:lettres|mots)="([^"]+)"/g)].map((x) => x[1])));
  const shaders = new Set(brusques.filter((m) => m.recette.type === 'transition').flatMap((m) => [...String(m.recette.exemple).matchAll(/"shader":\s*"([^"]+)"|"transition":\s*"([^"]+)"/g)].map((x) => x[1] || x[2])));
  const coupes = [];
  const intervalles = [];
  minutage.scenes.forEach((s, i) => {
    const tr = transitions[s.id];
    const nom = tr && typeof tr === 'object' ? tr.shader : tr;
    if (i > 0 && (!nom || nom === 'aucune' || shaders.has(nom))) {
      if (nom && shaders.has(nom) && s.entree > 0) intervalles.push([s.debut, s.debut + s.entree]);
      else coupes.push(s.debut);
    }
    // Fin d'une transition : la scène qui sort est retirée d'un coup (ce qui transparaît d'elle sous la scène qui entre
    // disparaît) ; comptée comme une coupe, sinon chaque vidéo livrée aurait un saut par transition.
    if (i > 0 && s.entree > 0) coupes.push(s.debut + s.entree);
    for (const e of elements[s.id] || []) {
      const m = minutage.elements[s.id] && minutage.elements[s.id][e.cle];
      if (!m) continue;
      const sec = String(e.classe || '').split(/\s+/).some((c) => classes.has(c)) || (e.lettres && lettres.has(e.lettres)) || e.effet !== undefined;
      if (sec) intervalles.push([m.debut, m.fin]);
    }
    for (const c of camera[s.id] || []) intervalles.push([s.debut + c.debut / (s.rythme || 1), s.debut + (c.debut + c.duree) / (s.rythme || 1)]);
  });
  return { coupes, brusques: intervalles, sequences: [] };
}

module.exports = { DEFAUTS, statsSerie, joindre, analyserSerie, evenementsExport, mediane, ecart };
