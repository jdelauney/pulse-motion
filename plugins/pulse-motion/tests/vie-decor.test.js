'use strict';
/* Spec « Mouvement vivant », plan V4 « Vie du décor » : socle des boucles pm-v-* (5.9), entrées #069 à #080 du
 * dictionnaire (5.10) et partie décor de la référence et des consignes (5.13). Navigateur : vie-decor-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MIN = require('../moteur/minutage.js');
const V = require('../moteur/vivant.js');
const { charger, referenceMarkdown } = require('../scripts/mouvements.js');
const { assembler } = require('../scripts/assembler.js');
const { controlesRapides } = require('../scripts/controler.js');
const { controlerScene, controlerVie, classesAnimeesDuStyle, lireClassesVie } = require('../scripts/lib/controle-scene.js');
const { viesScene } = require('../scripts/lib/extraire.js');
const { preparerEffets } = require('../scripts/lib/effets.js');
const D = require('../scripts/lib/determinisme.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const CSS = lire('moteur', 'mouvements.css');
const SANS_COMMENTAIRES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const DICO = charger();
const NUMEROS = JSON.parse(lire('references', 'mouvements', 'numeros.json'));
const VIE = DICO.mouvements.filter((e) => e.categorie === 'vie');
const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

/** Images-clés d'une animation de mouvements.css : [{ offsets: [0, 1], decl: { prop: valeur } }]. */
function imagesCles(nom) {
  const debut = SANS_COMMENTAIRES.indexOf(`@keyframes ${nom} {`);
  assert.ok(debut >= 0, `@keyframes ${nom}`);
  let i = SANS_COMMENTAIRES.indexOf('{', debut) + 1;
  let profondeur = 1;
  let fin = i;
  while (profondeur > 0) { const c = SANS_COMMENTAIRES[fin++]; if (c === '{') profondeur++; else if (c === '}') profondeur--; }
  const corps = SANS_COMMENTAIRES.slice(i, fin - 1);
  const cles = [];
  for (const m of corps.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const offsets = m[1].split(',').map((x) => x.trim()).map((x) => (x === 'from' ? 0 : x === 'to' ? 1 : parseFloat(x) / 100));
    const decl = {};
    for (const d of m[2].split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
    cles.push({ offsets, decl });
  }
  return cles;
}
const nomsAnimationsVie = () => [...SANS_COMMENTAIRES.matchAll(/@keyframes (pm-v-[a-z0-9-]+)/g)].map((m) => m[1]);

/** Projet d'essai : scènes [id, html, durée], rendu des contrôles rapides. */
function projet(scenes) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  scenes.forEach(([id, html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => { d.scenes = scenes.map(([id, , duree], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, textes: { titre: 'Un titre' }, transition: 'coupe' })); });
  return dir;
}
const regles = (problemes, regle) => problemes.filter((p) => p.regle === regle);

// --- 5.9 data-dur="scene" -----------------------------------------------------------------------------------------

test('data-dur scene : jusqu\'à la fin de la scène, voix comprise ; dernière scène : fin − 1 s', () => {
  const voix = { debut: 0.3, duree: 6, mots: [] }; // allonge la scène de 4 s à 6,7 s
  const r = MIN.calculerMinutage([
    { id: 'a', duree: 4, voix },
    { id: 'b', duree: 5, rythme: 0.5, transition: 'fondu' },
    { id: 'c', duree: 4, transition: 'coupe' },
  ], {
    a: [{ cle: 'plante', start: '1', dur: 'scene' }, { cle: 'apres', start: '#plante:fin-0.5', dur: '0.5' }],
    b: [{ cle: 'flamme', start: '0', dur: 'scene' }],
    c: [{ cle: 'nuage', start: '0.5', dur: 'scene' }, { cle: 'tard', start: '3.5', dur: 'scene' }],
  });
  assert.deepEqual(r.erreurs, []);
  const [a, b, c] = r.scenes;
  proche(a.fin, 6.7);
  proche(r.elements.a.plante.debut, 1);
  proche(r.elements.a.plante.fin, a.fin, 1e-6);
  proche(r.elements.a.apres.debut, a.fin - 0.5);
  // Scène au ralenti (rythme 0,5) : la vie tient jusqu'à sa fin réelle.
  proche(r.elements.b.flamme.debut, b.debut);
  proche(r.elements.b.flamme.fin, b.fin);
  // Dernière scène : 1 s avant la fin ; jamais une durée négative.
  proche(r.elements.c.nuage.fin, c.fin - 1);
  proche(r.elements.c.tard.fin - r.elements.c.tard.debut, 0);
  // Minutage d'une scène seule au milieu de la vidéo : jusqu'à sa fin.
  const seule = MIN.calculerMinutage([{ id: 'x', duree: 3 }], { x: [{ cle: 'v', dur: 'scene' }] }, { derniere: false });
  proche(seule.elements.x.v.fin, 3);
  // Un autre mot n'est pas une durée.
  const faux = MIN.calculerMinutage([{ id: 'x', duree: 3 }], { x: [{ cle: 'v', dur: 'scène' }] });
  assert.equal(faux.erreurs[0].regle, 'dur-invalide');
  assert.match(faux.erreurs[0].message, /« scene »/);
});

test('data-dur scene : un effet de particules est compilé jusqu\'à la fin de la scène', () => {
  const dir = copierProjet('projet-effets');
  const charte = { primaire: '#0a6cff', accent: '#ff8a00', texte: '#1a1a1a', fond: '#ffffff' };
  const html = '<section data-scene="s"><div data-effet="etincelles" data-start="1" data-dur="scene"></div></section>';
  const options = { scene: 's', projet: dir, bibliotheque: path.join(RACINE, 'effets'), charte, dureeScene: 5 };
  const milieu = preparerEffets(html, options);
  assert.deepEqual(milieu.erreurs, []);
  assert.equal(milieu.effets[0].effet.duree, 4);
  assert.equal(preparerEffets(html, { ...options, derniere: true }).effets[0].effet.duree, 3, 'dernière scène : 1 s avant la fin');
});

// --- 5.9 bornes : cycles, phases ------------------------------------------------------------------------------------

test('pm-v : jamais sans fin, cycles tenant dans la fenêtre', () => {
  for (const W of [0.5, 1, 2.9, 3, 4.2, 7.31, 10, 42.5]) {
    for (const P of [0.54, 0.7, 1.1, 2.4, 2.8, 4.2, 6]) {
      const n = MIN.cyclesVie(W, P, false);
      assert.ok(n * P <= W + 1e-6, `W ${W}, P ${P} : ${n} cycles débordent`);
      if (W >= P) {
        assert.equal(n, Math.floor(W / P + 1e-9), `W ${W}, P ${P} : nombre entier de cycles`);
        assert.ok((n + 1) * P > W, 'autant de cycles que la fenêtre en contient');
      } else proche(n, W / P, 1e-6);
      proche(MIN.cyclesVie(W, P, true), W / P, 1e-6);
    }
  }
  assert.equal(MIN.cyclesVie(0, 4.2, false), 0);
  assert.equal(MIN.cyclesVie(5, 0, false), 0);
  // Aucune classe pm-v ne tourne sans fin : chaque animation pm-v-* a un nombre de tours borné.
  assert.doesNotMatch(SANS_COMMENTAIRES, /\binfinite\b/);
  for (const m of SANS_COMMENTAIRES.matchAll(/#pm-scene \.(pm-v-[a-z0-9-]+) \{([^}]*)\}/g)) {
    const corps = m[2];
    if (!/\banimation\s*:/.test(corps)) { assert.equal(m[1], 'pm-v-nuage', 'seule la dérive n\'a pas d\'images-clés'); continue; }
    const n = (corps.match(/animation:[^;]*/)[0].match(/\bboth\b/g) || []).length;
    if (/--pm-fois\s*:\s*1\b/.test(corps)) continue; // ponctuelle : une fois
    assert.match(corps, /animation-iteration-count: var\(--pm-fois, var\(--pm-v-fois, 1\)\)/, m[1]);
    if (n === 2) assert.match(corps, /var\(--pm-fois-2, var\(--pm-v-fois-2, 1\)\)/, m[1]);
    assert.match(corps, /animation-delay: calc\(var\(--pm-phase, var\(--pm-v-phase, 0\)\) \* -1 \* var\(--pm-dur, [\d.]+s\)\)/, m[1]);
  }
});

test('pm-v : deux éléments de même classe ne sont pas en phase', () => {
  for (const classe of ['pm-v-balance', 'pm-v-scintille', 'pm-v-ondes']) {
    const phases = Array.from({ length: 12 }, (_, i) => MIN.phaseVie(i, 'scene-1', classe));
    for (const p of phases) assert.ok(p >= 0 && p < 1);
    const ecarts = [];
    for (let i = 0; i < phases.length; i++) for (let j = i + 1; j < phases.length; j++) ecarts.push(Math.abs(phases[i] - phases[j]));
    assert.ok(Math.min(...ecarts) > 1e-4, `${classe} : deux éléments au même départ`);
    // Même graine que la vie des personnages (moteur/vivant.js), dans Node comme dans la page.
    phases.forEach((p, i) => assert.equal(p, V.graine(i, V.sel(`scene-1/${classe}`))));
  }
  assert.notEqual(MIN.phaseVie(0, 'a', 'pm-v-balance'), MIN.phaseVie(0, 'b', 'pm-v-balance'), 'deux scènes, deux phases');
  assert.equal(MIN.phaseVie(3, 'a', 'pm-v-balance'), MIN.phaseVie(3, 'a', 'pm-v-balance'), 'stable');
});

// --- 5.9 CSS ---------------------------------------------------------------------------------------------------------

test('mouvements.css : aucune classe pm-v n\'anime transform', () => {
  const noms = nomsAnimationsVie();
  assert.ok(noms.length >= 14, noms.join(', '));
  const PERMISES = new Set(['rotate', 'scale', 'translate', 'opacity', 'stroke-dashoffset', 'animation-timing-function']);
  const CONTINUES = new Set(['pm-v-engrenage', 'pm-v-engrenage-inverse', 'pm-v-defile']);
  // Battement (#083) : le coup tombe au début de chaque temps et retombe au repos à la fin du cycle.
  const BATTEMENTS = new Set(['pm-v-cogne']);
  const PONCTUELLES = new Set(['pm-v-tige', 'pm-v-feuille', 'pm-v-petale']);
  for (const nom of noms) {
    const cles = imagesCles(nom);
    for (const c of cles) for (const prop of Object.keys(c.decl)) assert.ok(PERMISES.has(prop), `${nom} anime ${prop}`);
    if (BATTEMENTS.has(nom)) { assert.deepEqual(cles.find((c) => c.offsets.includes(1)).decl, { scale: '1' }, nom); continue; }
    if (CONTINUES.has(nom) || PONCTUELLES.has(nom)) continue;
    // Boucle qui oscille : 0 % et 100 % identiques (le repos), ou tous deux invisibles (volutes, ondes).
    const a = cles.find((c) => c.offsets.includes(0)).decl;
    const b = cles.find((c) => c.offsets.includes(1)).decl;
    const sans = (d) => { const x = { ...d }; delete x['animation-timing-function']; return x; };
    if (a.opacity === '0' && b.opacity === '0') continue;
    assert.deepEqual(sans(a), sans(b), `${nom} : 0 % et 100 % au repos`);
  }
  // Les règles des classes ne posent jamais transform (seulement son pivot).
  for (const m of SANS_COMMENTAIRES.matchAll(/\.pm-v-[a-z0-9-]+[^{]*\{([^}]*)\}/g)) assert.doesNotMatch(m[1], /(^|[\s;])transform\s*:/, m[0].slice(0, 60));
  // Une boucle continue ne se déphase pas, et le dit.
  for (const c of CONTINUES) assert.match(SANS_COMMENTAIRES, new RegExp(`#pm-scene \\.${c} \\{ --pm-boucle: continue; --pm-phase: 0;`), c);
  assert.match(SANS_COMMENTAIRES, /@property --pm-boucle \{ syntax: '\*'; inherits: false; \}/);
});

test('#075 engrenage : un tour entier par période, roues menées dans le bon sens', () => {
  const tour = imagesCles('pm-v-engrenage');
  const inverse = imagesCles('pm-v-engrenage-inverse');
  assert.deepEqual(tour.map((c) => c.decl.rotate), ['0deg', '360deg']);
  assert.deepEqual(inverse.map((c) => c.decl.rotate), ['0deg', '-360deg']);
  for (const c of ['pm-v-engrenage', 'pm-v-engrenage-inverse']) {
    assert.match(SANS_COMMENTAIRES, new RegExp(`\\.${c} \\{[^}]*animation: ${c} var\\(--pm-dur, 6s\\) linear both;`), `${c} : vitesse constante, 6 s par tour`);
  }
  const e = DICO.mouvements.find((x) => x.slug === 'engrenage');
  assert.match(e.recette.exemple, /class="pm-v-engrenage"/);
  assert.match(e.recette.exemple, /class="pm-v-engrenage-inverse" style="--pm-dur: calc\(6s \* 10 \/ 16\)"/, 'roue menée de 10 dents, menée par 16 : plus rapide, sens inverse');
  // Une boucle continue remplit sa fenêtre : 10 s à 6 s par tour, un tour et deux tiers.
  proche(MIN.cyclesVie(10, 6, true), 10 / 6, 1e-6);
});

test('#078 nuage : position proportionnelle au temps dans la fenêtre', () => {
  // Sans images-clés : translate = --p × fenêtre × vitesse (cqh par seconde), linéaire.
  assert.match(SANS_COMMENTAIRES, /#pm-scene \.pm-v-nuage \{ translate: calc\(var\(--p, 0\) \* var\(--pm-fenetre, 0\) \* var\(--pm-vitesse, 4\) \* 1cqh\) 0; \}/);
  assert.equal(lireClassesVie().get('pm-v-nuage').sansImagesCles, true);
  const e = DICO.mouvements.find((x) => x.slug === 'nuage');
  for (const m of e.recette.exemple.matchAll(/<div class="pm-v-nuage"[^>]*>/g)) assert.match(m[0], /data-start="0" data-dur="scene"/, 'l\'élément lui-même est minuté');
});

// --- 5.9 contrôles statiques -----------------------------------------------------------------------------------------

test('vie et entrée sur le même élément : alerte mouvement-ecrase', () => {
  const dir = projet([['plante', `<section data-scene="plante">
  <h2 data-texte="titre" data-start="0.2"></h2>
  <div id="pot" class="pm-v-balance pm-m-pop" data-decor data-start="0" data-dur="scene"></div>
  <div id="pot-bien" class="pm-m-pop" data-decor data-start="0" data-dur="scene"><div class="pm-v-balance"></div></div>
</section>`, 5]]);
  const r = controlesRapides({ projet: dir, dossierStyles: STYLES });
  const p = regles(r.problemes, 'mouvement-ecrase');
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.equal(p[0].gravite, 'alerte');
  assert.equal(p[0].message, 'Scène « plante » : « pot » porte à la fois une vie (pm-v-balance) et une entrée (pm-m-pop) : l\'une efface l\'autre ; mettre la vie sur un élément intérieur.');
  assert.ok(!p[0].correction, 'jamais corrigé seul');
  // Une classe animée du style compte comme une entrée ; un conteneur animé (« .decor .rond ») ne rend pas suspect « decor ».
  const style = classesAnimeesDuStyle('.entre-bas { animation: pm-entre-bas 0.7s both; }\n.decor .rond { animation: x 2s; }\n.calme { animation: none; }');
  assert.deepEqual([...style].sort(), ['entre-bas', 'rond']);
  const vus = [];
  controlerVie(viesScene('<div class="decor pm-v-nuage" data-dur="scene"></div><p class="entre-bas pm-v-flotte" data-dur="scene"></p>'), 's', style, vus);
  assert.deepEqual(vus.map((x) => x.message.match(/entrée \(([^)]+)\)/)[1]), ['entre-bas']);
  const clair = classesAnimeesDuStyle(lire('styles', 'clair-pedagogique', 'style.css'));
  assert.ok(clair.has('entre-bas') && clair.has('fondu'), [...clair].join(', '));
});

test('pm-v sans data-dur : alerte vie-sans-duree', () => {
  const html = `<section data-scene="ciel">
  <div id="plante" class="pm-v-balance" data-start="0"></div>
  <div id="bougie" data-start="0"><svg aria-hidden="true"><path class="pm-v-flamme"/></svg></div>
  <div id="soleil" class="pm-v-lueur" data-start="0" data-dur="scene"></div>
  <div id="libre" class="pm-v-scintille"></div>
  <div id="nuage" class="pm-v-nuage"></div>
  <div id="nuage-porte" data-start="0" data-dur="scene"><div id="nuage2" class="pm-v-nuage"></div></div>
  <div id="nuage-bien" class="pm-v-nuage" data-start="0" data-dur="scene"></div>
  <svg aria-hidden="true"><g data-start="0"><path class="pm-v-tige" pathLength="100"/><ellipse class="pm-v-feuille"/></g></svg>
</section>`;
  const dir = projet([['ciel', html, 5]]);
  const r = controlesRapides({ projet: dir, dossierStyles: STYLES });
  const p = regles(r.problemes, 'vie-sans-duree');
  assert.deepEqual(p.map((x) => x.message), [
    'Scène « ciel » : « plante » vit (pm-v-balance) sans data-dur : il ne bougera qu\'une seconde ; ajouter data-dur="scene".',
    'Scène « ciel » : « pm-v-flamme » vit (pm-v-flamme) sans data-dur : il ne bougera qu\'une seconde ; ajouter data-dur="scene" à son conteneur « bougie ».',
    'Scène « ciel » : « nuage » dérive (pm-v-nuage) sans être minuté : il ne bougera pas ; ajouter data-start="0" data-dur="scene".',
  ]);
  // La dérive suit la progression de son conteneur minuté (nuage2) ; la pousse joue une fois (sans data-dur, aucune alerte).
  for (const x of p) assert.equal(x.gravite, 'alerte');
  // Même règle, même message, dès que la scène est écrite (crochet).
  const { deroule } = require('../scripts/lib/deroule.js').lireDeroule(dir);
  const crochet = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html });
  assert.deepEqual(regles(crochet, 'vie-sans-duree').map((x) => x.message), p.map((x) => x.message));
});

