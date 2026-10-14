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
  assert.ok(r.demiA[0] <= r.boite[0] + 1e-3 && r.demiA[1] <= r.boite[1] + 1e-3 && r.demiA[1] > r.boite[1] * 0.5, 'demi-taille de la boîte opaque en cqh');
  assert.equal(r.eclats, 40);
  assert.equal(r.image, true, 'photographie gardée pour les éclats');
  assert.equal(r.meta.a, Math.max(r.meta.nA, r.meta.nB), 'métamorphose : max(A, B) particules');
  assert.equal(r.meta.b, r.meta.a);
  assert.equal(r.desint, r.nA, 'toutes les particules de la désintégration simulées');
  assert.equal(r.vivantsEclats, 40);
});

const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { trouverNavigateur } = require('../scripts/lib/navigateur.js');

test('page sans WebGPU : photographies contrôlées (ancre-vide, photographie-trop-grande), aucun élément caché', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'A' }; });
  ecrire(dir, 'effets/desint.json', DESINT);
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  ${style('#vide { position: absolute; left: 10cqh; top: 10cqh; width: 10cqh; height: 10cqh; } #grand { position: absolute; left: 60cqh; top: 0; width: 100cqh; height: 100cqh; background: #3070d0; }')}
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <div id="vide" data-start="0"></div>
  <div id="grand" data-start="0"></div>
  <div data-effet="desint" data-ancre="#vide" data-start="1" data-dur="1"></div>
  <div data-effet="desint" data-ancre="#grand" data-start="1" data-dur="1"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const html = a.html.replace('<head>', '<head><script>window.__PM_SANS_GPU__ = true;</script>');
  const mesure = await mesurerPage({ html, navigateur: trouverNavigateur(), script: `
    const photos = await M.particules.photosVides();
    await M.seek(1.5);
    const caches = Array.from(document.querySelectorAll('.pm-fragment-cache')).map((e) => e.id);
    const donnees = M.particules.donneesFragments('s', 1);
    const panneau = (document.querySelector('[data-effet] > .pm-effet-panneau') || {}).textContent || '';
    return { photos, caches, nA: donnees && donnees[0].nA, panneau, alertes: M.particules.alertes };` });
  assert.equal(mesure.erreur, undefined, mesure.erreur);
  const m = mesure.resultat;
  assert.deepEqual(m.photos.map((p) => [p.regle, p.element]), [['ancre-vide', 'vide'], ['photographie-trop-grande', 'grand']]);
  assert.match(m.photos[0].message, /Scène « s », effet « desint » : rien à photographier : « #vide » n'a aucun pixel visible à 1 s ; l'effet n'est pas affiché\./);
  assert.match(m.photos[1].message, /« #grand » a plus d'un million de pixels opaques : densité portée à 4 \(une particule pour 4 pixels\)\./);
  assert.equal(m.nA, 512 * 512, 'densité 4 : photographie de 512 × 512');
  assert.deepEqual(m.caches, [], 'sans WebGPU, aucun élément caché');
  assert.ok(m.alertes.includes(m.photos[1].message));
});

