/* Pulse Motion – piste de l'aperçu : forme d'onde de la voix, vignettes des scènes, menu « Comparer avec… »
 * (spec Retouches et ergonomie, 5.12 et 5.10).
 *
 * Forme d'onde : sous la piste, la voix seule (prises embarquées posées à leur début : M.pistesBrutes(['voix']), sans
 * musique ni bruitages), pics normalisés, une colonne par pixel ; les mots calés apparaissent au survol ; un clic se place.
 * Absente s'il n'y a pas de voix.
 * Vignettes : au survol d'un repère de scène, une vignette de la scène (M.capturer à 35 % de la scène, 240 px de large, dans
 * un cadre caché de /_pm/version/courante, gardée pour la session de la page) avec son nom ; un clic se place au début de
 * la scène.
 * Comparer : un menu liste les versions du journal de l'historique et ouvre /_pm/comparer?avec=<n>.
 * Aperçu seulement (injecté par scripts/apercu.js), hors de #pm-scene : rien dans la page livrée ni dans les images.
 * Idées d'argo (preview-waveform.ts : computeWaveform ; sceneThumbnails ; MIT), réécrites.
 */
const M = globalThis.M || {};
const HAUTEUR_ONDE = 22;
const LARGEUR_VIGNETTE = 240;

function el(tag, attrs = {}, parent = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'texte') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

const scenes = () => (M.minutage && M.minutage.scenes) || [];

/** Pics normalisés d'un signal : une valeur par colonne (0 à 1). Module pur. */
export function picsParColonne(echantillons, colonnes) {
  const pics = new Float32Array(Math.max(0, colonnes));
  if (!echantillons || !echantillons.length || colonnes <= 0) return pics;
  const pas = echantillons.length / colonnes;
  let max = 0;
  for (let c = 0; c < colonnes; c++) {
    const debut = Math.floor(c * pas);
    const fin = Math.max(debut + 1, Math.floor((c + 1) * pas));
    let p = 0;
    for (let i = debut; i < fin && i < echantillons.length; i++) { const v = Math.abs(echantillons[i]); if (v > p) p = v; }
    pics[c] = p;
    if (p > max) max = p;
  }
  if (max > 0) for (let c = 0; c < colonnes; c++) pics[c] /= max;
  return pics;
}

/** Mots calés de toutes les voix, en temps de la vidéo : [{ mot, debut, fin }]. */
function motsDeLaVoix() {
  const mots = [];
  (M.donnees.scenes || []).forEach((s, i) => {
    const v = s.voix;
    const m = scenes()[i];
    if (!v || !m || !Array.isArray(v.mots)) return;
    const base = m.debut + (v.debut || 0);
    for (const w of v.mots) if (typeof w.t0 === 'number') mots.push({ mot: w.w, debut: base + w.t0, fin: base + (typeof w.t1 === 'number' ? w.t1 : w.t0) });
  });
  return mots;
}

const aUneVoix = () => (M.donnees.scenes || []).some((s) => s.voix && s.voix.source);

// --- Forme d'onde -------------------------------------------------------------------------------------------------------

let onde = null;

async function poserForme() {
  const piste = M.lecteur && M.lecteur.piste;
  if (!piste || !aUneVoix() || typeof M.pistesBrutes !== 'function') return;
  // La barre s'agrandit pour la forme d'onde (aperçu seulement : la vidéo, elle, ne change pas).
  document.body.style.setProperty('--pm-barre', `${48 + HAUTEUR_ONDE + 4}px`);
  piste.style.alignSelf = 'center';
  const boite = el('div', { id: 'pm-onde', title: 'Voix', style: `position:relative;height:${HAUTEUR_ONDE}px;margin-top:4px;cursor:pointer` }, piste);
  const canvas = el('canvas', { style: 'display:block;width:100%;height:100%' }, boite);
  const bulle = el('div', { class: 'pm-onde-mot', hidden: '', style: 'position:absolute;bottom:100%;transform:translateX(-50%);margin-bottom:4px;padding:2px 6px;border-radius:4px;background:#000;color:#fff;font:12px/1.3 system-ui,sans-serif;white-space:nowrap;pointer-events:none' }, boite);
  onde = { boite, canvas, bulle, pics: null, mots: motsDeLaVoix() };
  const r = await M.pistesBrutes(['voix']);
  const voix = r && r.pistes && r.pistes.voix;
  if (!voix || !voix.echantillons) { boite.remove(); document.body.style.removeProperty('--pm-barre'); onde = null; return; }
  onde.echantillons = voix.echantillons;
  dessinerOnde();
  window.addEventListener('resize', dessinerOnde);
  const tDe = (e) => { const b = boite.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * M.duree; };
  boite.addEventListener('mousemove', (e) => {
    const t = tDe(e);
    const m = onde.mots.find((w) => t >= w.debut - 0.05 && t <= w.fin + 0.05);
    if (!m) { bulle.hidden = true; return; }
    bulle.textContent = m.mot;
    bulle.style.left = `${100 * t / M.duree}%`;
    bulle.hidden = false;
  });
  boite.addEventListener('mouseleave', () => { bulle.hidden = true; });
  boite.addEventListener('click', (e) => { e.stopPropagation(); if (M.lecteur) M.lecteur.aller(tDe(e)); });
}

