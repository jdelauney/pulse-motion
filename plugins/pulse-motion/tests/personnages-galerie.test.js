'use strict';
/* Spec « Mouvement vivant », plan V6 « Galerie de personnages » (5.17) : dessins livrés, deux manières, vues, pièges de
 * dessin (5.15), réglage bâtonnets équivalent, noms. Navigateur (pièces détachées, coût de rendu) :
 * personnages-galerie-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../scripts/lib/personnages.js');
const S = require('../moteur/squelette.js');
const PA = require('../moteur/personnages/partition.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const lu = P.lire(null);
const LIVRES = ['ecoliere', 'soignant', 'grand-mere', 'technicien', 'cuisiniere'];
const VUES = ['profil', 'troisQuarts', 'face'];
const MEMBRES = ['cuisseAvant', 'tibiaAvant', 'piedAvant', 'brasAvant', 'avantBrasAvant'];

/** Tous les SVG d'un dessin : [{ ou, vue, svg }]. */
function svgs(d) {
  const r = [];
  for (const [n, vues] of Object.entries(d.pieces)) for (const [v, svg] of Object.entries(vues)) r.push({ ou: `pièce ${n}`, vue: v, svg });
  for (const a of d.accessoires || []) for (const [v, svg] of Object.entries(a.dessins)) r.push({ ou: `accessoire ${a.nom}`, vue: v, svg });
  return r;
}

test('personnages : 4 à 6 dessins livrés en plus de touffu, en au moins deux manières', () => {
  const autres = Object.keys(lu.dessins).filter((n) => n !== 'touffu').sort();
  assert.deepEqual(autres, [...LIVRES].sort());
  assert.ok(autres.length >= 4 && autres.length <= 6);
  const manieres = new Set(autres.map((n) => lu.dessins[n].maniere));
  assert.deepEqual([...manieres].sort(), ['pieces', 'traits']);
  for (const n of autres) assert.ok(P.MANIERES.includes(lu.dessins[n].maniere), n);
  assert.equal(lu.dessins.touffu.maniere, 'traits');
  // Âges, métiers, morphologies : un enfant (tête plus grande par rapport au corps), une personne âgée, des métiers ;
  // grand et mince, petit et rond, carré ; au moins un personnage qui n'est pas un homme.
  const g = (n) => S.completerGabarit(P.gabaritDe(lu.dessins[n], lu));
  const tete = (n) => (2 * g(n).tete.ry) / PA.hauteur(g(n));
  for (const n of ['soignant', 'technicien', 'cuisiniere', 'grand-mere']) assert.ok(tete('ecoliere') > tete(n) + 0.02, `écolière : tête plus grande que ${n}`);
  const desc = (n) => lu.dessins[n].description;
  assert.match(desc('ecoliere'), /écolière d'une dizaine d'années/);
  assert.match(desc('grand-mere'), /grand-mère/);
  for (const [n, metier] of [['soignant', /stéthoscope/], ['technicien', /gilet haute visibilité/], ['cuisiniere', /toque/]]) assert.match(desc(n), metier, n);
  assert.ok(PA.hauteur(g('soignant')) > PA.hauteur(g('technicien')) && g('soignant').demiEpaules < g('technicien').demiEpaules, 'grand et mince');
  assert.ok(g('cuisiniere').demiBassin >= 11 && PA.hauteur(g('cuisiniere')) < PA.hauteur(g('technicien')), 'petite et ronde');
  assert.ok(g('technicien').demiEpaules >= 16, 'carré');
  assert.ok(LIVRES.filter((n) => /^une /.test(desc(n))).length >= 2, 'au moins un personnage qui n\'est pas un homme');
  // pulse-motion personnages liste : description et manière de chaque dessin.
  const r = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'personnages', 'liste'], { encoding: 'utf8' });
  const liste = JSON.parse(r.stdout).dessins;
  for (const n of LIVRES) {
    const d = liste.find((x) => x.nom === n);
    assert.ok(d && d.description.length > 20 && d.maniere === lu.dessins[n].maniere, n);
  }
});

