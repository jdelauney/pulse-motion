'use strict';
/* Moteur à la carte, puis minifié (spec Rapidité 5.19) : groupes de modules, conditions d'inclusion, contrôle injecté par la
 * page de mesure, ateliers en moteur entier, minifieur sans dépendance. Tests sans navigateur ; les images sont comparées
 * dans moteur-carte-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const GM = require('../scripts/lib/groupes-moteur.js');
const { minifier } = require('../scripts/lib/minifier.js');
const { assembler, lireMoteur, MOTEUR, RACINE } = require('../scripts/assembler.js');
const { GENERES } = require('../scripts/lib/routes-atelier.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');

const DOSSIER_MOTEUR = path.join(RACINE, 'moteur');

/** Fichiers JavaScript du moteur qui ne vont jamais dans une page de vidéo, avec leur raison. */
const HORS_PAGE = {
  'absents.js': 'toujours inclus, en dernier (points d\'entrée des groupes absents)',
  'capture.js': 'injecté par la page de mesure, l\'aperçu et l\'export',
  'export.mjs': 'export navigateur de l\'aperçu', 'export-ui.mjs': 'export navigateur de l\'aperçu', 'studio.mjs': 'studio de la voix',
  'estimation.js': 'temps restant de l\'export (aperçu et Node)',
  // Page qui sait faire son MP4 (spec Retouches et ergonomie, 5.18) : module facultatif, compressé dans le bloc d'export.
  'export-page.mjs': 'page qui sait faire son MP4 (bloc compressé)', 'export-page-chargeur.js': 'page qui sait faire son MP4 (chargeur)',
  'atelier/editeur.mjs': 'atelier', 'atelier/page.mjs': 'atelier', 'atelier/panneau.mjs': 'atelier',
  'particules/expression.js': 'Node et atelier', 'particules/forme-close.js': 'Node', 'particules/naissances.js': 'Node',
  'particules/recette.js': 'atelier',
  'personnages/atelier.mjs': 'atelier', 'personnages/decoupe-atelier.mjs': 'atelier', 'personnages/edition.mjs': 'atelier',
  'personnages/decoupe.js': 'découpe (Node et atelier)',
  'cadres/telephone.js': 'cadre de téléphone à l\'export (Node et aperçu, spec Rendu et export 5.15)',
  // Retouches directes (spec Retouches et ergonomie, 5.8 à 5.12) : injectés par l'aperçu seulement.
  'apercu/remarques.mjs': 'aperçu', 'apercu/reglages.mjs': 'aperçu', 'apercu/piste.mjs': 'aperçu', 'apercu/comparer.mjs': 'aperçu (page de comparaison)',
};

function fichiersMoteur(dossier = DOSSIER_MOTEUR, prefixe = '') {
  const r = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) r.push(...fichiersMoteur(path.join(dossier, e.name), `${prefixe}${e.name}/`));
    else if (/\.(m?js)$/.test(e.name)) r.push(prefixe + e.name);
  }
  return r;
}