// --- 5.10 dictionnaire -------------------------------------------------------------------------------------------------

const ATTENDUS = { '069': 'balance', '070': 'flamme', '071': 'vapeur', '072': 'flotte', '073': 'lueur', '074': 'scintille', '075': 'engrenage',
  '076': 'vibre', '077': 'attend', '078': 'nuage', '079': 'ondes', '080': 'croissance' };

test('dictionnaire : #069 à #080 dans la catégorie vie, figés dans numeros.json', () => {
  assert.deepEqual(DICO.categories[7], { id: 'vie', nom: 'Vie du décor' }, 'catégorie ajoutée après les sept premières');
  assert.deepEqual(Object.fromEntries(VIE.map((e) => [e.no, e.slug])), ATTENDUS);
  for (const [no, slug] of Object.entries(ATTENDUS)) assert.equal(NUMEROS[no], slug, `#${no}`);
  for (const e of VIE) {
    assert.ok(e.motsCles.length >= 3, e.slug);
    assert.match(e.demande, /\d/, e.slug);
    assert.ok(e.recette.exemple && e.recette.reglages.length, e.slug);
  }
  // Les 68 premiers numéros n'ont pas bougé.
  assert.equal(DICO.mouvements.filter((e) => Number(e.no) <= 68).length, 68);
  assert.match(DICO.source, /Motion Prompt/);
  assert.match(DICO.source, /rossark/);
});

