'use strict';
/* Pulse Motion – cartes géographiques côté Node (spec S9, 5.10) : fonds de carte de cartes/ (Natural Earth, préparés par le
 * mainteneur : outils/cartes/preparer.js), recherche d'un lieu, et carte posée à l'assemblage.
 *
 *   <svg data-carte="monde" data-carte-pays="FR,DE,ES" data-carte-cadre="auto">
 *     <path data-pays="FR" data-start="0.4"></path>          (facultatif : un pays listé qu'on anime ; son tracé est posé ici)
 *     <g data-repere="Lyon"></g>  <g data-repere="45.76,4.84"><text data-texte="ville" y="-2"></text></g>
 *     <path data-liaison="Paris→New York" data-start="1" class="pm-m-trace"></path>
 *   </svg>
 *
 * cartesConnues() -> ['monde', 'france'] ; chargerCarte(nom) -> carte | null (fichier absent) ; chargerVilles() -> villes | null.
 * chercher(texte) -> [{ sorte: 'pays'|'region'|'ville', carte, code?, nom, … }] (sans accents ni casse) ; proches.
 * resoudreLieu(carte, valeur, villes) -> { ok, x, y, boite?, nom } | { ok: false, regle, message } : « lat,lon », code ou nom
 *   d'un pays (ou d'une région), nom d'une ville.
 * cadreDe({ carte, cadre, zones, points }) -> { boite } | { erreur } ; cadre : auto (zones listées et points + 10 %, sinon toute la
 *   carte), monde ou tout, un code, ou un continent (europe, afrique, ameriques, asie, oceanie : carte du monde seulement).
 * preparerCartes(html, { scene }) -> { html, erreurs, cartes: [noms] } : chaque <svg data-carte> reçoit viewBox, classe
 *   pm-carte, --pm-u (1 % de la largeur du cadre, pour les tailles en unités de carte), le fond (pm-pays-fond) et les pays
 *   listés (pm-pays) qui touchent le cadre, les repères (translate, point par défaut) et les liaisons (arc, pathLength="100").
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

function cadreDe({ carte, cadre = 'auto', zones = [], points = [] }) {
  const toute = [0, 0, carte.largeur, carte.hauteur];
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

function preparerCartes(html, { scene } = {}) {
  const erreurs = [];
  const utilisees = new Set();
  const sortie = String(html).replace(SVG_CARTE, (tout, attributs, g, nom, fin, interieur = '') => {
    const signaler = (regle, message) => erreurs.push({ regle, gravite: 'erreur', scene, element: nom, message: `Scène « ${scene} », carte « ${nom} » : ${message}` });
    if (!CARTES.includes(nom)) {
      const proches = P.proches(nom, CARTES);
      signaler('carte-inconnue', `carte inconnue${proches.length ? ` ; ${P.phrase(proches)}` : ''} (cartes : ${CARTES.join(', ')}).`);
      return tout;
    }
    const carte = chargerCarte(nom);
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
    const cadre = cadreDe({ carte, cadre: lire(attributs, 'data-carte-cadre') || 'auto', zones, points });
    if (cadre.erreur) { signaler('carte-invalide', cadre.erreur); return tout; }
    if (fautes) return tout;
    utilisees.add(nom);
    const vb = viewBoxDe(cadre.boite);
    const u = vb[2] / 100;
    const garde = (z) => K.seCroisent(z.tout, cadre.boite);
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
    const encarts = (carte.encarts || []).filter((e) => K.seCroisent(e.cadre, cadre.boite))
      .map((e) => `<rect class="pm-encart" x="${e.cadre[0]}" y="${e.cadre[1]}" width="${nombre(e.cadre[2] - e.cadre[0])}" height="${nombre(e.cadre[3] - e.cadre[1])}" rx="${nombre(u)}"/>`);
    const listes = zones.filter((z) => !declares.has(z.code)).map((z) => `<path id="pays-${z.code}" class="pm-pays" data-pays="${z.code}" d="${z.d}"/>`);

    // Repères : translate vers le point ; un repère vide reçoit un point.
    corps = corps.replace(/<g\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-repere\s*=\s*(["'])([^"']*)\2(?:[^>"']|"[^"]*"|'[^']*')*?)>(\s*<\/g>)?/gi, (t, a, g2, v, vide) => {
      const r = lieux.get(v);
      const transform = lire(a, 'transform');
      let attrs = avecClasse(retirer(a, ['transform']), 'pm-repere');
      attrs += ` transform="translate(${r.x} ${r.y})${transform ? ` ${echapper(transform)}` : ''}"`;
      return `<g${attrs}>${vide !== undefined ? `<circle class="pm-repere-point" r="${nombre(u * 0.9)}"/></g>` : ''}`;
    });
    // Liaisons : arc calculé, longueur 100 pour le tracé (#011).
    corps = corps.replace(/<path\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-liaison\s*=\s*(["'])([^"']*)\2(?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi, (t, a, g2, v, ferme) => {
      const [de, vers] = v.split(/\s*(?:→|->)\s*/);
      const courbure = Number(lire(a, 'data-liaison-courbure'));
      const d = K.arc(lieux.get(de), lieux.get(vers), Number.isFinite(courbure) && lire(a, 'data-liaison-courbure') !== null ? courbure : 0.25);
      let attrs = avecClasse(retirer(a, ['d', 'pathLength']), 'pm-liaison');
      return `<path${attrs} d="${d}" pathLength="100"${ferme ? '/' : ''}>`;
    });

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

module.exports = { cartesConnues, chargerCarte, chargerVilles, resoudreLieu, cadreDe, viewBoxDe, preparerCartes, chercher, boiteChemin, donneesPresentes, SANS_DONNEES };
