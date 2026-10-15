'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const K = require('../moteur/clips.js');
const S = require('../moteur/squelette.js');
const P = require('../scripts/lib/personnages.js');

const lu = P.lire(null);
let E;
test.before(async () => { E = await import(pathToFileURL(path.join(__dirname, '..', 'moteur', 'personnages', 'edition.mjs')).href); });
const outils = { clips: K, squelette: S };
const clip = (objet, extra = {}) => E.creerEdition(Object.assign({ type: 'clip', nom: 'c', objet, lu }, extra), outils);

test('édition : nouvel objet, unités et longueur de la frise', () => {
  assert.deepEqual(E.nouvelObjet('pose'), { angles: {} });
  assert.deepEqual(E.nouvelObjet('clip').cles, [{ t: 0, pose: 'debout' }]);
  const boucle = clip(lu.clips.marche);
  assert.equal(boucle.unite(), 'phase');
  assert.equal(boucle.longueurFrise(), 1);
  const saut = clip(lu.clips.saut);
  assert.equal(saut.unite(), 's');
  assert.equal(saut.longueurFrise(), 1.8);
  assert.equal(E.PAS_IMAGE, 0.04);
});

test('édition : régler un angle crée une clé à l\'instant courant, ou modifie celle qui s\'y trouve', () => {
  const ed = clip({ boucle: true, duree: 2, cles: [{ t: 0, angles: { torse: 0 } }] });
  ed.aller(0.5); // phase 0,25
  ed.regler('torse', 12.34567);
  assert.deepEqual(ed.objet.cles[1], { t: 0.25, angles: { torse: 12.346 } });
  assert.equal(ed.selection, 1);
  ed.regler('tete', 5);
  assert.equal(ed.objet.cles.length, 2);
  assert.deepEqual(ed.objet.cles[1].angles, { torse: 12.346, tete: 5 });
  ed.aller(0);
  ed.regler('torse', 3);
  assert.equal(ed.objet.cles[0].angles.torse, 3);
});

test('édition : une pose se règle directement', () => {
  const ed = E.creerEdition({ type: 'pose', nom: 'p', objet: { angles: { brasAvant: -90 } }, lu }, outils);
  ed.regler('tete', -10);
  assert.deepEqual(ed.objet.angles, { brasAvant: -90, tete: -10 });
  assert.equal(ed.pose().cuisseAvant, S.REPOS.cuisseAvant);
  assert.equal(ed.pose().tete, -10);
});

test('édition : ajouter une clé garde le mouvement, déplacer, dupliquer, supprimer', () => {
  const ed = clip(lu.clips.marche);
  ed.allerA(0.2);
  const avant = ed.pose();
  const i = ed.ajouterCle();
  assert.equal(ed.objet.cles[i].t, 0.2);
  const apres = ed.pose();
  for (const n of ['cuisseAvant', 'tibiaAvant', 'brasAvant', 'torse']) assert.ok(Math.abs(apres[n] - avant[n]) < 0.01, n);
  assert.equal(ed.deplacerCle(i, 0.21), true);
  assert.equal(ed.objet.cles[ed.selection].t, 0.21);
  const d = ed.dupliquerCle(ed.selection, 0.6);
  assert.equal(ed.objet.cles[d].t, 0.6);
  const n = ed.objet.cles.length;
  assert.equal(ed.supprimerCle(d), true);
  assert.equal(ed.objet.cles.length, n - 1);
});

test('édition : déplacer sur une clé existante est refusé, la dernière clé ne se supprime pas', () => {
  const ed = clip({ boucle: true, duree: 1, cles: [{ t: 0, angles: { torse: 0 } }, { t: 0.5, angles: { torse: 9 } }] });
  assert.equal(ed.deplacerCle(1, 0), false);
  assert.equal(ed.dupliquerCle(1, 0.5), -1);
  assert.equal(ed.deplacerCle(1, 1.7), true, 'borné à 1');
  assert.equal(ed.objet.cles[1].t, 1);
  const seule = clip({ boucle: false, cles: [{ t: 0, pose: 'debout' }] });
  assert.equal(seule.supprimerCle(0), false);
});

