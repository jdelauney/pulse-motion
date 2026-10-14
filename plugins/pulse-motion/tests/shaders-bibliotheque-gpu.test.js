'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const S = require('../moteur/shaders/code.js');
const { chargeurShaders, donneeShader } = require('../scripts/lib/shaders.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const DOSSIER = path.join(__dirname, '..', 'shaders');
const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js', 'particules/rendu.js', 'shaders/code.js', 'particules/shaders.js'];
const charger = chargeurShaders(dossierTemporaire('pm-sh-vide-'), DOSSIER);
const donnee = (nom) => {
  const src = charger(nom);
  return donneeShader(src, { usage: src.json.usage, valeurs: S.valeursShader(src.json, '', CHARTE).valeurs });
};

/** Page : cible rgba16float de 160 × 90, textures A (rouge), B (bleue), damier gris ; dessin et lecture d'un shader. */
const COMMUN = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const sh = new P.Shaders(device);
const L = 160;
const H = 90;
const LCQH = L / H * 100;
const T = GPUTextureUsage;
const cible = device.createTexture({ size: [L, H], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
function texture(l, h, f) {
  const t = device.createTexture({ size: [l, h], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
  const d = new Uint8Array(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) d.set(f(x, y), (y * l + x) * 4);
  device.queue.writeTexture({ texture: t }, d, { bytesPerRow: l * 4 }, [l, h]);
  return t.createView();
}
const A = texture(1, 1, () => [255, 0, 0, 255]);
const B = texture(1, 1, () => [0, 0, 255, 255]);
const DAMIER = texture(64, 36, (x, y) => (((x >> 3) + (y >> 3)) % 2 ? [204, 204, 204, 255] : [51, 51, 51, 255]));
function demi(h) {
  const s = (h & 0x8000) ? -1 : 1; const e = (h >> 10) & 0x1f; const m = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}
async function dessiner(shader, entrees, canaux = null, genre = 'composition') {
  const enc = device.createCommandEncoder();
  const p = enc.beginRenderPass({ colorAttachments: [{ view: cible.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
  sh.dessiner(p, shader, entrees, canaux, genre);
  p.end();
  const ligne = Math.ceil(L * 8 / 256) * 256;
  const tampon = device.createBuffer({ size: ligne * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  enc.copyTextureToBuffer({ texture: cible }, { buffer: tampon, bytesPerRow: ligne }, [L, H]);
  device.queue.submit([enc.finish()]);
  await tampon.mapAsync(GPUMapMode.READ);
  const brut = new Uint16Array(tampon.getMappedRange());
  const px = new Float32Array(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L * 4; x++) px[y * L * 4 + x] = demi(brut[y * ligne / 2 + x]);
  tampon.unmap();
  tampon.destroy();
  return px;
}
const PLEIN = (o = {}) => Object.assign({ temps: 1, progres: 0, duree: 2, mode: 1, resolution: [LCQH, 100, L, H], scene: [LCQH, 100, L, H] }, o);
const compiler = async (d) => { const r = await sh.compiler(d); if (!r.ok) throw new Error(r.message); return r.shader; };
const nan = (px) => px.some((v) => Number.isNaN(v));
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code }), { delai: 180000 }));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('transitions : A au départ, B à l\'arrivée ; dissolution : pixels de A et de B à mi-parcours', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const noms = ['dissolution', 'ondulation', 'pixels', 'glitch', 'balayage-organique'];
  const r = await page({ liste: noms.map(donnee) }, `
const parts = (px) => { let a = 0; let b = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 0.6 && px[i + 2] < 0.4) a++; if (px[i + 2] > 0.6 && px[i] < 0.4) b++; } return [a / (L * H), b / (L * H)]; };
const res = {};
for (const d of DONNEES.liste) {
  const s = await compiler(d);
  const debut = await dessiner(s, PLEIN({ progres: 0.02, temps: 0.02 }), [A, B, null]);
  const milieu = await dessiner(s, PLEIN({ progres: 0.5, temps: 0.5 }), [A, B, null]);
  const fin = await dessiner(s, PLEIN({ progres: 0.98, temps: 0.98 }), [A, B, null]);
  res[d.nom] = { debut: parts(debut), milieu: parts(milieu), fin: parts(fin), nan: nan(debut) || nan(milieu) || nan(fin) };
}
await envoyer({ webgpu: true, res });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  for (const [nom, v] of Object.entries(r.res)) {
    assert.equal(v.nan, false, `${nom} : aucun NaN`);
    assert.ok(v.debut[0] >= 0.9, `${nom} : A au départ (${v.debut})`);
    assert.ok(v.fin[1] >= 0.9, `${nom} : B à l'arrivée (${v.fin})`);
  }
  assert.ok(r.res.dissolution.milieu[0] >= 0.05 && r.res.dissolution.milieu[1] >= 0.05, `dissolution à mi-parcours : ${r.res.dissolution.milieu}`);
});

test('post-traitements : l\'image change ; le grain change avec t', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const noms = ['grain', 'vignettage', 'aberration', 'chaleur'];
  const identite = { nom: 'identite', fichier: 'test', usage: 'post', code: 'fn post(coord: vec2f) -> vec4f { return canal0(coord / iResolution.xy); }', parametres: {}, valeurs: {}, image: null };
  const r = await page({ liste: noms.map(donnee), identite }, `
const ref = await dessiner(await compiler(DONNEES.identite), PLEIN(), [DAMIER, null, null]);
const ecart = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const res = {};
for (const d of DONNEES.liste) {
  const s = await compiler(d);
  const a = await dessiner(s, PLEIN({ temps: 1 }), [DAMIER, null, null]);
  const b = await dessiner(s, PLEIN({ temps: 1.5 }), [DAMIER, null, null]);
  res[d.nom] = { change: ecart(a, ref), temps: ecart(a, b), nan: nan(a) || nan(b) };
}
await envoyer({ webgpu: true, res });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  for (const [nom, v] of Object.entries(r.res)) {
    assert.equal(v.nan, false, `${nom} : aucun NaN`);
    assert.ok(v.change > 0.01, `${nom} : l'image change (${v.change})`);
  }
  assert.ok(r.res.grain.temps > 0.01, 'le grain change avec t');
  assert.equal(r.res.vignettage.temps, 0, 'le vignettage ne dépend pas de t');
});

const R = require('../moteur/particules/recette.js');

test('fonds et auras : dessinés sans NaN ; l\'aura éclaire autour de la boîte', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const noms = ['nebuleuse', 'plasma', 'degrade-vivant', 'grille-neon', 'rayons', 'halo', 'energie-contour'];
  const r = await page({ liste: noms.map(donnee) }, `
const res = {};
for (const d of DONNEES.liste) {
  const s = await compiler(d);
  // Boîte de 60 × 30 cqh au centre (0,9 px par cqh), débord du shader.
  const px = await dessiner(s, { temps: 1.2, progres: 0.3, duree: 4, mode: 0, resolution: [60, 30, 54, 27], scene: [LCQH, 100, L, H],
    repere: [LCQH / 2, 50, 0, d.debord], demi: [30, 15, 0, 0] }, null, 'fond');
  let visibles = 0;
  let dehors = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const a = px[(y * L + x) * 4 + 3];
    if (a > 0.02) {
      visibles++;
      if (Math.abs(x + 0.5 - L / 2) > 28 || Math.abs(y + 0.5 - H / 2) > 14.5) dehors++;
    }
  }
  res[d.nom] = { visibles, dehors, nan: nan(px) };
}
await envoyer({ webgpu: true, res });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  for (const [nom, v] of Object.entries(r.res)) {
    assert.equal(v.nan, false, `${nom} : aucun NaN`);
    assert.ok(v.visibles > 50, `${nom} : dessiné (${v.visibles} pixels)`);
  }
  assert.ok(r.res.halo.dehors > 100, 'le halo déborde de la boîte');
  assert.ok(r.res['energie-contour'].dehors > 20, 'l\'énergie déborde du contour');
  assert.equal(r.res.plasma.dehors, 0, 'un fond sans débord reste dans sa boîte');
});

test('modules : compilent dans les noyaux ; la spirale fait tourner les particules', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const lire = (n) => { const s = charger(n); return { json: s.json, code: s.code, fichier: s.fichier, erreurs: [] }; };
  const c = R.compiler({ version: 1, nom: 'essai', rendu_calque: { bloom: 0, tons: 'neutre' }, emetteurs: [{ nom: 'e',
    naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vitesse: { direction: [1, 0], cone: 0, valeur: 20 }, vie: [2, 2], taille: [5, 5] },
    modules: { force: 'spirale', couleur: 'couleur-vitesse', forme: 'etoile' } }] }, { dur: 1, graine: 1, charte: CHARTE });
  assert.equal(c.ok, true, JSON.stringify(c.erreurs));
  assert.deepEqual(S.attacherModules(c.effet, lire, CHARTE), []);
  const r = await page({ fx: c.effet }, `
const rendu = new P.Rendu(device, gpu.format);
const echecs = await rendu.verifierModules([DONNEES.fx]);
const ZONE = [78.85, 40, 20, 20];
const sim = new P.Simulation(device, DONNEES.fx, null, null);
sim.avancer(0.5, { a: () => ZONE, grille: () => ZONE });
const f = await sim.lireEtat(0);
sim.detruire();
await envoyer({ webgpu: true, echecs: echecs.size, pos: [f[0], f[1]] });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.echecs, 0);
  assert.ok(r.pos[0] > 88.85 + 2, `la particule avance (${r.pos})`);
  assert.ok(r.pos[1] > 50 + 0.5, `la spirale la fait tourner vers le bas (sens direct à l'écran) : ${r.pos}`);
});
