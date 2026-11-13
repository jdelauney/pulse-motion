'use strict';
/* Spec S11, jalon J6 (5.9) : la journée qui passe (moteur/journee.js), sans navigateur. Variables de l'heure, bascule de
 * l'encre, lampes dans l'ordre de leur seuil, règles journee-texte et journee-invalide, moteur à la carte ; tailles de la
 * planche de la journée (5.11 point 2). Page : journee-page.test.js et planche-journee-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../moteur/journee.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const { verifierJournee, texteJournee, sEfface } = require('../scripts/lib/journee-scene.js');
const { controlesRapides } = require('../scripts/controler.js');
const { assembler } = require('../scripts/assembler.js');
const { tailleVignette, taillePlanche, TAUS, PLANCHE_COTE, PLANCHE_AIRE } = require('../scripts/planche-journee.js');
const { copierProjet, modifierDeroule, STYLES } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const rvb = (s) => s.match(/\d+/g).map(Number);

test('journee : même τ, mêmes variables', () => {
  const taus = Array.from({ length: 101 }, (_, i) => i / 100).concat([0.245, 0.7499, 0.7501, 0.755]);
  for (const t of taus) {
    const v = J.variables(t);
    assert.deepEqual(Object.keys(v), ['--pm-ciel-haut', '--pm-ciel-bas', '--pm-papier', '--pm-encre', '--pm-nuit', '--pm-lampe']);
    assert.deepEqual(J.variables(t), v, `τ = ${t}`);
    assert.deepEqual(J.palette(t), J.palette(t));
    for (const n of ['--pm-ciel-haut', '--pm-ciel-bas', '--pm-papier', '--pm-encre']) assert.match(v[n], /^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/, n);
    for (const n of ['--pm-nuit', '--pm-lampe']) assert.ok(Number(v[n]) >= 0 && Number(v[n]) <= 1, n);
    // Aucune couleur de la charte : seulement les six variables de l'heure.
    assert.ok(!Object.keys(v).some((n) => n.startsWith('--c-')));
  }
  // Cycle : minuit est minuit ; l'ordre des appels ne change rien.
  assert.deepEqual(J.variables(0), J.variables(1));
  const ordre = [0.9, 0.1, 0.75, 0.3].map((t) => J.variables(t));
  assert.deepEqual([0.9, 0.1, 0.75, 0.3].map((t) => J.variables(t)), ordre);
  // τ de la scène : de a à b en cubic-inout, fixe avec un seul nombre.
  assert.deepEqual(J.lire('0.62-0.95'), { de: 0.62, a: 0.95 });
  assert.deepEqual(J.lire('0.75'), { de: 0.75, a: 0.75 });
  assert.deepEqual(J.lire(' 0.9 - 0.3 '), { de: 0.9, a: 0.3 });
  for (const x of ['', 'soir', '1.2', '0,75', '0.2-1.5', '-0.1', '0.2-0.3-0.4']) assert.equal(J.lire(x), null, x);
  const d = J.lire('0.62-0.95');
  assert.equal(J.tau(d, 0), 0.62);
  assert.equal(J.tau(d, 1), 0.95);
  assert.ok(Math.abs(J.tau(d, 0.5) - (0.62 + 0.95) / 2) < 1e-12);
  assert.ok(Math.abs(J.tau(d, 0.25) - (0.62 + 0.33 * 4 * 0.25 ** 3)) < 1e-12, 'cubic-inout');
  assert.equal(J.tau(d, -1), 0.62);
  assert.equal(J.tau(J.lire('0.75'), 0.4), 0.75);
});

test('journee : encre pâle sur papier sombre à τ = 0,9, encre sombre à τ = 0,5', () => {
  const nuit = J.palette(0.9), jour = J.palette(0.5);
  assert.ok(J.luminance(nuit.papier) < 0.36, `papier de nuit ${J.luminance(nuit.papier)}`);
  assert.equal(nuit.encreT, 1);
  assert.deepEqual(rvb(J.variables(0.9)['--pm-encre']), [0xef, 0xe6, 0xcf]);
  assert.ok(J.luminance(jour.papier) > 0.56, `papier de jour ${J.luminance(jour.papier)}`);
  assert.equal(jour.encreT, 0);
  assert.deepEqual(rvb(J.variables(0.5)['--pm-encre']), [0x1c, 0x1c, 0x1c]);
  assert.deepEqual(rvb(J.variables(0.5)['--pm-papier']), [0xfd, 0xfc, 0xf8]);
  assert.ok(J.contraste(nuit.encre, nuit.papier) >= 4.5 && J.contraste(jour.encre, jour.papier) >= 4.5);
  // L'encre bascule selon la luminance du papier, entre 0,56 et 0,36 ; nuit et lampes allumées à 0,9, éteintes à 0,5.
  for (let i = 0; i <= 1000; i++) {
    const P = J.palette(i / 1000), L = J.luminance(P.papier);
    if (L >= 0.56) assert.equal(P.encreT, 0, `τ = ${i / 1000}`);
    if (L <= 0.36) assert.equal(P.encreT, 1, `τ = ${i / 1000}`);
  }
  assert.ok(nuit.nuit > 0.9 && nuit.lampe > 0.9 && jour.nuit === 0 && jour.lampe === 0);
  assert.ok(J.palette(0.74).couchant > 0.5 && J.palette(0.25).couchant > 0.5 && jour.couchant === 0);
  // Le passage peu lisible est bref : sur une scène de 8 s de 0,62 à 0,95, moins de 0,3 s ; aucun de 0,3 à 0,6.
  const p = J.passages(J.lire('0.62-0.95'), 10, 18);
  assert.equal(p.length, 1);
  assert.ok(p[0].de > 13 && p[0].a < 15 && p[0].a - p[0].de < 0.3, JSON.stringify(p));
  assert.deepEqual(J.passages(J.lire('0.3-0.6'), 0, 8), []);
  assert.deepEqual(J.passages(J.lire('0.75'), 2, 6), [{ de: 2, a: 6 }], 'à la bascule fixe, toute la scène');
});

test('journee : les lampes s\'allument dans l\'ordre de leur seuil', () => {
  const graines = Array.from({ length: 12 }, (_, i) => `rue|f${i}`);
  const seuils = graines.map((g) => J.seuilLampe(g));
  assert.deepEqual(graines.map((g) => J.seuilLampe(g)), seuils, 'seuil tiré de la graine, toujours le même');
  for (const s of seuils) assert.ok(s >= J.SEUIL_LAMPE[0] && s <= J.SEUIL_LAMPE[1]);
  assert.ok(new Set(seuils).size === seuils.length, 'des seuils différents');
  // Le soir tombe : la première image où chaque lampe dépasse la moitié de son éclat suit l'ordre des seuils.
  const allumee = seuils.map(() => null);
  let precedent = -1;
  for (let i = 0; i <= 4000; i++) {
    const tau = 0.72 + 0.06 * i / 4000, P = J.palette(tau);
    assert.ok(P.lampe >= precedent - 1e-12, 'le signal lampe monte avec le soir');
    precedent = P.lampe;
    seuils.forEach((s, k) => { if (allumee[k] === null && J.allumage(s, P.lampe) > 0.5) allumee[k] = i; });
  }
  assert.ok(allumee.every((x) => x !== null), 'toutes allumées à la nuit');
  const parSeuil = seuils.map((s, k) => k).sort((a, b) => seuils[a] - seuils[b]);
  for (let k = 1; k < parSeuil.length; k++) assert.ok(allumee[parSeuil[k]] >= allumee[parSeuil[k - 1]], `ordre ${parSeuil.join(',')} : ${allumee.join(',')}`);
  assert.ok(allumee[parSeuil[parSeuil.length - 1]] > allumee[parSeuil[0]], 'une à une, pas toutes ensemble');
  // Éteintes en plein jour, allumées en pleine nuit ; la lumière reste chaude.
  for (const s of seuils) { assert.equal(J.allumage(s, J.palette(0.5).lampe), 0); assert.equal(J.allumage(s, J.palette(0.9).lampe), 1); }
  for (const g of graines) { const l = J.lumiere(J.chaleurLampe(g)); assert.ok(l[0] >= 0xf0 && l[2] <= 0x8a, String(l)); }
});

test('journee-texte : un texte visible pendant le passage est une erreur', () => {
  const scene = (attrs, corps) => `<section data-scene="rue"${attrs}>${corps}</section>`;
  const temps = { titre: { debut: 10.2, fin: 11 }, tard: { debut: 15, fin: 16 }, part: { debut: 10.5, fin: 12 } };
  const regles = (html) => texteJournee(html, { scene: 'rue', debut: 10, fin: 18, elements: temps }).map((p) => `${p.regle}/${p.gravite} ${p.message}`);
  const passage = J.passages(J.lire('0.62-0.95'), 10, 18)[0];
  // Un titre posé au début reste visible jusqu'à la fin : il voit le passage.
  const vu = regles(scene(' data-journee="0.62-0.95"', '<h1 id="titre" data-texte="titre" data-start="0.2"></h1>'));
  assert.equal(vu.length, 1);
  assert.match(vu[0], /^journee-texte\/erreur Scène « rue » : le texte « titre » est visible pendant le passage du jour à la nuit \(vers \d+,\d s\)/);
  // Un texte sans minutage dans un conteneur non minuté : visible dès le début de la scène.
  assert.equal(regles(scene(' data-journee="0.62-0.95"', '<div><p data-texte="note"></p></div>')).length, 1);
  // Un texte qui s'efface avant (data-tween opacity → 0), ou qui entre après : rien.
  assert.deepEqual(regles(scene(' data-journee="0.62-0.95"', '<div id="part" data-start="0.5" data-dur="1.5" data-tween="opacity 1→0"><p data-texte="a"></p></div>')), []);
  assert.ok(passage.de > 12, 'le texte est parti avant le passage');
  assert.deepEqual(regles(scene(' data-journee="0.62-0.95"', '<p id="tard" data-texte="b" data-start="5"></p>')), []);
  // Sans journée, ou pendant une heure qui se lit bien : rien.
  assert.deepEqual(regles(scene('', '<h1 id="titre" data-texte="titre" data-start="0.2"></h1>')), []);
  assert.deepEqual(regles(scene(' data-journee="0.3-0.6"', '<h1 id="titre" data-texte="titre" data-start="0.2"></h1>')), []);
  assert.equal(sEfface('opacity 1->0 cubic-out'), true);
  assert.equal(sEfface('--x 0cqh→10cqh; opacity 1→0.0'), true);
  assert.equal(sEfface('opacity 0→1'), false);
  assert.equal(sEfface('opacity 1→0.5'), false);

  // Au contrôle, d'après le minutage de la vidéo : l'erreur, sur un projet.
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), '<section data-scene="chiffre" data-journee="0.62-0.95">\n  <p data-texte="legende" data-start="0.5"></p>\n</section>');
  modifierDeroule(dir, (d) => { d.scenes[1].duree = 8; delete d.scenes[1].rythme; });
  const problemes = controlesRapides({ projet: dir, dossierStyles: STYLES }).problemes.filter((p) => p.regle === 'journee-texte');
  assert.equal(problemes.length, 1, JSON.stringify(problemes));
  assert.equal(problemes[0].gravite, 'erreur');
  assert.equal(problemes[0].scene, 'chiffre');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), '<section data-scene="chiffre" data-journee="0.62-0.95">\n  <p data-texte="legende" data-start="0.5" data-dur="2" data-tween="opacity 1→0"></p>\n</section>');
  assert.deepEqual(controlesRapides({ projet: dir, dossierStyles: STYLES }).problemes.filter((p) => p.regle === 'journee-texte'), []);
});

test('journee-invalide : l\'heure sur la section de la scène, des lampes dans une scène à journée', () => {
  const bon = verifierJournee('<section data-scene="s" data-journee="0.62-0.95"><svg><rect data-lampe /></svg><div data-lampe></div></section>', { scene: 's' });
  assert.deepEqual(bon.erreurs, []);
  assert.deepEqual(bon.journee, { de: 0.62, a: 0.95 });
  assert.equal(bon.lampes, 2);
  assert.deepEqual(verifierJournee('<section data-scene="s"><p>x</p></section>', { scene: 's' }), { erreurs: [], journee: null, lampes: 0 });
  const msgs = (html) => verifierJournee(html, { scene: 's' }).erreurs.map((e) => `${e.regle}/${e.gravite} ${e.message}`).join('\n');
  assert.match(msgs('<section data-scene="s" data-journee="soir"></section>'), /journee-invalide\/erreur .*data-journee="soir" : l'heure de la scène/);
  assert.match(msgs('<section data-scene="s" data-journee="0,75"></section>'), /point décimal/);
  assert.match(msgs('<section data-scene="s"><div data-journee="0.5"></div></section>'), /journee-invalide\/erreur .*sur la section de la scène .*pas sur un div/);
  assert.match(msgs('<section data-scene="s" data-journee="0.8"><i data-lampe="0.2"></i></section>'), /journee-invalide\/alerte .*s'écrit sans valeur/);
  assert.match(msgs('<section data-scene="s"><i data-lampe></i></section>'), /journee-invalide\/alerte .*sans data-journee : cette lampe ne s'allumera jamais/);
});

test('moteur à la carte : groupe journee seulement avec data-journee ; rien ne change sans lui', () => {
  const avec = (html) => GM.groupesDuDeroule({}, [html]).includes('journee');
  assert.equal(avec('<section data-scene="s"><p>x</p></section>'), false);
  assert.equal(avec('<section data-scene="s"><i data-lampe></i></section>'), false);
  assert.equal(avec('<section data-scene="s" data-journee="0.75"></section>'), true);
  assert.deepEqual(GM.modulesDesGroupes(['tronc', 'journee']).filter((m) => m === 'journee.js'), ['journee.js']);
  assert.equal(Object.values(GM.GROUPES).filter((l) => l.includes('journee.js')).length, 1);
  assert.ok(fs.statSync(path.join(RACINE, 'moteur', 'journee.js')).size <= 20000, 'module de 20 Ko au plus');
  // Une vidéo sans journée : ni module, ni appel ; avec : les deux.
  const sans = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false });
  assert.ok(!sans.groupes.includes('journee'));
  assert.doesNotMatch(sans.html, /demarrerJournee|pm-journee|--pm-ciel-haut/);
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), '<section data-scene="chiffre" data-journee="0.4-0.6"><p data-texte="legende" data-start="0.5"></p></section>');
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.ok(r.groupes.includes('journee'));
  assert.match(r.html, /M\.demarrerJournee\(\);/);
  // Jamais imposé : aucun style livré ne déclare l'heure, et le module n'écrit aucune couleur de la charte.
  for (const s of fs.readdirSync(path.join(RACINE, 'styles'))) {
    const css = path.join(RACINE, 'styles', s, 'style.css');
    if (fs.existsSync(css)) assert.doesNotMatch(fs.readFileSync(css, 'utf8'), /data-journee|--pm-ciel-/, s);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(RACINE, 'moteur', 'journee.js'), 'utf8'), /setProperty\(\s*['"]--c-|mix-blend-mode|\bscreen\b|Math\.random\(|filter\s*:/);
});

test('planche --journee : tailles des vignettes et de la planche (7 images, 1 568 px et 1,15 Mpx au plus)', () => {
  assert.deepEqual(TAUS, [0.24, 0.3, 0.5, 0.72, 0.75, 0.8, 0.95]);
  assert.deepEqual(tailleVignette('16:9'), [360, 203]);
  for (const ratio of ['16:9', '9:16', '1:1', '4:5']) {
    const [l, h] = tailleVignette(ratio);
    const [L, H] = taillePlanche(l, h);
    assert.ok(Math.max(l, h) <= 360, ratio);
    assert.ok(L <= PLANCHE_COTE && H <= PLANCHE_COTE && L * H <= PLANCHE_AIRE, `${ratio} : ${L} × ${H}`);
  }
});
