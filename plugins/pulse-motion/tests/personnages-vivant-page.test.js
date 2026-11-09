'use strict';
/* Spec « Mouvement vivant », plan V1 : ombre au sol (5.6) et écrasement à l'atterrissage (5.7) dans la page. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };

const SCENE = `<section data-scene="chiffre">
  <p id="nombre" data-tween="nombre 0→1250 cubic-out" data-dur="7">0</p>
  <div class="decor"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%"><path id="colline" d="M0 85 L100 65" fill="none" stroke="#888"/></svg></div>
  <div id="sauteur" data-personnage="touffu" data-x="15" data-sol="90" data-taille="30">
    <i id="bond" data-action="bondir" data-vers="35" data-hauteur="20" data-start="1" data-dur="1"></i>
  </div>
  <div id="grimpeur" data-personnage="touffu" data-x="50" data-sol="#colline" data-taille="20">
    <i data-action="marcher" data-vers="80" data-start="0" data-dur="4"></i>
  </div>
  <div id="glisseur" data-personnage="touffu" data-x="10" data-sol="70" data-taille="15">
    <i data-action="glisser" data-vers="40" data-sol="50" data-start="1" data-dur="2"></i>
  </div>
  <div id="sansombre" data-personnage="touffu" data-x="90" data-sol="95" data-taille="15" data-ombre="non" data-ecrase="0">
    <i data-action="bondir" data-vers="85" data-start="1" data-dur="1"></i>
  </div>
</section>`;

test('ombre et écrasement dans la page : sous les chevilles, sur le sol (droit, courbe, glissé), plus petite en l\'air, volume gardé, même image quel que soit l\'ordre', SANS, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), SCENE);
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.deepEqual(r.erreurs.filter((e) => e.regle === 'personnage-invalide'), []);
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const res = await page.evaluer(`(async () => {
      await M.pret;
      const d = M.minutage.scenes.find((s) => s.id === 'chiffre').debut;
      const H = M.personnages.H, W = M.personnages.W;
      const lire = async (id, t) => {
        await M.seek(d + t);
        const div = document.getElementById(id);
        const o = div.querySelector('ellipse.pm-perso-ombre');
        const svg = div.querySelector('svg');
        const g = svg.querySelector(':scope > g');
        const pose = M.personnages.pose(div, d + t);
        const rq = M.squelette.calculer(pose, null), A = rq.articulations, e = rq.efficace;
        const cheville = { x: e.x + (A.chevilleAvant[0] + A.chevilleArriere[0]) / 2 * e.echelle, y: e.y + (Math.max(A.chevilleAvant[1], A.chevilleArriere[1]) + 7) * e.echelle };
        return { ombre: o ? { cx: +o.getAttribute('cx'), cy: +o.getAttribute('cy'), rx: +o.getAttribute('rx'), ry: +o.getAttribute('ry'), premier: svg.firstElementChild === o, style: o.getAttribute('style') } : null,
          transform: g.getAttribute('transform'), cheville, x: pose.x, H, W };
      };
      const bond = M.minutage.elements.chiffre.bond;
      const fin = bond.fin - d;
      const out = { sol: await lire('sauteur', 0.5), sommet: await lire('sauteur', 1.5), contact: await lire('sauteur', fin + 0.06), apres: await lire('sauteur', fin + 1),
        colline: [await lire('grimpeur', 1), await lire('grimpeur', 3)], glisse: [await lire('glisseur', 1.5), await lire('glisseur', 2.5)], sans: await lire('sansombre', 1.95) };
      out.encore = await lire('sauteur', 1.5);
      out.erreurs = (M.erreurs || []).map((x) => x.message);
      return out;
    })()`);
    assert.deepEqual(res.erreurs, []);
    const { sol, sommet, contact, apres } = res;
    // Au sol : centrée entre les chevilles, sur la ligne du sol (90 % de la hauteur), sous le personnage (premier dessin).
    assert.ok(sol.ombre.premier, 'l\'ombre est dessinée avant le personnage');
    assert.match(sol.ombre.style, /fill: var\(--pm-ombre, var\(--c-texte, #1a1a1a\)\); fill-opacity: 0\.2/);
    assert.ok(Math.abs(sol.ombre.cx - sol.cheville.x) < 0.02, `centrée : ${sol.ombre.cx} / ${sol.cheville.x}`);
    assert.ok(Math.abs(sol.ombre.cy - 0.9 * sol.H) < 0.02, `sur le sol : ${sol.ombre.cy}`);
    assert.ok(Math.abs(sol.ombre.ry - 0.16 * sol.ombre.rx) < 0.02, 'pilule fine');
    // Au sommet du bond : plus petite (au moins 35 %), toujours sur le sol.
    assert.ok(sommet.ombre.rx < 0.9 * sol.ombre.rx && sommet.ombre.rx >= 0.35 * sol.ombre.rx - 0.02, `plus petite : ${sommet.ombre.rx} / ${sol.ombre.rx}`);
    assert.ok(Math.abs(sommet.ombre.cy - 0.9 * sol.H) < 0.02, 'toujours sur le sol');
    // Contact : écrasé de 12 %, volume gardé (sx = 1 / sy^0,6), autour du point de contact au sol.
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+) ([\d.]+)\) translate\(([-\d.]+) ([-\d.]+)\)/.exec(contact.transform || '');
    assert.ok(m, `écrasement : ${contact.transform}`);
    const sx = +m[3], sy = +m[4];
    assert.ok(Math.abs(sy - 0.88) < 1e-3, `sy ${sy}`);
    assert.ok(Math.abs(sx - 1 / Math.pow(0.88, 0.6)) < 1e-3, `sx ${sx}`);
    assert.ok(Math.abs(+m[2] - 0.9 * sol.H) < 0.02 && +m[1] === -m[5] && +m[2] === -m[6], 'pivot au sol, sous le personnage');
    assert.equal(apres.transform, null, 'plus rien après l\'atterrissage');
    // Sol courbe : l'ombre suit la colline (sol de 85 % à 65 % sur la largeur).
    for (const c of res.colline) assert.ok(Math.abs(c.ombre.cy - (85 - 20 * c.ombre.cx / c.W) / 100 * c.H) < 2, `colline : ${c.ombre.cy}`);
    // Glisser : le sol suit le personnage, l'ombre reste sous ses pieds.
    for (const g of res.glisse) {
      assert.ok(Math.abs(g.ombre.cy - g.cheville.y) < 0.5, `glisser : ${g.ombre.cy} / ${g.cheville.y}`);
      assert.ok(Math.abs(g.ombre.rx - sol.ombre.rx / 30 * 15) < 0.5, 'pleine taille (au sol)');
    }
    // data-ombre="non" et data-ecrase="0" : ni ombre ni écrasement.
    assert.equal(res.sans.ombre, null);
    assert.equal(res.sans.transform, null);
    // Même image en revenant en arrière.
    assert.equal(JSON.stringify(res.encore), JSON.stringify(sommet));
  } finally { await page.fermer(); }
});
