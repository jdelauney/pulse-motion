'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const P = require('../scripts/lib/personnages.js');
const K = require('../moteur/clips.js');
const S = require('../moteur/squelette.js');

const lu = P.lire(null);

test('bibliothèque : complète et valide', () => {
  assert.deepEqual(lu.erreurs.map((e) => e.message), []);
  assert.deepEqual(Object.keys(lu.poses).sort(), ['assis', 'bras-leves', 'debout', 'mains-hanches', 'montrer', 'penche']);
  assert.deepEqual(Object.keys(lu.clips).sort(), ['accroupi', 'clignement', 'coucou', 'course', 'marche', 'peur', 'repos', 'respiration', 'saut', 'se-relever']);
  assert.deepEqual(Object.keys(lu.gabarits).sort(), ['avec-queue', 'standard']);
  assert.deepEqual(Object.keys(lu.expressions).sort(), ['colere', 'joie', 'neutre', 'peur', 'surprise', 'tristesse']);
  for (const [nom, c] of Object.entries(lu.clips)) assert.ok(c.description && c.description.length > 5, `${nom} : description`);
  assert.equal(lu.clips.respiration.additif, true);
  assert.equal(lu.clips.clignement.additif, true);
  assert.equal(lu.clips.marche.foulee, 248);
  assert.equal(lu.clips.course.foulee, 330);
});

test('bibliothèque : chaque fichier est déjà au format d\'écriture (aller-retour identique)', () => {
  for (const type of Object.keys(P.TYPES)) {
    for (const [nom, fichier] of Object.entries(lu.fichiers[P.TYPES[type]])) {
      const texte = fs.readFileSync(fichier, 'utf8');
      assert.equal(P.serialiser(type, JSON.parse(texte)), texte, `${type} ${nom}`);
    }
  }
});

test('bibliothèque : pieds au sol, jamais sous le sol ; sur le sol sans piste bassinY', () => {
  for (const [nom, clip] of Object.entries(lu.clips)) {
    if (clip.pieds !== 'au-sol') continue;
    const rebond = 'bassinY' in K.pistes(clip, lu);
    for (const gabarit of [lu.gabarits.standard, { cuisse: 80, tibia: 74 }]) {
      for (let i = 0; i <= 32; i++) {
        const t = K.duree(clip) * i / 32;
        const r = S.calculer(K.echantillonner(clip, t, lu, gabarit), gabarit);
        const bas = Math.max(r.articulations.chevilleAvant[1], r.articulations.chevilleArriere[1]);
        assert.ok(bas <= S.sol(gabarit) + 1e-6, `${nom} t=${t} : sous le sol (${bas})`);
        if (!rebond) assert.ok(Math.abs(bas - S.sol(gabarit)) < 1e-6, `${nom} t=${t} : décollé (${bas})`);
      }
    }
  }
});

test('bibliothèque : les poses et les clips ne butent pas sur les contraintes', () => {
  const g = S.completerGabarit(lu.gabarits.standard);
  const verifier = (ou, angles) => {
    for (const [k, v] of Object.entries(angles)) {
      const lim = S.limite(k, g);
      if (lim) assert.ok(v >= lim[0] && v <= lim[1], `${ou} : ${k} = ${v} hors de [${lim}]`);
    }
  };
  for (const [nom, p] of Object.entries(lu.poses)) verifier(`pose ${nom}`, p.angles);
  for (const [nom, c] of Object.entries(lu.clips)) c.cles.forEach((k, i) => k.angles && !c.additif && verifier(`clip ${nom} clé ${i + 1}`, k.angles));
});

test('bibliothèque : le coucou garde le bras levé pendant tout le salut', () => {
  for (const t of [0.25, 0.6, 0.9, 1.2, 1.29]) {
    const p = K.echantillonner(lu.clips.coucou, t, lu);
    assert.ok(Math.abs(p.ecartBrasAvant - 140) < 1e-6 && Math.abs(p.torsionBrasAvant - 90) < 1e-6, `t=${t} : ${p.ecartBrasAvant} / ${p.torsionBrasAvant}`);
  }
});
