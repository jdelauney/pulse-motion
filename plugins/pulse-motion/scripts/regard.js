#!/usr/bin/env node
'use strict';
/* Pulse Motion – planches de regard : les images que Claude regarde avant de montrer la vidéo (spec « Regard et
 * réalisation », exigence 5.4). Capture fidèle (Chrome sans fenêtre, comme l'export fidèle), planches composées dans
 * une page HTML capturée par le même navigateur, et une fiche pour le relecteur.
 *
 *   node scripts/regard.js <dossier-du-projet> [--scenes a,b]      (pulse-motion planche <dossier> --regard [--scenes a,b])
 *   node scripts/regard.js <dossier> --cadence <id> --de <s> --duree <s> [--pas <n>]
 *                                                    (pulse-motion planche <dossier> <id> --de <s> --duree <s> [--pas <n>])
 *     planche image par image d'une scène (spec Mouvement vivant, 5.14) : sortie/planche/cadence-<id>.png (ou -N).
 *
 * Écrit dans sortie/regard/ (vidé d'abord) :
 *   ouverture.png        de 0 à accrocheMax, tous les regardPas (si la première scène est regardée) ;
 *   temps-forts-N.png    une vignette regardDecalage après la fin de la première et de la dernière entrée importante de
 *                        chaque scène, bornée à sa fin stable ; regardVignettesMax en tout, une par scène au moins ;
 *   telephone-N.png      chaque scène à son instant stable, à telephoneLargeur de large (taille réelle) ;
 *   bandes.png           3 moments au plus (transitions, instants où le plus d'éléments bougent), de −0,2 à +0,3 s ;
 *   fiche.md             ce que la vidéo veut dire et l'index des vignettes, sans code ni contrôle.
 * critique.json (relecture de l'agent critique, spec 5.5) est gardé : il porte l'empreinte de la page qu'il a relue.
 * Résumé JSON : { ok, planches, fiche, vignettes, jetonsEstimes, capture: "fidele" | "navigateur", empreinte, relecture }
 * (relecture : null, ou { verdict, plusFaible, aJour, … } ; aJour : la relecture porte sur cette page, ne pas la relancer).
 * Sans capture fidèle possible : repli sur la planche du navigateur (trois images par scène), capture "navigateur".
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
const { trouverStyle } = require('./styles.js');
const { empreintePage, etatRelecture } = require('./lib/relecture.js');
const { reduirePng } = require('./lib/vignette.js');

const SEUILS = JSON.parse(fs.readFileSync(path.join(__dirname, 'seuils.json'), 'utf8'));
const RACINE = path.resolve(__dirname, '..');

/** Grand côté des captures (images de la vidéo) ; les planches sont réduites dans la page qui les compose. */
const GRAND_COTE = 1280;
/** Planche : 1 568 px au plus sur le grand côté et 1,15 Mpx au plus (au-delà, Claude réduit l'image qu'il lit). */
const PLANCHE_COTE = 1568;
const PLANCHE_AIRE = 1150000;
const ECART = 12;
const LEGENDE = 24;
const BANDE = [-0.2, -0.1, 0, 0.1, 0.2, 0.3];

const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };
const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const arrondi = (x) => Math.round(x * 1000) / 1000;

/** Taille de capture : 1 280 px sur le grand côté. */
function tailleCapture(ratio) {
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  return a >= b ? [GRAND_COTE, Math.round(GRAND_COTE * b / a)] : [Math.round(GRAND_COTE * a / b), GRAND_COTE];
}

/**
 * Mise en page d'une planche : colonnes × rangées au plus, vignettes de largeur fixe (téléphone) ou la plus grande
 * qui tienne. -> { colonnes, rangees, largeur, hauteur } (taille d'une vignette, légende comprise à part).
 */
function miseEnPage({ ratio, colonnes, rangees, largeurFixe = null }) {
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  const tient = (c, r, w) => {
    const h = Math.round(w * b / a);
    const L = c * w + (c + 1) * ECART;
    const H = r * (h + LEGENDE) + (r + 1) * ECART;
    return L <= PLANCHE_COTE && H <= PLANCHE_COTE && L * H <= PLANCHE_AIRE;
  };
  if (largeurFixe) {
    // Taille réelle : on garde la largeur et on retire des rangées, puis des colonnes, jusqu'à ce que la planche tienne.
    let meilleur = null;
    for (let c = colonnes; c >= 1; c--) for (let r = rangees; r >= 1; r--) {
      if (tient(c, r, largeurFixe) && (!meilleur || c * r > meilleur.colonnes * meilleur.rangees)) meilleur = { colonnes: c, rangees: r };
    }
    const m = meilleur || { colonnes: 1, rangees: 1 };
    return { ...m, largeur: largeurFixe, hauteur: Math.round(largeurFixe * b / a) };
  }
  let w = GRAND_COTE;
  while (w > 40 && !tient(colonnes, rangees, w)) w--;
  return { colonnes, rangees, largeur: w, hauteur: Math.round(w * b / a) };
}

