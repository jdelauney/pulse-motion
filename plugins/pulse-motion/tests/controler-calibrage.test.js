'use strict';
/* Spec S2, 5.7 à 5.11 : les règles nouvelles ne se déclenchent pas sur ce que Pulse Motion livre (« La chaîne du froid »,
 * scènes toutes faites des styles livrés remplies de leurs textes d'exemple, à leur durée conseillée). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controler, controlerComplet } = require('../scripts/controler.js');
const { projetEssai } = require('../scripts/lib/projet-essai.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const STYLES = ['chaleureux', 'clair-pedagogique', 'editorial', 'energique', 'minimal', 'tech-sombre'];
const NOUVELLES = new Set(['rien-de-nouveau', 'comparaison-courte', 'camera-repetee', 'terme-cle', 'chiffre-invente', 'chiffre-sans-source',
  'exemple-non-signale', 'cause-affirmee', 'glyphe-absent', 'emoji', 'image-repetee', 'script-interdit', 'texte-casse', 'texte-epingle',
  'accroche', 'image-zero', 'image-agrandie', 'texte-petit-lecteur', 'sujet-petit', 'transition-vide', 'sous-titre-cache-sujet',
  'erreur-de-scene', 'image-figee', 'image-vide', 'voix-couverte', 'silence-imprevu']);
const nouvelles = (problemes) => problemes.filter((p) => NOUVELLES.has(p.regle) || (p.regle === 'marge' && /^Scène « [^»]+ » : « /.test(p.message)));
const navigateur = trouverNavigateur();

test('controler-calibrage.test.js › aucune des règles de 5.7 à 5.11 ne se déclenche sur chaine-du-froid ni sur les 48 scènes toutes faites remplies de leurs textes d\'exemple', async (t) => {
  const froid = dossierTemporaire('pm-calibrage-');
  fs.cpSync(path.join(RACINE, 'exemples', 'chaine-du-froid'), froid, { recursive: true });
  const projets = [froid, ...STYLES.map((s) => projetEssai({ dossierStyle: path.join(RACINE, 'styles', s), textes: 'exemple' }))];
  assert.equal(projets.length - 1, STYLES.length);
  const scenes = projets.slice(1).reduce((n, d) => n + JSON.parse(fs.readFileSync(path.join(d, 'deroule.json'), 'utf8')).scenes.length, 0);
  assert.equal(scenes, 48);
  const nom = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8')).style;
  const vus = projets.flatMap((dir) => nouvelles(controler({ dossier: dir, ecrire: false }).problemes).map((p) => `${nom(dir)} : ${p.message}`));
  assert.deepEqual(vus, []);
  if (!navigateur) { t.skip('Chrome ou Edge introuvable : règles de la vidéo rendue non calibrées'); return; }
  const rendus = [];
  for (const dir of projets) {
    const r = await controlerComplet({ dossier: dir, corriger: false });
    assert.equal(r.renduVerifie, true, dir);
    rendus.push(...nouvelles(r.problemes).map((p) => `${nom(dir)} : ${p.message}`));
  }
  assert.deepEqual(rendus, []);
});