test('moteur-chaque-module-dans-un-seul-groupe : chaque module de page dans un seul groupe ; un module ajouté sans groupe échoue', () => {
  const vus = new Map();
  for (const [g, modules] of Object.entries(GM.GROUPES)) {
    for (const m of modules) {
      assert.ok(!vus.has(m), `${m} : dans ${vus.get(m)} et ${g}`);
      vus.set(m, g);
    }
  }
  assert.deepEqual([...vus.keys()].sort(), [...GM.MODULES].sort(), 'les groupes couvrent exactement les modules');
  assert.equal(new Set(GM.MODULES).size, GM.MODULES.length, 'aucun module en double');
  assert.deepEqual(MOTEUR, GM.MODULES, 'la liste du moteur de l\'assemblage est celle des groupes');
  for (const m of GM.MODULES.concat(GM.ABSENTS)) assert.ok(fs.existsSync(path.join(DOSSIER_MOTEUR, m)), `${m} existe`);
  // Tout fichier du moteur est soit dans un groupe, soit déclaré hors page ici.
  // Modules d'un style (moteur/medium/, spec Styles et réalisation 5.10 point 3) : hors des groupes, inclus seulement par le
  // style qui les déclare (identite.modules).
  for (const f of fichiersMoteur()) assert.ok(vus.has(f) || HORS_PAGE[f] || f.startsWith('medium/'), `${f} : module sans groupe (l'ajouter à un groupe de scripts/lib/groupes-moteur.js, ou ici s'il ne va jamais dans une page)`);
  for (const f of fichiersMoteur().filter((x) => x.startsWith('medium/'))) assert.ok(!vus.has(f), `${f} : un module de style n'est dans aucun groupe`);
  // Ordre : tronc d'abord pour ses dépendances (courbes avant minutage, horloge avant tailles), absents.js en dernier.
  const tous = GM.modulesDesGroupes('tous');
  assert.equal(tous[tous.length - 1], 'absents.js');
  assert.ok(tous.indexOf('courbes.js') < tous.indexOf('horloge.js') && tous.indexOf('horloge.js') < tous.indexOf('tailles.js'));
  assert.throws(() => GM.modulesDesGroupes(['tronc', 'inconnu']), /groupe de modules inconnu : « inconnu »/);
});

test('moteur-groupes-selon-le-deroule : chaque groupe selon les données et les scènes', () => {
  const g = (d, sections) => GM.groupesDuDeroule(d, sections);
  assert.deepEqual(g({}), ['tronc']);
  assert.deepEqual(g({ son: { pistes: ['musique'] } }), ['tronc', 'son-reactif']);
  assert.deepEqual(g({ musique: { generee: 'calme', partition: { pistes: [] } } }), ['tronc', 'synthe']);
  assert.deepEqual(g({ musique: { source: 'pm-son-musique', partition: null } }), ['tronc'], 'musique importée : pas de synthé');
  assert.deepEqual(g({ bruitages: { transitions: true } }), ['tronc', 'synthe']);
  assert.deepEqual(g({ bruitages: { transitions: false } }), ['tronc']);
  assert.deepEqual(g({}, ['<p data-son="pop">']), ['tronc', 'synthe'], 'bruitage nommé');
  assert.deepEqual(g({}, ['<p data-son="fichier:pm-son-fichier-0">']), ['tronc', 'synthe'], 'son importé : le synthé prépare son bruit');
  assert.deepEqual(g({ personnages: { dessins: {} } }), ['tronc', 'personnages']);
  for (const cle of ['effets', 'milieux', 'shaders']) assert.deepEqual(g({ [cle]: [{}] }), ['tronc', 'gpu'], cle);
  assert.deepEqual(g({ modules: { 'x.js': '…' } }), ['tronc', 'gpu']);
  assert.deepEqual(g({ obstacles: [{ scene: 's' }] }), ['tronc', 'gpu'], 'obstacle : formes exactes jugées par les particules');
  assert.deepEqual(g({ obstaclesVideo: [{}] }), ['tronc', 'gpu']);
  assert.deepEqual(g({ effets: [], milieux: [], shaders: [], modules: {}, obstacles: [], obstaclesVideo: [] }), ['tronc']);

  // Projets d'essai assemblés : une vidéo simple n'a que le tronc ; un personnage, un bruitage ou un effet ajoutent leur groupe.
  const simple = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(simple.groupes, ['tronc']);
  assert.match(simple.moteur, /M\.groupes = \["tronc"\]|\.groupes = \["tronc"\]/);
  assert.doesNotMatch(simple.html, /M\.demarrerPersonnages = function|M\.demarrerParticules = function|M\.mesurer = function/);

  const perso = copierProjet('projet-simple');
  fs.writeFileSync(path.join(perso, 'scenes', '02-chiffre.html'), '<section data-scene="chiffre"><div data-personnage="touffu" data-x="40"><i data-action="pose" data-pose="montrer" data-start="0"></i></div><p data-texte="legende" data-son="pop"></p></section>');
  const rp = assembler({ dossier: perso, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(rp.groupes, ['tronc', 'synthe', 'personnages']);
  assert.match(rp.html, /M\.demarrerPersonnages = function/);

  const transition = copierProjet('projet-simple');
  modifierDeroule(transition, (d) => { d.scenes[1].transition = { shader: 'vagues' }; });
  const rt = assembler({ dossier: transition, dossierStyles: STYLES, ecrire: false });
  if (rt.ok && rt.shaders.length) assert.ok(rt.groupes.includes('gpu'), 'transition par shader : GPU');

  const effets = assembler({ dossier: copierProjet('projet-effets'), dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.ok(effets.groupes.includes('gpu'));
  assert.match(effets.html, /M\.demarrerParticules = function/);

  const tous = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false, groupes: 'tous' });
  assert.deepEqual(tous.groupes, 'tous');
  assert.ok(tous.moteur.length > 3 * simple.moteur.length);
});

test('moteur-controle-injecte-par-la-page-de-mesure : mesures et pixels jamais dans la page livrée, injectés pour mesurer', () => {
  const { html } = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false });
  assert.doesNotMatch(html, /M\.mesurer = function|M\.mesurerPixels = function|M\.ecouter = /);
  const source = fs.readFileSync(path.join(RACINE, 'scripts', 'lib', 'page-mesures.js'), 'utf8');
  // L'écoute du son (spec S2, 5.11) est un module du contrôle, injecté comme les mesures.
  assert.match(source, /\['mesures\.js', 'pixels\.js', 'ecoute\.js'\]/);
  // Les deux pages de mesure (POST et CDP) passent par la même injection.
  assert.equal((source.match(/\$\{injecte\(\)\}/g) || []).length, 2);
  // L'empreinte du contrôle porte sur les modules injectés et sur le moteur inclus.
  const controler = fs.readFileSync(path.join(RACINE, 'scripts', 'controler.js'), 'utf8');
  assert.match(controler, /'moteur', 'mesures\.js'\), path\.join\(RACINE, 'moteur', 'pixels\.js'\)/);
  assert.match(controler, /assemblage\.moteur/);
});

