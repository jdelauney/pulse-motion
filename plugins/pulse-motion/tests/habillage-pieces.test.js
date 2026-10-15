'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const sauter = !navigateur && 'Chrome ou Edge introuvable';
const MOTEUR = path.join(__dirname, '..', 'moteur');
const R = "<rect x='-7' y='-7' width='14' height='82' rx='7' fill='var(--teinte-loin, var(--corps))'/>";
const DESSIN = {
  couleurs: { corps: '#F5F5F5', dos: '#C9C2D3', trait: '#17151C' },
  pieces: {
    cuisseAvant: { profil: R, face: "<rect data-face='1' x='-8' y='-7' width='16' height='82'/>" },
    tibiaAvant: { profil: R }, torse: { profil: "<rect x='-8' y='-90' width='16' height='98'/>" },
    tete: { profil: "<ellipse rx='34' ry='50'/>", dos: "<ellipse data-dos='1' rx='34' ry='50'/>" },
    piedAvant: { profil: "<rect x='-7' y='-7' width='29' height='14'/>" }, mainAvant: { profil: "<circle r='8'/>" },
  },
  accessoires: [{ nom: 'toque', os: 'tete', devant: true, dessins: { profil: "<rect x='-20' y='-80' width='40' height='30'/>" } }, { nom: 'cape', os: 'torse', dessins: { profil: "<rect x='-20' y='-90' width='10' height='90'/>" } }],
  visage: {
    oeil: { blanc: "<ellipse rx='13' ry='15'/>", pupille: "<circle r='6'/>", paupiere: "<rect x='-16' y='-18' width='32' height='36'/>", course: 5, hauteur: 36 },
    sourcil: "<path d='M -9 2 Q 0 -3 9 2' stroke='#000' fill='none'/>",
    bouches: { neutre: { profil: "<path d='M -8 0 L 8 0' stroke='#000'/>" }, O: { profil: "<ellipse rx='6' ry='7'/>" } },
    vues: { profil: { yeux: [[16, -6], [30, -6]], sourcils: [[16, -24], [30, -24]], bouche: [24, 22] }, face: { yeux: [[-13, -6], [13, -6]], sourcils: [[-13, -24], [13, -24]], bouche: [0, 22] } },
  },
};

function page() {
  const d = dossierTemporaire();
  const f = path.join(d, 'page.html');
  const src = (n) => pathToFileURL(path.join(MOTEUR, n)).href;
  fs.writeFileSync(f, `<!doctype html><meta charset="utf-8"><svg id="s" viewBox="0 0 800 600" width="800" height="600"><g id="g"></g><g id="h"></g></svg>
<script>window.DESSIN = ${JSON.stringify(DESSIN)};</script>
<script src="${src('courbes.js')}"></script><script src="${src('squelette.js')}"></script><script src="${src('clips.js')}"></script><script src="${src('habillage-pieces.js')}"></script>`);
  return pathToFileURL(f).href;
}
async function evaluer(code) {
  const p = await ouvrirPage({ navigateur, largeur: 800, hauteur: 600 });
  try { await p.aller(page()); return await p.evaluer(code); } finally { await p.fermer(); }
}

test('pièces : une pièce suit son os (pivot, angle, raccourcissement, miroir)', { skip: sauter }, async () => {
  const r = await evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.pieces.creer(g, DESSIN, {});
    const lire = (pose) => { const res = M.squelette.calculer(pose); perso.rendre(res); return { t: g.querySelector('[data-piece="cuisseAvant"]').getAttribute('transform'), h: res.articulations.hancheAvant }; };
    return { droit: lire({ cuisseAvant: -90, ecartJambeAvant: 0 }), gauche: lire({ vue: 180, cuisseAvant: -90, ecartJambeAvant: 0 }), vers: lire({ vue: 90, cuisseAvant: -90, ecartJambeAvant: 0 }),
      decor: g.hasAttribute('data-decor'), corps: g.style.getPropertyValue('--corps') };
  })()`);
  assert.match(r.droit.t, /^translate\(0 0\) rotate\(-90\) scale\(1 1\)$/);
  assert.match(r.gauche.t, /rotate\(90\) scale\(-1 1\)$/);
  assert.match(r.vers.t, /scale\(1 0\.15\)$/, 'de face, la cuisse tendue vers la caméra garde une longueur minimale');
  assert.equal(r.decor, true);
  assert.equal(r.corps, '#F5F5F5');
});

test('pièces : choix de la vue, remplacements, 3/4 dos', { skip: sauter }, async () => {
  const r = await evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.pieces.creer(g, DESSIN, {});
    const visible = (sel) => [...g.querySelectorAll(sel + ' > [data-vue]')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.vue);
    const vue = (v) => { perso.rendre(M.squelette.calculer({ vue: v })); return { cuisse: visible('[data-piece="cuisseAvant"]'), tete: visible('[data-piece="tete"]'), visage: [...g.querySelectorAll('[data-visage-vue]')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.visageVue) }; };
    return { v0: vue(0), v45: vue(45), v90: vue(90), vm90: vue(-90), vm45: vue(-45), fn: [0, 30, 60, 90, -90, -45, 180, 135].map(M.pieces.vueDe) };
  })()`);
  assert.deepEqual(r.v0, { cuisse: ['profil'], tete: ['profil'], visage: ['profil'] });
  assert.deepEqual(r.v45.cuisse, ['profil'], '3/4 absent : profil');
  assert.deepEqual(r.v90, { cuisse: ['face'], tete: ['profil'], visage: ['face'] });
  assert.deepEqual(r.vm90, { cuisse: ['face'], tete: ['dos'], visage: [] });
  assert.deepEqual(r.vm45, { cuisse: ['profil'], tete: ['profil'], visage: [] });
  assert.deepEqual(r.fn, ['profil', 'troisQuarts', 'troisQuarts', 'face', 'dos', 'troisQuartsDos', 'profil', 'troisQuarts']);
});

