'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');
const { SEUILS } = require('../scripts/controler.js');

const DOSSIER = path.join(__dirname, '..', 'effets');
const NOMS = ['assembler', 'banc', 'banniere', 'braises', 'briser', 'confettis', 'corde', 'desintegrer', 'drapeau', 'eau', 'energie', 'etincelles', 'explosion', 'feu',
  'feu-artifice', 'filet', 'fumee', 'guirlande', 'lucioles', 'metamorphose', 'miel', 'neige', 'neige-lourde', 'nuee', 'paillettes', 'pluie', 'poussiere', 'rideau', 'sable'];
const CHARTE = { primaire: '#0a6cff', accent: '#b45309', fond: '#ffffff', texte: '#1a1a1a' };
const charger = (nom) => {
  const f = path.join(DOSSIER, `${nom}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const compiler = (nom, reglages = '', dur = 3) => R.compiler(R.resoudre(nom, charger), { reglages, charte: CHARTE, dur, graine: 1 });

test('bibliothèque : les 29 effets des specs (P1, P4, P5a, P5b), nommés comme leur fichier, décrits', () => {
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(fichiers, NOMS);
  for (const nom of NOMS) {
    const brute = charger(nom);
    assert.equal(brute.version, 1, nom);
    assert.equal(brute.nom, nom, `${nom} : « nom » = nom du fichier`);
    assert.ok(typeof brute.description === 'string' && brute.description.length > 30, `${nom} : description`);
  }
  assert.equal(charger('braises').etend, 'etincelles', 'braises dérive des étincelles');
  assert.equal(charger('miel').etend, 'eau', 'miel dérive de l\'eau');
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
  assert.deepEqual([...types].sort(), ['eclats', 'etincelle', 'fluide', 'sprite', 'trainee'], 'la planche demande une image : pas dans la bibliothèque');
  assert.deepEqual([...textures].sort(), ['confetti', 'disque-doux', 'etoile', 'flamme', 'fumee', 'image', 'pixel'], 'image : photographie des éclats');
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

test('référence : section Collisions (déclarations, réponses, empilement, vidéo, limites, contrôles)', () => {
  const texte = fs.readFileSync(path.join(__dirname, '..', 'references', 'particules.md'), 'utf8');
  const debut = texte.indexOf('## Collisions avec la scène');
  assert.ok(debut > 0, 'section présente');
  const fin = texte.indexOf('\n## ', debut + 5);
  const section = texte.slice(debut, fin > 0 ? fin : undefined);
  for (const mot of ['data-obstacle', 'data-obstacle="forme"', 'data-obstacle="video"', 'data-obstacle-forme', '"obstacles"',
    'a_la_collision', 'rebond', 'poser', 'mourir', 'obstacle-introuvable', 'collisions-invalides', 'obstacles-video', 'trop-d-obstacles',
    '16 obstacles', '8 obstacles', '"sol": 90', 'confettis', 'pluie', 'neige', 'etincelles']) {
    assert.ok(section.includes(mot), `la section parle de « ${mot} »`);
  }
  for (const champ of Object.keys(R.SCHEMA.champs.emetteurs.element.champs.collisions.champs)) {
    assert.ok(section.includes('`' + champ + '`'), `champ « ${champ} » documenté`);
  }
  assert.match(texte.split('## Collisions avec la scène')[0], /data-obstacle/, 'l\'essentiel mentionne les obstacles');
});

test('bibliothèque : fragmentation (briser, désintégrer, assembler, métamorphose)', () => {
  const em = (nom, reglages = '') => compiler(nom, reglages).effet.emetteurs[0];
  for (const nom of ['briser', 'desintegrer', 'assembler', 'metamorphose']) {
    const e = compiler(nom).effet;
    assert.deepEqual(e.rendu_calque, { bloom: 0, seuil_bloom: 1, tons: 'neutre' }, `${nom} : couleurs exactes`);
    assert.ok(e.emetteurs.every((x) => x.fragment), `${nom} : émetteur de fragments`);
  }
  const b = em('briser');
  assert.deepEqual([b.eclats.morceaux, b.eclats.impulsion, b.collisions.reponse, b.collisions.sol, b.voieRapide], [40, 60, 'rebond', null, true]);
  assert.deepEqual([b.tables.opacite[0], b.tables.taille[0]], [1, 1], 'éclats intacts au début');
  const d = em('desintegrer');
  assert.deepEqual([d.pixels.densite, d.pixels.liberation, d.pixels.ordre], [4, 3, 'gauche-droite'], 'libération sur data-dur');
  assert.deepEqual([d.tables.source[0], d.tables.opacite[0], d.tables.taille[0], d.tables.intensite[0]], [1, 1, 1, 1], 'grain de la couleur de son pixel au départ');
  assert.deepEqual(d.tables.couleur.slice(0, 4), [1, 1, 1, 1]);
  const a = em('assembler');
  assert.deepEqual([a.cible.source, a.cible.arrivee, a.cible.a, a.cible.densite, a.pixels], ['ancre', 'guidee', 3, 4, null]);
  assert.deepEqual([a.tables.opacite[63], a.tables.source[63]], [1, 1], 'opaque et de la couleur de son pixel à l\'arrivée');
  assert.equal(em('assembler', 'arrivee: 0.5').cible.a, 1.5);
  const m = em('metamorphose');
  assert.deepEqual([m.cible.source, m.cible.arrivee, m.voieRapide, m.pixels.densite, m.cible.ordre], ['cible', 'choree', true, 4, 'centre']);
  assert.ok(m.cible.bruit[1] > 0, 'tourbillon en chemin');
  assert.deepEqual([m.tables.opacite[0], m.tables.opacite[63], m.tables.source[0]], [1, 1, 1]);
});

test('référence : section Fragmentation (déclarations, champs du schéma, contrôles)', () => {
  const texte = fs.readFileSync(path.join(__dirname, '..', 'references', 'particules.md'), 'utf8');
  const debut = texte.indexOf('## Fragmentation');
  const fin = texte.indexOf('## Régler à l\'œil');
  assert.ok(debut > 0 && fin > debut, 'section Fragmentation avant l\'atelier');
  const section = texte.slice(debut, fin);
  const em = R.SCHEMA.champs.emetteurs.element.champs;
  const champs = [...Object.keys(em.cible.champs), 'densite', 'instant', 'liberation', 'ordre', 'morceaux', 'origine', 'impulsion', 'rotation_max'];
  for (const mot of [...champs, 'data-cible', '"pixels"', '"source"', '"eclats"', '"neutre"', 'guidee', 'choree', 'ancre-vide', 'cible-introuvable', 'metamorphose-sans-cible', 'photographie-trop-grande']) {
    assert.ok(section.includes(mot), `la section parle de « ${mot} »`);
  }
  for (const nom of ['briser', 'desintegrer', 'assembler', 'metamorphose']) assert.ok(section.includes('`' + nom + '`'), nom);
  assert.ok(texte.includes('| `data-cible` |'), 'data-cible dans la table des attributs');
});

test('bibliothèque : interactions (nuee, banc, lucioles, eau, miel, sable, neige-lourde)', () => {
  const TYPES = { nuee: 'essaim', banc: 'essaim', lucioles: 'essaim', eau: 'fluide', miel: 'fluide', sable: 'grains', 'neige-lourde': 'grains' };
  for (const [nom, type] of Object.entries(TYPES)) {
    const e = compiler(nom).effet;
    assert.ok(e.emetteurs.every((em) => em.interactions && em.interactions.type === type && !em.voieRapide), `${nom} : ${type}`);
    // Aux bornes hautes des réglages, chaque émetteur reste sous la limite de son type (pas d'alerte budget-interactions).
    const params = R.resoudre(nom, charger).parametres;
    const reglages = Object.entries(params).map(([cle, p]) => (p.type === 'couleur' ? `${cle}: accent` : `${cle}: ${p.max}`)).join('; ');
    const haut = compiler(nom, reglages);
    assert.equal(haut.ok, true, `${nom} : ${JSON.stringify(haut.erreurs)}`);
    for (const em of haut.effet.emetteurs) assert.ok(em.capacite <= R.LIMITES_INTERACTIONS[type], `${nom} : ${em.capacite} particules au maximum`);
  }
  assert.deepEqual(compiler('banc').effet.groupes.map((g) => g.membres), [[0, 1]], 'deux teintes de poissons dans un même banc');
  for (const nom of ['nuee', 'banc', 'lucioles']) assert.ok(compiler(nom).effet.emetteurs.every((em) => em.interactions.cible), `${nom} : autour de l'ancre`);
  const eau = compiler('eau').effet.emetteurs[0];
  const miel = compiler('miel').effet.emetteurs[0];
  for (const em of [eau, miel]) {
    assert.equal(em.rendu.type, 'fluide');
    assert.ok(em.fluide, 'nappe');
    assert.equal(em.collisions.reponse, 'rebond');
  }
  assert.equal(eau.fluide.refraction, 0.3);
  assert.ok(miel.interactions.viscosite > eau.interactions.viscosite && miel.interactions.tension > eau.interactions.tension, 'miel plus visqueux');
  assert.ok(miel.fluide.absorption > eau.fluide.absorption, 'miel plus dense à l\'œil');
  for (const nom of ['sable', 'neige-lourde']) {
    const em = compiler(nom).effet.emetteurs[0];
    assert.equal(em.collisions.reponse, 'rebond', `${nom} : le tas se forme par les grains, sans « empiler »`);
    assert.ok(em.taille[1] <= em.interactions.rayon, `${nom} : grain dans sa cellule`);
  }
  assert.ok(compiler('neige-lourde').effet.emetteurs[0].interactions.cohesion > 0, 'neige collante');
});

