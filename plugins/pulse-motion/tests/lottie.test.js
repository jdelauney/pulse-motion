'use strict';
/* Spec « Lacunes créatives » (S9), 5.11 : animations Lottie. Lecteur image par image (moteur/lottie.js), import d'un .json ou
 * d'une archive .lottie sans dépendance, recoloration à l'assemblage, contrôles, crédits, moteur à la carte, imiter. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../moteur/lottie.js');
const Lo = require('../scripts/lib/lottie.js');
const { ecrireZip } = require('../scripts/lib/zip.js');
const { encoder } = require('../scripts/lib/png.js');
const { animationEssai } = require('./aide/lottie-essai.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const empreinte = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('lottie : image affichée fonction de t seulement (aller-retour, saut, boucle)', () => {
  const a = animationEssai();
  assert.equal(L.imageLottie(a, -1), 0, 'avant le début : la première image');
  assert.equal(L.imageLottie(a, 0), 0);
  assert.equal(L.imageLottie(a, 0.5), 15);
  assert.equal(L.imageLottie(a, 10), 59.99, 'bornée à la dernière image');
  assert.equal(L.imageLottie(a, 2.5, { boucle: true }), 15, 'modulo la durée en boucle');
  assert.equal(L.imageLottie(a, 0.5, { vitesse: 2 }), 30);
  // Même instant, même image, quel que soit le chemin (aller, retour, saut).
  const svg = (t) => L.svgLottie(a, L.imageLottie(a, t), 'essai');
  const vus = [0.2, 0.9, 1.7, 0.9, 0.2].map(svg);
  assert.deepEqual(vus.slice(0, 2), vus.slice(3).reverse());
  assert.equal(svg(1.7), vus[2]);
  assert.notEqual(vus[0], vus[1]);
  // Courbe symétrique : au milieu du trajet (image 15), la balle est au milieu (x = 100).
  assert.match(L.svgLottie(a, 15), /<g transform="matrix\(1 0 0 1 100 60\)"><g transform="matrix\(1 0 0 1 0 0\)"><path d="M0 -20C/);
  assert.match(L.svgLottie(a, 0), /matrix\(1 0 0 1 50 60\)/);
  assert.match(L.svgLottie(a, 45), /matrix\(1 0 0 1 150 60\)/);
  // Tracé tronqué : rien à l'image 0, la moitié du contour à l'image 30, tout à la fin.
  const trait = (i) => (/<path d="([^"]+)" fill="none" stroke="#222222"/.exec(L.svgLottie(a, i)) || [])[1];
  assert.equal(trait(0), undefined);
  assert.ok(trait(30) && trait(59.99) && trait(30).length < trait(59.99).length, `${trait(30)} | ${trait(59.99)}`);
  // Masque et cache : définis dans la page, identiques d'une image à l'autre pour un même instant.
  const s = L.svgLottie(a, 20, 'x');
  assert.match(s, /<mask id="x-m\d+" maskUnits="userSpaceOnUse"/);
  assert.match(s, /fill="#fff"/, 'cache alpha : source en blanc');
  assert.match(s, /<rect width="200" height="200" fill="#f2f2f2"\/>/);
  // Ordre : le fond (dernier calque) d'abord, la balle (premier) en dernier.
  assert.ok(s.indexOf('#f2f2f2') < s.indexOf('#ff5a00'));
});

test('lottie : interpolation des images clés (maintenue, trajectoire courbe, ancienne forme à « e »)', () => {
  const v = (k, f) => L.valeur({ a: 1, k }, f);
  assert.deepEqual(v([{ t: 0, s: [0], h: 1 }, { t: 10, s: [10] }], 5), [0]);
  assert.deepEqual(v([{ t: 0, s: [0], e: [10], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: 10 }], 5), [5]);
  assert.deepEqual(v([{ t: 0, s: [0], e: [10] }, { t: 10 }], 20), [10]);
  const courbe = v([{ t: 0, s: [0, 0], to: [0, -40], ti: [0, -40], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: 10, s: [100, 0] }], 5);
  assert.ok(Math.abs(courbe[0] - 50) < 1 && courbe[1] < -20, `point au milieu de l'arc : ${courbe}`);
  const a = L.analyserLottie(animationEssai());
  assert.equal(a.duree, 2);
  assert.equal(a.ips, 30);
  assert.ok(a.couleurs.includes('#ff5a00') && a.couleurs.includes('#222222'), a.couleurs.join(' '));
  assert.deepEqual([a.expressions, a.textes, a.imagesExternes.length, a.nonPris.length], [false, 0, 0, 0]);
});

/** Projet d'essai à une scène avec l'animation dans assets/lottie/balle.json. */
function projet(div, { anim = animationEssai(), duree = 3 } = {}) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets', 'lottie'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'lottie', 'balle.json'), JSON.stringify(anim));
  fs.writeFileSync(path.join(dir, 'scenes', '01-lottie.html'), `<section data-scene="lottie">\n${div}\n</section>\n`);
  modifierDeroule(dir, (d) => {
    d.style = 'clair-pedagogique';
    d.charte = { couleurs: { primaire: '#0a6cff' } };
    d.scenes = [{ id: 'lottie', fichier: 'scenes/01-lottie.html', duree, transition: 'coupe', textes: {} }];
  });
  return dir;
}
const assembler = (dir) => require('../scripts/assembler.js').assembler({ dossier: dir, ecrire: false });
const bloc = (html) => JSON.parse(/<script type="application\/json" id="pm-lottie-0">([\s\S]*?)<\/script>/.exec(html)[1]);

