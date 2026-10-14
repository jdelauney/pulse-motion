'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../moteur/shaders/code.js');
const R = require('../moteur/particules/recette.js');

const DOSSIER = path.join(__dirname, '..', 'shaders');
const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const ATTENDUS = {
  fond: ['nebuleuse', 'plasma', 'degrade-vivant', 'grille-neon', 'rayons', 'halo', 'energie-contour'],
  transition: ['dissolution', 'ondulation', 'pixels', 'glitch', 'balayage-organique'],
  post: ['grain', 'vignettage', 'aberration', 'chaleur'],
  'module-force': ['spirale'],
  'module-couleur': ['couleur-vitesse'],
  'module-forme': ['etoile'],
};
const lire = (nom) => ({ json: JSON.parse(fs.readFileSync(path.join(DOSSIER, `${nom}.json`), 'utf8')), code: fs.readFileSync(path.join(DOSSIER, `${nom}.wgsl`), 'utf8') });
const presents = (usage) => ATTENDUS[usage].filter((n) => fs.existsSync(path.join(DOSSIER, `${n}.json`)));

function verifier(usage) {
  for (const nom of presents(usage)) {
    const { json, code } = lire(nom);
    assert.deepEqual(S.validerShader(nom, json, code), [], nom);
    assert.equal(json.usage, usage, nom);
    assert.ok(typeof json.description === 'string' && json.description.length > 20, `${nom} : description`);
    assert.deepEqual(S.valeursShader(json, '', CHARTE).erreurs, [], `${nom} : défauts`);
    for (const [k, p] of Object.entries(json.parametres || {})) {
      if (p.type === 'couleur') continue;
      assert.ok(typeof p.min === 'number' && typeof p.max === 'number' && p.min < p.max, `${nom}.${k} : bornes min < max (curseur de l'atelier)`);
    }
    assert.match(code, /^\/\/ /, `${nom} : commence par un commentaire qui dit ce qu'il fait`);
    assert.doesNotMatch(code, /shadertoy|licen[cs]e|copyright|https?:/i, `${nom} : shader original`);
  }
}

test('bibliothèque : fonds et auras valides, réglables, originaux', () => {
  assert.equal(presents('fond').length, 7);
  verifier('fond');
  for (const nom of ['halo', 'energie-contour']) assert.ok(lire(nom).json.debord > 0, `${nom} : aura qui déborde de sa boîte`);
  for (const nom of presents('fond')) {
    const { json, code } = lire(nom);
    assert.doesNotThrow(() => S.assemblerShader({ code, usage: 'fond', disposition: S.dispositionReglages(json.parametres || {}) }), nom);
  }
});
