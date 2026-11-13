'use strict';
/* Pulse Motion – mesurer le rendu d'une vidéo contre son style (spec S11, 5.4). Mesures pures sur les images du regard
 * (les captures des instants stables, celles de la planche « téléphone ») : couleurs et leur part de surface, clé, contraste,
 * chaleur, part saturée, teintes, main (trait, grain, trame, bords). Réutilise palette(), mesurerMain(), resumerMain() et
 * profilStyle() d'imiter-analyse.js sans les changer. Les médias de la personne (images, écrans, cartes, Lottie, films) sont
 * masqués d'après leurs boîtes relevées dans la page à l'instant de chaque image. Aucune horloge, aucun hasard non semé :
 * mêmes images, mêmes chiffres.
 *
 *   BOITES_MEDIAS                         script de page -> [[x, y, l, h]] (px de la fenêtre) des médias visibles
 *   mesurerImages(images, attendu?)       images : [{ png | { largeur, hauteur, canaux, donnees }, masques?, scene?, t? }]
 *                                         -> mesure (sans attendu : pas de couleurs étrangères)
 *   attenduDuStyle({ projet, deroule, dossierStyle }) -> { style, ton, couleurs, teintesMax, chaleur, saturee, main }
 *   avisStyle(mesure, attendu, { style })  -> [problèmes] (style-couleur-etrangere, style-teintes, style-cle, style-main,
 *                                         style-terne ; gravité info : des avis, jamais bloquants)
 *   resumeStyle({ mesure, attendu, avis, empreinte }) -> contenu de sortie/regard/style.json
 *   avisDuRegard(projet, html)            avis de sortie/regard/style.json s'il porte l'empreinte de la page, sinon []
 *   effetHorsStyle({ deroule, scenesHtml, dossierStyle, fiche, effets }) -> [problèmes] (effet-hors-style)
 *   mesurerStyleProjet({ dossier, navigateur?, dossierStyles? }) -> Promise<{ ok, mesure, attendu, avis, empreinte }>
 *
 * Idées de cinecode (MIT, © 2026 Sarp Yıldız) : scripts/direction.py (measure, compare : k-moyennes, chaleur, un seul ton),
 * scripts/make.py (colour_line, cliche_line), references/typography.md § 11 (règle enfreignable si elle est nommée,
 * appliquée partout et vérifiée) ; code écrit à neuf, mesures de Pulse Motion. */
const fs = require('node:fs');
const path = require('node:path');
const A = require('./imiter-analyse.js');
const SEUILS = require('../seuils.json');

/** Largeur des images des couleurs (moyenne par surfaces, comme imiter) et grand côté des images de la main. */
const LARGEUR_COULEURS = A.LARGEUR;
const COTE_MAIN = 640;
/** Chroma OKLab sous laquelle une surface est neutre (chaleur) ; teintes : chroma et part minimales, écart d'angle. */
const NEUTRE = 0.04;
const TEINTE_CHROMA = 0.05;
const TEINTE_PART = 0.02;
const TEINTE_ANGLE = 30;
/** Mélanges entre deux couleurs attendues (transparences, bords adoucis, encres posées l'une sur l'autre). */
const PAS_MELANGE = 10;

const arrondi = (x, n = 3) => (x === null || x === undefined ? null : Math.round(x * 10 ** n) / 10 ** n);
const pourcent = (x) => `${String(Math.round(x * 100)).replace('.', ',')} %`;
const HEX6 = /^#[0-9a-f]{6}$/i;

// Médias de la personne : ses images, ses écrans de logiciel, ses cartes, ses animations Lottie, ses films.
const MEDIAS = 'img, video, .pm-ecran, [data-carte], [data-lottie], [data-film]';
// Boîtes des médias relevées dans la page : [[x, y, l, h]] en px de la fenêtre, masquées de toutes les mesures.
const BOITES_MEDIAS = `(function () {
  var L = window.innerWidth, H = window.innerHeight, medias = [];
  function ajouter(liste, b) {
    var x0 = Math.max(0, b.left), y0 = Math.max(0, b.top), x1 = Math.min(L, b.right), y1 = Math.min(H, b.bottom);
    if (x1 - x0 >= 1 && y1 - y0 >= 1) liste.push([Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0), Math.ceil(y1 - y0)]);
  }
  document.querySelectorAll('#pm-scene ${MEDIAS}').forEach(function (el) {
    if (el.tagName === 'IMG' && !(el.complete && el.naturalWidth > 0)) return;
    var s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return;
    ajouter(medias, el.getBoundingClientRect());
  });
  return medias;
})()`;

