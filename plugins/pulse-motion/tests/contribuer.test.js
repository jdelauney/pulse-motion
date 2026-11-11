'use strict';
/* Chantiers F « Valorisation » et G « Documentation des contributeurs » (spec 2026-10-23-ameliorations-rapport-design.md, § 4) :
 * guides des contributeurs et architecture à la racine, page Contribuer du wiki, page Exemples (scénarios annoncés comme
 * tels), « Pourquoi Pulse Motion » sur l'accueil, et porte de publication passée sur le dépôt. Les chemins et les commandes
 * cités par les guides existent (documentation testée). Sautés quand le plugin est installé seul (pas de dépôt autour). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..');
const DEPOT = path.join(PLUGIN, '..', '..');
const lire = (...p) => fs.readFileSync(path.join(DEPOT, ...p), 'utf8');
const SEUL = !fs.existsSync(path.join(DEPOT, 'CONTRIBUTING.md')) && 'plugin installé seul (pas de dépôt autour)';
const GUIDES = ['CONTRIBUTING.md', 'CONTRIBUTING.en.md', 'ARCHITECTURE.md'];

// Dossiers et fichiers d'un projet vidéo ou du dossier personnel (~/.pulse-motion/), et noms de fichiers communs à plusieurs
// dossiers (une compétence, une bibliothèque) : cités, mais pas des chemins du dépôt.
const PROPRES = /^(?:PROVENANCE\.md|LICENCES\.md|SKILL\.md|\.pulse-motion|\.historique|sortie|voix|films|assets|charte|scenes|chartes|navigateur|whisper|essais|mesures|lexique\.md|encodeurs\.json|deroule\.json|exemple\.json|catalogue\.json|charte\.json|identite\.json|style\.css|polices|docs\/medias)(?:\/|$)/;
const OU = ['', 'outils', 'plugins/pulse-motion', 'plugins/pulse-motion/references', 'plugins/pulse-motion/scripts', 'plugins/pulse-motion/moteur'];

/** Chemins cités entre accents graves qui ressemblent à un fichier ou un dossier du dépôt. */
function cheminsCites(texte) {
  const vus = new Set();
  for (const m of texte.matchAll(/`([^`\s]+)`/g)) {
    const c = m[1].replace(/[),.;:]+$/, '');
    if (!/\//.test(c) && !/\.(?:md|js|mjs|json|css|html|yml)$/.test(c)) continue;
    if (/[<>*…#~@:]|^https?:|^--|^\/|X\.Y\.Z/.test(c) || PROPRES.test(c)) continue;
    vus.add(c);
  }
  return [...vus];
}
const existe = (c) => OU.some((o) => fs.existsSync(path.join(DEPOT, o, c)));

test('contribuer : CONTRIBUTING.md, CONTRIBUTING.en.md et ARCHITECTURE.md à la racine, reliés entre eux et au README', { skip: SEUL }, () => {
  for (const g of GUIDES) assert.ok(fs.existsSync(path.join(DEPOT, g)), g);
  const fr = lire('CONTRIBUTING.md');
  const en = lire('CONTRIBUTING.en.md');
  assert.match(fr, /\(CONTRIBUTING\.en\.md\)/);
  assert.match(en, /\(CONTRIBUTING\.md\)/);
  assert.match(fr, /\(ARCHITECTURE\.md\)/);
  const readme = lire('README.md');
  for (const g of GUIDES) assert.ok(readme.includes(`(${g})`), `README → ${g}`);
});

test('contribuer : le guide dit installer, tester, les règles et comment ajouter un style, un effet, un mouvement, un modèle', { skip: SEUL }, () => {
  const fr = lire('CONTRIBUTING.md');
  for (const t of ['## Installer le dépôt', '## Lancer les tests', '## Les règles', '## Ajouter un style', '## Ajouter un effet de particules', '## Ajouter un mouvement au dictionnaire', '## Ajouter un modèle de vidéo']) {
    assert.ok(fr.includes(t), t);
  }
  for (const regle of [/npm test/, /Aucune dépendance npm/, /plugin\.json.*package\.json/, /français/, /Typographie française/, /THIRD-PARTY-NOTICES\.md/, /outils\/publication\/porte\.js/]) assert.match(fr, regle);
});

test('contribuer : la version anglaise suit le plan de la française (mêmes sections, mêmes blocs de commandes)', { skip: SEUL }, () => {
  const sections = (t) => t.split('\n').filter((l) => /^## /.test(l)).length;
  const blocs = (t) => [...t.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\s+#.*$/gm, '').trim());
  const fr = lire('CONTRIBUTING.md');
  const en = lire('CONTRIBUTING.en.md');
  assert.equal(sections(en), sections(fr));
  assert.deepEqual(blocs(en).map((b) => b.replace(/<[^>]+>/g, '<…>')), blocs(fr).map((b) => b.replace(/<[^>]+>/g, '<…>')));
});

test('architecture : un résumé en anglais en tête, puis la chaîne, la charte, les conventions, les médias et les données personnelles', { skip: SEUL }, () => {
  const a = lire('ARCHITECTURE.md');
  const premiere = a.indexOf('\n## ');
  assert.ok(a.slice(premiere).startsWith('\n## In English'), 'résumé anglais d\'abord');
  for (const t of ['deroule.json', 'scripts/assembler.js', 'moteur/horloge.js', 'scripts/controler.js', 'scripts/export-fidele.js', '--c-primaire-lisible', 'cqh', 'data-ton', '~/.pulse-motion/', 'references/moteur.md']) {
    assert.ok(a.includes(t), t);
  }
});

test('contribuer : chaque fichier ou dossier cité par les guides existe', { skip: SEUL }, () => {
  for (const g of GUIDES) {
    const absents = cheminsCites(lire(g)).filter((c) => !existe(c));
    assert.deepEqual(absents, [], `${g} cite des chemins absents`);
  }
});

test('contribuer : chaque script lancé par « node » dans les guides existe', { skip: SEUL }, () => {
  for (const g of GUIDES) {
    for (const m of lire(g).matchAll(/node (?:--test )?((?:[\w.-]+\/)+[\w.-]+\.js)/g)) {
      assert.ok(existe(m[1]), `${g} : node ${m[1]}`);
    }
  }
});

test('wiki : la page Contribuer renvoie aux trois guides et figure dans le pied de chaque page', { skip: SEUL }, () => {
  const page = lire('docs', 'contribuer.html');
  for (const g of GUIDES) assert.ok(page.includes(`github.com/jdelauney/pulse-motion/blob/main/${g}`), g);
  assert.match(lire('docs', 'js', 'gabarit.js'), /href: racine \+ "contribuer\.html"/);
});

test('wiki : la page Exemples est dans la navigation, juste après Idées', { skip: SEUL }, () => {
  const d = lire('docs', 'js', 'donnees.js');
  const hrefs = [...d.matchAll(/"href": "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs[hrefs.indexOf('idees.html') + 1], 'exemples.html');
});

test('exemples : les scénarios d\'usage sont annoncés comme tels, pas comme des témoignages', { skip: SEUL }, () => {
  const page = lire('docs', 'exemples.html');
  const scenarios = page.slice(page.indexOf('<section id="scenarios">'));
  assert.match(scenarios, /Des scénarios, pas des témoignages/);
  assert.equal((scenarios.match(/<h3>/g) || []).length, 3);
  for (const t of [/Claire, formatrice/, /créateur solo/, /petite agence/]) assert.match(scenarios, t);
  for (const quoi of [/<strong>Ce qu'(?:il|elle) fait\.<\/strong>/g, /<strong>Les commandes\.<\/strong>/g, /<strong>Le temps passé\.<\/strong>/g]) {
    assert.equal((scenarios.match(quoi) || []).length, 3, String(quoi));
  }
});

test('accueil : la section « Pourquoi Pulse Motion » dit le problème, les trois façons de faire et ce qui change', { skip: SEUL }, () => {
  const html = lire('docs', 'index.html');
  const i = html.indexOf('<section class="section conteneur" id="pourquoi">');
  assert.ok(i > 0);
  const section = html.slice(i, html.indexOf('</section>', i));
  assert.equal((section.match(/class="carte revele"/g) || []).length, 3, 'trois façons de faire');
  assert.match(section, /Ce que Pulse Motion change/);
  assert.match(section, /href="exemples\.html"/);
});

test('wiki : aucune commande de terminal sur les pages Exemples, Contribuer et l\'accueil', { skip: SEUL }, () => {
  for (const page of ['exemples.html', 'contribuer.html', 'index.html']) {
    const html = lire('docs', page).replace(/<pre class="commande"><code>(?:\/plugin|claude plugin)[^<]*<\/code><\/pre>/g, '');
    assert.doesNotMatch(html, /<code>(?:node|npm|git|cd|pulse-motion) /, page);
  }
});

test('porte de publication : aucun chemin de cet ordinateur ni secret dans les fichiers suivis du dépôt', { skip: (SEUL || !fs.existsSync(path.join(DEPOT, '.git'))) && 'pas de dépôt git autour' }, () => {
  const porte = require(path.join(DEPOT, 'outils', 'publication', 'porte.js'));
  const problemes = porte.verifierDepot(DEPOT);
  assert.deepEqual(problemes.map(porte.decrire), []);
});