test('page : raccords selon t (désintégration, assemblage, métamorphose)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageFragments({
    textes: { titre: 'AB', un: 'CD', deux: 'EF', trois: 'GH' },
    recettes: [DESINT, assemble('guidee'), META],
    scene: `<section data-scene="s">
  ${style('h1, h2, h3, h4 { position: absolute; margin: 0; font: 900 12cqh/1 sans-serif; color: #e04020; } #a { left: 10cqh; top: 10cqh; } #b { left: 90cqh; top: 10cqh; } #c { left: 10cqh; top: 60cqh; } #d { left: 90cqh; top: 60cqh; }')}
  <h1 id="a" data-texte="titre" data-start="0"></h1>
  <h2 id="b" data-texte="un" data-start="0"></h2>
  <h3 id="c" data-texte="deux" data-start="0"></h3>
  <h4 id="d" data-texte="trois" data-start="0"></h4>
  <div data-effet="desint" data-ancre="#a" data-start="1" data-dur="1"></div>
  <div data-effet="assemble-guidee" data-ancre="#b" data-start="1" data-dur="1"></div>
  <div data-effet="meta" data-ancre="#c" data-cible="#d" data-start="1" data-dur="1"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
const l = [];
for (const t of [0.5, 1 + 0.5 / 120, 1 + 1.5 / 120, 1.5, 2 + 0.5 / 120, 3]) {
  await M.seek(t);
  l.push(['a', 'b', 'c', 'd'].map((id) => cache(id) && getComputedStyle(document.getElementById(id)).visibility === 'hidden'));
}
envoyer({ webgpu: true, l });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.l, [
    [false, true, false, true],   // avant : l'élément assemblé et l'arrivée de la métamorphose attendent
    [false, true, false, true],   // pas 0 de l'effet : pas encore de particules
    [true, true, true, true],     // pas 1 : les particules remplacent l'élément
    [true, true, true, true],
    [true, false, true, false],   // pas de l'arrivée : l'élément réel remplace les particules
    [true, false, true, false],
  ]);
});

test('page : au début d\'une désintégration et d\'un bris, l\'image des particules est celle de l\'élément (écart moyen < 2 %)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageFragments({
    textes: { titre: 'PULSE' },
    recettes: [DESINT, BRIS],
    scene: `<section data-scene="s">
  ${style('#mot { position: absolute; left: 20cqh; top: 15cqh; margin: 0; font: 900 18cqh/1 sans-serif; color: #e04020; } #bloc { position: absolute; left: 30cqh; top: 60cqh; width: 60cqh; height: 25cqh; background: linear-gradient(90deg, #2050e0, #e0c020); border-radius: 4cqh; }')}
  <h1 id="mot" data-texte="titre" data-start="0"></h1>
  <div id="bloc" data-start="0"></div>
  <div data-effet="desint" data-ancre="#mot" data-start="1" data-dur="1"></div>
  <div data-effet="bris" data-ancre="#bloc" data-start="1" data-dur="1"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
await M.seek(0.5);
const mot = document.getElementById('mot');
const bloc = document.getElementById('bloc');
const refMot = await reference(mot);
const refBloc = await reference(bloc);
await M.seek(1 + 1.5 / 120);
const calque = await M.particules.lirePixels('s', 'avant');
envoyer({ webgpu: true, mot: ecart(calque, refMot), bloc: ecart(calque, refBloc), caches: [cache('mot'), cache('bloc')] });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.caches, [true, true], 'éléments réels cachés');
  assert.ok(r.mot < 0.02, `désintégration : écart moyen ${(r.mot * 100).toFixed(2)} %`);
  assert.ok(r.bloc < 0.02, `bris : écart moyen ${(r.bloc * 100).toFixed(2)} %`);
});

