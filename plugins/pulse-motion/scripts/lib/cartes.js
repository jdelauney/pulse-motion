'use strict';
/* Pulse Motion – cartes géographiques côté Node (spec S9, 5.10) : fonds de carte de cartes/ (Natural Earth, préparés par le
 * mainteneur : outils/cartes/preparer.js), recherche d'un lieu, et carte posée à l'assemblage.
 *
 *   <svg data-carte="monde" data-carte-pays="FR,DE,ES" data-carte-cadre="auto">
 *     <path data-pays="FR" data-start="0.4"></path>          (facultatif : un pays listé qu'on anime ; son tracé est posé ici)
 *     <g data-repere="Lyon"></g>  <g data-repere="45.76,4.84"><text data-texte="ville"></text></g>   (nom placé seul)
 *     <path data-liaison="Paris→New York" data-start="1" class="pm-m-trace"></path>
 *   </svg>
 *
 * cartesConnues() -> ['monde', 'france'] ; chargerCarte(nom) -> carte | null (fichier absent) ; chargerVilles() -> villes | null.
 * chercher(texte) -> [{ sorte: 'pays'|'region'|'ville', carte, code?, nom, … }] (sans accents ni casse) ; proches.
 * resoudreLieu(carte, valeur, villes) -> { ok, x, y, boite?, nom } | { ok: false, regle, message } : « lat,lon », code ou nom
 *   d'un pays (ou d'une région), nom d'une ville.
 * cadreDe({ carte, cadre, zones, points, ratio }) -> { boite, origine } | { erreur } ; cadre : auto (zones listées et points
 *   + 10 %, sinon toute la carte), monde ou tout (tout ce que la carte dessine, avec une marge), un code, ou un continent (europe,
 *   afrique, ameriques, asie, oceanie : carte du monde seulement). En vertical (ratio 9:16, 4:5), la boîte est étendue aux
 *   proportions de l'image, pour que la carte remplisse l'écran (origine : la boîte d'avant).
 * disposer(carte, ratio) -> la carte, ou en vertical sa disposition verticale (encarts d'outre-mer sous la métropole).
 * preparerCartes(html, { scene, ratio }) -> { html, erreurs, cartes: [noms] } : chaque <svg data-carte> reçoit viewBox, classe
 *   pm-carte, --pm-u (1 % de la largeur du cadre, pour les tailles en unités de carte), le fond (pm-pays-fond) et les pays
 *   listés (pm-pays) qui touchent le cadre, les liaisons (arc, pathLength="100") puis, au-dessus, les repères (translate,
 *   point) : le nom d'un repère (son seul <text>) est placé autour du point, là où il ne touche ni un autre nom, ni une
 *   liaison, ni un point, et reste dans l'image (placerNoms).
 *   Règles carte-inconnue, carte-invalide, pays-inconnu, ville-inconnue (erreurs, avec les noms proches).
 *
 * Dossier des données : cartes/ du plugin ; PM_CARTES_DOSSIER le remplace (tests, ou mainteneur qui essaie des fonds
 * fraîchement préparés avant de les copier).
 */
const fs = require('node:fs');
const path = require('node:path');
const K = require('../../moteur/cartes.js');
const P = require('../../moteur/proches.js');

const CARTES = ['monde', 'france'];
// Les fonds sont livrés avec le plugin (cartes/PROVENANCE.md) : s'il en manque un, l'installation est abîmée.
const SANS_DONNEES = 'le fond de carte manque dans Pulse Motion (dossier cartes/ du plugin incomplet) : mettre à jour ou réinstaller Pulse Motion';
const dossierCartes = () => process.env.PM_CARTES_DOSSIER || path.join(__dirname, '..', '..', 'cartes');
const cache = new Map();

function lireJSON(fichier) {
  const cle = `${fichier}|${fs.existsSync(fichier) ? fs.statSync(fichier).mtimeMs : 0}`;
  if (cache.has(cle)) return cache.get(cle);
  let v = null;
  try { v = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { v = null; }
  cache.set(cle, v);
  return v;
}

const cartesConnues = () => CARTES.slice();

/** Boîte d'un chemin écrit par l'outil (M x y, puis l dx dy relatifs, z). */
function boiteChemin(d) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const re = /([MlLmz])([^MlLmz]*)/g;
  let m;
  let x = 0, y = 0;
  while ((m = re.exec(d))) {
    const nombres = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
    if (m[1] === 'z') continue;
    for (let i = 0; i + 1 < nombres.length; i += 2) {
      if (m[1] === 'M' || m[1] === 'L') { x = nombres[i]; y = nombres[i + 1]; } else if (i === 0 && m[1] === 'm') { x += nombres[i]; y += nombres[i + 1]; } else { x += nombres[i]; y += nombres[i + 1]; }
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    }
  }
  return b;
}

