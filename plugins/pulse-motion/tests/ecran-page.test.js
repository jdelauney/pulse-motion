'use strict';
/* Spec S6, plan 1 : critères rendus dans Chrome ou Edge sans fenêtre (pointeur, cercle, projecteur, anneau, zooms,
 * cadres et blocs dans les deux voies d'export, contrôle des blocs dans les six styles, déterminisme). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { decoder } = require('../scripts/lib/png.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const CAPTURE = lire('moteur', 'capture.js');
const L = 640, H = 360;

/** Projet dans un vrai style : [[id, html, durée, textes]]. */
function projet(scenes, { style = 'clair-pedagogique', images = [] } = {}) {
  const dir = dossierTemporaire('pm-ecran-');
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const im of images) fs.copyFileSync(path.join(RACINE, 'tests', 'fixtures', 'projet-simple', 'assets', 'logo.svg'), path.join(dir, 'assets', im));
  scenes.forEach(([id, html]) => fs.writeFileSync(path.join(dir, 'scenes', `${id}.html`), html));
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({ version: 1, titre: 'Essai écran', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style,
    scenes: scenes.map(([id, , duree = 6, textes = { titre: 'Un titre' }, extra = {}]) => ({ id, fichier: `scenes/${id}.html`, duree, textes, transition: 'coupe', ...extra })) }, null, 2));
  return dir;
}

/** Maquette d'écran : une liste et un bouton « envoyer » (en %, à la taille de la page). */
const MAQUETTE = `<div style="position:absolute; inset:0; background:#f4f6f9">
  <div id="liste" style="position:absolute; left:6%; top:10%; width:88%; height:30%; background:#dfe4ec"></div>
  <div id="envoyer" style="position:absolute; left:70%; top:60%; width:20%; height:12%; background:#2f6fed"></div>
  <div id="total" style="position:absolute; left:6%; top:80%; width:30%; height:10%; background:#ffffff"></div>
</div>`;
const ecran = (marques, attrs = '') => `<section data-scene="s"><div class="pm-ecran" data-adresse="app.exemple.fr"${attrs} data-start="0" style="--pm-ecran-l: 120cqh">${MAQUETTE}${marques}</div></section>`;

