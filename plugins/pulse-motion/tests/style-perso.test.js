'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../scripts/style-perso.js');
const S = require('../scripts/styles.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
async function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  try { return await fn(process.env.PULSE_MOTION_DOSSIER); } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
}

test('nouveau : copie d\'un style livré, nom repris partout, guide à compléter, proposé comme style personnel', () => avecPersonnel(async (perso) => {
  const r = P.nouveauStyle({ nom: 'papercraft', depuis: 'energique' });
  assert.deepEqual(r, { ok: true, nom: 'papercraft', dossier: path.join(perso, 'styles', 'papercraft'), depuis: 'energique' });
  for (const f of ['catalogue.json', 'identite.json']) assert.equal(JSON.parse(fs.readFileSync(path.join(r.dossier, f), 'utf8')).style, 'papercraft');
  const guide = fs.readFileSync(path.join(r.dossier, 'guide.md'), 'utf8');
  assert.match(guide, /^# Style « papercraft »\n/);
  assert.match(guide, /Repris du style « energique »/);
  assert.equal(S.verifierStyle(r.dossier).ok, true);
  assert.deepEqual(S.listerStyles().filter((f) => f.personnel).map((f) => f.style), ['papercraft']);
  const second = P.nouveauStyle({ nom: 'papier-2', depuis: 'papercraft' });
  assert.equal(second.ok, true);
  assert.match(fs.readFileSync(path.join(second.dossier, 'guide.md'), 'utf8'), /^# Style « papier-2 »\n[\s\S]*Repris du style « papercraft »/);
}));

test('nouveau : refus du nom d\'un style livré, d\'un style existant, d\'un nom dangereux, d\'une base inconnue', () => avecPersonnel(async () => {
  assert.match(P.nouveauStyle({ nom: 'minimal' }).message, /nom d'un style livré/);
  P.nouveauStyle({ nom: 'papercraft' });
  assert.match(P.nouveauStyle({ nom: 'papercraft' }).message, /existe déjà/);
  assert.match(P.nouveauStyle({ nom: '../x' }).message, /lettres minuscules/);
  assert.match(P.nouveauStyle({ nom: 'neuf', depuis: 'neon' }).message, /Style « neon » introuvable/);
}));

test('nouveau : dossier personnel impossible à écrire, message avec la variable, rien de partiel', () => avecPersonnel(async (perso) => {
  fs.writeFileSync(path.join(perso, 'styles'), 'fichier');
  const r = P.nouveauStyle({ nom: 'papercraft' });
  assert.equal(r.ok, false);
  assert.match(r.message, /PULSE_MOTION_DOSSIER/);
}));

test('verifier sans navigateur : contrat et contrôles faits, rendu signalé comme non vérifié', () => avecPersonnel(async (perso) => {
  P.nouveauStyle({ nom: 'papercraft' });
  const ok = await P.verifierStylePerso({ nom: 'papercraft', navigateur: null });
  assert.deepEqual([ok.ok, ok.erreurs, ok.controle, ok.renduVerifie], [true, [], [], false]);
  assert.match(ok.message, /Chrome ou Edge introuvable/);
  const titre = path.join(perso, 'styles', 'papercraft', 'scenes', 'titre.html');
  fs.writeFileSync(titre, fs.readFileSync(titre, 'utf8').replace(' data-texte="sous"', ''));
  const ko = await P.verifierStylePerso({ nom: 'papercraft', navigateur: null });
  assert.equal(ko.ok, false);
  assert.match(ko.erreurs.join('\n'), /scenes\/titre\.html : data-texte/);
  assert.match((await P.verifierStylePerso({ nom: 'rien', navigateur: null })).message, /Style « rien » introuvable/);
}));

test('planche : scènes témoins rendues dans le dossier des essais ; type inconnu refusé sans export', () => avecPersonnel(async (perso) => {
  P.nouveauStyle({ nom: 'papercraft' });
  const vus = [];
  const exporter = async ({ dossier, planche }) => {
    vus.push(JSON.parse(fs.readFileSync(path.join(dossier, 'deroule.json'), 'utf8')));
    fs.mkdirSync(path.join(dossier, 'sortie', 'planche'), { recursive: true });
    for (const id of planche) for (const k of [1, 2, 3]) fs.writeFileSync(path.join(dossier, 'sortie', 'planche', `${id}-${k}.png`), PNG);
    fs.writeFileSync(path.join(dossier, 'sortie', 'planche', 'planche.html'), '<html></html>');
    return { ok: true };
  };
  const r = await P.plancheStyle({ nom: 'papercraft', ratio: '9:16', exporter });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, path.join(perso, 'essais', 'papercraft', 'planche.html'));
  assert.equal(r.images.length, 6);
  assert.deepEqual(vus[0].scenes.map((s) => s.id), ['titre', 'liste']);
  assert.equal(vus[0].format.ratio, '9:16');
  const inconnu = await P.plancheStyle({ nom: 'papercraft', scenes: ['titre', 'carte'], exporter });
  assert.match(inconnu.message, /Type de scène inconnu : carte/);
  assert.equal(vus.length, 1);
}));

test('ligne de commande : style nouveau, guide d\'un style personnel par « reference styles/<nom> »', () => avecPersonnel(async (perso) => {
  const pm = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), ...a], { encoding: 'utf8', env: { ...process.env, PULSE_MOTION_DOSSIER: perso } });
  const r = pm('style', 'nouveau', 'papercraft', '--depuis', 'minimal');
  assert.equal(r.status, 0, r.stderr);
  assert.match(pm('reference', 'styles/papercraft').stdout, /^# Style « papercraft »/);
  assert.equal(pm('style', 'inconnu').status, 2);
}));

