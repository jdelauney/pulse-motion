'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/shaders/code.js');
const { calculerMinutage } = require('../moteur/minutage.js');

const MIN = calculerMinutage([
  { id: 'a', duree: 3, transition: { shader: 'ouverture', duree: 0.5 } },
  { id: 'b', duree: 3, transition: { shader: 'dissolution', duree: 1 } },
  { id: 'c', duree: 3, transition: 'fondu' },
], {});
const plan = (t, o = {}) => S.planComposition(Object.assign({ scenes: MIN.scenes, t, transitions: { a: true, b: true }, posts: {}, postsVideo: 0 }, o));

test('planComposition : transition par shader pendant le chevauchement, rien ailleurs', () => {
  // b : de 2 à 5, transition de 2 à 3.
  assert.deepEqual(plan(2.5), { couches: ['a', 'b'], transition: { sortante: 'a', entrante: 'b', progres: 0.5, temps: 0.5, duree: 1 }, postsVideo: 0 });
  assert.equal(plan(1), null, 'scène seule, sans post-traitement');
  assert.equal(plan(3.2), null, 'transition finie');
  assert.equal(plan(4.7), null, 'transition CSS (fondu) : pas de composition');
  assert.equal(plan(2.5, { transitions: { a: true } }), null, 'shader de b non compilé : repli en fondu, pas de composition');
});

test('planComposition : première scène, post-traitements de scène et de la vidéo', () => {
  assert.deepEqual(plan(0.25).transition, { sortante: null, entrante: 'a', progres: 0.5, temps: 0.25, duree: 0.5 });
  assert.deepEqual(plan(0.25).couches, ['a']);
  assert.deepEqual(plan(1, { posts: { a: 1 } }), { couches: ['a'], transition: null, postsVideo: 0 });
  assert.equal(plan(1, { posts: { b: 2 } }), null, 'post-traitement d\'une scène non visible');
  assert.deepEqual(plan(4.7, { postsVideo: 1 }), { couches: ['b', 'c'], transition: null, postsVideo: 1 }, 'transition CSS avec post-traitement de la vidéo : empilement');
  assert.deepEqual(plan(99, { postsVideo: 1 }).couches, ['c'], 'après la fin : dernière scène');
});

const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { trouverNavigateur } = require('../scripts/lib/navigateur.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');

test('mise en page : canvas de composition sous les sous-titres, scènes masquées par pm-compose', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'base.css'), 'utf8');
  assert.match(css, /#pm-scene > \.pm-composition \{ position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999; \}/);
  assert.match(css, /#pm-scene\.pm-compose > section\[data-scene\] \{ opacity: 0 !important; \}/);
});

test('figer : option scene (opacité imposée, transformation de transition gardée) ; M.enLecture', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes = [{ id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} }]; });
  fs.writeFileSync(path.join(dir, 'scenes', 'a.html'), '<section data-scene="a"><div style="position:absolute;inset:0;background:#ff0000"></div></section>');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const html = a.html.replace('<head>', '<head><script>window.__PM_SANS_GPU__ = true;</script>');
  const r = await mesurerPage({ html, navigateur: trouverNavigateur(), script: `
    var s = document.querySelector('section[data-scene="a"]');
    document.getElementById('pm-scene').classList.add('pm-compose');
    var sans = await M.figer.photo(s, { largeur: 40, hauteur: 20 });
    var avec = await M.figer.photo(s, { largeur: 40, hauteur: 20, scene: { opacite: 1 } });
    var demi = await M.figer.photo(s, { largeur: 40, hauteur: 20, scene: { opacite: 0.5 } });
    s.style.transform = 'translateX(50%)';
    var decale = await M.figer.photo(s, { largeur: 40, hauteur: 20, scene: { opacite: 1 } });
    var px = function (p, x, y) { return Array.prototype.slice.call(p.rgba, (y * 40 + x) * 4, (y * 40 + x) * 4 + 4); };
    return { sans: px(sans, 10, 10), avec: px(avec, 10, 10), demi: px(demi, 10, 10), decaleG: px(decale, 10, 10), decaleD: px(decale, 30, 10), lecture: M.enLecture() };` });
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.resultat.sans[3], 0, 'sans l\'option : la scène masquée est photographiée transparente');
  assert.deepEqual(r.resultat.avec, [255, 0, 0, 255]);
  assert.ok(Math.abs(r.resultat.demi[3] - 128) <= 2, `opacité de transition : ${r.resultat.demi}`);
  assert.equal(r.resultat.decaleG[3], 0, 'translateX(50 %) : moitié gauche vide');
  assert.deepEqual(r.resultat.decaleD, [255, 0, 0, 255]);
  assert.equal(r.resultat.lecture, false);
});
