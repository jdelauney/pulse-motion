'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const D = require('../scripts/lib/decoupe-personnages.js');
const P = require('../scripts/lib/personnages.js');
const { executer } = require('../scripts/personnages.js');

const navigateur = trouverNavigateur();
const sauter = !navigateur && 'Chrome ou Edge introuvable';
const SVG = path.join(__dirname, 'fixtures', 'svg', 'cuisinier.svg');
const DECOUPE = {
  source: 'assets/cuisinier.svg', vue: 'profil', couleurs: { '#F2C9A0': 'peau' },
  os: {
    torse: { formes: ['#veste'], de: [202, 402], a: [202, 282] },
    tete: { formes: ['#tete'], centre: [205, 210] },
    cuisseAvant: { formes: ['#cuisse-av'], de: [201, 402], a: [201, 500] },
    tibiaAvant: { formes: ['g2>rect2'], de: [201, 500], a: [201, 600] },
    piedAvant: { formes: ['#chaussure-av'], de: [199, 606], a: [243, 606] },
    cuisseArriere: { formes: ['#cuisse-ar'], de: [200, 402], a: [200, 500] },
    tibiaArriere: { formes: ['#tibia-ar'], de: [200, 500], a: [200, 600] },
    piedArriere: { formes: ['#chaussure-ar'], de: [198, 606], a: [245, 606] },
    brasAvant: { formes: ['#bras-av'], de: [205, 295], a: [192.8, 363.9] },
    avantBrasAvant: { formes: ['#avant-bras-av'], de: [192.8, 363.9], a: [180.5, 433.9] },
    mainAvant: { formes: ['#main-av'], de: [180.5, 433.9], a: [177, 453] },
  },
  visage: { yeux: [{ blanc: '#oeil-blanc', pupille: '#pupille' }], bouche: '#bouche' },
  ignorer: ['#ombre'],
};

async function dansLaPage(code, source = fs.readFileSync(SVG, 'utf8')) {
  const html = D.page(D.preparerSource(source), { decoupe: DECOUPE, gabarit: P.lire(null).gabarits.standard }, `window.__resultat = (function () { var D = JSON.parse(document.getElementById('donnees').textContent); var svg = document.querySelector('#source svg'); ${code} })();`);
  const dir = dossierTemporaire();
  fs.writeFileSync(path.join(dir, 'p.html'), html);
  const p = await ouvrirPage({ navigateur, largeur: 900, hauteur: 900 });
  try { await p.aller(pathToFileURL(path.join(dir, 'p.html')).href); return await p.evaluer('window.__resultat'); } finally { await p.fermer(); }
}

test('analyse : formes, sélecteurs, calques, boîtes, couleurs calculées', { skip: sauter }, async () => {
  const a = await dansLaPage('return M.decoupe.analyser(svg);');
  assert.equal(a.formes.length, 16);
  assert.deepEqual(a.viewBox, [0, 0, 400, 700]);
  const f = (sel) => a.formes.find((x) => x.selecteur === sel);
  assert.ok(f('g2>rect2'), 'forme sans id : chemin d\'index');
  assert.equal(f('#veste').remplissage, '#FFFFFF');
  assert.equal(f('#veste').trait, '#2A2633');
  assert.equal(f('#toque').remplissage, '#FAFAFA', 'dégradé : premier arrêt');
  assert.equal(f('#cuisse-ar').calque, 'Jambe arrière');
  assert.ok(Math.abs(f('#cuisse-ar').boite[0] - 192) < 1, JSON.stringify(f('#cuisse-ar').boite));
  assert.deepEqual(a.refuses, []);
  const t = await dansLaPage('return M.decoupe.analyser(svg);', '<svg viewBox="0 0 10 10"><text x="1" y="5">Bonjour</text><rect width="2" height="2" style="filter: blur(2px)"/></svg>');
  assert.deepEqual(t.refuses.map((r) => r.type).sort(), ['filtre', 'text']);
  const piege = await dansLaPage(`var a = M.decoupe.analyser(svg); return { n: a.formes.length, couleurs: a.formes.map(function (f) { return f.remplissage; }), viewBox: a.viewBox, script: window.__piege || null };`,
    '<svg width="200" height="100"><script>window.__piege = 1;</script><g style="display:none"><rect id="cache" width="5" height="5"/></g>'
    + '<defs><linearGradient id="A"><stop offset="0" stop-color="#123456"/></linearGradient><linearGradient id="B" href="#A"/></defs>'
    + '<rect width="10" height="10" fill="url(#B)"/><rect width="10" height="10" fill="transparent"/></svg>');
  assert.equal(piege.script, null, 'aucun script de la source ne s\'exécute');
  assert.equal(piege.n, 2, 'calque caché ignoré');
  assert.deepEqual(piege.couleurs, ['#123456', 'none']);
  assert.deepEqual(piege.viewBox, [0, 0, 200, 100], 'viewBox posé quand il manque');
});

