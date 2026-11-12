'use strict';
/* Spec S9, 5.15 (imiter une animation ou une vidéo fournie, C16) : mesures pures (activité, fenêtres, règle du tiers, suivi des
 * bords, ajustement de courbe, dépassement, palette, main, style proche), garde-fous (adresse refusée, Lottie, au pixel,
 * personnage, logo, musique ; reference-embarquee), fiche et référence imiter.md. Rien ici ne lance Chrome. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../scripts/lib/imiter-analyse.js');
const M = require('../scripts/lib/imiter.js');
const C = require('../scripts/lib/couleurs.js');
const Co = require('../moteur/courbes.js');
const { assembler } = require('../scripts/assembler.js');
const { lireArguments } = require('../scripts/imiter.js');
const { COMMANDES } = require('../scripts/pm.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');

/** Image RVB L × H d'un fond et de rectangles [x, y, l, h, [r, v, b]]. */
function image(L, H, fond, rects = []) {
  const d = new Uint8Array(L * H * 3);
  for (let i = 0; i < L * H; i++) d.set(fond, i * 3);
  for (const [x, y, l, h, c] of rects) {
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, Math.round(x)); xx < Math.min(L, Math.round(x) + l); xx++) d.set(c, (yy * L + xx) * 3);
  }
  return { rgb: d, largeur: L, hauteur: H };
}
const ROUGE = [225, 29, 72];
const BLANC = [255, 255, 255];
const cubicOut = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/** Carré de 30 px qui glisse de x = 10 à x = 110 en 0,5 s (cubic-out) à partir de 1 s, à 20 images par seconde, sur 2 s. */
function carreQuiEntre({ ips = 20, debut = 1, duree = 0.5, de = 10, a = 110, total = 2 } = {}) {
  const temps = [], images = [];
  for (let k = 0; k < total * ips; k++) {
    const t = k / ips;
    temps.push(Math.round(t * 1000) / 1000);
    images.push(image(160, 90, BLANC, [[Math.round(de + (a - de) * cubicOut((t - debut) / duree)), 30, 30, 30, ROUGE]]));
  }
  return { temps, images };
}

test('imiter : activité, fenêtre 1,0–1,5 s et courbe out d\'un carré qui entre en 0,5 s ease-out à 1 s (mesures pures)', () => {
  const { temps, images } = carreQuiEntre();
  const act = A.activite(images);
  assert.equal(act.length, images.length);
  assert.equal(act[0], 0);
  assert.ok(act.slice(1, 20).every((v) => v === 0), 'immobile avant 1 s');
  const W = A.fenetres(temps, act, { fin: 2 });
  assert.equal(W.fenetres.length, 1, JSON.stringify(W.fenetres));
  const f = W.fenetres[0];
  assert.ok(Math.abs(f.debut - 1) <= 0.05 + 1e-9, `début ${f.debut}`);
  assert.ok(Math.abs(f.fin - 1.5) <= 0.05 + 1e-9, `fin ${f.fin}`);
  assert.ok(f.pic <= f.debut + 0.1 + 1e-9, `pic au départ (ease-out) : ${f.pic}`);
  assert.deepEqual(W.coupes, []);
  assert.ok(W.tenues.some((t) => t.debut === 0 && Math.abs(t.fin - f.debut) < 1e-9), 'tenue avant le mouvement');
  assert.ok(W.tenues.some((t) => Math.abs(t.debut - f.fin) < 1e-9 && t.fin === 2), 'tenue après');
  const r = A.courbeParActivite(temps, act, f);
  assert.equal(r.mode, 'out');
  assert.match(r.courbe, /-out$/);
  // Suivi des bords (couleur du carré) : trajectoire, courbe ajustée de la famille out, durée et départ retrouvés.
  const bords = images.map((im) => { const b = A.bordsSujet(im.rgb, 160, 90, ['#e11d48']); return b && { haut: b.haut / 90 * 100, bas: b.bas / 90 * 100, gauche: b.gauche / 160 * 100, droite: b.droite / 160 * 100 }; });
  const s = A.analyserSuivi(temps, bords, W);
  assert.equal(s.mouvements.length, 1);
  const m = s.mouvements[0];
  assert.equal(m.propriete, 'x');
  assert.match(m.courbe, /-out$/, m.courbe);
  assert.notEqual(m.verdict, 'mauvais', JSON.stringify(m));
  assert.ok(Math.abs(m.debut - 1) <= 0.05 && Math.abs(m.duree - 0.5) <= 0.1, JSON.stringify(m));
  assert.equal(m.depassement, 0);
});