/** Instant arrondi à l'image (même instant, même capture) et borné à la vidéo. */
const aLImage = (t, ips, duree) => arrondi(Math.min(Math.max(0, Math.round(t * ips) / ips), Math.max(0, duree - 1 / ips)));

/**
 * Temps forts : pour chaque scène, regardDecalage après la fin de la première entrée importante et de la dernière, sans
 * dépasser l'instant stable de la scène ; une scène sans entrée importante : son instant stable. Au-delà de max
 * vignettes, on garde d'abord une vignette par scène (la dernière entrée), puis les autres dans l'ordre.
 * scenes : [{ id, stable, entrees: [{ debut, fin }] }] -> [{ scene, t }]
 */
function instantsTempsForts(scenes, { decalage = SEUILS.regardDecalage, max = SEUILS.regardVignettesMax } = {}) {
  const parScene = scenes.map((s) => {
    const entrees = [...s.entrees].sort((x, y) => x.debut - y.debut || x.fin - y.fin);
    if (!entrees.length) return [{ scene: s.id, t: arrondi(s.stable), principale: true }];
    const premiere = entrees[0];
    const derniere = entrees.reduce((m, e) => (e.fin > m.fin ? e : m), entrees[0]);
    const a = arrondi(Math.min(premiere.fin + decalage, s.stable));
    const b = arrondi(Math.min(derniere.fin + decalage, s.stable));
    return a === b ? [{ scene: s.id, t: b, principale: true }] : [{ scene: s.id, t: a, principale: false }, { scene: s.id, t: b, principale: true }];
  });
  const toutes = parScene.flat();
  if (toutes.length <= max) return toutes.map(({ scene, t }) => ({ scene, t }));
  // Une par scène au moins (la dernière entrée), puis les premières entrées tant qu'il reste de la place.
  let place = Math.max(0, max - scenes.length);
  const gardees = new Set(parScene.map((l) => l.find((v) => v.principale)));
  for (const v of toutes) if (!gardees.has(v) && place > 0) { gardees.add(v); place--; }
  return toutes.filter((v) => gardees.has(v)).map(({ scene, t }) => ({ scene, t }));
}

/** Moments des bandes : l'instant où le plus d'éléments bougent, puis les transitions, 3 au plus, à 0,6 s l'un de l'autre au moins. */
function momentsBandes(scenes, { max = 3 } = {}) {
  const candidats = [];
  let plein = null;
  for (const s of scenes) {
    const courts = s.minutes.filter(([d, f]) => f - d > 0 && f - d < SEUILS.animationLongue);
    for (const [d] of courts) {
      const n = courts.filter(([d2, f2]) => d2 <= d + 1e-9 && d < f2 - 1e-9).length;
      if (!plein || n > plein.n) plein = { t: d, n, scene: s.id };
    }
  }
  if (plein && plein.n >= 2) candidats.push({ t: plein.t + 0.2, scene: plein.scene, quoi: 'mouvement' });
  scenes.forEach((s, i) => { if (i > 0 && s.entree > 0) candidats.push({ t: s.debut + s.entree / 2, scene: s.id, quoi: 'transition' }); });
  const r = [];
  for (const c of candidats) if (r.length < max && r.every((x) => Math.abs(x.t - c.t) >= 0.6)) r.push(c);
  return r;
}

