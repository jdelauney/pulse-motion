'use strict';
/* Spec « Mouvement vivant », plan V1 « Personnages vivants » : poses enchaînées (5.1), clignement (5.2), repos vivant
 * (5.3), retard (5.4), yeux d'abord (5.5, points 1 et 4), atterrissage (5.7, points 1 à 3), référence et branchements
 * (5.13, partie personnages), pièges de dessin (5.15), mentions (5.16). L'ombre et l'écrasement dans la page :
 * personnages-vivant-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const V = require('../moteur/vivant.js');
const K = require('../moteur/clips.js');
const K0 = require('./fixtures/clips-0.31.0.js');
const S = require('../moteur/squelette.js');
const PA = require('../moteur/personnages/partition.js');
const P = require('../scripts/lib/personnages.js');
const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const lu = P.lire(null);
const bib = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions };
const gab = S.completerGabarit(lu.gabarits.standard);
const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
/** Bibliothèque sans les couches de vie (pour isoler le retard). */
const sansCouches = (() => { const c = Object.assign({}, lu.clips); delete c['repos-vivant']; delete c.respiration; delete c.clignement; return { poses: lu.poses, clips: c, expressions: lu.expressions }; })();
const partition = (actions, extra = {}) => Object.assign({ x0: 50, vue0: 0, largeur: 1600, hauteur: 900, echelle: 1, sel: 'scene/a', scene: { debut: 0, fin: 20 }, actions }, extra);
const pose = (p, t, b = bib) => PA.etatAuTemps(p, t, b, gab).pose;

// --- 5.1 Poses enchaînées sans arrêt ------------------------------------------------------------------------------

const CLES = [[0, 0], [0.3, 10], [0.5, 40], [0.8, 40], [1, 10]];

test('flow passe par chaque clé', () => {
  for (const [t, v] of CLES) proche(V.flow(CLES, t), v, 1e-9, `t ${t}`);
});

test('flow ne dépasse jamais l\'intervalle de deux clés voisines (monotonie)', () => {
  for (let i = 0; i < CLES.length - 1; i++) {
    const [ta, va] = CLES[i], [tb, vb] = CLES[i + 1];
    for (let k = 0; k <= 100; k++) {
      const v = V.flow(CLES, ta + (tb - ta) * k / 100);
      assert.ok(v >= Math.min(va, vb) - 1e-9 && v <= Math.max(va, vb) + 1e-9, `segment ${i} : ${v}`);
    }
  }
});

test('flow : une valeur répétée tient la pose', () => {
  for (let k = 0; k <= 20; k++) proche(V.flow(CLES, 0.5 + 0.3 * k / 20), 40, 1e-9);
});

test('flow : vitesse nulle aux extrémités, non nulle au passage d\'une clé intermédiaire monotone', () => {
  const h = 1e-5;
  const vitesse = (u) => (V.flow(CLES, u + h) - V.flow(CLES, u - h)) / (2 * h);
  const h0 = 1e-7;
  proche((V.flow(CLES, h0) - V.flow(CLES, 0)) / h0, 0, 1e-3, 'départ');
  proche((V.flow(CLES, 1) - V.flow(CLES, 1 - h0)) / h0, 0, 1e-3, 'arrivée');
  assert.ok(vitesse(0.3) > 10, `passage de la clé 0,3 sans s'arrêter : ${vitesse(0.3)}`);
  // Par clé (comportement d'avant) : la vitesse retombe à zéro à chaque clé.
  const parCle = { boucle: false, cles: CLES.map(([t, v]) => ({ t, angles: { torse: v } })) };
  proche((K.echantillonner(parCle, 0.3 + h0, bib).torse - K.echantillonner(parCle, 0.3 - h0, bib).torse) / (2 * h0), 0, 1e-3, 'par clé');
});

test('flowCyclique : raccord sans saut de valeur ni de vitesse', () => {
  const c = [[0.1, 0], [0.4, 5], [0.7, -3]];
  const h = 1e-6;
  proche(V.flowCyclique(c, 1 - h), V.flowCyclique(c, h), 1e-4, 'valeur au raccord');
  const v = (u) => (V.flowCyclique(c, u + h) - V.flowCyclique(c, u - h)) / (2 * h);
  proche(v(1 - 1e-4), v(1e-4), 1e-2, 'vitesse au raccord');
  proche(V.flowCyclique(c, 1.4), V.flowCyclique(c, 0.4), 1e-9, 'période 1');
  for (const [t, x] of c) proche(V.flowCyclique(c, t), x, 1e-9);
});

test('clip par-cle : mêmes valeurs qu\'en 0.24.0 sur tous les clips de la bibliothèque', () => {
  // clips.js de la 0.31.0 (inchangé depuis la 0.24.0 pour l'interpolation), figé dans tests/fixtures.
  for (const [nom, clip] of Object.entries(lu.clips)) {
    const parCle = Object.assign({}, clip);
    delete parCle.lissage;
    const d = K.duree(clip) || 1;
    for (let k = 0; k <= 60; k++) {
      const t = clip.boucle ? d * k / 60 : d * k / 50 - 0.1;
      const a = clip.additif ? K.ajouter({}, parCle, t, bib) : K.echantillonner(parCle, t, bib, gab);
      const b = clip.additif ? K0.ajouter({}, parCle, t, bib) : K0.echantillonner(parCle, t, bib, gab);
      assert.deepEqual(a, b, `${nom} à ${t}`);
    }
  }
});

