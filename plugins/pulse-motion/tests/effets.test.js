'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { preparerEffets, fnv1a } = require('../scripts/lib/effets.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { controler } = require('../scripts/controler.js');
const { sauvegarder, annuler } = require('../scripts/historique.js');
const controler2 = (dir) => controler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });

const donneesDe = (html) => JSON.parse(/<script type="application\/json" id="pm-donnees">([^<]*)<\/script>/.exec(html)[1]);
const assembler2 = (dir) => assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), contenu);
};

test('extraire : un data-effet est minuté même sans data-start', () => {
  const { elements } = extraireScene('<section data-scene="s"><p id="a" data-start="1"></p><div data-effet="gerbe" data-calque="arriere"></div></section>');
  assert.deepEqual(elements.map((e) => [e.cle, e.effet, e.calque]), [['a', undefined, undefined], ['_1', 'gerbe', 'arriere']]);
});

test('page : recettes compilées, projet prioritaire, index sur les balises', () => {
  const dir = copierProjet('projet-effets');
  const r = assembler2(dir);
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  const d = donneesDe(r.html);
  assert.equal(d.effets.length, 2);
  assert.equal(d.effets[0].calque, 'avant');
  assert.equal(d.effets[0].ancre, 'titre');
  assert.equal(d.effets[0].effet.nom, 'gerbe');
  assert.equal(d.effets[0].effet.emetteurs[0].debit, 150, 'réglage nombre: 300 sur 2 s');
  assert.equal(d.effets[0].effet.graine, fnv1a('etincelles|0|gerbe'));
  assert.equal(d.effets[1].calque, 'arriere');
  assert.equal(d.effets[1].ancre, null);
  assert.equal(d.effets[1].effet.nom, 'locale');
  assert.equal(d.effets[1].effet.capacite, 50);
  assert.match(r.html, /<div data-effet="gerbe"[^>]* data-pm-effet="0">/);
  assert.match(r.html, /<div data-effet="locale" data-calque="arriere" data-pm-effet="1">/);
  assert.deepEqual(r.effets.map((e) => [e.scene, e.ordre, e.calque]), [['etincelles', 0, 'avant'], ['etincelles', 1, 'arriere']]);

  ecrire(dir, 'effets/simple.json', JSON.stringify({ version: 1, nom: 'simple', emetteurs: [{ nom: 'salve', naissance: { salves: [{ t: 0, nombre: 7 }] } }] }));
  assert.equal(donneesDe(assembler2(dir).html).effets[1].effet.capacite, 7, 'la recette du projet prime sur la bibliothèque');
});

