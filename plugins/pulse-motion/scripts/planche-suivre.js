#!/usr/bin/env node
'use strict';
/* Pulse Motion – planche qui suit un élément (spec S11, 5.11 point 1) : des bandes d'images recadrées autour de l'élément qui
 * bouge (un personnage, ou un sélecteur), agrandies quatre fois sans lissage, prises à pas exacts de l'horloge. Pour regarder
 * de près une marche (un pied qui glisse) ou une interaction (une main qui saute) ; sert au critique et à l'animateur.
 *
 *   node scripts/planche-suivre.js <dossier> --suivre <personnage|sélecteur> [--scene <id>] [--de <s>] [--duree <s>] [--pas <n>]
 *     (pulse-motion planche <dossier> --suivre …) : sortie/planche/suivre-<cible>.png (ou -N au-delà d'une planche).
 * Cible : le nom (data-personnage) ou l'id d'un personnage (son dessin, sans l'ombre), sinon un sélecteur CSS cherché dans les
 * scènes ; --scene choisit la scène (sinon la première où la cible existe). Fenêtre : --de (secondes depuis le début de la
 * scène, 0 par défaut), --duree (3 s au plus ; par défaut la scène, jusqu'à 3 s), --pas (en images ; par défaut, 16 images au
 * plus). Instants : des images exactes de l'horloge (k / ips, k entier).
 * Une première passe relève la boîte de l'élément ; la capture est refaite à une taille où il tient dans 80 px environ (300 à
 * 1 920 px de large). Le cadre, de taille fixe (la plus grande boîte et 20 % de marge de chaque côté), est centré sur la boîte de
 * l'élément à chaque image, puis agrandi quatre fois au plus proche voisin (aucun lissage) ; hors de l'image : gris.
 * Résumé JSON : { ok, planches, vignettes, ips, pas, instants, agrandissement, cadre: { largeur, hauteur }, capture: [l, h],
 *   colonnes, parPlanche, cadres: [{ t, image, boite: [x, y, l, h], centre: [x, y], coin }] } ; code 1 avec un message en français en cas d'échec.
 * Idée de line-art-animation (MIT, © 2026 JDhruv14 : references/verify.md, bandes agrandies qui suivent une figure), réécrite.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('./assembler.js');
const { lireDeroule } = require('./lib/deroule.js');
const { trouverNavigateur } = require('./lib/navigateur.js');
const { ouvrirCapture } = require('./lib/capture-fidele.js');
const { ouvrirPage } = require('./lib/cdp.js');
const { avecEffets } = require('./export-fidele.js');
const PNG = require('./lib/png.js');

const AGRANDISSEMENT = 4;
const DUREE_MAX = 3;
const IMAGES_DEFAUT = 16;
const CIBLE_PX = 80;
const MARGE = 0.2;
const LARGEUR_MIN = 300;
const LARGEUR_MAX = 1920;
const GRAND_COTE = 1280;
const PLANCHE_COTE = 1568;
const PLANCHE_AIRE = 1150000;
const ECART = 12;
const LEGENDE = 24;
const GRIS = 128;
const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };
const virgule = (x) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Nom de fichier tiré de la cible (« #a > .b » → « a-b »). */
const nomCible = (cible) => String(cible).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'element';

/** Vérifie la demande -> message d'erreur en français, ou null. */
function verifierSuivre({ cible, de, duree, pas }) {
  if (!cible || typeof cible !== 'string') return 'Planche qui suit : donner l\'élément à suivre (--suivre <personnage ou sélecteur>, ex. --suivre passant).';
  if (!Number.isFinite(de) || de < 0) return 'Planche qui suit : le début (--de) doit être un nombre de secondes depuis le début de la scène, 0 ou plus (ex. 1).';
  if (duree !== null && (!Number.isFinite(duree) || duree <= 0)) return 'Planche qui suit : la durée (--duree) doit être un nombre de secondes plus grand que 0 (ex. 1,5).';
  if (duree !== null && duree > DUREE_MAX + 1e-9) return `Planche qui suit : une fenêtre de ${virgule(duree)} s est trop longue ; ${DUREE_MAX} s au plus. Demander une fenêtre plus courte.`;
  if (pas !== null && (!Number.isInteger(pas) || pas < 1)) return 'Planche qui suit : le pas (--pas) doit être un nombre entier d\'images, 1 ou plus (ex. 2 : une image sur deux).';
  return null;
}

