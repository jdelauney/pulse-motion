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

test('masque d\'un élément en ligne (span sur deux lignes, scène agrandie) : boîte de mise en page entière, sans arrondi', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <style>@scope {
    #para { position: absolute; left: 20cqh; top: 20cqh; width: 37.3cqh; margin: 0; font: 900 12.3cqh/1.1 sans-serif; transform: scale(1.5); transform-origin: 0 0; }
  }</style>
  <p id="para">Un <span id="enligne" data-obstacle="forme">HI HO</span></p>
</section>`);
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const mesure = await mesurerPage({ html: r.html, navigateur, script: `
    const el = document.getElementById('enligne');
    const m = await M.figer.masque(el);
    let pleins = 0;
    for (const a of m.alpha) if (a >= 128) pleins++;
    // Boîte attendue : union des lignes, sans la mise à l'échelle du paragraphe.
    const para = document.getElementById('para');
    para.style.transform = 'none';
    const b = el.getBoundingClientRect();
    para.style.transform = '';
    return { largeurPx: m.largeurPx, hauteurPx: m.hauteurPx, attendue: [b.width, b.height], lignes: el.getClientRects().length, offset: [el.offsetWidth, el.offsetHeight], pleins };` });
  assert.equal(mesure.erreur, undefined, mesure.erreur);
  const m = mesure.resultat;
  assert.equal(m.lignes, 2, 'le span passe sur deux lignes');
  assert.ok(Math.abs(m.largeurPx - m.attendue[0]) < 0.01 && Math.abs(m.hauteurPx - m.attendue[1]) < 0.01, `boîte ${m.largeurPx} × ${m.hauteurPx} au lieu de ${m.attendue}`);
  assert.ok(m.pleins > 0, 'les lettres sont dans le masque');
});

test('photo : couleurs de l\'élément seul, sans ses transformations, à la taille demandée ; boîte de mise en page', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), `<section data-scene="s">
  <style>@scope {
    #fond { position: absolute; inset: 0; background: #00ff00; }
    #bloc { position: absolute; left: 20cqh; top: 20cqh; width: 40px; height: 20px;
      background: linear-gradient(90deg, #ff0000 50%, #0000ff 50%); transform: rotate(30deg) scale(2); }
  }</style>
  <div id="fond"></div>
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <div id="bloc" data-start="0"></div>
</section>`);
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  const mesure = await mesurerPage({ html: r.html, navigateur, script: `
    const el = document.getElementById('bloc');
    const b = M.figer.boite(el);
    const p = await M.figer.photo(el, { largeur: 40, hauteur: 20 });
    const px = (x, y) => Array.from(p.rgba.slice((y * p.largeur + x) * 4, (y * p.largeur + x) * 4 + 4));
    const petite = await M.figer.photo(el, { largeur: 10, hauteur: 5 });
    return { b, L: p.largeur, H: p.hauteur, n: p.rgba.length, gauche: px(5, 10), droite: px(35, 10), petite: [petite.largeur, petite.hauteur, petite.rgba.length] };` });
  assert.equal(mesure.erreur, undefined, mesure.erreur);
  const m = mesure.resultat;
  assert.deepEqual(m.b, { largeur: 40, hauteur: 20 }, 'boîte de mise en page, sans la transformation');
  assert.deepEqual([m.L, m.H, m.n], [40, 20, 3200]);
  assert.deepEqual(m.gauche, [255, 0, 0, 255], 'rouge à gauche, sans le fond vert de la scène');
  assert.deepEqual(m.droite, [0, 0, 255, 255]);
  assert.deepEqual(m.petite, [10, 5, 200]);
});
