'use strict';
/* Contrôle et retouche (spec Rapidité 5.8 et 5.9) : un seul assemblage, la page écrite par le contrôle, contrôle du
 * rendu limité aux scènes changées. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Assembleur = require('../scripts/assembler.js');
const { controlerComplet } = require('../scripts/controler.js');
const { empreintesControle, plagesScenes } = require('../scripts/lib/empreintes.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const MARGE = '<style>@scope { :scope { padding: 12cqh 12cqw; } }</style>';
const PLUGIN = path.join(__dirname, '..');

/** Projet de 3 scènes coupées (sans chevauchement) : intro, chiffre, fin ; marges posées (aucun défaut). */
function projet3() {
  const dir = copierProjet('projet-simple');
  for (const f of ['01-intro.html', '02-chiffre.html']) {
    const fichier = path.join(dir, 'scenes', f);
    fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace(/(<section[^>]*>)/, `$1\n  ${MARGE}`));
  }
  fs.writeFileSync(path.join(dir, 'scenes', '03-fin.html'), fs.readFileSync(path.join(dir, 'scenes', '01-intro.html'), 'utf8').replace('data-scene="intro"', 'data-scene="fin"'));
  modifierDeroule(dir, (d) => {
    d.scenes[0].transition = 'coupe';
    d.scenes[1].transition = 'coupe';
    d.scenes.push({ id: 'fin', fichier: 'scenes/03-fin.html', duree: 4, textes: { titre: 'À retenir', sous: 'Le froid protège' }, transition: 'coupe' });
  });
  return dir;
}

/** Mesure factice : un constat « marge » par scène mesurée, et les options reçues. */
function mesureFactice(appels) {
  return async (opts) => {
    appels.push(opts);
    const scenes = opts.scenes || ['intro', 'chiffre', 'fin'];
    return { renduVerifie: true, ajustements: [], problemes: scenes.map((s) => ({ regle: 'marge', gravite: 'alerte', scene: s, element: 'titre', message: `mesure ${appels.length} de « ${s} »` })) };
  };
}

/** Compte les appels à assembler() pendant fn. */
async function compterAssemblages(fn) {
  const original = Assembleur.assembler;
  let n = 0;
  Assembleur.assembler = (...a) => { n++; return original(...a); };
  try { await fn(); } finally { Assembleur.assembler = original; }
  return n;
}

const lireControle = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'controle.json'), 'utf8'));

test('controle-un-seul-assemblage : un contrôle complet sans correction assemble une fois', async () => {
  const dir = projet3();
  const n = await compterAssemblages(() => controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: true, gpu: true, mesurer: mesureFactice([]) }));
  assert.equal(n, 1);
});

test('controle-deux-assemblages-apres-correction : une correction du déroulé fait réassembler une fois', async () => {
  const dir = projet3();
  modifierDeroule(dir, (d) => { d.scenes[2].textes.sous = 'Le froid protège !'; });
  let r;
  const n = await compterAssemblages(async () => { r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: true, mesurer: mesureFactice([]) }); });
  assert.ok(r.corrections.some((c) => c.regle === 'typographie'), JSON.stringify(r.corrections));
  assert.equal(n, 2);
  // La page écrite suit le déroulé corrigé.
  const page = fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.html'), 'utf8');
  assert.match(page, /Le froid protège !/);
});

test('controler-ecrit-la-page : la page est écrite par le contrôle, réécrite seulement si elle change', async () => {
  const dir = projet3();
  const page = path.join(dir, 'sortie', 'la-chaine-du-froid.html');
  assert.equal(fs.existsSync(page), false);
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: mesureFactice([]) });
  assert.equal(fs.readFileSync(page, 'utf8'), Assembleur.assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).html);
  // Rapport de l'aperçu sur la même page : gardé (la page n'est pas réécrite).
  fs.writeFileSync(path.join(dir, 'sortie', 'controle-page.json'), JSON.stringify({ debordements: [] }));
  const date = fs.statSync(page).mtimeMs;
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: mesureFactice([]) });
  assert.equal(fs.statSync(page).mtimeMs, date);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'controle-page.json')));
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Nouveau titre'; });
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: mesureFactice([]) });
  assert.match(fs.readFileSync(page, 'utf8'), /Nouveau titre/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'controle-page.json')), false, 'rapport de l\'ancienne page retiré');
});

test('creer-retoucher-sans-assembler-avant-controler : un seul appel, pulse-motion controler', () => {
  for (const nom of ['creer', 'retoucher']) {
    const texte = fs.readFileSync(path.join(PLUGIN, 'skills', nom, 'SKILL.md'), 'utf8');
    assert.equal(/pulse-motion assembler/.test(texte), false, nom);
    assert.equal(/relancer assembler/.test(texte), false, nom);
    assert.match(texte, /`pulse-motion controler \.` \(il assemble aussi la page\)/, nom);
  }
});