/** PNG ou image décodée -> { largeur, hauteur, rgb } (3 octets par point ; une image transparente est posée sur du noir). */
function versRgb(image) {
  const d = Buffer.isBuffer(image) ? require('./png.js').decoder(image) : image;
  if (d.canaux === 3) return { largeur: d.largeur, hauteur: d.hauteur, rgb: d.donnees };
  const n = d.largeur * d.hauteur;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = d.donnees[i * 4 + 3] / 255;
    rgb[i * 3] = Math.round(d.donnees[i * 4] * a); rgb[i * 3 + 1] = Math.round(d.donnees[i * 4 + 1] * a); rgb[i * 3 + 2] = Math.round(d.donnees[i * 4 + 2] * a);
  }
  return { largeur: d.largeur, hauteur: d.hauteur, rgb };
}

/** Points d'une image réduite (l × h, depuis L × H) couverts par une boîte masquée : 1 masqué, 0 gardé. */
function masqueReduit(masques, L, H, l, h) {
  const m = new Uint8Array(l * h);
  const kx = L / l, ky = H / h;
  for (const [x, y, w, hh] of masques || []) {
    const a = Math.max(0, Math.floor(x / kx)), b = Math.min(l, Math.ceil((x + w) / kx));
    const c = Math.max(0, Math.floor(y / ky)), d = Math.min(h, Math.ceil((y + hh) / ky));
    for (let yy = c; yy < d; yy++) for (let xx = a; xx < b; xx++) m[yy * l + xx] = 1;
  }
  return m;
}

/**
 * Gris dont chaque boîte (px de l'image d'origine, échelle kx, ky) est bouchée par la médiane du cadre d'un point qui
 * l'entoure, lu avant tout bouchage : une ligne de texte posée sur un bandeau prend la couleur du bandeau, sans bord.
 */
function boucher(gris, l, h, liste, kx, ky) {
  if (!liste.length) return gris;
  const r = new Uint8Array(gris);
  for (const [x, y, w, hh] of liste) {
    const a = Math.max(0, Math.floor(x / kx)), b = Math.min(l, Math.ceil((x + w) / kx));
    const c = Math.max(0, Math.floor(y / ky)), d = Math.min(h, Math.ceil((y + hh) / ky));
    if (a >= b || c >= d) continue;
    const cadre = [];
    for (let xx = a - 1; xx <= b; xx++) for (const yy of [c - 1, d]) if (xx >= 0 && xx < l && yy >= 0 && yy < h) cadre.push(gris[yy * l + xx]);
    for (let yy = c; yy < d; yy++) for (const xx of [a - 1, b]) if (xx >= 0 && xx < l) cadre.push(gris[yy * l + xx]);
    const v = cadre.length ? A.mediane(cadre) : 128;
    for (let yy = c; yy < d; yy++) r.fill(v, yy * l + a, yy * l + b);
  }
  return r;
}

/** Couleur en OKLab, mise en cache par valeur RVB. */
function oklabEnCache(cache, r, g, b) {
  const cle = (r << 16) | (g << 8) | b;
  let v = cache.get(cle);
  if (!v) { v = A.oklab(r, g, b); cache.set(cle, v); }
  return v;
}

const versRvb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Points attendus en OKLab : chaque couleur attendue, le noir et le blanc (ombres et éclaircies), et leurs mélanges deux à
 *  deux (en RVB, comme une transparence posée sur une autre couleur). */
function pointsAttendus(couleurs) {
  const base = [...new Set([...couleurs.map((c) => c.toLowerCase()), '#000000', '#ffffff'])].filter((c) => HEX6.test(c)).map(versRvb);
  const pts = base.map(([r, g, b]) => A.oklab(r, g, b));
  for (let i = 0; i < base.length; i++) {
    for (let j = i + 1; j < base.length; j++) {
      for (let k = 1; k < PAS_MELANGE; k++) {
        const t = k / PAS_MELANGE;
        const m = base[i].map((v, n) => Math.round(v * (1 - t) + base[j][n] * t));
        pts.push(A.oklab(m[0], m[1], m[2]));
      }
    }
  }
  return pts;
}

