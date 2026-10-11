'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { optionsChrome } = require('../scripts/lib/navigateur.js');
const { avecEffets } = require('../scripts/exporter.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const CAPTURE = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'capture.js'), 'utf8');
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};

test('options de Chrome : GPU seulement pour les vidéos avec effets', () => {
  assert.ok(optionsChrome({}).includes('--disable-gpu'));
  const gpu = optionsChrome({ gpu: true });
  assert.ok(!gpu.includes('--disable-gpu'));
  assert.ok(gpu.includes('--enable-unsafe-webgpu'));
  const avec = copierProjet('projet-particules');
  assert.equal(avecEffets(avec, lireDeroule(avec).deroule), true);
  const sans = copierProjet('projet-simple');
  assert.equal(avecEffets(sans, lireDeroule(sans).deroule), false);
});

test('verifierExport sans WebGPU : message clair', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const html = r.html.replace('<body>', '<body>\n<script>window.__PM_SANS_GPU__ = true;</script>')
    .replace('</body>', '<pre id="verdict">EN COURS</pre><script>M.particules.verifierExport().then(() => { verdict.textContent = "OK"; }, (e) => { verdict.textContent = e.message; });</script>\n</body>');
  const fichier = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-export-')), 'page.html');
  fs.writeFileSync(fichier, html);
  const dom = await rendreDOM(trouverNavigateur(), fichier);
  assert.match(dom, /<pre id="verdict">Cette vidéo contient des effets de particules, qui demandent WebGPU : ouvrez l'aperçu dans Chrome ou Edge récent pour l'exporter\.<\/pre>/);
});

test('capture : les particules entrent dans l\'image, le calque arrière reste sous le contenu', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  const point = (nom, couleur, calque) => ({ version: 1, nom, rendu_calque: { bloom: 0 }, emetteurs: [{ nom: 'e', naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vie: [10, 10], taille: [20, 20] }, vie: { couleur }, rendu: { melange: 'alpha' } }] });
  ecrire(dir, 'effets/rouge.json', point('rouge', '#ff0000'));
  ecrire(dir, 'effets/bleu.json', point('bleu', '#0000ff'));
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <style>@scope { .cache { position: absolute; left: 0; top: 0; width: 30%; height: 100%; background: #ffffff; } #gauche { position: absolute; left: 5%; top: 40%; width: 10%; height: 20%; } #droite { position: absolute; left: 70%; top: 40%; width: 10%; height: 20%; } }</style>
  <div class="cache"></div>
  <div id="gauche"></div><div id="droite"></div>
  <h1 data-texte="titre"></h1>
  <div data-effet="bleu" data-ancre="#gauche" data-calque="arriere"></div>
  <div data-effet="rouge" data-ancre="#droite"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs, []);
  const code = `<script>${CAPTURE}</script>
<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const L = 640, H = 360;
    const scene = document.getElementById('pm-scene');
    scene.style.flex = 'none'; scene.style.width = L + 'px'; scene.style.height = H + 'px';
    const canvas = document.createElement('canvas'); canvas.width = L; canvas.height = H;
    const ctx = canvas.getContext('2d');
    await M.seek(1);
    const t0 = performance.now();
    await M.capturer(ctx, L, H);
    const duree = performance.now() - t0;
    const px = (x, y) => Array.from(ctx.getImageData(Math.round(x * L), Math.round(y * H), 1, 1).data);
    const bitmap = await M.particules.image('s', 'avant');
    envoyer({ droite: px(0.75, 0.5), gauche: px(0.10, 0.5), image: [bitmap.width, bitmap.height], duree });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>`;
  const r = JSON.parse(await executerPage(a.html.replace('</body>', `${code}\n</body>`)));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.ok(r.droite[0] > 200 && r.droite[1] < 60 && r.droite[2] < 60, `particule rouge capturée : ${r.droite}`);
  assert.ok(r.gauche[0] > 240 && r.gauche[1] > 240 && r.gauche[2] > 240, `particule bleue cachée sous le bloc blanc : ${r.gauche}`);
  assert.deepEqual(r.image, [640, 360]);
  t.diagnostic(`capture d'une image avec deux calques : ${Math.round(r.duree)} ms`);
});
