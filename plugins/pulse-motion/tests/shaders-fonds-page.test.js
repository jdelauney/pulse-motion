'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const SHADERS = {
  aplat: [{ version: 1, nom: 'aplat', usage: 'fond', parametres: { teinte: { defaut: '#ff0000', type: 'couleur' }, opacite: { defaut: 1, min: 0, max: 1 } } },
    'fn image(coord: vec2f) -> vec4f {\n  return vec4f(R.teinte.rgb, 1.0) * R.opacite;\n}\n'],
  plein: [{ version: 1, nom: 'plein', usage: 'fond' },
    'fn image(coord: vec2f) -> vec4f {\n  let dedans = coord.x >= 0.0 && coord.y >= 0.0 && coord.x <= iResolution.x && coord.y <= iResolution.y;\n  return select(vec4f(0.0), vec4f(1.0), dedans);\n}\n'],
  nuage: [{ version: 1, nom: 'nuage', usage: 'fond' },
    'fn image(coord: vec2f) -> vec4f {\n  let n = 0.5 + 0.5 * fbm(vec3f(coord * 0.08, iTime * 0.7));\n  return vec4f(n, n * n, 1.0 - n, 1.0);\n}\n'],
  casse: [{ version: 1, nom: 'casse', usage: 'fond' },
    'fn image(coord: vec2f) -> vec4f {\n  let x: f32 = vec2f(1.0);\n  return vec4f(x);\n}\n'],
};
const OUTILS = `
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
const px = (p, x, y) => Array.from(p.donnees.slice((y * p.largeur + x) * 4, (y * p.largeur + x) * 4 + 4));
function boiteAlpha(p) {
  let x0 = Infinity;
  let x1 = -1;
  for (let y = 0; y < p.hauteur; y++) for (let x = 0; x < p.largeur; x++) if (p.donnees[(y * p.largeur + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return [x0, x1];
}
`;