async function ouvrir(dir) {
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, a.html);
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: L, hauteur: H, navigateur, delai: 60000 });
  return { c, a };
}
const rapide = async (c) => decoder(Buffer.from(await c.evaluer(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${L}; canvas.height = ${H};
  await M.capturer(canvas.getContext('2d'), ${L}, ${H});
  return canvas.toDataURL('image/png').split(',')[1];
})()`), 'base64'));
function ecart(a, b) {
  let s = 0;
  const n = a.largeur * a.hauteur;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s += Math.abs(a.donnees[i * a.canaux + k] - b.donnees[i * b.canaux + k]);
  return s / (n * 3 * 255);
}
const pixel = (p, x, y) => { const i = (Math.round(y) * p.largeur + Math.round(x)) * p.canaux; return [p.donnees[i], p.donnees[i + 1], p.donnees[i + 2]]; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Boîte (px de la capture) d'un élément, transformations comprises. */
const boite = (c, sel) => c.evaluer(`(function () { var r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); var s = document.getElementById('pm-scene').getBoundingClientRect(); return [r.left - s.left, r.top - s.top, r.width, r.height]; })()`);

test('pointeur : la pointe est au point visé à l\'instant de l\'action ; cercle visible 0,7 s puis absent ; la cible s\'enfonce', { ...SANS, timeout: 120000 }, async () => {
  const dir = projet([['s', ecran('<i class="pm-clic" data-cible="#envoyer" data-start="2"></i><i class="pm-survol" data-cible="40%,25%" data-start="4"></i>')]]);
  const { c } = await ouvrir(dir);
  try {
    await c.capturer(2);
    const cible = await boite(c, '#envoyer');
    const pointe = await boite(c, '.pm-pointeur');
    // Point visé : 8 % de la largeur et 78 % de la hauteur de la cible (elle mesure plus de 48 px de la page).
    assert.ok(Math.abs(pointe[0] - (cible[0] + 0.08 * cible[2])) < 3, `x ${pointe[0]} / ${cible[0]}`);
    assert.ok(Math.abs(pointe[1] - (cible[1] + 0.78 * cible[3])) < 3, `y ${pointe[1]} / ${cible[1]}`);
    const etat = (t) => c.evaluer(`M.seek(${t}).then(function () {
      var o = Array.prototype.map.call(document.querySelectorAll('.pm-onde'), function (x) { return Number(x.style.opacity); });
      return { ondes: o.filter(function (v) { return v > 0; }).length, appui: document.getElementById('envoyer').style.scale, pointeur: document.querySelector('.pm-pointeur').style.getPropertyValue('--pm-k') };
    })`);
    assert.deepEqual(await etat(1.9), { ondes: 0, appui: '', pointeur: '1' });
    const pendant = await etat(2.05);
    assert.equal(pendant.ondes, 1);
    assert.ok(Number(pendant.appui) < 1 && Number(pendant.pointeur) === 0.9, JSON.stringify(pendant));
    assert.equal((await etat(2.6)).ondes, 1);
    assert.deepEqual(await etat(2.75), { ondes: 0, appui: '', pointeur: '1' });
    // Survol : arrivé à l'instant, sans cercle.
    await c.capturer(4);
    const p2 = await boite(c, '.pm-pointeur');
    const surface = await boite(c, '.pm-ecran-surface');
    assert.ok(Math.abs(p2[0] - (surface[0] + 0.4 * surface[2])) < 2 && Math.abs(p2[1] - (surface[1] + 0.25 * surface[3])) < 2);
    assert.equal((await etat(4.2)).ondes, 0);
    // Même instant, mêmes pixels, quel que soit l'ordre.
    const a1 = await c.capturer(1.7);
    await c.capturer(5);
    await c.capturer(0.3);
    assert.ok(a1.equals(await c.capturer(1.7)));
    // data-vitesse sur l'écran : le pointeur suit le temps vu par l'écran.
    assert.deepEqual(await c.evaluer('JSON.stringify(M.mesurerEcrans({}))'), '[]');
  } finally { await c.fermer(); }
});

test('projecteur : la cible reste claire et le reste est assombri à 70 % ; rendu identique dans les deux voies d\'export (écart au plus 2 %)', { ...SANS, timeout: 120000 }, async () => {
  const dir = projet([['s', ecran('<i class="pm-projecteur" data-cible="#envoyer" data-start="1" data-dur="3"></i>')]]);
  const { c } = await ouvrir(dir);
  try {
    await c.evaluer(`${CAPTURE}; true`);
    const avant = decoder(await c.capturer(0.5));
    const pendant = decoder(await c.capturer(2.5));
    const cible = await boite(c, '#envoyer');
    const liste = await boite(c, '#liste');
    const centre = [cible[0] + cible[2] / 2, cible[1] + cible[3] / 2];
    assert.ok(Math.abs(lum(pixel(pendant, ...centre)) - lum(pixel(avant, ...centre))) < 3, 'la cible reste claire');
    const ici = [liste[0] + liste[2] / 2, liste[1] + liste[3] / 2];
    const rapport = lum(pixel(pendant, ...ici)) / lum(pixel(avant, ...ici));
    assert.ok(Math.abs(rapport - 0.3) < 0.03, `assombri à ${Math.round((1 - rapport) * 100)} %`);
    // Entrée de 0,4 s : à 1,2 s, à moitié.
    const entree = decoder(await c.capturer(1.2));
    const r2 = lum(pixel(entree, ...ici)) / lum(pixel(avant, ...ici));
    assert.ok(r2 > 0.35 && r2 < 0.95, `entrée ${r2}`);
    assert.ok(Math.abs(lum(pixel(decoder(await c.capturer(4.5)), ...ici)) - lum(pixel(avant, ...ici))) < 3, 'fini à 4 s');
    for (const t of [1.2, 2.5]) {
      const f = decoder(await c.capturer(t));
      await c.evaluer(`M.seek(${t})`);
      const r = await rapide(c);
      assert.ok(ecart(f, r) <= 0.02, `t = ${t} : ${(100 * ecart(f, r)).toFixed(2)} %`);
    }
  } finally { await c.fermer(); }
});

test('anneau : la pulsation dure 1,5 s et suit l\'horloge', { ...SANS, timeout: 90000 }, async () => {
  const dir = projet([['s', ecran('<i class="pm-anneau" data-cible="#envoyer" data-start="1" data-dur="4"></i>')]]);
  const { c } = await ouvrir(dir);
  try {
    const ombre = (t) => c.evaluer(`M.seek(${t}).then(function () { return document.querySelector('.pm-anneau').style.boxShadow; })`);
    const a = await ombre(1.3);
    assert.equal(await ombre(2.8), a, '1,5 s plus tard, la même pulsation');
    assert.notEqual(await ombre(2.05), a);
    await ombre(4.4);
    assert.equal(await ombre(1.3), a, 'retour en arrière : la même');
    assert.equal(await c.evaluer('M.seek(0.5).then(function () { return getComputedStyle(document.querySelector(".pm-anneau")).opacity; })'), '0');
  } finally { await c.fermer(); }
});

test('zoom : pm-zoom sur #cible centre la cible au plus fort du zoom ; suivre fait un zoom par geste et un recul final ; un data-camera écrit le désactive', { ...SANS, timeout: 120000 }, async () => {
  const dir = projet([
    ['s', ecran('<i class="pm-zoom" data-cible="#liste" data-start="1" data-dur="2.4" data-echelle="1.5"></i>')],
    ['t', ecran('<i class="pm-clic" data-cible="#liste" data-start="1.5"></i><i class="pm-clic" data-cible="#envoyer" data-start="3.2"></i>', ' data-film-camera="suivre"').replace('data-scene="s"', 'data-scene="t"')],
    ['u', ecran('<i class="pm-clic" data-cible="#liste" data-start="1.5"></i>', ' data-film-camera="suivre" data-camera="zoom 1→1.05 0+4"').replace('data-scene="s"', 'data-scene="u"')],
  ]);
  const { c, a } = await ouvrir(dir);
  try {
    assert.deepEqual(a.erreurs.map((e) => e.regle), ['suivre-desactive']);
    await c.capturer(2.2);
    const s = await boite(c, '#s .pm-ecran-surface'.replace('#s ', 'section[data-scene="s"] '));
    const l = await boite(c, 'section[data-scene="s"] #liste');
    assert.ok(Math.abs(l[0] + l[2] / 2 - (s[0] + s[2] / 2)) < 2, 'centrée en largeur');
    assert.ok(Math.abs(l[2] / s[2] - 0.88 * 1.5) < 0.02, 'échelle 1,5');
    const zoom = (t) => c.evaluer(`M.seek(${t}).then(function () { var p = document.querySelector('section[data-scene="' + (${t} < 6 ? 's' : ${t} < 12 ? 't' : 'u') + '"] .pm-ecran-plan'); return p.style.transform || 'none'; })`);
    assert.match(await zoom(0.5), /scale\(1\)/);
    assert.match(await zoom(3.8), /scale\(1\)/);
    // Suivre : zoomé à chaque clic, pas de retour à 1 entre les deux (enchaînés), recul à la fin.
    const echelle = async (t) => Number(/scale\(([\d.]+)\)/.exec(await zoom(t))[1]);
    assert.ok(await echelle(6 + 1.5) > 1.2 && await echelle(6 + 2.3) > 1.2 && await echelle(6 + 3.2) > 1.2);
    assert.equal(await echelle(6 + 5.5), 1);
    // Un data-camera écrit : pas de suivi (le plan ne bouge pas).
    assert.equal(await c.evaluer('M.seek(13.5).then(function () { return document.querySelector(\'section[data-scene="u"] .pm-ecran-plan\').style.transform; })'), '');
  } finally { await c.fermer(); }
});

test('cadre : chaque cadre se dessine dans les deux voies d\'export sans filter:url ni backdrop-filter ; presentation prend le dégradé de la charte pour une capture', { ...SANS, timeout: 180000 }, async () => {
  const cadres = ['navigateur', 'fenetre', 'telephone', 'tablette', 'presentation', 'aucun'];
  const dir = projet(cadres.map((cadre) => [cadre, `<section data-scene="${cadre}"><div class="pm-ecran" data-cadre="${cadre}" data-adresse="app.exemple.fr" data-titre="Factures" data-start="0">${MAQUETTE}<i class="pm-clic" data-cible="#envoyer" data-start="1"></i></div></section>`, 2]));
  const { c, a } = await ouvrir(dir);
  try {
    assert.doesNotMatch(a.cssPage.replace(/\/\*[\s\S]*?\*\//g, ''), /filter\s*:\s*url|backdrop-filter|mix-blend-mode/);
    await c.evaluer(`${CAPTURE}; true`);
    for (const [i, cadre] of cadres.entries()) {
      const t = i * 2 + 0.8;
      const f = decoder(await c.capturer(t));
      await c.evaluer(`M.seek(${t})`);
      const r = await rapide(c);
      assert.ok(ecart(f, r) <= 0.02, `${cadre} : écart ${(100 * ecart(f, r)).toFixed(2)} %`);
      if (cadre === 'telephone') {
        const e = await boite(c, 'section[data-scene="telephone"] .pm-ecran');
        const coul = pixel(f, e[0] + e[2] / 2, e[1] + 1 + e[2] * 0.0125 / 0.95 * 0 + 1);
        assert.ok(lum(coul) < 40, `corps sombre : ${coul}`);
      }
      if (cadre === 'presentation') {
        const e = await boite(c, 'section[data-scene="presentation"] .pm-ecran');
        const [fond, accent] = await c.evaluer('(function () { var s = getComputedStyle(document.documentElement); return [s.getPropertyValue("--c-fond"), s.getPropertyValue("--c-accent")]; })()');
        const hex = (h) => [1, 3, 5].map((k) => parseInt(h.trim().slice(k, k + 2), 16));
        const d = (x, y) => Math.max(...x.map((v, k) => Math.abs(v - y[k])));
        assert.ok(d(pixel(f, e[0] + 3, e[1] + 3), hex(fond)) < 24, `coin haut gauche ≈ fond : ${pixel(f, e[0] + 3, e[1] + 3)}`);
        assert.ok(d(pixel(f, e[0] + e[2] - 4, e[1] + e[3] - 4), hex(accent)) < 40, `coin bas droit ≈ accent : ${pixel(f, e[0] + e[2] - 4, e[1] + e[3] - 4)}`);
      }
    }
  } finally { await c.fermer(); }
});

const TERMINAL = () => /<!-- Variante terminal :\n([\s\S]*?)\n-->/.exec(lire('moteur', 'blocs', 'commande.html'))[1];
const sansCommentaire = (t) => t.replace(/<!--[\s\S]*?-->\n?/g, '');
const clesDe = (html) => [...html.matchAll(/data-texte="([^"]+)"/g)].map((m) => m[1]);

test('blocs : commande passe de « Copier » à « Copié ✓ » à son instant ; terminal tape chaque ligne d\'invite par saisie, puis ses sorties à leur instant, identique dans les deux voies d\'export', { ...SANS, timeout: 120000 }, async () => {
  const commande = sansCommentaire(lire('moteur', 'blocs', 'commande.html'));
  const textes = { commande: 'npm install pulse', 'commande-1': 'mkdir projet', 'sortie-1': 'dossier créé', 'commande-2': 'cd projet && ls', 'sortie-2': 'deroule.json scenes' };
  const dir = projet([['c', `<section data-scene="c">${commande}</section>`, 4, textes], ['t', `<section data-scene="t">${TERMINAL()}</section>`, 6, textes]]);
  const { c } = await ouvrir(dir);
  try {
    const libelle = (t) => c.evaluer(`M.seek(${t}).then(function () { var b = document.querySelector('section[data-scene="c"] .pm-bloc-copier');
      return [getComputedStyle(b, '::after').content, getComputedStyle(b.querySelector('.pm-bloc-apres')).display]; })`);
    assert.deepEqual(await libelle(2.4), ['"Copier"', 'none']);
    assert.deepEqual(await libelle(2.55), ['"Copié"', 'block']);
    // Terminal (scène de 4 à 10 s) : ligne 1 tapée par paquets, sortie 1 cachée jusqu'à 2,2 s, puis ligne 2.
    const lignes = (t) => c.evaluer(`M.seek(${4 + t}).then(function () {
      return Array.prototype.map.call(document.querySelectorAll('section[data-scene="t"] .pm-bloc-lignes > p'), function (p) {
        if (getComputedStyle(p).display === 'none') return null;
        var l = p.querySelectorAll('.pm-lettre');
        if (!l.length) return p.textContent;
        return Array.prototype.filter.call(l, function (x) { return Number(getComputedStyle(x).opacity) > 0.5; }).map(function (x) { return x.textContent; }).join('');
      });
    })`);
    assert.deepEqual(await lignes(0.5), [null, null, null, null]);
    const tape = await lignes(1);
    assert.ok(tape[0].length > 0 && tape[0].length < 'mkdirprojet'.length && tape[1] === null, JSON.stringify(tape));
    assert.deepEqual(await lignes(2.5), ['mkdirprojet', 'dossier créé', null, null]);
    assert.deepEqual(await lignes(5), ['mkdirprojet', 'dossier créé', 'cdprojet&&ls', 'deroule.json scenes']);
    await c.evaluer(`${CAPTURE}; true`);
    for (const t of [4.9, 5.6, 7.3, 8.8]) {
      const f = decoder(await c.capturer(t));
      await c.evaluer(`M.seek(${t})`);
      const r = await rapide(c);
      assert.ok(ecart(f, r) <= 0.01, `t = ${t} : écart ${(100 * ecart(f, r)).toFixed(2)} %`);
    }
  } finally { await c.fermer(); }
});

test('blocs : liste met en valeur l\'option choisie à son instant (options relevées au tournage : plan 2)', { ...SANS, timeout: 90000 }, async () => {
  const liste = sansCommentaire(lire('moteur', 'blocs', 'liste.html'));
  const dir = projet([['l', `<section data-scene="l">${liste}</section>`, 4, { champ: 'Mode de paiement', 'option-1': 'Chèque', 'option-2': 'Virement', 'option-3': 'Carte' }]]);
  const { c } = await ouvrir(dir);
  try {
    const fond = (t) => c.evaluer(`M.seek(${t}).then(function () { return getComputedStyle(document.querySelector('.pm-bloc-choisie')).backgroundColor; })`);
    const avant = await fond(1);
    const apres = await fond(2);
    assert.notEqual(avant, apres);
    assert.equal(apres, await c.evaluer('getComputedStyle(document.documentElement).getPropertyValue("--c-primaire").trim() && getComputedStyle(document.querySelector(".pm-bloc-champ")).boxShadow.match(/rgb\\([^)]*\\)/)[0]'));
  } finally { await c.fermer(); }
});

test('blocs : chaque bloc passe le contrôle (contraste, lecture, débordement) dans les 6 styles', { ...SANS, timeout: 900000 }, async () => {
  const { controlerComplet } = require('../scripts/controler.js');
  const blocs = fs.readdirSync(path.join(RACINE, 'moteur', 'blocs')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
  const textes = {
    appli: 'Facturation', quand: 'maintenant', titre: 'Facture envoyée', texte: 'Dupont SARL a reçu sa facture.', message: 'Facture enregistrée', nom: 'Claire Martin', pseudo: '@claire',
    reponses: '12', partages: '4', aime: '86', 'sous-titre': 'Gérer vos factures', bouton: 'Ouvrir', fonction: 'Comptable', commande: 'npm install', numero: '2',
    consigne: 'Cliquez sur Nouvelle facture', champ: 'Mode de paiement', 'option-1': 'Chèque', 'option-2': 'Virement', 'option-3': 'Carte', annuler: 'Annuler', ok: 'Enregistrer',
    'commande-1': 'mkdir projet', 'sortie-1': 'dossier créé', 'commande-2': 'ls', 'sortie-2': 'deroule.json',
    // Cartes « graphique » et « organigramme » (S6 5.13, livrées avec S7 J2).
    chiffre: '+12 %', chef: 'Direction', equipe1: 'Ventes', equipe2: 'Achats', equipe3: 'Logistique',
  };
  const extras = { 'carte-graphique': { graphiques: { graphique: { type: 'barres', unite: '%', valeurs: [{ etiquette: 'Janv.', valeur: 4 }, { etiquette: 'Févr.', valeur: 7 }, { etiquette: 'Mars', valeur: 12, accent: true }] } } } };
  const scenes = blocs.map((b) => {
    const html = sansCommentaire(lire('moteur', 'blocs', `${b}.html`));
    return [b, `<section data-scene="${b}">${html}</section>`, 6, Object.fromEntries(clesDe(html).map((k) => [k, textes[k]])), extras[b] || {}];
  });
  scenes.push(['terminal', `<section data-scene="terminal">${TERMINAL()}</section>`, 7, Object.fromEntries(clesDe(TERMINAL()).map((k) => [k, textes[k]]))]);
  const VUES = ['contraste', 'contraste-reel', 'lecture', 'debordement', 'texte-petit', 'hors-cadre', 'glyphe-absent', 'marge'];
  const styles = fs.readdirSync(path.join(RACINE, 'styles')).filter((s) => fs.existsSync(path.join(RACINE, 'styles', s, 'catalogue.json')));
  assert.equal(styles.length, 6);
  for (const style of styles) {
    const dir = projet(scenes, { style, images: ['capture.png'] });
    const r = await controlerComplet({ dossier: dir, corriger: false, ecrire: false, navigateur });
    assert.equal(r.renduVerifie, true, style);
    const fautes = r.problemes.filter((p) => p.gravite === 'erreur' || VUES.includes(p.regle));
    assert.deepEqual(fautes.map((p) => `${p.regle} : ${p.message}`), [], style);
  }
});

test('determinisme : une scène d\'écran (pointeur, clic, zoom, projecteur) se dessine pareil dans deux pages et deux ordres', { ...SANS, timeout: 180000 }, async () => {
  const { controlerComplet } = require('../scripts/controler.js');
  const dir = projet([['s', ecran('<i class="pm-clic" data-cible="#envoyer" data-start="1.5"></i><i class="pm-zoom" data-cible="#total" data-start="2.5" data-dur="2"></i><i class="pm-projecteur" data-cible="#liste" data-start="3" data-dur="2"></i><i class="pm-double-clic" data-cible="#liste" data-start="4.6"></i>')]]);
  const r = await controlerComplet({ dossier: dir, corriger: false, ecrire: false, navigateur });
  assert.equal(r.renduVerifie, true);
  assert.deepEqual(r.problemes.filter((p) => /^rendu-|etapes-trop|pointeur-hors/.test(p.regle)), []);
  assert.ok(r.determinisme && r.determinisme.lancee && r.determinisme.scenes.includes('s'), JSON.stringify(r.determinisme));
});

test('controler : etapes-trop-rapprochees et pointeur-hors-ecran dans la vidéo rendue', { ...SANS, timeout: 120000 }, async () => {
  const { controlerComplet } = require('../scripts/controler.js');
  const html = ecran('<div id="loin" style="position:absolute; left:120%; top:10%; width:10%; height:10%"></div><i class="pm-clic" data-cible="#liste" data-start="1"></i><i class="pm-clic" data-cible="#envoyer" data-start="1.4"></i><i class="pm-survol" data-cible="#loin" data-start="4"></i>');
  const dir = projet([['s', html]]);
  const r = await controlerComplet({ dossier: dir, corriger: false, ecrire: false, navigateur });
  const p = r.problemes.filter((x) => ['etapes-trop-rapprochees', 'pointeur-hors-ecran'].includes(x.regle));
  assert.deepEqual(p.map((x) => [x.regle, x.gravite]), [['etapes-trop-rapprochees', 'erreur'], ['pointeur-hors-ecran', 'alerte']]);
  assert.match(p[0].message, /les gestes 1 et 2 du pointeur sont trop rapprochés \(0,4 s\) ; il faut au moins/);
});

test('exporter : un tutoriel dont le son n\'a que des clics s\'exporte (sonie intégrée non vérifiée sur des bruitages seuls)', { skip: (!navigateur && 'Chrome ou Edge introuvable') || (!require('../scripts/lib/ffmpeg.js').trouverFfmpeg().present && 'ffmpeg absent'), timeout: 300000 }, async () => {
  const { spawnSync } = require('node:child_process');
  const html = ecran('<i class="pm-clic" data-cible="#envoyer" data-start="1"></i><i class="pm-clic" data-cible="#liste" data-start="2.6"></i>');
  const dir = projet([['s', html, 4]]);
  const r = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'exporter.js'), dir, '--qualite', '540p'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'verification.json'), 'utf8'));
  assert.ok(v.faites.includes('images') && !v.faites.includes('sonie'), `${r.stdout.slice(-400)} ${r.stderr.slice(-400)}`);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'essai-ecran.mp4')));
});

test('export rapide : un élément centré par margin: auto dans un flex vertical, hors de la première scène, reste à sa place (comme l\'export fidèle)', { ...SANS, timeout: 120000 }, async () => {
  // Défaut relevé au plan 1 de S6 : getComputedStyle rend « 0px » pour une marge automatique d'un élément flex, la copie de
  // l'export rapide le décalait. moteur/figer.js garde « auto » (Typed OM).
  const centre = (id) => `<section data-scene="${id}" style="display:flex; flex-direction:column; background:#fff"><h2 data-texte="titre" style="margin:0">T</h2>`
    + `<div class="pm-ecran" data-adresse="app.exemple.fr" style="margin:auto; align-self:auto; --pm-ecran-l: 60cqh">${MAQUETTE}</div>`
    + `<div style="margin:auto; width:20cqh; height:6cqh; background:#d02040"></div></section>`;
  const dir = projet([['a', centre('a'), 3], ['b', centre('b'), 3]]);
  const { c } = await ouvrir(dir);
  try {
    await c.evaluer(`${CAPTURE}; true`);
    for (const t of [1.5, 4.5]) {
      const f = decoder(await c.capturer(t));
      await c.evaluer(`M.seek(${t})`);
      const r = await rapide(c);
      assert.ok(ecart(f, r) <= 0.01, `t = ${t} : ${(100 * ecart(f, r)).toFixed(2)} %`);
    }
  } finally { await c.fermer(); }
});
