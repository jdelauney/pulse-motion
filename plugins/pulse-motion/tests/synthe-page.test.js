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
