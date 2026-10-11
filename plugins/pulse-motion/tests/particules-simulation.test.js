'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { balistique } = require('../moteur/particules/forme-close.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js'];
const ZERO = { type: 'turbulence', force: 0 };   // rend un émetteur « simulé » sans changer sa trajectoire

function compiler(recette, dur = 2) {
  const r = R.compiler({ version: 1, nom: 'essai', ...recette }, { dur, graine: 11, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}
const salveUnique = (forces, vitesse) => ({ emetteurs: [{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vitesse, vie: [10, 10] }, forces }] });
const nuage = (zero) => ({
  emetteurs: [
    { nom: 'salve', naissance: { salves: [{ t: 0.1, nombre: 200 }], forme: { type: 'cercle', rayon: 5 }, vitesse: { cone: 360, valeur: [5, 25] }, vie: [1, 3], masse: [0.5, 2] },
      forces: [{ type: 'gravite', valeur: 30 }, { type: 'trainee', coef: 0.8 }, ...(zero ? [ZERO] : [])] },
    { nom: 'flux', naissance: { debit: 80, forme: { type: 'rectangle' }, vitesse: { direction: [1, -1], cone: 40, valeur: [10, 20] }, vie: [0.5, 1] },
      forces: [{ type: 'gravite', valeur: 30 }, { type: 'trainee', coef: 0.8 }, ...(zero ? [ZERO] : [])] },
  ],
});
const complet = {
  emetteurs: [
    { nom: 'gerbe', naissance: { debit: 60, forme: { type: 'ancre', zone: 'contour' }, vitesse: { direction: [0, -1], cone: 90, valeur: [10, 30] }, vie: [0.4, 0.9] },
      forces: [{ type: 'gravite', valeur: 20 }, { type: 'trainee', coef: 0.05, quadratique: true }, { type: 'turbulence', echelle: 8, force: 15 },
        { type: 'attracteur', force: 30, rayon: 10 }, { type: 'vortex', force: 10, rayon: 15 }, { type: 'vent', vitesse: [5, 0], coef: 0.3 },
        { type: 'rappel', raideur: 0.5, amortissement: 0.1 }],
      a_la_mort: { emetteur: 'eclat' } },
    { nom: 'eclat', naissance: { nombre: 2, forme: { type: 'point' }, vitesse: { cone: 360, valeur: [5, 10], heritage: 0.5 }, vie: [0.3, 1.5] },
      forces: [{ type: 'trainee', coef: 1 }], a_la_mort: { emetteur: 'poussiere' } },
    { nom: 'poussiere', naissance: { nombre: 1, vie: [0.2, 0.4] } },
  ],
};

const EFFETS = {
  droite: compiler(salveUnique([ZERO], { direction: [1, 0], cone: 0, valeur: [12, 12] })),
  chute: compiler(salveUnique([{ type: 'gravite', valeur: 30 }, ZERO], { direction: [0, -1], cone: 0, valeur: [20, 20] })),
  rapide: compiler(nuage(false)),
  simule: compiler(nuage(true)),
  complet: compiler(complet),
};

const CODE = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const ZONE = [40, 40, 20, 10];
const zones = { a: () => ZONE, grille: () => ZONE };
const lire = (f) => { const u = new Uint32Array(f.buffer); const l = [];
  for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ n: u[s * 16 + 12], x: f[s * 16], y: f[s * 16 + 1], vx: f[s * 16 + 4], vy: f[s * 16 + 5], age: f[s * 16 + 3] });
  return l.sort((a, b) => a.n - b.n); };
