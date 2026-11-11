'use strict';
/* Spec « Explication narrée » (S7), plan J4 « Voix d'abord et rythme » : critères rendus dans Chrome ou Edge sans fenêtre.
 * Ampleur de scène (5.14), allure dans la page, bruitages automatiques (5.15) : liste des sons, éclaircissement, gamme,
 * crissement, rien de changé sans eux. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { STYLES } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };

// style : « test » (sans table de bruitages : celle de la spec) ou un style livré (sa table, identite.json).
async function ouvrir(scenes, deroule = {}, style = 'test') {
  const dir = miniProjet({ scenes: scenes.map((s) => ({ duree: 4, transition: 'fondu', ...s })), deroule, style });
  const a = assembler({ dossier: dir, ecrire: false, ...(style === 'test' ? { dossierStyles: STYLES } : {}) });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(fichier, a.html);
  return { a, c: await ouvrirCapture({ fichierHtml: fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 }) };
}
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));

const LISTE = '<ul style="margin: 0"><li data-texte="a" data-start="0.4"></li><li data-texte="b" data-start="1.2"></li><li data-texte="c" data-start="2"></li></ul>';
const CARTES = '<div class="carte" style="background: #fff; padding: 2cqh; width: 30cqh" data-texte="t" data-start="0.5"></div><div class="carte" style="background: #fff; padding: 2cqh; width: 30cqh" data-texte="u" data-start="0.55"></div>';
const TEXTES = { a: 'Un', b: 'Deux', c: 'Trois', t: 'Froid', u: 'Chaud', titre: 'Titre' };

test('ampleur de scène : 0,5 réduit de moitié le dépassement d\'un pop-in ; les secousses aussi', { ...SANS, timeout: 120000 }, async () => {
  const pop = '<h2 class="pm-m-pop" data-texte="titre" data-start="0.5"></h2><p class="pm-m-monte" data-texte="t" data-start="0.5"></p>';
  const { c } = await ouvrir([{ id: 's', html: `<section data-scene="s" style="--pm-ampleur-scene: 0.5">${pop}</section>`, textes: TEXTES }, { id: 'n', html: pop, textes: TEXTES }]);
  try {
    const r = await json(c, `M.seek(0).then(function () {
      var s = document.querySelector('[data-scene=s]'), n = document.querySelector('[data-scene=n]');
      return { pop: s.querySelector('.pm-m-pop').style.getPropertyValue('--pm-ampleur'), monte: s.querySelector('.pm-m-monte').style.getPropertyValue('--pm-ampleur'),
        neutre: n.querySelector('.pm-m-pop').style.getPropertyValue('--pm-ampleur') };
    })`);
    assert.deepEqual(r, { pop: '1.06', monte: '2', neutre: '' });
    // Au sommet du pop-in (60 % de 0,45 s), l'échelle vaut 1,06 au lieu de 1,12.
    const echelle = await json(c, `M.seek(0.5 + 0.27).then(function () { return getComputedStyle(document.querySelector('[data-scene=s] .pm-m-pop')).transform; })`);
    const a = Number(/matrix\(([-\d.]+)/.exec(echelle)[1]);
    assert.ok(Math.abs(a - 1.06) < 0.01, echelle);
  } finally { await c.fermer(); }
});

test('allure : la page prend le rythme effectif et garde les ancres ; le calque ne divise plus deux fois', { ...SANS, timeout: 120000 }, async () => {
  const { c, a } = await ouvrir([{ id: 's', duree: 5, html: '<p data-texte="t" data-start="1"></p>', textes: TEXTES }], { allure: 1.25 });
  try {
    const r = await json(c, 'M.seek(0).then(function () { return { fin: M.minutage.scenes[0].fin, rythme: M.minutage.scenes[0].rythme, debut: M.minutage.elements.s[Object.keys(M.minutage.elements.s)[0]].debut }; })');
    assert.deepEqual(r, { fin: 4, rythme: 1.25, debut: 0.8 });
    assert.equal(a.donnees.allure, 1.25);
  } finally { await c.fermer(); }
});

test('bruitages auto : désactivés par défaut, un projet existant garde exactement son mixage', { ...SANS, timeout: 120000 }, async () => {
  const html = `${LISTE}${CARTES}<p data-texte="titre" data-start="1.5" data-son="ding"></p>`;
  const sans = await ouvrir([{ id: 's', html, textes: TEXTES }, { id: 'r', html: '<p data-texte="t" data-start="0.2"></p>', textes: TEXTES }], { bruitages: { transitions: true } });
  const off = await ouvrir([{ id: 's', html, textes: TEXTES }, { id: 'r', html: '<p data-texte="t" data-start="0.2"></p>', textes: TEXTES }], { bruitages: { transitions: true, auto: false } });
  try {
    const a = await json(sans.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    const b = await json(off.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    assert.deepEqual(a, b);
    assert.deepEqual(a.map((x) => x.nom), ['ding', 'souffle']);
    assert.ok(a.every((x) => x.explicite === undefined));
    assert.equal(sans.a.donnees.bruitages.auto, undefined);
  } finally { await sans.c.fermer(); await off.c.fermer(); }
});

test('bruitages auto : deux pop à moins de 0,12 s n\'en font qu\'un ; au plus 3 sons automatiques par 0,5 s, un data-son passe toujours ; tic d\'un compteur', { ...SANS, timeout: 120000 }, async () => {
  const serre = [0.5, 0.55, 0.65, 0.75, 0.85].map((t, i) => `<div style="background: #fff; padding: 1cqh" data-texte="${'abcde'[i]}" data-start="${t}"></div>`).join('');
  const html = `${serre}<p data-texte="titre" data-start="0.7" data-son="carillon"></p><p data-tween="nombre 0→120" data-start="2" data-dur="1"></p>`;
  const { c } = await ouvrir([{ id: 's', html, textes: { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', titre: 'T' } }], { bruitages: { auto: true } });
  try {
    const sons = await json(c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    const avant = sons.filter((x) => x.t < 1.5);
    const pops = avant.filter((x) => x.nom === 'pop').map((x) => x.t);
    assert.ok(pops.every((t, i) => i === 0 || t - pops[i - 1] >= 0.12), JSON.stringify(pops));
    assert.ok(!pops.some((t) => Math.abs(t - 0.55) < 1e-6), 'le pop à 0,05 s du premier est retiré');
    assert.ok(avant.some((x) => x.nom === 'carillon' && x.explicite), 'le son posé à la main passe');
    assert.ok(avant.filter((x) => x.t >= 0.5 && x.t <= 1).length <= 3, JSON.stringify(avant));
    const tics = sons.filter((x) => x.nom === 'tic');
    // N = arrondi(1 s × 10) tics aux instants 2 + 1 − ∛(1 − k/N), de plus en plus espacés ; un tic à moins de 0,045 s du
    // précédent gardé est retiré.
    const attendus = [];
    for (let k = 0; k < 10; k++) { const t = 2 + 1 - Math.cbrt(1 - k / 10); if (!attendus.length || t - attendus[attendus.length - 1] >= 0.045) attendus.push(t); }
    assert.deepEqual(tics.map((x) => Math.round(x.t * 1e6) / 1e6), attendus.map((t) => Math.round(t * 1e6) / 1e6));
    assert.ok(Math.abs(tics[0].t - 2) < 1e-9 && Math.abs(tics[0].volume - 0.8) < 1e-9 && Math.abs(tics[tics.length - 1].volume - 0.4) < 1e-9);
    for (let k = 1; k < tics.length; k++) assert.ok(tics[k].t - tics[k - 1].t >= 0.045 - 1e-9, `tic ${k}`);
    assert.ok(!sons.some((x) => ['impact', 'basse', 'montee'].includes(x.nom) && !x.explicite));
  } finally { await c.fermer(); }
});

test('bruitages auto : les blips d\'une liste montent dans la gamme de la musique ; crissement d\'un tracé à main levée ; minimal ne garde que transitions et sons explicites', { ...SANS, timeout: 180000 }, async () => {
  const fleche = '<div id="x" style="position: absolute; left: 10cqh; top: 40cqh; width: 20cqh; height: 10cqh; background: #fff" data-texte="t" data-start="0.2"></div><div id="y" style="position: absolute; left: 120cqh; top: 40cqh; width: 20cqh; height: 10cqh; background: #fff" data-texte="u" data-start="0.2"></div><i data-fleche="#x → #y" data-start="2.6" data-dur="1.2"></i>';
  const scenes = [{ id: 's', html: `<section data-scene="s" style="--pm-trait: main">${LISTE}${fleche}<p data-texte="titre" data-start="3.2" data-son="ding"></p></section>`, textes: TEXTES },
    { id: 'r', html: '<p data-texte="t" data-start="0.2"></p>', textes: TEXTES }];
  const auto = await ouvrir(scenes, { bruitages: { auto: true }, musique: { generee: 'calme', tonalite: 'la' } });
  const minimal = await ouvrir(scenes, { bruitages: { auto: 'minimal' } });
  try {
    const sons = await json(auto.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    const blips = sons.filter((x) => x.nom === 'blip');
    assert.equal(blips.length, 3);
    const f = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
    assert.deepEqual(blips.map((x) => Math.round(x.hauteur * 100) / 100), [81, 83, 85].map((m) => Math.round(f(m) * 100) / 100), 'la, si, do# de la majeur');
    const crissement = sons.find((x) => x.nom === 'crissement');
    assert.ok(crissement && Math.abs(crissement.duree - 1.2) < 1e-6 && Math.abs(crissement.t - 2.6) < 1e-6, JSON.stringify(sons));
    const essai = await json(auto.c, 'M.synthe.essayerBruitage("crissement")');
    assert.ok(essai.fini && essai.rms > 0.001, JSON.stringify(essai));
    const m = await json(minimal.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    assert.deepEqual(m.map((x) => [x.nom, x.explicite]), [['ding', true], ['souffle', true]]);
  } finally { await auto.c.fermer(); await minimal.c.fermer(); }
  // La table d'un style livré remplace ces sons (clair-pedagogique : point → pop, trace → whoosh, forme → aucun).
  const style = await ouvrir(scenes, { bruitages: { auto: true } }, 'clair-pedagogique');
  try {
    const sons = await json(style.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    assert.deepEqual(style.a.donnees.bruitages.table.point, 'pop');
    assert.ok(!sons.some((x) => x.nom === 'blip' || x.nom === 'crissement'), JSON.stringify(sons));
    assert.ok(sons.some((x) => x.nom === 'whoosh' && Math.abs(x.t - 2.6) < 1e-6) && sons.filter((x) => x.nom === 'pop').length >= 2, JSON.stringify(sons));
  } finally { await style.c.fermer(); }
});
