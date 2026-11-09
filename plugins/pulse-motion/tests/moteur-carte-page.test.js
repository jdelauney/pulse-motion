'use strict';
/* Pages et moteur dans le navigateur (spec Rapidité 5.19 à 5.21) : mêmes images avec le moteur à la carte ou entier, minifié
 * ou brut, avec le rendu paresseux et les écritures différentielles ou sans ; scène qui redevient visible ; images et
 * polices attendues par M.seek. Comparaisons exactes des pixels capturés (PNG décodés). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { assembler, RACINE } = require('../scripts/assembler.js');
const { decoderPNG } = require('../scripts/logo.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const LARGEUR = 480;
const HAUTEUR = 270;
const TEMOIN_3_MIN = path.join(RACINE, '..', '..', 'outils', 'mesures', 'temoins', 'trois-minutes');

/** Empreinte des pixels décodés d'un PNG (deux PNG aux mêmes pixels ont la même empreinte). */
function empreintePixels(png) {
  const i = decoderPNG(png);
  const h = crypto.createHash('sha256');
  const ligne = Buffer.alloc(i.largeur * 4);
  for (let y = 0; y < i.hauteur; y++) {
    for (let x = 0; x < i.largeur; x++) Buffer.from(i.pixel(x, y)).copy(ligne, x * 4);
    h.update(ligne);
  }
  return h.digest('hex');
}

const SCENE_PERSONNAGE = `<section data-scene="chiffre">
  <p data-texte="legende" data-start="0.5"></p>
  <div id="chef" data-personnage="touffu" data-x="-10" data-sol="92" data-taille="50">
    <i id="entree" data-action="marcher" data-vers="30" data-start="0" data-dur="1.2"></i>
    <i id="montre" data-action="pose" data-pose="montrer" data-start="#entree:fin" data-dur="0.8"></i>
    <i data-action="jouer" data-clip="coucou" data-start="#montre:fin"></i>
  </div>
</section>`;

/** Projets d'essai : simple (tronc seul), avec personnage et bruitage, chaîne du froid (effets). -> [{ nom, dossier, gpu }] */
function projets() {
  const perso = copierProjet('projet-simple');
  fs.writeFileSync(path.join(perso, 'scenes', '02-chiffre.html'), SCENE_PERSONNAGE.replace('data-start="0.5"', 'data-start="0.5" data-son="pop"'));
  return [
    { nom: 'simple', dossier: copierProjet('projet-simple'), gpu: false },
    { nom: 'personnage', dossier: perso, gpu: false },
    { nom: 'chaine-du-froid', dossier: path.join(RACINE, 'exemples', 'chaine-du-froid'), styles: null, gpu: true },
  ];
}

/** Page assemblée écrite dans un dossier temporaire. */
function ecrirePage(html) {
  const f = path.join(dossierTemporaire('pm-carte-'), 'page.html');
  fs.writeFileSync(f, html);
  return f;
}

/** Empreintes des images capturées aux instants donnés (dans cet ordre) ; avant : code évalué dans la page d'abord. */
async function capturer(html, instants, { gpu = false, avant = null } = {}) {
  const c = await ouvrirCapture({ fichierHtml: ecrirePage(html), largeur: LARGEUR, hauteur: HAUTEUR, navigateur, gpu, delai: 60000 });
  try {
    if (avant) await c.evaluer(avant);
    const r = [];
    for (const t of instants) r.push(empreintePixels(await c.capturer(t)));
    return r;
  } finally {
    await c.fermer();
  }
}

const assembler1 = (p, options = {}) => {
  const r = assembler({ dossier: p.dossier, ...(p.styles === null ? {} : { dossierStyles: STYLES }), ecrire: false, ...options });
  assert.ok(r.ok, JSON.stringify(r.erreurs));
  return r;
};