// Dans la page : minutage, instant stable et entrées importantes de chaque scène (texte, image de contenu, logo, SVG de
// contenu, personnage ; hors décor), et intervalles de tous les éléments minutés.
const INFOS = `(function () {
  var IMPORTANT = '[data-texte], img, [data-logo], .logo, svg:not([aria-hidden="true"]), [data-personnage]';
  function contenu(el) {
    if (el.closest('.decor, [data-decor]')) return false;
    if (el.tagName === 'IMG' && el.getAttribute('alt') === '' && !el.hasAttribute('data-logo') && !el.classList.contains('logo')) return false;
    return el.matches(IMPORTANT) || !!el.querySelector(IMPORTANT);
  }
  return { duree: M.duree, ips: M.ips, scenes: M.minutage.scenes.map(function (s, i) {
    var sec = document.querySelector('#pm-scene > section[data-scene="' + s.id + '"]');
    var suivante = M.minutage.scenes[i + 1];
    var fin = suivante && suivante.debut < s.fin ? suivante.debut : s.fin;
    var temps = M.minutage.elements[s.id] || {};
    var entrees = [], minutes = [];
    if (sec) sec.querySelectorAll('[data-pm-cle]').forEach(function (el) {
      var t = temps[el.getAttribute('data-pm-cle')];
      if (!t) return;
      minutes.push([t.debut, t.fin]);
      if (contenu(el)) entrees.push({ debut: t.debut, fin: t.fin });
    });
    return { id: s.id, debut: s.debut, fin: s.fin, entree: s.entree || 0, stable: Math.max(s.debut, fin - 0.1), entrees: entrees, minutes: minutes };
  }) };
})()`;

/** Page qui compose une planche : vignettes (fichiers voisins) et légende « n° · scène · t s » sous chacune (ou celles
 *  données). */