test('exporter-exige-controle-complet : l\'export passe par un contrôle complet', () => {
  const texte = fs.readFileSync(path.join(PLUGIN, 'skills', 'exporter', 'SKILL.md'), 'utf8');
  assert.match(texte, /`pulse-motion controler \. --complet`/);
  assert.equal(/`pulse-motion controler \.`(?! --complet)/.test(texte.replace(/`pulse-motion controler \. --complet`/g, '')), false);
});

test('controle-partiel-reprend-les-scenes-inchangees : seule la scène retouchée est mesurée, les autres résultats repris', async () => {
  const dir = projet3();
  const appels = [];
  const mesurer = mesureFactice(appels);
  const r1 = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer });
  assert.equal(r1.rendu, 'complet');
  assert.deepEqual(r1.scenesMesurees, ['intro', 'chiffre', 'fin']);
  assert.equal(appels[0].scenes, undefined);
  const c1 = lireControle(dir);
  assert.equal(c1.version, 2);
  assert.deepEqual(Object.keys(c1.empreintes.scenes), ['intro', 'chiffre', 'fin']);
  assert.deepEqual(c1.rendus.fin.map((p) => p.message), ['mesure 1 de « fin »']);

  modifierDeroule(dir, (d) => { d.scenes[1].textes.legende = 'bactéries en 2 h'; });
  const r2 = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer });
  assert.equal(r2.rendu, 'partiel');
  assert.deepEqual(r2.scenesMesurees, ['chiffre']);
  assert.deepEqual(appels[1].scenes, ['chiffre']);
  // Plages : la scène et deux relevés de chaque côté ; flashs : 1 s de chaque côté.
  assert.equal(appels[1].plages.length, 1);
  assert.ok(Math.abs(appels[1].plages[0][0] - (4 - 0.4)) < 1e-6, JSON.stringify(appels[1].plages));
  assert.ok(Math.abs(appels[1].plagesFlashs[0][0] - 3) < 1e-6, JSON.stringify(appels[1].plagesFlashs));
  const marges = r2.problemes.filter((p) => p.regle === 'marge').map((p) => p.message);
  assert.deepEqual(marges, ['mesure 1 de « intro »', 'mesure 2 de « chiffre »', 'mesure 1 de « fin »']);
});

test('controle-sans-changement-sans-navigateur : rien de changé, aucune mesure, résultats repris', async () => {
  const dir = projet3();
  const appels = [];
  const r1 = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: mesureFactice(appels) });
  const r2 = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: () => { throw new Error('aucun navigateur ne doit être lancé'); } });
  assert.equal(appels.length, 1);
  assert.equal(r2.rendu, 'partiel');
  assert.deepEqual(r2.scenesMesurees, []);
  assert.equal(r2.renduVerifie, true);
  assert.deepEqual(r2.problemes, r1.problemes);
  // Sans rendu (--sans-rendu), les résultats restent comparables au contrôle suivant.
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, rendu: false });
  const r3 = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: () => { throw new Error('aucun navigateur ne doit être lancé'); } });
  assert.deepEqual(r3.scenesMesurees, []);
});

test('controle-complet-si-moteur-ou-seuils-changent : moteur, seuils, style, contrôle demandé complet', async () => {
  const dir = projet3();
  const appels = [];
  const mesurer = mesureFactice(appels);
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer });
  const trafiquer = (fn) => { const c = lireControle(dir); fn(c); fs.writeFileSync(path.join(dir, 'sortie', 'controle.json'), JSON.stringify(c)); };
  for (const [quoi, fn] of [['moteur', (c) => { c.empreintes.moteur = 'autre'; }], ['seuils', (c) => { c.empreintes.seuils = 'autres'; }], ['commun', (c) => { c.empreintes.commun = 'autre'; }]]) {
    trafiquer(fn);
    const r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer });
    assert.equal(r.rendu, 'complet', quoi);
    assert.deepEqual(r.scenesMesurees, ['intro', 'chiffre', 'fin'], quoi);
  }
  const r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer, complet: true });
  assert.equal(r.rendu, 'complet');
  assert.equal(appels[appels.length - 1].scenes, undefined);
  // Les empreintes réelles : seuils et moteur entrent dans chaque scène.
  const a = Assembleur.assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const e1 = empreintesControle(a, { seuils: { pasMesure: 0.2 }, moteur: 'm1' });
  const e2 = empreintesControle(a, { seuils: { pasMesure: 0.25 }, moteur: 'm1' });
  const e3 = empreintesControle(a, { seuils: { pasMesure: 0.2 }, moteur: 'm2' });
  for (const id of ['intro', 'chiffre', 'fin']) {
    assert.notEqual(e1.scenes[id], e2.scenes[id]);
    assert.notEqual(e1.scenes[id], e3.scenes[id]);
  }
  // Changer le style (CSS de la page) change toutes les scènes.
  const e4 = empreintesControle({ ...a, cssPage: `${a.cssPage}\n.x{}` }, { seuils: { pasMesure: 0.2 }, moteur: 'm1' });
  for (const id of ['intro', 'chiffre', 'fin']) assert.notEqual(e1.scenes[id], e4.scenes[id]);
});

