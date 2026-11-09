'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controler } = require('../scripts/controler.js');
const V = require('../scripts/lib/voix.js');
const W = require('../moteur/wav.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

function avecElements(dir, html) {
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', `${html}</section>`));
}
const regles = (c) => c.problemes.map((p) => p.regle);

test('son inconnu : erreur qui liste les bruitages', () => {
  const dir = copierProjet('projet-simple');
  avecElements(dir, '<p data-start="1" data-son="tonnerre">x</p>');
  const c = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const p = c.problemes.find((x) => x.regle === 'son-inconnu');
  assert.ok(p, JSON.stringify(regles(c)));
  assert.equal(p.gravite, 'erreur');
  assert.match(p.message, /« tonnerre ».*whoosh/);
});

test('trop de sons dans une seconde : alerte ; sons espacés : rien', () => {
  const dir = copierProjet('projet-simple');
  avecElements(dir, ['1', '1.2', '1.4', '1.6'].map((t) => `<p data-start="${t}" data-son="pop">x</p>`).join(''));
  assert.ok(regles(controler({ dossier: dir, dossierStyles: STYLES, ecrire: false })).includes('trop-de-sons'));
  const espaces = copierProjet('projet-simple');
  avecElements(espaces, ['0.5', '1.5', '2.5', '3.5'].map((t) => `<p data-start="${t}" data-son="pop">x</p>`).join(''));
  assert.ok(!regles(controler({ dossier: espaces, dossierStyles: STYLES, ecrire: false })).includes('trop-de-sons'));
});

test('son fort pendant un mot de la voix : alerte ; son léger : rien', async () => {
  const dir = copierProjet('projet-simple');
  const x = new Float32Array(48000 * 4);
  for (let i = 24000; i < 48000 * 3.5; i++) x[i] = 0.3 * Math.sin(i / 5);
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: W.ecrire({ taux: 48000, canaux: [x] }), texte: 'un deux trois quatre' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'un deux trois quatre', fichier: r.relatif }; });
  avecElements(dir, '<p data-start="mot:deux" data-son="impact">x</p><p data-start="mot:trois" data-son="pop">y</p>');
  const c = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const p = c.problemes.filter((x) => x.regle === 'son-sous-voix');
  assert.equal(p.length, 1, JSON.stringify(regles(c)));
  assert.match(p[0].message, /« impact ».*pause/);
});

// --- Spec S2, 5.11 : son mesuré au contrôle ------------------------------------------------------------------------

