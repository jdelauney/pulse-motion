'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../scripts/lib/personnages.js');
const D = require('../scripts/lib/decoupe-personnages.js');

const ctx = { nom: 'x', poses: [], osEnPlus: [], gabarits: ['standard'], osParGabarit: { standard: [] }, expressions: [] };
const DECOUPE = {
  nom: 'x', source: 'assets/x.svg', vue: 'profil',
  os: { torse: { formes: ['#veste'], de: [0, 100], a: [0, 0] }, tete: { formes: ['#tete'], centre: [0, -40] }, cuisseAvant: { formes: ['g2>rect2'], de: [0, 100], a: [0, 200] } },
  visage: { yeux: [{ blanc: '#oeil', pupille: '#pupille' }], bouche: '#bouche' },
  ignorer: ['#ombre'],
};

test('découpe : valide, écriture stable', () => {
  assert.deepEqual(P.valider('decoupe', DECOUPE, ctx), []);
  const texte = P.serialiser('decoupe', DECOUPE);
  assert.equal(P.serialiser('decoupe', JSON.parse(texte)), texte);
  assert.ok(texte.indexOf('"torse"') < texte.indexOf('"tete"') && texte.indexOf('"tete"') < texte.indexOf('"cuisseAvant"'));
});

test('découpe : erreurs', () => {
  const e = P.valider('decoupe', Object.assign({}, DECOUPE, {
    source: '../x.svg', vue: 'cote', gabarit: 'geant', couleurs: { rouge: 'peau' },
    os: { queue: { formes: ['#q'], de: [0, 0], a: [1, 1] }, torse: { formes: [], de: [0, 0], a: [0, 0] }, tete: { formes: ['#veste'] }, cuisseAvant: { formes: ['#veste', 'pas un sélecteur!'], de: [0, 0] } },
    visage: { yeux: [{ pupille: '#p' }] },
  }), ctx);
  const attendus = [/« source » : fichier SVG dans assets/, /« vue » :/, /gabarit « geant » introuvable/, /« couleurs » : \{ "#RRGGBB": "nom" \}/,
    /os « queue » : inconnu/, /os « torse » : « formes » : liste de sélecteurs/, /os « torse » : « de » et « a » confondus/,
    /os « tete » : « centre » : position/, /os « cuisseAvant » : la forme « #veste » est déjà dans os « tete »/,
    /os « cuisseAvant » : sélecteur « pas un sélecteur! » illisible/, /os « cuisseAvant » : « de » et « a » : positions/,
    /visage : « yeux » : liste de/];
  for (const m of attendus) assert.ok(e.some((x) => m.test(x)), `${m} :\n${e.join('\n')}`);
  assert.ok(P.valider('decoupe', Object.assign({}, DECOUPE, { os: { torse: DECOUPE.os.torse } }), ctx).some((m) => /visage : il faut l'os « tete »/.test(m)));
});

test('preparerSource : ni script, ni on…, ni prologue', () => {
  const s = D.preparerSource('﻿<?xml version="1.0"?>\n<!DOCTYPE svg>\n<!-- note --><svg onload="x()"><script>alert(1)</script><rect onclick=\'y()\' width="1"/><a href="javascript:z()"/></svg>');
  assert.equal(s.startsWith('<svg'), true);
  assert.doesNotMatch(s, /script|onload|onclick|javascript|<\?xml|DOCTYPE|note/);
  assert.throws(() => D.preparerSource('<html></html>'), /n'est pas un SVG/);
  assert.doesNotMatch(D.preparerSource('<svg/onload=alert(1)><image href="x"/onerror=y()/></svg>'), /onload|onerror/);
  const liens = D.preparerSource('<svg><a href="https://x.invalid"><rect/></a><linearGradient id="B" xlink:href="#A"/></svg>');
  assert.doesNotMatch(liens, /x\.invalid/);
  assert.match(liens, /xlink:href="#A"/, 'références internes gardées');
  assert.throws(() => D.preparerSource('<!DOCTYPE svg [<!ENTITY st0 "fill:red">]><svg><path style="&st0;"/></svg>'), /par entités/);
  const html = D.page('<svg></svg>', {}, 'window.x = 1;');
  const nonce = /'nonce-([^']+)'/.exec(html)[1];
  assert.match(html, /default-src 'none'; script-src 'nonce-/);
  assert.equal((html.match(new RegExp(`<script nonce="${nonce.replace(/[+/=]/g, (c) => `\\${c}`)}">`, 'g')) || []).length, 2);
});

test('fusionnerDessin : la vue découpée remplace l\'ancienne, le reste est gardé ; profil rempli au besoin', () => {
  const ancien = { nom: 'x', gabarit: 'standard', couleurs: { c1: '#000000', bouche: '#FF0000' }, pieces: { torse: { profil: 'A', face: 'B' }, brasAvant: { face: 'C' } },
    visage: { oeil: { blanc: 'o' }, bouches: { neutre: { profil: 'n' }, sourire: { profil: 's' } }, vues: { profil: { yeux: [[1, 1]], bouche: [0, 1] } } } };
  const partiel = { gabarit: { cuisse: 50 }, couleurs: { c1: '#FFFFFF' }, pieces: { torse: 'T', tete: 'H' },
    visage: { oeil: { blanc: 'O2' }, bouche: 'N2', vue: { yeux: [[2, 2]], bouche: [0, 3] } } };
  const { dessin, profilCopie } = D.fusionnerDessin(ancien, partiel, 'face');
  assert.equal('nom' in dessin, false);
  assert.deepEqual(dessin.pieces.torse, { profil: 'A', face: 'T' });
  assert.equal(dessin.pieces.brasAvant, undefined, 'la vue face de brasAvant venait de l\'ancienne découpe : retirée');
  assert.deepEqual(dessin.pieces.tete, { face: 'H', profil: 'H' });
  assert.equal(profilCopie, true);
  assert.deepEqual(dessin.couleurs, { c1: '#FFFFFF', bouche: '#FF0000' });
  assert.deepEqual(dessin.visage.bouches.neutre, { profil: 'n', face: 'N2' });
  assert.equal(dessin.visage.bouches.sourire.profil, 's', 'bouches ajoutées gardées');
  assert.deepEqual(dessin.visage.vues.face, { yeux: [[2, 2]], bouche: [0, 3] });
  assert.deepEqual(dessin.visage.vues.profil, { yeux: [[1, 1]], bouche: [0, 1] });
  assert.deepEqual(dessin.gabarit, { cuisse: 50 });
  assert.equal(D.fusionnerDessin(null, partiel, 'profil').profilCopie, false);
  // Redécouper la face : le profil, qui en était une copie, suit.
  const encore = D.fusionnerDessin(Object.assign({}, dessin), Object.assign({}, partiel, { pieces: { tete: 'H2' }, visage: Object.assign({}, partiel.visage, { bouche: 'N3', vue: { yeux: [[3, 3]], bouche: [0, 4] } }) }), 'face');
  assert.deepEqual(encore.dessin.pieces.tete, { face: 'H2', profil: 'H2' });
  assert.equal(encore.dessin.visage.bouches.neutre.profil, 'n', 'profil dessiné à part : gardé');
  assert.deepEqual(encore.dessin.visage.vues.profil, { yeux: [[1, 1]], bouche: [0, 1] });
});

test('renommerCouleur : clé et variables, sans confondre c1 et c10', () => {
  const d = { couleurs: { c1: '#111111', c10: '#101010' }, pieces: { torse: { profil: "<rect fill='var(--c1)' stroke='var(--c10)'/>" } }, visage: { oeil: { blanc: "<circle fill='var(--c1, red)'/>" } } };
  const r = D.renommerCouleur(d, 'c1', 'peau');
  assert.deepEqual(Object.keys(r.couleurs), ['peau', 'c10']);
  assert.equal(r.pieces.torse.profil, "<rect fill='var(--peau)' stroke='var(--c10)'/>");
  assert.equal(r.visage.oeil.blanc, "<circle fill='var(--peau, red)'/>");
  assert.throws(() => D.renommerCouleur(d, 'c9', 'x'), /« c9 » introuvable/);
  assert.throws(() => D.renommerCouleur(d, 'c1', 'c10'), /existe déjà/);
  assert.throws(() => D.renommerCouleur(d, 'c1', 'Peau'), /invalide/);
});
