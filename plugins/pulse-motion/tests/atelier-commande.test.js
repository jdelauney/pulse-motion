'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const PM = path.join(__dirname, '..', 'scripts', 'pm.js');

function faux() {
  const appels = { lancer: [], ouverts: [] };
  return {
    appels,
    lancer: async (o) => { appels.lancer.push(o); return { url: 'http://127.0.0.1:4999/', deja: false }; },
    ouvrirUrl: (u) => appels.ouverts.push(u),
  };
}

test('lancerAtelier : dans le dossier d\'une vidéo, aperçu du projet ouvert sur la page d\'atelier', async () => {
  const { lancerAtelier } = require('../scripts/atelier.js');
  const dir = copierProjet('projet-effets');
  const f = faux();
  const r = await lancerAtelier({ dossier: dir, recette: 'etincelles', lancer: f.lancer, ouvrirUrl: f.ouvrirUrl });
  assert.deepEqual(r, { url: 'http://127.0.0.1:4999/_pm/atelier?recette=etincelles', deja: false, projet: true });
  assert.deepEqual(f.appels.lancer, [{ dossier: dir, port: 4321, ouvrir: false }]);
  assert.deepEqual(f.appels.ouverts, ['http://127.0.0.1:4999/_pm/atelier?recette=etincelles']);
  const sans = await lancerAtelier({ dossier: dir, lancer: f.lancer, ouvrirUrl: f.ouvrirUrl });
  assert.equal(sans.url, 'http://127.0.0.1:4999/_pm/atelier');
});

test('lancerAtelier : hors d\'un projet, dossier temporaire ; nom invalide refusé avant tout lancement', async () => {
  const { lancerAtelier } = require('../scripts/atelier.js');
  const ailleurs = dossierTemporaire('pm-pas-une-video-');
  const f = faux();
  const r = await lancerAtelier({ dossier: ailleurs, recette: 'neige', lancer: f.lancer, ouvrirUrl: f.ouvrirUrl });
  assert.equal(r.projet, false);
  assert.notEqual(f.appels.lancer[0].dossier, ailleurs, 'pas d\'aperçu (ni de .pulse-motion/) dans un dossier qui n\'est pas une vidéo');
  assert.equal(f.appels.lancer[0].dossier, path.join(os.tmpdir(), 'pm-atelier'));
  await lancerAtelier({ dossier: ailleurs, lancer: f.lancer, ouvrirUrl: f.ouvrirUrl });
  assert.equal(f.appels.lancer[1].dossier, f.appels.lancer[0].dossier, 'le même dossier est réutilisé');
  await assert.rejects(() => lancerAtelier({ dossier: ailleurs, recette: '../deroule', lancer: f.lancer, ouvrirUrl: f.ouvrirUrl }), /Nom d'effet « \.\.\/deroule » invalide/);
  assert.equal(f.appels.lancer.length, 2);
});

test('pm atelier : usage en cas d\'arguments invalides', () => {
  const r = spawnSync(process.execPath, [PM, 'atelier', '../x'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage : pulse-motion atelier \[<recette>\]/);
  const deux = spawnSync(process.execPath, [PM, 'atelier', 'neige', 'pluie'], { encoding: 'utf8' });
  assert.equal(deux.status, 2);
});
