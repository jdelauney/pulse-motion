'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controler } = require('../scripts/controler.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');

const controler2 = (dir) => controler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const scene = (effets, extra = '') => `<section data-scene="etincelles">
  <h1 id="titre" data-texte="titre" data-start="0.2"></h1>
${extra}
${effets.map((n) => `  <div data-effet="${n}" data-calque="arriere"></div>`).join('\n')}
</section>`;

test('contrôles : 16 cordes et tissus au plus par scène, 64 × 64 sommets par tissu (alerte budget-structures)', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/cordes.json', { version: 1, nom: 'cordes', emetteurs: Array.from({ length: 9 }, (_, i) => ({ nom: 'c' + i, structure: { type: 'corde', resolution: 8 } })) });
  ecrire(dir, 'effets/voile.json', { version: 1, nom: 'voile', emetteurs: [{ nom: 'v', structure: { type: 'tissu', resolution: [80, 60] } }] });
  ecrire(dir, 'scenes/01-etincelles.html', scene(['cordes', 'cordes', 'voile']));
  const p = controler2(dir).problemes.filter((x) => x.regle === 'budget-structures');
  assert.equal(p.length, 2, JSON.stringify(p));
  assert.ok(p.every((x) => x.gravite === 'alerte' && x.scene === 'etincelles'));
  assert.match(p[0].message, /Scène « etincelles » : 19 cordes et tissus ; au-delà de 16 par scène, leur simulation dépasse son temps \(aperçu saccadé\)\. En retirer, ou les répartir sur plusieurs scènes\./);
  assert.match(p[1].message, /Scène « etincelles » : l'effet « voile », tissu « v » de 80 × 60 sommets ; au-delà de 64 × 64 \(4096\), sa simulation dépasse son temps \(aperçu saccadé\)\. Baisser « resolution »\./);
  // 16 structures, tissu de 64 × 64 : aucune alerte.
  ecrire(dir, 'effets/voile.json', { version: 1, nom: 'voile', emetteurs: [{ nom: 'v', structure: { type: 'tissu', resolution: [64, 64] } }] });
  ecrire(dir, 'effets/cordes.json', { version: 1, nom: 'cordes', emetteurs: Array.from({ length: 5 }, (_, i) => ({ nom: 'c' + i, structure: { type: 'corde', resolution: 8 } })) });
  ecrire(dir, 'scenes/01-etincelles.html', scene(['cordes', 'cordes', 'cordes', 'voile']));
  assert.deepEqual(controler2(dir).problemes.filter((x) => x.regle === 'budget-structures'), []);
});

test('contrôles : attache vers un élément absent (attache-introuvable), photographie sans data-ancre (ancre-vide), structure invalide', () => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/fanion.json', { version: 1, nom: 'fanion', emetteurs: [{ nom: 'f', structure: { type: 'tissu', resolution: [6, 4], attaches: [{ ou: 'gauche', a: '#mat' }] } }] });
  ecrire(dir, 'effets/toile-photo.json', { version: 1, nom: 'toile-photo', emetteurs: [{ nom: 't', structure: { type: 'tissu', apparence: { source: 'ancre' } } }] });
  ecrire(dir, 'effets/casse.json', { version: 1, nom: 'casse', emetteurs: [{ nom: 'f', structure: { type: 'ruban' } }] });
  ecrire(dir, 'scenes/01-etincelles.html', scene(['fanion', 'toile-photo', 'casse']));
  const problemes = controler2(dir).problemes;
  const attache = problemes.find((x) => x.regle === 'attache-introuvable');
  assert.ok(attache, 'attache-introuvable présente');
  assert.equal(attache.gravite, 'erreur');
  assert.match(attache.message, /Scène « etincelles » : l'effet « fanion » attache une structure à « #mat », absent de la scène \(attendu : #id d'un élément de la même scène, ou « ancre »\)\./);
  const ancre = problemes.find((x) => x.regle === 'ancre-vide');
  assert.ok(ancre, 'ancre-vide présente');
  assert.match(ancre.message, /l'effet « toile-photo » photographie son ancre : data-ancre="#id" attendu/);
  const casse = problemes.find((x) => x.regle === 'structure-invalide');
  assert.ok(casse, 'structure-invalide présente');
  assert.equal(casse.gravite, 'erreur');
  assert.match(casse.message, /Effet « casse », emetteurs\[f\]\.structure\.type : « ruban » inconnu \(corde, tissu\)\./);
  // Élément présent : plus d'erreur d'attache.
  ecrire(dir, 'scenes/01-etincelles.html', scene(['fanion'], '  <div id="mat" data-start="0"></div>'));
  assert.equal(controler2(dir).problemes.filter((x) => x.regle === 'attache-introuvable').length, 0);
});
