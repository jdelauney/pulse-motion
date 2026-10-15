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
const MOTEUR = path.join(__dirname, '..', 'moteur');

function page() {
  const d = dossierTemporaire();
  const f = path.join(d, 'page.html');
  const src = (n) => pathToFileURL(path.join(MOTEUR, n)).href;
  fs.writeFileSync(f, `<!doctype html><meta charset="utf-8"><svg id="s" viewBox="0 0 800 600" width="800" height="600"><g id="g"></g></svg>
<script src="${src('courbes.js')}"></script><script src="${src('squelette.js')}"></script><script src="${src('habillage-batonnets.js')}"></script>`);
  return pathToFileURL(f).href;
}

async function avecPage(fn) {
  const p = await ouvrirPage({ navigateur, largeur: 800, hauteur: 600 });
  try { await p.aller(page()); return await fn(p); } finally { await p.fermer(); }
}

test('habillage : traits placés sur les articulations, data-decor, style inséré une fois', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const r = await avecPage((p) => p.evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.batonnets.creer(g);
    M.batonnets.creer(document.getElementById('s').appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g')));
    const res = M.squelette.calculer({ x: 400, y: 300, echelle: 0.5, cuisseAvant: -90 });
    perso.rendre(res);
    const l = g.querySelector('[data-os="cuisseAvant"]');
    return {
      decor: g.hasAttribute('data-decor'),
      styles: document.querySelectorAll('style[data-pm-perso]').length,
      x1: +l.getAttribute('x1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'),
      attendu: [res.articulations.hancheAvant[0], res.articulations.genouAvant[0], res.articulations.genouAvant[1]],
      racine: g.querySelector('[data-pm-perso-racine]').getAttribute('transform'),
      main: perso.main('Avant').getAttribute('transform'),
    };
  })()`));
  assert.equal(r.decor, true);
  assert.equal(r.styles, 1);
  assert.ok(Math.abs(r.x1 - r.attendu[0]) < 0.01 && Math.abs(r.x2 - r.attendu[1]) < 0.01 && Math.abs(r.y2 - r.attendu[2]) < 0.01, JSON.stringify(r));
  assert.equal(r.racine, 'translate(400 300) scale(0.5)');
  assert.match(r.main, /^translate\([-\d.]+ [-\d.]+\) rotate\([-\d.]+\)$/);
});

test('habillage : ordre des chaînes et chaînes éloignées selon la vue', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const r = await avecPage((p) => p.evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.batonnets.creer(g);
    const lire = (vue) => {
      perso.rendre(M.squelette.calculer({ vue }));
      const parties = [...g.querySelector('[data-pm-perso-racine]').children].map((e) => e.dataset.partie);
      const loin = [...g.querySelectorAll('.pm-perso-loin')].map((e) => e.dataset.partie).sort();
      return { parties, loin };
    };
    return { profil: lire(0), gauche: lire(180) };
  })()`));
  const { profil, gauche } = r;
  assert.ok(profil.parties.indexOf('jambeArriere') < profil.parties.indexOf('jambeAvant'));
  assert.ok(gauche.parties.indexOf('jambeAvant') < gauche.parties.indexOf('jambeArriere'));
  assert.deepEqual(profil.loin, ['brasArriere', 'jambeArriere']);
  assert.deepEqual(gauche.loin, ['brasAvant', 'jambeAvant']);
});

test('habillage : yeux et touffe à l\'échelle de la tête, paupières fermées cachent les pupilles', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const r = await avecPage((p) => p.evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.batonnets.creer(g);
    const oeil = () => g.querySelector('[data-oeil="Avant"] ellipse');
    perso.rendre(M.squelette.calculer({ vue: 90 }));
    const petit = +oeil().getAttribute('ry');
    perso.rendre(M.squelette.calculer({ vue: 90 }, { tete: { rx: 51, ry: 75 } }));
    const grand = +oeil().getAttribute('ry');
    const touffe = g.querySelector('[data-touffe]').getAttribute('transform');
    perso.rendre(M.squelette.calculer({ vue: 90, paupieres: 0.1 }));
    return { petit, grand, touffe, pupille: g.querySelector('[data-oeil="Avant"] [data-pupille]').style.display };
  })()`));
  assert.ok(Math.abs(r.grand / r.petit - 1.5) < 0.01, JSON.stringify(r));
  assert.match(r.touffe, /scale\(1\.5 /);
  assert.equal(r.pupille, 'none');
});

test('habillage : os en plus ajoutés puis retirés', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const r = await avecPage((p) => p.evaluer(`(() => {
    const g = document.getElementById('g');
    const perso = M.batonnets.creer(g);
    const queue = { osEnPlus: [{ nom: 'queue', parent: 'bassin', attache: [-4, -4, 0], angle: 120, longueur: 40 }] };
    const res = M.squelette.calculer({}, queue);
    perso.rendre(res);
    const l = g.querySelector('[data-os="queue"]');
    const avec = { present: !!l, x2: l && +l.getAttribute('x2'), attendu: res.articulations.queueBout[0], partie: !!g.querySelector('[data-partie="queue"]') };
    perso.rendre(M.squelette.calculer({}));
    return { avec, apres: !!g.querySelector('[data-os="queue"]') };
  })()`));
  assert.equal(r.avec.present, true);
  assert.equal(r.avec.partie, true);
  assert.ok(Math.abs(r.avec.x2 - r.avec.attendu) < 0.01);
  assert.equal(r.apres, false);
});

test('habillage : apparence par variables CSS', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const r = await avecPage((p) => p.evaluer(`(() => {
    const g = document.getElementById('g');
    M.batonnets.creer(g, { couleurs: { corps: '#112233', touffe: '#ff0000' }, epaisseur: 10 });
    return [g.style.getPropertyValue('--pm-perso-corps'), g.style.getPropertyValue('--pm-perso-touffe'), g.style.getPropertyValue('--pm-perso-epaisseur')];
  })()`));
  assert.deepEqual(r, ['#112233', '#ff0000', '10']);
});
