'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const BIBLIOTHEQUE = path.join(__dirname, '..', 'effets');
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};

/** Projet : milieu de fumée blanche (calque arrière) avec un pavé déclaré obstacle, braises couplées (calque avant) qui
 *  commencent avant le milieu. */
function projet(scene) {
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'effets/air-essai.json', { version: 1, nom: 'air-essai', rendu_calque: { bloom: 0, tons: 'neutre' },
    milieu: { resolution: 64, flottaison: 1.5, sources: [{ type: 'fumee', forme: { type: 'cercle', rayon: 8, decalage: [0, 30] }, debit: 6, temperature: 1 }],
      rendu: { type: 'fumee', couleur: '#ffffff', opacite: 1 } } });
  ecrire(dir, 'effets/braises-essai.json', { version: 1, nom: 'braises-essai', rendu_calque: { bloom: 0, tons: 'neutre' },
    emetteurs: [{ nom: 'b', naissance: { debit: 60, vie: [2, 2], taille: [0.8, 0.8] }, forces: [{ type: 'gravite', valeur: 10 }, { type: 'milieu', coef: 3 }],
      vie: { couleur: '#ff8020' }, rendu: { type: 'sprite', texture: 'disque-doux', melange: 'alpha' } }] });
  ecrire(dir, 'scenes/01-s.html', scene);
  return dir;
}

function page(dir, script) {
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: BIBLIOTHEQUE, ecrire: false });
  return { a, html: a.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  const couverts = (p) => { let n = 0; for (let i = 3; i < p.donnees.length; i += 4) if (p.donnees[i] > 0) n++; return n; };
  const ecart = (a, b) => { let e = 0; for (let i = 0; i < a.donnees.length; i++) e = Math.max(e, Math.abs(a.donnees[i] - b.donnees[i])); return e; };
  try {
${script}
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`) };
}

test('milieu dans la page : simulé avec l\'effet couplé, dessiné dans son calque, obstacle contourné, même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const { a, html } = page(projet(`<section data-scene="s">
  <style>@scope {
    #pave { position: absolute; left: 74cqh; top: 45cqh; width: 30cqh; height: 6cqh; }
    .foyer { position: absolute; left: 79cqh; top: 70cqh; width: 20cqh; height: 15cqh; }
  }</style>
  <div id="pave" data-obstacle data-start="0"></div>
  <div data-milieu="air-essai" data-start="0.5" data-dur="3"></div>
  <div class="foyer" data-effet="braises-essai" data-calque="avant" data-start="0.2" data-dur="3"></div>
</section>`), `
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    M.modeCapture(true);
    await M.seek(2);
    const milieu = M.particules.decrireMilieu('s');
    const effets = M.particules.decrire('s').map((d) => ({ nom: d.nom, actif: d.actif, couple: d.couple }));
    const arriere = await M.particules.lirePixels('s', 'arriere');
    const avant = await M.particules.lirePixels('s', 'avant');
    const etat = await M.particules.lireMilieu('s');
    let pleines = 0, dedans = 0;
    for (let c = 0; c < etat.solide.length / 4; c++) if (etat.solide[c * 4] > 0.5) { pleines++; dedans += etat.scalaires[c * 8]; }
    await M.seek(0.1);
    const avantDebut = M.particules.decrireMilieu('s').actif;
    await M.seek(3.2);
    await M.seek(1.2);
    await M.seek(2);
    const arriere2 = await M.particules.lirePixels('s', 'arriere');
    const avant2 = await M.particules.lirePixels('s', 'avant');
    await envoyer({ webgpu: true, milieu, effets, couvertsArriere: couverts(arriere), couvertsAvant: couverts(avant), pleines, dedans, avantDebut,
      ecart: Math.max(ecart(arriere, arriere2), ecart(avant, avant2)) });`);
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const r = JSON.parse(await executerPage(html, { delai: 240000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual([r.milieu.nom, r.milieu.calque, r.milieu.debut, r.milieu.fin, r.milieu.actif, r.milieu.desactive, r.milieu.couples], ['air-essai', 'arriere', 0.5, 3.5, true, null, [0]]);
  assert.deepEqual([r.milieu.grille.nx, r.milieu.grille.ny], [64, 36]);
  assert.deepEqual(r.effets, [{ nom: 'braises-essai', actif: true, couple: true }]);
  assert.ok(r.couvertsArriere > 20000, `${r.couvertsArriere} pixels de fumée`);
  assert.ok(r.couvertsAvant > 500, `${r.couvertsAvant} pixels de braises`);
  assert.ok(r.pleines > 10, `${r.pleines} cellules du pavé`);
  assert.equal(r.dedans, 0, 'aucune fumée dans le pavé');
  assert.equal(r.avantDebut, false, 'hors de la fenêtre du groupe : libéré');
  assert.equal(r.ecart, 0, 'même image au bit près par deux chemins');
});

test('milieu dans la page : panneaux d\'erreur (deux milieux, couplage sans milieu), scène d\'un milieu seul (calque créé)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const { html } = page(projet(`<section data-scene="s">
  <div data-milieu="air-essai" data-start="0" data-dur="2"></div>
  <div id="second" data-milieu="air-essai" data-start="0"></div>
</section>`), `
    await M.particules.pret;
    const panneaux = Array.from(document.querySelectorAll('#second > .pm-effet-panneau')).map((p) => p.textContent);
    if (!M.particules.disponible) return envoyer({ webgpu: false, panneaux });
    M.modeCapture(true);
    await M.seek(1);
    const p = await M.particules.lirePixels('s', 'arriere');
    await envoyer({ webgpu: true, panneaux, couverts: couverts(p) });`);
  const r = JSON.parse(await executerPage(html, { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.panneaux.length, 1);
  assert.match(r.panneaux[0], /un seul milieu par scène/);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.couverts > 5000, 'le premier milieu, seul dans sa scène, est dessiné');
});
