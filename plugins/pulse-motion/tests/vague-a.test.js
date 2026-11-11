'use strict';
/* Spec Styles et réalisation, jalon J6 « Vague A » (5.10, 5.12) : trois styles livrés (info-sans-son, plan-technique,
 * lancement) et la légende en morceaux (moteur/lettres.js). Le rendu de chaque style dans les quatre formats est vérifié dans
 * le navigateur par styles-livres.test.js, comme pour les six autres.
 * Avec eux, la garde des images témoins de l'export (0.59.0) : deux échecs « image PNG abîmée » du lot exemples de
 * outils/site/medias.js, réussis à la relance ; une image illisible est désormais relue ou recapturée avant de conclure. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../scripts/styles.js');
const F = require('../scripts/lib/fiche-style.js');
const T = require('../scripts/lib/temoin.js');
const L = require('../moteur/lettres.js');
const FF = require('../scripts/lib/ffmpeg.js');
const PNG = require('../scripts/lib/png.js');
const { TYPES } = require('../scripts/lib/contrat.js');
const { controlerLettres } = require('../scripts/lib/controle-scene.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { captureEntiere, CAPTURES_MAX, ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
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
const VAGUE_A = { 'info-sans-son': 'ecrans-annonces', lancement: 'ecrans-annonces', 'plan-technique': 'schemas-donnees' };
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));

/** Image PNG unie ou dégradée de l × h (RVB). */
function image(l, h, f = (x, y) => [x % 256, y % 256, 128]) {
  const donnees = new Uint8Array(l * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) donnees.set(f(x, y), (y * l + x) * 3);
  return PNG.encoder({ largeur: l, hauteur: h, canaux: 3, donnees });
}

// ---------- Les trois styles ----------

test('vague A : info-sans-son, plan-technique, lancement passent contrat, quatre formats et témoin', () => {
  for (const [style, categorie] of Object.entries(VAGUE_A)) {
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
    // Quatre formats : les requêtes de conteneur du carré, du vertical et de la marge des réseaux en 9:16 (le rendu dans
    // chaque format : styles-livres.test.js).
    const css = lire('styles', style, 'style.css');
    for (const q of ['@container (max-aspect-ratio: 5/4)', '@container (orientation: portrait)', '@container (max-aspect-ratio: 2/3)', '@container (max-aspect-ratio: 9/10)']) assert.ok(css.includes(q), `${style} : ${q}`);
    // Témoin : les scènes titre et chiffre aux durées du catalogue, compteur à 1 250.
    const projet = T.projetTemoin({ dossierStyle: dossier });
    const d = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
    assert.deepEqual(d.scenes.map((s) => s.id), ['titre', 'chiffre'], style);
    assert.match(fs.readFileSync(path.join(projet, 'scenes', 'chiffre.html'), 'utf8'), /nombre 0→1250\b/, style);
    fs.rmSync(projet, { recursive: true, force: true });
  }
  // Recommandation : les nouveaux styles dans « aussi », jamais parmi les recommandés (décision S8-9).
  const reco = JSON.parse(lire('references', 'styles', 'recommandation.json'));
  for (const style of Object.keys(VAGUE_A)) {
    assert.ok(Object.values(reco).some((r) => r.aussi.includes(style)), style);
    assert.ok(!Object.values(reco).some((r) => r.recommandes.includes(style) || r.contraste === style), style);
  }
});

