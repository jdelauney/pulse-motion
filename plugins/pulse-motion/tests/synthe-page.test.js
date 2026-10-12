'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { ouvrirPageSon } = require('./aide/page-son.js');
const { INSTRUMENTS } = require('../moteur/synthe/catalogue.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

const RESUME = `M.rendreSon().then(function (r) {
  if (!r.buffer) return null;
  var x = r.buffer.getChannelData(0);
  function rms(a, z) { var s = 0, n = 0; for (var k = Math.max(0, Math.round(a * 48000)); k < Math.min(x.length, Math.round(z * 48000)); k++) { s += x[k] * x[k]; n++; } return n ? Math.sqrt(s / n) : 0; }
  var nan = false; for (var j = 0; j < x.length; j += 97) if (!isFinite(x[j])) nan = true;
  // Empreinte : niveau de chaque dixième de seconde (des sources mêlées s'additionnent dans un ordre non garanti).
  var niveaux = []; for (var t = 0; t + 0.1 <= M.duree; t += 0.1) niveaux.push(rms(t, t + 0.1));
  return { niveaux: niveaux, sonie: r.sonie, nan: nan, debut: rms(1, 2), fin: rms(M.duree - 0.05, M.duree), duree: x.length / 48000 };
})`;

test('chaque instrument sonne (son fini, sans valeur invalide)', sans, async () => {
  const page = await ouvrirPageSon({ dir: copierProjet('projet-simple'), navigateur });
  try {
    for (const nom of INSTRUMENTS) {
      const r = await page.evaluer(`M.synthe.essayerInstrument(${JSON.stringify(nom)})`);
      assert.ok(r.rms > 0.001 && r.fini, `${nom} : ${JSON.stringify(r)}`);
    }
  } finally { await page.fermer(); }
});

test('musique générée : jouée dans le mixage, sonie de référence, identique d\'une page à l\'autre, silence à la toute fin', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { generee: 'inspirant', intensite: 0.9 }; });
  const lire = async () => { const p = await ouvrirPageSon({ dir, navigateur }); try { return await p.evaluer(RESUME); } finally { await p.fermer(); } };
  const a = await lire();
  const b = await lire();
  assert.ok(a && !a.nan, JSON.stringify(a));
  assert.ok(Math.abs(a.sonie + 16) < 0.5, String(a.sonie));
  assert.ok(a.debut > 0.01);
  assert.ok(a.fin < 0.01, String(a.fin));
  // Identiques à l'oreille (et à un millionième près), pas forcément au bit près.
  assert.equal(a.niveaux.length, b.niveaux.length);
  assert.ok(a.niveaux.every((v, i) => Math.abs(v - b.niveaux[i]) < 1e-6), 'deux rendus différents');
});

test('revue : partition plus courte que la vidéo : silence ensuite', sans, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'partition.json'), JSON.stringify({ tempo: 120, mesures: 1, pistes: [{ instrument: 'pad', motif: ['do3+mi3+sol3 1'] }] }));
  modifierDeroule(dir, (d) => { d.musique = { partition: 'assets/partition.json' }; });
  const p = await ouvrirPageSon({ dir, navigateur });
  try {
    const r = await p.evaluer(RESUME);
    assert.ok(r.debut > 0.01);
    const tard = await p.evaluer('M.rendreSon().then(function (r) { var x = r.buffer.getChannelData(0), s = 0; for (var k = 4 * 48000; k < 5 * 48000; k++) s += x[k] * x[k]; return Math.sqrt(s / 48000); })');
    assert.ok(tard < 0.001, String(tard));
  } finally { await p.fermer(); }
});

const { BRUITAGES } = require('../moteur/synthe/catalogue.js');
const { wavSinus } = require('./aide/son.js');

test('chaque bruitage sonne', sans, async () => {
  const page = await ouvrirPageSon({ dir: copierProjet('projet-simple'), navigateur });
  try {
    for (const nom of BRUITAGES) {
      const r = await page.evaluer(`M.synthe.essayerBruitage(${JSON.stringify(nom)})`);
      assert.ok(r.rms > 0.001 && r.fini, `${nom} : ${JSON.stringify(r)}`);
    }
  } finally { await page.fermer(); }
});

// Énergie du son (canal gauche) par tranche de 50 ms.
const ENERGIES = `M.rendreSon().then(function (r) {
  if (!r.buffer) return null;
  var x = r.buffer.getChannelData(0), pas = 2400, e = [];
  for (var k = 0; k + pas <= x.length; k += pas) { var s = 0; for (var i = k; i < k + pas; i++) s += x[i] * x[i]; e.push(Math.sqrt(s / pas)); }
  return e;
})`;
const pic = (e) => e.indexOf(Math.max(...e)) * 0.05;

function avecSon(dir, attributs) {
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', `<p id="bip" ${attributs}>!</p></section>`));
}

test('data-son : le son part au début de l\'élément', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecSon(dir, 'data-start="2" data-son="pop"');
  const p = await ouvrirPageSon({ dir, navigateur });
  try {
    const e = await p.evaluer(ENERGIES);
    assert.ok(Math.abs(pic(e) - 2) <= 0.1, String(pic(e)));
  } finally { await p.fermer(); }
});

test('revue : data-son calé sur un mot dans une scène allongée par la voix : au temps résolu de l\'élément', sans, async () => {
  const dir = copierProjet('projet-simple');
  const V = require('../scripts/lib/voix.js');
  const W = require('../moteur/wav.js');
  const x = new Float32Array(48000 * 7);
  for (let i = 24000; i < 48000 * 6.5; i++) x[i] = 0.3 * Math.sin(i / 5);
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: W.ecrire({ taux: 48000, canaux: [x] }), texte: 'un deux trois quatre' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'un deux trois quatre', fichier: r.relatif }; d.voix = { volume: 0 }; });
  avecSon(dir, 'data-start="mot:quatre" data-son="impact"');
  const p = await ouvrirPageSon({ dir, navigateur });
  try {
    const attendu = await p.evaluer('M.minutage.elements.intro.bip.debut');
    const e = await p.evaluer(ENERGIES);
    assert.ok(Math.abs(pic(e) - attendu) <= 0.1, `${pic(e)} / ${attendu}`);
  } finally { await p.fermer(); }
});

test('bruitages des transitions : un son au début de la scène qui entre ; volume 0 : silence', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.bruitages = { transitions: true }; });
  const p = await ouvrirPageSon({ dir, navigateur });
  try {
    const debut = await p.evaluer('M.minutage.scenes[1].debut');
    const e = await p.evaluer(ENERGIES);
    assert.ok(Math.abs(pic(e) - debut) <= 0.4, `${pic(e)} / ${debut}`);
  } finally { await p.fermer(); }
  modifierDeroule(dir, (d) => { d.bruitages = { transitions: true, volume: 0 }; });
  const q = await ouvrirPageSon({ dir, navigateur });
  try { assert.equal(await q.evaluer('M.rendreSon().then(function (r) { return r.sonie; })'), null); } finally { await q.fermer(); }
});

test('fichier de son importé : embarqué, joué au début de l\'élément', sans, async () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets', 'sons'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'sons', 'porte.wav'), wavSinus({ secondes: 0.3, frequence: 600 }));
  avecSon(dir, 'data-start="3" data-son="assets/sons/porte.wav"');
  const p = await ouvrirPageSon({ dir, navigateur });
  try {
    const e = await p.evaluer(ENERGIES);
    assert.ok(Math.abs(pic(e) - 3.1) <= 0.25, String(pic(e)));
  } finally { await p.fermer(); }
});