function pageComposition(vignettes, mise, legendes = null) {
  const figures = vignettes.map((v, i) => `<figure><img src="${v.fichier}" alt=""><figcaption>${legendes ? legendes[i] : `${i + 1} · ${v.scene} · ${virgule(v.t)} s`}</figcaption></figure>`).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
html, body { margin: 0; background: #ecebe7; color: #1d1d1b; font: 600 14px/1.2 Arial, Helvetica, sans-serif; }
.planche { display: grid; grid-template-columns: repeat(${mise.colonnes}, ${mise.largeur}px); gap: ${ECART}px; padding: ${ECART}px; }
figure { margin: 0; } img { display: block; width: ${mise.largeur}px; height: ${mise.hauteur}px; object-fit: fill; background: #000; }
figcaption { height: ${LEGENDE - 4}px; padding-top: 4px; white-space: nowrap; overflow: hidden; }
</style></head><body><div class="planche">
${figures}
</div></body></html>`;
}

/** Jetons d'une image lue par Claude : largeur × hauteur / 750, plafonnés comme la documentation des images (1 600). */
const jetonsImage = (l, h) => Math.min(1600, Math.ceil(l * h / 750));

/** Sections « ## 9. » et « ## 10. » de la doctrine de réalisation (spec S2, plan S2-3), recopiées dans la fiche. */
function sectionsDoctrine(fichier) {
  if (!fichier || !fs.existsSync(fichier)) return '';
  const t = fs.readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');
  return ['9', '10'].map((n) => {
    const m = new RegExp(`\\n(## ${n}\\. [^\\n]*\\n[\\s\\S]*?)(?=\\n## |$)`).exec(`\n${t}`);
    return m ? m[1].trimEnd() : '';
  }).filter(Boolean).join('\n\n');
}

/** Nom d'un mouvement du dictionnaire (« #006 » ou son slug). */
function nomMouvement(m, dictionnaire) {
  const ref = typeof m === 'string' ? m : (m && m.mouvement) || '';
  const e = dictionnaire.find((x) => `#${x.no}` === ref || x.slug === ref);
  const element = m && typeof m === 'object' && m.element ? ` (sur « ${m.element} »)` : '';
  return `${e ? `${ref.startsWith('#') ? ref : `#${e.no}`} ${e.nom.fr}` : ref}${element}`;
}

/** Fiche du relecteur : ce que la vidéo veut dire, scène par scène, et l'index des vignettes. Ni code, ni contrôle. */
function ecrireFiche({ projet, deroule, infos, ids, index, doctrine, glossaire, empreinte }) {
  const scenesVues = new Set(ids);
  const etat = (() => { try { return JSON.parse(fs.readFileSync(path.join(projet, '.pulse-motion', 'etat.json'), 'utf8')); } catch { return {}; } })();
  const accords = etat.accords || {};
  const style = trouverStyle(deroule.style);
  let personnalite = [];
  try { personnalite = JSON.parse(fs.readFileSync(path.join(style.dossier, 'identite.json'), 'utf8')).personnalite || []; } catch { /* style sans identité */ }
  let dictionnaire = [];
  try { dictionnaire = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'mouvements', 'mouvements.json'), 'utf8')).mouvements; } catch { /* dictionnaire absent */ }
  let charte = null;
  try { charte = JSON.parse(fs.readFileSync(path.join(projet, 'charte', 'charte.json'), 'utf8')); } catch { /* pas de charte */ }
  const L = [];
  L.push(`# Fiche de regard : « ${deroule.titre} »`, '');
  L.push(`- Genre : ${deroule.genre} ; format : ${deroule.format.ratio} ; durée : ${virgule(infos.duree)} s.`);
  L.push(`- Style : ${deroule.style}${personnalite.length ? ` (${personnalite.join(', ')})` : ''}.`);
  if (deroule.cadrans) L.push(`- Cadrans : ${Object.entries(deroule.cadrans).map(([k, v]) => `${k} ${v}`).join(' ; ')}.`);
  if (empreinte) L.push(`- Empreinte de la page : ${empreinte} (à recopier dans critique.json).`);
  L.push('', '## Scènes', '');
  deroule.scenes.forEach((s, i) => {
    if (!scenesVues.has(s.id)) return;
    const m = infos.scenes.find((x) => x.id === s.id) || { debut: 0, fin: 0 };
    L.push(`### ${i + 1}. ${s.id} (${virgule(m.debut)} à ${virgule(m.fin)} s)`, '');
    if (s.intention) L.push(`- Intention : ${s.intention}`);
    const textes = Object.entries(s.textes || {}).filter(([, v]) => typeof v === 'string' && v.trim());
    if (textes.length) L.push(`- À l'écran : ${textes.map(([k, v]) => `${k} « ${v} »`).join(' ; ')}`);
    if (s.voix && s.voix.texte) L.push(`- Texte dit : « ${s.voix.texte} »`);
    if ((s.mouvements || []).length) L.push(`- Mouvements nommés : ${s.mouvements.map((x) => nomMouvement(x, dictionnaire)).join(' ; ')}`);
    let html = '';
    try { html = fs.readFileSync(path.join(projet, s.fichier), 'utf8'); } catch { /* scène pas encore écrite */ }
    const effets = [...new Set([...html.matchAll(/\sdata-effet="([a-z0-9-]+)"/g)].map((x) => x[1]))];
    if (effets.length) L.push(`- Effets : ${effets.join(', ')}`);
    if (s.transition && s.transition !== 'aucune') L.push(`- Transition d'entrée : ${typeof s.transition === 'string' ? s.transition : 'shader'}`);
    L.push('');
  });
  const fait = (f) => (f && typeof f === 'object' ? `${f.chiffre} (scène ${f.scene}) : ${f.exemple === true ? 'exemple, sans source' : `source : ${f.source}`}${f.date ? `, ${f.date}` : ''}` : String(f));
  if (Array.isArray(deroule.faits) && deroule.faits.length) L.push('## Faits', '', ...deroule.faits.map((f) => `- ${fait(f)}`), '');
  if (glossaire.length) L.push('## Termes du glossaire', '', ...glossaire.map((t) => `- ${t.terme} : ${t.sens}`), '');
  const verrous = [];
  if (accords.deroule) verrous.push('les textes du déroulé, validés par la personne');
  if (accords.style) verrous.push(`le style « ${deroule.style} », choisi par la personne`);
  if (charte) verrous.push(`la charte (${[charte.couleurs && 'couleurs', charte.polices && 'polices', charte.logo && 'logo'].filter(Boolean).join(', ') || 'réglages'})`);
  L.push('## Ce qui est verrouillé', '', verrous.length ? verrous.map((v) => `- ${v}`).join('\n') : '- rien', '');
  L.push('## Index des vignettes', '', '| Planche | Position | Scène | Instant |', '|---|---|---|---|');
  for (const v of index) L.push(`| ${v.planche} | ${v.position} | ${v.scene} | ${virgule(v.t)} s |`);
  L.push('');
  if (doctrine) L.push(doctrine, '');
  const fichier = path.join(projet, 'sortie', 'regard', 'fiche.md');
  fs.writeFileSync(fichier, `${L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`, 'utf8');
  return fichier;
}

