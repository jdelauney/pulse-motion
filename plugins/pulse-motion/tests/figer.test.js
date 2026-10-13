'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { trouverNavigateur } = require('../scripts/lib/navigateur.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();

test('masque d\'un texte : forme des lettres, rapport d\'aspect, élément seul', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'HI'; });
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <style>@scope {
    #mot { position: absolute; left: 30cqh; top: 40cqh; margin: 0; font: 900 30cqh/1 sans-serif; transform: rotate(20deg); }
    #fond { position: absolute; inset: 0; background: #000; }
    @keyframes sortie { from { opacity: 1; } to { opacity: 0; } }
    #fugace { position: absolute; left: 0; top: 0; width: 20cqh; height: 10cqh; background: #f00; animation: sortie 1s linear both; }
  }</style>
  <div id="fond"></div>
  <h1 id="mot" data-texte="titre" data-obstacle="forme"></h1>
  <div id="fugace" data-start="0" data-dur="1" data-obstacle="forme"></div>
</section>`);
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  const mesure = await mesurerPage({ html: r.html, navigateur, script: `
    const el = document.getElementById('mot');
    const m = await M.figer.masque(el);
    let pleins = 0;
    for (const a of m.alpha) if (a >= 128) pleins++;
    const H = m.hauteur, L = m.largeur;
    M.rendreScene('s', 0.2);
    const avant = await M.figer.masque(document.getElementById('fugace'));
    M.rendreScene('s', 3);
    const apres = await M.figer.masque(document.getElementById('fugace'));
    return { L, H, largeurPx: m.largeurPx, hauteurPx: m.hauteurPx, pleins, n: m.alpha.length,
      avant: avant.alpha.some((a) => a >= 128), apres: apres.alpha.some((a) => a >= 128) };` });
  assert.equal(mesure.erreur, undefined, mesure.erreur);
  const m = mesure.resultat;
  assert.equal(Math.max(m.L, m.H), 256, 'grand côté de 256 px');
  assert.ok(Math.abs(m.L / m.H - m.largeurPx / m.hauteurPx) < 0.02, 'rapport d\'aspect de la boîte de l\'élément');
  assert.equal(m.n, m.L * m.H);
  const part = m.pleins / m.n;
  assert.ok(part > 0.08 && part < 0.7, `part de pixels pleins : ${part} (lettres seules, sans le fond noir de la scène)`);
  assert.equal(m.avant, true, 'élément visible pendant son minutage');
  assert.equal(m.apres, false, 'élément effacé à la fin : masque vide');
});
