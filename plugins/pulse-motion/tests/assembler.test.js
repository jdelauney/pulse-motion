'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assembler, slug } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

test('slug : accents et ponctuation', () => {
  assert.equal(slug('La chaîne du froid !'), 'la-chaine-du-froid');
  assert.equal(slug('***'), 'video');
});

test('projet valide : page autonome écrite dans sortie/', () => {
  const dir = copierProjet('projet-simple');
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'la-chaine-du-froid.html'));
  const html = fs.readFileSync(r.fichier, 'utf8');
  assert.match(html, /<title>La chaîne du froid<\/title>/);
  assert.match(html, /--pm-ratio-l: 16; --pm-ratio-h: 9;/);
  assert.match(html, /--c-primaire: #0a6cff;/, 'couleur du déroulé');
  assert.match(html, /--c-fond: #fafafa;/, 'couleur du style');
  assert.match(html, /@font-face \{ font-family: 'Testfont'; src: url\("data:font\/woff2;base64,/);
  assert.match(html, /--ease-bounce-out: linear\(/);
  assert.match(html, />Pourquoi 4\u202f°C\u202f\?</);
  assert.match(html, />3 minutes &lt;pour&gt; comprendre</);
  assert.match(html, /<img data-logo alt="Logo" data-start="1" src="data:image\/svg\+xml;base64,/);
  assert.match(html, /<img src="data:image\/svg\+xml;base64,/, 'image de la scène');
  assert.match(html, /url\("data:image\/svg\+xml;base64,/, 'image du style');
  assert.doesNotMatch(html, /src="assets\//);
  assert.match(html, /M\.chaqueImage\('chiffre'/);
  assert.match(html, /"rythme":0\.8/);
  assert.match(html, /M\.demarrer\(\);\s*M\.demarrerLecteur\(\);/);
  assert.equal((html.match(/<section /g) || []).length, 2);
});

test('une nouvelle page efface le rapport de débordement de l\'ancienne', () => {
  const dir = copierProjet('projet-simple');
  const rapport = path.join(dir, 'sortie', 'controle-page.json');
  fs.mkdirSync(path.dirname(rapport), { recursive: true });
  fs.writeFileSync(rapport, JSON.stringify({ debordements: [{ scene: 'intro', element: 'titre', message: 'ancien' }] }));
  assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.ok(fs.existsSync(rapport), 'sans écriture de la page, le rapport reste');
  assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(fs.existsSync(rapport), false);
});

test('déroulé invalide : pas de page, erreurs du déroulé', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 0; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.equal(r.erreurs[0].regle, 'deroule-invalide');
  assert.match(r.erreurs[0].message, /scène « intro » : « duree »/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie')), false);
});

test('style inconnu : message avec les styles disponibles', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.style = 'neon'; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.erreurs[0].message, /Style « neon » introuvable\. Styles disponibles : test\./);
});

test('scène en erreur : page produite, panneau d\'erreur à sa place', () => {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes', '02-chiffre.html'));
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'T' }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.map((e) => [e.regle, e.scene]), [['texte-manquant', 'intro'], ['scene-invalide', 'chiffre']]);
  assert.match(r.html, /<section data-scene="chiffre" data-pm-erreur><div class="pm-erreur">Scène « chiffre » : fichier introuvable/);
  assert.match(r.html, /\[texte « sous » manquant\]/);
});

test('police, logo et musique absents : erreurs nommées', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => {
    d.charte.polices = { titres: 'Inconnue', texte: 'assets/absente.woff2' };
    d.charte.logo = 'assets/rien.svg';
    d.musique = { fichier: 'assets/rien.mp3' };
  });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.map((e) => e.regle), ['police-non-embarquee', 'police-non-embarquee', 'fichier-introuvable', 'fichier-introuvable']);
  assert.match(r.erreurs[0].message, /Police « Inconnue » non fournie/);
});

test('logo de type non pris en charge, scène qui est un dossier : erreurs, pas d\'exception', () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'logo.bmp'), 'BM');
  fs.mkdirSync(path.join(dir, 'scenes', 'dossier.html'));
  modifierDeroule(dir, (d) => { d.charte.logo = 'assets/logo.bmp'; d.scenes[1].fichier = 'scenes/dossier.html'; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.map((e) => e.regle), ['fichier-non-pris-en-charge', 'scene-invalide']);
  assert.match(r.erreurs[0].message, /logo\.bmp/);
});

test('musique embarquée et volume transmis au moteur', () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.mp3'), Buffer.from([0xff, 0xfb, 0x90, 0x00]));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.mp3', volume: 0.6 }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.match(r.html, /<script type="text\/plain" id="pm-son-musique">data:audio\/mpeg;base64,/);
  assert.doesNotMatch(r.html, /<audio id="pm-musique"/);
  assert.match(r.html, /"musique":\{"volume":0\.6,"source":"pm-son-musique","partition":null\}/);
});

test('un texte contenant </script> ne casse pas les données', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.titre = 'a</script><b>'; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.match(r.html, /"titre":"a\\u003c\/script>\\u003cb>"/);
});

test('ligne de commande : résumé JSON et code de sortie', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.version = 2; });
  let code = 0, sortie = '';
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'assembler.js'), dir], { encoding: 'utf8' }); } catch (e) {
    code = e.status; sortie = e.stdout;
  }
  assert.equal(code, 1);
  assert.equal(JSON.parse(sortie).ok, false);
});

test('dossier avec espaces et accents, scène enregistrée avec BOM et CRLF', () => {
  const source = copierProjet('projet-simple');
  const dir = path.join(path.dirname(source), `Mes vidéos à moi ${path.basename(source)}`);
  fs.renameSync(source, dir);
  const scene = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(scene, '\uFEFF' + fs.readFileSync(scene, 'utf8').replace(/\n/g, '\r\n'));
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  assert.ok(r.fichier.startsWith(dir));
  assert.doesNotMatch(r.html, /\uFEFF/);
  assert.match(r.html, />Pourquoi 4\u202f°C\u202f\?</);
});

const navigateur = trouverNavigateur();
test('la page assemblée démarre dans le navigateur', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  const dom = await rendreDOM(navigateur, r.fichier);
  assert.match(dom, /<html lang="fr" data-pm-pret="">/);
  assert.match(dom, /<body[^>]*data-vu="1"/, 'script de scène exécuté');
  assert.match(dom, /<div id="pm-bandeau" hidden="">/, 'aucune erreur affichée');
  assert.match(dom, /id="pm-lecteur"/);
});

test('tempo : durée d\'un temps et bpm en variables CSS, tempo dans les données de la page', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.tempo = { bpm: 120, decalage: 0.25 }; });
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.match(html, /--pm-temps: 0\.5s; --pm-bpm: 120;/);
  assert.match(html, /"tempo":\{"bpm":120,"decalage":0\.25\}/);
});

test('revue : aucun fichier du moteur embarqué ne contient « </script » (il fermerait le script de la page)', () => {
  const moteur = path.join(__dirname, '..', 'moteur');
  const fichiers = (dossier) => fs.readdirSync(dossier, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? fichiers(path.join(dossier, e.name)) : [path.join(dossier, e.name)]))
    .filter((f) => f.endsWith('.js'));
  const fautifs = fichiers(moteur).filter((f) => /<\/script/i.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(fautifs, []);
});