test('personnages : chaque dessin livré se valide contre son gabarit (personnages verifier)', () => {
  assert.deepEqual(lu.erreurs.map((e) => e.message), []);
  for (const n of LIVRES) {
    assert.deepEqual(P.valider('dessin', lu.dessins[n], Object.assign({ nom: n }, P.contexteDe(lu))), [], n);
    // Déjà au format d'écriture (aller-retour identique).
    assert.equal(P.serialiser('dessin', lu.dessins[n]), lire('personnages', 'dessins', `${n}.json`), n);
  }
  const r = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'personnages', 'verifier'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /6 dessins, aucune erreur/);
  // Le format refuse une manière inconnue et un réglage bâtonnets sur des pièces pleines, ou qui nomme une couleur absente.
  const e = (d) => P.valider('dessin', d, Object.assign({ nom: d.nom }, P.contexteDe(lu)));
  assert.match(e({ ...lu.dessins.technicien, maniere: 'aquarelle' }).join('\n'), /« maniere » : « aquarelle » inconnue/);
  assert.match(e({ ...lu.dessins.technicien, batonnets: { couleurs: { corps: 'gilet' } } }).join('\n'), /réservé à la manière « traits »/);
  assert.match(e({ ...lu.dessins.soignant, batonnets: { couleurs: { corps: 'rouge' } } }).join('\n'), /« rouge » n'est pas une couleur du dessin/);
});

test('personnages : chaque dessin a les vues profil, troisQuarts et face, avec les mêmes éléments', () => {
  for (const n of LIVRES) {
    const d = lu.dessins[n];
    for (const [p, vues] of Object.entries(d.pieces)) for (const v of VUES) assert.equal(typeof vues[v], 'string', `${n}, pièce ${p} : vue ${v}`);
    for (const a of d.accessoires) for (const v of VUES) assert.ok(typeof a.dessins[v] === 'string' && a.dessins[v].length, `${n}, accessoire ${a.nom} : vue ${v}`);
    // Mêmes formes, d'une vue à l'autre, pour la tête (coiffure comprise), le torse et les membres.
    const formes = (svg) => (svg.match(/<(path|rect|ellipse|circle|polygon|line|polyline)\b/g) || []).length;
    for (const p of ['tete', 'torse', ...MEMBRES]) {
      const nb = VUES.map((v) => formes(d.pieces[p][v]));
      if (p === 'torse' && d.maniere === 'pieces') assert.ok(Math.max(...nb) - Math.min(...nb) <= 4, `${n}, ${p} : ${nb}`);
      else assert.equal(new Set(nb).size, 1, `${n}, ${p} : ${nb}`);
    }
    // Visage en trois vues, mêmes nombres d'yeux et de sourcils ; bouches neutre, A, O, MBP au moins ; toutes les expressions.
    assert.deepEqual(Object.keys(d.visage.vues), VUES, n);
    for (const v of VUES) {
      assert.equal(d.visage.vues[v].yeux.length, 2, `${n} ${v}`);
      assert.equal(d.visage.vues[v].sourcils.length, 2, `${n} ${v}`);
    }
    for (const b of ['neutre', 'A', 'O', 'MBP', 'sourire', 'triste', 'surprise', 'colere', 'rire']) assert.ok(d.visage.bouches[b], `${n} : bouche ${b}`);
    assert.deepEqual(Object.keys(d.visage.bouches), P.BOUCHES, n);
    // Le cou (ou le haut du torse) monte sous la tête dans chaque vue.
    const g = S.completerGabarit(P.gabaritDe(d, lu));
    for (const v of VUES) {
      const ys = [...d.pieces.torse[v].matchAll(/\by='(-?[\d.]+)'/g)].map((m) => Number(m[1]));
      assert.ok(Math.min(...ys) <= -g.colonne - 6, `${n}, torse ${v} : le cou monte jusqu'à la tête (${Math.min(...ys)})`);
    }
  }
});