test('clip continu : une clé avec courbe garde son segment', () => {
  const clip = { boucle: false, lissage: 'continu', cles: [{ t: 0, angles: { torse: 0 } }, { t: 1, angles: { torse: 20 }, courbe: 'linear' }, { t: 2, angles: { torse: 30 } }, { t: 3, angles: { torse: 40 } }] };
  for (const u of [1.25, 1.5, 1.75]) proche(K.echantillonner(clip, u, bib).torse, 20 + 10 * (u - 1), 1e-9, `segment linéaire à ${u}`);
  // Les segments sans courbe suivent flow sur toute la piste.
  const pistes = [[0, 0], [1, 20], [2, 30], [3, 40]];
  proche(K.echantillonner(clip, 0.5, bib).torse, V.lire(pistes, 0.5, V.tangentes(pistes)), 1e-9);
  proche(K.echantillonner(clip, 2.5, bib).torse, V.lire(pistes, 2.5, V.tangentes(pistes)), 1e-9);
  // La bibliothèque : coucou, repos, respiration et repos-vivant en continu.
  for (const n of ['coucou', 'repos', 'respiration', 'repos-vivant']) assert.equal(lu.clips[n].lissage, 'continu', n);
  for (const n of ['marche', 'course', 'saut', 'accroupi', 'se-relever', 'peur']) assert.equal(lu.clips[n].lissage, undefined, n);
});

test('verifier refuse un lissage inconnu, en français', () => {
  const e = P.valider('clip', { boucle: true, duree: 1, lissage: 'doux', cles: [{ t: 0, angles: { torse: 1 } }] }, { nom: 'x' });
  assert.ok(e.some((m) => m === '« lissage » : « continu » (les poses s\'enchaînent sans s\'arrêter) ou « par-cle ».'), e.join(' | '));
  assert.deepEqual(P.valider('clip', { boucle: true, duree: 1, lissage: 'continu', cles: [{ t: 0, angles: { torse: 1 } }] }, { nom: 'x' }), []);
  const c = P.valider('clip', { boucle: true, duree: 1, contacts: [0.5], cles: [{ t: 0, angles: { torse: 1 } }] }, { nom: 'x' });
  assert.ok(c.some((m) => /« contacts » ne sert qu'aux mouvements ponctuels/.test(m)));
  // L'ordre des champs écrits : lissage après additif, puis contacts.
  const texte = P.serialiser('clip', { cles: [], contacts: [0.5], lissage: 'continu', additif: true, boucle: false });
  assert.ok(texte.indexOf('"additif"') < texte.indexOf('"lissage"') && texte.indexOf('"lissage"') < texte.indexOf('"contacts"'));
});

test('atelier : la case Poses enchaînées écrit lissage continu', async () => {
  const E = await import(pathToFileURL(path.join(RACINE, 'moteur', 'personnages', 'edition.mjs')).href);
  const objet = JSON.parse(JSON.stringify(lu.clips.marche));
  const ed = E.creerEdition({ type: 'clip', nom: 'marche', objet, lu }, { clips: K, squelette: S });
  ed.proprietes({ lissage: 'continu' });
  assert.equal(ed.objet.lissage, 'continu');
  assert.match(P.serialiser('clip', ed.objet), /"lissage": "continu"/);
  assert.deepEqual(P.valider('clip', JSON.parse(P.serialiser('clip', ed.objet)), Object.assign({ nom: 'marche' }, P.contexteDe(lu))), []);
  ed.proprietes({ lissage: null });
  assert.equal(ed.objet.lissage, undefined);
  // La case de l'atelier et son effet.
  assert.match(lire('moteur', 'personnages', 'atelier.html'), /<input id="lissage" type="checkbox"> Poses enchaînées sans arrêt/);
  const atelier = lire('moteur', 'personnages', 'atelier.mjs');
  assert.match(atelier, /id === 'lissage'\) ed\.proprietes\(\{ lissage: v \? 'continu' : null \}\)/);
  assert.match(atelier, /\$\('#lissage'\)\.checked = o\.lissage === 'continu'/);
  // Les pages qui chargent clips.js chargent vivant.js avant lui.
  for (const f of ['atelier.html', 'decoupe-atelier.html']) {
    const h = lire('moteur', 'personnages', f);
    assert.ok(h.indexOf('modules/vivant.js') > 0 && h.indexOf('modules/vivant.js') < h.indexOf('modules/clips.js'), f);
  }
});

// --- 5.2 Clignement ----------------------------------------------------------------------------------------------

test('clignement : 110 ms pour fermer, 40 de maintien, 190 pour rouvrir', () => {
  const c = lu.clips.clignement;
  assert.equal(c.boucle, false);
  assert.equal(c.additif, true);
  assert.deepEqual(c.cles.map((k) => [k.t, k.angles.paupieres, k.courbe]), [[0, 0, 'cubic-inout'], [0.11, -0.92, undefined], [0.15, -0.92, 'cubic-out'], [0.34, 0, undefined]]);
  const v = (t) => K.ajouter({}, c, t, bib).paupieres - 1;
  proche(v(0), 0, 1e-9);
  proche(v(0.11), -0.92, 1e-9, 'fermé à 110 ms');
  proche(v(0.13), -0.92, 1e-9, 'tenu');
  proche(v(0.15), -0.92, 1e-9, 'tenu jusqu\'à 150 ms');
  assert.ok(v(0.2) > -0.92 && v(0.2) < 0, 'se rouvre');
  proche(v(0.34), 0, 1e-9, 'ouvert à 340 ms');
});

test('clignement : au moins 3 images à 30 i/s pour fermer', () => {
  const c = lu.clips.clignement;
  const fermeture = c.cles[1].t - c.cles[0].t;
  assert.ok(fermeture * 30 >= 3, `${fermeture * 30} images`);
  // Dans un personnage : au moins 3 images à 30 i/s où les paupières sont entre ouvertes et fermées, en fermant.
  const p = partition([]);
  const t0 = PA.clignements(p, bib)[0].t;
  const images = [1, 2, 3].map((i) => pose(p, t0 + i / 30).paupieres);
  assert.ok(images.every((x) => x < 0.99 && x > 0.08), images.join(', '));
});

test('clignement : instants irréguliers entre 3 et 4 s, les mêmes à chaque rendu', () => {
  const p = partition([], { scene: { debut: 0, fin: 120 } });
  const a = PA.clignements(p, bib).map((x) => x.t);
  const b = PA.clignements(partition([], { scene: { debut: 0, fin: 120 } }), bib).map((x) => x.t);
  assert.deepEqual(a, b, 'mêmes instants');
  assert.ok(a[0] >= 0.8 && a[0] <= 3, `premier : ${a[0]}`);
  const ecarts = [];
  for (let i = 1; i < a.length; i++) ecarts.push(a[i] - a[i - 1]);
  const reguliers = ecarts.filter((e) => e > 0.5);
  assert.ok(reguliers.every((e) => e >= 3 - 0.43 - 1e-9 && e <= 4 + 1e-9), reguliers.join(', '));
  assert.ok(new Set(reguliers.map((e) => e.toFixed(2))).size > 10, 'irréguliers');
  // Même t, même pose, dans n'importe quel ordre.
  const t = a[3] + 0.05;
  const x = JSON.stringify(PA.etatAuTemps(p, t, bib, gab));
  PA.etatAuTemps(p, 3, bib, gab);
  assert.equal(JSON.stringify(PA.etatAuTemps(p, t, bib, gab)), x);
});

test('clignement : deux personnages d\'une scène ne clignent pas ensemble', () => {
  const a = PA.clignements(partition([], { sel: V.sel('chiffre/chef') }), bib).map((x) => x.t);
  const b = PA.clignements(partition([], { sel: V.sel('chiffre/2') }), bib).map((x) => x.t);
  // Chacun sa graine : jamais le même départ (à une image près), et rarement en même temps (au hasard, environ un sur cinq).
  for (const x of a) assert.ok(b.every((y) => Math.abs(x - y) >= 1 / 30), `même départ à ${x}`);
  const ensemble = a.filter((x) => b.some((y) => Math.abs(x - y) < 0.34)).length;
  assert.ok(ensemble <= a.length / 3, `${ensemble} sur ${a.length}`);
  assert.notDeepEqual(a, b);
});

test('clignement au début de chaque tourner, regarder et demi-tour', () => {
  const p = partition([
    { type: 'tourner', debut: 5, fin: 5.5, vue: 90 },
    { type: 'regarder', debut: 9, fin: 10, cible: '#pancarte' },
    { type: 'regarder', debut: 11, fin: 12, cible: 'aucune' },
    { type: 'marcher', debut: 13, fin: 14, vers: 60 },
    { type: 'marcher', debut: 16, fin: 17, vers: 30 },
  ]);
  const t = PA.clignements(p, bib).map((x) => x.t);
  for (const tau of [5, 9, 16]) assert.ok(t.includes(tau), `clignement à ${tau} : ${t.join(', ')}`);
  assert.ok(!t.includes(11), 'pas pour un regard libre');
  for (const tau of [5, 9, 16]) assert.ok(t.every((x) => x === tau || x < tau - 1.2 || x > tau + 1.5 || x - tau >= 0.42), `réguliers retirés autour de ${tau}`);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 0.42 - 1e-9, 'au moins 0,42 s entre deux');
  assert.ok(pose(p, 5.11).paupieres < 0.2, 'les yeux se ferment au tournant');
});