test('controle-ancien-format-complet : un controle.json d\'avant (sans empreintes) fait un contrôle complet', async () => {
  const dir = projet3();
  fs.mkdirSync(path.join(dir, 'sortie'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sortie', 'controle.json'), JSON.stringify({ problemes: [], corrections: [], renduVerifie: true }));
  const appels = [];
  const r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: mesureFactice(appels) });
  assert.equal(r.rendu, 'complet');
  assert.equal(appels[0].scenes, undefined);
  // Rendu non vérifié la fois d'avant : pas d'empreintes gardées, contrôle complet ensuite.
  modifierDeroule(dir, (d) => { d.scenes[2].textes.titre = 'Autre fin'; });
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: async () => ({ renduVerifie: false, problemes: [{ regle: 'rendu-impossible', gravite: 'alerte', message: 'x' }], ajustements: [] }) });
  assert.equal(lireControle(dir).empreintes, null);
  const r2 = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, mesurer: mesureFactice(appels) });
  assert.equal(r2.rendu, 'complet');
});

test('empreintes : une scène dont l\'entrée chevauche sa voisine est liée à elle ; les autres non', () => {
  const dir = projet3();
  modifierDeroule(dir, (d) => { d.scenes[1].transition = 'fondu'; });
  const a = Assembleur.assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const e1 = empreintesControle(a, { seuils: {}, moteur: 'm' });
  modifierDeroule(dir, (d) => { d.scenes[1].textes.legende = 'autre'; });
  const e2 = empreintesControle(Assembleur.assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }), { seuils: {}, moteur: 'm' });
  assert.notEqual(e1.scenes.chiffre, e2.scenes.chiffre);
  assert.notEqual(e1.scenes.intro, e2.scenes.intro, 'l\'entrée de chiffre chevauche intro');
  assert.equal(e1.scenes.fin, e2.scenes.fin);
  assert.deepEqual(plagesScenes({ scenes: [{ id: 'a', debut: 0, fin: 4 }, { id: 'b', debut: 4, fin: 7 }, { id: 'c', debut: 7, fin: 11 }], duree: 11 }, ['a', 'c'], 1), [[0, 5], [6, 11]]);
});

/** Projet à défauts connus pour le rendu réel : un titre collé au bord (marge) dans intro et fin. */
function projetDefauts() {
  const dir = projet3();
  for (const f of ['01-intro.html', '03-fin.html']) {
    const fichier = path.join(dir, 'scenes', f);
    fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('<h1 id="titre"', '<h1 id="titre" style="position:absolute; left:0.5cqw; top:40cqh"'));
  }
  return dir;
}
const cles = (problemes) => problemes.filter((p) => p.gravite !== 'info').map((p) => `${p.regle}|${p.scene || ''}|${p.element || ''}|${p.gravite}`).sort();

test('controle-partiel-meme-verdict-que-complet : après la retouche d\'une scène, mêmes problèmes qu\'un contrôle complet', sans, async () => {
  const dir = projetDefauts();
  const r1 = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false });
  assert.equal(r1.renduVerifie, true);
  assert.ok(r1.problemes.some((p) => p.regle === 'marge' && p.scene === 'intro'), JSON.stringify(r1.problemes));
  // Retouche de la scène « fin » : son défaut est corrigé, un autre apparaît (texte qui déborde).
  const fin = path.join(dir, 'scenes', '03-fin.html');
  fs.writeFileSync(fin, fs.readFileSync(fin, 'utf8').replace('<h1 id="titre" style="position:absolute; left:0.5cqw; top:40cqh"', '<h1 id="titre" style="width:3cqw; white-space:nowrap; overflow:hidden"'));
  const partiel = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false });
  assert.equal(partiel.rendu, 'partiel');
  assert.deepEqual(partiel.scenesMesurees, ['fin']);
  const complet = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, complet: true });
  assert.equal(complet.rendu, 'complet');
  assert.deepEqual(cles(partiel.problemes), cles(complet.problemes));
  assert.ok(partiel.problemes.some((p) => p.regle === 'debordement' && p.scene === 'fin'), JSON.stringify(partiel.problemes));
  assert.equal(partiel.problemes.some((p) => p.regle === 'marge' && p.scene === 'fin'), false);
});
