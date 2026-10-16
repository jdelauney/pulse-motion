'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../moteur/shaders/glsl.js');
const S = require('../moteur/shaders/code.js');
const { chargeurShaders, preparerShaders } = require('../scripts/lib/shaders.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const SIMPLE = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 uv = fragCoord / iResolution.xy;\n  fragColor = vec4(uv, R_bleu, 1.0);\n}\n';
const JSON_SIMPLE = { version: 1, nom: 'degrade-st', usage: 'fond', langage: 'glsl', parametres: { bleu: { defaut: 0.5, min: 0, max: 1 } } };

test('contrôle : un shader Shadertoy simple passe', () => {
  assert.deepEqual(S.validerShader('degrade-st', JSON_SIMPLE, SIMPLE), []);
  assert.deepEqual(S.validerShader('x', { version: 1, nom: 'x', usage: 'post', langage: 'glsl' }, 'void mainImage(out vec4 c, vec2 p) { c = texture(iChannel0, p / iResolution.xy); }'), []);
});

test('contrôle : fonction absente, uniform, #version, main, entrée redéclarée, réglage inconnu, module en GLSL, langage inconnu', () => {
  const regles = (code, json = JSON_SIMPLE) => S.validerShader('degrade-st', json, code).map((e) => e.regle);
  assert.deepEqual(regles('void image(out vec4 c, in vec2 p) { c = vec4(1.0); }'), ['fonction-absente']);
  assert.ok(regles(`uniform float x;\n${SIMPLE}`).includes('liaison-reservee'));
  assert.ok(regles(`#version 300 es\n${SIMPLE}`).includes('liaison-reservee'));
  assert.ok(regles(`${SIMPLE}void main() { }\n`).includes('nom-reserve'));
  assert.ok(regles(`float iTime = 1.0;\n${SIMPLE}`).includes('nom-reserve'));
  assert.ok(regles(`vec4 pmSortie;\n${SIMPLE}`).includes('nom-reserve'));
  assert.deepEqual(regles(SIMPLE.replace('R_bleu', 'R_rouge')), ['reglage-inconnu']);
  assert.ok(regles(SIMPLE, { ...JSON_SIMPLE, usage: 'module-force' }).includes('shader-invalide'));
  assert.ok(regles(SIMPLE, { ...JSON_SIMPLE, langage: 'hlsl' }).includes('shader-invalide'));
  assert.deepEqual(regles('// void main() est réservé\n' + SIMPLE), [], 'commentaires ignorés');
  assert.deepEqual(regles(' '.repeat(65537)).slice(0, 1), ['shader-trop-gros']);
});

test('assemblage : prélude, réglages en uniformes, main qui appelle la fonction ; lignes du journal ramenées au fichier', () => {
  const parametres = { bleu: { defaut: 0.5 }, teinte: { defaut: '#ff0000', type: 'couleur' } };
  const a = G.assemblerGLSL({ code: SIMPLE, parametres, appel: 'mainImage' });
  assert.match(a.glsl, /^#version 300 es\n/);
  assert.match(a.glsl, /uniform float R_bleu;\nuniform vec4 R_teinte;/);
  assert.match(a.glsl, /uniform sampler2D iChannel3;/);
  assert.match(a.glsl, /uniform PmSon iSon;/);
  assert.match(a.glsl, /void main\(\) \{\n  vec4 c = vec4\(0\.0\);\n  mainImage\(c, gl_FragCoord\.xy\);\n  pmSortie = c;\n\}/);
  assert.equal(a.glsl.split('\n')[a.ligneCode], SIMPLE.split('\n')[0], 'première ligne du code à ligneCode + 1');
  assert.equal(a.lignesCode, 4, 'lignes du fichier, sans la ligne vide finale');
  const journal = `ERROR: 0:${a.ligneCode + 2}: 'uv' : undeclared identifier\nERROR: 0:${a.ligneCode + 40}: 'main' : bidon\nWARNING: 0:3: rien\n`;
  assert.deepEqual(G.situerGLSL(journal, a), [
    { ligne: 2, colonne: null, message: "'uv' : undeclared identifier" },
    { ligne: null, colonne: null, message: "'main' : bidon" },
  ]);
  assert.equal(S.messageErreur('x', 'shaders/x.glsl', G.situerGLSL(journal, a)),
    "Shader « x » (shaders/x.glsl) ne compile pas : ligne 2 : 'uv' : undeclared identifier ; hors du code du shader (nom déjà pris par le moteur ?) : 'main' : bidon.");
  assert.match(G.SOMMETS, /gl_VertexID/);
});

test('pistes : iSon ou iChannel3 lisent le son', () => {
  assert.deepEqual(S.pistesShader({ langage: 'glsl' }, 'void mainImage(out vec4 c, in vec2 p) { c = vec4(iSon.basses); }'), ['musique']);
  assert.deepEqual(S.pistesShader({ langage: 'glsl', piste: 'voix' }, 'void mainImage(out vec4 c, in vec2 p) { c = texture(iChannel3, vec2(0.1, 0.25)); }'), ['voix']);
  assert.deepEqual(S.pistesShader({ langage: 'glsl' }, SIMPLE), []);
});

test('chargeur : .glsl lu quand le .json le dit, fichier nommé ; balise data-shader', () => {
  const projet = dossierTemporaire('pm-glsl-');
  fs.mkdirSync(path.join(projet, 'shaders'));
  fs.writeFileSync(path.join(projet, 'shaders', 'degrade-st.json'), JSON.stringify(JSON_SIMPLE));
  fs.writeFileSync(path.join(projet, 'shaders', 'degrade-st.glsl'), SIMPLE);
  fs.writeFileSync(path.join(projet, 'shaders', 'sans-code.json'), JSON.stringify({ version: 1, nom: 'sans-code', usage: 'fond', langage: 'glsl' }));
  const charger = chargeurShaders(projet, path.join(projet, 'vide'));
  const src = charger('degrade-st');
  assert.deepEqual(src.erreurs, []);
  assert.equal(src.fichier, 'shaders/degrade-st.glsl');
  assert.equal(src.code, SIMPLE);
  assert.match(charger('sans-code').erreurs[0].message, /fichier shaders\/sans-code\.glsl introuvable/);
  const r = preparerShaders('<section data-scene="a"><div data-shader="degrade-st"></div></section>', { scene: 'a', charger, projet });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.shaders[0].langage, 'glsl');
  assert.equal(r.shaders[0].fichier, 'shaders/degrade-st.glsl');
});
