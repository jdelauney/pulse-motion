'use strict';
/* Spec S6 « Filmer une application et tutoriels logiciels », plan 1 (écran, pointeur, mise en valeur, sans tournage) :
 * critères de 5.9 à 5.15 vérifiables sans navigateur (modules purs, préparation à l'assemblage, contrôle, dictionnaire,
 * blocs, références, notices). Les critères rendus sont dans ecran-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../moteur/pointeur.js');
const Cam = require('../moteur/camera.js');
const L = require('../moteur/lettres.js');
const T = require('../moteur/cadres/telephone.js');
const E = require('../scripts/lib/ecrans.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const { assembler } = require('../scripts/assembler.js');
const { controlerScene } = require('../scripts/lib/controle-scene.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { charger } = require('../scripts/mouvements.js');
const D = require('../scripts/lib/determinisme.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const DEPOT = path.join(RACINE, '..', '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const CSS = lire('moteur', 'ecran.css');
const SANS_COMMENTAIRES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** projet-simple dont les scènes sont remplacées : [[id, html, durée, textes]]. */
function projet(scenes) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  scenes.forEach(([id, html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => {
    d.scenes = scenes.map(([id, , duree = 5, textes = { titre: 'Un titre' }], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, textes, transition: 'coupe' }));
  });
  return dir;
}
const assembler1 = (dir) => assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
const ECRAN = (marques, attrs = '') => `<section data-scene="s"><div class="pm-ecran" data-adresse="https://app.exemple.fr/factures/12?client=Dupont#ligne"${attrs} data-start="0">
<div style="position:absolute; inset:0"><div id="envoyer" style="position:absolute; left:60%; top:70%; width:20%; height:10%"></div></div>
${marques}
</div></section>`;

// --- 5.9 Pointeur ---------------------------------------------------------------------------------------------------

test('pointeur : même graine, même trajet ; autre graine, autre trajet', () => {
  const a = P.trajet([100, 600], [900, 200], { graine: 'scene:1:900:200', diagonale: 1509 });
  const b = P.trajet([100, 600], [900, 200], { graine: 'scene:1:900:200', diagonale: 1509 });
  const c = P.trajet([100, 600], [900, 200], { graine: 'autre:1:900:200', diagonale: 1509 });
  const points = (tr) => [0.1, 0.3, 0.5, 0.7, 0.9].map((q) => P.position(tr, q));
  assert.deepEqual(points(a), points(b));
  assert.notDeepEqual(points(a), points(c));
  // Courbure bornée (96 px ou 13 % de la distance, × 0,72 à 1,14) ; contrôles à 32 % et 72 %, le second à 70 %.
  const d = Math.hypot(800, 400);
  for (const tr of [a, c]) {
    assert.ok(Math.abs(tr.courbure) <= Math.min(96, 0.13 * d) * 1.14 + 1e-9 && Math.abs(tr.courbure) >= Math.min(96, 0.13 * d) * 0.72 - 1e-9);
    const ecart1 = (tr.c1[0] - (100 + 0.32 * 800)) / tr.normale[0];
    const ecart2 = (tr.c2[0] - (100 + 0.72 * 800)) / tr.normale[0];
    assert.ok(Math.abs(ecart1 - tr.courbure) < 1e-6 && Math.abs(ecart2 - 0.7 * tr.courbure) < 1e-6);
    assert.ok(tr.bruit <= 1.4 && tr.bruit === Math.min(1.4, d / 180));
  }
  // Départ et arrivée exacts, quel que soit le bruit.
  assert.deepEqual(P.position(a, 0), [100, 600]);
  assert.deepEqual(P.position(a, 1), [900, 200]);
});

test('pointeur : durée bornée entre 0,3 et 1,1 s selon la distance', () => {
  assert.equal(P.dureeTrajet(0, 1509), 0.3);
  assert.equal(P.dureeTrajet(5000, 1509), 1.1);
  assert.ok(Math.abs(P.dureeTrajet(754.5, 1509) - 0.65) < 1e-9);
  let avant = 0;
  for (let d = 0; d <= 3000; d += 100) { const t = P.dureeTrajet(d, 1509); assert.ok(t >= 0.3 && t <= 1.1 && t >= avant); avant = t; }
  // « Le pointeur va trop vite » : facteur de la durée.
  assert.ok(Math.abs(P.trajet([0, 0], [500, 0], { diagonale: 1509, vitesse: 1.4 }).duree - 1.4 * P.dureeTrajet(500, 1509)) < 1e-9);
});

