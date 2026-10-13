'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { preparerObstacles, obstaclesVideo } = require('../scripts/lib/obstacles.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');

const donneesDe = (html) => JSON.parse(/<script type="application\/json" id="pm-donnees">([^<]*)<\/script>/.exec(html)[1]);
const assembler2 = (dir) => assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};

test('scène : balises annotées dans l\'ordre du document, index global', () => {
  const r = preparerObstacles(`<section data-scene="s">
  <h1 id="titre" data-texte="titre" data-obstacle="forme"></h1>
  <div class="barre" data-obstacle/>
  <div data-obstacle-forme="ligne" data-de="10 80" data-a="60 95"></div>
  <img src="assets/x.png" data-obstacle="video">
</section>`, { scene: 's', premierIndex: 4 });
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.obstacles, [
    { scene: 's', genre: 'forme', video: false },
    { scene: 's', genre: 'element', video: false },
    { scene: 's', genre: 'ligne', video: false, de: [10, 80], a: [60, 95] },
    { scene: 's', genre: 'element', video: true },
  ]);
  assert.match(r.html, /<h1 id="titre" data-texte="titre" data-obstacle="forme" data-pm-obstacle="4">/);
  assert.match(r.html, /<div class="barre" data-obstacle data-pm-obstacle="5" \/>/);
  assert.match(r.html, /data-a="60 95" data-pm-obstacle="6">/);
  assert.match(r.html, /<img src="assets\/x\.png" data-obstacle="video" data-pm-obstacle="7">/);
});

test('scène : déclarations fautives signalées, page produite', () => {
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <h1 id="titre" data-texte="titre" data-obstacle="formes"></h1>
  <div data-obstacle-forme="ligne" data-de="10 80"></div>
  <div id="boite" data-obstacle></div>
</section>`);
  const r = assembler2(dir);
  assert.equal(r.ok, true);
  const fautes = r.erreurs.filter((e) => e.regle === 'obstacle-introuvable');
  assert.equal(fautes.length, 2);
  assert.deepEqual(fautes.map((e) => [e.gravite, e.scene, e.element]), [['erreur', 's', 'titre'], ['erreur', 's', undefined]]);
  assert.match(fautes[0].message, /^Scène « s » : data-obstacle « formes » : valeurs possibles/);
  assert.match(r.html, /data-obstacle="formes" data-pm-obstacle-erreur="data-obstacle « formes »/);
  const d = donneesDe(r.html);
  assert.deepEqual(d.obstacles, [{ scene: 's', genre: 'element', video: false }]);
  assert.match(r.html, /<div id="boite" data-obstacle data-pm-obstacle="0">/);
  assert.deepEqual(d.obstaclesVideo, []);
  const c = controler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.equal(c.problemes.filter((p) => p.regle === 'obstacle-introuvable').length, 2);
});

test('scène : au-delà de 16 obstacles, alerte et les 16 premiers gardés', () => {
  const balises = Array.from({ length: 18 }, (_, i) => `<div id="o${i}" data-obstacle></div>`).join('\n');
  const r = preparerObstacles(`<section data-scene="s">\n${balises}\n</section>`, { scene: 's', premierIndex: 0 });
  assert.equal(r.obstacles.length, 16);
  assert.deepEqual(r.erreurs.map((e) => [e.regle, e.gravite]), [['trop-d-obstacles', 'alerte']]);
  assert.match(r.erreurs[0].message, /18 obstacles déclarés ; seuls les 16 premiers \(ordre du document\) comptent/);
  assert.match(r.html, /id="o15" data-obstacle data-pm-obstacle="15">/);
  assert.match(r.html, /<div id="o16" data-obstacle><\/div>/);
});

test('déroulé : obstacles de la vidéo dans la page, erreurs non bloquantes', () => {
  assert.deepEqual(obstaclesVideo({}), { obstacles: [], erreurs: [] });
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.obstacles = [{ type: 'sol', a: 92 }, { type: 'ligne', de: [0, 80] }, ...Array.from({ length: 8 }, (_, i) => ({ type: 'sol', a: 80 + i }))];
  });
  const r = assembler2(dir);
  assert.equal(r.ok, true);
  const d = donneesDe(r.html);
  assert.equal(d.obstaclesVideo.length, 8);
  assert.deepEqual(d.obstaclesVideo[0], { type: 'sol', a: 92 });
  const video = r.erreurs.filter((e) => e.regle === 'obstacles-video');
  assert.deepEqual(video.map((e) => e.message), ['Déroulé : « obstacles[1] » : ligne : « de » et « a » = [x, y] en cqh.']);
  assert.equal(video[0].gravite, 'erreur');
  const trop = r.erreurs.filter((e) => e.regle === 'trop-d-obstacles');
  assert.deepEqual(trop.map((e) => e.gravite), ['alerte']);
  assert.match(trop[0].message, /Déroulé : 9 obstacles de vidéo ; seuls les 8 premiers comptent/);
});

test('contrôles : collisions invalides dans une recette du projet', () => {
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'effets/rebond.json', { version: 1, nom: 'rebond', emetteurs: [{ nom: 'e', naissance: { salves: [{ t: 0, nombre: 5 }] }, collisions: { reponse: 'coller' } }] });
  ecrire(dir, 'scenes/01-s.html', '<section data-scene="s"><h1 data-texte="titre"></h1><div data-effet="rebond"></div></section>');
  const c = controler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const p = c.problemes.filter((x) => x.regle === 'collisions-invalides');
  assert.equal(p.length, 1);
  assert.equal(p[0].gravite, 'erreur');
  assert.match(p[0].message, /emetteurs\[e\]\.collisions\.reponse : « coller » inconnu/);
});

test('page : les formes invisibles ne s\'affichent pas', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'base.css'), 'utf8');
  assert.match(css, /\[data-obstacle-forme\] \{ display: none; \}/);
});
