'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const FOND = 'fn image(coord: vec2f) -> vec4f { return vec4f(R.niveau); }\n';
const TRANS = 'fn transition(coord: vec2f, progres: f32) -> vec4f { return mix(canal0(coord), canal1(coord), progres); }\n';
const POST = 'fn post(coord: vec2f) -> vec4f { return canal0(coord) * R.force; }\n';

function projet(deroule) {
  const dir = copierProjet('projet-particules');
  const biblio = dossierTemporaire('pm-sh-biblio-');
  ecrire(dir, 'shaders/voile.json', { version: 1, nom: 'voile', usage: 'fond', parametres: { niveau: { defaut: 0.5, min: 0, max: 1 } } });
  ecrire(dir, 'shaders/voile.wgsl', FOND);
  ecrire(biblio, 'melange.json', { version: 1, nom: 'melange', usage: 'transition' });
  ecrire(biblio, 'melange.wgsl', TRANS);
  ecrire(biblio, 'assombrir.json', { version: 1, nom: 'assombrir', usage: 'post', parametres: { force: { defaut: 0.8, min: 0, max: 1 } } });
  ecrire(biblio, 'assombrir.wgsl', POST);
  ecrire(dir, 'scenes/a.html', '<section data-scene="a"><div data-shader="voile"></div><div data-shader="voile" data-reglages="niveau: 0.2"></div></section>');
  ecrire(dir, 'scenes/b.html', '<section data-scene="b"><h2 id="t">T</h2><div data-shader="voile" data-ancre="#t" data-calque="avant"></div></section>');
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {}, post: [{ shader: 'assombrir', reglages: { force: 0.4 } }] },
      { id: 'b', fichier: 'scenes/b.html', duree: 3, textes: {}, transition: { shader: 'melange', duree: 1 } },
    ];
    d.post = [{ shader: 'assombrir' }];
    deroule(d);
  });
  return { dir, biblio };
}

test('assemblage : fonds, transitions, post-traitements dans M.donnees.shaders', () => {
  const { dir, biblio } = projet(() => {});
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, dossierShaders: biblio, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const s = a.donnees.shaders;
  assert.deepEqual(s.map((x) => [x.usage, x.nom, x.scene, x.ordre, x.rang]), [
    ['fond', 'voile', 'a', 0, null], ['fond', 'voile', 'a', 1, null], ['fond', 'voile', 'b', 0, null],
    ['post', 'assombrir', 'a', null, 0], ['transition', 'melange', 'b', null, null], ['post', 'assombrir', null, null, 0],
  ]);
  assert.match(a.html, /<div data-shader="voile" data-pm-shader="0"><\/div><div data-shader="voile" data-reglages="niveau: 0.2" data-pm-shader="1">/);
  assert.match(a.html, /data-calque="avant" data-pm-shader="2">/);
  assert.equal(s[1].valeurs.niveau, 0.2);
  assert.equal(s[2].ancre, 't');
  assert.equal(s[3].valeurs.force, 0.4);
  assert.equal(s[4].duree, 1);
  assert.equal(s[4].fichier, 'bibliothèque : melange.wgsl');
  assert.equal(s[5].valeurs.force, 0.8);
  assert.deepEqual(a.donnees.scenes.map((x) => x.transition), ['aucune', { shader: 'melange', duree: 1 }]);
  assert.deepEqual(a.shaders, s);
});

test('assemblage : erreurs des shaders du déroulé nommées, page produite', () => {
  const cas = [
    [(d) => { d.scenes[1].transition = { shader: 'absent' }; }, 'shader-inconnu', /Scène « b », transition : shader « absent » introuvable/],
    [(d) => { d.scenes[1].transition = { shader: 'assombrir' }; }, 'usage-incompatible', /« post », « transition » attendu/],
    [(d) => { d.post = [{ shader: 'melange' }]; }, 'usage-incompatible', /Vidéo, post-traitement n° 1 : shader « melange »/],
    [(d) => { d.scenes[0].post = [{ shader: 'assombrir', reglages: { force: 3 } }]; }, 'reglage-invalide', /au-delà du maximum 1/],
    [(d) => { d.scenes[1].transition = { shader: 'melange', image: 'assets/rien.png' }; }, 'fichier-introuvable', /rien\.png/],
  ];
  for (const [modifier, regle, motif] of cas) {
    const { dir, biblio } = projet(modifier);
    const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, dossierShaders: biblio, ecrire: false });
    const e = a.erreurs.find((x) => x.regle === regle);
    assert.ok(e, `${regle} attendu : ${JSON.stringify(a.erreurs)}`);
    assert.equal(e.gravite, 'erreur');
    assert.match(e.message, motif);
    assert.equal(a.ok, true, 'la page est quand même produite');
  }
});
