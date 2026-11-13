'use strict';
/* Spec S11, jalon J5 (5.8) : ressorts, pendules et vent sans état (moteur/physique.js), sans navigateur. Repos exact par
 * calme, équilibre exact sous un vent constant, impulsion minutée, piste continue d'une scène à l'autre, os en plus poussés
 * par le vent, validation (physique-invalide, « vent » du déroulé) et moteur à la carte. Page : physique-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Ph = require('../moteur/physique.js');
const S = require('../moteur/squelette.js');
const P = require('../scripts/lib/personnages.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const { verifierPhysique, validerVentDeroule } = require('../scripts/lib/physique-scene.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');

const lu = P.lire(null);
const DEG = Math.PI / 180;
const instants = Array.from({ length: 40 }, (_, i) => 0.37 + i * 0.731);

test('physique : vent calme et aucune impulsion = repos exact', () => {
  const calme = Ph.piste(Ph.entreesVent({ scenes: [{ debut: 0, vent: 'calme', dir: 30 }, { debut: 5, vent: 'calme' }] }));
  assert.equal(calme.defini, true);
  const vent = (u) => Ph.ventPiste(calme, u);
  for (const t of instants) {
    assert.deepEqual(vent(t), { x: 0, y: 0, force: 0, dir: 0 });
    assert.ok(Object.is(Ph.pendule({ longueur: 0.3, amorti: 0.1 }, t), 0));
    assert.ok(Object.is(Ph.pendule({ longueur: 0.3, amorti: 0.1, pivot: [2, 5] }, t, { vent, impulsions: [] }), 0));
    assert.ok(Object.is(Ph.ressortAmorti({ k: 40, c: 6 }, t, { impulsions: [] }), 0));
    const a = Ph.anglesPendants(Ph.pendantsDe(lu.dessins.passant), t, () => ({ echarpe: [10, 20], objetAvant: [15, 60] }), 400, vent);
    assert.ok(Object.is(a.echarpe, 0) && Object.is(a.objetAvant, 0), JSON.stringify(a));
  }
  // Os en plus : un vent calme ne change rien au balancement.
  const g = S.completerGabarit(lu.gabarits['avec-queue']);
  const poseA = (u) => ({ x: 100 + 80 * u, y: 200, echelle: 1, cuisseAvant: -10 * Math.sin(6 * u) });
  const sans = S.calculer(poseA(1.3), g, { temps: 1.3, poseA });
  const avec = S.calculer(poseA(1.3), g, { temps: 1.3, poseA, vent: (u) => Ph.accelerationVent(vent(u), 1000) });
  assert.deepEqual(avec.os, sans.os);
});

test('physique : même t, même angle, quel que soit l\'ordre des appels ; équilibre exact sous un vent constant', () => {
  const p = Ph.piste(Ph.entreesVent({ scenes: [{ debut: 0, vent: 'rafales', dir: 0 }] }));
  const vent = (u) => Ph.ventPiste(p, u);
  const reglage = { longueur: 0.25, amorti: 0.12, prise: 0.6, pivot: (u) => [0.3 * Math.sin(3 * u), 0] };
  const forces = { vent, impulsions: [Ph.impulsion(2.2, 3)] };
  const aller = instants.map((t) => Ph.pendule(reglage, t, forces));
  const retour = instants.slice().reverse().map((t) => Ph.pendule(reglage, t, forces)).reverse();
  assert.deepEqual(aller, retour);
  assert.ok(new Set(aller).size > 30, 'il bouge');
  // Vent constant sans rafales (déroulé à force 0,5 ; rafales mises à 0), pivot fixe : l'angle d'équilibre exact.
  const constant = { cles: [{ de: -10, depart: { x: 0.5, y: 0, r: 0 }, cible: { x: 0.5, y: 0, r: 0 } }], defini: true };
  for (const t of [1, 2.5, 7.25]) {
    const a = Ph.pendule({ longueur: 0.4, amorti: 0.2, prise: 0.6 }, t, { vent: (u) => Ph.ventPiste(constant, u) });
    assert.ok(Math.abs(a - Math.atan(0.6 * 0.5)) < 1e-9, `${a} contre ${Math.atan(0.3)}`);
  }
  // Ressort : poussée constante, position d'équilibre exacte ; impulsion : rien avant, un écart après, qui s'amortit.
  assert.ok(Math.abs(Ph.ressortAmorti({ k: 40, c: 6 }, 3, { poussee: 8 }) - 0.2) < 1e-12);
  const choc = { impulsions: [Ph.impulsion(1, 2)] };
  assert.ok(Object.is(Ph.ressortAmorti({ k: 40, c: 6 }, 0.99, choc), 0));
  const apres = Ph.ressortAmorti({ k: 40, c: 6 }, 1.1, choc), tard = Ph.ressortAmorti({ k: 40, c: 6 }, 2.6, choc);
  assert.ok(apres > 0.05, `${apres}`);
  assert.ok(Math.abs(tard) < 0.01, `${tard}`);
  assert.ok(Object.is(Ph.ressortAmorti({ k: 40, c: 6 }, 2.01, choc), 0), 'sorti de la fenêtre : repos exact');
  // Coup de chapeau : un pendule poussé à 1 s bouge après, pas avant.
  assert.ok(Object.is(Ph.pendule({ longueur: 0.3 }, 0.98, choc), 0));
  assert.ok(Ph.pendule({ longueur: 0.3 }, 1.15, choc) > 0.05);
});

test('vent : continu au changement de scène', () => {
  // Trois scènes : brise vers la droite, tempête vers la gauche, une scène sans vent (garde la tempête), puis le déroulé.
  const p = Ph.piste(Ph.entreesVent({ scenes: [{ debut: 0, vent: 'brise', dir: 0 }, { debut: 4, vent: 'tempete', dir: 180 }, { debut: 12, vent: 'calme' }],
    deroule: [{ de: 9, force: 0.4, dir: 90 }] }));
  const v = (t) => Ph.ventPiste(p, t);
  for (const de of [4, 9, 12]) {
    const a = v(de - 1e-7), b = v(de + 1e-7);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-5, `saut à ${de} s : ${JSON.stringify([a, b])}`);
  }
  // Pas de 1/600 s sur toute la piste : jamais de saut (dérivée bornée).
  let pire = 0;
  for (let t = 0; t < 16; t += 1 / 600) { const a = v(t), b = v(t + 1 / 600); pire = Math.max(pire, Math.hypot(a.x - b.x, a.y - b.y)); }
  assert.ok(pire < 0.01, `plus grand pas : ${pire}`);
  // Les valeurs cibles sont atteintes après la transition (base, sans les rafales ±).
  assert.ok(v(3.5).x > 0.29 && v(7).x < -0.79, JSON.stringify([v(3.5), v(7)]));
  assert.ok(Math.abs(v(11).dir - 90) < 10, 'déroulé : vers le bas');
  assert.ok(v(14).force === 0, 'calme');
  // Avant la première clé : calme ; un pendule ne saute pas non plus au changement de scène.
  assert.deepEqual(Ph.ventPiste(Ph.piste(Ph.entreesVent({ scenes: [{ debut: 2, vent: 'tempete' }] })), 1), { x: 0, y: 0, force: 0, dir: 0 });
  const a = Ph.pendule({ longueur: 0.3, amorti: 0.2 }, 4 - 1e-6, { vent: v }), b = Ph.pendule({ longueur: 0.3, amorti: 0.2 }, 4 + 1e-6, { vent: v });
  assert.ok(Math.abs(a - b) < 1e-3, `${a} → ${b}`);
});

test('vent : pousse les pendants de la plume et les os en plus dans son sens', () => {
  const p = Ph.piste(Ph.entreesVent({ scenes: [{ debut: 0, vent: 'tempete', dir: 0 }] }));
  const vent = (u) => Ph.ventPiste(p, u);
  // Écharpe et mallette au vent vers la droite : le bout part vers +x, soit un angle négatif dans la convention de la plume.
  const a = Ph.anglesPendants(Ph.pendantsDe(lu.dessins.passant), 3, () => ({ echarpe: [10, 20], objetAvant: [15, 60] }), 400, vent);
  assert.ok(a.echarpe < -30 && a.objetAvant < 0 && a.echarpe < a.objetAvant, JSON.stringify(a));
  // Un porteur qui marche vers la droite sans vent : l'écharpe flotte derrière lui (bout vers −x, angle positif).
  const marche = Ph.anglesPendants(Ph.pendantsDe(lu.dessins.passant), 3, (u) => ({ echarpe: [300 * u, 20], objetAvant: [300 * u, 60] }), 400, () => ({ x: 0, y: 0 }));
  assert.ok(marche.echarpe > 5, JSON.stringify(marche));
  // Os en plus (queue) : le vent vers la droite pousse son bout vers +x.
  const g = S.completerGabarit(lu.gabarits['avec-queue']);
  const poseA = () => ({ x: 100, y: 200, echelle: 1 });
  const sans = S.calculer(poseA(), g, { temps: 2, poseA });
  const avec = S.calculer(poseA(), g, { temps: 2, poseA, vent: (u) => Ph.accelerationVent(vent(u), 3000) });
  const nom = g.osEnPlus[0].nom;
  assert.ok(avec.os[nom].bout[0] > sans.os[nom].bout[0] + 0.5, `${avec.os[nom].bout[0]} contre ${sans.os[nom].bout[0]}`);
  assert.deepEqual(S.calculer(poseA(), g, { temps: 2, poseA, vent: (u) => Ph.accelerationVent(vent(u), 3000) }).os, avec.os, 'même t, même os');
});

test('physique-invalide : vent sur la scène, pendule sur un groupe SVG ; « vent » du déroulé validé', () => {
  const bon = verifierPhysique('<section data-scene="s" data-vent="brise" data-vent-dir="180"><svg><g data-pendule="12 0.2"><rect /></g></svg></section>', { scene: 's' });
  assert.deepEqual(bon.erreurs, []);
  assert.equal(bon.vent, true);
  assert.equal(bon.pendules, 1);
  const msgs = (html) => verifierPhysique(html, { scene: 's' }).erreurs.map((e) => `${e.regle}/${e.gravite} ${e.message}`).join('\n');
  assert.match(msgs('<section data-scene="s" data-vent="ouragan"></section>'), /physique-invalide\/erreur .*data-vent="ouragan" : calme, brise, rafales, tempete/);
  assert.match(msgs('<section data-scene="s"><div data-vent="brise"></div></section>'), /data-vent se pose sur la section de la scène/);
  assert.match(msgs('<section data-scene="s" data-vent-dir="vers"></section>'), /data-vent-dir="vers"/);
  assert.match(msgs('<section data-scene="s" data-vent-dir="90"></section>'), /physique-invalide\/alerte .*sans data-vent/);
  assert.match(msgs('<section data-scene="s"><div data-pendule="12 0.2"></div></section>'), /sur un groupe SVG \(<g>\), pas sur un div/);
  assert.match(msgs('<section data-scene="s"><svg><g data-pendule="12"></g></svg></section>'), /« <longueur> <amorti> »/);
  assert.match(msgs('<section data-scene="s"><svg><g data-pendule="12 1.5"></g></svg></section>'), /amorti de 0 à 1/);
  assert.deepEqual(validerVentDeroule([{ de: 0, force: 0.3, dir: 0 }, { de: 4, force: 1 }]), []);
  assert.match(validerVentDeroule({ de: 0 }).join(), /liste de clés/);
  assert.match(validerVentDeroule([{ de: -1, force: 2, dir: 'n', vitesse: 3 }]).join('\n'), /« de »[\s\S]*« force »[\s\S]*« dir »/);
  assert.match(validerVentDeroule([{ de: 0, force: 0.2, vitesse: 3 }]).join(), /champ « vitesse » inconnu/);
  const d = { version: 1, titre: 'x', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'test', vent: [{ de: 0, force: 3 }],
    scenes: [{ id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} }] };
  assert.match(validerDeroule(d).join('\n'), /« vent\[0\] » : « force » de 0/);
});

test('moteur à la carte : groupe physique seulement avec un vent, un pendule ou une marche calculée', () => {
  const avecPhysique = (d, html) => GM.groupesDuDeroule(d, [html]).includes('physique');
  assert.equal(avecPhysique({}, '<section data-scene="s"><p>x</p></section>'), false);
  assert.equal(avecPhysique({}, '<section data-scene="s" data-vent="brise"></section>'), true);
  assert.equal(avecPhysique({}, '<section data-scene="s"><svg><g data-pendule="10 0.2"></g></svg></section>'), true);
  assert.equal(avecPhysique({ vent: [{ de: 0, force: 0.3 }] }, '<section data-scene="s"></section>'), true);
  assert.ok(GM.modulesDesGroupes(['tronc', 'physique']).includes('physique.js'));
  // Chaque module dans un seul groupe ; les deux nouveaux sont purs (chargés par Node).
  for (const m of ['demarche.js', 'physique.js']) assert.equal(Object.values(GM.GROUPES).filter((l) => l.includes(m)).length, 1, m);
});