test('pièces : profondeur, chaîne éloignée, accessoires, os sans pièce, main, identifiants uniques', { skip: sauter }, async () => {
  const r = await evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.pieces.creer(g, DESSIN, {});
    M.pieces.creer(document.getElementById('h'), DESSIN, {});
    perso.rendre(M.squelette.calculer({ vue: 0 }));
    const parties = [...g.querySelector('[data-pm-perso-racine]').children].map((e) => e.dataset.partie);
    const tete = [...g.querySelector('[data-piece="tete"]').children].map((e) => e.dataset.accessoire || e.dataset.vue || (e.hasAttribute('data-visage') ? 'visage' : '?'));
    const torse = [...g.querySelector('[data-piece="torse"]').children].map((e) => e.dataset.accessoire || e.dataset.vue);
    const loin = g.querySelector('[data-partie="jambeArriere"]');
    const ids = [...document.querySelectorAll('clipPath')].map((c) => c.id);
    return { parties, tete, torse, loin: loin.classList.contains('pm-perso-loin'), teinte: loin.style.getPropertyValue('--teinte-loin'),
      arriere: !!g.querySelector('[data-piece="cuisseArriere"] [data-vue="profil"]'), sansBras: !g.querySelector('[data-piece="brasAvant"]'),
      main: perso.main('Avant') && perso.main('Avant').dataset.piece, mainArriere: perso.main('Arriere') && perso.main('Arriere').dataset.piece, sansMain: M.pieces.creer(document.getElementById('h').appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g')), { pieces: { torse: DESSIN.pieces.torse } }, {}).main('Avant').dataset.piece, ids, unique: new Set(ids).size === ids.length };
  })()`);
  assert.ok(r.parties.indexOf('jambeArriere') < r.parties.indexOf('jambeAvant'));
  assert.deepEqual(r.tete, ['profil', 'dos', 'visage', 'toque']);
  assert.deepEqual(r.torse, ['cape', 'profil']);
  assert.equal(r.loin, true);
  assert.equal(r.teinte, 'var(--dos)');
  assert.equal(r.arriere, true, 'pièce Arrière reprise de la pièce Avant');
  assert.equal(r.sansBras, true);
  assert.equal(r.main, 'mainAvant');
  assert.equal(r.mainArriere, 'mainArriere', 'main Arrière reprise de la main Avant');
  assert.equal(r.sansMain, 'mainAvant', 'main vide mais présente, pour les objets tenus');
  assert.ok(r.ids.length >= 8 && r.unique, JSON.stringify(r.ids));
});

test('visage : pupilles bornées, paupière, sourcils, bouche de remplacement, expression', { skip: sauter }, async () => {
  const r = await evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.pieces.creer(g, DESSIN, {});
    const bib = { expressions: { colere: { bouche: 'colere', angles: { sourcilsY: -3, sourcilsAngle: 20 } } } };
    const lire = (pose) => {
      perso.rendre(M.squelette.calculer(M.clips.resoudrePose({ angles: pose.angles || {}, bouche: pose.bouche, expression: pose.expression }, bib)));
      const vue = [...g.querySelectorAll('[data-visage-vue]')].find((e) => e.style.display !== 'none');
      return {
        pupille: vue.querySelector('[data-pupille]').getAttribute('transform'), paupiere: vue.querySelector('[data-paupiere]').getAttribute('transform'),
        sourcils: [...vue.querySelectorAll('[data-sourcil]')].map((e) => e.getAttribute('transform')),
        bouche: [...vue.querySelectorAll('[data-bouche-nom]')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.boucheNom),
      };
    };
    return { loin: lire({ angles: { regardX: 60, paupieres: 1 } }), ferme: lire({ angles: { paupieres: 0 } }), colere: lire({ expression: 'colere' }), surprise: lire({ bouche: 'surprise' }), rire: lire({ bouche: 'rire' }), defaut: lire({}),
      chaine: [M.pieces.boucheDe('E', ['neutre', 'A']), M.pieces.boucheDe('rire', ['neutre']), M.pieces.boucheDe('perso', ['perso', 'neutre']), M.pieces.boucheDe('A', [])] };
  })()`);
  assert.match(r.loin.pupille, /^translate\(5 0\) scale\(1\)$/);
  assert.match(r.loin.paupiere, /translate\(0 -36\)/);
  assert.match(r.ferme.paupiere, /translate\(0 0\)/);
  assert.deepEqual(r.colere.sourcils, ['translate(16 -21) rotate(20)', 'translate(30 -21) rotate(-20)']);
  assert.deepEqual(r.colere.bouche, ['neutre'], 'colère absente : neutre');
  assert.deepEqual(r.surprise.bouche, ['O']);
  assert.deepEqual(r.rire.bouche, ['neutre']);
  assert.deepEqual(r.defaut.bouche, ['neutre']);
  assert.deepEqual(r.chaine, ['A', 'neutre', 'perso', null]);
});

