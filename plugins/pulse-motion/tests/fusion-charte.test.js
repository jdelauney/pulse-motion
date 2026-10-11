'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../scripts/lib/fusion-charte.js');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { validerCharte, lireDeroule } = require('../scripts/lib/deroule.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { stylesEssai, modifierJSON } = require('./aide/styles.js');

const ecrireCharte = (dir, charte) => { fs.mkdirSync(path.join(dir, 'charte', 'polices'), { recursive: true }); fs.writeFileSync(path.join(dir, 'charte', 'charte.json'), JSON.stringify(charte)); };

test('quatre étages : défaut → style → charte/ → déroulé ; chemins de charte/ ramenés au projet', () => {
  const dir = copierProjet('projet-simple');
  ecrireCharte(dir, { couleurs: { primaire: '#111111', accent: '#222222' }, logo: 'logo.svg', polices: { texte: { famille: 'Marque', fichier: 'polices/Marque.woff2' } }, ton: 'clair' });
  const { deroule } = lireDeroule(dir);
  const c = F.chartePour(deroule, path.join(STYLES, 'test'), dir);
  assert.equal(c.couleurs.primaire, '#0a6cff', 'le déroulé l\'emporte');
  assert.equal(c.couleurs.accent, '#222222', 'charte/ l\'emporte sur le style');
  assert.equal(c.couleurs.fond, '#fafafa', 'style');
  assert.equal(c.couleurs.texte, '#1a1a1a', 'défaut');
  assert.equal(c.logo, 'assets/logo.svg', 'logo du déroulé');
  assert.deepEqual(c.polices.texte, { famille: 'Marque', fichier: 'charte/polices/Marque.woff2' });
  assert.equal(c.ton, 'clair');
  delete deroule.charte.logo;
  assert.equal(F.chartePour(deroule, path.join(STYLES, 'test'), dir).logo, 'charte/logo.svg');
});

test('ton : choisi, automatique selon le contraste, sinon ton par défaut ; fond imposé gardé', () => {
  const identite = { couleur: { tons: ['clair', 'sombre'], tonDefaut: 'clair', sombre: { fond: '#0b1020', texte: '#f1f5f9' } } };
  const base = { couleurs: { primaire: '#1d4ed8', accent: '#b45309', fond: '#ffffff', texte: '#111111' }, fondImpose: false };
  assert.deepEqual(F.appliquerTon({ ...base, ton: 'sombre' }, identite), { ton: 'sombre', couleurs: { ...base.couleurs, fond: '#0b1020', texte: '#f1f5f9' } });
  assert.equal(F.appliquerTon({ ...base, ton: 'auto' }, identite).ton, 'clair');
  assert.equal(F.appliquerTon({ ...base, couleurs: { ...base.couleurs, primaire: '#fde047', accent: '#a3e635' }, ton: 'auto' }, identite).ton, 'sombre');
  assert.equal(F.appliquerTon({ ...base, ton: 'sombre' }, { couleur: { tons: ['clair'] } }).ton, 'clair');
  assert.equal(F.appliquerTon({ ...base, ton: 'sombre', fondImpose: true }, identite).couleurs.fond, '#ffffff');
});

test('variables dérivées : couleurs lisibles sur le fond et texte posé dessus', () => {
  const lignes = F.variablesDerivees({ primaire: '#1d4ed8', accent: '#fbbf24', fond: '#ffffff' }).join('\n');
  assert.match(lignes, /--c-primaire-lisible: #1d4ed8;/);
  assert.match(lignes, /--c-sur-primaire: #ffffff;/);
  assert.doesNotMatch(lignes, /--c-accent-lisible: #fbbf24;/, 'accent trop clair : ajusté');
  assert.match(lignes, /--c-sur-accent: #000000;/);
});

test('page : data-ton, variables dérivées, polices de charte/polices en plusieurs graisses', () => {
  const dir = copierProjet('projet-simple');
  ecrireCharte(dir, { polices: { titres: 'Marque' } });
  for (const g of [400, 700]) fs.copyFileSync(path.join(STYLES, 'test', 'polices', 'Testfont.woff2'), path.join(dir, 'charte', 'polices', `Marque-${g}.woff2`));
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /<div id="pm-scene" data-ton="clair">/);
  assert.match(r.html, /--c-primaire-lisible: #/);
  assert.match(r.html, /@font-face \{ font-family: 'Marque'; src: url\("data:font\/woff2;base64,[^"]+"\); font-weight: 400;/);
  assert.match(r.html, /font-family: 'Marque'; src: url\("data:font\/woff2;base64,[^"]+"\); font-weight: 700;/);
  assert.match(r.html, /--f-titres: 'Marque', system-ui, sans-serif;/);
});

test('charte/charte.json dangereux ou illisible : refusé, jamais injecté', () => {
  const dir = copierProjet('projet-simple');
  ecrireCharte(dir, { couleurs: { fond: 'red' }, polices: { titres: "x'</style><script>alert(1)</script>" } });
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(r.erreurs[0].regle, 'charte-invalide');
  assert.match(r.erreurs[0].message, /charte\/charte\.json/);
  assert.doesNotMatch(r.html, /alert\(1\)|--c-fond: red/);
  fs.writeFileSync(path.join(dir, 'charte', 'charte.json'), '{ pas du json');
  assert.match(assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).erreurs[0].message, /charte\/charte\.json n'est pas un JSON valide/);
});

test('validerCharte : modele, ton, police en objet', () => {
  assert.deepEqual(validerCharte({ modele: 'client-dupont', ton: 'auto', polices: { titres: { famille: 'Marque', fichier: 'polices/Marque.woff2' } } }), []);
  assert.match(validerCharte({ ton: 'gris' }).join(), /« charte\.ton » doit être l'un de : clair, sombre, auto/);
  assert.match(validerCharte({ modele: '../x' }).join(), /« charte\.modele »/);
  assert.match(validerCharte({ polices: { titres: { famille: 'Marque' } } }).join(), /« charte\.polices\.titres »/);
});

test('contrôle : contraste calculé sur la charte finale (ton sombre du style)', () => {
  const racine = stylesEssai(['alpha']);
  modifierJSON(path.join(racine, 'alpha', 'identite.json'), (j) => { j.couleur.tons = ['clair', 'sombre']; j.couleur.sombre = { fond: '#0b1020', texte: '#0f172a' }; });
  fs.appendFileSync(path.join(racine, 'alpha', 'style.css'), '\n#pm-scene[data-ton="sombre"] { background: var(--c-fond); }\n');
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.style = 'alpha'; d.charte = { ton: 'sombre' }; });
  const r = controler({ dossier: dir, dossierStyles: racine, ecrire: false });
  assert.ok(r.problemes.some((p) => p.regle === 'contraste' && /#0f172a/.test(p.message)), JSON.stringify(r.problemes.map((p) => p.message)));
});

test('police { famille, fichier } qui n\'est pas une police : refusée à la validation, jamais d\'exception à l\'assemblage', () => {
  assert.match(validerCharte({ polices: { titres: { famille: 'A', fichier: 'charte.json' } } }).join(), /« charte\.polices\.titres »/);
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets', 'dossier.woff2'));
  modifierDeroule(dir, (d) => { d.charte.polices = { titres: { famille: 'A', fichier: 'assets/dossier.woff2' } }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(r.erreurs[0].regle, 'police-non-embarquee');
  assert.match(r.erreurs[0].message, /Police « A »/);
});

test('fond imposé par la charte : le ton suit la clarté du fond', () => {
  const identite = { couleur: { tons: ['clair', 'sombre'], tonDefaut: 'clair', sombre: { fond: '#0b1020', texte: '#f1f5f9' } } };
  const sombre = { couleurs: { primaire: '#1d4ed8', accent: '#b45309', fond: '#111111', texte: '#eeeeee' }, fondImpose: true };
  assert.equal(F.appliquerTon({ ...sombre, ton: 'auto' }, identite).ton, 'sombre');
  assert.equal(F.appliquerTon({ ...sombre, ton: 'clair' }, identite).ton, 'sombre');
  assert.equal(F.appliquerTon({ ...sombre, couleurs: { ...sombre.couleurs, fond: '#ffffff' }, ton: 'sombre' }, identite).ton, 'clair');
  assert.equal(F.appliquerTon({ ...sombre, ton: 'auto' }, { couleur: { tons: ['clair'] } }).ton, 'clair');
});
