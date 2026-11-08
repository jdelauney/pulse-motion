'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { listerModeles, lireModele, validerModele, trouverModele, copierExemple, stylesLivres } = require('../scripts/modeles.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const PM = path.join(__dirname, '..', 'scripts', 'pm.js');
const IDS = ['accueil', 'annonce', 'formation-courte', 'histoire', 'pitch', 'presentation-produit', 'publication-sociale'];
const GENRE = { 'formation-courte': 'formation', 'presentation-produit': 'produit', histoire: 'storytelling', 'publication-sociale': 'social', accueil: 'formation', pitch: 'produit', annonce: 'social' };

test('modeles : les sept modèles existent, valides, avec leur genre', () => {
  assert.deepEqual(listerModeles().map((m) => m.id), IDS);
  for (const id of IDS) {
    const m = lireModele(id);
    assert.deepEqual(validerModele(m), [], id);
    assert.equal(m.genre, GENRE[id], id);
  }
  assert.equal(lireModele('annonce').format, '9:16');
  assert.equal(lireModele('publication-sociale').format, '9:16');
  assert.equal(lireModele('../styles'), null);
});

test('modeles : validation des types, clés, mouvements, effets, transitions et durées', () => {
  const m = structuredClone(lireModele('pitch'));
  m.scenes[0].type = 'galerie';
  m.scenes[1].textes.slogan = 'une phrase';
  m.scenes[2].mouvements = ['999'];
  m.scenes[3].effet = 'arc-en-ciel';
  m.scenes[4].transition = 'tourbillon';
  m.scenes[5].duree = 1;
  const err = validerModele(m);
  assert.ok(err.some((e) => /type inconnu « galerie »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /clé de texte inconnue « slogan »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /mouvement introuvable « 999 »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /effet inconnu « arc-en-ciel »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /« transition »/.test(e)), err.join('\n'));
  assert.ok(err.some((e) => /au moins 1,5 s/.test(e)), err.join('\n'));
  const incomplet = structuredClone(lireModele('pitch'));
  delete incomplet.scenes[2].textes.legende;
  delete incomplet.scenes[4].textes.point3;
  const errIncomplet = validerModele(incomplet);
  assert.ok(errIncomplet.some((e) => /il manque la consigne de « legende »/.test(e)), errIncomplet.join('\n'));
  assert.ok(!errIncomplet.some((e) => /point3/.test(e)), 'les 3e et 4e points d\'une liste sont facultatifs');
  const long = structuredClone(lireModele('pitch'));
  long.scenes.push({ ...long.scenes[0], id: 'bis', duree: 30 });
  assert.ok(validerModele(long).some((e) => /±15 %/.test(e)));
});

test('modeles : styles conseillés connus (trois styles livrés, rendus en 9:16 comme en 16:9)', () => {
  const livres = stylesLivres();
  for (const m of listerModeles()) {
    assert.equal(m.styles.length, 3, m.id);
    for (const s of m.styles) assert.ok(livres.includes(s), `${m.id} : ${s}`);
  }
  const faux = structuredClone(lireModele('annonce'));
  faux.styles = ['energique', 'fluo', 'minimal'];
  assert.ok(validerModele(faux).some((e) => /Style inconnu « fluo »/.test(e)));
});

test('modeles : trouver le modèle d\'après le sujet', () => {
  assert.equal(trouverModele('pitch pour nos investisseurs').id, 'pitch');
  assert.equal(trouverModele('lancement de notre nouvelle offre').id, 'annonce');
  assert.equal(trouverModele('une vidéo de bienvenue pour les nouveaux arrivants').id, 'accueil');
  assert.equal(trouverModele('3 astuces pour Instagram').id, 'publication-sociale');
  assert.equal(trouverModele('la présentation de notre application').id, 'presentation-produit');
  assert.equal(trouverModele("l'histoire de notre association").id, 'histoire');
  assert.equal(trouverModele('une formation sur les gestes barrières').id, 'formation-courte');
  // Le genre dit par un mot fort l'emporte sur un mot qui ne fait que le suggérer.
  const cas = {
    'une formation sur notre nouvel outil': 'formation-courte',
    'un tutoriel pour utiliser notre application': 'formation-courte',
    "une vidéo de bienvenue pour les nouveaux adhérents : horaires d'ouverture et règles du club": 'accueil',
    "une vidéo d'accueil pour expliquer l'inscription à la médiathèque": 'accueil',
    "une vidéo de prise en main : comment lancer l'application": 'accueil',
    'une formation aux premiers secours pour les bénévoles du salon': 'formation-courte',
    'un cas réel de sécurité au travail': 'formation-courte',
    'une vidéo pour les nouveaux employés': 'accueil',
    'pitcher notre projet': 'pitch',
    'présenter mon salon de coiffure': 'presentation-produit',
  };
  for (const [sujet, id] of Object.entries(cas)) assert.equal(trouverModele(sujet)?.id, id, sujet);
});

