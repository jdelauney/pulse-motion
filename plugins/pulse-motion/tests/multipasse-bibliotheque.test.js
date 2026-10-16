'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../moteur/shaders/code.js');
const G = require('../moteur/shaders/glsl.js');

const DOSSIER = path.join(__dirname, '..', 'shaders');
const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const MULTIPASSES = { 'reaction-diffusion': 'wgsl', 'trainees-lumineuses': 'wgsl', peinture: 'wgsl', automate: 'wgsl', 'ondes-glsl': 'glsl' };

test('bibliothèque : cinq fonds multipasses valides, réglables, originaux', () => {
  for (const [nom, ext] of Object.entries(MULTIPASSES)) {
    const json = JSON.parse(fs.readFileSync(path.join(DOSSIER, `${nom}.json`), 'utf8'));
    const code = fs.readFileSync(path.join(DOSSIER, `${nom}.${ext}`), 'utf8');
    assert.deepEqual(S.validerShader(nom, json, code), [], nom);
    assert.equal(json.usage, 'fond', nom);
    assert.equal((json.langage || 'wgsl'), ext, nom);
    assert.ok(Array.isArray(json.passes) && json.passes.length >= 2, `${nom} : multipasse`);
    assert.ok(typeof json.description === 'string' && json.description.length > 20, `${nom} : description`);
    assert.deepEqual(S.valeursShader(json, '', CHARTE).erreurs, [], `${nom} : défauts`);
    for (const [k, p] of Object.entries(json.parametres || {})) {
      if (p.type === 'couleur') continue;
      assert.ok(typeof p.min === 'number' && typeof p.max === 'number' && p.min < p.max, `${nom}.${k} : bornes`);
    }
    assert.match(code, /^\/\/ /, `${nom} : commence par un commentaire qui dit ce qu'il fait`);
    assert.doesNotMatch(code, /shadertoy|licen[cs]e|copyright|https?:/i, `${nom} : shader original`);
    if (ext === 'wgsl') {
      for (const p of json.passes.slice(0, -1)) {
        assert.doesNotThrow(() => S.assemblerShader({ code, usage: 'fond', disposition: S.dispositionReglages(json.parametres || {}), appel: `passe${p.nom}(e.coord)` }), nom);
      }
    } else {
      assert.match(G.assemblerGLSL({ code, parametres: json.parametres, appel: 'passeA' }).glsl, /passeA\(c, gl_FragCoord\.xy\)/);
    }
  }
});

test('référence : section des multipasses et chaque shader de la bibliothèque', () => {
  const ref = fs.readFileSync(path.join(__dirname, '..', 'references', 'shaders.md'), 'utf8');
  assert.match(ref, /## Shaders multipasses/);
  for (const n of Object.keys(MULTIPASSES)) assert.match(ref, new RegExp('`' + n + '`'), n);
  for (const mot of ['pas_par_seconde', 'passeA', '"passes"', 'echelle']) assert.ok(ref.includes(mot), mot);
});
