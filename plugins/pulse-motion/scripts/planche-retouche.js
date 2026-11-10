#!/usr/bin/env node
'use strict';
/* Pulse Motion – planches des retouches directes (spec Retouches et ergonomie, 5.8 et 5.10).
 *
 *   node scripts/planche-retouche.js <dossier> --instants <t1,t2>          (pulse-motion planche <dossier> --instants …)
 *     l'image de chaque instant (secondes de la vidéo, posé sur une image), capturée comme l'export fidèle, 960 px de large :
 *     sortie/planche/instant-<ms>.png. Sert aux remarques de l'aperçu : Claude regarde l'instant ré-ancré après la
 *     retouche, puis « pulse-motion remarques faite » recopie cette image comme image d'après.
 *   node scripts/planche-retouche.js <dossier> --avant <numéro|nom|precedente> [id1,id2]   (pulse-motion planche … --avant …)
 *     avant / après d'une retouche : pour chaque scène modifiée entre la version donnée (reconstituée par
 *     historique.materialiser) et la vidéo actuelle (fichier de scène ou entrée du déroulé changés ; toutes les scènes si un
 *     réglage visuel de toute la vidéo a changé : style, charte, format, sous-titres…), sortie/planche/avant-apres-<id>.png :
 *     trois colonnes (avant, après, différences) et trois instants (35, 65 et 95 % de la scène). Différences : les pixels dont
 *     un canal s'écarte de plus de 8/255, en rouge à 60 % sur l'image d'après passée en gris.
 * Résumé JSON ; code 1 avec un message en français en cas d'échec.
 * Idée de reanimate (sheet.ts compare : planche à trois colonnes avec la différence ; MIT), réécrite.
 */
const crypto = require('node:crypto');
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
const { reduirePng, encoderPng } = require('./lib/vignette.js');
const { rgb } = require('./lib/images.js');
const { instantImage, nomInstant } = require('./lib/remarques.js');
const { miseEnPage, pageComposition } = require('./regard.js');
const H = require('./historique.js');

const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };
const LARGEUR_INSTANT = 960;
const LARGEUR_COMPARAISON = 640;
const SEUIL = 8;
const ROUGE = 0.6;
const POSITIONS = [0.35, 0.65, 0.95];
/** Champs du déroulé sans effet sur l'image (le son, le titre, le parcours) : leur changement ne touche aucune scène. */
const SANS_IMAGE = ['version', 'titre', 'genre', 'parcours', 'musique', 'bruitages', 'voix', 'scenes', 'credits', 'chapitres', 'couverture'];
const ECART = 12;
const LEGENDE = 24;

const taille = (ratio, grand) => {
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  return a >= b ? [grand, Math.round(grand * b / a)] : [Math.round(grand * a / b), grand];
};

async function ouvrir({ html, largeur, hauteur, navigateur, gpu, travail, nom }) {
  const fichier = path.join(travail, `${nom}.html`);
  fs.writeFileSync(fichier, html, 'utf8');
  let lisible = null;
  const capture = await ouvrirCapture({ fichierHtml: fichier, largeur, hauteur, navigateur, gpu, delai: 60000,
    ouvrir: async (o) => { lisible = await ouvrirPage(o); return lisible; } });
  return { capture, lisible };
}

/** Deux captures du même instant, la seconde gardée (comme les planches de regard). */
async function capturer(capture, t) {
  await capture.capturer(t);
  return capture.capturer(t);
}

/**
 * plancheInstants({ dossier, instants, dossierStyles?, navigateur? }) -> { ok, ips, images: [{ t, fichier }], message? }
 * instants : secondes de la vidéo ; chacun est posé sur une image (comme les remarques) et borné à la vidéo.
 */
