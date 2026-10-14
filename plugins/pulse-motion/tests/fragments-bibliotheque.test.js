'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const BIBLIOTHEQUE = path.join(__dirname, '..', 'effets');

test('bibliothèque dans la page : raccord de « desintegrer », même image par deux chemins (briser sur un sol déclaré, assembler, métamorphose)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'PULSE', mot: 'OK', avant: 'AB', apres: 'CD' }; });
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <style>@scope {
    h1, h2, h3, h4 { position: absolute; margin: 0; font: 900 14cqh/1 sans-serif; }
    #titre { left: 10cqh; top: 8cqh; color: #e04020; }
    #mot { left: 110cqh; top: 8cqh; color: #2080e0; }
    #avant { left: 10cqh; top: 40cqh; color: #20a040; }
    #apres { left: 110cqh; top: 40cqh; color: #a020c0; }
    #bloc { position: absolute; left: 60cqh; top: 40cqh; width: 30cqh; height: 15cqh; background: linear-gradient(90deg, #2050e0, #e0c020); }
    #sol { position: absolute; left: 0; top: 92cqh; width: 178cqh; height: 8cqh; }
  }</style>
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <h2 id="mot" data-texte="mot" data-start="0"></h2>
  <h3 id="avant" data-texte="avant" data-start="0"></h3>
  <h4 id="apres" data-texte="apres" data-start="0"></h4>
  <div id="bloc" data-start="0"></div>
  <div id="sol" data-obstacle data-start="0"></div>
  <div data-effet="desintegrer" data-ancre="#titre" data-start="1" data-dur="1.5" data-reglages="densite: 1"></div>
  <div data-effet="briser" data-ancre="#bloc" data-start="1.2"></div>
  <div data-effet="assembler" data-ancre="#mot" data-calque="arriere" data-start="0.5" data-dur="1.5"></div>
  <div data-effet="metamorphose" data-ancre="#avant" data-cible="#apres" data-start="1" data-dur="1.5"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: BIBLIOTHEQUE, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  // Scène de 1080 px de haut (résolution de sortie) : le calque, la référence et la photographie à la même échelle.
  const html = a.html.replace('<head>', '<head><style>#pm-scene { width: 1920px !important; height: 1080px !important; flex: none !important; }</style>').replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    // Raccord : le titre (14cqh) photographié à sa place dans le calque « avant », puis le calque au premier pas de
    // l'effet, à la résolution de sortie (scène de 1080 px : référence et particules rastérisées à la même échelle).
    await M.seek(0.9);
    const el = document.getElementById('titre');
    const section = el.closest('section');
    const canvas = section.querySelector('canvas[data-pm-calque="avant"]');
    const s = section.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const k = canvas.width / s.width;
    const boite = { x: Math.round((b.left - s.left) * k), y: Math.round((b.top - s.top) * k), l: Math.round(b.width * k), h: Math.round(b.height * k) };
    const ref = await M.figer.photo(el, { largeur: boite.l, hauteur: boite.h });
    await M.seek(1 + 1.5 / 120);
    const calque = await M.particules.lirePixels('s', 'avant');
    let somme = 0;
    for (let j = 0; j < boite.h; j++) for (let i = 0; i < boite.l; i++) {
      const c = ((boite.y + j) * calque.largeur + boite.x + i) * 4;
      const r = (j * boite.l + i) * 4;
      const al = ref.rgba[r + 3] / 255;
      for (let q = 0; q < 3; q++) somme += Math.abs(calque.donnees[c + q] - ref.rgba[r + q] * al);
      somme += Math.abs(calque.donnees[c + 3] - ref.rgba[r + 3]);
    }
    const ecart = somme / (boite.l * boite.h * 4) / 255;
    // Même image par deux chemins (les deux calques ; l'assemblage, qui traverse l'écran, est à l'arrière pour ne pas
    // passer sur le titre au moment du raccord) : 0 -> 2,2, puis 2,2 -> 4 -> 0,2 -> 2,2.
    const lire = async (t) => { await M.seek(t); return [await M.particules.lirePixels('s', 'avant'), await M.particules.lirePixels('s', 'arriere')]; };
    const egalUn = (x, y) => x.donnees.length === y.donnees.length && x.donnees.every((v, i) => v === y.donnees[i]);
    const egal = (x, y) => egalUn(x[0], y[0]) && egalUn(x[1], y[1]);
    const direct = await lire(2.2);
    await lire(4);
    await lire(0.2);
    const detour = await lire(2.2);
    let alpha = 0;
    for (let i = 3; i < direct[0].donnees.length; i += 4) alpha = Math.max(alpha, direct[0].donnees[i]);
    envoyer({ webgpu: true, ecart, hauteurCalque: canvas.height, egal: egal(direct, detour), alpha, collisions: M.particules.decrire('s').map((d) => d.collisions),
      panneaux: document.querySelectorAll('.pm-effet-panneau').length });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html, { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.panneaux, 0, 'tous les effets affichés');
  assert.equal(r.hauteurCalque, 1080, 'calque à la résolution de sortie');
  assert.ok(r.ecart < 0.02, `desintegrer : écart moyen ${(r.ecart * 100).toFixed(2)} % au début`);
  assert.ok(r.alpha > 0, 'des particules à 2,2 s');
  assert.equal(r.egal, true, 'même image par deux chemins');
  assert.deepEqual(r.collisions, [false, true, false, false], 'les éclats de « briser » heurtent le sol déclaré');
});