const ecart = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const ecartAuPlusProche = (lab, pts) => { let m = Infinity; for (const q of pts) { const d = ecart(lab, q); if (d < m) m = d; } return m; };

/** Teintes distinctes de la palette : couleurs non neutres d'au moins 2 % de surface, regroupées à 30° d'angle de teinte. */
function teintes(couleurs) {
  const groupes = [];
  for (const c of couleurs.filter((x) => x.chroma >= TEINTE_CHROMA && x.part >= TEINTE_PART).sort((a, b) => b.part - a.part)) {
    const angle = (Math.atan2(c.oklab[2], c.oklab[1]) * 180 / Math.PI + 360) % 360;
    const proche = groupes.find((g) => { const d = Math.abs(g - angle) % 360; return Math.min(d, 360 - d) < TEINTE_ANGLE; });
    if (proche === undefined) groupes.push(angle);
  }
  return groupes.length;
}

/**
 * images : [{ png (Buffer) | image décodée, masques: [[x, y, l, h]] (BOITES_MEDIAS), scene?, t? }] ; attendu : celui d'attenduDuStyle (ou
 * { couleurs }) pour chercher les couleurs étrangères.
 * -> { images, couleurs: [{ hex, part }], fond, cle, luminanceMediane, contraste, chaleur, saturee, teintes, main, masquee,
 *      etrangeres: [{ hex, part, scene, t, ecart }] }
 */
function mesurerImages(images, attendu = null) {
  const cache = new Map();
  const gardees = [];
  const mains = [];
  let total = 0, satures = 0, chauds = 0, sommeB = 0, masques = 0, points = 0;
  for (const im of images) {
    const src = versRgb(im.png || im.image || im);
    const petite = A.reduire(src.rgb, src.largeur, src.hauteur, LARGEUR_COULEURS);
    const medias = im.masques || [];
    const masque = masqueReduit(medias, src.largeur, src.hauteur, petite.largeur, petite.hauteur);
    const n = petite.largeur * petite.hauteur;
    let k = 0;
    for (let i = 0; i < n; i++) if (!masque[i]) k++;
    points += n; masques += n - k;
    if (!k) continue;
    const rgb = new Uint8Array(k * 3);
    for (let i = 0, j = 0; i < n; i++) {
      if (masque[i]) continue;
      const r = petite.rgb[i * 3], g = petite.rgb[i * 3 + 1], b = petite.rgb[i * 3 + 2];
      rgb[j++] = r; rgb[j++] = g; rgb[j++] = b;
      const lab = oklabEnCache(cache, r, g, b);
      const c = Math.hypot(lab[1], lab[2]);
      if (c > SEUILS.styleSaturee) satures++;
      if (c >= NEUTRE) { chauds++; sommeB += lab[2]; }
    }
    total += k;
    // Points gardés, en une rangée : palette() n'en lit que les couleurs (et le bord de la première image pour le fond).
    gardees.push({ rgb, largeur: k, hauteur: 1, scene: im.scene || null, t: im.t === undefined ? null : im.t });
    // Main : gris à 640 px au plus sur le grand côté ; les médias bouchés par le gris qui les entoure.
    const lm = Math.max(1, Math.round(src.largeur * Math.min(1, COTE_MAIN / Math.max(src.largeur, src.hauteur))));
    const moyen = A.reduire(src.rgb, src.largeur, src.hauteur, lm);
    const nm = moyen.largeur * moyen.hauteur;
    const gris = new Uint8Array(nm);
    for (let i = 0; i < nm; i++) gris[i] = Math.round(0.299 * moyen.rgb[i * 3] + 0.587 * moyen.rgb[i * 3 + 1] + 0.114 * moyen.rgb[i * 3 + 2]);
    mains.push(A.mesurerMain(boucher(gris, moyen.largeur, moyen.hauteur, medias, src.largeur / moyen.largeur, src.hauteur / moyen.hauteur), moyen.largeur, moyen.hauteur));
  }
  if (!total) return { images: images.length, masquee: 1, couleurs: [], fond: null, cle: null, luminanceMediane: null, contraste: null, chaleur: null, saturee: null, teintes: 0, main: null, etrangeres: [] };
  const pal = A.palette(gardees, { graine: 1 });
  const etrangeres = attendu && Array.isArray(attendu.couleurs) ? couleursEtrangeres(gardees, attendu.couleurs, cache) : [];
  const main = A.resumerMain(mains);
  return {
    images: images.length,
    masquee: arrondi(masques / points),
    couleurs: pal.couleurs.map((c) => ({ hex: c.hex, part: c.part })),
    fond: pal.fond,
    cle: pal.cle,
    luminanceMediane: pal.luminanceMediane,
    contraste: pal.contraste,
    chaleur: chauds ? arrondi(sommeB / chauds) : null,
    saturee: arrondi(satures / total),
    teintes: teintes(pal.couleurs),
    main: main && { trait: main.trait.present, traitEpais: main.trait.present ? main.trait.largeurPourcent > 1 : null, grain: main.grain.visible, trame: main.trame.presente,
      doux: main.bords.doux, nets: main.bords.nets, aplats: !main.trait.present, phrase: main.phrase },
    etrangeres,
  };
}