function chargerCarte(nom) {
  if (!CARTES.includes(nom)) return null;
  const c = lireJSON(path.join(dossierCartes(), `${nom}.json`));
  if (!c || !Array.isArray(c.pays)) return null;
  if (!c.__index) {
    Object.defineProperty(c, '__index', { value: new Map(c.pays.map((p) => [p.code, p])), enumerable: false });
    for (const p of c.pays.concat(c.autres || [])) Object.defineProperty(p, 'tout', { value: boiteChemin(p.d), enumerable: false });
  }
  return c;
}

function chargerVilles() {
  const v = lireJSON(path.join(dossierCartes(), 'villes.json'));
  return v && Array.isArray(v.villes) ? v : null;
}

// Nom comparé sans accents, casse, tirets ni apostrophes (« ile de france » = « Île-de-France »).
const plat = (t) => P.normaliser(t).replace(/[^a-z0-9]+/g, ' ').trim();

/** Zone (pays ou région) par son code ou son nom français. */
function zoneDe(carte, valeur) {
  const v = String(valeur || '').trim();
  const parCode = carte.__index.get(v.toUpperCase());
  if (parCode) return parCode;
  const n = plat(v);
  return carte.pays.find((p) => plat(p.nom) === n) || null;
}

const COORDONNEES = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

function resoudreLieu(carte, valeur, villes) {
  const v = String(valeur || '').trim();
  const c = COORDONNEES.exec(v);
  if (c) {
    const lat = Number(c[1]), lon = Number(c[2]);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { ok: false, regle: 'carte-invalide', message: `coordonnées « ${v} » hors de la Terre : latitude puis longitude, en degrés (ex. 45.76,4.84).` };
    const p = K.projeter(carte, lon, lat);
    return { ok: true, x: p.x, y: p.y, nom: v };
  }
  const z = zoneDe(carte, v);
  if (z) return { ok: true, x: z.centre[0], y: z.centre[1], boite: z.boite, nom: z.nom };
  if (!villes) return { ok: false, regle: 'ville-inconnue', message: `lieu « ${v} » inconnu, et la liste des villes manque dans Pulse Motion (cartes/villes.json) : donner ses coordonnées (latitude,longitude), ou le code d'un pays.` };
  const n = plat(v);
  const trouvees = villes.villes.filter((x) => plat(x.nom) === n);
  // Même nom dans plusieurs pays : la ville de la carte (France pour la carte de France), puis la plus peuplée.
  const ville = trouvees.find((x) => carte.nom === 'france' && x.pays === 'FR') || trouvees[0];
  if (!ville) {
    const proches = P.proches(v, [...new Set(villes.villes.map((x) => x.nom))]);
    return { ok: false, regle: 'ville-inconnue', message: `ville « ${v} » inconnue${proches.length ? ` ; ${P.phrase(proches)}` : ''} (ou donner ses coordonnées : latitude,longitude).` };
  }
  const p = K.projeter(carte, ville.lon, ville.lat);
  return { ok: true, x: p.x, y: p.y, nom: ville.nom };
}

/** Taille minimale d'un cadre : 8 % de la largeur de la carte (un petit pays reste lisible, sans zoom extrême). */
function auMoins(b, carte) {
  const min = carte.largeur * 0.08;
  const l = b[2] - b[0], h = b[3] - b[1];
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const L = Math.max(l, min), H = Math.max(h, min * 0.6);
  return [cx - L / 2, cy - H / 2, cx + L / 2, cy + H / 2].map((v) => Math.round(v * 10) / 10);
}

/** Marge autour de toute la carte (8 % : 4 % de chaque côté) : rien ne touche le bord de l'image (la Corse, le Pacifique). */
const MARGE_TOUTE = 0.08;

function boiteDuCadre({ carte, cadre, zones, points }) {
  const toute = K.elargir(K.contenu(carte), MARGE_TOUTE);
  const c = String(cadre || 'auto').trim();
  if (c === 'monde' || c === 'tout') return { boite: toute };
  if (c === 'auto') {
    const boites = zones.map((z) => z.boite).concat(points.map((p) => [p.x, p.y, p.x, p.y]));
    if (!boites.length) return { boite: toute };
    return { boite: auMoins(K.elargir(K.unir(boites), 0.1), carte) };
  }
  if (Object.hasOwn(K.CADRES, c)) {
    if (carte.nom !== 'monde') return { erreur: `cadre « ${c} » : un continent ne se cadre que sur la carte du monde.` };
    return { boite: K.boiteLonLat(carte, K.CADRES[c]) };
  }
  const z = zoneDe(carte, c);
  if (z) return { boite: auMoins(K.elargir(z.boite, 0.1), carte) };
  return { erreur: `cadre « ${c} » inconnu : auto, monde, un code (FR), ou ${Object.keys(K.CADRES).join(', ')}.` };
}

