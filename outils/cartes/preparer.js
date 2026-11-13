#!/usr/bin/env node
'use strict';
/* Pulse Motion – outil du mainteneur (hors du plugin installé) : prépare les fonds de carte embarqués dans
 * plugins/pulse-motion/cartes/ à partir des fichiers GeoJSON de Natural Earth, téléchargés à la main (spec S9, 5.10 ;
 * adresses et versions dans plugins/pulse-motion/cartes/PROVENANCE.md).
 *
 *   node outils/cartes/preparer.js --pays <ne_110m_admin_0_countries.geojson>
 *        [--departements <ne_10m_admin_1_states_provinces.geojson>] [--champ-departement iso_3166_2]
 *        [--villes <ne_110m_populated_places.geojson>] [--villes-detail <ne_10m_populated_places.geojson>]
 *        [--sortie <dossier>] [--tolerance 0.5] [--aire-min 1] [--version-ne 5.1.1]
 *
 * Écrit monde.json (pays, Equal Earth, boîte de 1 000 unités de large), france.json (13 régions métropolitaines en conique
 * conforme de Lambert, parallèles 44° et 49° N comme Lambert-93, et 5 régions d'outre-mer en encarts) et villes.json (lieux
 * peuplés au 1:110 M et chefs-lieux de région français). Chaque fichier porte ses paramètres de projection : le moteur
 * (plugins/pulse-motion/moteur/cartes.js, dont l'outil reprend les formules) projette les repères de la même façon.
 *
 * Simplification de Visvalingam (aire effective sous la tolérance, en unités² de la carte), faite sur les arcs partagés :
 * une frontière commune à deux pays (ou deux régions) est simplifiée une seule fois, sans jour ni chevauchement entre voisins.
 * Les petites îles sous l'aire minimale disparaissent (la plus grande partie de chaque territoire reste). Les régions
 * françaises naissent des départements de Natural Earth fusionnés par région (table de 2016), par suppression des bords
 * communs. Coordonnées au dixième, chemins relatifs.
 *
 * Idée tirée de styles/caption-news/demo/tools/map_prep.py de Lemo-Opuscar (MIT) : projection précalculée dans une boîte de
 * 1 000 unités. Code nouveau. Node pur, aucun réseau.
 */
const fs = require('node:fs');
const path = require('node:path');
const C = require(path.join(__dirname, '..', '..', 'plugins', 'pulse-motion', 'moteur', 'cartes.js'));
const { normaliser } = require(path.join(__dirname, '..', '..', 'plugins', 'pulse-motion', 'moteur', 'proches.js'));

const LARGEUR = 1000;
const r1 = (v) => Math.round(v * 10) / 10;

// Régions de 2016 : code court, nom, chef-lieu, départements.
const REGIONS = [
  ['ARA', 'Auvergne-Rhône-Alpes', 'Lyon', '01 03 07 15 26 38 42 43 63 69 73 74'],
  ['BFC', 'Bourgogne-Franche-Comté', 'Dijon', '21 25 39 58 70 71 89 90'],
  ['BRE', 'Bretagne', 'Rennes', '22 29 35 56'],
  ['CVL', 'Centre-Val de Loire', 'Orléans', '18 28 36 37 41 45'],
  ['COR', 'Corse', 'Ajaccio', '2A 2B'],
  ['GES', 'Grand Est', 'Strasbourg', '08 10 51 52 54 55 57 67 68 88'],
  ['HDF', 'Hauts-de-France', 'Lille', '02 59 60 62 80'],
  ['IDF', 'Île-de-France', 'Paris', '75 77 78 91 92 93 94 95'],
  ['NOR', 'Normandie', 'Rouen', '14 27 50 61 76'],
  ['NAQ', 'Nouvelle-Aquitaine', 'Bordeaux', '16 17 19 23 24 33 40 47 64 79 86 87'],
  ['OCC', 'Occitanie', 'Toulouse', '09 11 12 30 31 32 34 46 48 65 66 81 82'],
  ['PDL', 'Pays de la Loire', 'Nantes', '44 49 53 72 85'],
  ['PAC', 'Provence-Alpes-Côte d\'Azur', 'Marseille', '04 05 06 13 83 84'],
  ['GUA', 'Guadeloupe', 'Basse-Terre', '971'],
  ['MTQ', 'Martinique', 'Fort-de-France', '972'],
  ['GUF', 'Guyane', 'Cayenne', '973'],
  ['REU', 'La Réunion', 'Saint-Denis', '974'],
  ['MYT', 'Mayotte', 'Mamoudzou', '976'],
].map(([code, nom, chefLieu, deps]) => ({ code, nom, chefLieu, departements: deps.split(' '), outreMer: deps.length === 3 }));
// Anciens codes ISO des régions d'outre-mer (certaines versions de Natural Earth).
const ALIAS_OUTRE_MER = { GP: '971', MQ: '972', GF: '973', RE: '974', YT: '976' };
const CONTINENTS = { europe: 'europe', africa: 'afrique', 'north america': 'ameriques', 'south america': 'ameriques', asia: 'asie', oceania: 'oceanie', antarctica: 'antarctique' };

