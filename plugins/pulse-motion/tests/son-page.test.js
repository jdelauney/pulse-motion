'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');
const { ouvrirPageSon } = require('./aide/page-son.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

function avecMusique(dir, octets = wavSinus({ secondes: 10, frequence: 440 })) {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'musique.wav'), octets);
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.wav', volume: 0.8 }; });
}

// Résumé du rendu calculé dans la page : longueur, canaux, sonie, empreinte exacte des échantillons, niveaux par plage.
const RESUME = `M.rendreSon().then(function (r) {
  if (!r.buffer) return { buffer: null, avertissements: r.avertissements, sonie: r.sonie };
  var b = r.buffer, x = b.getChannelData(0), h = 2166136261, u = new Uint32Array(x.buffer, x.byteOffset, x.length);
  for (var i = 0; i < u.length; i += 7) h = Math.imul(h ^ u[i], 16777619) >>> 0;
  function rms(a, z) { var s = 0, n = 0; for (var k = Math.round(a * b.sampleRate); k < Math.round(z * b.sampleRate); k++) { s += x[k] * x[k]; n++; } return 10 * Math.log10(s / n); }
  return { longueur: b.length, canaux: b.numberOfChannels, taux: b.sampleRate, duree: M.duree, sonie: r.sonie, empreinte: h,
    parole: rms(2.2, 2.8), horsParole: rms(4.5, 5.0), avertissements: r.avertissements };
})`;

async function resume(options) {
  const page = await ouvrirPageSon({ navigateur, ...options });
  try { return { aSon: await page.evaluer('M.aSon()'), ...(await page.evaluer(RESUME)) }; } finally { await page.fermer(); }
}

test('sans source sonore : aSon faux, aucun tampon', sans, async () => {
  const r = await resume({ dir: copierProjet('projet-simple') });
  assert.equal(r.aSon, false);
  assert.equal(r.buffer, null);
});

test('musique : stéréo 48 kHz à la durée de la vidéo, −16 LUFS au volume 1 (moins le volume), rendu identique d\'une page à l\'autre', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  const a = await resume({ dir });
  const b = await resume({ dir });
  assert.equal(a.aSon, true);
  assert.deepEqual([a.canaux, a.taux, a.longueur], [2, 48000, Math.ceil(a.duree * 48000)]);
  assert.ok(Math.abs(a.sonie - (-16 + 20 * Math.log10(0.8))) < 0.3, String(a.sonie)); // volume 0,8
  assert.equal(a.empreinte, b.empreinte);
  assert.deepEqual(a.avertissements, []);
});

test('ducking : la musique baisse d\'environ 10 dB pendant les mots d\'une voix (voix muette pour mesurer la musique seule)', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  const r = await resume({
    dir,
    sons: { 'pm-son-voix-essai': wavSinus({ secondes: 1, frequence: 220, taux: 48000 }) },
    modifier: (d) => {
      d.voix = { volume: 0 };
      d.scenes[0].voix = { source: 'pm-son-voix-essai', debut: 2, duree: 1, mots: [{ w: 'essai', t0: 0, t1: 1 }] };
    },
  });
  const ecart = r.parole - r.horsParole;
  assert.ok(ecart < -8.5 && ecart > -11.5, `écart ${ecart.toFixed(1)} dB`);
});

test('musique illisible seule : aucun tampon, avertissement « sans son »', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir, Buffer.alloc(3000, 7));
  const r = await resume({ dir });
  assert.equal(r.buffer, null);
  assert.match(r.avertissements.join(' '), /musique n'a pas pu être lue : la vidéo n'a pas de son/);
  assert.doesNotMatch(r.avertissements.join(' '), /export/);
});

test('revue : musique illisible mais voix lisible : son rendu avec la voix, avertissement « sans musique »', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir, Buffer.alloc(3000, 7));
  const r = await resume({
    dir,
    sons: { 'pm-son-voix-essai': wavSinus({ secondes: 1, taux: 48000 }) },
    modifier: (d) => { d.scenes[0].voix = { source: 'pm-son-voix-essai', debut: 0.5, duree: 1, mots: [] }; },
  });
  assert.ok(r.longueur > 0);
  assert.match(r.avertissements.join(' '), /musique n'a pas pu être lue : le son est fait sans elle/);
  assert.doesNotMatch(r.avertissements.join(' '), /export/);
});

