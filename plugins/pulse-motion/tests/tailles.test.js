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
