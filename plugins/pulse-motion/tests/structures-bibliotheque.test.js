'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const BIBLIOTHEQUE = path.join(__dirname, '..', 'effets');

test('bibliothèque dans la page : drapeau, bannière, rideau, guirlande, filet, corde ; simulés, dessinés, même image par deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'PULSE' }; });
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <style>@scope {
    #pavillon { position: absolute; left: 8cqh; top: 8cqh; width: 30cqh; height: 20cqh; }
    #titre { position: absolute; left: 50cqh; top: 6cqh; margin: 0; font: 900 14cqh/1 sans-serif; color: #e04020; }
    #ecran { position: absolute; left: 110cqh; top: 8cqh; width: 40cqh; height: 25cqh; }
    .fil { position: absolute; left: 10cqh; top: 45cqh; width: 50cqh; height: 4cqh; }
    #cadre { position: absolute; left: 70cqh; top: 50cqh; width: 40cqh; height: 12cqh; }
    .potence { position: absolute; left: 130cqh; top: 45cqh; width: 20cqh; height: 2cqh; }
    #sol { position: absolute; left: 0; top: 92cqh; width: 178cqh; height: 8cqh; }
  }</style>
  <div id="pavillon" data-start="0"></div>
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <div id="ecran" data-start="0"></div>
  <div id="cadre" data-start="0"></div>
  <div id="sol" data-obstacle data-start="0"></div>
  <div data-effet="drapeau" data-ancre="#pavillon" data-start="0" data-dur="3"></div>
  <div data-effet="banniere" data-ancre="#titre" data-start="0" data-dur="3" data-reglages="chute: 0.5"></div>
  <div data-effet="rideau" data-ancre="#ecran" data-start="0" data-dur="3"></div>
  <div class="fil" data-effet="guirlande" data-start="0" data-dur="3"></div>
  <div data-effet="filet" data-ancre="#cadre" data-start="0" data-dur="3"></div>
  <div class="potence" data-effet="corde" data-start="0" data-dur="3"></div>
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
    let couverts = 0;
    for (let i = 3; i < avant.donnees.length; i += 4) if (avant.donnees[i] > 0) couverts++;
    const titreCache = document.getElementById('titre').classList.contains('pm-fragment-cache');
    await M.seek(0.5);
    await M.seek(2.5);
    await M.seek(2);
    const encore = await M.particules.lirePixels('s', 'avant');
    let ecart = 0;
    for (let i = 0; i < avant.donnees.length; i++) ecart = Math.max(ecart, Math.abs(avant.donnees[i] - encore.donnees[i]));
    await envoyer({ webgpu: true, effets, couverts, titreCache, ecart });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html, { delai: 240000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.effets, [
    { nom: 'drapeau', actif: true, desactive: null, collisions: false },
    { nom: 'banniere', actif: true, desactive: null, collisions: true },
    { nom: 'rideau', actif: true, desactive: null, collisions: false },
    { nom: 'guirlande', actif: true, desactive: null, collisions: false },
    { nom: 'filet', actif: true, desactive: null, collisions: true },
    { nom: 'corde', actif: true, desactive: null, collisions: false },
  ]);
  assert.ok(r.couverts > 8000, `${r.couverts} pixels de cordes et de tissus`);
  assert.equal(r.titreCache, true, 'la bannière remplace son titre');
  assert.equal(r.ecart, 0, 'même image au bit près par deux chemins');
});
