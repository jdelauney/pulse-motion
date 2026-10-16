'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../moteur/synthe/partition.js');
const A = require('../moteur/synthe/ambiances.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const { assembler } = require('../scripts/assembler.js');
const { validerDeroule, lireDeroule, dureeTemps } = require('../scripts/lib/deroule.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const proche = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('partition : une piste avec origine et jusqua joue sur sa grille, coupée à jusqua', () => {
  const p = { tempo: 120, mesures: 2, pistes: [
    { instrument: 'kick', motif: ['x 1/4'], origine: 3.3, jusqua: 4.6 },
    { instrument: 'pad', motif: ['do3 1'], de: 1, a: 2 },
  ] };
  assert.deepEqual(P.validerPartition(p), []);
  const ev = P.evenements(p, { duree: 10 });
  const kicks = ev.filter((e) => e.instrument === 'kick').map((e) => e.t);
  assert.deepEqual(kicks, [3.3, 3.8, 4.3], 'un temps toutes les 0,5 s depuis 3,3 s, rien après 4,6 s');
  proche(ev.find((e) => e.t === 4.3).duree, 0.3, 1e-9);
  assert.deepEqual(ev.filter((e) => e.instrument === 'pad').map((e) => e.t), [2], 'piste sans origine : grille continue');
  assert.match(P.validerPartition({ tempo: 120, mesures: 1, pistes: [{ instrument: 'kick', motif: ['x 1/4'], scene: 'Mauvaise Scène', origine: -1 }] }).join(' '), /« scene ».*« origine »/);
});

test('musique composée : une section par scène, pile au vrai début (transitions comprises), humeurs', () => {
  const scenes = [{ id: 'a', duree: 4.3 }, { id: 'b', duree: 3, transition: 'fondu' }, { id: 'c', duree: 3.7, transition: 'glissement' }, { id: 'd', duree: 2 }];
  const min = calculerMinutage(scenes, {});
  const sec = min.scenes.map((s, i) => ({ debut: s.debut, fin: s.fin, humeur: [undefined, 'silence', 'intense', undefined][i] }));
  const gen = A.generer({ ambiance: 'entrainant', tempo: 120, intensite: 0.5, graine: 3, duree: min.duree, scenes: sec });
  assert.deepEqual(P.validerPartition(gen), []);
  const ev = P.evenements(gen, { duree: min.duree });
  const debutB = min.scenes[1].debut, debutC = min.scenes[2].debut, debutD = min.scenes[3].debut;
  proche(debutB, 3.8); proche(debutC, 6.3);
  assert.ok(!ev.some((e) => e.t >= debutB - 1e-9 && e.t < debutC - 1e-9 && e.instrument !== 'riser'), 'silence pendant la scène b');
  assert.ok(ev.some((e) => Math.abs(e.t - debutC) < 1e-6), 'la section c commence pile au début de c');
  assert.ok(ev.some((e) => e.instrument === 'kick' && e.t >= debutC && e.t < debutD), 'intense : percussions même à intensité 0,5');
  assert.ok(!ev.some((e) => e.instrument === 'kick' && e.t < debutB), 'introduction sans percussion');
  for (const e of ev.filter((x) => x.instrument === 'kick' && x.t >= debutC && x.t < debutD)) proche(((e.t - debutC) / 0.5) % 1 === 0 ? 0 : ((e.t - debutC) / 0.5) % 1, 0, 1e-6);
  const final = ev.filter((e) => e.instrument === 'pad').pop();
  proche(final.t + final.duree, min.duree, 1e-6);
  assert.equal(JSON.stringify(A.generer({ ambiance: 'entrainant', tempo: 120, intensite: 0.5, graine: 3, duree: min.duree, scenes: sec })), JSON.stringify(gen), 'même graine, même musique');
  assert.match(validerDeroule({ version: 1, titre: 'T', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 's', scenes: [{ id: 'a', fichier: 'a.html', duree: 1, textes: {}, musique: 'fort' }] }).join(' '), /« musique » \(humeur.*silence, calme, normale, intense/);
});

test('voix : la scène finit avec la voix, sans arrondi au temps', () => {
  const min = calculerMinutage([{ id: 'a', duree: 1, voix: { debut: 0.3, duree: 2.13 } }, { id: 'b', duree: 2 }], {}, { dureeTemps: 0.5 });
  proche(min.scenes[1].debut, 0.3 + 2.13 + 0.4);
});

test('partition : pistes calées sur les scènes à l\'assemblage, scène inconnue, tempo repris par la vidéo', () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'partition.json'), JSON.stringify({ tempo: 120, mesures: 4, pistes: [
    { instrument: 'kick', motif: ['x 1/4'], scene: 'chiffre' }, { instrument: 'pad', motif: ['do3 1'], scene: 'intro', a: 1 },
  ] }));
  modifierDeroule(dir, (d) => { d.musique = { partition: 'assets/partition.json', volume: 0.6 }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const [kick, pad] = r.donnees.musique.partition.pistes;
  proche(kick.origine, 3.5); proche(kick.jusqua, 7.25);
  assert.equal(kick.scene, undefined);
  proche(pad.origine, 0); proche(pad.jusqua, 3.5);
  assert.deepEqual(r.donnees.tempo, { bpm: 120, decalage: 0 }, 'le tempo de la partition devient celui de la vidéo');
  const lu = lireDeroule(dir);
  assert.equal(dureeTemps(lu.deroule), 0.5);
  assert.ok(!JSON.stringify(lu.deroule).includes('tempoPartition'), 'le tempo retenu ne s\'écrit pas dans le déroulé');
  modifierDeroule(dir, (d) => { d.tempo = { bpm: 90 }; });
  assert.match(lireDeroule(dir).erreurs.join(' '), /tempo de la partition \(120\) et « tempo\.bpm » \(90\) diffèrent/);
  modifierDeroule(dir, (d) => { delete d.tempo; });
  fs.writeFileSync(path.join(dir, 'assets', 'partition.json'), JSON.stringify({ tempo: 120, mesures: 4, pistes: [{ instrument: 'kick', motif: ['x 1/4'], scene: 'fin' }] }));
  const r2 = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.match(r2.erreurs.filter((e) => e.regle === 'partition-invalide').map((e) => e.message).join(' '), /scène « fin » inconnue \(scènes : intro, chiffre\)/);
});
