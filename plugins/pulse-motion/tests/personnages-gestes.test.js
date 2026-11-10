'use strict';
/* Spec « Mouvement vivant », plan V3 « Gestes avancés » : regard qui suit un mobile et attention (5.5, points 2 et 3),
 * flotter (5.7, point 4), validation du lancer (5.8). Le lancer, le roulement et l'ombre d'un vol dans la page :
 * personnages-gestes-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const S = require('../moteur/squelette.js');
const PA = require('../moteur/personnages/partition.js');
const V = require('../moteur/vivant.js');
const P = require('../scripts/lib/personnages.js');
const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');

const lu = P.lire(null);
const bib = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions };
const gab = S.completerGabarit(lu.gabarits.standard);
const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const partition = (actions, extra = {}) => Object.assign({ x0: 50, vue0: 0, largeur: 1600, hauteur: 900, echelle: 1, taille: 40, sel: V.sel('scene/a'), scene: { debut: 0, fin: 12 }, actions }, extra);

// --- 5.5 Regard qui suit un mobile, attention -------------------------------------------------------------------------

/** Charge un module d'interactions (le moteur, ou une copie gardée) et rend son M.interactions. */
function interactions(fichier = '../moteur/personnages/interactions.js') {
  globalThis.M = globalThis.M || {};
  globalThis.M.squelette = S;
  delete require.cache[require.resolve(fichier)];
  require(fichier);
  return globalThis.M.interactions;
}
const CONTENEUR = {};
const base = () => Object.assign({}, S.REPOS, { x: 400, y: 600, echelle: 1, vue: 0 });
/** Personnage qui regarde la cible el (stub du DOM : sa scène ne connaît que el). */
function regardeur(action, el) {
  return { partition: { actions: [action] }, gabarit: gab, miroir: false, sec: { querySelector: () => el },
    div: { parentElement: CONTENEUR, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }) } };
}
/** Pose d'un personnage cible à u : il marche en diagonale (sa tête monte et avance). */
const cibleQui = (u) => Object.assign({}, S.REPOS, { x: 1000 + 300 * u, y: 700 - 200 * u, echelle: 1, vue: 180 });

test('regarder un personnage qui marche : la tête le suit avec 0,14 s de retard', () => {
  const I = interactions();
  globalThis.M.objetsTenus = undefined;
  const q = { div: { parentElement: CONTENEUR }, gabarit: gab };
  const vu = (placer, t) => {
    const p = regardeur({ type: 'regarder', debut: 0, fin: 10, cible: '#q' }, q.div);
    return I.appliquer(p, t, base(), { persos: [p, q], W: 1600, H: 900, placerBase: (x, u) => placer(u) });
  };
  for (const t of [2, 2.5, 3]) {
    const mobile = vu(cibleQui, t);
    const teteFixe = vu(() => cibleQui(t - 0.14), t), yeuxFixes = vu(() => cibleQui(t - 0.05), t);
    proche(mobile.tete, teteFixe.tete, 1e-9, 'tête à t − 0,14');
    proche(mobile.regardX, yeuxFixes.regardX, 1e-9, 'pupilles à t − 0,05');
    proche(mobile.regardY, yeuxFixes.regardY, 1e-9, 'pupilles à t − 0,05');
    assert.ok(Math.abs(mobile.tete - vu(() => cibleQui(t), t).tete) > 1e-3, 'la tête n\'est pas sur la position de l\'instant');
  }
});

test('regarder un objet lancé : les pupilles le suivent avec 0,05 s de retard', () => {
  const I = interactions();
  const balle = { parentElement: CONTENEUR };
  const vol = (u) => ({ x: 900 + 400 * u, y: 500 - 300 * u + 150 * u * u });
  const vu = (point, t) => {
    globalThis.M.objetsTenus = { connu: (el) => el === balle, point: (el, u) => point(u) };
    const p = regardeur({ type: 'regarder', debut: 0, fin: 10, cible: '#balle' }, balle);
    return I.appliquer(p, t, base(), { persos: [p], W: 1600, H: 900, placerBase: () => null });
  };
  for (const t of [1, 1.5, 2]) {
    const mobile = vu(vol, t);
    const yeux = vu(() => vol(t - 0.05), t), tete = vu(() => vol(t - 0.14), t);
    proche(mobile.regardX, yeux.regardX, 1e-9, 'pupilles');
    proche(mobile.regardY, yeux.regardY, 1e-9, 'pupilles');
    proche(mobile.tete, tete.tete, 1e-9, 'tête à t − 0,14');
    assert.ok(Math.abs(mobile.regardY - vu(() => vol(t), t).regardY) > 1e-4, 'pas sur la position de l\'instant');
  }
  // atteindre un objet tenu : l'élément est mesuré à l'image, comme avant (pas de point en retard).
  globalThis.M.objetsTenus = undefined;
});

