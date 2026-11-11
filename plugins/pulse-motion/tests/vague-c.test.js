'use strict';
/* Spec Styles et réalisation, jalon J8 « Vague C » (5.10, 5.14) : le module isométrique moteur/medium/iso.js (même
 * description, même SVG ; file triée en profondeur ; inclus seulement dans les vidéos des styles qui le déclarent), les deux
 * styles iso-infographie et iso-album (contrat, quatre formats, témoin, poids), et, hors lot, la capture rapide sur un canevas
 * plus petit que la page. Le rendu de chaque style dans les quatre formats est vérifié dans le navigateur par
 * styles-livres.test.js, comme pour les treize autres. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ISO = require('../moteur/medium/iso.js');
const S = require('../scripts/styles.js');
const F = require('../scripts/lib/fiche-style.js');
const T = require('../scripts/lib/temoin.js');
const PNG = require('../scripts/lib/png.js');
const { TYPES } = require('../scripts/lib/contrat.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { assembler } = require('../scripts/assembler.js');
const { projetEssai } = require('../scripts/lib/projet-essai.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const identite = (s) => JSON.parse(lire('styles', s, 'identite.json'));
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const VAGUE_C = { 'iso-infographie': 'schemas-donnees', 'iso-album': 'schemas-donnees' };
const CAPTURE = lire('moteur', 'capture.js');
const LG = 640, HT = 360;
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));

/** Page assemblée d'un projet, écrite dans son dossier. -> fichier */
function ecrirePage(dir) {
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(fichier, a.html, 'utf8');
  return fichier;
}
const ouvrir = (fichier, l = LG, h = HT) => ouvrirCapture({ fichierHtml: fichier, largeur: l, hauteur: h, navigateur, delai: 60000 });

