'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { preparerEffets } = require('../scripts/lib/effets.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const DESINT = { version: 1, nom: 'desint', emetteurs: [{ nom: 'g', naissance: { forme: { type: 'pixels' } }, vie: { couleur: 'source' }, rendu: { texture: 'pixel', melange: 'alpha' } }] };
const META = { version: 1, nom: 'meta', emetteurs: [{ nom: 'g', naissance: { forme: { type: 'pixels' } }, cible: { source: 'cible' }, vie: { couleur: 'source' } }] };
const ASSEMBLE = { version: 1, nom: 'assemble', emetteurs: [{ nom: 'g', naissance: { forme: { type: 'rectangle', largeur: 100, hauteur: 60 } }, cible: {} }] };

test('assemblage : data-cible, cible-introuvable, metamorphose-sans-cible, ancre-vide', () => {
  const biblio = dossierTemporaire('pm-frag-biblio-');
  const projet = dossierTemporaire('pm-frag-projet-');
  ecrire(biblio, 'desint.json', DESINT);
  ecrire(biblio, 'meta.json', META);
  ecrire(biblio, 'assemble.json', ASSEMBLE);
  const html = `<section data-scene="s"><h1 id="a"></h1><h2 id="b"></h2>
  <div data-effet="meta" data-ancre="#a" data-cible="#b"></div>
  <div data-effet="meta" data-ancre="#a" data-cible="#zz"></div>
  <div data-effet="meta" data-ancre="#a"></div>
  <div data-effet="desint"></div>
  <div data-effet="desint" data-ancre="#a" data-cible="b"></div>
  <div data-effet="assemble"></div>
  <div data-effet="desint" data-ancre="#b"></div>
</section>`;
  const r = preparerEffets(html, { scene: 's', projet, bibliotheque: biblio });
  assert.deepEqual(r.effets.map((e) => [e.ordre, e.ancre, e.cible]), [[0, 'a', 'b'], [6, 'b', null]]);
  assert.deepEqual(r.erreurs.map((e) => e.regle), ['cible-introuvable', 'metamorphose-sans-cible', 'ancre-vide', 'cible-introuvable', 'ancre-vide']);
  assert.ok(r.erreurs.every((e) => e.gravite === 'erreur' && e.scene === 's'));
  assert.match(r.erreurs[0].message, /Scène « s » : data-cible « #zz » ne désigne aucun élément de la scène \(forme attendue : #id\)\./);
  assert.match(r.erreurs[1].message, /l'effet « meta » transforme son ancre en un autre élément : data-cible="#id" attendu/);
  assert.match(r.erreurs[2].message, /l'effet « desint » photographie son ancre : data-ancre="#id" attendu \(rien à photographier sans elle\)\./);
  assert.match(r.erreurs[3].message, /data-cible « b » ne désigne aucun élément/);
  assert.equal((r.html.match(/data-pm-effet-erreur=/g) || []).length, 5);
});

test('assemblage : cible dans M.donnees.effets, fragments.js dans la page', () => {
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'effets/meta.json', META);
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <h1 id="titre" data-texte="titre" data-start="0"></h1>
  <div id="autre" data-start="0"></div>
  <div data-effet="meta" data-ancre="#titre" data-cible="#autre" data-start="1" data-dur="1"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs, []);
  const d = JSON.parse(/<script type="application\/json" id="pm-donnees">([^<]*)<\/script>/.exec(a.html)[1]);
  assert.deepEqual([d.effets[0].ancre, d.effets[0].cible], ['titre', 'autre']);
  assert.ok(a.html.includes('racine.M.fragments = api'), 'fragments.js embarqué');
  assert.ok(a.html.indexOf('racine.M.fragments = api') < a.html.indexOf('P.Simulation = Simulation'), 'avant la simulation');
});
