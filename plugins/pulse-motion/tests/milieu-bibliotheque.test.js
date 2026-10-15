'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const BIBLIOTHEQUE = path.join(__dirname, '..', 'effets');

test('bibliothèque dans la page : air (avec braises-portees et fusee-panache), brasier, eau-encre ; simulés, dessinés, même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 's', fichier: 'scenes/01-s.html', duree: 4 },
      { id: 'f', fichier: 'scenes/02-f.html', duree: 4 },
      { id: 'e', fichier: 'scenes/03-e.html', duree: 4 },
    ];
  });
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <style>@scope {
    #pave { position: absolute; left: 70cqh; top: 40cqh; width: 38cqh; height: 6cqh; }
    #foyer { position: absolute; left: 74cqh; top: 74cqh; width: 30cqh; height: 14cqh; }
    #rampe { position: absolute; left: 20cqh; top: 85cqh; width: 30cqh; height: 6cqh; }
  }</style>
  <div id="pave" data-obstacle data-start="0"></div>
  <div id="foyer" data-start="0"></div>
  <div id="rampe" data-start="0"></div>
  <div data-milieu="air" data-start="0" data-dur="4"></div>
  <div data-effet="braises-portees" data-ancre="#foyer" data-start="0.5" data-dur="3"></div>
  <div data-effet="fusee-panache" data-ancre="#rampe" data-start="1" data-dur="2"></div>
</section>`);
  fs.writeFileSync(path.join(dir, 'scenes', '02-f.html'), `<section data-scene="f">
  <div data-milieu="brasier" data-calque="avant" data-start="0" data-dur="4"></div>
</section>`);
  fs.writeFileSync(path.join(dir, 'scenes', '03-e.html'), `<section data-scene="e">
  <div data-milieu="eau-encre" data-start="0" data-dur="4"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: BIBLIOTHEQUE, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const html = a.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  const couverts = (p) => { let n = 0; for (let i = 3; i < p.donnees.length; i += 4) if (p.donnees[i] > 0) n++; return n; };
  const brillants = (p) => { let n = 0; for (let i = 0; i < p.donnees.length; i += 4) if (p.donnees[i] > 200 && p.donnees[i + 1] > 120) n++; return n; };
  const ecart = (a, b) => { let e = 0; for (let i = 0; i < a.donnees.length; i++) e = Math.max(e, Math.abs(a.donnees[i] - b.donnees[i])); return e; };
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    M.modeCapture(true);
    await M.seek(2);
    const s = { milieu: M.particules.decrireMilieu('s'), effets: M.particules.decrire('s').map((d) => ({ nom: d.nom, actif: d.actif, couple: d.couple })) };
    const arriere = await M.particules.lirePixels('s', 'arriere');
    const avant = await M.particules.lirePixels('s', 'avant');
    s.fumee = couverts(arriere);
    s.particules = couverts(avant);
    await M.seek(6);
    const f = { milieu: M.particules.decrireMilieu('f'), brillants: brillants(await M.particules.lirePixels('f', 'avant')) };
    await M.seek(10);
    const e = { milieu: M.particules.decrireMilieu('e'), encre: couverts(await M.particules.lirePixels('e', 'arriere')) };
    await M.seek(2.5);
    await M.seek(1);
    await M.seek(2);
    const ecartS = Math.max(ecart(arriere, await M.particules.lirePixels('s', 'arriere')), ecart(avant, await M.particules.lirePixels('s', 'avant')));
    await envoyer({ webgpu: true, s, f, e, ecartS });
  } catch (err) { envoyer({ erreur: String(err && err.stack || err) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html, { delai: 300000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual([r.s.milieu.nom, r.s.milieu.actif, r.s.milieu.desactive, r.s.milieu.couples], ['air', true, null, [0, 1]]);
  assert.deepEqual(r.s.effets, [
    { nom: 'braises-portees', actif: true, couple: true },
    { nom: 'fusee-panache', actif: true, couple: true },
  ]);
  assert.ok(r.s.fumee > 30000, `${r.s.fumee} pixels de fumée`);
  assert.ok(r.s.particules > 300, `${r.s.particules} pixels de braises et de fusées`);
  assert.deepEqual([r.f.milieu.nom, r.f.milieu.actif, r.f.milieu.calque], ['brasier', true, 'avant']);
  assert.ok(r.f.brillants > 2000, `${r.f.brillants} pixels de feu brillant`);
  assert.deepEqual([r.e.milieu.nom, r.e.milieu.actif], ['eau-encre', true]);
  assert.ok(r.e.encre > 5000, `${r.e.encre} pixels d'encre`);
  assert.equal(r.ecartS, 0, 'même image au bit près par deux chemins');
});