test('page : assemblage guidé et chorégraphié : arrivée à 0,01 cqh, l\'image suivante montre l\'élément réel', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageFragments({
    textes: { titre: 'OK', fin: 'GO' },
    recettes: [assemble('guidee'), assemble('choree')],
    scene: `<section data-scene="s">
  ${style('#un { position: absolute; left: 20cqh; top: 30cqh; margin: 0; font: 900 20cqh/1 sans-serif; color: #2080e0; } #deux { position: absolute; left: 100cqh; top: 30cqh; margin: 0; font: 900 20cqh/1 sans-serif; color: #20a040; transform: rotate(-8deg); }')}
  <h1 id="un" data-texte="titre" data-start="0"></h1>
  <h2 id="deux" data-texte="fin" data-start="0"></h2>
  <div data-effet="assemble-guidee" data-ancre="#un" data-start="0.5" data-dur="1"></div>
  <div data-effet="assemble-choree" data-ancre="#deux" data-start="0.5" data-dur="1"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
const O = M.obstacles;
const res = {};
await M.seek(0.5 + 119.5 / 120);
for (const [ordre, id] of [[0, 'un'], [1, 'deux']]) {
  const el = document.getElementById(id);
  const rep = M.particulesInterne.mesurerReperes([el], el.closest('section'))[0];
  const b = M.particules.donneesFragments('s', ordre)[0].b;
  const ps = vivantes(await M.particules.lireEtat('s', ordre, 0));
  let pire = 0;
  for (const p of ps) {
    const c = O.versMonde(rep, [b[p.n * 4] * rep.echelle[0], b[p.n * 4 + 1] * rep.echelle[1]]);
    pire = Math.max(pire, Math.hypot(p.x - c[0], p.y - c[1]));
  }
  res[id] = { pire, vivantes: ps.length, total: b.length / 4, cacheAvant: cache(id) };
}
await M.seek(0.5 + 120.5 / 120);
for (const id of ['un', 'deux']) {
  res[id].cacheApres = cache(id);
  res[id].visibilite = getComputedStyle(document.getElementById(id)).visibility;
}
res.alphaApres = alphaMax(await M.particules.lirePixels('s', 'avant'));
envoyer({ webgpu: true, res });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  for (const id of ['un', 'deux']) {
    const x = r.res[id];
    assert.equal(x.vivantes, x.total, `${id} : toutes les particules présentes à l'image d'avant`);
    assert.ok(x.pire < 0.01, `${id} : particule la plus éloignée de sa cible à ${x.pire} cqh`);
    assert.equal(x.cacheAvant, true, `${id} : élément caché jusqu'à l'arrivée`);
    assert.equal(x.cacheApres, false, `${id} : élément montré à l'image de l'arrivée`);
    assert.equal(x.visibilite, 'visible');
  }
  assert.equal(r.res.alphaApres, 0, 'particules éteintes à l\'image de l\'arrivée');
});

test('page : métamorphose qui aboutit sur B (bijection sur le plus petit ensemble, B montré à l\'arrivée)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageFragments({
    textes: { titre: 'AB', fin: 'CDEF' },
    recettes: [META],
    scene: `<section data-scene="s">
  ${style('#a { position: absolute; left: 15cqh; top: 20cqh; margin: 0; font: 900 18cqh/1 sans-serif; color: #e04020; } #b { position: absolute; left: 80cqh; top: 55cqh; margin: 0; font: 900 14cqh/1 sans-serif; color: #2060e0; }')}
  <h1 id="a" data-texte="titre" data-start="0"></h1>
  <h2 id="b" data-texte="fin" data-start="0"></h2>
  <div data-effet="meta" data-ancre="#a" data-cible="#b" data-start="1" data-dur="1.5"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
await M.seek(1 + 179.5 / 120);
const el = document.getElementById('b');
const rep = M.particulesInterne.mesurerReperes([el], el.closest('section'))[0];
const d = M.particules.donneesFragments('s', 0)[0];
const ps = vivantes(await M.particules.lireEtat('s', 0, 0));
let pire = 0;
let restent = 0;
for (const p of ps) {
  if (Math.floor(d.b[p.n * 4 + 3] / 65536) & 2) continue;
  restent++;
  const c = M.obstacles.versMonde(rep, [d.b[p.n * 4] * rep.echelle[0], d.b[p.n * 4 + 1] * rep.echelle[1]]);
  pire = Math.max(pire, Math.hypot(p.x - c[0], p.y - c[1]));
}
const avant = [cache('a'), cache('b')];
await M.seek(1 + 180.5 / 120);
envoyer({ webgpu: true, pire, restent, nA: d.nA, nB: d.nB, total: ps.length, avant, apres: [cache('a'), cache('b')], alpha: alphaMax(await M.particules.lirePixels('s', 'avant')) });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.total, Math.max(r.nA, r.nB), 'max(A, B) particules');
  assert.equal(r.restent, r.nB, 'chaque pixel de B reçoit exactement une particule qui reste');
  assert.ok(r.pire < 0.01, `particule la plus éloignée de son pixel de B : ${r.pire} cqh`);
  assert.deepEqual(r.avant, [true, true], 'A caché dès le début, B jusqu\'à l\'arrivée');
  assert.deepEqual(r.apres, [true, false], 'B montré à l\'arrivée');
  assert.equal(r.alpha, 0, 'particules éteintes');
});

