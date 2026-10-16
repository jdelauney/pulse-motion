'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { preparerMilieux } = require('../scripts/lib/milieux.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const AIR = { version: 1, nom: 'air-essai', parametres: { resolution: { defaut: 96, min: 64, max: 1024 } },
  milieu: { resolution: 'resolution', sources: [{ type: 'fumee', forme: { type: 'cercle', rayon: 5 } }] } };
const PORTEES = { version: 1, nom: 'portees', emetteurs: [{ nom: 'b', naissance: { debit: 10 }, forces: [{ type: 'milieu', coef: 2 }] }] };
const scene = (corps) => `<section data-scene="etincelles">\n  <h1 id="titre" data-texte="titre" data-start="0.2"></h1>\n${corps}\n</section>`;
const projet = (corps) => {
  const dir = copierProjet('projet-effets');
  ecrire(dir, 'effets/air-essai.json', AIR);
  ecrire(dir, 'effets/portees.json', PORTEES);
  ecrire(dir, 'scenes/01-etincelles.html', scene(corps));
  return dir;
};
const assembler2 = (dir) => assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });

test('milieu à l\'assemblage : balise data-milieu compilée (data-pm-milieu, donnees.milieux), calque, ancre, durée', () => {
  const dir = projet([
    '  <div id="foyer" data-start="0"></div>',
    '  <div data-milieu="air-essai" data-ancre="#foyer" data-reglages="resolution: 128" data-start="0.5" data-dur="3"></div>',
    '  <div data-effet="portees" data-start="0.5" data-dur="2"></div>',
  ].join('\n'));
  const a = assembler2(dir);
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.equal(a.milieux.length, 1);
  const m = a.donnees.milieux[0];
  assert.deepEqual([m.calque, m.ancre, m.sansDuree, m.effet.nom, m.effet.milieu.resolution, m.effet.fin], ['arriere', 'foyer', false, 'air-essai', 128, 3]);
  assert.match(a.html, /data-milieu="air-essai"[^>]*data-pm-milieu="0"/);
  assert.equal(a.effets[0].effet.couplage.vent, true);
  // Sans data-dur : jusqu'à la fin de la scène (comme un fond) ; calque avant possible.
  const r = preparerMilieux('<section data-scene="s"><div data-milieu="air-essai" data-calque="avant"></div></section>', { scene: 's', projet: dir, bibliotheque: EFFETS });
  assert.deepEqual([r.erreurs, r.milieux[0].calque, r.milieux[0].sansDuree, r.milieux[0].scene], [[], 'avant', true, 's']);
  // Minuté même sans data-start (comme un effet).
  assert.deepEqual(extraireScene('<section data-scene="s"><div data-milieu="air-essai"></div></section>').elements.map((e) => e.milieu), ['air-essai']);
});

test('milieu à l\'assemblage : deux-milieux, milieu-invalide (recette d\'effet en data-milieu, milieu en data-effet, calque, ancre), couplage-sans-milieu', () => {
  const dir = projet([
    '  <div data-milieu="air-essai"></div>',
    '  <div id="second" data-milieu="air-essai"></div>',
    '  <div data-milieu="portees"></div>',
    '  <div data-effet="air-essai"></div>',
    '  <div data-milieu="air-essai" data-calque="milieu"></div>',
  ].join('\n'));
  const a = assembler2(dir);
  const erreurs = a.erreurs.filter((e) => e.gravite === 'erreur');
  assert.deepEqual(erreurs.map((e) => e.regle).sort(), ['deux-milieux', 'milieu-invalide', 'milieu-invalide', 'milieu-invalide']);
  const deux = erreurs.find((e) => e.regle === 'deux-milieux');
  assert.equal(deux.element, 'second');
  assert.match(deux.message, /Scène « etincelles » : un seul milieu par scène : « air-essai » est de trop \(le premier, « air-essai », est gardé\)\./);
  assert.ok(erreurs.some((e) => /« portees » n'est pas un milieu \(recette sans bloc « milieu »\) : un effet se pose avec data-effet="portees"/.test(e.message)));
  assert.ok(erreurs.some((e) => /« air-essai » est un milieu fluide : le poser avec data-milieu="air-essai" \(un par scène\), pas data-effet/.test(e.message)));
  assert.ok(erreurs.some((e) => /data-calque « milieu » : avant ou arriere/.test(e.message)));
  assert.equal(a.donnees.milieux.length, 1);
  assert.match(a.html, /data-pm-milieu-erreur="/);
  // Effet couplé sans milieu valide dans la scène : refusé, panneau sur sa balise.
  const sans = projet('  <div data-milieu="air-essai" data-ancre="#absent"></div>\n  <div data-effet="portees"></div>');
  const b = assembler2(sans);
  const regles = b.erreurs.filter((e) => e.gravite === 'erreur').map((e) => e.regle).sort();
  assert.deepEqual(regles, ['ancre-introuvable', 'couplage-sans-milieu']);
  const c = b.erreurs.find((e) => e.regle === 'couplage-sans-milieu');
  assert.match(c.message, /l'effet « portees » est couplé au milieu de la scène \(force « milieu », « structure\.milieu » ou « injecte »\), mais la scène n'en a pas/);
  assert.match(b.html, /data-effet="portees"[^>]*data-pm-effet-erreur="/);
});

test('contrôles : alerte budget-milieu au-delà de 512 cellules sur le grand côté', () => {
  const controler2 = (dir) => controler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const p = controler2(projet('  <div data-milieu="air-essai" data-reglages="resolution: 600"></div>')).problemes.filter((x) => x.regle === 'budget-milieu');
  assert.equal(p.length, 1);
  assert.equal(p[0].gravite, 'alerte');
  assert.match(p[0].message, /Scène « etincelles » : le milieu « air-essai » a 600 cellules sur le grand côté ; au-delà de 512, sa simulation dépasse son temps \(aperçu saccadé\)\. Baisser « resolution »/);
  assert.deepEqual(controler2(projet('  <div data-milieu="air-essai" data-reglages="resolution: 512"></div>')).problemes.filter((x) => x.regle === 'budget-milieu'), []);
});
