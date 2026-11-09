'use strict';
/* Spec « Regard et réalisation » (S2), plan S2-3, exigence 5.1 : la doctrine de réalisation (references/realisation.md).
 * Le test des termes interdits de S10 la couvre déjà (references-s10.test.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reglesDuCode } = require('./aide/regles.js');
const { AXES } = require('../scripts/lib/relecture.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const SEUILS = JSON.parse(lire('scripts', 'seuils.json'));
const DOCTRINE = lire('references', 'realisation.md');

/** Section « ## N. … » de la doctrine (sans la suivante). */
function section(n) {
  const m = new RegExp(`\\n(## ${n}\\. [^\\n]*\\n[\\s\\S]*?)(?=\\n## |$)`).exec(`\n${DOCTRINE}`);
  assert.ok(m, `§ ${n}`);
  return m[1];
}

/** Lignes d'un tableau Markdown d'un texte : [[cellules]] (sans l'en-tête). */
function lignesTableau(texte) {
  const l = texte.split('\n').filter((x) => /^\|/.test(x));
  return l.slice(2).map((x) => x.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
}

const nomsDeRegles = (cellule) => [...cellule.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)+|[a-z]+)`/g)].map((m) => m[1]);

test('realisation.test.js › la référence réalisation commence par « L\'essentiel » et pèse au plus 14 000 octets', () => {
  assert.match(DOCTRINE, /^# .+\n\n## L'essentiel\n/);
  assert.ok(Buffer.byteLength(DOCTRINE) <= 14000, `${Buffer.byteLength(DOCTRINE)} o`);
  const essentiel = DOCTRINE.slice(DOCTRINE.indexOf("## L'essentiel"), DOCTRINE.indexOf('\n## 1. '));
  assert.equal(essentiel.split('\n').filter((l) => l.startsWith('- ')).length, 8, '8 lignes');
  for (const r of [/[Uu]ne idée/, /regarde une fois/, /[Rr]egarder avant de montrer/, /[Mm]esurer faute de voir/, /« Exemple »/, /genre `social`/, /seul tour/, /n'a pas été vérifié/]) assert.match(essentiel, r);
});

test('realisation.test.js › elle a les 15 sections numérotées du plan', () => {
  const titres = [...DOCTRINE.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(titres.map((t) => t[0]), Array.from({ length: 15 }, (_, i) => i + 1));
  const attendus = ['La posture', 'Les quatre cadrans', "Avant d'écrire le déroulé", "L'ouverture", 'Rythme et lecture', 'Mouvement et caméra',
    'Composition et couleur', "La vérité à l'écran", 'Les erreurs les plus vues', 'Clichés à éviter', 'Symptôme → mécanisme → correction',
    'Regarder avant de montrer', 'La relecture indépendante', 'Dire honnêtement', 'Genre social'];
  assert.deepEqual(titres.map((t) => t[1]), attendus);
  // La posture : six principes.
  assert.equal((section(1).match(/^\d\. /gm) || []).length, 6);
});

test('realisation.test.js › chaque seuil cité suivi de sa clé est égal à seuils.json', () => {
  let n = 0;
  DOCTRINE.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/([−-]?\d+(?:[  ]\d{3})*(?:,\d+)?)(\s?%|:1)?[^\d(`|\n]{0,60}\(`([a-z]+(?:[A-Z][a-z0-9]*)+)`\)/g)) {
      n++;
      assert.ok(m[3] in SEUILS, `ligne ${i + 1} : clé ${m[3]} absente`);
      const v = Number(m[1].replace(/[  ]/g, '').replace('−', '-').replace(',', '.'));
      const attendu = (m[2] || '').trim() === '%' ? Math.round(SEUILS[m[3]] * 100 * 1e6) / 1e6 : SEUILS[m[3]];
      assert.equal(v, attendu, `ligne ${i + 1} : ${m[3]}`);
    }
  });
  assert.ok(n >= 15, `${n} seuils cités avec leur clé`);
  // Les clés du relecteur et du regard sont citées, comme le veut la spec (5.19).
  for (const k of ['critiqueBarre', 'critiqueScenesMax', 'critiqueIntouche', 'regardPas', 'regardDecalage', 'regardVignettesMax', 'telephoneLargeur', 'accrocheMax', 'sousTitreMin']) {
    assert.match(DOCTRINE, new RegExp(`\\(\`${k}\`\\)`), k);
  }
});