/** Propriété d'un objet GeoJSON, sans tenir compte de la casse du nom (Natural Earth change de casse selon les fichiers). */
function prop(f, ...noms) {
  const p = (f && f.properties) || {};
  for (const n of noms) {
    const cle = Object.keys(p).find((k) => k.toLowerCase() === n.toLowerCase());
    if (cle !== undefined && p[cle] !== null && p[cle] !== undefined && p[cle] !== '' && String(p[cle]) !== '-99') return p[cle];
  }
  return null;
}

function lireGeoJSON(fichier) {
  const texte = fs.readFileSync(fichier, 'utf8');
  const d = JSON.parse(texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte);
  if (!d || !Array.isArray(d.features)) throw new Error(`${fichier} : ce n'est pas une collection GeoJSON (features).`);
  return d.features;
}

/** Polygones d'une géométrie : [[anneau extérieur, trous…]], chaque anneau ouvert (sans le point de fermeture), [lon, lat]. */
function polygones(g) {
  if (!g) return [];
  const liste = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return liste.map((poly) => poly.map((anneau) => {
    const pts = anneau.filter((p, i) => i === 0 || p[0] !== anneau[i - 1][0] || p[1] !== anneau[i - 1][1]);
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts;
  }).filter((a) => a.length >= 3));
}

const cleDe = (p) => `${p[0]},${p[1]}`;

function aire(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function centroide(pts) {
  let s = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = a.x * b.y - b.x * a.y;
    s += c; cx += (a.x + b.x) * c; cy += (a.y + b.y) * c;
  }
  if (Math.abs(s) < 1e-12) return { x: pts[0].x, y: pts[0].y };
  return { x: cx / (3 * s), y: cy / (3 * s) };
}

function boiteDe(pts) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) { b[0] = Math.min(b[0], p.x); b[1] = Math.min(b[1], p.y); b[2] = Math.max(b[2], p.x); b[3] = Math.max(b[3], p.y); }
  return b;
}

/**
 * Fusion des polygones d'une région (départements) : les bords présents deux fois (frontière intérieure) disparaissent, les
 * autres se rechaînent en anneaux. -> [[anneau]] (un anneau par polygone ; les trous éventuels deviennent des anneaux à part,
 * dessinés en evenodd comme les autres).
 */
function fusionner(polys) {
  const bords = new Map();
  const cleBord = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const points = new Map();
  for (const poly of polys) {
    for (const anneau of poly) {
      for (let i = 0; i < anneau.length; i++) {
        const a = anneau[i], b = anneau[(i + 1) % anneau.length];
        const ka = cleDe(a), kb = cleDe(b);
        points.set(ka, a); points.set(kb, b);
        const k = cleBord(ka, kb);
        if (bords.has(k)) bords.delete(k); else bords.set(k, [ka, kb]);
      }
    }
  }
  const suivants = new Map();
  for (const [ka, kb] of bords.values()) {
    if (!suivants.has(ka)) suivants.set(ka, []);
    suivants.get(ka).push(kb);
  }
  const anneaux = [];
  for (const depart of [...suivants.keys()].sort()) {
    while (suivants.get(depart) && suivants.get(depart).length) {
      const anneau = [depart];
      let k = suivants.get(depart).shift();
      let garde = 0;
      while (k !== depart && garde++ < 1e7) {
        anneau.push(k);
        const s = suivants.get(k);
        if (!s || !s.length) break;
        k = s.shift();
      }
      if (k === depart && anneau.length >= 3) anneaux.push(anneau.map((x) => points.get(x)));
    }
  }
  return anneaux.map((a) => [a]);
}