test('découpe : repères « os debout », gabarit, couleurs, visage, formes signalées', { skip: sauter }, async () => {
  const r = await dansLaPage(`
    var res = M.decoupe.decouper(svg, D.decoupe, D.gabarit);
    var points = {};
    Object.keys(D.decoupe.os).forEach(function (n) {
      var d = D.decoupe.os[n], R = M.decoupe.repere(n, d, res.echelle);
      if (d.de) { var a = R.transformPoint(new DOMPoint(d.de[0], d.de[1])), b = R.transformPoint(new DOMPoint(d.a[0], d.a[1])); points[n] = [a.x, a.y, b.x, b.y]; }
    });
    return { res: res, points: points };`);
  const { res, points } = r;
  assert.deepEqual(res.erreurs, []);
  assert.deepEqual(res.signalees, []);
  const e = 136 / (98 + 100);
  assert.ok(Math.abs(res.echelle - e) < 1e-3);
  const proche = (v, w, msg) => assert.ok(Math.abs(v - w) < 0.05, `${msg} : ${v} ≠ ${w}`);
  proche(points.cuisseAvant[0], 0, 'pivot de la cuisse'); proche(points.cuisseAvant[1], 0, 'pivot de la cuisse');
  proche(points.cuisseAvant[2], 0, 'bout de la cuisse'); proche(points.cuisseAvant[3], 98 * e, 'bout de la cuisse');
  proche(points.piedAvant[2], 44 * e, 'pied vers +x'); proche(points.piedAvant[3], 0, 'pied vers +x');
  proche(points.torse[2], 0, 'torse vers −y'); proche(points.torse[3], -120 * e, 'torse vers −y');
  proche(points.brasAvant[2], 0, 'bras'); proche(points.brasAvant[3], Math.hypot(12.2, 68.9) * e, 'bras');
  const g = res.partiel.gabarit;
  proche(g.cuisse, 98 * e, 'gabarit cuisse'); proche(g.colonne, 120 * e, 'gabarit colonne');
  proche(g.baseTete, g.colonne + 2, 'baseTete');
  proche(g.tete.ry, 72 * e, 'tête : distance cou → centre');
  assert.equal(res.partiel.couleurs.c1, '#FFFFFF', 'la plus grande surface');
  assert.equal(res.partiel.couleurs.peau, '#F2C9A0', 'nom donné par la découpe');
  assert.match(res.partiel.pieces.torse, /^<rect [^>]*transform='matrix\([^)]+\)' fill='var\(--c1\)' stroke='var\(--c\d+\)' stroke-width='3'\/>$/);
  assert.doesNotMatch(res.partiel.pieces.tete, /circle/, 'les yeux vont au visage, pas dans la pièce de la tête');
  assert.match(res.partiel.visage.oeil.blanc, /^<circle /);
  proche(res.partiel.visage.vue.yeux[0][0], 23 * e, 'position de l\'œil');
  proche(res.partiel.visage.vue.yeux[0][1], -10 * e, 'position de l\'œil');
  assert.match(res.partiel.visage.bouche, /^<path /);
  const opa = await dansLaPage(`var d = { os: { torse: { formes: ['#a'], de: [0, 10], a: [0, 0] } } }; return M.decoupe.decouper(svg, d, D.gabarit).partiel.pieces.torse;`,
    '<svg viewBox="0 0 20 20"><g opacity="0.5"><rect id="a" width="4" height="10" fill="rgba(255,0,0,0.5)"/></g></svg>');
  assert.match(opa, /opacity='0.5'/);
  assert.match(opa, /fill-opacity='0.5'/);
});

