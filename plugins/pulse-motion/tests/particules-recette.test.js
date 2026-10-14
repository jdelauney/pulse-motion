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
  // S = 51 / 50 = 1,02 ; gigue du parent J = 0,5 ; G = ceil((1,2 + 0,5) / 1,02) = 2
  assert.equal(r.effet.emetteurs[1].G, 2);
  assert.equal(r.effet.emetteurs[1].capacite, 51 * 2 * 3);
});

// Simulation pas à pas : aucune case d'enfant n'est réécrite avant la mort de son occupant.
function casesEnfantSures(parentVie, enfantVie, graine) {
  const recette = avecEmetteurs([
    { nom: 'p', naissance: { debit: 50, vie: parentVie }, a_la_mort: { emetteur: 'e' } },
    { nom: 'e', naissance: { nombre: 2, vie: enfantVie } },
  ]);
  const { effet, ok, erreurs } = R.compiler(recette, { dur: 6, graine: 1 });
  assert.equal(ok, true, JSON.stringify(erreurs));
  const [p, e] = effet.emetteurs;
  assert.ok(p.nTotal > p.capContinu, 'les cases du parent sont réutilisées');
  let etat = graine;
  const alea = () => { etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0; return etat / 4294967296; };
  const naissances = new Map(); // case d'enfant -> instants de naissance
  for (let n = 0; n < p.nTotal; n++) {
    const choix = alea();
    const vie = choix < 0.3 ? parentVie[0] : choix < 0.6 ? parentVie[1] : parentVie[0] + alea() * (parentVie[1] - parentVie[0]);
    const mort = n / p.debit + vie;
    const s = n % p.capContinu;
    const gen = Math.floor(n / p.capContinu);
    for (let j = 0; j < e.k; j++) {
      const c = (s * e.G + (gen % e.G)) * e.k + j;
      if (!naissances.has(c)) naissances.set(c, []);
      naissances.get(c).push(mort);
    }
  }
  for (const c of naissances.keys()) assert.ok(c < e.capacite, 'toutes les cases tiennent dans la capacité');
  for (const liste of naissances.values()) {
    liste.sort((a, b) => a - b);
    for (let i = 1; i < liste.length; i++) {
      if (liste[i] < liste[i - 1] + enfantVie[1] - 1e-9) return false;
    }
  }
  return true;
}

test('compiler : sûreté des générations d\'enfant par simulation', () => {
  for (const parentVie of [[0.5, 1], [1, 3]]) {
    for (const enfantVie of [[0.2, 0.4], [0.2, 1.2], [1, 3]]) {
      for (const graine of [1, 2, 3]) {
        assert.ok(casesEnfantSures(parentVie, enfantVie, graine), `parent ${parentVie} enfant ${enfantVie} graine ${graine}`);
      }
    }
  }
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
  assert.deepEqual(effet.rendu_calque, { bloom: 0.6, seuil_bloom: 1, tons: 'douce' });
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

test('compiler : réglages nommés comme des membres d\'Object.prototype refusés', () => {
  for (const nom of ['constructor', '__proto__']) {
    const r = compilerFixture('gerbe', { reglages: `${nom}: 3` });
    assert.equal(r.ok, false, nom);
    assert.equal(r.erreurs[0].regle, 'reglage-invalide', nom);
    assert.match(r.erreurs[0].message, new RegExp(`« ${nom} » n'est pas un réglage`));
  }
});

test('resoudre : la clé __proto__ d\'une recette n\'empoisonne pas la fusion', () => {
  const charger = depuisObjet({
    base: { version: 1, emetteurs: [] },
    fille: JSON.parse('{"etend":"base","__proto__":{"pollue":1},"autre":{"__proto__":{"pollue":2}}}'),
  });
  const r = R.resoudre('fille', charger);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.equal(({}).pollue, undefined);
  assert.equal(r.pollue, undefined);
});

test('compiler : plafond de capacité et d\'historique de traînée', () => {
  assert.equal(R.CAPACITE_MAX, 2000000);
  const enorme = erreurDe(avecEmetteurs([{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 1e12 }] } }]));
  assert.equal(enorme.regle, 'effet-invalide');
  assert.match(enorme.message, /Effet « essai », emetteurs\[a\] : capacité de 1000000000000 particules, au-delà du maximum 2000000 ; baisser nombre, debit ou la durée de vie\./);
  const limite = R.compiler(avecEmetteurs([{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 2000000 }] } }]), { dur: 1, graine: 1 });
  assert.equal(limite.ok, true, JSON.stringify(limite.erreurs));
  const enfants = erreurDe(avecEmetteurs([
    { nom: 'p', naissance: { salves: [{ t: 0, nombre: 1000000 }] }, a_la_mort: { emetteur: 'e' } },
    { nom: 'e', naissance: { nombre: 3 } },
  ]));
  assert.match(enfants.message, /emetteurs\[e\] : capacité de 3000000 particules/);
  const trainee = (longueur, nombre) => avecEmetteurs([{ nom: 'a', naissance: { salves: [{ t: 0, nombre }] }, rendu: { type: 'trainee', longueur } }]);
  const longue = erreurDe(trainee(16, 1048577));
  assert.match(longue.message, /Effet « essai », emetteurs\[a\]\.rendu : traînée trop longue pour 1048577 particules \(capacité × longueur au plus 16777216\)\./);
  assert.equal(R.compiler(trainee(16, 1048576), { dur: 1, graine: 1 }).ok, true);
});