// --- Visvalingam sur une polyligne (extrémités fixes), tas binaire sur l'aire effective --------------------------------
function triangle(a, b, c) { return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2; }

function visvalingam(pts, tolerance, minimum = 2) {
  const n = pts.length;
  if (n <= Math.max(2, minimum)) return pts.slice();
  const prec = new Int32Array(n), suiv = new Int32Array(n), aires = new Float64Array(n), vivant = new Uint8Array(n).fill(1);
  for (let i = 0; i < n; i++) { prec[i] = i - 1; suiv[i] = i + 1; }
  aires[0] = aires[n - 1] = Infinity;
  for (let i = 1; i < n - 1; i++) aires[i] = triangle(pts[i - 1], pts[i], pts[i + 1]);
  // Tas de couples (aire, indice, version) ; une entrée périmée (aire changée) est ignorée à la sortie.
  const tas = [];
  const version = new Int32Array(n);
  const plusPetit = (i, j) => tas[i][0] < tas[j][0] || (tas[i][0] === tas[j][0] && tas[i][1] < tas[j][1]);
  const pousser = (e) => {
    tas.push(e);
    let i = tas.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!plusPetit(i, p)) break; [tas[i], tas[p]] = [tas[p], tas[i]]; i = p; }
  };
  const sortir = () => {
    const haut = tas[0];
    const dernier = tas.pop();
    if (tas.length) {
      tas[0] = dernier;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1, d = g + 1;
        let m = i;
        if (g < tas.length && plusPetit(g, m)) m = g;
        if (d < tas.length && plusPetit(d, m)) m = d;
        if (m === i) break;
        [tas[i], tas[m]] = [tas[m], tas[i]];
        i = m;
      }
    }
    return haut;
  };
  for (let i = 1; i < n - 1; i++) pousser([aires[i], i, 0]);
  let restants = n;
  let plancher = 0;
  while (tas.length && restants > minimum) {
    const [a, i, v] = sortir();
    if (!vivant[i] || v !== version[i]) continue;
    // Aire effective : jamais plus petite que celle du dernier point retiré (Visvalingam et Whyatt).
    const effective = Math.max(a, plancher);
    if (effective >= tolerance) break;
    plancher = effective;
    vivant[i] = 0;
    restants--;
    const p = prec[i], s = suiv[i];
    suiv[p] = s; prec[s] = p;
    for (const j of [p, s]) {
      if (j <= 0 || j >= n - 1 || !vivant[j]) continue;
      aires[j] = triangle(pts[prec[j]], pts[j], pts[suiv[j]]);
      version[j]++;
      pousser([aires[j], j, version[j]]);
    }
  }
  const sortie = [];
  for (let i = 0; i < n; i++) if (vivant[i]) sortie.push(pts[i]);
  return sortie;
}

/**
 * Simplification topologique : entites = [{ polys: [[anneau de { x, y, cle }]] }] -> mêmes entités, anneaux simplifiés.
 * Un point est une jonction s'il a plus de deux voisins (là où une frontière commune commence ou finit) ; chaque anneau se
 * coupe en arcs entre jonctions, et un arc commun à deux anneaux (dans un sens ou dans l'autre) est simplifié une fois.
 */
