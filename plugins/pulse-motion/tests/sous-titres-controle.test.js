'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { ouvrirPageSon } = require('./aide/page-son.js');
const { traduireConstats, controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

// Le texte « sous » de la scène d'ouverture est placé tout en bas, là où passent les sous-titres.
function projet(position) {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.sousTitres = position ? { position } : {}; d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' }; });
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', '<style>[data-scene="intro"] [data-texte="sous"] { position: absolute; left: 20%; right: 20%; bottom: 6cqh; margin: 0; }</style></section>'));
  return dir;
}

test('sous-titre qui cache un texte de la scène : constat sous-titre-cache-texte ; en haut : aucun', sans, async () => {
  const bas = await ouvrirPageSon({ dir: projet(), navigateur });
  try {
    const c = await bas.evaluer('M.mesurer({ ratio: "16:9" })');
    assert.ok(c.some((x) => x.regle === 'sous-titre-cache-texte' && x.element === 'sous'), JSON.stringify(c));
  } finally { await bas.fermer(); }
  const haut = await ouvrirPageSon({ dir: projet('haut'), navigateur });
  try {
    const c = await haut.evaluer('M.mesurer({ ratio: "16:9" })');
    assert.ok(!c.some((x) => x.regle === 'sous-titre-cache-texte'), JSON.stringify(c));
  } finally { await haut.fermer(); }
});

test('message du constat en français', () => {
  const [p] = traduireConstats([{ regle: 'sous-titre-cache-texte', scene: 'intro', element: 'sous', instant: 1.2, valeur: 0.5 }]);
  assert.equal(p.gravite, 'alerte');
  assert.match(p.message, /sous-titres cachent le texte « sous ».*« position »: « haut »/);
});

test('contraste des sous-titres lu aux pixels (sous-titres blancs sans bandeau sur fond blanc)', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.sousTitres = { position: 'haut' }; d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' }; });
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const illisible = html.replace('</head>', '<style>#pm-scene > section { background: #fff !important; } #pm-scene .pm-st-carton { background: transparent !important; color: #fff !important; }</style></head>');
  const r = await controlerRendu({ html: illisible, ratio: '16:9', duree: 8, navigateur });
  assert.equal(r.renduVerifie, true, JSON.stringify(r.problemes));
  assert.ok(r.problemes.some((p) => p.regle === 'contraste-reel' && p.element === 'sous-titres'), JSON.stringify(r.problemes.map((p) => [p.regle, p.element])));
});

function projetVertical() {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.format.ratio = '9:16'; d.sousTitres = {}; d.scenes[0].voix = { texte: 'Rangez immédiatement vos courses dans le réfrigérateur en rentrant.' }; });
  return dir;
}
const GEOMETRIE = `(function () {
  var scene = document.getElementById('pm-scene').getBoundingClientRect();
  for (var t = 0.3; t < M.duree; t += 0.2) {
    M.rendre(t);
    var carton = document.querySelector('#pm-sous-titres .pm-st-carton');
    if (!carton) continue;
    var rc = carton.getBoundingClientRect();
    var debord = Array.prototype.some.call(carton.querySelectorAll('[data-pm-st]'), function (l) { return l.scrollWidth > carton.clientWidth + 1; });
    return { droite: (rc.right - scene.left) / scene.width, gauche: (rc.left - scene.left) / scene.width, debord: debord };
  }
  return null;
})()`;

test('revue : 9:16 par défaut : lignes contenues dans leur carton, carton hors de la colonne des boutons, aucune alerte', sans, async () => {
  const page = await ouvrirPageSon({ dir: projetVertical(), navigateur });
  try {
    const g = await page.evaluer(GEOMETRIE);
    assert.ok(g, 'aucun carton affiché');
    assert.equal(g.debord, false);
    assert.ok(g.droite <= 0.89 && g.gauche >= 0.04, JSON.stringify(g));
    const c = await page.evaluer('M.mesurer({ ratio: "9:16" })');
    assert.ok(!c.some((x) => x.element === 'sous-titres'), JSON.stringify(c.filter((x) => x.element === 'sous-titres')));
  } finally { await page.fermer(); }
});

test('revue : 9:16 : un carton poussé dans la colonne des boutons ou contre le bord est signalé', sans, async () => {
  const prelude = 'window.addEventListener("load", function () { var s = document.createElement("style"); s.textContent = "#pm-scene .pm-st-carton { max-width: none !important; width: 99% !important; }"; document.head.appendChild(s); });';
  const page = await ouvrirPageSon({ dir: projetVertical(), navigateur, prelude });
  try {
    const c = await page.evaluer('M.mesurer({ ratio: "9:16" })');
    assert.ok(c.some((x) => x.regle === 'zone-sure' && x.element === 'sous-titres' && x.valeur === 'droite'), JSON.stringify(c));
    assert.ok(c.some((x) => x.regle === 'marge' && x.element === 'sous-titres'), JSON.stringify(c));
  } finally { await page.fermer(); }
});

test('revue : zone-sure sur les sous-titres : conseil propre aux sous-titres', () => {
  const [p] = traduireConstats([{ regle: 'zone-sure', scene: 'intro', element: 'sous-titres', instant: 1, valeur: 'droite' }]);
  assert.match(p.message, /sous-titres passent sous les boutons.*--pm-st-largeur/);
  assert.doesNotMatch(p.message, /retirer un point/);
});

test('correctifs : logo caché par un sous-titre : logo-masque, message qui propose les sous-titres en haut', sans, async () => {
  const dir = projet();
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', '<div data-logo style="position:absolute; left:45%; width:10%; bottom:6cqh; height:8cqh; background:#123456"></div></section>'));
  const page = await ouvrirPageSon({ dir, navigateur });
  try {
    const c = await page.evaluer('M.mesurer({ ratio: "16:9" })');
    const logo = c.find((x) => x.regle === 'logo-masque');
    assert.ok(logo && logo.valeur && logo.valeur.par === 'sous-titres', JSON.stringify(c));
    const [p] = traduireConstats([logo]);
    assert.match(p.message, /sous-titres/);
    assert.match(p.message, /haut/);
  } finally { await page.fermer(); }
});

test('correctifs : carton affiché moins de 1,25 s : texte-fugace sur « sous-titres »', sans, async () => {
  const dir = projet('haut');
  const page = await ouvrirPageSon({ dir, navigateur, modifier: (d) => {
    d.sousTitres.cartons = [{ scene: 'intro', debut: 1, fin: 1.6, lignes: [[{ w: 'Vite', t0: 1, t1: 1.5 }]] }, { scene: 'intro', debut: 1.7, fin: 4, lignes: [[{ w: 'ensuite', t0: 1.7, t1: 2.2 }]] }];
  } });
  try {
    const c = await page.evaluer('M.mesurer({ ratio: "16:9" })');
    const f = c.find((x) => x.regle === 'texte-fugace' && x.element === 'sous-titres');
    assert.ok(f, JSON.stringify(c));
    assert.ok(Math.abs(f.valeur.duree - 0.6) < 0.05);
    assert.match(traduireConstats([f])[0].message, /sous-titre.*0,6 s/);
  } finally { await page.fermer(); }
});

test('correctifs : contraste des sous-titres : le message propose --pm-st-fond ou --pm-st-texte', () => {
  const [p] = traduireConstats([{ regle: 'contraste-reel', scene: 'intro', element: 'sous-titres', instant: 2, valeur: 1.8 }]);
  assert.match(p.message, /--pm-st-fond/);
  assert.match(p.message, /--pm-st-texte/);
});
