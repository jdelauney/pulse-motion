'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

const FICHIERS = ['particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/simulation.js'];
const L = 177.78;
const ZERO = { type: 'turbulence', force: 0 };

function compiler(emetteurs, dur = 2) {
  const r = R.compiler({ version: 1, nom: 'essai', emetteurs }, { dur, graine: 5, charte: {} });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}
/** Émetteur d'une particule (ou de « nombre ») née en un point, taille 0,02 cqh (rayon de collision 0,01). */
function point(nom, { vitesse, forces = [ZERO], collisions, extra = {}, nombre = 1, vie = [10, 10], taille = [0.02, 0.02], forme = { type: 'point' } } = {}) {
  return { nom, naissance: { salves: [{ t: 0, nombre }], forme, vitesse, vie, taille }, forces, collisions, ...extra };
}

/** Code commun des pages : GPU, tables, lecture des tampons. */
const COMMUN = `
const P = M.particulesInterne;
const O = M.obstacles;
const gpu = await P.obtenirGPU();
if (!gpu) { await envoyer({ webgpu: false }); return; }
const { device } = gpu;
const L = ${L};
function ligne(cadres) { const t = new Float32Array(cadres.length * 8); cadres.forEach((r, i) => O.ecrireRepere(t, i * 8, r)); return t; }
function fixes(table) { return table.entrees.map((e) => (e.source.element ? O.INACTIF : O.repereFixe(e.source, L, table.sol))); }
function monde(table) { return { entrees: table.entrees, largeurCqh: L, actif: true }; }
function zonesFixes(ZONE, table) { const l = ligne(fixes(table)); return { a: () => ZONE, grille: () => ZONE, reperes: () => l }; }
const lireP = (f) => { const u = new Uint32Array(f.buffer); const l = [];
  for (let s = 0; s < f.length / 16; s++) if (u[s * 16 + 14] === 1) l.push({ s, n: u[s * 16 + 12], x: f[s * 16], y: f[s * 16 + 1], vx: f[s * 16 + 4], vy: f[s * 16 + 5], age: f[s * 16 + 3] });
  return l; };
const lireC = (f) => { const u = new Uint32Array(f.buffer); const l = [];
  for (let s = 0; s < f.length / 8; s++) l.push({ x: f[s * 8], y: f[s * 8 + 1], obstacle: u[s * 8 + 2], pose: f[s * 8 + 3], impact: f[s * 8 + 4], nImpacts: u[s * 8 + 5], opacite: f[s * 8 + 6] });
  return l; };
async function etat(effet, m, zones, chemin) {
  const sim = new P.Simulation(device, effet, m);
  for (const t of chemin) sim.avancer(t, zones);
  const r = { particules: [], contacts: [], rapides: sim.emetteurs.map((e) => e.rapide) };
  for (let i = 0; i < effet.emetteurs.length; i++) { r.particules.push(await sim.lireEtat(i)); r.contacts.push(await sim.lireContacts(i)); }
  sim.detruire();
  return r;
}
`;

async function page(donnees, code) {
  const r = JSON.parse(await executerPage(pageMoteur({ fichiers: FICHIERS, donnees, code: COMMUN + code })));
  assert.equal(r.erreur, undefined, r.erreur);
  return r;
}
const pres = (a, b, tol, quoi) => assert.ok(Math.abs(a - b) <= tol, `${quoi} : ${a} au lieu de ${b} (± ${tol})`);

