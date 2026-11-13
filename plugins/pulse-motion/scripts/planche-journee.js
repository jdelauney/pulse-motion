#!/usr/bin/env node
'use strict';
/* Pulse Motion – planche de la journée (spec S11, 5.11 point 2) : une scène à data-journee rendue à 7 heures du jour et de la
 * nuit, τ = 0,24 (aube), 0,3 (matin), 0,5 (midi), 0,72 (heure dorée), 0,75 (bascule de l'encre), 0,8 (nuit), 0,95 (fin de
 * nuit), toutes au même instant de la scène (τ forcé par M.journee.forcer). Pour vérifier que l'encre se lit partout, sauf
 * pendant la bascule, et que les lampes s'allument.
 *
 *   node scripts/planche-journee.js <dossier> --journee [--scene <id>] [--de <s>]
 *     (pulse-motion planche <dossier> --journee …) : sortie/planche/journee-<scène>.png
 * --scene : la scène (sinon la première qui porte data-journee) ; --de : instant de la scène, en secondes depuis son début
 * (par défaut, son milieu). Vignettes de 360 px de large en 16:9 (côté long de 340 px dans les autres formats), une planche
 * de 1 568 px et 1,15 Mpx au plus.
 * Résumé JSON : { ok, planche, scene, t, taus, images, vignettes: [{ tau, legende, variables }] } ; code 1 avec un message en
 * français en cas d'échec.
 * Idée de line-art-animation (MIT, © 2026 JDhruv14 : references/verify.md, balayage de la journée), réécrite.
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
const J = require('../moteur/journee.js');

const HEURES = Object.freeze([[0.24, 'aube'], [0.3, 'matin'], [0.5, 'midi'], [0.72, 'heure dorée'], [0.75, 'bascule de l\'encre'], [0.8, 'nuit'], [0.95, 'fin de nuit']]);
const TAUS = Object.freeze(HEURES.map((h) => h[0]));
const PLANCHE_COTE = 1568;
const PLANCHE_AIRE = 1150000;
const ECART = 12;
const LEGENDE = 24;
const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };
const virgule = (x) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Taille d'une vignette : 360 px de large en 16:9, côté long de 340 px sinon. */
function tailleVignette(ratio) {
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  if (a / b >= 16 / 9 - 1e-9) return [360, Math.round(360 * b / a)];
  return a >= b ? [340, Math.round(340 * b / a)] : [Math.round(340 * a / b), 340];
}

/** Colonnes de la planche : autant que 1 568 px en tiennent (avec les tailles de tailleVignette, 1,15 Mpx au plus). */
function colonnesJournee(l, n = TAUS.length) { return Math.max(1, Math.min(n, Math.floor((PLANCHE_COTE - ECART) / (l + ECART)))); }

/** Taille de la planche [largeur, hauteur]. */
function taillePlanche(l, h, n = TAUS.length) {
  const c = colonnesJournee(l, n);
  return [c * (l + ECART) + ECART, Math.ceil(n / c) * (h + LEGENDE + ECART) + ECART];
}

