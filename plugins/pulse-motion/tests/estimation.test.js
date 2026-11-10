'use strict';
/* Spec Rendu et export, 5.5 : temps restant estimé sur une fenêtre glissante de 20 s d'images réellement capturées
 * (moteur/estimation.js), mesures de cet ordinateur (scripts/lib/mesures-export.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../moteur/estimation.js');
const ME = require('../scripts/lib/mesures-export.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

test('estimation.test.js › progression régulière simulée : erreur < 15 % dès 20 % de l\'export', () => {
  // 1 800 images à 12 images par seconde, avec un démarrage lent (les 60 premières à 4 i/s) et 8 s de phases finales.
  const total = 1800;
  const finales = 8;
  const e = E.creerEstimation({ total, finales });
  let t = 0;
  const instants = [];
  for (let n = 1; n <= total; n++) { t += n <= 60 ? 1 / 4 : 1 / 12; instants.push(t); }
  const fin = instants[total - 1] + finales;
  for (let n = 1; n <= total; n++) {
    e.noter(n, instants[n - 1]);
    if (n >= total * 0.2 && n < total) {
      const reel = fin - instants[n - 1];
      const estime = e.restant(instants[n - 1]);
      assert.ok(Math.abs(estime - reel) / reel < 0.15, `image ${n} : ${estime.toFixed(1)} s estimées, ${reel.toFixed(1)} s réelles`);
    }
  }
});

test('estimation.test.js › segments repris : exclus de la vitesse', () => {
  // 600 images reprises d'un coup au début (segments du cache), puis 10 i/s capturées.
  const e = E.creerEstimation({ total: 1200 });
  e.noter(600, 1, 600);
  for (let k = 1; k <= 300; k++) e.noter(600 + k, 1 + k / 10, 600);
  // 300 images restantes à 10 i/s : 30 s, pas la vitesse gonflée par les 600 reprises.
  assert.ok(Math.abs(e.restant(31) - 30) < 0.5, String(e.restant(31)));
  // Sans aucune image capturée, rien n'est estimé.
  const vide = E.creerEstimation({ total: 100 });
  vide.noter(50, 1, 50);
  assert.equal(vide.restant(2), null);
});

test('estimation.test.js › ligne de progression en français', () => {
  assert.equal(E.ligneProgression({ faites: 720, total: 1800, restant: 70 }), 'Export : 40 % (image 720 / 1800) – encore environ 1 min 10 s');
  assert.equal(E.ligneProgression({ faites: 10, total: 100, restant: null }), 'Export : 10 % (image 10 / 100)');
  assert.equal(E.texteDuree(45), '45 s');
  assert.equal(E.texteDuree(180), '3 min');
});

test('estimation.test.js › mesures de cet ordinateur : 5 gardées, estimation d\'après la plus proche', () => {
  const dossier = dossierTemporaire('pm-mesures-');
  for (let k = 1; k <= 7; k++) ME.noterMesure({ voie: 'fidele', definition: '1080p', ips: 30, flou: false, imagesParSeconde: 10 * k, finalesParSeconde: 0.1 }, { dossier });
  const m = ME.lireMesures({ dossier });
  assert.equal(m.length, 5);
  assert.deepEqual(m.map((x) => x.imagesParSeconde), [30, 40, 50, 60, 70]);
  const j = JSON.parse(fs.readFileSync(path.join(dossier, 'mesures-export.json'), 'utf8'));
  assert.equal(j.version, 1);
  // 60 s à 30 i/s : 1 800 images à 50 i/s (médiane) + 0,1 s par seconde de vidéo.
  assert.deepEqual(ME.estimerSecondes({ voie: 'fidele', definition: '1080p', ips: 30, duree: 60, mesures: m }), { secondes: 42, source: 'mesure' });
  assert.equal(ME.estimerSecondes({ voie: 'navigateur', duree: 60, mesures: m }).source, 'defaut');
  assert.deepEqual(ME.estimerSecondes({ voie: 'navigateur', duree: 60, mesures: [], usage: { mesures: { secondesParSeconde: 1.5 } } }), { secondes: 90, source: 'usages' });
});