test('référence : section Interactions (types, champs du schéma, rendu fluide, limites, contrôles, bibliothèque)', () => {
  const texte = fs.readFileSync(path.join(__dirname, '..', 'references', 'particules.md'), 'utf8');
  const debut = texte.indexOf('## Interactions');
  const fin = texte.indexOf('## Régler à l\'œil');
  assert.ok(debut > texte.indexOf('## Fragmentation') && fin > debut, 'section Interactions après la fragmentation, avant l\'atelier');
  const section = texte.slice(debut, fin);
  const n = R.SCHEMA.champs.emetteurs.element.champs.interactions;
  const champs = [...Object.keys(n.champs), ...Object.values(n.variantes.types).flatMap((v) => Object.keys(v.champs)), 'teinte', 'opacite', 'absorption', 'refraction', 'lissage'];
  for (const c of champs) assert.ok(section.includes('`' + c + '`'), `champ « ${c} » documenté`);
  for (const mot of ['"type": "fluide"', '`essaim`', '`grains`', 'interactions-invalides', 'budget-interactions', '100 000', '60 000', 'data-obstacle', '`poser`', '`empiler`']) {
    assert.ok(section.includes(mot), `la section parle de « ${mot} »`);
  }
  for (const nom of ['nuee', 'banc', 'lucioles', 'eau', 'miel', 'sable', 'neige-lourde']) assert.ok(section.includes('`' + nom + '`'), nom);
  assert.match(texte.split('## Interactions')[0], /voir « Interactions »/, 'la bibliothèque y renvoie');
  const controles = fs.readFileSync(path.join(__dirname, '..', 'references', 'controles.md'), 'utf8');
  for (const r of ['interactions-invalides', 'budget-interactions']) assert.match(controles, new RegExp('`' + r + '`'), r);
});

