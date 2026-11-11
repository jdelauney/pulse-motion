'use strict';
/* Spec S7 (explication narrée), 5.17 : vidéo témoin « Du devis au paiement : le trajet d'une facture » et modèle de vidéo
 * « explication » (format du chantier C) ; décision 7.8 : le modèle allume la caméra et les bruitages automatiques. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { lireModele, validerModele, trouverModele } = require('../scripts/modeles.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const TEMOIN = path.join(__dirname, '..', 'exemples', 'explication-facture');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };

function copie() {
  const dir = dossierTemporaire('pm-temoin-explication-');
  fs.cpSync(TEMOIN, dir, { recursive: true });
  return dir;
}

test('témoin : fabriqué par une vraie séance creer, contrôle sans erreur', () => {
  const recit = JSON.parse(fs.readFileSync(path.join(TEMOIN, 'exemple.json'), 'utf8'));
  const m = lireModele('explication');
  assert.equal(recit.modele, 'explication');
  assert.ok(m.phrases.includes(recit.phrase));
  const d = JSON.parse(fs.readFileSync(path.join(TEMOIN, 'deroule.json'), 'utf8'));
  assert.equal(d.scenes.length, 6);
  assert.equal(d.style, 'clair-pedagogique');
  const duree = d.scenes.reduce((t, s) => t + s.duree, 0);
  assert.ok(duree >= 60 && duree <= 90, `${duree} s`);
  // Ce que la spec demande au témoin : moyeu, flèches, une annotation, un graphique en barres, une formule de tableur,
  // caméra et bruitages automatiques.
  assert.equal(d.camera, 'auto');
  assert.deepEqual(d.bruitages, { auto: true });
  assert.ok(d.scenes.some((s) => s.type === 'moyeu'));
  assert.ok(d.scenes.some((s) => s.graphiques && Object.values(s.graphiques).some((g) => g.type === 'barres')));
  assert.ok(d.scenes.some((s) => s.code && Object.values(s.code).some((c) => c.langage === 'tableur')));
  const html = d.scenes.map((s) => fs.readFileSync(path.join(TEMOIN, s.fichier), 'utf8')).join('\n');
  assert.match(html, /data-fleche=/);
  assert.match(html, /data-annoter=/);
  assert.ok(d.scenes.every((s) => /data-camera="auto"/.test(fs.readFileSync(path.join(TEMOIN, s.fichier), 'utf8'))), 'chaque scène porte la caméra automatique');
  const dir = copie();
  const a = assembler({ dossier: dir });
  assert.deepEqual(a.erreurs, []);
  assert.deepEqual(controler({ dossier: dir }).problemes, []);
});

test('témoin : contrôle complet de la vidéo rendue, rien à signaler', { ...SANS, timeout: 300000 }, async () => {
  const { controlerComplet } = require('../scripts/controler.js');
  const r = await controlerComplet({ dossier: copie(), corriger: false });
  assert.equal(r.renduVerifie, true);
  assert.deepEqual(r.problemes, []);
});

test('témoin : deux exports donnent les mêmes images, à l'octet près (outil de preuve de S2)', { ...SANS, timeout: 300000 }, async () => {
  const D = require('../scripts/lib/determinisme.js');
  const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
  const dir = copie();
  const a = assembler({ dossier: dir });
  assert.equal(a.ok, true);
  const concernees = D.concernees(a);
  assert.equal(concernees.length, 6, 'chaque scène a un calque ou une caméra automatique');
  assert.ok(concernees.every((c) => c.raisons.includes('camera')), JSON.stringify(concernees));
  const instants = D.instantsPreuve(a.minutage, concernees.map((c) => c.id), { n: 12 });
  // Déterminisme exact (octets identiques, aucun seuil de PSNR) : la capture attend deux images après un saut sous une caméra
  // (scripts/lib/capture-fidele.js) ; avant 0.58.0, une image de la scène finale différait d'un rien selon l'ordre des captures.
  const r = await D.prouver({ fichierHtml: a.fichier, instants, ouvrir: ouvrirCapture, navigateur, psnrMin: Infinity });
  assert.deepEqual(r.problemes, []);
  assert.deepEqual([...r.nonFaites], []);
});

test('témoin : poids de la page et temps d\'export mesurés avant et après (D8)', () => {
  const dir = copie();
  const debut = Date.now();
  const a = assembler({ dossier: dir });
  const ms = Date.now() - debut;
  const octets = Buffer.byteLength(a.html);
  // Mesures consignées dans le plan (docs/superpowers/plans/2026-11-11-s7-j5-j6.md) ; bornes larges ici.
  assert.ok(octets < 1.5 * 1024 * 1024, `${octets} o`);
  assert.ok(ms < 10000, `${ms} ms`);
  // Moteur à la carte : le calque, le relevé et la caméra automatique sont embarqués ; aucun personnage, aucun film.
  assert.match(a.html, /M\.cameraAuto/);
  assert.doesNotMatch(a.html, /pm-son-voix-/);
});

test('modèle explication : validé, réglages allumés d\'office, retrouvé par son sujet', () => {
  const m = lireModele('explication');
  assert.deepEqual(validerModele(m), []);
  assert.deepEqual(m.reglages, { camera: 'auto', bruitages: { auto: true } });
  assert.deepEqual(m.scenes.map((s) => s.type), ['titre', 'moyeu', 'schema', 'etape', 'chiffre', 'conclusion']);
  assert.equal(m.exemple, 'explication-facture');
  assert.equal(trouverModele('une vidéo explicative sur le circuit du courrier').id, 'explication');
  assert.equal(trouverModele('explique comment fonctionne la paie').id, 'explication');
  assert.equal(trouverModele('une formation sur les gestes barrières').id, 'formation-courte');
  assert.ok(validerModele({ ...m, reglages: { camera: 'mobile' } }).some((e) => /reglages\.camera/.test(e)));
  assert.ok(validerModele({ ...m, reglages: { allure: 1.2 } }).some((e) => /reglages\.allure/.test(e)));
  assert.ok(validerModele({ ...m, reglages: { bruitages: { auto: 'fort' } } }).some((e) => /reglages\.bruitages/.test(e)));
});

test('compétences : creer dit que les réglages du modèle vont au déroulé ; aucune commande dans les phrases du wiki ajoutées', () => {
  const creer = fs.readFileSync(path.join(__dirname, '..', 'skills', 'creer', 'SKILL.md'), 'utf8');
  assert.match(creer, /ses `reglages` vont au déroulé/);
  assert.match(creer, /« Voix de synthèse »/);
  assert.match(creer, /Voix de synthèse : `pulse-motion reference audio\/synthese`/);
  const concepts = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'concepts.html'), 'utf8');
  const section = concepts.slice(concepts.indexOf('<section id="explicative">'), concepts.indexOf('</section>', concepts.indexOf('<section id="explicative">')));
  assert.ok(section.length > 200);
  assert.doesNotMatch(section, /pulse-motion [a-z]/);
});
