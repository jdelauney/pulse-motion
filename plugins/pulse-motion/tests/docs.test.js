'use strict';
/* Spec Rendu et export, 5.4 point 1 : le tableau des usages du wiki (docs/commandes/exporter.html) suit scripts/usages.json,
 * mesures comprises (poids et temps recopiés de la mesure, jamais estimés à la main). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../scripts/lib/usages.js');

const PAGE = path.join(__dirname, '..', '..', '..', 'docs', 'commandes', 'exporter.html');

test('docs.test.js › exporter.html a une ligne par usage de usages.json, avec les mêmes poids et temps', { skip: !fs.existsSync(PAGE) && 'wiki absent (plugin installé seul)' }, () => {
  const html = fs.readFileSync(PAGE, 'utf8');
  const usages = U.lireUsages().usages;
  const lignes = [...html.matchAll(/<tr data-usage="([a-z]+)">([\s\S]*?)<\/tr>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(lignes.map((l) => l[0]), Object.keys(usages));
  for (const [nom, contenu] of lignes) {
    const { poids, temps } = U.poidsEtTemps(usages[nom].mesures);
    assert.ok(contenu.includes(poids), `${nom} : poids « ${poids} » absent`);
    assert.ok(contenu.includes(temps), `${nom} : temps « ${temps} » absent`);
    assert.notEqual(poids, 'à mesurer', `${nom} : poids mesuré à la fin du plan`);
    assert.ok(contenu.includes(usages[nom].nom), `${nom} : nom français`);
  }
  // Plus de « 720p pour un courriel » ni de 2 secondes par seconde estimées à la main.
  assert.doesNotMatch(html, /Environ 2 secondes de calcul par seconde de vidéo/);
});
