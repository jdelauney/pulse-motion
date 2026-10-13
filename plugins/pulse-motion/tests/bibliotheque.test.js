'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');
const { SEUILS } = require('../scripts/controler.js');

const DOSSIER = path.join(__dirname, '..', 'effets');
const NOMS = ['braises', 'confettis', 'energie', 'etincelles', 'explosion', 'feu', 'feu-artifice', 'fumee', 'neige', 'paillettes', 'pluie', 'poussiere'];
const CHARTE = { primaire: '#0a6cff', accent: '#b45309', fond: '#ffffff', texte: '#1a1a1a' };
const charger = (nom) => {
  const f = path.join(DOSSIER, `${nom}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const compiler = (nom, reglages = '', dur = 3) => R.compiler(R.resoudre(nom, charger), { reglages, charte: CHARTE, dur, graine: 1 });

test('bibliothèque : les 12 effets de la spec, nommés comme leur fichier, décrits', () => {
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(fichiers, NOMS);
  for (const nom of NOMS) {
    const brute = charger(nom);
    assert.equal(brute.version, 1, nom);
    assert.equal(brute.nom, nom, `${nom} : « nom » = nom du fichier`);
    assert.ok(typeof brute.description === 'string' && brute.description.length > 30, `${nom} : description`);
  }
  assert.equal(charger('braises').etend, 'etincelles', 'braises dérive des étincelles');
});

test('bibliothèque : 3 à 6 paramètres, compilation par défaut sous le budget', () => {
  for (const nom of NOMS) {
    const recette = R.resoudre(nom, charger);
    const n = Object.keys(recette.parametres || {}).length;
    assert.ok(n >= 3 && n <= 6, `${nom} : ${n} paramètres`);
    const r = compiler(nom);
    assert.equal(r.ok, true, `${nom} : ${JSON.stringify(r.erreurs)}`);
    assert.ok(r.effet.capacite <= SEUILS.budgetParticules, `${nom} : ${r.effet.capacite} particules par défaut`);
    assert.ok(r.effet.fin > 0 && r.effet.fin < 30, `${nom} : fin ${r.effet.fin}`);
  }
});

test('bibliothèque : compilation aux bornes', () => {
  for (const nom of NOMS) {
    const params = R.resoudre(nom, charger).parametres;
    for (const borne of ['min', 'max']) {
      const reglages = Object.entries(params)
        .map(([cle, p]) => (p.type === 'couleur' ? `${cle}: accent` : `${cle}: ${p[borne] !== undefined ? p[borne] : p.defaut}`))
        .join('; ');
      const r = compiler(nom, reglages);
      assert.equal(r.ok, true, `${nom} à ${borne} (${reglages}) : ${JSON.stringify(r.erreurs)}`);
    }
  }
});

test('bibliothèque : charte par défaut (accent et primaire du style)', () => {
  for (const nom of ['confettis', 'feu-artifice', 'energie']) {
    const r = R.compiler(R.resoudre(nom, charger), { charte: CHARTE, dur: 3, graine: 1 });
    assert.equal(r.ok, true, `${nom} : ${JSON.stringify(r.erreurs)}`);
  }
  const confettis = compiler('confettis');
  const bleu = R.couleurLineaire('#0a6cff', {});
  assert.deepEqual(confettis.effet.emetteurs[0].tables.couleur.slice(0, 3).map((x) => Math.round(x * 1e4)), bleu.slice(0, 3).map((x) => Math.round(x * 1e4)));
});

test('bibliothèque : la bibliothèque couvre toutes les familles utiles', () => {
  const types = new Set();
  const textures = new Set();
  const forces = new Set();
  for (const nom of NOMS) {
    for (const em of compiler(nom).effet.emetteurs) {
      types.add(em.rendu.type);
      textures.add(em.rendu.texture);
      em.forces.forEach((f) => forces.add(f.type));
    }
  }
  assert.deepEqual([...types].sort(), ['etincelle', 'sprite', 'trainee'], 'la planche demande une image : pas dans la bibliothèque');
  assert.deepEqual([...textures].sort(), ['confetti', 'disque-doux', 'etoile', 'flamme', 'fumee']);
  assert.deepEqual([...forces].sort(), ['attracteur', 'gravite', 'trainee', 'turbulence', 'vent', 'vortex']);
});

test('bibliothèque : neige : les flocons traversent l\'image à leurs réglages par défaut', () => {
  const flocon = compiler('neige').effet.emetteurs.find((e) => e.nom === 'flocon');
  const g = flocon.forces.find((f) => f.type === 'gravite').a[1];
  // Vitesse limite = g / K, avec K = somme des coefficients de traînée et de vent (masse 1).
  const K = flocon.forces.filter((f) => f.type === 'trainee' || f.type === 'vent').reduce((s, f) => s + f.coef, 0);
  const vieMin = Math.min(...flocon.vie);
  const parcours = vieMin * (g / K);
  assert.ok(parcours >= 102, `un flocon né 52 cqh au-dessus du centre doit atteindre le bas (102 cqh) : ${parcours.toFixed(1)} cqh parcourus`);
});

const { execFileSync, spawnSync } = require('node:child_process');
const PM = path.join(__dirname, '..', 'scripts', 'pm.js');

test('référence à jour : chaque effet et ses réglages sont dans la table', () => {
  const texte = fs.readFileSync(path.join(__dirname, '..', 'references', 'particules.md'), 'utf8');
  const lignes = [...texte.matchAll(/^\| `([a-z-]+)` \| ([^|]+) \| ([^|]+) \|$/gm)];
  assert.deepEqual(lignes.map((m) => m[1]).sort(), NOMS);
  for (const [, nom, reglages] of lignes) {
    const attendus = Object.keys(R.resoudre(nom, charger).parametres).sort();
    const ecrits = [...reglages.matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]).sort();
    assert.deepEqual(ecrits, attendus, `table de la référence, effet « ${nom} »`);
  }
  const calque = texte.split(/\r?\n/).find((l) => l.startsWith('| `rendu_calque` |'));
  assert.ok(calque && !calque.includes('melange'), 'melange ne fait pas partie de rendu_calque');
  for (const mot of ['data-effet', 'data-ancre', 'data-calque', 'data-reglages', 'data-graine', 'etend', 'parametres', 'pulse-motion effet']) {
    assert.ok(texte.includes(mot), `la référence parle de « ${mot} »`);
  }
});

test('commande effet : affiche une recette, refuse un nom dangereux', () => {
  const sortie = execFileSync(process.execPath, [PM, 'effet', 'etincelles'], { encoding: 'utf8' });
  assert.equal(JSON.parse(sortie.slice(sortie.indexOf('{'))).nom, 'etincelles');
  const mauvais = spawnSync(process.execPath, [PM, 'effet', '../deroule'], { encoding: 'utf8' });
  assert.equal(mauvais.status, 2);
  assert.match(mauvais.stderr, /Usage : pulse-motion effet <nom>/);
  const reference = execFileSync(process.execPath, [PM, 'reference', 'particules'], { encoding: 'utf8' });
  assert.match(reference, /## L'essentiel/);
});

test('bibliothèque : étincelles en bleu restent bleues, de la gerbe à la braise', () => {
  const r = compiler('etincelles', 'couleur: #0000ff');
  assert.equal(r.ok, true);
  for (const em of r.effet.emetteurs) {
    const t = em.tables.couleur;
    for (let i = 0; i < t.length; i += 4) assert.ok(t[i] <= t[i + 2] + 1e-9, `${em.nom} : rouge ${t[i]} au-dessus du bleu ${t[i + 2]} (entrée ${i / 4})`);
  }
  const gerbe = r.effet.emetteurs[0].tables.couleur;
  const milieu = (gerbe.length / 4 >> 1) * 4;
  assert.ok(gerbe[milieu + 2] > 0.2, 'à mi-vie la gerbe est franchement bleue');
  const chaud = compiler('etincelles').effet.emetteurs[0].tables.couleur;
  assert.ok(chaud[(chaud.length / 4 >> 1) * 4] > chaud[(chaud.length / 4 >> 1) * 4 + 2], 'le défaut garde un rendu chaud');
});

test('bibliothèque : poussière émise pendant toute la durée, image garnie dès le début', () => {
  const [grain, present] = compiler('poussiere', '', 8).effet.emetteurs;
  assert.equal(grain.debit, 120 / 8, 'débit continu nombre / dur');
  assert.deepEqual(present.salves.map((s) => [s.t, s.nombre]), [[0, 40]], 'salve de départ nombre / 3');
});

test('bibliothèque : options de collision (confettis, pluie, neige, étincelles)', () => {
  const em = (nom) => compiler(nom).effet.emetteurs;
  for (const e of em('confettis')) {
    assert.equal(e.collisions.reponse, 'poser', e.nom);
    assert.equal(e.collisions.empiler, true, e.nom);
  }
  const pluie = em('pluie');
  const goutte = pluie.find((e) => e.nom === 'goutte');
  const eclabousse = pluie.find((e) => e.nom === 'eclabousse');
  assert.equal(goutte.collisions.reponse, 'mourir');
  assert.equal(pluie[goutte.aLaCollision], eclabousse);
  assert.equal(eclabousse.declencheur, 'collision');
  for (const e of em('neige')) {
    assert.equal(e.collisions.reponse, 'poser', e.nom);
    assert.equal(e.collisions.empiler, true, e.nom);
  }
  const gerbe = em('etincelles').find((e) => e.nom === 'gerbe');
  assert.equal(gerbe.collisions.reponse, 'rebond');
  assert.ok(gerbe.collisions.masque & R.CODES.cible.murs, 'les étincelles rebondissent sur les murs');
  assert.equal(em('braises').find((e) => e.nom === 'gerbe').collisions.reponse, 'rebond', 'braises dérivées des étincelles');
});

test('bibliothèque : options de collision : aucun sol décalé, voie rapide gardée sans obstacle', () => {
  for (const nom of NOMS) {
    for (const e of compiler(nom).effet.emetteurs) assert.ok(!e.collisions || e.collisions.sol === null, `${nom} / ${e.nom} : pas de sol décalé`);
  }
  // La goutte de pluie (gravité et traînée seulement) reste en voie rapide quand ses collisions sont inactives.
  assert.equal(compiler('pluie').effet.emetteurs.find((e) => e.nom === 'goutte').voieRapide, true);
});
