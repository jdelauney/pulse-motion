'use strict';
/* Spec « Lacunes créatives » (S9), plans S9-3 (5.5 à 5.8) et S9-4 (5.4, 5.9, 5.12), sans navigateur : texte sur un tracé, police
 * variable, karaoké, QR code posé à l'assemblage et ses contrôles, Ken Burns, feuille et modules embarqués seulement s'ils
 * servent. Les critères qui demandent la page rendue sont dans briques-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const B = require('../scripts/lib/briques.js');
const P = require('../scripts/lib/police.js');
const T = require('../moteur/trace-texte.js');
const KB = require('../moteur/ken-burns.js');
const ST = require('../moteur/sous-titres.js');
const { EFFETS, EFFETS_TRACE } = require('../moteur/lettres.js');
const { controlerLettres } = require('../scripts/lib/controle-scene.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const POLICES = path.join(RACINE, 'styles', 'clair-pedagogique', 'polices');

/** Projet de test : scènes [id, html, durée?, textes?] ; style des fixtures sauf `style` (un style livré). */
function projet(scenes, { style = null, deroule = null } = {}) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  scenes.forEach(([id, html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => {
    d.scenes = scenes.map(([id, , duree = 6, textes = {}], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, textes: { titre: 'Un titre', ...textes }, transition: 'coupe' }));
    if (style) { d.style = style; delete d.charte; }
    if (deroule) deroule(d);
  });
  return dir;
}
const assembler1 = (dir, style) => assembler({ dossier: dir, ...(style ? {} : { dossierStyles: STYLES }), ecrire: false });
const regles = (r) => r.problemes.map((p) => p.regle);
const controler1 = (dir, style) => controler({ dossier: dir, ...(style ? {} : { dossierStyles: STYLES }), ecrire: false });

// --- Vidéo sans brique : rien ne change ------------------------------------------------------------------------------------

test('briques : une vidéo qui n\'en utilise aucune n\'embarque ni leur feuille, ni leurs modules, ni les axes des polices', () => {
  const r = assembler1(projet([['a', '<section data-scene="a"><h1 data-texte="titre" data-start="0.2" data-lettres="monte"></h1></section>']]));
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.doesNotMatch(r.cssPage, /pm-sur-trace|pm-qr-rangee|pm-espace-3d/);
  assert.ok(!r.groupes.includes('trace') && !r.groupes.includes('ken-burns'), r.groupes.join(','));
  assert.equal(r.donnees.polices, undefined);
  assert.doesNotMatch(r.html, /M\.demarrerTraces\(\)/);
  assert.deepEqual(B.besoinsBriques(['<h1 data-texte="t"></h1>'], {}), { css: false, trace: false, kenBurns: false, variable: false });
  for (const marque of ['class="pm-sur-trace"', 'data-ken-burns="auto"', 'class="pm-relief"', 'data-lettres="graisse"', 'data-pm-qr-modules="33"', 'class="pm-m-masque-doux"']) {
    assert.equal(B.besoinsBriques([`<div ${marque}></div>`]).css, true, marque);
  }
  assert.equal(B.besoinsBriques([], { sousTitres: { mode: 'karaoke' } }).css, true);
});

// --- Texte sur un tracé (5.5) -----------------------------------------------------------------------------------------------

