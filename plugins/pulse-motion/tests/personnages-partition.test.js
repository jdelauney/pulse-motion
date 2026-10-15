'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PA = require('../moteur/personnages/partition.js');
const S = require('../moteur/squelette.js');
const P = require('../scripts/lib/personnages.js');

const lu = P.lire(null);
const bib = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions };
const gab = lu.gabarits.standard;
const proche = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const partition = (actions, extra = {}) => Object.assign({ x0: 10, vue0: 0, calme: true, largeur: 1600, echelle: 1, actions }, extra);

test('position : avant, pendant, après une marche ; trajets enchaînés', () => {
  const p = partition([{ type: 'marcher', debut: 1, fin: 3, vers: 50 }, { type: 'courir', debut: 4, fin: 5, vers: 110 }]);
  proche(PA.xAuTemps(p, 0), 10);
  proche(PA.xAuTemps(p, 2), 30);
  proche(PA.xAuTemps(p, 3.5), 50);
  proche(PA.xAuTemps(p, 4.5), 80);
  proche(PA.xAuTemps(p, 9), 110);
});

test('marche sans glissement : la phase suit la distance parcourue', () => {
  // 248 unités de foulée à l'échelle 1 : un cycle complet tous les 248 px ; 1600 px de large -> 15,5 % = 248 px.
  const p = partition([{ type: 'marcher', debut: 0, fin: 10, vers: 10 + 15.5 * 4 }]);
  const a = PA.etatAuTemps(p, 1, bib, gab).pose, b = PA.etatAuTemps(p, 1 + 10 / 4, bib, gab).pose;
  proche(a.cuisseAvant, b.cuisseAvant, 1e-6, 'un cycle plus loin, même pose');
  assert.equal(PA.etatAuTemps(p, 1, bib, gab).corps, 'marche');
  const lent = partition([{ type: 'marcher', debut: 0, fin: 20, vers: 10 + 15.5 * 4 }]);
  proche(PA.etatAuTemps(lent, 2, bib, gab).pose.cuisseAvant, a.cuisseAvant, 1e-6, 'même distance, même pose, quelle que soit la vitesse');
});

test('priorité : pose ou geste > marche > repos ; vue dans le sens du trajet', () => {
  const p = partition([
    { type: 'marcher', debut: 0, fin: 4, vers: 60 },
    { type: 'pose', debut: 1, fin: 2, pose: 'montrer' },
    { type: 'jouer', debut: 5, fin: 6.6, clip: 'coucou' },
    { type: 'marcher', debut: 7, fin: 8, vers: 20 },
  ]);
  const a = PA.etatAuTemps(p, 1.5, bib, gab);
  assert.equal(a.corps, 'pose');
  proche(a.pose.brasAvant, lu.poses.montrer.angles.brasAvant);
  assert.equal(PA.etatAuTemps(p, 3, bib, gab).corps, 'marche');
  assert.equal(PA.etatAuTemps(p, 4.6, bib, gab).corps, 'repos');
  const g = PA.etatAuTemps(p, 5.5, bib, gab);
  assert.equal(g.corps, 'jouer');
  proche(g.pose.ecartBrasAvant, 140, 1e-6, 'coucou : bras levé');
  proche(PA.etatAuTemps(p, 0.5, bib, gab).vue, 0, 1e-9, 'vers la droite');
  proche(PA.etatAuTemps(p, 7.6, bib, gab).vue, 180, 1e-9, 'demi-tour pour revenir');
});

test('fondus : pas de saut aux bornes', () => {
  const p = partition([{ type: 'pose', debut: 1, fin: 2, pose: 'bras-leves' }]);
  for (const b of [1, 2]) {
    const avant = PA.etatAuTemps(p, b - 1e-4, bib, gab).pose.brasAvant;
    const apres = PA.etatAuTemps(p, b + 1e-4, bib, gab).pose.brasAvant;
    assert.ok(Math.abs(avant - apres) < 2, `borne ${b} : ${avant} → ${apres}`);
  }
  proche(PA.etatAuTemps(p, 1.5, bib, gab).pose.brasAvant, -168, 1e-6, 'après le fondu, la pose entière');
});

test('tourner, expression et bouche discrètes, calques', () => {
  const p = partition([
    { type: 'tourner', debut: 1, fin: 2, vue: 90 },
    { type: 'expression', debut: 3, fin: 4, expression: 'joie' },
    { type: 'bouche', debut: 3.5, fin: 4.5, bouche: 'O' },
    { type: 'bouche', debut: 5, fin: 6, bouche: 'aucune' },
  ]);
  proche(PA.etatAuTemps(p, 0.5, bib, gab).vue, 0);
  const mi = PA.etatAuTemps(p, 1.5, bib, gab).vue;
  assert.ok(mi > 0 && mi < 90);
  proche(PA.etatAuTemps(p, 2.5, bib, gab).vue, 90);
  const j = PA.etatAuTemps(p, 3.2, bib, gab).pose;
  assert.equal(j.expression, 'joie');
  assert.equal(j.bouche, 'sourire', 'bouche de l\'expression');
  proche(j.sourcilsY, lu.expressions.joie.angles.sourcilsY);
  assert.equal(PA.etatAuTemps(p, 4, bib, gab).pose.bouche, 'O');
  assert.equal(PA.etatAuTemps(p, 5.5, bib, gab).pose.bouche, 'sourire', '« aucune » : retour à la bouche de l\'expression');
  const cligne = PA.etatAuTemps(p, 3.2 * 0.96, bib, gab).pose.paupieres;
  assert.ok(cligne < 0.5, `clignement à 96 % du cycle : ${cligne}`);
  assert.equal(PA.etatAuTemps(Object.assign({}, p, { calme: false }), 3.2 * 0.96, bib, gab).pose.paupieres, lu.expressions.joie.angles.paupieres, "sans clignement : les paupières de l'expression");
});

