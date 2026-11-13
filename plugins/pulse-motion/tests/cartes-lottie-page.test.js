'use strict';
/* Spec « Lacunes créatives » (S9), plans S9-6 et S9-7, dans Chrome ou Edge sans fenêtre : une carte avec une liaison tracée et
 * une animation Lottie (masque, cache, tracé tronqué), l'image calculée de t seul (aller et retour), et export rapide = capture
 * fidèle sur 5 instants pour chacune. Une seule page, ouverte une fois. Fonds de carte d'essai (tests/aide/fonds-essai.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decoder } = require('../scripts/lib/png.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { fondsEssai } = require('./aide/fonds-essai.js');
const { animationEssai } = require('./aide/lottie-essai.js');
const Lm = require('../moteur/lottie.js');

const RACINE = path.join(__dirname, '..');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const CAPTURE = fs.readFileSync(path.join(RACINE, 'moteur', 'capture.js'), 'utf8');
const L = 640, H = 360;

const SCENES = [
  ['carte', 4, `<section data-scene="carte">
  <style>@scope { .pm-liaison { stroke-dasharray: 100; stroke-dashoffset: calc(100 * (1 - var(--p))); } }</style>
  <svg data-carte="monde" data-carte-pays="FR,DE" data-carte-cadre="europe" style="position: absolute; inset: 0; width: 100%; height: 100%">
    <path data-pays="ES" data-start="0.3" data-dur="1" data-tween="--pm-surligne 0→1"></path>
    <g data-repere="Berlin" data-start="0.5"><text data-texte="ville" dy="-0.8em"></text></g>
    <path id="vol" data-liaison="Paris→Madrid" data-start="0.6" data-dur="2"></path>
  </svg>
</section>`],
  ['lottie', 3, `<section data-scene="lottie">
  <div id="anim" data-lottie="assets/lottie/essai.json" data-start="0.4" style="position: absolute; left: 50%; top: 50%; width: 70cqh; height: 70cqh; translate: -50% -50%"></div>
</section>`],
];

function preparer() {
  process.env.PM_CARTES_DOSSIER = fondsEssai().dossier;
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets', 'lottie'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'lottie', 'essai.json'), JSON.stringify(animationEssai()));
  SCENES.forEach(([id, , html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => {
    d.style = 'clair-pedagogique';
    delete d.charte;
    d.scenes = SCENES.map(([id, duree], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, transition: 'coupe', textes: { ville: 'Berlin' } }));
  });
  const r = require('../scripts/assembler.js').assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.ok(r.groupes.includes('cartes') && r.groupes.includes('lottie'), r.groupes.join(','));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, r.html);
  const debuts = {};
  r.minutage.scenes.forEach((s) => { debuts[s.id] = s.debut; });
  return { fichier, debuts };
}

let page = null;
let contexte = null;
test.before(async () => {
  if (!navigateur) return;
  contexte = preparer();
  const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
  page = await ouvrirCapture({ fichierHtml: contexte.fichier, largeur: L, hauteur: H, navigateur, delai: 60000 });
  await page.evaluer(`${CAPTURE}; true`);
});
test.after(async () => { if (page) await page.fermer(); });

const seek = (t) => page.evaluer(`M.seek(${t}).then(function () { return true; })`);
const lire = async (t, code) => { await seek(t); return page.evaluer(code); };

/** Écart moyen (0 à 1) entre la capture fidèle et l'export rapide à l'instant t. */
async function ecart(t) {
  const fidele = decoder(await page.capturer(t));
  const rapide = decoder(Buffer.from(await page.evaluer(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = ${L}; canvas.height = ${H};
    await M.capturer(canvas.getContext('2d'), ${L}, ${H});
    return canvas.toDataURL('image/png').split(',')[1];
  })()`), 'base64'));
  assert.deepEqual([rapide.largeur, rapide.hauteur], [fidele.largeur, fidele.hauteur]);
  let somme = 0;
  const n = fidele.largeur * fidele.hauteur;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) somme += Math.abs(fidele.donnees[i * fidele.canaux + k] - rapide.donnees[i * rapide.canaux + k]);
  return somme / (n * 3 * 255);
}
async function memeExport(scene, instants) {
  for (const dt of instants) {
    const t = contexte.debuts[scene] + dt;
    const e = await ecart(t);
    assert.ok(e <= 0.01, `${scene}, t = ${t} s : écart moyen ${(100 * e).toFixed(3)} %`);
  }
}

test('carte : pays, repère et liaison posés ; la liaison se trace avec t', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.carte;
  const etat = (t) => lire(t, `(function () {
    var v = document.getElementById('vol');
    return { offset: getComputedStyle(v).strokeDashoffset, pays: document.querySelectorAll('svg.pm-carte .pm-pays').length,
      fond: document.querySelectorAll('svg.pm-carte .pm-pays-fond').length, texte: document.querySelector('svg.pm-carte text').textContent,
      erreurs: M.erreurs.length };
  })()`);
  const debut = await etat(d + 0.5), milieu = await etat(d + 1.6), fin = await etat(d + 3.5), retour = await etat(d + 1.6);
  assert.equal(debut.pays, 3);
  assert.ok(debut.fond >= 1);
  assert.equal(debut.texte, 'Berlin');
  assert.deepEqual([debut.erreurs], [0]);
  assert.ok(parseFloat(debut.offset) > parseFloat(milieu.offset) && parseFloat(milieu.offset) > parseFloat(fin.offset), JSON.stringify([debut, milieu, fin]));
  assert.deepEqual(retour, milieu, 'aller et retour');
});

test('lottie : l\'image de la page suit t, identique à l\'aller et au retour', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.lottie;
  const svg = (t) => lire(t, 'document.getElementById("anim").innerHTML');
  const vus = [];
  for (const dt of [0.2, 0.9, 1.7, 2.6, 1.7, 0.9, 0.2]) vus.push(await svg(d + dt));
  assert.deepEqual(vus.slice(0, 3), vus.slice(4).reverse());
  assert.notEqual(vus[1], vus[2]);
  // Avant son départ (0,4 s), la première image ; à 0,9 s, l'image 15 : la balle au milieu.
  const a = animationEssai();
  assert.match(vus[0], /matrix\(1 0 0 1 50 60\)/);
  assert.equal(Lm.imageLottie(a, 0.5), 15);
  assert.match(vus[1], /matrix\(1 0 0 1 100 60\)/);
  assert.ok((await page.evaluer('document.querySelectorAll("#anim svg").length')) === 1);
});

test('export rapide : carte avec liaison tracée identique à l\'export fidèle', { ...SANS, timeout: 240000 }, async () => {
  await memeExport('carte', [0.2, 0.9, 1.5, 2.2, 3.6]);
});

test('export rapide : animation Lottie identique à l\'export fidèle sur 5 instants', { ...SANS, timeout: 240000 }, async () => {
  await memeExport('lottie', [0.2, 0.7, 1.2, 1.8, 2.7]);
});
