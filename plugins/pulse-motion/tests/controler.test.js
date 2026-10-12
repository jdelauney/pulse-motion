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
  assert.deepEqual(JSON.parse(fs.readFileSync(r.fichier, 'utf8')), { problemes: [], corrections: [] });
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

test('ton sombre demandé sur un style sans ton sombre : alerte « ton-indisponible »', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.charte.ton = 'sombre'; });
  const r = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const alerte = r.problemes.find((p) => p.regle === 'ton-indisponible');
  assert.ok(alerte, JSON.stringify(r.problemes.map((p) => p.regle)));
  assert.equal(alerte.gravite, 'alerte');
  assert.match(alerte.message, /n'a pas de ton sombre/);
});

test('tempo : une scène qui ne commence pas sur un temps est signalée', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.tempo = { bpm: 120 }; });
  assert.ok(!regles(controler({ dossier: dir, dossierStyles: STYLES })).includes('hors-tempo'));
  modifierDeroule(dir, (d) => { d.tempo = { bpm: 100 }; });
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes.find((x) => x.regle === 'hors-tempo');
  assert.ok(p);
  assert.equal(p.scene, 'chiffre');
  assert.match(p.message, /commence à 3,5 s, entre deux temps \(100 bpm\)/);
});

test('tempo : data-start en temps sans tempo dans le déroulé', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', '<section data-scene="chiffre"><p data-texte="legende" data-start="2t" data-dur="2"></p></section>');
  assert.ok(regles(controler({ dossier: dir, dossierStyles: STYLES })).includes('tempo-absent'));
});

test('texte lettre par lettre : effet inconnu signalé sans navigateur', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', '<section data-scene="chiffre"><p data-texte="legende" data-start="0" data-dur="2" data-lettres="danse"></p><p data-mots="monte" data-start="1"></p></section>');
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes.filter((x) => x.regle === 'lettres-invalide');
  assert.equal(p.length, 1);
  assert.match(p[0].message, /Scène « chiffre » : data-lettres « danse » inconnu \(effets : monte, flou, frappe, onde, chute\)/);
});

