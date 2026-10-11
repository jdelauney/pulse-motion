'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const I = require('../moteur/particules/instantanes.js');
const N = require('../moteur/particules/naissances.js');
const { balistique } = require('../moteur/particules/forme-close.js');
const R = require('../moteur/particules/recette.js');

const EFFETS = path.join(__dirname, 'fixtures', 'effets');
const charger = (nom) => JSON.parse(fs.readFileSync(path.join(EFFETS, `${nom}.json`), 'utf8'));
const proche = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const resume = (actions) => actions.map((a) => (a.k === undefined ? a.type : `${a.type} ${a.k}`)).join(', ');

test('planificateur : départ, avance, instantanés, retour en arrière', () => {
  const p = I.creerPlanificateur({ intervalle: 4 });
  assert.equal(resume(p.planifier(3)), 'vider, pas 0, pas 1, pas 2');
  assert.equal(resume(p.planifier(5)), 'pas 3, sauver 4, pas 4');
  assert.equal(resume(p.planifier(5)), '');
  assert.equal(resume(p.planifier(10)), 'pas 5, pas 6, pas 7, sauver 8, pas 8, pas 9');
  assert.equal(resume(p.planifier(6)), 'restaurer 4, pas 4, pas 5');
  assert.equal(resume(p.planifier(30)).split(', ').slice(0, 3).join(', '), 'restaurer 8, pas 8, pas 9');
  assert.deepEqual(p.instantanes(), [4, 8, 12, 16, 20, 24, 28]);
  assert.equal(resume(p.planifier(9)), 'restaurer 8, pas 8');
  assert.equal(resume(p.planifier(20)), 'restaurer 20', 'un instantané exact suffit');
  assert.equal(resume(p.planifier(21)), 'pas 20');
  assert.equal(resume(p.planifier(2)), 'vider, pas 0, pas 1');
  p.oublier();
  assert.equal(resume(p.planifier(1)), 'vider, pas 0');
  assert.equal(p.courant(), 1);
});

test('planificateur : continuer plutôt que restaurer quand l\'état courant est plus proche', () => {
  const p = I.creerPlanificateur({ intervalle: 4 });
  p.planifier(9);
  assert.equal(resume(p.planifier(20)), 'pas 9, pas 10, pas 11, sauver 12, pas 12, pas 13, pas 14, pas 15, sauver 16, pas 16, pas 17, pas 18, pas 19, sauver 20');
});

test('intervalle des instantanés : doublé tant que le budget est dépassé', () => {
  assert.equal(I.intervallePour({ tailleEtat: 1e6, pasTotal: 1200, budget: 256e6 }), 120);
  assert.equal(I.intervallePour({ tailleEtat: 64e6, pasTotal: 1200, budget: 256e6 }), 480);
  assert.equal(I.intervallePour({ tailleEtat: 0, pasTotal: 1200, budget: 256e6 }), 120);
});

const continu = { capContinu: 51, nTotal: 100, debit: 50, salves: [], k: 0, G: 1 };

test('naissances : occupant d\'une case continue', () => {
  assert.deepEqual(N.occupant(continu, 3, 1.5), { n: 54, gen: 1, t: 54 / 50 });
  assert.equal(N.occupant(continu, 3, 0.05), null, 'pas encore née');
  assert.equal(N.occupant(continu, 3, 1).n, 3, 'la 54 naît à τ = 1,08 : à τ = 1, la case porte encore la 3');
  assert.equal(N.occupant(continu, 60, 1), null, 'case hors des naissances continues');
  assert.deepEqual(N.occupant(continu, 48, 9), { n: 99, gen: 1, t: 99 / 50 }, 'nTotal borne les naissances');
});

test('naissances : dans un pas, salves', () => {
  assert.deepEqual(N.naissanceDuPas(continu, 3, 1.075, 1.0833), { n: 54, gen: 1, t: 54 / 50 });
  assert.equal(N.naissanceDuPas(continu, 3, 1.0833, 1.1), null);
  const salves = { capContinu: 0, nTotal: 0, debit: 0, salves: [{ t: 0.5, nombre: 10, debut: 0 }, { t: 1, nombre: 5, debut: 10 }], k: 0, G: 1 };
  assert.deepEqual(N.occupant(salves, 12, 1.2), { n: 12, gen: 0, t: 1 });
  assert.equal(N.occupant(salves, 12, 1), null);
  assert.deepEqual(N.naissanceDuPas(salves, 4, 0.5, 0.51), { n: 4, gen: 0, t: 0.5 });
});