test('imiter : coupe (plus de 25 % sur une seule image), mouvements proches fondus, bords du sujet par ses couleurs', () => {
  const temps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const act = [0, 0, 0.6, 0, 0, 0.02, 0, 0.02, 0, 0, 0];
  const W = A.fenetres(temps, act, { fin: 1.1 });
  assert.deepEqual(W.coupes.map((c) => c.t), [0.2]);
  assert.equal(W.fenetres.length, 1, 'deux changements à 0,1 s d\'écart : un seul mouvement');
  assert.deepEqual([W.fenetres[0].debut, W.fenetres[0].fin], [0.4, 0.7]);
  // Bords : une suite de 6 points au moins ; un point isolé ne compte pas ; zone respectée.
  const im = image(40, 20, BLANC, [[5, 4, 10, 6, ROUGE], [30, 15, 3, 1, ROUGE]]);
  assert.deepEqual(A.bordsSujet(im.rgb, 40, 20, ['#e11d48']), { haut: 4, bas: 10, gauche: 5, droite: 15 });
  assert.equal(A.bordsSujet(im.rgb, 40, 20, ['#e11d48'], { zone: [20, 0, 20, 20] }), null);
  assert.equal(A.bordsSujet(im.rgb, 40, 20, ['#1d4ed8']), null);
});

test('imiter : dépassement de 10 % détecté et nommé back', () => {
  // easeOutBack de CSS (c1 = 1,70158) : dépasse l'arrivée d'environ 10 %.
  const c1 = 1.70158, c3 = c1 + 1;
  const back = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2));
  const pts = [];
  for (let k = 0; k <= 60; k++) { const t = k / 30; pts.push({ t, p: back((t - 0.5) / 0.6) }); }
  const r = A.ajusterCourbe(pts, 0.5, 1.1);
  assert.equal(r.courbe, 'back-out');
  assert.ok(Math.abs(r.depassement - 10) <= 1.5, `dépassement ${r.depassement} %`);
  assert.match(r.css, /^cubic-bezier\(0\.34, [0-9.]+, 0\.64, 1\)$/);
  assert.notEqual(r.verdict, 'mauvais');
  // Une oscillation (plusieurs passages par l'arrivée) : la famille elastic, et le ressort du mouvement vivant.
  const ressort = Co.courbe('ressort', 'in', { raideur: 300, amortissement: 6 });
  const osc = [];
  for (let k = 0; k <= 60; k++) { const t = k / 30; osc.push({ t, p: ressort(Math.min(1, Math.max(0, (t - 0.2) / 1.4))) }); }
  const e = A.ajusterCourbe(osc, 0.2, 1.6);
  assert.match(e.courbe, /^elastic-/);
  assert.equal(e.ressort, true);
  // Sans dépassement : jamais back.
  const lisse = [];
  for (let k = 0; k <= 30; k++) lisse.push({ t: k / 30, p: cubicOut(k / 30) });
  assert.doesNotMatch(A.ajusterCourbe(lisse, 0, 1).courbe, /^back/);
});

test('imiter : la table des courbes vient du moteur ; règle du tiers in, inout et linéaire', () => {
  for (const nom of A.nomsCourbes()) assert.doesNotThrow(() => Co.courbeNommee(nom), nom);
  const temps = Array.from({ length: 11 }, (_, k) => k / 10);
  const f = { images: [1, 10], debut: 0, fin: 1 };
  const parPas = (fn) => [0, ...temps.slice(1).map((t, k) => fn(t) - fn(temps[k]))];
  assert.equal(A.courbeParActivite(temps, parPas((u) => u * u * u), f).mode, 'in');
  assert.equal(A.courbeParActivite(temps, parPas((u) => u), f).mode, 'lineaire');
  assert.equal(A.courbeParActivite(temps, parPas((u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)), f).mode, 'inout');
});

