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

test('capture : refus sans GPU, sans image périmée', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const html = r.html.replace('<body>', '<body>\n<script>window.__PM_SANS_GPU__ = true;</script>')
    .replace('</body>', `<pre id="verdict">EN COURS</pre><script>
const calques = () => [...document.querySelectorAll('canvas.pm-calque')];
calques().forEach((c) => { c.__pmImage = 'data:image/png;base64,perime'; });
M.particules.preparerCapture().then(() => { verdict.textContent = "OK"; }, (e) => { verdict.textContent = e.message + ' | ' + calques().map((c) => String(c.__pmImage)).join(','); });
</script>\n</body>`);
  const fichier = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-export-')), 'page.html');
  fs.writeFileSync(fichier, html);
  const dom = await rendreDOM(trouverNavigateur(), fichier);
  assert.equal((/<pre id="verdict">([^<]*)<\/pre>/.exec(dom) || [])[1], 'Effet de particules non rendu (WebGPU indisponible) : export interrompu. | null,null');
});

test('capture : texture illisible, effet désactivé, export refusé ; calque vide en image 1×1 ; densité 1 en capture', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'assets/casse.png', 'pas une image');
  ecrire(dir, 'effets/casse.json', { version: 1, nom: 'casse', emetteurs: [{ nom: 'e', naissance: { salves: [{ t: 0, nombre: 5 }], forme: { type: 'point' }, vie: [10, 10] }, rendu: { texture: 'assets/casse.png' } }] });
  const f = path.join(dir, 'scenes', '01-s.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', '  <div id="casse" data-effet="casse" data-start="2"></div>\n</section>'));
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs, []);
  const code = `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const r = { webgpu: true };
    const canvas = (nom) => document.querySelector('canvas.pm-calque[data-pm-calque="' + nom + '"]');
    const taille = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok(null); i.src = src; });
    r.panneau = (document.querySelector('#casse > .pm-effet-panneau') || {}).textContent || null;
    // t = 0,2 : aucun effet commencé, les deux calques sont vides.
    await M.seek(0.2);
    await M.particules.preparerCapture();
    r.videAvant = await taille(canvas('avant').__pmImage);
    r.videArriere = await taille(canvas('arriere').__pmImage);
    // t = 1,5 : l'effet à la texture illisible n'a pas commencé, l'export passe.
    await M.seek(1.5);
    await M.particules.preparerCapture();
    r.avantDebut = await taille(canvas('avant').__pmImage);
    // t = 2,5 : l'effet désactivé est visible, l'export est refusé.
    await M.seek(2.5);
    r.refus = await M.particules.preparerCapture().then(() => 'OK', (e) => e.message);
    r.images = [canvas('avant').__pmImage, canvas('arriere').__pmImage];
    // Écran haute densité : calques au double en aperçu, un pixel par pixel CSS en capture.
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const largeurCSS = document.querySelector('section[data-scene="s"]').clientWidth;
    await M.seek(1);
    r.dprApercu = canvas('avant').width / largeurCSS;
    M.modeCapture(true);
    await M.seek(1);
    r.dprCapture = canvas('avant').width / largeurCSS;
    M.modeCapture(false);
    envoyer(r);
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>`;
  const r = JSON.parse(await executerPage(a.html.replace('</body>', `${code}\n</body>`)));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.webgpu, true);
  assert.equal(r.panneau, 'Effet non affiché : texture illisible');
  assert.deepEqual(r.videAvant, [1, 1]);
  assert.deepEqual(r.videArriere, [1, 1]);
  assert.ok(r.avantDebut && r.avantDebut[0] > 1, `calque dessiné en pleine taille : ${r.avantDebut}`);
  assert.equal(r.refus, 'Effet de particules non rendu (texture illisible) : export interrompu.');
  assert.deepEqual(r.images, [null, null]);
  assert.equal(r.dprApercu, 2);
  assert.equal(r.dprCapture, 1, 'calques au devicePixelRatio 1 pendant l\'export');
});
