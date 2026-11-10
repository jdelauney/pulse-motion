'use strict';
/* S8 J5 « Shaders » (spec Styles et réalisation, 5.9) : les six shaders nouveaux dans une vraie vidéo. Compilation par
 * le contrôle --gpu ; même instant, même image (preuve de lib/determinisme.js : deux pages, deux ordres) ; même image par
 * la composition (export fidèle) et par la capture rapide. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../moteur/shaders/code.js');
const { assembler } = require('../scripts/assembler.js');
const { controlerComplet } = require('../scripts/controler.js');
const D = require('../scripts/lib/determinisme.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { rgb } = require('../scripts/lib/images.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const CAPTURE = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'capture.js'), 'utf8');
const NOUVEAUX = ['cathodique', 'fuite-lumiere', 'brulure', 'lentille', 'iris', 'deformation'];
const TRANSITIONS = [['b', 'fuite-lumiere'], ['c', 'brulure'], ['d', 'lentille'], ['e', 'iris'], ['f', 'deformation']];
const COULEURS = { a: '#e63946', b: '#2a9d8f', c: '#264653', d: '#f4a261', e: '#8338ec', f: '#ffbe0b' };
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), contenu);
};

/** Six scènes de 2 s (fond de couleur, motif et titre) ; b à f entrent par les cinq transitions nouvelles (1 s) ; la
 *  scène a porte la passe cathodique (allumage, bande de bruit), la vidéo une passe cathodique légère. */
function projet() {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, fichier: `scenes/${id}.html`, duree: 2, textes: {} }));
    for (const [id, shader] of TRANSITIONS) d.scenes.find((s) => s.id === id).transition = { shader, duree: 1, ...(shader === 'iris' ? { reglages: { forme: 2 } } : {}) };
    d.scenes[0].post = [{ shader: 'cathodique', reglages: { allumage: 0.5, bruit_bande: 0.5 } }];
    d.post = [{ shader: 'cathodique', reglages: { force: 0.4 } }];
  });
  for (const [id, couleur] of Object.entries(COULEURS)) {
    ecrire(dir, `scenes/${id}.html`, `<section data-scene="${id}"><div style="position:absolute;inset:0;background:${couleur}"></div>`
      + '<div style="position:absolute;left:20cqh;top:20cqh;width:40cqh;height:40cqh;border-radius:50%;background:#ffffff"></div>'
      + `<h2 style="position:absolute;left:70cqh;top:30cqh;margin:0;font:700 12cqh sans-serif;color:#111">${id.toUpperCase()}</h2></section>`);
  }
  return dir;
}

test('shaders : 6 nouveaux, fiches valides, compilent avec --gpu', async (t) => {
  const charge = (nom) => ({ json: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shaders', `${nom}.json`), 'utf8')),
    code: fs.readFileSync(path.join(__dirname, '..', 'shaders', `${nom}.wgsl`), 'utf8') });
  for (const nom of NOUVEAUX) assert.deepEqual(S.validerShader(nom, charge(nom).json, charge(nom).code), [], nom);
  const dir = projet();
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.deepEqual([...new Set(a.donnees.shaders.map((s) => s.nom))].sort(), [...NOUVEAUX].sort(), 'les six dans la page');
  const options = await optionsWebGPU();
  if (!options) return t.skip('WebGPU indisponible sans fenêtre');
  process.env.PM_OPTIONS_WEBGPU = options.join(' ');
  const c = await controlerComplet({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false, corriger: false, rendu: false, gpu: true });
  assert.deepEqual(c.problemes.filter((p) => /^shader/.test(p.regle)), [], 'compilés par le contrôle --gpu, sans erreur');
});