test('lottie : recoloration à l\'assemblage, JSON d\'origine intact dans assets', () => {
  const dir = projet('<div data-lottie="assets/lottie/balle.json" data-start="0.5" data-lottie-couleurs="#ff5a00=primaire,#222222=#00aa00" style="width: 40cqh; height: 40cqh"></div>');
  const fichier = path.join(dir, 'assets', 'lottie', 'balle.json');
  const avant = empreinte(fichier);
  const r = assembler(dir);
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.filter((e) => /^lottie/.test(e.regle)), []);
  const recolore = bloc(r.html);
  assert.deepEqual(recolore.layers[0].shapes[0].it[1].c.k.slice(0, 3), [0.0392, 0.4235, 1], 'orange → primaire (#0a6cff)');
  assert.deepEqual(recolore.layers[1].shapes[2].c.k.slice(0, 3), [0, 0.6667, 0], 'gris → #00aa00');
  assert.match(r.html, /<div data-lottie="pm-lottie-0" data-start="0.5"[^>]*data-lottie-source="assets\/lottie\/balle.json" role="img">/);
  assert.equal(empreinte(fichier), avant, 'le fichier de assets/lottie/ ne change pas');
  assert.deepEqual(JSON.parse(fs.readFileSync(fichier, 'utf8')).layers[0].shapes[0].it[1].c.k, [1, 0.3529, 0, 1]);
  // Une couleur à 8 près sur 255 est remplacée ; au-delà, non.
  const proche = Lo.recolorer(animationEssai(), Lo.lireCouleurs('#f75200=#000000', {}).correspondances);
  assert.deepEqual(proche.layers[0].shapes[0].it[1].c.k.slice(0, 3), [0, 0, 0]);
  const loin = Lo.recolorer(animationEssai(), Lo.lireCouleurs('#f05000=#000000', {}).correspondances);
  assert.deepEqual(loin.layers[0].shapes[0].it[1].c.k.slice(0, 3), [1, 0.3529, 0]);
  // Nom de couleur inconnu : erreur.
  const faute = assembler(projet('<div data-lottie="assets/lottie/balle.json" data-lottie-couleurs="#ff5a00=violet"></div>'));
  assert.ok(faute.erreurs.some((e) => e.regle === 'lottie-invalide' && e.gravite === 'erreur'));
  // Deux scènes, même fichier, mêmes couleurs : un seul bloc.
  assert.equal((r.html.match(/id="pm-lottie-/g) || []).length, 1);
});

test('lottie : archive .lottie importée sans dépendance', () => {
  const dir = dossierTemporaire('pm-lottie-import-');
  const anim = animationEssai();
  anim.assets = [{ id: 'img_0', w: 4, h: 4, u: '/images/', p: 'img_0.png', e: 0 }];
  anim.layers.unshift({ ddd: 0, ind: 9, ty: 2, refId: 'img_0', ip: 0, op: 60, st: 0, ks: { o: { a: 0, k: 100 } } });
  const png = encoder({ largeur: 4, hauteur: 4, canaux: 3, donnees: Buffer.alloc(48, 200) });
  const archive = ecrireZip([
    { nom: 'manifest.json', donnees: Buffer.from(JSON.stringify({ version: '1', animations: [{ id: 'fusee' }] })) },
    { nom: 'animations/fusee.json', donnees: Buffer.from(JSON.stringify(anim)) },
    { nom: 'images/img_0.png', donnees: png },
  ]);
  fs.writeFileSync(path.join(dir, 'Fusée.lottie'), archive);
  const r = Lo.importer({ projet: dir, fichier: 'Fusée.lottie', source: 'LottieFiles', licence: 'Lottie Simple License' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'assets/lottie/fusee.json');
  assert.equal(r.duree, 2);
  assert.deepEqual(r.avertissements, []);
  const copie = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'lottie', 'fusee.json'), 'utf8'));
  assert.match(copie.assets[0].p, /^data:image\/png;base64,/);
  assert.equal(copie.assets[0].e, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'lottie', 'fusee.licence.json'), 'utf8')), { fichier: 'Fusée.lottie', source: 'LottieFiles', licence: 'Lottie Simple License' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'sources.json'), 'utf8'))['assets/lottie/fusee.json'].licence, 'Lottie Simple License');
  // L'image embarquée se dessine.
  assert.match(L.svgLottie(copie, 10), /<image href="data:image\/png;base64,/);
  // Sans licence : le rapport demande de la préciser ; une adresse est refusée ; un fichier quelconque aussi.
  fs.writeFileSync(path.join(dir, 'balle.json'), JSON.stringify(animationEssai()));
  assert.match(Lo.importer({ projet: dir, fichier: 'balle.json' }).aPreciser, /licence/);
  assert.match(Lo.importer({ projet: dir, fichier: 'https://lottiefiles.com/fusee.json' }).message, /Je ne télécharge pas/);
  fs.writeFileSync(path.join(dir, 'autre.json'), '{"a": 1}');
  assert.equal(Lo.importer({ projet: dir, fichier: 'autre.json' }).ok, false);
  fs.writeFileSync(path.join(dir, 'abime.lottie'), Buffer.from('pas une archive'));
  assert.match(Lo.importer({ projet: dir, fichier: 'abime.lottie' }).message, /illisible/);
  // Commande : pulse-motion lottie.
  assert.ok(require('../scripts/pm.js').COMMANDES.includes('lottie'));
  assert.equal(require('../scripts/lottie.js').principal(['analyser', 'balle.json', dir]).duree, 2);
});

