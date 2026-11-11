'use strict';
/* Spec Styles et réalisation, jalon J9 « Vague D » (5.10, 5.15) : quatre styles livrés, papier et imprimé (crayon,
 * papier-decoupe, riso, pictogrammes), les encres « cire » et « riso » du module encre, le module riso (aplats surimprimés dans
 * un canevas, calage constant dans un plan, rattrapé sur un temps fort), les textures tirées d'une graine (outils/styles), et,
 * hors lot, la marbrure et la lumière de fenêtre de tableau-noir reposées sans couche transformée (même image, capture plus
 * rapide). Le rendu de chaque style dans les quatre formats est vérifié dans le navigateur par styles-livres.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../scripts/styles.js');
const F = require('../scripts/lib/fiche-style.js');
const T = require('../scripts/lib/temoin.js');
const PNG = require('../scripts/lib/png.js');
const C = require('../scripts/lib/couleurs.js');
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
const charte = (s) => JSON.parse(lire('styles', s, 'charte.json'));
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const VAGUE_D = { crayon: 'dessine', 'papier-decoupe': 'papier-imprime', riso: 'papier-imprime', pictogrammes: 'schemas-donnees' };
const CAPTURE = lire('moteur', 'capture.js');
const PIXELS = lire('moteur', 'pixels.js');
const LG = 640, HT = 360;
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));
const scene = (style, type) => lire('styles', style, 'scenes', `${type}.html`).replace(/^<!--[\s\S]*?-->\s*/, '');
/** Styles livrés avant la vague D (les quinze) : { style: true }. */
const identiteDesAnciens = () => Object.fromEntries(fs.readdirSync(path.join(RACINE, 'styles')).filter((s) => !(s in VAGUE_D)).map((s) => [s, true]));

