'use strict';
/* Spec « Regard et réalisation » (S2), plan S2-1, exigence 5.15 : la documentation dit vrai. Les noms des règles, les
 * seuils, les commandes et les renvois cités dans les références et les consignes sont vérifiés contre le code, par
 * extraction (aucun registre tenu à la main). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const SEUILS = JSON.parse(lire('scripts', 'seuils.json'));

const { reglesDuCode, fichiers, rel } = require('./aide/regles.js');

const DOCS = [...fichiers(path.join(RACINE, 'references'), ['.md']), ...fichiers(path.join(RACINE, 'agents'), ['.md'])];
const CONSIGNES = [...DOCS, ...fichiers(path.join(RACINE, 'skills'), ['.md'])];

/** Règles citées par controles.md : première colonne des tableaux de règles, et noms à tiret du paragraphe « Autres règles ». */
function reglesDocumentees() {
  const t = lire('references', 'controles.md');
  const r = new Set();
  for (const l of t.split('\n')) {
    const m = /^\| (`[a-z][^|]*`) \|/.exec(l);
    if (m) for (const x of m[1].matchAll(/`([a-z][a-z0-9-]*)`/g)) r.add(x[1]);
  }
  const autres = t.slice(t.indexOf('## Autres règles'));
  const paragraphe = autres.split('\n\n')[1];
  for (const x of paragraphe.matchAll(/`([a-z]+(?:-[a-z0-9]+)+)`/g)) r.add(x[1]);
  return r;
}

test('documentation.test.js › chaque règle du code est dans controles.md, et réciproquement', () => {
  const code = reglesDuCode();
  const doc = reglesDocumentees();
  assert.ok(code.size > 90, `${code.size} règles extraites du code`);
  const absentes = [...code.keys()].filter((r) => !doc.has(r));
  assert.deepEqual(absentes, [], `règles du code absentes de controles.md : ${absentes.map((r) => `${r} (${code.get(r)})`).join(', ')}`);
  const inconnues = [...doc].filter((r) => !code.has(r));
  assert.deepEqual(inconnues, [], `règles de controles.md absentes du code : ${inconnues.join(', ')}`);
});

/** Seuils cités : « <valeur> <unité> (`clé`) », la valeur étant le dernier nombre avant la parenthèse ; un pourcentage se
 *  compare à la valeur × 100, un rapport « 4,5:1 » à 4,5. -> [{ fichier, ligne, cle, valeur, pourcent }] */
