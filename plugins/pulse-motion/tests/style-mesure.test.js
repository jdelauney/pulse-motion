'use strict';
/* Spec S11 « Styles, seconde bibliothèque », jalon J3 « Fidèle au style » : mesure du rendu contre son style (5.4) et
 * typographie des styles (5.5), sans navigateur (images composées ici). La mesure des vidéos témoins dans la page est dans
 * style-mesure-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PNG = require('../scripts/lib/png.js');
const MS = require('../scripts/lib/mesure-style.js');
const PS = require('../scripts/lib/polices-styles.js');
const { projetBoucle } = require('../scripts/lib/temoin.js');
const { controler } = require('../scripts/controler.js');
const { AXES, validerCritique } = require('../scripts/lib/relecture.js');
const S = require('../scripts/styles.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const LIVRES_DIR = path.join(RACINE, 'styles');
const LIVRES = fs.readdirSync(LIVRES_DIR).filter((n) => fs.existsSync(path.join(LIVRES_DIR, n, 'identite.json'))).sort();
/** Les 20 styles de S8 (liste figée de styles-livres.test.js au 2026-11-13) : les règles des styles nouveaux ne les visent pas. */
const STYLES_S8 = ['carnet', 'chaleureux', 'clair-pedagogique', 'crayon', 'editorial', 'energique', 'info-sans-son', 'iso-album', 'iso-infographie', 'lancement',
  'minimal', 'mode-d-emploi', 'papier-decoupe', 'pictogrammes', 'plan-technique', 'recit-donnees', 'riso', 'tableau-blanc', 'tableau-noir', 'tech-sombre'];
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const rvb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Image PNG L × H : un fond et des rectangles [x, y, l, h, hex]. */
function image(L, H, fond, rects = []) {
  const d = new Uint8Array(L * H * 3);
  const f = rvb(fond);
  for (let i = 0; i < L * H; i++) d.set(f, i * 3);
  for (const [x, y, w, h, hex] of rects) {
    const c = rvb(hex);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) d.set(c, (yy * L + xx) * 3);
  }
  return PNG.encoder({ largeur: L, hauteur: H, canaux: 3, donnees: d });
}

/** Attendu du style riso pour sa vidéo témoin (charte du ton clair, couleurs fixes, couleur.mesure, main). */
function attenduRiso() {
  const projet = projetBoucle({ dossierStyle: path.join(LIVRES_DIR, 'riso') });
  try {
    const deroule = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
    return MS.attenduDuStyle({ projet, deroule, dossierStyle: path.join(LIVRES_DIR, 'riso') });
  } finally { fs.rmSync(projet, { recursive: true, force: true }); }
}

/** Images à la riso : papier, encre bleue, encre rose, texte bleu nuit. */
const imagesRiso = (extra = []) => [0, 1, 2].map((k) => ({
  png: image(320, 180, '#ebe3cf', [[20, 20, 120, 60, '#2160a8'], [180, 90, 80, 50, '#b52d68'], [30, 120, 100, 8, '#1d3a6e'], ...extra]), scene: `s${k}`, t: k,
}));

// ---------- 5.4 Mesurer le rendu contre son style ----------

test('mesure-style : même images, mêmes chiffres', () => {
  const attendu = attenduRiso();
  const a = MS.mesurerImages(imagesRiso(), attendu);
  const b = MS.mesurerImages(imagesRiso(), attendu);
  assert.deepEqual(a, b);
  // Mêmes points, autre encodage (couche alpha opaque) : mêmes chiffres.
  const rgba = imagesRiso().map((im) => {
    const d = PNG.decoder(im.png);
    const x = new Uint8Array(d.largeur * d.hauteur * 4);
    for (let i = 0; i < d.largeur * d.hauteur; i++) { x.set(d.donnees.subarray(i * 3, i * 3 + 3), i * 4); x[i * 4 + 3] = 255; }
    return { ...im, png: PNG.encoder({ largeur: d.largeur, hauteur: d.hauteur, canaux: 4, donnees: x }) };
  });
  assert.deepEqual(MS.mesurerImages(rgba, attendu), a);
  // Ce qu'on mesure : clé claire, deux teintes (bleu, rose), parts de surface, rien d'étranger.
  assert.equal(a.cle, 'claire');
  assert.equal(a.teintes, 2);
  assert.ok(a.couleurs[0].hex && a.couleurs[0].part > 0.5, JSON.stringify(a.couleurs));
  assert.ok(a.saturee > 0.1 && a.saturee < 0.4, String(a.saturee));
  assert.deepEqual(a.etrangeres, []);
  assert.deepEqual(MS.avisStyle(a, attendu).filter((x) => x.regle !== 'style-main'), []);
});