test('naissances : case partagée dans un pas (débit très fort, vie très courte)', () => {
  const dense = { capContinu: 3, nTotal: 10000, debit: 1000, salves: [], k: 0, G: 1 };
  // Pendant [0, 1/120) naissent n = 0…8 ; la case 1 reçoit 1, 4 et 7 : seule la 7 l'occupe.
  assert.deepEqual(N.naissanceDuPas(dense, 1, 0, 1 / 120), { n: 7, gen: 2, t: 0.007 });
});

test('naissances : case d\'un enfant', () => {
  assert.deepEqual(N.caseEnfant({ k: 3, G: 2 }, 17), { caseParent: 2, generation: 1, j: 2 });
});

test('capacités : aucune case réécrite avant la mort de son occupant', () => {
  for (const vieEnfant of [[0.2, 0.4], [0.2, 1.2], [1, 3]]) {
    const recette = R.resoudre('gerbe', charger);
    recette.emetteurs[1].naissance.vie = vieEnfant;
    const { effet } = R.compiler(recette, { dur: 2, graine: 1 });
    const [parent, enfant] = effet.emetteurs;
    const pas = 1 / 120;
    const vieParent = (n) => parent.vie[0] + (parent.vie[1] - parent.vie[0]) * ((n * 7919) % 101) / 100;
    const finEnfant = {};   // case enfant -> instant de mort de l'occupant
    for (let k = 0; k * pas < effet.fin + 1; k++) {
      for (let s = 0; s < parent.capacite; s++) {
        const ne = N.naissanceDuPas(parent, s, k * pas, (k + 1) * pas);
        if (!ne) continue;
        const mort = ne.t + vieParent(ne.n);
        for (let j = 0; j < enfant.k; j++) {
          const c = (s * enfant.G + (ne.gen % enfant.G)) * enfant.k + j;
          assert.ok(!(finEnfant[c] > mort + 1e-9), `vie enfant ${vieEnfant} : case ${c} réécrite à ${mort} avant la mort de son occupant (${finEnfant[c]})`);
          finEnfant[c] = mort + enfant.vie[1];
          assert.deepEqual(N.caseEnfant(enfant, c), { caseParent: s, generation: ne.gen % enfant.G, j });
        }
      }
    }
  }
});

test('forme close : chute libre, traînée, composition exacte', () => {
  const chute = balistique([0, 0], [0, -20], [0, 30], 0, 1.5);
  assert.ok(proche(chute.p[1], -30 + 33.75) && proche(chute.v[1], 25));
  const r = balistique([1, 2], [10, -5], [0, 40], 2, 50);
  assert.ok(proche(r.v[0], 0, 1e-12) && proche(r.v[1], 20), 'vitesse limite A/K');
  for (const K of [0, 1e-7, 0.8, 5]) {
    const une = balistique([3, 4], [7, -9], [1, 30], K, 1);
    const moitie = balistique([3, 4], [7, -9], [1, 30], K, 0.5);
    const deux = balistique(moitie.p, moitie.v, [1, 30], K, 0.5);
    for (let i = 0; i < 2; i++) assert.ok(proche(deux.p[i], une.p[i], 1e-12) && proche(deux.v[i], une.v[i], 1e-12), `K = ${K}`);
  }
  const presque = balistique([0, 0], [1, 1], [0, 10], 1e-9, 2);
  const sans = balistique([0, 0], [1, 1], [0, 10], 0, 2);
  assert.ok(proche(presque.p[1], sans.p[1], 1e-8));
});

test('recette : 8 salves au plus', () => {
  const salves = Array.from({ length: 9 }, (_, i) => ({ t: i, nombre: 1 }));
  const r = R.compiler({ version: 1, nom: 'x', emetteurs: [{ nom: 'a', naissance: { salves } }] }, { dur: 1, graine: 1 });
  assert.equal(r.ok, false);
  assert.match(r.erreurs[0].message, /emetteurs\[a\]\.naissance\.salves : 8 salves au plus/);
});
