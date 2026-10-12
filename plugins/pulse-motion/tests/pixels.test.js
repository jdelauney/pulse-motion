'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mesurerPage } = require('../scripts/lib/page-mesures.js');
const { assembler } = require('../scripts/assembler.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const SEUILS = require('../scripts/seuils.json');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const MARGE = '<style>@scope { :scope { padding: 12cqh 12cqw; } }</style>';

function projet(modifier = (h) => h) {
  const dir = copierProjet('projet-simple');
  for (const f of ['01-intro.html', '02-chiffre.html']) {
    const fichier = path.join(dir, 'scenes', f);
    let html = fs.readFileSync(fichier, 'utf8').replace(/(<section[^>]*>)/, `$1\n  ${MARGE}`);
    if (f === '01-intro.html') html = modifier(html);
    fs.writeFileSync(fichier, html);
  }
  return dir;
}
async function pixels(dir, ratio = '16:9') {
  modifierDeroule(dir, (d) => { d.format.ratio = ratio; });
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const r = await mesurerPage({ html, navigateur, delai: 60000, script: `return await M.mesurerPixels({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)} });` });
  assert.ok(r.resultat, r.erreur);
  return r.resultat;
}
const DEGRADE = (clair, fonce) => `<svg data-decor style="position:absolute; inset:0; width:100%; height:100%" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="g"><stop offset="0" stop-color="${clair}"/><stop offset="1" stop-color="${fonce}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`;

test('pixels : projet sans défaut (fond uni), aucun constat', sans, async () => {
  assert.deepEqual(await pixels(projet()), []);
});

test('pixels : texte clair sur un dégradé clair, contraste réel insuffisant', sans, async () => {
  const r = await pixels(projet((h) => h
    .replace(MARGE, `${MARGE}${DEGRADE('#ffffff', '#c8c8c8')}`)
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:relative; color:#d8d8d8"')));
  const c = r.find((x) => x.regle === 'contraste-reel' && x.element === 'titre');
  assert.ok(c, JSON.stringify(r));
  assert.ok(c.valeur < 3, String(c.valeur));
});

test('pixels : texte sombre sur le même dégradé clair, rien à signaler', sans, async () => {
  const r = await pixels(projet((h) => h
    .replace(MARGE, `${MARGE}${DEGRADE('#ffffff', '#c8c8c8')}`)
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:relative; color:#111111"')
    .replace('<p data-texte="sous"', '<p data-texte="sous" style="position:relative; color:#111111"')));
  assert.equal(r.some((x) => x.regle === 'contraste-reel'), false, JSON.stringify(r));
});

test('pixels : en 9:16 aussi, un texte sombre sur un dégradé clair n\'est pas signalé (capture à la taille de la page)', sans, async () => {
  const r = await pixels(projet((h) => h
    .replace(MARGE, `${MARGE}${DEGRADE('#ffffff', '#c8c8c8')}`)
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:relative; color:#111111"')
    .replace('<p data-texte="sous"', '<p data-texte="sous" style="position:relative; color:#111111"')), '9:16');
  assert.equal(r.some((x) => x.regle === 'contraste-reel'), false, JSON.stringify(r));
});

test('pixels : liste de clair-pedagogique en 9:16 (textes sur fond uni), aucune fausse alerte de contraste', sans, async () => {
  const { projetEssai } = require('../scripts/lib/projet-essai.js');
  const dir = projetEssai({ dossierStyle: path.join(__dirname, '..', 'styles', 'clair-pedagogique'), ratio: '9:16', types: ['liste', 'chiffre'] });
  const { html } = assembler({ dossier: dir, ecrire: false });
  const r = await mesurerPage({ html, navigateur, delai: 60000, script: `return await M.mesurerPixels({ ratio: '9:16', seuils: ${JSON.stringify(SEUILS)} });` });
  assert.deepEqual(r.resultat, []);
});

test('pixels : texte blanc sur son propre aplat sombre, posé sur un dégradé clair, rien à signaler', sans, async () => {
  const r = await pixels(projet((h) => h
    .replace(MARGE, `${MARGE}${DEGRADE('#ffffff', '#c8c8c8')}`)
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:relative; color:#ffffff; background:#222222; padding:2cqh 3cqh"')
    .replace('<p data-texte="sous"', '<p data-texte="sous" style="position:relative; color:#111111"')));
  assert.equal(r.some((x) => x.regle === 'contraste-reel'), false, JSON.stringify(r));
});

test('pixels : bandeau incliné d\'energique (texte clair sur bande sombre, fond jaune autour), aucune fausse alerte', sans, async () => {
  const { projetEssai } = require('../scripts/lib/projet-essai.js');
  const dir = projetEssai({ dossierStyle: path.join(__dirname, '..', 'styles', 'energique'), ratio: '16:9', types: ['chiffre', 'conclusion'] });
  const { html } = assembler({ dossier: dir, ecrire: false });
  const r = await mesurerPage({ html, navigateur, delai: 60000, script: `return await M.mesurerPixels({ ratio: '16:9', seuils: ${JSON.stringify(SEUILS)} });` });
  assert.deepEqual(r.resultat, []);
});

const CLIGNOTE = (periode) => `<style>@keyframes pm-essai-flash { 50% { background: #ffffff; } }</style><div class="flash" data-decor style="position:absolute; inset:0; background:#000000; animation: pm-essai-flash ${periode}s steps(1) 0.5s 8"></div>`;

test('pixels : alternance noir et blanc à 5 Hz sur toute l\'image, flash (plus de 3 par seconde)', sans, async () => {
  const r = await pixels(projet((h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(0.2)}`)));
  const c = r.find((x) => x.regle === 'flash');
  assert.ok(c, JSON.stringify(r));
  assert.equal(c.scene, 'intro');
  assert.ok(c.valeur > 3, String(c.valeur));
});

test('pixels : alternance à 2 Hz, pas de flash', sans, async () => {
  const r = await pixels(projet((h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(0.5)}`)));
  assert.equal(r.some((x) => x.regle === 'flash'), false, JSON.stringify(r));
});

test('pixels : petite zone qui clignote vite (moins de 25 % de l\'image), pas de flash', sans, async () => {
  const petit = CLIGNOTE(0.2).replace('inset:0;', 'left:0; top:0; width:20%; height:20%;');
  const r = await pixels(projet((h) => h.replace(MARGE, `${MARGE}${petit}`)));
  assert.equal(r.some((x) => x.regle === 'flash'), false, JSON.stringify(r));
});

test('revue : clignotements à 10 Hz et 6 Hz sur toute l\'image, flash (la vidéo est examinée image par image)', sans, async () => {
  for (const periode of [0.1, 1 / 6]) {
    const r = await pixels(projet((h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(periode)}`)));
    assert.ok(r.some((x) => x.regle === 'flash'), `${periode} : ${JSON.stringify(r)}`);
  }
});

test('revue : texte presque invisible sur un dégradé, contraste signalé', sans, async () => {
  const r = await pixels(projet((h) => h
    .replace(MARGE, `${MARGE}${DEGRADE('#c0c0c0', '#e0e0e0')}`)
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:relative; color:#d0d0d0"')
    .replace('<p data-texte="sous"', '<p data-texte="sous" style="position:relative; color:#111111"')));
  assert.ok(r.some((x) => x.regle === 'contraste-reel' && x.element === 'titre'), JSON.stringify(r));
});

test('revue : couleur choisie dans la scène sur fond uni, contraste signalé ; couleur de la charte sur le fond, laissée à la charte', sans, async () => {
  const gris = await pixels(projet((h) => h.replace('<p data-texte="sous"', '<p data-texte="sous" style="color:#bbbbbb"')));
  assert.ok(gris.some((x) => x.regle === 'contraste-reel' && x.element === 'sous'), JSON.stringify(gris));
  assert.deepEqual(await pixels(projet()), []);
});

test('revue : texte blanc avec ombre ou contour sombre sur un dégradé clair, rien à signaler', sans, async () => {
  for (const effet of ['text-shadow: 0 0 0.3em #000, 0 0 0.3em #000', '-webkit-text-stroke: 0.08em #000']) {
    const r = await pixels(projet((h) => h
      .replace(MARGE, `${MARGE}${DEGRADE('#ffffff', '#c8c8c8')}`)
      .replace('<h1 id="titre"', `<h1 id="titre" style="position:relative; color:#ffffff; ${effet}"`)
      .replace('<p data-texte="sous"', '<p data-texte="sous" style="position:relative; color:#111111"')));
    assert.equal(r.some((x) => x.regle === 'contraste-reel'), false, `${effet} : ${JSON.stringify(r)}`);
  }
});

test('revue : texte sombre mais très transparent sur un dégradé clair, contraste signalé', sans, async () => {
  const r = await pixels(projet((h) => h
    .replace(MARGE, `${MARGE}${DEGRADE('#ffffff', '#c8c8c8')}`)
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:relative; color:rgba(17,17,17,0.2)"')
    .replace('<p data-texte="sous"', '<p data-texte="sous" style="position:relative; color:#111111"')));
  assert.ok(r.some((x) => x.regle === 'contraste-reel' && x.element === 'titre'), JSON.stringify(r));
});
