'use strict';
/* Spec S2, 5.11 : écoute mesurée du mixage (moteur/ecoute.js, fonctions pures). */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../moteur/ecoute.js');
const SEUILS = require('../scripts/seuils.json');

const TAUX = 48000;
/** Signal « voix » : sinus de 1 kHz modulé (dans la bande de la parole), de debut à fin (s). */
function son(duree, { freq = 1000, niveau = 0.2, debut = 0, fin = duree } = {}) {
  const x = new Float32Array(Math.round(duree * TAUX));
  for (let i = Math.round(debut * TAUX); i < Math.min(x.length, Math.round(fin * TAUX)); i++) x[i] = niveau * Math.sin(2 * Math.PI * freq * i / TAUX);
  return x;
}

test('ecoute.test.js › émergence : voix seule 100 %, voix sous une musique à même niveau dans la bande, sous 80 %', () => {
  const voix = son(4);
  const seule = E.emergence({ voix, autres: new Float32Array(voix.length), taux: TAUX, debut: 0, fin: 4, seuils: SEUILS });
  assert.equal(seule.part, 1);
  assert.ok(seule.fenetres >= 39);
  // Musique à 1,2 kHz au même niveau : dans la bande, la voix ne ressort plus de 3 dB.
  const couverte = E.emergence({ voix, autres: son(4, { freq: 1200 }), taux: TAUX, debut: 0, fin: 4, seuils: SEUILS });
  assert.ok(couverte.part < 0.8, String(couverte.part));
  // Musique grave (80 Hz) même forte : hors de la bande, la voix reste claire.
  const grave = E.emergence({ voix, autres: son(4, { freq: 80, niveau: 0.3 }), taux: TAUX, debut: 0, fin: 4, seuils: SEUILS });
  assert.ok(grave.part >= 0.8, String(grave.part));
  // Constat par scène, seulement pour les scènes où quelqu'un parle.
  const c = E.ecouter({ voix, autres: son(4, { freq: 1200 }), taux: TAUX, duree: 4, scenes: [{ id: 'a', debut: 0, fin: 4, voix: true }, { id: 'b', debut: 4, fin: 5, voix: false }], seuils: SEUILS });
  assert.deepEqual(c.map((x) => [x.regle, x.scene]), [['voix-couverte', 'a']]);
  assert.ok(c[0].valeur > 20);
});

test('ecoute.test.js › silence de 3 s détecté, silence de 2 s ignoré', () => {
  const x = son(10, { debut: 0, fin: 3 });
  x.set(son(10, { debut: 6 }).subarray(Math.round(6 * TAUX)), Math.round(6 * TAUX));
  const s = E.silences(x, TAUX, { niveau: SEUILS.silenceNiveau, duree: SEUILS.silenceDuree });
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s[0].debut - 3) < 0.15 && Math.abs(s[0].fin - 6) < 0.15, JSON.stringify(s));
  const y = son(10, { fin: 3 });
  y.set(son(10, { debut: 5 }).subarray(Math.round(5 * TAUX)), Math.round(5 * TAUX));
  assert.deepEqual(E.silences(y, TAUX, { niveau: SEUILS.silenceNiveau, duree: SEUILS.silenceDuree }), []);
  // Avec une musique prévue : silence-imprevu ; l'humeur « silence » de la scène le rend voulu.
  const scenes = [{ id: 'a', debut: 0, fin: 10, voix: false, humeur: 'normale' }];
  const c = E.ecouter({ voix: null, autres: x, taux: TAUX, duree: 10, scenes, musique: true, seuils: SEUILS });
  assert.deepEqual(c.map((p) => [p.regle, p.scene]), [['silence-imprevu', 'a']]);
  assert.deepEqual(E.ecouter({ voix: null, autres: x, taux: TAUX, duree: 10, scenes: [{ ...scenes[0], humeur: 'silence' }], musique: true, seuils: SEUILS }), []);
});