test('ateliers-moteur-entier : l\'atelier des effets sert le moteur entier', () => {
  const { corps } = GENERES['/_pm/atelier/moteur.js']();
  // Tous les groupes du moteur, dans l'ordre de groupes-moteur.js (la liste n'est pas recopiée ici).
  assert.ok(corps.includes(`.groupes = ${JSON.stringify(GM.NOMS)};`), 'le moteur entier, tous groupes compris');
  assert.ok(GM.NOMS.includes('controle') && GM.NOMS.includes('tronc'));
  for (const f of ['M.demarrerPersonnages = function', 'M.demarrerParticules = function', 'M.mesurer = function', 'M.demarrerSonReactif = function']) assert.ok(corps.includes(f), f);
});

// ---------- Minification (5.19.4) ----------

test('minifier-litteraux-intacts : chaînes, gabarits imbriqués, expressions régulières et WGSL gardés ; commentaires retirés', () => {
  const source = [
    '/* Titre du module',
    ' * sur deux lignes. */',
    '(function () {',
    '    \'use strict\';   // en ligne',
    '',
    '    var a = "un // pas un commentaire", b = \'/* pas non plus */\';',
    '    var re = /\\/\\/[a-z/]+\\//g, d = a.length / 2 / 1;',
    '    var r2 = (x) => x.replace(/\'/g, "`");',
    '    if (!re.test(a)) return /x\\/y/.test(b);',
    '    var i = 0; i++ / 2;',
    '    var g = `ligne 1',
    '  // garde ce commentaire du gabarit',
    '      ${ `imbriqué ${ \'}\' + "{" } fin` }   ${ { a: 1 }.a } ` ;',
    '    var wgsl = /* wgsl */ `',
    '      @compute @workgroup_size(64) fn main() { // commentaire WGSL gardé',
    '        let x = 1.0 / 2.0;',
    '      }`;',
    '    var div = (a) / 2, obj = {}.x / 3;',
    '    /* Licence MIT : Copyright (c) 2026 quelqu\'un */',
    '    return typeof /a/;',
    '})();',
    '',
  ].join('\n');
  const m = minifier(source);
  for (const garde of ['"un // pas un commentaire"', '\'/* pas non plus */\'', '/\\/\\/[a-z/]+\\//g', '/\'/g, "`"', '/x\\/y/.test(b)',
    '`ligne 1\n  // garde ce commentaire du gabarit\n      ${ `imbriqué ${ \'}\' + "{" } fin` }   ${ { a: 1 }.a } `',
    '`\n      @compute @workgroup_size(64) fn main() { // commentaire WGSL gardé\n        let x = 1.0 / 2.0;\n      }`',
    '/* Licence MIT : Copyright (c) 2026 quelqu\'un */', 'typeof /a/', 'i++ / 2', 'a.length / 2 / 1', '(a) / 2', '{}.x / 3']) {
    assert.ok(m.includes(garde), `gardé tel quel : ${garde}\n---\n${m}`);
  }
  assert.doesNotMatch(m, /Titre du module|en ligne/);
  for (const ligne of ['\'use strict\';', 'var a = "un // pas un commentaire"', 'var i = 0; i++ / 2;', 'return typeof /a/;']) assert.ok(m.split('\n').some((l) => l.startsWith(ligne)), `sans indentation : ${ligne}`);
  assert.doesNotMatch(m, /\n\n/, 'aucune ligne vide');
  assert.doesNotMatch(m, /[ \t]\n/, 'aucun espace en fin de ligne');
  // Le code minifié se comporte comme l'original.
  const executer = (code) => vm.runInNewContext(code);
  assert.equal(executer(source), executer(m));
  // Les fins de ligne sont gardées : aucune insertion de point-virgule ne change.
  assert.equal(minifier('var a = 1\nvar b = a\n(function () {})'), 'var a = 1\nvar b = a\n(function () {})\n');
  assert.equal(minifier('return\n  x'), 'return\nx\n');
});