/**
 * Couleurs étrangères, image par image : une couleur de la palette de l'image (k-moyennes de palette()) qui couvre au moins
 * 4 % (`styleEtrangerePart`) de l'image (médias masqués exclus) et dont les points sont à plus de 0,10 (`styleEtrangereEcart`)
 * de toute couleur attendue et de leurs mélanges. Les points sont comptés un à un : un centre de k-moyennes tombé entre deux
 * couleurs attendues ne fait pas une couleur étrangère.
 */
function couleursEtrangeres(gardees, couleurs, cache) {
  const pts = pointsAttendus(couleurs);
  const distances = new Map();
  const loin = (r, g, b) => {
    const cle = (r << 16) | (g << 8) | b;
    let d = distances.get(cle);
    if (d === undefined) { d = ecartAuPlusProche(oklabEnCache(cache, r, g, b), pts); distances.set(cle, d); }
    return d > SEUILS.styleEtrangereEcart;
  };
  const r = [];
  for (const im of gardees) {
    const pal = A.palette([im], { graine: 1 });
    const centres = pal.couleurs.map((c) => c.oklab);
    const candidates = pal.couleurs.map((c, i) => ({ c, i })).filter(({ c }) => c.part >= SEUILS.styleEtrangerePart && ecartAuPlusProche(c.oklab, pts) > SEUILS.styleEtrangereEcart);
    if (!candidates.length) continue;
    const comptes = new Array(centres.length).fill(0);
    for (let p = 0; p < im.largeur; p++) {
      const rr = im.rgb[p * 3], gg = im.rgb[p * 3 + 1], bb = im.rgb[p * 3 + 2];
      const lab = oklabEnCache(cache, rr, gg, bb);
      let m = 0, dm = Infinity;
      for (let c = 0; c < centres.length; c++) { const d = ecart(lab, centres[c]); if (d < dm) { dm = d; m = c; } }
      if (candidates.some((x) => x.i === m) && loin(rr, gg, bb)) comptes[m]++;
    }
    for (const { c, i } of candidates) {
      const part = comptes[i] / im.largeur;
      if (part >= SEUILS.styleEtrangerePart) r.push({ hex: c.hex, part: arrondi(part), scene: im.scene, t: im.t, ecart: arrondi(ecartAuPlusProche(c.oklab, pts)) });
    }
  }
  return r;
}

/** Couleurs #rrggbb écrites dans un texte (#rgb et #rrggbbaa ramenées à #rrggbb). */
function hexDuTexte(texte) {
  const r = [];
  for (const m of String(texte || '').matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g)) {
    const h = m[1].toLowerCase();
    r.push(`#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)}`);
  }
  return r;
}

const lireJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };
const lireTexte = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

/**
 * Ce qu'on attend du style pour cette vidéo : couleurs résolues de la charte pour le ton (couleurs lisibles dérivées
 * comprises), couleurs fixes du style (style.css et scènes toutes faites), identite.couleur.mesure, main (profilStyle).
 */
