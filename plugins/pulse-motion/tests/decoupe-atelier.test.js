'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const P = require('../scripts/lib/personnages.js');
const { lancerAtelierPersonnages } = require('../scripts/personnages.js');

const navigateur = trouverNavigateur();
const sauter = !navigateur && 'Chrome ou Edge introuvable';
const SVG = path.join(__dirname, 'fixtures', 'svg', 'cuisinier.svg');
const DECOUPE = {
  nom: 'cuisinier', source: 'assets/cuisinier.svg', vue: 'profil',
  os: {
    torse: { formes: ['#veste'], de: [202, 402], a: [202, 282] },
    tete: { formes: ['#tete'], centre: [205, 210] },
    cuisseAvant: { formes: ['#cuisse-av'], de: [201, 402], a: [201, 500] },
    tibiaAvant: { formes: ['g2>rect2'], de: [201, 500], a: [201, 600] },
    piedAvant: { formes: ['#chaussure-av'], de: [199, 606], a: [243, 606] },
    cuisseArriere: { formes: ['#cuisse-ar'], de: [200, 402], a: [200, 500] },
    tibiaArriere: { formes: ['#tibia-ar'], de: [200, 500], a: [200, 600] },
    piedArriere: { formes: ['#chaussure-ar'], de: [198, 606], a: [245, 606] },
    brasAvant: { formes: ['#bras-av'], de: [205, 295], a: [192.8, 363.9] },
    avantBrasAvant: { formes: ['#avant-bras-av'], de: [192.8, 363.9], a: [180.5, 433.9] },
    mainAvant: { formes: ['#main-av'], de: [180.5, 433.9], a: [177, 453] },
  },
  visage: { yeux: [{ blanc: '#oeil-blanc', pupille: '#pupille' }], bouche: '#bouche' },
  ignorer: ['#ombre'],
};

function video({ piege = false } = {}) {
  const v = dossierTemporaire();
  fs.writeFileSync(path.join(v, 'deroule.json'), '{}');
  fs.mkdirSync(path.join(v, 'assets'));
  let svg = fs.readFileSync(SVG, 'utf8');
  if (piege) svg = svg.replace('</svg>', '<script>window.__piege = 1;</script><image href="https://exemple.invalid/x.png" width="1" height="1"/></svg>');
  fs.writeFileSync(path.join(v, 'assets', 'cuisinier.svg'), svg);
  fs.mkdirSync(path.join(v, 'personnages', 'decoupes'), { recursive: true });
  fs.writeFileSync(path.join(v, 'personnages', 'decoupes', 'cuisinier.json'), JSON.stringify(DECOUPE));
  return v;
}
const poster = (url, corps) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

test('routes de découpe : données, enregistrement refusé si invalide, hors d\'une vidéo', async () => {
  const v = video();
  const a = await demarrerApercu({ dossier: v, port: 47721 });
  try {
    const d = await (await fetch(`${a.url}_pm/personnages/decoupe/donnees?nom=cuisinier`)).json();
    assert.equal(d.cible, 'video');
    assert.match(d.source, /^<svg/);
    assert.equal(d.decoupe.os.torse.formes[0], '#veste');
    assert.ok(d.lu.clips.marche);
    assert.equal((await fetch(`${a.url}_pm/personnages/decoupe/donnees?nom=inconnu`)).status, 404);
    const mauvais = await poster(`${a.url}_pm/personnages/decoupe/enregistrer`, { nom: 'cuisinier', decoupe: Object.assign({}, DECOUPE, { vue: 'cote' }), partiel: { pieces: { torse: "<rect width='1' height='1'/>" }, couleurs: {}, gabarit: {} } });
    assert.equal(mauvais.status, 422);
    assert.match((await mauvais.json()).erreurs.join('\n'), /« vue »/);
    const piege = await poster(`${a.url}_pm/personnages/decoupe/enregistrer`, { nom: 'cuisinier', decoupe: DECOUPE, partiel: { pieces: { torse: '<script>x</script>' }, couleurs: {}, gabarit: {} } });
    assert.equal(piege.status, 422, 'le filtre SVG s\'applique aussi aux pièces envoyées par la page');
    assert.equal(fs.existsSync(path.join(v, 'personnages', 'dessins', 'cuisinier.json')), false);
    assert.equal((await fetch(`${a.url}_pm/personnages/decoupe`)).status, 200);
  } finally { await a.fermer(); }
  const hors = dossierTemporaire();
  const b = await demarrerApercu({ dossier: hors, port: 47731 });
  try {
    const r = await poster(`${b.url}_pm/personnages/decoupe/enregistrer`, { nom: 'cuisinier', decoupe: DECOUPE, partiel: { pieces: {}, couleurs: {}, gabarit: {} } });
    assert.equal(r.status, 403);
  } finally { await b.fermer(); }
});

