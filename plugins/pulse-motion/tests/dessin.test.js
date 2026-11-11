'use strict';
/* Spec « Explication narrée » (S7), plan J1 « Diagrammes » : critères sans navigateur. Tracé à main levée (5.3), géométrie
 * des flèches (5.4) et des annotations (5.5), assemblage et contrôle des composants, moteur à la carte, dictionnaire,
 * référence « explication » (5.16), consignes et notices. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ML = require('../moteur/dessin/main-levee.js');
const G = require('../moteur/dessin/geometrie.js');
const D = require('../scripts/lib/dessin.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const DT = require('../scripts/lib/determinisme.js');
const { assembler } = require('../scripts/assembler.js');
const { controlerScene } = require('../scripts/lib/controle-scene.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { miniProjet } = require('./aide/mini-projet.js');

const RACINE = path.join(__dirname, '..');
const DEPOT = path.join(RACINE, '..', '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const PM = path.join(RACINE, 'scripts', 'pm.js');

/** Points d'un chemin produit par main-levee.js (M, L, C, Q) : extrémités et points de contrôle. */
const points = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number).reduce((r, v, i, a) => (i % 2 ? r : r.concat([[v, a[i + 1]]])), []);

// --- 5.3 Tracé à main levée ---------------------------------------------------------------------------------------------

test('main levée : même graine, même tracé ; graine différente, tracé différent', () => {
  const formes = [{ type: 'segment', a: [10, 10], b: [80, 40] }, { type: 'rect', x: 10, y: 10, l: 40, h: 20 }, { type: 'ellipse', cx: 50, cy: 50, rx: 20, ry: 10 },
    { type: 'poly', points: [[0, 0], [10, 5], [20, 0]] }, { type: 'lisse', points: [[0, 0], [10, 8], [20, 3], [30, 9]] }, { type: 'quad', a: [0, 0], c: [20, 20], b: [40, 0] }];
  for (const f of formes) {
    const a = ML.mainLevee(f, { graine: ML.graine('s', 'trait#1', 0) });
    const b = ML.mainLevee(f, { graine: ML.graine('s', 'trait#1', 0) });
    const c = ML.mainLevee(f, { graine: ML.graine('s', 'trait#2', 0) });
    assert.equal(a.d, b.d, f.type);
    assert.notEqual(a.d, c.d, f.type);
    assert.ok(a.longueur > 0, f.type);
    // Deux passages : le tracé fait le tour une fois, puis repasse.
    if (f.type !== 'ellipse') assert.ok((a.d.match(/M/g) || []).length >= 2, f.type);
  }
  // Sans rugosité, le segment est droit (extrémités exactes).
  const net = ML.mainLevee({ type: 'segment', a: [0, 0], b: [50, 0] }, { graine: 1, rugosite: 0 });
  assert.ok(points(net.d).every(([, y]) => y === 0));
  // Décalage borné : jamais plus de 0,35 cqh aux extrémités d'un long trait.
  const long = ML.mainLevee({ type: 'segment', a: [0, 50], b: [170, 50] }, { graine: 7, passes: 1 });
  const p = points(long.d);
  assert.ok(Math.abs(p[0][0]) <= 0.35 && Math.abs(p[0][1] - 50) <= 0.35 && Math.abs(p[3][0] - 170) <= 0.35, JSON.stringify(p[0]));
});

test('main levée : ébullition à 8 par seconde, le pas change toutes les 0,125 s et seulement alors', () => {
  const pas = (t) => ML.pasEbullition(t, 8);
  assert.equal(pas(0), 0);
  assert.equal(pas(0.124), 0);
  assert.equal(pas(0.125), 1);
  assert.equal(pas(0.2499), 1);
  assert.equal(pas(0.25), 2);
  assert.equal(pas(1), 8);
  for (let i = 0; i < 80; i++) { const t = i / 30; assert.equal(pas(t), Math.floor(t * 8 + 1e-6)); }
  assert.equal(ML.pasEbullition(3.7, 0), 0, 'figé sans ébullition');
  const trace = (t) => ML.mainLevee({ type: 'segment', a: [0, 0], b: [50, 20] }, { graine: ML.graine('s', 'trait#1', pas(t)) }).d;
  assert.equal(trace(0.13), trace(0.24));
  assert.notEqual(trace(0.24), trace(0.26));
});

