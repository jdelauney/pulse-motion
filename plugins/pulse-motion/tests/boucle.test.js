'use strict';
/* Spec Rendu et export, 5.18 : vidéo en boucle parfaite (champ boucle, musique sans fondus et jointure sans clic, contrôles
 * boucle-jointure et boucle-mesure). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../scripts/lib/boucle.js');
const X = require('../moteur/mixage.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { controler } = require('../scripts/controler.js');
const { assembler } = require('../scripts/assembler.js');
const { miniProjet } = require('./aide/mini-projet.js');

const L = 192;
const H = 108;
/** Vignette grise : fond à 40, un disque de rayon 10 à 220 centré en (x, y). */
function vignette(x, y, r = 10) {
  const g = new Uint8Array(L * H).fill(40);
  for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) if ((i - x) ** 2 + (j - y) ** 2 <= r * r) g[j * L + i] = 220;
  return g;
}
/** Une vidéo de n images -> les vignettes de la jointure et 24 paires voisines. */
function releve(images) {
  const n = images.length;
  const paires = Array.from({ length: 24 }, (_, j) => { const k = Math.floor(((j + 0.5) * (n - 1)) / 24); return [images[k], images[k + 1]]; });
  return { premiere: images[0], deuxieme: images[1], avantDerniere: images[n - 2], derniere: images[n - 1], paires };
}
const cercle = (k, n = 64, r = 10) => vignette(96 + 30 * Math.cos((2 * Math.PI * k) / n), 54 + 30 * Math.sin((2 * Math.PI * k) / n), r);

test('boucle.test.js › cercle qui fait un tour en 64 images : aucune alerte', () => {
  assert.deepEqual(B.jointure(releve(Array.from({ length: 64 }, (_, k) => cercle(k)))), []);
});

test('boucle.test.js › saut à la jointure : alerte boucle-jointure', () => {
  // Le disque traverse l'image sans revenir : la dernière image est loin de la première.
  const images = Array.from({ length: 64 }, (_, k) => vignette(20 + 2.4 * k, 54));
  const c = B.jointure(releve(images));
  assert.deepEqual(c.map((x) => x.type), ['saut']);
  const p = B.problemesJointure(c, 'fin');
  assert.deepEqual([p[0].regle, p[0].gravite, p[0].scene], ['boucle-jointure', 'alerte', 'fin']);
  assert.equal(p[0].message, 'En boucle, la dernière image saute trop par rapport à la première : finir la dernière scène sur l\'image de départ.');
});

test('boucle.test.js › dernière image égale à la première : alerte d\'arrêt', () => {
  const images = Array.from({ length: 65 }, (_, k) => cercle(k));
  const c = B.jointure(releve(images));
  assert.ok(c.some((x) => x.type === 'arret'), JSON.stringify(c));
  assert.match(B.problemesJointure(c)[0].message, /répète la première : la boucle marque un temps d'arrêt/);
  // Vitesse : le mouvement ralentit fort sur les dernières images (un tiers de sa vitesse).
  const ralenti = Array.from({ length: 64 }, (_, k) => cercle(k < 60 ? k : 60 + (k - 60) * 0.35, 64, 25));
  assert.ok(B.jointure(releve(ralenti)).some((x) => x.type === 'vitesse'));
});

test('boucle.test.js › musique en boucle : pas de fondu, jointure du son sans clic (écart < −40 dB)', () => {
  assert.deepEqual(X.pointsFondus(12, 1, { boucle: true }), [{ t: 0, v: 1 }, { t: 12, v: 1 }]);
  assert.equal(X.pointsFondus(12, 1)[0].v, 0, 'sans boucle : fondu d\'entrée');
  // Une note tenue, rendue 2 s au-delà de la fin (sa queue décroît) : la queue repliée au début.
  const taux = 48000;
  const n = Math.round(3.3 * taux);
  const q = X.QUEUE_BOUCLE * taux;
  const source = new Float32Array(n + q);
  for (let i = 0; i < n + q; i++) source[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / taux) * (i < n ? 1 : Math.exp(-(i - n) / (0.3 * taux)));
  const [replie] = X.replierBoucle([source], n, taux);
  assert.equal(replie.length, n);
  // Au tour suivant, le premier échantillon doit être la suite exacte du son à la fin (source[n]).
  const ecart = Math.abs(replie[0] - source[n]) / 0.5;
  assert.ok(20 * Math.log10(Math.max(ecart, 1e-9)) < -40, `écart ${ecart}`);
  assert.equal(replie[n - 1], source[n - 1], 'la fin est intacte');
  // Le pas de la jointure reste celui d'un échantillon à l'autre de la note (aucun saut).
  const pasMax = Math.max(...Array.from({ length: 1000 }, (_, i) => Math.abs(source[i + 1] - source[i])));
  assert.ok(Math.abs(replie[0] - replie[n - 1]) <= pasMax * 1.01, `${Math.abs(replie[0] - replie[n - 1])} > ${pasMax}`);
});

test('boucle.test.js › durée hors mesure : alerte avec la durée à ajouter', () => {
  // 120 bpm : une mesure de 4 temps dure 2 s ; 9,6 s s'arrête au milieu de la cinquième.
  assert.deepEqual(B.mesureEntiere({ duree: 9.6, temps: 0.5, ips: 30 }), { ajouter: 0.4, mesure: 2 });
  assert.equal(B.mesureEntiere({ duree: 10, temps: 0.5, ips: 30 }), null);
  assert.equal(B.mesureEntiere({ duree: 10.02, temps: 0.5, ips: 30 }), null, 'à une image près');
  assert.equal(B.problemeMesure({ ajouter: 0.4, mesure: 2 }).message, 'En boucle, la vidéo s\'arrête au milieu d\'une mesure : allonger la dernière scène de 0,4 s.');
  // Dans le contrôle : seulement en boucle, et avec un tempo.
  const dir = miniProjet({ scenes: [{ id: 'a', duree: 4.8, html: '<h1 data-texte="t">Un</h1>', textes: { t: 'Un' } }, { id: 'b', duree: 4.8, transition: 'coupe', html: '<h1 data-texte="t">Deux</h1>', textes: { t: 'Deux' } }],
    deroule: { boucle: true, tempo: { bpm: 120 } } });
  const r = controler({ dossier: dir, ecrire: false });
  const p = r.problemes.find((x) => x.regle === 'boucle-mesure');
  assert.ok(p, JSON.stringify(r.problemes.map((x) => x.regle)));
  assert.equal(p.gravite, 'alerte');
  assert.match(p.message, /allonger la dernière scène de 0,4 s/);
  const f = path.join(dir, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  delete d.boucle;
  fs.writeFileSync(f, JSON.stringify(d));
  assert.equal(controler({ dossier: dir, ecrire: false }).problemes.some((x) => x.regle === 'boucle-mesure'), false);
});

test('boucle.test.js › champ boucle du déroulé : booléen, transmis à la page (lecteur et musique)', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', html: '<h1 data-texte="t">Un</h1>', textes: { t: 'Un' } }], deroule: { boucle: true } });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true);
  assert.equal(a.donnees.boucle, true);
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  assert.ok(validerDeroule({ ...d, boucle: 'oui' }).some((e) => /« boucle » doit valoir true ou false/.test(e)));
  assert.deepEqual(validerDeroule({ ...d, boucle: false }).filter((e) => /boucle/.test(e)), []);
});
