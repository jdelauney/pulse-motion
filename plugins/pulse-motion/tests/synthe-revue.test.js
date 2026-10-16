'use strict';
/* Corrections de la revue du plan Audio-6 (synthèse). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { controler } = require('../scripts/controler.js');
const { exporterFidele } = require('../scripts/export-fidele.js');
const A = require('../moteur/synthe/ambiances.js');
const P = require('../moteur/synthe/partition.js');
const F = require('../scripts/lib/ffmpeg.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { ouvrirPageSon } = require('./aide/page-son.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();

test('revue : le contrôle marche avec une musique générée sans tempo écrit', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { generee: 'calme' }; });
  const c = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.ok(Array.isArray(c.problemes));
});

test('revue : export fidèle avec une musique générée : vidéo avec son', { skip: (!navigateur && 'Chrome absent') || (!(outil.present && outil.versionOk) && 'ffmpeg absent') }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { generee: 'inspirant' }; });
  const r = await exporterFidele({ dossier: dir, qualite: '720p', ips: 5, navigateur, outil, dossierStyles: STYLES, paralleles: 1 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, true);
  assert.equal(r.avertissement, undefined);
});

test('revue : 3 minutes d\'ambiance tech rendues en moins de 20 s', { skip: !navigateur && 'Chrome absent' }, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { generee: 'tech', intensite: 0.9 }; d.scenes[0].duree = 90; d.scenes[1].duree = 72; });
  const page = await ouvrirPageSon({ dir, navigateur });
  try {
    const r = await page.evaluer('(function () { var t = performance.now(); return M.rendreSon().then(function (s) { return { secondes: (performance.now() - t) / 1000, duree: s.buffer.duration, sonie: s.sonie }; }); })()');
    assert.ok(r.duree > 179, String(r.duree));
    console.log(`rendu de 3 min : ${r.secondes.toFixed(1)} s`);
    assert.ok(r.secondes < 20, `${r.secondes} s`);
    assert.ok(Math.abs(r.sonie + 16) < 0.5);
  } finally { await page.fermer(); }
});

test('revue : accord final de tonique audible (au moins une demi-mesure), même quand la vidéo finit en début de mesure', () => {
  for (const duree of [6.8, 10.1, 20]) {
    const p = A.generer({ ambiance: 'calme', duree, scenes: [{ debut: 0, fin: duree }] });
    const e = P.evenements(p, { duree });
    const dernier = e.filter((x) => x.frequences.length >= 3).pop();
    assert.ok(dernier.duree >= P.dureeMesure(p.tempo) / 2 - 1e-6, `${duree} s : ${JSON.stringify(dernier)}`);
    assert.ok(Math.abs(dernier.t + dernier.duree - duree) < 1e-6, `${duree} s : l'accord final va jusqu'à la fin`);
  }
});

test('revue : la montée occupe la dernière seconde avant la dernière scène (son vrai début, transition comprise)', () => {
  for (const [ambiance, frontiere] of [['calme', 5.05], ['entrainant', 14], ['tech', 9.3]]) {
    const scenes = [{ debut: 0, fin: 4 }, { debut: 3.5, fin: frontiere }, { debut: frontiere - 0.5, fin: frontiere + 6 }];
    const p = A.generer({ ambiance, intensite: 1, duree: frontiere + 6, scenes });
    const riser = P.evenements(p, { duree: frontiere + 6 }).filter((x) => x.instrument === 'riser');
    assert.equal(riser.length, 1, ambiance);
    const pas = P.dureeMesure(p.tempo) / 16;
    const debutDerniere = frontiere - 0.5;
    assert.ok(Math.abs(riser[0].t - (debutDerniere - 1)) <= pas, `${ambiance} : début ${riser[0].t}`);
    assert.ok(Math.abs(riser[0].t + riser[0].duree - debutDerniere) <= 2 * pas, `${ambiance} : fin ${riser[0].t + riser[0].duree}`);
  }
});
