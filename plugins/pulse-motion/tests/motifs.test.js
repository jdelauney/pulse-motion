'use strict';
/* Spec « Mouvement vivant », plan V5 « Motifs » : entrées #081 à #093 du dictionnaire (5.11), zoom en log, pulsation sur le
 * temps, fin de 5.16 (take-one, reanimate) et partie compositions de 5.13. Navigateur : motifs-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../moteur/camera.js');
const C = require('../moteur/courbes.js');
const { charger, referenceMarkdown } = require('../scripts/mouvements.js');
const { assembler } = require('../scripts/assembler.js');
const { controlesRapides } = require('../scripts/controler.js');
const { controlerVie } = require('../scripts/lib/controle-scene.js');
const { viesScene } = require('../scripts/lib/extraire.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const CSS = lire('moteur', 'mouvements.css');
const SANS_COMMENTAIRES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const DICO = charger();
const NUMEROS = JSON.parse(lire('references', 'mouvements', 'numeros.json'));
const MOTIFS = DICO.mouvements.filter((e) => Number(e.no) >= 81 && Number(e.no) <= 93);
const proche = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≠ ${b}`);

const ATTENDUS = {
  '081': ['appui', 'valeur'], '082': ['trace-graphique', 'valeur'], '083': ['cogne', 'valeur'], '084': ['suivi-retarde', 'finition'],
  '085': ['echo', 'texte'], '086': ['zoom-log', 'camera'], '087': ['defile-logos', 'compositions'], '088': ['avant-apres', 'compositions'],
  '089': ['pastille', 'compositions'], '090': ['inondation', 'compositions'], '091': ['roue', 'compositions'], '092': ['mur', 'compositions'],
  '093': ['helice', 'compositions'],
};

function projet(scenes, { tempo = null } = {}) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  scenes.forEach(([id, html], i) => fs.writeFileSync(path.join(dir, 'scenes', `${String(i + 1).padStart(2, '0')}-${id}.html`), html));
  modifierDeroule(dir, (d) => {
    d.scenes = scenes.map(([id, , duree], i) => ({ id, fichier: `scenes/${String(i + 1).padStart(2, '0')}-${id}.html`, duree, textes: { titre: 'Un titre', texte: 'Un texte' }, transition: 'coupe' }));
    if (tempo) d.tempo = { bpm: tempo };
  });
  return dir;
}

// --- 5.11 dictionnaire -------------------------------------------------------------------------------------------------

test('dictionnaire : #081 à #093 figés, catégories vie et compositions déclarées', () => {
  assert.deepEqual(DICO.categories.slice(-2), [{ id: 'vie', nom: 'Vie du décor' }, { id: 'compositions', nom: 'Compositions' }]);
  assert.deepEqual(Object.fromEntries(MOTIFS.map((e) => [e.no, [e.slug, e.categorie]])), ATTENDUS);
  for (const [no, [slug]] of Object.entries(ATTENDUS)) assert.equal(NUMEROS[no], slug, `#${no} figé`);
  // Trié par numéro ; les 80 premiers n'ont pas bougé.
  const nos = DICO.mouvements.map((e) => Number(e.no));
  assert.deepEqual(nos, [...nos].sort((a, b) => a - b));
  assert.equal(DICO.mouvements.filter((e) => Number(e.no) <= 80).length, 80);
  for (const e of MOTIFS) {
    assert.ok(e.motsCles.length >= 3, e.slug);
    assert.match(e.demande, /\d/, e.slug);
    assert.ok(e.recette.exemple && e.recette.reglages.length, e.slug);
  }
});

test('dictionnaire : borne portée de 55-80 à 55-160 entrées', () => {
  const t = lire('tests', 'mouvements.test.js');
  assert.match(t, /DICO\.mouvements\.length >= 55 && DICO\.mouvements\.length <= 160/);
  assert.ok(DICO.mouvements.length >= 93 && DICO.mouvements.length <= 160, `${DICO.mouvements.length} entrées`);
});

test('dictionnaire : source cite Motion Prompt, rossark, take-one et reanimate', () => {
  for (const nom of ['Motion Prompt', 'rossark', 'take-one', 'reanimate']) assert.match(DICO.source, new RegExp(nom), nom);
  assert.match(referenceMarkdown(), /take-one[\s\S]*reanimate/);
});

test('recettes réelles : classes pm-m-* et pm-v-* reconnues', () => {
  let citees = 0;
  for (const e of DICO.mouvements) {
    const texte = [e.recette.exemple, e.recette.note || '', ...e.recette.reglages.map((r) => `${r.nom} ${r.defaut}`)].join('\n');
    for (const [, c] of texte.matchAll(/\b(pm-[mv]-[a-z0-9-]+)/g)) { citees++; assert.match(CSS, new RegExp(`\\.${c}\\b[^{]*\\{`), `#${e.no} : classe ${c}`); }
  }
  assert.ok(citees > 40, `${citees}`);
  // Chaque classe des motifs sert à au moins une entrée.
  const exemples = MOTIFS.map((e) => e.recette.exemple).join('\n');
  for (const c of ['pm-m-appui', 'pm-m-barre', 'pm-v-cogne', 'pm-m-echo', 'pm-v-defile', 'pm-m-avant-apres', 'pm-m-pastille', 'pm-m-inonde', 'pm-m-roue', 'pm-m-mur', 'pm-m-mur-vignette', 'pm-m-helice', 'pm-m-helice-vignette']) {
    assert.match(exemples, new RegExp(`\\b${c}\\b`), c);
    assert.match(SANS_COMMENTAIRES, new RegExp(`#pm-scene \\.${c} \\{`), c);
  }
  // Chiffres de la spec dans le CSS.
  for (const motif of [/pm-m-appui var\(--pm-dur, 0\.22s\)/, /55% \{ scale: var\(--pm-ampleur, 0\.97\); \}/, /pm-m-barre var\(--pm-dur, 0\.7s\) var\(--pm-courbe, var\(--ease-quint-out\)\)/,
    /var\(--pm-decalage, 60ms\)/, /--pm-dur: var\(--pm-temps, 0\.5s\); --pm-phase: 0;/, /20% \{ scale: calc\(1 \+ 0\.37 \* var\(--pm-ampleur, 0\.012\)\); \}/,
    /45% \{ scale: calc\(1 \+ 0\.08 \* var\(--pm-ampleur, 0\.012\)\); \}/, /color-mix\(in srgb, var\(--c-accent\) 20%, transparent\)/, /var\(--c-accent\) 11%/, /var\(--c-accent\) 6%/,
    /pm-m-echo var\(--pm-dur, 0\.8s\)/, /to \{ translate: -50% 0; \}/, /pm-v-defile var\(--pm-dur, 20s\) linear/, /clip-path: inset\(0 calc\(\(100 - var\(--pm-balai, 0\)\) \* 1%\) 0 0\)/,
    /55% \{ scale: 0\.3 0\.5; border-radius: 100cqh;/, /pm-m-pastille var\(--pm-dur, 0\.7s\) var\(--pm-courbe, var\(--ease-cubic-inout\)\)/, /calc\(1\.05 \* hypot\(/,
    /pm-m-inonde var\(--pm-dur, 0\.32s\) var\(--pm-courbe, var\(--ease-cubic-out\)\)/, /calc\(var\(--pm-choix, 5\) \* var\(--pm-pas, 8cqh\) \* -1\)/, /pm-m-roue var\(--pm-dur, 1\.4s\) var\(--pm-courbe, var\(--ease-quint-out\)\)/,
    /perspective\(200cqh\) rotateX\(18deg\) rotateZ\(-6deg\)/, /calc\(\(var\(--l, 0\) \+ var\(--c, 0\)\) \* var\(--pm-decalage, 60ms\)\)/, /pm-m-mur-vignette var\(--pm-dur, 0\.5s\)/,
    /perspective\(220cqh\) translateY\(calc\(var\(--i, 0\) \* var\(--pm-pas, 3cqh\)\)\) rotateY\(calc\(var\(--i, 0\) \* 30deg \+ var\(--pm-helice, 0deg\)\)\) translateZ\(var\(--pm-rayon, 45cqh\)\)/,
    /backface-visibility: hidden/, /to \{ --pm-helice: var\(--pm-tour, 120deg\); \}/, /pm-m-helice var\(--pm-dur, 6s\) var\(--pm-courbe, var\(--ease-sine-inout\)\)/]) {
    assert.match(SANS_COMMENTAIRES, motif, String(motif));
  }
  assert.doesNotMatch(SANS_COMMENTAIRES, /preserve-3d/, 'hélice sans preserve-3d');
  // Les motifs n'animent pas transform (seuls le mur et l'hélice la posent, fixe ou par une variable).
  const motifs = SANS_COMMENTAIRES.slice(SANS_COMMENTAIRES.indexOf('@keyframes pm-m-appui'));
  for (const m of motifs.matchAll(/@keyframes ([a-z0-9-]+) \{([\s\S]*?)\n?\}\s*(?=@|#|$)/g)) assert.doesNotMatch(m[2], /\btransform\s*:/, m[1]);
});

test('exemples assemblables : #081 à #093 s\'assemblent sans erreur', () => {
  const dir = projet(MOTIFS.map((e) => [`m${e.no}`, `<section data-scene="m${e.no}">\n${e.recette.exemple}\n</section>\n`, 25]), { tempo: 120 });
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.ok, true);
  const c = controlesRapides({ projet: dir, dossierStyles: STYLES, assemblage: r });
  assert.deepEqual(c.problemes.filter((p) => ['vie-sans-duree', 'mouvement-ecrase', 'cogne-sans-tempo', 'camera-invalide'].includes(p.regle)), []);
  assert.deepEqual(c.problemes.filter((p) => p.gravite === 'erreur'), []);
});

test('#083 pulsation sans tempo : alerte cogne-sans-tempo', () => {
  const html = '<section data-scene="s"><div data-start="0" data-dur="scene"><h2 id="logo" class="pm-v-cogne" data-texte="titre"></h2></div></section>';
  const p = [];
  controlerVie(viesScene(html), 's', new Set(), p, { tempo: false });
  assert.deepEqual(p.map((x) => [x.regle, x.gravite]), [['cogne-sans-tempo', 'alerte']]);
  assert.equal(p[0].message, 'Scène « s » : « logo » demande un tempo dans le déroulé (musique) ; sans lui, elle bat toutes les 0,5 s.');
  const q = [];
  controlerVie(viesScene(html), 's', new Set(), q, { tempo: true });
  assert.deepEqual(q, []);
  // Par les contrôles rapides : sans tempo dans le déroulé, l'alerte ; avec, rien.
  for (const [tempo, n] of [[null, 1], [120, 0]]) {
    const dir = projet([['s', html, 4]], { tempo });
    const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
    assert.equal(controlesRapides({ projet: dir, dossierStyles: STYLES, assemblage: r }).problemes.filter((x) => x.regle === 'cogne-sans-tempo').length, n, `tempo ${tempo}`);
  }
  assert.match(lire('references', 'controles.md'), /^\| `cogne-sans-tempo` \|/m);
});

// --- zoom en log (#086) ----------------------------------------------------------------------------------------------

test('camera : zoom log, chaque doublement dure le même temps', () => {
  const [c] = K.analyserCamera('zoom 1→8 0+3 log linear', null);
  assert.equal(c.log, true);
  assert.equal(c.nomCourbe, 'linear');
  for (const [t, z] of [[0, 1], [1, 2], [2, 4], [3, 8], [0.5, Math.SQRT2]]) proche(K.etatCamera([c], t).zoom, Math.round(z * 10000) / 10000, 1e-4, `t=${t}`);
  // « log » avant ou après la courbe ; courbe par défaut sine-inout.
  const [d] = K.analyserCamera('zoom 1→6 0+4 linear log', null);
  assert.deepEqual([d.log, d.nomCourbe], [true, 'linear']);
  const [e] = K.analyserCamera('zoom 1→6 0+4 log', null);
  assert.deepEqual([e.log, e.nomCourbe], [true, 'sine-inout']);
  proche(K.etatCamera([e], 2).zoom, Math.round(Math.sqrt(6) * 10000) / 10000, 1e-4, 'à mi-chemin, la moyenne géométrique');
  assert.throws(() => K.analyserCamera('x 50→20 0+1 log', null), /« log » ne vaut que pour le zoom/);
  // La recette #086 et la référence.
  assert.match(DICO.mouvements.find((m) => m.no === '086').recette.exemple, /data-camera="zoom 1→6 0\+4 log"/);
  assert.match(lire('references', 'moteur', 'camera.md'), /`zoom 1→6 0\+4 log`, #086/);
});

test('camera : clause sans log identique à 0.24.0', () => {
  const texte = 'zoom 1→1.06 0+4; x 50→44 3+0.3 cubic-out; y 50→70 3+0.3 cubic-out; rotation 0→5 1+2 linear; secousse 1.2 6+0.2';
  const clauses = K.analyserCamera(texte, null);
  for (const c of clauses) {
    assert.equal(Object.hasOwn(c, 'log'), false, c.prop);
    assert.deepEqual(Object.keys(c), ['prop', 'de', 'a', 'debut', 'duree', 'nomCourbe', 'courbe']);
  }
  // Interpolation de 0.24.0 : de + (a − de) × courbe(u), arrondie à 1e-4.
  const ancienne = (c, tau) => { const p = c.duree > 0 ? Math.min(1, (tau - c.debut) / c.duree) : 1; return Math.round((c.de + (c.a - c.de) * C.courbeNommee(c.nomCourbe)(p)) * 10000) / 10000; };
  for (let t = 0; t <= 7; t += 0.05) {
    const e = K.etatCamera(clauses, t);
    for (const c of clauses.filter((x) => x.prop !== 'secousse')) if (t >= c.debut) assert.equal(e[c.prop], ancienne(c, t), `${c.prop} à ${t}`);
  }
});

// --- 5.13 références et consignes (partie compositions) -------------------------------------------------------------

test('reference mouvement-vivant, moteur et consignes : motifs #081 à #093', () => {
  const r = lire('references', 'mouvement-vivant.md');
  assert.ok(Buffer.byteLength(r) <= 9000, `${Buffer.byteLength(r)} o`);
  assert.match(r, /\| Bandeau de logos clients \| #087 \| un tour en 20 s \(10 à 40 s\)/);
  assert.equal(DICO.mouvements.find((m) => m.no === '087').recette.reglages.find((x) => x.nom === '--pm-dur').defaut, '20s');
  assert.match(r, /Appui sur un bouton : de 100 à 160 ms \(#081/);
  assert.match(r, /#083, \+1,2 %/);
  assert.equal(DICO.mouvements.find((m) => m.no === '083').recette.reglages.find((x) => x.nom === '--pm-ampleur').defaut, '0.012');
  const m = lire('references', 'moteur.md');
  assert.ok(Buffer.byteLength(m) <= 12000);
  assert.match(m, /logo marquee, before-after/);
  const a = lire('agents', 'animateur.md');
  assert.ok(Buffer.byteLength(a) <= 6000);
  assert.match(a, /un décor à faire vivre \(plante, flamme, machine, ciel, eau\), ou #081 à #093 \| `pulse-motion reference mouvement-vivant`/);
  const demandes = lire('references', 'demandes.md');
  assert.match(demandes, /« un bandeau de logos clients »[^\n]*catégorie `compositions` \(#087 à #093\)/);
  assert.match(demandes, /`camera`, `vie`, `compositions`…/);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.ok(Buffer.byteLength(retoucher) <= 13850);
  assert.match(retoucher, /« un bandeau de logos clients » \(#087\), « un avant\/après balayé » \(#088\)/);
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.ok(Buffer.byteLength(creer) <= 23400);
  assert.match(creer, /« un bandeau de logos »/);
  const md = referenceMarkdown();
  assert.match(md, /## Compositions/);
  assert.match(md, /pulsation sur le temps \(#083\)[^\n]*tempo[^\n]*deux fois sa liste/);
});

test('THIRD-PARTY-NOTICES : rossark, take-one et reanimate mentionnés, à la racine et dans le plugin', () => {
  const plugin = lire('THIRD-PARTY-NOTICES.md');
  assert.equal(fs.readFileSync(path.join(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md'), 'utf8'), plugin);
  const section = (nom) => { const s = plugin.slice(plugin.indexOf(`## ${nom}`)); return s.slice(0, s.indexOf('```')); };
  assert.match(section('rossark-motion-skill'), /#081[\s\S]*0,97[\s\S]*#082/);
  assert.match(section('take-one'), /motion-kit\.md[\s\S]*#086[\s\S]*#083[\s\S]*#090/);
  assert.match(section('reanimate'), /analysis\.md[\s\S]*implementation\.md[\s\S]*#087[\s\S]*#084[\s\S]*#085[\s\S]*#091[\s\S]*#088[\s\S]*#093/);
  for (const nom of ['rossark-motion-skill', 'take-one', 'reanimate']) assert.match(plugin.slice(plugin.indexOf(`## ${nom}`)), /Licence : MIT/, nom);
  assert.doesNotMatch(plugin, /huashu/i);
});