test('main levée : hachures contenues dans la forme (aucun point hors du polygone)', () => {
  const formes = [{ type: 'rect', x: 10, y: 10, l: 60, h: 30 }, { type: 'ellipse', cx: 80, cy: 50, rx: 30, ry: 18 }, { type: 'poly', points: [[10, 90], [60, 10], [110, 90]] },
    { type: 'poly', points: [[0, 0], [60, 0], [60, 60], [30, 20], [0, 60]] }];
  for (const f of formes) {
    const poly = ML.polygoneDe(f);
    const h = ML.hachures(poly, { graine: 5, epaisseur: 0.5 });
    assert.ok(h.segments.length >= 3, `${f.type} : ${h.segments.length} hachures`);
    for (const c of h.segments) {
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        const p = [0, 1].map((j) => u * u * u * c[0][j] + 3 * u * u * t * c[1][j] + 3 * u * t * t * c[2][j] + t * t * t * c[3][j]);
        assert.ok(ML.dansPolygone(p, poly), `${f.type} : ${p} hors de la forme`);
      }
    }
    // Hachures à −41°, écart de 4 fois l'épaisseur, en un seul chemin.
    const c = h.segments[0];
    const angle = Math.atan2(c[3][1] - c[0][1], c[3][0] - c[0][0]) * 180 / Math.PI;
    assert.ok(Math.abs(Math.abs(angle) - 41) < 2 || Math.abs(Math.abs(angle) - 139) < 2, `angle ${angle}`);
    assert.equal((h.d.match(/M/g) || []).length, h.segments.length);
  }
});

// --- 5.4 Flèches et 5.5 annotations (géométrie) ---------------------------------------------------------------------------

test('flèche : s\'arrête à 1,3 cqh du bord de chaque boîte (géométrie)', () => {
  const a = { x: 40, y: 50, l: 30, h: 12 }, b = { x: 140, y: 50, l: 30, h: 12 };
  const f = G.fleche(a, b, {});
  assert.ok(Math.abs(f.a.x - (40 + 15 + 1.3)) < 1e-9 && Math.abs(f.a.y - 50) < 1e-9);
  assert.ok(Math.abs(f.b.x - (140 - 15 - 1.3)) < 1e-9);
  // En biais : sur le rectangle agrandi de l'écart.
  const g = G.fleche({ x: 40, y: 30, l: 30, h: 12 }, { x: 140, y: 80, l: 30, h: 12 }, {});
  const surBord = (p, bx) => Math.abs(Math.abs(p.x - bx.x) - (bx.l / 2 + 1.3)) < 1e-6 || Math.abs(Math.abs(p.y - bx.y) - (bx.h / 2 + 1.3)) < 1e-6;
  assert.ok(surBord(g.a, { x: 40, y: 30, l: 30, h: 12 }) && surBord(g.b, { x: 140, y: 80, l: 30, h: 12 }));
  // Vers un point : le point lui-même ; écart réglable.
  const p = G.fleche(a, { x: 120, y: 20 }, { ecart: 3 });
  assert.deepEqual([p.b.x, p.b.y], [120, 20]);
  const bp = G.bord(a, p.b, 3);
  assert.ok(Math.abs(p.a.x - bp.x) < 1e-9 && Math.abs(p.a.y - bp.y) < 1e-9 && (Math.abs(bp.x - 40) - (15 + 3) > -1e-9 || Math.abs(bp.y - 50) - (6 + 3) > -1e-9));
  // Pointe : longueur épaisseur × 3,2 + 1,1 cqh, ouverture ± 0,5 rad.
  const pt = f.pointe(f.longueur, 1);
  assert.ok(Math.abs(Math.hypot(pt[0][0] - pt[1][0], pt[0][1] - pt[1][1]) - (0.4 * 3.2 + 12 * 100 / 1080)) < 1e-9);
});