test('vague A : images A et B du témoin rendues par le plugin', { ...SANS, timeout: 600000 }, async () => {
  const sortie = dossierTemporaire('pm-vague-a-');
  for (const style of Object.keys(VAGUE_A)) {
    const r = await T.imagesTemoin({ dossierStyle: path.join(RACINE, 'styles', style), sortie, prefixe: `${style}-`, navigateur });
    assert.equal(r.ok, true, `${style} : ${r.message}`);
    const [a, b] = ['A', 'B'].map((k) => fs.readFileSync(r.images[k]));
    for (const png of [a, b]) {
      assert.equal(PNG.verifierPNG(png), null, style);
      const img = PNG.decoder(png);
      // Une image qui montre quelque chose : au moins deux teintes bien distinctes.
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
  for (const style of Object.keys(VAGUE_A)) {
    const p = poids(style);
    assert.ok(p - reference <= 250 * 1024, `${style} : ${Math.round((p - reference) / 1024)} Ko de plus`);
  }
});

test('styles livrés : aucun three.js, aucun WebGL hors shaders, aucune ressource en ligne', () => {
  for (const style of fs.readdirSync(path.join(RACINE, 'styles'))) {
    const dossier = path.join(RACINE, 'styles', style);
    for (const f of fs.readdirSync(dossier, { recursive: true }).filter((x) => /\.(html|css|json)$/.test(x))) {
      const t = fs.readFileSync(path.join(dossier, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      assert.doesNotMatch(t, /three(\.module)?\.js|THREE\.|webgl|getContext\(/i, `${style}/${f}`);
      assert.doesNotMatch(t, /@import|url\(\s*["']?(https?:)?\/\/|src=["'](https?:)?\/\//i, `${style}/${f} : ressource en ligne`);
    }
  }
});

test('styles livrés : fusions seulement dans un canevas (aucun mix-blend-mode)', () => {
  for (const style of fs.readdirSync(path.join(RACINE, 'styles'))) {
    const dossier = path.join(RACINE, 'styles', style);
    for (const f of fs.readdirSync(dossier, { recursive: true }).filter((x) => /\.(html|css)$/.test(x))) {
      const t = fs.readFileSync(path.join(dossier, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      assert.doesNotMatch(t, /mix-blend-mode|background-blend-mode|backdrop-filter|filter\s*:[^;]*url\(/, `${style}/${f}`);
    }
  }
});

// ---------- Légende en morceaux ----------

test('lettres : data-morceaux et data-mot-cle, texte du déroulé inchangé', () => {
  const mots = 'Garder la chaîne du froid sans rupture'.split(' ');
  // Coupe aux limites de mots, en morceaux de longueur proche : la plus longue est la plus courte possible.
  const longueurs = (tailles) => { let i = 0; return tailles.map((t) => { const m = mots.slice(i, i + t); i += t; return m.join(' ').length; }); };
  for (const n of [2, 3]) {
    const tailles = L.couperMorceaux(mots, n);
    assert.equal(tailles.length, n);
    assert.equal(tailles.reduce((a, b) => a + b, 0), mots.length);
    assert.ok(tailles.every((t) => t >= 1));
    let meilleur = Infinity;
    const essayer = (reste, k, acc) => {
      if (k === 1) { meilleur = Math.min(meilleur, Math.max(...longueurs([...acc, reste]))); return; }
      for (let t = 1; t <= reste - k + 1; t++) essayer(reste - t, k - 1, [...acc, t]);
    };
    essayer(mots.length, n, []);
    assert.equal(Math.max(...longueurs(tailles)), meilleur, `n = ${n}`);
  }
  assert.deepEqual(L.couperMorceaux(['Froid', 'sûr'], 3), [1, 1], 'moins de mots que de morceaux');
  // Mot-clé : sans accents ni casse, ponctuation autour ignorée ; « auto » : le mot le plus long.
  assert.equal(L.motCleDe(['Garder', 'la', 'chaîne', 'du', 'froid.'], 'FROID'), 4);
  assert.equal(L.motCleDe(['Garder', 'la', 'chaîne'], 'chaine'), 2);
  assert.equal(L.motCleDe(['Le', 'réfrigérateur', 'ferme'], 'auto'), 1);
  assert.equal(L.motCleDe(['Le', 'froid'], 'chaud'), -1);
  assert.deepEqual([L.MORCEAUX, L.PAS_MORCEAUX], [['2', '3'], 0.12]);
  // Le contrôle refuse un nombre de morceaux inconnu ; une légende valide passe.
  const probs = (html) => { const p = []; controlerLettres(extraireScene(html).decoupes, 's', p); return p; };
  assert.deepEqual(probs('<h1 data-texte="titre" data-morceaux="3" data-mot-cle="auto" data-start="0"></h1>'), []);
  assert.match(probs('<h1 data-texte="titre" data-morceaux="4" data-start="0"></h1>')[0].message, /2 ou 3 morceaux/);
  // Aucune syntaxe dans le texte : les scènes du style posent les attributs, le déroulé garde ses textes.
  for (const f of fs.readdirSync(path.join(RACINE, 'styles', 'info-sans-son', 'scenes'))) {
    const html = lire('styles', 'info-sans-son', 'scenes', f);
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /[|{}]/, f);
  }
});

test('info-sans-son : un seul mot-clé par légende', () => {
  const p = [];
  controlerLettres(extraireScene('<h1 data-texte="titre" data-morceaux="2" data-mot-cle="chaîne froid" data-start="0"></h1>').decoupes, 's', p);
  assert.equal(p.length, 1);
  assert.match(p[0].message, /un seul mot-clé par légende/);
  // Dans les scènes du style : un mot-clé par élément au plus, d'un seul mot (ou « auto »).
  for (const f of fs.readdirSync(path.join(RACINE, 'styles', 'info-sans-son', 'scenes'))) {
    const html = lire('styles', 'info-sans-son', 'scenes', f);
    for (const [, v] of html.matchAll(/data-mot-cle="([^"]*)"/g)) assert.match(v, /^\S+$/, f);
    for (const balise of html.match(/<[a-z][^>]*>/g) || []) assert.ok((balise.match(/data-mot-cle=/g) || []).length <= 1, f);
  }
  // Le moteur ne pose le bloc que sur la première occurrence (voir l'essai dans le navigateur).
  assert.equal(L.motCleDe(['le', 'froid,', 'toujours', 'le', 'froid'], 'froid'), 1);
});

test('lettres : la légende découpée dans la page garde son texte, un seul bloc sur le mot-clé', { ...SANS, timeout: 180000 }, async () => {
  const texte = 'Le froid, toujours le froid';
  const dir = miniProjet({ style: 'info-sans-son', scenes: [
    { id: 's', duree: 4, textes: { titre: texte, sous: 'Sans rupture' }, html: '<h1 id="t" class="legende" data-texte="titre" data-morceaux="3" data-mot-cle="FROID" data-start="0.2" data-dur="0.5"></h1>\n<p id="u" class="texte" data-texte="sous" data-morceaux="2" data-mot-cle="absent" data-start="1" data-dur="0.4"></p>' },
  ] });
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'));
  const { html } = assembler({ dossier: dir, ecrire: false });
  assert.ok(fs.readFileSync(path.join(dir, 'deroule.json')).equals(avant), 'déroulé inchangé');
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, html);
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 });
  try {
    const r = await json(c, `M.seek(1.5).then(function () {
      var el = document.getElementById('t');
      var cle = el.querySelector('.pm-mot-cle');
      return { aria: el.getAttribute('aria-label'), texte: el.textContent, n: el.style.getPropertyValue('--pm-n'),
        mots: Array.prototype.map.call(el.querySelectorAll('.pm-mot'), function (m) { return [m.textContent, m.style.getPropertyValue('--pm-i'), m.classList.contains('pm-mot-cle')]; }),
        bloc: cle && getComputedStyle(cle, '::before').backgroundColor,
        erreurs: M.erreurs.map(function (e) { return e.regle + ' ' + e.message; }) };
    })`);
    assert.equal(r.aria, texte);
    assert.equal(r.texte, texte, 'texte affiché identique au déroulé');
    assert.equal(r.n, '3');
    assert.deepEqual(r.mots.map((m) => m[0]), texte.split(' '));
    const rangs = r.mots.map((m) => Number(m[1]));
    assert.deepEqual([...new Set(rangs)], [0, 1, 2], 'trois morceaux dans l\'ordre');
    assert.deepEqual(r.mots.filter((m) => m[2]).map((m) => m[0]), ['froid,'], 'un seul bloc, sur la première occurrence');
    assert.notEqual(r.bloc, 'rgba(0, 0, 0, 0)', 'bloc d\'accent posé');
    // Mot-clé absent du texte : signalé par le moteur, pas de bloc inventé.
    assert.ok(r.erreurs.some((e) => /^lettres-invalide .*data-mot-cle « absent » absent du texte/.test(e)), r.erreurs.join('\n'));
  } finally { await c.fermer(); }
});

// ---------- Image PNG abîmée à l'export ----------

test('export : une image PNG coupée, abîmée ou sans fin est reconnue avant d\'être décodée', () => {
  const png = image(40, 30);
  assert.equal(PNG.verifierPNG(png), null);
  assert.equal(PNG.verifierPNG(png, { sommes: false }), null);
  assert.match(PNG.verifierPNG(png.subarray(0, png.length - 20)), /incomplète|coupé/);
  assert.match(PNG.verifierPNG(png.subarray(0, png.length - 12)), /fin de l'image absente/);
  const abimee = Buffer.from(png);
  abimee[60] ^= 0x10;
  assert.match(PNG.verifierPNG(abimee), /somme de contrôle fausse/);
  assert.equal(PNG.verifierPNG(abimee, { sommes: false }), null, 'sans les sommes : la structure seule');
  assert.match(PNG.verifierPNG(Buffer.concat([png, Buffer.from('xx')])), /après la fin/);
  assert.match(PNG.verifierPNG(Buffer.from('pas une image')), /pas une image PNG/);
  assert.equal(PNG.verifierPNG(null), 'ce n\'est pas une image PNG');
  assert.match(FF.imageIllisible(png.subarray(0, 50)), /coupé|incomplète/);
  assert.equal(FF.imageIllisible(png), null);
  // Hors du logo, le décodeur ne conseille pas de « réenregistrer le logo ».
  const { decoderPNG } = require('../scripts/logo.js');
  assert.throws(() => decoderPNG(Buffer.from('pas une image'), { logo: false }), (e) => !/logo/.test(e.message));
});

test('export : une image témoin illisible est relue ou recapturée, l\'export ne s\'arrête pas', async () => {
  const bonne = image(40, 30);
  const coupee = bonne.subarray(0, bonne.length - 30);
  // Image de la vidéo : relue tant qu'elle est illisible, trois lectures au plus.
  let lectures = 0;
  const relire = async () => { lectures++; return lectures < 2 ? coupee : bonne; };
  assert.equal(await FF.ecartTemoin(relire, bonne, coupee), 0);
  assert.equal(lectures, 2, 'la première lecture (déjà faite) était coupée : relue deux fois');
  lectures = 0;
  assert.equal(await FF.ecartTemoin(relire, bonne), 0);
  await assert.rejects(FF.ecartTemoin(async () => coupee, bonne), new RegExp(`reste illisible après ${FF.LECTURES_MAX} lectures`));
  // Captures témoins : une capture abîmée est refaite avant de servir de référence.
  const temoins = new Map([[0, bonne], [12, coupee], [24, null]]);
  const refaites = [];
  await FF.verifierTemoins(temoins, async (n) => { refaites.push(n); return bonne; });
  assert.deepEqual(refaites, [12]);
  assert.ok(temoins.get(12).equals(bonne));
  assert.equal(temoins.get(24), null, 'une image absente reste absente');
  await assert.rejects(FF.verifierTemoins(new Map([[3, coupee]]), async () => coupee), /capture de l'image 4 reste illisible/);
  // Capture de la page : refaite au même instant tant que sa structure est incomplète.
  let prises = 0;
  assert.ok((await captureEntiere(async () => (++prises < 3 ? coupee : bonne), 1.5)).equals(bonne));
  assert.equal(prises, 3);
  await assert.rejects(captureEntiere(async () => coupee, 2.25), new RegExp(`instant 2.25 s est abîmée .*même refaite ${CAPTURES_MAX - 1} fois`));
  // L'export s'en sert : capture, témoins avant la comparaison, images de la vidéo (vidéo entière, extrait, fond transparent).
  const exp = lire('scripts', 'export-fidele.js');
  assert.match(exp, /F\.verifierTemoins\(temoins, \(n\) => imageA\(pages\[0\], n\)\)/);
  assert.equal((exp.match(/await F\.ecartTemoin\(lire, capturee/g) || []).length, 2);
  assert.match(lire('scripts', 'lib', 'export-transparent.js'), /await F\.ecartTemoin\(lire, capturee\)/);
  assert.match(lire('scripts', 'lib', 'capture-fidele.js'), /captureEntiere\(\(\) => page\.capturer\(\{ profil \}\), t\)/);
});
