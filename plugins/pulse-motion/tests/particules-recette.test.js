'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');

const EFFETS = path.join(__dirname, 'fixtures', 'effets');
const depuisDossier = (nom) => {
  const f = path.join(EFFETS, `${nom}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const depuisObjet = (o) => (nom) => o[nom] || null;
const proche = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

test('resoudre : héritage, fusion profonde, émetteurs fusionnés par nom', () => {
  const r = R.resoudre('fille', depuisDossier);
  assert.equal(r.nom, 'fille');
  assert.equal(r.etend, null);
  assert.deepEqual(r.parametres.nombre, { defaut: 200, min: 10, max: 1000 });
  assert.equal(r.emetteurs.length, 2);
  assert.deepEqual(r.emetteurs[0].forces, [{ type: 'gravite', valeur: 10 }], 'les tableaux sont remplacés');
  assert.equal(r.emetteurs[0].naissance.debit, 'nombre / dur', 'le reste de l\'émetteur est hérité');
  assert.equal(r.emetteurs[1].nom, 'eclat');
});

test('resoudre : inconnu, etend introuvable, héritage circulaire', () => {
  assert.throws(() => R.resoudre('absent', depuisObjet({})), (e) => e.regle === 'effet-inconnu' && /Effet « absent » introuvable/.test(e.message));
  assert.throws(() => R.resoudre('a', depuisObjet({ a: { version: 1, etend: 'z' } })), (e) => e.regle === 'effet-invalide' && /« etend » vise « z », introuvable/.test(e.message));
  assert.throws(() => R.resoudre('a', depuisObjet({ a: { etend: 'b' }, b: { etend: 'a' } })), (e) => e.regle === 'effet-invalide' && /héritage circulaire \(a → b → a\)/.test(e.message));
});

test('analyserReglages : espaces et point-virgule final tolérés', () => {
  assert.deepEqual(R.analyserReglages('nombre:300 ; couleur: accent;'), { valeurs: { nombre: '300', couleur: 'accent' }, erreurs: [] });
  assert.deepEqual(R.analyserReglages(''), { valeurs: {}, erreurs: [] });
  assert.deepEqual(R.analyserReglages('nombre 300').erreurs, ['réglage « nombre 300 » illisible (attendu « nom: valeur »)']);
});

test('couleurLineaire : hex courts et longs, charte, paramètre', () => {
  assert.deepEqual(R.couleurLineaire('#fff', {}), [1, 1, 1, 1]);
  const c = R.couleurLineaire('#ff880080', {});
  assert.ok(proche(c[0], 1) && proche(c[1], 0.2462) && c[2] === 0 && proche(c[3], 128 / 255), String(c));
  assert.deepEqual(R.couleurLineaire('accent', { charte: { accent: '#0000ff' } }), [0, 0, 1, 1]);
  assert.deepEqual(R.couleurLineaire('teinte', { couleurs: { teinte: 'accent' }, charte: { accent: '#000' } }), [0, 0, 0, 1]);
  assert.throws(() => R.couleurLineaire('rouge', {}), /couleur « rouge » inconnue/);
});

const compilerFixture = (nom, options = {}) => R.compiler(R.resoudre(nom, depuisDossier), { dur: 2, graine: 7, charte: { accent: '#0000ff' }, ...options });
const avecEmetteurs = (emetteurs, parametres = {}) => ({ version: 1, nom: 'essai', parametres, emetteurs });
const erreurDe = (recette, options = {}) => {
  const r = R.compiler(recette, { dur: 2, graine: 1, ...options });
  assert.equal(r.ok, false, 'compilation qui devait échouer');
  return r.erreurs[0];
};

test('compiler : capacités, cases, sous-émetteur, fin', () => {
  const r = compilerFixture('gerbe');
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const [gerbe, eclat] = r.effet.emetteurs;
  assert.equal(r.effet.graine, 7);
  assert.equal(r.effet.duree, 2);
  assert.equal(gerbe.debit, 50);
  assert.equal(gerbe.nTotal, 100);
  assert.equal(gerbe.capContinu, 51, 'débit × vie max + 1');
  assert.equal(gerbe.capacite, 51);
  assert.equal(gerbe.aLaMort, 1);
  assert.equal(eclat.parent, 0);
  assert.equal(eclat.profondeur, 1);
  assert.equal(eclat.k, 3);
  assert.equal(eclat.G, 1);
  assert.equal(eclat.capacite, 153);
  assert.equal(r.effet.capacite, 204);
  assert.ok(proche(gerbe.fin, 2.98) && proche(eclat.fin, 3.38) && proche(r.effet.fin, 3.38), `${gerbe.fin} ${eclat.fin}`);
  assert.equal(gerbe.periode, undefined, 'valeurs internes retirées');
});

test('compiler : générations d\'un enfant qui vit plus longtemps que la période du parent', () => {
  const recette = R.resoudre('gerbe', depuisDossier);
  recette.emetteurs[1].naissance.vie = [0.2, 1.2];
  const r = R.compiler(recette, { dur: 2, graine: 1 });
  assert.equal(r.effet.emetteurs[1].G, 3);
  assert.equal(r.effet.emetteurs[1].capacite, 51 * 3 * 3);
});

test('compiler : unités, directions, forces, tables', () => {
  const { effet } = compilerFixture('gerbe');
  const [gerbe, eclat] = effet.emetteurs;
  assert.deepEqual(gerbe.vitesse.valeur, [20, 40]);
  assert.ok(proche(gerbe.vitesse.cone, Math.PI / 3));
  assert.deepEqual(gerbe.vitesse.direction, [0, -1]);
  assert.equal(gerbe.forme.type, 'ancre');
  assert.equal(gerbe.forme.code, 5);
  assert.equal(gerbe.forme.contour, true);
  assert.equal(gerbe.forme.largeur, -1, 'taille de la zone');
  assert.deepEqual(gerbe.forces[0], { type: 'gravite', code: 0, a: [0, 40] });
  assert.deepEqual(gerbe.forces[1], { type: 'trainee', code: 1, coef: 1, quadratique: false });
  assert.equal(gerbe.tables.couleur.length, 256);
  assert.deepEqual(gerbe.tables.couleur.slice(0, 4), [1, 1, 1, 1]);
  const fin = gerbe.tables.couleur.slice(252);
  assert.ok(proche(fin[0], 1) && proche(fin[1], 0.2462) && fin[2] === 0 && fin[3] === 1, String(fin));
  assert.equal(gerbe.tables.taille.length, 64);
  assert.equal(gerbe.tables.taille[0], 1);
  assert.equal(gerbe.tables.taille[63], 0);
  assert.ok(proche(gerbe.tables.taille[32], 0.868954), String(gerbe.tables.taille[32]));
  assert.deepEqual(gerbe.tables.intensite, new Array(64).fill(1));
  assert.equal(gerbe.rendu.type, 'etincelle');
  assert.equal(gerbe.rendu.code, 1);
  assert.equal(gerbe.rendu.texture, 'disque-doux');
  assert.equal(gerbe.rendu.melangeCode, 0);
  assert.equal(eclat.rendu.type, 'sprite');
  assert.deepEqual(effet.rendu_calque, { bloom: 0.6, seuil_bloom: 1 });
});

test('compiler : réglages et couleur de la charte', () => {
  const r = compilerFixture('gerbe', { reglages: 'nombre: 300; vitesse: 2; couleur: accent' });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.equal(r.effet.emetteurs[0].debit, 150);
  assert.deepEqual(r.effet.emetteurs[0].vitesse.valeur, [40, 80]);
  assert.deepEqual(r.effet.emetteurs[0].tables.couleur.slice(252), [0, 0, 1, 1]);
});

test('compiler : réglages invalides, tous listés', () => {
  const r = compilerFixture('gerbe', { reglages: 'nombre: 99999; vitesse: vite; taille: 3; couleur: rouge' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erreurs.map((e) => e.regle), ['reglage-invalide', 'reglage-invalide', 'reglage-invalide', 'reglage-invalide']);
  const textes = r.erreurs.map((e) => e.message).join('\n');
  assert.match(textes, /Effet « gerbe » : réglage « nombre » : 99999 est au-delà du maximum 1000\./);
  assert.match(textes, /réglage « vitesse » : « vite » n'est pas un nombre\./);
  assert.match(textes, /« taille » n'est pas un réglage de l'effet « gerbe » \(réglages : nombre, vitesse, couleur\)\./);
  assert.match(textes, /réglage « couleur » : couleur « rouge » inconnue/);
});

test('compiler : voie rapide seulement pour gravité et traînée linéaire, sans parent ni enfant', () => {
  assert.equal(compilerFixture('simple').effet.emetteurs[0].voieRapide, true);
  const { effet } = compilerFixture('gerbe');
  assert.equal(effet.emetteurs[0].voieRapide, false, 'a un sous-émetteur');
  assert.equal(effet.emetteurs[1].voieRapide, false, 'est un sous-émetteur');
  const turbulente = R.resoudre('simple', depuisDossier);
  turbulente.emetteurs[0].forces.push({ type: 'turbulence' });
  assert.equal(R.compiler(turbulente, { dur: 1, graine: 1 }).effet.emetteurs[0].voieRapide, false);
});

test('compiler : salve, capacité et fin', () => {
  const { effet } = compilerFixture('simple', { reglages: 'nombre: 7' });
  const [salve] = effet.emetteurs;
  assert.deepEqual(salve.salves, [{ t: 0, nombre: 7, debut: 0 }]);
  assert.equal(salve.capContinu, 0);
  assert.equal(salve.capacite, 7);
  assert.equal(effet.fin, 2);
  assert.equal(salve.rendu.melange, 'alpha');
});

test('compiler : erreurs de structure avec le chemin du champ', () => {
  const base = () => ({ nom: 'a', naissance: { debit: 10, vie: [1, 2] } });
  assert.match(erreurDe(avecEmetteurs([])).message, /Effet « essai » : « emetteurs » doit être une liste non vide\./);
  assert.match(erreurDe({ version: 2, nom: 'essai', emetteurs: [base()] }).message, /« version » doit valoir 1/);
  assert.match(erreurDe(avecEmetteurs([{ ...base(), vie: { taille: { courbe: 'molle' } } }])).message,
    /Effet « essai », emetteurs\[a\]\.vie\.taille\.courbe : Nom de courbe inconnu : « molle »/);
  assert.match(erreurDe(avecEmetteurs([{ ...base(), a_la_mort: { emetteur: 'z' } }])).message, /emetteurs\[a\]\.a_la_mort\.emetteur : émetteur « z » inconnu/);
  assert.match(erreurDe(avecEmetteurs([{ nom: 'a', naissance: { vie: [1, 2] } }])).message, /emetteurs\[a\]\.naissance : indiquer « debit »/);
  assert.match(erreurDe(avecEmetteurs([{ nom: 'a', naissance: { debit: 10, vie: [2, 1] } }])).message, /emetteurs\[a\]\.naissance\.vie : le minimum 2 dépasse le maximum 1/);
  assert.match(erreurDe(avecEmetteurs([{ nom: 'a', naissance: { debit: 'nombre / vitesse2' } }], { nombre: { defaut: 5 } })).message,
    /emetteurs\[a\]\.naissance\.debit : « vitesse2 » inconnu/);
  assert.match(erreurDe(avecEmetteurs([{ ...base(), forces: [{ type: 'magnetisme' }] }])).message, /forces\[0\]\.type : « magnetisme » inconnu \(gravite, trainee/);
  assert.match(erreurDe(avecEmetteurs([{ ...base(), rendu: { texture: 'assets/x.gif' } }])).message, /rendu\.texture : image PNG, WebP, JPEG ou SVG attendue/);
});

test('compiler : sous-émetteurs mal formés', () => {
  const racine = (nom, enfant) => ({ nom, naissance: { debit: 10 }, a_la_mort: { emetteur: enfant } });
  const enfant = (nom, suite) => ({ nom, naissance: { nombre: 2 }, ...(suite ? { a_la_mort: { emetteur: suite } } : {}) });
  assert.match(erreurDe(avecEmetteurs([racine('a', 'c'), racine('b', 'c'), enfant('c')])).message, /« c » est déjà lancé par « a »/);
  assert.match(erreurDe(avecEmetteurs([racine('a', 'b'), enfant('b', 'c'), enfant('c', 'd'), enfant('d')])).message, /emetteurs\[d\] : trop de niveaux de sous-émetteurs \(2 au plus\)/);
  assert.match(erreurDe(avecEmetteurs([racine('a', 'b'), { nom: 'b', naissance: { debit: 3 } }])).message, /emetteurs\[b\]\.naissance : un sous-émetteur naît de la mort de « a » : utiliser « nombre »/);
  assert.match(erreurDe(avecEmetteurs([{ nom: 'a', naissance: { nombre: 3 } }])).message, /« nombre » est réservé aux sous-émetteurs/);
  assert.match(erreurDe(avecEmetteurs([enfant('a', 'b'), enfant('b', 'a')])).message, /sous-émetteurs en boucle/);
  const deuxNiveaux = R.compiler(avecEmetteurs([racine('a', 'b'), enfant('b', 'c'), enfant('c')]), { dur: 1, graine: 1 });
  assert.equal(deuxNiveaux.ok, true, JSON.stringify(deuxNiveaux.erreurs));
  assert.deepEqual(deuxNiveaux.effet.emetteurs.map((e) => e.profondeur), [0, 1, 2]);
});

test('compiler : salves après l\'émission continue, enfant d\'une salve', () => {
  const r = R.compiler(avecEmetteurs([{ nom: 'a', naissance: { debit: 10, vie: [1, 1], salves: [{ t: 0, nombre: 5 }, { t: 1, nombre: 3 }] } }]), { dur: 2, graine: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const [a] = r.effet.emetteurs;
  assert.equal(a.capContinu, 11);
  assert.deepEqual(a.salves.map((s) => s.debut), [11, 16]);
  assert.equal(a.capacite, 19);

  const parent = { nom: 'a', naissance: { salves: [{ t: 0, nombre: 4 }] }, a_la_mort: { emetteur: 'b' } };
  const enfantSalve = { nom: 'b', naissance: { nombre: 2 } };
  const s = R.compiler(avecEmetteurs([parent, enfantSalve]), { dur: 2, graine: 1 });
  assert.equal(s.ok, true, JSON.stringify(s.erreurs));
  assert.equal(s.effet.emetteurs[0].capacite, 4);
  assert.equal(s.effet.emetteurs[1].G, 1);
  assert.equal(s.effet.emetteurs[1].capacite, 4 * 2);
});

test('compiler : noms d\'émetteurs protégés des propriétés de Object.prototype', () => {
  assert.match(erreurDe(avecEmetteurs([{ nom: 'a', naissance: { debit: 10 }, a_la_mort: { emetteur: 'constructor' } }])).message, /émetteur « constructor » inconnu/);
  assert.match(erreurDe(avecEmetteurs([{ nom: 'constructor', naissance: { debit: 10 } }, { nom: 'constructor', naissance: { debit: 10 } }])).message, /nom en double/);
});