test('assembler : une page sans Lottie n\'embarque pas le lecteur (poids de chaine-du-froid inchangé)', () => {
  const r = assembler(path.join(RACINE, 'exemples', 'chaine-du-froid'));
  assert.equal(r.ok, true);
  assert.ok(!r.groupes.includes('lottie'));
  assert.doesNotMatch(r.html, /svgLottie|demarrerLotties|pm-lottie|data-lottie/);
  const avec = assembler(projet('<div data-lottie="assets/lottie/balle.json"></div>'));
  assert.ok(avec.groupes.includes('lottie'));
  assert.match(avec.html, /M\.demarrerLotties\(\);/);
  // Le lecteur n'ajoute que lui-même et le bloc de l'animation.
  const sans = assembler(projet('<div></div>'));
  const ecart = avec.html.length - sans.html.length;
  const lecteur = require('../scripts/lib/minifier.js').minifier(fs.readFileSync(path.join(RACINE, 'moteur', 'lottie.js'), 'utf8')).length;
  assert.ok(ecart < lecteur + JSON.stringify(animationEssai()).length + 2000, `écart ${ecart} o`);
});

test('contrôle : image externe refusée, expressions signalées', () => {
  const externe = animationEssai();
  externe.assets = [{ id: 'img_0', w: 10, h: 10, u: 'images/', p: 'img_0.png', e: 0 }];
  const r = assembler(projet('<div data-lottie="assets/lottie/balle.json"></div>', { anim: externe }));
  const e = r.erreurs.find((x) => x.regle === 'lottie-image-externe');
  assert.ok(e && e.gravite === 'erreur' && /images\/img_0\.png/.test(e.message), JSON.stringify(r.erreurs));
  assert.doesNotMatch(r.html, /pm-lottie-0/, 'aucun bloc pour une animation refusée');
  const expr = animationEssai();
  expr.layers[0].ks.r = { a: 0, k: 0, x: 'time * 90' };
  expr.layers.push({ ddd: 0, ind: 7, ty: 5, nm: 'titre', ip: 0, op: 60, st: 0, ks: {}, t: { d: { k: [] } } });
  expr.layers[1].shapes.push({ ty: 'rp', c: { a: 0, k: 3 } });
  const a = assembler(projet('<div data-lottie="assets/lottie/balle.json" data-start="0"></div>', { anim: expr, duree: 6 }));
  const regle = (n) => a.erreurs.find((x) => x.regle === n);
  assert.equal(regle('lottie-expressions').gravite, 'alerte');
  assert.match(regle('lottie-expressions').message, /ne bougeront pas/);
  assert.equal(regle('lottie-texte').gravite, 'alerte');
  assert.match(regle('lottie-non-pris').message, /répéteur/);
  assert.match(regle('lottie-trop-court').message, /4 s avant la fin/);
  assert.equal(a.ok, true);
  // En boucle, pas trop court ; lourd : alerte au-delà de 500 Ko, erreur au-delà de 2 Mo.
  assert.equal(assembler(projet('<div data-lottie="assets/lottie/balle.json" data-lottie-boucle="oui"></div>', { duree: 6 })).erreurs.find((x) => x.regle === 'lottie-trop-court'), undefined);
  const lourde = animationEssai();
  lourde.nm = 'x'.repeat(600 * 1024);
  assert.equal(assembler(projet('<div data-lottie="assets/lottie/balle.json"></div>', { anim: lourde })).erreurs.find((x) => x.regle === 'lottie-lourd').gravite, 'alerte');
  lourde.nm = 'x'.repeat(2200 * 1024);
  assert.equal(assembler(projet('<div data-lottie="assets/lottie/balle.json"></div>', { anim: lourde })).erreurs.find((x) => x.regle === 'lottie-lourd').gravite, 'erreur');
  // Fichier absent, vitesse illisible.
  assert.ok(assembler(projet('<div data-lottie="assets/lottie/absente.json"></div>')).erreurs.some((x) => x.regle === 'fichier-introuvable'));
  assert.ok(assembler(projet('<div data-lottie="assets/lottie/balle.json" data-lottie-vitesse="vite"></div>')).erreurs.some((x) => x.regle === 'lottie-invalide'));
});

