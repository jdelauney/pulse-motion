'use strict';
/* Spec « Mouvement vivant », plan V3 : lancer vers un personnage, un point ou un élément, roulement (5.8), ombre d'un
 * personnage qui flotte (5.7, point 4), dans la page. Unitaires : personnages-gestes.test.js. */
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

const OBJET = 'position:absolute; width:4cqh; height:4cqh; border-radius:50%; background:#e33';
const SCENE = `<section data-scene="chiffre">
  <div id="n1" data-personnage="touffu" data-x="20" data-taille="35"></div>
  <div id="n2" data-personnage="touffu" data-x="80" data-vue="180" data-taille="35">
    <i data-action="marcher" data-vers="65" data-start="1" data-dur="2.5"></i>
    <i data-action="regarder" data-cible="#balle" data-start="0.5"></i>
  </div>
  <div id="panier" style="position:absolute; left:40cqw; top:70cqh; width:10cqw; height:8cqh; background:#ccc"></div>
  <div id="balle" data-tenu-par="#n1" data-start="0.5" data-dur="1" data-lacher="lance" data-cible="#n2" data-hauteur="20" style="${OBJET}"></div>
  <div id="caillou" data-tenu-par="#n1" data-main="arriere" data-start="0.5" data-dur="2" data-lacher="lance" data-cible="50% 85%" data-hauteur="10" data-tours="2" data-roule="10" style="${OBJET}"></div>
  <div id="pomme" data-tenu-par="#n1" data-start="0.5" data-dur="3" data-lacher="lance" data-cible="#panier" style="${OBJET}"></div>
  <div id="flotteur" data-personnage="touffu" data-x="50" data-sol="92" data-taille="20"><i data-action="flotter" data-hauteur="20" data-start="1" data-dur="3"></i></div>
</section>`;