function attenduDuStyle({ projet, deroule, dossierStyle }) {
  const { charteFinale, variablesDerivees } = require('./fusion-charte.js');
  const charte = charteFinale(deroule, dossierStyle, projet);
  const identite = lireJSON(path.join(dossierStyle, 'identite.json')) || {};
  const deCharte = Object.values(charte.couleurs || {}).filter((c) => typeof c === 'string' && HEX6.test(c)).map((c) => c.toLowerCase());
  const derivees = hexDuTexte(variablesDerivees(charte.couleurs || {}).join('\n'));
  let fixes = hexDuTexte(lireTexte(path.join(dossierStyle, 'style.css')));
  try {
    for (const f of fs.readdirSync(path.join(dossierStyle, 'scenes')).filter((x) => x.endsWith('.html')).sort()) fixes = fixes.concat(hexDuTexte(lireTexte(path.join(dossierStyle, 'scenes', f))));
  } catch { /* style sans scènes */ }
  const m = (identite.couleur && identite.couleur.mesure) || {};
  return {
    style: identite.style || path.basename(dossierStyle),
    ton: charte.ton,
    couleurs: [...new Set([...deCharte, ...derivees, ...fixes])],
    teintesMax: Number.isInteger(m.teintesMax) ? m.teintesMax : null,
    chaleur: Array.isArray(m.chaleur) ? m.chaleur : null,
    saturee: Array.isArray(m.saturee) ? m.saturee : null,
    main: A.profilStyle(identite),
  };
}

/**
 * Traits de la main mesurée qui contredisent le profil du style. Comptent : une matière que le style n'a pas (du grain, une
 * trame, des bords doux) et l'absence de tout trait dans un style dessiné au trait. Ne comptent pas, d'après la mesure des
 * 20 vidéos témoins : l'absence d'un grain, d'une trame ou de bords doux que le style promet (à 640 px, une texture fine se
 * perd : le témoin de riso ne montre ni son grain ni sa trame), ni un trait dans un style sans trait (les lettres d'un texte
 * fin se mesurent comme un trait dessiné, dans tous les styles).
 */
function contradictionsMain(main, profil) {
  if (!main || !profil) return [];
  const r = [];
  if (!main.trait && profil.trait) r.push('aucun trait dessiné');
  if (main.grain && !profil.grain) r.push('du grain');
  if (main.trame && !profil.trame) r.push('une trame de points');
  if (main.doux && !profil.doux) r.push('des bords doux');
  return r;
}

