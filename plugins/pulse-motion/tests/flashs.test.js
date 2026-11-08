'use strict';
/* Flashs mesurés depuis Node sur des captures réduites de la page de contrôle (spec Rapidité 5.10). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const F = require('../scripts/lib/flashs.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { mesurerPage, ouvrirPageControle, LARGEUR_CONTROLE, HAUTEUR_CONTROLE } = require('../scripts/lib/page-mesures.js');
const { assembler } = require('../scripts/assembler.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const SEUILS = require('../scripts/seuils.json');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const MARGE = '<style>@scope { :scope { padding: 12cqh 12cqw; } }</style>';
const CLIGNOTE = (periode) => `<style>@keyframes pm-essai-flash { 50% { background: #ffffff; } }</style><div class="flash" data-decor style="position:absolute; inset:0; background:#000000; animation: pm-essai-flash ${periode}s steps(1) 0.5s 8"></div>`;

/** Page du projet d'essai, la scène intro modifiée (comme tests/pixels.test.js). */
function page(modifier = (h) => h) {
  const dir = copierProjet('projet-simple');
  for (const f of ['01-intro.html', '02-chiffre.html']) {
    const fichier = path.join(dir, 'scenes', f);
    let html = fs.readFileSync(fichier, 'utf8').replace(/(<section[^>]*>)/, `$1\n  ${MARGE}`);
    if (f === '01-intro.html') html = modifier(html);
    fs.writeFileSync(fichier, html);
  }
  return assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).html;
}

// --- Algorithme pur ---

/** Relevé synthétique : luminance de chaque case selon t (fonction de l'instant). */
const synthetique = (lum) => async (t) => Array.from({ length: 16 }, (_, c) => lum(t, c));
const carre = (hz, cases = 16) => (t, c) => (c < cases ? (Math.floor(t * hz * 2) % 2 ? 1 : 0) : 0.5);

