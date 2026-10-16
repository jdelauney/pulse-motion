'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../moteur/shaders/code.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');

const FOND_SON = 'fn image(coord: vec2f) -> vec4f {\n  return vec4f(iSon.basses, sonSpectre(0.2), f32(iFrame % 2), 1.0);\n}\n';

test('ecrireEntrees : 128 octets, son aux mots 20 à 27, image aux mots 28 et 29', () => {
  assert.equal(S.OCTETS_ENTREES, 128);
  const b = S.ecrireEntrees({ temps: 1, mode: 1, son: { volume: 0.1, basses: 0.2, mediums: 0.3, aigus: 0.4, battement: 0.5, phase: 0.6, enveloppe: 0.7, syllabe: 0.8 }, image: [42, 1 / 30] });
  const f = new Float32Array(b);
  assert.deepEqual(Array.from(f.slice(20, 28)).map((x) => Math.round(x * 10) / 10), [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  assert.equal(f[28], 42);
  assert.ok(Math.abs(f[29] - 1 / 30) < 1e-7);
  const sans = new Float32Array(S.ecrireEntrees({ temps: 1 }));
  assert.deepEqual(Array.from(sans.slice(20, 30)), new Array(10).fill(0));
});

test('assemblage : iSon, iFrame, iTimeDelta, texture du son', () => {
  const a = S.assemblerShader({ code: FOND_SON, usage: 'fond', disposition: S.dispositionReglages({}) });
  assert.match(a.wgsl, /@group\(0\) @binding\(8\) var iSonTexture: texture_2d<f32>;/);
  assert.match(a.wgsl, /fn sonSpectre\(x: f32\) -> f32/);
  assert.match(a.wgsl, /fn sonOnde\(x: f32\) -> f32/);
  assert.match(a.wgsl, /iSon = PmSon\(PM\.son\.x, PM\.son\.y, PM\.son\.z, PM\.son\.w, PM\.son2\.x, PM\.son2\.y, PM\.son2\.z, PM\.son2\.w\);/);
  assert.match(a.wgsl, /iFrame = i32\(PM\.image\.x\);/);
  assert.match(a.wgsl, /son2: vec4f,/);
});

test('validation : noms du son réservés, champ piste', () => {
  const json = { version: 1, nom: 'x', usage: 'fond' };
  const regles = (code, j = json) => S.validerShader('x', j, code).map((e) => e.regle);
  assert.deepEqual(regles(FOND_SON), []);
  for (const nom of ['iSon', 'iSonTexture', 'iFrame', 'iTimeDelta', 'sonSpectre', 'sonOnde', 'PmSon']) {
    assert.ok(regles(`const ${nom} = 1.0;\n${FOND_SON}`).includes('nom-reserve'), nom);
  }
  assert.deepEqual(regles(FOND_SON, { ...json, piste: 'voix' }), []);
  assert.ok(regles(FOND_SON, { ...json, piste: 'Voix !' }).includes('shader-invalide'));
});

test('pistesShader : la piste du shader quand le code lit le son, rien sinon', () => {
  assert.deepEqual(S.pistesShader({ usage: 'fond' }, FOND_SON), ['musique']);
  assert.deepEqual(S.pistesShader({ usage: 'fond', piste: 'voix' }, 'fn image(c: vec2f) -> vec4f { return vec4f(sonOnde(c.x)); }'), ['voix']);
  assert.deepEqual(S.pistesShader({ usage: 'fond' }, '// iSon n\'est pas lu\nfn image(c: vec2f) -> vec4f { return vec4f(1.0); }'), []);
});

function projet({ musique }) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [{ id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} }];
    if (musique) d.musique = { fichier: 'assets/m.wav' };
  });
  fs.mkdirSync(path.join(dir, 'shaders'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'shaders', 'pulsar.json'), JSON.stringify({ version: 1, nom: 'pulsar', usage: 'fond' }));
  fs.writeFileSync(path.join(dir, 'shaders', 'pulsar.wgsl'), FOND_SON);
  if (musique) fs.writeFileSync(path.join(dir, 'assets', 'm.wav'), wavSinus({ secondes: 3 }));
  fs.writeFileSync(path.join(dir, 'scenes', 'a.html'), '<section data-scene="a"><div data-shader="pulsar"></div></section>');
  return assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
}

test('assemblage : un fond qui suit la musique, avec et sans musique', () => {
  const avec = projet({ musique: true });
  assert.deepEqual(avec.shaders[0].pistes, ['musique']);
  assert.equal(avec.shaders[0].piste, 'musique');
  assert.deepEqual(avec.donnees.son, { pistes: ['musique'], css: false });
  const sans = projet({ musique: false });
  assert.ok(sans.erreurs.some((e) => e.regle === 'son-sans-piste' && e.gravite === 'erreur' && /shader « pulsar »/.test(e.message)));
  assert.equal(sans.donnees.son, null);
});