/** Avis du style (gravité info : la personne est prévenue, rien n'est bloqué ; une charte peut s'écarter du style). */
function avisStyle(mesure, attendu, { style = attendu && attendu.style } = {}) {
  const r = [];
  if (!mesure || !attendu || !mesure.couleurs.length) return r;
  const nom = `le style « ${style} »`;
  for (const e of mesure.etrangeres || []) {
    r.push({ regle: 'style-couleur-etrangere', gravite: 'info', ...(e.scene ? { scene: e.scene } : {}),
      message: `${e.scene ? `Scène « ${e.scene} » : u` : 'U'}ne couleur (${e.hex}) couvre ${pourcent(e.part)} de l'image et n'appartient ni à ${nom} ni à la charte. Rien à faire si c'est voulu.`,
      consigne: `Couleur ${e.hex} à ${String(e.ecart).replace('.', ',')} (ΔE OKLab) de toute couleur attendue (charte du ton ${attendu.ton}, couleurs fixes du style, leurs mélanges) : reprendre --c-primaire, --c-accent, --c-texte ou --c-fond, ou la nommer comme entorse dans « entorses » du déroulé si elle est voulue.` });
  }
  if (attendu.teintesMax !== null && mesure.teintes > attendu.teintesMax) {
    r.push({ regle: 'style-teintes', gravite: 'info',
      message: `La vidéo montre ${mesure.teintes} teintes distinctes ; ${nom} en garde ${attendu.teintesMax} au plus. Rien à faire si c'est voulu.`,
      consigne: `${mesure.teintes} teintes mesurées (couleurs non neutres d'au moins 2 % de surface, à 30° d'écart), identite.couleur.mesure.teintesMax = ${attendu.teintesMax} : retirer une couleur hors charte.` });
  }
  if ((attendu.ton === 'clair' && mesure.cle === 'sombre') || (attendu.ton === 'sombre' && mesure.cle === 'claire')) {
    r.push({ regle: 'style-cle', gravite: 'info',
      message: `La vidéo est en ton ${attendu.ton}, mais ses images sont ${mesure.cle === 'sombre' ? 'sombres' : 'claires'} dans l'ensemble. Rien à faire si c'est voulu.`,
      consigne: `Clé mesurée ${mesure.cle} (luminance médiane ${String(mesure.luminanceMediane).replace('.', ',')}) pour le ton ${attendu.ton} : un fond plein ou un calque posé sur toute la scène contredit le ton ; reprendre --c-fond.` });
  }
  const contre = contradictionsMain(mesure.main, attendu.main);
  if (contre.length >= 2) {
    r.push({ regle: 'style-main', gravite: 'info',
      message: `Le rendu montre ${contre.join(', ')}, ce qui ne ressemble pas à la matière de ${nom}. Rien à faire si c'est voulu.`,
      consigne: `Main mesurée (${mesure.main.phrase}) contre le profil du style (trait ${attendu.main.trait}, grain ${attendu.main.grain}, trame ${attendu.main.trame}, doux ${attendu.main.doux}) : ${contre.length} traits contredits ; reprendre les classes et les modules du style (fiche § 2).` });
  }
  if (attendu.saturee && mesure.saturee !== null && mesure.saturee < attendu.saturee[0]) {
    r.push({ regle: 'style-terne', gravite: 'info',
      message: `Les couleurs vives couvrent ${pourcent(mesure.saturee)} de l'image ; ${nom} en montre d'habitude ${pourcent(attendu.saturee[0])} au moins. La vidéo paraît plus terne que son style. Rien à faire si c'est voulu.`,
      consigne: `Part saturée (chroma OKLab > ${String(SEUILS.styleSaturee).replace('.', ',')}) ${String(mesure.saturee).replace('.', ',')} sous identite.couleur.mesure.saturee[0] = ${String(attendu.saturee[0]).replace('.', ',')} : rendre leur place aux aplats --c-primaire et --c-accent.` });
  }
  return r;
}

/** Contenu de sortie/regard/style.json : court, lu par le critique (axe style). */
function resumeStyle({ mesure, attendu, avis, empreinte }) {
  const dedans = (v, plage) => (v === null || !plage ? null : v >= plage[0] && v <= plage[1]);
  return {
    version: 1, empreinte, style: attendu.style, ton: attendu.ton,
    mesure: {
      images: mesure.images, partMasquee: mesure.masquee, couleurs: mesure.couleurs.slice(0, 6), cle: mesure.cle, contraste: mesure.contraste,
      chaleur: mesure.chaleur, saturee: mesure.saturee, teintes: mesure.teintes, main: mesure.main ? mesure.main.phrase : null,
    },
    attendu: { teintesMax: attendu.teintesMax, chaleur: attendu.chaleur, saturee: attendu.saturee,
      main: { trait: attendu.main.trait, grain: attendu.main.grain, trame: attendu.main.trame, doux: attendu.main.doux } },
    dansLaPlage: { chaleur: dedans(mesure.chaleur, attendu.chaleur), saturee: dedans(mesure.saturee, attendu.saturee) },
    etrangeres: mesure.etrangeres,
    avis: avis.map((a) => ({ regle: a.regle, ...(a.scene ? { scene: a.scene } : {}), message: a.message, consigne: a.consigne })),
  };
}

/** Avis de sortie/regard/style.json, s'il porte l'empreinte de la page donnée (sinon la mesure est d'une autre version). */
function avisDuRegard(projet, html) {
  const j = lireJSON(path.join(projet, 'sortie', 'regard', 'style.json'));
  if (!j || !Array.isArray(j.avis)) return [];
  const { empreintePage } = require('./relecture.js');
  if (j.empreinte !== empreintePage(html)) return [];
  return j.avis.map((a) => ({ ...a, gravite: 'info' }));
}