test('recettes réelles : chaque classe pm-v-* citée existe dans mouvements.css', () => {
  let citees = 0;
  for (const e of DICO.mouvements) {
    const texte = [e.recette.exemple, e.recette.note || '', ...e.recette.reglages.map((r) => `${r.nom} ${r.defaut}`)].join('\n');
    for (const [, c] of texte.matchAll(/\b(pm-v-[a-z0-9-]+)/g)) { citees++; assert.match(CSS, new RegExp(`\\.${c} \\{`), `#${e.no} : classe ${c}`); }
  }
  assert.ok(citees >= 14, `${citees} classes citées`);
  // Chaque entrée de la vie se sert de sa classe ; chaque classe de la vie sert à une entrée.
  for (const e of VIE.filter((x) => x.slug !== 'croissance')) assert.match(e.recette.exemple, new RegExp(`class="[^"]*\\bpm-v-${e.slug}\\b`), e.slug);
  // Les vies des motifs (#083 pulsation, #087 défilement) servent à leurs entrées, hors de la catégorie vie.
  const exemples = DICO.mouvements.map((e) => e.recette.exemple).join('\n');
  for (const c of lireClassesVie().keys()) assert.match(exemples, new RegExp(`\\b${c}\\b`), c);
});

test('exemples assemblables : #069 à #080 s\'assemblent sans erreur', () => {
  const dir = projet(VIE.map((e) => [`m${e.no}`, `<section data-scene="m${e.no}">\n<h2 data-texte="titre" data-start="0.2"></h2>\n${e.recette.exemple}\n</section>\n`, 4]));
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.ok, true);
  // Leurs recettes respectent les règles de la vie : ni vie sans durée, ni vie écrasée par une entrée.
  const c = controlesRapides({ projet: dir, dossierStyles: STYLES, assemblage: r });
  assert.deepEqual(c.problemes.filter((p) => ['vie-sans-duree', 'mouvement-ecrase'].includes(p.regle)), []);
  assert.deepEqual(c.problemes.filter((p) => p.gravite === 'erreur'), []);
  // Leurs scènes passent par la preuve du déterminisme.
  for (const s of D.concernees(r)) assert.deepEqual(s.raisons, ['vie'], s.id);
  assert.equal(D.concernees(r).length, VIE.length);
});