test('personnages : chaque dessin respecte les trois pièges de dessin de 5.15', () => {
  for (const n of ['touffu', ...LIVRES]) {
    const d = lu.dessins[n];
    // 1 et 3 : un seul contour par forme pleine (jamais une calotte trouée, jamais des sous-tracés qui s'annulent).
    for (const { ou, vue, svg } of svgs(d)) {
      for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
        const attrs = m[1];
        const dd = /\bd='([^']*)'/.exec(attrs)[1];
        const plein = !/fill='none'/.test(attrs);
        if (plein) assert.ok((dd.match(/[Mm]/g) || []).length <= 1, `${n}, ${ou} (${vue}) : forme pleine en plusieurs morceaux`);
      }
      assert.doesNotMatch(svg, /fill-rule|evenodd/, `${n}, ${ou}`);
    }
    // 2 : paupière au moins 2 unités plus large que le blanc de l'œil (son trait compris).
    const blanc = /rx='([\d.]+)'[^>]*stroke-width='([\d.]+)'/.exec(d.visage.oeil.blanc);
    const largeurBlanc = 2 * Number(blanc[1]) + Number(blanc[2]);
    const paupiere = Number(/width='([\d.]+)'/.exec(d.visage.oeil.paupiere)[1]);
    assert.ok(paupiere >= largeurBlanc + 2, `${n} : paupière ${paupiere} pour un blanc de ${largeurBlanc}`);
    const hauteurBlanc = 2 * Number(/ry='([\d.]+)'/.exec(d.visage.oeil.blanc)[1]);
    assert.ok(Number(/height='([\d.]+)'/.exec(d.visage.oeil.paupiere)[1]) >= hauteurBlanc + 2, `${n} : la paupière couvre l'œil fermé`);
    assert.ok(d.visage.oeil.hauteur >= hauteurBlanc, `${n} : la paupière remonte au-dessus de l'œil ouvert`);
  }
  assert.match(lire('references', 'dessin-personnages.md'), /Un seul contour[\s\S]*Paupière au moins 2 unités plus large[\s\S]*Remplir chaque partie à part/);
});

