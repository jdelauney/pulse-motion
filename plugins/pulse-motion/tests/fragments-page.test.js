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
const PIXEL = { texture: 'pixel', melange: 'alpha' };
const DESINT = { version: 1, nom: 'desint', rendu_calque: NEUTRE, emetteurs: [{ nom: 'grain',
  naissance: { forme: { type: 'pixels', densite: 1, liberation: 1, ordre: 'gauche-droite' }, vitesse: { direction: [1, -0.3], cone: 30, valeur: [2, 8] }, vie: [1, 1.5] },
  forces: [{ type: 'vent', vitesse: [30, -5], coef: 1 }, { type: 'turbulence', echelle: 6, force: 15 }],
  vie: { couleur: { degrade: ['source', 'source', '#ffb347', '#00000000'] }, opacite: { de: 1, a: 0, courbe: 'quad-in' } }, rendu: PIXEL }] };
const BRIS = { version: 1, nom: 'bris', rendu_calque: NEUTRE, emetteurs: [{ nom: 'eclat', naissance: { vie: [2, 2] },
  forces: [{ type: 'gravite', valeur: 80 }], rendu: { type: 'eclats', morceaux: 40, impulsion: 60, rotation_max: 200, melange: 'alpha' } }] };
const assemble = (arrivee) => ({ version: 1, nom: `assemble-${arrivee}`, rendu_calque: NEUTRE, emetteurs: [{ nom: 'grain',
  naissance: { forme: { type: 'rectangle', largeur: 160, hauteur: 90 }, vitesse: { cone: 360, valeur: [0, 20] } },
  forces: [{ type: 'turbulence', echelle: 10, force: 20 }], cible: { arrivee, echelonnement: 0.4, ordre: 'gauche-droite' },
  vie: { couleur: 'source' }, rendu: PIXEL }] });
const META = { version: 1, nom: 'meta', rendu_calque: NEUTRE, emetteurs: [{ nom: 'grain', naissance: { forme: { type: 'pixels' } },
  forces: [{ type: 'turbulence', echelle: 10, force: 10 }], cible: { source: 'cible', arrivee: 'choree', echelonnement: 0.3, ordre: 'centre', courbe: 'cubic-inout' },
  vie: { couleur: 'source' }, rendu: PIXEL }] };

// Outils de la page : envoi, élément photographié à la place qu'il occupe dans le calque « avant », écart moyen.
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
function vivantes(f) {
  const u = new Uint32Array(f.buffer);
  const l = [];
  for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ n: u[s * 16 + 12], x: f[s * 16], y: f[s * 16 + 1] });
  return l;
}
const cache = (id) => document.getElementById(id).classList.contains('pm-fragment-cache');
function alphaMax(p) { let m = 0; for (let i = 3; i < p.donnees.length; i += 4) m = Math.max(m, p.donnees[i]); return m; }
`;

/** Page assemblée d'une scène « s » ; script : corps asynchrone qui appelle envoyer(objet). */
function pageFragments({ textes, recettes, scene, script, avant = '' }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = textes; });
  for (const r of recettes) ecrire(dir, `effets/${r.nom}.json`, r);
  ecrire(dir, 'scenes/01-s.html', scene);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  return a.html.replace('<head>', `<head>${avant}`).replace('</body>', `<script>
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

test('page : photographies et données des fragments (désintégration, éclats, métamorphose), simulations lancées', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageFragments({
    textes: { titre: 'AB', fin: 'CD' },
    recettes: [DESINT, BRIS, META],
    scene: `<section data-scene="s">
  ${style('#a { position: absolute; left: 20cqh; top: 20cqh; margin: 0; font: 900 16cqh/1 sans-serif; color: #e04020; } #b { position: absolute; left: 100cqh; top: 60cqh; margin: 0; font: 900 12cqh/1 sans-serif; color: #2060e0; }')}
  <h1 id="a" data-texte="titre" data-start="0"></h1>
  <h2 id="b" data-texte="fin" data-start="0"></h2>
  <div data-effet="desint" data-ancre="#a" data-start="1" data-dur="1"></div>
  <div data-effet="bris" data-ancre="#b" data-start="1" data-dur="1"></div>
  <div data-effet="meta" data-ancre="#a" data-cible="#b" data-start="3" data-dur="1"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
const d = [0, 1, 2].map((o) => M.particules.donneesFragments('s', o)[0]);
// Pixels opaques de #a recomptés à la même résolution (densité 1, sortie 1080 px).
const el = document.getElementById('a');
const h = el.closest('section').clientHeight;
const b = M.figer.boite(el);
const dims = M.fragments.dimensionsPhoto(b.largeur * 100 / h, b.hauteur * 100 / h, 1080, 1);
const ph = await M.figer.photo(el, dims);
let opaques = 0;
for (let i = 3; i < ph.rgba.length; i += 4) if (ph.rgba[i] >= 26) opaques++;
await M.seek(1.2);
const desint = vivantes(await M.particules.lireEtat('s', 0, 0)).length;
const eclats = vivantes(await M.particules.lireEtat('s', 1, 0)).length;
envoyer({ webgpu: true, nA: d[0].nA, a: d[0].a.length / 4, opaques, demiA: d[0].demiA, boite: [b.largeur * 50 / h, b.hauteur * 50 / h],
  eclats: d[1].eclats.length / 36, image: !!d[1].image, meta: { nA: d[2].nA, nB: d[2].nB, a: d[2].a.length / 4, b: d[2].b.length / 4 }, desint, vivantsEclats: eclats });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.nA > 1000, `${r.nA} pixels opaques`);
  assert.equal(r.nA, r.opaques, 'un grain par pixel opaque de la photographie');
  assert.equal(r.a, r.nA);
  assert.ok(Math.abs(r.demiA[0] - r.boite[0]) < 1e-3 && Math.abs(r.demiA[1] - r.boite[1]) < 1e-3, 'demi-boîte locale en cqh');
  assert.equal(r.eclats, 40);
  assert.equal(r.image, true, 'photographie gardée pour les éclats');
  assert.equal(r.meta.a, Math.max(r.meta.nA, r.meta.nB), 'métamorphose : max(A, B) particules');
  assert.equal(r.meta.b, r.meta.a);
  assert.equal(r.desint, r.nA, 'toutes les particules de la désintégration simulées');
  assert.equal(r.vivantsEclats, 40);
});