async function etat(effet, chemin) {
  const sim = new P.Simulation(device, effet);
  for (const t of chemin) sim.avancer(t, zones);
  const tous = [];
  for (let i = 0; i < effet.emetteurs.length; i++) tous.push(await sim.lireEtat(i));
  sim.detruire();
  return tous;
}
const egaux = (a, b) => a.length === b.length && a.every((x, i) => { const u = new Uint32Array(x.buffer), v = new Uint32Array(b[i].buffer); return u.length === v.length && u.every((w, j) => w === v[j]); });
const r = { webgpu: true };
r.droite = lire((await etat(DONNEES.droite, [1.5]))[0]);
r.chute = lire((await etat(DONNEES.chute, [1.5]))[0]);
r.rapide = (await etat(DONNEES.rapide, [1.25])).map(lire);
r.simule = (await etat(DONNEES.simule, [1.25])).map(lire);
const direct = await etat(DONNEES.complet, [2.3]);
const detour = await etat(DONNEES.complet, [5, 1, 3.4, 2.3]);
const pasAPas = await etat(DONNEES.complet, Array.from({ length: 70 }, (_, i) => (i + 1) / 30).filter((t) => t <= 2.3).concat([2.3]));
r.deterministe = egaux(direct, detour) && egaux(direct, pasAPas);
r.vivantes = direct.map((f) => lire(f).length);
await envoyer(r);
`;

test('simulation GPU : physique, voie rapide, sous-émetteurs, chemins différents', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: EFFETS, code: CODE })));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.webgpu, true);
  const pres = (a, b, quoi) => assert.ok(Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(b)), `${quoi} : ${a} au lieu de ${b}`);

  // Une particule sans force suit une droite (centre de la zone : 50, 45).
  assert.equal(r.droite.length, 1);
  pres(r.droite[0].x, 50 + 12 * 1.5, 'droite x');
  pres(r.droite[0].y, 45, 'droite y');
  pres(r.droite[0].age, 1.5, 'âge');

  // Chute libre conforme à la forme close à 0,1 % près.
  const attendu = balistique([50, 45], [0, -20], [0, 30], 0, 1.5);
  assert.equal(r.chute.length, 1);
  pres(r.chute[0].x, attendu.p[0], 'chute x');
  pres(r.chute[0].y, attendu.p[1], 'chute y');
  pres(r.chute[0].vy, attendu.v[1], 'chute vy');

  // Voie rapide et voie simulée concordent, particule par particule.
  assert.deepEqual(EFFETS.rapide.emetteurs.map((e) => e.voieRapide), [true, true]);
  assert.deepEqual(EFFETS.simule.emetteurs.map((e) => e.voieRapide), [false, false]);
  for (let e = 0; e < 2; e++) {
    assert.ok(r.rapide[e].length > 10, `émetteur ${e} : ${r.rapide[e].length} particules vivantes`);
    assert.deepEqual(r.rapide[e].map((p) => p.n), r.simule[e].map((p) => p.n), `émetteur ${e} : mêmes particules vivantes`);
    r.rapide[e].forEach((p, i) => { pres(r.simule[e][i].x, p.x, `x de ${p.n}`); pres(r.simule[e][i].y, p.y, `y de ${p.n}`); });
  }

  // Sous-émetteurs nés, et même état quel que soit le chemin (bit à bit).
  assert.ok(r.vivantes[0] > 0 && r.vivantes[1] > 0 && r.vivantes[2] > 0, JSON.stringify(r.vivantes));
  assert.equal(r.deterministe, true);
});

test('simulation GPU : historique des traînées', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler({ emetteurs: [{ nom: 'a', naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vitesse: { direction: [1, 0], cone: 0, valeur: [12, 12] }, vie: [10, 10] },
    forces: [ZERO], rendu: { type: 'trainee', longueur: 4 } }] });
  const code = `
const P = M.particulesInterne;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const ZONE = [40, 40, 20, 10];
const sim = new P.Simulation(gpu.device, DONNEES);
sim.avancer(1, { a: () => ZONE, grille: () => ZONE });
const h = await sim.lireHistorique(0);
await envoyer({ k: sim.k, x: Array.from(h).filter((_, i) => i % 2 === 0) });`;
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees: effet, code })));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.k, 120);
  // Entrées écrites aux états 120, 118, 116, 114 : index (m / 2) mod 4 = 0, 3, 2, 1.
  const attendu = [50 + 12 * 120 / 120, 50 + 12 * 114 / 120, 50 + 12 * 116 / 120, 50 + 12 * 118 / 120];
  r.x.forEach((x, i) => assert.ok(Math.abs(x - attendu[i]) < 1e-3, `entrée ${i} : ${x} au lieu de ${attendu[i]}`));
});