test('pointeur : la pointe est au point visé à l\'instant de l\'action', () => {
  const gestes = [{ type: 'clic', instant: 1.6, point: [900, 560] }, { type: 'survol', instant: 3.2, point: [200, 100] }, { type: 'double-clic', instant: 5, point: [640, 400] }];
  for (const graine of ['a', 'b', 'scene-2']) {
    const plan = P.planGestes(gestes, { depart: [920, 620], diagonale: 1509, graine });
    for (const g of gestes) {
      const e = P.etatPointeur(plan, g.instant);
      assert.deepEqual([e.x, e.y], g.point, `${graine} : ${g.type}`);
    }
    // Pause de 0,35 s avant un clic : déjà arrivé.
    assert.deepEqual([P.etatPointeur(plan, 1.6 - 0.35).x, P.etatPointeur(plan, 1.6 - 0.35).y], [900, 560]);
    // En route avant.
    const g1 = plan.gestes[0];
    const mi = P.etatPointeur(plan, (g1.debut + g1.arrivee) / 2);
    assert.notDeepEqual([mi.x, mi.y], [900, 560]);
    assert.deepEqual(plan.ecarts, []);
  }
  // Point visé : 8 % et 78 % de la boîte, centre sous 48 px.
  assert.deepEqual(P.pointVise([100, 200, 200, 50]), [116, 239]);
  assert.deepEqual(P.pointVise([100, 200, 40, 30]), [120, 215]);
  // Enfoncement : 0,9 pendant 90 ms ; deux pour un double-clic.
  const plan = P.planGestes(gestes, { depart: [0, 0], diagonale: 1509, graine: 'a' });
  assert.equal(P.etatPointeur(plan, 1.65).echelle, 0.9);
  assert.equal(P.etatPointeur(plan, 1.9).echelle, 1);
  assert.equal(P.etatPointeur(plan, 5.2).echelle, 0.9);
});

test('pointeur : cercle de localisation visible 0,7 s puis absent', () => {
  const plan = P.planGestes([{ type: 'clic', instant: 2, point: [400, 300] }], { depart: [0, 0], diagonale: 1509, graine: 'x' });
  assert.equal(P.etatPointeur(plan, 1.99).ondes.length, 0);
  const pleins = [2.12, 2.3, 2.45].map((t) => P.etatPointeur(plan, t).ondes[0]);
  for (const o of pleins) assert.equal(o.opacite, 1);
  assert.ok(pleins[0].echelle > pleins[1].echelle && pleins[1].echelle > pleins[2].echelle, 'le cercle se resserre');
  assert.equal(P.onde(0).echelle, 2.4);
  assert.ok(Math.abs(P.onde(0.6999).echelle - 0.2) < 0.01);
  assert.ok(P.etatPointeur(plan, 2.69).ondes.length === 1);
  assert.equal(P.etatPointeur(plan, 2.7).ondes.length, 0);
  assert.equal(P.etatPointeur(plan, 3.5).ondes.length, 0);
});

test('pointeur : l\'appui de l\'élément visé reprend les valeurs de #081 (pm-m-appui)', () => {
  const css = lire('moteur', 'mouvements.css');
  assert.match(css, /@keyframes pm-m-appui \{ 0%, 100% \{ scale: 1; \} 55% \{ scale: var\(--pm-ampleur, 0\.97\); \} \}/);
  assert.match(css, /pm-m-appui var\(--pm-dur, 0\.22s\) var\(--pm-courbe, var\(--ease-cubic-out\)\)/);
  assert.deepEqual(P.APPUI, { duree: 0.22, ampleur: 0.97, sommet: 0.55 });
  assert.equal(P.appui(0.22 * 0.55), 0.97);
  assert.equal(P.appui(0), 1);
  assert.equal(P.appui(0.3), 1);
});

test('pointeur : gestes trop rapprochés relevés avec l\'écart minimal', () => {
  const plan = P.planGestes([{ type: 'clic', instant: 1, point: [100, 100] }, { type: 'clic', instant: 1.4, point: [1200, 700] }], { depart: [100, 100], diagonale: 1509, graine: 'g' });
  assert.equal(plan.ecarts.length, 1);
  const e = plan.ecarts[0];
  assert.deepEqual([e.a, e.b, e.ecart], [1, 2, 0.4]);
  assert.ok(Math.abs(e.minimum - (0.09 + 0.2 + 0.35 + plan.gestes[1].trajet.duree)) < 0.002, JSON.stringify(e));
  // Même trajet arrive quand même sur la cible à l'instant du clic.
  assert.deepEqual([P.etatPointeur(plan, 1.4).x, P.etatPointeur(plan, 1.4).y], [1200, 700]);
});