function dessinerOnde() {
  if (!onde) return;
  const { canvas } = onde;
  const largeur = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
  canvas.width = largeur;
  canvas.height = HAUTEUR_ONDE;
  onde.pics = picsParColonne(onde.echantillons, largeur);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, largeur, HAUTEUR_ONDE);
  ctx.fillStyle = '#8ec5ff';
  const milieu = HAUTEUR_ONDE / 2;
  for (let x = 0; x < largeur; x++) {
    const h = Math.max(1, onde.pics[x] * (HAUTEUR_ONDE - 2));
    ctx.fillRect(x, milieu - h / 2, 1, h);
  }
}

// --- Vignettes des scènes -----------------------------------------------------------------------------------------------

const vignettes = new Map();
let cadre = null;
let cadrePret = null;

function cadreVignettes() {
  if (cadrePret) return cadrePret;
  const sc = document.getElementById('pm-scene').getBoundingClientRect();
  const hauteur = Math.round(480 * sc.height / sc.width);
  cadre = el('iframe', { src: '/_pm/version/courante', 'aria-hidden': 'true', tabindex: '-1',
    style: `position:fixed;left:-10000px;top:0;width:480px;height:${hauteur + 48}px;border:0;visibility:hidden` }, document.body);
  cadrePret = new Promise((resolve, reject) => {
    cadre.addEventListener('load', () => {
      const F = cadre.contentWindow.M;
      if (!F || !F.pret) { reject(new Error('cadre sans moteur')); return; }
      F.pret.then(() => resolve(F), reject);
    }, { once: true });
  });
  return cadrePret;
}

/** Vignette de la scène i (35 % de sa durée), en data URL ; gardée pour la session de la page. */
let file = Promise.resolve();
function vignette(i) {
  if (vignettes.has(i)) return vignettes.get(i);
  // Une capture à la fois : le cadre caché n'a qu'une horloge.
  const promesse = file.then(() => capturerVignette(i));
  file = promesse.catch(() => null);
  vignettes.set(i, promesse);
  promesse.catch(() => vignettes.delete(i));
  return promesse;
}

async function capturerVignette(i) {
  const F = await cadreVignettes();
  const s = F.minutage.scenes[i];
  await F.seek(s.debut + 0.35 * (s.fin - s.debut));
  const sc = cadre.contentDocument.getElementById('pm-scene').getBoundingClientRect();
  const h = Math.round(LARGEUR_VIGNETTE * sc.height / sc.width);
  const c = document.createElement('canvas');
  c.width = LARGEUR_VIGNETTE;
  c.height = h;
  await F.capturer(c.getContext('2d'), LARGEUR_VIGNETTE, h);
  return c.toDataURL('image/jpeg', 0.85);
}

