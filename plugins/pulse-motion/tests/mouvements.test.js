'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { charger, trouver, chercher, referenceMarkdown } = require('../scripts/mouvements.js');
const { TRANSITIONS } = require('../moteur/transitions.js');
const { EFFETS: EFFETS_LETTRES } = require('../moteur/lettres.js');
const { analyserNom, variablesCSS } = require('../moteur/courbes.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const DICO = charger();
const NUMEROS = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'mouvements', 'numeros.json'), 'utf8'));
const CSS = fs.readFileSync(path.join(RACINE, 'moteur', 'mouvements.css'), 'utf8');
const VARIABLES_COURBES = variablesCSS();
const estHTML = (e) => e.recette.type !== 'transition';

test('dictionnaire : structure de chaque entrée', () => {
  const categories = DICO.categories.map((c) => c.id);
  const slugs = new Set();
  let precedent = 0;
  for (const e of DICO.mouvements) {
    const qui = `#${e.no} ${e.slug}`;
    assert.match(e.no, /^\d{3}$/, qui);
    assert.ok(Number(e.no) > precedent, `${qui} : numéros croissants`);
    precedent = Number(e.no);
    assert.match(e.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, qui);
    assert.ok(!slugs.has(e.slug), `${qui} : slug unique`);
    slugs.add(e.slug);
    assert.ok(categories.includes(e.categorie), `${qui} : catégorie`);
    for (const champ of ['sens', 'demande', 'quand']) assert.ok(typeof e[champ] === 'string' && e[champ].length > 5, `${qui} : ${champ}`);
    assert.ok(e.nom.fr && e.nom.metier, `${qui} : noms`);
    assert.ok(e.motsCles.length >= 3, `${qui} : mots-clés`);
    assert.match(e.demande, /\d/, `${qui} : la phrase-exemple donne une durée ou une quantité`);
    assert.ok(['classe', 'attribut', 'camera', 'temps', 'transition', 'effet', 'combinaison'].includes(e.recette.type), qui);
    assert.ok(e.recette.exemple && Array.isArray(e.recette.reglages), qui);
    if (e.motionPrompt) assert.match(e.motionPrompt, /^\d{3}$/, qui);
  }
  assert.ok(DICO.mouvements.length >= 55 && DICO.mouvements.length <= 80, `${DICO.mouvements.length} entrées`);
  assert.match(DICO.source, /Motion Prompt/);
});

test('liste figée : les numéros publiés ne changent jamais', () => {
  for (const [no, slug] of Object.entries(NUMEROS)) {
    const e = DICO.mouvements.find((x) => x.no === no);
    assert.ok(e, `#${no} a disparu`);
    assert.equal(e.slug, slug, `#${no} renommé`);
  }
  for (const e of DICO.mouvements) assert.ok(Object.hasOwn(NUMEROS, e.no), `#${e.no} à ajouter à numeros.json`);
});

test('recettes réelles : classes, transitions, effets de lettres, courbes et effets existent', () => {
  const effets = new Set(fs.readdirSync(path.join(RACINE, 'effets')).map((f) => f.replace(/\.json$/, '')));
  const shaders = new Set(fs.readdirSync(path.join(RACINE, 'shaders')).filter((f) => f.endsWith('.json'))
    .filter((f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'shaders', f), 'utf8')).usage === 'transition').map((f) => f.replace(/\.json$/, '')));
  for (const e of DICO.mouvements) {
    const qui = `#${e.no} ${e.slug}`;
    const texte = [e.recette.exemple, ...e.recette.reglages.map((r) => `${r.nom} ${r.defaut}`)].join('\n');
    for (const [, c] of texte.matchAll(/\b(pm-m-[a-z-]+)/g)) assert.match(CSS, new RegExp(`\\.${c}\\b`), `${qui} : classe ${c}`);
    for (const [, v] of texte.matchAll(/var\(--ease-([a-z]+-[a-z]+)\)/g)) assert.ok(VARIABLES_COURBES.includes(`--ease-${v}:`), `${qui} : courbe CSS ${v}`);
    for (const [, v] of texte.matchAll(/data-(?:lettres|mots)="([a-z]+)"/g)) assert.ok(Object.hasOwn(EFFETS_LETTRES, v), `${qui} : effet de lettres ${v}`);
    for (const [, v] of texte.matchAll(/data-effet="([a-z-]+)"/g)) assert.ok(effets.has(v), `${qui} : effet ${v}`);
    for (const [, clauses] of texte.matchAll(/data-(?:tween|camera)="([^"]+)"/g)) {
      for (const clause of clauses.split(';')) {
        const morceaux = clause.trim().split(/\s+/);
        const courbe = morceaux.find((m, i) => i >= 2 && /^[a-z]+-[a-z-]+$/.test(m));
        if (courbe) assert.doesNotThrow(() => analyserNom(courbe), `${qui} : courbe ${courbe}`);
      }
    }
    if (e.recette.type === 'transition') {
      const valeur = JSON.parse(`{${e.recette.exemple}}`).transition;
      if (typeof valeur === 'string') assert.ok(TRANSITIONS.includes(valeur), `${qui} : transition ${valeur}`);
      else assert.ok(shaders.has(valeur.shader), `${qui} : shader ${valeur.shader}`);
    }
  }
});