test('bibliothèque : cordes et tissus (drapeau, banniere, rideau, guirlande, filet, corde)', () => {
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const TYPES = { drapeau: 'tissu', banniere: 'tissu', rideau: 'tissu', guirlande: 'corde', filet: 'tissu', corde: 'corde' };
  for (const [nom, type] of Object.entries(TYPES)) {
    const e = compiler(nom).effet;
    const st = e.emetteurs.filter((em) => em.structure);
    assert.equal(st.length, 1, `${nom} : une structure`);
    assert.equal(st[0].structure.type, type, nom);
    assert.ok(st[0].structure.nSommets <= R.SOMMETS_TISSU_MAX, `${nom} : 64 × 64 sommets au plus`);
    assert.deepEqual(e.elements, [], `${nom} : aucun « #id » (posé sur n'importe quelle ancre)`);
    assert.equal(st[0].voieRapide, false);
  }
  const drapeau = compiler('drapeau').effet.emetteurs[0];
  assert.deepEqual([drapeau.structure.apparence.mode, drapeau.structure.apparence.bandes], ['degrade', true]);
  assert.deepEqual(drapeau.structure.attaches.map((a) => [a.sommets.length, a.cible]), [[16, { genre: 'element', element: 0 }]], 'bord gauche tenu à l\'ancre');
  assert.deepEqual(drapeau.tables.couleur.slice(0, 4).map(r6), R.couleurLineaire('#0a6cff', {}).map(r6), 'première bande : primaire de la charte');
  assert.deepEqual(drapeau.tables.couleur.slice(252, 256).map(r6), R.couleurLineaire('#b45309', {}).map(r6), 'dernière bande : accent');
  const banniere = compiler('banniere').effet.emetteurs[0];
  assert.equal(banniere.structure.apparence.source, 'ancre');
  assert.equal(banniere.structure.attaches[0].lacher, 1.5);
  assert.equal(compiler('banniere', 'chute: 3').effet.emetteurs[0].structure.attaches[0].lacher, 3);
  assert.equal(banniere.collisions.reponse, 'rebond');
  const rideau = compiler('rideau').effet.emetteurs[0];
  assert.equal(rideau.structure.dechirure, 1.3);
  assert.deepEqual(rideau.structure.attaches.map((a) => [a.sommets.length, a.glisse]), [[16, { vers: [-0.2, 0], duree: 1 }], [16, { vers: [0.2, 0], duree: 1 }]],
    'deux moitiés du bord haut qui s\'écartent : le rideau s\'ouvre');
  assert.deepEqual(rideau.forces.map((f) => f.type), ['gravite'], 'aucune force qui projette ses morceaux');
  const [fil, ampoule] = compiler('guirlande').effet.emetteurs;
  assert.deepEqual(fil.structure.perles, { emetteur: 1, tous: 6, debut: 3, nombre: 8 });
  assert.deepEqual([ampoule.perlesDe, ampoule.capacite, ampoule.rendu.melange], [0, 8, 'additif']);
  assert.deepEqual(compiler('guirlande', 'mou: 0').effet.emetteurs[0].structure.attaches[1].cible.point, [1, 0.5], 'sans mou : guirlande tendue');
  const filet = compiler('filet').effet.emetteurs[0];
  assert.deepEqual([filet.structure.apparence.mailles, filet.structure.dechirure, filet.structure.flexion], [true, 1.4, 0]);
  assert.equal(compiler('filet', 'souplesse: 1').effet.emetteurs[0].structure.raideur, 0.5);
  assert.ok(filet.collisions.masque & R.CODES.cible.elements, 'le filet retient les éléments déclarés');
  const corde = compiler('corde').effet.emetteurs[0];
  assert.deepEqual(corde.structure.attaches, [{ sommets: [0], cible: { genre: 'point', point: [0.5, 0] }, lacher: null, glisse: null }]);
  assert.equal(compiler('corde', 'epaisseur: 2').effet.emetteurs[0].structure.epaisseur, 2);
});