test('modeles : trouver sans correspondance rend null', () => {
  assert.equal(trouverModele('anniversaire de ma grand-mère'), null);
  assert.equal(trouverModele(''), null);
  assert.equal(trouverModele('les résultats en temps réel'), null);
});

test('modeles : chaque phrase publiée (phrases et variantes) retrouve son propre modèle', () => {
  for (const m of listerModeles()) {
    for (const p of [...m.phrases, ...Object.values(m.variantes)]) {
      const t = trouverModele(p.replace(/^\/pulse-motion:creer /, ''));
      assert.equal(t && t.id, m.id, p);
    }
  }
});

test('exemple : copie dans un dossier vide', () => {
  const dir = path.join(dossierTemporaire('pm-modele-'), 'video');
  const r = copierExemple('formation-courte', dir);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.titre, 'La chaîne du froid');
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'exemples', 'chaine-du-froid', 'deroule.json'), 'utf8'));
  const copie = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  assert.equal(copie.scenes.length, source.scenes.length);
  assert.ok(!fs.existsSync(path.join(dir, 'sortie')));
  const pitch = path.join(dossierTemporaire('pm-modele-'), 'pitch');
  assert.equal(copierExemple('pitch', pitch).ok, true);
  assert.ok(fs.existsSync(path.join(pitch, 'deroule.json')));
  assert.ok(!fs.existsSync(path.join(pitch, 'exemple.json')), 'le récit de la séance ne fait pas partie de la vidéo');
  // Vidéo finie : déroulé et style déjà acceptés, reprendre passe à l'aperçu.
  const { etatProjet } = require('../scripts/etat.js');
  assert.equal(etatProjet(pitch).etape, 'apercu');
});

test('exemple : dossier déjà occupé refusé', () => {
  const dir = dossierTemporaire('pm-modele-');
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{"titre":"Ma vidéo"}');
  const r = copierExemple('formation-courte', dir);
  assert.equal(r.ok, false);
  assert.match(r.message, /contient déjà une vidéo/);
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), '{"titre":"Ma vidéo"}');
  assert.deepEqual(fs.readdirSync(dir), ['deroule.json']);
  const scenes = dossierTemporaire('pm-modele-');
  fs.mkdirSync(path.join(scenes, 'scenes'));
  fs.writeFileSync(path.join(scenes, 'scenes', '01-intro.html'), '<section></section>');
  assert.equal(copierExemple('formation-courte', scenes).ok, false, 'des scènes déjà là : refus');
  assert.equal(fs.readFileSync(path.join(scenes, 'scenes', '01-intro.html'), 'utf8'), '<section></section>');
});

test('exemple : modèle inconnu, la liste des modèles est donnée', () => {
  const r = copierExemple('cuisine', dossierTemporaire('pm-modele-'));
  assert.equal(r.ok, false);
  assert.match(r.message, /Modèle inconnu « cuisine »/);
  assert.match(r.message, /pitch/);
});

test('pm modeles : liste, afficher, trouver, exemple', () => {
  const liste = spawnSync(process.execPath, [PM, 'modeles', 'liste'], { encoding: 'utf8' });
  assert.equal(liste.status, 0, liste.stderr);
  assert.equal(JSON.parse(liste.stdout).length, 7);
  const fiche = spawnSync(process.execPath, [PM, 'modeles', 'afficher', 'pitch'], { encoding: 'utf8' });
  assert.equal(JSON.parse(fiche.stdout).genre, 'produit');
  const rien = spawnSync(process.execPath, [PM, 'modeles', 'trouver', 'anniversaire de ma grand-mère'], { encoding: 'utf8' });
  assert.equal(rien.status, 0, 'aucun modèle n\'est pas une erreur');
  assert.equal(rien.stdout.trim(), 'null');
  const dir = dossierTemporaire('pm-modele-');
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{}');
  const refus = spawnSync(process.execPath, [PM, 'modeles', 'exemple', 'pitch', dir], { encoding: 'utf8' });
  assert.equal(refus.status, 1);
  assert.equal(JSON.parse(refus.stdout).ok, false);
});