test('imiter : palette d\'une image à 3 aplats retrouvée à ΔE OKLab < 0,02', () => {
  const fond = '#f5f0e6', encre = '#1d3a6e', accent = '#e4572e';
  const rvb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const im = image(160, 90, rvb(fond), [[20, 20, 60, 30, rvb(encre)], [100, 40, 40, 30, rvb(accent)]]);
  const p = A.palette([im], { graine: 1 });
  assert.equal(p.couleurs.length, 3, JSON.stringify(p.couleurs));
  for (const hex of [fond, encre, accent]) {
    const ref = C.hexVersOklab(hex);
    const ecart = Math.min(...p.couleurs.map((c) => Math.hypot(c.oklab[0] - ref[0], c.oklab[1] - ref[1], c.oklab[2] - ref[2])));
    assert.ok(ecart < 0.02, `${hex} : ΔE ${ecart}`);
  }
  assert.equal(p.fond, fond);
  assert.equal(p.encre, encre);
  assert.deepEqual(p.accents, [accent]);
  assert.equal(p.cle, 'claire');
  assert.ok(Math.abs(p.contraste - C.contraste(fond, encre)) < 0.02, `${p.contraste}`);
  // Graine fixe : deux palettes identiques.
  assert.deepEqual(A.palette([im], { graine: 1 }), p);
});

test('imiter : la main d\'une image (aplats nets, trait fin, grain, trame) et sa phrase', () => {
  const L = 200, H = 120;
  const gris = (fn) => { const g = new Uint8Array(L * H); for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) g[y * L + x] = fn(x, y); return g; };
  const aplats = A.mesurerMain(gris((x, y) => (x > 60 && x < 140 && y > 30 && y < 90 ? 60 : 240)), L, H);
  assert.equal(aplats.trait.present, false);
  assert.equal(aplats.bords.nets, true);
  assert.equal(aplats.grain.visible, false);
  assert.equal(A.phraseMain({ ...aplats, trame: { presente: false } }), 'sans trait (formes en aplats), bords nets, aplats sans grain');
  const traits = A.mesurerMain(gris((x, y) => ((x % 25 < 2) || (y % 30 < 2) ? 20 : 245)), L, H);
  assert.equal(traits.trait.present, true);
  assert.ok(traits.trait.largeur <= 2, `${traits.trait.largeur}`);
  assert.equal(traits.trait.regulier, true);
  let s = 7;
  const bruit = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const grain = A.mesurerMain(gris(() => Math.round(200 + (bruit() - 0.5) * 30)), L, H);
  assert.equal(grain.grain.visible, true);
  const trame = A.mesurerMain(gris((x, y) => ((x % 6 < 3) && (y % 6 < 3) ? 120 : 230)), L, H);
  assert.equal(trame.trame.presente, true);
  assert.equal(trame.trame.periode, 6);
  const m = A.resumerMain([traits, traits, aplats]);
  assert.equal(m.trait.present, true, 'majorité des images clés');
  assert.match(m.phrase, /^trait fin et régulier, bords/);
});

test('imiter : styles les plus proches, d\'après les identités (signature, modules, tons, durée type)', () => {
  const identites = [
    { style: 'craie', signature: 'Craie sur ardoise : le grain du tableau mord la craie', modules: ['encre'], couleur: { tons: ['sombre'] }, mouvement: { dureeType: 0.9 } },
    { style: 'plat', signature: 'Aplats pleins, mouvements nets', couleur: { tons: ['clair'] }, mouvement: { dureeType: 0.5 } },
    { style: 'neon', signature: 'Fond presque noir, lumière douce', couleur: { tons: ['sombre'] }, mouvement: { dureeType: 0.5 } },
  ];
  const main = { trait: { present: true }, bords: { doux: true }, grain: { visible: true }, trame: { presente: false } };
  const r = A.stylesProches({ ton: 'sombre', main, dureeMouvement: 0.8 }, identites);
  assert.equal(r[0].style, 'craie');
  assert.ok(r[0].raisons.includes('fond sombre') && r[0].raisons.includes('du grain'), r[0].raisons.join(', '));
  const plat = A.stylesProches({ ton: 'clair', main: { trait: { present: false }, bords: { nets: true, doux: false }, grain: { visible: false }, trame: { presente: false } }, dureeMouvement: 0.45 }, identites);
  assert.equal(plat[0].style, 'plat');
  assert.equal(r.length, 3);
});

