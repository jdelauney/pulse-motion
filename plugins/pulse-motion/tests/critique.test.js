'use strict';
/* Spec « Regard et réalisation » (S2), plan S2-4, exigence 5.5 : le schéma de sortie/regard/critique.json et l'état de la
 * relecture (une relecture de la page actuelle se relit, elle ne se relance pas). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { AXES, validerCritique, etatRelecture, empreintePage } = require('../scripts/lib/relecture.js');

const RACINE = path.join(__dirname, '..');
const SEUILS = JSON.parse(fs.readFileSync(path.join(RACINE, 'scripts', 'seuils.json'), 'utf8'));

/** Une relecture valide, toutes les notes à n. */
function critique(n = 8, defauts = []) {
  return {
    version: 1, empreinte: 'abcdef0123456789', message: 'Le froid se garde de bout en bout.', messagePrevu: 'Garder la chaîne du froid.', ecart: '',
    axes: Object.fromEntries(AXES.map((a) => [a, { note: n, preuve: `scène intro, 1,2 s : ${a}${a === 'style' ? ', clé claire comme le ton' : ''}` }])),
    scenes: [{ id: 'intro', note: n, raison: 'le titre porte le propos' }, { id: 'seuil', note: n, raison: 'le chiffre arrive tard' }],
    defauts, verdict: n >= 8 && !defauts.some((d) => d.gravite === 'a-corriger') ? 'prete' : 'encore-un-tour', plusFaible: 'seuil', inverifiable: [],
  };
}
const defaut = (gravite) => ({ gravite, scene: 'seuil', instant: 12.3, symptome: 'titre petit', mecanisme: 'taille 4 cqh', correction: 'titre de 4 cqh → 6 cqh' });

test('critique.test.js › le schéma de critique.json est validé (axes connus, notes de 1 à 10 ou null, verdict cohérent avec la barre)', () => {
  assert.equal(SEUILS.critiqueBarre, 8);
  assert.equal(SEUILS.critiqueScenesMax, 3);   // décision 8 de l'auteur : le tour de corrections porte sur 3 scènes au plus
  assert.equal(SEUILS.critiqueIntouche, 9);
  assert.deepEqual(AXES, ['message', 'ouverture', 'lisibilite', 'composition', 'mouvement', 'rythme', 'continuite', 'verite', 'style']);
  const scenes = ['intro', 'seuil'];
  assert.deepEqual(validerCritique(critique(8), { scenes }), []);
  assert.deepEqual(validerCritique(critique(6, [defaut('souhaitable')]), { scenes }), []);
  assert.deepEqual(validerCritique(critique(9, [defaut('detail')]), { scenes }), []);
  // Un axe invérifiable (null) ne compte pas dans la barre.
  const c = critique(9);
  c.axes.verite = { note: null, preuve: 'invérifiable : aucun chiffre visible' };
  c.inverifiable = ['verite'];
  assert.deepEqual(validerCritique(c, { scenes }), []);

  const erreurs = (modifier) => { const x = critique(8); modifier(x); return validerCritique(x, { scenes }).join('\n'); };
  assert.match(erreurs((x) => { x.axes.beaute = { note: 8, preuve: 'x' }; }), /Axe inconnu : « beaute »/);
  assert.match(erreurs((x) => { delete x.axes.rythme; }), /L'axe « rythme » manque/);
  assert.match(erreurs((x) => { x.axes.rythme.note = 11; }), /axes\.rythme\.note » doit être un entier de 1 à 10, ou null/);
  assert.match(erreurs((x) => { x.axes.rythme.note = 7.5; }), /axes\.rythme\.note/);
  assert.match(erreurs((x) => { x.axes.rythme.note = 0; }), /axes\.rythme\.note/);
  assert.match(erreurs((x) => { x.axes.rythme.preuve = ''; }), /axes\.rythme\.preuve » est obligatoire/);
  assert.match(erreurs((x) => { x.scenes[0].id = 'ailleurs'; }), /la scène « ailleurs » n'existe pas/);
  assert.match(erreurs((x) => { x.defauts = [{ ...defaut('grave') }]; }), /defauts\[0\]\.gravite/);
  assert.match(erreurs((x) => { x.defauts = [{ ...defaut('detail'), instant: 'début' }]; }), /defauts\[0\]\.instant/);
  assert.match(erreurs((x) => { x.verdict = 'bien'; }), /« verdict » : prete ou encore-un-tour/);
  assert.match(erreurs((x) => { x.version = 2; }), /« version » doit valoir 1/);
  assert.match(erreurs((x) => { delete x.empreinte; }), /« empreinte » est obligatoire/);
  // Le verdict suit la barre : un axe sous 8, ou un défaut à corriger, interdit « prete » ; l'inverse aussi.
  assert.match(erreurs((x) => { x.axes.lisibilite.note = 7; }), /« prete » exige chaque axe noté à 8 au moins/);
  assert.match(erreurs((x) => { x.defauts = [defaut('a-corriger')]; }), /« prete » exige/);
  const tropSevere = critique(9);
  tropSevere.verdict = 'encore-un-tour';
  assert.match(validerCritique(tropSevere, { scenes }).join('\n'), /la vidéo est « prete »/);
  assert.match(validerCritique([], {}).join(''), /doit être un objet/);
});

function projet() {
  const dir = dossierTemporaire('pm-critique-');
  fs.mkdirSync(path.join(dir, 'sortie', 'regard'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({ scenes: [{ id: 'intro' }, { id: 'seuil' }] }));
  return dir;
}

test('critique.test.js › une critique d\'empreinte inchangée n\'est pas relancée', () => {
  const dir = projet();
  const html = '<html>page assemblée</html>';
  assert.equal(etatRelecture(dir, { html }), null, 'pas de relecture');
  const c = critique(6, [defaut('a-corriger')]);
  c.empreinte = empreintePage(html);
  fs.writeFileSync(path.join(dir, 'sortie', 'regard', 'critique.json'), JSON.stringify(c));
  assert.deepEqual(etatRelecture(dir, { html }), { verdict: 'encore-un-tour', plusFaible: 'seuil', aJour: true, empreinte: c.empreinte, erreurs: [] });
  // La page a changé (une correction) : la relecture n'est plus à jour ; elle se dit, elle ne se relance pas (un tour).
  assert.equal(etatRelecture(dir, { html: `${html} corrigée` }).aJour, false);
  // Empreinte : 16 caractères, déterministe.
  assert.match(empreintePage(html), /^[0-9a-f]{16}$/);
  assert.equal(empreintePage(html), empreintePage(html));
  // Une relecture mal formée n'est jamais « à jour » : elle se refait.
  fs.writeFileSync(path.join(dir, 'sortie', 'regard', 'critique.json'), JSON.stringify({ ...c, verdict: 'prete' }));
  const r = etatRelecture(dir, { html });
  assert.equal(r.aJour, false);
  assert.ok(r.erreurs.length);
  fs.writeFileSync(path.join(dir, 'sortie', 'regard', 'critique.json'), '{ pas du json');
  assert.equal(etatRelecture(dir, { html }).aJour, false);
});