test('mesure-style : les médias de la personne sont masqués', () => {
  const attendu = attenduRiso();
  // Une photo violette de la personne couvre un tiers de chaque image.
  const photo = [160, 0, 160, 120, '#7c3aed'];
  const sans = MS.mesurerImages(imagesRiso([photo]), attendu);
  assert.ok(sans.etrangeres.length >= 1, 'sans masque, le violet est étranger');
  assert.ok(MS.avisStyle(sans, attendu).some((x) => x.regle === 'style-couleur-etrangere'));
  const masquees = imagesRiso([photo]).map((im) => ({ ...im, masques: [[160, 0, 160, 120]] }));
  const avec = MS.mesurerImages(masquees, attendu);
  assert.deepEqual(avec.etrangeres, []);
  assert.ok(avec.masquee > 0.3 && avec.masquee < 0.4, String(avec.masquee));
  assert.ok(!MS.avisStyle(avec, attendu).some((x) => x.regle === 'style-couleur-etrangere'));
  // Les médias de la page : images, écrans, cartes, Lottie, films.
  for (const sel of ['img', '.pm-ecran', '[data-carte]', '[data-lottie]', '[data-film]']) assert.ok(MS.MEDIAS.includes(sel), sel);
  assert.match(MS.BOITES_MEDIAS, /naturalWidth/);
});

test('style-cle : une vidéo au ton clair rendue sombre est signalée', () => {
  const attendu = attenduRiso();
  assert.equal(attendu.ton, 'clair');
  const sombres = [0, 1].map((k) => ({ png: image(320, 180, '#111111', [[20, 20, 120, 60, '#2160a8'], [30, 120, 100, 8, '#ebe3cf']]), scene: `s${k}` }));
  const m = MS.mesurerImages(sombres, attendu);
  assert.equal(m.cle, 'sombre');
  const avis = MS.avisStyle(m, attendu).filter((x) => x.regle === 'style-cle');
  assert.equal(avis.length, 1);
  assert.equal(avis[0].gravite, 'info');
  assert.match(avis[0].message, /ton clair/);
  assert.deepEqual(MS.avisStyle(MS.mesurerImages(imagesRiso(), attendu), attendu).filter((x) => x.regle === 'style-cle'), []);
});

test('style-teintes, style-terne, style-main : mesure contre identite.couleur.mesure et le profil du style', () => {
  const attendu = { ...attenduRiso(), teintesMax: 1, saturee: [0.5, 1] };
  const avis = MS.avisStyle(MS.mesurerImages(imagesRiso(), attendu), attendu).map((x) => x.regle);
  assert.ok(avis.includes('style-teintes'), avis.join());
  assert.ok(avis.includes('style-terne'), avis.join());
  // Main : une matière que le style n'a pas compte, et l'absence de tout trait dans un style dessiné ; un trait dans un style
  // sans trait (les lettres) et l'absence d'une texture fine promise ne comptent pas.
  const profil = { trait: true, grain: false, trame: false, doux: false };
  assert.deepEqual(MS.contradictionsMain({ trait: false, grain: true, trame: false, doux: true }, profil), ['aucun trait dessiné', 'du grain', 'des bords doux']);
  assert.deepEqual(MS.contradictionsMain({ trait: true, grain: false, trame: false, doux: false }, { ...profil, trait: false }), []);
  assert.deepEqual(MS.contradictionsMain({ trait: false, grain: false, trame: false, doux: false }, { trait: false, grain: true, trame: true, doux: true }), []);
});