/** Cinq instants répartis dans la vidéo (débuts de scène compris). */
function cinqInstants(r) {
  const duree = r.donnees.scenes.reduce((s, x) => s + x.duree, 0);
  return [0.35, 0.21 * duree, 0.47 * duree, 0.72 * duree, Math.max(0, duree - 0.6)].map((t) => Math.round(t * 30) / 30);
}

test('moteur-a-la-carte-memes-images : moteur à la carte et moteur entier, mêmes pixels à 5 instants', { ...sans, timeout: 240000 }, async () => {
  for (const p of projets()) {
    const carte = assembler1(p);
    const entier = assembler1(p, { groupes: 'tous' });
    assert.notEqual(carte.moteur.length, entier.moteur.length);
    const instants = cinqInstants(carte);
    assert.deepEqual(await capturer(carte.html, instants, { gpu: p.gpu }), await capturer(entier.html, instants, { gpu: p.gpu }), p.nom);
  }
});

test('moteur-minifie-memes-images : moteur minifié et moteur brut, mêmes pixels à 5 instants', { ...sans, timeout: 240000 }, async () => {
  const avant = process.env.PM_MOTEUR_BRUT;
  try {
    for (const p of projets()) {
      delete process.env.PM_MOTEUR_BRUT;
      const min = assembler1(p);
      process.env.PM_MOTEUR_BRUT = '1';
      const brut = assembler1(p);
      assert.ok(brut.moteur.length > min.moteur.length);
      const instants = cinqInstants(min);
      assert.deepEqual(await capturer(min.html, instants, { gpu: p.gpu }), await capturer(brut.html, instants, { gpu: p.gpu }), p.nom);
    }
  } finally {
    if (avant === undefined) delete process.env.PM_MOTEUR_BRUT; else process.env.PM_MOTEUR_BRUT = avant;
  }
});

test('moteur-absents-sans-erreur : une page au tronc seul démarre et se rend sans erreur', { ...sans, timeout: 60000 }, async () => {
  const r = assembler1({ dossier: copierProjet('projet-simple') });
  assert.deepEqual(r.groupes, ['tronc']);
  const page = await ouvrirPage({ navigateur, largeur: LARGEUR, hauteur: HAUTEUR });
  try {
    await page.aller(pathToFileURL(ecrirePage(r.html.replace('<head>', '<head><script>window.__erreurs = []; addEventListener("error", function (e) { __erreurs.push(String(e.message)); });</script>'))).href);
    const etat = await page.evaluer(`M.pret.then(function () { return M.seek(2.5); }).then(function () {
      return { erreurs: window.__erreurs, groupes: M.groupes, personnages: typeof M.demarrerPersonnages, particules: typeof M.particules,
        sonReactif: typeof M.demarrerSonReactif, synthe: typeof M.synthe, mesurer: typeof M.mesurer, aSon: M.aSon(), duree: M.duree };
    })`);
    assert.deepEqual(etat.erreurs, []);
    assert.deepEqual(etat.groupes, ['tronc']);
    assert.deepEqual([etat.personnages, etat.sonReactif, etat.particules, etat.synthe, etat.mesurer], ['function', 'function', 'undefined', 'undefined', 'undefined']);
    assert.equal(etat.aSon, false);
    assert.ok(etat.duree > 5);
  } finally {
    await page.fermer();
  }
});

const SANS_PARESSE = 'M.reglagesRendu.paresseux = false; true';
const SANS_DIFFERENTIEL = 'M.reglagesRendu.differentiel = false; true';

/** Instants de toute la vidéo, à pas réguliers, et les mêmes à l'envers. */
function instantsAller(r, nombre) {
  const duree = r.donnees.scenes.reduce((s, x) => s + x.duree, 0);
  return Array.from({ length: nombre }, (_, k) => Math.round(((k + 0.5) * duree / nombre) * 30) / 30);
}

async function memesImages(html, instants, avant, gpu, nom) {
  for (const ordre of [instants, [...instants].reverse()]) {
    assert.deepEqual(await capturer(html, ordre, { gpu }), await capturer(html, ordre, { gpu, avant }), nom);
  }
}