function cadreDe({ carte, cadre = 'auto', zones = [], points = [], ratio } = {}) {
  const r = boiteDuCadre({ carte, cadre, zones, points });
  if (r.erreur || !ratio || !K.estVertical(ratio)) return r.erreur ? r : { boite: r.boite, origine: r.boite };
  // Vertical : la boîte prend les proportions de l'image, dans les limites de la carte (marge comprise).
  return { boite: K.ajusterAuFormat(r.boite, ratio, K.elargir(K.contenu(carte), MARGE_TOUTE)), origine: r.boite };
}

/** Disposition verticale d'une carte à encarts (calculée une fois par carte chargée). */
const dispositions = new WeakMap();
function disposer(carte, ratio) {
  if (!carte || !ratio || !K.estVertical(ratio) || !(carte.encarts || []).length) return carte;
  if (dispositions.has(carte)) return dispositions.get(carte);
  const decalages = K.decalagesVerticaux(carte);
  const bouger = (b, [dx, dy]) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy].map((v) => Math.round(v * 10) / 10);
  const encarts = carte.encarts.map((e) => {
    const v = decalages[e.code];
    return { ...e, cadre: bouger(e.cadre, v), projection: { ...e.projection, dx: (e.projection.dx || 0) + v[0], dy: (e.projection.dy || 0) + v[1] } };
  });
  const pays = carte.pays.map((p) => {
    const v = decalages[p.code];
    if (!v) return p;
    const q = { ...p, d: K.deplacerChemin(p.d, v[0], v[1]), boite: bouger(p.boite, v), centre: [Math.round((p.centre[0] + v[0]) * 10) / 10, Math.round((p.centre[1] + v[1]) * 10) / 10] };
    Object.defineProperty(q, 'tout', { value: bouger(p.tout || boiteChemin(p.d), v), enumerable: false });
    return q;
  });
  const disposee = { ...carte, encarts, pays, disposition: 'verticale' };
  Object.defineProperty(disposee, '__index', { value: new Map(pays.map((p) => [p.code, p])), enumerable: false });
  dispositions.set(carte, disposee);
  return disposee;
}

const viewBoxDe = (b) => [b[0], b[1], Math.round((b[2] - b[0]) * 10) / 10, Math.round((b[3] - b[1]) * 10) / 10];

// --- Assemblage -----------------------------------------------------------------------------------------------------------
const SVG_CARTE = /<svg\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-carte\s*=\s*(["'])([^"']*)\2(?:[^>"']|"[^"]*"|'[^']*')*?)(\/>|>([\s\S]*?)<\/svg>)/gi;
const lire = (attrs, nom) => { const m = new RegExp(`\\s${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs); return m ? (m[1] !== undefined ? m[1] : m[2]) : null; };
const retirer = (attrs, noms) => noms.reduce((a, n) => a.replace(new RegExp(`\\s${n}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'gi'), ''), attrs);
const avecClasse = (attrs, c) => {
  const actuelle = lire(attrs, 'class');
  if (actuelle === null) return `${attrs} class="${c}"`;
  if (actuelle.split(/\s+/).includes(c)) return attrs;
  return retirer(attrs, ['class']) + ` class="${`${actuelle} ${c}`.trim()}"`;
};
const echapper = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const nombre = (v) => String(Math.round(v * 100) / 100);
const listeCodes = (texte) => String(texte || '').split(',').map((s) => s.trim()).filter(Boolean);

// --- Noms des repères ---------------------------------------------------------------------------------------------------
// Le nom d'un repère se place autour de son point, à l'une de huit places (au-dessus d'abord, puis à droite, à gauche, en
// dessous, puis en diagonale). Chaque place a un coût : chevauchement d'un autre nom, d'une liaison, d'un point, sortie de
// l'image, bord d'un encart coupé, côte d'une zone colorée coupée (le nom à cheval sur la côte) ; la moins chère est gardée.
// Deux passes, dans l'ordre de la scène : déterministe. La largeur d'un nom est estimée (police inconnue ici), avec une marge.

