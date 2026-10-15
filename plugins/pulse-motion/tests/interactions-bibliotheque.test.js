'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const BIBLIOTHEQUE = path.join(__dirname, '..', 'effets');

test('bibliothèque dans la page : eau sur un sol déclaré, sable, nuée ; simulés, dessinés, même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <style>@scope {
    #sol { position: absolute; left: 0; top: 90cqh; width: 178cqh; height: 10cqh; }
    #robinet { position: absolute; left: 30cqh; top: 10cqh; width: 6cqh; height: 4cqh; }
    #sablier { position: absolute; left: 110cqh; top: 10cqh; width: 4cqh; height: 4cqh; }
    #ciel { position: absolute; left: 60cqh; top: 20cqh; width: 40cqh; height: 30cqh; }
  }</style>
  <div id="sol" data-obstacle data-start="0"></div>
  <div id="robinet" data-start="0"></div>
  <div id="sablier" data-start="0"></div>
  <div id="ciel" data-start="0"></div>
  <div data-effet="eau" data-ancre="#robinet" data-start="0" data-dur="1.5" data-reglages="nombre: 1500"></div>
  <div data-effet="sable" data-ancre="#sablier" data-start="0" data-dur="1.5" data-reglages="nombre: 1000"></div>
  <div data-effet="nuee" data-ancre="#ciel" data-calque="arriere" data-start="0" data-dur="3" data-reglages="nombre: 150"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: BIBLIOTHEQUE, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const html = a.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    M.modeCapture(true);
    await M.seek(2);
    const effets = M.particules.decrire('s').map((d) => ({ nom: d.nom, actif: d.actif, desactive: d.desactive, collisions: d.collisions }));
    const avant = await M.particules.lirePixels('s', 'avant');
    const arriere = await M.particules.lirePixels('s', 'arriere');
    const compter = (p) => { let n = 0; for (let i = 3; i < p.donnees.length; i += 4) if (p.donnees[i] > 0) n++; return n; };
    await M.seek(0.5);
    await M.seek(2.5);
    await M.seek(2);
    const encore = await M.particules.lirePixels('s', 'avant');
    let ecart = 0;
    for (let i = 0; i < avant.donnees.length; i++) ecart = Math.max(ecart, Math.abs(avant.donnees[i] - encore.donnees[i]));
    await envoyer({ webgpu: true, effets, avant: compter(avant), arriere: compter(arriere), ecart });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html, { delai: 240000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.effets, [
    { nom: 'eau', actif: true, desactive: null, collisions: true },
    { nom: 'sable', actif: true, desactive: null, collisions: true },
    { nom: 'nuee', actif: true, desactive: null, collisions: false },
  ]);
  assert.ok(r.avant > 2000, `${r.avant} pixels d'eau et de sable`);
  assert.ok(r.arriere > 100, `${r.arriere} pixels de la nuée`);
  assert.equal(r.ecart, 0, 'même image au bit près par deux chemins');
});
