'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../scripts/lib/personnages.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const ctx = (extra = {}) => Object.assign({ nom: 'x', poses: ['debout'], osEnPlus: [] }, extra);
const ecrire = (racine, type, nom, contenu) => {
  const f = path.join(racine, P.TYPES[type], `${nom}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};

test('valider pose : angle inconnu avec suggestion, valeur non numérique, placement interdit, nom', () => {
  const e = P.valider('pose', { nom: 'y', angles: { cuisseAvent: 3, torse: 'beaucoup', vue: 90 } }, ctx());
  assert.ok(e.some((m) => /« cuisseAvent » : angle inconnu ; voulais-tu « cuisseAvant » \?/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /« torse » doit être un nombre \(ex\. -90\)/.test(m)));
  assert.ok(e.some((m) => /« vue » se règle dans la scène/.test(m)));
  assert.ok(e.some((m) => /« nom » vaut « y » mais le fichier s'appelle « x\.json »/.test(m)));
  assert.deepEqual(P.valider('pose', { nom: 'x', angles: { queue: 10 } }, ctx({ osEnPlus: ['queue'] })), []);
  assert.deepEqual(P.valider('pose', { nom: 'x', description: 'ok', angles: {} }, ctx()), []);
});

test('valider clip : phase hors de [0, 1], clés non triées, pose introuvable, courbe inconnue, champs', () => {
  const e = P.valider('clip', { nom: 'x', boucle: true, duree: 1, cles: [{ t: 0.5, angles: { torse: 1 } }, { t: 0.2, pose: 'assise' }, { t: 1.4, angles: {}, courbe: 'mou' }] }, ctx());
  assert.ok(e.some((m) => /clé 3 : « t » vaut 1\.4, hors de \[0, 1\]/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /clé 2 : les clés doivent être rangées par « t » croissant/.test(m)));
  assert.ok(e.some((m) => /clé 2 : pose « assise » introuvable.*debout/.test(m)));
  assert.ok(e.some((m) => /clé 3 : courbe « mou » inconnue/.test(m)));
  const champs = P.valider('clip', { nom: 'x', boucle: 'oui', cles: [] }, ctx());
  assert.ok(champs.some((m) => /« boucle » doit valoir true ou false/.test(m)));
  assert.ok(champs.some((m) => /au moins une clé/.test(m)));
  assert.ok(P.valider('clip', { nom: 'x', boucle: true, cles: [{ t: 0, angles: {} }] }, ctx()).some((m) => /« duree » .*secondes/.test(m)));
  assert.ok(P.valider('clip', { nom: 'x', boucle: false, miroir: 0.5, cles: [{ t: 0, angles: {} }] }, ctx()).some((m) => /« miroir » .*bouclé/.test(m)));
  assert.ok(P.valider('clip', { nom: 'x', boucle: true, duree: 1, additif: true, pieds: 'au-sol', cles: [{ t: 0, angles: {} }] }, ctx()).some((m) => /additif.*au-sol/.test(m)));
  assert.ok(P.valider('clip', { nom: 'x', boucle: false, cles: [{ t: 0 }] }, ctx()).some((m) => /clé 1 : .*« pose » ou des « angles »/.test(m)));
  assert.deepEqual(P.valider('clip', { nom: 'x', boucle: false, pieds: 'au-sol', cles: [{ t: 0, pose: 'debout' }, { t: 0.4, angles: { torse: 20 }, courbe: 'back-out' }] }, ctx()), []);
  assert.ok(P.valider('clip', { nom: 'x', boucle: true, duree: 1, additif: true, cles: [{ t: 0, pose: 'debout' }] }, ctx()).some((m) => /clip additif ne cite pas de pose/.test(m)));
  assert.ok(P.valider('clip', { nom: 'x', boucle: false, cles: [{ t: 0, pose: 'debout' }] }, ctx()).some((m) => /au moins une clé après 0/.test(m)));
  assert.ok(P.valider('clip', { nom: 'x', boucle: false, cles: [{ t: 0.3331, angles: {} }, { t: 0.3334, angles: {} }] }, ctx()).some((m) => /au millième près/.test(m)));
});

test('valider gabarit : longueur nulle, os en plus, contraintes', () => {
  const e = P.valider('gabarit', { nom: 'x', cuisse: 0, tete: { rx: -2 }, osEnPlus: [{ nom: 'torse', parent: 'epaule', longueur: 0, raideur: 2 }], contraintes: { genou: [0, 10], cuisse: [10, -10] } }, ctx());
  assert.ok(e.some((m) => /« cuisse » doit être un nombre positif/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /« tete\.rx » doit être un nombre positif/.test(m)));
  assert.ok(e.some((m) => /os en plus 1 : « torse » est déjà un nom de la pose/.test(m)));
  assert.ok(P.valider('gabarit', { nom: 'x', osEnPlus: [{ nom: 'mainAvant', parent: 'bassin', longueur: 5 }] }, ctx()).some((m) => /« mainAvant » est déjà le nom d'une articulation/.test(m)));
  assert.ok(e.some((m) => /os en plus 1 : parent « epaule » inconnu \(bassin, torse ou tete\)/.test(m)));
  assert.ok(e.some((m) => /os en plus 1 : « longueur » doit être un nombre positif/.test(m)));
  assert.ok(e.some((m) => /os en plus 1 : « raideur » doit être entre 0 et 1/.test(m)));
  assert.ok(e.some((m) => /contrainte « genou » inconnue/.test(m)));
  assert.ok(e.some((m) => /contrainte « cuisse » : \[min, max\] avec min ≤ max/.test(m)));
  assert.deepEqual(P.valider('gabarit', { nom: 'x', osEnPlus: [{ nom: 'queue', parent: 'bassin', attache: [-4, -4, 0], angle: 120, longueur: 40, raideur: 0.5, amorti: 0.3 }], contraintes: { avantBrasAvant: [-160, 0], queue: [-90, 90] } }, ctx()), []);
});

test('lire : fusion bibliothèque et vidéo, la vidéo l\'emporte', () => {
  const bib = dossierTemporaire();
  const video = dossierTemporaire();
  ecrire(bib, 'pose', 'debout', { nom: 'debout', angles: {} });
  ecrire(bib, 'pose', 'montrer', { nom: 'montrer', angles: { brasAvant: -90 } });
  ecrire(path.join(video, 'personnages'), 'pose', 'montrer', { nom: 'montrer', angles: { brasAvant: -80 } });
  ecrire(path.join(video, 'personnages'), 'clip', 'salut', { nom: 'salut', boucle: false, cles: [{ t: 0, pose: 'montrer' }, { t: 0.5, angles: { tete: 5 } }] });
  const lu = P.lire(video, { bibliotheque: bib });
  assert.deepEqual(lu.erreurs, []);
  assert.equal(lu.poses.montrer.angles.brasAvant, -80);
  assert.equal(lu.sources.poses.montrer, 'video');
  assert.equal(lu.sources.poses.debout, 'plugin');
  assert.equal(lu.sources.clips.salut, 'video');
  assert.equal(lu.fichiers.clips.salut, path.join(video, 'personnages', 'clips', 'salut.json'));
  assert.deepEqual(P.contexteDe(lu).poses.sort(), ['debout', 'montrer']);
  const sansVideo = P.lire(null, { bibliotheque: bib });
  assert.equal(sansVideo.poses.montrer.angles.brasAvant, -90);
});

test('lire : un fichier invalide de la vidéo laisse la version de la bibliothèque', () => {
  const bib = dossierTemporaire();
  const video = dossierTemporaire();
  ecrire(bib, 'pose', 'montrer', { nom: 'montrer', angles: { brasAvant: -90 } });
  ecrire(path.join(video, 'personnages'), 'pose', 'montrer', '{ pas du json');
  ecrire(path.join(video, 'personnages'), 'clip', 'casse', { nom: 'casse', boucle: false, cles: [{ t: 0, pose: 'inconnue' }, { t: 1, angles: {} }] });
  const lu = P.lire(video, { bibliotheque: bib });
  assert.equal(lu.poses.montrer.angles.brasAvant, -90);
  assert.equal(lu.erreurs.length, 2);
  assert.match(lu.erreurs[0].message, /personnages\/poses\/montrer\.json \(vidéo\) : JSON invalide/);
  assert.match(lu.erreurs[1].message, /personnages\/clips\/casse\.json \(vidéo\) : clé 1 : pose « inconnue » introuvable/);
  assert.equal(lu.clips.casse, undefined);
  assert.equal(lu.erreurs[1].type, 'clip');
});

test('lire : les os en plus des gabarits sont des angles acceptés', () => {
  const bib = dossierTemporaire();
  ecrire(bib, 'gabarit', 'queue', { nom: 'queue', osEnPlus: [{ nom: 'queue', parent: 'bassin', longueur: 30 }] });
  ecrire(bib, 'pose', 'remue', { nom: 'remue', angles: { queue: 20 } });
  const lu = P.lire(null, { bibliotheque: bib });
  assert.deepEqual(lu.erreurs, []);
  assert.deepEqual(P.contexteDe(lu).osEnPlus, ['queue']);
});

test('serialiser : arrondi et ordre stable', () => {
  const texte = P.serialiser('clip', { cles: [{ courbe: 'linear', angles: { touffeOnde: 1, cuisseAvant: -24.719999999, torse: -0.0000001 }, t: 0.125 }], boucle: true, nom: 'm', duree: 1, description: 'd' });
  assert.equal(texte, `{
  "nom": "m",
  "description": "d",
  "boucle": true,
  "duree": 1,
  "cles": [
    {
      "t": 0.125,
      "angles": {
        "torse": 0,
        "cuisseAvant": -24.72,
        "touffeOnde": 1
      },
      "courbe": "linear"
    }
  ]
}
`);
  const g = P.serialiser('gabarit', { osEnPlus: [{ longueur: 4, nom: 'q', parent: 'tete' }], nom: 'g', contraintes: { tibia: [0, 1], bras: [-1, 1] } });
  assert.ok(g.indexOf('"nom": "q"') < g.indexOf('"parent"') && g.indexOf('"parent"') < g.indexOf('"longueur"'));
  assert.ok(g.indexOf('"bras"') < g.indexOf('"tibia"'));
});

test('enregistrer : valide, écrit au format stable, relu à l\'identique', () => {
  const dossier = dossierTemporaire();
  const lu = { poses: { debout: { angles: {} } }, clips: {}, gabarits: {} };
  const objet = { boucle: false, cles: [{ t: 0, pose: 'debout' }, { t: 0.5, angles: { brasAvant: -160.00004 } }] };
  const { fichier } = P.enregistrer({ dossier, type: 'clip', nom: 'leve', objet, lu });
  assert.equal(fichier, path.join(dossier, 'clips', 'leve.json'));
  const texte = fs.readFileSync(fichier, 'utf8');
  assert.equal(P.serialiser('clip', JSON.parse(texte)), texte);
  assert.equal(JSON.parse(texte).nom, 'leve');
  assert.equal(JSON.parse(texte).cles[1].angles.brasAvant, -160);
});

test('enregistrer : nom invalide ou objet invalide, rien n\'est écrit', () => {
  const dossier = dossierTemporaire();
  const lu = { poses: {}, clips: {}, gabarits: {} };
  assert.throws(() => P.enregistrer({ dossier, type: 'pose', nom: '../x', objet: { angles: {} }, lu }), (e) => /Nom « \.\.\/x » invalide/.test(e.message) && Array.isArray(e.erreurs));
  assert.throws(() => P.enregistrer({ dossier, type: 'pose', nom: 'Grand', objet: { angles: {} }, lu }), /invalide/);
  assert.throws(() => P.enregistrer({ dossier, type: 'pose', nom: 'ok', objet: { angles: { cuisseAvent: 1 } }, lu }), /voulais-tu « cuisseAvant »/);
  assert.throws(() => P.enregistrer({ dossier, type: 'film', nom: 'ok', objet: {}, lu }), /Type « film » inconnu/);
  assert.deepEqual(fs.readdirSync(dossier), []);
});