test('imiter : planches de 24 images (6 colonnes), 1 568 px et 1,15 Mpx au plus ; étiquette « #i  t s »', () => {
  for (const [L, H] of [[960, 540], [540, 960], [800, 800], [160, 90]]) {
    const m = A.misePlanche(L, H);
    assert.equal(m.colonnes * m.rangees, 24);
    assert.equal(m.colonnes, 6);
    assert.ok(m.L <= 1568 && m.H <= 1568 && m.L * m.H <= 1150000, JSON.stringify(m));
  }
  assert.equal(A.etiquette(0, 1.05), '#1  1,05 s');
});

test('imiter : comparer aligne les courbes (± 15 images) et rend les écarts de début, de fin et de pic', () => {
  const a = Array.from({ length: 60 }, (_, k) => (k >= 20 && k < 30 ? 1 : 0));
  const b = Array.from({ length: 60 }, (_, k) => (k >= 24 && k < 34 ? 0.5 : 0));
  assert.equal(A.aligner(a, b, 20).decalage, 4, 'courbes ramenées à leur maximum, décalage de 4 images');
  assert.equal(A.aligner(a, a, 20).decalage, 0);
  const ref = [{ debut: 1, fin: 1.5, pic: 1.05 }, { debut: 2, fin: 2.4, pic: 2.1 }];
  const ok = A.comparerFenetres(ref, [{ debut: 1.2, fin: 1.72, pic: 1.25 }, { debut: 2.2, fin: 2.62, pic: 2.3 }], 0.2, 'mouvement');
  assert.equal(ok.conforme, true, JSON.stringify(ok));
  assert.ok(ok.ecartMax <= 0.08);
  const ko = A.comparerFenetres(ref, [{ debut: 1, fin: 1.6, pic: 1.05 }], 0, 'mouvement');
  assert.equal(ko.conforme, false);
  assert.deepEqual(ko.ecarts[0].fin, 0.1);
  assert.ok(ko.phrases.includes('Le premier mouvement finit 0,1 s plus tard que dans votre vidéo.'), ko.phrases.join(' / '));
  assert.ok(ko.phrases.some((p) => /2 mouvements, la scène 1/.test(p)));
  assert.equal(A.comparerFenetres(ref, [{ debut: 1, fin: 1.6, pic: 1.05 }, { debut: 2, fin: 2.4, pic: 2.1 }], 0, 'esprit').conforme, true, 'dans l\'esprit : même nombre, même ordre');
  // Activité ramenée sur une grille régulière.
  assert.deepEqual(A.surGrille([0, 0.05, 0.1, 0.15], [0, 0.1, 0.2, 0.3], 0, 10, 2), [0.1, 0.5]);
});