test('lancer, rouler et flotter dans la page : vol, arrivée, main qui reçoit, écrasement, roulement, ombre, ordre de rendu', SANS, async () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), SCENE);
  const json = path.join(dir, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(json, 'utf8'));
  d.scenes[1].duree = 8;
  delete d.scenes[1].rythme;
  fs.writeFileSync(json, JSON.stringify(d, null, 2));
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.deepEqual(r.erreurs.filter((e) => e.regle === 'personnage-invalide'), []);
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const res = await page.evaluer(`(async () => {
      await M.pret;
      const d = M.minutage.scenes.find((s) => s.id === 'chiffre').debut;
      const W = M.personnages.W, H = M.personnages.H;
      const el = (id) => document.getElementById(id);
      const lire = async (id, t) => {
        await M.seek(t);
        const s = el(id).style, tr = s.transform;
        const rot = /rotate\\(([-\\d.]+)deg\\)/.exec(tr), sc = /scale\\(([\\d.]+), ([\\d.]+)\\)/.exec(tr);
        return { x: parseFloat(s.left) / 100 * W, y: parseFloat(s.top) / 100 * H, angle: rot ? +rot[1] : 0, sx: sc ? +sc[1] : 1, sy: sc ? +sc[2] : 1 };
      };
      const main = (id, t, cote) => { const m = M.personnages.mains(el(id), t); return { x: m[cote].x, y: m[cote].y }; };
      const out = { W, H, erreurs: (M.erreurs || []).map((e) => e.message) };
      // Balle vers n2, qui marche.
      const vb = M.objetsTenus.vol(el('balle'));
      out.balle = { vol: vb, auLacher: await lire('balle', vb.t0), mainLacher: main('n1', vb.t0, 'avant'),
        avantArrivee: await lire('balle', vb.t0 + vb.T - 0.002), arrivee: await lire('balle', vb.t0 + vb.T + 0.001), mainArrivee: main('n2', vb.t0 + vb.T, 'avant'),
        apres: await lire('balle', vb.t0 + vb.T + 0.6), mainApres: main('n2', vb.t0 + vb.T + 0.6, 'avant') };
      // Caillou vers un point, deux tours, roulement.
      const vc = M.objetsTenus.vol(el('caillou'));
      const ys = [];
      for (let k = 0; k <= 60; k++) ys.push((await lire('caillou', vc.t0 + vc.T * k / 60)).y);
      out.caillou = { vol: vc, depart: await lire('caillou', vc.t0), arrivee: await lire('caillou', vc.t0 + vc.T), contact: await lire('caillou', vc.t0 + vc.T + 0.001),
        apresContact: await lire('caillou', vc.t0 + vc.T + 0.09), roule: await lire('caillou', vc.t0 + vc.T + 1.2), plusHaut: Math.min.apply(null, ys),
        hauteur: el('caillou').offsetHeight / el('n1').offsetHeight * H };
      // Pomme vers le haut-milieu du panier.
      const vp = M.objetsTenus.vol(el('pomme'));
      out.pomme = { vol: vp, arrivee: await lire('pomme', vp.t0 + vp.T + 0.2) };
      // Flotteur : l'ombre reste au sol et rétrécit.
      const ombre = async (t) => { await M.seek(d + t); const o = el('flotteur').querySelector('ellipse.pm-perso-ombre'); return { cy: +o.getAttribute('cy'), rx: +o.getAttribute('rx') }; };
      out.ombre = { avant: await ombre(0.5), haut: await ombre(2.5), apres: await ombre(4.6) };
      // Même image quel que soit l'ordre : objets et personnages, à l'endroit puis à l'envers.
      const instants = [d + 1.2, d + 1.8, d + 2.4, d + 2.9, d + 3.4, d + 4.2, d + 5.5];
      const image = async (t) => { await M.seek(t); return ['balle', 'caillou', 'pomme'].map((i) => el(i).style.cssText).join('|') + ['n1', 'n2', 'flotteur'].map((i) => el(i).querySelector('svg').innerHTML).join('|'); };
      const endroit = [];
      for (const t of instants) endroit.push(await image(t));
      const envers = [];
      for (const t of instants.slice().reverse()) envers.unshift(await image(t));
      out.ordre = endroit.every((x, i) => x === envers[i]);
      out.erreursFin = (M.erreurs || []).map((e) => e.message);
      return out;
    })()`);
    assert.deepEqual(res.erreurs, []);
    const { W, H } = res;
    const pres = (a, b, tol, msg) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= tol, `${msg} : (${a.x.toFixed(2)}, ${a.y.toFixed(2)}) / (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
    // L'objet quitte la main au lâcher et arrive sur la cible à t0 + T.
    const b = res.balle;
    pres(b.auLacher, b.mainLacher, 0.01, 'balle dans la main de n1 au lâcher');
    assert.ok(b.vol.T > 0.3 && b.vol.T < 2, `durée du vol ${b.vol.T}`);
    // Vers un personnage qui marche : il arrive dans sa main, puis il la suit.
    pres(b.avantArrivee, b.mainArrivee, 0.005 * W, 'juste avant l\'arrivée, la balle est sur la main de n2');
    pres(b.arrivee, b.mainArrivee, 0.005 * W, 'à l\'arrivée, dans la main de n2');
    pres(b.apres, b.mainApres, 0.01, 'puis elle suit la main de n2');
    assert.ok(Math.abs(b.apres.x - b.arrivee.x) > 1, 'n2 a bougé, la balle avec lui');
    // Vers un point : arrivée, sommet à data-hauteur au-dessus du plus haut des deux points, deux tours.
    const c = res.caillou;
    pres(c.arrivee, { x: 0.5 * W, y: 0.85 * H }, 0.01, 'caillou sur le point visé');
    const sommet = Math.min(c.vol.p0.y, 0.85 * H) - 0.10 * H;
    assert.ok(Math.abs(c.vol.sommet - sommet) < 1e-6, `sommet ${c.vol.sommet} / ${sommet}`);
    assert.ok(Math.abs(c.plusHaut - sommet) < 0.003 * H, `point le plus haut ${c.plusHaut} / ${sommet}`);
    assert.ok(Math.abs(c.arrivee.angle - c.depart.angle - 720) < 0.05, `deux tours : ${c.arrivee.angle - c.depart.angle}°`);
    // Écrasement de 80 ms au contact.
    assert.ok(Math.abs(c.contact.sx - 1.1) < 0.01 && Math.abs(c.contact.sy - 0.88) < 0.01, `écrasé : ${c.contact.sx} × ${c.contact.sy}`);
    assert.ok(c.apresContact.sx === 1 && c.apresContact.sy === 1, 'revenu à 80 ms');
    // Roulement : rotation = distance / rayon (10 % de la largeur, demi-hauteur de l'objet).
    const dx = c.roule.x - c.arrivee.x;
    assert.ok(Math.abs(dx - 0.1 * W) < 0.01, `distance ${dx}`);
    const attendu = dx / (c.hauteur / 2) * 180 / Math.PI;
    assert.ok(Math.abs(c.roule.angle - c.arrivee.angle - attendu) < 0.1, `rotation ${c.roule.angle - c.arrivee.angle} / ${attendu}`);
    // Vers un élément : le haut-milieu de sa boîte.
    pres(res.pomme.arrivee, { x: 0.45 * W, y: 0.70 * H }, 0.005 * W, 'pomme sur le panier');
    // Flotter : l'ombre reste sur la ligne du sol (92 %) et rétrécit en l'air.
    for (const o of Object.values(res.ombre)) assert.ok(Math.abs(o.cy - 0.92 * H) < 0.02, `ombre au sol : ${o.cy}`);
    assert.ok(res.ombre.haut.rx < 0.9 * res.ombre.avant.rx, `ombre plus petite : ${res.ombre.haut.rx} / ${res.ombre.avant.rx}`);
    assert.ok(Math.abs(res.ombre.apres.rx - res.ombre.avant.rx) < 0.05, 'de retour au sol');
    // Lancer : même image quel que soit l'ordre de rendu.
    assert.equal(res.ordre, true);
    assert.deepEqual(res.erreursFin, []);
  } finally {
    await page.fermer();
  }
});