function seuilsCites(texte, fichier) {
  const r = [];
  texte.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/(\d+(?:[  ]\d{3})*(?:,\d+)?)(\s?%|:1)?[^\d(`|\n]{0,60}\(`([a-z]+(?:[A-Z][a-z0-9]*)*)`\)/g)) {
      if (!(m[3] in SEUILS) && !/[A-Z]/.test(m[3])) continue; // un mot en minuscules entre parenthèses n'est un seuil que s'il en est un
      r.push({ fichier, ligne: i + 1, cle: m[3], valeur: Number(m[1].replace(/[  ]/g, '').replace(',', '.')), pourcent: (m[2] || '').trim() === '%' });
    }
  });
  return r;
}

/** DEFAUTS recopiés dans une page du moteur (mesures.js, pixels.js). */
function defauts(...p) {
  const m = /var DEFAUTS = (\{[\s\S]*?\});/.exec(lire(...p));
  assert.ok(m, `DEFAUTS de ${p.join('/')}`);
  return Function(`return ${m[1]};`)();
}

test('documentation.test.js › chaque seuil cité égale seuils.json ; DEFAUTS de mesures.js et pixels.js aussi', () => {
  const cites = DOCS.flatMap((f) => seuilsCites(fs.readFileSync(f, 'utf8'), rel(f)));
  assert.ok(cites.length > 40, `${cites.length} seuils cités`);
  for (const c of cites) {
    assert.ok(c.cle in SEUILS, `${c.fichier}:${c.ligne} : clé « ${c.cle} » absente de seuils.json`);
    const attendu = c.pourcent ? Math.round(SEUILS[c.cle] * 100 * 1e6) / 1e6 : SEUILS[c.cle];
    assert.equal(c.valeur, attendu, `${c.fichier}:${c.ligne} : ${c.cle} vaut ${attendu}${c.pourcent ? ' %' : ''}, la prose dit ${c.valeur}`);
  }
  for (const p of [['moteur', 'mesures.js'], ['moteur', 'pixels.js']]) {
    for (const [cle, v] of Object.entries(defauts(...p))) {
      assert.ok(cle in SEUILS, `${p.join('/')} : ${cle} absente de seuils.json`);
      assert.equal(v, SEUILS[cle], `${p.join('/')} : ${cle} = ${v}, seuils.json = ${SEUILS[cle]}`);
    }
  }
  // sousTitreMin passe du code à seuils.json, à valeur égale.
  assert.equal(SEUILS.sousTitreMin, 1.25);
  assert.equal(defauts('moteur', 'mesures.js').sousTitreMin, 1.25);
  assert.doesNotMatch(lire('moteur', 'mesures.js'), /< 1\.25|besoin: 1\.25/);
});

test('documentation.test.js › chaque clé de seuils.json est citée dans controles.md', () => {
  const t = lire('references', 'controles.md');
  const cites = new Set(seuilsCites(t, 'controles.md').map((c) => c.cle));
  const absentes = Object.keys(SEUILS).filter((k) => !cites.has(k));
  assert.deepEqual(absentes, [], `clés non citées au format « valeur unité (\`clé\`) » : ${absentes.join(', ')}`);
});

/** Commandes de pulse-motion : les scripts de pm.js et les commandes qu'il traite lui-même. */
function commandes() {
  const pm = lire('scripts', 'pm.js');
  const bloc = /const SCRIPTS = \{([\s\S]*?)\};/.exec(pm)[1];
  const r = new Set([...bloc.matchAll(/^\s*'?([a-z-]+)'?:/gm)].map((m) => m[1]));
  for (const m of pm.matchAll(/commande === '([a-z-]+)'/g)) r.add(m[1]);
  return r;
}

/** Titres d'une référence (tronc et parties). */
function titresReference(nom) {
  const fichier = path.join(RACINE, 'references', `${nom}.md`);
  if (!fs.existsSync(fichier)) return null;
  const textes = [fs.readFileSync(fichier, 'utf8')];
  const dossier = path.join(RACINE, 'references', nom);
  if (fs.existsSync(dossier) && fs.statSync(dossier).isDirectory()) for (const f of fs.readdirSync(dossier)) if (f.endsWith('.md')) textes.push(fs.readFileSync(path.join(dossier, f), 'utf8'));
  return textes.join('\n').split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#+ /, '').trim());
}

test('documentation.test.js › chaque commande citée existe ; chaque renvoi de section mène à un titre', () => {
  const connues = commandes();
  assert.ok(connues.has('planche') && connues.has('reference') && connues.has('controler'));
  let renvois = 0;
  for (const f of CONSIGNES) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/pulse-motion ([a-z][a-z-]*)/g)) assert.ok(connues.has(m[1]), `${rel(f)} : commande inconnue « pulse-motion ${m[1]} »`);
    for (const l of t.split('\n')) {
      // « `<référence>` § N » : une section numérotée « ## N. … » de la référence.
      for (const m of l.matchAll(/`?([a-z][a-z0-9/-]*)`? § (\d+)/g)) {
        const titres = titresReference(m[1]);
        if (!titres) continue;
        renvois++;
        assert.ok(titres.some((x) => x.startsWith(`${m[2]}. `)), `${rel(f)} : « ${m[1]} § ${m[2]} » ne mène à aucun titre`);
      }
      // « <référence>, section « X » », « section « X » de la référence <nom> », « (table « X ») » après une référence.
      for (const m of l.matchAll(/(?:pulse-motion reference |`)([a-z][a-z0-9/-]*)`?\s*(?:,|\(|:)?\s*(?:section|table|tableau) « ([^»]+) »/g)) {
        const titres = titresReference(m[1]);
        if (!titres) continue;
        renvois++;
        const cible = m[2].trim().replace(/…$/, '');
        assert.ok(titres.some((x) => x === m[2].trim() || x.startsWith(cible)), `${rel(f)} : « ${m[1]} », « ${m[2]} » : aucun titre`);
      }
      for (const m of l.matchAll(/section « ([^»]+) » de la référence ([a-z][a-z0-9/-]*)/g)) {
        const titres = titresReference(m[2]);
        assert.ok(titres, `${rel(f)} : référence « ${m[2]} » absente`);
        renvois++;
        assert.ok(titres.includes(m[1].trim()), `${rel(f)} : « ${m[1]} » absent de ${m[2]}`);
      }
    }
  }
  assert.ok(renvois >= 3, `${renvois} renvois vérifiés`);
});

test('documentation.test.js › les pages anglaises suivent le plan des françaises', { skip: !fs.existsSync(path.join(RACINE, '..', '..', 'docs', 'en')) && 'docs/en/ absent (chantier I)' }, () => {
  const fr = path.join(RACINE, '..', '..', 'docs');
  const en = path.join(fr, 'en');
  const plan = (t) => ({
    titres: [...t.matchAll(/<h([1-6])[^>]*>/g)].map((m) => m[1]).join(''),
    blocs: (t.match(/<pre\b/g) || []).length,
    liens: [...t.matchAll(/href="([^"#]+)/g)].map((m) => m[1]).filter((h) => !/^https?:/.test(h)).length,
  });
  for (const f of fs.readdirSync(en).filter((x) => x.endsWith('.html'))) {
    const source = path.join(fr, f);
    assert.ok(fs.existsSync(source), `${f} : page française absente`);
    assert.deepEqual(plan(fs.readFileSync(path.join(en, f), 'utf8')), plan(fs.readFileSync(source, 'utf8')), f);
  }
});
