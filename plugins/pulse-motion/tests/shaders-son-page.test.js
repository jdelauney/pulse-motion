'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');
const { notes, wavMono } = require('./aide/signaux.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' || Buffer.isBuffer(contenu) ? contenu : JSON.stringify(contenu));
};
const SHADERS = {
  basses: [{ version: 1, nom: 'basses', usage: 'fond' }, 'fn image(coord: vec2f) -> vec4f {\n  return vec4f(iSon.basses, sonSpectre(0.15), 0.0, 1.0);\n}\n'],
  'post-son': [{ version: 1, nom: 'post-son', usage: 'post' }, 'fn post(coord: vec2f) -> vec4f {\n  return vec4f(canal0(coord / iResolution.xy).rgb, 1.0) * 0.0 + vec4f(0.0, 0.0, iSon.basses, 1.0);\n}\n'],
};
const MUSIQUE = wavMono(notes({ plages: [{ debut: 0, fin: 1, frequence: 80 }, { debut: 2, fin: 3, frequence: 80 }] }));

function page({ scene, post, script }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [{ id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {}, ...(post ? { post: [{ shader: 'post-son' }] } : {}) }];
    d.musique = { fichier: 'assets/m.wav' };
  });
  for (const [nom, [json, code]] of Object.entries(SHADERS)) { ecrire(dir, `shaders/${nom}.json`, json); ecrire(dir, `shaders/${nom}.wgsl`, code); }
  ecrire(dir, 'assets/m.wav', MUSIQUE);
  ecrire(dir, 'scenes/a.html', scene);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  return a.html.replace('</body>', `<script>
(async () => {
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
const px = (p) => Array.from(p.donnees.slice(((p.hauteur >> 1) * p.largeur + (p.largeur >> 1)) * 4, ((p.hauteur >> 1) * p.largeur + (p.largeur >> 1)) * 4 + 4));
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
async function executer(o) {
  const r = JSON.parse(await executerPage(page(o)));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('fond : iSon.basses et le spectre suivent la musique, à l\'instant t', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ scene: '<section data-scene="a"><div data-shader="basses"></div></section>', script: `
await M.seek(0.5); const note = px(await M.particules.lirePixels('a', 'arriere'));
await M.seek(1.6); const silence = px(await M.particules.lirePixels('a', 'arriere'));
await M.seek(2.5); const reprise = px(await M.particules.lirePixels('a', 'arriere'));
await envoyer({ note, silence, reprise, ecrit: M.shaders.sonEcrit() });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.note[0] > 200, `basses pendant la note : ${r.note}`);
  assert.ok(r.silence[0] < 30, `silence : ${r.silence}`);
  assert.ok(r.reprise[0] > 200, `reprise : ${r.reprise}`);
  assert.ok(r.note[1] > 100, 'spectre grave allumé (bande 0,15 ≈ 56 Hz–60 Hz voisine de la note)');
  assert.deepEqual(r.ecrit, { t: 2.5, pistes: ['musique'] });
});

test('post-traitement : même son que les fonds au même instant', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ post: true, scene: '<section data-scene="a"><h1 style="color:#fff">A</h1></section>', script: `
await M.seek(0.5); const note = px(await M.shaders.lireComposition());
await M.seek(1.6); const silence = px(await M.shaders.lireComposition());
await envoyer({ note, silence });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.note[2] > 200, `bleu = basses pendant la note : ${r.note}`);
  assert.ok(r.silence[2] < 30, `silence : ${r.silence}`);
});
