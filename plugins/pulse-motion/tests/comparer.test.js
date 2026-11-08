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

test('refus : style inconnu, trop de styles, scène inconnue ; échec au 2e style : dit, sans arrêter le 1er, nettoyage', async () => {
  const racine = stylesEssai(['alpha', 'beta']);
  const dir = projetTypes(racine);
  const vus = [];
  const opts = { dossier: dir, dossierStyles: racine, exporter: fauxExport(vus, 'beta') };
  assert.match((await comparer({ ...opts, styles: ['alpha', 'neon'] })).message, /Style « neon » introuvable/);
  assert.match((await comparer({ ...opts, styles: ['alpha', 'beta', 'alpha', 'x', 'y'] })).message, /de 1 à 3 styles/);
  assert.match((await comparer({ ...opts, styles: ['alpha'], scenes: ['rien'] })).message, /Scène inconnue : rien/);
  const echec = await comparer({ ...opts, styles: ['alpha', 'beta'] });
  assert.equal(echec.ok, true);
  assert.deepEqual(echec.images, ['sortie/comparaison/alpha-intro.png', 'sortie/comparaison/alpha-regles.png']);
  assert.match(echec.avertissements.join('\n'), /Style « beta » : Le navigateur s'est fermé/);
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

test('scène toute faite manquante dans un style : échec nommant le style, les autres comparés, rien de temporaire', async () => {
  const os = require('node:os');
  const racine = stylesEssai(['alpha', 'beta']);
  fs.rmSync(path.join(racine, 'beta', 'scenes', 'titre.html'));
  const dir = projetTypes(racine);
  const restes = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('pm-comparer-beta-')).length;
  const avant = restes();
  const r = await comparer({ dossier: dir, styles: ['alpha', 'beta'], dossierStyles: racine, exporter: fauxExport([]) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.echecs.map((e) => e.style), ['beta']);
  assert.match(r.avertissements.join('\n'), /Style « beta » : /);
  assert.equal(restes(), avant);
  const seul = await comparer({ dossier: dir, styles: ['beta'], dossierStyles: racine, exporter: fauxExport([]) });
  assert.equal(seul.ok, false);
  assert.match(seul.message, /^Style « beta » : /);
  assert.equal(restes(), avant);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'comparaison')), false);
});

test('interruption : les nettoyages en cours (navigateur, aperçu) sont faits', async () => {
  const { nettoyages, nettoyerTout } = require('../scripts/exporter.js');
  let fait = false;
  nettoyages.add(async () => { fait = true; });
  await nettoyerTout();
  assert.equal(fait, true);
  assert.equal(nettoyages.size, 0);
});

// --- En parallèle (spec Rapidité 5.13) ---

/** Faux export qui attend `attente(style)` ms ; compte les exports en cours en même temps. */
function exportLent(attente, suivi) {
  return async ({ dossier, planche }) => {
    const d = JSON.parse(fs.readFileSync(path.join(dossier, 'deroule.json'), 'utf8'));
    suivi.enCours++;
    suivi.max = Math.max(suivi.max, suivi.enCours);
    await new Promise((r) => setTimeout(r, attente(d.style)));
    suivi.enCours--;
    suivi.fins.push(d.style);
    fs.mkdirSync(path.join(dossier, 'sortie', 'planche'), { recursive: true });
    for (const id of planche) for (const k of [1, 2, 3]) fs.writeFileSync(path.join(dossier, 'sortie', 'planche', `${id}-${k}.png`), Buffer.concat([PNG, Buffer.from(`${d.style}-${id}`)]));
    return { ok: true };
  };
}

async function avecParalleles(valeur, fn) {
  const avant = process.env.PM_PARALLELES;
  if (valeur === undefined) delete process.env.PM_PARALLELES; else process.env.PM_PARALLELES = valeur;
  try { return await fn(); } finally { if (avant === undefined) delete process.env.PM_PARALLELES; else process.env.PM_PARALLELES = avant; }
}

test('comparer-en-parallele-memes-images : 3 styles en même temps, mêmes images qu\'un par un', async () => {
  const racine = stylesEssai(['alpha', 'beta', 'gamma']);
  const lireImages = (dir, r) => r.images.map((i) => fs.readFileSync(path.join(dir, i)).toString('hex'));
  const seul = { enCours: 0, max: 0, fins: [] };
  const dir1 = projetTypes(racine);
  const r1 = await avecParalleles('1', () => comparer({ dossier: dir1, styles: ['alpha', 'beta', 'gamma'], dossierStyles: racine, exporter: exportLent(() => 30, seul) }));
  assert.equal(r1.ok, true, r1.message);
  assert.equal(seul.max, 1);
  const ensemble = { enCours: 0, max: 0, fins: [] };
  const dir2 = projetTypes(racine);
  const r2 = await avecParalleles('3', () => comparer({ dossier: dir2, styles: ['alpha', 'beta', 'gamma'], dossierStyles: racine, exporter: exportLent(() => 30, ensemble) }));
  assert.equal(r2.ok, true, r2.message);
  assert.equal(ensemble.max, 3, 'les trois exports tournent en même temps');
  assert.deepEqual(r2.images, r1.images);
  assert.deepEqual(lireImages(dir2, r2), lireImages(dir1, r1));
  assert.equal(fs.readFileSync(path.join(dir2, r2.fichier), 'utf8'), fs.readFileSync(path.join(dir1, r1.fichier), 'utf8'));
});

