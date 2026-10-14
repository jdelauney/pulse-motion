'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/shaders/code.js');

const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const FOND = 'fn image(coord: vec2f) -> vec4f {\n  return vec4f(R.vitesse, 0.0, 0.0, 1.0);\n}\n';
const JSON_FOND = { version: 1, nom: 'essai', usage: 'fond', parametres: { vitesse: { defaut: 0.2, min: 0, max: 2 }, teinte: { defaut: 'primaire', type: 'couleur' } } };
const regles = (l) => l.map((e) => e.regle);

test('validerShader : un fond correct passe', () => {
  assert.deepEqual(S.validerShader('essai', JSON_FOND, FOND), []);
  for (const usage of S.USAGES) assert.ok(S.FONCTIONS[usage].texte.startsWith('fn '), usage);
});

test('validerShader : JSON, usage, nom, champs, réglages', () => {
  assert.deepEqual(regles(S.validerShader('essai', [], FOND)), ['shader-invalide']);
  assert.ok(regles(S.validerShader('essai', { ...JSON_FOND, version: 2 }, FOND)).includes('shader-invalide'));
  assert.match(S.validerShader('essai', { ...JSON_FOND, usage: 'decor' }, FOND)[0].message, /« usage » doit être l'un de : fond, transition, post, module-force/);
  assert.match(S.validerShader('essai', { ...JSON_FOND, nom: 'autre' }, FOND)[0].message, /diffère du nom du fichier/);
  assert.match(S.validerShader('essai', { ...JSON_FOND, couleur: 1 }, FOND)[0].message, /champ « couleur » inconnu/);
  assert.match(S.validerShader('essai', { ...JSON_FOND, parametres: { vitesse: { defaut: 5, min: 0, max: 2 } } }, FOND)[0].message, /hors des bornes/);
  assert.match(S.validerShader('essai', { ...JSON_FOND, debord: 80 }, FOND)[0].message, /« debord »/);
});

test('validerShader : taille, liaisons, fonction attendue, noms réservés, réglages cités', () => {
  assert.deepEqual(regles(S.validerShader('essai', JSON_FOND, FOND + '//' + 'a'.repeat(S.TAILLE_MAX))), ['shader-trop-gros']);
  assert.deepEqual(regles(S.validerShader('essai', JSON_FOND, '@group(0) @binding(0) var<uniform> x: f32;\n' + FOND)), ['liaison-reservee']);
  const sans = S.validerShader('essai', JSON_FOND, 'fn autre(coord: vec2f) -> vec4f { return vec4f(0.0); }');
  assert.deepEqual(regles(sans), ['fonction-absente']);
  assert.match(sans[0].message, /fn image\(coord: vec2f\) -> vec4f/);
  assert.deepEqual(regles(S.validerShader('essai', JSON_FOND, FOND + 'fn pmAide() -> f32 { return 1.0; }\n')), ['nom-reserve']);
  assert.deepEqual(regles(S.validerShader('essai', JSON_FOND, FOND + 'const iTime = 2.0;\n')), ['nom-reserve']);
  const inconnu = S.validerShader('essai', JSON_FOND, FOND.replace('R.vitesse', 'R.allure'));
  assert.deepEqual(regles(inconnu), ['reglage-inconnu']);
  assert.match(inconnu[0].message, /R\.allure/);
  // Signatures écrites autrement : vec2<f32>, espaces, virgule finale.
  assert.deepEqual(S.validerShader('essai', JSON_FOND, 'fn image( c : vec2<f32>, ) -> vec4<f32> { return vec4f(0.0); }'), []);
  const force = { version: 1, nom: 'f', usage: 'module-force' };
  assert.deepEqual(S.validerShader('f', force, 'fn force(p: Particule, t: f32, zone: vec4f) -> vec2f { return vec2f(0.0); }'), []);
});

test('validerShader : commentaires ignorés', () => {
  assert.deepEqual(S.validerShader('essai', JSON_FOND, '// @binding(3) réservé au moteur\n/* @group(1) /* imbriqué */ */\n' + FOND), []);
  assert.deepEqual(regles(S.validerShader('essai', JSON_FOND, '// fn image(coord: vec2f) -> vec4f\nfn autre() {}')), ['fonction-absente']);
  assert.equal(S.sansCommentaires('a // b\nc /* d\ne */ f').split('\n').length, 3);
  assert.equal(S.octets('é'), 2);
  assert.equal(S.octets('a'), 1);
});

test('valeursShader : défauts, texte de réglages, objet du déroulé, couleurs de la charte en linéaire', () => {
  const d = S.valeursShader(JSON_FOND, '', CHARTE);
  assert.deepEqual(d.erreurs, []);
  assert.equal(d.valeurs.vitesse, 0.2);
  assert.equal(d.valeurs.teinte.length, 4);
  assert.ok(Math.abs(d.valeurs.teinte[2] - Math.pow((0xcc / 255 + 0.055) / 1.055, 2.4)) < 1e-6);
  assert.equal(S.valeursShader(JSON_FOND, 'vitesse: 1.5', CHARTE).valeurs.vitesse, 1.5);
  const o = S.valeursShader(JSON_FOND, { vitesse: 0.5, teinte: 'accent' }, CHARTE);
  assert.equal(o.valeurs.vitesse, 0.5);
  assert.ok(Math.abs(o.valeurs.teinte[0] - 1) < 1e-6);
  assert.equal(S.reglagesEnTexte({ a: 1, b: 'accent' }), 'a: 1; b: accent');
  assert.equal(S.reglagesEnTexte(null), '');
});

test('valeursShader : réglage hors bornes, inconnu ou illisible', () => {
  assert.match(S.valeursShader(JSON_FOND, 'vitesse: 9', CHARTE).erreurs[0].message, /au-delà du maximum 2/);
  const inconnu = S.valeursShader(JSON_FOND, 'allure: 1', CHARTE).erreurs[0];
  assert.equal(inconnu.chemin, 'reglages.allure');
  assert.match(inconnu.message, /n'est pas un réglage du shader « essai »/);
  assert.match(S.valeursShader(JSON_FOND, 'vitesse', CHARTE).erreurs[0].message, /illisible/);
  assert.match(S.valeursShader(JSON_FOND, 'teinte: bleu', CHARTE).erreurs[0].message, /couleur « bleu » inconnue/);
});