test('exemples assemblables : chaque extrait, dans sa scène, s\'assemble sans erreur', () => {
  const dir = dossierTemporaire('pm-mouvements-');
  fs.mkdirSync(path.join(dir, 'scenes'));
  const entrees = DICO.mouvements.filter(estHTML);
  for (const e of entrees) fs.writeFileSync(path.join(dir, 'scenes', `m${e.no}.html`), `<section data-scene="m${e.no}">\n${e.recette.exemple}\n</section>\n`);
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: 'Mouvements', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style: 'test',
    scenes: entrees.map((e) => ({ id: `m${e.no}`, fichier: `scenes/m${e.no}.html`, duree: 5, textes: { titre: 'Un titre', texte: 'Un texte' }, transition: 'fondu' })),
  }, null, 2));
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.ok, true);
});

test('chercher sans accents ni casse, en français ou en anglais', () => {
  for (const q of ['pop in', 'Pop-in', 'apparition', 'POP']) assert.ok(chercher(q).some((e) => e.slug === 'pop-in'), q);
  assert.ok(chercher('ecrire').some((e) => e.slug === 'machine-a-ecrire'));
  assert.ok(chercher('écrire').some((e) => e.slug === 'machine-a-ecrire'));
  assert.equal(chercher('Pop-in')[0].slug, 'pop-in', 'le nom exact d\'abord');
  assert.deepEqual(chercher('zzzz'), []);
});

test('afficher accepte toutes les écritures du numéro, le slug et les noms', () => {
  const e = trouver('#005');
  assert.ok(e);
  for (const cle of ['5', '05', '005', '#005', ` #5 `]) assert.equal(trouver(cle), e, cle);
  assert.equal(trouver('whip-pan').slug, 'whip-pan');
  assert.equal(trouver('Whip pan').slug, 'whip-pan');
  assert.equal(trouver('Panoramique filé').slug, 'whip-pan');
  assert.equal(trouver('inconnu'), null);
  assert.equal(trouver('999'), null);
});

test('referenceMarkdown : chaque numéro, et la façon d\'appliquer', () => {
  const md = referenceMarkdown();
  for (const e of DICO.mouvements) assert.ok(md.includes(`#${e.no} `), `#${e.no}`);
  assert.match(md, /Comment l'appliquer/);
  assert.match(md, /Motion Prompt/);
});

test('chercher : petits mots, pluriels, et les plus proches quand rien ne contient tout', () => {
  assert.equal(chercher('squash and stretch')[0].slug, 'ecrasement');
  assert.ok(chercher('fade in').some((e) => e.slug === 'fondu-montant'));
  assert.ok(chercher('rebonds').some((e) => e.slug === 'rebond'));
  assert.equal(chercher('un pop-in sur le titre')[0].slug, 'pop-in');
  assert.ok(chercher('pop zzzz').some((e) => e.slug === 'pop-in'), 'au moins un mot trouvé');
});
