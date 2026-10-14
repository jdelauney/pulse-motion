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

test('bibliothèque : transitions et post-traitements valides, réglables, originaux', () => {
  assert.equal(presents('transition').length, 5);
  assert.equal(presents('post').length, 4);
  verifier('transition');
  verifier('post');
  // Bornes des smoothstep : bord et douceur jamais nuls.
  assert.ok(lire('dissolution').json.parametres.bord.min > 0);
  assert.ok(lire('balayage-organique').json.parametres.douceur.min > 0);
  assert.ok(lire('vignettage').json.parametres.douceur.min > 0);
});

test('bibliothèque : modules valides et attachables à une recette', () => {
  for (const usage of ['module-force', 'module-couleur', 'module-forme']) assert.equal(presents(usage).length, 1, usage);
  verifier('module-force');
  verifier('module-couleur');
  verifier('module-forme');
  const r = R.compiler({ version: 1, nom: 'essai', parametres: { tours: { defaut: 2, min: 0, max: 10 } },
    emetteurs: [{ nom: 'e', naissance: { debit: 10, vie: [1, 1] }, modules: { force: 'spirale', couleur: 'couleur-vitesse', forme: 'etoile' } }] },
    { dur: 1, graine: 1, charte: CHARTE });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.deepEqual(S.attacherModules(r.effet, (n) => ({ ...lire(n), erreurs: [] }), CHARTE), []);
  const m = r.effet.emetteurs[0].modulesWGSL;
  assert.match(m.force.wgsl, /const pmForce_R_tours: f32 = 2\.0;/, 'tours de la recette repris par le module');
  assert.equal(m.couleur.appel, 'pmCouleur_couleur');
  assert.equal(m.forme.appel, 'pmForme_forme');
});

test('référence : chaque shader de la bibliothèque, licence, contrôles ; renvois depuis particules et contrôles', () => {
  const ref = fs.readFileSync(path.join(__dirname, '..', 'references', 'shaders.md'), 'utf8');
  assert.match(ref, /^# .+\n\n## L'essentiel\n/);
  for (const noms of Object.values(ATTENDUS)) for (const n of noms) assert.match(ref, new RegExp('`' + n + '`'), n);
  assert.match(ref, /Shadertoy/);
  assert.match(ref, /CC BY-NC-SA/);
  assert.match(ref, /ne jamais recopier/i);
  for (const r of ['shader-inconnu', 'usage-incompatible', 'fonction-absente', 'liaison-reservee', 'shader-trop-gros', 'shader-invalide', 'nom-reserve', 'reglage-inconnu', 'shader-ne-compile-pas']) {
    assert.match(ref, new RegExp('`' + r + '`'), r);
  }
  assert.match(ref, /pulse-motion controler \. --gpu/);
  for (const f of ['image(coord: vec2f) -> vec4f', 'transition(coord: vec2f, progres: f32) -> vec4f', 'post(coord: vec2f) -> vec4f',
    'force(p: Particule, t: f32, zone: vec4f) -> vec2f', 'couleur(p: Particule, u: f32, base: vec4f) -> vec4f', 'forme(uv: vec2f, p: Particule) -> f32']) {
    assert.ok(ref.includes(f), f);
  }
  const particules = fs.readFileSync(path.join(__dirname, '..', 'references', 'particules.md'), 'utf8');
  assert.match(particules, /pulse-motion reference shaders/);
  assert.match(particules, /`emetteurs\[\]\.modules`/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'references', 'controles.md'), 'utf8'), /`shader-ne-compile-pas`/);
});