test('erreurs d\'effets : nommées, page produite, balise marquée', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/casse.json', '{ "version": 1, ');
  ecrire(dir, 'effets/texture.json', JSON.stringify({ version: 1, nom: 'texture', etend: 'simple', emetteurs: [{ nom: 'salve', rendu: { texture: 'assets/absent.png' } }] }));
  ecrire(dir, 'scenes/01-etincelles.html', `<section data-scene="etincelles">
  <h1 id="titre" data-texte="titre"></h1>
  <div data-effet="inconnu"></div>
  <div data-effet="gerbe" data-reglages="nombre: 99999"></div>
  <div data-effet="gerbe" data-ancre="#absent"></div>
  <div data-effet="gerbe" data-calque="dessus"></div>
  <div data-effet="casse"></div>
  <div data-effet="texture"></div>
  <div data-effet="gerbe" data-graine="sept"></div>
</section>`);
  const r = assembler2(dir);
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.map((e) => e.regle), ['effet-inconnu', 'reglage-invalide', 'ancre-introuvable', 'effet-invalide', 'effet-invalide', 'fichier-introuvable', 'effet-invalide']);
  assert.ok(r.erreurs.every((e) => e.gravite === 'erreur' && e.scene === 'etincelles'));
  const textes = r.erreurs.map((e) => e.message).join('\n');
  assert.match(textes, /Scène « etincelles » : Effet « inconnu » introuvable/);
  assert.match(textes, /Scène « etincelles » : Effet « gerbe » : réglage « nombre » : 99999 est au-delà du maximum 1000\./);
  assert.match(textes, /data-ancre « #absent » ne désigne aucun élément de la scène/);
  assert.match(textes, /data-calque « dessus » : avant ou arriere/);
  assert.match(textes, /Effet « casse » : le fichier « effets\/casse\.json » du projet n'est pas un JSON valide/);
  assert.match(textes, /texture « assets\/absent\.png » de l'effet « texture » introuvable/);
  assert.match(textes, /data-graine « sept » : nombre entier attendu/);
  assert.equal((r.html.match(/data-pm-effet-erreur="/g) || []).length, 7);
  assert.deepEqual(donneesDe(r.html).effets, []);
});

test('texture d\'image embarquée', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'assets/point.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
  ecrire(dir, 'effets/locale.json', JSON.stringify({ version: 1, nom: 'locale', etend: 'simple', emetteurs: [{ nom: 'salve', rendu: { texture: 'assets/point.svg' } }] }));
  const r = assembler2(dir);
  assert.deepEqual(r.erreurs, []);
  const rendu = donneesDe(r.html).effets[1].effet.emetteurs[0].rendu;
  assert.equal(rendu.texture, 'image');
  assert.equal(rendu.textureCode, 6);
  assert.match(rendu.textureImage, /^data:image\/svg\+xml;base64,/);
});

test('balise auto-fermante et commentaire', () => {
  const dir = copierProjet('projet-effets');
  const r = preparerEffets('<section data-scene="s"><!-- <div data-effet="commente"></div> --><div data-effet="simple" /><div data-effet="simple" data-graine="5"></div></section>',
    { scene: 's', projet: dir, bibliotheque: EFFETS, charte: {}, premierIndex: 3 });
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /<div data-effet="simple" data-pm-effet="3" \/>/);
  assert.match(r.html, /<div data-effet="simple" data-graine="5" data-pm-effet="4">/);
  assert.doesNotMatch(r.html, /commente/);
  assert.deepEqual(r.effets.map((e) => [e.ordre, e.effet.graine]), [[0, fnv1a('s|0|simple')], [1, 5]]);
});

test('deux scènes, index et graines', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'scenes/01-etincelles.html', '<section data-scene="etincelles"><h1 data-texte="titre"></h1><div data-effet="simple"></div></section>');
  ecrire(dir, 'scenes/02-suite.html', '<section data-scene="suite"><div data-effet="simple"></div></section>');
  modifierDeroule(dir, (d) => { d.scenes.push({ id: 'suite', fichier: 'scenes/02-suite.html', duree: 2, textes: {} }); });
  const r = assembler2(dir);
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /data-scene="etincelles"><h1[^>]*>[^<]*<\/h1><div data-effet="simple" data-pm-effet="0">/);
  assert.match(r.html, /data-scene="suite"><div data-effet="simple" data-pm-effet="1">/);
  const [a, b] = donneesDe(r.html).effets;
  assert.notEqual(a.effet.graine, b.effet.graine);
});

test('projet sans effet : liste vide dans la page', () => {
  const dir = copierProjet('projet-simple');
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(donneesDe(r.html).effets, []);
  assert.deepEqual(r.effets, []);
});

test('contrôles : projet avec effets sans problème', () => {
  const dir = copierProjet('projet-effets');
  assert.deepEqual(controler2(dir).problemes, []);
});

test('contrôles : erreurs d\'effets reprises de l\'assemblage', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'scenes/01-etincelles.html', '<section data-scene="etincelles"><h1 data-texte="titre"></h1><div data-effet="inconnu"></div></section>');
  const p = controler2(dir).problemes.find((x) => x.regle === 'effet-inconnu');
  assert.ok(p);
  assert.equal(p.gravite, 'erreur');
});

