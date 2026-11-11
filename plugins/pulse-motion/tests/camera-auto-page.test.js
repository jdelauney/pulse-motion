'use strict';
/* Spec « Explication narrée » (S7), plan J3 « Caméra automatique » (5.8) : critères rendus dans Chrome ou Edge sans fenêtre.
 * Plan calculé depuis le relevé de la page, cadrage posé à chaque image, aucun texte coupé pendant un plan tenu, bande des
 * sous-titres, continuité d'une scène à l'autre, camera-auto-cadre, plans dans le contrôle, mêmes images deux fois. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { prouver } = require('../scripts/lib/determinisme.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const L = 640, H = 360;

const STYLE = `<style>@scope { .b { position: absolute; width: 30cqh; height: 12cqh; display: flex; align-items: center; justify-content: center;
  background: var(--c-primaire); color: var(--c-sur-primaire); font-size: 4cqh; } .n { position: absolute; font-size: 4cqh; margin: 0; } }</style>`;
const CONTENU = `<div id="client" class="b" style="left: 20cqh; top: 30cqh" data-texte="client" data-start="0.3"></div>
<div id="serveur" class="b" style="left: 120cqh; top: 30cqh" data-texte="serveur" data-start="0.3"></div>
<p id="note" class="n" style="left: 128cqh; top: 70cqh" data-texte="titre" data-start="3"></p>
<p id="autre" class="n" style="left: 22cqh; top: 70cqh" data-texte="autre" data-start="6.5"></p>`;
const SCENE = `${STYLE}<div data-camera="auto">${CONTENU}</div>`;
const TEXTES = { client: 'Client', serveur: 'Serveur', titre: 'Une note', autre: 'Une autre' };
// Scène qui reprend la précédente : les mêmes éléments, là dès le début (sans data-start).
const REPRISE = `${STYLE}<div data-camera="auto">${CONTENU.replace(/ data-start="[^"]*"/g, '')}</div>`;

function page(scenes, deroule = {}) {
  const liste = (Array.isArray(scenes) ? scenes : [{ id: 's', html: scenes }]).map((s) => ({ duree: 13, textes: TEXTES, transition: 'coupe', ...s }));
  const dir = miniProjet({ scenes: liste, deroule });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(fichier, a.html);
  return { a, fichier, dir };
}
const ouvrir = (p, o = {}) => ouvrirCapture({ fichierHtml: p.fichier, largeur: o.largeur || L, hauteur: o.hauteur || H, navigateur, delai: 60000 });
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));

test('caméra auto (page) : plan calculé depuis le relevé, posé à chaque image ; aucun texte ni carte coupé pendant un plan tenu ; recul final', { ...SANS, timeout: 180000 }, async () => {
  const p = page(SCENE);
  assert.ok(p.a.html.includes('M.demarrerCameraAuto();'));
  const c = await ouvrir(p);
  try {
    const plans = await json(c, 'M.seek(0).then(function () { return M.plansCamera(); })');
    assert.ok(plans.s && plans.s.mouvements.length >= 1, JSON.stringify(plans));
    assert.ok(plans.s.depart.zoom >= 1);
    // À chaque instant tenu : le transform du conteneur suit le plan ; chaque élément jugé est entier ou dehors.
    const r = await json(c, `(async function () {
      var sortie = [], cam = document.querySelector('[data-camera]'), scene = document.getElementById('pm-scene');
      for (var t = 0.2; t < 13; t += 0.3) {
        await M.seek(t);
        var a = M.cameraAutoA('s', t), plan = M.plansCamera().s;
        var bouge = plan.mouvements.some(function (m) { return t > m.debut && t < m.debut + m.duree; });
        var s = scene.getBoundingClientRect();
        var coupes = Array.prototype.filter.call(document.querySelectorAll('.b, .n'), function (el) {
          if (getComputedStyle(el).opacity === '0') return false;
          var b = el.getBoundingClientRect(), m = 1;
          var dehors = b.right <= s.left + m || b.left >= s.right - m || b.bottom <= s.top + m || b.top >= s.bottom - m;
          var dedans = b.left >= s.left - m && b.right <= s.right + m && b.top >= s.top - m && b.bottom <= s.bottom + m;
          return !dehors && !dedans;
        }).map(function (el) { return el.id; });
        sortie.push({ t: t, zoom: a.zoom, transform: cam.style.transform, bouge: bouge, coupes: coupes });
      }
      return sortie;
    })()`);
    for (const x of r) {
      assert.match(x.transform, new RegExp(`scale\\(${String(x.zoom).replace('.', '\\.')}\\)`), `t=${x.t}`);
      if (!x.bouge) assert.deepEqual(x.coupes, [], `t=${x.t.toFixed(1)}`);
    }
    assert.ok(r.some((x) => x.zoom > 1.2), 'un rapprochement');
    assert.ok(r[r.length - 1].zoom < 1.05, `recul final : zoom ${r[r.length - 1].zoom}`);
  } finally { await c.fermer(); }
});

test('caméra auto (page) : deux chargements donnent le même plan ; le même projet exporté deux fois donne les mêmes images', { ...SANS, timeout: 240000 }, async () => {
  const p = page(SCENE);
  const a = await ouvrir(p), b = await ouvrir(p);
  try {
    const pa = await json(a, 'M.seek(1).then(function () { return M.plansCamera(); })');
    const pb = await json(b, 'M.seek(5).then(function () { return M.plansCamera(); })');
    assert.deepEqual(pa, pb);
  } finally { await a.fermer(); await b.fermer(); }
  const r = await prouver({ fichierHtml: p.fichier, instants: [{ scene: 's', t: 1 }, { scene: 's', t: 3.4 }, { scene: 's', t: 5.2 }, { scene: 's', t: 9.1 }], ouvrir: ouvrirCapture, navigateur, psnrMin: Infinity });
  assert.deepEqual(r.problemes, []);
  assert.deepEqual([...r.nonFaites], []);
});

test('caméra auto (page) : les plans évitent la bande des sous-titres ; les secousses s\'ajoutent ; la caméra manuelle reste prioritaire', { ...SANS, timeout: 180000 }, async () => {
  const p = page([{ id: 's', html: `${STYLE}<div data-camera="auto; secousse 1 2+0.4">${CONTENU}</div>`, voix: { texte: 'Le client envoie sa commande au serveur, puis une note.' } },
    { id: 'm', html: `${STYLE}<div data-camera="zoom 1→1.2 0+4">${CONTENU}</div>` }], { sousTitres: { mode: 'ligne' } });
  const c = await ouvrir(p);
  try {
    const r = await json(c, 'M.seek(0).then(function () { return { bande: M.bandeSousTitres(), plans: M.plansCamera() }; })');
    assert.ok(r.bande && r.bande.haut > 60 && r.bande.haut < 100, JSON.stringify(r.bande));
    assert.ok(Math.abs(r.plans.s.utile.y1 - r.bande.haut) < 0.01, JSON.stringify(r.plans.s.utile));
    assert.equal(r.plans.m, undefined, 'la scène à caméra manuelle n\'a pas de plan automatique');
    const secousse = await json(c, 'M.seek(2.1).then(function () { return document.querySelector("section[data-scene=s] [data-camera]").style.transform; })');
    assert.doesNotMatch(secousse, /^translate\(0cqh, 0cqh\)/, secousse);
  } finally { await c.fermer(); }
});

test('caméra auto (page) : une scène qui continue la précédente part de son dernier plan ; conteneur partiel → camera-auto-cadre ; plans dans le contrôle', { ...SANS, timeout: 240000 }, async () => {
  const p = page([{ id: 'a', html: SCENE }, { id: 'b', html: REPRISE, duree: 6, transition: 'fondu' },
    { id: 'c', html: `${STYLE}<div data-camera="auto" style="inset: auto; left: 0; top: 0; width: 50%; height: 50%">${CONTENU}</div>`, duree: 4 }]);
  const c = await ouvrir(p);
  try {
    const r = await json(c, 'M.seek(0).then(function () { return M.mesurerCameraAuto(); })');
    assert.equal(r.plans.b.continue, true, JSON.stringify(r.plans.b));
    assert.equal(r.plans.a.continue, false);
    assert.equal(r.plans.c, undefined);
    assert.deepEqual(r.constats.map((x) => [x.regle, x.scene]), [['camera-auto-cadre', 'c']]);
    // Départ de b : la dernière image de a.
    const fin = await json(c, `M.seek(0).then(function () { var a = M.minutage.scenes[0]; return [M.cameraAutoA('a', a.fin - a.debut), M.cameraAutoA('b', 0)]; })`);
    assert.ok(Math.abs(fin[0].zoom - fin[1].zoom) < 0.02 && Math.abs(fin[0].x - fin[1].x) < 0.5, JSON.stringify(fin));
  } finally { await c.fermer(); }
  const v = await controlerRendu({ html: p.a.html, ratio: '16:9', duree: 23, navigateur });
  assert.equal(v.renduVerifie, true);
  assert.ok(v.problemes.some((x) => x.regle === 'camera-auto-cadre' && x.scene === 'c' && x.gravite === 'erreur'), JSON.stringify(v.problemes.map((x) => x.regle)));
  assert.ok(v.cameras && v.cameras.a && v.cameras.b && Array.isArray(v.cameras.a.mouvements), JSON.stringify(v.cameras));
});
