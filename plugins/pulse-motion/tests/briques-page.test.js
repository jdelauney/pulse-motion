'use strict';
/* Spec « Lacunes créatives » (S9), plans S9-3 et S9-4, dans Chrome ou Edge sans fenêtre : texte sur un tracé, graisse lettre par
 * lettre, karaoké, Ken Burns, carte qui se retourne, boîtes projetées, QR code (taille des modules mesurée), contraste d'un texte
 * rempli d'une image, et export rapide = capture fidèle pour chaque brique. Une seule page, ouverte une fois. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { decoder, encoder } = require('../scripts/lib/png.js');
const T = require('../moteur/trace-texte.js');
const SEUILS = require('../scripts/seuils.json');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const CAPTURE = fs.readFileSync(path.join(RACINE, 'moteur', 'capture.js'), 'utf8');
const L = 640, H = 360;

const SCENES = [
  ['trace', 4, `<section data-scene="trace">
  <svg class="pm-sur-trace" viewBox="0 0 1000 400" style="position: absolute; left: 10%; top: 8%; width: 80%; color: #1d4ed8">
    <path id="arc-1" d="M50 350 Q500 0 950 350" fill="none"/>
    <text font-size="64" style="font-weight: 700"><textPath id="t1" href="#arc-1" data-texte="titre" data-start="0" data-sur-trace="defile 100→0 0+3 sine-inout"></textPath></text>
  </svg>
  <svg class="pm-sur-trace" viewBox="0 0 1000 200" style="position: absolute; left: 10%; top: 55%; width: 80%; color: #0f172a">
    <path id="ligne-1" d="M20 150 H980" fill="none"/>
    <text font-size="56"><textPath id="t2" href="#ligne-1" data-texte="mot" data-start="0.2" data-sur-trace="ecrit 0+2"></textPath></text>
  </svg>
  <svg class="pm-sur-trace" viewBox="0 0 1000 120" style="position: absolute; left: 10%; top: 78%; width: 80%; color: #b45309">
    <path id="ligne-2" d="M20 90 H980" fill="none"/>
    <text font-size="56"><textPath id="t3" href="#ligne-2" data-texte="mot" data-start="0.5" data-lettres="fondu"></textPath></text>
  </svg>
</section>`],
  ['graisse', 3, `<section data-scene="graisse">
  <h1 id="g" data-texte="titre" data-start="0.2" data-lettres="graisse" data-pas="0.08" style="position: absolute; left: 10%; top: 30%; margin: 0; font: 800 14cqh/1 'Inter'"></h1>
</section>`],
  ['remplis', 3, `<section data-scene="remplis">
  <h1 class="pm-texte-image" data-texte="titre" data-start="0.2" data-dur="2" data-tween="--pm-texte-image-x 0%→100% sine-inout" style="position: absolute; left: 8%; top: 12%; margin: 0; font: 900 18cqh/1 'Inter'; --pm-texte-image: repeating-linear-gradient(120deg, #1d4ed8 0 4cqh, #7c2d12 4cqh 8cqh)"></h1>
  <p class="pm-m-masque-doux" data-texte="mot" data-start="0.3" data-dur="1.5" style="position: absolute; left: 8%; top: 62%; margin: 0; font: 700 8cqh/1.2 'Inter'; color: #0f172a"></p>
</section>`],
  ['kb', 4, `<section data-scene="kb">
  <div id="cadre" data-ken-burns="avant 1.2" data-start="0.5" style="position: absolute; left: 30%; top: 30%; width: 40%; aspect-ratio: 16 / 9"><img id="photo" src="assets/photo.png" alt="Une photo"></div>
</section>`],
  ['carte', 3, `<section data-scene="carte">
  <div class="pm-espace-3d" style="position: absolute; left: 50%; top: 50%; width: 50cqh; height: 32cqh; translate: -50% -50%">
    <div class="pm-m-retourne" data-start="1" style="width: 100%; height: 100%">
      <div class="pm-3d-face" style="background: rgb(200, 0, 0)"></div>
      <div class="pm-3d-face pm-3d-verso" style="background: rgb(0, 0, 200)"></div>
    </div>
  </div>
  <div class="pm-espace-3d" style="position: absolute; left: 4%; top: 10%; width: 40cqh; height: 20cqh">
    <div id="tourne" style="width: 100%; height: 100%; background: rgb(0, 140, 0); transform: rotateY(60deg)"></div>
  </div>
</section>`],
  ['cube', 4, `<section data-scene="cube">
  <div class="pm-espace-3d" style="position: absolute; left: 50%; top: 50%; width: 30cqh; height: 30cqh; translate: -50% -50%">
    <div class="pm-m-cube" data-start="0.2" style="--pm-cube-pas: 0.8s">
      <div style="background: rgb(200, 0, 0)"></div><div style="background: rgb(0, 140, 0)"></div><div style="background: rgb(0, 0, 200)"></div><div style="background: rgb(220, 180, 0)"></div>
    </div>
  </div>
</section>`],
  ['incline', 3, `<section data-scene="incline">
  <div class="pm-3d" data-start="0.2" style="--pm-3d-pose: rotateX(22deg) rotateZ(-8deg); position: absolute; left: 25%; top: 22%; width: 90cqh; height: 52cqh; border-radius: 1.5cqh; background: rgb(0, 90, 200); display: grid; place-items: center"><h2 data-texte="mot" style="margin: 0; color: #fff"></h2></div>
</section>`],
  ['qr', 6, `<section data-scene="qr">
  <svg id="grand" data-qr="lien" class="pm-qr-compose" data-start="0.3" style="position: absolute; left: 10%; top: 20%; width: 40cqh; height: 40cqh"></svg>
  <svg id="petit" data-qr="lien" data-start="0.3" style="position: absolute; left: 60%; top: 20%; width: 15.2cqh; height: 15.2cqh"></svg>
</section>`],
  ['pale', 3, `<section data-scene="pale" style="background: #ffffff">
  <h1 id="clair" class="pm-texte-image" data-texte="titre" data-start="0.2" style="position: absolute; left: 8%; top: 10%; margin: 0; font: 900 16cqh/1 'Inter'; --pm-texte-image: linear-gradient(#f1f1f1, #fbfbfb)"></h1>
  <h1 id="fonce" class="pm-texte-image" data-texte="titre" data-start="0.2" style="position: absolute; left: 8%; top: 55%; margin: 0; font: 900 16cqh/1 'Inter'; --pm-texte-image: linear-gradient(#111827, #1e293b)"></h1>
</section>`],
];

function preparer() {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  // Photo de 800 × 450 : à 40 % de la largeur, elle tient sans zoom (768 px à l'export), pas au zoom final de 1,2.
  const l = 800, h = 450, donnees = Buffer.alloc(l * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) { const k = (y * l + x) * 3; donnees[k] = x % 256; donnees[k + 1] = y % 256; donnees[k + 2] = 120; }
  fs.writeFileSync(path.join(dir, 'assets', 'photo.png'), encoder({ largeur: l, hauteur: h, canaux: 3, donnees }));
  SCENES.forEach(([id, , html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => {
    d.style = 'clair-pedagogique';
    delete d.charte;
    d.sousTitres = { mode: 'karaoke' };
    d.scenes = SCENES.map(([id, duree], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, transition: 'coupe',
      textes: { titre: 'Chaîne du froid', mot: 'Toujours au frais', lien: 'https://exemple.fr' },
      ...(id === 'trace' ? { voix: { texte: 'Le froid garde les aliments sains.' } } : {}) }));
  });
  const r = assembler({ dossier: dir, ecrire: false, groupes: 'tous' });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, r.html);
  const debuts = {};
  r.minutage.scenes.forEach((s) => { debuts[s.id] = s.debut; });
  return { fichier, debuts, donnees: r.donnees };
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
  return { ecart: somme / (n * 3 * 255), fidele };
}
async function memeExport(scene, instants) {
  for (const dt of instants) {
    const t = contexte.debuts[scene] + dt;
    const { ecart: e } = await ecart(t);
    assert.ok(e <= 0.01, `${scene}, t = ${t} s : écart moyen ${(100 * e).toFixed(3)} %`);
  }
}
const pixel = (img, x, y) => { const k = (Math.round(y) * img.largeur + Math.round(x)) * img.canaux; return [img.donnees[k], img.donnees[k + 1], img.donnees[k + 2]]; };

// --- Typographie -----------------------------------------------------------------------------------------------------------

test('tracé : startOffset et lettres écrites suivent t, identiques à l\'aller et au retour (seek)', { ...SANS, timeout: 120000 }, async () => {
  const spec = T.analyserSurTrace('defile 100→0 0+3 sine-inout');
  const e = T.analyserSurTrace('ecrit 0+2');
  const d = contexte.debuts.trace;
  const vus = [];
  for (const dt of [0.6, 1.4, 2.2, 3.5, 1.4, 0.6]) {
    const v = await lire(d + dt, `(function () {
      var t2 = document.getElementById('t2');
      return { offset: document.getElementById('t1').getAttribute('startOffset'),
        ecrites: Array.prototype.filter.call(t2.querySelectorAll('tspan'), function (s) { return s.getAttribute('fill-opacity') === '1'; }).length,
        lettres: Array.prototype.filter.call(t2.querySelectorAll('tspan'), function (s) { return /\\S/.test(s.textContent); }).length };
    })()`);
    assert.equal(v.offset, `${T.valeurSurTrace(spec, dt)}%`, `startOffset à ${dt} s`);
    assert.equal(v.ecrites, T.lettresEcrites(e, dt - 0.2, v.lettres), `lettres écrites à ${dt} s`);
    vus.push(v);
  }
  assert.deepEqual(vus.slice(0, 2), vus.slice(4).reverse(), 'aller et retour');
  // Lettres en fondu sur un tracé : des <tspan>, rien d'autre.
  const fondu = await page.evaluer(`(function () { var t = document.getElementById('t3'); return { tspans: t.querySelectorAll('tspan.pm-lettre').length, spans: t.querySelectorAll('span').length }; })()`);
  assert.ok(fondu.tspans >= 10 && fondu.spans === 0, JSON.stringify(fondu));
  const erreurs = await page.evaluer('M.erreurs.filter(function (e) { return /lettres|trace/.test(e.regle); })');
  assert.deepEqual(erreurs, []);
});

test('lettres : effet graisse, valeur de chaque lettre identique à l\'aller et au retour', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.graisse;
  const graisses = (t) => lire(t, `Array.prototype.map.call(document.querySelectorAll('#g .pm-lettre'), function (l) { return getComputedStyle(l).fontVariationSettings; })`);
  const milieu = await graisses(d + 0.6);
  const fin = await graisses(d + 2.9);
  await graisses(d + 0.1);
  assert.deepEqual(await graisses(d + 0.6), milieu, 'retour au même instant');
  assert.ok(new Set(milieu).size > 1, `cascade : ${milieu.join(' | ')}`);
  assert.ok(fin.every((v) => v === '"wght" 800'), fin.join(' | '));
  const depart = await page.evaluer(`document.getElementById('g').style.getPropertyValue('--pm-graisse-min')`);
  assert.equal(depart, '100', 'graisse la plus fine d\'Inter');
});

test('karaoké : remplissage du mot calé sur ses temps, identique à l\'aller et au retour', { ...SANS, timeout: 120000 }, async () => {
  const mot = contexte.donnees.sousTitres.cartons[0].lignes[0][1];
  const avance = (t) => lire(t, `(function () { var m = document.querySelectorAll('#pm-sous-titres .pm-st-mot')[1]; return m ? m.style.getPropertyValue('--pm-st-avance') : null; })()`);
  assert.equal(await avance(mot.t0 - 0.01), '0');
  assert.equal(await avance((mot.t0 + mot.t1) / 2), '0.5');
  assert.equal(await avance(mot.t1 + 0.01), '1');
  assert.equal(await avance((mot.t0 + mot.t1) / 2), '0.5');
  const fond = await page.evaluer(`getComputedStyle(document.querySelectorAll('#pm-sous-titres .pm-st-mot')[1]).backgroundClip`);
  assert.match(fond, /text/);
});

test('masque doux : opacité du masque fonction de --p, identique à l\'aller et au retour', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.remplis;
  const masque = (t) => lire(t, `(function () { var p = document.querySelector('#pm-scene .pm-m-masque-doux'); return [p.style.getPropertyValue('--p'), getComputedStyle(p).maskImage || getComputedStyle(p).webkitMaskImage]; })()`);
  const a = await masque(d + 0.8);
  const b = await masque(d + 2.5);
  assert.notDeepEqual(a, b);
  assert.deepEqual(await masque(d + 0.8), a);
  assert.match(a[1], /linear-gradient/);
  assert.equal(b[0], '1');
});

test('texte-image : lettre par lettre, chaque lettre porte sa portion de l\'image', { ...SANS, timeout: 120000 }, async () => {
  const r = await page.evaluer(`(function () {
    var h = document.createElement('h1'); h.className = 'pm-texte-image'; h.setAttribute('data-lettres', 'frappe'); h.textContent = 'ABCD';
    h.style.setProperty('--pm-texte-image', 'linear-gradient(90deg, red, blue)');
    document.querySelector('section[data-scene="remplis"]').appendChild(h);
    M.decouper(h.parentElement, 'remplis', null);
    var l = h.querySelectorAll('.pm-lettre');
    var r = Array.prototype.map.call(l, function (x) { var cs = getComputedStyle(x); return [cs.backgroundPositionX, cs.backgroundSize, cs.backgroundClip || cs.webkitBackgroundClip]; });
    h.remove();
    return r;
  })()`);
  assert.equal(r.length, 4);
  assert.deepEqual(r.map((x) => x[0]), ['0%', '33.3333%', '66.6667%', '100%']);
  assert.ok(r.every((x) => /400%/.test(x[1]) && /text/.test(x[2])), JSON.stringify(r));
});

test('contrôle : le contraste d\'un texte sur tracé est mesuré (fill suit color) ; un texte rempli d\'une photo claire sur fond clair est signalé', { ...SANS, timeout: 180000 }, async () => {
  const fill = await page.evaluer(`getComputedStyle(document.querySelector('#t1').closest('text')).fill`);
  assert.equal(fill, 'rgb(29, 78, 216)', 'le texte du tracé prend la couleur color');
  const constats = await page.evaluer(`M.mesurerPixels({ ratio: '16:9', seuils: ${JSON.stringify(SEUILS)}, scenes: ['pale', 'remplis'], flashs: false })`);
  const pale = constats.filter((c) => c.regle === 'contraste-reel' && c.scene === 'pale');
  assert.deepEqual(pale.map((c) => c.element), ['clair'], JSON.stringify(constats));
  assert.ok(pale[0].valeur < 1.5, `contraste ${pale[0].valeur}`);
  assert.deepEqual(constats.filter((c) => c.regle === 'contraste-reel' && c.scene === 'remplis'), [], JSON.stringify(constats));
});

// --- Ken Burns, 2,5D, QR -------------------------------------------------------------------------------------------------------

test('ken burns : l\'image avance de son apparition à la fin de la scène, la même image à chaque rendu', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.kb;
  const etat = (t) => lire(t, `(function () { var i = document.getElementById('photo'); return [i.style.transform, i.__pmKenBurns && i.__pmKenBurns.zoom, i.__pmKenBurns && i.__pmKenBurns.zoomMax, i.getAttribute('data-pm-kb')]; })()`);
  const debut = await etat(d + 0.4);
  const milieu = await etat(d + 2);
  const fin = await etat(d + 3.99);
  assert.equal(debut[1], 1);
  assert.ok(milieu[1] > 1 && milieu[1] < 1.2, `zoom au milieu ${milieu[1]}`);
  assert.ok(Math.abs(fin[1] - 1.2) < 0.001, `zoom final ${fin[1]}`);
  assert.equal(fin[2], 1.2);
  assert.equal(fin[3], 'avant');
  assert.deepEqual(await etat(d + 2), milieu);
});

test('contrôle : image trop petite pour le zoom final signalée (avec la règle de S2)', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.kb;
  // Relevés pris au début du mouvement seulement : le zoom final compte quand même.
  const constats = await page.evaluer(`M.mesurer({ ratio: '16:9', seuils: ${JSON.stringify(SEUILS)}, plages: [[${d + 0.4}, ${d + 1}]] })`);
  const a = constats.filter((c) => c.regle === 'image-agrandie' && c.scene === 'kb');
  assert.equal(a.length, 1, JSON.stringify(constats.map((c) => c.regle)));
  assert.ok(a[0].valeur.kenBurns && a[0].valeur.f > 1.12 && a[0].valeur.f < 1.2, JSON.stringify(a[0]));
});

test('3d : carte retournée, face visible correcte à 0°, 90° + ε et 180°', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.carte;
  const centre = async (t) => pixel(decoder(await page.capturer(t)), L / 2, H / 2);
  const rouge = (c) => c[0] > 150 && c[2] < 60;
  const bleu = (c) => c[2] > 150 && c[0] < 60;
  assert.ok(rouge(await centre(d + 0.5)), 'recto à 0°');
  assert.ok(bleu(await centre(d + 1.45)), 'verso passé 90°');
  assert.ok(bleu(await centre(d + 2.5)), 'verso à 180°');
});

test('3d : mesures des boîtes projetées justes pour un élément tourné de 60°', { ...SANS, timeout: 120000 }, async () => {
  const r = await lire(contexte.debuts.carte + 0.5, `(function () { var b = document.getElementById('tourne').getBoundingClientRect(); var s = document.getElementById('pm-scene').getBoundingClientRect(); return [b.width, b.height, s.height]; })()`);
  const cqh = r[2] / 100;
  const w = 40 * cqh, h = 20 * cqh, p = 150 * cqh;
  const z = (w / 2) * Math.sin(Math.PI / 3);
  const largeur = (w / 4) * p * (1 / (p + z) + 1 / (p - z));
  const hauteur = h * p / (p - z);
  assert.ok(Math.abs(r[0] - largeur) < 1.5, `largeur ${r[0]} (attendue ${largeur})`);
  assert.ok(Math.abs(r[1] - hauteur) < 1.5, `hauteur ${r[1]} (attendue ${hauteur})`);
});

test('contrôle : module de 5 px refusé (QR mesuré à la taille d\'export)', { ...SANS, timeout: 120000 }, async () => {
  const d = contexte.debuts.qr;
  const constats = await page.evaluer(`M.mesurer({ ratio: '16:9', seuils: ${JSON.stringify(SEUILS)}, plages: [[${d}, ${d + 5.9}]] })`);
  const petits = constats.filter((c) => c.regle === 'qr-trop-petit');
  assert.deepEqual(petits.map((c) => c.element), ['petit'], JSON.stringify(constats.map((c) => [c.regle, c.element])));
  assert.ok(petits[0].valeur.px >= 4.9 && petits[0].valeur.px < 5.1, JSON.stringify(petits[0]));
});

// --- Export rapide = capture fidèle --------------------------------------------------------------------------------------------

test('export rapide : texte sur tracé identique à l\'export fidèle', { ...SANS, timeout: 180000 }, async () => {
  await memeExport('trace', [0.3, 1, 1.7, 2.4, 3.6]);
});

test('export rapide : graisse animée identique à l\'export fidèle', { ...SANS, timeout: 180000 }, async () => {
  await memeExport('graisse', [0.3, 0.6, 0.9, 1.4, 2.8]);
});

test('export rapide : texte-image et masque doux identiques à l\'export fidèle', { ...SANS, timeout: 180000 }, async () => {
  await memeExport('remplis', [0.4, 0.9, 1.3, 1.9, 2.8]);
});

test('export rapide : remplissage du mot identique à l\'export fidèle', { ...SANS, timeout: 180000 }, async () => {
  const c = contexte.donnees.sousTitres.cartons[0];
  const instants = [0, 0.2, 0.4, 0.6, 0.8].map((k) => c.debut + k * (c.fin - c.debut) - contexte.debuts.trace);
  await memeExport('trace', instants);
});

test('export rapide : QR identique à l\'export fidèle, bords nets', { ...SANS, timeout: 180000 }, async () => {
  await memeExport('qr', [0.35, 0.6, 1, 2, 5]);
  // Bords nets : dans le grand code, presque aucun pixel gris (ni noir ni blanc).
  const { fidele } = await ecart(contexte.debuts.qr + 3);
  const boite = await page.evaluer(`(function () { var b = document.getElementById('grand').getBoundingClientRect(), s = document.getElementById('pm-scene').getBoundingClientRect(); return [b.left - s.left, b.top - s.top, b.width, b.height]; })()`);
  let gris = 0, total = 0;
  for (let y = Math.ceil(boite[1]) + 1; y < boite[1] + boite[3] - 1; y++) {
    for (let x = Math.ceil(boite[0]) + 1; x < boite[0] + boite[2] - 1; x++) {
      const c = pixel(fidele, x, y);
      total++;
      if (c[0] > 40 && c[0] < 215) gris++;
    }
  }
  assert.ok(gris / total < 0.02, `${gris} pixels gris sur ${total}`);
});

test('export rapide : cube et carte identiques à l\'export fidèle, ou règle de refus active', { ...SANS, timeout: 240000 }, async () => {
  const { controlerBriques } = require('../scripts/lib/briques.js');
  for (const [scene, instants] of [['carte', [0.5, 1.2, 1.4, 1.6, 2.5]], ['cube', [0.1, 0.5, 1.1, 2, 3.5]]]) {
    let max = 0;
    for (const dt of instants) max = Math.max(max, (await ecart(contexte.debuts[scene] + dt)).ecart);
    if (max <= 0.01) continue;
    // L'export rapide aplatit l'espace en perspective : la règle signale la scène (et l'export rapide la refuse, briques.test.js).
    const html = SCENES.find((s) => s[0] === scene)[2];
    const regles = controlerBriques({ deroule: {}, scene: { id: scene, textes: {} }, html, min: null, seuils: SEUILS }).map((p) => p.regle);
    assert.ok(regles.includes('trois-d-export-rapide'), `${scene} : écart ${(100 * max).toFixed(2)} % sans règle de refus`);
  }
  // La perspective écrite dans transform (écran incliné, #139) passe par l'export rapide.
  await memeExport('incline', [0.1, 0.5, 0.9, 1.3, 2.5]);
});