/** Numéros d'image (k, instant k / ips) de la fenêtre [debut + de, debut + de + duree[, une sur pas. */
function imagesFenetre({ debut, de, duree, pas, ips }) {
  const r = [];
  for (let k = Math.ceil((debut + de) * ips - 1e-6); k / ips < debut + de + duree - 1e-6; k += pas) r.push(k);
  return r;
}

/** Cadre de taille l × h centré sur la boîte [x, y, bl, bh] : coin entier, centre exact à un demi-pixel près. */
function cadreAutour(boite, l, h) {
  const [x, y, bl, bh] = boite;
  const gauche = Math.round(x + bl / 2 - l / 2), haut = Math.round(y + bh / 2 - h / 2);
  return { x: gauche, y: haut, l, h, centre: [gauche + l / 2, haut + h / 2] };
}

/** Recadre une image décodée (png.decoder) et l'agrandit k fois au plus proche voisin -> { largeur, hauteur, canaux: 4, donnees }. */
function recadrerAgrandir(image, cadre, k = AGRANDISSEMENT) {
  const L = cadre.l * k, H = cadre.h * k, out = new Uint8Array(L * H * 4), c = image.canaux;
  for (let Y = 0; Y < H; Y++) {
    const ys = cadre.y + Math.floor(Y / k);
    for (let X = 0; X < L; X++) {
      const xs = cadre.x + Math.floor(X / k), o = (Y * L + X) * 4;
      if (xs < 0 || ys < 0 || xs >= image.largeur || ys >= image.hauteur) { out[o] = out[o + 1] = out[o + 2] = GRIS; out[o + 3] = 255; continue; }
      const i = (ys * image.largeur + xs) * c;
      out[o] = image.donnees[i]; out[o + 1] = image.donnees[i + 1]; out[o + 2] = image.donnees[i + 2]; out[o + 3] = c === 4 ? image.donnees[i + 3] : 255;
    }
  }
  return { largeur: L, hauteur: H, canaux: 4, donnees: out };
}

/** Mise en page : colonnes et rangées par planche, vignettes à leur taille (1 568 px et 1,15 Mpx au plus, une au moins). */
function miseEnPageSuivre(l, h) {
  const colonnes = Math.max(1, Math.floor((PLANCHE_COTE - ECART) / (l + ECART)));
  let rangees = Math.max(1, Math.floor((PLANCHE_COTE - ECART) / (h + LEGENDE + ECART)));
  const aire = (r) => (colonnes * (l + ECART) + ECART) * (r * (h + LEGENDE + ECART) + ECART);
  while (rangees > 1 && aire(rangees) > PLANCHE_AIRE) rangees--;
  return { colonnes, rangees };
}

