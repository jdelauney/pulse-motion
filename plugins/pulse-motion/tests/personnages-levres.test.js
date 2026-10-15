'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../moteur/personnages/levres.js');

const v = (w) => L.visemesDuMot(w).map((x) => x.v).join(' ');

test('visèmes des mots : groupes, nasales, consonnes, finales muettes', () => {
  assert.equal(v('bonjour'), 'MBP O U');
  assert.equal(v('famille'), 'FV A MBP I');
  assert.equal(v('eau'), 'O');
  assert.equal(v('froid'), 'FV U A', 'oi, d final muet');
  assert.equal(v("l'homme"), 'L O MBP', 'apostrophe retirée, mm non nasal, e final muet');
  assert.equal(v('oui'), 'U I');
  assert.equal(v('pain'), 'MBP E');
  assert.equal(v('Pourquoi'), 'MBP U A', 'qu muet');
  assert.equal(v('portes'), 'MBP O L', 'es puis t muets');
  assert.equal(v('—'), 'E', 'sans visème : E');
  assert.deepEqual(L.visemesDuMot('maman').map((x) => x.poids), [1, 2, 1, 2]);
});

test('piste : contiguë dans un mot, silences gardés, au repos, puis rendus ; fenêtre ; mots invalides ignorés', () => {
  const mots = [{ w: 'Bonjour', t0: 0, t1: 0.5 }, { w: 'à', t0: 0.55, t1: 0.7 }, { w: 'tous', t0: 1, t1: 1.4 }, { w: 'Fin', t0: 2.5, t1: 2.9 },
    { w: '!', t0: 3, t1: 3.2 }, { w: 'zéro', t0: 4, t1: 4 }];
  const p = L.piste(mots, 10, 0, Infinity);
  for (let k = 1; k < p.length; k++) assert.ok(p[k].t0 >= p[k - 1].t1 - 1e-9, 'ordonnée');
  assert.equal(L.boucheAuTemps(p, 10.01), 'MBP');
  assert.equal(L.boucheAuTemps(p, 10.52), 'U', 'trou de 0,05 s : la bouche garde son visème');
  assert.equal(L.boucheAuTemps(p, 10.85), 'repos', 'trou de 0,3 s : au repos');
  assert.equal(L.boucheAuTemps(p, 12), null, 'silence de 1,1 s : bouche de l\'expression');
  assert.equal(L.boucheAuTemps(p, 13.1), null, 'ponctuation seule : rien');
  assert.equal(L.boucheAuTemps(p, 9), null);
  assert.ok(p.every((s) => s.t1 > s.t0), 'aucun segment vide (mot de durée nulle ignoré)');
  const fen = L.piste(mots, 10, 10.9, 12);
  assert.deepEqual([...new Set(fen.map((s) => s.v))], ['L', 'U'], 'fenêtre : seul « tous »');
});

test('débit rapide : segments trop courts retirés, consonnes d\'abord', () => {
  const p = L.piste([{ w: 'famille', t0: 0, t1: 0.12 }], 0, 0, 1);
  assert.ok(p.every((s) => s.t1 - s.t0 >= L.MIN - 1e-9), JSON.stringify(p));
  assert.ok(p.some((s) => s.v === 'A'), 'les voyelles restent');
  proche(p[p.length - 1].t1, 0.12);
});

function proche(a, b) { assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`); }
