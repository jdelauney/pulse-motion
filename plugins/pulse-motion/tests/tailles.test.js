'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { assembler } = require('../scripts/assembler.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

test('moteur : la taille du texte ajusté est la taille calculée × facteur, et suit le format', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].ajustements = { titre: { taille: 0.8 } }; });
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const r = await mesurerPage({ html, navigateur, delai: 30000, script: `
    var h = document.querySelector('[data-texte="titre"]'), p = document.querySelector('[data-texte="sous"]');
    var cadre = document.getElementById('pm-scene').getBoundingClientRect();
    var avant = parseFloat(getComputedStyle(h).fontSize) / cadre.height;
    var scene = document.getElementById('pm-scene'); scene.style.width = (cadre.width / 2) + 'px'; scene.style.height = (cadre.height / 2) + 'px';
    M.rendre(1);
    var apres = parseFloat(getComputedStyle(h).fontSize) / scene.getBoundingClientRect().height;
    return { avant: avant, apres: apres, sous: p.getAttribute('data-taille') };` });
  assert.ok(r.resultat, r.erreur);
  // Style d'essai : h1 à 8 cqh ; × 0,8 = 6,4 cqh, et toujours 6,4 cqh après changement de taille de l'image.
  assert.ok(Math.abs(r.resultat.avant - 0.064) < 0.002, String(r.resultat.avant));
  assert.ok(Math.abs(r.resultat.apres - 0.064) < 0.002, String(r.resultat.apres));
  assert.equal(r.resultat.sous, null);
});

test('revue : taille écrite dans la scène gardée comme base ; texte à taille animée jamais ajusté ; taille suivie sans rendu (redimensionnement)', sans, async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8')
    .replace('<h1 id="titre"', '<h1 id="titre" style="font-size:12cqh"')
    .replace('<p data-texte="sous"', '<p data-texte="sous" data-tween="font-size 4cqh→4cqh" style="height:1cqh; overflow:hidden"'));
  modifierDeroule(dir, (d) => { d.scenes[0].ajustements = { titre: { taille: 0.8 } }; });
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const r = await mesurerPage({ html, navigateur, delai: 30000, script: `
    var h = document.querySelector('[data-texte="titre"]');
    var scene = document.getElementById('pm-scene');
    var cadre = scene.getBoundingClientRect();
    var titre = parseFloat(getComputedStyle(h).fontSize) / cadre.height;
    var essais = M.essayerTailles({ minimumCqh: 3.5 });
    var apresEssai = parseFloat(getComputedStyle(h).fontSize) / cadre.height;
    scene.style.width = (cadre.width / 2) + 'px'; scene.style.height = (cadre.height / 2) + 'px';
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    var redim = parseFloat(getComputedStyle(h).fontSize) / scene.getBoundingClientRect().height;
    return { titre: titre, apresEssai: apresEssai, redim: redim, sous: essais.filter(function (e) { return e.cle === 'sous'; }).length };` });
  assert.ok(r.resultat, r.erreur);
  assert.ok(Math.abs(r.resultat.titre - 0.096) < 0.002, 'base = 12 cqh de la scène : ' + r.resultat.titre);
  assert.ok(Math.abs(r.resultat.apresEssai - 0.096) < 0.002, 'essai sans effet durable : ' + r.resultat.apresEssai);
  assert.ok(Math.abs(r.resultat.redim - 0.096) < 0.002, 'suivi sans rendu : ' + r.resultat.redim);
  assert.equal(r.resultat.sous, 0, 'taille animée : jamais ajustée');
});
