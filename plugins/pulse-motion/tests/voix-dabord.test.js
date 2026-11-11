'use strict';
/* Spec « Explication narrée » (S7), plan J4 « Voix d'abord et rythme » : repères, forme dite et pauses du texte dit (5.11),
 * alignement renforcé (5.13), allure globale (5.14), bruitages automatiques et accents de la musique (5.15, partie sans
 * navigateur). Aucun réseau, aucun service de voix : la voix provisoire est remplacée par une fausse synthèse. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../moteur/aligner.js');
const { calculerMinutage, DEBUT_VOIX, MARGE_VOIX } = require('../moteur/minutage.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { miniProjet, poserVoix } = require('./aide/mini-projet.js');
const { wavSinus } = require('./aide/son.js');

const e = (w, t0, t1) => ({ w, t0, t1 });
const BASE = { version: 1, titre: 'a', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'x', scenes: [{ id: 's', fichier: 'f', duree: 4, textes: {} }] };
const avecVoix = (texte) => ({ ...BASE, scenes: [{ ...BASE.scenes[0], voix: { texte } }] });
const GLOSSAIRE = '| Terme | Sens | À éviter | Prononciation | Clé |\n|---|---|---|---|---|\n| HACCP | Méthode d\'hygiène |  | hache a cé cé pé |  |\n';

// --- 5.11 Repères, forme dite, pauses ----------------------------------------------------------------------------------

test('voix : un élément à repere:serveur entre avec le mot qui suit [#serveur]', async () => {
  const texte = 'Le client envoie sa commande [#serveur] au serveur.';
  const dir = miniProjet({ scenes: [{ id: 's', duree: 4, html: '<p data-texte="t" data-start="repere:serveur"></p>', textes: { t: 'Serveur' } }] });
  await poserVoix(dir, 's', wavSinus({ secondes: 2.4 }), texte);
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((x) => x.gravite === 'erreur'), []);
  const v = a.donnees.scenes[0].voix;
  const au = v.mots.findIndex((m) => m.w === 'au');
  assert.equal(v.reperes.serveur, v.mots[au].t0);
  assert.deepEqual(v.mots.map((m) => m.w), ['Le', 'client', 'envoie', 'sa', 'commande', 'au', 'serveur.']);
  const min = calculerMinutage(a.donnees.scenes, { s: [{ cle: 'p', start: 'repere:serveur' }] });
  assert.ok(Math.abs(min.elements.s.p.debut - (v.debut + v.mots[au].t0)) < 1e-9);
  // Repère inconnu : repere-introuvable, avec les repères proches.
  const faux = calculerMinutage(a.donnees.scenes, { s: [{ cle: 'p', start: 'repere:serveu' }] });
  assert.equal(faux.erreurs[0].regle, 'repere-introuvable');
  assert.match(faux.erreurs[0].message, /serveur/);
});

test('voix : {HACCP|hache a cé cé pé} affiche HACCP en sous-titre et le fait lire épelé', async () => {
  const texte = 'Le {HACCP|hache a cé cé pé} protège [pause 0.6] les clients.';
  const lu = A.lireTexteDit(texte);
  assert.equal(lu.affiche, 'Le HACCP protège les clients.');
  assert.equal(lu.dit, 'Le hache a cé cé pé protège les clients.');
  assert.deepEqual(lu.pauses, [{ apres: 7, duree: 0.6 }]);
  const dir = miniProjet({ scenes: [{ id: 's', duree: 4, html: '<p data-texte="t" data-start="0.2"></p>', textes: { t: 'Hygiène' }, voix: { texte } }], deroule: { sousTitres: { mode: 'ligne' } } });
  const lus = [];
  const { voixProvisoire } = require('../scripts/voix.js');
  const r = await voixProvisoire({ dossier: dir, outil: null, synthetiser: (t, sortie) => { lus.push(t); fs.writeFileSync(sortie, wavSinus({ secondes: 2.4 })); return { ok: true }; } });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(lus, ['Le hache a cé cé pé protège les clients.']);
  const a = assembler({ dossier: dir, ecrire: false });
  const mots = a.donnees.sousTitres.cartons.flatMap((c) => c.lignes.flat().map((m) => m.w));
  assert.deepEqual(mots, ['Le', 'HACCP', 'protège', 'les', 'clients.']);
  assert.ok(!/[{}[\]|#]/.test(mots.join(' ')), 'aucun balisage dans les sous-titres');
});

test('voix : une ancre mot:HACCP trouve la forme affichée', () => {
  const lu = A.lireTexteDit('Le {HACCP|hache a cé cé pé} protège.');
  const dits = A.decouperMots(lu.dit).map((m, k) => ({ w: m.w, t0: 0.2 * k, t1: 0.2 * k + 0.15 }));
  const mots = A.motsAffiches(lu, dits);
  assert.deepEqual(mots.map((m) => m.w), ['Le', 'HACCP', 'protège.']);
  assert.deepEqual([mots[1].t0, mots[1].t1, mots[1].dit], [0.2, 1.15, 'hache a cé cé pé']);
  const min = calculerMinutage([{ id: 's', duree: 4, voix: { debut: 0.3, duree: 2, mots } }], { s: [{ cle: 'a', start: 'mot:HACCP' }, { cle: 'b', start: 'mot:hache' }, { cle: 'c', start: 'mot:HACCP:fin' }] });
  assert.deepEqual(min.erreurs, []);
  assert.ok(Math.abs(min.elements.s.a.debut - 0.5) < 1e-9 && Math.abs(min.elements.s.b.debut - 0.5) < 1e-9 && Math.abs(min.elements.s.c.debut - 1.45) < 1e-9);
});

test('voix : crochets non fermés → erreur du déroulé en français', () => {
  assert.deepEqual(validerDeroule(avecVoix('Le client [#serveur] attend [pause 0.4].')), []);
  // Un autre texte entre crochets reste du texte (un projet existant ne casse pas).
  assert.deepEqual(validerDeroule(avecVoix('Il rit [rires] et repart.')), []);
  for (const [texte, motif] of [['Le client [#serveur attend.', /le crochet « \[#serveur[^]*n'est pas fermé/], ['Le {HACCP protège.', /l'accolade « \{HACCP[^]*n'est pas fermée/],
    ['Le {HACCP} protège.', /séparées par « \| »/], ['[#a] un [#a] deux', /posé deux fois/], ['Un [pause 9] silence.', /de 0 à 5 secondes/], ['Fin }.', /ferme sans avoir été ouverte/]]) {
    const err = validerDeroule(avecVoix(texte)).join(' ');
    assert.match(err, /La scène « s » : « voix\.texte » : /, texte);
    assert.match(err, motif, texte);
  }
});

test('voix : la prononciation du glossaire s\'applique à la voix provisoire', async () => {
  const dir = miniProjet({ scenes: [{ id: 's', duree: 4, html: '<p data-texte="t" data-start="0.2"></p>', textes: { t: 'Hygiène' }, voix: { texte: 'Le HACCP protège, mais {HACCP|le plan} reste écrit.' } }], glossaire: GLOSSAIRE });
  const lus = [];
  const { voixProvisoire } = require('../scripts/voix.js');
  await voixProvisoire({ dossier: dir, outil: null, synthetiser: (t, sortie) => { lus.push(t); fs.writeFileSync(sortie, wavSinus({ secondes: 3 })); return { ok: true }; } });
  // Le glossaire partout, sauf dans le {…|…} explicite.
  assert.deepEqual(lus, ['Le hache a cé cé pé protège, mais le plan reste écrit.']);
  const { lireVoixScene } = require('../scripts/lib/voix.js');
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  const v = lireVoixScene(dir, d, d.scenes[0]);
  assert.deepEqual(v.mots.map((m) => m.w), ['Le', 'HACCP', 'protège,', 'mais', 'HACCP', 'reste', 'écrit.']);
  assert.equal(v.mots[1].dit, 'hache a cé cé pé');
});

test('voix : voix mots donne les temps de la prise courante', async () => {
  const dir = miniProjet({ scenes: [{ id: 's', duree: 4, html: '<p data-texte="t" data-start="0.2"></p>', textes: { t: 'Froid' } }] });
  await poserVoix(dir, 's', wavSinus({ secondes: 2 }), 'La chaîne du [#froid] froid.');
  const { motsDeScene } = require('../scripts/voix.js');
  const r = motsDeScene({ dossier: dir, scene: 's' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.mots.length, 4);
  assert.equal(r.mots[0].t0, Math.round(DEBUT_VOIX * 100) / 100);
  assert.match(r.ligne, /^0,30 La · \d,\d\d chaîne · \d,\d\d du · repère froid \d,\d\d · \d,\d\d froid$/);
  assert.equal(r.reperes.froid, r.mots[3].t0);
  assert.match(motsDeScene({ dossier: dir, scene: 'x' }).message, /Scène inconnue/);
});

// --- 5.13 Alignement renforcé ------------------------------------------------------------------------------------------

test('alignement : « 1 250 » s\'aligne sur « mille deux cent cinquante »', () => {
  for (const ecrit of ['1 250', '1 250', '1 250']) {
    const r = A.aligner(`Il y a ${ecrit} clients`, [e('il', 0, 0.1), e('y', 0.1, 0.2), e('a', 0.2, 0.3), e('mille', 0.4, 0.6), e('deux', 0.6, 0.7), e('cent', 0.7, 0.8), e('cinquante', 0.8, 1), e('clients', 1.1, 1.5)]);
    const nombre = r.mots.filter((m) => /\d/.test(m.w));
    assert.equal(nombre[0].t0, 0.4, ecrit);
    assert.equal(nombre[nombre.length - 1].t1, 1, ecrit);
    assert.equal(r.mots[r.mots.length - 1].t0, 1.1, ecrit);
  }
  assert.equal(A.nombreEnLettres(1250), 'milledeuxcentcinquante');
  assert.deepEqual([200, 280, 80000, 200000, 2000000, 200000000, 1e9].map(A.nombreEnLettres), ['deuxcents', 'deuxcentquatrevingts', 'quatrevingtmille', 'deuxcentmille', 'deuxmillions', 'deuxcentsmillions', 'unmilliard']);
});

test('alignement : « 2026 », « 3,5 », « 12 % », « 1er » s\'alignent sur leur forme dite', () => {
  const r = A.aligner('En 2026, 3,5 litres, 12 % de plus le 1er mai', [e('en', 0, 0.1), e('deux', 0.2, 0.3), e('mille', 0.3, 0.4), e('vingt-six', 0.4, 0.6),
    e('trois', 0.7, 0.8), e('virgule', 0.8, 0.9), e('cinq', 0.9, 1), e('litres', 1, 1.2), e('douze', 1.3, 1.4), e('pour', 1.4, 1.5), e('cent', 1.5, 1.6),
    e('de', 1.6, 1.7), e('plus', 1.7, 1.8), e('le', 1.8, 1.9), e('premier', 1.9, 2.2), e('mai', 2.2, 2.5)]);
  const de = (w) => r.mots.find((m) => m.w.startsWith(w));
  assert.deepEqual([de('2026').t0, de('2026').t1, de('3,5').t0, de('3,5').t1, de('12').t0, de('12').t1, de('1er').t0, de('1er').t1], [0.2, 0.6, 0.7, 1, 1.3, 1.6, 1.9, 2.2]);
  assert.equal(r.reconnus, r.mots.length);
  assert.deepEqual(['2e', '5e', '9e', '21e', '1re', '12 €', '1 €'].map((w) => A.formesDites(w)[0]), ['deuxieme', 'cinquieme', 'neuvieme', 'vingtetunieme', 'premiere', 'douzeeuros', 'uneuro']);
});

test('alignement : « SNCF » s\'aligne sur quatre lettres entendues', () => {
  const r = A.aligner('La SNCF arrive', [e('la', 0, 0.1), e('s', 0.2, 0.3), e('n', 0.3, 0.4), e('c', 0.4, 0.5), e('f', 0.5, 0.6), e('arrive', 0.7, 1)]);
  assert.deepEqual(r.mots[1], { w: 'SNCF', t0: 0.2, t1: 0.6 });
  assert.equal(r.mots[2].t0, 0.7);
  assert.equal(r.reconnus, 3);
  // Plusieurs mots écrits pour un mot entendu, et tolérance relative de 0,34.
  const inverse = A.aligner('un porte monnaie neuf', [e('un', 0, 0.1), e('portemonnaie', 0.2, 0.8), e('neuf', 0.9, 1.1)]);
  assert.deepEqual([inverse.mots[1].t0, inverse.mots[2].t1, inverse.reconnus], [0.2, 0.8, 4]);
  assert.ok(A.memeMot('commande', 'comande') && A.memeMot('serveurs', 'serveur') && !A.memeMot('les', 'des') && !A.memeMot('2025', '2026'));
});

// --- 5.14 Allure ------------------------------------------------------------------------------------------------------

test('allure : 1,25 raccourcit d\'un cinquième une scène sans voix et les marges de voix', () => {
  const scenes = [{ id: 'a', duree: 5 }, { id: 'b', duree: 2, transition: 'fondu', voix: { duree: 3 } }];
  const lent = calculerMinutage(scenes, {});
  const vif = calculerMinutage(scenes, {}, { allure: 1.25 });
  assert.ok(Math.abs((vif.scenes[0].fin - vif.scenes[0].debut) - 4) < 1e-9, 'scène sans voix : 5 s ÷ 1,25');
  assert.ok(Math.abs(vif.scenes[1].entree - 0.4) < 1e-9, 'chevauchement 0,5 s ÷ 1,25');
  const marge = (m) => m.scenes[1].fin - m.scenes[1].debut;
  assert.ok(Math.abs(marge(lent) - (DEBUT_VOIX + 3 + MARGE_VOIX)) < 1e-9);
  assert.ok(Math.abs(marge(vif) - ((DEBUT_VOIX + MARGE_VOIX) / 1.25 + 3)) < 1e-9, 'début et marge de voix ÷ 1,25, prise entière');
  assert.equal(vif.scenes[0].rythme, 1.25);
});

test('allure : une ancre mot: reste sur son mot à toute allure', () => {
  const voix = { debut: 0.3, duree: 2, mots: [e('le', 0.1, 0.3), e('froid', 1.2, 1.6)], reperes: { froid: 1.2 } };
  for (const allure of [0.7, 1, 1.25, 1.6]) {
    const m = calculerMinutage([{ id: 's', duree: 4, voix, rythme: 1.1 }], { s: [{ cle: 'a', start: 'mot:froid' }, { cle: 'b', start: 'repere:froid' }, { cle: 'c', start: 'mot:froid:fin' }] }, { allure });
    assert.ok(Math.abs(m.elements.s.a.debut - 1.5) < 1e-9 && Math.abs(m.elements.s.b.debut - 1.5) < 1e-9 && Math.abs(m.elements.s.c.debut - 1.9) < 1e-9, `allure ${allure}`);
  }
});

test('allure : une prise enregistrée n\'est pas accélérée', async () => {
  const dir = miniProjet({ scenes: [{ id: 's', duree: 2, html: '<p data-texte="t" data-start="0.2"></p>', textes: { t: 'Froid' } }], deroule: { allure: 1.25 } });
  await poserVoix(dir, 's', wavSinus({ secondes: 3 }), 'La chaîne du froid.');
  const a = assembler({ dossier: dir, ecrire: false });
  const v = a.donnees.scenes[0].voix;
  assert.equal(a.donnees.allure, 1.25);
  assert.equal(v.duree, 3, 'la prise garde sa durée');
  assert.ok(Math.abs(v.debut - DEBUT_VOIX / 1.25) < 1e-9);
  const m = calculerMinutage(a.donnees.scenes, {}, { allure: 1.25 });
  assert.ok(Math.abs(m.scenes[0].fin - (v.debut + 3 + MARGE_VOIX / 1.25)) < 1e-6, 'la scène dure la prise entière');
  assert.doesNotMatch(a.html, /playbackRate/);
});

test('allure : hors de 0,7 à 1,6 → erreur du déroulé en français ; musique générée à tempo × √allure, musique importée signalée', () => {
  for (const x of [0.5, 2, '1.2']) assert.match(validerDeroule({ ...BASE, allure: x }).join(' '), /« allure » doit être un nombre de 0,7 \(plus posé\) à 1,6 \(plus rythmé\)/);
  assert.deepEqual(validerDeroule({ ...BASE, allure: 1.2 }), []);
  const { tempoMusique } = require('../scripts/lib/deroule.js');
  assert.equal(tempoMusique({ musique: { generee: 'calme', tempo: 100 }, allure: 1.21 }), 110);
  assert.equal(tempoMusique({ musique: { generee: 'calme', tempo: 100 } }), 100);
  const dir = miniProjet({ scenes: [{ id: 's', duree: 3, html: '<p data-texte="t" data-start="0.2"></p>', textes: { t: 'Froid' } }], deroule: { allure: 1.2, musique: { fichier: 'assets/m.wav' } }, assets: { 'm.wav': wavSinus({ secondes: 1 }) } });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.ok(a.erreurs.some((x) => x.regle === 'allure-musique' && x.gravite === 'alerte' && /garde son tempo/.test(x.message)), JSON.stringify(a.erreurs));
});

// --- 5.15 Bruitages automatiques (sans navigateur) ------------------------------------------------------------------------

test('bruitages auto : déroulé (true, minimal, false), crissement au catalogue, types d\'entrée pour les styles, accents de la musique', () => {
  for (const auto of [true, false, 'minimal']) assert.deepEqual(validerDeroule({ ...BASE, bruitages: { auto } }), []);
  assert.match(validerDeroule({ ...BASE, bruitages: { auto: 'beaucoup' } }).join(' '), /« bruitages\.auto » doit valoir true/);
  assert.match(validerDeroule({ ...BASE, musique: { generee: 'calme', accents: 'oui' } }).join(' '), /« musique\.accents »/);
  const C = require('../moteur/synthe/catalogue.js');
  assert.ok(C.BRUITAGES.includes('crissement'));
  const { TYPES_ENTREE, GENRES_ENTREE } = require('../scripts/lib/contrat.js');
  for (const t of Object.values(GENRES_ENTREE)) assert.ok(TYPES_ENTREE.includes(t), t);
  assert.deepEqual([GENRES_ENTREE.fleche, GENRES_ENTREE.carte, GENRES_ENTREE.point, GENRES_ENTREE.compteur], ['trace', 'forme', 'point', 'chiffre']);
  const GM = require('../scripts/lib/groupes-moteur.js');
  assert.ok(GM.groupesDuDeroule({ bruitages: { auto: true } }, []).includes('synthe'));
  assert.ok(!GM.groupesDuDeroule({ bruitages: { auto: false } }, []).includes('synthe'));
  const SA = require('../moteur/synthe/ambiances.js');
  const scenes = [{ debut: 0, fin: 4 }, { debut: 4, fin: 8 }, { debut: 8, fin: 12 }];
  const sans = SA.generer({ ambiance: 'calme', duree: 12, scenes });
  const avec = SA.generer({ ambiance: 'calme', duree: 12, scenes, accents: true });
  const cloches = avec.pistes.filter((p) => p.instrument === 'cloche');
  assert.deepEqual(cloches.map((p) => p.origine), [0, 4, 8]);
  assert.deepEqual(avec.pistes.filter((p) => p.instrument !== 'cloche'), sans.pistes, 'le reste de la musique ne change pas');
  assert.deepEqual(SA.notesGamme('la'), [81, 83, 85, 86, 88, 90, 92]);
  assert.deepEqual(SA.notesGamme('lam').slice(0, 3), [81, 83, 84]);
});

test('bruitages auto : aucun son automatique ne déclenche son-sous-voix', async () => {
  const html = '<div class="carte" style="background: #fff; padding: 2cqh" data-start="0.5" data-texte="t"></div><ul><li data-texte="a" data-start="0.8"></li><li data-texte="b" data-start="1"></li></ul>';
  const dir = miniProjet({ scenes: [{ id: 's', duree: 4, html, textes: { t: 'Froid', a: 'Un', b: 'Deux' } }], deroule: { bruitages: { auto: true } } });
  await poserVoix(dir, 's', wavSinus({ secondes: 2.5 }), 'La chaîne du froid protège les clients.');
  const r = controler({ dossier: dir, ecrire: false });
  assert.ok(!r.problemes.some((p) => p.regle === 'son-sous-voix'), JSON.stringify(r.problemes.map((p) => p.regle)));
  // Un son fort posé à la main pendant un mot, lui, est signalé.
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">\n${html}<p data-texte="t" data-start="0.9" data-son="impact"></p>\n</section>`);
  assert.ok(controler({ dossier: dir, ecrire: false }).problemes.some((p) => p.regle === 'son-sous-voix'));
});