test('caméra et temps : syntaxe fautive signalée sans navigateur', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', `<section data-scene="chiffre">
  <div data-camera="travelling 0→1 0+1" data-gel="1+1; 1.5+1"><p data-texte="legende" data-start="0" data-dur="2"></p></div>
  <div data-camera="zoom 1→1.1 0+2" data-vitesse="0+1 x2" data-profondeur="loin"></div>
</section>`);
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes;
  const camera = p.filter((x) => x.regle === 'camera-invalide');
  assert.equal(camera.length, 1);
  assert.match(camera[0].message, /^Scène « chiffre » : data-camera : propriété « travelling » inconnue/);
  assert.equal(p.filter((x) => x.regle === 'temps-invalide').length, 1);
  assert.equal(p.filter((x) => x.regle === 'profondeur-invalide').length, 1);
});

test('assemblage : les modules de mise en scène sont dans la page', () => {
  const dir = copierProjet('projet-simple');
  const { html } = require('../scripts/assembler.js').assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  for (const nom of ['Pulse Motion – caméra', 'Pulse Motion – temps figé', 'Pulse Motion – texte lettre par lettre']) assert.ok(html.includes(nom), nom);
});

test("tempo : la première scène n'est pas jugée, même avec un décalage", () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.tempo = { bpm: 120, decalage: 0.25 }; });
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes.filter((x) => x.regle === 'hors-tempo');
  assert.deepEqual(p.map((x) => x.scene), ['chiffre']);
});

test('caméra posée sur la section : signalée', () => {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', '<section data-scene="chiffre" data-camera="zoom 1→2 0+1"><p data-texte="legende" data-start="0" data-dur="2"></p></section>');
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes.find((x) => x.regle === 'camera-invalide');
  assert.ok(p);
  assert.match(p.message, /data-camera se pose sur un conteneur à l'intérieur de la scène, pas sur la <section>/);
});

test('typographie du déroulé : alerte avec la correction proposée ; majuscule accentuée en plus', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Etape 1 : ranger !'; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  const typo = r.problemes.find((p) => p.regle === 'typographie');
  assert.equal(typo.gravite, 'alerte');
  assert.equal(typo.scene, 'intro');
  assert.equal(typo.element, 'titre');
  assert.deepEqual(typo.correction, { scene: 'intro', texte: 'titre', valeur: 'Etape 1\u00a0: ranger\u202f!' });
  assert.match(typo.message, /Scène « intro », texte « titre » : typographie française/);
  const maj = r.problemes.find((p) => p.regle === 'majuscule-accentuee');
  assert.deepEqual(maj.correction, { scene: 'intro', texte: 'titre', valeur: 'Étape 1\u00a0: ranger\u202f!' });
});

test('mot doublé et terme écrit de deux façons : alertes sans correction ; glossaire respecté', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].textes.sous = 'Lire le le mode e-mail'; d.scenes[1].textes.legende = 'un email'; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  const double = r.problemes.find((p) => p.regle === 'mot-double');
  assert.equal(double.correction, undefined);
  assert.match(double.message, /« le » écrit deux fois.*« Lire le mode e-mail »/);
  const variable = r.problemes.find((p) => p.regle === 'terme-variable');
  assert.match(variable.message, /« e-mail » \(scène « intro »\), « email » \(scène « chiffre »\)/);
  require('../scripts/vocabulaire.js').noterGlossaire({ dossier: dir, terme: 'e-mail', sens: 'courriel', sauvegarde: false });
  assert.equal(controler({ dossier: dir, dossierStyles: STYLES }).problemes.some((p) => p.regle === 'terme-variable'), false);
});

test('texte écrit en dur dans une scène : typographie signalée, jamais corrigée', () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('</section>', '<p>Attention!</p></section>'));
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes.find((x) => x.regle === 'typographie');
  assert.equal(p.correction, undefined);
  assert.match(p.message, /Scène « intro » : texte écrit dans la scène.*« Attention\u202f! »/);
});

const correctionDe = (r, regle) => (r.problemes.find((p) => p.regle === regle) || {}).correction;

test('temps mort en fin de scène : durée raccourcie proposée, sans passer sous le temps de lecture', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 9; });
  assert.deepEqual(correctionDe(controler({ dossier: dir, dossierStyles: STYLES }), 'temps-mort'), { scene: 'intro', duree: 5.5 });
});

test('temps mort au milieu d\'une scène : aucune correction proposée', () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('</section>', '<p data-start="8" data-dur="0.5">fin</p></section>'));
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 9; });
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes.find((x) => x.regle === 'temps-mort');
  assert.ok(p);
  assert.equal(p.correction, undefined);
});

test('lecture : durée allongée au 0,5 s supérieur, dans la limite de +50 %', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 3; });
  assert.deepEqual(correctionDe(controler({ dossier: dir, dossierStyles: STYLES }), 'lecture'), { scene: 'intro', duree: 4 });
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 2; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.ok(r.problemes.some((p) => p.regle === 'lecture'));
  assert.equal(correctionDe(r, 'lecture'), undefined, '4 s dépasse 2 s + 50 %');
});

test('pause finale : dernière scène allongée en tenant compte du rythme', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[1].duree = 2; });
  assert.deepEqual(correctionDe(controler({ dossier: dir, dossierStyles: STYLES }), 'pause-finale'), { scene: 'chiffre', duree: 2.4 });
  modifierDeroule(dir, (d) => { d.scenes[1].duree = 2.4; });
  assert.equal(controler({ dossier: dir, dossierStyles: STYLES }).problemes.some((p) => p.regle === 'pause-finale'), false, '2,4 / 0,8 = 3 s : pause de 0,5 s tout juste');
});

test('plus de 4 animations vives en même temps : alerte trop-d-animations', () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  const cinq = [1, 2, 3, 4, 5].map((k) => `<span data-start="1" data-dur="1">${k}</span>`).join('');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('</section>', `${cinq}</section>`));
  const p = controler({ dossier: dir, dossierStyles: STYLES }).problemes.find((x) => x.regle === 'trop-d-animations');
  assert.ok(p);
  assert.equal(p.scene, 'intro');
  assert.match(p.message, /Scène « intro » : 7 éléments bougent en même temps vers 1 s/);
});

test('projet calé sur un tempo : aucune correction de durée proposée (elle décalerait la musique)', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.tempo = { bpm: 120 }; d.scenes[0].duree = 3; });
  const r = controler({ dossier: dir, dossierStyles: STYLES });
  assert.ok(r.problemes.some((p) => p.regle === 'lecture'));
  assert.equal(r.problemes.some((p) => p.correction && p.correction.duree !== undefined), false);
});

test('controler avec corrections : déroulé corrigé, corrections listées, plus de problème corrigé, controle.json complet', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 9; d.scenes[0].textes.sous = 'Etape : lire'; });
  const r = controler({ dossier: dir, dossierStyles: STYLES, corriger: true });
  assert.deepEqual(r.corrections.map((c) => c.regle), ['typographie', 'majuscule-accentuee', 'temps-mort']);
  assert.equal(r.problemes.some((p) => ['temps-mort', 'typographie', 'majuscule-accentuee'].includes(p.regle)), false, JSON.stringify(r.problemes));
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  assert.equal(d.scenes[0].duree, 5.5);
  assert.equal(d.scenes[0].textes.sous, 'Étape\u00a0: lire');
  assert.deepEqual(JSON.parse(fs.readFileSync(r.fichier, 'utf8')), { problemes: r.problemes, corrections: r.corrections });
});

test('ligne de commande : corrige par défaut ; --sans-correction laisse le déroulé intact', () => {
  // L'exemple livré (styles livrés) : la ligne de commande ne connaît pas le style d'essai « test ».
  const cli = (...a) => require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'controler.js'), ...a], { encoding: 'utf8' });
  const dir = require('./aide/temporaire.js').dossierTemporaire('pm-cli-');
  fs.cpSync(path.join(__dirname, '..', 'exemples', 'chaine-du-froid'), dir, { recursive: true });
  modifierDeroule(dir, (d) => { d.scenes[0].textes.sous = 'Lire : vite'; });
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8');
  const sans = cli(dir, '--sans-correction');
  assert.equal(JSON.parse(sans.stdout).corrections, 0, sans.stdout + sans.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), avant);
  const avec = cli(dir);
  assert.equal(JSON.parse(avec.stdout).corrections, 1, avec.stdout + avec.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8')).scenes[0].textes.sous, 'Lire\u00a0: vite');
});

test('revue : temps mort raccourci au dixième inférieur, l\'alerte disparaît après correction', () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('data-start="#titre:fin+0.2"', 'data-start="#titre:fin+0.25"'));
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 6; });
  const r = controler({ dossier: dir, dossierStyles: STYLES, corriger: true, ecrire: false });
  assert.deepEqual(r.corrections.map((c) => [c.regle, c.apres]), [['temps-mort', 5.5]]);
  assert.equal(r.problemes.some((p) => p.regle === 'temps-mort'), false, JSON.stringify(r.problemes));
});
