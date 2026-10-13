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
const AUCUN = 0xffffffff;

/** Recette : une salve qui tombe sur l'ancre, réponse au contact donnée. */
function recette(nom, { collisions, vitesse = { direction: [0, 1], valeur: [0, 0] }, gravite = 40, nombre = 30 }) {
  return { version: 1, nom, rendu_calque: { bloom: 0 }, emetteurs: [{ nom: 'e',
    naissance: { salves: [{ t: 0, nombre }], forme: { type: 'ancre' }, vitesse, vie: [10, 10], taille: [0.6, 0.6] },
    forces: [{ type: 'gravite', valeur: gravite }], collisions, vie: { couleur: '#ff8800' }, rendu: { melange: 'alpha' } }] };
}

/** Page assemblée + script de mesure ; -> objet envoyé par la page. */
async function page(dir, code) {
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const html = r.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const lire = async (id, t) => { await M.seek(t); return M.particules.lirePixels(id, 'avant'); };
    const egal = (a, b) => a.largeur === b.largeur && a.donnees.every((x, i) => x === b.donnees[i]);
    const etat = async (id, t) => {
      await M.seek(t);
      const p = await M.particules.lireEtat(id, 0, 0);
      const c = await M.particules.lireContacts(id, 0, 0);
      const u = new Uint32Array(p.buffer), uc = new Uint32Array(c.buffer);
      const l = [];
      for (let s = 0; s < p.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ s, x: p[s * 16], y: p[s * 16 + 1], vx: p[s * 16 + 4], obstacle: uc.length ? uc[s * 8 + 2] : ${AUCUN} });
      return l;
    };
    ${code}
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r2 = JSON.parse(await executerPage(html));
  assert.equal(r2.erreur, undefined, r2.erreur);
  return r2;
}

test('page : une boîte animée emporte les particules posées ; même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'effets/pose.json', recette('pose', { collisions: { cibles: ['elements'], reponse: 'poser' } }));
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <style>@scope {
    @keyframes glisse { from { transform: translateX(0); } to { transform: translateX(40cqh); } }
    #boite { position: absolute; left: 30cqh; top: 70cqh; width: 40cqh; height: 10cqh; animation: glisse 4s linear both; }
    #source { position: absolute; left: 35cqh; top: 30cqh; width: 30cqh; height: 1cqh; }
  }</style>
  <h1 data-texte="titre"></h1>
  <div id="boite" data-obstacle data-start="0" data-dur="4"></div>
  <div id="source"></div>
  <div data-effet="pose" data-ancre="#source" data-start="0" data-dur="0.1"></div>
</section>`);
  const r = await page(dir, `
    const a = await etat('s', 2);
    const b = await etat('s', 3);
    const direct = await lire('s', 2.5);
    await M.seek(5.5);
    const detour = await lire('s', 2.5);
    envoyer({ webgpu: true, a, b, deterministe: egal(direct, detour), decrit: M.particules.decrire('s') });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.decrit[0].collisions, true);
  const posees = r.a.filter((p) => p.obstacle === 3);
  assert.ok(posees.length >= 10, `${posees.length} particules posées sur la boîte`);
  for (const p of posees) {
    const q = r.b.find((x) => x.s === p.s);
    assert.ok(Math.abs(q.x - p.x - 10) < 0.05, `déplacement ${q.x - p.x} au lieu de 10 cqh`);
    assert.ok(Math.abs(q.y - (70 - 0.3)) < 0.05, `y ${q.y} : sur le dessus de la boîte (rayon 0,3)`);
    assert.ok(Math.abs(q.vx - 10) < 0.2, `vitesse ${q.vx}`);
  }
  assert.equal(r.deterministe, true, 'même image par 0 → 2,5 et par 5,5 → 2,5');
});