function simplifierTopologie(entites, tolerance) {
  const voisins = new Map();
  const ajouter = (k, v) => { if (!voisins.has(k)) voisins.set(k, new Set()); voisins.get(k).add(v); };
  for (const e of entites) for (const poly of e.polys) for (const a of poly) {
    for (let i = 0; i < a.length; i++) { ajouter(a[i].cle, a[(i + a.length - 1) % a.length].cle); ajouter(a[i].cle, a[(i + 1) % a.length].cle); }
  }
  const jonction = (p) => voisins.get(p.cle).size > 2;
  const faits = new Map();
  const simplifierArc = (arc, ferme) => {
    const cles = arc.map((p) => p.cle);
    const sens = cles.join(';');
    const inverse = cles.slice().reverse().join(';');
    const canonique = sens <= inverse ? sens : inverse;
    if (!faits.has(canonique)) {
      const base = sens <= inverse ? arc : arc.slice().reverse();
      faits.set(canonique, visvalingam(base, tolerance, ferme ? 4 : 2));
    }
    const s = faits.get(canonique);
    return sens <= inverse ? s : s.slice().reverse();
  };
  return entites.map((e) => ({
    ...e,
    polys: e.polys.map((poly) => poly.map((a) => {
      const debut = a.findIndex(jonction);
      if (debut < 0) {
        // Anneau sans jonction (île, ou enclave entière) : départ au plus petit point, sens canonique.
        let m = 0;
        for (let i = 1; i < a.length; i++) if (a[i].cle < a[m].cle) m = i;
        const tourne = a.slice(m).concat(a.slice(0, m));
        const ferme = tourne.concat([tourne[0]]);
        const s = simplifierArc(ferme, true);
        return s.slice(0, -1);
      }
      const tourne = a.slice(debut).concat(a.slice(0, debut), [a[debut]]);
      const sortie = [];
      let arc = [tourne[0]];
      for (let i = 1; i < tourne.length; i++) {
        arc.push(tourne[i]);
        if (jonction(tourne[i])) {
          const s = simplifierArc(arc, false);
          sortie.push(...(sortie.length ? s.slice(1) : s));
          arc = [tourne[i]];
        }
      }
      sortie.pop();
      return sortie;
    })),
  }));
}

const nombre = (v) => {
  const t = String(r1(v));
  return t === '-0' ? '0' : t.replace(/^(-?)0\./, '$1.');
};

/** Anneaux au dixième -> chemin relatif « M x y l dx dy … z », sans point répété. */
function chemin(anneaux) {
  let d = '';
  for (const a of anneaux) {
    const pts = [];
    for (const p of a) {
      const q = [r1(p.x), r1(p.y)];
      if (!pts.length || q[0] !== pts[pts.length - 1][0] || q[1] !== pts[pts.length - 1][1]) pts.push(q);
    }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    const morceaux = [];
    for (let i = 1; i < pts.length; i++) morceaux.push(nombre(pts[i][0] - pts[i - 1][0]), nombre(pts[i][1] - pts[i - 1][1]));
    let suite = '';
    for (const m of morceaux) suite += suite && !m.startsWith('-') ? ` ${m}` : m;
    d += `M${nombre(pts[0][0])} ${nombre(pts[0][1])}l${suite}z`;
  }
  return d;
}

/** Projette les polygones d'une entité (points { x, y, cle }) avec la projection donnée (fonction lon, lat -> { x, y }). */
function projeterPolys(polys, proj) {
  return polys.map((poly) => poly.map((a) => a.map((p) => ({ ...proj(p[0], p[1]), cle: cleDe(p) }))));
}

/**
 * Entrée d'un territoire : anneaux simplifiés, petites îles retirées (la plus grande garde toujours sa place), chemin,
 * centre (centroïde de la plus grande partie) et boîte des parties principales (20 % de l'aire de la plus grande au moins :
 * la Guyane ne tire pas le cadre de la France vers l'Amérique du Sud).
 */
function entree(polys, aireMin) {
  const parts = polys.map((poly) => ({ poly, aire: Math.abs(aire(poly[0])) })).filter((p) => p.poly[0].length >= 3);
  if (!parts.length) return null;
  const grande = parts.reduce((a, b) => (b.aire > a.aire ? b : a));
  const gardees = parts.filter((p) => p === grande || p.aire >= aireMin);
  const principales = gardees.filter((p) => p.aire >= grande.aire * 0.2);
  const anneaux = gardees.flatMap((p) => p.poly.filter((a, i) => i === 0 || Math.abs(aire(a)) >= aireMin));
  const c = centroide(grande.poly[0]);
  const b = C.unir(principales.map((p) => boiteDe(p.poly[0])));
  return { d: chemin(anneaux), centre: [r1(c.x), r1(c.y)], boite: b.map(r1) };
}

/** Échelle d'une projection pour une boîte brute [x0, y0, x1, y1] (y vers le haut) dans une largeur donnée. */
function echelle(projection, brute, largeur, dx = 0, dy = 0) {
  const k = largeur / (brute[2] - brute[0]);
  return { ...projection, k, x0: brute[0], y0: brute[3], dx, dy };
}

