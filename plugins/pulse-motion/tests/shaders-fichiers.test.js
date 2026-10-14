'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const Sh = require('../scripts/lib/shaders.js');
const { balisesAvec, balisesEffets } = require('../scripts/lib/effets.js');

const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const FOND = 'fn image(coord: vec2f) -> vec4f { return vec4f(R.niveau); }\n';
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
function dossiers() {
  const projet = dossierTemporaire('pm-sh-projet-');
  const biblio = dossierTemporaire('pm-sh-biblio-');
  ecrire(biblio, 'voile.json', { version: 1, nom: 'voile', usage: 'fond', parametres: { niveau: { defaut: 0.5, min: 0, max: 1 } } });
  ecrire(biblio, 'voile.wgsl', FOND);
  ecrire(biblio, 'fondu-x.json', { version: 1, nom: 'fondu-x', usage: 'transition' });
  ecrire(biblio, 'fondu-x.wgsl', 'fn transition(coord: vec2f, progres: f32) -> vec4f { return canal1(coord); }\n');
  ecrire(projet, 'shaders/voile.json', { version: 1, nom: 'voile', usage: 'fond', debord: 4, parametres: { niveau: { defaut: 0.8, min: 0, max: 1 }, teinte: { defaut: 'accent', type: 'couleur' } } });
  ecrire(projet, 'shaders/voile.wgsl', FOND);
  ecrire(projet, 'shaders/casse.json', '{ "version": 1, ');
  ecrire(projet, 'shaders/casse.wgsl', FOND);
  ecrire(projet, 'assets/motif.png', Buffer.from('89504e470d0a1a0a', 'hex'));
  return { projet, biblio };
}

test('chargeur : projet d\'abord, puis bibliothèque ; JSON cassé et contrôle remontés', () => {
  const { projet, biblio } = dossiers();
  const charger = Sh.chargeurShaders(projet, biblio);
  const v = charger('voile');
  assert.equal(v.source, 'projet');
  assert.equal(v.fichier, 'shaders/voile.wgsl');
  assert.equal(v.json.parametres.niveau.defaut, 0.8);
  assert.deepEqual(v.erreurs, []);
  assert.equal(charger('fondu-x').source, 'bibliotheque');
  assert.equal(charger('fondu-x').fichier, 'bibliothèque : fondu-x.wgsl');
  assert.equal(charger('absent'), null);
  assert.equal(charger('casse').erreurs[0].regle, 'shader-invalide');
  assert.match(charger('casse').erreurs[0].message, /n'est pas un JSON valide/);
  assert.equal(charger('voile'), charger('voile'), 'mis en cache');
  assert.throws(() => charger('../x'), /invalide/);
});

test('preparerShaders : balise valide, calque arrière par défaut, valeurs, image embarquée', () => {
  const { projet, biblio } = dossiers();
  const html = '<section data-scene="s"><h1 id="titre">T</h1>\n<div data-shader="voile" data-reglages="niveau: 0.3; teinte: primaire" data-image="assets/motif.png"></div>\n'
    + '<div data-shader="voile" data-ancre="#titre" data-calque="avant"></div></section>';
  const r = Sh.preparerShaders(html, { scene: 's', charger: Sh.chargeurShaders(projet, biblio), charte: CHARTE, projet, premierIndex: 3 });
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /<div data-shader="voile" data-reglages="niveau: 0.3; teinte: primaire" data-image="assets\/motif.png" data-pm-shader="3">/);
  assert.match(r.html, /data-calque="avant" data-pm-shader="4">/);
  const [a, b] = r.shaders;
  assert.equal(a.usage, 'fond');
  assert.equal(a.calque, 'arriere');
  assert.equal(a.ordre, 0);
  assert.equal(a.scene, 's');
  assert.equal(a.valeurs.niveau, 0.3);
  assert.equal(a.debord, 4);
  assert.match(a.image, /^data:image\/png;base64,/);
  assert.equal(a.code, FOND);
  assert.equal(b.ancre, 'titre');
  assert.equal(b.calque, 'avant');
  assert.equal(b.ordre, 1);
  assert.equal(b.image, null);
});

test('preparerShaders : erreurs nommées, balise marquée', () => {
  const { projet, biblio } = dossiers();
  const charger = Sh.chargeurShaders(projet, biblio);
  const cas = [
    ['<div data-shader="absent"></div>', 'shader-inconnu', /introuvable/],
    ['<div data-shader="fondu-x"></div>', 'usage-incompatible', /« transition », « fond » attendu/],
    ['<div data-shader="voile" data-ancre="#rien"></div>', 'ancre-introuvable', /data-ancre « #rien »/],
    ['<div data-shader="voile" data-calque="dessus"></div>', 'shader-invalide', /data-calque/],
    ['<div data-shader="voile" data-reglages="niveau: 4"></div>', 'reglage-invalide', /au-delà du maximum 1/],
    ['<div data-shader="voile" data-image="assets/absent.png"></div>', 'fichier-introuvable', /absent\.png/],
    ['<div data-shader="casse"></div>', 'shader-invalide', /JSON valide/],
  ];
  for (const [balise, regle, motif] of cas) {
    const r = Sh.preparerShaders(`<section data-scene="s">${balise}</section>`, { scene: 's', charger, charte: CHARTE, projet });
    assert.equal(r.erreurs[0].regle, regle, balise);
    assert.equal(r.erreurs[0].gravite, 'erreur');
    assert.match(r.erreurs[0].message, /^Scène « s » : /);
    assert.match(r.erreurs[0].message, motif, balise);
    assert.match(r.html, /data-pm-shader-erreur="/, balise);
    assert.deepEqual(r.shaders, []);
  }
});

test('balisesAvec, balisesShaders et modifierShader', () => {
  const html = '<div data-effet="neige"></div><!-- <div data-shader="x"> --><div data-shader="voile" data-reglages="niveau: 1"></div><div data-shader="plasma"></div>';
  assert.equal(balisesEffets(html).length, 1);
  assert.deepEqual(balisesAvec(html, 'data-shader').map((b) => b.attributs['data-shader']), ['voile', 'plasma']);
  assert.deepEqual(Sh.balisesShaders(html).map((b) => b.ordre), [0, 1]);
  assert.match(Sh.modifierShader(html, 0, { 'data-reglages': 'niveau: 0.2' }), /<div data-shader="voile" data-reglages="niveau: 0.2"><\/div><div data-shader="plasma">/);
  assert.equal(Sh.modifierShader(html, 5, {}), null);
});