test('revue : voix illisible : avertissement nommant la scène', sans, async () => {
  const dir = copierProjet('projet-simple');
  const r = await resume({
    dir,
    sons: { 'pm-son-voix-essai': Buffer.alloc(500, 3) },
    modifier: (d) => { d.scenes[0].voix = { source: 'pm-son-voix-essai', debut: 0, duree: 1, mots: [] }; },
  });
  assert.equal(r.buffer, null);
  assert.match(r.avertissements.join(' '), /voix de la scène « intro » n'a pas pu être lue/);
});

test('lecture : ▶ joue le son mixé, calé sur le temps de la vidéo ; pause : arrêté', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  const page = await ouvrirPageSon({ dir, navigateur });
  try {
    await page.evaluer('M.rendreSon().then(function () { return true; })');
    const etat = await page.evaluer(`(async function () {
      document.querySelector('#pm-lecteur button').click();
      await new Promise(function (r) { setTimeout(r, 1200); });
      return { e: M.etatSon(), t: M.temps() };
    })()`);
    assert.equal(etat.e.attendu, true);
    assert.equal(etat.e.pret, true);
    assert.equal(etat.e.enLecture, true);
    assert.ok(Math.abs(etat.e.position - etat.t) < 0.15, `${etat.e.position} / ${etat.t}`);
    const apres = await page.evaluer('(function () { document.querySelector(\'#pm-lecteur button\').click(); return M.etatSon(); })()');
    assert.equal(apres.enLecture, false);
  } finally {
    await page.fermer();
  }
});

test('sans son : etatSon().attendu faux, la lecture marche sans AudioContext', sans, async () => {
  const page = await ouvrirPageSon({ dir: copierProjet('projet-simple'), navigateur });
  try {
    const e = await page.evaluer('(async function () { document.querySelector(\'#pm-lecteur button\').click(); await new Promise(function (r) { setTimeout(r, 300); }); return { e: M.etatSon(), t: M.temps() }; })()');
    assert.equal(e.e.attendu, false);
    assert.ok(e.t > 0.1);
  } finally {
    await page.fermer();
  }
});

test('revue : le volume de la musique compte (0,5 seule → environ −22 LUFS, 6 dB sous le volume 1)', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  modifierDeroule(dir, (d) => { d.musique.volume = 0.5; });
  const r = await resume({ dir });
  assert.ok(Math.abs(r.sonie + 22) < 0.5, String(r.sonie));
});

test('revue : musique muette (volume 0) : tampon présent, sonie nulle, aucun avertissement', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  modifierDeroule(dir, (d) => { d.musique.volume = 0; });
  const r = await resume({ dir });
  assert.ok(r.longueur > 0);
  assert.equal(r.sonie, null);
  assert.deepEqual(r.avertissements, []);
});

test('revue : musique illisible : le lecteur n\'affiche plus « son en préparation » une fois le rendu fini', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir, Buffer.alloc(3000, 7));
  const page = await ouvrirPageSon({ dir, navigateur });
  try {
    const r = await page.evaluer(`(async function () {
      document.querySelector('#pm-lecteur button').click();
      await M.rendreSon();
      await new Promise(function (r) { setTimeout(r, 300); });
      return { e: M.etatSon(), etiquette: document.querySelector('.pm-etiquette').textContent };
    })()`);
    assert.equal(r.e.attendu, false);
    assert.doesNotMatch(r.etiquette, /préparation/);
  } finally {
    await page.fermer();
  }
});

test('voix dans la page : scène allongée par la voix, élément calé sur un mot', sans, async () => {
  const V = require('../scripts/lib/voix.js');
  const W = require('../moteur/wav.js');
  const dir = copierProjet('projet-simple');
  const x = new Float32Array(48000 * 6);
  for (let i = 24000; i < 48000 * 5.5; i++) x[i] = 0.3 * Math.sin(i / 5);
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: W.ecrire({ taux: 48000, canaux: [x] }), texte: 'un deux trois quatre' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'un deux trois quatre', fichier: r.relatif }; });
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('</section>', '<p id="cale" data-start="mot:trois">3</p></section>'));
  const page = await ouvrirPageSon({ dir, navigateur });
  try {
    const info = await page.evaluer('({ fin: M.minutage.scenes[0].fin, cale: M.minutage.elements.intro.cale.debut, mot: M.donnees.scenes[0].voix.mots[2].t0 })');
    assert.ok(Math.abs(info.fin - (0.3 + 5.16 + 0.4)) < 0.05, String(info.fin));
    assert.ok(Math.abs(info.cale - (0.3 + info.mot)) < 0.001);
    assert.equal(await page.evaluer('M.aSon()'), true);
  } finally {
    await page.fermer();
  }
});

