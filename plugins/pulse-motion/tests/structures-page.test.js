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
const NEUTRE = { bloom: 0, tons: 'neutre' };
// Bannière faite de l'ancre : tenue par son bord haut, lâchée 1 s après le début.
const TOMBE = { version: 1, nom: 'tombe', rendu_calque: NEUTRE, emetteurs: [{ nom: 'toile',
  structure: { type: 'tissu', resolution: [48, 12], attaches: [{ ou: 'haut', a: 'ancre', lacher: 1 }], apparence: { source: 'ancre' } },
  forces: [{ type: 'gravite', valeur: 40 }] }] };
// Fanion tenu par son bord gauche au bord gauche de #mat.
const FANION = { version: 1, nom: 'fanion', rendu_calque: NEUTRE, emetteurs: [{ nom: 'f', structure: { type: 'tissu', resolution: [8, 6], attaches: [{ ou: 'gauche', a: '#mat' }] } }] };

// Outils de la page : envoi, élément photographié à la place qu'il occupe dans le calque « avant », écart moyen, état.
const OUTILS = `
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
async function reference(el) {
  const section = el.closest('section');
  const canvas = section.querySelector('canvas[data-pm-calque="avant"]');
  const s = section.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const k = canvas.width / s.width;
  const boite = { x: Math.round((b.left - s.left) * k), y: Math.round((b.top - s.top) * k), l: Math.round(b.width * k), h: Math.round(b.height * k) };
  const ph = await M.figer.photo(el, { largeur: boite.l, hauteur: boite.h });
  return { boite, rgba: ph.rgba };
}
function ecart(calque, ref) {
  let somme = 0;
  let n = 0;
  const { x, y, l, h } = ref.boite;
  for (let j = 0; j < h; j++) for (let i = 0; i < l; i++) {
    const c = ((y + j) * calque.largeur + x + i) * 4;
    const r = (j * l + i) * 4;
    const a = ref.rgba[r + 3] / 255;
    for (let k = 0; k < 3; k++) somme += Math.abs(calque.donnees[c + k] - ref.rgba[r + k] * a);
    somme += Math.abs(calque.donnees[c + 3] - ref.rgba[r + 3]);
    n += 4;
  }
  return somme / n / 255;
}
const cache = (id) => document.getElementById(id).classList.contains('pm-fragment-cache');
/** Sommets d'une structure : [{ x, y }] (cqh). */
async function sommets(scene, ordre, emetteur) {
  const f = await M.particules.lireEtat(scene, ordre, emetteur);
  const l = [];
  for (let s = 0; s < f.length / 16; s++) l.push({ x: f[s * 16], y: f[s * 16 + 1] });
  return l;
}
/** Boîte d'un élément dans sa section, en cqh (transformations comprises). */
function boiteCqh(el) {
  const s = el.closest('section').getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const k = 100 / s.height;
  return { x: (b.left - s.left) * k, y: (b.top - s.top) * k, l: b.width * k, h: b.height * k };
}
`;

function pageStructures({ textes, recettes, scene, script }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = textes; });
  for (const r of recettes) ecrire(dir, `effets/${r.nom}.json`, r);
  ecrire(dir, 'scenes/01-s.html', scene);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  return a.html.replace('</body>', `<script>
(async () => {
${OUTILS}
try {
${script}
} catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}
const style = (regles) => `<style>@scope { ${regles} }</style>`;

test('page : au début d\'une bannière faite d\'un élément, l\'image du tissu est celle de l\'élément (écart moyen < 2 %), élément caché à partir du pas 1', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageStructures({
    textes: { titre: 'PULSE' },
    recettes: [TOMBE],
    scene: `<section data-scene="s">
  ${style('#titre { position: absolute; left: 30cqh; top: 20cqh; margin: 0; font: 900 18cqh/1 sans-serif; color: #e04020; }')}
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <div data-effet="tombe" data-ancre="#titre" data-start="1" data-dur="2"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
await M.seek(0.5);
const titre = document.getElementById('titre');
const ref = await reference(titre);
const avant = cache('titre');
await M.seek(1 + 0.5 / 120);
const pas0 = cache('titre');
await M.seek(1 + 1.5 / 120);
const calque = await M.particules.lirePixels('s', 'avant');
const pendant = cache('titre') && getComputedStyle(titre).visibility === 'hidden';
const debut = await sommets('s', 0, 0);
await M.seek(2.6);
const chute = await sommets('s', 0, 0);
const effet = M.particules.decrire('s')[0];
envoyer({ webgpu: true, ecart: ecart(calque, ref), avant, pas0, pendant, actif: effet.actif, desactive: effet.desactive,
  yDebut: debut.reduce((s, p) => s + p.y, 0) / debut.length, yChute: chute.reduce((s, p) => s + p.y, 0) / chute.length });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual([r.actif, r.desactive], [true, null]);
  assert.equal(r.avant, false, 'avant l\'effet : élément visible');
  assert.equal(r.pas0, false, 'pas 0 de l\'effet : pas encore de tissu, élément visible');
  assert.equal(r.pendant, true, 'pas 1 : le tissu remplace l\'élément, caché');
  assert.ok(r.ecart < 0.02, `raccord : écart moyen ${(r.ecart * 100).toFixed(2)} %`);
  assert.ok(r.yChute > r.yDebut + 5, `lâchée à 1 s de τ : la bannière tombe (y moyen ${r.yDebut.toFixed(1)} -> ${r.yChute.toFixed(1)})`);
});

test('page : un fanion attaché à un élément animé par CSS le suit, à sa place de repos', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageStructures({
    textes: { titre: 'Mât' },
    recettes: [FANION],
    scene: `<section data-scene="s">
  ${style('@keyframes glisse { from { transform: translateX(0); } to { transform: translateX(40cqh); } } #mat { position: absolute; left: 20cqh; top: 20cqh; width: 2cqh; height: 30cqh; background: #333; animation: glisse 4s linear both; } .zone { position: absolute; left: 22cqh; top: 20cqh; width: 30cqh; height: 20cqh; }')}
  <h1 data-texte="titre"></h1>
  <div id="mat" data-start="0" data-dur="4"></div>
  <div class="zone" data-effet="fanion" data-start="0" data-dur="4"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
const mat = document.getElementById('mat');
const mesures = [];
for (const t of [1, 3]) {
  await M.seek(t);
  const s = await sommets('s', 0, 0);
  mesures.push({ mat: boiteCqh(mat), gauche: [0, 1, 2, 3, 4, 5].map((r) => s[r * 8]) });
}
const panneau = (document.querySelector('[data-effet] > .pm-effet-panneau') || {}).textContent || '';
envoyer({ webgpu: true, mesures, panneau });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.panneau, '', 'aucun panneau d\'erreur');
  for (const { mat, gauche } of r.mesures) {
    gauche.forEach((p, ligne) => {
      // Place de repos gardée dans le repère de #mat : 2 cqh à droite de son bord gauche, sur la hauteur de la zone (20 cqh).
      assert.ok(Math.abs(p.x - (mat.x + 2)) < 0.05, `x ${p.x.toFixed(3)} au lieu de ${(mat.x + 2).toFixed(3)} (place de repos, suit #mat)`);
      assert.ok(Math.abs(p.y - (mat.y + 20 * ligne / 5)) < 0.05, `ligne ${ligne} : y ${p.y.toFixed(3)}`);
    });
  }
  assert.ok(r.mesures[1].mat.x > r.mesures[0].mat.x + 15, '#mat a bougé');
});
