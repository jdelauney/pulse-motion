'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controlerComplet } = require('../scripts/controler.js');
const { aDesShaders, compilerShadersGPU } = require('../scripts/lib/shaders-gpu.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU } = require('./aide/gpu.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
function projet(code) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes = [{ id: 's', fichier: 'scenes/01-s.html', duree: 3, textes: {} }]; });
  ecrire(dir, 'shaders/essai.json', { version: 1, nom: 'essai', usage: 'fond' });
  ecrire(dir, 'shaders/essai.wgsl', code);
  ecrire(dir, 'scenes/01-s.html', '<section data-scene="s"><div data-shader="essai"></div></section>');
  return dir;
}

test('--gpu : rien à compiler sans shader ni module ; aide de la commande', async () => {
  assert.equal(aDesShaders({ shaders: [], modules: {} }), false);
  assert.equal(aDesShaders({ shaders: [{ usage: 'fond' }], modules: {} }), true);
  assert.equal(aDesShaders({ shaders: [], modules: { spirale: {} } }), true);
  assert.equal(aDesShaders(null), false);
  const r = await compilerShadersGPU({ html: '<html></html>', navigateur: null });
  assert.deepEqual(r.problemes.map((p) => [p.regle, p.gravite]), [['shaders-non-compiles', 'info']]);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'pm.js'), 'utf8'), /controler <dossier> \[--sans-correction\] \[--sans-rendu\] \[--gpu\]/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'controler.js'), 'utf8'), /args\.includes\('--gpu'\)/);
  // Sans shader : aucun problème de shader, même avec --gpu.
  const dir = copierProjet('projet-particules');
  const c = await controlerComplet({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false, corriger: false, rendu: false, gpu: true });
  assert.deepEqual(c.problemes.filter((p) => /^shader/.test(p.regle)), []);
});

test('--gpu : un shader qui ne compile pas devient une erreur située ; un shader juste, rien', async (t) => {
  const options = await optionsWebGPU();
  if (!options) return t.skip('WebGPU indisponible sans fenêtre');
  process.env.PM_OPTIONS_WEBGPU = options.join(' ');
  const casse = await controlerComplet({ dossier: projet('fn image(coord: vec2f) -> vec4f {\n  let x: f32 = vec2f(1.0);\n  return vec4f(x);\n}\n'),
    dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false, corriger: false, rendu: false, gpu: true });
  const e = casse.problemes.find((p) => p.regle === 'shader-ne-compile-pas');
  assert.ok(e, JSON.stringify(casse.problemes));
  assert.equal(e.gravite, 'erreur');
  assert.match(e.message, /Shader « essai » \(shaders\/essai\.wgsl\) ne compile pas : ligne 2, colonne \d+ : /);
  const juste = await controlerComplet({ dossier: projet('fn image(coord: vec2f) -> vec4f { return vec4f(0.5); }\n'),
    dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false, corriger: false, rendu: false, gpu: true });
  assert.deepEqual(juste.problemes.filter((p) => /^shader/.test(p.regle)), []);
});