test('personnages : la manière « traits » a son réglage batonnets équivalent', () => {
  const traits = Object.keys(lu.dessins).filter((n) => lu.dessins[n].maniere === 'traits').sort();
  assert.deepEqual(traits, ['ecoliere', 'grand-mere', 'soignant', 'touffu']);
  for (const n of traits) {
    const d = lu.dessins[n];
    const b = d.batonnets;
    assert.ok(b && b.couleurs && b.epaisseur >= 4, n);
    // Mêmes couleurs : celles du dessin, par leur nom ; le corps est la couleur des membres et de la tête.
    const a = P.apparenceBatonnets(d);
    for (const [k, v] of Object.entries(b.couleurs)) assert.equal(a.couleurs[k], d.couleurs[v], `${n} : ${k}`);
    for (const k of P.COULEURS_BATONNETS) assert.ok(a.couleurs[k], `${n} : couleur ${k}`);
    assert.match(d.pieces.torse.profil, new RegExp(`fill='var\\(--${b.couleurs.corps}\\)'`), n);
    assert.match(d.pieces.tete.profil, new RegExp(`<ellipse [^>]*fill='var\\(--${b.couleurs.corps}\\)'`), n);
    for (const m of MEMBRES) assert.match(d.pieces[m].profil, new RegExp(`var\\(--teinte-loin, var\\(--${b.couleurs.corps}\\)\\)`), `${n}, ${m}`);
    // Bâtonnets d'épaisseur constante : tous les membres ont la largeur du réglage.
    for (const m of ['cuisseAvant', 'tibiaAvant', 'brasAvant', 'avantBrasAvant']) assert.equal(Number(/width='([\d.]+)'/.exec(d.pieces[m].profil)[1]), b.epaisseur, `${n}, ${m}`);
  }
  // Les pièces pleines : membres éloignés assombris par --teinte-loin, une couleur dos ; aucun réglage bâtonnets.
  for (const n of ['technicien', 'cuisiniere']) {
    const d = lu.dessins[n];
    assert.equal(d.batonnets, undefined);
    assert.ok(d.couleurs.dos && d.couleurs.peau, n);
    for (const m of MEMBRES) assert.match(d.pieces[m].profil, /var\(--teinte-loin, /, `${n}, ${m}`);
  }
  // Dans une scène : data-habillage="batonnets" donne le même personnage en bâtonnets ; refusé sur des pièces pleines.
  const dir = copierProjet('projet-simple');
  const scene = (corps) => `<section data-scene="intro"><h1 data-texte="titre"></h1>${corps}</section>`;
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), scene(traits.filter((n) => n !== 'touffu').map((n, i) => `<div id="p${i}" data-personnage="${n}" data-habillage="batonnets" data-x="${20 + 25 * i}"></div>`).join('') + '<div id="p9" data-personnage="technicien" data-x="90"></div>'));
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  const donnees = JSON.parse(/<script type="application\/json" id="pm-donnees">([\s\S]*?)<\/script>/.exec(r.html)[1]);
  assert.deepEqual(Object.keys(donnees.personnages.apparences).sort(), ['ecoliere', 'grand-mere', 'soignant']);
  assert.deepEqual(donnees.personnages.apparences.soignant, P.apparenceBatonnets(lu.dessins.soignant));
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), scene('<div data-personnage="technicien" data-habillage="batonnets"></div>'));
  assert.match(assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).erreurs.map((e) => e.message).join('\n'), /personnage « technicien » : ce dessin n'a pas de réglage bâtonnets/);
  // Sans data-habillage, les données ne changent pas (aucune apparence embarquée).
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), scene('<div data-personnage="touffu"></div>'));
  const sans = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(Object.hasOwn(JSON.parse(/<script type="application\/json" id="pm-donnees">([\s\S]*?)<\/script>/.exec(sans.html)[1]).personnages, 'apparences'), false);
  assert.match(lire('references', 'moteur', 'personnages.md'), /`data-habillage="batonnets"`/);
});

test('personnages : noms français, aucun nom de marque, description présente', () => {
  const FRANCAIS = { ecoliere: 'écolière', soignant: 'soignant', 'grand-mere': 'grand-mère', technicien: 'technicien', cuisiniere: 'cuisinière' };
  for (const n of LIVRES) {
    const d = lu.dessins[n];
    assert.equal(d.nom, n);
    assert.ok(n.length <= 12, `${n} : nom court`);
    assert.match(d.description, new RegExp(`^une? ${FRANCAIS[n]}`), n);
    // Aucun nom propre (marque, personne réelle) : une description sans majuscule.
    assert.doesNotMatch(d.description, /[A-ZÀ-Ý]/, n);
    assert.ok(d.description.length >= 40, n);
  }
  // Proposés avant d'en dessiner un nouveau.
  assert.match(lire('skills', 'dessiner-personnage', 'SKILL.md'), /d'abord proposer les personnages livrés/);
  assert.match(lire('references', 'demandes.md'), /## Personnages\n\n[^\n]*proposer d'abord les personnages livrés/);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /Mouvements nommés et personnages \([^)]*« un cuisinier qui explique »\) : `pulse-motion reference demandes`/);
  const dp = lire('references', 'dessin-personnages.md');
  assert.match(dp, /\*\*« traits »\*\*[^\n]*`ecoliere`/);
  assert.match(dp, /\*\*« pièces pleines »\*\*[^\n]*`technicien`/);
  assert.match(lire('references', 'personnages.md'), /Dessins : `touffu`, `ecoliere`, `soignant`, `grand-mere`/);
});