test('realisation.test.js › les règles citées dans les §§ 9 et 11 existent dans le code', () => {
  const regles = reglesDuCode();
  const neuf = lignesTableau(section(9));
  assert.ok(neuf.length >= 8, '§ 9 : les erreurs les plus vues');
  const onze = lignesTableau(section(11));
  assert.ok(onze.length >= 20, `§ 11 : ${onze.length} lignes, 20 au moins`);
  // Numéros stables : 1, 2, 3… sans trou.
  assert.deepEqual(onze.map((l) => Number(l[0])), onze.map((_, i) => i + 1));
  let citees = 0;
  for (const [nom, cellule] of [...neuf.map((l) => ['§ 9', l[1]]), ...onze.map((l) => ['§ 11', l[4]])]) {
    assert.ok(/critique/.test(cellule) || nomsDeRegles(cellule).length, `${nom} : « ${cellule} » ne nomme ni règle ni critique`);
    for (const r of nomsDeRegles(cellule)) {
      citees++;
      assert.ok(regles.has(r), `${nom} : la règle « ${r} » n'existe pas dans le code`);
    }
  }
  assert.ok(citees >= 15, `${citees} règles citées`);
});

test('realisation.test.js › les 8 axes du § 13 sont ceux de agents/critique.md', () => {
  const ligne = section(13).split('\n').find((l) => l.startsWith('- **Huit axes**'));
  assert.ok(ligne, 'ligne des huit axes');
  const axes = [...ligne.slice(0, ligne.indexOf('(')).matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
  assert.deepEqual(axes, AXES);
  const critique = lire('agents', 'critique.md');
  const grille = lignesTableau(critique.slice(critique.indexOf('| Axe |'))).map((l) => l[0].replace(/`/g, ''));
  assert.deepEqual(grille, AXES);
});

test('realisation.test.js › le § 11 ne contient aucune phrase entre guillemets de la table des remarques de S4', () => {
  const onze = lignesTableau(section(11));
  // Symptômes d'image seulement : aucune phrase de la personne dans la colonne des symptômes.
  for (const l of onze) assert.doesNotMatch(l[1], /[«"]/, `symptôme ${l[0]} : « ${l[1]} »`);
  const remarques = path.join(RACINE, 'references', 'remarques.md');
  if (fs.existsSync(remarques)) {
    const phrases = [...fs.readFileSync(remarques, 'utf8').matchAll(/« ([^»]{4,}) »/g)].map((m) => m[1].trim());
    for (const p of phrases) assert.ok(!section(11).includes(p), `§ 11 : « ${p} » vient de la table des remarques`);
  }
});

test('realisation.test.js › §§ 9 et 10 recopiables dans la fiche du relecteur : sans code ni nom de contrôle interne', () => {
  for (const n of [9, 10]) {
    const s = section(n);
    for (const absent of [/<section|<div|data-|@scope|```/, /controle\.json|problemes|regle/]) assert.doesNotMatch(s, absent, `§ ${n}`);
  }
  const { sectionsDoctrine } = require('../scripts/regard.js');
  const recopie = sectionsDoctrine(path.join(RACINE, 'references', 'realisation.md'));
  assert.ok(recopie.startsWith('## 9. Les erreurs les plus vues'));
  assert.match(recopie, /\n## 10\. Clichés à éviter\n/);
  assert.doesNotMatch(recopie, /## 11\./);
});

test('realisation.test.js › cadrans du § 2 et faits du § 3 : les valeurs que le déroulé accepte', () => {
  const { CADRANS } = require('../scripts/lib/deroule.js');
  const table = lignesTableau(section(2).slice(section(2).indexOf('| Cadran |')));
  assert.deepEqual(table.map((l) => l[0].replace(/`/g, '')), Object.keys(CADRANS));
  for (const l of table) assert.deepEqual([...l[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]), CADRANS[l[0].replace(/`/g, '')]);
  assert.match(section(3), /`faits`/);
  assert.match(section(3), /"exemple": true/);
  assert.match(section(3), /AAAA, AAAA-MM ou AAAA-MM-JJ/);
});

test('realisation.test.js › la relecture : quand, modèle passé à l\'appel, un seul tour, la personne l\'emporte', () => {
  const s = section(13);
  assert.match(s, /dès 3 scènes, après le regard et avant l'aperçu/);
  assert.match(s, /Jamais à l'export/);
  assert.match(s, /Modèle passé à l'appel \(paramètre `model`\) : `sonnet`\. Jamais un modèle plus cher que celui de la session : si la session tourne déjà en Sonnet ou en Haiku, aucun paramètre\./);
  assert.match(s, /`aJour` vrai : relire `sortie\/regard\/critique\.json`, ne pas relancer/);
  assert.match(s, /sans seconde relecture/);
  assert.match(s, /La personne l'emporte/);
  assert.match(s, /`pulse-motion reference revue`/);
});
