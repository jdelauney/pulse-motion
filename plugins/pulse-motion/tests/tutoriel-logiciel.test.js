'use strict';
/* Spec S6, plan 5 (5.17) : le modèle « tutoriel logiciel » (scènes d'écran, déclinaison 9:16), son exemple filmé sur l'appli
 * d'essai (assemblé et contrôlé sans réseau, au plus 3 Mo), le tournage de l'exemple de bout en bout, les notices d'argo et la
 * documentation du wiki (fiche filmer, tutoriel, indexés et lisibles sans JavaScript). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { lireModele, validerModele, trouverModele, copierExemple } = require('../scripts/modeles.js');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const DEPOT = path.join(RACINE, '..', '..');
const WIKI = path.join(DEPOT, 'docs');
const EXEMPLE = path.join(RACINE, 'exemples', 'tutoriel-logiciel');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };

/** Poids d'un dossier, sous-dossiers compris (sans `exclu`). */
function poids(dossier, exclu = []) {
  return fs.readdirSync(dossier, { withFileTypes: true }).reduce((t, e) => {
    if (exclu.includes(e.name)) return t;
    const f = path.join(dossier, e.name);
    return t + (e.isDirectory() ? poids(f) : fs.statSync(f).size);
  }, 0);
}

// ---- Le modèle ------------------------------------------------------------------------------------------------------