test('effet-hors-style : glitch dans une vidéo tableau-blanc signalé ; levé par une entorse nommée', () => {
  const projet = projetBoucle({ dossierStyle: path.join(LIVRES_DIR, 'tableau-blanc') });
  try {
    const f = path.join(projet, 'deroule.json');
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.deepEqual(controler({ dossier: projet, ecrire: false }).problemes.filter((p) => p.regle === 'effet-hors-style'), []);
    d.scenes[1].transition = { shader: 'glitch', duree: 0.6 };
    fs.writeFileSync(f, JSON.stringify(d));
    const p = controler({ dossier: projet, ecrire: false }).problemes.filter((x) => x.regle === 'effet-hors-style');
    assert.equal(p.length, 1);
    assert.equal(p[0].gravite, 'info');
    assert.equal(p[0].scene, d.scenes[1].id);
    assert.match(p[0].message, /glitch/);
    assert.match(p[0].consigne, /entorses/);
    d.entorses = [{ quoi: 'glitch', pourquoi: 'la vidéo parle d\'une panne informatique' }];
    fs.writeFileSync(f, JSON.stringify(d));
    const r = controler({ dossier: projet, ecrire: false }).problemes;
    assert.deepEqual(r.filter((x) => x.regle === 'effet-hors-style'), []);
    assert.deepEqual(r.filter((x) => x.regle === 'deroule-invalide'), []);
    // Une entorse mal écrite est refusée par le déroulé.
    const { validerDeroule } = require('../scripts/lib/deroule.js');
    assert.ok(validerDeroule({ ...d, entorses: [{ quoi: 'glitch' }] }).some((m) => /entorses\[0\]/.test(m)));
  } finally { fs.rmSync(projet, { recursive: true, force: true }); }
});