test('contrôles : budget de particules dépassé', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'scenes/01-etincelles.html', `<section data-scene="etincelles">
  <h1 id="titre" data-texte="titre" data-start="0.2"></h1>
  <div data-effet="gerbe" data-ancre="#titre" data-start="#titre:fin" data-dur="2" data-reglages="nombre: 300"></div>
  <div data-effet="simple" data-calque="arriere" data-reglages="nombre: 400000"></div>
</section>`);
  const p = controler2(dir).problemes.find((x) => x.regle === 'budget-particules');
  assert.ok(p);
  assert.equal(p.gravite, 'alerte');
  assert.equal(p.scene, 'etincelles');
  assert.match(p.message, /Scène « etincelles » : jusqu'à 400604 particules en même temps \(au-delà de 300000, l'aperçu ralentit\)/);
});

test('contrôles : effet devant un texte long pendant sa lecture', () => {
  const dir = copierProjet('projet-effets');
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Un titre bien trop long pour être lu pendant que les étincelles passent'; d.scenes[0].duree = 8; });
  const alertes = controler2(dir).problemes.filter((x) => x.regle === 'effet-sur-texte');
  assert.equal(alertes.length, 1, 'seul l\'effet du calque avant gêne');
  assert.equal(alertes[0].element, '_1');
  assert.match(alertes[0].message, /Scène « etincelles » : l'effet « gerbe » passe devant le texte « titre » pendant sa lecture ; le poser en data-calque="arriere" ou le décaler après la lecture\./);
});

test('historique : effets/ sauvegardé et restauré', () => {
  const dir = copierProjet('projet-effets');
  const avant = fs.readFileSync(path.join(dir, 'effets', 'locale.json'), 'utf8');
  sauvegarder(dir);
  ecrire(dir, 'effets/locale.json', '{}');
  ecrire(dir, 'effets/nouvelle.json', '{}');
  annuler(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'effets', 'locale.json'), 'utf8'), avant);
  assert.equal(fs.existsSync(path.join(dir, 'effets', 'nouvelle.json')), false);
});

const LONGUE = JSON.stringify({ version: 1, nom: 'longue', emetteurs: [{ nom: 'salve', naissance: { salves: [{ t: 0, nombre: 5 }], forme: { type: 'point' }, vie: [3, 3] } }] });

test('contrôles : une particule encore vivante compte comme du mouvement (temps-mort)', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/longue.json', LONGUE);
  ecrire(dir, 'scenes/01-etincelles.html', `<section data-scene="etincelles">
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <div data-effet="longue" data-start="1" data-dur="0.1"></div>
</section>`);
  ecrire(dir, 'scenes/02-suite.html', '<section data-scene="suite"><h1 data-texte="titre" data-start="0"></h1></section>');
  modifierDeroule(dir, (d) => {
    d.scenes[0].duree = 4.5;
    d.scenes.push({ id: 'suite', fichier: 'scenes/02-suite.html', duree: 3, textes: { titre: 'Fin' } });
  });
  assert.equal(controler2(dir).problemes.filter((x) => x.regle === 'temps-mort' && x.scene === 'etincelles').length, 0);
  ecrire(dir, 'scenes/01-etincelles.html', fs.readFileSync(path.join(dir, 'scenes/01-etincelles.html'), 'utf8').replace(/<div data-effet[^>]*><\/div>/, ''));
  assert.equal(controler2(dir).problemes.filter((x) => x.regle === 'temps-mort' && x.scene === 'etincelles').length, 1, 'sans l\'effet, la scène reste immobile');
});

test('contrôles : particules vivantes jusqu\'à la fin de la dernière scène (pause-finale)', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/longue.json', LONGUE);
  ecrire(dir, 'scenes/01-etincelles.html', `<section data-scene="etincelles">
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <div data-effet="longue" data-start="0.8" data-dur="0.1"></div>
</section>`);
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 4; });
  assert.equal(controler2(dir).problemes.filter((x) => x.regle === 'pause-finale').length, 1);
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 5; });
  assert.equal(controler2(dir).problemes.filter((x) => x.regle === 'pause-finale').length, 0);
});