test('déterminisme et hauteur', () => {
  const p = partition([{ type: 'marcher', debut: 0.3, fin: 2, vers: 40 }, { type: 'jouer', debut: 2.1, fin: 3, clip: 'saut' }]);
  const a = JSON.stringify(PA.etatAuTemps(p, 2.4, bib, gab));
  PA.etatAuTemps(p, 0.7, bib, gab);
  assert.equal(JSON.stringify(PA.etatAuTemps(p, 2.4, bib, gab)), a);
  const g = S.completerGabarit(gab);
  assert.equal(PA.hauteur(gab), g.cuisse + g.tibia + g.baseTete + 2 * g.tete.ry - 2);
});

test('enchaînements rapprochés : pas de saut (fondus en chaîne, trajets et rotations qui se chevauchent)', () => {
  const pas = (p, de, a, f) => { let max = 0, prec = f(PA.etatAuTemps(p, de, bib, gab)); for (let t = de + 0.005; t <= a; t += 0.005) { const v = f(PA.etatAuTemps(p, t, bib, gab)); max = Math.max(max, Math.abs(v - prec)); prec = v; } return max; };
  const rapproche = partition([{ type: 'marcher', debut: 0, fin: 1.7, vers: 40 }, { type: 'pose', debut: 1.8, fin: 3, pose: 'bras-leves' }]);
  assert.ok(pas(rapproche, 1.6, 2.2, (e) => e.pose.brasAvant) < 8, 'fin de marche puis pose 0,1 s après');
  const chevauche = partition([{ type: 'marcher', debut: 0, fin: 2, vers: 30 }, { type: 'courir', debut: 1, fin: 2, vers: 80 }]);
  assert.ok(pas(chevauche, 0, 3, (e) => e.x) < 1, 'deux trajets qui se chevauchent');
  proche(PA.xAuTemps(chevauche, 3), 80);
  const tours = partition([{ type: 'tourner', debut: 0, fin: 2, vue: 90 }, { type: 'marcher', debut: 1, fin: 3, vers: 0 }], { x0: 50 });
  assert.ok(pas(tours, 0, 3, (e) => e.vue) < 10, 'rotation interrompue par un demi-tour');
  proche(PA.vueAuTemps(tours, 3), 180);
  const surPlace = partition([{ type: 'marcher', debut: 0, fin: 1, vers: 10 }], { vue0: 180 });
  proche(PA.vueAuTemps(surPlace, 2), 180, 1e-9, 'marche sur place : pas de demi-tour');
});

test('parler : la piste donne la bouche ; une bouche plus récente l\'emporte ; silence long -> bouche de l\'expression', () => {
  const L = require('../moteur/personnages/levres.js');
  const piste = L.piste([{ w: 'Bonjour', t0: 0, t1: 0.6 }, { w: 'Fin', t0: 2, t1: 2.4 }], 1, 0, Infinity);
  const p = partition([
    { type: 'expression', debut: 0, fin: 1, expression: 'joie' },
    { type: 'parler', debut: 0.5, fin: Infinity, piste },
    { type: 'bouche', debut: 3.1, fin: 4, bouche: 'O' },
  ]);
  assert.equal(PA.etatAuTemps(p, 1.05, bib, gab).pose.bouche, 'MBP');
  assert.equal(PA.etatAuTemps(p, 1.5, bib, gab).pose.bouche, 'U');
  assert.equal(PA.etatAuTemps(p, 2.3, bib, gab).pose.bouche, 'sourire', 'silence long : bouche de la joie');
  assert.equal(PA.etatAuTemps(p, 3.05, bib, gab).pose.bouche, 'FV');
  assert.equal(PA.etatAuTemps(p, 3.2, bib, gab).pose.bouche, 'O', 'bouche demandée après : elle l\'emporte');
  const fini = partition([{ type: 'parler', debut: 0, fin: 1.2, piste }]);
  assert.notEqual(PA.etatAuTemps(fini, 3.05, bib, gab).pose.bouche, 'FV', 'hors de la fenêtre : rien');
  assert.doesNotThrow(() => PA.etatAuTemps(partition([{ type: 'parler', debut: 0, fin: 5, piste: [] }]), 1, bib, gab), 'voix absente');
});

