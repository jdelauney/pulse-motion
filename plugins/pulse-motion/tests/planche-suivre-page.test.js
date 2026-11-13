'use strict';
/* Spec S11, jalon J4 (5.11 point 1) dans le navigateur : pulse-motion planche <dossier> --suivre <personnage|sélecteur>. Le
 * cadre suit l'élément à chaque image, agrandi quatre fois sans lissage, à des images exactes de l'horloge. Sans navigateur
 * (fenêtre, cadre, agrandissement) : plume.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PNG = require('../scripts/lib/png.js');
const { plancheSuivre, AGRANDISSEMENT } = require('../scripts/planche-suivre.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const ECART = 12;

function projet() {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), `<section data-scene="chiffre">
  <p id="legende" data-texte="legende" data-start="0.2"></p>
  <div id="p" data-personnage="passant" data-x="15" data-taille="50"><i data-action="marcher" data-vers="70" data-start="0.2" data-dur="3"></i></div>
</section>`);
  modifierDeroule(dir, (d) => { d.style = 'carnet'; d.scenes[1].duree = 4; delete d.scenes[1].rythme; });
  return dir;
}

test('planche --suivre : cadre centré sur l\'élément à chaque image, agrandi quatre fois', { ...SANS, timeout: 240000 }, async () => {
  const dir = projet();
  const r = await plancheSuivre({ dossier: dir, cible: 'passant', de: 0.6, duree: 1.2, pas: 3, navigateur });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.agrandissement, 4);
  assert.equal(AGRANDISSEMENT, 4);
  // Images exactes de l'horloge : 1,2 s à 30 i/s, une sur trois.
  assert.equal(r.vignettes, 12);
  assert.equal(r.cadres.length, 12);
  for (const [i, c] of r.cadres.entries()) {
    assert.ok(Number.isInteger(c.image), 'numéro d\'image entier');
    if (i) assert.equal(c.image - r.cadres[i - 1].image, 3, 'pas exact');
    // Centré sur la boîte de l'élément à chaque image (coin entier : à un demi-pixel près).
    const [x, y, l, h] = c.boite;
    assert.ok(Math.abs(c.centre[0] - (x + l / 2)) <= 0.51 && Math.abs(c.centre[1] - (y + h / 2)) <= 0.51, JSON.stringify(c));
  }
  // Il marche : le cadre se déplace avec lui.
  assert.ok(r.cadres[11].centre[0] - r.cadres[0].centre[0] > 20, 'le cadre suit l\'élément');
  // Cadre de taille fixe, plus grand que l'élément ; la planche montre chaque pixel en carré de 4 × 4 (aucun lissage).
  assert.ok(r.cadre.largeur >= Math.max(...r.cadres.map((c) => c.boite[2])) && r.cadre.hauteur >= Math.max(...r.cadres.map((c) => c.boite[3])));
  const n = Math.ceil(12 / r.parPlanche);
  assert.deepEqual(r.planches, n === 1 ? ['sortie/planche/suivre-passant.png'] : Array.from({ length: n }, (_, i) => `sortie/planche/suivre-passant-${i + 1}.png`));
  for (const f of r.planches) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const planche = PNG.decoder(fs.readFileSync(path.join(dir, r.planches[0])));
  const vl = r.cadre.largeur * 4, vh = r.cadre.hauteur * 4;
  assert.equal(planche.largeur, Math.min(r.colonnes, r.parPlanche, 12) * (vl + ECART) + ECART);
  const px = (x, y) => Array.from(planche.donnees.slice((y * planche.largeur + x) * planche.canaux, (y * planche.largeur + x) * planche.canaux + 3));
  let blocs = 0, varies = 0;
  for (let by = 0; by < r.cadre.hauteur; by += 3) for (let bx = 0; bx < r.cadre.largeur; bx += 3) {
    const ref = px(ECART + 4 * bx, ECART + 4 * by);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) assert.deepEqual(px(ECART + 4 * bx + i, ECART + 4 * by + j), ref, `bloc ${bx},${by}`);
    blocs++;
    if (ref.join() !== px(ECART + 4 * bx + 4, ECART + 4 * by).join()) varies++;
  }
  assert.ok(blocs > 50 && varies > 5, `${blocs} blocs, ${varies} bords`);
  assert.ok(vh > 0);
  // Un sélecteur suit de même ; une cible absente est dite en français.
  const t = await plancheSuivre({ dossier: dir, cible: '#legende', de: 1, duree: 0.2, navigateur });
  assert.equal(t.ok, true, t.message);
  assert.match(t.planches[0], /^sortie\/planche\/suivre-legende(-1)?\.png$/);
  const absent = await plancheSuivre({ dossier: dir, cible: '#rien', navigateur });
  assert.equal(absent.ok, false);
  assert.match(absent.message, /Élément introuvable : « #rien »/);
});
