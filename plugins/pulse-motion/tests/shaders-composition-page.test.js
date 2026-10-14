'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const CAPTURE = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'capture.js'), 'utf8');
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const SHADERS = {
  moitie: ['transition', 'fn transition(coord: vec2f, progres: f32) -> vec4f {\n  let uv = coord / iResolution.xy;\n  return select(canal0(uv), canal1(uv), uv.x < progres);\n}\n'],
  inverse: ['post', 'fn post(coord: vec2f) -> vec4f {\n  let c = canal0(coord / iResolution.xy);\n  return vec4f(c.a - c.rgb, c.a);\n}\n'],
  vert: ['post', 'fn post(coord: vec2f) -> vec4f {\n  let c = canal0(coord / iResolution.xy);\n  return vec4f(0.0, c.g, 0.0, c.a);\n}\n'],
  'casse-t': ['transition', 'fn transition(coord: vec2f, progres: f32) -> vec4f {\n  let x: f32 = vec2f(1.0);\n  return vec4f(x);\n}\n'],
};
const OUTILS = `
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
const px = (p, x, y) => Array.from(p.donnees.slice((y * p.largeur + x) * 4, (y * p.largeur + x) * 4 + 4));
const milieu = (p, fx) => px(p, Math.floor(p.largeur * fx), p.hauteur >> 1);
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
`;

/** Deux scènes de 3 s : a (rouge), b (bleue) qui entre par « transition » ; deroule(d) complète le déroulé. */
function pageComposition({ deroule = () => {}, script }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} },
      { id: 'b', fichier: 'scenes/b.html', duree: 3, textes: {}, transition: { shader: 'moitie', duree: 1 } },
    ];
    deroule(d);
  });
  for (const [nom, [usage, code]] of Object.entries(SHADERS)) { ecrire(dir, `shaders/${nom}.json`, { version: 1, nom, usage }); ecrire(dir, `shaders/${nom}.wgsl`, code); }
  ecrire(dir, 'scenes/a.html', '<section data-scene="a"><div style="position:absolute;inset:0;background:#ff0000"></div></section>');
  ecrire(dir, 'scenes/b.html', '<section data-scene="b"><div style="position:absolute;inset:0;background:#0000ff"></div></section>');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  return a.html.replace('<head>', `<head><script>${CAPTURE.replace(/<\/script/gi, '<\\/script')}</script>`).replace('</body>', `<script>
(async () => {
${OUTILS}
try {
  await M.pret;
  await M.particules.pret;
  if (!M.particules.disponible) { await envoyer({ webgpu: false }); return; }
${script}
} catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}
async function page(o) {
  const r = JSON.parse(await executerPage(pageComposition(o)));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const proche = (a, b, quoi, tol = 1) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `${quoi} : ${a} au lieu de ${b}`));

test('composition : transition à mi-parcours (gauche : B, droite : A), scènes réelles masquées, puis plus rien', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ script: `
M.modeCapture(true);
await M.seek(2.5);
const p = await M.shaders.lireComposition();
const scene = document.getElementById('pm-scene');
const b = document.querySelector('section[data-scene="b"]');
const canvas = document.querySelector('#pm-scene > canvas.pm-composition');
const pendant = { gauche: milieu(p, 0.25), droite: milieu(p, 0.75), compose: scene.classList.contains('pm-compose'), affiche: getComputedStyle(canvas).display,
  opaciteB: getComputedStyle(b).opacity, styleB: b.style.opacity, type: M.typeTransition(M.minutage.scenes[1]), photos: M.shaders.composition().photos };
await M.seek(4);
await envoyer({ webgpu: true, pendant, apres: { compose: scene.classList.contains('pm-compose'), affiche: getComputedStyle(canvas).display } });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  proche(r.pendant.gauche, [0, 0, 255, 255], 'scène entrante à gauche');
  proche(r.pendant.droite, [255, 0, 0, 255], 'scène sortante à droite');
  assert.equal(r.pendant.compose, true);
  assert.equal(r.pendant.affiche, 'block');
  assert.equal(r.pendant.opaciteB, '0', 'scène réelle présente mais invisible');
  assert.equal(r.pendant.styleB, '', 'pas de style CSS d\'entrée sous une transition par shader');
  assert.equal(r.pendant.type, 'aucune');
  assert.deepEqual(r.pendant.photos.map((x) => [x.scene, x.t, x.exact]), [['a', 2.5, true], ['b', 2.5, true]], 'photographies exactes à l\'export');
  assert.deepEqual(r.apres, { compose: false, affiche: 'none' });
});