test('pointeur : un bruitage clic part à chaque clic, sauf data-son="aucun"', () => {
  const r = E.preparerEcrans(ECRAN(`<i class="pm-clic" data-cible="#envoyer" data-start="1"></i>
<i class="pm-clic" data-cible="10%,10%" data-start="3" data-son="aucun"></i>
<i class="pm-double-clic" data-cible="#envoyer" data-start="5"></i>
<i class="pm-survol" data-cible="#envoyer" data-start="7"></i>`), { scene: 's' });
  assert.deepEqual(r.erreurs, []);
  const marques = [...r.html.matchAll(/<i class="(pm-[a-z-]+)"([^>]*)>/g)].map((m) => [m[1], (/data-son="([^"]+)"/.exec(m[2]) || [])[1] || null, (/data-start="([^"]+)"/.exec(m[2]) || [])[1]]);
  assert.deepEqual(marques.map(([c, s]) => [c, s]), [['pm-clic', 'clic'], ['pm-clic', null], ['pm-double-clic', 'clic'], ['pm-son-clic', 'clic'], ['pm-survol', null]]);
  // Second clic du double-clic : 0,15 s après le premier.
  const id = /<i class="pm-double-clic"[^>]*\sid="([^"]+)"/.exec(r.html)[1];
  assert.equal(marques[3][2], `#${id}+0.15`);
  // Dans la page : les bruitages sont minutés à l'instant des clics, et le synthétiseur est embarqué.
  const dir = projet([['s', ECRAN('<i class="pm-clic" data-cible="#envoyer" data-start="1"></i><i class="pm-double-clic" data-cible="#envoyer" data-start="3"></i><i class="pm-clic" data-cible="#envoyer" data-start="4.5" data-son="aucun"></i>'), 6]]);
  const a = assembler1(dir);
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  assert.deepEqual(a.erreurs, []);
  assert.ok(a.groupes.includes('synthe') && a.groupes.includes('ecran'), a.groupes.join(','));
  assert.equal((a.html.match(/data-son="clic"/g) || []).length, 3);
});

test('lettres : saisie donne les mêmes paquets pour le même texte et la même scène', () => {
  const texte = 'Dupont SARL, 12 rue des Lilas';
  const a = L.paquetsSaisie(texte, 's3');
  assert.deepEqual(L.paquetsSaisie(texte, 's3'), a);
  assert.notDeepEqual(L.paquetsSaisie(texte, 's4').delais, a.delais);
  assert.notDeepEqual(L.paquetsSaisie('Martin SAS, 3 rue des Lilas', 's3').delais, a.delais);
  assert.equal(a.delais.length, [...texte].length);
  // Paquets de 1 à 3 caractères ; 45 à 140 ms entre deux, × 2,5 après une espace ou une ponctuation.
  const paquets = [];
  a.delais.forEach((d, i) => { if (i === 0 || d !== a.delais[i - 1]) paquets.push([i]); else paquets[paquets.length - 1].push(i); });
  for (const p of paquets) assert.ok(p.length >= 1 && p.length <= 3);
  for (let k = 1; k < paquets.length; k++) {
    const ecart = a.delais[paquets[k][0]] - a.delais[paquets[k - 1][0]];
    const pause = /[\s.,;:!?]/.test(texte[paquets[k - 1][paquets[k - 1].length - 1]]);
    assert.ok(ecart >= (pause ? 0.045 * 2.5 : 0.045) - 0.002 && ecart <= (pause ? 0.14 * 2.5 : 0.14) + 0.002, `${k} : ${ecart}`);
  }
  // Sur un long texte, les tailles suivent à peu près 0,6 / 0,3 / 0,1.
  const long = L.paquetsSaisie('a'.repeat(3000), 'x');
  const tailles = [0, 0, 0, 0];
  let n = 1;
  for (let i = 1; i <= long.delais.length; i++) { if (i < long.delais.length && long.delais[i] === long.delais[i - 1]) n++; else { tailles[n]++; n = 1; } }
  const total = tailles[1] + tailles[2] + tailles[3];
  assert.ok(Math.abs(tailles[1] / total - 0.6) < 0.05 && Math.abs(tailles[3] / total - 0.1) < 0.04, JSON.stringify(tailles));
  assert.ok(Object.hasOwn(L.EFFETS, 'saisie'));
});

// --- 5.11 Zooms -----------------------------------------------------------------------------------------------------

const zoomA = (clauses, t) => Cam.etatCamera(clauses, t).zoom;

test('zoom : deux zooms à moins de 1,5 s s\'enchaînent par un panoramique de 1 s sans repasser à 1', () => {
  const c = Cam.enchainerZooms([{ debut: 1, fin: 3, echelle: 2, x: 30, y: 40 }, { debut: 4, fin: 6, echelle: 1.6, x: 70, y: 60 }]);
  for (let t = 1.4; t <= 5.6; t += 0.05) assert.ok(zoomA(c, t) > 1.5, `t = ${t.toFixed(2)} : ${zoomA(c, t)}`);
  // Panoramique d'au plus 1 s, fini avec l'entrée du second (4,4 s), en 1 − (1 − p)³.
  const pano = c.filter((x) => x.prop === 'zoom' && x.de === 2 && x.a === 1.6);
  assert.equal(pano.length, 1);
  assert.ok(pano[0].duree <= 1 + 1e-9 && Math.abs(pano[0].debut + pano[0].duree - 4.4) < 1e-6, JSON.stringify(pano[0]));
  assert.equal(pano[0].nomCourbe, 'cubic-out');
  assert.ok(Math.abs(pano[0].courbe(0.5) - (1 - Math.pow(0.5, 3))) < 1e-6);
  assert.equal(Cam.etatCamera(c, 3.2).x, Cam.centreZoom(30, 40, 2)[0]);
  assert.equal(Cam.etatCamera(c, 5).x, Cam.centreZoom(70, 60, 1.6)[0]);
  // Recul final : plan large après la fin.
  assert.equal(zoomA(c, 6.5), 1);
  assert.equal(zoomA(c, 0.5), 1);
});

