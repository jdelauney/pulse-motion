'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../scripts/styles.js');
const { assembler } = require('../scripts/assembler.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { CLAIR, modifierJSON, stylesEssai, dossierPersonnelEssai } = require('./aide/styles.js');

function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  const perso = dossierPersonnelEssai();
  process.env.PULSE_MOTION_DOSSIER = perso;
  try { return fn(perso); } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
}

function stylePersonnel(perso, nom) {
  const d = path.join(perso, 'styles', nom);
  fs.cpSync(CLAIR, d, { recursive: true });
  for (const f of ['catalogue.json', 'identite.json']) modifierJSON(path.join(d, f), (j) => { j.style = nom; });
  return d;
}

test('styles livrés, puis personnels ; un personnel ne masque pas un livré', () => avecPersonnel((perso) => {
  stylePersonnel(perso, 'papercraft');
  const masque = stylePersonnel(perso, 'clair-pedagogique');
  fs.writeFileSync(path.join(masque, 'style.css'), '/* faux */');
  assert.deepEqual(S.nomsStyles(), ['clair-pedagogique', 'papercraft']);
  assert.equal(S.trouverStyle('clair-pedagogique').personnel, false);
  const p = S.trouverStyle('papercraft');
  assert.equal(p.personnel, true);
  assert.equal(p.dossier, path.join(perso, 'styles', 'papercraft'));
  const fiches = S.listerStyles();
  assert.deepEqual(fiches.map((f) => [f.style, f.personnel, f.verifie]), [['clair-pedagogique', false, true], ['papercraft', true, true]]);
  assert.deepEqual(fiches[0].personnalite, ['posé', 'lisible', 'rassurant']);
}));

test('noms dangereux refusés ; dossier personnel absent : styles livrés seulement', () => avecPersonnel((perso) => {
  fs.rmSync(perso, { recursive: true, force: true });
  assert.equal(S.trouverStyle('../clair-pedagogique'), null);
  assert.equal(S.trouverStyle('Clair'), null);
  assert.deepEqual(S.nomsStyles(), ['clair-pedagogique']);
  assert.match(S.messageStyleInconnu('neon'), /^Style « neon » introuvable\. Styles disponibles : clair-pedagogique\. Un style personnel se range dans .*neon/);
}));

test('recommandation : 2 recommandés, styles personnels vérifiés du genre, un 3e d\'une autre famille, puis le reste', () => avecPersonnel(() => {
  const racine = stylesEssai(['clair-pedagogique', 'chaleureux', 'minimal', 'energique', 'perso-ok', 'perso-ko']);
  modifierJSON(path.join(racine, 'chaleureux', 'identite.json'), (j) => { j.famille = 'chaleureuse'; });
  modifierJSON(path.join(racine, 'energique', 'identite.json'), (j) => { j.famille = 'affirmee'; });
  modifierJSON(path.join(racine, 'perso-ok', 'identite.json'), (j) => { j.genres = ['social']; });
  fs.rmSync(path.join(racine, 'perso-ko', 'scenes', 'titre.html'));
  const perso = path.join(process.env.PULSE_MOTION_DOSSIER, 'styles');
  fs.mkdirSync(perso, { recursive: true });
  for (const n of ['perso-ok', 'perso-ko']) fs.renameSync(path.join(racine, n), path.join(perso, n));
  const racines = [racine, perso];
  // perso-ko (scène titre manquante) n'est jamais proposé.
  assert.deepEqual(S.recommander('formation', racines).map((f) => f.style), ['clair-pedagogique', 'chaleureux', 'minimal', 'energique', 'perso-ok']);
  // social : pas de style « editorial » ; le 3e d'une autre famille est chaleureux (chaleureuse).
  assert.deepEqual(S.recommander('social', racines).map((f) => f.style), ['energique', 'minimal', 'perso-ok', 'chaleureux', 'clair-pedagogique']);
  assert.throws(() => S.recommander('cuisine', racines), /Genre inconnu : « cuisine »/);
}));

test('recommandation sans les styles du tableau : complétée par une autre famille', () => avecPersonnel(() => {
  const racine = stylesEssai(['clair-pedagogique', 'sobre']);
  modifierJSON(path.join(racine, 'sobre', 'identite.json'), (j) => { j.famille = 'editoriale'; });
  assert.deepEqual(S.recommander('storytelling', racine).map((f) => f.style), ['clair-pedagogique', 'sobre']);
}));

test('assembler : style trouvé dans une liste de dossiers, message clair sinon', () => {
  const racine = stylesEssai(['alpha']);
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.style = 'alpha'; });
  assert.equal(assembler({ dossier: dir, dossierStyles: [path.join(racine, 'absent'), racine], ecrire: false }).ok, true);
  modifierDeroule(dir, (d) => { d.style = 'neon'; });
  const r = assembler({ dossier: dir, dossierStyles: [racine], ecrire: false });
  assert.equal(r.erreurs[0].regle, 'style-inconnu');
  assert.match(r.erreurs[0].message, /Style « neon » introuvable\. Styles disponibles : alpha\./);
});

test('style personnel mal formé : la liste et la recommandation continuent, le style est écarté', () => avecPersonnel((perso) => {
  const casse = stylePersonnel(perso, 'maison');
  modifierJSON(path.join(casse, 'catalogue.json'), (c) => { c.scenes = {}; });
  modifierJSON(path.join(casse, 'charte.json'), (c) => { c.couleurs.texte = 12; });
  modifierJSON(path.join(casse, 'identite.json'), (j) => { j.genres = 7; });
  const fiche = S.listerStyles().find((f) => f.style === 'maison');
  assert.equal(fiche.verifie, false);
  assert.deepEqual(fiche.genres, []);
  assert.deepEqual(S.recommander('formation').map((f) => f.style), ['clair-pedagogique']);
  assert.equal(S.verifierStyle(casse).ok, false);
}));