test('lancerAtelierPersonnages --decoupe : page de découpe', async () => {
  const appels = [];
  const r = await lancerAtelierPersonnages({ dossier: video(), decoupe: 'cuisinier', lancer: async (o) => { appels.push(o); return { url: 'http://127.0.0.1:4321/', deja: false }; }, ouvrirUrl: () => {} });
  assert.equal(r.url, 'http://127.0.0.1:4321/_pm/personnages/decoupe?nom=cuisinier');
});

test('page de découpe : réattribuer, déplacer, découper, enregistrer ; aucun script de l\'illustration', { skip: sauter }, async () => {
  const v = video({ piege: true });
  const a = await demarrerApercu({ dossier: v, port: 47741 });
  const page = await ouvrirPage({ navigateur, largeur: 1500, hauteur: 950 });
  try {
    await page.aller(`${a.url}_pm/personnages/decoupe?nom=cuisinier`);
    for (let i = 0; i < 100 && !(await page.evaluer('!!(window.__decoupe && window.__decoupe.pret)')); i++) await new Promise((r) => setTimeout(r, 100));
    const r = await page.evaluer(`(async () => {
      const D = window.__decoupe;
      const debut = { boites: document.querySelectorAll('#calque [data-forme]').length, pivots: document.querySelectorAll('#calque .pivot').length, perso: !!document.querySelector('#perso [data-piece="torse"]') };
      D.reattribuer('#main-av', 'ignorer');
      const apresMain = D.etat();
      D.reattribuer('#toque', 'bassin');
      const apresToque = D.etat();
      D.reattribuer('#pupille', 'ignorer');
      const apresPupille = D.etat();
      D.deplacer('cuisseAvant', 'a', [203, 505]);
      const res = D.decouper();
      document.querySelector('#annuler').click();
      const annule = D.etat();
      const enr = await D.enregistrer();
      return { debut, apresMain, apresToque, apresPupille, cuisse: D.etat().os.cuisseAvant.a, erreurs: res.erreurs, annule, enr, script: D.script() };
    })()`);
    assert.equal(r.script, null, 'le script de l\'illustration ne tourne pas');
    assert.ok(r.debut.boites >= 16 && r.debut.pivots >= 20 && r.debut.perso, JSON.stringify(r.debut));
    assert.equal(r.apresMain.os.mainAvant, undefined, 'la main seule partie, son os disparaît');
    assert.ok(r.apresMain.ignorer.includes('#main-av'));
    assert.ok(!r.apresToque.os.tete.formes.includes('#tete'), 'le groupe de la tête est éclaté');
    assert.ok(r.apresToque.os.tete.formes.includes('#visage') && !r.apresToque.os.tete.formes.includes('#toque'));
    assert.deepEqual(r.apresToque.os.bassin.formes, ['#toque'], 'nouvel os créé');
    assert.ok(Array.isArray(r.apresToque.os.bassin.centre));
    assert.deepEqual(r.erreurs, []);
    assert.equal(r.apresPupille.visage.yeux[0].blanc, '#oeil-blanc', 'la pupille part seule');
    assert.equal(r.apresPupille.visage.yeux[0].pupille, undefined);
    assert.equal(r.apresPupille.visage.bouche, '#bouche');
    assert.deepEqual(r.annule.os.cuisseAvant.a, [201, 500], 'annuler défait le déplacement');
    assert.equal(r.enr.ok, true, JSON.stringify(r.enr));
    const lu = P.lire(v);
    assert.deepEqual(lu.erreurs.map((e) => e.message), []);
    assert.ok(lu.dessins.cuisinier.pieces.bassin, 'le dessin suit la découpe enregistrée');
    assert.ok(lu.decoupes.cuisinier.ignorer.includes('#main-av'));
    assert.ok(fs.existsSync(path.join(v, '.historique')));
  } finally { await page.fermer(); await a.fermer(); }
});