test('zoom : deux zooms à 2 s reviennent à 1 entre eux', () => {
  const c = Cam.enchainerZooms([{ debut: 1, fin: 3, echelle: 2, x: 30, y: 40 }, { debut: 5, fin: 7, echelle: 2, x: 70, y: 60 }]);
  assert.equal(zoomA(c, 4), 1);
  assert.equal(zoomA(c, 2), 2);
  assert.equal(zoomA(c, 6), 2);
  // Entrée et sortie de 0,4 s.
  assert.equal(zoomA(c, 1.4), 2);
  assert.ok(zoomA(c, 1.2) > 1 && zoomA(c, 1.2) < 2);
  assert.equal(zoomA(c, 3), 1);
});

test('zoom : échelle par défaut — la cible occupe 40 % de la largeur, de 1,3 à 2,5 ; centre gardé dans le cadre', () => {
  assert.equal(Cam.echelleZoom(0.2), 2);
  assert.equal(Cam.echelleZoom(0.05), 2.5);
  assert.equal(Cam.echelleZoom(0.5), 1.3);
  assert.equal(Cam.echelleZoom(0.2, 1.8), 1.8);
  assert.deepEqual(Cam.centreZoom(95, 2, 2), [75, 25]);
  // Une clause sans « log » reste celle de 0.24.0 : aucun changement pour les caméras écrites.
  assert.deepEqual(Cam.etatCamera(Cam.analyserCamera('zoom 1→2 0+2'), 1).zoom, 1.5);
});

// --- 5.12 Cadres --------------------------------------------------------------------------------------------------

test('cadre : le champ d\'adresse ne montre que le domaine', () => {
  assert.equal(E.domaine('https://app.exemple.fr/factures?client=Dupont#x'), 'app.exemple.fr');
  assert.equal(E.domaine('app.exemple.fr/clients'), 'app.exemple.fr');
  assert.equal(E.domaine('http://localhost:8080/essai'), 'localhost');
  assert.equal(E.domaine('file:///C:/appli/index.html'), '');
  const dir = projet([['s', ECRAN('<i class="pm-clic" data-cible="#envoyer" data-start="1"></i>')]]);
  const a = assembler1(dir);
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  assert.match(a.html, /<span class="pm-ecran-adresse">app\.exemple\.fr<\/span>/);
  for (const x of ['factures', 'client=', 'Dupont', '#ligne', 'data-adresse']) assert.ok(!a.html.includes(x), `« ${x} » ne doit pas être dans la page`);
});

test('cadre : le téléphone reprend le dessin du cadre d\'export de S5 (moteur/cadres/telephone.js)', () => {
  const regle = /#pm-scene \.pm-ecran\[data-cadre="telephone"\] \{([\s\S]*?)\}/.exec(SANS_COMMENTAIRES)[1];
  assert.match(regle, new RegExp(`--pm-corps: calc\\(var\\(--pm-ecran-l\\) / ${1 - 2 * T.BORD}\\)`));
  assert.match(regle, new RegExp(`padding: calc\\(var\\(--pm-corps\\) \\* ${T.BORD}\\)`));
  assert.match(regle, new RegExp(`border-radius: calc\\(var\\(--pm-corps\\) \\* ${T.RAYON}\\)`));
  assert.match(regle, new RegExp(`background: ${T.CORPS}`));
  assert.match(SANS_COMMENTAIRES, new RegExp(`\\[data-cadre="telephone"\\] > \\.pm-ecran-surface \\{ border-radius: calc\\(var\\(--pm-corps\\) \\* ${Math.round((T.RAYON - T.BORD) * 1000) / 1000}\\); \\}`));
  const pastille = /\[data-cadre="telephone"\]::before \{([\s\S]*?)\}/.exec(SANS_COMMENTAIRES)[1];
  assert.match(pastille, new RegExp(`top: calc\\(var\\(--pm-corps\\) \\* ${T.BORD / 2}\\)`));
  assert.match(pastille, new RegExp(`width: calc\\(var\\(--pm-corps\\) \\* ${Math.round(2 * T.PASTILLE.rayon * T.BORD * 1000) / 1000}\\)`));
  assert.match(pastille, new RegExp(`background: ${T.PASTILLE.couleur}`));
  // Tailles de tournage par défaut (5.12) posées à l'assemblage.
  assert.deepEqual(E.PAGES.telephone, [390, 844]);
  assert.deepEqual(E.PAGES.navigateur, [1280, 800]);
  assert.deepEqual(E.PAGES.tablette, [820, 1180]);
});

