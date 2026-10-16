'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { ouvrirPageSon } = require('./aide/page-son.js');
const { clics, wavMono } = require('./aide/signaux.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const INSTANTS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5];

/** Projet simple, musique faite de clics (WAV 48 kHz), une scène qui pulse sur le battement. */
function projetClics() {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'clics.wav'), wavMono(clics({ duree: 4, instants: INSTANTS })));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/clics.wav' }; });
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>',
    '  <div id="pulsation" style="transform: scale(calc(1 + 0.2 * var(--son-battement, 0)))"></div>\n</section>'));
  return dir;
}

const LIRE = `M.son.pret.then(function () {
  return { fait: M.son.fait(), pistes: M.son.pistes(), erreur: M.son.erreur('musique'), battements: M.son.battements('musique'),
    empreinte: M.son.empreinte('musique'), spectre: Array.from(M.son.spectre('musique', 1)).length };
})`;

test('page : battements de la musique à ± 1 image, tables identiques à chaque chargement', sans, async () => {
  const dir = projetClics();
  const lus = [];
  for (let k = 0; k < 2; k++) {
    const page = await ouvrirPageSon({ dir, navigateur });
    try { lus.push(await page.evaluer(LIRE)); } finally { await page.fermer(); }
  }
  const [a, b] = lus;
  assert.equal(a.fait, true);
  assert.deepEqual(a.pistes, ['musique']);
  assert.equal(a.erreur, null);
  assert.equal(a.spectre, 512);
  assert.equal(a.battements.length, INSTANTS.length, JSON.stringify(a.battements));
  a.battements.forEach((t, j) => assert.ok(Math.abs(t - INSTANTS[j]) <= 1 / 60 + 1e-9, `${t} pour ${INSTANTS[j]}`));
  assert.equal(a.empreinte, b.empreinte, 'tables identiques d\'un chargement à l\'autre');
});

test('page : variables CSS fonction de t, deux chemins, même valeur en capture', sans, async () => {
  const page = await ouvrirPageSon({ dir: projetClics(), navigateur });
  try {
    const r = await page.evaluer(`(async function () {
      var scene = document.getElementById('pm-scene');
      function v(nom) { return Number(getComputedStyle(scene).getPropertyValue(nom)); }
      async function a(t) { await M.seek(t); return { battement: v('--son-battement'), phase: v('--son-phase'), volume: v('--son-volume'),
        attendu: Number(M.son.lire('musique', t).battement.toFixed(4)), voix: v('--voix-enveloppe') }; }
      var aller = [await a(1), await a(1.3), await a(2.75)];
      var retour = [await a(2.75), await a(1.3), await a(1)];
      M.modeCapture(true);
      var capture = await a(1.3);
      M.modeCapture(false);
      return { aller: aller, retour: retour, capture: capture };
    })()`);
    const [sur, apres, milieu] = r.aller;
    assert.ok(sur.battement >= 0.9, `sur le battement : ${sur.battement}`);
    assert.ok(apres.battement < 0.2, `0,3 s après : ${apres.battement}`);
    assert.ok(Math.abs(milieu.phase - 0.5) <= 0.05, `phase à mi-chemin : ${milieu.phase}`);
    r.aller.forEach((x) => assert.equal(x.battement, x.attendu));
    assert.deepEqual(r.retour.slice().reverse(), r.aller, 'même valeur par deux chemins');
    assert.deepEqual(r.capture, apres, 'export : la valeur de l\'aperçu');
    assert.equal(sur.voix, 0, 'sans voix : --voix-enveloppe à 0');
  } finally { await page.fermer(); }
});

test('page : musique illisible -> erreur de la piste, variables à 0, seek qui n\'attend pas indéfiniment', sans, async () => {
  const dir = projetClics();
  fs.writeFileSync(path.join(dir, 'assets', 'clics.wav'), Buffer.from('pas un son'));
  const page = await ouvrirPageSon({ dir, navigateur });
  try {
    const r = await page.evaluer(`M.seek(1).then(function () {
      return { erreur: M.son.erreur('musique'), pistes: M.son.pistes(),
        battement: getComputedStyle(document.getElementById('pm-scene')).getPropertyValue('--son-battement').trim() };
    })`);
    assert.match(r.erreur, /La musique n'a pas pu être lue/);
    assert.deepEqual(r.pistes, []);
    assert.equal(r.battement, '0.0000');
  } finally { await page.fermer(); }
});