function pageSuivre(vignettes, l, h, colonnes) {
  const figures = vignettes.map((v) => `<figure><img src="${v.fichier}" alt="" width="${l}" height="${h}"><figcaption>${v.legende}</figcaption></figure>`).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
html, body { margin: 0; background: #ecebe7; color: #1d1d1b; font: 600 14px/1.2 Arial, Helvetica, sans-serif; }
.planche { display: grid; grid-template-columns: repeat(${colonnes}, ${l}px); gap: ${ECART}px; padding: ${ECART}px; }
figure { margin: 0; } img { display: block; width: ${l}px; height: ${h}px; image-rendering: pixelated; }
figcaption { height: ${LEGENDE - 4}px; padding-top: 4px; white-space: nowrap; overflow: hidden; }
</style></head><body><div class="planche">
${figures}
</div></body></html>`;
}

// Dans la page : trouver la cible (personnage par nom ou id, sinon sélecteur), puis sa boîte à l'instant courant.
const TROUVER = (cible, scene) => `(function () {
  var cible = ${JSON.stringify(cible)}, voulue = ${JSON.stringify(scene || null)};
  var scenes = Array.prototype.filter.call(document.querySelectorAll('[data-scene]'), function (s) { return !voulue || s.getAttribute('data-scene') === voulue; });
  for (var i = 0; i < scenes.length; i++) {
    var s = scenes[i], el = null, perso = false;
    Array.prototype.forEach.call(s.querySelectorAll('[data-personnage]'), function (p) {
      if (!el && (p.id === cible || p.getAttribute('data-personnage') === cible)) { el = p; perso = true; }
    });
    if (!el) { try { el = s.querySelector(cible); } catch (e) { return { erreur: 'selecteur' }; } }
    if (el) { window.__pmSuivi = { el: el, perso: perso }; return { scene: s.getAttribute('data-scene'), perso: perso }; }
  }
  return null;
})()`;
const BOITE = `(function () {
  var x = window.__pmSuivi;
  if (!x) return null;
  var e = x.perso ? (x.el.querySelector('svg > g') || x.el) : x.el, r = e.getBoundingClientRect();
  return [r.left, r.top, r.width, r.height];
})()`;

function tailleDe(ratio, largeur) {
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  return [largeur, Math.round(largeur * b / a)];
}

/**
 * plancheSuivre({ dossier, cible, scene?, de?, duree?, pas?, dossierStyles?, navigateur? })
 * -> Promise<{ ok, planches, vignettes, ips, pas, instants, agrandissement, cadre, capture, colonnes, cadres, message? }>
 */
async function plancheSuivre({ dossier, cible, scene = null, de = 0, duree = null, pas = null, dossierStyles, navigateur = trouverNavigateur() }) {
  const refus = verifierSuivre({ cible, de, duree, pas });
  if (refus) return { ok: false, message: refus };
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (scene && !deroule.scenes.some((s) => s.id === scene)) return { ok: false, message: `Scène inconnue : ${scene} ; donner l'identifiant d'une scène du déroulé.` };
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : les images n\'ont pas pu être prises.' };
  const ratio = deroule.format.ratio;
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-suivre-'));
  const pageVideo = path.join(travail, 'video.html');
  fs.writeFileSync(pageVideo, assemblage.html, 'utf8');
  const gpu = avecEffets(projet, deroule);
  let lisible = null;
  const ouvrir = (largeur) => ouvrirCapture({ fichierHtml: pageVideo, largeur, hauteur: tailleDe(ratio, largeur)[1], navigateur, gpu, delai: 60000,
    ouvrir: async (o) => { lisible = await ouvrirPage(o); return lisible; } });
  let capture = null;
  try {
    // 1. Cible, fenêtre et boîtes à 1 280 px sur le grand côté.
    const l0 = a >= b ? GRAND_COTE : Math.round(GRAND_COTE * a / b);
    try { capture = await ouvrir(l0); } catch (e) { return { ok: false, message: `Les images n'ont pas pu être prises (${e.message}).` }; }
    const trouve = await capture.evaluer(TROUVER(cible, scene));
    if (!trouve) return { ok: false, message: `Élément introuvable : « ${cible} » n'est ni un personnage (nom ou identifiant) ni un sélecteur d'un élément ${scene ? `de la scène « ${scene} »` : 'des scènes'}.` };
    if (trouve.erreur) return { ok: false, message: `Planche qui suit : « ${cible} » n'est ni un personnage ni un sélecteur valable (ex. #logo, .titre, passant).` };
    const ips = await capture.evaluer('(M.donnees && M.donnees.format && M.donnees.format.ips) || 30');
    const s = capture.minutage.scenes.find((x) => x.id === trouve.scene);
    const longueur = Math.min(s.fin, capture.minutage.duree) - s.debut;
    if (de >= longueur - 1e-6) return { ok: false, message: `La scène « ${s.id} » dure ${virgule(longueur)} s : la fenêtre demandée commence après sa fin.` };
    const d = duree === null ? Math.min(DUREE_MAX, longueur - de) : Math.min(duree, longueur - de);
    const toutes = imagesFenetre({ debut: s.debut, de, duree: d, pas: 1, ips });
    const p = pas === null ? Math.max(1, Math.ceil(toutes.length / IMAGES_DEFAUT)) : pas;
    const images = imagesFenetre({ debut: s.debut, de, duree: d, pas: p, ips });
    const avant = [];
    for (const k of images) avant.push(await capture.evaluer(`(async function () { await M.seek(${k / ips}); return ${BOITE}; })()`));
    const plus = Math.max(1, ...avant.map((x) => (x ? Math.max(x[2], x[3]) : 0)));
    // 2. Capture à la taille où l'élément tient dans CIBLE_PX.
    const largeur = Math.max(LARGEUR_MIN, Math.min(LARGEUR_MAX, Math.round(l0 * CIBLE_PX / plus)));
    await capture.fermer().catch(() => {});
    capture = await ouvrir(largeur);
    await capture.evaluer(TROUVER(cible, trouve.scene));
    const prises = [];
    for (const k of images) {
      // Deux captures du même instant, la seconde gardée (comme les planches de regard).
      await capture.capturer(k / ips);
      const png = await capture.capturer(k / ips);
      prises.push({ k, png, boite: await capture.evaluer(BOITE) });
    }
    const visibles = prises.filter((x) => x.boite && x.boite[2] > 0 && x.boite[3] > 0);
    if (!visibles.length) return { ok: false, message: `« ${cible} » n'est visible à aucun instant de la fenêtre demandée (scène « ${s.id} »).` };
    // Cadre de taille fixe : la plus grande boîte et la marge ; une image où l'élément est caché garde le cadre précédent.
    const cl = Math.ceil(Math.max(...visibles.map((x) => x.boite[2])) * (1 + 2 * MARGE));
    const ch = Math.ceil(Math.max(...visibles.map((x) => x.boite[3])) * (1 + 2 * MARGE));
    const vl = cl * AGRANDISSEMENT, vh = ch * AGRANDISSEMENT;
    const cadres = [];
    const vignettes = [];
    let derniere = visibles[0].boite;
    for (const [i, x] of prises.entries()) {
      const boite = x.boite && x.boite[2] > 0 && x.boite[3] > 0 ? x.boite : derniere;
      derniere = boite;
      const cadre = cadreAutour(boite, cl, ch);
      const fichier = `s${String(i + 1).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(travail, fichier), PNG.encoder(recadrerAgrandir(PNG.decoder(x.png), cadre)));
      const t = Math.round((x.k / ips - s.debut) * 1000) / 1000;
      cadres.push({ t, image: x.k, boite: boite.map((v) => Math.round(v * 100) / 100), centre: cadre.centre, coin: [cadre.x, cadre.y] });
      vignettes.push({ fichier, legende: `${i + 1} · ${t.toFixed(2).replace('.', ',')} s` });
    }
    const mise = miseEnPageSuivre(vl, vh);
    const parPlanche = mise.colonnes * mise.rangees;
    const dossierPlanche = path.join(projet, 'sortie', 'planche');
    fs.mkdirSync(dossierPlanche, { recursive: true });
    const base = `suivre-${nomCible(cible)}`;
    for (const f of fs.readdirSync(dossierPlanche)) if (f === `${base}.png` || new RegExp(`^${base}-\\d+\\.png$`).test(f)) fs.rmSync(path.join(dossierPlanche, f), { force: true });
    const planches = [];
    const lots = [];
    for (let i = 0; i < vignettes.length; i += parPlanche) lots.push(vignettes.slice(i, i + parPlanche));
    for (const [n, lot] of lots.entries()) {
      const colonnes = Math.min(mise.colonnes, lot.length);
      const rangees = Math.ceil(lot.length / mise.colonnes);
      const L = colonnes * (vl + ECART) + ECART;
      const H = rangees * (vh + LEGENDE + ECART) + ECART;
      const html = path.join(travail, `suivre-${n + 1}.html`);
      fs.writeFileSync(html, pageSuivre(lot, vl, vh, colonnes), 'utf8');
      await lisible.envoyer('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: 1, mobile: false });
      await lisible.aller(pathToFileURL(html).href);
      await lisible.evaluer('Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })');
      const nom = lots.length === 1 ? `${base}.png` : `${base}-${n + 1}.png`;
      fs.writeFileSync(path.join(dossierPlanche, nom), await lisible.capturer({ rapide: false }));
      planches.push(`sortie/planche/${nom}`);
    }
    return { ok: true, planches, vignettes: vignettes.length, scene: s.id, ips, pas: p, instants: cadres.map((c) => c.t), agrandissement: AGRANDISSEMENT,
      cadre: { largeur: cl, hauteur: ch }, capture: tailleDe(ratio, largeur), colonnes: mise.colonnes, parPlanche, cadres };
  } finally {
    if (capture) await capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const val = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
  const nombre = (x, defaut) => (x === undefined ? defaut : Number(String(x).replace(',', '.')));
  const AVEC_VALEUR = ['--suivre', '--scene', '--de', '--duree', '--pas'];
  const dossier = args.find((x, k) => !x.startsWith('--') && !AVEC_VALEUR.includes(args[k - 1])) || '.';
  plancheSuivre({ dossier, cible: val('--suivre'), scene: val('--scene') || null, de: nombre(val('--de'), 0), duree: nombre(val('--duree'), null), pas: nombre(val('--pas'), null) })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
      (e) => { console.log(JSON.stringify({ ok: false, message: e.message }, null, 2)); process.exit(1); });
}

module.exports = { plancheSuivre, verifierSuivre, imagesFenetre, cadreAutour, recadrerAgrandir, miseEnPageSuivre, nomCible, AGRANDISSEMENT };
