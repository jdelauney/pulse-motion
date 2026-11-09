'use strict';
/* Pulse Motion – vidéos étalons de la non-régression visuelle du moteur (spec S2, 5.14).
 *
 * tests/fixtures/etalon/<nom>/ : sans-gpu (textes, lettres, caméra, transitions, personnage, sous-titres, mouvements du
 * dictionnaire) et avec-gpu (particules, fond et transition par shader). Références par système, car le rendu des
 * polices diffère : tests/fixtures/etalon/<nom>/reference-<win32|darwin|linux>/NN.png (12 images, capture fidèle à 480 px).
 * capturerEtalon(nom, { assembler, navigateur }) -> [PNG] ; enregistrerReferences() : node scripts/lancer-tests.js --etalon,
 * quand un changement de rendu est voulu (à dire dans le message de commit).
 */
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirCapture } = require('../../scripts/lib/capture-fidele.js');
const { trouverNavigateur } = require('../../scripts/lib/navigateur.js');
const { dossierTemporaire } = require('./temporaire.js');

const DOSSIER = path.join(__dirname, '..', 'fixtures', 'etalon');
const ETALONS = { 'sans-gpu': { gpu: false }, 'avec-gpu': { gpu: true } };
const IMAGES = 12;
const LARGEUR = 480;
const HAUTEUR = 270;

const dossierReference = (nom, plateforme = process.platform) => path.join(DOSSIER, nom, `reference-${plateforme}`);

/** Page assemblée de l'étalon (copie temporaire), par l'assembleur donné (celui du plugin, ou d'une copie modifiée). */
function assemblerEtalon(nom, { assembler = require('../../scripts/assembler.js').assembler } = {}) {
  const dir = dossierTemporaire(`pm-etalon-${nom}-`);
  fs.cpSync(path.join(DOSSIER, nom), dir, { recursive: true, filter: (src) => !/reference-/.test(path.basename(src)) });
  const r = assembler({ dossier: dir, ecrire: false });
  if (!r.html) throw new Error(`Étalon « ${nom} » : assemblage impossible (${(r.erreurs || []).map((e) => e.message).join(' ; ')})`);
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, r.html, 'utf8');
  return fichier;
}

/** IMAGES instants répartis sur la vidéo, calés sur les images (30 par seconde). */
const instants = (duree, ips = 30) => Array.from({ length: IMAGES }, (_, k) => Math.round(((k + 0.5) * duree * ips) / IMAGES) / ips);

async function capturerEtalon(nom, { assembler, navigateur = trouverNavigateur(), fichier } = {}) {
  const page = fichier || assemblerEtalon(nom, assembler ? { assembler } : {});
  const c = await ouvrirCapture({ fichierHtml: page, largeur: LARGEUR, hauteur: HAUTEUR, navigateur, gpu: ETALONS[nom].gpu });
  try {
    const images = [];
    for (const t of instants(c.duree)) images.push(await c.capturer(t));
    return images;
  } finally {
    await c.fermer();
  }
}

const nomImage = (k) => `${String(k + 1).padStart(2, '0')}.png`;

function lireReferences(nom, plateforme = process.platform) {
  const dir = dossierReference(nom, plateforme);
  if (!fs.existsSync(dir)) return null;
  return Array.from({ length: IMAGES }, (_, k) => fs.readFileSync(path.join(dir, nomImage(k))));
}

async function enregistrerReferences({ noms = Object.keys(ETALONS), journal = console.log } = {}) {
  for (const nom of noms) {
    let images;
    try { images = await capturerEtalon(nom); } catch (e) { journal(`Étalon « ${nom} » non enregistré : ${e.message}`); continue; }
    const dir = dossierReference(nom);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    images.forEach((png, k) => fs.writeFileSync(path.join(dir, nomImage(k)), png));
    journal(`Étalon « ${nom} » : ${images.length} images enregistrées dans ${path.relative(process.cwd(), dir)}`);
  }
}

module.exports = { ETALONS, IMAGES, DOSSIER, dossierReference, assemblerEtalon, capturerEtalon, lireReferences, enregistrerReferences, nomImage };