function pageJournee(vignettes, l, h, colonnes) {
  const figures = vignettes.map((v) => `<figure><img src="${v.fichier}" alt="" width="${l}" height="${h}"><figcaption>${v.legende}</figcaption></figure>`).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
html, body { margin: 0; background: #ecebe7; color: #1d1d1b; font: 600 14px/1.2 Arial, Helvetica, sans-serif; }
.planche { display: grid; grid-template-columns: repeat(${colonnes}, ${l}px); gap: ${ECART}px; padding: ${ECART}px; }
figure { margin: 0; } img { display: block; width: ${l}px; height: ${h}px; }
figcaption { height: ${LEGENDE - 4}px; padding-top: 4px; white-space: nowrap; overflow: hidden; }
</style></head><body><div class="planche">
${figures}
</div></body></html>`;
}

// Dans la page : la scène à journée demandée (ou la première).
const TROUVER = (scene) => `(function () {
  var voulue = ${JSON.stringify(scene || null)}, s = null;
  document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (x) {
    if (!s && (!voulue || x.getAttribute('data-scene') === voulue) && x.hasAttribute('data-journee')) s = x;
  });
  return s ? s.getAttribute('data-scene') : null;
})()`;
const VARIABLES = (scene) => `(function () {
  var voulue = ${JSON.stringify(scene)}, out = {};
  document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) {
    if (s.getAttribute('data-scene') === voulue) ${JSON.stringify(J.NOMS)}.forEach(function (n) { out[n] = s.style.getPropertyValue(n); });
  });
  return out;
})()`;

/**
 * plancheJournee({ dossier, scene?, de?, dossierStyles?, navigateur? })
 * -> Promise<{ ok, planche, scene, t, taus, images, vignettes, message? }>
 */
async function plancheJournee({ dossier, scene = null, de = null, dossierStyles, navigateur = trouverNavigateur() }) {
  if (de !== null && (!Number.isFinite(de) || de < 0)) return { ok: false, message: 'Planche de la journée : l\'instant (--de) doit être un nombre de secondes depuis le début de la scène, 0 ou plus (ex. 2).' };
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (scene && !deroule.scenes.some((s) => s.id === scene)) return { ok: false, message: `Scène inconnue : ${scene} ; donner l'identifiant d'une scène du déroulé.` };
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  if (!Array.isArray(assemblage.groupes) || !assemblage.groupes.includes('journee')) {
    return { ok: false, message: 'Planche de la journée : aucune scène ne porte data-journee (l\'heure de la scène) ; la poser sur la section d\'une scène (ex. data-journee="0.62-0.95").' };
  }
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : les images n\'ont pas pu être prises.' };
  const [l, h] = tailleVignette(deroule.format.ratio);
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-journee-'));
  const pageVideo = path.join(travail, 'video.html');
  fs.writeFileSync(pageVideo, assemblage.html, 'utf8');
  let lisible = null;
  let capture = null;
  try {
    try {
      capture = await ouvrirCapture({ fichierHtml: pageVideo, largeur: l, hauteur: h, navigateur, gpu: avecEffets(projet, deroule), delai: 60000,
        ouvrir: async (o) => { lisible = await ouvrirPage(o); return lisible; } });
    } catch (e) { return { ok: false, message: `Les images n'ont pas pu être prises (${e.message}).` }; }
    const id = await capture.evaluer(TROUVER(scene));
    if (!id) return { ok: false, message: scene ? `Planche de la journée : la scène « ${scene} » ne porte pas data-journee.` : 'Planche de la journée : aucune scène ne porte data-journee.' };
    const s = capture.minutage.scenes.find((x) => x.id === id);
    const longueur = Math.min(s.fin, capture.minutage.duree) - s.debut;
    if (de !== null && de > longueur + 1e-6) return { ok: false, message: `La scène « ${id} » dure ${virgule(longueur)} s : l'instant demandé (${virgule(de)} s) est après sa fin.` };
    const ips = await capture.evaluer('(M.donnees && M.donnees.format && M.donnees.format.ips) || 30');
    // Une image exacte de l'horloge.
    const t = Math.round((s.debut + (de === null ? longueur / 2 : de)) * ips) / ips;
    const vignettes = [];
    for (const [i, [tau, nom]] of HEURES.entries()) {
      await capture.evaluer(`M.journee.forcer(${tau}), true`);
      // Deux captures du même instant, la seconde gardée (comme les planches de regard).
      await capture.capturer(t);
      const png = await capture.capturer(t);
      const variables = await capture.evaluer(VARIABLES(id));
      const fichier = `j${i + 1}.png`;
      fs.writeFileSync(path.join(travail, fichier), png);
      vignettes.push({ tau, legende: `τ ${virgule(tau)} · ${nom}`, variables, fichier });
    }
    await capture.evaluer('M.journee.forcer(null), true');
    const colonnes = colonnesJournee(l);
    const [L, H] = taillePlanche(l, h);
    const html = path.join(travail, 'journee.html');
    fs.writeFileSync(html, pageJournee(vignettes, l, h, colonnes), 'utf8');
    await lisible.envoyer('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: 1, mobile: false });
    await lisible.aller(pathToFileURL(html).href);
    await lisible.evaluer('Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })');
    const dossierPlanche = path.join(projet, 'sortie', 'planche');
    fs.mkdirSync(dossierPlanche, { recursive: true });
    const nom = `journee-${id.replace(/[^A-Za-z0-9_-]+/g, '-')}.png`;
    fs.writeFileSync(path.join(dossierPlanche, nom), await lisible.capturer({ rapide: false }));
    return { ok: true, planche: `sortie/planche/${nom}`, scene: id, t: Math.round((t - s.debut) * 1000) / 1000, taus: [...TAUS], images: vignettes.length,
      vignette: [l, h], colonnes, vignettes: vignettes.map(({ tau, legende, variables }) => ({ tau, legende, variables })) };
  } finally {
    if (capture) await capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const val = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
  const AVEC_VALEUR = ['--scene', '--de'];
  const dossier = args.find((x, k) => !x.startsWith('--') && !AVEC_VALEUR.includes(args[k - 1])) || '.';
  const de = val('--de');
  plancheJournee({ dossier, scene: val('--scene') || null, de: de === undefined ? null : Number(String(de).replace(',', '.')) })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
      (e) => { console.log(JSON.stringify({ ok: false, message: e.message }, null, 2)); process.exit(1); });
}

module.exports = { plancheJournee, tailleVignette, colonnesJournee, taillePlanche, HEURES, TAUS, PLANCHE_COTE, PLANCHE_AIRE };
