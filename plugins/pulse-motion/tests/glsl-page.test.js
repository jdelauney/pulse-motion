'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');
const { compilerShadersGPU } = require('../scripts/lib/shaders-gpu.js');
const { notes, wavMono } = require('./aide/signaux.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' || Buffer.isBuffer(contenu) ? contenu : JSON.stringify(contenu));
};
const glsl = (nom, usage, code, extra = {}) => [{ version: 1, nom, usage, langage: 'glsl', ...extra }, code];
const SHADERS = {
  'degrade-st': glsl('degrade-st', 'fond', 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 uv = fragCoord / iResolution.xy;\n  fragColor = vec4(uv.x, R_vert, 0.0, 1.0);\n}\n', { parametres: { vert: { defaut: 0.5, min: 0, max: 1 } } }),
  'haut-rouge': glsl('haut-rouge', 'fond', 'void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(step(0.5, p.y / iResolution.y), 0.0, 0.0, 1.0);\n}\n'),
  teinte: glsl('teinte', 'fond', 'void mainImage(out vec4 c, in vec2 p) {\n  c = R_couleur;\n}\n', { parametres: { couleur: { defaut: '#3366cc', type: 'couleur' } } }),
  casse: glsl('casse', 'fond', 'void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(inconnu, 1.0);\n}\n'),
  entrante: glsl('entrante', 'transition', 'void mainImage(out vec4 c, in vec2 p) {\n  c = texture(iChannel1, p / iResolution.xy);\n}\n'),
  inverse: glsl('inverse', 'post', 'void mainImage(out vec4 c, in vec2 p) {\n  vec4 s = texture(iChannel0, p / iResolution.xy);\n  c = vec4(1.0 - s.rgb, 1.0);\n}\n'),
  'basses-st': glsl('basses-st', 'fond', 'void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(iSon.basses, texture(iChannel3, vec2(0.15, 0.25)).r, 0.0, 1.0);\n}\n'),
};
const OUTILS = `
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
const px = (p, x, y) => Array.from(p.donnees.slice((y * p.largeur + x) * 4, (y * p.largeur + x) * 4 + 4));
`;

function page({ scenes, deroule, script, musique }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes = deroule || [{ id: 'a', fichier: 'scenes/a.html', duree: 4, textes: {} }]; if (musique) d.musique = { fichier: 'assets/m.wav' }; });
  for (const [nom, [json, code]] of Object.entries(SHADERS)) { ecrire(dir, `shaders/${nom}.json`, json); ecrire(dir, `shaders/${nom}.glsl`, code); }
  if (musique) ecrire(dir, 'assets/m.wav', musique);
  for (const [id, html] of Object.entries(scenes)) ecrire(dir, `scenes/${id}.html`, html);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  return { html: a.html.replace('</body>', `<script>
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
</body>`), assemblage: a };
}
async function executer(o) {
  const r = JSON.parse(await executerPage(page(o).html));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const proche = (a, b, tol, quoi) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `${quoi} : ${a} au lieu de ${b}`));

test('GLSL : un shader Shadertoy simple compile et dessine un fond, réglage compris ; orientation y vers le haut', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ scenes: { a: '<section data-scene="a"><div data-shader="degrade-st"></div><div data-shader="haut-rouge" data-calque="avant"></div></section>' }, script: `
await M.seek(1);
const p = await M.particules.lirePixels('a', 'arriere');
const q = await M.particules.lirePixels('a', 'avant');
await envoyer({ gauche: px(p, 4, p.hauteur >> 1), droite: px(p, p.largeur - 5, p.hauteur >> 1), haut: px(q, q.largeur >> 1, 4), bas: px(q, q.largeur >> 1, q.hauteur - 5), erreurs: M.shaders.erreurs() });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.erreurs, []);
  assert.ok(r.gauche[0] < 20 && r.droite[0] > 235, `dégradé de gauche à droite : ${r.gauche} → ${r.droite}`);
  proche([r.gauche[1]], [128], 3, 'réglage R_vert = 0,5 (sRGB) rendu tel quel');
  assert.ok(r.haut[0] > 235 && r.bas[0] < 20, `rouge en haut (y vers le haut) : ${r.haut} / ${r.bas}`);
});

test('GLSL : réglage couleur en sRGB', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ scenes: { a: '<section data-scene="a"><div data-shader="teinte" data-reglages="couleur: #ff8000"></div></section>' }, script: `
await M.seek(1); const p = await M.particules.lirePixels('a', 'arriere'); await envoyer({ c: px(p, p.largeur >> 1, p.hauteur >> 1) });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  proche(r.c, [255, 128, 0, 255], 2, '#ff8000');
});