test('compiler : dimensions, direction de gravité et durée de vie refusées', () => {
  const forme = (f) => avecEmetteurs([{ nom: 'a', naissance: { debit: 10, forme: f } }]);
  for (const champ of ['rayon', 'rayon_interieur', 'largeur', 'hauteur']) {
    const e = erreurDe(forme({ type: 'rectangle', [champ]: -1 }));
    assert.equal(e.regle, 'effet-invalide');
    assert.match(e.message, new RegExp(`emetteurs\\[a\\]\\.naissance\\.forme\\.${champ} : valeur positive ou nulle attendue`), champ);
  }
  assert.match(erreurDe(forme({ type: 'anneau', rayon: 10, rayon_interieur: 20 })).message,
    /emetteurs\[a\]\.naissance\.forme\.rayon_interieur : le rayon intérieur 20 dépasse le rayon 10/);
  assert.equal(R.compiler(forme({ type: 'anneau', rayon: 10, rayon_interieur: 10 }), { dur: 1, graine: 1 }).ok, true);
  assert.equal(R.compiler(forme({ type: 'rectangle' }), { dur: 1, graine: 1 }).effet.emetteurs[0].forme.largeur, -1, 'champ absent : -1 interne');
  assert.match(erreurDe(avecEmetteurs([{ nom: 'a', naissance: { debit: 10 }, forces: [{ type: 'gravite', direction: [0, 0] }] }])).message,
    /emetteurs\[a\]\.forces\[0\]\.direction : direction nulle/);
  const mort = (vie) => avecEmetteurs([
    { nom: 'a', naissance: { debit: 10, vie }, a_la_mort: { emetteur: 'b' } },
    { nom: 'b', naissance: { nombre: 2 } },
  ]);
  assert.match(erreurDe(mort([0.005, 1])).message, /emetteurs\[a\]\.naissance\.vie : durée de vie minimale 0\.005 sous 1\/120 s/);
  assert.equal(R.compiler(mort([1 / 120, 1]), { dur: 1, graine: 1 }).ok, true);
  assert.equal(R.compiler(avecEmetteurs([{ nom: 'a', naissance: { debit: 10, vie: [0.001, 1] } }]), { dur: 1, graine: 1 }).ok, true, 'sans a_la_mort, pas de limite');
});

