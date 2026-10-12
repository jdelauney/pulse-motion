'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { controler, contraste, compterMots, trous } = require('../scripts/controler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const regles = (r) => r.problemes.map((p) => p.regle);
const ecrireScene = (dir, nom, html) => fs.writeFileSync(path.join(dir, 'scenes', nom), html);

test('outils : contraste WCAG, mots, trous', () => {
  assert.ok(Math.abs(contraste('#000000', '#ffffff') - 21) < 1e-9);
  assert.ok(Math.abs(contraste('#777777', '#ffffff') - 4.48) < 0.01);
  assert.equal(compterMots("Pourquoi 4 °C ? L'hygiène, c'est la chaîne du froid"), 9);
  assert.deepEqual(trous(0, 10, [[1, 3], [2, 4], [6, 7]]), [[0, 1], [4, 6], [7, 10]]);
});

test('projet d\'exemple : aucun problème, controle.json écrit', () => {
  const dir = copierProjet('projet-simple');
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(r.problemes, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(r.fichier, 'utf8')), []);
});

test('temps mort au milieu d\'une scène', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 9; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  const p = r.problemes.find((x) => x.regle === 'temps-mort');
  assert.ok(p, JSON.stringify(r.problemes));
  assert.equal(p.scene, 'intro');
  assert.match(p.message, /rien ne bouge pendant 6 s \(de 2,5 s à 8,5 s\)/);
});

test('pause finale trop courte', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[1].duree = 2; d.scenes[1].rythme = 1; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  const p = r.problemes.find((x) => x.regle === 'pause-finale');
  assert.ok(p, JSON.stringify(r.problemes));
  assert.match(p.message, /0 s après le dernier mouvement/);
});

test('scène trop courte pour lire son texte', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].textes.sous = 'trois minutes pour bien comprendre pourquoi la température compte autant'; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  const p = r.problemes.find((x) => x.regle === 'lecture');
  assert.ok(p);
  assert.match(p.message, /Scène « intro » : 13 mots à lire en 4 s ; prévoir au moins 5,4 s\./);
});

test('texte trop petit et effets non exportables', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', `<section data-scene="chiffre">
  <style>@scope { .note { font-size: 2cqh; mix-blend-mode: multiply; } .b { backdrop-filter: blur(2px); filter: url(#bruit); } }</style>
  <p class="note" data-texte="legende" data-dur="2.5"></p>
</section>`);
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(regles(r).filter((x) => x !== 'temps-mort').sort(), ['effet-export', 'effet-export', 'effet-export', 'texte-petit']);
  assert.match(r.problemes.find((x) => x.regle === 'texte-petit').message, /texte de 2 cqh/);
});

test('les commentaires CSS ne déclenchent pas d\'alerte', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', `<section data-scene="chiffre">
  <style>/* éviter mix-blend-mode, backdrop-filter et filter: url(#x) ; pas de font-size: 1cqh */ p { color: red; }</style>
  <p data-texte="legende" data-dur="2.5"></p>
</section>`);
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(regles(r).filter((x) => x !== 'temps-mort'), []);
});

test('texte trop petit écrit avec la propriété raccourcie font:', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', `<section data-scene="chiffre">
  <style>@scope { .note { font: 400 1.5cqh/1.2 var(--f-texte); } }</style>
  <p class="note" data-texte="legende" data-dur="2.5"></p>
</section>`);
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.match(r.problemes.find((x) => x.regle === 'texte-petit').message, /texte de 1,5 cqh/);
});

test('police écrite en dur dans une scène : non embarquée', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', `<section data-scene="chiffre">
  <style>@scope { .a { font-family: "Poppins", sans-serif; } .b { font: 700 5cqh/1 'Lobster'; } .c { font-family: var(--f-titres); } .d { font-family: inherit; } }</style>
  <p class="a" data-texte="legende" data-dur="2.5"></p>
</section>`);
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  const polices = r.problemes.filter((x) => x.regle === 'police-non-embarquee');
  assert.equal(polices.length, 2, JSON.stringify(polices));
  assert.equal(polices[0].gravite, 'erreur');
  assert.match(polices[0].message, /« "Poppins", sans-serif »/);
});

test('effets interdits dans un attribut style ou filter : signalés', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', `<section data-scene="chiffre">
  <div style="mix-blend-mode: multiply" data-texte="legende" data-dur="2.5"></div>
  <svg><g filter="url(#ombre)"></g></svg>
</section>`);
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(regles(r).filter((x) => x === 'effet-export').length, 2, JSON.stringify(r.problemes));
});

test('contraste de l\'accent (étiquettes) contrôlé', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.charte.couleurs = { accent: '#ffd000', fond: '#ffffff' }; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.match(r.problemes.find((x) => x.regle === 'contraste').message, /les étiquettes \(#ffd000\)/);
});

test('contraste insuffisant de la charte', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.charte.couleurs = { primaire: '#dddddd', texte: '#999999', fond: '#ffffff' }; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(regles(r), ['contraste', 'contraste']);
  assert.match(r.problemes[0].message, /le texte \(#999999\) sur le fond \(#ffffff\) n'a qu'un contraste de 2,8:1/);
});

test('références de minutage et erreurs d\'assemblage reprises', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', '<section data-scene="chiffre"><p data-texte="legende" data-start="#rien+1" data-dur="2.5"></p><p data-texte="absent"></p></section>');
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.ok(regles(r).includes('texte-manquant'));
  const ref = r.problemes.find((x) => x.regle === 'reference-inconnue');
  assert.equal(ref.gravite, 'erreur');
  assert.equal(ref.scene, 'chiffre');
});

test('rapport de débordement de la page fusionné', () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'sortie'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sortie', 'controle-page.json'), JSON.stringify({
    debordements: [{ scene: 'intro', element: 'titre', message: 'Scène « intro » : « titre » déborde de son cadre.' }],
  }));
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(r.problemes, [{ regle: 'debordement', gravite: 'erreur', scene: 'intro', element: 'titre', message: 'Scène « intro » : « titre » déborde de son cadre.' }]);
});

test('déroulé invalide : seules les erreurs du déroulé', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.version = 3; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(regles(r), ['deroule-invalide']);
});

test('ligne de commande : résumé et code de sortie 1 en cas d\'erreur', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.version = 3; });
  let code = 0, sortie = '';
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'controler.js'), dir], { encoding: 'utf8' }); } catch (e) {
    code = e.status; sortie = e.stdout;
  }
  assert.equal(code, 1);
  assert.equal(JSON.parse(sortie).erreurs, 1);
});

test('première scène en coupe : pas d\'entrée de 0,5 s comptée comme mouvement (comme « aucune »)', () => {
  const avec = (transition) => {
    const dir = copierProjet('projet-simple');
    fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), '<section data-scene="intro"><h1 data-texte="titre" data-start="2.8" data-dur="1"></h1><p data-texte="sous" data-start="2.8" data-dur="1"></p><span data-start="2.8" data-dur="6.2" data-tween="--x 0cqh→1cqh linear"></span></section>');
    modifierDeroule(dir, (d) => { d.scenes[0].transition = transition; d.scenes[0].duree = 9; });
    return controler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).problemes.filter((p) => p.regle === 'temps-mort' && p.scene === 'intro').length;
  };
  assert.equal(avec('aucune'), 1);
  assert.equal(avec('coupe'), 1);
});