test('flèche : vers une cible ronde, s\'arrête au bord du cercle (géométrie)', () => {
  const rond = { x: 120, y: 60, l: 20, h: 20, forme: 'ellipse' };
  const f = G.fleche({ x: 40, y: 20, l: 10, h: 10 }, rond, {});
  assert.ok(Math.abs(Math.hypot(f.b.x - 120, f.b.y - 60) - (10 + 1.3)) < 1e-9);
});

test('flèche : son étiquette est du côté extérieur de la courbe et ne chevauche pas la flèche (géométrie)', () => {
  const a = { x: 30, y: 50, l: 20, h: 10 }, b = { x: 150, y: 50, l: 20, h: 10 };
  const l = 20, h = 3.6;
  const dedans = (e, q) => Math.abs(q.x - e.x) <= l / 2 && Math.abs(q.y - e.y) <= h / 2;
  for (const courbe of [0, 0.5, -0.5]) {
    const f = G.fleche(a, b, { courbe });
    const e = f.etiquette(l, h);
    const mid = f.pointA(f.longueur / 2);
    if (courbe === 0) assert.ok(e.y < mid.y, 'au-dessus d\'une flèche droite');
    else {
      // Côté du point de contrôle (extérieur de la courbe).
      assert.equal(Math.sign(e.y - 50), Math.sign(f.c.y - 50), `courbe ${courbe}`);
    }
    for (const q of f.echantillons) assert.ok(!dedans(e, q), `courbe ${courbe} : l'étiquette chevauche la flèche`);
  }
  // Flèche verticale : l'étiquette à côté, plus loin de la moitié de sa largeur.
  const v = G.fleche({ x: 80, y: 10, l: 10, h: 6 }, { x: 80, y: 90, l: 10, h: 6 }, {});
  const ev = v.etiquette(l, h);
  assert.ok(Math.abs(Math.abs(ev.x - 80) - (3.1 + l / 2)) < 1e-6);
});

test('annotation : les sept types se dessinent autour de la boîte de la cible, marge comprise (géométrie)', () => {
  const b = { x: 80, y: 40, l: 30, h: 8 };
  const m = 1.3;
  const g = b.x - b.l / 2 - m, dr = b.x + b.l / 2 + m, haut = b.y - b.h / 2 - m, bas = b.y + b.h / 2 + m;
  const boites = Object.fromEntries(G.TYPES_ANNOTATION.map((t) => [t, G.annotation(t, b).map((f) => G.boiteDe(f.forme))]));
  assert.equal(G.TYPES_ANNOTATION.length, 7);
  const bornes = (x) => [x.x - x.l / 2, x.x + x.l / 2, x.y - x.h / 2, x.y + x.h / 2];
  const pres = (a, v) => Math.abs(a - v) < 0.6;
  // Entoure, encadre : contiennent la boîte avec sa marge ; entoure à 1,12 × 1,25.
  for (const t of ['entoure', 'encadre']) {
    const [x0, x1, y0, y1] = bornes(boites[t][0]);
    assert.ok(x0 <= g + 1e-9 && x1 >= dr - 1e-9 && y0 <= haut + 1e-9 && y1 >= bas - 1e-9, t);
  }
  assert.ok(Math.abs(boites.entoure[0].l - (b.l + 2 * m) * 1.12) < 1e-9 && Math.abs(boites.entoure[0].h - (b.h + 2 * m) * 1.25) < 1e-9);
  // Souligne : sous la boîte, de bord à bord (marge comprise).
  const [sx0, sx1, sy0] = bornes(boites.souligne[0]);
  assert.ok(pres(sx0, g) && pres(sx1, dr) && sy0 > b.y + b.h / 2, 'souligne');
  // Surligne : sous le texte (calque du dessous), sur la largeur avec marge.
  const surligne = G.annotation('surligne', b)[0];
  assert.equal(surligne.calque, 'dessous');
  assert.ok(surligne.remplir && surligne.balaye);
  assert.ok(pres(bornes(boites.surligne[0])[0], g) && pres(bornes(boites.surligne[0])[1], dr));
  // Barre : à mi-hauteur, de bord à bord ; croix : deux traits successifs sur la boîte avec marge.
  assert.ok(pres(boites.barre[0].y, b.y) && pres(boites.barre[0].l, dr - g));
  const croix = G.annotation('croix', b);
  assert.equal(croix.length, 2);
  assert.deepEqual([croix[0].progres(0.5), croix[1].progres(0.5), croix[1].progres(1)], [1, 0, 1]);
  for (const c of boites.croix) assert.ok(pres(c.l, dr - g) && pres(c.h, bas - haut));
  // Accolade : à gauche de la boîte, sur sa hauteur avec marge.
  const [ax0, ax1, ay0, ay1] = bornes(boites.accolade[0]);
  assert.ok(ax1 <= g + 1.6 && ax0 < g && pres(ay0, haut) && pres(ay1, bas), 'accolade');
  // Durées : 0,6 s, 0,8 s pour entoure.
  assert.equal(G.DUREES_ANNOTATION.entoure, 0.8);
  assert.throws(() => G.annotation('cercle', b), /inconnue/);
});