function boiteBrute(projection, polys) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const p of poly[0]) {
    const [x, y] = C.brut(projection, p[0], p[1]);
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b;
}

// L'outil travaille sur les points exacts (sans l'arrondi de projeter), puis arrondit le chemin final.
const projectionExacte = (proj) => (lon, lat) => {
  const [x, y] = C.brut(proj, lon, lat);
  return { x: (x - proj.x0) * proj.k + (proj.dx || 0), y: (proj.y0 - y) * proj.k + (proj.dy || 0) };
};

/** monde.json : pays au code ISO alpha-2 (ISO_A2_EH, puis ISO_A2) et nom français ; les autres territoires en fond seulement. */
function preparerMonde(features, { tolerance = 0.5, aireMin = 1, versionNE = null } = {}) {
  const ymax = C.brut({ type: 'equal-earth' }, 0, 90)[1];
  const xmax = C.brut({ type: 'equal-earth' }, 180, 0)[0];
  const proj = echelle({ type: 'equal-earth', lon0: 0 }, [-xmax, -ymax, xmax, ymax], LARGEUR);
  const avertissements = [];
  const entites = features.map((f) => {
    const code = prop(f, 'ISO_A2_EH', 'ISO_A2', 'WB_A2');
    const nom = prop(f, 'NAME_FR');
    const anglais = prop(f, 'NAME', 'ADMIN');
    if (code && !nom) avertissements.push(`${code} : pas de nom français (NAME_FR), nom anglais gardé (${anglais}).`);
    return {
      code: code ? String(code).toUpperCase() : null, nom: nom || anglais || String(code || ''), a3: prop(f, 'ADM0_A3', 'ISO_A3'),
      continent: CONTINENTS[String(prop(f, 'CONTINENT') || '').toLowerCase()] || null,
      polys: projeterPolys(polygones(f.geometry), projectionExacte(proj)),
    };
  }).filter((e) => e.polys.length);
  const simplifiees = simplifierTopologie(entites, tolerance);
  const pays = [];
  const autres = [];
  const vus = new Set();
  for (const e of simplifiees) {
    const x = entree(e.polys, aireMin);
    if (!x) continue;
    if (e.code && /^[A-Z]{2}$/.test(e.code) && !vus.has(e.code)) {
      vus.add(e.code);
      pays.push({ code: e.code, nom: e.nom, ...(e.continent ? { continent: e.continent } : {}), ...x });
    } else {
      avertissements.push(`${e.a3 || e.nom} : sans code ISO alpha-2, dessiné en fond seulement (jamais nommé « pays »).`);
      autres.push({ id: String(e.a3 || e.nom).replace(/[^A-Za-z0-9-]/g, ''), d: x.d, boite: x.boite });
    }
  }
  pays.sort((a, b) => a.code.localeCompare(b.code));
  const hauteur = r1(2 * ymax * proj.k);
  return { carte: { nom: 'monde', source: `Natural Earth 1:110 m, Admin 0 – Countries${versionNE ? ` ${versionNE}` : ''}`, licence: 'domaine public (Natural Earth)', largeur: LARGEUR, hauteur, projection: proj, pays, autres }, avertissements };
}

/** Numéro de département d'un objet admin-1 (FR-01, FR-2A, FR-971, ou ancien code d'outre-mer FR-GP…). */
function numeroDepartement(f, champ) {
  const v = String(prop(f, champ, 'iso_3166_2') || '');
  const m = /^FR-(\d{2}|2[AB]|97\d|[A-Z]{2})$/i.exec(v);
  if (!m) return null;
  const n = m[1].toUpperCase();
  return ALIAS_OUTRE_MER[n] || n;
}

