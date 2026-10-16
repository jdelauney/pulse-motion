'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PISTES, pistesCSS, besoinsSon } = require('../scripts/lib/son.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');

const regles = (r) => r.erreurs.map((e) => `${e.regle}:${e.gravite}`);

test('pistes connues et variables CSS reconnues', () => {
  assert.deepEqual(PISTES, ['musique', 'voix']);
  assert.deepEqual(pistesCSS('transform: scale(calc(1 + var(--son-basses)))'), ['musique']);
  assert.deepEqual(pistesCSS('opacity: var(--voix-enveloppe); --son-phase: 0'), ['musique', 'voix']);
  assert.deepEqual(pistesCSS('--son-autre: 1'), []);
});

test('besoins : pistes utilisées, piste inconnue, piste absente de la vidéo', () => {
  const presentes = { musique: true, voix: false };
  const r = besoinsSon({
    effets: [{ scene: 'a', effet: { nom: 'pluie', pistes: ['musique'] } }, { scene: 'a', effet: { nom: 'neige', pistes: ['batterie'] } }],
    shaders: [{ nom: 'halo', scene: 'b', pistes: ['voix'] }],
    css: [{ scene: null, texte: '.x { opacity: var(--son-volume); }' }],
    presentes,
  });
  assert.deepEqual(r.son, { pistes: ['musique'], css: true });
  assert.deepEqual(regles(r), ['piste-inconnue:erreur', 'son-sans-piste:erreur']);
  assert.match(r.erreurs[0].message, /Scène « a », effet « neige » : piste « batterie » inconnue \(pistes : musique, voix\)/);
  assert.match(r.erreurs[1].message, /shader « halo » suit la voix, mais la vidéo n'en a pas/);
  assert.equal(r.erreurs[1].scene, 'b');
});

test('besoins : rien qui lit le son -> null ; CSS sans musique -> alerte, variables à 0', () => {
  assert.deepEqual(besoinsSon({ presentes: { musique: true, voix: true } }), { son: null, erreurs: [] });
  const r = besoinsSon({ css: [{ scene: 'a', texte: 'var(--son-battement)' }], presentes: { musique: false, voix: false } });
  assert.deepEqual(r.son, { pistes: [], css: true });
  assert.deepEqual(regles(r), ['son-sans-piste:alerte']);
});

function avecPulsation(dir) {
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>',
    '  <div class="pulsation" style="transform: scale(calc(1 + 0.2 * var(--son-battement, 0)))"></div>\n</section>'));
}

test('assemblage : variables CSS dans une scène, avec et sans musique', () => {
  const sans = copierProjet('projet-simple');
  avecPulsation(sans);
  const a = assembler({ dossier: sans, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(a.donnees.son, { pistes: [], css: true });
  assert.ok(a.erreurs.some((e) => e.regle === 'son-sans-piste' && e.gravite === 'alerte' && e.scene === 'intro'));

  const avec = copierProjet('projet-simple');
  avecPulsation(avec);
  fs.mkdirSync(path.join(avec, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(avec, 'assets', 'musique.wav'), wavSinus({ secondes: 2 }));
  modifierDeroule(avec, (d) => { d.musique = { fichier: 'assets/musique.wav' }; });
  const b = assembler({ dossier: avec, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(b.donnees.son, { pistes: ['musique'], css: true });
  assert.equal(b.erreurs.filter((e) => e.regle === 'son-sans-piste').length, 0);
  assert.match(b.html, /M\.demarrerSonReactif\(\);\nM\.demarrerParticules\(\);/);
  assert.match(b.html, /M\.analyseSon = api/);

  const rien = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false });
  assert.equal(rien.donnees.son, null);
});

test('référence des contrôles et du son : règles et variables documentées', () => {
  const lire = (...p) => fs.readFileSync(path.join(__dirname, '..', 'references', ...p), 'utf8');
  for (const r of ['son-sans-piste', 'piste-inconnue']) assert.match(lire('controles.md'), new RegExp('`' + r + '`'), r);
  const audio = lire('audio.md');
  assert.match(audio, /## Son réactif/);
  for (const v of ['--son-volume', '--son-basses', '--son-mediums', '--son-aigus', '--son-battement', '--son-phase', '--voix-enveloppe']) assert.match(audio, new RegExp(v));
});