// --- 5.13 références et consignes (partie décor) --------------------------------------------------------------------

test('reference mouvement-vivant : le décor qui vit, chiffres égaux au code', () => {
  const r = lire('references', 'mouvement-vivant.md');
  assert.ok(Buffer.byteLength(r) <= 9000, `${Buffer.byteLength(r)} o`);
  const decor = r.slice(r.indexOf('## Le décor qui vit'), r.indexOf('## Les personnages'));
  for (const no of Object.keys(ATTENDUS)) assert.match(decor, new RegExp(`\\| #${no} \\|`), `#${no}`);
  assert.match(decor, /`data-dur="scene"`/);
  assert.match(decor, /élément intérieur/);
  assert.doesNotMatch(decor, /à venir/);
  const defaut = (no, nom) => DICO.mouvements.find((e) => e.no === no).recette.reglages.find((x) => x.nom === nom).defaut;
  const fr = (x) => String(x).replace(/s$/, '').replace('.', ',');
  const ligne = (no) => decor.split('\n').find((l) => l.includes(`| #${no} |`));
  assert.match(ligne('069'), new RegExp(`±${fr(defaut('069', '--pm-ampleur'))}° .* en ${fr(defaut('069', '--pm-dur'))} s`));
  assert.match(ligne('070'), new RegExp(`±${fr(defaut('070', '--pm-ampleur'))}° en ${fr(defaut('070', '--pm-dur'))} s, s'étire de 4,5 % en ${fr(defaut('070', '--pm-dur-2'))} s`));
  assert.equal(defaut('070', '--pm-etire'), '0.045');
  assert.match(ligne('071'), new RegExp(`${defaut('071', '--pm-ampleur')} % de la hauteur en ${fr(defaut('071', '--pm-dur'))} s`));
  assert.match(ligne('072'), new RegExp(`±${fr(defaut('072', '--pm-ampleur'))} % de la hauteur en ${fr(defaut('072', '--pm-dur'))} s, ±${defaut('072', '--pm-ampleur-2')}° en ${fr(defaut('072', '--pm-dur-2'))} s`));
  assert.match(ligne('073'), /\+4 % .* en 3 s/);
  assert.equal(defaut('073', '--pm-ampleur'), '0.04');
  assert.match(ligne('074'), new RegExp(`toutes les ${fr(defaut('074', '--pm-dur'))} s`));
  assert.match(ligne('075'), new RegExp(`un tour en ${fr(defaut('075', '--pm-dur'))} s`));
  assert.match(ligne('076'), new RegExp(`±${defaut('076', '--pm-ampleur')}° en 0,45 s, toutes les ${fr(defaut('076', '--pm-dur'))} s`));
  assert.match(ligne('077'), /±2 % en deux temps de 270 ms/);
  assert.equal(defaut('077', '--pm-dur'), '0.54s');
  assert.match(ligne('078'), new RegExp(`${defaut('078', '--pm-vitesse')} % de la hauteur par seconde`));
  assert.match(ligne('079'), new RegExp(`${fr(defaut('079', '--pm-dur'))} s chacun`));
  assert.match(ligne('080'), /tige en 1,6 s, une feuille toutes les 0,35 s, un pétale toutes les 0,12 s, puis #069/);
  // Les mêmes défauts dans le CSS.
  for (const [motif, nom] of [[/pm-v-balance var\(--pm-dur, 4\.2s\)/, '069'], [/pm-v-flamme var\(--pm-dur, 0\.7s\)[^,]*, pm-v-flamme-etire var\(--pm-dur-2, 1\.1s\)/, '070'],
    [/pm-v-vapeur var\(--pm-dur, 2\.4s\)/, '071'], [/pm-v-flotte var\(--pm-dur, 3\.4s\)[^,]*, pm-v-flotte-penche var\(--pm-dur-2, 4\.6s\)/, '072'],
    [/pm-v-lueur var\(--pm-dur, 3s\)/, '073'], [/pm-v-scintille var\(--pm-dur, 2\.8s\)/, '074'], [/pm-v-engrenage var\(--pm-dur, 6s\)/, '075'],
    [/pm-v-vibre var\(--pm-dur, 1\.6s\)/, '076'], [/pm-v-attend var\(--pm-dur, 0\.54s\)/, '077'], [/pm-v-ondes var\(--pm-dur, 2\.6s\)/, '079'],
    [/pm-v-tige var\(--pm-dur, 1\.6s\)/, '080'], [/var\(--pm-decalage, 0\.35s\)/, '080'], [/var\(--pm-decalage, 0\.12s\)/, '080'],
    [/var\(--pm-ampleur, 2\.5\) \* 1deg/, '069'], [/var\(--pm-ampleur, 3\) \* 1deg/, '070'], [/var\(--pm-etire, 0\.045\)/, '070'], [/var\(--pm-ampleur, 4\) \* -1cqh/, '071'],
    [/var\(--pm-ampleur, 0\.8\) \* 1cqh/, '072'], [/var\(--pm-ampleur-2, 2\) \* 1deg/, '072'], [/var\(--pm-ampleur, 0\.04\)/, '073'], [/var\(--pm-ampleur, 3\) \* -1deg/, '076'],
    [/var\(--pm-ampleur, 0\.02\)/, '077'], [/var\(--pm-vitesse, 4\)/, '078']]) assert.match(SANS_COMMENTAIRES, motif, `#${nom} : ${motif}`);
  // Vibreur : 4 allers-retours en 28 % du cycle (0,45 s de 1,6 s).
  const vibre = imagesCles('pm-v-vibre');
  assert.equal(vibre.filter((c) => /deg\)$/.test(c.decl.rotate)).length, 8);
  assert.ok(vibre.some((c) => c.offsets.includes(0.28) && c.decl.rotate === '0deg'));
  proche(0.28 * 1.6, 0.448, 1e-9);
});