test('shaders : même instant, même image (deux rendus identiques)', async (t) => {
  const navigateur = trouverNavigateur();
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  const options = await optionsWebGPU();
  if (!options) return t.skip('WebGPU indisponible sans fenêtre');
  process.env.PM_OPTIONS_WEBGPU = options.join(' ');
  const a = assembler({ dossier: projet(), dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const dossier = dossierTemporaire('pm-s8-preuve-');
  const fichierHtml = path.join(dossier, 'page.html');
  fs.writeFileSync(fichierHtml, a.html, 'utf8');
  // Allumage et bande de bruit (scène a), puis le milieu et un quart de chaque transition (b à f : de 2 s en 2 s).
  const instants = [{ scene: 'a', t: 0.2 }, { scene: 'a', t: 1 }];
  for (const [i, [id]] of TRANSITIONS.entries()) {
    const debut = 2 * (i + 1) - (i + 1);
    instants.push({ scene: id, t: debut + 0.3 }, { scene: id, t: debut + 0.5 });
  }
  instants.sort((x, y) => x.t - y.t);
  // psnrMin infini : une image qui diffère d'un seul octet est un problème (aucune tolérance de tremblement).
  const r = await D.prouver({ fichierHtml, instants, gpu: true, navigateur, ouvrir: ouvrirCapture, largeur: 640, hauteur: 360, psnrMin: Infinity, pagesMax: 6 });
  assert.deepEqual(r.problemes, [], JSON.stringify(r.problemes));
  assert.deepEqual(r.nonFaites, []);
  assert.equal(r.pages, 2, 'une page froide, une page chauffée, à l\'octet près');
  // Les captures ont bien dessiné les shaders (et non le fondu de repli) : à mi-parcours de la lentille, cœur noir au centre.
  const page = await ouvrirCapture({ fichierHtml, largeur: 640, hauteur: 360, navigateur, gpu: true });
  let image;
  try { image = rgb(await page.capturer(3.5)); } finally { await page.fermer(); }
  const o = (180 * image.largeur + 320) * 3;
  assert.ok(Math.max(image.rgb[o], image.rgb[o + 1], image.rgb[o + 2]) < 40, `lentille dessinée par le shader (${image.rgb.slice(o, o + 3)})`);
});

test('shaders : même image par la composition (export fidèle) et par la capture rapide', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const a = assembler({ dossier: projet(), dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const html = a.html.replace('<head>', `<head><script>${CAPTURE.replace(/<\/script/gi, '<\\/script')}</script>`).replace('</body>', `<script>
(async () => {
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
try {
  await M.pret;
  await M.particules.pret;
  if (!M.particules.disponible) { await envoyer({ webgpu: false }); return; }
  M.modeCapture(true);
  // Comme l'export rapide (moteur/export.mjs, preparerScene) : la scène à la taille exportée, en pixels entiers.
  const scene = document.getElementById('pm-scene');
  document.documentElement.classList.add('pm-export');
  scene.style.cssText += ';flex:none;width:640px !important;height:360px;max-width:none;';
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const res = [];
  for (const t of [0.2, 1, 1.5, 2.5, 3.5, 4.5, 5.5]) {
    await M.seek(t);
    const p = await M.shaders.lireComposition();
    const premiere = p.donnees.slice();
    await M.seek(0.05);
    await M.seek(t);
    const seconde = (await M.shaders.lireComposition()).donnees;
    let ecart = 0;
    for (let i = 0; i < premiere.length; i++) ecart = Math.max(ecart, Math.abs(premiere[i] - seconde[i]));
    ctx.clearRect(0, 0, c.width, c.height);
    await M.capturer(ctx, c.width, c.height);
    const cap = ctx.getImageData(0, 0, c.width, c.height).data;
    let somme = 0; let n = 0; let pire = 0;
    if (p.largeur === c.width && p.hauteur === c.height) {
      for (let i = 0; i < cap.length; i++) { const d = Math.abs(cap[i] - premiere[i]); somme += d; n++; if (d > pire) pire = d; }
    }
    res.push({ t, ecart, taille: [p.largeur, p.hauteur, c.width, c.height], moyenne: n ? somme / n : null, pire });
  }
  await envoyer({ webgpu: true, res });
} catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html, { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  for (const x of r.res) {
    assert.equal(x.ecart, 0, `${x.t} s : même image après un aller-retour`);
    assert.notEqual(x.moyenne, null, `${x.t} s : tailles ${x.taille}`);
    assert.ok(x.moyenne < 0.5 && x.pire <= 3, `${x.t} s : capture rapide = composition (écart moyen ${x.moyenne}, pire ${x.pire})`);
  }
});
