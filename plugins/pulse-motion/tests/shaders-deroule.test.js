'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validerDeroule, MAX_POST } = require('../scripts/lib/deroule.js');

const base = () => ({
  version: 1, titre: 'Essai', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'test',
  scenes: [
    { id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} },
    { id: 'b', fichier: 'scenes/b.html', duree: 3, textes: {}, transition: 'fondu' },
  ],
});

test('déroulé : transition objet et post-traitements', () => {
  const d = base();
  d.scenes[1].transition = { shader: 'dissolution', duree: 0.8, reglages: { grain: 0.5, couleur: 'accent' }, image: 'assets/motif.png' };
  d.scenes[0].post = [{ shader: 'grain', reglages: { force: 0.3 } }];
  d.post = [{ shader: 'vignettage' }, { shader: 'aberration', reglages: { ecart: 0.4 } }];
  assert.deepEqual(validerDeroule(d), []);
  assert.deepEqual(validerDeroule(base()), [], 'transitions CSS inchangées');
  const juste = base();
  juste.scenes[1].transition = { shader: 'dissolution', duree: 3 };
  assert.deepEqual(validerDeroule(juste), [], 'une transition aussi longue que les deux scènes');
  assert.equal(MAX_POST, 4);
});

test('déroulé : transitions et post-traitements mal écrits', () => {
  const cas = [
    [(d) => { d.scenes[1].transition = 'tourbillon'; }, /« transition » doit être l'une de : aucune, fondu.*ou un shader \{ "shader": "dissolution", "duree": 0\.8 \}/],
    [(d) => { d.scenes[1].transition = { duree: 1 }; }, /« transition » : « shader » doit être le nom d'un shader/],
    [(d) => { d.scenes[1].transition = { shader: 'Dissolution!' }; }, /« shader » doit être le nom d'un shader/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', duree: 9 }; }, /« transition\.duree » doit être un nombre de secondes entre 0,1 et 5/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', vitesse: 2 }; }, /champ « vitesse » inconnu \(champs : shader, duree, reglages, image\)/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', reglages: [1] }; }, /« reglages » doit être un objet/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', image: 'motif.png' }; }, /« image » doit être un fichier de assets\//],
    [(d) => { d.scenes[0].post = { shader: 'grain' }; }, /La scène « a » : « post » doit être une liste/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', duree: 4 }; d.scenes[1].duree = 6; }, /« transition\.duree » \(4 s\) dépasse celle de la scène précédente \(« a »\), 3 s/],
    [(d) => { d.scenes[1].transition = { shader: 'dissolution', duree: 2 }; d.scenes[1].duree = 3; d.scenes[1].rythme = 2; }, /« transition\.duree » \(2 s\) dépasse celle de la scène, 1,5 s/],
    [(d) => { d.post = [{ shader: 'grain', duree: 2 }]; }, /« post »\[1\] : champ « duree » inconnu \(champs : shader, reglages, image\)/],
    [(d) => { d.post = Array.from({ length: 5 }, () => ({ shader: 'grain' })); }, /« post » : 4 post-traitements au plus/],
  ];
  for (const [modifier, motif] of cas) {
    const d = base();
    modifier(d);
    const err = validerDeroule(d);
    assert.ok(err.some((m) => motif.test(m)), `${motif} dans ${JSON.stringify(err)}`);
  }
});

const fs = require('node:fs');
const path = require('node:path');
const { calculerMinutage, DUREE_TRANSITION_SHADER, CHEVAUCHEMENT } = require('../moteur/minutage.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { assembler } = require('../scripts/assembler.js');
const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { trouverNavigateur } = require('../scripts/lib/navigateur.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');

test('minutage : durée d\'une transition par shader', () => {
  const m = calculerMinutage([
    { id: 'a', duree: 3, transition: { shader: 'dissolution', duree: 1.2 } },
    { id: 'b', duree: 3, transition: { shader: 'dissolution', duree: 1.5 } },
    { id: 'c', duree: 3, transition: { shader: 'pixels' } },
    { id: 'd', duree: 3, transition: 'fondu' },
    { id: 'e', duree: 3, transition: 'coupe' },
  ], {});
  assert.equal(DUREE_TRANSITION_SHADER, 0.8);
  assert.deepEqual(m.scenes.map((s) => s.entree), [0, 1.5, 0.8, CHEVAUCHEMENT, 0]);
  assert.deepEqual(m.scenes.map((s) => s.dureeTransition), [1.2, 1.5, 0.8, CHEVAUCHEMENT, 0]);
  assert.deepEqual(m.scenes.map((s) => s.debut), [0, 1.5, 3.7, 6.2, 9.2]);
  assert.deepEqual(m.scenes[1].transition, { shader: 'dissolution', duree: 1.5 });
});

test('extraction : data-shader minuté comme un effet', () => {
  const s = extraireScene('<section data-scene="s"><div data-shader="nebuleuse" data-calque="arriere"></div></section>');
  assert.equal(s.elements.length, 1);
  assert.equal(s.elements[0].balise, 'div');
  const css = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'base.css'), 'utf8');
  assert.match(css, /#pm-scene \[data-effet\], #pm-scene \[data-shader\] \{ position: absolute; \}/);
});

test('page sans GPU : transition par shader remplacée par un fondu, data-shader minuté', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} },
      { id: 'b', fichier: 'scenes/b.html', duree: 3, textes: {}, transition: { shader: 'moitie', duree: 1 } },
    ];
  });
  fs.mkdirSync(path.join(dir, 'shaders'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'shaders', 'moitie.json'), JSON.stringify({ version: 1, nom: 'moitie', usage: 'transition' }));
  fs.writeFileSync(path.join(dir, 'shaders', 'moitie.wgsl'), 'fn transition(coord: vec2f, progres: f32) -> vec4f { return canal1(coord / iResolution.xy); }\n');
  fs.writeFileSync(path.join(dir, 'scenes', 'a.html'), '<section data-scene="a"><p>A</p></section>');
  fs.writeFileSync(path.join(dir, 'scenes', 'b.html'), '<section data-scene="b"><p>B</p><div id="v" data-shader="voile-test" data-start="0.5"></div></section>');
  fs.writeFileSync(path.join(dir, 'shaders', 'voile-test.json'), JSON.stringify({ version: 1, nom: 'voile-test', usage: 'fond' }));
  fs.writeFileSync(path.join(dir, 'shaders', 'voile-test.wgsl'), 'fn image(coord: vec2f) -> vec4f { return vec4f(0.0); }\n');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const html = a.html.replace('<head>', '<head><script>window.__PM_SANS_GPU__ = true;</script>');
  const r = await mesurerPage({ html, navigateur: trouverNavigateur(), script: `
    M.rendre(2.5);
    var b = document.querySelector('section[data-scene="b"]');
    var info = M.minutage.scenes[1];
    return { opacite: b.style.opacity, debut: info.debut, type: M.typeTransition(info), debutVoile: M.minutage.elements.b.v.debut };` });
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.resultat.debut, 2);
  assert.equal(r.resultat.type, 'fondu');
  assert.ok(Math.abs(Number(r.resultat.opacite) - 0.5) < 0.01, `opacité ${r.resultat.opacite}`);
  assert.equal(r.resultat.debutVoile, 2.5);
});