test('rendu-paresseux-memes-images : seules les scènes visibles rendues, mêmes pixels, à l\'endroit et à l\'envers', { ...sans, timeout: 480000 }, async () => {
  const liste = projets();
  if (fs.existsSync(path.join(TEMOIN_3_MIN, 'deroule.json'))) liste.push({ nom: 'trois-minutes', dossier: TEMOIN_3_MIN, styles: null, gpu: true });
  for (const p of liste) {
    const r = assembler1(p);
    await memesImages(r.html, instantsAller(r, p.nom === 'trois-minutes' ? 24 : 10), SANS_PARESSE, p.gpu, p.nom);
  }
});

test('ecritures-differentielles-memes-images : seules les valeurs changées écrites, mêmes pixels, à l\'endroit et à l\'envers', { ...sans, timeout: 240000 }, async () => {
  for (const p of projets()) {
    const r = assembler1(p);
    await memesImages(r.html, instantsAller(r, 10), SANS_DIFFERENTIEL, p.gpu, p.nom);
  }
});

test('rendu-scene-redevenue-visible-juste : une scène qui revient après avoir été masquée est rendue juste', { ...sans, timeout: 120000 }, async () => {
  const p = projets()[1];
  const r = assembler1(p);
  // Scène « chiffre » (après « intro ») : vue à 6 s, puis masquée (retour dans « intro »), puis revue à 5,5 s.
  const page = await ouvrirPage({ navigateur, largeur: LARGEUR, hauteur: HAUTEUR });
  try {
    await page.aller(pathToFileURL(ecrirePage(r.html)).href);
    const etat = (t) => page.evaluer(`M.pret.then(function () { return M.seek(${t}); }).then(function () {
      var s = document.querySelector('section[data-scene="chiffre"]');
      return { display: s.style.display, p: Array.prototype.map.call(s.querySelectorAll('[data-pm-cle]'), function (e) { return e.style.getPropertyValue('--p') + '/' + e.getAttribute('data-etat'); }).join(' '),
        opacite: s.style.opacity, html: s.innerHTML.length };
    })`);
    await etat(6);
    const masquee = await etat(0.5);
    assert.equal(masquee.display, 'none');
    const revue = await etat(5.5);
    const neuve = await ouvrirPage({ navigateur, largeur: LARGEUR, hauteur: HAUTEUR });
    try {
      await neuve.aller(pathToFileURL(ecrirePage(r.html)).href);
      const attendu = await neuve.evaluer(`M.pret.then(function () { M.reglagesRendu.paresseux = false; return M.seek(5.5); }).then(function () {
        var s = document.querySelector('section[data-scene="chiffre"]');
        return { display: s.style.display, p: Array.prototype.map.call(s.querySelectorAll('[data-pm-cle]'), function (e) { return e.style.getPropertyValue('--p') + '/' + e.getAttribute('data-etat'); }).join(' '),
          opacite: s.style.opacity, html: s.innerHTML.length };
      })`);
      assert.deepEqual(revue, attendu);
    } finally {
      await neuve.fermer();
    }
  } finally {
    await page.fermer();
  }
  // Et en images : la même scène, vue directement ou après un détour par une autre scène.
  const directe = await capturer(r.html, [5.5]);
  const detour = await capturer(r.html, [6, 0.5, 2, 5.5]);
  assert.equal(detour[3], directe[0]);
  // M.tenirAJour : une scène tenue à jour est rendue même masquée.
  const tenue = await capturer(r.html, [0.5, 5.5], { avant: 'M.tenirAJour("chiffre"); true' });
  assert.equal(tenue[1], directe[0]);
});

// ---------- 5.21 Images décodées avant la capture ----------

const PIXEL = (couleur) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${couleur}"/></svg>`).toString('base64')}`;