test('flashs-algorithme-pur : instants irréguliers fixes, clignotements jugés sur des séries de luminances', async () => {
  const a = F.instantsFlashs(10, 12);
  assert.equal(a.length, 120);
  assert.deepEqual(F.instantsFlashs(10, 12), a, 'graine fixe : mêmes instants à chaque contrôle');
  for (let k = 0; k < a.length; k++) assert.ok(Math.abs(a[k] - (k + 0.5) / 12) <= 0.4 / 12 + 1e-9, String(k));
  assert.notEqual(Math.round((a[1] - a[0]) * 1e6), Math.round((a[2] - a[1]) * 1e6), 'instants irréguliers');
  // Cases : moyenne de la luminance (noir 0, blanc 1).
  const blanc = () => [255, 255, 255, 255];
  assert.deepEqual(F.casesImage(blanc, 8, 8, 4).map((v) => Math.round(v * 1000)), new Array(16).fill(1000));
  const moitie = (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
  assert.deepEqual(F.casesImage(moitie, 8, 8, 4).map((v) => Math.round(v)), [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
  assert.deepEqual(F.fusionnerPassages([[3, 5], [0, 2], [1.5, 2.5], [6, 7]]), [[0, 2.5], [3, 5], [6, 7]]);
  const S = F.seuilsFlashs(SEUILS);
  const sceneA = () => 'essai';
  // 5 Hz sur toute l'image : flash ; 2 Hz : non ; 5 Hz sur 2 cases sur 16 (moins de 25 %) : non.
  const flash = await F.mesurerFlashs({ duree: 4, ips: 30, seuils: SEUILS, relever: synthetique(carre(5)), sceneA });
  assert.equal(flash.length, 1);
  assert.equal(flash[0].regle, 'flash');
  assert.equal(flash[0].scene, 'essai');
  assert.ok(flash[0].valeur > S.flashMax, String(flash[0].valeur));
  assert.deepEqual(await F.mesurerFlashs({ duree: 4, ips: 30, seuils: SEUILS, relever: synthetique(carre(2)), sceneA }), []);
  assert.deepEqual(await F.mesurerFlashs({ duree: 4, ips: 30, seuils: SEUILS, relever: synthetique(carre(5, 2)), sceneA }), []);
  // Plages : un clignotement hors des plages demandées n'est pas relevé ; dans les plages, il l'est.
  const tard = (t, c) => (t >= 6 ? carre(5)(t, c) : 0);
  const vus = [];
  const releverVu = async (t) => { vus.push(t); return synthetique(tard)(t); };
  assert.deepEqual(await F.mesurerFlashs({ duree: 10, ips: 30, seuils: SEUILS, relever: releverVu, sceneA, plages: [[0, 4]] }), []);
  assert.ok(vus.every((t) => t <= 4 + 1e-9), 'aucun relevé hors des plages');
  assert.equal((await F.mesurerFlashs({ duree: 10, ips: 30, seuils: SEUILS, relever: synthetique(tard), sceneA, plages: [[5, 10]] })).length, 1);
  // chercherFlash : série image par image.
  const serie = Array.from({ length: 31 }, (_, f) => new Array(16).fill(f % 3 === 0 ? 1 : 0));
  assert.ok(F.chercherFlash(serie, { n: 4, ips: 30, S }));
  assert.equal(F.chercherFlash(serie.map(() => new Array(16).fill(0.5)), { n: 4, ips: 30, S }), null);
});

// --- Page de contrôle par le CDP ---

function obtenir(url, hote) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, headers: hote ? { Host: hote } : {} }, (res) => {
      let corps = '';
      res.on('data', (d) => { corps += d; });
      res.on('end', () => resolve({ statut: res.statusCode, corps }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('page-controle-par-cdp : page servie avec un jeton et Host vérifié, ouverte par le CDP en 1280 × 800', async () => {
  let vue = null;
  const fausse = async (opts) => ({
    opts,
    async aller(url) { vue = { url, opts }; },
    async evaluer() { return true; },
    async fermer() {},
  });
  const { page, fermer } = await ouvrirPageControle({ html: '<html><body><p>essai</p></body></html>', navigateur: 'chrome', ouvrir: fausse });
  try {
    assert.equal(LARGEUR_CONTROLE, 1280);
    assert.equal(HAUTEUR_CONTROLE, 800);
    assert.deepEqual([page.opts.largeur, page.opts.hauteur], [1280, 800]);
    assert.match(vue.url, /^http:\/\/127\.0\.0\.1:\d+\/pm-controle\/[0-9a-f]{32}$/);
    const bon = await obtenir(vue.url);
    assert.equal(bon.statut, 200);
    assert.match(bon.corps, /M\.capturer = function/, 'capture.js injecté');
    assert.match(bon.corps, /M\.sansSon = true/);
    assert.equal((await obtenir(vue.url.replace(/[0-9a-f]{32}$/, '0'.repeat(32)))).statut, 404, 'autre jeton');
    assert.equal((await obtenir(vue.url, 'exemple.fr')).statut, 403, 'autre Host');
  } finally {
    await fermer();
  }
});

test('page-controle-par-cdp : le contrôle du rendu passe par le CDP dans Chrome', sans, async () => {
  const v = await controlerRendu({ html: page(), ratio: '16:9', duree: 7.75, navigateur });
  assert.equal(v.renduVerifie, true, JSON.stringify(v.problemes));
  assert.equal(v.voie, 'cdp');
});

test('flashs-cdp-memes-verdicts : mêmes verdicts par les captures CDP réduites et par la page (cas de pixels.test.js)', sans, async () => {
  const petit = CLIGNOTE(0.2).replace('inset:0;', 'left:0; top:0; width:20%; height:20%;');
  const cas = [
    ['5 Hz', (h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(0.2)}`), true],
    ['2 Hz', (h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(0.5)}`), false],
    ['petite zone', (h) => h.replace(MARGE, `${MARGE}${petit}`), false],
    ['10 Hz', (h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(0.1)}`), true],
    ['6 Hz', (h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(1 / 6)}`), true],
    ['sans défaut', (h) => h, false],
  ];
  for (const [nom, modifier, attendu] of cas) {
    const html = page(modifier);
    const cdp = await controlerRendu({ html, ratio: '16:9', duree: 7.75, navigateur });
    assert.equal(cdp.voie, 'cdp', nom);
    const dansLaPage = await mesurerPage({ html, navigateur, delai: 60000, script: `return await M.mesurerPixels({ ratio: '16:9', seuils: ${JSON.stringify(SEUILS)} });` });
    assert.ok(dansLaPage.resultat, dansLaPage.erreur);
    const parCdp = cdp.problemes.find((p) => p.regle === 'flash');
    const parPage = dansLaPage.resultat.find((c) => c.regle === 'flash');
    assert.equal(Boolean(parCdp), attendu, `${nom} (CDP) : ${JSON.stringify(cdp.problemes)}`);
    assert.equal(Boolean(parPage), attendu, `${nom} (page) : ${JSON.stringify(dansLaPage.resultat)}`);
    if (attendu) assert.equal(parCdp.scene, parPage.scene, nom);
  }
});

test('flashs-repli-dans-la-page : CDP impossible, la page mesure seule (flashs compris)', sans, async () => {
  const html = page((h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(0.2)}`));
  const v = await controlerRendu({ html, ratio: '16:9', duree: 7.75, navigateur, ouvrir: async () => { throw new Error('tuyau indisponible'); } });
  assert.equal(v.renduVerifie, true, JSON.stringify(v.problemes));
  assert.equal(v.voie, 'page');
  assert.ok(v.problemes.some((p) => p.regle === 'flash' && p.scene === 'intro'), JSON.stringify(v.problemes));
});

test('horloge : revenir en arrière dans une scène restée affichée retrouve une animation finie (l\'image ne dépend que de t)', sans, async () => {
  const html = page((h) => h.replace(MARGE, `${MARGE}${CLIGNOTE(0.1)}`));
  const r = await mesurerPage({ html, navigateur, delai: 60000, script: `
    var fond = function (t) { M.rendre(t); return getComputedStyle(document.querySelector('.flash')).backgroundColor; };
    var directs = [0.6, 0.62, 0.66, 0.7].map(fond);
    fond(3);   // après la fin de l'animation, scène encore affichée
    var retours = [0.6, 0.62, 0.66, 0.7].map(fond);
    return { directs: directs, retours: retours };` });
  assert.ok(r.resultat, r.erreur);
  assert.deepEqual(r.resultat.retours, r.resultat.directs);
  assert.ok(new Set(r.resultat.directs).size > 1, JSON.stringify(r.resultat.directs));
});