test('édition : poser une pose de la bibliothèque, courbe par défaut retirée', () => {
  const ed = clip({ boucle: false, cles: [{ t: 0, pose: 'debout' }] });
  ed.aller(0.8);
  ed.poserPose('bras-leves');
  assert.deepEqual(ed.objet.cles[1], { t: 0.8, pose: 'bras-leves' });
  ed.courbe(1, 'back-out');
  assert.equal(ed.objet.cles[1].courbe, 'back-out');
  ed.courbe(1, 'sine-inout');
  assert.equal('courbe' in ed.objet.cles[1], false);
  assert.throws(() => ed.poserPose('nage'), /pose « nage » introuvable/);
  assert.throws(() => clip(lu.clips.respiration).poserPose('debout'), /calque additif ne cite pas de pose/);
  const p = E.creerEdition({ type: 'pose', nom: 'p', objet: { angles: { tete: 4 } }, lu }, outils);
  p.poserPose('montrer');
  assert.deepEqual(p.objet.angles, lu.poses.montrer.angles);
});

test('édition : annuler, rétablir ; un geste compte pour un seul pas', () => {
  const ed = clip({ boucle: true, duree: 1, cles: [{ t: 0, angles: { torse: 0 } }] });
  ed.debutGeste();
  for (let i = 1; i <= 20; i++) ed.regler('torse', i);
  ed.finGeste();
  assert.equal(ed.objet.cles[0].angles.torse, 20);
  assert.equal(ed.annuler(), true);
  assert.equal(ed.objet.cles[0].angles.torse, 0);
  assert.equal(ed.annuler(), false);
  assert.equal(ed.retablir(), true);
  assert.equal(ed.objet.cles[0].angles.torse, 20);
  assert.equal(ed.modifie(), true);
  ed.marquerEnregistre();
  assert.equal(ed.modifie(), false);
});

test('édition : au sol, bassinY affiché et réglé comme un décalage', () => {
  const ed = clip(lu.clips.course);
  ed.allerA(0.22);
  assert.ok(Math.abs(ed.valeurs().bassinY + 14) < 1e-6, `décalage ${ed.valeurs().bassinY}`);
  const sol = S.poserAuSol(Object.assign({}, K.echantillonner(Object.assign({}, lu.clips.course, { pieds: 'libres' }), ed.temps, lu), { bassinY: 0 })).bassinY;
  assert.ok(Math.abs(ed.pose().bassinY - (sol - 14)) < 1e-6, 'la pose affichée est posée au sol, puis décalée');
  ed.regler('bassinY', -20);
  assert.equal(ed.objet.cles[ed.selection].angles.bassinY, -20);
  ed.allerA(0.4);
  const i = ed.ajouterCle();
  assert.ok(Math.abs(ed.objet.cles[i].angles.bassinY) < 1, `décalage, pas hauteur : ${ed.objet.cles[i].angles.bassinY}`);
});

test('édition : clip additif, curseurs en différences, affichage sur le repos', () => {
  const ed = clip(lu.clips.respiration);
  ed.allerA(0.25);
  assert.ok(Math.abs(ed.valeurs().torse - 1.5) < 1e-6);
  assert.ok(Math.abs(ed.pose().torse - (S.REPOS.torse + 1.5)) < 1e-6);
});

test('édition : changer « boucle » convertit les instants des clés', () => {
  const ed = clip({ boucle: true, duree: 2, cles: [{ t: 0, angles: { torse: 0 } }, { t: 0.5, angles: { torse: 9 } }] });
  ed.proprietes({ boucle: false });
  assert.deepEqual(ed.objet.cles.map((c) => c.t), [0, 1]);
  assert.equal('duree' in ed.objet, false);
  ed.proprietes({ boucle: true });
  assert.deepEqual(ed.objet.cles.map((c) => c.t), [0, 1]);
  assert.equal(ed.objet.duree, 1);
  ed.proprietes({ foulee: 120, miroir: 0.5, description: 'test' });
  ed.proprietes({ miroir: null });
  assert.equal(ed.objet.foulee, 120);
  assert.equal('miroir' in ed.objet, false);
});

test('édition : clés voisines (pelure d\'oignon), versObjet valide', () => {
  const ed = clip(lu.clips.marche);
  ed.allerA(0.3);
  assert.deepEqual(ed.voisines(), [0.25, 0.375]);
  ed.allerA(0.25);
  assert.deepEqual(ed.voisines(), [0.125, 0.375]);
  ed.allerA(0.9);
  assert.deepEqual(ed.voisines(), [0.875, 0]);
  const o = ed.versObjet();
  assert.equal('nom' in o, false);
  assert.deepEqual(P.valider('clip', o, Object.assign({ nom: 'marche' }, P.contexteDe(lu))), []);
});