test('tracé : startOffset vaut la valeur interpolée à t, identique à l\'aller et au retour (seek)', () => {
  const s = T.analyserSurTrace('defile 100→0 0+3 sine-inout');
  assert.equal(s.mode, 'defile');
  assert.equal(T.valeurSurTrace(s, -1), 100);
  assert.equal(T.valeurSurTrace(s, 0), 100);
  assert.equal(T.valeurSurTrace(s, 1.5), 50);
  assert.equal(T.valeurSurTrace(s, 3), 0);
  assert.equal(T.valeurSurTrace(s, 9), 0);
  // Fonction du seul instant : la même valeur quel que soit l'ordre des instants demandés.
  const instants = [0.2, 2.7, 1.1, 0.2, 2.7, 1.1];
  const vus = instants.map((t) => T.valeurSurTrace(s, t));
  assert.deepEqual(vus.slice(0, 3), vus.slice(3));
  const e = T.analyserSurTrace('ecrit 0+2');
  assert.deepEqual([-0.1, 0, 0.99, 2, 5].map((t) => T.lettresEcrites(e, t, 10)), [0, 1, 5, 10, 10]);
  assert.equal(T.analyserSurTrace('defile 0->80 1t+2t', 0.5).duree, 1);
  for (const faux of ['glisse 0→1 0+1', 'defile 0+1', 'defile a→b 0+1', 'defile 0→1 0+1 rebond-mou', 'ecrit 1']) assert.throws(() => T.analyserSurTrace(faux), /data-sur-trace/, faux);
  assert.throws(() => T.analyserSurTrace('defile 0→1 1t+1t'), /temps musicaux/);
});

test('tracé : effet monte sur un textPath refusé avec un message en français', () => {
  assert.ok(EFFETS.fondu && EFFETS.graisse, 'effets fondu et graisse');
  assert.deepEqual(EFFETS_TRACE, ['frappe', 'fondu']);
  const probs = (html) => { const p = []; controlerLettres(extraireScene(html).decoupes, 's', p); return p; };
  const svg = (effet) => `<svg class="pm-sur-trace" viewBox="0 0 10 10"><path id="c" d="M0 5 H10"/><text><textPath href="#c" data-texte="titre" data-lettres="${effet}"></textPath></text></svg>`;
  const refus = probs(svg('monte'));
  assert.equal(refus.length, 1);
  assert.equal(refus[0].regle, 'lettres-invalide');
  assert.match(refus[0].message, /data-lettres « monte » : sur un tracé : frappe ou fondu seulement\./);
  assert.deepEqual(probs(svg('frappe')), []);
  assert.deepEqual(probs(svg('fondu')), []);
  // Hors d'un tracé, monte reste permis.
  assert.deepEqual(probs('<h1 data-texte="titre" data-lettres="monte"></h1>'), []);
});

test('tracé : data-sur-trace illisible signalé ; la page embarque le module trace et sa feuille', () => {
  const ok = '<section data-scene="a"><svg class="pm-sur-trace" viewBox="0 0 1000 400"><path id="arc" d="M50 350 Q500 0 950 350" fill="none"/><text><textPath href="#arc" data-texte="titre" data-start="0.2" data-sur-trace="defile 100→0 0+3"></textPath></text></svg></section>';
  const dir = projet([['a', ok]]);
  const r = assembler1(dir);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.ok(r.groupes.includes('trace'));
  assert.ok(/M\.demarrerTraces\(\);/.test(r.html), 'M.demarrerTraces() au démarrage');
  assert.match(r.cssPage, /\.pm-sur-trace text \{ fill: currentColor; \}/);
  const faux = projet([['a', ok.replace('defile 100→0 0+3', 'defile 100 0+3')]]);
  const p = controler1(faux).problemes.filter((x) => x.regle === 'sur-trace-invalide');
  assert.equal(p.length, 1);
  assert.equal(p[0].gravite, 'erreur');
});

// --- Police variable (5.6) -----------------------------------------------------------------------------------------------

test('police : axes wght 100–900 lus dans Inter.woff2 ; Fredoka-500 statique', () => {
  const inter = P.analyserPolice(fs.readFileSync(path.join(POLICES, 'Inter.woff2')));
  assert.deepEqual(inter.axes, [{ tag: 'wght', min: 100, defaut: 400, max: 900 }]);
  assert.equal(P.annonceAxes(inter.axes), 'police variable : graisse de 100 à 900');
  const figtree = P.analyserPolice(fs.readFileSync(path.join(POLICES, 'Figtree.woff2')));
  assert.deepEqual(figtree.axes.map((a) => [a.tag, a.min, a.max]), [['wght', 300, 900]]);
  const fredoka = P.analyserPolice(fs.readFileSync(path.join(RACINE, 'styles', 'chaleureux', 'polices', 'Fredoka-500.woff2')));
  assert.deepEqual(fredoka.axes, []);
  assert.equal(fredoka.graisse, 500);
  assert.equal(P.annonceAxes(fredoka.axes), null);
});