test('comparer-un-style-en-echec : les autres styles sont comparés, l\'échec est dit ; tous en échec : refus nommé', async () => {
  const racine = stylesEssai(['alpha', 'beta', 'gamma']);
  const dir = projetTypes(racine);
  const vus = [];
  const r = await comparer({ dossier: dir, styles: ['alpha', 'beta', 'gamma'], dossierStyles: racine, exporter: fauxExport(vus, 'beta') });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.images, ['alpha', 'gamma'].flatMap((s) => ['intro', 'regles'].map((id) => `sortie/comparaison/${s}-${id}.png`)));
  assert.deepEqual(r.echecs, [{ style: 'beta', message: 'Le navigateur s\'est fermé avant la fin de l\'export.' }]);
  assert.ok(r.avertissements.some((a) => /^Style « beta » : Le navigateur s'est fermé/.test(a)), JSON.stringify(r.avertissements));
  for (const v of vus) assert.equal(fs.existsSync(v.dossier), false);
  const page = fs.readFileSync(path.join(dir, r.fichier), 'utf8');
  assert.equal((page.match(/<th>/g) || []).length, 2);
  const seul = await comparer({ dossier: dir, styles: ['beta'], dossierStyles: racine, exporter: fauxExport([], 'beta') });
  assert.equal(seul.ok, false);
  assert.match(seul.message, /^Style « beta » : Le navigateur s'est fermé/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'comparaison')), false);
});

test('comparer-ordre-conserve : l\'ordre des colonnes et des images est celui des styles demandés, quel que soit le premier fini', async () => {
  const racine = stylesEssai(['alpha', 'beta', 'gamma']);
  const dir = projetTypes(racine);
  const suivi = { enCours: 0, max: 0, fins: [] };
  const attente = { alpha: 90, beta: 50, gamma: 10 };
  const r = await avecParalleles('3', () => comparer({ dossier: dir, styles: ['alpha', 'beta', 'gamma'], dossierStyles: racine, exporter: exportLent((s) => attente[s], suivi) }));
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(suivi.fins, ['gamma', 'beta', 'alpha']);
  assert.deepEqual(r.images, ['alpha', 'beta', 'gamma'].flatMap((s) => ['intro', 'regles'].map((id) => `sortie/comparaison/${s}-${id}.png`)));
  const page = fs.readFileSync(path.join(dir, r.fichier), 'utf8');
  const ordre = [...page.matchAll(/<th><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
  assert.deepEqual(ordre, ['alpha', 'beta', 'gamma']);
});

test('paralleles : règle commune (fils, plafond de 4, mémoire, tâches, GPU, PM_PARALLELES)', () => {
  const { navigateursParalleles } = require('../scripts/lib/paralleles.js');
  const Go = 1024 * 1024 * 1024;
  assert.deepEqual(navigateursParalleles({ taches: 10, fils: 32, memoireLibre: 64 * Go, force: undefined }), { nombre: 4, regle: 'plafond' });
  assert.deepEqual(navigateursParalleles({ taches: 10, fils: 4, memoireLibre: 64 * Go, force: undefined }), { nombre: 2, regle: 'fils' });
  assert.equal(navigateursParalleles({ taches: 10, fils: 32, memoireLibre: 3 * Go, force: undefined }).regle, 'memoire');
  assert.equal(navigateursParalleles({ taches: 10, fils: 32, memoireLibre: 1 * Go, force: undefined }).nombre, 1);
  assert.deepEqual(navigateursParalleles({ taches: 3, fils: 32, memoireLibre: 64 * Go, force: undefined }), { nombre: 3, regle: 'taches' });
  assert.deepEqual(navigateursParalleles({ taches: 10, fils: 32, memoireLibre: 64 * Go, gpu: true, force: undefined }), { nombre: 2, regle: 'gpu' });
  assert.deepEqual(navigateursParalleles({ taches: 10, fils: 2, memoireLibre: 1 * Go, force: '6' }), { nombre: 6, regle: 'PM_PARALLELES' });
  assert.equal(navigateursParalleles({ taches: 10, fils: 32, memoireLibre: 64 * Go, force: '12' }).regle, 'plafond', 'hors de 1 à 8 : ignoré');
});