test('page : titre en bloc (boîte de toute la largeur) : éclats sur le texte, désintégration étalée sur toute la libération', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = pageFragments({
    textes: { titre: 'PULSE', fin: 'MOTION' },
    recettes: [DESINT, BRIS],
    scene: `<section data-scene="s">
  ${style('h1, h2 { margin: 0; padding: 4cqh 0 0 6cqh; font: 900 12cqh/1 sans-serif; color: #e04020; }')}
  <h1 id="un" data-texte="titre" data-start="0"></h1>
  <h2 id="deux" data-texte="fin" data-start="0"></h2>
  <div data-effet="bris" data-ancre="#un" data-start="1" data-dur="1"></div>
  <div data-effet="desint" data-ancre="#deux" data-start="1" data-dur="1"></div>
</section>`,
    script: `
await M.particules.pret;
if (!M.particules.disponible) return envoyer({ webgpu: false });
const h = document.querySelector('section').clientHeight;
const boite = M.figer.boite(document.getElementById('un')).largeur * 100 / h;
const [e] = M.particules.donneesFragments('s', 0);
// Éclats non vides : au moins un pixel opaque de la photographie dans le polygone.
const c = document.createElement('canvas');
c.width = e.image.width;
c.height = e.image.height;
const ctx = c.getContext('2d');
ctx.drawImage(e.image, 0, 0);
const px = ctx.getImageData(0, 0, c.width, c.height).data;
const opaques = [];
for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
  if (px[(j * c.width + i) * 4 + 3] >= 26) opaques.push([e.centreA[0] + ((i + 0.5) / c.width - 0.5) * 2 * e.demiA[0], e.centreA[1] + ((j + 0.5) / c.height - 0.5) * 2 * e.demiA[1]]);
}
const dans = (poly, p) => {
  let signe = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const v = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (v === 0) continue;
    if (signe === 0) signe = Math.sign(v); else if (Math.sign(v) !== signe) return false;
  }
  return true;
};
let pleins = 0;
const n = e.eclats.length / 36;
for (let k = 0; k < n; k++) {
  const b = k * 36;
  const poly = Array.from({ length: e.eclats[b + 2] }, (_, q) => [e.eclats[b] + e.eclats[b + 4 + 2 * q], e.eclats[b + 1] + e.eclats[b + 5 + 2 * q]]);
  if (poly.length >= 3 && opaques.some((p) => dans(poly, p))) pleins++;
}
// Désintégration : part des grains libérés (plus à leur place) à 0,25, 0,5 et 0,75 s de la libération (1 s).
const el = document.getElementById('deux');
const rep = M.particulesInterne.mesurerReperes([el], el.closest('section'))[0];
const [d] = M.particules.donneesFragments('s', 1);
const parts = [];
for (const tau of [0.25, 0.5, 0.75]) {
  await M.seek(1 + tau);
  let tenus = 0;
  for (const p of vivantes(await M.particules.lireEtat('s', 1, 0))) {
    const q = M.obstacles.versMonde(rep, [d.a[p.n * 4] * rep.echelle[0], d.a[p.n * 4 + 1] * rep.echelle[1]]);
    if (Math.hypot(p.x - q[0], p.y - q[1]) < 0.01) tenus++;
  }
  parts.push(1 - tenus / d.nA);
}
envoyer({ webgpu: true, boite, demi: e.demiA, pleins, n, parts });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.boite > 150, `boîte de mise en page de ${r.boite} cqh`);
  assert.ok(2 * r.demi[0] < 60, `boîte opaque de ${2 * r.demi[0]} cqh`);
  assert.equal(r.n, 40);
  assert.ok(r.pleins >= 0.8 * r.n, `${r.pleins} éclats sur ${r.n} couvrent le texte`);
  const [a, b, c] = r.parts;
  assert.ok(a > 0.1 && a < 0.4, `libérés à 0,25 s : ${a}`);
  assert.ok(b > 0.35 && b < 0.65, `libérés à 0,5 s : ${b}`);
  assert.ok(c > 0.6 && c < 0.9, `libérés à 0,75 s : ${c}`);
});