/** france.json : régions fusionnées depuis les départements ; métropole de x = 200 à 1 000, encarts d'outre-mer à gauche. */
function preparerFrance(features, { tolerance = 0.5, aireMin = 1, champ = 'iso_3166_2', versionNE = null } = {}) {
  const avertissements = [];
  const parRegion = new Map(REGIONS.map((r) => [r.code, []]));
  const regionDe = new Map(REGIONS.flatMap((r) => r.departements.map((d) => [d, r.code])));
  for (const f of features) {
    const dep = numeroDepartement(f, champ);
    if (!dep || !regionDe.has(dep)) continue;
    parRegion.get(regionDe.get(dep)).push(...polygones(f.geometry));
  }
  const manquantes = REGIONS.filter((r) => !parRegion.get(r.code).length).map((r) => r.code);
  if (manquantes.length) avertissements.push(`Régions sans département trouvé : ${manquantes.join(', ')} (champ « ${champ} »).`);
  const fusion = new Map([...parRegion].map(([code, polys]) => [code, polys.length ? fusionner(polys) : []]));

  const metro = REGIONS.filter((r) => !r.outreMer && fusion.get(r.code).length);
  const lambert = { type: 'conique-conforme', p1: 44, p2: 49, lat0: 46.5, lon0: 3 };
  const brute = boiteBrute(lambert, metro.flatMap((r) => fusion.get(r.code)));
  const proj = echelle(lambert, brute, 800, 200, 10);
  const hauteur = r1((brute[3] - brute[1]) * proj.k + 20);
  // Encarts : cinq cases empilées à gauche (x de 10 à 180), chaque territoire centré dans la sienne.
  const outreMer = REGIONS.filter((r) => r.outreMer);
  const haut = (hauteur - 10) / outreMer.length;
  const encarts = [];
  outreMer.forEach((r, i) => {
    const polys = fusion.get(r.code);
    if (!polys.length) return;
    const lons = polys.flatMap((p) => p[0].map((q) => q[0]));
    const lats = polys.flatMap((p) => p[0].map((q) => q[1]));
    const lonlat = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    const locale = { type: 'equirectangulaire', lon0: (lonlat[0] + lonlat[2]) / 2, lat0: (lonlat[1] + lonlat[3]) / 2 };
    const b = boiteBrute(locale, polys);
    const cadre = [10, r1(10 + i * haut), 180, r1(10 + (i + 1) * haut - 10)];
    const k = Math.min((cadre[2] - cadre[0] - 16) / (b[2] - b[0]), (cadre[3] - cadre[1] - 16) / (b[3] - b[1]));
    const dx = cadre[0] + ((cadre[2] - cadre[0]) - (b[2] - b[0]) * k) / 2;
    const dy = cadre[1] + ((cadre[3] - cadre[1]) - (b[3] - b[1]) * k) / 2;
    const marge = 0.5;
    encarts.push({ code: r.code, nom: r.nom, lonlat: [lonlat[0] - marge, lonlat[1] - marge, lonlat[2] + marge, lonlat[3] + marge].map((v) => Math.round(v * 1000) / 1000),
      cadre, projection: { ...locale, k, x0: b[0], y0: b[3], dx, dy } });
  });
  const entites = REGIONS.filter((r) => fusion.get(r.code).length).map((r) => {
    const enc = encarts.find((e) => e.code === r.code);
    return { code: r.code, nom: r.nom, outreMer: r.outreMer, polys: projeterPolys(fusion.get(r.code), projectionExacte(enc ? enc.projection : proj)) };
  });
  const simplifiees = simplifierTopologie(entites, tolerance);
  const pays = simplifiees.map((e) => {
    const x = entree(e.polys, aireMin);
    return x ? { code: e.code, nom: e.nom, ...(e.outreMer ? { outreMer: true } : {}), ...x } : null;
  }).filter(Boolean);
  return { carte: { nom: 'france', source: `Natural Earth 1:10 m, Admin 1 – States, Provinces (départements fusionnés par région de 2016)${versionNE ? ` ${versionNE}` : ''}`,
    licence: 'domaine public (Natural Earth)', largeur: LARGEUR, hauteur, projection: proj, encarts, pays }, avertissements };
}