test('collisions GPU : rebond sur le sol à la hauteur prévue par la restitution', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler([point('a', { forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['sol'], restitution: 0.5, frottement: 0 } })], 0.1);
  const r = await page({ effet }, `
const table = O.construireTable({ largeurCqh: L, solRecette: 80 });
const z = zonesFixes([45, 15, 10, 10], table);
// Chute de 20 à 79,99 (sol gonflé du rayon 0,01) ; sommet après le rebond : 79,99 − 0,25 × 59,99.
const sommet = Math.sqrt(2 * 59.99 / 40) + 0.5 * Math.sqrt(2 * 40 * 59.99) / 40;
const e = await etat(DONNEES.effet, monde(table), z, [sommet]);
const avant = await etat(DONNEES.effet, monde(table), z, [1]);
await envoyer({ webgpu: true, p: lireP(e.particules[0]), c: lireC(e.contacts[0]), avant: lireP(avant.particules[0]), rapides: e.rapides });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.rapides, [false], 'un émetteur à collisions quitte la voie rapide');
  assert.equal(r.p.length, 1);
  pres(r.p[0].y, 79.99 - 0.25 * 59.99, 0.4, 'hauteur du sommet');
  pres(r.p[0].vy, 0, 1.5, 'vitesse au sommet');
  pres(r.p[0].x, 50, 1e-4, 'x inchangé');
  assert.ok(r.avant[0].y < 79.99 && r.avant[0].vy > 0, 'avant le contact, la particule tombe encore');
  assert.equal(r.c[0].obstacle, 0xffffffff, 'un rebond ne pose pas');
});

test('collisions GPU : glissement sur un plan incliné (Coulomb)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler([point('a', { forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['elements'], restitution: 0, frottement: 0.2 } })], 0.1);
  const r = await page({ effet }, `
const pente = Math.tan(Math.PI / 6);
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [{ scene: 's', genre: 'ligne', video: false, de: [20, 40], a: [120, 40 + 100 * pente] }] });
// Départ 0,1 cqh au-dessus de la pente, en x = 40.
const z = zonesFixes([35, 40 + 20 * pente - 0.1 - 5, 10, 10], table);
const a = lireP((await etat(DONNEES.effet, monde(table), z, [0.6])).particules[0])[0];
const b = lireP((await etat(DONNEES.effet, monde(table), z, [1.1])).particules[0])[0];
await envoyer({ webgpu: true, a, b, pente });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const d = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  const va = r.a.vx * d[0] + r.a.vy * d[1];
  const vb = r.b.vx * d[0] + r.b.vy * d[1];
  const attendue = 40 * (Math.sin(Math.PI / 6) - 0.2 * Math.cos(Math.PI / 6));
  pres((vb - va) / 0.5, attendue, attendue * 0.03, 'accélération le long de la pente');
  // La particule reste sur la pente (à son rayon près).
  const yPente = 40 + (r.b.x - 20) * r.pente;
  pres((yPente - r.b.y) * Math.cos(Math.PI / 6), 0.01, 0.05, 'distance à la pente');
});

test('collisions GPU : particule posée qui suit une boîte animée', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler([point('a', { nombre: 20, forme: { type: 'ligne', largeur: 18 }, forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['elements'], reponse: 'poser' } })], 0.1);
  const r = await page({ effet }, `
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [{ scene: 's', genre: 'element', video: false, index: 0 }] });
const bords = fixes(table).slice(0, 3);
// Boîte de 40 × 10 cqh, centre (60 + 10 τ, 70) : glisse vers la droite à 10 cqh/s.
const reperes = (g) => ligne([...bords, { centre: [60 + 10 * g / 30, 70], angle: 0, demi: [20, 5], echelle: [1, 1], actif: true }]);
const z = { a: () => [51, 40, 18, 0], grille: () => [51, 40, 18, 0], reperes };
const sim = new P.Simulation(device, DONNEES.effet, monde(table));
sim.avancer(2, z);
const p2 = lireP(await sim.lireEtat(0));
const c2 = lireC(await sim.lireContacts(0));
sim.avancer(3, z);
const p3 = lireP(await sim.lireEtat(0));
sim.detruire();
await envoyer({ webgpu: true, p2, c2, p3 });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const posees = r.p2.filter((p) => r.c2[p.s].obstacle === 3);
  assert.ok(posees.length >= 15, `${posees.length} particules posées sur la boîte`);
  for (const p of posees) {
    const q = r.p3.find((x) => x.s === p.s);
    pres(q.x - p.x, 10, 0.01, 'déplacement avec la boîte en 1 s');
    pres(q.y, 65 - 0.01, 0.01, 'sur le dessus de la boîte');
    pres(q.vx, 10, 0.05, 'vitesse = vitesse de la boîte');
    pres(q.vy, 0, 0.05, 'vitesse verticale');
    assert.ok(r.c2[p.s].pose > 0.9 && r.c2[p.s].pose < 1.3, `instant de pose ${r.c2[p.s].pose}`);
  }
});

test('collisions GPU : aucune traversée à grande vitesse (segment et boîte minces)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const em = point('a', { nombre: 200, forme: { type: 'ligne', largeur: 140 }, vitesse: { direction: [0, 1], valeur: [3000, 3000] }, vie: [1, 1], collisions: { cibles: ['elements'], reponse: 'poser' } });
  const effet = compiler([em], 0.1);
  const r = await page({ effet }, `
const resultats = [];
for (const decl of [{ scene: 's', genre: 'ligne', video: false, de: [0, 60], a: [L, 60] },
                    { scene: 's', genre: 'rectangle', video: false, de: [0, 59.95], a: [L, 60.05], angle: 0 }]) {
  const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [decl] });
  const e = await etat(DONNEES.effet, monde(table), zonesFixes([20, 10, 140, 0], table), [0.5]);
  const c = lireC(e.contacts[0]);
  resultats.push(lireP(e.particules[0]).map((p) => ({ y: p.y, obstacle: c[p.s].obstacle })));
}
await envoyer({ webgpu: true, resultats });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const [segment, boite] = r.resultats;
  assert.equal(segment.length, 200);
  assert.ok(segment.every((p) => p.y < 60 && p.obstacle === 3), 'segment : toutes arrêtées au-dessus');
  assert.equal(boite.length, 200);
  assert.ok(boite.every((p) => p.y < 59.95 && p.obstacle === 3), 'boîte de 0,1 cqh : toutes arrêtées au-dessus');
});