// --- Effets hors du style (5.4 point 4) ---------------------------------------------------------------------------

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Effets sensibles : nom, mots qui le citent (gestes, entorse), shader conseillé qui le permet. */
const EFFETS_SENSIBLES = {
  particules: { mots: /particul|poussiere|etincelle|confetti/, shader: null, dit: 'des particules' },
  glitch: { mots: /glitch/, shader: 'glitch', dit: 'l\'effet « glitch »' },
  aberration: { mots: /aberration/, shader: 'aberration', dit: 'l\'aberration de couleurs' },
  'grille-neon': { mots: /grille[ -]neon|neon/, shader: 'grille-neon', dit: 'la grille néon' },
  lueur: { mots: /lueur|halo/, shader: 'halo', dit: 'une lueur sur plusieurs éléments' },
  rebond: { mots: /rebond/, shader: null, dit: 'des rebonds sur plusieurs éléments' },
};

/** Noms des shaders cités par le déroulé (transitions, post-traitements), en profondeur. */
function shadersDuDeroule(x, r = []) {
  if (Array.isArray(x)) x.forEach((v) => shadersDuDeroule(v, r));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'shader' && typeof v === 'string') r.push(v); else shadersDuDeroule(v, r); }
  return r;
}

/** Classes communes du moteur qui rebondissent (moteur/mouvements.css, courbe bounce). Les classes du style lui-même (la
 *  chute rebondie d'energique) font partie du style : elles ne comptent pas. */
const CLASSES_REBOND = new Set(['pm-m-chute']);

/** Éléments d'un fragment HTML : [{ attributs (texte), classes }]. */
function balises(html) {
  return [...String(html || '').matchAll(/<([a-zA-Z][\w-]*)(\s[^<>]*?)?\/?>/g)].map((m) => {
    const attr = m[2] || '';
    const cl = (/\sclass\s*=\s*"([^"]*)"/.exec(attr) || /\sclass\s*=\s*'([^']*)'/.exec(attr) || [])[1] || '';
    return { attr, classes: cl.split(/\s+/).filter(Boolean) };
  });
}

/**
 * effet-hors-style (avis) : un effet sensible (particules, shaders glitch, aberration, grille-neon, lueur sur plus d'un
 * élément d'une scène, rebond sur plus d'un élément d'une scène) que le style ne cite ni dans ses gestes (§ 8 de sa fiche)
 * ni dans shaders.conseilles. Une entorse nommée dans le déroulé (« entorses »: [{ quoi, pourquoi }]) qui le cite lève
 * l'avis ; le critique vérifie qu'elle est appliquée dans toute la vidéo.
 * fiche : texte de la fiche du style ; effets : effets de particules de l'assemblage ([{ scene }]).
 */
