'use strict';
/* Spec S11, jalon J6 (5.11 point 2) dans le navigateur : pulse-motion planche <dossier> --journee. Une scène à data-journee
 * rendue aux 7 heures du balayage (τ forcé), au même instant de la scène. Sans navigateur (tailles) : journee.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PNG = require('../scripts/lib/png.js');
const J = require('../moteur/journee.js');
const { plancheJournee, taillePlanche, TAUS } = require('../scripts/planche-journee.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const ECART = 12;
const LEGENDE = 24;

function projet(journee = ' data-journee="0.62-0.95"') {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), `<section data-scene="chiffre"${journee} style="background: linear-gradient(var(--pm-ciel-haut), var(--pm-ciel-bas))">
  <svg viewBox="0 0 160 90" style="position: absolute; inset: 0; width: 100%; height: 100%">
    <g style="fill: var(--pm-papier); stroke: var(--pm-encre); stroke-width: 0.6"><path d="M8 82 V44 L30 30 L52 44 V82 Z" />
      <rect data-lampe x="16" y="52" width="7" height="9" /><rect data-lampe x="34" y="52" width="7" height="9" /></g>
  </svg>
  <div id="p" data-personnage="passant" data-x="60" data-taille="45"><i data-action="marcher" data-vers="80" data-start="0.2" data-dur="6"></i></div>
</section>`);
  modifierDeroule(dir, (d) => { d.style = 'carnet'; d.scenes[1].duree = 8; delete d.scenes[1].rythme; });
  return dir;
}

test('planche --journee : 7 images aux instants donnés', { ...SANS, timeout: 240000 }, async () => {
  const dir = projet();
  const r = await plancheJournee({ dossier: dir, navigateur });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.taus, [0.24, 0.3, 0.5, 0.72, 0.75, 0.8, 0.95]);
  assert.deepEqual(r.taus, [...TAUS]);
  assert.equal(r.images, 7);
  assert.equal(r.vignettes.length, 7);
  assert.equal(r.scene, 'chiffre');
  assert.equal(r.t, 4, 'le milieu de la scène');
  // Chaque image est prise à son heure : les variables de la scène sont celles de palette(τ).
  for (const [i, v] of r.vignettes.entries()) {
    assert.equal(v.tau, TAUS[i]);
    assert.deepEqual(v.variables, J.variables(TAUS[i]), `τ = ${TAUS[i]}`);
    assert.match(v.legende, new RegExp(`^τ ${String(TAUS[i]).replace('.', ',')} · `));
  }
  assert.equal(r.planche, 'sortie/planche/journee-chiffre.png');
  const planche = PNG.decoder(fs.readFileSync(path.join(dir, r.planche)));
  const [l, h] = r.vignette;
  assert.deepEqual([planche.largeur, planche.hauteur], taillePlanche(l, h));
  // Midi est clair, la nuit est sombre : moyenne d'un carré au milieu de chaque vignette.
  const moyenne = (i) => {
    const x0 = ECART + (i % r.colonnes) * (l + ECART), y0 = ECART + Math.floor(i / r.colonnes) * (h + LEGENDE + ECART);
    let s = 0, n = 0;
    for (let y = y0 + 10; y < y0 + 50; y++) for (let x = x0 + 10; x < x0 + 50; x++) {
      const k = (y * planche.largeur + x) * planche.canaux; s += planche.donnees[k] + planche.donnees[k + 1] + planche.donnees[k + 2]; n += 3;
    }
    return s / n;
  };
  assert.ok(moyenne(2) > 200 && moyenne(5) < 90, `midi ${moyenne(2)}, nuit ${moyenne(5)}`);
  // --de choisit l'instant ; la scène se nomme.
  const t = await plancheJournee({ dossier: dir, scene: 'chiffre', de: 1, navigateur });
  assert.equal(t.ok, true, t.message);
  assert.equal(t.t, 1);
});

test('planche --journee : une scène sans data-journee est refusée en français', { ...SANS, timeout: 120000 }, async () => {
  const r = await plancheJournee({ dossier: projet(''), navigateur });
  assert.equal(r.ok, false);
  assert.match(r.message, /aucune scène ne porte data-journee/);
  const autre = await plancheJournee({ dossier: projet(), scene: 'intro', navigateur });
  assert.equal(autre.ok, false);
  assert.match(autre.message, /la scène « intro » ne porte pas data-journee/);
  const mauvais = await plancheJournee({ dossier: projet(), de: -2, navigateur });
  assert.match(mauvais.message, /l'instant \(--de\)/);
});