test('lottie : crédits de la vidéo et imiter renvoie à l\'import', async () => {
  const dir = projet('<div data-lottie="assets/lottie/balle.json"></div>');
  const L2 = require('../scripts/lib/livrables.js');
  const { lireDeroule } = require('../scripts/lib/deroule.js');
  const sansSource = L2.credits({ projet: dir, deroule: lireDeroule(dir).deroule, assemblage: assembler(dir) });
  assert.match(sansSource.texte, /Animations Lottie\n- assets\/lottie\/balle\.json : /);
  assert.ok(sansSource.aPreciser.includes('assets/lottie/balle.json'));
  fs.writeFileSync(path.join(dir, 'assets', 'lottie', 'balle.licence.json'), JSON.stringify({ fichier: 'balle.json', source: 'LottieFiles', licence: 'Lottie Simple License' }));
  const avec = L2.credits({ projet: dir, deroule: lireDeroule(dir).deroule, assemblage: assembler(dir) });
  assert.match(avec.texte, /- assets\/lottie\/balle\.json : LottieFiles, Lottie Simple License/);
  assert.ok(!avec.aPreciser.includes('assets/lottie/balle.json'));
  const M = require('../scripts/lib/imiter.js');
  const r = await M.analyser({ projet: dir, source: 'assets/lottie/balle.json', navigateur: null });
  assert.equal(r.ok, false);
  assert.match(r.message, /telle quelle/);
  assert.match(r.conseil, /lottie importer/);
});