async function plancheInstants({ dossier, instants, dossierStyles, navigateur = trouverNavigateur() }) {
  const projet = path.resolve(dossier);
  const liste = (instants || []).map(Number).filter((t) => Number.isFinite(t) && t >= 0);
  if (!liste.length) return { ok: false, message: 'Planche des instants : donner un ou plusieurs instants en secondes de la vidéo (ex. --instants 18.4,22).' };
  if (liste.length > 12) return { ok: false, message: 'Planche des instants : 12 instants au plus à la fois.' };
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : les images n\'ont pas pu être prises.' };
  const [largeur, hauteur] = taille(deroule.format.ratio, LARGEUR_INSTANT);
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-instants-'));
  let page;
  try {
    page = await ouvrir({ html: assemblage.html, largeur, hauteur, navigateur, gpu: avecEffets(projet, deroule), travail, nom: 'video' });
  } catch (e) {
    fs.rmSync(travail, { recursive: true, force: true });
    return { ok: false, message: `Les images n'ont pas pu être prises (${e.message}).` };
  }
  try {
    const ips = (deroule.format && deroule.format.ips) || 30;
    const duree = page.capture.duree;
    const dossierPlanche = path.join(projet, 'sortie', 'planche');
    fs.mkdirSync(dossierPlanche, { recursive: true });
    const images = [];
    for (const brut of liste) {
      const t = instantImage(Math.min(brut, Math.max(0, duree - 1 / ips)), ips);
      const nom = nomInstant(t, ips);
      fs.writeFileSync(path.join(dossierPlanche, nom), await capturer(page.capture, t));
      images.push({ t, fichier: `sortie/planche/${nom}` });
    }
    return { ok: true, ips, images };
  } finally {
    await page.capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

// --- Avant / après ----------------------------------------------------------------------------------------------------

const lireTexte = (f) => { try { return fs.readFileSync(f); } catch { return null; } };
const empreinte = (b) => (b ? crypto.createHash('sha256').update(b).digest('hex') : null);

/** Empreintes des fichiers d'un dossier du projet (chemins relatifs avec des /). */
function empreintesDossier(racine, nom) {
  const r = {};
  const visiter = (rel) => {
    const abs = path.join(racine, rel);
    let st;
    try { st = fs.statSync(abs); } catch { return; }
    if (st.isDirectory()) { for (const n of fs.readdirSync(abs).sort()) visiter(path.join(rel, n)); } else r[rel.split(path.sep).join('/')] = empreinte(fs.readFileSync(abs));
  };
  visiter(nom);
  return r;
}

/**
 * Scènes modifiées entre deux dossiers de vidéo : fichier de scène ou entrée du déroulé changés ; un média qu'elle cite
 * changé ; toutes si un réglage visuel de la vidéo (hors son, titre, parcours) ou la charte ont changé.
 * -> { ids: [id], global: boolean, nouvelles: [id], retirees: [id] }
 */
function scenesModifiees(avantDossier, apresDossier, avant, apres) {
  const globaux = (d) => JSON.stringify(Object.keys(d).filter((k) => !SANS_IMAGE.includes(k)).sort().map((k) => [k, d[k]]));
  const charte = (racine) => JSON.stringify(empreintesDossier(racine, 'charte'));
  const global = globaux(avant) !== globaux(apres) || charte(avantDossier) !== charte(apresDossier);
  const medias = (racine) => empreintesDossier(racine, 'assets');
  const ma = medias(avantDossier);
  const mb = medias(apresDossier);
  const changes = [...new Set([...Object.keys(ma), ...Object.keys(mb)])].filter((k) => ma[k] !== mb[k] && !/^assets\/voix\//.test(k));
  const parId = new Map(avant.scenes.map((s) => [s.id, s]));
  const ids = [];
  const nouvelles = [];
  for (const s of apres.scenes) {
    const a = parId.get(s.id);
    if (!a) { ids.push(s.id); nouvelles.push(s.id); continue; }
    const htmlA = lireTexte(path.join(avantDossier, a.fichier));
    const htmlB = lireTexte(path.join(apresDossier, s.fichier));
    const { voix: va, ...entreeA } = a;
    const { voix: vb, ...entreeB } = s;
    // La voix ne change l'image que par la durée de la scène (et le texte dit, pour les sous-titres).
    const voixImage = (v) => JSON.stringify(v ? { texte: v.texte, debut: v.debut } : null);
    const media = changes.some((k) => htmlB && htmlB.toString('utf8').includes(k.replace(/^assets\//, '')));
    if (global || media || JSON.stringify(entreeA) !== JSON.stringify(entreeB) || voixImage(va) !== voixImage(vb) || empreinte(htmlA) !== empreinte(htmlB)) ids.push(s.id);
  }
  const retirees = avant.scenes.filter((s) => !apres.scenes.some((x) => x.id === s.id)).map((s) => s.id);
  return { ids, global, nouvelles, retirees };
}

/** Image des différences : pixels dont un canal s'écarte de plus de seuil, en rouge à 60 % sur l'après passé en gris. */
function imageDifferences(avantPng, apresPng, { seuil = SEUIL } = {}) {
  const a = rgb(avantPng);
  const b = rgb(apresPng);
  const n = b.largeur * b.hauteur;
  const out = new Uint8Array(n * 3);
  const memeTaille = a.largeur === b.largeur && a.hauteur === b.hauteur;
  let pixels = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const gris = Math.round(0.2126 * b.rgb[o] + 0.7152 * b.rgb[o + 1] + 0.0722 * b.rgb[o + 2]);
    const diff = !memeTaille || Math.max(Math.abs(a.rgb[o] - b.rgb[o]), Math.abs(a.rgb[o + 1] - b.rgb[o + 1]), Math.abs(a.rgb[o + 2] - b.rgb[o + 2])) > seuil;
    if (diff) {
      pixels++;
      out[o] = Math.round(gris * (1 - ROUGE) + 255 * ROUGE);
      out[o + 1] = Math.round(gris * (1 - ROUGE));
      out[o + 2] = Math.round(gris * (1 - ROUGE));
    } else { out[o] = gris; out[o + 1] = gris; out[o + 2] = gris; }
  }
  return { png: encoderPng(b.largeur, b.hauteur, out), pixels };
}

/** Image noire (scène absente de la version d'avant). */
const noir = (l, h) => encoderPng(l, h, new Uint8Array(l * h * 3));

/** Captures des trois instants (35, 65, 95 %) de chaque scène d'une version, à l'image près. -> { [id]: [png, png, png] } */
async function capturesScenes(capture, ids, ips = 30) {
  const r = {};
  for (const id of ids) {
    const s = capture.minutage.scenes.find((x) => x.id === id);
    if (!s) continue;
    const fin = Math.min(s.fin, capture.duree);
    r[id] = [];
    for (const p of POSITIONS) {
      const t = Math.max(s.debut, Math.min(fin - 1 / ips, Math.round((s.debut + p * (fin - s.debut)) * ips) / ips));
      r[id].push(await capturer(capture, t));
    }
  }
  return r;
}

/**
 * plancheAvant({ dossier, version, ids?, dossierStyles?, navigateur? })
 * -> { ok, version: { numero, nom }, scenes: [{ id, planche, pixelsDifferents: [n, n, n], nouvelle? }], global, retirees, message? }
 */
async function plancheAvant({ dossier, version, ids = null, dossierStyles, navigateur = trouverNavigateur() }) {
  const projet = path.resolve(dossier);
  if (!version) return { ok: false, message: 'Avant / après : donner la version d\'avant (numéro, nom ou « precedente »).' };
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-avant-apres-'));
  const pages = [];
  try {
    let m;
    try { m = H.materialiser(projet, version, path.join(travail, 'avant')); } catch (e) { return { ok: false, message: e.message }; }
    const lu = lireDeroule(m.dossier);
    if (lu.erreurs.length) return { ok: false, message: `La version d'avant ne se relit plus : ${lu.erreurs.join(' ')}` };
    const modif = scenesModifiees(m.dossier, projet, lu.deroule, deroule);
    let cibles = modif.ids;
    if (ids && ids.length) cibles = cibles.filter((id) => ids.includes(id));
    const dossierPlanche = path.join(projet, 'sortie', 'planche');
    fs.mkdirSync(dossierPlanche, { recursive: true });
    for (const f of fs.readdirSync(dossierPlanche)) if (/^avant-apres-/.test(f)) fs.rmSync(path.join(dossierPlanche, f), { force: true });
    const resume = { ok: true, version: { numero: m.numero, nom: m.nom }, scenes: [], global: modif.global, retirees: modif.retirees };
    if (!cibles.length) return { ...resume, message: 'Aucune scène n\'a changé entre les deux versions.' };

    const apresPage = assembler({ dossier: projet, dossierStyles, ecrire: false });
    if (!apresPage.ok) return { ok: false, message: `La page ne s'assemble pas : ${apresPage.erreurs.map((e) => e.message).join(' ')}` };
    const avantPage = assembler({ dossier: m.dossier, dossierStyles, ecrire: false });
    if (!avantPage.ok) return { ok: false, message: `La version d'avant ne s'assemble plus : ${avantPage.erreurs.map((e) => e.message).join(' ')}` };
    if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : les images n\'ont pas pu être prises.' };

    const ratio = deroule.format.ratio;
    const [largeur, hauteur] = taille(ratio, LARGEUR_COMPARAISON);
    const gpu = avecEffets(projet, deroule);
    const apres = await ouvrir({ html: apresPage.html, largeur, hauteur, navigateur, gpu, travail, nom: 'apres' });
    pages.push(apres);
    const ips = (deroule.format && deroule.format.ips) || 30;
    const imagesApres = await capturesScenes(apres.capture, cibles, ips);
    const avant = await ouvrir({ html: avantPage.html, largeur, hauteur, navigateur, gpu: gpu || avecEffets(m.dossier, lu.deroule), travail, nom: 'avant' });
    pages.push(avant);
    const imagesAvant = await capturesScenes(avant.capture, cibles.filter((id) => !modif.nouvelles.includes(id)), (lu.deroule.format && lu.deroule.format.ips) || 30);

    const mise = miseEnPage({ ratio, colonnes: 3, rangees: 3 });
    for (const id of cibles) {
      const b = imagesApres[id];
      if (!b) continue;
      const a = imagesAvant[id] || b.map(() => noir(largeur, hauteur));
      const vignettes = [];
      const legendes = [];
      const pixels = [];
      for (let k = 0; k < POSITIONS.length; k++) {
        const d = imageDifferences(a[k], b[k]);
        pixels.push(d.pixels);
        const pc = `${Math.round(POSITIONS[k] * 100)} %`;
        for (const [png, legende, nom] of [[a[k], `Avant · ${pc}${imagesAvant[id] ? '' : ' (scène nouvelle)'}`, 'a'], [b[k], `Après · ${pc}`, 'b'], [d.png, `Différences · ${pc}${d.pixels ? '' : ' : aucune'}`, 'd']]) {
          const fichier = `${id}-${k}-${nom}.png`;
          fs.writeFileSync(path.join(travail, fichier), reduirePng(png, mise.largeur, mise.hauteur));
          vignettes.push({ fichier });
          legendes.push(legende);
        }
      }
      const L = 3 * mise.largeur + 4 * ECART;
      const Hh = 3 * (mise.hauteur + LEGENDE) + 4 * ECART;
      const html = path.join(travail, `planche-${id}.html`);
      fs.writeFileSync(html, pageComposition(vignettes, { ...mise, colonnes: 3 }, legendes), 'utf8');
      const lisible = apres.lisible;
      await lisible.envoyer('Emulation.setDeviceMetricsOverride', { width: L, height: Hh, deviceScaleFactor: 1, mobile: false });
      await lisible.aller(pathToFileURL(html).href);
      await lisible.evaluer('Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })');
      const nom = `avant-apres-${id}.png`;
      fs.writeFileSync(path.join(dossierPlanche, nom), await lisible.capturer({ rapide: false }));
      resume.scenes.push({ id, planche: `sortie/planche/${nom}`, pixelsDifferents: pixels, ...(imagesAvant[id] ? {} : { nouvelle: true }) });
    }
    return resume;
  } finally {
    for (const p of pages) await p.capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

/** Arguments : <dossier> --instants <liste> | --avant <version> [ids]. */
function lireArguments(args) {
  const val = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
  const AVEC_VALEUR = ['--instants', '--avant'];
  const libres = args.filter((a, k) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[k - 1]));
  const instants = val('--instants');
  return {
    dossier: libres[0] || '.',
    ids: libres[1] ? libres[1].split(',').filter(Boolean) : null,
    instants: instants !== undefined ? String(instants).split(/[;,]/).map((x) => x.trim()).filter(Boolean).map(Number) : null,
    avant: val('--avant'),
  };
}

if (require.main === module) {
  const a = lireArguments(process.argv.slice(2));
  const travail = a.instants ? plancheInstants({ dossier: a.dossier, instants: a.instants }) : plancheAvant({ dossier: a.dossier, version: a.avant, ids: a.ids });
  travail.then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { plancheInstants, plancheAvant, scenesModifiees, imageDifferences, lireArguments, POSITIONS, SEUIL };