test('découpe : forme oubliée signalée, forme introuvable en erreur', { skip: sauter }, async () => {
  const r = await dansLaPage(`var d = JSON.parse(JSON.stringify(D.decoupe)); delete d.ignorer; d.os.mainAvant.formes = ['#main-inconnue']; return M.decoupe.decouper(svg, d, D.gabarit);`);
  assert.ok(r.signalees.includes('#ombre') && r.signalees.includes('#main-av'), JSON.stringify(r.signalees));
  assert.ok(r.erreurs.some((m) => /« #main-inconnue » introuvable/.test(m)));
});

test('commandes : analyser, decouper, renommer-couleur, puis planche du dessin découpé', { skip: sauter }, async () => {
  const video = dossierTemporaire();
  fs.writeFileSync(path.join(video, 'deroule.json'), '{}');
  fs.mkdirSync(path.join(video, 'assets'));
  fs.copyFileSync(SVG, path.join(video, 'assets', 'cuisinier.svg'));
  const a = await executer(['analyser', 'assets/cuisinier.svg', '--dossier', video]);
  assert.equal(a.code, 0, a.erreur);
  const analyse = JSON.parse(a.sortie);
  assert.equal(analyse.formes.length, 16);
  assert.ok(fs.existsSync(analyse.png) && analyse.png.endsWith('cuisinier-analyse.png'));
  fs.mkdirSync(path.join(video, 'personnages', 'decoupes'), { recursive: true });
  fs.writeFileSync(path.join(video, 'personnages', 'decoupes', 'cuisinier.json'), JSON.stringify(Object.assign({ nom: 'cuisinier' }, DECOUPE)));
  const d = await executer(['decouper', 'cuisinier', '--dossier', video]);
  assert.equal(d.code, 0, d.erreur);
  assert.match(d.sortie, /Dessin découpé : personnages\/dessins\/cuisinier\.json/);
  assert.doesNotMatch(d.sortie, /laissées de côté/);
  const lu = P.lire(video);
  assert.deepEqual(lu.erreurs.map((x) => x.message), []);
  assert.ok(lu.dessins.cuisinier.pieces.torse.profil);
  assert.ok(fs.existsSync(path.join(video, '.historique')));
  const c = await executer(['renommer-couleur', 'cuisinier', 'c1', 'tenue', '--dossier', video]);
  assert.equal(c.code, 0, c.erreur);
  const apres = P.lire(video);
  assert.equal(apres.dessins.cuisinier.couleurs.tenue, '#FFFFFF');
  assert.equal(apres.decoupes.cuisinier.couleurs['#FFFFFF'], 'tenue', 'la découpe garde le nom');
  const encore = await executer(['decouper', 'cuisinier', '--dossier', video]);
  assert.equal(encore.code, 0, encore.erreur);
  assert.equal(P.lire(video).dessins.cuisinier.couleurs.tenue, '#FFFFFF', 'une nouvelle découpe reprend le nom');
  const pl = await executer(['planche', 'marche', '--dessin', 'cuisinier', '--images', '2', '--vues', '0', '--dossier', video]);
  assert.equal(pl.code, 0, pl.erreur);
  const sans = await executer(['decouper', 'inconnu', '--dossier', video]);
  assert.equal(sans.code, 1);
  assert.match(sans.erreur, /Découpe « inconnu » introuvable/);
});