function poserReperes() {
  const piste = M.lecteur && M.lecteur.piste;
  if (!piste || !(M.duree > 0)) return;
  const couche = el('div', { class: 'pm-reperes-scenes', style: 'position:absolute;left:0;right:0;top:-12px;height:12px' }, piste);
  const bulle = el('div', { id: 'pm-vignette', hidden: '', style: 'position:fixed;z-index:23;padding:4px;border-radius:6px;background:#000;color:#fff;font:12px/1.3 system-ui,sans-serif;pointer-events:none;box-shadow:0 4px 16px rgb(0 0 0/.5)' }, document.body);
  scenes().forEach((s, i) => {
    const cible = el('span', { 'data-scene': s.id, title: `Scène ${i + 1} · ${s.id}`,
      style: `position:absolute;left:${(100 * s.debut / M.duree).toFixed(3)}%;width:12px;height:12px;margin-left:-6px;cursor:pointer` }, couche);
    cible.addEventListener('mouseenter', async () => {
      const b = cible.getBoundingClientRect();
      bulle.textContent = '';
      const img = el('img', { alt: '', style: `display:block;width:${LARGEUR_VIGNETTE}px;min-height:40px;background:#222;border-radius:3px` }, bulle);
      el('div', { texte: `Scène ${i + 1} · ${s.id}`, style: 'margin-top:3px' }, bulle);
      bulle.style.left = `${Math.max(4, Math.min(window.innerWidth - LARGEUR_VIGNETTE - 12, b.left - LARGEUR_VIGNETTE / 2))}px`;
      bulle.style.bottom = `${window.innerHeight - b.top + 6}px`;
      bulle.dataset.scene = s.id;
      bulle.hidden = false;
      try {
        const src = await vignette(i);
        if (bulle.dataset.scene === s.id) img.src = src;
      } catch { /* vignette impossible : le nom suffit */ }
    });
    cible.addEventListener('mouseleave', () => { bulle.hidden = true; });
    cible.addEventListener('click', (e) => { e.stopPropagation(); if (M.lecteur) M.lecteur.aller(s.debut); });
  });
}

// --- Comparer avec… --------------------------------------------------------------------------------------------------

function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function ouvrirComparer(bouton) {
  const ancien = document.getElementById('pm-menu-comparer');
  if (ancien) { ancien.remove(); return; }
  let versions = [];
  try { versions = (await (await fetch('/_pm/versions')).json()).versions || []; } catch { versions = []; }
  const b = bouton.getBoundingClientRect();
  const menu = el('div', { id: 'pm-menu-comparer', role: 'menu', 'data-pm-clavier': '',
    style: `position:fixed;z-index:24;bottom:${window.innerHeight - b.top + 6}px;left:${Math.max(8, b.left - 120)}px;max-height:50vh;overflow:auto;min-width:260px;padding:6px;border-radius:8px;background:#1b1b1b;color:#eee;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.45)` }, document.body);
  el('div', { texte: 'Comparer avec…', style: 'padding:4px 8px;font-weight:600' }, menu);
  if (!versions.length) el('div', { texte: 'Aucune version gardée pour l\'instant.', style: 'padding:4px 8px;color:#888' }, menu);
  for (const v of versions) {
    const libelle = v.nom ? `« ${v.nom} »` : (v.phrase ? `avant « ${v.phrase} »` : `version ${v.numero}`);
    const item = el('button', { type: 'button', role: 'menuitem', 'data-version': v.numero,
      style: 'display:block;width:100%;text-align:left;padding:5px 8px;border:0;border-radius:5px;background:none;color:#eee;cursor:pointer;font:inherit' }, menu);
    el('span', { texte: libelle }, item);
    el('span', { texte: ` · ${dateCourte(v.date)}`, style: 'color:#888' }, item);
    item.addEventListener('click', (e) => { e.stopPropagation(); menu.remove(); window.open(`/_pm/comparer?avec=${encodeURIComponent(v.numero)}`, '_blank'); });
  }
  const fermer = (e) => { if (!menu.contains(e.target) && e.target !== bouton) { menu.remove(); document.removeEventListener('click', fermer); } };
  setTimeout(() => document.addEventListener('click', fermer), 0);
}

function ajouterBouton() {
  const barre = document.getElementById('pm-lecteur');
  if (!barre || document.getElementById('pm-bouton-comparer')) return;
  const b = el('button', { id: 'pm-bouton-comparer', type: 'button', texte: 'Comparer', title: 'Comparer avec une version précédente', 'aria-haspopup': 'menu',
    style: 'width:auto;padding:0 12px;border-radius:16px;font-weight:600' }, barre);
  b.addEventListener('click', (e) => { e.stopPropagation(); ouvrirComparer(b); });
}

/** Pour les essais. */
M.pisteApercu = { vignette, forme: () => (onde ? { colonnes: onde.pics ? onde.pics.length : 0, mots: onde.mots.length } : null), picsParColonne };

if (M.pret && typeof window !== 'undefined' && !globalThis.__PM_VERSION__ && window.top === window && !/[?&](export|planche|capture|studio)=/.test(location.search)) {
  M.pret.then(() => {
    ajouterBouton();
    poserReperes();
    return poserForme();
  }).catch(() => { /* la piste reste celle du lecteur */ });
}