test('clignement double : entre 5 % et 30 % sur 100 clignements', () => {
  let doubles = 0, total = 0;
  for (let i = 0; i < 12 && total < 100; i++) {
    const t = PA.clignements(partition([], { sel: V.sel('s/' + i), scene: { debut: 0, fin: 40 } }), bib).map((x) => x.t);
    for (let k = 0; k < t.length; k++) { total++; if (k > 0 && Math.abs(t[k] - t[k - 1] - 0.42) < 1e-6) doubles++; }
  }
  assert.ok(total >= 100);
  assert.ok(doubles / total >= 0.05 && doubles / total <= 0.3, `${doubles} sur ${total}`);
});

test('expression tristesse : clignements plus rares et plus lents', () => {
  const triste = partition([{ type: 'expression', debut: 0, fin: Infinity, expression: 'tristesse' }], { scene: { debut: 0, fin: 60 } });
  const neutre = partition([], { scene: { debut: 0, fin: 60 } });
  const lt = PA.clignements(triste, bib), ln = PA.clignements(neutre, bib);
  assert.ok(lt.length < ln.length, `${lt.length} < ${ln.length}`);
  assert.ok(lt.every((x) => x.lenteur === 1.4) && ln.every((x) => x.lenteur === 1));
  // Plus lent : encore fermé à 0,2 s après le début.
  const t0 = lt[0].t;
  assert.ok(pose(triste, t0 + 0.2).paupieres < pose(neutre, ln[0].t + 0.2).paupieres + lu.expressions.tristesse.angles.paupieres - 1 + 1e-9);
  assert.deepEqual(lu.expressions.tristesse.clignement, { intervalle: [4, 5.5], lenteur: 1.4 });
  assert.deepEqual(lu.expressions.colere.clignement, { intervalle: [5, 6.5] });
  assert.deepEqual(lu.expressions.peur.clignement, { intervalle: [2, 3] });
  assert.deepEqual(lu.expressions.surprise.clignement, { intervalle: [2.5, 3.5] });
  assert.equal(lu.expressions.joie.clignement, undefined);
  const e = P.valider('expression', { clignement: { intervalle: [1, 9], lenteur: 3 } }, { nom: 'x' });
  assert.ok(e.includes('« clignement.intervalle » : deux durées en secondes, de 1,5 à 8 (ex. [3, 4]).'), e.join(' | '));
  assert.ok(e.some((m) => /« clignement\.lenteur » : de 0,7 à 2/.test(m)));
});

test('data-calme non : aucun clignement', () => {
  for (const extra of [{ calme: false }, { vie: 'aucune' }]) {
    const p = partition([], extra);
    for (let t = 0; t < 20; t += 1 / 30) assert.equal(pose(p, t).paupieres, 1, `${JSON.stringify(extra)} à ${t}`);
  }
});

// --- 5.3 Repos vivant, vie déphasée --------------------------------------------------------------------------------