test('collisions GPU : sous-émetteur né au point d\'impact, orienté selon la normale', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const eclat = { nom: 'eclat', naissance: { nombre: 3, forme: { type: 'point' }, vitesse: { direction: [0, -1], cone: 0, valeur: [10, 10] }, vie: [0.5, 0.5] }, forces: [ZERO] };
  const sol = compiler([point('p', { forces: [{ type: 'gravite', valeur: 200 }], collisions: { cibles: ['sol'], reponse: 'mourir' }, extra: { a_la_collision: { emetteur: 'eclat' } } }), eclat], 0.1);
  const mur = compiler([point('p', { vitesse: { direction: [-1, 0], valeur: [100, 100] }, collisions: { cibles: ['murs'], reponse: 'mourir' }, extra: { a_la_collision: { emetteur: 'eclat' } } }), eclat], 0.1);
  const rebonds = compiler([
    point('p', { forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['sol'], restitution: 0.95, frottement: 0 }, extra: { a_la_collision: { emetteur: 'eclat' } } }),
    { ...eclat, naissance: { ...eclat.naissance, nombre: 1, vie: [1, 1] } },
  ], 0.1);
  const r = await page({ sol, mur, rebonds }, `
const table = O.construireTable({ largeurCqh: L, solRecette: 80 });
const s = await etat(DONNEES.sol, monde(table), zonesFixes([45, 15, 10, 10], table), [0.9]);
const m = await etat(DONNEES.mur, monde(table), zonesFixes([15, 45, 10, 10], table), [0.35]);
const b = await etat(DONNEES.rebonds, monde(table), zonesFixes([45, 74, 10, 10], table), [1.5]);
await envoyer({ webgpu: true,
  sol: { parent: lireP(s.particules[0]), enfants: lireP(s.particules[1]) },
  mur: { parent: lireP(m.particules[0]), enfants: lireP(m.particules[1]) },
  rebonds: { contact: lireC(b.contacts[0])[0], enfants: lireP(b.particules[1]) } });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  // Sol : impact à t = sqrt(2 × 59,99 / 200) ; enfants à la verticale de l'impact, partis vers le haut à 10 cqh/s.
  assert.equal(r.sol.parent.length, 0, 'le parent meurt au contact');
  assert.equal(r.sol.enfants.length, 3);
  const tImpact = Math.sqrt(2 * 59.99 / 200);
  for (const e of r.sol.enfants) {
    pres(e.x, 50, 0.01, 'x de l\'enfant');
    pres(e.y, 79.99 - 10 * (0.9 - tImpact), 0.05, 'y de l\'enfant');
    pres(e.vx, 0, 1e-3, 'vx de l\'enfant');
    pres(e.vy, -10, 1e-3, 'vy de l\'enfant (normale du sol)');
  }
  // Mur gauche : normale (1, 0), l'enfant part vers la droite.
  assert.equal(r.mur.enfants.length, 3);
  for (const e of r.mur.enfants) {
    pres(e.vx, 10, 1e-3, 'vx (normale du mur)');
    pres(e.vy, 0, 1e-3, 'vy');
  }
  // Rebonds à 0,22 s, 0,65 s, 1,05 s, 1,43 s ; un impact noté seulement après 1 + 1/120 s : 0,22 et 1,43.
  assert.equal(r.rebonds.contact.nImpacts, 2, 'deux impacts notés');
  assert.ok(r.rebonds.contact.impact > 1.23 && r.rebonds.contact.impact < 1.5, `dernier impact noté à ${r.rebonds.contact.impact}`);
  assert.equal(r.rebonds.enfants.length, 1, 'un seul enfant vivant (le premier est mort à 1,22 s)');
});

test('collisions GPU : une barre en rotation renvoie les particules dans le sens de sa rotation', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const chute = (nom, x) => point(nom, { forme: { type: 'point', decalage: [x, 0] }, vitesse: { direction: [0, 1], valeur: [30, 30] }, collisions: { cibles: ['elements'], restitution: 0.5, frottement: 0 } });
  const effet = compiler([chute('gauche', -20), chute('droite', 20)], 0.1);
  const r = await page({ effet }, `
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [{ scene: 's', genre: 'ligne', video: false, de: [20, 60], a: [80, 60] }] });
const bords = fixes(table).slice(0, 3);
// Barre de 60 cqh centrée en (50, 60), qui tourne à 0,5 rad/s (sens horaire à l'écran) : le bout gauche monte.
const reperes = (g) => ligne([...bords, { centre: [50, 60], angle: 0.5 * g / 30, demi: [30, 0], echelle: [1, 1], actif: true }]);
const z = { a: () => [50, 40, 0, 0], grille: () => [50, 40, 0, 0], reperes };
const e = await etat(DONNEES.effet, monde(table), z, [1.2]);
await envoyer({ webgpu: true, gauche: lireP(e.particules[0])[0], droite: lireP(e.particules[1])[0] });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  // Barre immobile : les deux repartiraient à 15 cqh/s vers le haut. En rotation : la gauche plus vite, la droite moins.
  assert.ok(r.gauche.vy < -22, `gauche : vy ${r.gauche.vy}`);
  assert.ok(r.droite.vy > -8, `droite : vy ${r.droite.vy}`);
  const dessus = (p) => p.y < 60 + (p.x - 50) * Math.tan(0.6);
  assert.ok(dessus(r.gauche) && dessus(r.droite), 'les deux restent au-dessus de la barre');
});