test('référence : section Cordes et tissus (champs du schéma, attaches, apparence, perles, contrôles, bibliothèque)', () => {
  const texte = fs.readFileSync(path.join(__dirname, '..', 'references', 'particules.md'), 'utf8');
  const debut = texte.indexOf('## Cordes et tissus');
  const fin = texte.indexOf('## Régler à l\'œil');
  assert.ok(debut > texte.indexOf('## Interactions') && fin > debut, 'section après les interactions, avant l\'atelier');
  const section = texte.slice(debut, fin);
  const n = R.SCHEMA.champs.emetteurs.element.champs.structure;
  const champs = [...Object.keys(n.champs), ...Object.values(n.variantes.types).flatMap((v) => Object.keys(v.champs)),
    ...Object.keys(n.champs.attaches.element.champs), ...Object.keys(n.champs.apparence.champs), 'tous', 'emetteur'];
  for (const c of champs) assert.ok(section.includes('`' + c + '`'), `champ « ${c} » documenté`);
  for (const mot of ['"type": "tissu"', '`debut`', '`fin`', '`haut`', '`bas`', '`gauche`', '`droite`', '`coins`', '`ancre`', '#id', '`avec`', 'data-ancre',
    'structure-invalide', 'attache-introuvable', 'ancre-vide', 'budget-structures', '64 × 64', '16 cordes et tissus']) {
    assert.ok(section.includes(mot), `la section parle de « ${mot} »`);
  }
  for (const nom of ['drapeau', 'banniere', 'rideau', 'guirlande', 'filet', 'corde']) assert.ok(section.includes('`' + nom + '`'), nom);
  assert.match(texte.split('## Cordes et tissus')[0], /voir « Cordes et tissus »/, 'l\'essentiel et la bibliothèque y renvoient');
  assert.doesNotMatch(texte, /pas d'interaction avec des cordes ou des tissus/, 'la section Interactions est à jour');
  const controles = fs.readFileSync(path.join(__dirname, '..', 'references', 'controles.md'), 'utf8');
  for (const r of ['structure-invalide', 'attache-introuvable', 'budget-structures']) assert.match(controles, new RegExp('`' + r + '`'), r);
});