test("page : forme invisible (display: none, coordonnées lues dans les données) : les particules s'y posent", async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'effets/pose.json', recette('pose', { collisions: { cibles: ['elements'], reponse: 'poser' } }));
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <style>@scope { #source { position: absolute; left: 35cqh; top: 30cqh; width: 30cqh; height: 1cqh; } }</style>
  <h1 data-texte="titre"></h1>
  <div data-obstacle-forme="ligne" data-de="20 60" data-a="120 60"></div>
  <div id="source"></div>
  <div data-effet="pose" data-ancre="#source" data-start="0" data-dur="0.1"></div>
</section>`);
  const r = await page(dir, `
    const e = await etat('s', 3);
    envoyer({ webgpu: true, e, affichage: getComputedStyle(document.querySelector('[data-obstacle-forme]')).display });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.affichage, 'none', "la forme ne s'affiche pas");
  assert.equal(r.e.length, 30);
  assert.ok(r.e.every((p) => p.obstacle === 3 && Math.abs(p.y - (60 - 0.3)) < 0.05), JSON.stringify(r.e.slice(0, 3)));
});

test('page : sans obstacle, collisions inactives (voie rapide, les particules sortent par le bas)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'effets/rebond.json', recette('rebond', { collisions: { reponse: 'rebond' } }));
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <style>@scope { #source { position: absolute; left: 35cqh; top: 30cqh; width: 30cqh; height: 1cqh; } }</style>
  <h1 data-texte="titre"></h1>
  <div id="source"></div>
  <div data-effet="rebond" data-ancre="#source" data-start="0" data-dur="0.1"></div>
</section>`);
  const r = await page(dir, `
    const e = await etat('s', 3);
    envoyer({ webgpu: true, e, decrit: M.particules.decrire('s') });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.decrit[0].collisions, false);
  assert.ok(r.e.length > 0 && r.e.every((p) => p.y > 100), 'chute libre sous le bord bas (y = 30 + 180)');
});

test('page : obstacle de la scène voisine pendant un glissement', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 'a', fichier: 'scenes/01-a.html', duree: 2, textes: { titre: 'A' } },
      { id: 'b', fichier: 'scenes/02-b.html', duree: 3, transition: 'glissement', textes: { titre: 'B' } },
    ];
  });
  ecrire(dir, 'effets/pose.json', recette('pose', { collisions: { cibles: ['elements'], reponse: 'poser' }, vitesse: { direction: [0, 1], valeur: [200, 200] }, gravite: 0 }));
  ecrire(dir, 'scenes/01-a.html', `<section data-scene="a">
  <style>@scope { #mur { position: absolute; left: 30%; top: 60cqh; width: 65%; height: 5cqh; } }</style>
  <h1 data-texte="titre"></h1>
  <div id="mur" data-obstacle="video"></div>
</section>`);
  ecrire(dir, 'scenes/02-b.html', `<section data-scene="b">
  <style>@scope { #source { position: absolute; left: 75cqh; top: 50cqh; width: 30cqh; height: 1cqh; } }</style>
  <h1 data-texte="titre"></h1>
  <div id="source"></div>
  <div data-effet="pose" data-ancre="#source" data-start="0.3" data-dur="0.1"></div>
</section>`);
  const r = await page(dir, `
    const pendant = await etat('b', 1.9);
    const apres = await etat('b', 2.3);
    envoyer({ webgpu: true, pendant, apres, decrit: M.particules.decrire('b') });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.decrit[0].collisions, true, 'un obstacle « video » voisin active les collisions');
  // Table de b : sol, murs, puis le mur de a (indice 3). Dessus du mur à 60 cqh dans le repère de b.
  const posees = r.pendant.filter((p) => p.obstacle === 3);
  assert.ok(posees.length >= 20, `${posees.length} particules posées sur le mur de la scène a`);
  assert.ok(posees.every((p) => Math.abs(p.y - (60 - 0.3)) < 0.05), JSON.stringify(posees.map((p) => p.y)));
  // Après la transition, la scène a est masquée : son mur disparaît, les particules repartent.
  assert.ok(r.apres.every((p) => p.obstacle !== 3), 'plus aucune particule posée sur un obstacle masqué');
});