test('collisions GPU : même état par trois chemins (particules et contacts, bit à bit)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const flux = (nom, collisions, extra = {}) => ({ nom, naissance: { debit: 150, forme: { type: 'ligne', largeur: 100 }, vitesse: { direction: [0, 1], cone: 40, valeur: [20, 60] }, vie: [1, 3] },
    forces: [{ type: 'gravite', valeur: 40 }, { type: 'turbulence', echelle: 10, force: 10 }], collisions, ...extra });
  const effet = compiler([
    flux('rebond', { restitution: [0.3, 0.7], frottement: [0.1, 0.4] }),
    flux('pose', { reponse: 'poser', repos_apres: [0.3, 0.8] }),
    flux('pluie', { reponse: 'mourir', cibles: ['sol', 'elements'] }, { a_la_collision: { emetteur: 'goutte' } }),
    { nom: 'goutte', naissance: { nombre: 2, forme: { type: 'point' }, vitesse: { cone: 120, valeur: [5, 15] }, vie: [0.2, 0.4] }, forces: [{ type: 'gravite', valeur: 40 }] },
  ], 2);
  const r = await page({ effet }, `
const table = O.construireTable({ largeurCqh: L, solRecette: 85, propres: [
  { scene: 's', genre: 'element', video: false, index: 0 }, { scene: 's', genre: 'ligne', video: false, de: [20, 60], a: [80, 60] }] });
const bords = fixes(table).slice(0, 3);
const reperes = (g) => ligne([...bords,
  { centre: [60 + 20 * Math.sin(g / 30), 70], angle: 0.2 * g / 30, demi: [15, 4], echelle: [1 + 0.1 * g / 30, 1], actif: true },
  { centre: [50, 60], angle: -0.7 * g / 30, demi: [30, 0], echelle: [1, 1], actif: g % 40 < 30 }]);
const z = { a: () => [40, 10, 100, 0], grille: () => [40, 10, 100, 0], reperes };
const direct = await etat(DONNEES.effet, monde(table), z, [2.3]);
const detour = await etat(DONNEES.effet, monde(table), z, [5, 1, 3.4, 2.3]);
const pasAPas = await etat(DONNEES.effet, monde(table), z, Array.from({ length: 69 }, (_, i) => (i + 1) / 30).concat([2.3]));
const bits = (e) => [...e.particules, ...e.contacts].map((f) => Array.from(new Uint32Array(f.buffer)));
const egal = (a, b) => JSON.stringify(bits(a)) === JSON.stringify(bits(b));
const vivantes = direct.particules.map((f) => lireP(f).length);
const posees = lireC(direct.contacts[1]).filter((c, s) => c.obstacle !== 0xffffffff && lireP(direct.particules[1]).some((p) => p.s === s)).length;
await envoyer({ webgpu: true, deterministe: egal(direct, detour) && egal(direct, pasAPas), vivantes, posees });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.vivantes.every((n) => n > 0), JSON.stringify(r.vivantes));
  assert.ok(r.posees > 0, 'des particules sont posées');
  assert.equal(r.deterministe, true);
});

test('collisions GPU : obstacle qui disparaît (repère inactif) : particules posées libérées sur place, sans être projetées', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const effet = compiler([point('a', { nombre: 20, forme: { type: 'ligne', largeur: 18 }, forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['elements'], reponse: 'poser' } })], 0.1);
  const r = await page({ effet }, `
const table = O.construireTable({ largeurCqh: L, solRecette: null, propres: [{ scene: 's', genre: 'element', video: false, index: 0 }] });
const bords = fixes(table).slice(0, 3);
// Boîte immobile (centre (60, 70), 40 × 10 cqh), présente jusqu'au point de grille 29 (τ = 0,967 s), absente ensuite
// (scène voisine masquée à la fin d'une transition).
const reperes = (g) => ligne([...bords, g < 30 ? { centre: [60, 70], angle: 0, demi: [20, 5], echelle: [1, 1], actif: true } : O.INACTIF]);
const z = { a: () => [51, 40, 18, 0], grille: () => [51, 40, 18, 0], reperes };
const sim = new P.Simulation(device, DONNEES.effet, monde(table));
sim.avancer(0.95, z);
const avant = lireC(await sim.lireContacts(0)).filter((c) => c.obstacle === 3).length;
const suite = [];
for (const tau of [0.975, 1, 1.05, 1.1]) {
  sim.avancer(tau, z);
  suite.push({ tau, p: lireP(await sim.lireEtat(0)), c: lireC(await sim.lireContacts(0)) });
}
sim.detruire();
await envoyer({ webgpu: true, avant, suite });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.ok(r.avant >= 15, `${r.avant} particules posées sur la boîte avant sa disparition`);
  for (const { tau, p, c } of r.suite) {
    assert.equal(p.length, 20, `τ = ${tau} : toutes vivantes`);
    for (const q of p) {
      assert.ok(Math.abs(q.vx) < 0.5 && q.vy > -0.5 && q.vy < 7, `τ = ${tau} : vitesse bornée (${q.vx}, ${q.vy})`);
      assert.ok(q.x > 50 && q.x < 70 && q.y > 64 && q.y < 66, `τ = ${tau} : sur place (${q.x}, ${q.y})`);
    }
    if (tau >= 1) assert.ok(c.every((k) => k.obstacle !== 3), `τ = ${tau} : plus aucune particule posée sur la boîte absente`);
  }
});

