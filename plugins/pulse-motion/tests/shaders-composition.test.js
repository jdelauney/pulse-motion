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

const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

test('composition : post-traitements de deux scènes, transition, chaîne de la vidéo, sRGB', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageMoteur({ fichiers: ['particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'shaders/code.js', 'particules/shaders.js', 'particules/composition.js'], code: `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const sh = new P.Shaders(gpu.device);
const co = new P.Composition(gpu.device, gpu.format, sh);
const canvas = document.createElement('canvas');
canvas.width = 160; canvas.height = 90;
document.body.appendChild(canvas);
const cible = co.cible(canvas);
const L = 160 / 90 * 100;
const E = (o = {}) => Object.assign({ temps: 0, progres: 0, duree: 1, mode: 1, resolution: [L, 100, 160, 90], scene: [L, 100, 160, 90] }, o);
async function photo(dessin) {
  const c = document.createElement('canvas');
  c.width = 80; c.height = 45;
  dessin(c.getContext('2d'));
  return createImageBitmap(c);
}
const rouge = await photo((x) => { x.fillStyle = '#ff0000'; x.fillRect(0, 0, 80, 45); });
const bleuGauche = await photo((x) => { x.fillStyle = '#0000ff'; x.fillRect(0, 0, 40, 45); });
const bleu = await photo((x) => { x.fillStyle = '#0000ff'; x.fillRect(0, 0, 80, 45); });
const compiler = async (usage, code) => (await sh.compiler({ nom: 'essai', fichier: 'shaders/essai.wgsl', usage, code, parametres: {}, valeurs: {}, image: null })).shader;
const inverse = await compiler('post', 'fn post(coord: vec2f) -> vec4f { let c = canal0(coord / iResolution.xy); return vec4f(c.a - c.rgb, c.a); }');
const vert = await compiler('post', 'fn post(coord: vec2f) -> vec4f { let c = canal0(coord / iResolution.xy); return vec4f(0.0, c.g, 0.0, c.a); }');
const moitie = await compiler('transition', 'fn transition(coord: vec2f, progres: f32) -> vec4f { let uv = coord / iResolution.xy; return select(canal0(uv), canal1(uv), uv.x < progres); }');
const melange = await compiler('transition', 'fn transition(coord: vec2f, progres: f32) -> vec4f { let uv = coord / iResolution.xy; return mix(canal0(uv), canal1(uv), progres); }');
const px = (p, x, y) => Array.from(p.donnees.slice((y * p.largeur + x) * 4, (y * p.largeur + x) * 4 + 4));
// 1. Empilement : rouge, puis bleu sur la moitié gauche par-dessus.
co.dessiner(cible, { couches: [{ vue: co.photo('a', rouge), posts: [] }, { vue: co.photo('b', bleuGauche), posts: [] }], transition: null, postsVideo: [] });
const p1 = await co.lirePixels(cible);
// 2. Transition à 25 % : iChannel1 (entrante, bleue) à gauche de 25 %, iChannel0 (sortante, rouge) ailleurs.
co.dessiner(cible, { couches: [{ vue: co.photo('a', rouge), posts: [] }, { vue: co.photo('b', bleu), posts: [] }],
  transition: { shader: moitie, entrees: E({ progres: 0.25 }), sortante: 0, entrante: 1 }, postsVideo: [] });
const p2 = await co.lirePixels(cible);
// 3. Scène rouge, post de scène (inverse : cyan) puis post de la vidéo (vert seul) : vert.
co.dessiner(cible, { couches: [{ vue: co.photo('a', rouge), posts: [{ shader: inverse, entrees: E() }] }], transition: null, postsVideo: [{ shader: vert, entrees: E() }] });
const p3 = await co.lirePixels(cible);
// 4. Première scène : sortante transparente, mélange à 50 % vers le rouge.
co.dessiner(cible, { couches: [{ vue: co.photo('a', rouge), posts: [] }], transition: { shader: melange, entrees: E({ progres: 0.5 }), sortante: -1, entrante: 0 }, postsVideo: [] });
const p4 = await co.lirePixels(cible);
// 5. Deux scènes avec chacune un post-traitement, transition, puis la vidéo : aucune texture de travail épuisée.
co.dessiner(cible, { couches: [{ vue: co.photo('a', rouge), posts: [{ shader: inverse, entrees: E() }] }, { vue: co.photo('b', bleu), posts: [{ shader: inverse, entrees: E() }] }],
  transition: { shader: moitie, entrees: E({ progres: 0.5 }), sortante: 0, entrante: 1 }, postsVideo: [{ shader: vert, entrees: E() }] });
const p5 = await co.lirePixels(cible);
co.oublierPhotos(new Set(['a']));
await envoyer({ webgpu: true, empile: [px(p1, 20, 45), px(p1, 120, 45)], transition: [px(p2, 20, 45), px(p2, 120, 45)], chaine: px(p3, 80, 45),
  premiere: px(p4, 80, 45), deux: [px(p5, 20, 45), px(p5, 120, 45)], photos: Array.from(co.photos.keys()), taille: [p1.largeur, p1.hauteur] });` });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const proche = (a, b, quoi) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= 1, `${quoi} : ${a} au lieu de ${b}`));
  assert.deepEqual(r.taille, [160, 90]);
  proche(r.empile[0], [0, 0, 255, 255], 'bleu par-dessus à gauche'); proche(r.empile[1], [255, 0, 0, 255], 'rouge à droite');
  proche(r.transition[0], [0, 0, 255, 255], 'entrante à gauche de 25 %'); proche(r.transition[1], [255, 0, 0, 255], 'sortante ailleurs');
  proche(r.chaine, [0, 255, 0, 255], 'post de scène puis post de la vidéo');
  proche(r.premiere, [128, 0, 0, 128], 'première scène : depuis le transparent');
  // inverse(bleu) = jaune à gauche (entrante), inverse(rouge) = cyan à droite ; vert seul : vert des deux côtés.
  proche(r.deux[0], [0, 255, 0, 255], 'deux scènes, gauche'); proche(r.deux[1], [0, 255, 0, 255], 'deux scènes, droite');
  assert.deepEqual(r.photos, ['a']);
});