const ANGLES = ['brasAvant', 'brasArriere', 'avantBrasAvant', 'avantBrasArriere', 'tete', 'tetePenche', 'teteTourne', 'torse', 'torseIncl', 'tibiaAvant'];

test('repos vivant : aucun angle figé plus de 2 s pendant une pose tenue', () => {
  const p = partition([{ type: 'pose', debut: 1, fin: 12, pose: 'montrer' }]);
  const fige = {};
  let prec = null;
  for (let t = 1.5; t < 12; t += 1 / 30) {
    const q = pose(p, t);
    if (prec) for (const a of ANGLES) {
      if (Math.abs(q[a] - prec[a]) < 1e-4) fige[a] = (fige[a] || 0) + 1 / 30; else fige[a] = 0;
      assert.ok((fige[a] || 0) <= 2, `${a} figé à ${t}`);
    }
    prec = q;
  }
});

test('repos vivant : bras Avant et Arrière jamais en miroir (corrélation inférieure à 0,5)', () => {
  const rv = lu.clips['repos-vivant'];
  const a = [], b = [];
  for (let t = 0; t < 9; t += 1 / 30) { const d = K.ajouter({}, rv, t, bib); a.push(d.brasAvant); b.push(d.brasArriere); }
  const m = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = m(a), mb = m(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  const r = num / Math.sqrt(da * db);
  assert.ok(Math.abs(r) < 0.5, `corrélation ${r}`);
  // Ampleurs du tableau de la spec (5.3).
  const amp = {};
  for (let t = 0; t < 9; t += 0.01) { const d = K.ajouter({}, rv, t, bib); for (const k of Object.keys(d)) amp[k] = Math.max(amp[k] || 0, Math.abs(d[k] - (S.REPOS[k] || 0))); }
  for (const [k, A] of [['brasAvant', 3], ['brasArriere', 2.5], ['avantBrasAvant', 4], ['avantBrasArriere', 3], ['tetePenche', 2], ['teteTourne', 4], ['torseIncl', 1], ['tibiaAvant', 1.5]]) proche(amp[k], A, 0.02, k);
  assert.equal(rv.duree, 9);
  assert.equal(rv.additif, true);
  assert.equal(rv.boucle, true);
});

test('repos vivant : nul pendant la marche et la course', () => {
  const p = partition([{ type: 'marcher', debut: 0, fin: 4, vers: 80 }, { type: 'courir', debut: 4, fin: 6, vers: 20 }]);
  const sansRv = { poses: lu.poses, clips: Object.assign({}, lu.clips, { 'repos-vivant': undefined }), expressions: lu.expressions };
  delete sansRv.clips['repos-vivant'];
  for (let t = 0.5; t < 3.7; t += 0.1) {
    const a = pose(p, t), b = pose(p, t, sansRv);
    for (const k of ANGLES) proche(a[k], b[k], 1e-9, `${k} à ${t}`);
  }
});

test('repos vivant : pas de saut de plus de 2° entre deux images à l\'entrée d\'une marche', () => {
  // Ce que la vie ajoute (repos vivant et retard : vie pleine moins vie sobre) s'efface en fondu quand la marche commence.
  const actions = [{ type: 'pose', debut: 0, fin: 3, pose: 'debout' }, { type: 'marcher', debut: 3, fin: 6, vers: 80 }];
  const vie = (t) => { const a = pose(partition(actions), t), b = pose(partition(actions, { vie: 'sobre' }), t); const d = {}; for (const k of ANGLES) d[k] = a[k] - b[k]; return d; };
  let prec = vie(2.5);
  for (let t = 2.5 + 1 / 30; t < 4; t += 1 / 30) {
    const q = vie(t);
    for (const k of ANGLES) assert.ok(Math.abs(q[k] - prec[k]) <= 2, `${k} saute de ${(q[k] - prec[k]).toFixed(2)} degrés à ${t.toFixed(3)}`);
    prec = q;
  }
  for (const k of ANGLES) proche(vie(3.5)[k], 0, 1e-9, `${k} nul en marche`);
});

test('respiration : présente pendant une pose tenue', () => {
  const p = partition([{ type: 'pose', debut: 0, fin: 10, pose: 'montrer' }], { vie: 'sobre' });
  const torses = [];
  for (let t = 1; t < 4; t += 0.1) torses.push(pose(p, t).torse);
  assert.ok(Math.max(...torses) - Math.min(...torses) > 2, `le torse respire : ${Math.max(...torses) - Math.min(...torses)}`);
});

test('deux personnages de la même scène ne respirent pas en phase', () => {
  const a = partition([], { sel: V.sel('s/1'), vie: 'sobre' }), b = partition([], { sel: V.sel('s/2'), vie: 'sobre' });
  let differents = 0;
  for (let t = 0; t < 3; t += 0.1) if (Math.abs(pose(a, t).torse - pose(b, t).torse) > 0.3) differents++;
  assert.ok(differents > 10, `${differents} instants différents`);
});

test('data-vie sobre : ni repos vivant ni retard ; aucune : rien', () => {
  const actions = [{ type: 'pose', debut: 0, fin: 1, pose: 'debout' }, { type: 'pose', debut: 1, fin: 8, pose: 'bras-leves' }];
  const sobre = partition(actions, { vie: 'sobre' });
  // Sobre = respiration et clignement seulement : mêmes valeurs qu'avec une bibliothèque sans repos vivant, sans retard.
  const sansRv = { poses: lu.poses, clips: Object.assign({}, lu.clips), expressions: lu.expressions };
  delete sansRv.clips['repos-vivant'];
  for (let t = 1.05; t < 6; t += 0.13) {
    const a = pose(sobre, t), b = pose(partition(actions, { vie: 'pleine' }), t, sansRv);
    proche(a.brasArriere, pose(partition(actions, { vie: 'sobre' }), t, sansRv).brasArriere, 1e-9);
    if (t > 1.5) proche(a.avantBrasAvant, b.avantBrasAvant, 1e-6, `retard fini à ${t}`);
  }
  assert.notEqual(pose(sobre, 1.15).avantBrasAvant, pose(partition(actions, { vie: 'pleine' }), 1.15, sansRv).avantBrasAvant, 'le retard ne joue qu\'en vie pleine');
  const aucune = partition(actions, { vie: 'aucune' });
  for (let t = 0; t < 8; t += 0.1) assert.deepEqual(pose(aucune, t), pose(aucune, t, sansCouches));
  // Validation du conteneur.
  const r = preparerPersonnages('<section><div data-personnage="touffu" data-vie="vivante" data-ombre="peut-etre" data-ecrase="0.5"><i data-action="pose" data-pose="montrer" data-start="0" data-dur="1" data-ecrase="0.1"></i></div></section>', { scene: 's', lu });
  const m = r.erreurs.map((e) => e.message);
  assert.ok(m.includes('Scène « s » : data-vie="vivante" : valeur inconnue (pleine, sobre, mains ou aucune).'), m.join(' | '));
  assert.ok(m.includes('Scène « s » : data-ombre="peut-etre" : oui ou non.'));
  assert.ok(m.some((x) => /data-ecrase="0\.5" : écrasement à l'atterrissage, de 0 \(aucun\) à 0,25/.test(x)));
  assert.ok(m.some((x) => /data-ecrase ne sert qu'à « bondir »/.test(x)));
  assert.deepEqual(preparerPersonnages('<section><div data-personnage="touffu" data-vie="sobre" data-ombre="non" data-ecrase="0"><i data-action="bondir" data-vers="40" data-dur="1" data-ecrase="0.2" data-start="0"></i></div></section>', { scene: 's', lu }).erreurs, []);
});

test('déterminisme : même t, même pose avec la vie pleine, quel que soit l\'ordre des appels', () => {
  const actions = [{ type: 'marcher', debut: 0, fin: 2, vers: 40 }, { type: 'pose', debut: 2.5, fin: 5, pose: 'montrer' }, { type: 'jouer', debut: 5, fin: 6.6, clip: 'coucou' }, { type: 'bondir', debut: 7, fin: 8, vers: 60 }];
  const instants = []; for (let t = 0; t < 10; t += 0.37) instants.push(t);
  const a = instants.map((t) => JSON.stringify(PA.etatAuTemps(partition(actions), t, bib, gab)));
  const p = partition(actions);
  const b = instants.slice().reverse().map((t) => JSON.stringify(PA.etatAuTemps(p, t, bib, gab))).reverse();
  assert.deepEqual(b, a);
});

// --- 5.4 Retard des membres ---------------------------------------------------------------------------------------

test('retard : le pic de vitesse de l\'avant-bras suit celui du bras de 60 à 150 ms', () => {
  // Pose levée depuis debout (fondu de 0,25 s) ; l'avant-bras rattrape le bras après lui : son propre mouvement
  // (ce que la vie ajoute) culmine de 60 à 150 ms après le pic du bras.
  const actions = [{ type: 'pose', debut: 2, fin: 5, pose: 'bras-leves' }];
  const vif = partition(actions), sobre = partition(actions, { vie: 'sobre' });
  const dt = 1 / 600;
  let picBras = 0, tBras = 0, picAv = 0, tAv = 0, prec = null;
  for (let t = 1.9; t < 2.8; t += dt) {
    const e = pose(vif, t, sansCouches), s = pose(sobre, t, sansCouches);
    const cur = { bras: e.brasAvant, propre: e.avantBrasAvant - s.avantBrasAvant };
    if (prec) {
      const vb = (cur.bras - prec.bras) / dt, va = (cur.propre - prec.propre) / dt;
      if (Math.abs(vb) > picBras) { picBras = Math.abs(vb); tBras = t; }
      if (Math.sign(va) === Math.sign(vb) && Math.abs(va) > picAv) { picAv = Math.abs(va); tAv = t; }
    }
    prec = cur;
  }
  const ecart = (tAv - tBras) * 1000;
  assert.ok(ecart >= 60 && ecart <= 150, `${ecart} ms`);
});

test('retard : aucune valeur au-delà de la pose d\'arrivée (sans dépassement)', () => {
  const actions = [{ type: 'pose', debut: 0, fin: 2, pose: 'debout' }, { type: 'pose', debut: 2, fin: 5, pose: 'bras-leves' }];
  const p = partition(actions);
  const fin = lu.poses['bras-leves'].angles;
  const absolu = (q) => q.brasAvant + q.avantBrasAvant;
  const depart = absolu(pose(p, 1.9, sansCouches)), arrivee = fin.brasAvant + fin.avantBrasAvant;
  for (let t = 1.9; t < 4; t += 1 / 120) {
    const v = absolu(pose(p, t, sansCouches));
    assert.ok(v <= Math.max(depart, arrivee) + 1e-6 && v >= Math.min(depart, arrivee) - 1e-6, `${v} à ${t}`);
    const tete = pose(p, t, sansCouches).tete;
    assert.ok(Math.abs(tete) < 10, `tête bornée : ${tete}`);
  }
  proche(absolu(pose(p, 3, sansCouches)), arrivee, 1e-6, 'arrivé');
});

test('retard nul quand le parent est immobile', () => {
  const actions = [{ type: 'pose', debut: 0, fin: 10, pose: 'montrer' }];
  for (let t = 1; t < 9; t += 0.25) assert.deepEqual(pose(partition(actions), t, sansCouches), pose(partition(actions, { vie: 'sobre' }), t, sansCouches), `à ${t}`);
});

test('retard : absent pendant la marche', () => {
  const actions = [{ type: 'marcher', debut: 0, fin: 6, vers: 90 }];
  for (let t = 0.5; t < 5.7; t += 0.1) assert.deepEqual(pose(partition(actions), t, sansCouches), pose(partition(actions, { vie: 'sobre' }), t, sansCouches), `à ${t}`);
});

test('gabarit : vie.retard hors bornes refusé, en français', () => {
  const e = P.valider('gabarit', { vie: { retard: 0.3, force: 0.9 } }, { nom: 'g' });
  assert.ok(e.includes('« vie.retard » : entre 0,06 et 0,15 s (ex. 0.1).'), e.join(' | '));
  assert.ok(e.includes('« vie.force » : entre 0,3 et 0,6 (ex. 0.45).'));
  assert.deepEqual(P.valider('gabarit', { vie: { retard: 0.08, force: 0.5 } }, { nom: 'g' }), []);
  assert.deepEqual(S.completerGabarit({}).vie, { retard: 0.1, force: 0.45 });
  assert.deepEqual(S.completerGabarit({ vie: { retard: 0.12 } }).vie, { retard: 0.12, force: 0.45 });
  // Un retard plus long : le bout arrive plus tard.
  const actions = [{ type: 'pose', debut: 2, fin: 5, pose: 'bras-leves' }];
  const lent = S.completerGabarit({ vie: { retard: 0.15, force: 0.45 } });
  const a = PA.etatAuTemps(partition(actions), 2.2, sansCouches, gab).pose.avantBrasAvant;
  const b = PA.etatAuTemps(partition(actions), 2.2, sansCouches, lent).pose.avantBrasAvant;
  assert.notEqual(a, b);
});

test('perf : une image avec 3 personnages vivants coûte au plus 1,5 fois celle de 0.24.0', () => {
  // Calcul des poses de 3 personnages (marche, pose, geste, expression), vie pleine, comparé au même calcul sans la vie
  // (data-vie="aucune") : la vie ne coûte pas plus de la moitié en plus. Mesuré sur 12 s à 30 i/s, meilleur de 3.
  const mk = (i, vie) => partition([{ type: 'marcher', debut: 0, fin: 2, vers: 40 }, { type: 'pose', pose: 'montrer', debut: 2.5, fin: 5 }, { type: 'jouer', clip: 'coucou', debut: 5, fin: 6.6 }, { type: 'expression', expression: 'joie', debut: 1, fin: Infinity }], { x0: 10 + i * 20, sel: V.sel('s/' + i), vie });
  const mesure = (vie) => {
    let meilleur = Infinity;
    for (let r = 0; r < 3; r++) {
      const ps = [0, 1, 2].map((i) => mk(i, vie));
      const t0 = process.hrtime.bigint();
      for (let t = 0; t < 12; t += 1 / 30) for (const p of ps) PA.etatAuTemps(p, t, bib, gab);
      meilleur = Math.min(meilleur, Number(process.hrtime.bigint() - t0));
    }
    return meilleur;
  };
  mesure('pleine'); mesure('aucune');
  const pleine = mesure('pleine'), aucune = mesure('aucune');
  assert.ok(pleine <= 1.5 * aucune, `vie pleine ${(pleine / 1e6).toFixed(1)} ms, sans vie ${(aucune / 1e6).toFixed(1)} ms`);
});

// --- 5.5 Les yeux d'abord (points 1 et 4) ---------------------------------------------------------------------------

test('regarder : les pupilles arrivent 0,1 s avant la tête', () => {
  globalThis.M = globalThis.M || {};
  globalThis.M.squelette = S;
  delete require.cache[require.resolve('../moteur/personnages/interactions.js')];
  require('../moteur/personnages/interactions.js');
  const I = globalThis.M.interactions;
  const a = { type: 'regarder', debut: 1, fin: 3, cible: '90% 10%' };
  const p = { partition: { actions: [a] }, gabarit: gab, miroir: false, sec: null, div: null };
  const ctx = { persos: [p], W: 1600, H: 900, placerBase: () => null };
  const base = () => Object.assign({}, S.REPOS, { x: 400, y: 600, echelle: 1, vue: 0 });
  const regard = (t) => I.appliquer(p, t, base(), ctx);
  const fin = regard(2);
  // Les pupilles atteignent leur cible 0,1 s avant la tête (fondu de 0,25 s : pupilles arrivées à 1,15 s, tête à 1,25 s).
  proche(regard(1.15).regardX, fin.regardX, 1e-6, 'pupilles arrivées');
  assert.ok(Math.abs(regard(1.15).tete - fin.tete) > 1e-3, 'la tête pas encore');
  proche(regard(1.25).tete, fin.tete, 1e-6, 'tête arrivée');
  // Elles partent 0,1 s avant aussi : à 0,95 s, les pupilles bougent déjà, la tête non.
  assert.ok(Math.abs(regard(0.95).regardX) > 0 && regard(0.95).tete === base().tete);
  // Point 4 : le clignement au début de chaque regarder est fait par la partition (voir le test du clignement).
  assert.ok(PA.clignements(partition([{ type: 'regarder', debut: 6, fin: 7, cible: '#x' }]), bib).some((x) => x.t === 6));
});

// --- 5.7 Atterrissage (points 1 à 3) ------------------------------------------------------------------------------

test('atterrissage : écrasement de 12 % 60 ms après la fin d\'un bondir, puis un seul dépassement', () => {
  const p = partition([{ type: 'bondir', debut: 2, fin: 3, vers: 70 }]);
  const sy = (t) => PA.etatAuTemps(p, t, bib, gab).ecraseY;
  proche(sy(3.06), 0.88, 1e-9);
  let min = Infinity, depasse = 0, sens = 0, changements = 0, prec = sy(2.99);
  for (let t = 3; t <= 3.4; t += 1 / 600) {
    const v = sy(t);
    min = Math.min(min, v);
    if (v > 1 + 1e-9) depasse = Math.max(depasse, v - 1);
    const s = Math.sign(v - prec);
    if (s && sens && s !== sens) changements++;
    if (s) sens = s;
    prec = v;
  }
  proche(min, 0.88, 1e-3, 'creux');
  proche(depasse, 0.25 * 0.12, 1e-3, 'un dépassement de 0,25 A');
  assert.equal(changements, 2, 'descend, remonte au-dessus de 1, redescend à 1 : un seul dépassement');
  assert.equal(sy(3.5), 1);
  assert.equal(sy(1), 1);
});

test('atterrissage : volume conservé (sx = 1/sy^0,6)', () => {
  // L'écrasement est appliqué au groupe du personnage avec sx = 1 / sy^0,6 (scene.js) ; la page le vérifie aussi.
  const scene = lire('moteur', 'personnages', 'scene.js');
  assert.match(scene, /var sx = 1 \/ Math\.pow\(sy, 0\.6\);/);
  assert.match(scene, /'translate\(' \+ r2\(xP\) \+ ' ' \+ r2\(yS\) \+ '\) scale\(' \+ Math\.round\(sx \* 10000\) \/ 10000 \+ ' ' \+ Math\.round\(sy \* 10000\) \/ 10000 \+ '\) translate\('/);
  const sy = 0.88, sx = 1 / Math.pow(sy, 0.6);
  proche(sx * Math.pow(sy, 0.6), 1, 1e-12);
  assert.ok(sx > 1 && sx < 1 / sy, 'il s\'élargit moins qu\'il ne s\'écrase');
});

test('bondir : étirement de 6 % juste avant le contact', () => {
  const p = partition([{ type: 'bondir', debut: 2, fin: 3, vers: 70 }]);
  const sy = (t) => PA.etatAuTemps(p, t, bib, gab).ecraseY;
  proche(sy(2.96), 1.06, 1e-9, '40 ms avant');
  assert.equal(sy(2.79), 1, 'rien 0,21 s avant');
  assert.ok(sy(2.88) > 1 && sy(2.88) < 1.06, 'il s\'étire en tombant');
  for (let t = 2.8; t < 2.945; t += 0.01) assert.ok(sy(t + 0.01) >= sy(t) - 1e-12, 'étirement croissant');
});

test('saut : écrasement de 8 % à son contact déclaré', () => {
  assert.deepEqual(lu.clips.saut.contacts, [0.936]);
  const p = partition([{ type: 'jouer', debut: 2, fin: 3.3, clip: 'saut' }]);
  const sy = (t) => PA.etatAuTemps(p, t, bib, gab).ecraseY;
  proche(sy(2 + 0.936 + 0.06), 0.92, 1e-9);
  assert.equal(sy(2 + 0.936 - 0.05), 1, 'sans étirement avant un contact de geste');
  assert.equal(sy(1), 1);
});

test('data-ecrase 0 : aucun écrasement', () => {
  const surLeConteneur = partition([{ type: 'bondir', debut: 2, fin: 3, vers: 70 }, { type: 'jouer', debut: 4, fin: 5.3, clip: 'saut' }], { ecrase: 0 });
  for (let t = 1.5; t < 5.6; t += 0.01) assert.equal(PA.etatAuTemps(surLeConteneur, t, bib, gab).ecraseY, 1, `conteneur à ${t}`);
  const surLeBond = partition([{ type: 'bondir', debut: 2, fin: 3, vers: 70, ecrase: 0 }]);
  for (let t = 2.7; t < 3.4; t += 0.01) assert.equal(PA.etatAuTemps(surLeBond, t, bib, gab).ecraseY, 1, `bond à ${t}`);
  // data-ecrase plus fort sur le bond seul.
  const fort = partition([{ type: 'bondir', debut: 2, fin: 3, vers: 70, ecrase: 0.2 }]);
  proche(PA.etatAuTemps(fort, 3.06, bib, gab).ecraseY, 0.8, 1e-9);
});

// --- 5.13 Référence et branchements (partie personnages) -----------------------------------------------------------

test('reference mouvement-vivant : existe, au plus 9 Ko, sans jargon interdit', () => {
  const r = lire('references', 'mouvement-vivant.md');
  assert.ok(Buffer.byteLength(r) <= 9 * 1024, `${Buffer.byteLength(r)} o`);
  assert.doesNotMatch(r, /\b(PCHIP|Hermite|Fritsch|Butland|WAAPI|additif|additive)\b/i);
  for (const titre of ['L\'essentiel', 'Courbes', 'Le décor qui vit', 'Les personnages', 'Une scène qui raconte une action', 'Interface à l\'écran', 'Avant de dire que c\'est vivant']) assert.match(r, new RegExp(`\\n## ${titre}\\n`), titre);
  const essentiel = r.slice(r.indexOf('## L\'essentiel'), r.indexOf('## Courbes'));
  assert.equal((essentiel.match(/^\d+\. /gm) || []).length, 12, '12 règles');
  const cases = r.slice(r.indexOf('## Avant de dire'));
  assert.equal((cases.match(/^- \[ \] /gm) || []).length, 9, '9 cases');
  const { spawnSync } = require('node:child_process');
  const sortie = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'reference', 'mouvement-vivant'], { encoding: 'utf8' });
  assert.equal(sortie.status, 0);
  assert.equal(sortie.stdout, r);
});

test('reference mouvement-vivant : chaque numéro cité existe au dictionnaire', () => {
  const r = lire('references', 'mouvement-vivant.md');
  const numeros = new Set(JSON.parse(lire('references', 'mouvements', 'mouvements.json')).mouvements.map((m) => m.no));
  const cites = [...r.matchAll(/#(\d{3})\b/g)].map((m) => m[1]);
  assert.ok(cites.length > 0);
  for (const n of cites) assert.ok(numeros.has(n), `#${n}`);
});

test('reference mouvement-vivant : chaque seuil cité est égal au code', () => {
  const r = lire('references', 'mouvement-vivant.md');
  const c = lu.clips.clignement.cles;
  const ms = (x) => Math.round(x * 1000);
  assert.match(r, new RegExp(`fermer en ${ms(c[1].t - c[0].t)} ms, tenir ${ms(c[2].t - c[1].t)} ms, rouvrir en ${ms(c[3].t - c[2].t)} ms`));
  assert.match(r, /toutes les 3 à 4 s/);
  const fr = (x) => String(x).replace('.', ',');
  for (const [nom, mot] of [['tristesse', 'tristesse'], ['colere', 'colère'], ['peur', 'peur'], ['surprise', 'surprise']]) {
    const [a, b] = lu.expressions[nom].clignement.intervalle;
    assert.match(r, new RegExp(`${mot}[^;]*\\(${fr(a)} à ${fr(b)} s\\)`), nom);
  }
  assert.match(r, new RegExp(`arrivent ${fr(S.GABARIT.vie.retard)} s après`));
  assert.match(r, /les pupilles arrivent 0,1 s avant la tête/);
  assert.match(r, /étire de 6 %/);
  assert.match(r, /s'écrase de 12 % \(8 % au contact déclaré d'un saut joué\)/);
  assert.match(r, /jusqu'à 35 % de sa taille/);
  assert.match(r, /de 1 à 4 degrés, chacun à son rythme \(3 s, 4,5 s ou 9 s\)/);
  assert.match(r, /`data-ecrase` \(de 0 à 0,25/);
  // Les mêmes chiffres dans le code.
  const p = partition([{ type: 'bondir', debut: 2, fin: 3, vers: 70 }]);
  proche(PA.etatAuTemps(p, 2.96, bib, gab).ecraseY, 1.06, 1e-9);
  proche(PA.etatAuTemps(p, 3.06, bib, gab).ecraseY, 0.88, 1e-9);
  assert.match(lire('moteur', 'personnages', 'scene.js'), /Math\.max\(0\.35, Math\.min\(1, 1 - h \/ \(0\.7 \* p\.hauteur\)\)\)/);
  assert.match(lire('moteur', 'personnages', 'interactions.js'), /var AVANCE_YEUX = 0\.1;/);
});

test('animateur : lit mouvement-vivant quand la scène a un personnage ou un décor vivant', () => {
  const a = lire('agents', 'animateur.md');
  const table = a.slice(a.indexOf('| La consigne demande… | Lire aussi |'), a.indexOf('\n2. '));
  const ligne = table.split('\n').find((l) => l.includes('`pulse-motion reference mouvement-vivant`'));
  assert.ok(ligne, 'ligne de la table');
  assert.match(ligne, /un personnage/);
  assert.match(ligne, /un décor à faire vivre \(plante, flamme, machine, ciel, eau\)/);
  assert.match(a, /ce qui vit \(action principale, boucles\) et ce qui reste immobile exprès/);
  assert.ok(Buffer.byteLength(a) <= 6000);
  const animer = lire('skills', 'animer-personnage', 'SKILL.md');
  assert.match(animer, /« plus vivant »/);
  assert.match(animer, /« moins raide »/);
  assert.match(animer, /`pulse-motion reference mouvement-vivant`/);
});

test('moteur.md : chaque attribut nouveau est documenté', () => {
  // moteur.md est découpé (spec Rapidité 5.4) : les personnages sont dans la partie moteur/personnages.
  const m = lire('references', 'moteur', 'personnages.md');
  for (const attr of ['data-vie', 'data-ombre', 'data-ecrase']) assert.match(m, new RegExp('`' + attr), attr);
  for (const v of ['pleine', 'sobre', 'aucune']) assert.match(m, new RegExp('`' + v + '`'));
  assert.match(m, /`pulse-motion reference mouvement-vivant`/);
  const pers = lire('references', 'personnages.md');
  for (const motif of [/`lissage: "continu"`/, /`contacts: \[0\.936\]`/, /`repos-vivant`/, /`clignement` \(additif : la forme d'un clignement/, /"clignement": \{ "intervalle": \[4, 5\.5\], "lenteur": 1\.4 \}/, /"vie": \{ "retard": 0\.1, "force": 0\.45 \}/,
    /« il est raide », « il fait robot »/, /« il ne bouge pas quand il attend »/, /« il cligne trop »/, /« enlève son ombre »/, /« il regarde passer la balle »/]) assert.match(pers, motif);
});

// --- 5.15 Pièges de dessin, 5.16 mentions ---------------------------------------------------------------------------

test('dessin-personnages.md : les trois pièges présents', () => {
  for (const f of ['dessin-personnages.md', 'decoupe-personnages.md']) {
    const r = lire('references', f);
    assert.match(r, /## Pièges qui se voient en mouvement/, f);
    assert.match(r, /\*\*Un seul contour\*\* plutôt qu'une calotte trouée/, f);
    assert.match(r, /\*\*Paupière au moins 2 unités plus large que le blanc de l'œil\*\*/, f);
    assert.match(r, /\*\*Remplir chaque partie à part\*\*/, f);
  }
  // touffu respecte la règle de la paupière (26 de large pour un blanc de 2 × 10,5).
  const o = lu.dessins.touffu.visage.oeil;
  const largeurPaupiere = Number(/width='([\d.]+)'/.exec(o.paupiere)[1]), largeurBlanc = 2 * Number(/rx='([\d.]+)'/.exec(o.blanc)[1]);
  assert.ok(largeurPaupiere >= largeurBlanc + 2, `${largeurPaupiere} / ${largeurBlanc}`);
});

test('THIRD-PARTY-NOTICES : rossark, take-one et reanimate mentionnés, à la racine et dans le plugin', () => {
  // V1 : rossark-motion-skill et take-one ; reanimate viendra avec les motifs (plan V5).
  const plugin = lire('THIRD-PARTY-NOTICES.md');
  const racine = fs.readFileSync(path.join(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(plugin, racine, 'mêmes mentions');
  for (const [titre, copyright] of [['rossark-motion-skill', 'Copyright (c) 2026 rossark0'], ['take-one', 'Copyright (c) 2026 Tal Siach']]) {
    assert.match(plugin, new RegExp(`\\n## ${titre}\\n`));
    assert.ok(plugin.includes(copyright), copyright);
  }
  assert.match(plugin, /moteur\/vivant\.js/);
  assert.match(plugin, /aucun fichier dérivé d'anidoodle/);
  assert.match(lire('moteur', 'vivant.js'), /rossark-motion-skill .*licence MIT, © 2026 rossark0/);
});