test('compiler : contrat de la forme compilée (formes, forces, vitesse, planche)', () => {
  const sortie = (nom, naissance, extra = {}) => ({ nom, naissance: { salves: [{ t: 0, nombre: 1 }], ...naissance }, ...extra });
  const recette = avecEmetteurs([
    sortie('pt', { forme: { type: 'point', angle: 90, decalage: [0.25, -0.5] } }),
    sortie('ce', { forme: { type: 'cercle', rayon: 30, zone: 'contour' } }),
    sortie('an', { forme: { type: 'anneau', rayon: 50, rayon_interieur: 20 } }),
    sortie('re', { forme: { type: 'rectangle', largeur: 40, hauteur: 10, angle: 180 } }),
    sortie('li', { forme: { type: 'ligne', largeur: 100, angle: 45 } }),
    sortie('fo', {
      vie: [1, 2], taille: [0.5, 2], masse: [2, 3], z: [-1, 1], rotation: [90, 180], vitesse_angulaire: [-90, 45],
      vitesse: { direction: [3, 4], cone: 90, valeur: [1, 2], radiale: true, heritage: 0.5 },
    }, {
      forces: [
        { type: 'gravite', valeur: 10, direction: [3, 4] },
        { type: 'trainee', coef: 0.5, quadratique: true },
        { type: 'vent', vitesse: [4, -2], coef: 2 },
        { type: 'turbulence', echelle: 5, force: 7, vitesse: 0.25 },
        { type: 'attracteur', force: 3, rayon: 4, centre: [0.1, 0.9] },
        { type: 'vortex', force: 5, rayon: 6, centre: [0.2, 0.3] },
        { type: 'rappel', raideur: 8, amortissement: 2, centre: [0.4, 0.6] },
      ],
      rendu: { type: 'planche', texture: 'assets/f.png', melange: 'alpha', planche: { colonnes: 4, lignes: 2, ips: 12 } },
    }),
  ]);
  const r = R.compiler(recette, { dur: 1, graine: 5 });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const [pt, ce, an, re, li, fo] = r.effet.emetteurs;
  assert.deepEqual(pt.forme, { type: 'point', code: 0, contour: false, rayon: -1, rayonInterieur: 0, largeur: -1, hauteur: -1, angle: Math.PI / 2, decalage: [0.25, -0.5] });
  assert.deepEqual(ce.forme, { type: 'cercle', code: 1, contour: true, rayon: 30, rayonInterieur: 0, largeur: -1, hauteur: -1, angle: 0, decalage: [0, 0] });
  assert.deepEqual(an.forme, { type: 'anneau', code: 2, contour: false, rayon: 50, rayonInterieur: 20, largeur: -1, hauteur: -1, angle: 0, decalage: [0, 0] });
  assert.deepEqual(re.forme, { type: 'rectangle', code: 3, contour: false, rayon: -1, rayonInterieur: 0, largeur: 40, hauteur: 10, angle: Math.PI, decalage: [0, 0] });
  assert.deepEqual(li.forme, { type: 'ligne', code: 4, contour: false, rayon: -1, rayonInterieur: 0, largeur: 100, hauteur: -1, angle: Math.PI / 4, decalage: [0, 0] });
  assert.deepEqual(fo.forme, { type: 'ancre', code: 5, contour: false, rayon: -1, rayonInterieur: 0, largeur: -1, hauteur: -1, angle: 0, decalage: [0, 0] });
  assert.deepEqual([fo.nom, fo.index, fo.parent, fo.profondeur, fo.aLaMort, fo.k, fo.G, fo.debit, fo.nTotal, fo.capContinu], ['fo', 5, -1, 0, -1, 0, 1, 0, 0, 0]);
  assert.deepEqual(fo.salves, [{ t: 0, nombre: 1, debut: 0 }]);
  assert.deepEqual([fo.vie, fo.taille, fo.masse, fo.z], [[1, 2], [0.5, 2], [2, 3], [-1, 1]]);
  assert.deepEqual(fo.rotation, [Math.PI / 2, Math.PI]);
  assert.deepEqual(fo.vitesseAngulaire, [-Math.PI / 2, Math.PI / 4]);
  assert.deepEqual(fo.vitesse, { direction: [0.6, 0.8], cone: Math.PI / 2, valeur: [1, 2], radiale: true, heritage: 0.5 });
  assert.deepEqual(fo.forces, [
    { type: 'gravite', code: 0, a: [6, 8] },
    { type: 'trainee', code: 1, coef: 0.5, quadratique: true },
    { type: 'vent', code: 2, vitesse: [4, -2], coef: 2 },
    { type: 'turbulence', code: 3, echelle: 5, force: 7, vitesse: 0.25 },
    { type: 'attracteur', code: 4, force: 3, rayon: 4, centre: [0.1, 0.9] },
    { type: 'vortex', code: 5, force: 5, rayon: 6, centre: [0.2, 0.3] },
    { type: 'rappel', code: 6, raideur: 8, amortissement: 2, centre: [0.4, 0.6] },
  ]);
  assert.deepEqual(fo.rendu, {
    type: 'planche', code: 3, texture: 'image', textureCode: 6, textureFichier: 'assets/f.png', melange: 'alpha', melangeCode: 1,
    etirement: 0.03, flou: false, longueur: 8, planche: { colonnes: 4, lignes: 2, ips: 12 },
  });
  assert.equal(fo.voieRapide, false);
  assert.equal(pt.rendu.planche, null);
  assert.equal(pt.rendu.textureFichier, null);
  assert.deepEqual([r.effet.version, r.effet.nom, r.effet.graine, r.effet.capacite], [1, 'essai', 5, 6]);
});

test('compiler : courbe de tons du calque', () => {
  assert.equal(compilerFixture('gerbe').effet.rendu_calque.tons, 'douce');
  const recette = R.resoudre('gerbe', depuisDossier);
  recette.rendu_calque = { bloom: 1.2, tons: 'aces' };
  assert.deepEqual(R.compiler(recette, { dur: 2, graine: 1 }).effet.rendu_calque, { bloom: 1.2, seuil_bloom: 1, tons: 'aces' });
  recette.rendu_calque = { tons: 'cinema' };
  assert.match(R.compiler(recette, { dur: 2, graine: 1 }).erreurs[0].message, /rendu_calque\.tons : « cinema » inconnu \(douce, aces, neutre\)/);
});
