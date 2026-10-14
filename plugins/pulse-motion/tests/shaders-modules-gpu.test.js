'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const S = require('../moteur/shaders/code.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js', 'particules/rendu.js', 'shaders/code.js'];
const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const SOURCES = {
  'pousse-x': { fichier: 'shaders/pousse-x.wgsl', json: { version: 1, nom: 'pousse-x', usage: 'module-force', parametres: { ax: { defaut: 10, min: -100, max: 100 } } },
    code: '// Poussée constante vers la droite.\nfn force(p: Particule, t: f32, zone: vec4f) -> vec2f {\n  return vec2f(R.ax, 0.0);\n}\n' },
  'casse-f': { fichier: 'shaders/casse-f.wgsl', json: { version: 1, nom: 'casse-f', usage: 'module-force' },
    code: 'fn force(p: Particule, t: f32, zone: vec4f) -> vec2f {\n  let x: f32 = vec2f(1.0);\n  return vec2f(x);\n}\n' },
  vert: { fichier: 'shaders/vert.wgsl', json: { version: 1, nom: 'vert', usage: 'module-couleur' },
    code: 'fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f { return vec4f(0.0, 1.0, 0.0, 1.0); }\n' },
  carre: { fichier: 'shaders/carre.wgsl', json: { version: 1, nom: 'carre', usage: 'module-forme' },
    code: 'fn forme(uv: vec2f, p: Particule) -> f32 { return select(0.0, 1.0, max(abs(uv.x), abs(uv.y)) < 0.5); }\n' },
  'rouge-casse': { fichier: 'shaders/rouge-casse.wgsl', json: { version: 1, nom: 'rouge-casse', usage: 'module-couleur' },
    code: 'fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f {\n  return vec3f(1.0);\n}\n' },
};

/** Effet compilé (Node) avec ses modules attachés. */
function effet(emetteurs, rendu_calque = { bloom: 0, tons: 'neutre' }) {
  const r = R.compiler({ version: 1, nom: 'essai', rendu_calque, emetteurs }, { dur: 1, graine: 3, charte: CHARTE });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.deepEqual(S.attacherModules(r.effet, (n) => SOURCES[n] || null, CHARTE), []);
  return r.effet;
}
const UN = { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vitesse: { valeur: 0 }, vie: [3, 3], taille: [20, 20] };

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const ZONE = [78.85, 40, 20, 20];
const zones = { a: () => ZONE, grille: () => ZONE };
const vivantes = (f) => { const u = new Uint32Array(f.buffer); const l = []; for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push([f[s * 16], f[s * 16 + 1]]); return l; };
` + code })));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}

test('module de force : dévie les particules comme prévu (x = ½ a t²), pas pour un autre émetteur', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const fx = effet([
    { nom: 'pousse', naissance: UN, modules: { force: 'pousse-x' } },
    { nom: 'libre', naissance: UN },
  ]);
  assert.equal(fx.emetteurs[0].voieRapide, false);
  const r = await page({ fx }, `
const sim = new P.Simulation(device, DONNEES.fx, null, null);
sim.avancer(1, zones);
const pousse = vivantes(await sim.lireEtat(0));
const libre = vivantes(await sim.lireEtat(1));
const rapides = sim.emetteurs.map((e) => e.rapide);
sim.detruire();
await envoyer({ webgpu: true, pousse, libre, rapides });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.rapides, [false, true]);
  assert.equal(r.pousse.length, 1);
  assert.ok(Math.abs(r.pousse[0][0] - (88.85 + 5)) < 0.05, `x = ${r.pousse[0][0]} (attendu 93,85 : ½ × 10 × 1²)`);
  assert.ok(Math.abs(r.pousse[0][1] - 50) < 1e-3);
  assert.ok(Math.abs(r.libre[0][0] - 88.85) < 1e-3, 'l\'autre émetteur n\'est pas poussé');
});