test('pièces : os sans pièce, visage sans tête dessinée', { skip: sauter }, async () => {
  const r = await evaluer(`(() => {
    const g = document.getElementById('g');
    const d = JSON.parse(JSON.stringify(DESSIN)); delete d.pieces.tete; d.accessoires = [];
    const perso = M.pieces.creer(g, d, {});
    const res = M.squelette.calculer({});
    perso.rendre(res);
    const tete = g.querySelector('[data-piece="tete"]');
    return { tete: !!tete, transform: tete && tete.getAttribute('transform'), centre: res.articulations.centreTete, visage: !!tete.querySelector('[data-visage]') };
  })()`);
  assert.equal(r.tete, true);
  assert.equal(r.visage, true);
  assert.match(r.transform, new RegExp(`^translate\\(${Math.round(r.centre[0] * 100) / 100} ${Math.round(r.centre[1] * 100) / 100}\\)`));
});

test('pièces : pied de face, mains toujours présentes, groupe réutilisé, yeuxY, os en plus de la tête', { skip: sauter }, async () => {
  const r = await evaluer(`(() => {
    const g = document.getElementById('g');
    const d = JSON.parse(JSON.stringify(DESSIN)); delete d.pieces.mainAvant;
    let perso = M.pieces.creer(g, d, {});
    perso.rendre(M.squelette.calculer({ vue: 90 }));
    const pied = g.querySelector('[data-piece="piedAvant"]').getAttribute('transform');
    const main = perso.main('Avant') && perso.main('Avant').dataset.piece;
    const autre = { couleurs: { tenue: '#FF0000' }, pieces: { torse: DESSIN.pieces.torse } };
    perso = M.pieces.creer(g, autre, {});
    perso.rendre(M.squelette.calculer({}));
    const racines = g.querySelectorAll('[data-pm-perso-racine]').length;
    const ancienne = g.style.getPropertyValue('--corps');
    const yeux = M.pieces.creer(document.getElementById('h'), DESSIN, {});
    yeux.rendre(M.squelette.calculer({ yeuxY: 3 }));
    const oeil = document.querySelector('#h [data-visage-vue="profil"] [data-oeil="0"]').getAttribute('transform');
    const oreille = { pieces: { oreille: { profil: "<rect width='4' height='20'/>", face: "<rect data-face='1' width='4' height='20'/>" } } };
    const gab = { osEnPlus: [{ nom: 'oreille', parent: 'tete', attache: [0, -40, 0], angle: 170, longueur: 20 }] };
    const o = M.pieces.creer(document.getElementById('h'), oreille, gab);
    o.rendre(M.squelette.calculer({ teteTourne: 85, vue: 10 }, gab));
    const vueOreille = [...document.querySelectorAll('#h [data-piece="oreille"] > [data-vue]')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.vue);
    return { pied, main, racines, ancienne, oeil, vueOreille };
  })()`);
  assert.match(r.pied, /^translate\([-\d.]+ [-\d.]+\) scale\(1 1\)$/);
  assert.equal(r.main, 'mainAvant');
  assert.equal(r.racines, 1, 'un seul personnage après recréation');
  assert.equal(r.ancienne, '', 'les couleurs du dessin précédent sont retirées');
  assert.equal(r.oeil, 'translate(16 -3) scale(1)');
  assert.deepEqual(r.vueOreille, ['face'], 'l\'oreille suit la tête tournée vers la caméra');
});