/**
 * planchesRegard({ dossier, scenes?, dossierStyles?, navigateur?, doctrine? })
 * doctrine : chemin de la doctrine de réalisation (tests) ; par défaut references/realisation.md du plugin.
 * replier : remplace la planche du navigateur du repli (tests) ; garder : dossier où copier les images et leur index (tests).
 * -> Promise<{ ok, planches, fiche, vignettes, jetonsEstimes, capture, particules: 'dessinees' | 'absentes' | 'sans', message? }>
 */
async function planchesRegard({ dossier, scenes = null, dossierStyles, navigateur = trouverNavigateur(), doctrine = path.join(RACINE, 'references', 'realisation.md'), replier = null, garder = null }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const ids = scenes && scenes.length ? scenes : deroule.scenes.map((s) => s.id);
  const inconnues = ids.filter((id) => !deroule.scenes.some((s) => s.id === id));
  if (inconnues.length) {
    // Scènes proches (spec Retouches et ergonomie, 5.16).
    const P = require('../moteur/proches.js');
    const l = P.proches(inconnues[0], deroule.scenes.map((s) => s.id));
    return { ok: false, message: `Scène inconnue : ${inconnues.join(', ')}${l.length ? ` ; ${P.phrase(l)}` : '.'}` };
  }
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : les images de la vidéo n\'ont pas pu être regardées.' };

  const sortie = path.join(projet, 'sortie', 'regard');
  // Vidé, sauf la relecture du critique (elle dit elle-même quelle page elle a relue).
  fs.mkdirSync(sortie, { recursive: true });
  for (const e of fs.readdirSync(sortie)) if (e !== 'critique.json') fs.rmSync(path.join(sortie, e), { recursive: true, force: true });
  const empreinte = empreintePage(assemblage.html);
  const relecture = etatRelecture(projet, { html: assemblage.html });
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-regard-'));
  const relatif = (f) => path.relative(projet, f).split(path.sep).join('/');
  const ratio = deroule.format.ratio;
  const [largeur, hauteur] = tailleCapture(ratio);
  const pageVideo = path.join(travail, 'video.html');
  fs.writeFileSync(pageVideo, assemblage.html, 'utf8');
  let lisible = null;
  let capture;
  const gpu = avecEffets(projet, deroule);
  try {
    capture = await ouvrirCapture({
      fichierHtml: pageVideo, largeur, hauteur, navigateur, gpu, delai: 60000,
      ouvrir: async (o) => { lisible = await ouvrirPage(o); return lisible; },
    });
  } catch (e) {
    fs.rmSync(travail, { recursive: true, force: true });
    // Repli : la planche du navigateur (trois images par scène), moins exacte (filtres et particules approchés).
    const { exporterVideo } = require('./exporter.js');
    const r = await (replier || exporterVideo)({ dossier: projet, planche: ids, dossierStyles, navigateur });
    if (!r.ok) return { ok: false, message: `Les images de la vidéo n'ont pas pu être prises (${e.message}) ; ${r.message}` };
    const planches = fs.readdirSync(path.join(projet, 'sortie', 'planche')).filter((f) => f.endsWith('.png')).sort().map((f) => `sortie/planche/${f}`);
    return { ok: true, planches, fiche: null, vignettes: planches.length, jetonsEstimes: planches.length * jetonsImage(GRAND_COTE, Math.round(GRAND_COTE * hauteur / largeur)), capture: 'navigateur', particules: gpu ? 'absentes' : 'sans', empreinte, relecture };
  }
  try {
    const infos = await capture.evaluer(INFOS);
    // Particules et shaders : dessinés seulement si WebGPU est là (comme à l'export) ; sinon, le dire au bilan.
    const particules = !gpu ? 'sans' : await capture.evaluer('(M.particules && M.particules.verifierExport ? M.particules.verifierExport() : Promise.resolve()).then(function () { return "dessinees"; }, function () { return "absentes"; })');
    const ips = infos.ips || 30;
    const vues = infos.scenes.filter((s) => ids.includes(s.id));
    const t = (x) => aLImage(x, ips, infos.duree);
    // Images de la vidéo, une capture par instant (un instant partagé par deux planches n'est pris qu'une fois).
    const prises = new Map();
    const prendre = async (instant) => {
      if (!prises.has(instant)) {
        const fichier = `v${String(prises.size + 1).padStart(3, '0')}.png`;
        // Deux captures du même instant, la seconde gardée : la première peut encore montrer l'image composée d'avant
        // le saut (une animation CSS presque à zéro, à 1,4 s de chaine-du-froid, diffère une fois sur quatre).
        await capture.capturer(instant);
        fs.writeFileSync(path.join(travail, fichier), await capture.capturer(instant));
        prises.set(instant, fichier);
      }
      return prises.get(instant);
    };
    const groupes = [];
    if (ids.includes(deroule.scenes[0].id)) {
      const liste = [];
      for (let x = 0; x <= SEUILS.accrocheMax + 1e-9 && x < infos.duree; x += SEUILS.regardPas) liste.push({ scene: (vues.find((s) => x >= s.debut && x < s.fin) || vues[0]).id, t: t(x) });
      groupes.push({ nom: 'ouverture', vignettes: liste, mise: miseEnPage({ ratio, colonnes: 4, rangees: 2 }), seule: true });
    }
    groupes.push({ nom: 'temps-forts', vignettes: instantsTempsForts(vues).map((v) => ({ ...v, t: t(v.t) })), mise: miseEnPage({ ratio, colonnes: 4, rangees: 3 }) });
    groupes.push({ nom: 'telephone', vignettes: vues.map((s) => ({ scene: s.id, t: t(s.stable) })), mise: miseEnPage({ ratio, colonnes: 4, rangees: 4, largeurFixe: SEUILS.telephoneLargeur }) });
    const bandes = momentsBandes(vues).flatMap((m) => BANDE.map((d) => ({ scene: m.scene, t: t(m.t + d) })));
    if (bandes.length) groupes.push({ nom: 'bandes', vignettes: bandes, mise: miseEnPage({ ratio, colonnes: BANDE.length, rangees: 3 }), seule: true });

    for (const g of groupes) for (const v of g.vignettes) v.fichier = await prendre(v.t);

    // Composition : la même page du navigateur, à la taille exacte de chaque planche.
    const reductions = new Map();
    const reduire = (fichier, l, h) => {
      const cle = `${fichier}@${l}x${h}`;
      if (!reductions.has(cle)) {
        const nom = `r${String(reductions.size + 1).padStart(3, '0')}.png`;
        fs.writeFileSync(path.join(travail, nom), reduirePng(fs.readFileSync(path.join(travail, fichier)), l, h));
        reductions.set(cle, nom);
      }
      return reductions.get(cle);
    };
    const planches = [];
    const index = [];
    let jetons = 0;
    for (const g of groupes) {
      const parPlanche = g.mise.colonnes * g.mise.rangees;
      const lots = [];
      for (let i = 0; i < g.vignettes.length; i += parPlanche) lots.push(g.vignettes.slice(i, i + parPlanche));
      for (const [k, lot] of lots.entries()) {
        const nom = g.seule && lots.length === 1 ? `${g.nom}.png` : `${g.nom}-${k + 1}.png`;
        const colonnes = Math.min(g.mise.colonnes, lot.length);
        const rangees = Math.ceil(lot.length / g.mise.colonnes);
        const L = colonnes * g.mise.largeur + (colonnes + 1) * ECART;
        const H = rangees * (g.mise.hauteur + LEGENDE) + (rangees + 1) * ECART;
        const html = path.join(travail, `${g.nom}-${k + 1}.html`);
        // Vignettes réduites dans Node à leur taille exacte (identiques à l'octet d'un passage à l'autre), affichées sans
        // mise à l'échelle : le navigateur ne réduit plus rien.
        const reduites = lot.map((v) => ({ ...v, fichier: reduire(v.fichier, g.mise.largeur, g.mise.hauteur) }));
        fs.writeFileSync(html, pageComposition(reduites, g.mise), 'utf8');
        await lisible.envoyer('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: 1, mobile: false });
        await lisible.aller(pathToFileURL(html).href);
        await lisible.evaluer('Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })');
        fs.writeFileSync(path.join(sortie, nom), await lisible.capturer({ rapide: false }));
        planches.push(`sortie/regard/${nom}`);
        // Les bandes sont réservées au relecteur : elles ne comptent pas dans les images lues par Claude principal.
        if (g.nom !== 'bandes') jetons += jetonsImage(L, H);
        lot.forEach((v, i) => index.push({ planche: nom, position: i + 1, scene: v.scene, t: v.t }));
      }
    }
    let glossaire = [];
    try { glossaire = require('./vocabulaire.js').lireGlossaire(projet).termes; } catch { /* pas de glossaire */ }
    const fiche = ecrireFiche({ projet, deroule, infos, ids, index, doctrine: sectionsDoctrine(doctrine), glossaire, empreinte });
    if (garder) {
      fs.mkdirSync(garder, { recursive: true });
      for (const f of prises.values()) fs.copyFileSync(path.join(travail, f), path.join(garder, f));
      fs.writeFileSync(path.join(garder, 'index.json'), JSON.stringify(groupes.map((g) => ({ nom: g.nom, vignettes: g.vignettes })), null, 2), 'utf8');
    }
    return { ok: true, planches, fiche: relatif(fiche), vignettes: index.length, jetonsEstimes: jetons, capture: 'fidele', particules, empreinte, relecture };
  } finally {
    await capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

/** Planche image par image (spec Mouvement vivant, 5.14) : fenêtre de 3 s au plus, 10 vignettes de 192 px par ligne,
 *  30 par planche. */
const CADENCE_MAX = 3;
const CADENCE_COLONNES = 10;
const CADENCE_LARGEUR = 192;
const CADENCE_PAR_PLANCHE = 30;

/** Instants (secondes de la scène) d'une fenêtre image par image : toutes les images de [de, de + duree[, ou une sur pas. */
function instantsCadence({ de, duree, pas = 1, ips = 30 }) {
  const r = [];
  const premiere = Math.ceil(de * ips - 1e-6);
  for (let k = premiere; k / ips < de + duree - 1e-6; k += pas) r.push(arrondi(k / ips));
  return r;
}

/** Légendes « n° · t s » des vignettes de la planche k (0 pour la première) : rang dans la fenêtre, instant en secondes
 *  de la scène au centième (à l'image près). */
function legendesCadence(lot, k) {
  return lot.map((v, i) => `${k * CADENCE_PAR_PLANCHE + i + 1} · ${v.t.toFixed(2).replace('.', ',')} s`);
}

/** Vérifie la demande d'une planche image par image -> message d'erreur en français, ou null. */
function verifierCadence({ de, duree, pas }) {
  if (!Number.isFinite(de) || de < 0) return 'Planche image par image : le début (--de) doit être un nombre de secondes depuis le début de la scène, 0 ou plus (ex. 2).';
  if (!Number.isFinite(duree) || duree <= 0) return 'Planche image par image : la durée (--duree) doit être un nombre de secondes plus grand que 0 (ex. 1).';
  if (duree > CADENCE_MAX + 1e-9) return `Planche image par image : une fenêtre de ${virgule(duree)} s est trop longue ; ${CADENCE_MAX} s au plus (sinon les vignettes deviennent illisibles). Demander une fenêtre plus courte.`;
  if (!Number.isInteger(pas) || pas < 1) return 'Planche image par image : le pas (--pas) doit être un nombre entier d\'images, 1 ou plus (ex. 2 : une image sur deux).';
  return null;
}

/**
 * plancheCadence({ dossier, scene, de, duree, pas?, dossierStyles?, navigateur? }) : toutes les images (ou une sur pas)
 * de la scène entre de et de + duree (secondes de la scène), capturées comme l'export fidèle, légendées « n° · t s ».
 * -> Promise<{ ok, planches, vignettes, ips, instants, message? }> ; planches dans sortie/planche/ (cadence-<id>.png, ou -N).
 */
async function plancheCadence({ dossier, scene, de, duree, pas = 1, dossierStyles, navigateur = trouverNavigateur() }) {
  const refus = verifierCadence({ de, duree, pas });
  if (refus) return { ok: false, message: refus };
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (!scene || !deroule.scenes.some((s) => s.id === scene)) return { ok: false, message: `Scène inconnue : ${scene || '(aucune)'} ; donner l'identifiant d'une scène du déroulé.` };
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : les images de la scène n\'ont pas pu être prises.' };
  const ratio = deroule.format.ratio;
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  const largeur = a >= b ? GRAND_COTE / 2 : Math.round(GRAND_COTE / 2 * a / b);
  const hauteur = a >= b ? Math.round(GRAND_COTE / 2 * b / a) : GRAND_COTE / 2;
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cadence-'));
  const pageVideo = path.join(travail, 'video.html');
  fs.writeFileSync(pageVideo, assemblage.html, 'utf8');
  let lisible = null;
  let capture;
  try {
    capture = await ouvrirCapture({ fichierHtml: pageVideo, largeur, hauteur, navigateur, gpu: avecEffets(projet, deroule), delai: 60000,
      ouvrir: async (o) => { lisible = await ouvrirPage(o); return lisible; } });
  } catch (e) {
    fs.rmSync(travail, { recursive: true, force: true });
    return { ok: false, message: `Les images de la scène n'ont pas pu être prises (${e.message}).` };
  }
  try {
    const infos = await capture.evaluer(INFOS);
    const ips = infos.ips || 30;
    const s = infos.scenes.find((x) => x.id === scene);
    const instants = instantsCadence({ de, duree, pas, ips }).filter((t) => s.debut + t < infos.duree - 1e-6);
    if (!instants.length) return { ok: false, message: `La scène « ${scene} » dure ${virgule(s.fin - s.debut)} s : la fenêtre demandée commence après sa fin.` };
    const mise = { colonnes: CADENCE_COLONNES, largeur: CADENCE_LARGEUR, hauteur: Math.round(CADENCE_LARGEUR * b / a) };
    const vignettes = [];
    for (const [i, t] of instants.entries()) {
      const absolu = s.debut + t;
      // Deux captures du même instant, la seconde gardée (comme les planches de regard).
      await capture.capturer(absolu);
      const fichier = `c${String(i + 1).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(travail, fichier), reduirePng(await capture.capturer(absolu), mise.largeur, mise.hauteur));
      vignettes.push({ fichier, scene, t });
    }
    const dossierPlanche = path.join(projet, 'sortie', 'planche');
    fs.mkdirSync(dossierPlanche, { recursive: true });
    for (const f of fs.readdirSync(dossierPlanche)) if (/^cadence-/.test(f)) fs.rmSync(path.join(dossierPlanche, f), { force: true });
    const planches = [];
    const lots = [];
    for (let i = 0; i < vignettes.length; i += CADENCE_PAR_PLANCHE) lots.push(vignettes.slice(i, i + CADENCE_PAR_PLANCHE));
    for (const [k, lot] of lots.entries()) {
      const colonnes = Math.min(mise.colonnes, lot.length);
      const rangees = Math.ceil(lot.length / mise.colonnes);
      const L = colonnes * mise.largeur + (colonnes + 1) * ECART;
      const H = rangees * (mise.hauteur + LEGENDE) + (rangees + 1) * ECART;
      const html = path.join(travail, `cadence-${k + 1}.html`);
      // Légende « n° · t s » : rang dans la fenêtre, instant en secondes de la scène, au centième (à l'image près).
      fs.writeFileSync(html, pageComposition(lot, { ...mise, colonnes }, legendesCadence(lot, k)), 'utf8');
      await lisible.envoyer('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: 1, mobile: false });
      await lisible.aller(pathToFileURL(html).href);
      await lisible.evaluer('Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })');
      const nom = lots.length === 1 ? `cadence-${scene}.png` : `cadence-${scene}-${k + 1}.png`;
      fs.writeFileSync(path.join(dossierPlanche, nom), await lisible.capturer({ rapide: false }));
      planches.push(`sortie/planche/${nom}`);
    }
    return { ok: true, planches, vignettes: vignettes.length, ips, pas, instants };
  } finally {
    await capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--cadence')) {
    // Planche image par image : regard.js <dossier> --cadence <scène> --de <s> --duree <s> [--pas <n>].
    const val = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
    const nombre = (x, defaut) => (x === undefined ? defaut : Number(String(x).replace(',', '.')));
    const AVEC_VALEUR = ['--cadence', '--de', '--duree', '--pas'];
    const dossier = args.find((a, k) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[k - 1])) || '.';
    const travail = plancheCadence({ dossier, scene: val('--cadence'), de: nombre(val('--de'), NaN), duree: nombre(val('--duree'), NaN), pas: nombre(val('--pas'), 1) });
    travail.then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    }, (e) => {
      console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
      process.exit(1);
    });
  } else lancerRegard(args);
}

function lancerRegard(args) {
  const i = args.indexOf('--scenes');
  const scenes = i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',').filter(Boolean) : null;
  const dossier = args.find((a, k) => !a.startsWith('--') && args[k - 1] !== '--scenes') || '.';
  planchesRegard({ dossier, scenes }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { planchesRegard, plancheCadence, instantsCadence, verifierCadence, legendesCadence, CADENCE_MAX, instantsTempsForts, momentsBandes, miseEnPage, tailleCapture, sectionsDoctrine, jetonsImage, pageComposition };