// --- Assemblage, contrôle et moteur à la carte -----------------------------------------------------------------------

const FLECHE = '<div id="client" data-texte="client" data-start="0.2"></div><div id="serveur" data-texte="serveur" data-start="0.5"></div>';

test('flèche : cible absente → fleche-cible-introuvable avec les ids proches (assemblage et crochet)', () => {
  const r = D.preparerDessin(`<section data-scene="s">${FLECHE}<i data-fleche="#client → #serveru" data-start="1"></i></section>`, { scene: 's' });
  assert.deepEqual(r.erreurs.map((e) => e.regle), ['fleche-cible-introuvable']);
  assert.match(r.erreurs[0].message, /« #serveru », qui n'est pas dans la scène ; vouliez-vous dire « #serveur » \?/);
  const dir = miniProjet({ scenes: [{ id: 's', html: `${FLECHE}<i data-fleche="#client → #serveru" data-start="1"></i>`, textes: { client: 'Client', serveur: 'Serveur' } }] });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.ok(a.erreurs.some((e) => e.regle === 'fleche-cible-introuvable' && e.gravite === 'erreur'));
  const { deroule } = lireDeroule(dir);
  const crochet = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: fs.readFileSync(path.join(dir, deroule.scenes[0].fichier), 'utf8') });
  assert.ok(crochet.some((e) => e.regle === 'fleche-cible-introuvable'));
});