function effetHorsStyle({ deroule, scenesHtml = {}, dossierStyle, fiche = '', effets = [] }) {
  const identite = lireJSON(path.join(dossierStyle, 'identite.json')) || {};
  const conseilles = (identite.shaders && Array.isArray(identite.shaders.conseilles)) ? identite.shaders.conseilles : [];
  const gestes = sansAccents(require('./fiche-style.js').section(String(fiche || ''), '8. Gestes natifs'));
  const entorses = (Array.isArray(deroule.entorses) ? deroule.entorses : []).map((e) => sansAccents(e && e.quoi));
  const vus = new Map(); // effet -> scène où il apparaît d'abord
  const voir = (effet, scene) => { if (!vus.has(effet)) vus.set(effet, scene || null); };
  for (const e of effets) voir('particules', e.scene);
  for (const s of deroule.scenes || []) {
    for (const n of shadersDuDeroule([s.transition, s.post])) if (EFFETS_SENSIBLES[n]) voir(n, s.id);
    const html = scenesHtml[s.id] || '';
    for (const m of html.matchAll(/\sdata-shader\s*=\s*["']?([a-z0-9-]+)/g)) if (EFFETS_SENSIBLES[m[1]]) voir(m[1], s.id);
    const elements = balises(html);
    const lueurs = elements.filter((b) => b.classes.includes('pm-v-lueur') || /\sdata-shader\s*=\s*["']?halo\b/.test(b.attr)).length;
    if (lueurs > 1) voir('lueur', s.id);
    const rebondit = elements.filter((b) => b.classes.some((c) => CLASSES_REBOND.has(c)) || /\b(?:bounce|elastic)-(?:in|out|inout)\b|--ease-(?:bounce|elastic)/.test(b.attr)).length;
    if (rebondit > 1) voir('rebond', s.id);
  }
  for (const n of shadersDuDeroule(deroule.post)) if (EFFETS_SENSIBLES[n]) voir(n, null);
  const r = [];
  for (const [effet, scene] of vus) {
    const e = EFFETS_SENSIBLES[effet];
    if (e.mots.test(gestes) || (e.shader && conseilles.includes(e.shader))) continue;
    if (entorses.some((q) => e.mots.test(q) || q.includes(effet))) continue;
    r.push({ regle: 'effet-hors-style', gravite: 'info', ...(scene ? { scene } : {}),
      message: `${scene ? `Scène « ${scene} » : ` : ''}${e.dit} : ce n'est pas un effet du style « ${deroule.style} », et un effet emprunté à un autre style affaiblit la vidéo. Rien à faire si c'est un choix : il sera alors gardé dans toute la vidéo.`,
      consigne: `Effet « ${effet} » absent des gestes (§ 8) et de shaders.conseilles du style « ${deroule.style} » : le retirer, ou le nommer dans le déroulé, "entorses": [{ "quoi": "${effet}", "pourquoi": "…" }], et l'appliquer dans toute la vidéo (le critique le vérifie).` });
  }
  return r;
}

// --- Mesure d'un projet (tests, calibration des styles) ----------------------------------------------------------

/**
 * Capture fidèle des instants stables de chaque scène (comme la planche « téléphone » du regard), boîtes des médias, puis
 * mesure, attendu et avis. -> Promise<{ ok, mesure, attendu, avis, empreinte, message? }>
 */
async function mesurerStyleProjet({ dossier, navigateur, dossierStyles, largeur, hauteur }) {
  const os = require('node:os');
  const { assembler } = require('../assembler.js');
  const { lireDeroule } = require('./deroule.js');
  const { ouvrirCapture } = require('./capture-fidele.js');
  const { trouverStyle } = require('../styles.js');
  const { empreintePage } = require('./relecture.js');
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: erreurs.join(' ') };
  const a = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!a.ok) return { ok: false, message: a.erreurs.map((e) => e.message).join(' ') };
  const nav = navigateur === undefined ? require('./navigateur.js').trouverNavigateur() : navigateur;
  if (!nav) return { ok: false, message: 'Chrome ou Edge introuvable.' };
  const [rl, rh] = deroule.format.ratio.split(':').map(Number);
  const L = largeur || (rl >= rh ? 1280 : Math.round(1280 * rl / rh));
  const H = hauteur || (rl >= rh ? Math.round(1280 * rh / rl) : 1280);
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-mesure-style-'));
  const page = path.join(travail, 'video.html');
  fs.writeFileSync(page, a.html, 'utf8');
  let capture;
  try {
    capture = await ouvrirCapture({ fichierHtml: page, largeur: L, hauteur: H, navigateur: nav, gpu: require('../export-fidele.js').avecEffets(projet, deroule), delai: 60000 });
    const ips = deroule.format.ips || 30;
    const scenes = capture.minutage.scenes;
    const images = [];
    for (const [i, s] of scenes.entries()) {
      const suivante = scenes[i + 1];
      const fin = suivante && suivante.debut < s.fin ? suivante.debut : s.fin;
      const t = Math.min(Math.max(0, Math.round(Math.max(s.debut, fin - 0.1) * ips) / ips), capture.duree - 1 / ips);
      await capture.capturer(t);
      const png = await capture.capturer(t);
      images.push({ png, masques: await capture.evaluer(BOITES_MEDIAS), scene: s.id, t });
    }
    const dossierStyle = trouverStyle(deroule.style, dossierStyles).dossier;
    const attendu = attenduDuStyle({ projet, deroule, dossierStyle });
    const mesure = mesurerImages(images, attendu);
    return { ok: true, mesure, attendu, avis: avisStyle(mesure, attendu), empreinte: empreintePage(a.html) };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    if (capture) await capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

module.exports = { BOITES_MEDIAS, MEDIAS, mesurerImages, attenduDuStyle, avisStyle, resumeStyle, avisDuRegard, effetHorsStyle, mesurerStyleProjet,
  contradictionsMain, pointsAttendus, hexDuTexte, teintes, EFFETS_SENSIBLES, CLASSES_REBOND };