test('effet-hors-style : particules, lueur et rebond sur plusieurs éléments ; un effet cité par les gestes ou conseillé passe', () => {
  const dossierStyle = path.join(LIVRES_DIR, 'tableau-blanc');
  const deroule = { style: 'tableau-blanc', scenes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const scenesHtml = {
    a: '<section><div class="pm-v-lueur"></div><div data-shader="halo" data-ancre="#x"></div></section>',
    b: '<section><p data-tween="--y 0→1 bounce-out"></p><p class="pm-m-chute"></p></section>',
    c: '<section><p data-tween="--y 0→1 bounce-out"></p></section>',
  };
  const r = MS.effetHorsStyle({ deroule, scenesHtml, dossierStyle, fiche: lire('references', 'styles', 'tableau-blanc.md'), effets: [{ scene: 'c' }] });
  assert.deepEqual(r.map((x) => [x.regle, x.scene, /particules|lueur|rebond/.exec(x.message)[0]]).sort(),
    [['effet-hors-style', 'a', 'lueur'], ['effet-hors-style', 'b', 'rebond'], ['effet-hors-style', 'c', 'particules']]);
  // tech-sombre conseille l'aberration : pas d'avis.
  const tech = { style: 'tech-sombre', post: [{ shader: 'aberration' }], scenes: [{ id: 'a' }] };
  assert.deepEqual(MS.effetHorsStyle({ deroule: tech, scenesHtml: {}, dossierStyle: path.join(LIVRES_DIR, 'tech-sombre'), fiche: lire('references', 'styles', 'tech-sombre.md') }), []);
});

test('controler : avis du style repris de sortie/regard/style.json seulement pour la page mesurée', () => {
  const projet = projetBoucle({ dossierStyle: path.join(LIVRES_DIR, 'riso') });
  try {
    const { assembler } = require('../scripts/assembler.js');
    const { empreintePage } = require('../scripts/lib/relecture.js');
    const html = assembler({ dossier: projet, ecrire: false }).html;
    fs.mkdirSync(path.join(projet, 'sortie', 'regard'), { recursive: true });
    const avis = [{ regle: 'style-cle', message: 'La vidéo est en ton clair, mais ses images sont sombres dans l\'ensemble.', consigne: 'c' }];
    const ecrire = (empreinte) => fs.writeFileSync(path.join(projet, 'sortie', 'regard', 'style.json'), JSON.stringify({ version: 1, empreinte, avis }));
    ecrire(empreintePage(html));
    const p = controler({ dossier: projet, ecrire: false }).problemes.filter((x) => x.regle === 'style-cle');
    assert.equal(p.length, 1);
    assert.equal(p[0].gravite, 'info');
    ecrire('0000000000000000');
    assert.deepEqual(controler({ dossier: projet, ecrire: false }).problemes.filter((x) => x.regle === 'style-cle'), []);
  } finally { fs.rmSync(projet, { recursive: true, force: true }); }
});

test('couleur.mesure : renseignée pour chaque style livré, et vérifiée', () => {
  for (const s of LIVRES) {
    const m = JSON.parse(lire('styles', s, 'identite.json')).couleur.mesure;
    assert.ok(m && Number.isInteger(m.teintesMax) && m.chaleur.length === 2 && m.saturee.length === 2, s);
  }
  const dir = dossierTemporaire('pm-mesure-');
  const st = path.join(dir, 'essai');
  fs.cpSync(path.join(LIVRES_DIR, 'minimal'), st, { recursive: true });
  const id = JSON.parse(fs.readFileSync(path.join(st, 'identite.json'), 'utf8'));
  id.style = 'essai';
  for (const c of ['catalogue.json']) { const j = JSON.parse(fs.readFileSync(path.join(st, c), 'utf8')); j.style = 'essai'; fs.writeFileSync(path.join(st, c), JSON.stringify(j)); }
  id.couleur.mesure = { teintesMax: 0, chaleur: [0.2, 0.1], saturee: [0, 2], autre: 1 };
  fs.writeFileSync(path.join(st, 'identite.json'), JSON.stringify(id));
  const e = S.verifierStyle(st).erreurs.join('\n');
  for (const k of ['teintesMax', 'chaleur', 'saturee', 'autre']) assert.match(e, new RegExp(`couleur\\.mesure\\.${k}`));
  // Facultative pour un style personnel ; obligatoire pour un style livré.
  delete id.couleur.mesure;
  fs.writeFileSync(path.join(st, 'identite.json'), JSON.stringify(id));
  assert.doesNotMatch(S.verifierStyle(st).erreurs.join('\n'), /couleur\.mesure/);
  assert.match(S.verifierStyle(st, { livre: true }).erreurs.join('\n'), /« couleur\.mesure » est obligatoire pour un style livré/);
});

test('critique : 9 axes, l\'axe style cite au moins une mesure', () => {
  assert.equal(AXES.length, 9);
  assert.equal(AXES[8], 'style');
  const t = lire('agents', 'critique.md');
  const ligne = t.split('\n').find((l) => l.startsWith('| `style` |'));
  assert.ok(ligne, 'ligne de l\'axe style');
  assert.match(ligne, /`style\.json`/);
  assert.match(ligne, /n'importe quelle vidéo|interchangeable/);
  assert.match(ligne, /entorse/);
  assert.match(t, /`fiche\.md` et `style\.json`/);
  const critique = (preuve) => ({
    version: 1, empreinte: 'abcdef0123456789', message: 'm', messagePrevu: 'm', ecart: '',
    axes: Object.fromEntries(AXES.map((a) => [a, { note: 8, preuve: a === 'style' ? preuve : 'scène intro, 1 s : vu' }])),
    scenes: [{ id: 'intro', note: 8, raison: 'r' }], defauts: [], verdict: 'prete', plusFaible: 'intro', inverifiable: [],
  });
  assert.deepEqual(validerCritique(critique('scène intro, 1 s : clé claire, deux teintes comme le style')), []);
  assert.ok(validerCritique(critique('scène intro, 1 s : joli')).some((m) => /axes\.style\.preuve/.test(m)));
  // Invérifiable : null, sans mesure exigée.
  const c = critique('invérifiable');
  c.axes.style.note = null;
  assert.deepEqual(validerCritique(c), []);
  // Les budgets du critique tiennent.
  assert.ok(Buffer.byteLength(t) <= 3800 && Buffer.byteLength(t.replace(/^---[\s\S]*?---\n/, '')) <= 3500);
});

// ---------- 5.5 Typographie des styles ----------

test('polices.json : chaque style livré a titres, texte et 2 alternatives sous licence OFL', () => {
  const j = PS.lirePolices();
  assert.deepEqual(Object.keys(j.styles).sort(), LIVRES);
  const trop = new Set(j['trop-vues']);
  assert.deepEqual(j['trop-vues'], ['Inter', 'Roboto', 'Montserrat', 'Poppins', 'Open Sans', 'Lato', 'Arial', 'Helvetica']);
  for (const s of LIVRES) {
    const e = j.styles[s];
    const typo = JSON.parse(lire('styles', s, 'identite.json')).typographie;
    assert.equal(e.titres, typo.titres.famille, s);
    assert.equal(e.texte, typo.texte.famille, s);
    assert.equal(e.alternatives.length, 2, s);
    for (const a of e.alternatives) {
      assert.ok(a.titres && a.texte && a.pourquoi && a.pourquoi.length > 20, `${s} : ${JSON.stringify(a)}`);
      for (const f of [a.titres, a.texte]) {
        assert.ok(!trop.has(f), `${s} : ${f} est trop vue`);
        assert.equal((j.familles[f] || {}).licence, 'OFL-1.1', `${s} : licence de ${f}`);
        assert.equal(j.familles[f].francais, true, `${s} : français de ${f}`);
        assert.match(j.familles[f].bunny, /^[a-z0-9-]+$/);
      }
    }
  }
  // Les alternatives ne sont pas embarquées : aucune n'a de fichier dans le plugin (sauf si un style livré l'emploie déjà).
  const embarquees = new Set(LIVRES.flatMap((s) => [j.styles[s].titres, j.styles[s].texte]));
  for (const f of Object.keys(j.familles).filter((x) => !embarquees.has(x))) {
    assert.ok(!fs.existsSync(path.join(RACINE, 'polices', f)), `${f} embarquée`);
    for (const s of LIVRES) assert.ok(!fs.readdirSync(path.join(LIVRES_DIR, s, 'polices')).some((x) => x.startsWith(`${f}-`) || x === `${f}.woff2`), `${f} dans ${s}`);
  }
  assert.ok(j.verification && /METADATA\.pb/.test(j.verification.licence) && /cmap/.test(j.verification.francais));
  // La commande rend les alternatives.
  const r = PS.alternativesPolices('riso');
  assert.equal(r.alternatives.length, 2);
  assert.ok(r.tropVues.includes('Montserrat'));
});

test('style verifier : police-trop-vue pour un style personnel en Montserrat ; levé quand la charte l\'impose', async () => {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  try {
    const P = require('../scripts/style-perso.js');
    assert.ok(P.nouveauStyle({ nom: 'marque', depuis: 'minimal' }).ok);
    const dossier = S.trouverStyle('marque').dossier;
    const id = JSON.parse(fs.readFileSync(path.join(dossier, 'identite.json'), 'utf8'));
    id.typographie.titres.famille = 'Montserrat';
    fs.writeFileSync(path.join(dossier, 'identite.json'), JSON.stringify(id, null, 2));
    const r = await P.verifierStylePerso({ nom: 'marque', navigateur: null });
    assert.deepEqual(r.avis.map((a) => a.regle), ['police-trop-vue']);
    assert.equal(r.avis[0].gravite, 'info');
    assert.match(r.avis[0].message, /« Montserrat »/);
    assert.match(r.avis[0].message, /charte/);
    // La charte de la personne l'impose : le changement est noté avec --charte, l'avis est levé.
    assert.ok(P.noterChangement({ nom: 'marque', section: '4', avant: 'Schibsted Grotesk', apres: 'Montserrat, la police de la marque', pourquoi: 'charte de la marque', charte: true }).ok);
    assert.deepEqual((await P.verifierStylePerso({ nom: 'marque', navigateur: null })).avis, []);
    // Les styles livrés ne changent pas : jamais d'avis (clair-pedagogique garde Inter).
    assert.deepEqual((await P.verifierStylePerso({ nom: 'clair-pedagogique', navigateur: null })).avis, []);
  } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
});

test('styles nouveaux : aucune police trop vue ; au moins une police utilisée par 2 autres styles au plus', () => {
  // Les styles livrés après S8 (vagues E à K) respectent les deux règles.
  for (const s of LIVRES.filter((x) => !STYLES_S8.includes(x))) assert.deepEqual(PS.reglesStyleNouveau(s), [], s);
  // Les règles elles-mêmes, sur un catalogue d'essai.
  const dir = dossierTemporaire('pm-polices-');
  const style = (nom, titres, texte) => {
    fs.mkdirSync(path.join(dir, nom));
    fs.writeFileSync(path.join(dir, nom, 'identite.json'), JSON.stringify({ style: nom, typographie: { titres: { famille: titres }, texte: { famille: texte } } }));
  };
  style('a', 'Barlow', 'Barlow'); style('b', 'Barlow', 'Fraunces'); style('c', 'Fraunces', 'Barlow'); style('d', 'Fraunces', 'Kalam');
  // Barlow et Fraunces sont déjà pris par 3 autres styles : aucune police rare.
  style('commun', 'Barlow', 'Fraunces');
  const r = PS.reglesStyleNouveau('commun', dir);
  assert.equal(r.length, 1, r.join('\n'));
  assert.match(r[0], /plus de 2 autres styles/);
  // Inter : trop vue (rare, elle suffit à la diversité, mais reste refusée).
  assert.deepEqual(PS.reglesStyleNouveau('vu', (style('vu', 'Inter', 'Barlow'), dir)).map((m) => /« Inter » est dans la liste trop-vues/.test(m)), [true]);
  style('rare', 'Barlow', 'Shantell Sans');
  assert.deepEqual(PS.reglesStyleNouveau('rare', dir), []);
});
