'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { comparer } = require('../scripts/comparer.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { stylesEssai, projetTypes, modifierJSON } = require('./aide/styles.js');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/** Remplace l'export : écrit les images de planche et garde une trace du projet temporaire. */
function fauxExport(vus, echecPour = null) {
  return async ({ dossier, planche }) => {
    const d = JSON.parse(fs.readFileSync(path.join(dossier, 'deroule.json'), 'utf8'));
    vus.push({ dossier, deroule: d, scenes: Object.fromEntries(d.scenes.map((s) => [s.id, fs.readFileSync(path.join(dossier, s.fichier), 'utf8')])) });
    if (d.style === echecPour) return { ok: false, message: 'Le navigateur s\'est fermé avant la fin de l\'export.' };
    fs.mkdirSync(path.join(dossier, 'sortie', 'planche'), { recursive: true });
    for (const id of planche) for (const k of [1, 2, 3]) fs.writeFileSync(path.join(dossier, 'sortie', 'planche', `${id}-${k}.png`), PNG);
    return { ok: true };
  };
}

test('3 styles × 2 premières scènes : images, page, projets temporaires supprimés', async () => {
  const racine = stylesEssai(['alpha', 'beta', 'gamma']);
  const dir = projetTypes(racine);
  const vus = [];
  const r = await comparer({ dossier: dir, styles: ['alpha', 'beta', 'gamma'], dossierStyles: racine, exporter: fauxExport(vus) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/comparaison/comparaison.html');
  assert.deepEqual(r.images, ['alpha', 'beta', 'gamma'].flatMap((s) => ['intro', 'regles'].map((id) => `sortie/comparaison/${s}-${id}.png`)));
  for (const image of r.images) assert.ok(fs.existsSync(path.join(dir, image)), image);
  assert.deepEqual(vus.map((v) => v.deroule.style), ['alpha', 'beta', 'gamma']);
  assert.match(vus[1].scenes.regles, /<!-- style:beta -->/);
  assert.match(vus[1].scenes.regles, /data-scene="regles"/);
  assert.equal(vus[1].deroule.scenes[1].textes.point3, 'Noter');
  for (const v of vus) assert.equal(fs.existsSync(v.dossier), false, 'projet temporaire supprimé');
  const page = fs.readFileSync(path.join(dir, r.fichier), 'utf8');
  assert.equal((page.match(/<th>/g) || []).length, 3);
  assert.match(page, /posé · lisible · rassurant/);
  assert.match(page, /<img src="gamma-regles\.png"/);
});

test('scène libre aux clés inconnues : type le plus proche, textes recasés ; texte trop long : avertissement', async () => {
  const racine = stylesEssai(['alpha', 'beta']);
  modifierJSON(path.join(racine, 'beta', 'catalogue.json'), (c) => { c.scenes.find((s) => s.nom === 'titre').textes.titre = 10; });
  const dir = projetTypes(racine);
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  d.scenes[3].textes = { question: 'Où ranger ?', reponse: 'En haut' };
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d));
  const vus = [];
  const r = await comparer({ dossier: dir, styles: ['alpha', 'beta'], scenes: ['intro', 'carte'], dossierStyles: racine, exporter: fauxExport(vus) });
  assert.equal(r.ok, true, r.message);
  const carte = vus[0].deroule.scenes[1];
  assert.equal(carte.type, 'titre');
  assert.deepEqual(carte.textes, { etiquette: 'Où ranger ?', titre: 'En haut', sous: '' });
  assert.deepEqual(r.avertissements, ['Style « beta », scène « intro » : le texte « titre » a 18 caractères, ce style en accepte 10.']);
});

test('refus : style inconnu, trop de styles, scène inconnue ; échec au 2e style : message nommé, nettoyage', async () => {
  const racine = stylesEssai(['alpha', 'beta']);
  const dir = projetTypes(racine);
  const vus = [];
  const opts = { dossier: dir, dossierStyles: racine, exporter: fauxExport(vus, 'beta') };
  assert.match((await comparer({ ...opts, styles: ['alpha', 'neon'] })).message, /Style « neon » introuvable/);
  assert.match((await comparer({ ...opts, styles: ['alpha', 'beta', 'alpha', 'x', 'y'] })).message, /de 1 à 3 styles/);
  assert.match((await comparer({ ...opts, styles: ['alpha'], scenes: ['rien'] })).message, /Scène inconnue : rien/);
  const echec = await comparer({ ...opts, styles: ['alpha', 'beta'] });
  assert.equal(echec.ok, false);
  assert.match(echec.message, /^Style « beta » : Le navigateur s'est fermé/);
  for (const v of vus) assert.equal(fs.existsSync(v.dossier), false);
});

const navigateur = trouverNavigateur();
test('dans le navigateur : vraie planche comparative de 2 styles', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const racine = stylesEssai(['alpha', 'beta']);
  const dir = projetTypes(racine);
  const r = await comparer({ dossier: dir, styles: ['alpha', 'beta'], dossierStyles: racine, navigateur });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.images.length, 4);
  for (const image of r.images) assert.equal(fs.readFileSync(path.join(dir, image)).subarray(1, 4).toString(), 'PNG');
});