const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet, poserVoix } = require('./aide/mini-projet.js');
const { assembler } = require('../scripts/assembler.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { controlerComplet } = require('../scripts/controler.js');
const navigateur = trouverNavigateur();

/** WAV mono 48 kHz : sinus de freq Hz, au niveau donné, de debut à fin (s), sur duree s. */
function sinus(duree, freq, niveau, debut = 0, fin = duree) {
  const x = new Float32Array(Math.round(48000 * duree));
  for (let i = Math.round(debut * 48000); i < Math.round(fin * 48000) && i < x.length; i++) x[i] = niveau * Math.sin(2 * Math.PI * freq * i / 48000);
  return Buffer.from(W.ecrire({ taux: 48000, canaux: [x] }));
}
const TITRE = '<h2 data-texte="titre" data-start="0.3" data-dur="0.5"></h2>';

test('controler-sons.test.js › voix-couverte et silence-imprevu, avec l\'humeur silence respectée', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  // Voix à 1 kHz couverte par un bruitage importé à 1,2 kHz, plus fort (les bruitages ne sont pas baissés sous la voix).
  const dir = miniProjet({ scenes: [{ id: 'a', duree: 6, textes: { titre: 'Le froid' }, voix: { texte: 'un deux trois quatre cinq six' }, html: `${TITRE}<span data-son="assets/bruit.wav" data-start="0.2"></span>` }],
    assets: { 'bruit.wav': sinus(6, 1200, 0.6) } });
  await poserVoix(dir, 'a', sinus(5, 1000, 0.2, 0.2, 4.8), 'un deux trois quatre cinq six');
  const a = assembler({ dossier: dir, ecrire: false });
  const r = await controlerRendu({ html: a.html, ratio: '16:9', duree: 6, navigateur, ecoute: { humeurs: {} } });
  assert.ok(Array.isArray(r.son), JSON.stringify(r));
  assert.deepEqual(r.son.map((p) => [p.regle, p.scene]), [['voix-couverte', 'a']]);
  assert.match(r.son[0].message, /la voix est couverte par la musique ou les bruitages pendant \d+ % du temps où elle parle/);
  // Musique importée muette de 2 à 5,5 s : silence-imprevu ; la même scène en humeur « silence » : rien.
  const musique = miniProjet({ scenes: [{ id: 'm', duree: 8, textes: { titre: 'Le froid' }, html: TITRE }], deroule: { musique: { fichier: 'assets/musique.wav' } },
    assets: { 'musique.wav': Buffer.concat([sinus(8, 440, 0.3)]) } });
  const x = W.lire(new Uint8Array(fs.readFileSync(path.join(musique, 'assets', 'musique.wav'))));
  x.canaux[0].fill(0, 2 * 48000, 5.5 * 48000);
  fs.writeFileSync(path.join(musique, 'assets', 'musique.wav'), Buffer.from(W.ecrire(x)));
  const html = assembler({ dossier: musique, ecrire: false }).html;
  const s = await controlerRendu({ html, ratio: '16:9', duree: 8, navigateur, ecoute: { humeurs: {} } });
  assert.deepEqual(s.son.map((p) => [p.regle, p.scene]), [['silence-imprevu', 'm']]);
  assert.match(s.son[0].message, /De 2(,\d)? s à 5,\d s, on n'entend rien pendant 3,\d s alors que la musique devrait jouer/);
  const voulu = await controlerRendu({ html, ratio: '16:9', duree: 8, navigateur, ecoute: { humeurs: { m: 'silence' } } });
  assert.deepEqual(voulu.son, []);
});

test('controler-sons.test.js › empreinte sonore inchangée : le son n\'est pas rendu une seconde fois', async () => {
  const dir = miniProjet({ scenes: [{ id: 'm', duree: 4, textes: { titre: 'Le froid' }, html: TITRE }], deroule: { musique: { fichier: 'assets/musique.wav' } },
    assets: { 'musique.wav': sinus(4, 440, 0.3) } });
  const appels = [];
  const mesurer = async (opt) => { appels.push(opt); return { renduVerifie: true, problemes: [], ajustements: [], son: opt.ecoute ? [{ regle: 'silence-imprevu', gravite: 'alerte', scene: 'm', message: 'silence' }] : null }; };
  const r1 = await controlerComplet({ dossier: dir, corriger: false, mesurer });
  assert.equal(appels.length, 1);
  assert.ok(appels[0].ecoute, 'premier contrôle : le son est mesuré');
  assert.ok(r1.problemes.some((p) => p.regle === 'silence-imprevu'));
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'controle.json'), 'utf8'));
  assert.match(c.son.empreinte, /^[0-9a-f]{64}$/);
  // Rien n'a changé : ni rendu, ni son ; le constat du son est repris.
  const r2 = await controlerComplet({ dossier: dir, corriger: false, mesurer });
  assert.equal(appels.length, 1);
  assert.ok(r2.problemes.some((p) => p.regle === 'silence-imprevu'));
  // Même en contrôle complet, le son inchangé n'est pas rendu de nouveau.
  await controlerComplet({ dossier: dir, corriger: false, complet: true, mesurer });
  assert.equal(appels.length, 2);
  assert.equal(appels[1].ecoute, null);
  // Le volume de la musique change : seul le son est mesuré (aucune scène).
  modifierDeroule(dir, (d) => { d.musique.volume = 0.5; });
  await controlerComplet({ dossier: dir, corriger: false, mesurer });
  assert.equal(appels.length, 3);
  assert.ok(appels[2].ecoute);
  assert.deepEqual(appels[2].scenes, []);
});