test('moteur.md : data-dur scene et classes pm-v documentés ; dictionnaire et consignes', () => {
  const m = lire('references', 'moteur.md');
  assert.ok(Buffer.byteLength(m) <= 12000);
  assert.match(m, /^\| `data-dur` \| `scene` \| Jusqu'à la fin de la scène, voix comprise \(dernière scène : 1 s avant\) \|$/m);
  const nommes = m.slice(m.indexOf('### Mouvements nommés'), m.indexOf('### Texte lettre par lettre'));
  assert.match(nommes, /`pm-v-\*`/);
  assert.match(nommes, /`data-dur="scene"`/);
  assert.match(nommes, /`pulse-motion reference mouvement-vivant`/);
  const md = referenceMarkdown();
  assert.match(md, /## Vie du décor/);
  assert.match(md, /élément intérieur[^\n]*`data-dur="scene"`[^\n]*sa phase/);
  const a = lire('agents', 'animateur.md');
  assert.ok(Buffer.byteLength(a) <= 6000);
  assert.match(a, /mettre `data-dur="scene"` au décor/);
  assert.match(lire('references', 'demandes.md'), /« fais vivre la plante »[^\n]*catégorie `vie` \(#069 à #080\)/);
  assert.match(lire('references', 'demandes.md'), /`camera`, `vie`, `compositions`…/);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.ok(Buffer.byteLength(retoucher) <= 13850);
  assert.match(retoucher, /« fais vivre la plante » \(#069\)/);
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.ok(Buffer.byteLength(creer) <= 23400);
  assert.match(creer, /« une plante qui vit »/);
  const controles = lire('references', 'controles.md');
  for (const r of ['vie-sans-duree', 'mouvement-ecrase']) assert.match(controles, new RegExp('^\\| `' + r + '` \\|', 'm'), r);
  assert.doesNotMatch(controles, /boucles de vie `pm-v-\*` exclues/);
});

test('THIRD-PARTY-NOTICES : recettes de vie de rossark mentionnées, à la racine et dans le plugin', () => {
  const plugin = lire('THIRD-PARTY-NOTICES.md');
  assert.equal(fs.readFileSync(path.join(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md'), 'utf8'), plugin);
  const rossark = plugin.slice(plugin.indexOf('## rossark-motion-skill'));
  assert.match(rossark.slice(0, rossark.indexOf('```')), /boucles de vie du décor[\s\S]*#069 à #080[\s\S]*`SKILL\.md` § 3/i);
});