/** Largeur d'un texte, en fractions de la taille de la police (estimation prudente, sans police). */
function largeurTexte(texte) {
  let l = 0;
  for (const car of String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '')) {
    if (/[iljI.,;:!|'’ ]/.test(car)) l += 0.3;
    else if (/[frt()[\]\-]/.test(car)) l += 0.38;
    else if (/[mwMWÆŒæœ]/.test(car)) l += 0.88;
    else if (/[A-Z]/.test(car)) l += 0.7;
    else if (/[0-9]/.test(car)) l += 0.6;
    else l += 0.58;
  }
  return l * 1.08;
}

const decoder = (t) => String(t).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

/** Points absolus des anneaux d'un chemin de l'outil (M absolus, l relatifs, z), pour savoir si un point est dans la zone. */
function anneaux(d) {
  const r = [];
  let courant = null, x = 0, y = 0;
  const re = /([MlLmz])([^MlLmz]*)/g;
  let m;
  while ((m = re.exec(d))) {
    if (m[1] === 'z') { if (courant) r.push(courant); courant = null; continue; }
    const n = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
    for (let i = 0; i + 1 < n.length; i += 2) {
      if (m[1] === 'M' || m[1] === 'L') { x = n[i]; y = n[i + 1]; } else { x += n[i]; y += n[i + 1]; }
      if (m[1] === 'M' && i === 0) { if (courant) r.push(courant); courant = []; }
      (courant = courant || []).push([x, y]);
    }
  }
  if (courant) r.push(courant);
  return r;
}

function dansZone(rings, px, py) {
  let dedans = false;
  for (const a of rings) {
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i], [xj, yj] = a[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

/** Points d'une liaison (courbe de Bézier quadratique « Mx yQcx cy bx by »), tous les `pas` unités environ. */
function pointsLiaison(d, pas) {
  const n = (d.match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
  if (n.length < 6) return [];
  const [ax, ay, cx, cy, bx, by] = n;
  const longueur = Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy);
  const k = Math.max(8, Math.ceil(longueur / pas));
  const r = [];
  for (let i = 0; i <= k; i++) {
    const t = i / k, v = 1 - t;
    r.push([v * v * ax + 2 * v * t * cx + t * t * bx, v * v * ay + 2 * v * t * cy + t * t * by]);
  }
  return r;
}

const aire = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// Places : [nom, coût de préférence, sens x (-1, 0, 1), sens y (-1, 0, 1)] ; un second anneau, deux fois plus loin, sert quand
// le premier est pris (un amas de villes).
const PLACES = [['n', 0, 0, -1], ['e', 0.1, 1, 0], ['o', 0.15, -1, 0], ['s', 0.2, 0, 1], ['ne', 0.25, 1, -1], ['no', 0.3, -1, -1], ['se', 0.35, 1, 1], ['so', 0.4, -1, 1]];
const LOIN = 1.9;

/**
 * noms : [{ x, y, largeur, taille }] (point du repère, largeur en unités, taille de la police) ; obstacles : { points: [{ x, y, r }],
 * liaisons: [[x, y]…] (points des tracés), encarts: [boîtes], zones: [anneaux] (zones colorées), image: boîte visible, eviter:
 * [boîtes] (en 9:16, les zones des boutons des réseaux), ecart }.
 * Un point dans un encart d'outre-mer garde son nom dans l'encart, ou le pose juste à côté de l'encart (dessous, à droite, à
 * gauche, dessus) : jamais à cheval sur son bord.
 * -> pour chaque nom { place, x, y, ancre, boite, cout } (x, y : ligne de base, relatifs au point ; boite : absolue).
 */
function placerNoms(noms, { points = [], liaisons = [], encarts = [], zones = [], image, eviter = [], ecart }) {
  const candidats = noms.map((n) => {
    const t = n.taille, haut = 0.74 * t, bas = 0.24 * t;
    const propre = (place, prefere, x, y, ancre) => {
      const gauche = ancre === 'debut' ? x : ancre === 'fin' ? x - n.largeur : x - n.largeur / 2;
      const boite = [n.x + gauche, n.y + y - haut, n.x + gauche + n.largeur, n.y + y + bas];
      let cout = prefere;
      const marge = t * 0.15;
      const large = [boite[0] - marge, boite[1] - marge, boite[2] + marge, boite[3] + marge];
      for (const [px, py] of liaisons) if (px >= large[0] && px <= large[2] && py >= large[1] && py <= large[3]) cout += 1;
      for (const p of points) if (p.x + p.r >= boite[0] && p.x - p.r <= boite[2] && p.y + p.r >= boite[1] && p.y - p.r <= boite[3]) cout += 20;
      const a = (boite[2] - boite[0]) * (boite[3] - boite[1]);
      if (image) cout += 30 * (1 - aire(boite, image) / a);
      for (const z of eviter) cout += 15 * aire(boite, z) / a;
      for (const b of encarts) {
        const c = aire(boite, b);
        const sien = n.x >= b[0] && n.x <= b[2] && n.y >= b[1] && n.y <= b[3];
        if (sien ? c > 1e-6 && c < a - 1e-6 : c > 1e-6) cout += 10;
      }
      if (zones.length) {
        const echantillons = [];
        for (const fx of [0.02, 0.5, 0.98]) for (const fy of [0.15, 0.85]) echantillons.push([boite[0] + (boite[2] - boite[0]) * fx, boite[1] + (boite[3] - boite[1]) * fy]);
        const dedans = echantillons.map(([px, py]) => zones.some((z) => dansZone(z, px, py)));
        if (dedans.some(Boolean) && !dedans.every(Boolean)) cout += 2;
      }
      return { place, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, ancre, boite, cout };
    };
    const r = [];
    for (const [k, loin] of [[1, 0], [LOIN, 0.6]]) {
      for (const [place, prefere, sx, sy] of PLACES) {
        const e = (sx && sy ? ecart * 0.75 : ecart) * k;
        const y = sy < 0 ? -e - bas : sy > 0 ? e + haut : (haut - bas) / 2;
        r.push(propre(k === 1 ? place : place + '-loin', prefere + loin, sx * e, y, sx > 0 ? 'debut' : sx < 0 ? 'fin' : 'milieu'));
      }
    }
    const encart = encarts.find((b) => n.x >= b[0] && n.x <= b[2] && n.y >= b[1] && n.y <= b[3]);
    if (encart) {
      const g = ecart * 0.6;
      r.push(propre('sous-encart', 0.5, 0, encart[3] - n.y + g + haut, 'milieu'));
      r.push(propre('droite-encart', 0.55, encart[2] - n.x + g, (haut - bas) / 2, 'debut'));
      r.push(propre('gauche-encart', 0.6, encart[0] - n.x - g, (haut - bas) / 2, 'fin'));
      r.push(propre('dessus-encart', 0.65, 0, encart[1] - n.y - g - bas, 'milieu'));
    }
    return r;
  });
  const choix = candidats.map(() => null);
  const coutAvec = (i, c) => {
    let total = c.cout;
    const a = (c.boite[2] - c.boite[0]) * (c.boite[3] - c.boite[1]);
    choix.forEach((autre, j) => {
      if (j === i || !autre) return;
      const marge = noms[i].taille * 0.2;
      const b = [autre.boite[0] - marge, autre.boite[1] - marge, autre.boite[2] + marge, autre.boite[3] + marge];
      total += 25 * aire(c.boite, b) / a;
    });
    return total;
  };
  for (let passe = 0; passe < 2; passe++) {
    candidats.forEach((cs, i) => {
      let meilleur = null, cout = Infinity;
      for (const c of cs) { const v = coutAvec(i, c); if (v < cout - 1e-9) { cout = v; meilleur = c; } }
      choix[i] = meilleur;
    });
  }
  return choix;
}

/** Éléments <g data-repere> d'un corps, jusqu'à leur </g> (les <g> imbriqués comptés) : [{ debut, fin, attrs, valeur, interieur }]. */
function elementsReperes(corps) {
  const r = [];
  const re = /<g\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-repere\s*=\s*(["'])([^"']*)\2(?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;
  let m;
  while ((m = re.exec(corps))) {
    const debut = m.index;
    const apres = m.index + m[0].length;
    if (m[4]) { r.push({ debut, fin: apres, attrs: m[1], valeur: m[3], interieur: '' }); continue; }
    const balises = /<g\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>|<\/g\s*>/gi;
    balises.lastIndex = apres;
    let profondeur = 1, b, fin = corps.length, finInterieur = corps.length;
    while ((b = balises.exec(corps))) {
      if (b[0][1] === '/') profondeur--;
      else if (!b[1]) profondeur++;
      if (!profondeur) { finInterieur = b.index; fin = b.index + b[0].length; break; }
    }
    r.push({ debut, fin, attrs: m[1], valeur: m[3], interieur: corps.slice(apres, finInterieur) });
    re.lastIndex = fin;
  }
  return r;
}

/** Partie de la carte visible dans l'image (carte posée sur toute l'image, ajustée sans déformation), moins une marge. */
function boiteVisible(vb, ratio, marge) {
  let b = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
  const r = String(ratio || '').split(':').map(Number);
  if (r[0] > 0 && r[1] > 0) {
    const a = r[0] / r[1];
    if (vb[2] / vb[3] > a) { const h = vb[2] / a; b = [b[0], b[1] - (h - vb[3]) / 2, b[2], b[3] + (h - vb[3]) / 2]; }
    else { const l = vb[3] * a; b = [b[0] - (l - vb[2]) / 2, b[1], b[2] + (l - vb[2]) / 2, b[3]]; }
  }
  return [b[0] + marge, b[1] + marge, b[2] - marge, b[3] - marge];
}

/** En 9:16, zones des boutons des réseaux (mêmes seuils que le contrôle zone-sure, scripts/seuils.json) : 7 % du haut, 20 % du
 * bas, 11 % de droite entre 40 % et 85 % de la hauteur ; boîtes en unités de la carte, depuis la boîte visible. */
function zonesReseaux(b) {
  const S = require('../seuils.json');
  const l = b[2] - b[0], h = b[3] - b[1];
  const haut = S.zoneHaut ?? 0.07, bas = S.zoneBas ?? 0.2, droite = S.zoneDroite ?? 0.11, debut = S.zoneDroiteDebut ?? 0.4, fin = S.zoneDroiteFin ?? 0.85;
  return [[b[0], b[1], b[2], b[1] + haut * h], [b[0], b[3] - bas * h, b[2], b[3]], [b[2] - droite * l, b[1] + debut * h, b[2], b[1] + fin * h]];
}

const TEXTE_SEUL = /^\s*<text\b((?:[^>"']|"[^"]*"|'[^']*')*?)>([\s\S]*?)<\/text>\s*$/i;

function preparerCartes(html, { scene, ratio } = {}) {
  const erreurs = [];
  const utilisees = new Set();
  const sortie = String(html).replace(SVG_CARTE, (tout, attributs, g, nom, fin, interieur = '') => {
    const signaler = (regle, message) => erreurs.push({ regle, gravite: 'erreur', scene, element: nom, message: `Scène « ${scene} », carte « ${nom} » : ${message}` });
    if (!CARTES.includes(nom)) {
      const proches = P.proches(nom, CARTES);
      signaler('carte-inconnue', `carte inconnue${proches.length ? ` ; ${P.phrase(proches)}` : ''} (cartes : ${CARTES.join(', ')}).`);
      return tout;
    }
    const carte = disposer(chargerCarte(nom), ratio);
    if (!carte) { signaler('carte-inconnue', `${SANS_DONNEES}.`); return tout; }
    const villes = chargerVilles();
    let corps = interieur || '';

    // Zones listées : data-carte-pays (ou data-carte-regions), et celles déclarées par <path data-pays="…">.
    const demandees = listeCodes(lire(attributs, 'data-carte-pays') || lire(attributs, 'data-carte-regions'));
    const declarees = [...corps.matchAll(/<path\b(?:[^>"']|"[^"]*"|'[^']*')*?\sdata-pays\s*=\s*(["'])([^"']*)\1/gi)].map((m) => m[2]);
    const zones = [];
    let fautes = 0;
    for (const v of [...demandees, ...declarees]) {
      const z = zoneDe(carte, v);
      if (!z) {
        fautes++;
        const proches = P.proches(v, carte.pays.map((p) => p.code).concat(carte.pays.map((p) => p.nom)));
        signaler('pays-inconnu', `${nom === 'france' ? 'région' : 'pays'} « ${v} » inconnu${proches.length ? ` ; ${P.phrase(proches)}` : ''}.`);
      } else if (!zones.includes(z)) zones.push(z);
    }

    // Repères et liaisons : résolus d'abord (le cadre auto les englobe).
    const points = [];
    const lieux = new Map();
    const lieu = (v) => {
      if (!lieux.has(v)) lieux.set(v, resoudreLieu(carte, v, villes));
      const r = lieux.get(v);
      if (!r.ok) { fautes++; signaler(r.regle, r.message); return null; }
      return r;
    };
    const reperes = [...corps.matchAll(/<g\b(?:[^>"']|"[^"]*"|'[^']*')*?\sdata-repere\s*=\s*(["'])([^"']*)\1/gi)].map((m) => m[2]);
    reperes.forEach((v) => { const r = lieu(v); if (r) points.push(r); });
    const liaisons = [...corps.matchAll(/<path\b(?:[^>"']|"[^"]*"|'[^']*')*?\sdata-liaison\s*=\s*(["'])([^"']*)\1/gi)].map((m) => m[2]);
    for (const v of liaisons) {
      const bouts = v.split(/\s*(?:→|->)\s*/);
      if (bouts.length !== 2 || !bouts[0] || !bouts[1]) { fautes++; signaler('carte-invalide', `liaison « ${v} » illisible : « départ→arrivée » (ex. Paris→New York).`); continue; }
      bouts.forEach((b) => { const r = lieu(b); if (r) points.push(r); });
    }
    const cadre = cadreDe({ carte, cadre: lire(attributs, 'data-carte-cadre') || 'auto', zones, points, ratio });
    if (cadre.erreur) { signaler('carte-invalide', cadre.erreur); return tout; }
    if (fautes) return tout;
    utilisees.add(nom);
    const vb = viewBoxDe(cadre.boite);
    const u = vb[2] / 100;
    // Un territoire d'outre-mer et son encart ne viennent qu'avec le cadre demandé (pas avec l'extension au format vertical).
    const garde = (z) => K.seCroisent(z.tout, z.outreMer ? cadre.origine : cadre.boite);
    const avecFond = lire(attributs, 'data-carte-fond') !== 'non';

    // Pays déclarés : leur tracé est posé sur leur balise ; les autres listés sont ajoutés après le fond.
    corps = corps.replace(/<path\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-pays\s*=\s*(["'])([^"']*)\2(?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi, (t, a, g2, v, ferme) => {
      const z = zoneDe(carte, v);
      let attrs = retirer(a, ['d', 'id', 'data-pays']);
      attrs = avecClasse(attrs, 'pm-pays');
      return `<path id="pays-${z.code}"${attrs} data-pays="${z.code}" d="${z.d}"${ferme ? '/' : ''}>`;
    });
    const declares = new Set(declarees.map((v) => zoneDe(carte, v).code));
    const fond = avecFond ? (carte.autres || []).filter(garde).map((a) => `<path class="pm-pays-fond pm-autre" d="${a.d}"/>`)
      .concat(carte.pays.filter((p) => !zones.includes(p) && garde(p)).map((p) => `<path class="pm-pays-fond" data-pays-fond="${p.code}" d="${p.d}"/>`)) : [];
    const encartsVus = (carte.encarts || []).filter((e) => K.seCroisent(e.cadre, cadre.origine));
    const encarts = encartsVus
      .map((e) => `<rect class="pm-encart" x="${e.cadre[0]}" y="${e.cadre[1]}" width="${nombre(e.cadre[2] - e.cadre[0])}" height="${nombre(e.cadre[3] - e.cadre[1])}" rx="${nombre(u)}"/>`);
    const listes = zones.filter((z) => !declares.has(z.code)).map((z) => `<path id="pays-${z.code}" class="pm-pays" data-pays="${z.code}" d="${z.d}"/>`);

    // Liaisons : arc calculé, longueur 100 pour le tracé (#011).
    const traces = [];
    corps = corps.replace(/<path\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-liaison\s*=\s*(["'])([^"']*)\2(?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi, (t, a, g2, v, ferme) => {
      const [de, vers] = v.split(/\s*(?:→|->)\s*/);
      const courbure = Number(lire(a, 'data-liaison-courbure'));
      const d = K.arc(lieux.get(de), lieux.get(vers), Number.isFinite(courbure) && lire(a, 'data-liaison-courbure') !== null ? courbure : 0.25);
      traces.push(d);
      let attrs = avecClasse(retirer(a, ['d', 'pathLength']), 'pm-liaison');
      return `<path${attrs} d="${d}" pathLength="100"${ferme ? '/' : ''}>`;
    });

    // Repères : translate vers le point ; un repère vide, ou qui ne porte que son nom, reçoit un point. Ils passent après tout
    // le reste (au-dessus des liaisons) ; le nom est placé autour du point (placerNoms).
    const elements = elementsReperes(corps);
    const rayon = u * 0.9;
    const infos = elements.map((el) => {
      const r = lieux.get(el.valeur);
      const texte = TEXTE_SEUL.exec(el.interieur);
      const vide = !el.interieur.trim();
      let nom = null;
      if (texte) {
        const brut = decoder(texte[2]).trim();
        const ajuste = Number(lire(texte[1], 'data-taille'));
        const taille = u * 3.5 * (Number.isFinite(ajuste) && ajuste > 0 ? ajuste : 1);
        if (brut) nom = { x: r.x, y: r.y, largeur: largeurTexte(brut) * taille, taille, attrs: texte[1], contenu: texte[2] };
      }
      return { el, r, vide, nom, place: null };
    });
    const avecNom = infos.filter((i) => i.nom);
    if (avecNom.length) {
      const zonesColorees = zones.map((z) => {
        if (!z.__anneaux) Object.defineProperty(z, '__anneaux', { value: anneaux(z.d), enumerable: false });
        return z.__anneaux;
      });
      const places = placerNoms(avecNom.map((i) => i.nom), {
        points: infos.filter((i) => i.vide || i.nom).map((i) => ({ x: i.r.x, y: i.r.y, r: rayon * 1.3 })),
        liaisons: traces.flatMap((d) => pointsLiaison(d, u * 0.5)),
        encarts: encartsVus.map((e) => e.cadre),
        zones: zonesColorees,
        image: boiteVisible(vb, ratio, u * 1.5),
        eviter: ratio === '9:16' ? zonesReseaux(boiteVisible(vb, ratio, 0)) : [],
        ecart: rayon + u * 0.9,
      });
      avecNom.forEach((i, k) => { i.place = places[k]; });
    }
    const poses = infos.map(({ el, r, vide, nom, place }) => {
      const transform = lire(el.attrs, 'transform');
      let attrs = avecClasse(retirer(el.attrs, ['transform']), 'pm-repere');
      attrs += ` transform="translate(${r.x} ${r.y})${transform ? ` ${echapper(transform)}` : ''}"`;
      const point = vide || nom ? `<circle class="pm-repere-point" r="${nombre(rayon)}"/>` : '';
      let interieur = el.interieur;
      if (nom && place) {
        let a = avecClasse(retirer(nom.attrs, ['x', 'y', 'dx', 'dy', 'text-anchor']), 'pm-nom');
        a = avecClasse(a, `pm-nom-${place.ancre}`);
        interieur = `<text${a} x="${nombre(place.x)}" y="${nombre(place.y)}" data-place="${place.place}">${nom.contenu}</text>`;
      }
      return `<g${attrs}>${point}${interieur}</g>`;
    });
    if (elements.length) {
      let reste = '';
      let curseur = 0;
      for (const el of elements) { reste += corps.slice(curseur, el.debut); curseur = el.fin; }
      corps = reste + corps.slice(curseur) + poses.join('');
    }

    let attrs = retirer(attributs, ['viewBox', 'role']);
    attrs = avecClasse(attrs, 'pm-carte');
    const style = lire(attrs, 'style');
    attrs = retirer(attrs, ['style']) + ` style="--pm-u: ${nombre(u)}px;${style ? ` ${style}` : ''}"`;
    const fondGroupe = fond.length || encarts.length ? `<g class="pm-carte-fond">${fond.join('')}${encarts.join('')}</g>` : '';
    return `<svg${attrs} viewBox="${vb.join(' ')}" role="img">${fondGroupe}${listes.join('')}${corps}</svg>`;
  });
  return { html: sortie, erreurs, cartes: [...utilisees] };
}

/** Recherche d'un lieu dans les fonds livrés : pays, régions, villes (sans accents ni casse), 12 au plus. */
function chercher(texte) {
  const n = plat(texte);
  const resultats = [];
  const candidats = [];
  for (const nom of CARTES) {
    const carte = chargerCarte(nom);
    if (!carte) continue;
    for (const p of carte.pays) {
      candidats.push(p.nom);
      if (p.code.toLowerCase() === n || plat(p.nom).includes(n)) resultats.push({ sorte: nom === 'france' ? 'region' : 'pays', carte: nom, code: p.code, nom: p.nom });
    }
  }
  const villes = chargerVilles();
  if (villes) {
    for (const v of villes.villes) {
      candidats.push(v.nom);
      if (plat(v.nom).includes(n)) resultats.push({ sorte: 'ville', carte: v.pays === 'FR' ? 'france ou monde' : 'monde', nom: v.nom, pays: v.pays, lat: v.lat, lon: v.lon, ...(v.chefLieu ? { chefLieu: v.chefLieu } : {}) });
    }
  }
  // Correspondance exacte d'abord, puis l'ordre des fichiers (pays par code, villes par population).
  const exact = (x) => Number(plat(x.nom) === n || (x.code || '').toLowerCase() === n);
  resultats.sort((a, b) => exact(b) - exact(a));
  return { resultats: resultats.slice(0, 12), proches: resultats.length ? [] : P.proches(texte, [...new Set(candidats)]) };
}

const donneesPresentes = () => CARTES.some((n) => chargerCarte(n));

module.exports = { cartesConnues, chargerCarte, chargerVilles, resoudreLieu, cadreDe, disposer, viewBoxDe, preparerCartes, placerNoms, largeurTexte, chercher, boiteChemin, donneesPresentes, SANS_DONNEES };