test('GLSL : erreur à la ligne 2 -> panneau, M.shaders.erreurs, export refusé ; controler --gpu', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const o = { scenes: { a: '<section data-scene="a"><div data-shader="casse"></div></section>' }, script: `
await M.seek(1);
const panneau = document.querySelector('[data-shader] .pm-effet-panneau');
let refus = null;
M.modeCapture(true);
try { await M.particules.preparerCapture(); } catch (e) { refus = e.message; }
M.modeCapture(false);
await envoyer({ panneau: panneau && panneau.textContent, erreurs: M.shaders.erreurs(), refus });` };
  const r = await executer(o);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.match(r.panneau, /Fond non affiché : Shader « casse » \(shaders\/casse\.glsl\) ne compile pas : ligne 2 : /);
  assert.equal(r.erreurs.length, 1);
  assert.equal(r.erreurs[0].erreurs[0].ligne, 2);
  assert.match(r.refus, /ne compile pas/);
  const gpu = await compilerShadersGPU({ html: page(o).assemblage.html });
  if (gpu.verifie) {
    assert.equal(gpu.problemes[0].regle, 'shader-ne-compile-pas');
    assert.match(gpu.problemes[0].message, /ligne 2/);
  }
});

test('GLSL : transition (iChannel1 = scène qui entre) et post-traitement (iChannel0 = scène)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({
    deroule: [{ id: 'a', fichier: 'scenes/a.html', duree: 2, textes: {} },
      { id: 'b', fichier: 'scenes/b.html', duree: 2, textes: {}, transition: { shader: 'entrante', duree: 1 }, post: [{ shader: 'inverse' }] }],
    scenes: { a: '<section data-scene="a" style="background:#ff0000"></section>', b: '<section data-scene="b" style="background:#0000ff"></section>' },
    script: `
await M.seek(2.5); const transition = px(await M.shaders.lireComposition(), 20, 20);
await M.seek(3.5); const post = px(await M.shaders.lireComposition(), 20, 20);
await envoyer({ transition, post, erreurs: M.shaders.erreurs() });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.erreurs, []);
  proche(r.transition, [255, 255, 0, 255], 3, 'transition : scène b (bleue) inversée par son post-traitement');
  proche(r.post, [255, 255, 0, 255], 3, 'post-traitement : bleu inversé en jaune');
});

test('GLSL : iSon et la texture du son (iChannel3) suivent la musique', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ musique: wavMono(notes({ plages: [{ debut: 0, fin: 1, frequence: 80 }] })),
    scenes: { a: '<section data-scene="a"><div data-shader="basses-st"></div></section>' }, script: `
await M.seek(0.5); const note = await M.particules.lirePixels('a', 'arriere');
await M.seek(2); const silence = await M.particules.lirePixels('a', 'arriere');
await envoyer({ note: px(note, note.largeur >> 1, note.hauteur >> 1), silence: px(silence, silence.largeur >> 1, silence.hauteur >> 1) });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.note[0] > 200 && r.note[1] > 100, `note : ${r.note}`);
  assert.ok(r.silence[0] < 30 && r.silence[1] < 30, `silence : ${r.silence}`);
});