test('imiter : niveaux de fidélité déduits des mots ; au pixel, personnage, logo et musique refusés', () => {
  assert.equal(A.niveauFidelite('Fais la scène 3 dans l\'esprit de ce GIF').niveau, 'esprit');
  assert.equal(A.niveauFidelite('une vidéo qui bouge comme cette pub').niveau, 'esprit');
  assert.equal(A.niveauFidelite('fais pareil que ce GIF').niveau, 'mouvement');
  assert.equal(A.niveauFidelite('exactement le même mouvement, même timing').niveau, 'mouvement');
  for (const p of ['fais-moi une copie exacte de cette vidéo', 'je la veux identique', 'reprends les textes de la pub']) {
    const r = A.niveauFidelite(p);
    assert.equal(r.niveau, null, p);
    assert.equal(r.refus, 'Je reprends le mouvement et le rythme, pas l\'image : les dessins, le logo et les textes de cette vidéo appartiennent à leur auteur.');
  }
  assert.equal(A.niveauFidelite('recopie le personnage de cette pub').refus, 'Je ne peux pas recopier ce personnage : il appartient à sa marque. Je peux en créer un original qui bouge de la même façon.');
  assert.match(A.niveauFidelite('mets le même logo que dans la vidéo').refus, /logo/);
  assert.match(A.niveauFidelite('garde la musique de cette pub').refus, /musique/);
  assert.match(A.niveauFidelite('même rythme que cette pub').annonce, /Je m'inspire/);
  assert.match(A.niveauFidelite('fais pareil').annonce, /0,08 s près/);
});

test('imiter : adresse internet refusée avec un message en français ; Lottie et formats inconnus refusés', async () => {
  const dir = dossierTemporaire('pm-imiter-');
  for (const source of ['https://www.youtube.com/watch?v=abc', 'www.exemple.fr/pub.mp4', 'exemple.com/anim.gif']) {
    const r = await M.analyser({ projet: dir, source, navigateur: null });
    assert.equal(r.ok, false, source);
    assert.equal(r.message, 'Je ne télécharge pas de vidéo : enregistrez-la dans le dossier de la vidéo, si vous en avez le droit.');
    assert.match(r.conseil, /filmer/);
  }
  fs.writeFileSync(path.join(dir, 'anim.json'), '{}');
  assert.match((await M.analyser({ projet: dir, source: 'anim.json', navigateur: null })).message, /Lottie.*GIF ou en MP4/);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  assert.match((await M.analyser({ projet: dir, source: 'notes.txt', navigateur: null })).message, /une vidéo .* ou une animation/);
  assert.match((await M.analyser({ projet: dir, source: 'absent.gif', navigateur: null })).message, /introuvable/);
  assert.match((await M.analyser({ projet: dir, source: 'x.gif', niveau: 'pixel', navigateur: null })).message, /refusée/);
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'references')), false, 'rien de copié');
});

test('imiter : la référence est copiée dans assets/references (même contenu repris, autre contenu renommé)', () => {
  const dir = dossierTemporaire('pm-imiter-');
  fs.writeFileSync(path.join(dir, 'Ma Pub.gif'), 'GIF89a-1');
  const r = M.resoudreSource({ projet: dir, source: 'Ma Pub.gif' });
  assert.equal(r.ok, true);
  assert.equal(r.nom, 'ma-pub');
  assert.equal(r.copie, 'assets/references/ma-pub.gif');
  assert.equal(M.resoudreSource({ projet: dir, source: 'Ma Pub.gif' }).copie, 'assets/references/ma-pub.gif', 'même contenu : repris');
  fs.writeFileSync(path.join(dir, 'Ma Pub.gif'), 'GIF89a-2');
  assert.equal(M.resoudreSource({ projet: dir, source: 'Ma Pub.gif' }).copie, 'assets/references/ma-pub-2.gif');
  assert.equal(M.resoudreSource({ projet: dir, source: 'assets/references/ma-pub.gif' }).copie, 'assets/references/ma-pub.gif', 'déjà rangée : lue sur place');
  assert.deepEqual(M.lireZone('10,20,30,40'), [10, 20, 30, 40]);
  assert.equal(M.lireZone('10,20'), undefined);
  assert.deepEqual(M.lireCouleurs('E11D48,#1d4ed8'), ['#e11d48', '#1d4ed8']);
  assert.equal(M.lireCouleurs('rouge'), undefined);
  assert.deepEqual(M.tailleDecodage(1920, 1080), [960, 540]);
});

test('assembler : ressource de assets/references refusée', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', html: '<h1 data-texte="titre"></h1><img src="assets/references/pub.gif" alt="" data-decor>', textes: { titre: 'Titre' } }] });
  fs.mkdirSync(path.join(dir, 'assets', 'references'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'references', 'pub.gif'), require('./aide/gif.js').gifAnime({ images: [{ couleur: 0, centiemes: 10 }] }));
  const r = assembler({ dossier: dir, ecrire: false });
  const e = r.erreurs.filter((x) => x.regle === 'reference-embarquee');
  assert.equal(e.length, 1, JSON.stringify(r.erreurs));
  assert.equal(e[0].gravite, 'erreur');
  assert.match(e[0].message, /^La vidéo de référence ne doit pas entrer dans la vidéo : elle sert seulement à mesurer\./);
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.html || '', /data:image\/gif/);
  // Musique prise dans les références : refusée aussi.
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'scenes', '01-a.html'), '<section data-scene="a"><h1 data-texte="titre"></h1></section>');
  fs.writeFileSync(path.join(dir, 'assets', 'references', 'pub.wav'), Buffer.alloc(64));
  d.musique = { fichier: 'assets/references/pub.wav', volume: 0.5 };
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d));
  assert.ok(assembler({ dossier: dir, ecrire: false }).erreurs.some((x) => x.regle === 'reference-embarquee' && /musique/.test(x.message)));
});

