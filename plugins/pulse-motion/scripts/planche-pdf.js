#!/usr/bin/env node
'use strict';
/* Pulse Motion – PDF des planches (spec Rendu et export, 5.16) : « un PDF des scènes pour le client ».
 *
 *   node scripts/planche-pdf.js <dossier> [id1,id2]        (pulse-motion planche <dossier> [id1,id2] --pdf)
 *
 * Captures fidèles (Chrome ou Edge sans fenêtre, comme l'export fidèle) aux instants de la planche (35, 65 et 95 % de la
 * partie visible de chaque scène), en JPEG de qualité 85 à 1 280 px sur le grand côté, dans sortie/planche/ ; page HTML A4
 * paysage, deux scènes par page (en-tête : titre, durée, style, date ; par scène : numéro, chapitre ou identifiant, les trois
 * images, le texte dit ou les textes affichés), imprimée par le navigateur (Page.printToPDF) dans sortie/<titre>-planches.pdf.
 * Exige Chrome ou Edge, jamais ffmpeg ; même chemin quelle que soit la voie de l'export. Mise en page originale.
 * Résumé JSON { ok, fichier, pages, scenes, images } ; code 1 en cas d'échec.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler, slug } = require('./assembler.js');
const { lireDeroule } = require('./lib/deroule.js');
const { trouverNavigateur } = require('./lib/navigateur.js');
const { ouvrirCapture } = require('./lib/capture-fidele.js');
const { ouvrirPage } = require('./lib/cdp.js');
const { avecEffets } = require('./export-fidele.js');
const { partieVisible } = require('../moteur/minutage.js');
const { ecrireAtomique } = require('./lib/fichiers.js');
const { tailleCapture } = require('./regard.js');
const S = require('./lib/scenes.js');

const PARTS = [0.35, 0.65, 0.95];
const QUALITE = 85;
const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

function dureeFrancaise(s) {
  const t = Math.round(s);
  return t < 60 ? `${t} s` : `${Math.floor(t / 60)} min${t % 60 ? ` ${t % 60} s` : ''}`;
}

/** Texte d'une scène pour le PDF : ce que dit la voix, sinon les textes affichés. */
function texteScene(scene) {
  if (scene.voix && scene.voix.texte) return scene.voix.texte;
  return Object.values(scene.textes || {}).map((t) => String(t).trim()).filter(Boolean).join(' · ');
}

