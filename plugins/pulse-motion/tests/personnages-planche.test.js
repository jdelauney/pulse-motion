'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { executer } = require('../scripts/personnages.js');
const PL = require('../scripts/lib/planche-personnages.js');
const P = require('../scripts/lib/personnages.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const lu = P.lire(null);
const dimensions = (png) => ({ signature: png.slice(1, 4).toString('latin1'), largeur: png.readUInt32BE(16), hauteur: png.readUInt32BE(20) });

test('planche : instants d\'un clip bouclé, d\'un clip ponctuel, d\'une pose', () => {
  assert.deepEqual(PL.instants('clip', lu.clips.marche, 4), [0, 0.25, 0.5, 0.75]);
  assert.deepEqual(PL.instants('clip', lu.clips.saut, 3), [0, 0.65, 1.3]);
  assert.deepEqual(PL.instants('clip', lu.clips.saut, 1), [0]);
  assert.deepEqual(PL.instants('pose', lu.poses.montrer, 8), [0]);
});

test('planche : page autonome, dimensions de la grille', () => {
  const { html, largeur, hauteur } = PL.pagePlanche({ nom: 'marche', type: 'clip', objet: lu.clips.marche, lu, gabarit: lu.gabarits.standard, vues: [0, 90], images: 4 });
  assert.equal(largeur, PL.MARGE + 4 * PL.CELLULE);
  assert.equal(hauteur, PL.ENTETE + 2 * PL.CELLULE);
  assert.match(html, /M\.squelette = api|racine\.M\.squelette = api/);
  assert.match(html, /racine\.M\.batonnets = api/);
  assert.doesNotMatch(html, /<script src=/, 'aucune ressource extérieure');
  assert.match(html, /id="pm-planche-donnees"/);
});

test('planche : arguments refusés, sans lancer le navigateur', async () => {
  for (const args of [['planche'], ['planche', 'marche', '--images', '0'], ['planche', 'marche', '--images', '40'], ['planche', 'marche', '--vues', 'face'], ['planche', 'marche', '--vues', '0,400']]) {
    const r = await executer(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.erreur, /Usage : pulse-motion personnages planche/);
  }
  assert.equal((await executer(['planche', 'marche', '--images'])).code, 2, 'option sans valeur');
  const herite = await executer(['planche', 'constructor']);
  assert.equal(herite.code, 1);
  assert.match(herite.erreur, /« constructor » introuvable/);
  assert.match((await executer(['planche', 'marche', '--gabarit', 'toString'])).erreur, /gabarit « toString » introuvable/);
  const inconnu = await executer(['planche', 'nage']);
  assert.equal(inconnu.code, 1);
  assert.match(inconnu.erreur, /« nage » introuvable/);
  const gabarit = await executer(['planche', 'marche', '--gabarit', 'geant']);
  assert.equal(gabarit.code, 1);
  assert.match(gabarit.erreur, /gabarit « geant » introuvable.*standard/);
});

test('planche : sans navigateur, message qui renvoie vers pulse-motion outils', async () => {
  await assert.rejects(PL.rendrePlanche({ nom: 'marche', type: 'clip', objet: lu.clips.marche, lu, gabarit: lu.gabarits.standard, vues: [0], images: 2, sortie: path.join(dossierTemporaire(), 'x.png'), navigateur: null }),
    /Chrome ou Edge introuvable.*pulse-motion outils/);
});

test('planche : PNG aux dimensions attendues, un personnage par vignette', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const sortie = path.join(dossierTemporaire(), 'marche.png');
  const r = await executer(['planche', 'marche', '--images', '4', '--vues', '0,90', '--sortie', sortie]);
  assert.equal(r.code, 0, r.erreur);
  assert.match(r.sortie, /Planche : .*marche\.png/);
  const d = dimensions(fs.readFileSync(sortie));
  assert.deepEqual(d, { signature: 'PNG', largeur: PL.MARGE + 4 * PL.CELLULE, hauteur: PL.ENTETE + 2 * PL.CELLULE });
  const fin = await PL.rendrePlanche({ nom: 'marche', type: 'clip', objet: lu.clips.marche, lu, gabarit: lu.gabarits.standard, vues: [0, 90], images: 4, sortie, navigateur });
  assert.equal(fin.personnages, 8);
});

test('planche : clip additif sur la pose de repos, dans le dossier d\'une vidéo', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const video = dossierTemporaire();
  fs.writeFileSync(path.join(video, 'deroule.json'), '{}');
  const r = await executer(['planche', 'respiration', '--images', '2', '--vues', '0', '--dossier', video]);
  assert.equal(r.code, 0, r.erreur);
  assert.ok(fs.existsSync(path.join(video, 'sortie', 'personnages', 'respiration.png')));
  const html = PL.pagePlanche({ nom: 'respiration', type: 'clip', objet: lu.clips.respiration, lu, gabarit: lu.gabarits.standard, vues: [0], images: 2 }).html;
  assert.match(html, /K\.ajouter\(\{\}, D\.objet/);
});
