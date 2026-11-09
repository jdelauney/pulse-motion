'use strict';
/* Non-régression visuelle du moteur (spec S2, 5.14) : les deux étalons comparés à leurs références du système courant.
 * Plancher de bruit mesuré d'abord (deux rendus comparés entre eux) ; échec si l'écart moyen dépasse
 * max(2 × plancher, 0,5 %) ou si une image s'écarte de plus de 5 %. En cas d'échec : sortie-tests/etalon/<nom>/ (avant,
 * après, différence) et les pires images nommées. Références : node scripts/lancer-tests.js --etalon. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { comparerImages } = require('../scripts/lib/images.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { optionsWebGPU } = require('./aide/gpu.js');
const { capturerEtalon, assemblerEtalon, lireReferences, dossierReference, nomImage } = require('./aide/etalon.js');
const { copierPlugin } = require('./aide/copie-plugin.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const SORTIE = path.join(__dirname, '..', 'sortie-tests', 'etalon');
const ECART_MIN = 0.005;
const ECART_IMAGE = 0.05;

/** Écarts de chaque image à la référence ; -> { moyen, ecarts: [{ k, ecartMoyen, carte }] } */
function ecarts(images, references) {
  const liste = images.map((png, k) => ({ k, ...comparerImages(references[k], png) }));
  return { moyen: liste.reduce((s, x) => s + x.ecartMoyen, 0) / liste.length, liste };
}

/** Jugement : { ok, seuil, pires } */
function juger(images, references, plancher) {
  const e = ecarts(images, references);
  const seuil = Math.max(2 * plancher, ECART_MIN);
  const pires = [...e.liste].sort((a, b) => b.ecartMoyen - a.ecartMoyen).slice(0, 3);
  return { ok: e.moyen <= seuil && e.liste.every((x) => x.ecartMoyen <= ECART_IMAGE), moyen: e.moyen, seuil, pires, liste: e.liste };
}

function ecrireEchec(nom, images, references, liste) {
  const dir = path.join(SORTIE, nom);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  liste.forEach((x) => {
    fs.writeFileSync(path.join(dir, `avant-${nomImage(x.k)}`), references[x.k]);
    fs.writeFileSync(path.join(dir, `apres-${nomImage(x.k)}`), images[x.k]);
    if (x.carte) fs.writeFileSync(path.join(dir, `difference-${nomImage(x.k)}`), x.carte);
  });
  return dir;
}

async function verifierEtalon(t, nom, plateforme = process.platform) {
  const references = lireReferences(nom, plateforme);
  if (!references) return t.skip(`Pas de référence pour ce système (${plateforme}) : ${path.relative(path.join(__dirname, '..'), dossierReference(nom, plateforme))} manque ; les enregistrer avec « node scripts/lancer-tests.js --etalon »`);
  if (nom === 'avec-gpu' && !(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre : étalon avec GPU sauté');
  const fichier = assemblerEtalon(nom);
  const a = await capturerEtalon(nom, { fichier, navigateur });
  const b = await capturerEtalon(nom, { fichier, navigateur });
  const plancher = ecarts(b, a).moyen;
  const j = juger(a, references, plancher);
  if (!j.ok) {
    const dir = ecrireEchec(nom, a, references, j.liste);
    assert.fail(`Étalon « ${nom} » : écart moyen ${(j.moyen * 100).toFixed(2)} % (seuil ${(j.seuil * 100).toFixed(2)} %, plancher ${(plancher * 100).toFixed(3)} %) ; pires images : ${j.pires.map((x) => `${nomImage(x.k)} ${(x.ecartMoyen * 100).toFixed(2)} %`).join(', ')} ; voir ${dir}`);
  }
}

test('non-regression-visuelle : étalon sans GPU identique à sa référence, au plancher de bruit près', sans, (t) => verifierEtalon(t, 'sans-gpu'));

test('non-regression-visuelle : étalon avec GPU identique à sa référence, au plancher de bruit près', sans, (t) => verifierEtalon(t, 'avec-gpu'));

test('non-regression-visuelle : un changement d\'une courbe du moteur est détecté (cas témoin)', sans, async (t) => {
  const references = lireReferences('sans-gpu');
  if (!references) return t.skip(`Pas de référence pour ce système (${process.platform})`);
  // Copie du plugin dont la courbe « cubic » (transitions, compteurs) est cassée : elle vaut 1 tout de suite. Un écart plus
  // fin (cubique devenue quadratique : 0,02 % en moyenne, 0,26 % au pire) reste sous les seuils de la spec, voulus pour
  // ne pas confondre un changement de moteur avec le bruit du rendu.
  const copie = copierPlugin();
  const courbes = path.join(copie, 'moteur', 'courbes.js');
  const avant = fs.readFileSync(courbes, 'utf8');
  const apres = avant.replace('cubic: function () { return function (t) { return t * t * t; }; },', 'cubic: function () { return function () { return 1; }; },');
  assert.notEqual(apres, avant, 'la courbe cubic est trouvée dans le moteur');
  fs.writeFileSync(courbes, apres, 'utf8');
  const { assembler } = require(path.join(copie, 'scripts', 'assembler.js'));
  const images = await capturerEtalon('sans-gpu', { assembler, navigateur });
  const j = juger(images, references, 0);
  assert.equal(j.ok, false, `le changement de courbe doit se voir (écart moyen ${(j.moyen * 100).toFixed(3)} %, pire image ${(j.pires[0].ecartMoyen * 100).toFixed(2)} %)`);
});

test('non-regression-visuelle : sans référence pour ce système, sauté avec un message', async () => {
  let message = null;
  await verifierEtalon({ skip: (m) => { message = m; } }, 'sans-gpu', 'plan9');
  assert.match(message, /^Pas de référence pour ce système \(plan9\) : .*reference-plan9 manque ; les enregistrer avec/);
});
