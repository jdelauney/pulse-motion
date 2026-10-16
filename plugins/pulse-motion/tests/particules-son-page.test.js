'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');
const { clics, notes, wavMono } = require('./aide/signaux.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' || Buffer.isBuffer(contenu) ? contenu : JSON.stringify(contenu));
};
const RECETTES = {
  'debit-basses': { version: 1, nom: 'debit-basses', modulation: { debit: { par: 'basses', de: 0, a: 1 } },
    emetteurs: [{ nom: 'e', naissance: { debit: 400, vie: [0.5, 0.5], forme: { type: 'point' } }, rendu: { type: 'sprite' } }] },
  'forces-basses': { version: 1, nom: 'forces-basses', modulation: { forces: { par: 'basses', de: 0.2, a: 3 }, couleur: { par: 'aigus', de: 1, a: 2 } },
    emetteurs: [{ nom: 'e', naissance: { debit: 60, vie: [1.5, 1.5], vitesse: { valeur: [10, 30], cone: 90 } },
      forces: [{ type: 'gravite', valeur: 30 }, { type: 'turbulence', echelle: 10, force: 20, vitesse: 1 }], rendu: { type: 'sprite' } }] },
  'salve-battement': { version: 1, nom: 'salve-battement',
    emetteurs: [{ nom: 'e', naissance: { vie: [0.3, 0.3], salves: [{ au: 'battement', nombre: 20 }] }, rendu: { type: 'sprite' } }] },
};
const INSTANTS = [0.5, 1, 1.5, 2, 2.5];

/** Page assemblée d'une scène « s » de 4 s, musique donnée (octets WAV), balise d'effet ; script : corps asynchrone. */
function page({ musique, balise, script }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [{ id: 's', fichier: 'scenes/s.html', duree: 4, textes: {} }];
    if (musique) d.musique = { fichier: 'assets/musique.wav' };
  });
  for (const [nom, r] of Object.entries(RECETTES)) ecrire(dir, `effets/${nom}.json`, r);
  if (musique) ecrire(dir, 'assets/musique.wav', musique);
  ecrire(dir, 'scenes/s.html', `<section data-scene="s">${balise}</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  return a.html.replace('</body>', `<script>
(async () => {
const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
async function vivantes(t) { await M.seek(t); const f = await M.particules.lireEtat('s', 0, 0); const u = new Uint32Array(f.buffer, f.byteOffset, f.length);
  let k = 0; for (let i = 14; i < u.length; i += 16) if (u[i] === 1) k++; return k; }
try {
  await M.pret;
  await M.particules.pret;
  if (!M.particules.disponible) { await envoyer({ webgpu: false }); return; }
${script}
} catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}
async function executer(o) {
  const r = JSON.parse(await executerPage(page(o)));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const BASSES = wavMono(notes({ plages: [{ debut: 0, fin: 1, frequence: 80 }, { debut: 2, fin: 3.2, frequence: 80 }] }));

test('débit modulé : les particules naissent avec les basses, pas dans le silence', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ musique: BASSES, balise: '<div data-effet="debit-basses" data-dur="4"></div>',
    script: 'await envoyer({ pendant: await vivantes(0.9), silence: await vivantes(1.9), reprise: await vivantes(2.9), son: M.particules.sonEffet("s", 0) });' });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.pendant > 100, `basses : ${r.pendant}`);
  assert.ok(r.silence < 10, `silence : ${r.silence}`);
  assert.ok(r.reprise > 100, `reprise : ${r.reprise}`);
  assert.equal(r.son[0].cMax, 1);
});

test('forces modulées : même état par deux chemins, rien de perdu à la capture', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ musique: BASSES, balise: '<div data-effet="forces-basses" data-dur="4"></div>',
    script: `
await M.seek(2.5); const direct = Array.from(await M.particules.lireEtat('s', 0, 0));
await M.seek(0.4); await M.seek(1.2); await M.seek(3.1); await M.seek(2.5); const detour = Array.from(await M.particules.lireEtat('s', 0, 0));
await envoyer({ egal: direct.length === detour.length && direct.every((x, i) => Object.is(x, detour[i])), n: direct.length });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.n > 0);
  assert.equal(r.egal, true, 'état identique par deux chemins');
});

test('salve au battement : une salve par battement, alerte sans battement', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ musique: wavMono(clics({ duree: 4, instants: INSTANTS })), balise: '<div data-effet="salve-battement" data-dur="3"></div>',
    script: `await envoyer({ apres: await vivantes(1.05), mortes: await vivantes(1.45), instants: M.particules.sonEffet('s', 0)[0].instants.slice(0, 6), alertes: M.particules.alertes });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.apres, 20, 'la salve du battement de 1 s');
  assert.equal(r.mortes, 0, 'mortes 0,3 s plus tard, la suivante pas encore partie');
  INSTANTS.forEach((x, j) => assert.ok(Math.abs(r.instants[j] - x) <= 1 / 60 + 1e-6, `${r.instants[j]} pour ${x}`));
  assert.ok(r.instants[INSTANTS.length] > 1e29, 'case sans battement');
  assert.deepEqual(r.alertes, []);

  const muet = await executer({ musique: wavMono(new Float32Array(48000 * 4)), balise: '<div data-effet="salve-battement" data-dur="3"></div>',
    script: 'await vivantes(1); await envoyer({ alertes: M.particules.alertes });' });
  assert.ok(muet.alertes.some((m) => /aucun battement détecté/.test(m)), JSON.stringify(muet.alertes));
});

test('musique illisible : effet modulé désactivé (panneau), export refusé', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = await executer({ musique: Buffer.from('pas un son'), balise: '<div data-effet="debit-basses" data-dur="4"></div>',
    script: `
await M.seek(0.5);
const panneau = document.querySelector('[data-effet] .pm-effet-panneau');
let refus = null;
M.modeCapture(true);
try { await M.seek(0.5); await M.particules.preparerCapture(); } catch (e) { refus = e.message; }
M.modeCapture(false);
await envoyer({ panneau: panneau && panneau.textContent, refus });` });
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.match(r.panneau, /Effet non affiché : La musique n'a pas pu être lue/);
  assert.match(r.refus, /export interrompu/);
});

test('tables du son : instants tronqués au bloc réservé, coefficients de la grandeur suivie', () => {
  // P.tablesSon est un calcul pur sur un faux M.son : chargé dans un contexte Node minimal.
  const vm = require('node:vm');
  const ctx = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'moteur', 'particules', 'calques.js'), 'utf8'), ctx);
  const tablesSon = vm.runInContext('M.particulesInterne.tablesSon', ctx);
  const effet = { fin: 1, duree: 1, emetteurs: [{ modulation: { debit: { par: 'basses', de: 0, a: 2, piste: 'musique' }, forces: null, couleur: null, taille: null }, salveSon: { au: 'battement', piste: 'musique', nombre: 2, debut: 0, max: 3 } }, { modulation: null, salveSon: null }] };
  const son = { lire: (p, t) => ({ basses: Math.min(1, t) }), battements: () => [0.1, 0.2, 0.3, 0.4, 0.5], syllabes: () => [] };
  const [a, b] = tablesSon(effet, 0, 1, son);
  assert.equal(b, null);
  assert.equal(a.n, 62);
  assert.equal(a.cMax, 2);
  assert.ok(Math.abs(a.coefs[30] - 1) < 1e-6, 'à τ = 0,5 : 0 + 2 × 0,5');
  assert.equal(a.coefs[62 + 30], 1, 'forces non modulées : 1');
  assert.deepEqual(Array.from(a.instants), [0.1, 0.2, 0.3].map(Math.fround));
});
