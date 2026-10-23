'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tr = require('../moteur/transitions.js');

const VIDE = { opacity: '', transform: '', clipPath: '', filter: '' };

test('fondu, glissement, balayage : début, milieu, fin', () => {
  assert.deepEqual(Tr.styleTransition('fondu', 0), { opacity: '0', transform: '', clipPath: '', filter: '' });
  assert.deepEqual(Tr.styleTransition('fondu', 0.5), { opacity: '0.5', transform: '', clipPath: '', filter: '' });
  assert.deepEqual(Tr.styleTransition('glissement', 0), { opacity: '', transform: 'translateX(100%)', clipPath: '', filter: '' });
  assert.deepEqual(Tr.styleTransition('balayage', 0.5), { opacity: '', transform: '', clipPath: 'inset(0 50% 0 0)', filter: '' });
  for (const t of Tr.TRANSITIONS) assert.deepEqual(Tr.styleTransition(t, 1), VIDE);
});

test('aucune transition : style vide ; q hors bornes ramené dans [0,1]', () => {
  assert.deepEqual(Tr.styleTransition('aucune', 0), VIDE);
  assert.deepEqual(Tr.styleTransition('fondu', -1), { opacity: '0', transform: '', clipPath: '', filter: '' });
  assert.deepEqual(Tr.styleTransition('fondu', 3), VIDE);
});

test('transition inconnue : message en français', () => {
  assert.throws(() => Tr.styleTransition('tourbillon', 0.2), /Transition inconnue : « tourbillon »/);
});

test('rideau, zoom, coupe : début, milieu, fin', () => {
  assert.deepEqual(Tr.styleTransition('rideau', 0), { opacity: '', transform: '', clipPath: 'inset(0 50% 0 50%)', filter: '' });
  assert.deepEqual(Tr.styleTransition('rideau', 0.5), { opacity: '', transform: '', clipPath: 'inset(0 25% 0 25%)', filter: '' });
  assert.deepEqual(Tr.styleTransition('zoom', 0), { opacity: '0', transform: 'scale(0.86)', clipPath: '', filter: '' });
  assert.deepEqual(Tr.styleTransition('zoom', 0.5), { opacity: '0.5', transform: 'scale(0.93)', clipPath: '', filter: '' });
  assert.deepEqual(Tr.styleTransition('coupe', 0), VIDE);
  for (const t of ['rideau', 'zoom', 'coupe']) assert.deepEqual(Tr.styleTransition(t, 1), VIDE);
});

const NOUVELLES = ['whip', 'poussee', 'traversee', 'cercle', 'volets', 'retournement'];

test('transitions nouvelles : vides à la fin, scène cachée ou hors cadre au début', () => {
  for (const t of NOUVELLES) {
    assert.ok(Tr.TRANSITIONS.includes(t), t);
    assert.deepEqual(Tr.styleTransition(t, 1), VIDE, `${t} à la fin`);
    const d = Tr.styleTransition(t, 0);
    const cachee = d.opacity === '0' || /translateX\(100%\)/.test(d.transform) || /circle\(0%/.test(d.clipPath)
      || /rotateY\(90deg\)/.test(d.transform) || /polygon\(/.test(d.clipPath);
    assert.ok(cachee, `${t} au début : ${JSON.stringify(d)}`);
  }
});

test('transitions nouvelles : propriétés permises seulement', () => {
  for (const t of NOUVELLES) {
    for (let i = 0; i <= 10; i++) {
      const st = Tr.styleTransition(t, i / 10);
      assert.deepEqual(Object.keys(st).sort(), ['clipPath', 'filter', 'opacity', 'transform']);
      assert.ok(st.filter === '' || /^blur\([\d.]+cqh\)$/.test(st.filter), `${t} ${i / 10} : ${st.filter}`);
      assert.doesNotMatch(st.clipPath + st.transform, /url\(/);
    }
  }
  assert.match(Tr.styleTransition('whip', 0.5).filter, /^blur\(/);
  assert.equal(Tr.styleTransition('whip', 1).filter, '');
});

test('styleSortie : la poussée et la traversée font bouger la scène qui sort, les autres non', () => {
  assert.match(Tr.styleSortie('poussee', 0.5).transform, /translateX\(-50%\)/);
  assert.ok(Number(Tr.styleSortie('traversee', 0.5).opacity) < 1);
  assert.equal(Tr.styleSortie('fondu', 0.5), null);
  assert.equal(Tr.styleSortie('whip', 0.5), null);
  assert.deepEqual(Tr.styleSortie('poussee', 1), { opacity: '', transform: '', filter: '' });
});

test('le déroulé accepte les nouvelles transitions', () => {
  const { validerDeroule } = require('../scripts/lib/deroule.js');
  const d = {
    version: 1, titre: 'T', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style: 'test',
    scenes: NOUVELLES.map((t, i) => ({ id: `s${i}`, fichier: `scenes/s${i}.html`, duree: 3, textes: {}, transition: t })),
  };
  assert.deepEqual(validerDeroule(d).filter((e) => /transition/.test(e)), []);
});

const { trouverNavigateur } = require('./aide/navigateur.js');
const navigateur = trouverNavigateur();
test('sortie remise à zéro après la transition, même avec un rythme', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const { assembler } = require('../scripts/assembler.js');
  const { copierProjet, modifierDeroule, STYLES } = require('./aide/projet.js');
  const { ouvrirPage } = require('../scripts/lib/cdp.js');
  const { pathToFileURL } = require('node:url');
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[1].transition = 'poussee'; d.scenes[1].rythme = 0.8; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  const page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 400 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const lire = (t) => page.evaluer(`M.pret.then(() => { M.rendre(${t}); const s = document.querySelector('[data-scene="intro"]');
      const i = M.minutage.scenes[1]; return { debut: i.debut, entree: i.entree, transform: s.style.transform, filter: s.style.filter, opacity: s.style.opacity }; })`);
    const info = await lire(0);
    const pendant = await lire(info.debut + info.entree / 2);
    assert.match(pendant.transform, /translateX\(-/);
    const apres = await lire(info.debut + info.entree + 0.05);
    assert.equal(apres.transform, '');
    assert.equal(apres.filter, '');
    assert.equal(apres.opacity, '');
  } finally {
    await page.fermer();
  }
});