/** Page HTML A4 paysage : deux scènes par page, en-tête sur chaque page. */
function pageHTML({ deroule, duree, date, scenes }) {
  const e = S.echapperHTML;
  const entete = `<header><h1>${e(deroule.titre)}</h1><p>${e(dureeFrancaise(duree))} · style ${e(deroule.style)} · ${e(date)}</p></header>`;
  const pages = [];
  for (let i = 0; i < scenes.length; i += 2) {
    const blocs = scenes.slice(i, i + 2).map((s) => `<section><h2><span>${s.numero}</span> ${e(s.nom)} <small>${e(virgule(s.duree))} s</small></h2>
<div class="images">${s.images.map((f, k) => `<img src="${e(f)}" alt="${e(s.nom)}, image ${k + 1}">`).join('')}</div>
<p class="texte">${e(s.texte)}</p></section>`).join('\n');
    pages.push(`<div class="page">${entete}${blocs}</div>`);
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${e(deroule.titre)}</title><style>
@page { size: 297mm 210mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1b1b1b; font: 11pt/1.35 system-ui, sans-serif; }
.page { width: 297mm; height: 210mm; padding: 10mm 12mm; display: flex; flex-direction: column; gap: 5mm; page-break-after: always; break-after: page; overflow: hidden; }
.page:last-child { page-break-after: auto; break-after: auto; }
header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 0.4mm solid #ddd; padding-bottom: 2mm; }
h1 { margin: 0; font-size: 15pt; }
header p { margin: 0; color: #555; font-size: 10pt; }
section { flex: 1; display: flex; flex-direction: column; gap: 2mm; min-height: 0; }
h2 { margin: 0; font-size: 12pt; }
h2 span { display: inline-block; min-width: 7mm; padding: 0 1.5mm; border-radius: 1mm; background: #1b1b1b; color: #fff; text-align: center; }
h2 small { color: #777; font-weight: 400; }
.images { display: flex; gap: 3mm; flex: 1; min-height: 0; }
.images img { flex: 1; min-width: 0; height: 100%; object-fit: contain; background: #f2f2f2; border-radius: 1mm; }
.texte { margin: 0; color: #333; font-size: 10.5pt; max-height: 12mm; overflow: hidden; }
</style></head><body>${pages.join('\n')}</body></html>`;
}

/**
 * planchePdf({ dossier, scenes?, dossierStyles?, navigateur?, date? }) -> { ok, fichier, pages, scenes, images: [relatifs], message? }
 */
async function planchePdf({ dossier, scenes = null, dossierStyles, navigateur = trouverNavigateur(), date = new Date() }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const ids = scenes && scenes.length ? scenes : deroule.scenes.map((s) => s.id);
  const inconnues = ids.filter((id) => !deroule.scenes.some((s) => s.id === id));
  if (inconnues.length) return { ok: false, message: `Scène inconnue : ${inconnues.join(', ')} (scènes : ${deroule.scenes.map((s) => s.id).join(', ')}).` };
  if (!navigateur) return { ok: false, message: 'Le PDF des scènes a besoin de Chrome ou Edge : installez l\'un des deux.' };
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  const [largeur, hauteur] = tailleCapture(deroule.format.ratio);
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pdf-'));
  const pageVideo = path.join(travail, 'video.html');
  fs.writeFileSync(pageVideo, assemblage.html, 'utf8');
  const dossierPlanche = path.join(projet, 'sortie', 'planche');
  fs.mkdirSync(dossierPlanche, { recursive: true });
  let lisible = null;
  let capture = null;
  try {
    capture = await ouvrirCapture({ fichierHtml: pageVideo, largeur, hauteur, navigateur, gpu: avecEffets(projet, deroule), delai: 60000,
      ouvrir: async (o) => { lisible = await ouvrirPage(o); return lisible; } });
    const minutage = capture.minutage;
    const fiches = [];
    const images = [];
    for (const id of ids) {
      const i = minutage.scenes.findIndex((s) => s.id === id);
      const v = partieVisible(minutage, i);
      const fichiers = [];
      for (const [k, part] of PARTS.entries()) {
        const t = v.debut + (v.fin - v.debut) * part;
        // Deux captures du même instant, la seconde gardée (comme les planches de regard) ; sous-titres gardés : c'est la vidéo.
        await capture.capturerJpeg(t, { qualite: QUALITE, sansSousTitres: false });
        const jpeg = await capture.capturerJpeg(t, { qualite: QUALITE, sansSousTitres: false });
        const nom = `${id}-${k + 1}.jpg`;
        ecrireAtomique(path.join(dossierPlanche, nom), jpeg);
        fs.writeFileSync(path.join(travail, nom), jpeg);
        fichiers.push(nom);
        images.push(`sortie/planche/${nom}`);
      }
      const sc = deroule.scenes.find((s) => s.id === id);
      fiches.push({ numero: deroule.scenes.indexOf(sc) + 1, nom: sc.chapitre || id, duree: minutage.scenes[i].fin - minutage.scenes[i].debut, texte: texteScene(sc), images: fichiers });
    }
    const jour = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const html = path.join(travail, 'planches.html');
    fs.writeFileSync(html, pageHTML({ deroule, duree: minutage.duree, date: jour, scenes: fiches }), 'utf8');
    await lisible.aller(pathToFileURL(html).href);
    await lisible.evaluer('Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })');
    const r = await lisible.envoyer('Page.printToPDF', { landscape: true, printBackground: true, paperWidth: 11.69, paperHeight: 8.27, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, preferCSSPageSize: false });
    const pdf = Buffer.from(r.data, 'base64');
    const fichier = path.join(projet, 'sortie', `${slug(deroule.titre)}-planches.pdf`);
    ecrireAtomique(fichier, pdf);
    return { ok: true, fichier: path.relative(projet, fichier).split(path.sep).join('/'), pages: Math.ceil(fiches.length / 2), scenes: fiches.length, images, octets: pdf.length };
  } catch (e) {
    return { ok: false, message: `Le PDF des scènes n'a pas pu être fait (${e.message}).` };
  } finally {
    if (capture) await capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const [dossier = '.', liste] = args.filter((a) => !a.startsWith('--'));
  planchePdf({ dossier, scenes: liste ? liste.split(',').filter(Boolean) : null }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { planchePdf, pageHTML, texteScene, PARTS };
