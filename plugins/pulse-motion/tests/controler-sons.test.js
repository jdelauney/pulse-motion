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