test('cadre : ecran.css sans filter:url, mix-blend-mode ni backdrop-filter, sans transition ni boucle sans fin', () => {
  assert.doesNotMatch(SANS_COMMENTAIRES, /filter\s*:\s*url|mix-blend-mode|backdrop-filter|transition\s*:|infinite/);
  // Projecteur, anneau, cercle et pointeur aux valeurs de la spec.
  assert.match(SANS_COMMENTAIRES, /rgb\(0 0 0 \/ var\(--pm-projecteur, 0\.7\)\), inset 0 0 calc\(12 \* var\(--pm-px\)\) calc\(6 \* var\(--pm-px\)\)/);
  assert.match(SANS_COMMENTAIRES, /\.pm-projecteur \{[^}]*border-radius: calc\(10 \* var\(--pm-px\)\)/);
  assert.match(SANS_COMMENTAIRES, /\.pm-anneau \{[^}]*border: calc\(3 \* var\(--pm-px\)\) solid var\(--c-accent/);
  // Plan 2 : pointeur et cercle dans un calque, dimensionnés par --pm-t (un pixel de la page × zoom × enfoncement).
  assert.match(SANS_COMMENTAIRES, /\.pm-ecran-calque \{[^}]*--pm-u: calc\(var\(--pm-px\) \* var\(--pm-z, 1\)\)/);
  assert.match(SANS_COMMENTAIRES, /\.pm-onde \{[^}]*width: calc\(44 \* var\(--pm-t\)\)[^}]*box-shadow: 0 0 0 calc\(2 \* var\(--pm-t\)\) #ffffff/);
  assert.match(SANS_COMMENTAIRES, /\.pm-pointeur \{[^}]*height: calc\(30 \* var\(--pm-t\)\)[^}]*drop-shadow\(0 calc\(2 \* var\(--pm-t\)\) calc\(2 \* var\(--pm-t\)\) rgb\(0 0 0 \/ 0\.48\)\)/);
  assert.match(SANS_COMMENTAIRES, /\[data-cadre="presentation"\] \{[^}]*padding: 3\.7cqh; border-radius: 1\.1cqh;/);
  assert.match(SANS_COMMENTAIRES, /perspective\(111cqh\) rotateX\(35deg\)/);
});

// --- Assemblage, contrôle --------------------------------------------------------------------------------------------

test('assembler : une vidéo sans écran garde la même page à la liste MOTEUR près', () => {
  const dir = copierProjet('projet-simple');
  const a = assembler1(dir);
  assert.equal(a.ok, true);
  assert.ok(!a.groupes.includes('ecran'), a.groupes.join(','));
  for (const x of ['pm-ecran', 'demarrerEcrans', 'pm-pointeur', 'pm-bloc', 'pm-l-curseur']) assert.ok(!a.html.includes(x), x);
  // Le moteur est le même que celui de ses groupes (aucun module d'écran) ; avec un écran, le groupe « ecran » et son CSS.
  const dir2 = projet([['s', ECRAN('<i class="pm-survol" data-cible="#envoyer" data-start="1"></i>')]]);
  const b = assembler1(dir2);
  assert.deepEqual(b.groupes, ['tronc', 'ecran']);
  assert.match(b.html, /M\.demarrerEcrans\(\);\n<\/script>/);
  assert.match(b.html, /#pm-scene \.pm-ecran-surface \{/);
  assert.deepEqual(GM.modulesDesGroupes(['tronc', 'ecran']).filter((m) => !GM.modulesDesGroupes(['tronc']).includes(m)), ['pointeur.js', 'film.js', 'ecran.js']);
  // Un bloc seul (sans écran) : le CSS, pas le moteur.
  const dir3 = projet([['s', `<section data-scene="s">${lire('moteur', 'blocs', 'toast.html').replace('data-texte="message"', 'data-texte="titre"')}</section>`]]);
  const c = assembler1(dir3);
  assert.equal(c.ok, true, JSON.stringify(c.erreurs));
  assert.ok(!c.groupes.includes('ecran') && c.html.includes('.pm-bloc-toast {') && !c.html.includes('demarrerEcrans'));
});

test('assembler : structure de l\'écran posée (cadre, surface, plan), marques en décor, durées par défaut', () => {
  const r = E.preparerEcrans(ECRAN('<i class="pm-projecteur" data-cible="#envoyer" data-start="1"></i><i class="pm-assombrir" data-start="2"></i><i class="pm-zoom" data-cible="#envoyer" data-start="3"></i>'), { scene: 's' });
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /<div class="pm-ecran" data-start="0" data-cadre="navigateur" data-pointeur="fleche" data-pm-ecran="1" style="--pm-page-l: 1280; --pm-page-h: 800;"><div class="pm-ecran-barre" data-decor aria-hidden="true">/);
  assert.match(r.html, /<div class="pm-ecran-surface"><div class="pm-ecran-plan">[\s\S]*<i class="pm-projecteur" data-cible="#envoyer" data-start="1" data-dur="3" data-decor aria-hidden="true"><\/i>[\s\S]*<\/div><\/div><i class="pm-assombrir" data-start="2" data-dur="3" data-decor aria-hidden="true"><\/i><\/div>/);
  assert.match(r.html, /<i class="pm-zoom" data-cible="#envoyer" data-start="3" data-dur="2\.4"/);
  const tel = E.preparerEcrans('<div class="pm-ecran" data-cadre="telephone"><img src="assets/a.png" alt="x"></div>', {});
  assert.match(tel.html, /data-cadre="telephone" data-pointeur="doigt" data-pm-ecran="1" style="--pm-page-l: 390; --pm-page-h: 844;"><div class="pm-ecran-surface">/);
  assert.match(E.preparerEcrans('<div class="pm-ecran" data-page="1440x900"></div>').html, /--pm-page-l: 1440; --pm-page-h: 900;/);
});

