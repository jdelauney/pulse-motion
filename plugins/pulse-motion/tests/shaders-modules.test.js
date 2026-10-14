'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/shaders/code.js');
const R = require('../moteur/particules/recette.js');

const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const SPIRALE = [
  '// Spirale autour du centre de la zone.',
  'const DEUX_PI = 6.2831853;',
  'fn taille(p: Particule) -> f32 { return p.taille; }',
  'fn force(p: Particule, t: f32, zone: vec4f) -> vec2f {',
  '  let c = zone.xy + zone.zw * 0.5; // taille() du commentaire non renommée',
  '  let d = p.pos - c;',
  '  return vec2f(-d.y, d.x) * R.tours * DEUX_PI + d * taille(p);',
  '}',
].join('\n');
const JSON_SPIRALE = { version: 1, nom: 'spirale', usage: 'module-force', parametres: { tours: { defaut: 1, min: 0, max: 10 } } };

test('assemblerModule : noms déclarés préfixés, pas après un point ni dans un commentaire ; réglages en constantes', () => {
  const m = S.assemblerModule({ code: SPIRALE, usage: 'module-force', nom: 'spirale', parametres: JSON_SPIRALE.parametres, valeurs: { tours: 2 } });
  assert.equal(m.appel, 'pmForce_force');
  assert.match(m.wgsl, /const pmForce_R_tours: f32 = 2\.0;/);
  assert.match(m.wgsl, /const pmForce_DEUX_PI = 6\.2831853;/);
  assert.match(m.wgsl, /fn pmForce_taille\(p: Particule\) -> f32 \{ return p\.taille; \}/);
  assert.match(m.wgsl, /fn pmForce_force\(p: Particule, t: f32, zone: vec4f\) -> vec2f \{/);
  assert.match(m.wgsl, /\* pmForce_R_tours \* pmForce_DEUX_PI \+ d \* pmForce_taille\(p\);/);
  assert.match(m.wgsl, /\/\/ taille\(\) du commentaire non renommée/);
  assert.doesNotMatch(m.wgsl, /p\.pmForce_/);
  assert.equal(m.wgsl.split('\n')[m.ligneCode], '// Spirale autour du centre de la zone.');
  const couleur = S.assemblerModule({ code: 'fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f { return R.teinte; }', usage: 'module-couleur', nom: 'c',
    parametres: { teinte: { defaut: '#ff0000', type: 'couleur' } }, valeurs: { teinte: [1, 0, 0, 1] } });
  assert.match(couleur.wgsl, /const pmCouleur_R_teinte: vec4f = vec4f\(1\.0, 0\.0, 0\.0, 1\.0\);/);
  assert.equal(couleur.appel, 'pmCouleur_couleur');
  assert.notEqual(S.assemblerModule({ code: SPIRALE, usage: 'module-force', nom: 'spirale', parametres: JSON_SPIRALE.parametres, valeurs: { tours: 3 } }).empreinte, m.empreinte);
  assert.throws(() => S.assemblerModule({ code: SPIRALE, usage: 'fond', nom: 'x', parametres: {}, valeurs: {} }), /usage/);
});

test('situerModule : lignes et colonnes ramenées au fichier du module', () => {
  const m = S.assemblerModule({ code: SPIRALE, usage: 'module-force', nom: 'spirale', parametres: JSON_SPIRALE.parametres, valeurs: { tours: 2 } });
  const debut = 40;
  const ligne7 = m.wgsl.split('\n')[m.ligneCode + 6];
  const col = ligne7.indexOf('pmForce_taille(p)') + 1;
  const e = S.situerModule([{ type: 'error', lineNum: debut + m.ligneCode + 7, linePos: col, message: 'x' }, { type: 'error', lineNum: 3, linePos: 1, message: 'y' }], m, debut);
  assert.equal(e[0].ligne, 7);
  assert.equal(e[0].colonne, SPIRALE.split('\n')[6].indexOf('taille(p)') + 1);
  assert.deepEqual(e[1], { ligne: null, colonne: null, message: 'y' });
});

function compiler(recette, reglages = '') {
  const r = R.compiler({ version: 1, nom: 'essai', ...recette }, { reglages, charte: CHARTE, dur: 1, graine: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  return r.effet;
}
const EMETTEUR = { nom: 'e', naissance: { debit: 10, vie: [1, 1] }, forces: [{ type: 'gravite', valeur: 10 }] };

test('recette : modules compilés, voie rapide quittée avec une force, réglages exposés', () => {
  const sans = compiler({ emetteurs: [EMETTEUR] });
  assert.deepEqual(sans.emetteurs[0].modules, { force: null, couleur: null, forme: null });
  assert.equal(sans.emetteurs[0].voieRapide, true);
  const avec = compiler({ parametres: { tours: { defaut: 2, min: 0, max: 5 }, teinte: { defaut: 'accent', type: 'couleur' } },
    emetteurs: [{ ...EMETTEUR, modules: { force: 'spirale', couleur: 'couleur-vitesse' } }] }, 'tours: 3');
  assert.deepEqual(avec.emetteurs[0].modules, { force: 'spirale', couleur: 'couleur-vitesse', forme: null });
  assert.equal(avec.emetteurs[0].voieRapide, false);
  assert.deepEqual(avec.reglages, { nombres: { tours: 3 }, couleurs: { teinte: '#ff9900' } });
  const seulementCouleur = compiler({ emetteurs: [{ ...EMETTEUR, modules: { couleur: 'c' } }] });
  assert.equal(seulementCouleur.emetteurs[0].voieRapide, true);
  const faux = R.compiler({ version: 1, nom: 'essai', emetteurs: [{ ...EMETTEUR, modules: { force: 'Spirale!' } }] }, { charte: CHARTE, dur: 1, graine: 1 });
  assert.equal(faux.ok, false);
  assert.match(faux.erreurs[0].message, /emetteurs\[e\]\.modules\.force : nom de shader attendu/);
  const inconnu = R.compiler({ version: 1, nom: 'essai', emetteurs: [{ ...EMETTEUR, modules: { vent: 'x' } }] }, { charte: CHARTE, dur: 1, graine: 1 });
  assert.match(inconnu.erreurs[0].message, /champ inconnu \(champs possibles : force, couleur, forme\)/);
  assert.equal(R.SCHEMA.champs.emetteurs.element.champs.modules.type, 'objet');
});

test('attacherModules : code assemblé, réglages hérités de la recette, erreurs nommées', () => {
  const effet = compiler({ parametres: { tours: { defaut: 4, min: 0, max: 5 } }, emetteurs: [{ ...EMETTEUR, modules: { force: 'spirale' } }] });
  const sources = { spirale: { json: JSON_SPIRALE, code: SPIRALE, erreurs: [] } };
  assert.deepEqual(S.attacherModules(effet, (n) => sources[n] || null, CHARTE), []);
  const m = effet.emetteurs[0].modulesWGSL;
  assert.equal(m.couleur, null);
  assert.match(m.force.wgsl, /const pmForce_R_tours: f32 = 4\.0;/);
  // Sans réglage de même nom dans la recette : défaut du module.
  const e2 = compiler({ emetteurs: [{ ...EMETTEUR, modules: { force: 'spirale' } }] });
  S.attacherModules(e2, (n) => sources[n] || null, CHARTE);
  assert.match(e2.emetteurs[0].modulesWGSL.force.wgsl, /const pmForce_R_tours: f32 = 1\.0;/);
  const e3 = compiler({ emetteurs: [{ ...EMETTEUR, modules: { force: 'absent', couleur: 'spirale' } }] });
  const err = S.attacherModules(e3, (n) => sources[n] || null, CHARTE);
  assert.deepEqual(err.map((x) => x.regle), ['shader-inconnu', 'usage-incompatible']);
  assert.match(err[0].message, /Effet « essai », émetteur « e », module force « absent » : shader introuvable/);
  assert.match(err[1].message, /« module-force », « module-couleur » attendu/);
  const e4 = compiler({ parametres: { tours: { defaut: 50 } }, emetteurs: [{ ...EMETTEUR, modules: { force: 'spirale' } }] });
  assert.deepEqual(S.attacherModules(e4, (n) => sources[n] || null, CHARTE).map((x) => x.regle), ['reglage-invalide']);
  const casse = { spirale: { json: JSON_SPIRALE, code: SPIRALE, erreurs: [{ regle: 'liaison-reservee', message: 'Shader « spirale » : @group…' }] } };
  assert.deepEqual(S.attacherModules(compiler({ emetteurs: [{ ...EMETTEUR, modules: { force: 'spirale' } }] }), (n) => casse[n], CHARTE).map((x) => x.regle), ['liaison-reservee']);
});
