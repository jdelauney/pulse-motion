'use strict';
/* Spec Rendu et export, 5.20 : crédits joints à chaque export, sources des fichiers importés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const L = require('../scripts/lib/livrables.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { miniProjet } = require('./aide/mini-projet.js');

const lire = (dir) => lireDeroule(dir).deroule;

test('credits.test.js › chaque police embarquée a sa licence tirée de LICENCES.md', () => {
  // Les deux rédactions des LICENCES.md livrés : lignes « - Licence : » (chaleureux), texte libre (clair-pedagogique).
  for (const style of ['chaleureux', 'clair-pedagogique']) {
    const dir = miniProjet({ style, scenes: [{ id: 'a', html: '<h1 data-texte="titre"></h1>', textes: { titre: 'Bonjour' } }] });
    const a = assembler({ dossier: dir, ecrire: false });
    assert.equal(a.ok, true, a.erreurs.map((e) => e.message).join(' '));
    assert.ok(a.detailPolices.length >= 1, `${style} : le style embarque ses polices`);
    const { texte, aPreciser } = L.credits({ projet: dir, deroule: lire(dir), assemblage: a });
    assert.deepEqual(aPreciser, [], style);
    for (const p of a.detailPolices) {
      const licences = fs.readFileSync(path.join(path.dirname(p.fichiers[0]), 'LICENCES.md'), 'utf8');
      const section = licences.split(/^## /m).find((s) => s.split('\n')[0].trim() === p.famille);
      const ecrite = /^- Licence : (.+)$/m.exec(section);
      const licence = ecrite ? ecrite[1].trim() : /licensed under the ([^\n]+?)\.?\s*$/m.exec(section)[1].trim();
      const ligne = texte.split('\n').find((l) => l.startsWith(`- ${p.famille}`));
      assert.ok(ligne, `${style}, ${p.famille} absente des crédits`);
      assert.ok(ligne.includes(licence), `${style}, ${p.famille} : licence « ${licence} » absente de « ${ligne} »`);
      assert.match(ligne, /\((titres|texte)/, `${p.famille} : rôle`);
      assert.match(ligne, /source : /, `${p.famille} : source`);
    }
  }
});

test('credits.test.js › fichier importé sans source : ligne à préciser, compté dans le résultat ; avec sa source : citée', () => {
  const dir = copierProjet('projet-simple');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(a.ok, true);
  const avant = L.credits({ projet: dir, deroule: lire(dir), assemblage: a });
  assert.ok(avant.aPreciser.includes('assets/logo.svg'), JSON.stringify(avant.aPreciser));
  assert.match(avant.texte, /- assets\/logo\.svg : source et licence à préciser/);
  assert.equal(L.noterSource({ projet: dir, fichier: 'assets/logo.svg', source: 'Notre entreprise', licence: 'usage interne', auteur: 'Service communication' }).ok, true);
  const apres = L.credits({ projet: dir, deroule: lire(dir), assemblage: a });
  assert.ok(!apres.aPreciser.includes('assets/logo.svg'));
  assert.match(apres.texte, /- assets\/logo\.svg : Notre entreprise, usage interne, Service communication/);
  // Écrits à chaque export (ecrireLivrables), dans sortie/<titre>-credits.txt.
  const l = L.ecrireLivrables({ projet: dir, deroule: lire(dir), assemblage: a, usage: { fichiers: ['credits'] } });
  assert.equal(l.fichiers.credits, 'sortie/la-chaine-du-froid-credits.txt');
  assert.ok(fs.readFileSync(path.join(dir, l.fichiers.credits), 'utf8').includes('Notre entreprise'));
  assert.deepEqual(l.creditsAPreciser, apres.aPreciser);
});

test('credits.test.js › musique composée : mention libre de droits ; musique importée : sa source ou à préciser', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.musique = { generee: Object.keys(require('../moteur/synthe/catalogue.js').AMBIANCES)[0] }; });
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.match(L.credits({ projet: dir, deroule: lire(dir), assemblage: a }).texte, /Musique\n- composée par Pulse Motion, libre de droits, sans mention obligatoire/);
  const d = { ...lire(dir), musique: { fichier: 'assets/musique.mp3' } };
  const c = L.credits({ projet: dir, deroule: d, assemblage: a });
  assert.match(c.texte, /- fichier importé assets\/musique\.mp3 : source et licence à préciser/);
  assert.ok(c.aPreciser.includes('assets/musique.mp3'));
});

test('credits.test.js › rappel de responsabilité présent, version de Pulse Motion citée', () => {
  const dir = copierProjet('projet-simple');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const { texte } = L.credits({ projet: dir, deroule: lire(dir), assemblage: a });
  assert.ok(texte.includes(L.RAPPEL));
  assert.match(L.RAPPEL, /Vous êtes responsable des contenus que vous ajoutez/);
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;
  assert.ok(texte.includes(`Fabriqué avec Pulse Motion ${version} (licence MIT).`));
  for (const titre of ['Polices', 'Musique', 'Voix', 'Images et logos', 'Sons importés']) assert.match(texte, new RegExp(`^${titre}$`, 'm'), titre);
});

test('credits.test.js › credits noter : chemin hors de assets/ refusé, fichier absent refusé, commande pulse-motion credits', () => {
  const dir = copierProjet('projet-simple');
  for (const f of ['../x.png', 'deroule.json', path.join(dir, 'scenes', '01-intro.html'), 'assets/../deroule.json']) {
    const r = L.noterSource({ projet: dir, fichier: f, source: 's', licence: 'l' });
    assert.equal(r.ok, false, f);
    assert.match(r.message, /n'est pas dans le dossier assets\//, f);
  }
  assert.match(L.noterSource({ projet: dir, fichier: 'assets/absent.png', source: 's', licence: 'l' }).message, /introuvable/);
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'sources.json')), false);
  const { principal } = require('../scripts/credits.js');
  const r = principal([dir, 'noter', 'assets/photo.svg', 'Banque d\'images', 'CC0']);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'sources.json'), 'utf8')), { 'assets/photo.svg': { source: 'Banque d\'images', licence: 'CC0' } });
});
