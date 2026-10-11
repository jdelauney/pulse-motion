'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const CODE = `
<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const lire = async (t, calque = 'avant') => { await M.seek(t); return M.particules.lirePixels('s', calque); };
    const egal = (a, b) => a.largeur === b.largeur && a.hauteur === b.hauteur && a.donnees.every((x, i) => x === b.donnees[i]);
    const somme = (p) => { let s = 0; for (const x of p.donnees) s += x; return s; };
    const r = { webgpu: true };
    await M.seek(0);
    const direct = await lire(2.2);
    await M.seek(5);
    const detour = await lire(2.2);
    r.deterministe = egal(direct, detour);
    r.nonVide = somme(direct) > 0;
    r.videAvant = somme(await lire(0.2)) === 0;
    r.videApres = somme(await lire(5)) === 0;
    r.arriere = somme(await lire(1.5, 'arriere')) > 0;
    r.finDeScene = somme(await lire(5.9, 'arriere')) > 0;
    r.calques = [...document.querySelectorAll('.pm-calque')].map((c) => c.getAttribute('data-pm-calque') + ':' + getComputedStyle(c).zIndex).sort();
    const avantPerte = await lire(2.2);
    M.particules.device.destroy();
    await new Promise((ok) => setTimeout(ok, 200));
    await M.particules.pret;
    r.apresPerte = M.particules.disponible && egal(avantPerte, await lire(2.2));
    envoyer(r);
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>`;

function page(dir) {
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  return r.html;
}

test('calques : image reproductible, vide hors fenêtre, calques ordonnés, reprise après perte du GPU', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = page(copierProjet('projet-particules')).replace('</body>', `${CODE}\n</body>`);
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.webgpu, true);
  assert.equal(r.nonVide, true, 'des particules sont dessinées à 2,2 s');
  assert.equal(r.deterministe, true, 'même image par 0 → 2,2 et par 5 → 2,2 (ancre animée)');
  assert.equal(r.videAvant, true);
  assert.equal(r.videApres, true);
  assert.equal(r.arriere, true);
  assert.equal(r.finDeScene, true);
  assert.deepEqual(r.calques, ['arriere:-1', 'avant:1000']);
  assert.equal(r.apresPerte, true);
});

test('sans WebGPU : panneau sur chaque effet, panneau d\'erreur, page lisible', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  const scene = fs.readFileSync(path.join(dir, 'scenes', '01-s.html'), 'utf8').replace('</section>', '  <div data-effet="inconnu"></div>\n</section>');
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), scene);
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const html = r.html.replace('<body>', '<body>\n<script>window.__PM_SANS_GPU__ = true;</script>');
  const fichier = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-sans-gpu-')), 'page.html');
  fs.writeFileSync(fichier, html);
  const dom = await rendreDOM(trouverNavigateur(), fichier);
  const panneaux = dom.match(/class="pm-effet-panneau">[^<]*/g) || [];
  assert.equal(panneaux.filter((p) => /Effet non affiché : WebGPU indisponible\. Ouvrez la vidéo dans Chrome ou Edge récent\./.test(p)).length, 3);
  assert.equal(panneaux.filter((p) => /Effet « inconnu » introuvable/.test(p)).length, 1);
  assert.match(dom, /data-pm-pret/);
});