/** Page assemblée d'un projet, écrite dans son dossier. -> fichier */
function ecrirePage(dir) {
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(fichier, a.html, 'utf8');
  return fichier;
}
const ouvrir = (fichier) => ouvrirCapture({ fichierHtml: fichier, largeur: LG, hauteur: HT, navigateur, delai: 60000 });
function ecart(a, b) {
  let s = 0;
  const n = a.largeur * a.hauteur;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s += Math.abs(a.donnees[i * a.canaux + k] - b.donnees[i * b.canaux + k]);
  return s / (n * 3 * 255);
}
const rapide = async (c, l = LG, h = HT) => PNG.decoder(Buffer.from(await c.evaluer(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${l}; canvas.height = ${h};
  await M.capturer(canvas.getContext('2d'), ${l}, ${h});
  return canvas.toDataURL('image/png').split(',')[1];
})()`), 'base64'));
/** Export fidèle et export rapide d'un même instant : écart moyen (0 à 1). */
async function deuxVoies(c, t) {
  const f = PNG.decoder(await c.capturer(t));
  await c.evaluer(`M.seek(${t})`);
  return ecart(f, await rapide(c));
}

// ---------- Les quatre styles ----------

test('vague D : crayon, papier-decoupe, riso, pictogrammes passent contrat, quatre formats et témoin', () => {
  for (const [style, categorie] of Object.entries(VAGUE_D)) {
    const dossier = path.join(RACINE, 'styles', style);
    // Contrat : les neuf scènes toutes faites et leurs clés, identité complète, polices et licences, sans avertissement.
    const v = S.verifierStyle(dossier);
    assert.deepEqual([v.erreurs, v.avertissements], [[], []], style);
    const catalogue = JSON.parse(lire('styles', style, 'catalogue.json'));
    assert.deepEqual(catalogue.scenes.map((s) => s.nom).sort(), Object.keys(TYPES).sort(), style);
    const id = identite(style);
    assert.equal(id.categorie, categorie, style);
    assert.ok(id.provenance.length >= 1 && id.provenance.every((p) => p.licence === 'MIT'), style);
    assert.deepEqual(F.verifierFiche(lire('references', 'styles', `${style}.md`), { dossierStyle: dossier, identite: id }), [], style);
    // Polices : des polices OFL déjà livrées dans le dépôt, copiées à l'identique ; seule exception, la police manuscrite de
    // crayon (Patrick Hand, S8 J10), téléchargée avec l'accord de l'auteur (vérifiée par mode-d-emploi.test.js).
    const licences = lire('styles', style, 'polices', 'LICENCES.md');
    assert.match(licences, /SIL OPEN FONT LICENSE Version 1\.1/, style);
    assert.match(licences, /aucune police téléchargée pour ce style/, style);
    for (const f of fs.readdirSync(path.join(dossier, 'polices')).filter((x) => x.endsWith('.woff2'))) {
      if (style === 'crayon' && f === 'Patrick Hand-400.woff2') continue;
      const octets = fs.readFileSync(path.join(dossier, 'polices', f));
      const sources = Object.keys(identiteDesAnciens()).filter((s) => fs.existsSync(path.join(RACINE, 'styles', s, 'polices', f)) && fs.readFileSync(path.join(RACINE, 'styles', s, 'polices', f)).equals(octets));
      assert.ok(sources.length >= 1, `${style} : ${f} n'est la copie d'aucune police déjà livrée`);
    }
    // Quatre formats : les requêtes de conteneur du carré, du vertical et de la marge des réseaux en 9:16.
    const css = lire('styles', style, 'style.css');
    for (const q of ['@container (max-aspect-ratio: 5/4)', '@container (orientation: portrait)', '@container (max-aspect-ratio: 2/3)', '@container (max-aspect-ratio: 9/10)']) assert.ok(css.includes(q), `${style} : ${q}`);
    // Export rapide : ni filtre (pas même drop-shadow), ni fusion CSS ; les fusions restent dans les canevas.
    const sans = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(sans, /(^|[\s;{])filter\s*:|mix-blend-mode|backdrop-filter/, style);
    // Témoin : les scènes titre et chiffre aux durées du catalogue, compteur à 1 250.
    const projet = T.projetTemoin({ dossierStyle: dossier });
    const d = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
    assert.deepEqual(d.scenes.map((s) => s.id), ['titre', 'chiffre'], style);
    assert.match(fs.readFileSync(path.join(projet, 'scenes', 'chiffre.html'), 'utf8'), /nombre 0→1250\b/, style);
    fs.rmSync(projet, { recursive: true, force: true });
  }
  // Recommandation : les nouveaux styles dans « aussi », jamais parmi les recommandés.
  const reco = JSON.parse(lire('references', 'styles', 'recommandation.json'));
  for (const style of Object.keys(VAGUE_D)) {
    assert.ok(Object.values(reco).some((r) => r.aussi.includes(style)), style);
    assert.ok(!Object.values(reco).some((r) => r.recommandes.includes(style) || r.contraste === style), style);
  }
  // Recherche par les mots de la personne.
  assert.equal(S.chercherStyles('au crayon gras')[0].style, 'crayon');
  assert.equal(S.chercherStyles('en papier découpé')[0].style, 'papier-decoupe');
  assert.equal(S.chercherStyles('façon risographie')[0].style, 'riso');
  assert.equal(S.chercherStyles('avec des pictogrammes')[0].style, 'pictogrammes');
  // Modules : la cire et le riso passent par l'encre ; seul le riso a ses aplats ; le papier découpé et les pictogrammes, aucun.
  assert.deepEqual(Object.keys(VAGUE_D).map((s) => identite(s).modules || []), [['encre'], [], ['encre', 'riso'], []]);
  assert.match(lire('styles', 'crayon', 'style.css'), /--pm-encre: cire;/);
  assert.match(lire('styles', 'riso', 'style.css'), /--pm-encre: riso;/);
  for (const type of Object.keys(TYPES)) {
    for (const style of ['crayon', 'riso']) assert.match(scene(style, type), /<section data-scene="[a-z]+" data-encre="style">/, `${style}/${type}`);
    // Pictogrammes : tout sur les demi-secondes (un temps de 0,5 s).
    for (const m of scene('pictogrammes', type).matchAll(/data-start="(\d+(?:\.\d+)?)"/g)) assert.equal(Number(m[1]) % 0.5, 0, `pictogrammes/${type} : ${m[1]}`);
  }
  // Pictogrammes : dessinés pour Pulse Motion, chacun cité par une classe du style.
  const pictos = fs.readdirSync(path.join(RACINE, 'styles', 'pictogrammes', 'pictos')).filter((f) => f.endsWith('.svg') && f !== 'motif.svg');
  assert.ok(pictos.length >= 12, String(pictos.length));
  for (const f of pictos) {
    assert.match(lire('styles', 'pictogrammes', 'style.css'), new RegExp(`\\.picto-${f.slice(0, -4)} \\{ --picto: url\\("pictos/${f}"\\); \\}`), f);
    assert.doesNotMatch(lire('styles', 'pictogrammes', 'pictos', f), /<(image|text|script|style)\b|href=|https?:\/\/(?!www\.w3\.org\/2000\/svg")/, f);
  }
});

test('vague D : images A et B du témoin rendues par le plugin', { ...SANS, timeout: 600000 }, async () => {
  const sortie = dossierTemporaire('pm-vague-d-');
  for (const style of Object.keys(VAGUE_D)) {
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

test('poids : vidéo témoin de 60 s au plus 250 Ko au-dessus de clair-pedagogique (vague D)', () => {
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
  for (const style of Object.keys(VAGUE_D)) {
    const p = poids(style);
    assert.ok(p - reference <= 250 * 1024, `${style} : ${Math.round((p - reference) / 1024)} Ko de plus`);
  }
});

// ---------- Modules et textures ----------

test('assembler : module d\'un style inclus seulement si le style le déclare (encre et riso)', () => {
  const assemble = (style) => {
    const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', style), textes: 'exemple', types: ['titre', 'liste'] });
    try { return assembler({ dossier: dir, ecrire: false }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const encre = /M\.encre\s*=/, riso = /M\.riso\s*=/, feuilleRiso = /canvas\.pm-riso \{/;
  const r = assemble('riso'), cr = assemble('crayon'), pa = assemble('papier-decoupe'), pi = assemble('pictogrammes'), cl = assemble('clair-pedagogique');
  assert.match(r.moteur, encre); assert.match(r.moteur, riso); assert.match(r.html, feuilleRiso);
  assert.match(cr.moteur, encre); assert.doesNotMatch(cr.moteur, riso); assert.doesNotMatch(cr.html, feuilleRiso);
  for (const a of [pa, pi, cl]) { assert.doesNotMatch(a.moteur, encre); assert.doesNotMatch(a.moteur, riso); assert.doesNotMatch(a.html, feuilleRiso); }
  // L'encre redessine les tracés du calque : ses groupes viennent avec elle ; les aplats du riso ne s'en servent pas.
  for (const a of [r, cr]) for (const g of ['dessin', 'releve']) assert.ok(a.groupes.includes(g), g);
  // Les textures et les pictogrammes sont embarqués (data:), jamais lus en ligne.
  for (const a of [r, cr, pa, pi]) assert.doesNotMatch(a.html, /url\(\s*["']?(?!data:)[^)"'\s]+\.(png|svg)/);
  // Modules : 20 Ko au plus, sans Math.random.
  for (const f of ['encre.js', 'riso.js', 'riso.css']) {
    const code = lire('moteur', 'medium', f);
    assert.ok(Buffer.byteLength(code) <= 20 * 1024, `${f} : ${Buffer.byteLength(code)} o`);
    assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random\(/, f);
  }
});

test('textures : tuiles PNG embarquées, 40 Ko au plus (régénérées depuis leur graine : outils/styles/textures.test.js)', () => {
  for (const [style, fichier] of [['crayon', 'papier.png'], ['riso', 'grain.png'], ['papier-decoupe', 'fibres.png']]) {
    const octets = fs.readFileSync(path.join(RACINE, 'styles', style, fichier));
    assert.ok(octets.length <= 40 * 1024, `${style}/${fichier} : ${octets.length} o`);
    assert.equal(PNG.verifierPNG(octets), null, fichier);
    const img = PNG.decoder(octets);
    assert.deepEqual([img.largeur, img.hauteur, img.canaux], [128, 128, 4], fichier);
    assert.match(lire('styles', style, 'style.css'), new RegExp(`url\\("${fichier.replace('.', '\\.')}"\\)`), fichier);
  }
});

// ---------- Dans le navigateur ----------

test('riso : décalage de calage constant dans un plan', { ...SANS, timeout: 240000 }, async () => {
  const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', 'riso'), textes: 'exemple', valeurChiffre: 1250, types: ['titre', 'chiffre', 'conclusion'] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; true`);
      const debut = (id) => c.minutage.scenes.find((s) => s.id === id).debut;
      const etat = (id, t) => json(c, `M.seek(${t}).then(function () {
        var sec = document.querySelector('section[data-scene="${id}"]'), cs = getComputedStyle(sec);
        var encres = ['--c-primaire', '--c-accent', '--c-encre-neutre'].map(function (v) { return cs.getPropertyValue(v).trim(); });
        var cv = sec.querySelector('canvas.pm-riso'), peints = 0;
        if (cv) { var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (var i = 3; i < d.length; i += 4) if (d[i]) peints++; }
        return { decalages: encres.map(function (e) { return M.encre.decalage(sec, '${id}', e); }), peints: peints, peint: sec.hasAttribute('data-riso-peint'),
          caches: Array.prototype.every.call(sec.querySelectorAll('[data-riso]'), function (x) { return getComputedStyle(x).visibility === 'hidden'; }),
          fusionCss: Array.prototype.some.call(sec.querySelectorAll('*'), function (x) { return getComputedStyle(x).mixBlendMode !== 'normal'; }),
          erreurs: M.erreurs.filter(function (e) { return e.regle === 'dessin-erreur'; }).length };
      })`);
      // Dans un plan : le même décalage à chaque image, de 0,2 à 0,5 cqh ; d'un plan à l'autre, un autre tirage.
      const titre = [];
      for (const dt of [1.2, 2.5, 4, 6.4]) titre.push(await etat('titre', debut('titre') + dt));
      for (const e of titre.slice(1)) assert.deepEqual(e.decalages, titre[0].decalages);
      for (const [dx, dy] of titre[0].decalages) { const r = Math.hypot(dx, dy); assert.ok(r >= 0.199 && r <= 0.501, String(r)); }
      const chiffre = await etat('chiffre', debut('chiffre') + 3);
      assert.notDeepEqual(chiffre.decalages, titre[0].decalages);
      // Les aplats sont peints dans le canevas (surimprimés), les éléments HTML ne servent plus que de géométrie.
      for (const e of [titre[3], chiffre]) {
        assert.ok(e.peint && e.caches && e.peints > 500, JSON.stringify(e));
        assert.equal(e.fusionCss, false);
        assert.equal(e.erreurs, 0);
      }
      // Sur le temps fort de la conclusion, les plaques se calent : décalage nul une fois le calage passé.
      const fin = await etat('conclusion', debut('conclusion') + 5.6);
      for (const [dx, dy] of fin.decalages) assert.ok(Math.hypot(dx, dy) < 1e-6, JSON.stringify(fin.decalages));
      const avant = await etat('conclusion', debut('conclusion') + 0.6);
      assert.ok(avant.decalages.every(([dx, dy]) => Math.hypot(dx, dy) >= 0.199), JSON.stringify(avant.decalages));
      // Les deux voies d'export donnent la même image (surimpression dans un canevas, jamais en CSS).
      const e = await deuxVoies(c, debut('titre') + 6.4);
      assert.ok(e <= 0.02, `${(100 * e).toFixed(2)} %`);
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('riso : texte dans l\'encre la plus sombre, contraste mesuré', { ...SANS, timeout: 300000 }, async () => {
  // La charte : le texte est la plus sombre des encres, et lisible sur le papier.
  const k = charte('riso').couleurs;
  const neutre = /--c-encre-neutre: (#[0-9a-f]{6});/.exec(lire('styles', 'riso', 'style.css'))[1];
  for (const encre of [k.primaire, k.accent, neutre]) assert.ok(C.luminance(k.texte) < C.luminance(encre), encre);
  assert.ok(C.contraste(k.texte, k.fond) >= 4.5, String(C.contraste(k.texte, k.fond)));
  const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', 'riso'), textes: 'exemple', valeurChiffre: 1250 });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; ${PIXELS}; true`);
      // Chaque texte, dans chaque scène, est dans l'encre du texte ; mesuré sur les pixels, aucun contraste trop faible.
      const r = await json(c, `(async function () {
        var couleurs = [];
        for (var i = 0; i < M.minutage.scenes.length; i++) {
          var s = M.minutage.scenes[i]; await M.seek(Math.max(s.debut, s.fin - 0.2));
          document.querySelectorAll('section[data-scene="' + s.id + '"] [data-texte]').forEach(function (el) { couleurs.push(getComputedStyle(el).color); });
        }
        var texte = getComputedStyle(document.getElementById('pm-scene')).getPropertyValue('--c-texte').trim();
        var constats = await M.mesurerPixels({ ratio: '16:9', flashs: false });
        return { couleurs: couleurs, texte: texte, constats: constats.filter(function (x) { return x.regle === 'contraste-reel'; }) };
      })()`);
      const hex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
      assert.ok(r.couleurs.length >= 20, String(r.couleurs.length));
      assert.deepEqual([...new Set(r.couleurs.map(hex))], [r.texte.toLowerCase()]);
      assert.deepEqual(r.constats, []);
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('crayon : la cire suit M.dessin.traces, masquée par le grain du papier, et l\'export rapide égale l\'export fidèle à 2 % près', { ...SANS, timeout: 240000 }, async () => {
  const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', 'crayon'), textes: 'exemple', valeurChiffre: 1250, types: ['titre', 'chiffre', 'schema'] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; true`);
      const debut = (id) => c.minutage.scenes.find((s) => s.id === id).debut;
      for (const [id, t] of [['titre', debut('titre') + 6.2], ['chiffre', debut('chiffre') + 6.2], ['schema', debut('schema') + 7.5]]) {
        const r = await json(c, `M.seek(${t}).then(function () {
          var sec = document.querySelector('section[data-scene="${id}"]');
          var cv = sec.querySelector('canvas.pm-encre[data-calque="dessus"]');
          var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, pleins = 0, partiels = 0;
          for (var i = 3; i < d.length; i += 4) { if (d[i] > 200) pleins++; else if (d[i] > 0) partiels++; }
          // Le grain : dans la boîte des tracés, des creux sans cire au milieu de la cire.
          var traces = M.dessin.traces('${id}').filter(function (x) { return !x.remplissage && x.part >= 1; });
          return { traces: traces.length, pleins: pleins, partiels: partiels, encreAttr: sec.getAttribute('data-encre'),
            cachees: Array.prototype.every.call(sec.querySelectorAll('.pm-calque path[stroke-width]'), function (x) { return getComputedStyle(x).visibility === 'hidden'; }) };
        })`);
        assert.equal(r.encreAttr, 'style', id);
        assert.ok(r.traces >= 1, `${id} : aucun tracé fini`);
        assert.ok(r.pleins > 50 && r.partiels > 20, `${id} : ${JSON.stringify(r)}`);
        assert.equal(r.cachees, true, `${id} : le SVG peint encore la cire`);
        const e = await deuxVoies(c, t);
        assert.ok(e <= 0.02, `${id}, t = ${t} : ${(100 * e).toFixed(2)} %`);
      }
      // Les traits frémissent (10 Hz), les textes jamais.
      const d = (t) => json(c, `M.seek(${t}).then(function () { return { traits: M.dessin.traces('schema').filter(function (x) { return x.genre === 'fleche' && !/pointe/.test(x.cle); }).map(function (x) { return x.d; }),
        textes: Array.prototype.map.call(document.querySelectorAll('section[data-scene="schema"] [data-texte]'), function (e) { var b = e.getBoundingClientRect(); return [Math.round(b.left * 100), Math.round(b.top * 100)]; }) }; })`);
      const a = await d(debut('schema') + 7.0), b = await d(debut('schema') + 7.15);
      assert.notDeepEqual(b.traits, a.traits);
      assert.deepEqual(b.textes, a.textes);
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('papier-decoupe : ombres portées entre les couches, la feuille soulevée allonge son ombre', { ...SANS, timeout: 240000 }, async () => {
  const dir = miniProjet({ style: 'papier-decoupe', scenes: [
    { id: 'titre', duree: 7, html: scene('papier-decoupe', 'titre'), textes: { etiquette: 'Hygiène', titre: 'Garder la chaîne du froid', sous: 'Les bons gestes, de bout en bout' } },
    { id: 'chiffre', duree: 7, html: scene('papier-decoupe', 'chiffre'), textes: { titre: 'Contrôles par an', unite: '', legende: 'Dans nos entrepôts' } },
  ] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; true`);
      const ombre = (t) => json(c, `M.seek(${t}).then(function () { var cs = getComputedStyle(document.getElementById('bandeau'));
        return { ombre: cs.boxShadow, filtre: cs.filter, decalages: (cs.boxShadow.match(/(-?[\\d.]+)px/g) || []).map(parseFloat) }; })`);
      const a = await ombre(0.6), b = await ombre(5);
      assert.equal(a.filtre, 'none');
      assert.ok(/rgba?\(/.test(a.ombre) && a.decalages.length >= 6, a.ombre);
      // Deux étages d'ombre ; soulevée, chaque décalage vertical et chaque flou grandissent.
      assert.ok(b.decalages[1] > a.decalages[1] && b.decalages[2] > a.decalages[2] && b.decalages[5] > a.decalages[5], `${a.ombre} → ${b.ombre}`);
      // Le volet du chiffre se lève et révèle la feuille : présent au début, parti ensuite.
      const debut = c.minutage.scenes.find((s) => s.id === 'chiffre').debut;
      const volet = (t) => json(c, `M.seek(${t}).then(function () { var v = document.querySelector('section[data-scene="chiffre"] .volet'); return parseFloat(getComputedStyle(v).opacity); })`);
      assert.ok(await volet(debut + 1.2) > 0.9);
      assert.ok(await volet(debut + 5) < 0.01);
      // Les deux voies d'export : mêmes ombres.
      for (const t of [5, debut + 5]) { const e = await deuxVoies(c, t); assert.ok(e <= 0.02, `t = ${t} : ${(100 * e).toFixed(2)} %`); }
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('pictogrammes : une rangée glisse d\'une cellule par temps, et les pictogrammes passent l\'export rapide', { ...SANS, timeout: 240000 }, async () => {
  const dir = miniProjet({ style: 'pictogrammes', scenes: [
    { id: 'titre', duree: 7, html: scene('pictogrammes', 'titre'), textes: { etiquette: 'Hygiène', titre: 'La chaîne du froid', sous: 'Les bons gestes, de bout en bout' } },
  ] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; true`);
      const x = (t) => json(c, `M.seek(${t}).then(function () { var r = document.querySelector('.rangee'), cs = getComputedStyle(r);
        return { x: parseFloat(cs.translate) || 0, cellule: parseFloat(getComputedStyle(document.querySelector('section[data-scene]')).getPropertyValue('--cellule')) * document.querySelector('section[data-scene]').clientHeight / 100,
          masque: cs.maskImage || cs.webkitMaskImage }; })`);
      const a = await x(1.3), b = await x(1.45), m = await x(1.6), d = await x(1.8);
      assert.match(a.masque, /^url\("data:image\/svg\+xml/);
      // Elle tient pendant le temps, glisse au début du suivant, d'une cellule.
      assert.ok(Math.abs(a.x - b.x) < 0.01, `${a.x} ${b.x}`);
      assert.ok(Math.abs(m.x - a.x) > 0.05 * a.cellule, `${m.x} ${a.x}`);
      const pas = Math.abs(((d.x - a.x) % (4 * a.cellule) + 4 * a.cellule) % (4 * a.cellule));
      assert.ok(Math.abs(pas - a.cellule) < 0.02 * a.cellule || Math.abs(pas - 3 * a.cellule) < 0.02 * a.cellule, `${pas} pour une cellule de ${a.cellule}`);
      // Fin du décor : la rangée ne bouge plus.
      assert.equal((await x(6.95)).x, (await x(6.99)).x);
      // Les pictogrammes (masques SVG embarqués) : même image dans les deux voies d'export.
      const e = await deuxVoies(c, 3);
      assert.ok(e <= 0.02, `${(100 * e).toFixed(2)} %`);
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- Hors lot : tableau-noir ----------

test('tableau-noir : marbrure et fenêtre sans couche transformée, même image', { ...SANS, timeout: 240000 }, async () => {
  const css = lire('styles', 'tableau-noir', 'style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const cl of ['marbrure', 'fenetre']) {
    const regle = new RegExp(`\\.${cl} \\{([^}]*)\\}`).exec(css)[1];
    assert.match(regle, /inset: 0;/, cl);
    assert.doesNotMatch(regle, /transform/, cl);
  }
  // L'ancienne façon (couche de 140 % × 140 % et 220 % × 180 %, déplacées par transform), posée par-dessus : même image.
  const ANCIENNE = `.marbrure { inset: -20% !important; transform: translate(var(--x, 0), var(--y, 0)) !important; background:
    radial-gradient(ellipse 38% 30% at 28% 34%, color-mix(in srgb, var(--c-texte) 7%, transparent), transparent 70%),
    radial-gradient(ellipse 34% 40% at 74% 66%, color-mix(in srgb, #000 14%, transparent), transparent 70%),
    radial-gradient(ellipse 22% 18% at 58% 22%, color-mix(in srgb, var(--c-texte) 5%, transparent), transparent 70%) !important; }
  .fenetre { inset: -40% -60% !important; transform: translateX(var(--x, 0)) !important;
    background: linear-gradient(105deg, transparent 36%, rgba(255, 246, 214, 0.12) 44%, rgba(255, 246, 214, 0.16) 48%, rgba(255, 246, 214, 0.05) 54%, transparent 60%) !important; }`;
  const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', 'tableau-noir'), textes: 'exemple', valeurChiffre: 1250, types: ['titre', 'chiffre'] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      for (const t of [2, 6.5, 9]) {
        const nouvelle = PNG.decoder(await c.capturer(t));
        await c.evaluer(`(function () { var s = document.createElement('style'); s.id = 'ancienne'; s.textContent = ${JSON.stringify(ANCIENNE)}; document.head.appendChild(s); return true; })()`);
        const ancienne = PNG.decoder(await c.capturer(t));
        await c.evaluer(`(function () { document.getElementById('ancienne').remove(); return true; })()`);
        const e = ecart(nouvelle, ancienne);
        assert.ok(e <= 0.002, `t = ${t} : ${(100 * e).toFixed(3)} %`);
      }
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