test('modeles : tutoriel-logiciel est valide, scènes d\'écran comprises', () => {
  const m = lireModele('tutoriel-logiciel');
  assert.ok(m);
  assert.deepEqual(validerModele(m), []);
  assert.equal(m.genre, 'formation');
  assert.equal(m.format, '16:9');
  assert.equal(m.duree, 120);
  assert.deepEqual(m.styles, ['clair-pedagogique', 'minimal', 'tech-sombre']);
  assert.equal(m.musique.ambiance, 'calme');
  assert.equal(m.sousTitres, true);
  // Accroche, contexte, étapes filmées (consigne, suivre, projecteur), récapitulatif en liste, conclusion.
  assert.deepEqual(m.scenes.map((s) => s.type || (s.ecran ? 'ecran' : null)), ['ecran', 'titre', 'ecran', 'liste', 'conclusion']);
  assert.equal(m.scenes[0].duree, 3, 'le résultat final montré en 3 s');
  const etapes = m.scenes.find((s) => s.id === 'etapes');
  assert.equal(etapes.suivre, true);
  assert.ok(etapes.projecteur && etapes.textes.consigne);
  assert.match(etapes.etapes, /1 à 3 étapes/);
  // Variante « astuce en 30 s » : 9:16, 3 étapes, filmée sur téléphone.
  assert.equal(m.declinaison.format, '9:16');
  assert.equal(m.declinaison.duree, 30);
  assert.equal(m.declinaison.etapes, 3);
  assert.equal(m.declinaison.appareil, 'telephone');

  // Refus : une scène d'écran avec un type, sans étapes ; une déclinaison trop longue ou d'un format inconnu.
  const faux = structuredClone(m);
  faux.scenes[0].type = 'titre';
  delete faux.scenes[2].etapes;
  faux.scenes[2].suivre = 'oui';
  faux.declinaison.scenes[1].duree = 60;
  faux.declinaison.format = '21:9';
  faux.declinaison.appareil = 'montre';
  const err = validerModele(faux);
  for (const motif of [/n'a pas de « type »/, /« etapes » doit dire/, /« suivre » vaut true ou false/, /de la déclinaison durent/, /declinaison\.format/, /declinaison\.appareil/]) {
    assert.ok(err.some((e) => motif.test(e)), `${motif} : ${err.join('\n')}`);
  }
  // Une scène toute faite garde ses règles : un type inconnu reste refusé.
  const inconnu = structuredClone(m);
  inconnu.scenes[1].type = 'galerie';
  assert.ok(validerModele(inconnu).some((e) => /type inconnu « galerie »/.test(e)));
});

test('modeles : un sujet de tutoriel de logiciel choisit tutoriel-logiciel, une formation reste une formation', () => {
  for (const sujet of ['un tutoriel pour utiliser notre application', 'comment créer une facture dans app.exemple.fr', 'filme comment on crée une facture',
    'un tutoriel sur notre logiciel de paie', 'montre-moi sur l\'appli d\'essai comment on crée une facture']) {
    assert.equal(trouverModele(sujet)?.id, 'tutoriel-logiciel', sujet);
  }
  assert.equal(trouverModele('une formation sur notre nouvel outil').id, 'formation-courte');
  assert.equal(trouverModele('un tutoriel sur le lavage des mains').id, 'formation-courte', '« tutoriel » seul : une formation');
  assert.equal(trouverModele('présenter notre logiciel').id, 'presentation-produit');
});

// ---- L'exemple ------------------------------------------------------------------------------------------------------

test('exemple : tutoriel-logiciel s\'assemble et se contrôle sans erreur, sans réseau', () => {
  const dir = path.join(dossierTemporaire('pm-tutoriel-'), 'video');
  const copie = copierExemple('tutoriel-logiciel', dir);
  assert.equal(copie.ok, true, copie.message);
  assert.ok(!fs.existsSync(path.join(dir, 'appli')), 'l\'appli d\'essai ne fait pas partie de la vidéo');
  assert.ok(!fs.existsSync(path.join(dir, 'exemple.json')));
  const a = assembler({ dossier: dir });
  assert.deepEqual(a.erreurs, []);
  assert.deepEqual(controler({ dossier: dir }).problemes, []);
  const html = fs.readFileSync(a.fichier, 'utf8');
  assert.doesNotMatch(html, /(src|href)\s*=\s*["']https?:/, 'aucune ressource internet');
  assert.match(html, /id="pm-film-factures"/, 'le film est embarqué');

  // Déroulé : 30 s environ, la structure du modèle (les scènes filmées qui se suivent tiennent la place de sa scène d'écran).
  const m = lireModele('tutoriel-logiciel');
  const d = JSON.parse(fs.readFileSync(path.join(EXEMPLE, 'deroule.json'), 'utf8'));
  const total = d.scenes.reduce((t, s) => t + s.duree, 0);
  assert.ok(total >= 28 && total <= 34, `${total} s`);
  const genres = d.scenes.map((s) => s.type || (s.film ? 'ecran' : 'composee')).filter((g, i, l) => g !== 'ecran' || l[i - 1] !== 'ecran');
  assert.deepEqual(genres, m.scenes.map((s) => s.type || 'ecran'));
  // Le film : 4 étapes, la prise choisie, toutes montrées.
  const parcours = JSON.parse(fs.readFileSync(path.join(EXEMPLE, 'films', 'factures', 'parcours.json'), 'utf8'));
  assert.equal(parcours.etapes.length, 4);
  assert.equal(parcours.depart.split('/')[0], 'appli-essai', 'filmé sur l\'appli d\'essai, en local');
  const film = JSON.parse(fs.readFileSync(path.join(EXEMPLE, 'films', 'factures', parcours.prise, 'film.json'), 'utf8'));
  assert.equal(film.etapes.length, 4);
  assert.deepEqual(fs.readdirSync(path.join(EXEMPLE, 'films', 'factures')).filter((f) => f.startsWith('prise-')), [parcours.prise], 'une seule prise gardée');
  // Au plus 3 Mo (l'appli d'essai, servie par le plugin, à part).
  const p = poids(EXEMPLE, ['appli']);
  assert.ok(p <= 3 * 1024 * 1024, `${(p / 1024 / 1024).toFixed(2)} Mo`);
  // La séance : la réponse à « Que montre-t-on ? », sans voix.
  const recit = JSON.parse(fs.readFileSync(path.join(EXEMPLE, 'exemple.json'), 'utf8'));
  assert.equal(recit.modele, 'tutoriel-logiciel');
  assert.match(recit.reponses.montre, /^L'application/);
});

test('exemple : tutoriel-logiciel, aucune requête autre que data:, file: ou 127.0.0.1 à la lecture de la vidéo', { ...SANS, timeout: 120000 }, async () => {
  const { ouvrirPage } = require('../scripts/lib/cdp.js');
  const dir = dossierTemporaire('pm-tutoriel-');
  fs.cpSync(EXEMPLE, dir, { recursive: true, filter: (f) => !/[\\/]appli([\\/]|$)/.test(f) });
  const a = assembler({ dossier: dir });
  const page = await ouvrirPage({ navigateur, largeur: 960, hauteur: 540 });
  const adresses = [];
  try {
    page.sur('Network.requestWillBeSent', (x) => adresses.push(x.request.url));
    await page.envoyer('Network.enable');
    await page.aller(pathToFileURL(a.fichier).href);
    for (const t of [1, 4, 10, 16, 20, 26]) await page.evaluer(`(async function () { await M.seek(${t}); return true; })()`);
  } finally { await page.fermer(); }
  assert.deepEqual(adresses.filter((u) => !/^(data:|file:|blob:|about:|http:\/\/127\.0\.0\.1[:/])/.test(u)), []);
});

test('exemple : l\'application de démonstration se filme de bout en bout dans les tests (parcours de l\'exemple)', { ...SANS, timeout: 180000 }, async () => {
  const { tourner } = require('../scripts/lib/tournage.js');
  const dir = dossierTemporaire('pm-tutoriel-');
  fs.mkdirSync(path.join(dir, 'films', 'factures'), { recursive: true });
  const parcours = JSON.parse(fs.readFileSync(path.join(EXEMPLE, 'films', 'factures', 'parcours.json'), 'utf8'));
  delete parcours.prise;
  fs.writeFileSync(path.join(dir, 'films', 'factures', 'parcours.json'), JSON.stringify(parcours));
  const progression = [];
  const r = await tourner({ projet: dir, nom: 'factures', navigateur, surEtape: (x) => progression.push(x) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.etapes, 4);
  assert.deepEqual(progression.filter((x) => x.etape).map((x) => x.etape).filter((n, i, l) => l.indexOf(n) === i), [1, 2, 3, 4]);
  const film = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'factures', r.prise, 'film.json'), 'utf8'));
  // La dernière étape mène au message « Facture enregistrée », comme dans l'exemple.
  assert.ok(film.etapes[3].reaction.length > 0);
  assert.ok(r.poids < 3 * 1024 * 1024, `${r.poids} o`);
});

// ---- Notices --------------------------------------------------------------------------------------------------------

test('notices : argo et ses deux sources amont sont citées dans les deux THIRD-PARTY-NOTICES.md', () => {
  const plugin = fs.readFileSync(path.join(RACINE, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(fs.readFileSync(path.join(DEPOT, 'THIRD-PARTY-NOTICES.md'), 'utf8'), plugin, 'les deux notices sont identiques');
  for (const x of ['## argo', 'Copyright (c) 2026 Shreyas Karnik', 'CloverLabsAI/human-cursor', 'feder-cr/invisible_playwright', 'Vincent Schmalbach', 'Niaz Morshed']) assert.ok(plugin.includes(x), x);
  assert.match(fs.readFileSync(path.join(RACINE, 'vendor', 'mediabunny', 'PROVENANCE.md'), 'utf8'), /import/i, 'Mediabunny : usage pour l\'import');
});

// ---- Wiki -----------------------------------------------------------------------------------------------------------

test('wiki : la fiche filmer et le tutoriel sont indexés et lisibles sans JavaScript', { skip: !fs.existsSync(WIKI) && 'wiki absent' }, () => {
  const lirePage = (f) => fs.readFileSync(path.join(WIKI, f), 'utf8');
  const index = lirePage(path.join('js', 'index-recherche.js'));
  const entrees = JSON.parse(index.slice(index.indexOf('=') + 1).trim().replace(/;$/, ''));
  const pages = {
    'commandes/filmer.html': ['description', 'arguments', 'risques', 'problemes', 'exemples'],
    'tutoriels/filmer-un-logiciel.html': ['parcours', 'connexion', 'flouter', 'prise', 'ordinateur', 'importer'],
  };
  for (const [url, sections] of Object.entries(pages)) {
    for (const id of sections) assert.ok(entrees.some((e) => e.u === url && e.a === id && e.x.length > 100), `${url}#${id} indexé`);
    const html = lirePage(url);
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    // Lisible sans JavaScript : le contenu est dans la page (aucun texte écrit par un script), et aucune commande montrée.
    assert.ok((main.match(/<section id="/g) || []).length >= sections.length, url);
    assert.doesNotMatch(main, /data-role="outil"/, `${url} : aucune ligne de commande dans les conversations`);
    assert.doesNotMatch(main.replace(/\/pulse-motion:[a-z-]+/g, ''), /pulse-motion [a-z]/, `${url} : aucune commande`);
    assert.doesNotMatch(main, /parcours\.json|film\.json|<script/, url);
  }
  // Indexé dans le reste du wiki : la commande, l'assistant (y compris sans JavaScript), les concepts, les deux index.
  assert.match(lirePage(path.join('js', 'donnees.js')), /"nom": "filmer",\n\s+"etape": "creer"/);
  assert.match(lirePage('quelle-commande.html'), /href="commandes\/filmer\.html"/);
  assert.match(lirePage(path.join('js', 'quelle-commande.js')), /commande: "filmer"/);
  assert.match(lirePage('concepts.html'), /<section id="confidentialite">\n<h2>Confidentialité<\/h2>/);
  assert.match(lirePage(path.join('commandes', 'index.html')), /href="filmer\.html"/);
  assert.match(lirePage(path.join('tutoriels', 'index.html')), /href="filmer-un-logiciel\.html"/);
  assert.match(lirePage('idees.html'), /id="modele-tutoriel-logiciel"/);
  // La description de la fiche est celle de la compétence.
  const desc = fs.readFileSync(path.join(RACINE, 'skills', 'filmer', 'SKILL.md'), 'utf8').match(/^description: "(.*)"$/m)[1];
  assert.ok(lirePage(path.join('commandes', 'filmer.html')).includes(`<p class="chapo">${desc}</p>`));
});