test('imiter : fiche squelette avec « ? », fiche complète vérifiée (une source par ligne)', () => {
  const fenetres = [{ n: 1, debut: 1, fin: 1.5, duree: 0.5, pic: 1.05, images: [21, 30] }];
  const squelette = A.ficheSquelette({ nom: 'pub', fichier: 'assets/references/pub.gif', de: 0, a: 2, niveau: 'mouvement', fenetres, parActivite: { 1: { mode: 'out', courbe: 'quint-out' } } });
  assert.match(squelette, /Niveau : même mouvement/);
  assert.match(squelette, /\| 1,00 s \| 0,50 s \|/);
  const v = A.verifierFiche(squelette);
  assert.equal(v.ok, false);
  assert.ok(v.manques.some((m) => /Élément/.test(m)));
  const complete = squelette.replace(/^\| \? \| \? \| \? \| (.*) \| \? \| \? \| (.*)$/m, '| titre | x | entrée | $1 | — | 10 → 90 % | $2');
  const w = A.verifierFiche(complete);
  assert.deepEqual(w.manques, []);
  assert.equal(w.ok, true);
  assert.equal(A.verifierFiche('| a | b | c | d | e | f | g | h | mesuré à l\'œil |').ok, false, 'source absente');
});

test('références : imiter.md contient la table des niveaux et l\'interdit de copie', () => {
  const t = fs.readFileSync(path.join(RACINE, 'references', 'imiter.md'), 'utf8');
  assert.match(t, /\| Niveau \| Phrases \| Doit concorder \| Peut différer \|/);
  for (const n of Object.values(A.NIVEAUX)) assert.ok(t.includes(`| ${n.nom}`), n.nom);
  assert.match(t, /\| au pixel \| .* \| \*\*refusé\*\* \|/);
  for (const m of [A.REFUS_PIXEL, A.REFUS_PERSONNAGE, A.REFUS_LOGO, A.REFUS_MUSIQUE, A.REFUS_ADRESSE]) assert.ok(t.includes(m), m);
  assert.match(t, /Redessiner un personnage, un logo, une mascotte ou une marque reconnaissable de la référence/);
  assert.ok(t.includes(require('../scripts/lib/embarquer.js').MESSAGE_REFERENCE));
  assert.match(t, /`reference-embarquee`/);
  // Les colonnes de la fiche sont celles que vérifie le code.
  assert.ok(t.includes(`| ${A.COLONNES.join(' | ')} |`));
  // Les retouches et la création y renvoient ; la commande existe.
  assert.ok(COMMANDES.includes('imiter'));
  assert.match(fs.readFileSync(path.join(RACINE, 'skills', 'retoucher', 'SKILL.md'), 'utf8'), /\| Imiter \| .*`pulse-motion reference imiter`/);
  assert.match(fs.readFileSync(path.join(RACINE, 'skills', 'creer', 'SKILL.md'), 'utf8'), /`pulse-motion reference imiter`/);
  assert.match(fs.readFileSync(path.join(RACINE, 'skills', 'retoucher', 'SKILL.md'), 'utf8').split('\n')[1], /« fais pareil que cette vidéo »/);
});

test('imiter : arguments de la commande (options à valeur, dossier en dernier)', () => {
  const r = lireArguments(['pub.gif', '--de', '1', '--couleurs', '#e11d48', '--zone', '0,0,50,50', '.']);
  assert.deepEqual(r.libres, ['pub.gif', '.']);
  assert.deepEqual(r.options, { de: '1', couleurs: '#e11d48', zone: '0,0,50,50' });
});