test('minifier-litteraux-intacts : chaque module du moteur, minifié, se compile et garde ses littéraux', () => {
  for (const f of GM.MODULES.concat(GM.ABSENTS)) {
    const brut = fs.readFileSync(path.join(DOSSIER_MOTEUR, f), 'utf8');
    const min = minifier(brut);
    assert.doesNotThrow(() => new vm.Script(min, { filename: f }), f);
    assert.ok(min.length < brut.length, `${f} : plus court`);
    // Les gabarits de shaders (WGSL et GLSL) restent entiers.
    for (const gabarit of (brut.match(/`[^`$]*`/g) || []).filter((g) => /@compute|@fragment|@vertex|fn main|void main|#version|precision /.test(g))) assert.ok(min.includes(gabarit), `${f} : gabarit gardé ${gabarit.slice(0, 40)}`);
  }
  // Le moteur entier pèse moins, mentions de licence comprises.
  const brut = lireMoteur(RACINE, { brut: true });
  const min = lireMoteur(RACINE, { brut: false });
  assert.ok(min.length < 0.8 * brut.length, `${min.length} contre ${brut.length}`);
  for (const mention of brut.match(/^.*licence MIT.*$/gim) || []) assert.ok(min.includes(mention.trim().replace(/^\*\s*/, '').slice(0, 30)), `mention gardée : ${mention}`);
});

test('moteur-brut-par-variable : PM_MOTEUR_BRUT=1 assemble sans minifier', () => {
  const avant = process.env.PM_MOTEUR_BRUT;
  try {
    process.env.PM_MOTEUR_BRUT = '1';
    const brut = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false });
    delete process.env.PM_MOTEUR_BRUT;
    const min = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false });
    assert.match(brut.moteur, /Pulse Motion – transitions d'entrée d'une scène\./);
    assert.doesNotMatch(min.moteur, /Pulse Motion – transitions d'entrée d'une scène\./);
    assert.ok(min.html.length < brut.html.length);
  } finally {
    if (avant === undefined) delete process.env.PM_MOTEUR_BRUT; else process.env.PM_MOTEUR_BRUT = avant;
  }
});