test('collisions : « pluie » sans obstacle garde la voie rapide ; l\'enfant « a_la_collision » n\'est pas simulé', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r0 = R.compiler(require('../effets/pluie.json'), { dur: 3, graine: 2, charte: {} });
  assert.equal(r0.ok, true, JSON.stringify(r0.erreurs));
  const r = await page({ effet: r0.effet }, `
const decrire = (sim) => ({ rapides: sim.emetteurs.map((e) => e.rapide), inertes: sim.emetteurs.map((e) => !!e.inerte), simules: sim.simules.length });
const sans = new P.Simulation(device, DONNEES.effet, null);
const z = { a: () => [0, -55, 177, 0], grille: () => [0, -55, 177, 0] };
const deltas = sans.avancer(1, z);
const a = decrire(sans);
sans.detruire();
const table = O.construireTable({ largeurCqh: L, solRecette: 90 });
const avec = new P.Simulation(device, DONNEES.effet, monde(table));
const b = decrire(avec);
avec.detruire();
await envoyer({ webgpu: true, a, b, deltas });`);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.deepEqual(r.a, { rapides: [true, false], inertes: [false, true], simules: 0 }, 'sans obstacle : rien de simulé pas à pas');
  assert.deepEqual(r.deltas, [0, 0]);
  assert.deepEqual(r.b, { rapides: [false, false], inertes: [false, false], simules: 2 }, 'avec collisions : parent et enfant simulés');
});