/** villes.json : lieux peuplés au 1:110 M (nom français, latitude, longitude, pays, population), plus les chefs-lieux de région. */
function preparerVilles(features, detail = [], { versionNE = null } = {}) {
  const avertissements = [];
  const lire = (f) => {
    const g = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
    const lat = Number(prop(f, 'LATITUDE') ?? (g && g[1]));
    const lon = Number(prop(f, 'LONGITUDE') ?? (g && g[0]));
    return { nom: String(prop(f, 'NAME_FR') || prop(f, 'NAME') || ''), pays: String(prop(f, 'ISO_A2', 'SOV_A2') || '').toUpperCase(),
      lat: Math.round(lat * 10000) / 10000, lon: Math.round(lon * 10000) / 10000, population: Number(prop(f, 'POP_MAX') || 0) };
  };
  const villes = features.map(lire).filter((v) => v.nom && Number.isFinite(v.lat) && Number.isFinite(v.lon));
  const parNom = (v) => `${normaliser(v.nom)}|${v.pays}`;
  const vues = new Set(villes.map(parNom));
  const detaillees = detail.map(lire);
  for (const r of REGIONS) {
    const trouvee = villes.find((v) => v.nom === r.chefLieu && v.pays === 'FR');
    if (trouvee) { trouvee.chefLieu = r.code; continue; }
    const d = detaillees.filter((v) => v.nom === r.chefLieu && (v.pays === 'FR' || v.pays === '')).sort((a, b) => b.population - a.population)[0];
    if (!d) { avertissements.push(`Chef-lieu « ${r.chefLieu} » (${r.code}) introuvable : ajouter --villes-detail.`); continue; }
    if (vues.has(parNom({ ...d, pays: 'FR' }))) continue;
    villes.push({ ...d, pays: 'FR', chefLieu: r.code });
  }
  villes.sort((a, b) => b.population - a.population || a.nom.localeCompare(b.nom));
  return { villes: { nom: 'villes', source: `Natural Earth 1:110 m, Populated Places${detail.length ? ' (chefs-lieux : 1:10 m)' : ''}${versionNE ? ` ${versionNE}` : ''}`, licence: 'domaine public (Natural Earth)', villes }, avertissements };
}

/** JSON compact, une entrée par ligne pour les listes (relecture et différences lisibles). */
function ecrireCompact(objet) {
  const lignes = [];
  for (const [cle, valeur] of Object.entries(objet)) {
    if (Array.isArray(valeur) && valeur.length && typeof valeur[0] === 'object') lignes.push(`${JSON.stringify(cle)}:[\n${valeur.map((v) => JSON.stringify(v)).join(',\n')}\n]`);
    else lignes.push(`${JSON.stringify(cle)}:${JSON.stringify(valeur)}`);
  }
  return `{${lignes.join(',\n')}}\n`;
}

function principal(args) {
  const valeur = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
  const sortie = path.resolve(valeur('--sortie') || path.join(__dirname, '..', '..', 'plugins', 'pulse-motion', 'cartes'));
  const options = { tolerance: Number(valeur('--tolerance') || 0.5), aireMin: Number(valeur('--aire-min') || 1), versionNE: valeur('--version-ne') || null };
  if (!valeur('--pays')) {
    console.error('Usage : node outils/cartes/preparer.js --pays <ne_110m_admin_0_countries.geojson> [--departements <ne_10m_admin_1_states_provinces.geojson>] [--villes <ne_110m_populated_places.geojson>] [--villes-detail <ne_10m_populated_places.geojson>] [--sortie <dossier>] [--tolerance 0.5] [--aire-min 1] [--version-ne 5.1.1]');
    return 2;
  }
  fs.mkdirSync(sortie, { recursive: true });
  const bilan = {};
  const ecrire = (nom, objet, avertissements) => {
    const texte = ecrireCompact(objet);
    fs.writeFileSync(path.join(sortie, nom), texte, 'utf8');
    bilan[nom] = { octets: Buffer.byteLength(texte, 'utf8'), avertissements };
  };
  const m = preparerMonde(lireGeoJSON(valeur('--pays')), options);
  ecrire('monde.json', m.carte, m.avertissements);
  if (valeur('--departements')) {
    const f = preparerFrance(lireGeoJSON(valeur('--departements')), { ...options, champ: valeur('--champ-departement') || 'iso_3166_2' });
    ecrire('france.json', f.carte, f.avertissements);
  }
  if (valeur('--villes')) {
    const v = preparerVilles(lireGeoJSON(valeur('--villes')), valeur('--villes-detail') ? lireGeoJSON(valeur('--villes-detail')) : [], options);
    ecrire('villes.json', v.villes, v.avertissements);
  }
  console.log(JSON.stringify(bilan, null, 2));
  return 0;
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2));

module.exports = { preparerMonde, preparerFrance, preparerVilles, simplifierTopologie, visvalingam, fusionner, chemin, ecrireCompact, REGIONS, principal };