test('composition : post-traitement de scène puis de la vidéo', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({
    deroule: (d) => { d.scenes[0].post = [{ shader: 'inverse' }]; d.post = [{ shader: 'vert' }]; },
    script: `
M.modeCapture(true);
await M.seek(1);
const p = await M.shaders.lireComposition();
await envoyer({ webgpu: true, centre: milieu(p, 0.5) });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  // Rouge -> inverse (scène) : cyan -> vert seul (vidéo) : vert. Dans l'autre ordre : blanc.
  proche(r.centre, [0, 255, 0, 255], 'ordre scène puis vidéo');
});

test('composition : export exact, même image par deux chemins, capture rapide du canvas de composition', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ script: `
M.modeCapture(true);
await M.seek(2.5);
const a = (await M.shaders.lireComposition()).donnees.slice();
await M.seek(0.3);
await M.seek(2.7);
await M.seek(2.5);
const b = (await M.shaders.lireComposition()).donnees.slice();
let ecart = 0;
for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
const scene = document.getElementById('pm-scene');
const c = document.createElement('canvas');
c.width = scene.clientWidth; c.height = scene.clientHeight;
const ctx = c.getContext('2d');
await M.capturer(ctx, c.width, c.height);
const d = ctx.getImageData(0, 0, c.width, c.height);
const cap = (fx) => Array.from(d.data.slice((Math.floor(c.height / 2) * c.width + Math.floor(c.width * fx)) * 4, (Math.floor(c.height / 2) * c.width + Math.floor(c.width * fx)) * 4 + 4));
await envoyer({ webgpu: true, ecart, capG: cap(0.25), capD: cap(0.75) });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.ecart, 0, 'même image par deux chemins');
  proche(r.capG, [0, 0, 255, 255], 'capture rapide : moitié gauche de B', 2);
  proche(r.capD, [255, 0, 0, 255], 'capture rapide : moitié droite de A', 2);
});

test('composition : transition qui ne compile pas : fondu, panneau, export refusé', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({
    deroule: (d) => { d.scenes[1].transition = { shader: 'casse-t', duree: 1 }; },
    script: `
await M.seek(2.5);
const b = document.querySelector('section[data-scene="b"]');
const p = b.querySelector(':scope > .pm-effet-panneau');
let refus = null;
try { await M.particules.verifierExport(); } catch (e) { refus = e.message; }
await envoyer({ webgpu: true, opacite: b.style.opacity, compose: document.getElementById('pm-scene').classList.contains('pm-compose'), panneau: p && p.textContent, refus,
  pret: M.transitionShader('b') });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(Math.abs(Number(r.opacite) - 0.5) < 0.01, `fondu de repli : ${r.opacite}`);
  assert.equal(r.compose, false);
  assert.equal(r.pret, false);
  assert.match(r.panneau, /^Transition remplacée par un fondu : Shader « casse-t » \(shaders\/casse-t\.wgsl\) ne compile pas : ligne 2/);
  assert.match(r.refus, /^Export refusé : Shader « casse-t »/);
});

test('composition : aperçu en demi-résolution, 10 photographies par seconde au plus en lecture, à chaque image à l\'arrêt', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ script: `
await M.seek(2.5);
const apercu = M.shaders.composition().photos.map((x) => x.exact);
M.enLecture = () => true;
const n0 = M.shaders.composition().faites;
for (let i = 0; i < 12; i++) { M.rendre(2.2 + i * 0.02); await attendre(30); }
await attendre(600);
const n1 = M.shaders.composition().faites;
M.enLecture = () => false;
M.rendre(2.71);
await attendre(600);
await envoyer({ webgpu: true, apercu, enLecture: n1 - n0, arret: M.shaders.composition().photos.map((x) => x.t) });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.apercu, [false, false], 'demi-résolution hors export');
  assert.ok(r.enLecture >= 1 && r.enLecture <= 5, `${r.enLecture} photographies pour 12 images en 360 ms (une toutes les 100 ms au plus)`);
  assert.deepEqual(r.arret, [2.71, 2.71], 'à l\'arrêt : photographies de l\'instant affiché');
});

test('composition : en lecture, photographie en retard : fondu CSS d\'attente, jamais la scène entrante opaque sans la composition', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({ script: `
const photo = M.figer.photo;
M.figer.photo = async (...a) => { await attendre(250); return photo(...a); };
M.enLecture = () => true;
const scene = document.getElementById('pm-scene');
const b = document.querySelector('section[data-scene="b"]');
const images = [];
for (let i = 0; i < 25; i++) {
  const t = 1.9 + i * 0.04;
  M.rendre(t);
  images.push({ t, compose: scene.classList.contains('pm-compose'), opaciteB: Number(getComputedStyle(b).opacity), affichee: getComputedStyle(b).display !== 'none' });
  await attendre(40);
}
M.figer.photo = photo;
await envoyer({ webgpu: true, images });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const pendant = r.images.filter((x) => x.t >= 2 && x.t < 3);
  const coupes = pendant.filter((x) => x.affichee && !x.compose && x.opaciteB > 0.99);
  assert.deepEqual(coupes, [], 'aucune image de la transition avec B opaque hors composition');
  assert.ok(pendant.some((x) => !x.compose && x.opaciteB > 0 && x.opaciteB < 1), 'fondu CSS en attendant la photographie');
  assert.ok(pendant.some((x) => x.compose), 'la composition prend le relais');
});