test('seek-attend-images-changees : une <img> dont la source change pendant le rendu est décodée avant la fin de M.seek', { ...sans, timeout: 60000 }, async () => {
  const dir = copierProjet('projet-simple');
  const sources = ['#e53935', '#43a047', '#1e88e5', '#fdd835'].map(PIXEL);
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), `<section data-scene="chiffre">
  <p data-texte="legende" data-start="0.5"></p>
  <img id="seq" alt="" style="position:absolute;left:0;top:0;width:50%;height:50%">
  <script>var SOURCES = ${JSON.stringify(sources)};
  M.chaqueImage('chiffre', function (p, t) { document.getElementById('seq').src = SOURCES[Math.floor(t * 4) % 4]; });</script>
</section>`);
  const r = assembler1({ dossier: dir });
  const page = await ouvrirPage({ navigateur, largeur: LARGEUR, hauteur: HAUTEUR });
  try {
    await page.aller(pathToFileURL(ecrirePage(r.html)).href);
    const etats = await page.evaluer(`(async function () {
      await M.pret;
      var vues = [];
      var decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () { var img = this, s = img.src; return decode.call(img).then(function () { vues.push(s); }); };
      var r = [];
      for (var t of [4.1, 4.35, 4.6, 4.85]) {
        await M.seek(t);
        var img = document.getElementById('seq');
        r.push({ complete: img.complete, largeur: img.naturalWidth, decodee: vues.indexOf(img.src) >= 0 });
      }
      return r;
    })()`);
    for (const e of etats) assert.deepEqual(e, { complete: true, largeur: 64, decodee: true });
  } finally {
    await page.fermer();
  }
});

test('seek-attend-image-svg : une <image> SVG est décodée avant la fin de M.seek, et de nouveau quand sa scène revient', { ...sans, timeout: 60000 }, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), `<section data-scene="chiffre">
  <p data-texte="legende" data-start="0.5"></p>
  <svg viewBox="0 0 64 64" style="position:absolute;left:0;top:0;width:40%;height:40%"><image id="vignette" href="${PIXEL('#8e24aa')}" width="64" height="64"/></svg>
</section>`);
  const r = assembler1({ dossier: dir });
  const page = await ouvrirPage({ navigateur, largeur: LARGEUR, hauteur: HAUTEUR });
  try {
    await page.aller(pathToFileURL(ecrirePage(r.html)).href);
    const appels = await page.evaluer(`(async function () {
      await M.pret;
      var appels = [];
      var decode = SVGImageElement.prototype.decode;
      SVGImageElement.prototype.decode = function () { var el = this; appels.push('appel'); return decode.call(el).then(function () { appels.push('decodee'); }); };
      await M.seek(5); appels.push('seek');
      await M.seek(5.2); appels.push('seek');
      await M.seek(0.5); appels.push('seek');
      await M.seek(5.4); appels.push('seek');
      return appels;
    })()`);
    // Décodée avant la fin du premier seek, pas de nouveau tant qu'elle reste visible, de nouveau quand sa scène revient.
    assert.deepEqual(appels, ['appel', 'decodee', 'seek', 'seek', 'seek', 'appel', 'decodee', 'seek']);
  } finally {
    await page.fermer();
  }
});

test('pret-attend-toutes-les-polices : toutes les polices de la page sont chargées avant M.pret', { ...sans, timeout: 60000 }, async () => {
  const r = assembler1({ dossier: path.join(RACINE, 'exemples', 'chaine-du-froid'), styles: null });
  const page = await ouvrirPage({ navigateur, largeur: LARGEUR, hauteur: HAUTEUR });
  try {
    await page.aller(pathToFileURL(ecrirePage(r.html)).href);
    const etats = await page.evaluer('M.pret.then(function () { var e = []; document.fonts.forEach(function (f) { e.push(f.family + " " + f.weight + " " + f.status); }); return e; })');
    assert.ok(etats.length > 0);
    for (const e of etats) assert.match(e, / loaded$/, e);
  } finally {
    await page.fermer();
  }
});