test('module de force : erreurs situées dans le fichier du module', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const fx = effet([{ nom: 'e', naissance: UN, modules: { force: 'casse-f' } }]);
  const r = await page({ force: fx.emetteurs[0].modulesWGSL.force, juste: effet([{ nom: 'e', naissance: UN, modules: { force: 'pousse-x' } }]).emetteurs[0].modulesWGSL.force }, `
await envoyer({ webgpu: true, erreurs: await P.verifierForce(device, DONNEES.force), juste: await P.verifierForce(device, DONNEES.juste) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.erreurs[0].ligne, 2);
  assert.ok(r.erreurs[0].colonne >= 1);
  assert.deepEqual(r.juste, []);
});

test('modules de couleur et de forme : couleur remplacée, alpha du motif donné par le module', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const rendu = { texture: 'disque-doux', melange: 'alpha' };
  const avec = effet([{ nom: 'e', naissance: UN, rendu, modules: { couleur: 'vert', forme: 'carre' } }]);
  const sans = effet([{ nom: 'e', naissance: UN, rendu }]);
  const r = await page({ avec, sans }, `
const canvas = document.createElement('canvas');
canvas.width = 1777; canvas.height = 1000;
document.body.appendChild(canvas);
const rendu = new P.Rendu(device, gpu.format);
const cible = rendu.cible(canvas);
const OPTIONS = { largeurCqh: 177.7, dureeImage: 1 / 30, bloom: 0, seuil: 1, tons: 'neutre' };
async function image(fx) {
  const sim = new P.Simulation(device, fx, null, null);
  const d = sim.avancer(0.5, zones);
  rendu.dessiner(cible, [{ sim, i: 0, delta: d[0] }], OPTIONS);
  const p = await rendu.lirePixels(cible);
  rendu.oublier(sim);
  sim.detruire();
  const px = (x, y) => Array.from(p.donnees.slice((y * p.largeur + x) * 4, (y * p.largeur + x) * 4 + 4));
  // Particule de 20 cqh (200 px) centrée en (888, 500) : uv = 0,25 à 25 px du centre, 0,75 à 75 px.
  return { centre: px(890, 500), pres: px(913, 500), loin: px(963, 500) };
}
await envoyer({ webgpu: true, avec: await image(DONNEES.avec), sans: await image(DONNEES.sans), variantes: rendu.variantes.size });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.avec.centre[1] >= 250 && r.avec.centre[0] <= 3 && r.avec.centre[3] >= 250, `vert opaque au centre : ${r.avec.centre}`);
  assert.ok(r.avec.pres[3] >= 250, `dans le carré (uv 0,25) : ${r.avec.pres}`);
  assert.equal(r.avec.loin[3], 0, 'hors du carré (uv 0,75) : rien');
  assert.ok(r.sans.loin[3] > 10, `sans module : disque doux encore visible à uv 0,75 (${r.sans.loin})`);
  assert.ok(r.sans.centre[0] > 200 && r.sans.centre[1] > 200, 'sans module : blanc');
  assert.equal(r.variantes, 1, 'une variante pour la combinaison couleur + forme');
});

test('modules du rendu : erreurs situées dans le fichier du module, un message par effet', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const casse = effet([{ nom: 'e', naissance: UN, modules: { couleur: 'rouge-casse' } }]);
  const force = effet([{ nom: 'e', naissance: UN, modules: { force: 'casse-f' } }]);
  const juste = effet([{ nom: 'e', naissance: UN, modules: { couleur: 'vert', forme: 'carre' } }]);
  const r = await page({ casse, force, juste }, `
const rendu = new P.Rendu(device, gpu.format);
const m = await rendu.verifierModules([DONNEES.casse, DONNEES.force, DONNEES.juste]);
await envoyer({ webgpu: true, messages: [DONNEES.casse, DONNEES.force, DONNEES.juste].map((fx) => m.get(fx) || null) });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.match(r.messages[0], /^Shader « rouge-casse » \(shaders\/rouge-casse\.wgsl\) ne compile pas : ligne 2, colonne \d+ : /);
  assert.match(r.messages[1], /^Shader « casse-f » \(shaders\/casse-f\.wgsl\) ne compile pas : ligne 2/);
  assert.equal(r.messages[2], null);
});

const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');

test('page : module qui ne compile pas : effet désactivé, panneau, export refusé ; l\'atelier refuse la recette', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  const ecrire = (relatif, contenu) => {
    fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
    fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
  };
  for (const n of ['casse-f', 'pousse-x']) { ecrire(`shaders/${n}.json`, SOURCES[n].json); ecrire(`shaders/${n}.wgsl`, SOURCES[n].code); }
  const recette = (nom, force) => ({ version: 1, nom, emetteurs: [{ nom: 'e', naissance: { debit: 30, vie: [1, 1] }, modules: { force } }] });
  ecrire('effets/casse.json', recette('casse', 'casse-f'));
  ecrire('effets/pousse.json', recette('pousse', 'pousse-x'));
  modifierDeroule(dir, (d) => { d.scenes = [{ id: 'a', fichier: 'scenes/a.html', duree: 4, textes: {} }]; });
  ecrire('scenes/a.html', '<section data-scene="a"><div id="c" data-effet="casse" data-dur="3"></div><div data-effet="pousse" data-dur="3"></div></section>');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const casse = a.donnees.effets[0].effet;
  const html = a.html.replace('</body>', `<script>
(async () => {
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
try {
  await M.pret;
  await M.particules.pret;
  if (!M.particules.disponible) { await envoyer({ webgpu: false }); return; }
  await M.seek(1);
  const p = document.querySelector('#c > .pm-effet-panneau');
  let refus = null;
  try { await M.particules.verifierExport(); } catch (e) { refus = e.message; }
  let atelier = null;
  try { await M.particules.remplacerEffet('a', 1, ${JSON.stringify(casse).replace(/</g, '\u003c')}); } catch (e) { atelier = e.message; }
  await envoyer({ webgpu: true, panneau: p && p.textContent, refus, atelier, decrire: M.particules.decrire('a').map((d) => [d.nom, d.actif, !!d.desactive]),
    erreurs: M.shaders.erreurs().map((e) => e.usage) });
} catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.match(r.panneau, /^Effet non affiché : Shader « casse-f » \(shaders\/casse-f\.wgsl\) ne compile pas : ligne 2/);
  assert.match(r.refus, /^Export refusé : Shader « casse-f »/);
  assert.match(r.atelier, /^Effet non affiché : Shader « casse-f »/);
  assert.deepEqual(r.decrire, [['casse', false, true], ['pousse', true, false]]);
  assert.deepEqual(r.erreurs, ['module']);
});
