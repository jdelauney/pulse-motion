'use strict';
/* Spec Styles et réalisation, jalon J10 « Mode d'emploi » (5.10, 5.16) : le vingtième style, `mode-d-emploi` (aplats des
 * années 50 décalés de leur trait cassé, module aplats ; animation limitée), le dessin `guide` de la bibliothèque, la vie
 * « mains » et la cadence image par image des personnages, la place du personnage réglée par la feuille ; et, à la demande de
 * l'auteur (2026-11-11), les polices manuscrites de crayon, tableau-blanc, recit-donnees, carnet et tableau-noir, et l'accent
 * « encre seulement » du riso. Clôture de S8 : vingt styles, six catégories. Le rendu de chaque style dans les quatre formats
 * est vérifié dans le navigateur par styles-livres.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const S = require('../scripts/styles.js');
const F = require('../scripts/lib/fiche-style.js');
const T = require('../scripts/lib/temoin.js');
const PNG = require('../scripts/lib/png.js');
const P = require('../scripts/lib/personnages.js');
const SQ = require('../moteur/squelette.js');
const PA = require('../moteur/personnages/partition.js');
const { TYPES, CATEGORIES } = require('../scripts/lib/contrat.js');
const { chartePour } = require('../scripts/lib/fusion-charte.js');
const { controler, accentEncreSurTexte } = require('../scripts/controler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { assembler } = require('../scripts/assembler.js');
const { projetEssai } = require('../scripts/lib/projet-essai.js');
const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');
const { projetCatalogue } = require('./aide/catalogue.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const RACINE = path.join(__dirname, '..');
const DEPOT = path.join(RACINE, '..', '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const identite = (s) => JSON.parse(lire('styles', s, 'identite.json'));
const charte = (s) => JSON.parse(lire('styles', s, 'charte.json'));
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const STYLE = 'mode-d-emploi';
const DOSSIER = path.join(RACINE, 'styles', STYLE);
const CAPTURE = lire('moteur', 'capture.js');
const LG = 640, HT = 360;
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));
const scene = (type) => lire('styles', STYLE, 'scenes', `${type}.html`);
const lu = P.lire(null);
const bib = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions };

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
const rapide = async (c) => PNG.decoder(Buffer.from(await c.evaluer(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${LG}; canvas.height = ${HT};
  await M.capturer(canvas.getContext('2d'), ${LG}, ${HT});
  return canvas.toDataURL('image/png').split(',')[1];
})()`), 'base64'));

// ---------- Le style ----------

test('mode-d-emploi : contrat, quatre formats, témoin', () => {
  const v = S.verifierStyle(DOSSIER);
  assert.deepEqual([v.erreurs, v.avertissements], [[], []]);
  assert.deepEqual(JSON.parse(lire('styles', STYLE, 'catalogue.json')).scenes.map((s) => s.nom).sort(), Object.keys(TYPES).sort());
  const id = identite(STYLE);
  assert.equal(id.categorie, 'anime');
  assert.deepEqual(id.modules, ['aplats']);
  assert.deepEqual(id.provenance, [{ depot: 'lemo-opuscar', style: 'midcentury-toon', licence: 'MIT' }]);
  assert.deepEqual(F.verifierFiche(lire('references', 'styles', `${STYLE}.md`), { dossierStyle: DOSSIER, identite: id }), []);
  // Son (5.16) : étape → ding, réussite → succes ; ambiances acoustique et mecanique.
  assert.deepEqual([id.son.ambiances, id.son.bruitages.point, id.son.fort], [['acoustique', 'mecanique'], 'ding', 'succes']);
  // Polices : copies à l'identique de polices déjà livrées (aucun téléchargement pour ce style).
  const licences = lire('styles', STYLE, 'polices', 'LICENCES.md');
  assert.match(licences, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(licences, /aucune police téléchargée pour ce style/);
  for (const f of fs.readdirSync(path.join(DOSSIER, 'polices')).filter((x) => x.endsWith('.woff2'))) {
    const octets = fs.readFileSync(path.join(DOSSIER, 'polices', f));
    assert.ok(fs.readdirSync(path.join(RACINE, 'styles')).some((s) => s !== STYLE && fs.existsSync(path.join(RACINE, 'styles', s, 'polices', f))
      && fs.readFileSync(path.join(RACINE, 'styles', s, 'polices', f)).equals(octets)), f);
  }
  // Quatre formats ; export rapide : ni filtre, ni fusion CSS.
  const css = lire('styles', STYLE, 'style.css');
  for (const q of ['@container (max-aspect-ratio: 5/4)', '@container (orientation: portrait)', '@container (max-aspect-ratio: 2/3)', '@container (max-aspect-ratio: 9/10)']) assert.ok(css.includes(q), q);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /(^|[\s;{])filter\s*:|mix-blend-mode|backdrop-filter/);
  // Image par image : les entrées en saccade (#013), le décor par crans ; la vie et la cadence du guide posées par la feuille.
  assert.match(css, /--pm-images: 7;/);
  assert.match(css, /\.guide \{[^}]*--pm-perso-vie: mains;[^}]*--pm-perso-cadence: 12;/);
  assert.match(css, /round\(down, var\(--x, 0px\)/);
  for (const type of Object.keys(TYPES)) assert.match(scene(type), /pm-m-saccade/, type);
  // Le guide dans le titre et l'étape, placé par la feuille (ni data-x, ni data-taille, ni data-sol).
  for (const type of ['titre', 'etape']) {
    const m = /<div id="[a-z]+" class="guide" data-personnage="guide"([^>]*)>/.exec(scene(type));
    assert.ok(m, type);
    assert.doesNotMatch(m[1], /data-(x|sol|taille|vie)=/, type);
  }
  // Témoin : titre et chiffre, compteur à 1 250.
  const projet = T.projetTemoin({ dossierStyle: DOSSIER });
  const d = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
  assert.deepEqual(d.scenes.map((s) => s.id), ['titre', 'chiffre']);
  assert.match(fs.readFileSync(path.join(projet, 'scenes', 'chiffre.html'), 'utf8'), /nombre 0→1250\b/);
  fs.rmSync(projet, { recursive: true, force: true });
  // Recommandation : dans « aussi » (formation, produit), jamais parmi les recommandés ; trouvé par les mots de la personne.
  const reco = JSON.parse(lire('references', 'styles', 'recommandation.json'));
  assert.ok(reco.formation.aussi.includes(STYLE) && reco.produit.aussi.includes(STYLE));
  assert.ok(!Object.values(reco).some((r) => r.recommandes.includes(STYLE) || r.contraste === STYLE));
  assert.equal(S.chercherStyles('façon mode d\'emploi des années 50')[0].style, STYLE);
  assert.equal(S.chercherStyles('un film pédagogique rétro')[0].style, STYLE);
  // Contrôles au maximum de texte : aucun problème.
  assert.deepEqual(controler({ dossier: projetCatalogue(STYLE), ecrire: false }).problemes, []);
});

test('mode-d-emploi : images A et B du témoin rendues par le plugin', { ...SANS, timeout: 300000 }, async () => {
  const sortie = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-mode-emploi-'));
  try {
    for (const ratio of ['16:9', '9:16']) {
      const r = await T.imagesTemoin({ dossierStyle: DOSSIER, sortie, prefixe: `${ratio.replace(':', 'x')}-`, ratio, navigateur });
      assert.equal(r.ok, true, r.message);
      const [a, b] = ['A', 'B'].map((k) => fs.readFileSync(r.images[k]));
      for (const png of [a, b]) {
        assert.equal(PNG.verifierPNG(png), null);
        const img = PNG.decoder(png);
        let min = 255, max = 0;
        for (let i = 0; i < img.donnees.length; i += img.canaux * 97) { const l = img.donnees[i]; min = Math.min(min, l); max = Math.max(max, l); }
        assert.ok(max - min > 80, `${ratio} : image presque unie`);
      }
      assert.ok(!a.equals(b), `${ratio} : A et B identiques`);
    }
  } finally { fs.rmSync(sortie, { recursive: true, force: true }); }
});

test('poids : vidéo témoin de 60 s au plus 250 Ko au-dessus de clair-pedagogique (mode-d-emploi)', () => {
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
  for (const style of [STYLE, 'crayon', 'tableau-blanc', 'recit-donnees', 'carnet', 'tableau-noir']) {
    const p = poids(style);
    assert.ok(p - reference <= 250 * 1024, `${style} : ${Math.round((p - reference) / 1024)} Ko de plus`);
  }
});

test('assembler : module d\'un style inclus seulement si le style le déclare (aplats)', () => {
  const assemble = (style, types) => {
    const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', style), textes: 'exemple', types });
    try { return assembler({ dossier: dir, ecrire: false }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const module = /M\.aplats\s*=/, feuille = /svg\.pm-aplat-trait \{/;
  const m = assemble(STYLE, ['titre', 'liste']);
  assert.match(m.moteur, module);
  assert.match(m.html, feuille);
  // Il ne tire pas le calque de dessin : sans flèche ni annotation, pas de groupe « dessin ».
  assert.ok(!m.groupes.includes('dessin'), m.groupes.join(', '));
  assert.ok(m.groupes.includes('personnages'));
  for (const style of ['clair-pedagogique', 'riso', 'pictogrammes']) {
    const a = assemble(style, ['titre', 'liste']);
    assert.doesNotMatch(a.moteur, module, style);
    assert.doesNotMatch(a.html, feuille, style);
  }
  for (const f of ['aplats.js', 'aplats.css']) {
    const code = lire('moteur', 'medium', f);
    assert.ok(Buffer.byteLength(code) <= 20 * 1024, `${f} : ${Buffer.byteLength(code)} o`);
    assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random\(/, f);
  }
});

// ---------- Le guide et la vie « mains » ----------

test('mode-d-emploi : personnage dessiné du plugin, mains seules en mouvement au repos', () => {
  // Le dessin « guide » : bibliothèque du plugin, pièces pleines, valide, couleur décalée de son trait cassé.
  const d = lu.dessins.guide;
  assert.ok(d, 'dessin guide');
  assert.equal(d.maniere, 'pieces');
  assert.deepEqual(P.valider('dessin', d, Object.assign({ nom: 'guide' }, P.contexteDe(lu))), []);
  for (const [n, vues] of Object.entries(d.pieces)) for (const [v, svg] of Object.entries(vues)) {
    assert.match(svg, /^<g transform='translate\(2\.6 2\)'>/, `${n} ${v} : calque de couleur décalé`);
    assert.match(svg, /stroke-dasharray='[\d. ]+'/, `${n} ${v} : trait cassé`);
  }
  // L'assemblage accepte data-vie="mains" (et refuse une valeur inconnue en la citant).
  assert.deepEqual(preparerPersonnages('<section><div data-personnage="guide" data-vie="mains"></div></section>', { scene: 's', lu }).erreurs, []);
  assert.match(preparerPersonnages('<section><div data-personnage="guide" data-vie="bras"></div></section>', { scene: 's', lu }).erreurs[0].message, /pleine, sobre, mains ou aucune/);
  // Au repos, puis dans une pose tenue : seuls les bras bougent (ampleur doublée), le reste du corps est immobile ; le
  // clignement reste. En vie pleine, le torse et la tête bougent aussi.
  const gab = SQ.completerGabarit(P.gabaritDe(d, lu));
  const BRAS = ['brasAvant', 'brasArriere', 'avantBrasAvant', 'avantBrasArriere'];
  const angles = SQ.NOMS.os.filter((k) => k !== 'bassinY');
  const etendue = (vie, actions, de, a) => {
    const part = { x0: 20, vue0: 40, vie, sel: 'titre/guide', scene: { debut: 0, fin: 20 }, largeur: 1600, hauteur: 900, echelle: 1, actions };
    const bas = {}, haut = {};
    let paupieres = 1;
    for (let t = de; t <= a; t += 1 / 60) {
      const p = PA.etatAuTemps(part, t, bib, gab).pose;
      for (const k of angles) { const x = typeof p[k] === 'number' ? p[k] : SQ.REPOS[k]; bas[k] = Math.min(bas[k] ?? x, x); haut[k] = Math.max(haut[k] ?? x, x); }
      paupieres = Math.min(paupieres, p.paupieres ?? 1);
    }
    return { e: Object.fromEntries(angles.map((k) => [k, haut[k] - bas[k]])), paupieres };
  };
  for (const [quoi, actions, de, a] of [['repos', [], 0.5, 9.5], ['pose tenue', [{ type: 'pose', pose: 'montrer', debut: 0.5, fin: 12 }], 1.5, 11.5]]) {
    const { e, paupieres } = etendue('mains', actions, de, a);
    for (const k of angles) if (!BRAS.includes(k)) assert.ok(e[k] < 1e-6, `${quoi} : ${k} bouge de ${e[k]}°`);
    assert.ok(BRAS.some((k) => e[k] > 4), `${quoi} : les bras ne bougent pas (${BRAS.map((k) => e[k].toFixed(2)).join(', ')})`);
    assert.ok(paupieres < 0.5, `${quoi} : le guide ne cligne plus`);
    const pleine = etendue('pleine', actions, de, a).e;
    assert.ok(pleine.torseIncl > 0.5 || pleine.teteTourne > 0.5, `${quoi} : vie pleine sans mouvement du corps`);
  }
});

test('mode-d-emploi : le guide vit à 12 i/s, placé par la feuille, et les aplats ont leur trait cassé à graine', { ...SANS, timeout: 240000 }, async () => {
  const dir = projetEssai({ dossierStyle: DOSSIER, textes: 'exemple', valeurChiffre: 1250, types: ['titre', 'chiffre', 'etape'] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; true`);
      const debut = (id) => c.minutage.scenes.find((s) => s.id === id).debut;
      const etat = (id, t) => json(c, `M.seek(${t}).then(function () {
        var sec = document.querySelector('section[data-scene="${id}"]'), div = sec.querySelector('[data-personnage]');
        var cs = getComputedStyle(sec);
        var aplats = Array.prototype.map.call(sec.querySelectorAll('[data-aplat]'), function (el, i) {
          var r = el.querySelector(':scope > svg.pm-aplat-trait > rect, :scope > svg.pm-aplat-trait > ellipse');
          return { id: el.id || i, trait: !!r, tirets: el.style.getPropertyValue('--pm-tirets'), attendu: M.aplats.tirets('${id}/' + (el.id || i)).motif,
            visible: r ? getComputedStyle(r).strokeDasharray !== 'none' : false };
        });
        var pieces = div ? Array.prototype.map.call(div.querySelectorAll('svg g[transform]'), function (g) { return g.getAttribute('transform'); }).join('|') : null;
        return { aplats: aplats, repere: [cs.getPropertyValue('--pm-repere-x'), cs.getPropertyValue('--pm-repere-y')].map(parseFloat), attendu: M.aplats.repere('${id}'),
          pieces: pieces, vie: div ? M.personnages.releve(div, ${t}, ${t}, 1).vie : null,
          x: div ? M.personnages.pose(div, ${t}).x / M.personnages.W : null, hauteur: sec.clientHeight };
      })`);
      // Les aplats : chacun son trait, ses tirets tirés de la graine de la scène et de l'élément ; le repérage de la scène de
      // 0,3 à 0,6 cqh, le même pour tous ses aplats.
      for (const id of ['titre', 'chiffre', 'etape']) {
        const e = await etat(id, debut(id) + 3);
        assert.ok(e.aplats.length >= 2, id);
        for (const a of e.aplats) { assert.ok(a.trait && a.visible, `${id} ${a.id}`); assert.equal(a.tirets, a.attendu, `${id} ${a.id}`); }
        const r = Math.hypot(e.repere[0], e.repere[1]);
        assert.ok(r >= 0.299 && r <= 0.601, `${id} : ${r}`);
        assert.deepEqual(e.repere.map((v) => Math.round(v * 100)), e.attendu.map((v) => Math.round(v * 100)));
      }
      // Le guide : vie « mains » et place lues dans la feuille (16:9 : x = 15 % de la largeur) ; rendu image par image.
      const t0 = debut('etape') + 4 + 0.01;
      const a = await etat('etape', t0), b = await etat('etape', t0 + 0.03), d = await etat('etape', t0 + 1 / 12 + 0.01);
      assert.equal(a.vie, 'mains');
      assert.ok(Math.abs(a.x - 0.15) < 0.01, String(a.x));
      assert.equal(b.pieces, a.pieces, 'dans un même 1/12 s, la même image');
      assert.notEqual(d.pieces, a.pieces, 'l\'image suivante bouge');
      // Les deux voies d'export donnent la même image (aplats, trait cassé et guide).
      for (const t of [debut('titre') + 5, debut('etape') + 5]) {
        const f = PNG.decoder(await c.capturer(t));
        await c.evaluer(`M.seek(${t})`);
        const e = ecart(f, await rapide(c));
        assert.ok(e <= 0.02, `t = ${t} : ${(100 * e).toFixed(2)} %`);
      }
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- Polices manuscrites (accord de l'auteur, 2026-11-11) ----------

test('polices manuscrites : Patrick Hand, Kalam et Caveat, OFL, sources et empreintes, notices', () => {
  const ATTENDU = {
    crayon: { roles: { titres: 'Patrick Hand' }, fichiers: ['Patrick Hand-400.woff2'], retirees: ['Fredoka-500.woff2', 'Fredoka-600.woff2'] },
    'tableau-blanc': { roles: { titres: 'Kalam', texte: 'Kalam' }, fichiers: ['Kalam-400.woff2'], retirees: ['Fredoka-500.woff2', 'Fredoka-600.woff2'] },
    'recit-donnees': { roles: { notes: 'Kalam' }, fichiers: ['Kalam-400.woff2'], retirees: [] },
    carnet: { roles: { titres: 'Caveat' }, fichiers: ['Caveat-700.woff2'], retirees: ['Fraunces-400-italic.woff2'] },
    // Cabin Sketch, d'abord retenue, faisait échouer la capture (polices embarquées dans chaque image) ; Caveat, penchée, demande
    // un découpage de l'écriture plus large qui ralentit trop la capture des titres écrits lettre à lettre : Kalam, droite.
    'tableau-noir': { roles: { titres: 'Kalam' }, fichiers: ['Kalam-400.woff2'], retirees: ['Sora-600.woff2', 'Cabin Sketch-700.woff2', 'Caveat-700.woff2'] },
  };
  const notices = fs.readFileSync(path.join(DEPOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(notices, lire('THIRD-PARTY-NOTICES.md'));
  for (const [style, a] of Object.entries(ATTENDU)) {
    const k = charte(style);
    for (const [role, famille] of Object.entries(a.roles)) assert.equal(k.polices[role], famille, `${style} ${role}`);
    const licences = lire('styles', style, 'polices', 'LICENCES.md');
    assert.match(licences, /SIL OPEN FONT LICENSE Version 1\.1/, style);
    for (const f of a.fichiers) {
      // Fichier du style, ou des polices partagées du plugin (spec S11, 5.1 : Kalam est partagée).
      const famille = f.replace(/-\d{3}\.woff2$/, '');
      const fichier = require('../scripts/lib/police.js').fichiersPoliceStyle(famille, path.join(RACINE, 'styles', style)).find((x) => path.basename(x.fichier) === f);
      assert.ok(fichier, `${style} : ${f} introuvable`);
      const octets = fs.readFileSync(fichier.fichier);
      assert.equal(octets.toString('latin1', 0, 4), 'wOF2', f);
      const sha = crypto.createHash('sha256').update(octets).digest('hex');
      const ligne = licences.split('\n').find((l) => l.startsWith(`- ${f} : `));
      assert.ok(ligne, `${style} : ${f} sans sa ligne de source`);
      assert.match(ligne, new RegExp(`^- ${f} : https://fonts\\.bunny\\.net/[a-z-]+/files/[a-z-]+-latin-\\d{3}-normal\\.woff2 \\(sha256 ${sha}\\)$`), `${style} : ${f}`);
    }
    assert.match(licences, /avec l'accord de l'auteur du plugin, le 2026-11-11/, style);
    for (const f of a.retirees) assert.ok(!fs.existsSync(path.join(RACINE, 'styles', style, 'polices', f)), `${style} : ${f} encore là`);
    assert.deepEqual(S.verifierStyle(path.join(RACINE, 'styles', style)).erreurs, [], style);
  }
  for (const famille of ['Patrick Hand', 'Kalam', 'Caveat']) assert.match(notices, new RegExp(`${famille} \\d{3}`), famille);
  assert.doesNotMatch(notices, /Cabin Sketch/);
  // Les notes de recit-donnees passent par le rôle « notes » ; l'écriture lettre à lettre laisse dépasser les écritures penchées.
  assert.match(lire('styles', 'recit-donnees', 'style.css'), /\.note \{[^}]*var\(--f-notes, var\(--f-texte\)\)/);
  // Marges par défaut inchangées (25 % et 8 % : même image, même vitesse de capture) ; carnet (Caveat, penchée) les élargit.
  assert.match(lire('moteur', 'base.css'), /var\(--pm-ecrit-marge-v, 25%\)[^}]*var\(--pm-ecrit-marge-h, 8%\)/);
  assert.match(lire('styles', 'carnet', 'style.css'), /--pm-ecrit-marge-v: 100%; --pm-ecrit-marge-h: 100%;/);
  // Les styles copiés plus tard ne prennent plus Fredoka ni Sora par erreur.
  assert.doesNotMatch(lire('styles', 'crayon', 'style.css'), /font: 600 [^;]*var\(--f-titres\)/);
});

// ---------- Riso : l'accent « encre seulement » ----------

test('riso : accent « encre seulement » rose vif, hors du contrôle de contraste, erreur s\'il colore un texte', () => {
  const k = charte('riso').couleurs;
  assert.equal(k['accent-encre'], '#f0508c');
  // Les encres le prennent (aplats du module riso, tracés d'accent) ; le texte reste dans l'encre la plus sombre.
  assert.match(lire('moteur', 'medium', 'riso.js'), /accent: '--c-accent-encre'/);
  assert.match(lire('styles', 'riso', 'style.css'), /var\(--c-accent-encre, var\(--c-accent\)\)/);
  for (const f of fs.readdirSync(path.join(RACINE, 'styles', 'riso', 'scenes'))) assert.doesNotMatch(lire('styles', 'riso', 'scenes', f), /data-couleur="accent"/, f);
  assert.deepEqual(accentEncreSurTexte(lire('styles', 'riso', 'style.css'), 'riso'), []);
  // Son contraste n'est pas jugé (il n'est jamais lu) : la vidéo du catalogue riso n'a aucun problème.
  assert.deepEqual(controler({ dossier: projetCatalogue('riso'), ecrire: false }).problemes, []);
  // La règle : une couleur de texte qui le cite est une erreur ; un fond, un trait ou un remplissage, non.
  const e = accentEncreSurTexte('.a { background: var(--c-accent-encre); fill: var(--c-accent-encre); } .b { color: var(--c-accent-encre); }', 'Style « x »');
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].regle, e[0].gravite], ['accent-encre-texte', 'erreur']);
  assert.match(e[0].message, /colore un texte \(color: var\(--c-accent-encre\)\)/);
  assert.equal(accentEncreSurTexte('<p style="color: color-mix(in srgb, var(--c-accent-encre) 80%, #000)">x</p>', 'Scène « s »', 's')[0].scene, 's');
  // Dans une vraie vidéo : une scène qui écrit un texte dans l'accent encre est signalée en erreur.
  const dir = projetCatalogue('riso');
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  const s0 = d.scenes[0];
  const f = path.join(dir, s0.fichier);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/<h1 /, '<h1 style="color: var(--c-accent-encre)" '), 'utf8');
  const p = controler({ dossier: dir, ecrire: false }).problemes.filter((x) => x.regle === 'accent-encre-texte');
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.equal(p[0].scene, s0.id);
  assert.match(lire('references', 'controles.md'), /\| `accent-encre-texte` \|[^\n]*\| \*\*erreur\*\* \|/);
  // La charte de la personne : son accent remplace aussi l'accent encre du style, sauf si elle donne le sien.
  const avec = (couleurs) => chartePour({ charte: { couleurs } }, path.join(RACINE, 'styles', 'riso'), null).couleurs['accent-encre'];
  assert.equal(avec({}), '#f0508c');
  assert.equal(avec({ accent: '#123456' }), '#123456');
  assert.equal(avec({ accent: '#123456', 'accent-encre': '#ff00aa' }), '#ff00aa');
});

// ---------- Clôture de S8 ----------

test('S8 : vingt styles livrés, six catégories, liste par genre dans son budget', () => {
  const styles = fs.readdirSync(path.join(RACINE, 'styles')).sort();
  assert.equal(styles.length, 20);
  assert.deepEqual([...new Set(styles.map((s) => identite(s).categorie))].sort(), CATEGORIES.map((c) => c.id).sort());
  for (const genre of ['formation', 'produit', 'storytelling', 'social']) {
    const liste = S.listePourGenre(S.classerPourGenre(genre, [path.join(RACINE, 'styles')]));
    assert.ok(Buffer.byteLength(JSON.stringify(liste)) <= 6000, `${genre} : ${Buffer.byteLength(JSON.stringify(liste))} o`);
  }
});
