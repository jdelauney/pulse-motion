'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lancerAtelierPersonnages, executer } = require('../scripts/personnages.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const faux = () => {
  const appels = [];
  return {
    appels,
    lancer: async (o) => { appels.push(o); return { url: 'http://127.0.0.1:4321/', deja: false }; },
    ouvrirUrl: (u) => appels.push({ ouvert: u }),
  };
};

test('lancerAtelierPersonnages : dans une vidéo, aperçu du projet sur /_pm/personnages?nom=', async () => {
  const video = dossierTemporaire();
  fs.writeFileSync(path.join(video, 'deroule.json'), '{}');
  const f = faux();
  const r = await lancerAtelierPersonnages({ dossier: video, nom: 'marche', lancer: f.lancer, ouvrirUrl: f.ouvrirUrl });
  assert.equal(r.url, 'http://127.0.0.1:4321/_pm/personnages?nom=marche');
  assert.equal(r.cible, 'video');
  assert.equal(f.appels[0].dossier, video);
  assert.equal(f.appels[0].demarrer, undefined);
  assert.deepEqual(f.appels[1], { ouvert: r.url });
});

test('lancerAtelierPersonnages : hors d\'une vidéo, dossier temporaire ; --bibliotheque, aperçu dédié qui écrit dans la bibliothèque', async () => {
  const f = faux();
  const hors = await lancerAtelierPersonnages({ dossier: dossierTemporaire(), lancer: f.lancer, ouvrirUrl: f.ouvrirUrl });
  assert.equal(hors.cible, null);
  assert.equal(f.appels[0].dossier, path.join(os.tmpdir(), 'pm-personnages'));
  const g = faux();
  const bib = await lancerAtelierPersonnages({ bibliotheque: true, lancer: g.lancer, ouvrirUrl: g.ouvrirUrl });
  assert.equal(bib.cible, 'bibliotheque');
  assert.equal(g.appels[0].dossier, path.join(os.tmpdir(), 'pm-personnages-bibliotheque'));
  assert.equal(typeof g.appels[0].demarrer, 'function');
});

test('lancerAtelierPersonnages : nom invalide refusé avant tout lancement ; usage', async () => {
  const f = faux();
  await assert.rejects(lancerAtelierPersonnages({ nom: '../x', lancer: f.lancer, ouvrirUrl: f.ouvrirUrl }), /Nom « \.\.\/x » invalide/);
  assert.equal(f.appels.length, 0);
  const u = await executer(['atelier', 'a', 'b']);
  assert.equal(u.code, 2);
  assert.match(u.erreur, /Usage : pulse-motion personnages atelier/);
});