test('controler : ecran-invalide, pointeur-hors-ecran et suivre-desactive se déclenchent sur leurs cas (crochet et assemblage)', () => {
  const cas = [
    ['<div class="pm-ecran" data-cadre="ordinateur"></div>', 'ecran-invalide', /cadre « ordinateur » inconnu/],
    ['<div class="pm-ecran" data-pointeur="crayon"></div>', 'ecran-invalide', /pointeur « crayon » inconnu/],
    ['<i class="pm-clic" data-cible="10%,10%" data-start="1"></i>', 'ecran-invalide', /se pose dans un écran/],
    [ECRAN('<i class="pm-clic" data-cible="#absent" data-start="1"></i>'), 'ecran-invalide', /la cible #absent n'est pas un élément de l'écran/],
    [ECRAN('<i class="pm-clic" data-cible="#envoyer"></i>'), 'ecran-invalide', /data-start manquant/],
    [ECRAN('<i class="pm-projecteur" data-start="1"></i>'), 'ecran-invalide', /data-cible manquant/],
    [ECRAN('<i class="pm-projecteur" data-cible="etape:3" data-start="1"></i>'), 'ecran-invalide', /vise une étape d'un film/],
    [ECRAN('<i class="pm-clic" data-cible="milieu" data-start="1"></i>'), 'ecran-invalide', /illisible/],
    // Plan 2 : un film se tourne ; un film absent du projet est film-introuvable.
    ['<div class="pm-ecran" data-film="factures"></div>', 'film-introuvable', /le film « factures » n'existe pas/],
    [ECRAN('<i class="pm-clic" data-cible="104%,20%" data-start="1"></i>'), 'pointeur-hors-ecran', /sort de l'image/],
    [ECRAN('<i class="pm-projecteur" data-cible="80%,80%,30%,10%" data-start="1"></i>'), 'pointeur-hors-ecran', /sort de l'image/],
    [ECRAN('<i class="pm-clic" data-cible="#envoyer" data-start="1"></i>', ' data-film-camera="suivre" data-camera="zoom 1→1.1 0+4"'), 'suivre-desactive', /passe avant le suivi des gestes/],
  ];
  const dir = projet([['s', ECRAN('')]]);
  const { deroule } = lireDeroule(dir);
  for (const [html, regle, message] of cas) {
    const section = html.startsWith('<section') ? html : `<section data-scene="s">${html}</section>`;
    const crochet = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: section }).filter((p) => p.regle === regle);
    assert.equal(crochet.length, 1, `${regle} : ${html.slice(0, 80)}`);
    assert.match(crochet[0].message, message);
    assert.equal(crochet[0].gravite, ['ecran-invalide', 'film-introuvable'].includes(regle) ? 'erreur' : 'alerte');
    const a = E.preparerEcrans(section, { scene: 's', projet: dir }).erreurs.filter((p) => p.regle === regle);
    assert.deepEqual(a, crochet);
  }
  // Une scène correcte : aucun problème d'écran.
  const bon = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: ECRAN('<i class="pm-clic" data-cible="#envoyer" data-start="1"></i><i class="pm-zoom" data-cible="50%,50%" data-start="2"></i>') });
  assert.deepEqual(bon.filter((p) => /ecran|pointeur|suivre/.test(p.regle)), []);
  // Message du contrôle rendu.
  const { traduireConstats } = require('../scripts/lib/rendu-controle.js');
  if (traduireConstats) {
    const p = traduireConstats([{ regle: 'etapes-trop-rapprochees', scene: 's3', element: '3|4', instant: 2, valeur: { a: 3, b: 4, ecart: 0.6, minimum: 1.6 } }]);
    assert.equal(p[0].gravite, 'erreur');
    assert.match(p[0].message, /les gestes 3 et 4 du pointeur sont trop rapprochés \(0,6 s\) ; il faut au moins 1,6 s entre eux/);
  }
});

test('determinisme : une scène avec un écran est prouvée (raison « ecran »)', () => {
  const dir = projet([['s', ECRAN('<i class="pm-clic" data-cible="#envoyer" data-start="1"></i>')], ['t', '<section data-scene="t"><h1 data-texte="titre"></h1></section>']]);
  const a = assembler1(dir);
  assert.deepEqual(D.concernees(a), [{ id: 's', raisons: ['ecran'], gpu: false }]);
});

// --- 5.13 Blocs -----------------------------------------------------------------------------------------------------

const BLOCS = fs.readdirSync(path.join(RACINE, 'moteur', 'blocs')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();

test('blocs : les dix blocs de 5.13, commande pulse-motion bloc', () => {
  // Les dix blocs de S6 plan 1, et les cartes « graphique » et « organigramme » livrées avec S7 J2 (conflit 11).
  assert.deepEqual(BLOCS, ['bandeau-nom', 'carte-appli', 'carte-graphique', 'carte-organigramme', 'commande', 'consigne', 'dialogue', 'liste', 'notification', 'publication', 'revelation-3d', 'toast']);
  const liste = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'bloc'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(liste.stdout).blocs, BLOCS);
  const un = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'bloc', 'notification'], { encoding: 'utf8' });
  assert.equal(un.status, 0);
  assert.equal(un.stdout, lire('moteur', 'blocs', 'notification.html'));
  const non = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'bloc', '../pm'], { encoding: 'utf8' });
  assert.equal(non.status, 2);
  for (const b of BLOCS) {
    const t = lire('moteur', 'blocs', `${b}.html`);
    assert.match(t, new RegExp(`^<!-- Bloc « ${b} » : `), b);
    // Chaque bloc a une entrée du dictionnaire (classe pm-m-*) ou la révélation 3D.
    assert.match(t, /class="pm-bloc [^"]*(pm-m-[a-z-]+|pm-3d)/, b);
    for (const [, c] of t.matchAll(/(?<![-\w])(pm-bloc-[a-z0-9-]+|pm-3d)\b/g)) assert.match(CSS, new RegExp(`\\.${c}\\b`), `${b} : ${c}`);
  }
});

