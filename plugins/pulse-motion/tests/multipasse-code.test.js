'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../moteur/shaders/code.js');
const { donneeShader } = require('../scripts/lib/shaders.js');

const WGSL = 'fn passeA(coord: vec2f) -> vec4f {\n  return canal0(coord / iResolution.xy) + vec4f(0.01);\n}\nfn image(coord: vec2f) -> vec4f {\n  return canal0(coord / iResolution.xy);\n}\n';
const JSON_M = { version: 1, nom: 'm', usage: 'fond', passes: [{ nom: 'A', lit: ['A'], echelle: 0.25 }, { nom: 'image', lit: ['A'] }], pas_par_seconde: 30 };
const regles = (json, code = WGSL) => S.validerShader('m', json, code).map((e) => e.regle + ' ' + e.message);

test('passes : déclaration valide en WGSL et en GLSL', () => {
  assert.deepEqual(regles(JSON_M), []);
  const glsl = 'void passeA(out vec4 c, in vec2 p) { c = texture(iChannel0, p / iResolution.xy); }\nvoid mainImage(out vec4 c, in vec2 p) { c = texture(iChannel0, p / iResolution.xy); }\n';
  assert.deepEqual(regles({ ...JSON_M, langage: 'glsl' }, glsl), []);
  assert.match(regles({ ...JSON_M, langage: 'glsl' }, glsl.replace('passeA', 'passeZ'))[0], /fonction-absente .*void passeA/);
});

test('passes : erreurs de déclaration', () => {
  const une = (json, motif) => assert.ok(regles(json).some((r) => motif.test(r)), `${JSON.stringify(json)} : ${regles(json)}`);
  une({ ...JSON_M, usage: 'transition' }, /shader-invalide .*un shader multipasse est un fond/);
  une({ ...JSON_M, passes: [{ nom: 'image' }] }, /de 2 à 5 passes/);
  une({ ...JSON_M, passes: [{ nom: 'A' }, { nom: 'B' }] }, /la dernière passe s'appelle « image »/);
  une({ ...JSON_M, passes: [{ nom: 'E' }, { nom: 'image' }] }, /« nom » : A, B, C ou D/);
  une({ ...JSON_M, passes: [{ nom: 'A' }, { nom: 'A' }, { nom: 'image' }] }, /tampon « A » déclaré deux fois/);
  une({ ...JSON_M, passes: [{ nom: 'A', lit: ['B'] }, { nom: 'image' }] }, /« B » n'est pas un tampon déclaré \(A\)/);
  une({ ...JSON_M, passes: [{ nom: 'A', lit: ['A', 'A', 'A', 'A', 'A'] }, { nom: 'image' }] }, /4 tampons au plus/);
  une({ ...JSON_M, passes: [{ nom: 'A', echelle: 1.5 }, { nom: 'image' }] }, /« echelle » : nombre de 0 \(exclu\) à 1/);
  une({ ...JSON_M, passes: [{ nom: 'A' }, { nom: 'image', echelle: 0.5 }] }, /« image » n'a pas d'« echelle »/);
  une({ ...JSON_M, passes: [{ nom: 'A', vitesse: 1 }, { nom: 'image' }] }, /champ « vitesse » inconnu/);
  une({ ...JSON_M, pas_par_seconde: 300 }, /entier de 1 à 240/);
  une({ version: 1, nom: 'm', usage: 'fond', pas_par_seconde: 30 }, /« pas_par_seconde » va avec « passes »/);
  assert.ok(regles(JSON_M, WGSL.replace('passeA', 'passeB')).some((r) => /fonction-absente .*fn passeA\(coord: vec2f\) -> vec4f/.test(r)));
});

test('donnée d\'un multipasse : passes complétées, pas par seconde par défaut ; appel d\'une passe', () => {
  const d = donneeShader({ nom: 'm', fichier: 'shaders/m.wgsl', code: WGSL, json: { ...JSON_M, passes: [{ nom: 'A' }, { nom: 'image', lit: ['A'] }], pas_par_seconde: undefined } }, { usage: 'fond', valeurs: {} });
  assert.deepEqual(d.passes, [{ nom: 'A', lit: [], echelle: 0.5 }, { nom: 'image', lit: ['A'], echelle: 1 }]);
  assert.equal(d.pas_par_seconde, 60);
  assert.equal(donneeShader({ nom: 'x', fichier: 'f', code: '', json: { version: 1, nom: 'x', usage: 'fond' } }, { usage: 'fond', valeurs: {} }).passes, null);
  const a = S.assemblerShader({ code: WGSL, usage: 'fond', disposition: S.dispositionReglages({}), appel: 'passeA(e.coord)' });
  assert.match(a.wgsl, /return passeA\(e\.coord\);/);
});

test('moteur d\'état : vider, pas, instantanés chaque seconde de τ, restauration ; budget', () => {
  const ctx = vm.createContext({ console });
  for (const f of ['particules/instantanes.js', 'particules/shaders.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'moteur', f), 'utf8'), ctx);
  const etatMultipasse = vm.runInContext('M.particulesInterne.etatMultipasse', ctx);
  const journal = [];
  const ops = { tailleEtat: 1000, vider: () => journal.push('vider'), pas: (k) => journal.push('pas ' + k), sauver: (k) => journal.push('sauver ' + k),
    restaurer: (k) => journal.push('restaurer ' + k), oublierTout: () => journal.push('oublier') };
  const e = etatMultipasse(ops, 60, 600);
  assert.equal(e.intervalle, 60);
  e.avancer(130);
  assert.equal(journal[0], 'vider');
  assert.deepEqual(journal.filter((x) => /^sauver/.test(x)), ['sauver 60', 'sauver 120']);
  assert.equal(journal.filter((x) => /^pas/.test(x)).length, 130);
  journal.length = 0;
  e.avancer(70);
  assert.deepEqual(journal, ['restaurer 60', ...Array.from({ length: 10 }, (_, i) => 'pas ' + (60 + i))]);
  journal.length = 0;
  e.avancer(70);
  assert.deepEqual(journal, [], 'déjà à l\'état demandé');
  e.oublier();
  journal.length = 0;
  e.avancer(1);
  assert.deepEqual(journal, ['oublier', 'vider', 'pas 0'].slice(1));
  assert.equal(etatMultipasse({ ...ops, tailleEtat: 200 * 1024 * 1024 }, 60, 600).intervalle, 960, 'un seul instantané tient dans le budget');
});
