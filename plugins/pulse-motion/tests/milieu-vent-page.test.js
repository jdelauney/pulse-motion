'use strict';
/* Spec S11, jalon J5 (5.8), dans Chrome ou Edge sans fenêtre, avec WebGPU : le milieu fluide d'une scène suit la piste de vent
 * (data-vent sur la scène) ; sans piste, il reste celui d'avant. Ignoré sans WebGPU. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const BIBLIOTHEQUE = path.join(__dirname, '..', 'effets');

/** Projet : un milieu de fumée (sans obstacle), la scène au vent ou non. */
function page(attributs) {
  const dir = copierProjet('projet-particules');
  fs.mkdirSync(path.join(dir, 'effets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'effets', 'air-essai.json'), JSON.stringify({ version: 1, nom: 'air-essai', rendu_calque: { bloom: 0, tons: 'neutre' },
    milieu: { resolution: 64, flottaison: 1.5, sources: [{ type: 'fumee', forme: { type: 'cercle', rayon: 8, decalage: [0, 30] }, debit: 6, temperature: 1 }],
      rendu: { type: 'fumee', couleur: '#ffffff', opacite: 1 } } }));
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s"${attributs}>
  <div data-milieu="air-essai" data-start="0.2" data-dur="3"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: BIBLIOTHEQUE, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  return a.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    M.modeCapture(true);
    await M.seek(2.4);
    const etat = await M.particules.lireMilieu('s');
    const g = M.particules.decrireMilieu('s').grille;
    const nu = (g.nx + 1) * g.ny;
    let u = 0, v = 0;
    for (let i = 0; i < nu; i++) u += etat.vitesse[i];
    for (let i = nu; i < etat.vitesse.length; i++) v += etat.vitesse[i];
    const vent = M.vent ? M.vent(2.4) : null;
    await envoyer({ webgpu: true, u: u / nu, v: v / (etat.vitesse.length - nu), vent, defini: !!(M.vent && M.vent.defini), groupes: M.groupes });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}

test('particules : avec une piste de vent, le milieu suit M.vent', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const vers = JSON.parse(await executerPage(page(' data-vent="tempete" data-vent-dir="0"'), { delai: 240000 }));
  assert.equal(vers.erreur, undefined, vers.erreur);
  if (vers.webgpu === false) return t.skip('WebGPU indisponible');
  const sans = JSON.parse(await executerPage(page(''), { delai: 240000 }));
  assert.equal(sans.erreur, undefined, sans.erreur);
  const gauche = JSON.parse(await executerPage(page(' data-vent="tempete" data-vent-dir="180"'), { delai: 240000 }));
  assert.equal(gauche.erreur, undefined, gauche.erreur);
  // La page sans vent n'a ni le module ni la piste ; avec la piste, M.vent souffle vers la droite (puis vers la gauche).
  assert.equal(sans.groupes.includes('physique'), false);
  assert.equal(sans.vent, null);
  assert.equal(vers.defini, true);
  assert.ok(vers.vent.x > 0.7 && gauche.vent.x < -0.7, JSON.stringify([vers.vent, gauche.vent]));
  // Vitesse horizontale moyenne de la grille (cqh/s) : elle suit le vent ; sans piste, presque nulle (la fumée monte).
  assert.ok(Math.abs(sans.u) < 3, `sans vent : ${sans.u}`);
  assert.ok(vers.u > 10, `vent vers la droite : ${vers.u}`);
  assert.ok(gauche.u < -10, `vent vers la gauche : ${gauche.u}`);
  assert.ok(Math.abs(vers.u + gauche.u) < 0.35 * vers.u, `symétrie : ${vers.u} et ${gauche.u}`);
});
