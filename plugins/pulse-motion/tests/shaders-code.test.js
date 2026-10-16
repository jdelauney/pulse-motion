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

test('disposition : décalages WGSL (f32 sur 4 octets, vec4f sur 16), taille multiple de 16', () => {
  const d = S.dispositionReglages({ a: { defaut: 1 }, c: { defaut: '#ffffff', type: 'couleur' }, b: { defaut: 2 } });
  assert.deepEqual(d.champs, [{ nom: 'a', type: 'f32', decalage: 0 }, { nom: 'c', type: 'vec4f', decalage: 16 }, { nom: 'b', type: 'f32', decalage: 32 }]);
  assert.equal(d.taille, 48);
  assert.equal(d.wgsl, 'struct Reglages {\n  a: f32,\n  c: vec4f,\n  b: f32,\n};\n');
  const vide = S.dispositionReglages({});
  assert.equal(vide.taille, 16);
  assert.match(vide.wgsl, /pm_vide: f32/);
  const f = S.ecrireReglages(d, { a: 0.5, c: [0.1, 0.2, 0.3, 1], b: 7 });
  assert.equal(f.length, 12);
  assert.equal(f[0], 0.5);
  assert.deepEqual(Array.from(f.slice(4, 8)).map((x) => Math.round(x * 10) / 10), [0.1, 0.2, 0.3, 1]);
  assert.equal(f[8], 7);
});

test('ecrireEntrees : 128 octets, mode entier au mot 3', () => {
  const b = S.ecrireEntrees({ temps: 1.5, progres: 0.25, duree: 3, mode: 1, resolution: [177.7, 100, 1920, 1080], scene: [177.7, 100, 1920, 1080], repere: [50, 40, 0.5, 2], demi: [10, 5, 0, 0] });
  assert.equal(b.byteLength, S.OCTETS_ENTREES);
  const f = new Float32Array(b);
  assert.equal(f[0], 1.5);
  assert.equal(new Uint32Array(b)[3], 1);
  assert.equal(f[7], 1080);
  assert.equal(f[15], 2);
  assert.equal(f[17], 5);
});

test('assemblerShader : code à sa ligne ; situer ramène les lignes du fichier', () => {
  const code = 'fn image(coord: vec2f) -> vec4f {\r\n  let x = 1.0;\r\n  return vec4f(x);\r\n}';
  const a = S.assemblerShader({ code, usage: 'fond', disposition: S.dispositionReglages({}), prelude: '// prélude\nfn pcg(v: u32) -> u32 { return v; }\n' });
  const lignes = a.wgsl.split('\n');
  assert.equal(lignes[a.ligneCode], 'fn image(coord: vec2f) -> vec4f {');
  assert.equal(lignes[a.ligneCode + 2], '  return vec4f(x);');
  assert.equal(a.lignesCode, 4);
  assert.ok(a.wgsl.startsWith('// prélude'));
  assert.match(a.wgsl, /@vertex\s+fn pmSommets/);
  assert.match(a.wgsl, /fn pmImage\(e: PmSortie\) -> @location\(0\) vec4f/);
  assert.match(a.wgsl, /return image\(e\.coord\);/);
  assert.match(a.wgsl, /var<private> iTime: f32;/);
  assert.match(a.wgsl, /fn canal3\(uv: vec2f\) -> vec4f \{ return textureSampleLevel\(iChannel3, iRepete, uv, 0\.0\); \}/);
  assert.match(S.assemblerShader({ code, usage: 'transition', disposition: S.dispositionReglages({}) }).wgsl, /return transition\(e\.coord, iProgres\);/);
  assert.match(S.assemblerShader({ code, usage: 'post', disposition: S.dispositionReglages({}) }).wgsl, /return post\(e\.coord\);/);
  assert.throws(() => S.assemblerShader({ code, usage: 'module-force', disposition: S.dispositionReglages({}) }), /usage/);
  const erreurs = S.situer([
    { type: 'error', lineNum: a.ligneCode + 2, linePos: 11, message: 'type incompatible' },
    { type: 'warning', lineNum: a.ligneCode + 1, linePos: 1, message: 'inutile' },
    { type: 'error', lineNum: 2, linePos: 4, message: 'redéfinition de « pcg »' },
  ], a);
  assert.deepEqual(erreurs, [{ ligne: 2, colonne: 11, message: 'type incompatible' }, { ligne: null, colonne: null, message: 'redéfinition de « pcg »' }]);
  const m = S.messageErreur('essai', 'shaders/essai.wgsl', erreurs);
  assert.match(m, /^Shader « essai » \(shaders\/essai\.wgsl\) ne compile pas : ligne 2, colonne 11 : type incompatible ; hors du code du shader/);
});

test('prélude des shaders et empreinte', () => {
  for (const f of ['alea2', 'fbm', 'palette', 'rot2', 'sdCercle', 'sdBoite', 'sdSegment', 'sdEtoile']) assert.match(S.OUTILS, new RegExp(`fn ${f}\\(`), f);
  assert.match(S.ENTREES, /struct PmEntrees/);
  assert.equal(S.empreinte('abc'), S.empreinte('abc'));
  assert.notEqual(S.empreinte('abc'), S.empreinte('abd'));
  assert.match(S.empreinte('é'), /^[0-9a-f]{8}$/);
});
