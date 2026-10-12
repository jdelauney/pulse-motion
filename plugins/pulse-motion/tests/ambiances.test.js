'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../moteur/synthe/ambiances.js');
const P = require('../moteur/synthe/partition.js');
const { AMBIANCES } = require('../moteur/synthe/catalogue.js');

const scenes = [{ debut: 0, fin: 6 }, { debut: 5.5, fin: 14 }, { debut: 13.5, fin: 20 }];
const gen = (o) => A.generer({ duree: 20, scenes, ...o });

test('chaque ambiance donne une partition valide, à son tempo, qui couvre la vidéo', () => {
  for (const nom of Object.keys(AMBIANCES)) {
    const p = gen({ ambiance: nom, intensite: 0.9 });
    assert.deepEqual(P.validerPartition(p), [], nom);
    assert.equal(p.tempo, AMBIANCES[nom].tempo, nom);
    assert.ok(p.mesures * P.dureeMesure(p.tempo) >= 20, nom);
  }
});

test('déterministe par la graine ; une autre graine donne une variante', () => {
  assert.deepEqual(gen({ ambiance: 'inspirant', graine: 3 }), gen({ ambiance: 'inspirant', graine: 3 }));
  const varie = [4, 5, 6, 7].some((g) => JSON.stringify(gen({ ambiance: 'inspirant', graine: 3 })) !== JSON.stringify(gen({ ambiance: 'inspirant', graine: g })));
  assert.ok(varie);
});

test('structure : pas de percussion dans l\'introduction, montée avant la dernière scène, accord final', () => {
  const p = gen({ ambiance: 'entrainant', intensite: 1 });
  const e = P.evenements(p, { duree: 20 });
  const percus = e.filter((x) => ['kick', 'caisse', 'charleston'].includes(x.instrument));
  assert.ok(percus.length > 0);
  assert.ok(percus.every((x) => x.t >= 6 - P.dureeMesure(p.tempo)), JSON.stringify(percus[0]));
  const riser = e.filter((x) => x.instrument === 'riser');
  assert.equal(riser.length, 1);
  assert.ok(riser[0].t <= 13 && riser[0].t + riser[0].duree >= 13, JSON.stringify(riser[0]));
  const dernier = Math.max(...e.map((x) => x.t));
  assert.ok(e.some((x) => x.t === dernier && x.frequences.length >= 3), 'accord final');
});

test('intensité : plus de couches quand elle monte ; calme sans percussion', () => {
  const instruments = (o) => new Set(gen(o).pistes.map((x) => x.instrument));
  assert.ok(instruments({ ambiance: 'corporate', intensite: 0.1 }).size < instruments({ ambiance: 'corporate', intensite: 0.9 }).size);
  assert.ok(![...instruments({ ambiance: 'calme', intensite: 1 })].some((i) => ['kick', 'caisse', 'charleston'].includes(i)));
});

test('revue : vidéo de 2 s, une seule scène : partition valide, au moins une mesure, pas de montée', () => {
  const p = A.generer({ ambiance: 'tech', duree: 2, scenes: [{ debut: 0, fin: 2 }], intensite: 1 });
  assert.deepEqual(P.validerPartition(p), []);
  assert.ok(p.mesures >= 1);
  assert.ok(!p.pistes.some((x) => x.instrument === 'riser'));
});

test('tempo et tonalité donnés, tonalités reconnues', () => {
  const p = gen({ ambiance: 'calme', tempo: 90, tonalite: 'sib' });
  assert.equal(p.tempo, 90);
  assert.equal(p.tonalite, 'sib');
  assert.ok(A.tonaliteValide('fa#m') && A.tonaliteValide('mib') && !A.tonaliteValide('h'));
});