test('data-attention 0.5 : la moitié de la rotation de tête', () => {
  const I = interactions();
  const vu = (attention) => {
    const a = { type: 'regarder', debut: 0, fin: 10, cible: '90% 5%' };
    if (attention !== undefined) a.attention = attention;
    const p = regardeur(a, null);
    return I.appliquer(p, 3, base(), { persos: [p], W: 1600, H: 900, placerBase: () => null });
  };
  const b = base(), plein = vu(), moitie = vu(0.5), rien = vu(0);
  assert.ok(Math.abs(plein.tete - b.tete) > 5, `la tête tourne : ${plein.tete}`);
  proche(moitie.tete - b.tete, 0.5 * (plein.tete - b.tete), 1e-9, 'moitié de la tête');
  proche(moitie.regardX, 0.5 * plein.regardX, 1e-9, 'moitié des yeux');
  assert.deepEqual(rien, b);
  proche(vu(1).tete, plein.tete, 1e-12);
  // Validation : de 0 à 1, sur regarder seulement.
  const err = (attr, type = 'regarder') => preparerPersonnages(`<section><div data-personnage="touffu"><i data-action="${type}" data-cible="50% 50%" data-attention="${attr}" data-start="0" data-dur="1"></i></div></section>`, { scene: 's', lu }).erreurs.map((e) => e.message);
  assert.deepEqual(err('0.5'), []);
  assert.match(err('1.5')[0], /data-attention="1\.5" : de 0 à 1/);
  assert.match(err('0.5', 'atteindre')[0], /data-attention ne sert qu'à « regarder »/);
});

test('regarder un élément de la page : comportement de 0.24.0', () => {
  // Copie du module de 0.36.0 (même regard qu'en 0.24.0 sur un élément, yeux en avance de V1 compris).
  const ancien = interactions('./fixtures/interactions-0.36.0.js');
  const nouveau = interactions();
  globalThis.M.objetsTenus = { connu: () => false, point: () => null };
  const el = { getBoundingClientRect: () => ({ left: 1100, top: 150, width: 120, height: 60 }), getClientRects: () => [1] };
  for (const actions of [[{ type: 'regarder', debut: 1, fin: 4, cible: '#pancarte' }], [{ type: 'regarder', debut: 1, fin: 4, cible: '#pancarte', point: '50% 0%' }, { type: 'atteindre', debut: 2, fin: 3, cible: '#pancarte', main: 'avant' }]]) {
    for (let t = 0.8; t < 4.3; t += 0.07) {
      const vu = (I) => {
        const p = regardeur(actions.map((a) => Object.assign({}, a)), el);
        p.partition.actions = p.partition.actions;
        return I.appliquer(p, t, base(), { persos: [p], W: 1600, H: 900, placerBase: () => null });
      };
      assert.deepEqual(vu(nouveau), vu(ancien), `t = ${t}`);
    }
  }
  globalThis.M.objetsTenus = undefined;
});

// --- 5.7 point 4 : flotter ---------------------------------------------------------------------------------------

const VOL = { type: 'flotter', debut: 1, fin: 7, hauteur: 12 };
const etat = (part, t) => PA.etatAuTemps(part, t, bib, gab);

test('flotter : élévation, dérive, descente, l\'ombre reste au sol', () => {
  const part = partition([Object.assign({}, VOL)]);
  proche(PA.positionAuTemps(part, 0.5).sol, 90, 1e-9, 'au sol avant');
  // Montée sur min(0,9 s ; 30 %) : 12 % au-dessus du sol au bout de 0,9 s.
  proche(90 - PA.positionAuTemps(part, 1.9).sol, 12, 1e-6, 'en haut');
  // Dérive : ±5 % de la taille (40 % de l'image : ±2 %), sans dépasser.
  for (let t = 2; t < 6.3; t += 0.1) {
    const h = 90 - PA.positionAuTemps(part, t).sol;
    assert.ok(h > 9.9 && h < 14.1, `t ${t} : ${h}`);
    proche(PA.solAuTemps(part, t, 50), 90, 1e-9, 'le sol de l\'ombre ne monte pas');
  }
  proche(PA.positionAuTemps(part, 7).sol, 90, 1e-9, 'au sol au contact');
  // Contact : écrasement de 6 % (data-ecrase le change).
  assert.deepEqual(PA.contacts(part, bib).map((c) => [c.t, c.A, c.etire]), [[7, 0.06, false]]);
  proche(etat(part, 7.06).ecraseY, 0.94, 1e-6);
  assert.deepEqual(PA.contacts(partition([Object.assign({}, VOL, { ecrase: 0 })]), bib).map((c) => c.A), [0]);
  // Il garde la vue et ne change pas l'état du corps.
  assert.equal(etat(part, 4).corps, 'repos');
  assert.equal(etat(part, 4).vue, 0);
  // data-vers : il dérive vers x pendant le vol.
  const vers = partition([Object.assign({}, VOL, { vers: 70 })]);
  proche(PA.positionAuTemps(vers, 7).x, 70, 1e-9);
});

test('flotter : orteils plus bas que la cheville pendant le vol', () => {
  const part = partition([Object.assign({}, VOL)]);
  for (const t of [2.5, 4, 5.5]) {
    const r = S.calculer(Object.assign(etat(part, t).pose, { x: 0, y: 0, echelle: 1 }), gab);
    for (const c of ['Avant', 'Arriere']) assert.ok(r.articulations['orteil' + c][1] > r.articulations['cheville' + c][1] + 5, `t ${t}, pied ${c}`);
  }
  // Au sol, avant le vol : le pied est à plat.
  const sol = S.calculer(Object.assign(etat(part, 0.5).pose, { x: 0, y: 0, echelle: 1 }), gab);
  assert.ok(Math.abs(sol.articulations.orteilAvant[1] - sol.articulations.chevilleAvant[1]) < 3);
});

test('flotter : genoux qui alternent avec une période de 3 s', () => {
  const part = partition([{ type: 'flotter', debut: 1, fin: 11, hauteur: 12 }], { vie: 'aucune' });
  for (const t of [2.5, 3.2, 4, 4.7]) {
    const a = etat(part, t).pose, b = etat(part, t + 3).pose;
    proche(a.tibiaAvant, b.tibiaAvant, 1e-6, 'période de 3 s');
    proche(a.tibiaAvant - a.tibiaArriere, 6 + 10 * Math.sin(2 * Math.PI * (t - 1) / 3), 1e-6, 'les deux genoux alternent');
  }
  const x = etat(part, 4.25).pose, y = etat(part, 5.75).pose; // demi-période : l'autre genou est plié
  assert.ok(x.tibiaAvant > x.tibiaArriere && y.tibiaArriere > y.tibiaAvant - 6 - 1e-6);
});

test('flotter : pieds à plat au contact', () => {
  const vol = partition([Object.assign({}, VOL)], { vie: 'aucune' });
  const sol = partition([], { vie: 'aucune' });
  for (const t of [6.999, 7, 7.2]) {
    const a = etat(vol, t).pose, b = etat(sol, t).pose;
    for (const k of ['piedAvant', 'piedArriere', 'tibiaAvant', 'tibiaArriere', 'ecartJambeAvant', 'ecartBrasAvant']) proche(a[k], b[k], 0.5, `${k} à ${t}`);
  }
  // Et dès 0,15 s avant le contact, les pieds reviennent vers le plat.
  assert.ok(etat(vol, 6.95).pose.piedAvant < etat(vol, 6.8).pose.piedAvant);
});

test('flotter : même pose quel que soit l\'ordre des appels', () => {
  const part = partition([Object.assign({}, VOL), { type: 'pose', pose: 'montrer', debut: 2, fin: 5 }]);
  const instants = [4.2, 1.3, 6.9, 2.6];
  const avant = instants.map((t) => etat(part, t));
  const apres = instants.slice().reverse().map((t) => etat(part, t)).reverse();
  assert.deepEqual(apres, avant);
});

test('flotter sans data-dur : erreur d\'assemblage en français', () => {
  const erreurs = (action) => preparerPersonnages(`<section><div data-personnage="touffu">${action}</div></section>`, { scene: 's', lu }).erreurs.map((e) => e.message);
  assert.match(erreurs('<i data-action="flotter" data-start="1"></i>').join(' '), /action « flotter » : data-dur obligatoire \(durée du vol, ex\. data-dur="3"\)\./);
  assert.deepEqual(erreurs('<i data-action="flotter" data-hauteur="12" data-ecrase="0.1" data-vers="60" data-start="1" data-dur="3"></i>'), []);
  assert.match(erreurs('<i data-action="flotter" data-hauteur="60" data-start="1" data-dur="3"></i>').join(' '), /hauteur du vol en % de la hauteur de l'image, de 2 à 40/);
  assert.match(erreurs('<i data-action="flotter" data-sol="80" data-start="1" data-dur="3"></i>').join(' '), /data-sol ne sert qu'aux déplacements/);
});

// --- 5.8 Lancer : validation ----------------------------------------------------------------------------------------

test('lancer sans data-cible : erreur d\'assemblage en français', () => {
  const scene = (objet, autre = '') => `<section><div id="n1" data-personnage="touffu"></div>${autre}${objet}<div id="panier"></div></section>`;
  const erreurs = (html) => preparerPersonnages(html, { scene: 's', lu }).erreurs.map((e) => e.message);
  assert.match(erreurs(scene('<div id="balle" data-tenu-par="#n1" data-start="0" data-dur="1" data-lacher="lance"></div>')).join(' '),
    /l'objet « balle » est lancé \(data-lacher="lance"\) sans data-cible : donner l'élément, le personnage ou le point visé \(ex\. data-cible="#panier"\)\./);
  assert.match(erreurs(scene('<div id="balle" data-tenu-par="#n1" data-start="0" data-dur="1" data-lacher="lance" data-cible="#corbeille"></div>')).join(' '),
    /la cible « #corbeille » n'existe pas dans la scène\./);
  // Un personnage visé doit être dans le même conteneur.
  assert.match(erreurs(scene('<div id="balle" data-tenu-par="#n1" data-start="0" data-dur="1" data-lacher="lance" data-cible="#n2"></div>', '<div><div id="n2" data-personnage="touffu"></div></div>')).join(' '),
    /le personnage visé « #n2 » doit être dans le même conteneur/);
  for (const ok of ['data-cible="#panier"', 'data-cible="80% 85%" data-roule="10" data-tours="-2" data-hauteur="20"', 'data-cible="#n2"']) {
    assert.deepEqual(erreurs(scene(`<div id="balle" data-tenu-par="#n1" data-start="0" data-dur="1" data-lacher="lance" ${ok}></div>`, '<div id="n2" data-personnage="touffu"></div>')), [], ok);
  }
  assert.match(erreurs(scene('<div id="balle" data-tenu-par="#n1" data-start="0" data-dur="1" data-lacher="lance" data-cible="#panier" data-roule="-5"></div>')).join(' '), /data-roule="-5" : de 0 à 100/);
  assert.match(erreurs(scene('<div id="balle" data-tenu-par="#n1" data-start="0" data-dur="1" data-lacher="lance" data-cible="loin"></div>')).join(' '), /doit être « #id »/);
  assert.match(erreurs(scene('<div id="balle" data-tenu-par="#n1" data-start="0" data-dur="1" data-lacher="tombe" data-tours="2"></div>')).join(' '), /data-tours ne sert qu'à un objet lancé/);
});

test('références : flotter, lancer et attention documentés', () => {
  const fs = require('node:fs');
  const lire = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const m = lire('references', 'moteur', 'personnages.md');
  for (const motif of [/`flotter` \(`data-dur` obligatoire, `data-hauteur`/, /\*\*Lancer\*\* : `data-lacher="lance"`/, /`data-tours`/, /`data-roule`/, /`data-attention` \(0 à 1, défaut 1\)/]) assert.match(m, motif);
  const pers = lire('references', 'personnages.md');
  for (const motif of [/« il lance la balle à son ami »/, /« il flotte »/, /« il regarde passer la balle »/]) assert.match(pers, motif);
  const mv = lire('references', 'mouvement-vivant.md');
  assert.match(mv, /`lance` \(`data-lacher="lance"`\) plutôt qu'un objet qui se téléporte/);
  assert.match(mv, /`flotter` plutôt que `glisser` en l'air/);
  assert.ok(Buffer.byteLength(mv) <= 9000);
  const animer = lire('skills', 'animer-personnage', 'SKILL.md');
  assert.match(animer, /« il flotte », « il lance » \| lire `pulse-motion reference mouvement-vivant`/);
});