test('proposé seulement après une vérification réussie, et plus après une modification du style', () => avecPersonnel(async (perso) => {
  P.nouveauStyle({ nom: 'papercraft' });
  const fiche = () => S.listerStyles().find((f) => f.style === 'papercraft');
  assert.equal(fiche().verifie, false, 'pas encore vérifié');
  assert.ok(!S.recommander('formation').some((f) => f.style === 'papercraft'));
  assert.equal((await P.verifierStylePerso({ nom: 'papercraft', navigateur: null })).ok, true);
  assert.equal(fiche().verifie, true);
  fs.appendFileSync(path.join(perso, 'styles', 'papercraft', 'style.css'), '\n.titre { letter-spacing: 0; }\n');
  assert.equal(fiche().verifie, false, 'modifié depuis la vérification');
}));

test('navigateur qui échoue, catalogue illisible : réponse claire, jamais d\'exception', () => avecPersonnel(async (perso) => {
  P.nouveauStyle({ nom: 'papercraft' });
  const r = await P.verifierStylePerso({ nom: 'papercraft', navigateur: path.join(perso, 'absent.exe') });
  assert.equal(r.ok, false);
  assert.match(r.rendu.join('\n'), /navigateur n'a pas pu afficher la page/);
  fs.writeFileSync(path.join(perso, 'styles', 'papercraft', 'catalogue.json'), '{ cassé');
  const p = await P.plancheStyle({ nom: 'papercraft', exporter: async () => { throw new Error('ne doit pas être appelé'); } });
  assert.equal(p.ok, false);
  assert.match(p.message, /catalogue\.json/);
}));

test('nouveau en chaîne : une seule mention « Repris du style », celle du dernier modèle', () => avecPersonnel(async () => {
  P.nouveauStyle({ nom: 'papercraft', depuis: 'energique' });
  const r = P.nouveauStyle({ nom: 'papier-2', depuis: 'papercraft' });
  const guide = fs.readFileSync(path.join(r.dossier, 'guide.md'), 'utf8');
  assert.equal((guide.match(/Repris du style/g) || []).length, 1, guide);
  assert.match(guide, /Repris du style « papercraft »/);
}));

test('planche : format et ton inconnus refusés avant tout export', () => avecPersonnel(async () => {
  P.nouveauStyle({ nom: 'papercraft' });
  const exporter = async () => { throw new Error('ne doit pas être appelé'); };
  assert.match((await P.plancheStyle({ nom: 'papercraft', ratio: '4:3', exporter })).message, /Format « 4:3 » inconnu : 16:9, 1:1 ou 9:16/);
  assert.match((await P.plancheStyle({ nom: 'papercraft', ton: 'gris', exporter })).message, /Ton « gris » inconnu : clair ou sombre/);
}));

test('planche : dossier des essais impossible à écrire, message qui nomme PULSE_MOTION_DOSSIER', () => avecPersonnel(async (perso) => {
  const fichier = path.join(perso, 'pas-un-dossier');
  fs.writeFileSync(fichier, 'x');
  process.env.PULSE_MOTION_DOSSIER = fichier;
  const exporter = async ({ dossier, planche }) => {
    fs.mkdirSync(path.join(dossier, 'sortie', 'planche'), { recursive: true });
    for (const id of planche) fs.writeFileSync(path.join(dossier, 'sortie', 'planche', `${id}-1.png`), PNG);
    return { ok: true };
  };
  const r = await P.plancheStyle({ nom: 'editorial', exporter });
  assert.equal(r.ok, false);
  assert.match(r.message, /PULSE_MOTION_DOSSIER/);
}));

test('planche : de vraies phrases par défaut, le texte le plus long sur demande', () => avecPersonnel(async () => {
  const { texteDeLongueur } = require('../scripts/lib/projet-essai.js');
  const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'styles', 'editorial', 'catalogue.json'), 'utf8'));
  const vus = [];
  const exporter = async ({ dossier, planche }) => {
    vus.push(JSON.parse(fs.readFileSync(path.join(dossier, 'deroule.json'), 'utf8')));
    fs.mkdirSync(path.join(dossier, 'sortie', 'planche'), { recursive: true });
    for (const id of planche) fs.writeFileSync(path.join(dossier, 'sortie', 'planche', `${id}-1.png`), PNG);
    return { ok: true };
  };
  const types = catalogue.scenes.map((s) => s.nom);
  assert.equal((await P.plancheStyle({ nom: 'editorial', scenes: types, exporter })).ok, true);
  assert.equal((await P.plancheStyle({ nom: 'editorial', scenes: ['titre'], textes: 'maximum', exporter })).ok, true);
  for (const s of vus[0].scenes) {
    const maxi = catalogue.scenes.find((c) => c.nom === s.id).textes;
    for (const [cle, texte] of Object.entries(s.textes)) {
      assert.ok(texte.length > 0 && texte.length <= maxi[cle], `${s.id}.${cle} : « ${texte} »`);
      if (maxi[cle] > 3) assert.notEqual(texte, texteDeLongueur(maxi[cle]), `${s.id}.${cle} : phrase d'exemple attendue`);
    }
  }
  assert.equal(vus[0].scenes[0].textes.titre, 'Garder la chaîne du froid');
  assert.equal(vus[1].scenes[0].textes.titre, texteDeLongueur(catalogue.scenes[0].textes.titre, 1));
  assert.match((await P.plancheStyle({ nom: 'editorial', textes: 'court', exporter })).message, /Textes « court » inconnus : exemple ou maximum/);
}));

test('ligne de commande : « styles --genre » sans genre, message clair', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'styles.js'), '--genre'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Indiquez un genre après --genre : /);
});