test('couperSon : la lecture continue sans son ; rendu : le son repart', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  const page = await ouvrirPageSon({ dir, navigateur });
  try {
    await page.evaluer('M.rendreSon().then(function () { return true; })');
    const e = await page.evaluer(`(async function () {
      M.couperSon(true);
      document.querySelector('#pm-lecteur button').click();
      await new Promise(function (r) { setTimeout(r, 400); });
      var coupe = M.etatSon();
      M.couperSon(false);
      await new Promise(function (r) { setTimeout(r, 300); });
      return { coupe: coupe, rendu: M.etatSon(), t: M.temps() };
    })()`);
    assert.equal(e.coupe.coupe, true);
    assert.equal(e.coupe.enLecture, false);
    assert.equal(e.rendu.enLecture, true);
    assert.ok(e.t > 0.5);
  } finally { await page.fermer(); }
});

test('correctifs : lecture reprise sans geste après un rechargement : son bloqué signalé, repris au premier clic', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  // Politique de lecture automatique simulée : le contexte audio reste suspendu tant qu'aucun geste n'a eu lieu.
  const prelude = `sessionStorage.setItem('pm-position', JSON.stringify({ t: 0.5, lecture: true }));
    window.__geste = false; window.__repris = 0;
    var Vrai = window.AudioContext;
    window.AudioContext = function () {
      var c = new Vrai(); var reprendre = c.resume.bind(c); c.suspend();
      c.resume = function () { if (!window.__geste) return Promise.resolve(); window.__repris++; return reprendre(); };
      return c;
    };`;
  const page = await ouvrirPageSon({ dir, navigateur, prelude });
  try {
    const avant = await page.evaluer(`M.rendreSon().then(function () { return new Promise(function (r) { setTimeout(r, 400); }); }).then(function () {
      return { e: M.etatSon(), etiquette: document.querySelector('.pm-etiquette').textContent };
    })`);
    assert.equal(avant.e.bloque, true);
    assert.match(avant.etiquette, /cliquez/);
    const apres = await page.evaluer(`(async function () {
      window.__geste = true;
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await new Promise(function (r) { setTimeout(r, 300); });
      return { repris: window.__repris, e: M.etatSon(), etiquette: document.querySelector('.pm-etiquette').textContent };
    })()`, { geste: true });
    assert.ok(apres.repris >= 1);
    assert.equal(apres.e.bloque, false);
    assert.doesNotMatch(apres.etiquette, /cliquez/);
  } finally {
    await page.fermer();
  }
});


test('revue : son bloqué : le clic sur la vidéo débloque le son sans mettre en pause', sans, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  const prelude = `sessionStorage.setItem('pm-position', JSON.stringify({ t: 0.5, lecture: true }));
    window.__geste = false;
    var Vrai = window.AudioContext;
    window.AudioContext = function () {
      var c = new Vrai(); var reprendre = c.resume.bind(c); c.suspend();
      c.resume = function () { return window.__geste ? reprendre() : Promise.resolve(); };
      return c;
    };`;
  const page = await ouvrirPageSon({ dir, navigateur, prelude });
  try {
    await page.evaluer('M.rendreSon().then(function () { return new Promise(function (r) { setTimeout(r, 400); }); })');
    const r = await page.evaluer(`(async function () {
      window.__geste = true;
      var scene = document.getElementById('pm-scene');
      scene.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      scene.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(function (r) { setTimeout(r, 300); });
      return { e: M.etatSon(), bouton: document.querySelector('#pm-lecteur button').getAttribute('aria-label') };
    })()`, { geste: true });
    assert.equal(r.bouton, 'Pause');
    assert.equal(r.e.bloque, false);
    assert.equal(r.e.enLecture, true);
  } finally {
    await page.fermer();
  }
});
