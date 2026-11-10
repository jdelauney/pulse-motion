'use strict';
/* S8 J5 « Shaders » (spec Styles et réalisation, 5.9) : critères sans navigateur (fiches, sons, dictionnaire, notices,
 * référence, aucun style qui impose un shader). Les critères dessinés sont dans shaders-bibliotheque-gpu.test.js et
 * shaders-s8-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../moteur/shaders/code.js');
const C = require('../moteur/synthe/catalogue.js');
const { charger } = require('../scripts/mouvements.js');

const RACINE = path.join(__dirname, '..');
const DOSSIER = path.join(RACINE, 'shaders');
const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const NOUVEAUX = { cathodique: 'post', 'fuite-lumiere': 'transition', brulure: 'transition', lentille: 'transition', iris: 'transition', deformation: 'transition' };
const REGLAGES = {
  cathodique: ['force', 'lignes', 'grille', 'bavure', 'decalage_rouge', 'coins', 'bruit_bande', 'allumage'],
  'fuite-lumiere': ['couleur', 'douceur'],
  brulure: ['couleur', 'grain', 'etincelles'],
  lentille: ['force', 'rayon'],
  iris: ['forme', 'couleur'],
  deformation: ['echelle', 'couleur'],
};
const lire = (nom) => ({ json: JSON.parse(fs.readFileSync(path.join(DOSSIER, `${nom}.json`), 'utf8')), code: fs.readFileSync(path.join(DOSSIER, `${nom}.wgsl`), 'utf8') });
const texte = (...p) => fs.readFileSync(path.join(...p), 'utf8');

test('S8 shaders : six fiches valides, réglages de la spec, de 24 à 30 shaders, rien qui dépende de l\'horloge réelle', () => {
  const tous = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json'));
  assert.equal(tous.length, 30, 'de 24 à 30 shaders');
  for (const [nom, usage] of Object.entries(NOUVEAUX)) {
    const { json, code } = lire(nom);
    assert.deepEqual(S.validerShader(nom, json, code), [], nom);
    assert.equal(json.usage, usage, nom);
    assert.deepEqual(Object.keys(json.parametres), REGLAGES[nom], `${nom} : réglages de la spec`);
    assert.deepEqual(S.valeursShader(json, '', CHARTE).erreurs, [], `${nom} : défauts`);
    assert.doesNotThrow(() => S.assemblerShader({ code, usage, disposition: S.dispositionReglages(json.parametres) }), nom);
    // Le hasard vient du prélude (alea2, entier) ; rien de fract(sin()) ni d'horloge.
    assert.doesNotMatch(S.sansCommentaires(code), /fract\s*\(\s*sin|Date|performance/, `${nom} : hasard entier, fonction de iTime seulement`);
  }
  const iris = lire('iris').json.parametres.forme;
  assert.deepEqual([iris.defaut, iris.min, iris.max], [0, 0, 2], 'iris : 0 cercle, 1 losange, 2 étoile');
  const allumage = lire('cathodique').json.parametres.allumage;
  assert.equal(allumage.defaut, 0, 'cathodique : aucun allumage par défaut');
  assert.equal(lire('cathodique').json.parametres.lignes.defaut, 0.18, 'cathodique : lignes du jeu « A » de lemo');
});

test('S8 sons : fuite-lumiere et brulure → souffle ; lentille et deformation → whoosh ; iris → swoosh-inverse', () => {
  const attendus = { 'fuite-lumiere': 'souffle', brulure: 'souffle', lentille: 'whoosh', deformation: 'whoosh', iris: 'swoosh-inverse' };
  for (const [nom, son] of Object.entries(attendus)) {
    assert.equal(C.SONS_TRANSITION_SHADER[nom], son, nom);
    assert.equal(C.sonTransition({ shader: nom, duree: 1 }), son, nom);
  }
  // Les cinq anciennes sont inchangées.
  assert.deepEqual(['dissolution', 'ondulation', 'pixels', 'glitch', 'balayage-organique'].map((n) => C.SONS_TRANSITION_SHADER[n]), ['souffle', 'souffle', 'blip', 'impact', 'swoosh-inverse']);
  const bruitages = texte(RACINE, 'references', 'audio', 'bruitages.md');
  for (const nom of Object.keys(attendus)) assert.match(bruitages, new RegExp('`' + nom + '`'), nom);
});

test('dictionnaire : 5 numéros nouveaux à la suite, numeros.json ancien inchangé', () => {
  const dico = charger();
  const numeros = JSON.parse(texte(RACINE, 'references', 'mouvements', 'numeros.json'));
  const anciens = Object.keys(numeros).filter((k) => Number(k) <= 106).sort();
  // Les 106 numéros d'avant S8 J5 (V5 jusqu'à #093, S6 de #094 à #106), tels qu'ils étaient.
  const empreinte = crypto.createHash('sha256').update(JSON.stringify(anciens.map((k) => [k, numeros[k]]))).digest('hex');
  assert.equal(anciens.length, 106);
  assert.equal(empreinte, 'b61afe4f07a0c381980b63d99cdcdac082faaadb04aec4ae24d0b7d5dd750a15', 'numeros.json : anciens numéros inchangés');
  const nouveaux = dico.mouvements.filter((e) => Number(e.no) > 106);
  assert.deepEqual(nouveaux.map((e) => [e.no, e.slug, e.categorie]), [
    ['107', 'fuite-lumiere', 'transitions'], ['108', 'brulure', 'transitions'], ['109', 'lentille', 'transitions'], ['110', 'iris', 'transitions'], ['111', 'deformation', 'transitions']]);
  // À la suite : le premier suit le dernier numéro attribué avant lui, sans trou.
  const precedents = dico.mouvements.filter((e) => Number(e.no) <= 106).map((e) => Number(e.no));
  assert.equal(Math.max(...precedents), 106);
  for (const e of nouveaux) {
    assert.equal(numeros[e.no], e.slug, `#${e.no} dans numeros.json`);
    assert.equal(e.recette.type, 'transition');
    assert.equal(JSON.parse(`{${e.recette.exemple}}`).transition.shader, e.slug, `#${e.no} : la recette pose son shader`);
    assert.match(e.recette.note, /WebGPU/, `#${e.no} : WebGPU nécessaire`);
  }
  assert.equal(dico.mouvements.length, 111);
  assert.match(dico.source, /#107 à #111/);
  assert.match(dico.source, /argo/);
  assert.match(dico.source, /HyperFrames/);
});

test('notices : LemoLab et argo cités pour cathodique et fuite-lumiere', () => {
  const racine = texte(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md');
  assert.equal(texte(RACINE, 'THIRD-PARTY-NOTICES.md'), racine, 'deux fichiers identiques');
  const section = (titre) => { const i = racine.indexOf(`\n## ${titre}\n`); assert.ok(i >= 0, titre); const j = racine.indexOf('\n## ', i + 4); return racine.slice(i, j < 0 ? undefined : j); };
  const lemo = section('Lemo-Opuscar');
  assert.match(lemo, /core\/post\/crt\.js/);
  assert.match(lemo, /shaders\/cathodique\.wgsl/);
  const argo = section('argo');
  assert.match(argo, /light-leak\.glsl/);
  assert.match(argo, /shaders\/fuite-lumiere\.wgsl/);
  assert.match(argo, /accent\.ts/);
  // HyperFrames : mention de courtoisie, aucune ligne reprise, donc aucune section Apache.
  for (const idee of ['ridged-burn', 'gravitational-lens', 'sdf-iris', 'domain-warp']) assert.match(argo, new RegExp(idee), idee);
  assert.match(argo, /sans aucune ligne de code reprise/);
  assert.doesNotMatch(racine, /\n## HyperFrames/i);
  // Les quatre réécrites ne citent aucune source dans leur code ; les deux traduites disent d'où elles viennent.
  for (const nom of ['brulure', 'lentille', 'iris', 'deformation']) assert.doesNotMatch(lire(nom).code, /hyperframes|argo|ridged|gravitational|sdf-iris|domain-warp/i, nom);
  assert.match(lire('cathodique').code, /crt\.js de lemo-opuscar/);
  assert.match(lire('fuite-lumiere').code, /light-leak d'argo/);
});

test('S8 référence : bibliothèque, teintes de la marque, « un look de vieille télé » → cathodique', () => {
  const ref = texte(RACINE, 'references', 'shaders.md');
  for (const [nom, usage] of Object.entries(NOUVEAUX)) assert.match(ref, new RegExp('\\| `' + nom + '` \\| ' + usage + ' \\|'), nom);
  assert.match(ref, /« un look de vieille télé » \| `"post": \[\{ "shader": "cathodique" \}\]`/);
  assert.match(ref, /`teinteSombre\(vec3f\)` et `teinteClaire\(vec3f\)`/);
  assert.match(ref, /accent de la charte par défaut/);
  assert.match(ref, /conseiller\*\* un shader[^\n]*jamais l'imposer/);
});

test('S8 anti-but : aucun style livré n\'impose un shader nouveau', () => {
  const styles = path.join(RACINE, 'styles');
  for (const style of fs.readdirSync(styles)) {
    const dossier = path.join(styles, style);
    if (!fs.statSync(dossier).isDirectory()) continue;
    const identite = JSON.parse(texte(dossier, 'identite.json'));
    const conseilles = (identite.shaders && identite.shaders.conseilles) || [];
    // Un shader ne peut être que conseillé (identité), jamais posé dans les scènes ou le CSS du style.
    for (const f of fs.readdirSync(dossier, { recursive: true }).filter((x) => /\.(html|css)$/.test(x))) {
      const contenu = texte(dossier, f);
      for (const nom of Object.keys(NOUVEAUX)) assert.doesNotMatch(contenu, new RegExp(`data-shader=["']${nom}["']`), `${style}/${f} : ${nom}`);
    }
    assert.ok(Array.isArray(conseilles), style);
  }
});