test('blocs : aucun bloc ne contient de nom ni de logo de marque', () => {
  const MARQUES = /\b(apple|mac ?os|ios|android|windows|microsoft|google|chrome|safari|firefox|twitter|x\.com|reddit|facebook|instagram|tiktok|spotify|youtube|linkedin|slack|notion|github)\b/i;
  for (const b of BLOCS) assert.doesNotMatch(lire('moteur', 'blocs', `${b}.html`), MARQUES, b);
  assert.doesNotMatch(SANS_COMMENTAIRES.slice(SANS_COMMENTAIRES.indexOf('.pm-bloc {')), MARQUES);
  // Aucun dessin recopié : pas de tracé SVG dans les blocs.
  for (const b of BLOCS) assert.doesNotMatch(lire('moteur', 'blocs', `${b}.html`), /<path|<circle|<polyline|\sd="/, b);
});

test('blocs : notification et carte-appli rendent leur icône par data-icone, sans SVG recopié', () => {
  for (const b of ['notification', 'carte-appli']) {
    const t = lire('moteur', 'blocs', `${b}.html`);
    assert.match(t, /<svg class="pm-bloc-icone" data-icone="[a-z0-9-]+"><\/svg>/, b);
    const textes = Object.fromEntries([...t.matchAll(/data-texte="([^"]+)"/g)].map((m) => [m[1], 'Texte']));
    const dir = projet([['s', `<section data-scene="s">${t}</section>`, 5, textes]]);
    const a = assembler1(dir);
    assert.equal(a.ok, true, JSON.stringify(a.erreurs));
    assert.deepEqual(a.erreurs, []);
    assert.match(a.html, /<svg class="pm-bloc-icone" data-icone="[a-z0-9-]+" viewBox="0 0 24 24"[^>]*><path d="[^"]+" pathLength="100"/, b);
    assert.doesNotMatch(a.html, /<svg[^>]*data-icone[^>]*><\/svg>/, b);
  }
});

test('blocs : carte-graphique et carte-organigramme ne sont livrées qu\'avec S7 J2 (aucun bloc vide avant)', () => {
  // Livrées avec leur dessin : un graphique (data-graphique) et des flèches (data-fleche), jamais une carte vide.
  for (const b of ['carte-graphique', 'carte-organigramme']) {
    assert.ok(BLOCS.includes(b), b);
    assert.ok(CSS.includes(`pm-bloc-${b}`), b);
  }
  assert.match(lire('moteur', 'blocs', 'carte-graphique.html'), /data-graphique="graphique"/);
  assert.match(lire('moteur', 'blocs', 'carte-organigramme.html'), /data-fleche="#org-chef → #org-equipe1"/);
  assert.doesNotMatch(lire('references', 'ecran.md'), /arrivent avec les graphiques animés/);
});

// --- 5.15 Dictionnaire ---------------------------------------------------------------------------------------------

test('mouvements : chaque entrée « logiciel » a sa recette, et ses classes existent dans le moteur', () => {
  const dico = charger();
  assert.deepEqual(dico.categories[dico.categories.length - 1], { id: 'logiciel', nom: 'Démonstration de logiciel' });
  const logiciel = dico.mouvements.filter((e) => e.categorie === 'logiciel');
  assert.deepEqual(logiciel.map((e) => e.no), ['094', '095', '096', '097', '098', '099', '100', '101', '102', '103', '104', '105', '106']);
  const numeros = JSON.parse(lire('references', 'mouvements', 'numeros.json'));
  for (const e of logiciel) assert.equal(numeros[e.no], e.slug);
  const CSS_MOUV = lire('moteur', 'mouvements.css');
  const MOTEUR = lire('moteur', 'ecran.js') + lire('scripts', 'lib', 'ecrans.js');
  for (const e of logiciel) {
    assert.ok(e.recette.exemple && e.recette.reglages.length, e.slug);
    for (const [, c] of e.recette.exemple.matchAll(/(?<![-\w])(pm-[a-z0-9-]+)/g)) {
      assert.ok(CSS.includes(`.${c}`) || CSS_MOUV.includes(`.${c}`), `#${e.no} : classe ${c}`);
    }
    for (const [, a] of e.recette.exemple.matchAll(/\s(data-[a-z-]+)=/g)) {
      assert.ok(MOTEUR.includes(`'${a}'`) || ['data-start', 'data-dur', 'data-texte', 'data-lettres', 'data-icone'].includes(a), `#${e.no} : attribut ${a}`);
    }
  }
  // Les entrées « logiciel » s'assemblent sans erreur, dans un vrai style.
  const dir = projet(logiciel.map((e) => [`m${e.no}`, `<section data-scene="m${e.no}">\n${e.recette.exemple}\n</section>\n`, 5, { titre: 'Un titre', texte: 'Un texte' }]));
  modifierDeroule(dir, (d) => { d.style = 'clair-pedagogique'; });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs, []);
  assert.match(dico.source, /argo/);
});

// --- Références, consignes, notices --------------------------------------------------------------------------------

test('references : ecran.md cite seulement des classes et attributs qui existent dans le moteur', () => {
  const ref = lire('references', 'ecran.md');
  const MOTEUR = lire('moteur', 'ecran.js') + lire('scripts', 'lib', 'ecrans.js') + lire('moteur', 'lettres.js');
  const CSS_MOUV = lire('moteur', 'mouvements.css');
  let classes = 0;
  for (const [, c] of ref.matchAll(/(?<![-\w])(pm-[a-z][a-z0-9-]*)\b/g)) {
    if (c === 'pm-m-monte') { assert.ok(CSS_MOUV.includes('.pm-m-monte')); continue; }
    if (BLOCS.includes(c.replace(/^pm-bloc-/, ''))) continue;
    classes++;
    assert.ok(CSS.includes(`.${c}`) || MOTEUR.includes(c), `classe ${c}`);
  }
  assert.ok(classes >= 10, `${classes} classes`);
  for (const [, a] of ref.matchAll(/`(data-[a-z-]+)/g)) {
    assert.ok(MOTEUR.includes(`'${a}'`) || MOTEUR.includes(`"${a}"`) || CSS.includes(`[${a}`) || ['data-start', 'data-dur', 'data-texte', 'data-icone', 'data-gel', 'data-vitesse', 'data-camera', 'data-son', 'data-lettres',
      // Les cartes « graphique » et « organigramme » (S7 J2) : attributs du calque de dessin (explication.md).
      'data-graphique', 'data-fleche'].includes(a), `attribut ${a}`);
  }
  for (const [, v] of ref.matchAll(/`(--pm-[a-z-]+)`/g)) assert.ok(CSS.includes(v), `variable ${v}`);
  for (const b of BLOCS) assert.match(ref, new RegExp(`\\| \`${b}\` \\|`), b);
  // L'animateur, qui lit cadres-pointeur pour un logiciel montré, y trouve le renvoi (consignes pleines : aucun octet ajouté).
  assert.match(lire('references', 'cadres-pointeur.md'), /## L'essentiel\n\n- \*\*Prêt à l'emploi : lire d'abord `pulse-motion reference ecran`\.\*\*/);
  assert.match(lire('references', 'controles.md'), /## Écrans des tutoriels/);
});

test('notices : argo et ses deux sources amont sont citées dans les deux THIRD-PARTY-NOTICES.md', () => {
  const plugin = lire('THIRD-PARTY-NOTICES.md');
  assert.equal(fs.readFileSync(path.join(DEPOT, 'THIRD-PARTY-NOTICES.md'), 'utf8'), plugin);
  const argo = plugin.slice(plugin.indexOf('\n## argo\n'), plugin.indexOf('\n## ', plugin.indexOf('\n## argo\n') + 4));
  for (const x of ['src/human-cursor.ts', 'CloverLabsAI/human-cursor', 'feder-cr/invisible_playwright', 'src/camera.ts', 'src/camera-move.ts', 'src/frame.ts', 'src/blocks/', 'Copyright (c) 2026 Shreyas Karnik', 'moteur/pointeur.js']) assert.ok(argo.includes(x), x);
  assert.match(plugin, /## explainroo[\s\S]*bloc « toast »[\s\S]*## rossark/);
  assert.match(plugin, /## reanimate[\s\S]*`makeWindow`[\s\S]*`install\.js`/);
  assert.doesNotMatch(plugin, /huashu/i);
});