/** Objets (descriptions) des plans d'une scène toute faite, lus dans son HTML comme le fait la page. */
function plansDe(html) {
  const plans = [];
  for (const bloc of html.split(/<div class="iso[^"]*" data-iso\b/).slice(1)) {
    const corps = bloc.slice(0, bloc.indexOf('</div>'));
    plans.push([...corps.matchAll(/<i\s([^>]*)><\/i>/g)].map((m) => {
      const at = {};
      for (const a of m[1].matchAll(/([a-z-]+)="([^"]*)"/g)) at[a[1]] = a[2];
      return ISO.decrire((n) => (n in at ? at[n] : null), Object.keys(at));
    }));
  }
  return plans;
}
/** Ids des groupes d'objets dans l'ordre de dessin. */
const ordre = (svg) => [...svg.matchAll(/<g class="iso-objet[^"]*"[^>]*?\sid="([^"]+)"/g)].map((m) => m[1]);
const boite = (id, x, y, z, l, p, h) => ({ forme: 'boite', x, y, z, l, p, h, attributs: { id } });

// ---------- Le module ----------

test('iso : même description, même SVG', () => {
  const description = () => [
    { forme: 'extruder', x: 0, y: 0, z: 0, h: 0.3, contour: [[0, 0], [8, 0], [8, 6], [0, 6]], couleur: 'iso4' },
    { forme: 'boite', x: 1, y: 1, z: 0.3, l: 3, p: 2, h: 1.5, couleur: 'iso1', classes: ['iso-monte'], dur: 0.8, attributs: { id: 'hangar', 'data-start': '0.4', 'data-dur': '0.8' } },
    { forme: 'prisme', x: 1, y: 1, z: 1.8, l: 3, p: 2, h: 0.8, crete: 'y', couleur: 'iso3' },
    { forme: 'cylindre', x: 6, y: 1.5, z: 0.3, r: 0.7, h: 2, couleur: 'accent' },
    { forme: 'boite', x: 5, y: 3.5, z: 0.3, l: 2, p: 1.2, h: 1, coupe: { start: '#hangar:fin', dur: 0.6 }, couleur: '#7fa6d3' },
    { forme: 'personne', x: 1, y: 4.5, z: 0.3, vers: [4, 4.5, 0.3], dur: 2, couleur: 'primaire' },
    { forme: 'isotype', x: 0.5, y: 5.4, z: 0.3, n: 4, pas: 1 },
  ];
  const options = () => ({ ancres: [{ point: [2.5, 2, 2.6], fil: 1, attributs: { 'data-start': '1' } }] });
  const a = ISO.svg(description(), options()), b = ISO.svg(description(), options());
  assert.deepEqual(a.erreurs, []);
  assert.equal(a.svg, b.svg);
  assert.deepEqual([a.largeur, a.hauteur, a.ancres], [b.largeur, b.hauteur, b.ancres]);
  assert.ok(a.ancres[0].every((v) => v >= 0 && v <= 100), JSON.stringify(a.ancres));
  // La projection de la spec : sx = (x − y)·cos 30°·k, sy = ((x + y)/2 − z)·k.
  const [sx, sy] = ISO.projeter(2, 1, 0.5, 10);
  assert.ok(Math.abs(sx - Math.cos(Math.PI / 6) * 10) < 1e-9 && Math.abs(sy - 10) < 1e-9);
  // Trois tons par face : une boîte montre son dessus, son côté +x (ombre) et son côté +y (face).
  const seule = ISO.svg([boite('b', 0, 0, 0, 2, 2, 1)]).svg;
  assert.deepEqual([...seule.matchAll(/<path class="iso-(\w+)"/g)].map((m) => m[1]).sort(), ['dessus', 'face', 'ombre']);
  const css = lire('moteur', 'medium', 'iso.css');
  assert.match(css, /\.iso-dessus \{ fill: color-mix\(in srgb, var\(--iso-c\) 80%, #fff8ec\)/);
  assert.match(css, /\.iso-ombre \{ fill: color-mix\(in srgb, var\(--iso-c\) 78%, #231a2c\)/);
  // Le balisage d'un objet donne la même description, donc le même SVG ; chaque plan des scènes toutes faites aussi.
  const at = { 'data-iso-boite': '1 1 0.3 3 2 1.5', 'data-couleur': 'iso1', class: 'iso-monte', id: 'hangar', 'data-start': '0.4', 'data-dur': '0.8' };
  const lu = ISO.decrire((n) => (n in at ? at[n] : null), Object.keys(at));
  assert.equal(ISO.svg([lu]).svg, ISO.svg([description()[1]]).svg);
  let plans = 0;
  for (const style of Object.keys(VAGUE_C)) {
    for (const type of Object.keys(TYPES)) {
      const html = lire('styles', style, 'scenes', `${type}.html`);
      plansDe(html).forEach((objets, i) => {
        const r1 = ISO.svg(objets), r2 = ISO.svg(plansDe(html)[i]);
        assert.deepEqual(r1.erreurs, [], `${style}/${type}`);
        assert.equal(r1.svg, r2.svg, `${style}/${type}`);
        plans++;
      });
    }
  }
  assert.ok(plans >= 14, String(plans));
  // Une description fausse est signalée en français, l'objet omis, le reste dessiné.
  const r = ISO.svg([boite('bon', 0, 0, 0, 1, 1, 1), { ...boite('mauvais', 0, 0, 0, -1, 1, 1) }, { ...boite('rouge', 2, 0, 0, 1, 1, 1), couleur: 'rouge' }]);
  assert.deepEqual(r.erreurs.map((e) => e.index), [1, 2]);
  assert.match(r.erreurs[1].message, /couleur « rouge » inconnue/);
  assert.deepEqual(ordre(r.svg), ['bon']);
  assert.throws(() => ISO.decrire((n) => (n === 'data-iso-boite' ? '1 2 3' : null), ['data-iso-boite']), /6 nombres attendus/);
  // Déterministe : aucun tirage au hasard, 20 Ko au plus (spec 5.14).
  const code = lire('moteur', 'medium', 'iso.js');
  assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random\(/);
  assert.ok(Buffer.byteLength(code) <= 20 * 1024, `${Buffer.byteLength(code)} o`);
});

test('iso : tri en profondeur juste sur une pile de boîtes', () => {
  // Une pile de cinq boîtes écrite dans le désordre : dessinée de bas en haut.
  const pile = [3, 0, 4, 1, 2].map((k) => boite(`p${k}`, 1, 1, k, 2, 2, 1));
  assert.deepEqual(ordre(ISO.svg(pile).svg), ['p0', 'p1', 'p2', 'p3', 'p4']);
  // Des boîtes de hauteurs différentes, posées les unes sur les autres : même règle.
  const inegale = [boite('haut', 0, 0, 3, 1, 1, 0.5), boite('bas', 0, 0, 0, 1, 1, 2.5), boite('milieu', 0, 0, 2.5, 1, 1, 0.5)];
  assert.deepEqual(ordre(ISO.svg(inegale).svg), ['bas', 'milieu', 'haut']);
  // Une grande dalle sous des objets passe avant eux, même si son centre est plus « profond » que le leur.
  const site = [boite('cuve', 1, 1, 0.3, 1, 1, 2), { forme: 'extruder', x: 0, y: 0, z: 0, h: 0.3, contour: [[0, 0], [9, 0], [9, 7], [0, 7]], attributs: { id: 'dalle' } }, boite('caisse', 6, 5, 0.3, 1, 1, 1)];
  assert.deepEqual(ordre(ISO.svg(site).svg), ['dalle', 'cuve', 'caisse']);
  // Une rangée le long de x, puis de y : la plus proche de l'observateur en dernier.
  assert.deepEqual(ordre(ISO.svg([2, 0, 1].map((k) => boite(`x${k}`, k * 1.5, 0, 0, 1, 1, 1))).svg), ['x0', 'x1', 'x2']);
  assert.deepEqual(ordre(ISO.svg([1, 2, 0].map((k) => boite(`y${k}`, 0, k * 1.5, 0, 1, 1, 1))).svg), ['y0', 'y1', 'y2']);
  // La coupe : l'intérieur de la boîte, puis ce qu'elle contient, puis ses faces avant.
  const coupe = ISO.svg([{ ...boite('machine', 0, 0, 0, 4, 3, 2), coupe: { start: '2' } }, { forme: 'cylindre', x: 1.5, y: 1.5, z: 0, r: 0.6, h: 1.2, attributs: { id: 'piece' } }]).svg;
  const i = coupe.indexOf('id="machine"'), j = coupe.indexOf('id="piece"'), k = coupe.indexOf('class="iso-avant"');
  assert.ok(i > 0 && i < j && j < k, `${i} ${j} ${k}`);
  assert.match(coupe, /<g class="iso-avant" data-dur="0\.8" data-start="2">/);
  // Le biais force l'ordre d'un objet composé.
  assert.deepEqual(ordre(ISO.svg([{ ...boite('devant', 0, 0, 1, 1, 1, 1), biais: 9 }, boite('derriere', 0, 0, 0, 1, 1, 1)]).svg), ['derriere', 'devant']);
});

// ---------- Les deux styles ----------

test('vague C : iso-infographie et iso-album passent contrat, quatre formats et témoin', () => {
  for (const [style, categorie] of Object.entries(VAGUE_C)) {
    const dossier = path.join(RACINE, 'styles', style);
    // Contrat : les neuf scènes toutes faites et leurs clés, identité complète, polices et licences, sans avertissement.
    const v = S.verifierStyle(dossier);
    assert.deepEqual([v.erreurs, v.avertissements], [[], []], style);
    const catalogue = JSON.parse(lire('styles', style, 'catalogue.json'));
    assert.deepEqual(catalogue.scenes.map((s) => s.nom).sort(), Object.keys(TYPES).sort(), style);
    const id = identite(style);
    assert.equal(id.categorie, categorie, style);
    assert.deepEqual(id.modules, ['iso'], style);
    assert.deepEqual(id.couleur.tons, ['clair'], style);
    assert.ok(id.provenance.length >= 1 && id.provenance.every((p) => p.depot === 'lemo-opuscar' && p.licence === 'MIT'), style);
    assert.deepEqual(F.verifierFiche(lire('references', 'styles', `${style}.md`), { dossierStyle: dossier, identite: id }), [], style);
    // Polices : uniquement des polices OFL déjà livrées dans le dépôt, copiées à l'identique (aucun téléchargement).
    const licences = lire('styles', style, 'polices', 'LICENCES.md');
    assert.match(licences, /SIL OPEN FONT LICENSE Version 1\.1/, style);
    assert.match(licences, /aucune police téléchargée pour ce style/, style);
    for (const f of fs.readdirSync(path.join(dossier, 'polices')).filter((x) => x.endsWith('.woff2'))) {
      const source = fs.readdirSync(path.join(RACINE, 'styles')).filter((s) => !VAGUE_C[s]).find((s) => fs.existsSync(path.join(RACINE, 'styles', s, 'polices', f)));
      assert.ok(source, `${style} : ${f} vient d'un autre style`);
      assert.ok(fs.readFileSync(path.join(dossier, 'polices', f)).equals(fs.readFileSync(path.join(RACINE, 'styles', source, 'polices', f))), `${style} : ${f}`);
    }
    // Quatre formats : les requêtes de conteneur du carré, du vertical et de la marge des réseaux en 9:16.
    const css = lire('styles', style, 'style.css');
    for (const q of ['@container (max-aspect-ratio: 5/4)', '@container (orientation: portrait)', '@container (max-aspect-ratio: 2/3)', '@container (max-aspect-ratio: 9/10)']) assert.ok(css.includes(q), `${style} : ${q}`);
    // Chaque scène toute faite montre un plan isométrique, sauf le moyeu (une idée et ses parties) ; le schéma est relié par data-fleche.
    for (const type of Object.keys(TYPES)) {
      const html = lire('styles', style, 'scenes', `${type}.html`);
      if (type !== 'moyeu') assert.match(html, /<div class="iso[^"]*" data-iso/, `${style}/${type}`);
      assert.doesNotMatch(html, /<svg\b/, `${style}/${type} : le SVG est produit par le module`);
    }
    assert.match(lire('styles', style, 'scenes', 'schema.html'), /data-fleche="#a → #b"[\s\S]*data-fleche="#b → #c"/, style);
    // Témoin : les scènes titre et chiffre aux durées du catalogue, compteur à 1 250.
    const projet = T.projetTemoin({ dossierStyle: dossier });
    const d = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
    assert.deepEqual(d.scenes.map((s) => s.id), ['titre', 'chiffre'], style);
    assert.match(fs.readFileSync(path.join(projet, 'scenes', 'chiffre.html'), 'utf8'), /nombre 0→1250\b/, style);
    fs.rmSync(projet, { recursive: true, force: true });
  }
  // iso-album : le texte posé au sol s'écrit lettre à lettre, les personnes qui entrent ne sont pas là avant leur départ.
  assert.match(lire('styles', 'iso-album', 'scenes', 'titre.html'), /class="au-sol" data-texte="etiquette" data-iso-ancre="[^"]+" data-lettres="ecrit" data-start="[\d.]+" data-dur="[\d.]+"/);
  assert.match(lire('styles', 'iso-album', 'scenes', 'liste.html'), /data-iso-personne="[^"]+" data-iso-depuis="[^"]+"[^>]*class="iso-entre"/);
  // Recommandation : les nouveaux styles dans « aussi », jamais parmi les recommandés (décision S8-9).
  const reco = JSON.parse(lire('references', 'styles', 'recommandation.json'));
  for (const style of Object.keys(VAGUE_C)) {
    assert.ok(Object.values(reco).some((r) => r.aussi.includes(style)), style);
    assert.ok(!Object.values(reco).some((r) => r.recommandes.includes(style) || r.contraste === style), style);
  }
  // Recherche par les mots de la personne.
  assert.equal(S.chercherStyles('une infographie isométrique')[0].style, 'iso-infographie');
  assert.equal(S.chercherStyles('façon diorama')[0].style, 'iso-infographie');
  assert.equal(S.chercherStyles('un album isométrique')[0].style, 'iso-album');
  assert.equal(S.chercherStyles('avec des petits personnages')[0].style, 'iso-album');
});

test('vague C : images A et B du témoin rendues par le plugin', { ...SANS, timeout: 600000 }, async () => {
  const sortie = dossierTemporaire('pm-vague-c-');
  for (const style of Object.keys(VAGUE_C)) {
    const r = await T.imagesTemoin({ dossierStyle: path.join(RACINE, 'styles', style), sortie, prefixe: `${style}-`, navigateur });
    assert.equal(r.ok, true, `${style} : ${r.message}`);
    const [a, b] = ['A', 'B'].map((k) => fs.readFileSync(r.images[k]));
    for (const png of [a, b]) {
      assert.equal(PNG.verifierPNG(png), null, style);
      const img = PNG.decoder(png);
      let min = 255, max = 0;
      for (let i = 0; i < img.donnees.length; i += img.canaux * 97) { const l = img.donnees[i]; min = Math.min(min, l); max = Math.max(max, l); }
      assert.ok(max - min > 80, `${style} : image presque unie`);
    }
    assert.ok(!a.equals(b), `${style} : A et B identiques`);
  }
});

test('poids : vidéo témoin de 60 s au plus 250 Ko au-dessus de clair-pedagogique', () => {
  const poids = (style) => {
    const dossierStyle = path.join(RACINE, 'styles', style);
    const n = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'catalogue.json'), 'utf8')).scenes.length;
    const dir = projetEssai({ dossierStyle, textes: 'exemple', dureeScene: Math.round((60 / n) * 100) / 100 });
    try {
      const { html, erreurs } = assembler({ dossier: dir, ecrire: false });
      assert.deepEqual(erreurs.filter((e) => e.gravite === 'erreur'), [], style);
      return Buffer.byteLength(html);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const reference = poids('clair-pedagogique');
  for (const style of Object.keys(VAGUE_C)) {
    const p = poids(style);
    assert.ok(p - reference <= 250 * 1024, `${style} : ${Math.round((p - reference) / 1024)} Ko de plus`);
  }
});

// ---------- Modules d'un style ----------

test('iso.js : inclus seulement dans les vidéos de ces styles', () => {
  const assemble = (style) => {
    const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', style), textes: 'exemple', types: ['titre', 'liste'] });
    try { return assembler({ dossier: dir, ecrire: false }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const iso = /M\.iso\s*=/;
  for (const style of Object.keys(VAGUE_C)) {
    const a = assemble(style);
    assert.match(a.moteur, iso, style);
    // Sa feuille vient avec lui, avant celle du style (qui peut la régler).
    assert.ok(a.cssPage.includes('.pm-iso .iso-dessus') && a.cssPage.indexOf('.pm-iso .iso-dessus') < a.cssPage.indexOf('--iso-1:'), style);
    // L'isométrie ne tire pas le calque de dessin : ces deux scènes n'ont ni flèche ni annotation.
    assert.ok(!a.groupes.includes('dessin') && !a.groupes.includes('releve'), `${style} : ${a.groupes.join(', ')}`);
  }
  for (const style of ['clair-pedagogique', 'tableau-blanc', 'carnet', 'recit-donnees', 'plan-technique']) {
    const a = assemble(style);
    assert.doesNotMatch(a.moteur, iso, style);
    assert.ok(!a.cssPage.includes('.pm-iso'), style);
  }
  // La feuille du module : aucun effet mal rendu par l'export rapide, aucune animation sans fin.
  const css = lire('moteur', 'medium', 'iso.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /mix-blend-mode|backdrop-filter|filter\s*:[^;]*url\(|\binfinite\b/);
});

// ---------- Dans le navigateur ----------

test('iso dans la page : SVG produit avant le minutage, étiquette sur son point, marche à 12 i/s, coupe, erreur signalée', { ...SANS, timeout: 240000 }, async () => {
  const html = `<section data-scene="plan">
  <div class="iso" data-iso style="--iso-largeur: 110cqh; --iso-hauteur: 70cqh">
    <i id="socle" data-iso-extruder="0,0 7,0 7,5 0,5" data-iso-h="0.3" data-couleur="iso4"></i>
    <i id="caisse" data-iso-boite="1 1 0.3 2.4 2 1.6" data-couleur="iso1" data-iso-coupe="2" data-iso-coupe-dur="0.5" class="iso-monte" data-start="0.2" data-dur="0.6"></i>
    <i id="piece" data-iso-cylindre="2 2 0.3 0.5 1" data-couleur="accent"></i>
    <i id="marcheur" data-iso-personne="1 4 0.3" data-iso-vers="6 4 0.3" data-start="1" data-dur="2"></i>
    <i id="faux" data-iso-boite="0 0 0 -1 1 1"></i>
    <p id="etiquette" class="fine" data-texte="a" data-iso-ancre="2.2 2 1.9" data-iso-fil="1" data-start="0.5"></p>
  </div>
</section>`;
  const dir = miniProjet({ style: 'iso-infographie', scenes: [{ id: 'plan', duree: 5, html, textes: { a: 'Réception' } }] });
  const c = await ouvrir(ecrirePage(dir));
  try {
    const r = await json(c, `M.seek(1.5).then(function () {
      var svg = document.querySelector('svg.pm-iso'), caisse = document.getElementById('caisse');
      var fil = svg.querySelector('path.iso-fil'), bout = fil.getPointAtLength(fil.getTotalLength()), m = svg.getScreenCTM();
      var e = document.getElementById('etiquette').getBoundingClientRect();
      return { svgs: document.querySelectorAll('svg.pm-iso').length, restes: document.querySelectorAll('i[data-iso-boite], i[data-iso-personne]').length,
        caisse: caisse.tagName, cle: caisse.getAttribute('data-pm-cle'), d: Array.prototype.map.call(svg.querySelectorAll('path'), function (p) { return p.getAttribute('d'); }),
        viewBox: svg.getAttribute('viewBox'), point: [bout.x * m.a + m.e, bout.y * m.d + m.f], bas: [e.left + e.width / 2, e.bottom],
        superpose: document.getElementById('etiquette').hasAttribute('data-superpose'),
        erreurs: M.erreurs.filter(function (x) { return x.regle === 'iso-invalide'; }).map(function (x) { return x.message; }) };
    })`);
    assert.deepEqual([r.svgs, r.restes, r.caisse, r.cle], [1, 0, 'g', 'caisse'], 'SVG produit, objets minutés par le moteur');
    assert.ok(r.erreurs.some((m) => /Scène « plan » : isométrie \(#faux\) : tailles positives\./.test(m)), r.erreurs.join('\n'));
    // Même description, même SVG : la page dessine ce que le module dessine dans Node.
    const objets = plansDe(html)[0];
    const node = ISO.svg(objets, { ancres: [{ point: [2.2, 2, 1.9], fil: 1, attributs: { 'data-start': '0.5' } }] });
    assert.equal(r.viewBox, `0 0 ${node.largeur} ${node.hauteur}`);
    assert.deepEqual(r.d, [...node.svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]));
    // L'étiquette est posée exactement au bout de son fil.
    assert.ok(Math.abs(r.point[0] - r.bas[0]) < 1.5 && Math.abs(r.point[1] - r.bas[1]) < 1.5, JSON.stringify([r.point, r.bas]));
    assert.equal(r.superpose, true);
    // La silhouette marche par à-coups : 12 positions par seconde, jamais entre deux.
    const positions = [];
    for (let k = 0; k <= 120; k++) positions.push(await json(c, `M.seek(${1 + k / 60}).then(function () { return Math.round(document.getElementById('marcheur').getBoundingClientRect().left * 100) / 100; })`));
    const distinctes = [...new Set(positions)];
    assert.ok(distinctes.length >= 22 && distinctes.length <= 26, `${distinctes.length} positions en 2 s`);
    for (let k = 1; k < positions.length; k++) assert.ok(positions[k] >= positions[k - 1], 'elle avance toujours');
    // Dans une même image de 1/12 s (cinq relevés à 1/60 s), la position ne bouge pas.
    for (let n = 0; 5 * n + 3 < positions.length; n++) assert.equal(positions[5 * n + 3], positions[5 * n + 1], `image ${n}`);
    // La coupe : les faces avant s'effacent, l'intérieur paraît.
    const opacite = (t) => json(c, `M.seek(${t}).then(function () { return Number(getComputedStyle(document.querySelector('.iso-avant')).opacity); })`);
    assert.equal(await opacite(1.9), 1);
    assert.ok(Math.abs((await opacite(2.6)) - 0.1) < 0.02);
  } finally { await c.fermer(); }
});

// ---------- Hors lot : la capture rapide sur un petit canevas ----------

test('capture rapide : un canevas plus petit que la page reçoit toute l\'image, mise à l\'échelle', { ...SANS, timeout: 240000 }, async () => {
  const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', 'iso-infographie'), textes: 'exemple', types: ['titre'] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; true`);
      const rapide = async (l, h) => PNG.decoder(Buffer.from(await c.evaluer(`(async () => {
        await M.seek(5);
        const canvas = document.createElement('canvas'); canvas.width = ${l}; canvas.height = ${h};
        await M.capturer(canvas.getContext('2d'), ${l}, ${h});
        return canvas.toDataURL('image/png').split(',')[1];
      })()`), 'base64'));
      const grande = await rapide(LG, HT), petite = await rapide(LG / 4, HT / 4);
      assert.deepEqual([petite.largeur, petite.hauteur], [LG / 4, HT / 4]);
      // La grande image réduite au quart (moyenne de 4 × 4 pixels) ressemble à la petite, à 3 % près.
      let s = 0;
      for (let y = 0; y < HT / 4; y++) for (let x = 0; x < LG / 4; x++) for (let k = 0; k < 3; k++) {
        let m = 0;
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) m += grande.donnees[((y * 4 + j) * LG + x * 4 + i) * grande.canaux + k];
        s += Math.abs(m / 16 - petite.donnees[(y * LG / 4 + x) * petite.canaux + k]);
      }
      const ecart = s / ((LG / 4) * (HT / 4) * 3 * 255);
      assert.ok(ecart <= 0.03, `${(100 * ecart).toFixed(2)} %`);
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