/** Page assemblée d'une scène « a » de 6 s ; script : corps asynchrone (GPU prêt) qui appelle envoyer(objet). */
function pageShaders({ scene, script, avant = '' }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes = [{ id: 'a', fichier: 'scenes/a.html', duree: 6, textes: {} }]; });
  for (const [nom, [json, code]] of Object.entries(SHADERS)) { ecrire(dir, `shaders/${nom}.json`, json); ecrire(dir, `shaders/${nom}.wgsl`, code); }
  ecrire(dir, 'scenes/a.html', scene);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  return a.html.replace('<head>', `<head>${avant}`).replace('</body>', `<script>
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
  const r = JSON.parse(await executerPage(pageShaders(o)));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const proche = (a, b, tol, quoi) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `${quoi} : ${a} au lieu de ${b}`));

test('fond : plein cadre dans le calque arrière, couleurs exactes, fenêtre minutée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({
    scene: '<section data-scene="a"><div data-shader="aplat" data-start="1" data-dur="2"></div></section>',
    script: `
await M.seek(0.5); const avant = await M.particules.lirePixels('a', 'arriere');
await M.seek(2); const pendant = await M.particules.lirePixels('a', 'arriere');
await M.seek(3.5); const apres = await M.particules.lirePixels('a', 'arriere');
await envoyer({ webgpu: true, avant: px(avant, 10, 10), pendant: px(pendant, 10, 10), centre: px(pendant, pendant.largeur >> 1, pendant.hauteur >> 1),
  apres: px(apres, 10, 10), decrire: M.shaders.decrire('a') });`,
  });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.avant, [0, 0, 0, 0]);
  proche(r.pendant, [255, 0, 0, 255], 1, 'rouge exact (tons neutres, sans halo)');
  proche(r.centre, [255, 0, 0, 255], 1, 'plein cadre');
  assert.deepEqual(r.apres, [0, 0, 0, 0]);
  assert.deepEqual(r.decrire, [{ ordre: 0, nom: 'aplat', calque: 'arriere', debut: 1, fin: 3, actif: true, erreur: null }]);
});

test('fond : l\'aura suit son élément (repère mesuré à t)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({
    scene: `<section data-scene="a">
  <style>@scope {
    @keyframes glisse { from { transform: translateX(0); } to { transform: translateX(40cqh); } }
    #boite { position: absolute; left: 10cqh; top: 40cqh; width: 10cqh; height: 10cqh; animation: glisse 4s linear both; }
  }</style>
  <div id="boite" data-start="0" data-dur="4"></div>
  <div data-shader="plein" data-ancre="#boite" data-calque="avant"></div>
</section>`,
    script: `
await M.seek(0); const a0 = boiteAlpha(await M.particules.lirePixels('a', 'avant'));
await M.seek(2); const p2 = await M.particules.lirePixels('a', 'avant');
await envoyer({ webgpu: true, a0, a2: boiteAlpha(p2), k: p2.hauteur / 100 });`,
  });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  proche(r.a0, [10 * r.k, 20 * r.k - 1], 2, 'aura à t = 0');
  proche(r.a2, [30 * r.k, 40 * r.k - 1], 2, 'aura à t = 2 (élément déplacé de 20 cqh)');
});

test('fond : même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({
    scene: '<section data-scene="a"><div data-shader="nuage"></div></section>',
    script: `
await M.seek(2.5); const a = (await M.particules.lirePixels('a', 'arriere')).donnees.slice();
await M.seek(4.2); await M.seek(1);
await M.seek(2.5); const b = (await M.particules.lirePixels('a', 'arriere')).donnees.slice();
await M.seek(1); const c = (await M.particules.lirePixels('a', 'arriere')).donnees.slice();
let ecartAB = 0; let ecartAC = 0;
for (let i = 0; i < a.length; i++) { ecartAB = Math.max(ecartAB, Math.abs(a[i] - b[i])); ecartAC = Math.max(ecartAC, Math.abs(a[i] - c[i])); }
await envoyer({ webgpu: true, ecartAB, ecartAC });`,
  });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.ecartAB, 0);
  assert.ok(r.ecartAC > 5, 'un autre instant change l\'image');
});

test('fond : erreur de compilation : panneau situé, autres fonds dessinés, export refusé', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({
    scene: '<section data-scene="a"><div data-shader="casse" data-start="4" data-dur="1"></div><div data-shader="aplat" data-calque="avant"></div></section>',
    script: `
await M.seek(1);
const p = document.querySelector('[data-shader="casse"] > .pm-effet-panneau');
let refus = null;
try { await M.particules.verifierExport(); } catch (e) { refus = e.message; }
let capture = null;
try { await M.particules.preparerCapture(); } catch (e) { capture = e.message; }
await envoyer({ webgpu: true, panneau: p && p.textContent, erreurs: M.shaders.erreurs(), refus, capture,
  aplat: px(await M.particules.lirePixels('a', 'avant'), 10, 10), decrire: M.shaders.decrire('a').map((d) => [d.nom, d.actif]) });`,
  });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.match(r.panneau, /^Fond non affiché : Shader « casse » \(shaders\/casse\.wgsl\) ne compile pas : ligne 2, colonne \d+ : /);
  assert.equal(r.erreurs.length, 1);
  assert.equal(r.erreurs[0].erreurs[0].ligne, 2);
  assert.equal(r.erreurs[0].usage, 'fond');
  assert.match(r.refus, /^Export refusé : Shader « casse »/, 'refusé même hors de la fenêtre du fond');
  assert.match(r.capture, /Shader « casse »/);
  proche(r.aplat, [255, 0, 0, 255], 1, 'l\'autre fond reste dessiné');
  assert.deepEqual(r.decrire, [['casse', false], ['aplat', true]]);
});

test('fond : capture (image du calque avec son fond) et réglages de l\'atelier sans rechargement', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await page({
    scene: '<section data-scene="a"><div data-shader="aplat"></div></section>',
    script: `
await M.seek(1);
const r0 = px(await M.particules.lirePixels('a', 'arriere'), 10, 10);
const canvas = document.querySelector('canvas[data-pm-calque="arriere"]');
await M.particules.preparerCapture();
const image = canvas.__pmImage;
await M.shaders.regler('a', 0, { teinte: [0, 0, 1, 1], opacite: 0.5 });
const r1 = px(await M.particules.lirePixels('a', 'arriere'), 10, 10);
let inconnu = null;
try { await M.shaders.regler('a', 5, {}); } catch (e) { inconnu = e.message; }
await envoyer({ webgpu: true, r0, r1, png: typeof image === 'string' && image.length > 200, inconnu });`,
  });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  proche(r.r0, [255, 0, 0, 255], 1, 'avant le réglage');
  proche(r.r1, [0, 0, 128, 128], 2, 'bleu à demi opaque, prémultiplié');
  assert.equal(r.png, true, 'le calque d\'un fond seul n\'est pas « vide » à la capture');
  assert.match(r.inconnu, /Fond 5 de la scène « a » non affiché/);
});
