'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};

test("page : fluide qui réfracte la scène (alerte avant la photographie, photographie exacte à l'export, même image par deux chemins, libérée avec l'effet)", async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'effets/flaque.json', { version: 1, nom: 'flaque', rendu_calque: { bloom: 0, tons: 'neutre' }, emetteurs: [{ nom: 'f',
    naissance: { salves: [{ t: 0, nombre: 1600 }], forme: { type: 'ancre' }, vie: [2.5, 2.5], taille: [1.4, 1.4] },
    rendu: { type: 'fluide', teinte: '#ffffff', opacite: 0.1, absorption: 0.2, refraction: 0.8, lissage: 0.6 } }] });
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <style>@scope {
    #rayures { position: absolute; left: 0; top: 0; width: 178cqh; height: 100cqh; background: repeating-linear-gradient(90deg, #ff0000 0 2cqh, #00ff00 2cqh 4cqh); }
    #bassin { position: absolute; left: 60cqh; top: 40cqh; width: 40cqh; height: 20cqh; }
  }</style>
  <div id="rayures" data-start="0"></div>
  <div id="bassin" data-start="0"></div>
  <div data-effet="flaque" data-ancre="#bassin" data-start="0" data-dur="3"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const html = a.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const alerte = M.particules.alertes.filter((m) => /réfraction du fluide ignorée/.test(m));
    M.modeCapture(true);
    await M.seek(1);
    const r1 = M.particules.refraction('s');
    const a = await M.particules.lirePixels('s', 'avant');
    await M.seek(0.4);
    await M.seek(2);
    await M.seek(1);
    const b = await M.particules.lirePixels('s', 'avant');
    let ecart = 0;
    for (let i = 0; i < a.donnees.length; i++) ecart = Math.max(ecart, Math.abs(a.donnees[i] - b.donnees[i]));
    const y = Math.floor(a.hauteur * 0.5);
    let rouges = 0;
    let verts = 0;
    for (let x = Math.floor(a.largeur * 0.36); x < Math.floor(a.largeur * 0.54); x++) {
      const k = (y * a.largeur + x) * 4;
      if (a.donnees[k + 3] < 128) continue;
      if (a.donnees[k] > a.donnees[k + 1] + 60) rouges++;
      if (a.donnees[k + 1] > a.donnees[k] + 60) verts++;
    }
    // Effet fini (salve à 0, vie 2,5 s) : simulation libérée, photographie de réfraction aussi.
    await M.seek(5.9);
    const r2 = M.particules.refraction('s');
    await envoyer({ webgpu: true, alerte, r1, r2, ecart, rouges, verts });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html, { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.alerte, ['Scène « s » : réfraction du fluide ignorée tant que la photographie de la scène n\'est pas prête.'], 'alerte de la console avant la première photographie (aperçu)');
  assert.deepEqual(r.r1, { t: 1, exact: true }, 'photographie exacte à l\'instant de l\'export');
  assert.equal(r.ecart, 0, 'même image au bit près par deux chemins');
  assert.equal(r.r2, null, "photographie de réfraction libérée avec l'effet");
  assert.ok(r.rouges >= 10 && r.verts >= 10, `bandes de la scène vues à travers le fluide : ${r.rouges} rouges, ${r.verts} vertes`);
});