test('dessin : dessin-invalide sur ses cas ; durées par défaut posées ; étiquettes et icônes des dessins libres', () => {
  const cas = [
    ['<i data-fleche="client vers serveur" data-start="1"></i>', /mal écrit/],
    ['<i data-fleche="#client → #serveur" data-fleche-courbe="2" data-start="1"></i>', /de -1 à 1/],
    ['<i data-fleche="#client → #serveur" data-fleche-tete="pointe" data-start="1"></i>', /data-fleche-tete « pointe » inconnu/],
    ['<i data-annoter="entour" data-cible="#client" data-start="1"></i>', /vouliez-vous dire « entoure »/],
    ['<i data-annoter="entoure" data-start="1"></i>', /sans data-cible/],
    ['<i data-annoter="entoure" data-cible="#clien" data-start="1"></i>', /« #client »/],
    ['<div data-main-levee></div>', /sur une forme SVG/],
    ['<svg><rect data-main-levee data-start="1" width="4" height="4"/></svg>', /minuté/],
  ];
  for (const [html, motif] of cas) {
    const r = D.preparerDessin(`<section data-scene="s">${FLECHE}${html}</section>`, { scene: 's' });
    assert.ok(r.erreurs.some((e) => e.regle === 'dessin-invalide' && motif.test(e.message)), `${html} : ${JSON.stringify(r.erreurs)}`);
  }
  const ok = D.preparerDessin(`<section data-scene="s">${FLECHE}<i data-fleche="#client → 120,40" data-start="1"></i><i data-annoter="entoure" data-cible="#client" data-start="2"></i><i data-annoter="souligne" data-cible="#client" data-start="2" data-dur="1"></i></section>`,
    { scene: 's', scripts: ["M.dessin('s', function (d) { d.etiquette('legende', { x: 10, y: 10 }); d.icone('truck', {}); d.icone(\"triangle-alert\", {}); });"] });
  assert.deepEqual(ok.erreurs, []);
  assert.match(ok.html, /data-fleche="#client → 120,40" data-start="1" data-dur="0.7"/);
  assert.match(ok.html, /data-annoter="entoure" data-cible="#client" data-start="2" data-dur="0.8"/);
  assert.match(ok.html, /data-annoter="souligne" data-cible="#client" data-start="2" data-dur="1"><\/i>/);
  assert.match(ok.html, /<span class="pm-calque-texte" data-texte="legende" data-pm-libre><\/span><\/section>$/);
  assert.deepEqual(ok.icones, ['truck', 'triangle-alert']);
  const inconnue = D.preparerDessin('<section data-scene="s"></section>', { scene: 's', scripts: ["M.dessin('s', function (d) { d.icone('camionette'); });"] });
  assert.equal(inconnue.erreurs[0].regle, 'icone-inconnue');
});

test('dessin : moteur à la carte, le groupe « dessin » seulement si une scène dessine ; une page sans dessin n\'en porte rien', () => {
  // S7 J2 : graphiques et code s'ajoutent au groupe (dessin/graphiques.js, dessin/code.js, dessin/composants.js).
  assert.deepEqual(GM.GROUPES.dessin.slice(0, 4), ['releve.js', 'dessin/main-levee.js', 'dessin/geometrie.js', 'dessin/calque.js']);
  for (const m of GM.GROUPES.dessin) assert.ok(GM.MODULES.includes(m) && fs.existsSync(path.join(RACINE, 'moteur', m)), m);
  assert.ok(!GM.groupesDuDeroule({}, ['<section><p data-texte="a"></p></section>']).includes('dessin'));
  assert.ok(GM.groupesDuDeroule({}, ['<section><i data-fleche="#a → #b"></i></section>']).includes('dessin'));
  assert.ok(GM.groupesDuDeroule({}, ['<section><i data-annoter="entoure" data-cible="#a"></i></section>']).includes('dessin'));
  assert.ok(GM.groupesDuDeroule({}, ['<section></section>'], ["M.dessin('s', function (d) {});"]).includes('dessin'));
  assert.ok(!GM.groupesDuDeroule({}, ['<section></section>'], ['M.chaqueImage("s", function () {});']).includes('dessin'));
  const sans = assembler({ dossier: miniProjet({ scenes: [{ id: 's', html: '<h2 data-texte="titre" data-start="0.2"></h2>', textes: { titre: 'Titre' } }] }), ecrire: false });
  assert.ok(!sans.groupes.includes('dessin'));
  assert.doesNotMatch(sans.html, /M\.demarrerDessin|pm-calque-textes|mainLevee/);
  const avec = assembler({ dossier: miniProjet({ scenes: [{ id: 's', html: `${FLECHE}<i data-fleche="#client → #serveur" data-start="1"><span data-texte="requete"></span></i>`, textes: { client: 'Client', serveur: 'Serveur', requete: 'requête' } }] }), ecrire: false });
  assert.deepEqual(avec.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.ok(avec.groupes.includes('dessin'));
  assert.match(avec.html, /M\.demarrerDessin\(\);/);
  assert.match(avec.html, /\.pm-calque-texte \{/);
  // L'étiquette est un texte du déroulé ; le calque n'écrit jamais de <text>.
  assert.match(avec.html, /<span data-texte="requete">requête<\/span>/);
  assert.doesNotMatch(lire('moteur', 'dessin', 'calque.js').replace(/\/\*[\s\S]*?\*\//g, ''), /createElementNS\(NS, 'text'\)|<text/);
  // Preuve du déterminisme : la scène qui dessine est concernée.
  assert.deepEqual(DT.concernees(avec).map((c) => [c.id, c.raisons]), [['s', ['dessin']]]);
  // Étiquette d'un dessin libre sans texte : texte-manquant.
  const manque = assembler({ dossier: miniProjet({ scenes: [{ id: 's', html: '<h2 data-texte="titre"></h2><script>M.dessin("s", function (d) { d.etiquette("legende", { x: 1, y: 1 }); });</script>', textes: { titre: 'Titre' } }] }), ecrire: false });
  assert.ok(manque.erreurs.some((e) => e.regle === 'texte-manquant' && /legende/.test(e.message)));
  // Icônes d'un dessin libre : seules celles nommées sont embarquées.
  const icones = assembler({ dossier: miniProjet({ scenes: [{ id: 's', html: '<h2 data-texte="titre"></h2><script>M.dessin("s", function (d) { d.icone("truck", { x: 50, y: 50 }); });</script>', textes: { titre: 'Titre' } }] }), ecrire: false });
  assert.deepEqual(Object.keys(icones.donnees.icones), ['truck']);
});

test('dessin : interdits de l\'export rapide absents du calque (ni filter: url, ni mix-blend-mode, ni backdrop-filter)', () => {
  for (const f of ['calque.js', 'dessin.css', 'main-levee.js', 'geometrie.js']) {
    const t = lire('moteur', 'dessin', f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(t, /mix-blend-mode|backdrop-filter|filter\s*:\s*url|globalCompositeOperation/, f);
  }
  assert.doesNotMatch(lire('moteur', 'releve.js'), /Math\.random/);
  assert.doesNotMatch(lire('moteur', 'dessin', 'calque.js').replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random\(/);
});

// --- Dictionnaire, référence, consignes, notices -------------------------------------------------------------------------

test('dictionnaire : dix entrées nouvelles (main levée, ébullition, flèche, sept annotations), les anciens numéros inchangés', () => {
  const dico = JSON.parse(lire('references', 'mouvements', 'mouvements.json'));
  const numeros = JSON.parse(lire('references', 'mouvements', 'numeros.json'));
  const slugs = ['main-levee', 'ebullition', 'fleche-relie', 'souligne', 'entoure', 'encadre', 'surligne', 'barre', 'croix', 'accolade'];
  const nouvelles = dico.mouvements.filter((e) => slugs.includes(e.slug));
  assert.deepEqual(nouvelles.map((e) => e.slug), slugs);
  const premier = Number(nouvelles[0].no);
  nouvelles.forEach((e, i) => { assert.equal(Number(e.no), premier + i); assert.equal(numeros[e.no], e.slug); });
  assert.ok(premier >= 112, `#${premier}`);
  assert.deepEqual(nouvelles.filter((e) => e.categorie === 'valeur').map((e) => e.slug), slugs.slice(3));
  assert.deepEqual(nouvelles.find((e) => e.slug === 'fleche-relie').nom, { fr: 'Flèche qui relie', metier: 'Connector arrow' });
  // #024 et #025 restent.
  assert.equal(numeros['024'], 'surlignage');
  assert.equal(numeros['025'], 'soulignement');
  assert.match(dico.source, /explainroo/);
});

test('référence : pulse-motion reference explication existe et chaque exemple passe le contrôle', () => {
  const r = spawnSync(process.execPath, [PM, 'reference', 'explication'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^# Vidéo explicative/);
  // Les exemples de graphique, de code et de formule ont leurs données dans le déroulé : donnees.test.js.
  const blocs = [...r.stdout.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => !/data-(?:graphique|code|formule)=/.test(b));
  assert.ok(blocs.length >= 3, `${blocs.length} exemples`);
  const textes = {};
  for (const b of blocs) for (const m of b.matchAll(/data-texte="([^"]+)"|etiquette\('([^']+)'/g)) textes[m[1] || m[2]] = 'Un texte';
  const scenes = blocs.map((html, i) => ({ id: i === 2 ? 'schema' : `e${i}`, html: i === 2 ? `<div id="client" data-texte="client" data-start="0.2"></div><div id="serveur" data-texte="serveur" data-start="0.4"></div><p><span id="prix" data-texte="prix" data-start="0.6"></span></p>\n${html}` : html, textes }));
  // Les ancres mot: des exemples supposent une voix : remplacées par des instants pour l'assemblage sans voix.
  for (const s of scenes) s.html = s.html.replace(/mot:[a-zé]+/g, '1');
  // Le dessin libre vise la scène « schema ».
  const dir = miniProjet({ scenes });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const { deroule } = lireDeroule(dir);
  for (const sc of deroule.scenes) {
    const p = controlerScene({ projet: dir, deroule, scene: sc, html: fs.readFileSync(path.join(dir, sc.fichier), 'utf8') });
    assert.deepEqual(p.filter((x) => x.gravite === 'erreur'), [], sc.id);
  }
});

test('référence : chaque attribut et chaque réglage cités existent dans le moteur', () => {
  const t = lire('references', 'explication.md');
  const code = [lire('moteur', 'dessin', 'calque.js'), lire('moteur', 'dessin', 'composants.js'), lire('moteur', 'releve.js'), lire('scripts', 'lib', 'dessin.js'), lire('scripts', 'lib', 'donnees-scene.js'), lire('moteur', 'minutage.js')].join('\n');
  const attributs = new Set([...t.matchAll(/\b(data-[a-z-]+)/g)].map((m) => m[1]));
  assert.ok(attributs.size >= 10);
  for (const x of attributs) {
    if (['data-start', 'data-dur', 'data-texte'].includes(x)) continue;
    assert.ok(code.includes(`'${x}'`) || code.includes(`${x}=`) || code.includes(`[${x}`) || code.includes(`${x}]`) || code.includes(`"${x}"`), x);
  }
  for (const v of ['--pm-trait', '--pm-rugosite', '--pm-courbure', '--pm-ebullition']) assert.ok(code.includes(`'${v}'`), v);
  for (const f of ['trait', 'chemin', 'rect', 'ellipse', 'fleche', 'annoter', 'icone', 'etiquette', 'groupe', 'couleur', 'boite', 'hasard', 'bruit', 'ondule', 'temps', 'depuis', 'entre']) {
    assert.match(t, new RegExp(`d\\.${f}\\(`), `d.${f} documenté`);
    assert.match(code, new RegExp(`d\\.${f} = function`), `d.${f} existe`);
  }
  for (const n of ['#112', '#113', '#114', '#115', '#121']) assert.match(t, new RegExp(n));
});

test('consignes : l\'animateur lit explication pour une flèche ou une annotation ; la retouche aussi ; plafonds tenus', () => {
  const a = lire('agents', 'animateur.md');
  assert.ok(Buffer.byteLength(a) <= 6000, `${Buffer.byteLength(a)} o`);
  const table = a.slice(a.indexOf('| La consigne demande… | Lire aussi |'), a.indexOf('\n2. '));
  const ligne = table.split('\n').find((l) => l.includes('`explication`'));
  assert.ok(ligne && /une flèche/.test(ligne) && /une annotation/.test(ligne) && ligne.includes('`pulse-motion reference <nom>`'));
  const r = lire('skills', 'retoucher', 'SKILL.md');
  assert.ok(Buffer.byteLength(r) <= 13850, `${Buffer.byteLength(r)} o`);
  assert.match(r, /flèche, annotation, graphique, code, formule : `pulse-motion reference explication`/);
  assert.match(r, /« entoure le prix quand je dis cher »/);
  assert.ok(Buffer.byteLength(lire('skills', 'creer', 'SKILL.md')) <= 23400);
  assert.ok(Buffer.byteLength(lire('references', 'moteur.md')) <= 12000);
  const ref = lire('references', 'explication.md');
  assert.match(ref, /« ajoute une flèche de Client à Serveur quand je dis envoie »/);
  assert.match(ref, /« entoure le prix quand je dis cher »/);
});

test('notices : explainroo (calque, flèches, annotations) et Rough.js, identiques à la racine et dans le plugin', () => {
  const racine = fs.readFileSync(path.join(DEPOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(racine, lire('THIRD-PARTY-NOTICES.md'));
  const section = racine.slice(racine.indexOf('## explainroo'), racine.indexOf('\n## ', racine.indexOf('## explainroo') + 5));
  for (const m of [/moteur\/dessin\//, /`arrow`, `_arrowLabel`, `_edge`/, /`annotate`/, /Rough\.js \(MIT, © Preet Shihn\)/, /boundsRecorder/]) assert.match(section, m);
});