test('assembler : plage de graisse réelle pour une police variable, usWeightClass pour un fichier statique', () => {
  const dir = projet([['a', '<section data-scene="a"><h1 data-texte="titre" data-start="0.2"></h1></section>']], { style: 'clair-pedagogique' });
  const r = assembler1(dir, 'clair-pedagogique');
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.match(r.cssPage, /font-family: 'Inter'; src: url\("data:font\/woff2;base64,[^"]+"\); font-weight: 100 900; font-display: block;/);
  assert.match(r.cssPage, /font-family: 'Figtree'; src: url\("data:font\/woff2;base64,[^"]+"\); font-weight: 300 900; font-display: block;/);
  // Un fichier statique sans graisse dans son nom : celle qu'il inscrit (Fredoka-500 copié sous le nom « Rondo.woff2 »).
  const dir2 = projet([['a', '<section data-scene="a"><h1 data-texte="titre" data-start="0.2"></h1></section>']], {
    style: 'clair-pedagogique', deroule: (d) => { d.charte = { polices: { titres: 'charte/polices/Rondo.woff2' } }; } });
  fs.mkdirSync(path.join(dir2, 'charte', 'polices'), { recursive: true });
  fs.copyFileSync(path.join(RACINE, 'styles', 'chaleureux', 'polices', 'Fredoka-500.woff2'), path.join(dir2, 'charte', 'polices', 'Rondo.woff2'));
  const r2 = assembler1(dir2, 'clair-pedagogique');
  assert.equal(r2.ok, true, JSON.stringify(r2.erreurs));
  assert.match(r2.cssPage, /font-family: 'Rondo'; src: url\("data:font\/woff2;base64,[^"]+"\); font-weight: 500; font-display: block;/);
  // Les axes ne passent dans la page qu'avec une animation de police variable.
  assert.equal(r.donnees.polices, undefined);
  const dir3 = projet([['a', '<section data-scene="a"><h1 data-texte="titre" data-start="0.2" data-lettres="graisse"></h1></section>']], { style: 'clair-pedagogique' });
  const r3 = assembler1(dir3, 'clair-pedagogique');
  assert.deepEqual(r3.donnees.polices.Inter.axes.map((a) => a.tag), ['wght']);
  assert.ok(r3.donnees.polices.Figtree);
  assert.match(r3.cssPage, /@keyframes pm-l-graisse/);
});

test('contrôle : graisse animée sur une police statique signalée', () => {
  const scene = '<section data-scene="a"><h1 class="titre" data-texte="titre" data-start="0.2" data-lettres="graisse"></h1><p class="pm-variable" data-texte="titre" data-start="1" data-dur="1" data-tween="--pm-wght 300→800"></p></section>';
  const statique = controler1(projet([['a', scene]], { style: 'chaleureux' }), 'chaleureux').problemes.filter((p) => p.regle === 'police-non-variable');
  assert.ok(statique.length >= 1, 'police statique signalée');
  assert.ok(statique.every((p) => p.gravite === 'alerte'));
  assert.match(statique[0].message, /n'est pas variable : la graisse sautera d'un cran à l'autre\. Choisir une police variable \(Inter ou Figtree du style clair-pedagogique, ou une police fournie\)\./);
  const variable = controler1(projet([['a', scene]], { style: 'clair-pedagogique' }), 'clair-pedagogique').problemes.filter((p) => p.regle === 'police-non-variable');
  assert.deepEqual(variable, []);
});

test('police : une police variable fournie annonce ses axes à l\'installation', () => {
  const { installerFichier } = require('../scripts/polices.js');
  const dans = path.join(dossierTemporaire('pm-police-variable-'), 'charte', 'polices');
  const r = installerFichier({ fichier: path.join(POLICES, 'Inter.woff2'), famille: 'Interne', dans });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.variable, 'police variable : graisse de 100 à 900');
  const s = installerFichier({ fichier: path.join(RACINE, 'styles', 'chaleureux', 'polices', 'Fredoka-500.woff2'), famille: 'Rondo', dans });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(s.variable, undefined);
});

// --- Karaoké (5.8) ------------------------------------------------------------------------------------------------------------

test('karaoké : avance 0 avant t0, 0,5 au milieu du mot, 1 après t1', () => {
  assert.equal(ST.avanceKaraoke(0.9, 1, 2), 0);
  assert.equal(ST.avanceKaraoke(1, 1, 2), 0);
  assert.equal(ST.avanceKaraoke(1.5, 1, 2), 0.5);
  assert.equal(ST.avanceKaraoke(2, 1, 2), 1);
  assert.equal(ST.avanceKaraoke(3, 1, 2), 1);
  assert.equal(ST.avanceKaraoke(1.33333, 1, 2), 0.333);
  assert.equal(ST.avanceKaraoke(1, 1, 1), 1);
});

test('karaoké : mode refusé hors de ligne, mot, karaoke', () => {
  const d = (mode) => ({ version: 1, titre: 'T', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 's', scenes: [{ id: 'a', fichier: 'a.html', duree: 1, textes: {} }], sousTitres: { mode } });
  for (const mode of ['ligne', 'mot', 'karaoke']) assert.ok(!validerDeroule(d(mode)).join(' ').includes('sousTitres.mode'), mode);
  assert.match(validerDeroule(d('syllabe')).join(' '), /« sousTitres\.mode » doit être « ligne », « mot » ou « karaoke »\./);
});

test('karaoké : alerte sans voix calée', () => {
  const dir = projet([['a', '<section data-scene="a"><h1 data-texte="titre" data-start="0.2"></h1></section>']], {
    deroule: (d) => { d.sousTitres = { mode: 'karaoke' }; d.scenes[0].voix = { texte: 'Le froid garde les aliments sains et sûrs.' }; } });
  const r = assembler1(dir);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const a = r.erreurs.filter((e) => e.regle === 'karaoke-sans-voix');
  assert.equal(a.length, 1);
  assert.equal(a[0].gravite, 'alerte');
  assert.match(a[0].message, /^Le karaoké suit les mots de la voix : sans voix enregistrée et calée, le remplissage ne suivra pas la parole/);
  assert.equal(r.donnees.sousTitres.mode, 'karaoke');
  assert.match(r.cssPage, /#pm-sous-titres\[data-mode="karaoke"\] \.pm-st-mot/);
  // En mode mot, rien.
  modifierDeroule(dir, (d) => { d.sousTitres.mode = 'mot'; });
  const r2 = assembler1(dir);
  assert.equal(r2.erreurs.filter((e) => e.regle === 'karaoke-sans-voix').length, 0);
  assert.doesNotMatch(r2.cssPage, /data-mode="karaoke"/);
});

// --- QR codes (5.4) ---------------------------------------------------------------------------------------------------------

const QR = (attrs = '', style = 'width: 40cqh; height: 40cqh') => `<section data-scene="a"><svg data-qr="lien" ${attrs} data-start="0.3" style="${style}"></svg></section>`;

test('qr : le lien vient des textes du déroulé ; texte absent signalé comme data-texte', () => {
  const dir = projet([['a', QR('class="code"'), 8, { lien: 'https://exemple.fr' }]]);
  const r = assembler1(dir);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const svg = /<svg[^>]*data-qr="lien"[^>]*>/.exec(r.html)[0];
  assert.match(svg, /viewBox="0 0 33 33"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /data-pm-qr-modules="33"/);
  assert.match(svg, /aria-label="QR code : https:\/\/exemple\.fr"/);
  assert.match(svg, /class="code"/);
  assert.ok(/data-pm-qr-modules="33" role="img" aria-label="[^"]*"><rect width="33" height="33" fill="#ffffff"\/><path fill="#000000" d="M4 4h7v1h-7z/.test(r.html), 'un fond, puis un seul tracé des modules');
  assert.match(r.cssPage, /svg\[data-pm-qr-modules\] \{ shape-rendering: crispEdges; \}/);
  // Changer le texte du déroulé change le code (retoucher : « change le lien du QR code »).
  modifierDeroule(dir, (d) => { d.scenes[0].textes.lien = 'https://exemple.fr/inscription'; });
  assert.notEqual(/<path fill="#000000" d="([^"]+)"/.exec(assembler1(dir).html)[1], /<path fill="#000000" d="([^"]+)"/.exec(r.html)[1]);
  // Texte absent : la même règle et le même message qu'un data-texte.
  const sans = assembler1(projet([['a', QR(), 8]]));
  const e = sans.erreurs.find((x) => x.regle === 'texte-manquant');
  assert.ok(e, JSON.stringify(sans.erreurs));
  assert.equal(e.message, 'Scène « a » : data-qr="lien" n\'a pas de texte dans le déroulé.');
  // Correction et couleurs.
  const h = assembler1(projet([['a', QR('data-qr-correction="H" data-qr-encre="primaire"'), 8, { lien: 'https://exemple.fr' }]]));
  assert.equal(h.ok, true, JSON.stringify(h.erreurs));
  assert.ok(/viewBox="0 0 37 37"/.test(h.html), 'niveau H : version 3');
  assert.ok(/<path fill="#0a6cff" d=/.test(h.html), 'encre : la couleur « primaire » de la charte');
  const faux = assembler1(projet([['a', QR('data-qr-correction="X"'), 8, { lien: 'https://exemple.fr' }]]));
  assert.ok(faux.erreurs.some((x) => x.regle === 'qr-invalide' && /L, M, Q ou H/.test(x.message)));
  // Rangées une à une (#135 « QR qui se compose »).
  const compose = assembler1(projet([['a', QR('class="pm-qr-compose"'), 8, { lien: 'https://exemple.fr' }]]));
  const rangees = (compose.html.match(/<path fill="#000000" style="--pm-i: \d+"/g) || []).length;
  assert.ok(rangees >= 20 && rangees <= 25, `${rangees} rangées (version 2 : 25 rangées, une rangée sans module foncé n'a pas de tracé)`);
});

test('contrôle : code immobile 3 s signalé ; clair sur foncé refusé ; lien trop long signalé', () => {
  const lien = { lien: 'https://exemple.fr' };
  // Scène de 3,3 s : le code apparaît à 0,3 s (plus son apparition) et la scène finit : moins de 4 s immobile.
  const court = controler1(projet([['a', QR(), 3.3, lien]]));
  const c = court.problemes.filter((p) => p.regle === 'qr-trop-court');
  assert.equal(c.length, 1, JSON.stringify(regles(court)));
  assert.match(c[0].message, /ne reste visible et immobile que [23](,\d)? s ; il faut au moins 4 s/);
  assert.deepEqual(controler1(projet([['a', QR(), 8, lien]])).problemes.filter((p) => p.regle === 'qr-trop-court'), []);
  // Une caméra qui bouge pendant la scène coupe le temps immobile.
  const camera = controler1(projet([['a', `<section data-scene="a"><div data-camera="zoom 1→1.1 2+4"><svg data-qr="lien" data-start="0.3" style="width: 40cqh; height: 40cqh"></svg></div></section>`, 8, lien]]));
  assert.equal(camera.problemes.filter((p) => p.regle === 'qr-trop-court').length, 1);
  // Clair sur foncé, et contraste trop faible.
  const inverse = controler1(projet([['a', QR('data-qr-encre="#ffffff" data-qr-fond="#111111"'), 8, lien]]));
  const i = inverse.problemes.filter((p) => p.regle === 'qr-contraste');
  assert.equal(i.length, 1);
  assert.equal(i[0].gravite, 'erreur');
  assert.match(i[0].message, /clair sur fond foncé/);
  const pale = controler1(projet([['a', QR('data-qr-encre="#777777" data-qr-fond="#ffffff"'), 8, lien]]));
  assert.match(pale.problemes.find((p) => p.regle === 'qr-contraste').message, /contraste de 4,5:1 ; il faut au moins 7:1/);
  assert.deepEqual(controler1(projet([['a', QR(), 8, lien]])).problemes.filter((p) => p.regle === 'qr-contraste'), []);
  const long = controler1(projet([['a', QR(), 8, { lien: `https://exemple.fr/${'x'.repeat(120)}` }]]));
  assert.equal(long.problemes.filter((p) => p.regle === 'qr-long').length, 1);
});

// --- Ken Burns (5.9) -------------------------------------------------------------------------------------------------------

test('ken burns : clauses calculées de l\'apparition à la fin de la scène, ampleur bornée', () => {
  const c = KB.kenBurns('avant 1.2', 1, 5, 's|0');
  assert.equal(c.sens, 'avant');
  const zoom = c.find((x) => x.prop === 'zoom');
  assert.deepEqual([zoom.de, zoom.a, zoom.debut, zoom.duree, zoom.nomCourbe], [1, 1.2, 1, 5, 'sine-inout']);
  for (const x of c) {
    if (x.prop === 'zoom') continue;
    // Point visé décalé de 6 % au plus, et l'image zoomée couvre toujours le cadre.
    assert.ok(Math.abs(x.a - 50) <= 6 + 1e-9 && Math.abs(x.de - 50) <= 6 + 1e-9, JSON.stringify(x));
    assert.ok(Math.abs(x.a - 50) <= 50 - 50 / 1.2 + 1e-9);
  }
  assert.equal(KB.lireKenBurns('auto').ampleur, 1.12);
  assert.deepEqual(KB.lireKenBurns('gauche 2'), { sens: 'gauche', ampleur: 1.3, horsBornes: 2 });
  assert.deepEqual(KB.lireKenBurns('droite 1.01'), { sens: 'droite', ampleur: 1.03, horsBornes: 1.01 });
  for (const sens of ['gauche', 'droite', 'haut', 'bas']) {
    const k = KB.kenBurns(`${sens} 1.1`, 0, 4, 's|1');
    assert.ok(k.filter((x) => x.prop === 'zoom').every((x) => x.de === 1.1 && x.a === 1.1), sens);
    const axe = k.find((x) => x.prop === (sens === 'gauche' || sens === 'droite' ? 'x' : 'y'));
    assert.ok((sens === 'gauche' || sens === 'haut') ? axe.a < axe.de : axe.a > axe.de, sens);
  }
  assert.throws(() => KB.lireKenBurns('tourne'), /sens « tourne » inconnu/);
  assert.throws(() => KB.lireKenBurns('avant beaucoup'), /ampleur « beaucoup » illisible/);
});

test('ken burns : auto ne donne jamais deux sens identiques de suite, et le même tirage à chaque rendu', () => {
  const tirer = () => {
    let precedent = null;
    const sens = [];
    for (let i = 0; i < 40; i++) { const c = KB.kenBurns('auto', 0, 4, `scene-${Math.floor(i / 3)}|${i % 3}`, precedent); sens.push(c.sens); precedent = c.sens; }
    return sens;
  };
  const a = tirer();
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i], a[i - 1], `rang ${i}`);
  assert.deepEqual(tirer(), a);
  assert.ok(new Set(a).size >= 4, 'des sens variés');
});

test('ken burns : la page embarque le module, et une ampleur hors bornes est signalée', () => {
  const html = (v) => `<section data-scene="a"><div class="photo" data-ken-burns="${v}" data-start="0.5" style="position: absolute; inset: 10cqh"><svg viewBox="0 0 16 9" aria-hidden="true"><rect width="16" height="9"/></svg></div></section>`;
  const r = assembler1(projet([['a', html('auto')]]));
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.ok(r.groupes.includes('ken-burns'));
  assert.match(r.cssPage, /\[data-pm-kb\]/);
  const p = controler1(projet([['a', html('avant 1.5')]])).problemes.filter((x) => x.regle === 'ken-burns-invalide');
  assert.equal(p.length, 1);
  assert.match(p[0].message, /ampleur 1,5 hors de 1,03 à 1,3/);
});

// --- 2,5D (5.12) ---------------------------------------------------------------------------------------------------------------

test('3d : une scène en perspective est signalée, et l\'export rapide la refuse avant tout navigateur', async () => {
  const carte = '<section data-scene="a"><div class="pm-espace-3d"><div class="pm-m-retourne" data-start="1"><div class="pm-3d-face"></div><div class="pm-3d-face pm-3d-verso"></div></div></div></section>';
  const dir = projet([['a', carte], ['b', '<section data-scene="b"><h1 class="pm-3d" data-texte="titre" data-start="0.2" style="--pm-3d-pose: rotateX(22deg)"></h1></section>']]);
  const p = controler1(dir).problemes.filter((x) => x.regle === 'trois-d-export-rapide');
  assert.deepEqual(p.map((x) => x.scene), ['a'], 'l\'écran incliné (perspective dans transform) passe');
  assert.equal(p[0].gravite, 'alerte');
  assert.match(p[0].message, /Cette scène utilise de la 3D que l'export rapide ne rend pas : exporter avec ffmpeg \(export fidèle\)\./);
  const { exporterVideo } = require('../scripts/exporter.js');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, navigateur: null });
  assert.equal(r.ok, false);
  assert.deepEqual(r.troisD, ['a']);
  assert.match(r.message, /La scène « a » utilise de la 3D que l'export rapide ne rend pas : exporter avec ffmpeg \(export fidèle\)/);
});

// --- Dictionnaire et consignes ------------------------------------------------------------------------------------------------

test('briques : entrées du dictionnaire après #128, référence et consignes', () => {
  const dico = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'mouvements', 'mouvements.json'), 'utf8'));
  const slugs = ['texte-sur-trace', 'graisse-respire', 'lettres-epaississent', 'texte-fenetre', 'fondu-balaye', 'image-forme', 'qr-compose', 'ken-burns',
    'carte-retourne', 'cube-tourne', 'ecran-incline', 'texte-relief'];
  for (const s of slugs) {
    const e = dico.mouvements.find((x) => x.slug === s);
    assert.ok(e, s);
    assert.ok(Number(e.no) > 128, `${s} : #${e.no} après les numéros publiés`);
  }
  const ref = fs.readFileSync(path.join(RACINE, 'references', 'briques.md'), 'utf8');
  for (const x of ['data-sur-trace', 'pm-variable', 'data-lettres="graisse"', 'pm-texte-image', 'pm-m-masque-doux', 'pm-masque-forme', '"mode": "karaoke"',
    'data-qr="lien"', 'data-ken-burns', 'pm-espace-3d', 'pm-3d-face', '--pm-3d-pose', 'pm-relief']) assert.ok(ref.includes(x), x);
  const controles = fs.readFileSync(path.join(RACINE, 'references', 'controles.md'), 'utf8');
  for (const r of ['qr-trop-petit', 'qr-trop-court', 'qr-contraste', 'qr-long', 'qr-hors-zone', 'qr-invalide', 'sur-trace-invalide', 'police-non-variable', 'karaoke-sans-voix', 'ken-burns-invalide']) {
    assert.match(controles, new RegExp(`\\| \`${r}\` \\|`), r);
  }
  const retoucher = fs.readFileSync(path.join(RACINE, 'skills', 'retoucher', 'SKILL.md'), 'utf8');
  assert.match(retoucher, /« un QR code vers notre site à la fin »/);
  assert.match(retoucher, /`pulse-motion reference briques`/);
  assert.match(retoucher, /« façon karaoké »/);
});
