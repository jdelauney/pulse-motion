'use strict';
/* Spec S2, 5.7 : vérité des chiffres et des termes (terme-cle, chiffre-invente, chiffre-sans-source, exemple-non-signale,
 * cause-affirmee). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controler } = require('../scripts/controler.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const de = (dir, regle) => controler({ dossier: dir, ecrire: false }).problemes.filter((p) => p.regle === regle);
const GLOSSAIRE = '# Glossaire\n\n| Terme | Sens | À éviter | Prononciation | Clé |\n|---|---|---|---|---|\n| HACCP | Méthode de maîtrise | | | oui |\n| chambre froide | Pièce réfrigérée | | | |\n';
const titre = '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2>';

test('controler-verite.test.js › terme-cle : dit sans être montré, montré sans être dit, absent', () => {
  const scenes = (texteA, voixA, texteB, voixB) => [
    { id: 'a', textes: { titre: texteA }, voix: { texte: voixA }, html: titre },
    { id: 'b', textes: { titre: texteB }, voix: { texte: voixB }, html: titre },
  ];
  // Dit en « a », écrit seulement en « b ».
  let p = de(miniProjet({ scenes: scenes('Le froid', 'La méthode HACCP protège.', 'La méthode HACCP', 'Merci.'), glossaire: GLOSSAIRE }), 'terme-cle');
  assert.equal(p.length, 1);
  assert.equal(p[0].scene, 'a');
  assert.match(p[0].message, /« HACCP » est dit dans la scène « a » mais n'y est pas écrit/);
  // Écrit, jamais dit (vidéo avec voix).
  p = de(miniProjet({ scenes: scenes('La méthode HACCP', 'Le froid protège.', 'Fin', 'Merci.'), glossaire: GLOSSAIRE }), 'terme-cle');
  assert.equal(p.length, 1);
  assert.match(p[0].message, /« HACCP » est écrit dans la scène « a » mais n'est jamais dit/);
  // Absent de toute la vidéo ; le terme non clé n'est jamais signalé.
  p = de(miniProjet({ scenes: scenes('Le froid', 'Le froid protège.', 'Fin', 'Merci.'), glossaire: GLOSSAIRE }), 'terme-cle');
  assert.equal(p.length, 1);
  assert.match(p[0].message, /« HACCP » n'apparaît nulle part dans la vidéo/);
  // Dit et écrit dans la même scène (sigle exact) : rien.
  assert.deepEqual(de(miniProjet({ scenes: scenes('La méthode HACCP', 'La méthode HACCP protège.', 'Fin', 'Merci.'), glossaire: GLOSSAIRE }), 'terme-cle'), []);
});

test('controler-verite.test.js › chiffre-invente : « quatre degrés » dit couvre le compteur 0→4 de chaine-du-froid', () => {
  const dir = miniProjet({ scenes: [{ id: 'x', html: '' }] });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(RACINE, 'exemples', 'chaine-du-froid'), dir, { recursive: true });
  assert.deepEqual(de(dir, 'chiffre-invente'), []);
  // Sans le texte dit, le 4 du compteur n'a plus d'appui.
  modifierDeroule(dir, (d) => { d.scenes[1].voix.texte = 'Au réfrigérateur, les produits frais restent au froid.'; d.scenes[1].intention = 'chiffre – la température'; });
  const p = de(dir, 'chiffre-invente');
  assert.equal(p.length, 1);
  assert.equal(p[0].scene, 'seuil');
  assert.match(p[0].message, /le nombre 4 s'affiche, mais il n'est ni dans les textes ni dans ce qui est dit/);
  // Écrit dans l'intention : rien.
  modifierDeroule(dir, (d) => { d.scenes[1].intention = 'chiffre – 4 °C au plus'; });
  assert.deepEqual(de(dir, 'chiffre-invente'), []);
});

const compteur = (n) => `${titre}<p data-tween="nombre 0→${n} cubic-out" data-start="1" data-dur="1">0</p><p data-texte="note" data-start="2"></p>`;

test('controler-verite.test.js › chiffre-sans-source et exemple-non-signale seulement avec des faits', () => {
  const scenes = [{ id: 'clients', intention: 'chiffre – 1250 clients', textes: { titre: 'Nos clients', note: 'en un an' }, html: compteur(1250) }];
  // Sans faits : aucune des deux règles.
  let dir = miniProjet({ scenes });
  assert.deepEqual([...de(dir, 'chiffre-sans-source'), ...de(dir, 'exemple-non-signale')], []);
  // Avec des faits, mais pas celui de ce chiffre.
  dir = miniProjet({ scenes, deroule: { faits: [{ chiffre: '12 %', scene: 'clients', source: 'Rapport 2025' }] } });
  const p = de(dir, 'chiffre-sans-source');
  assert.equal(p.length, 1);
  assert.match(p[0].message, /le chiffre « 1250 » n'a pas de source/);
  // Un exemple non signalé, puis signalé.
  dir = miniProjet({ scenes, deroule: { faits: [{ chiffre: '1 250', scene: 'clients', exemple: true }] } });
  assert.deepEqual(de(dir, 'chiffre-sans-source'), []);
  assert.equal(de(dir, 'exemple-non-signale').length, 1);
  dir = miniProjet({ scenes: [{ ...scenes[0], textes: { titre: 'Nos clients', note: 'Exemple' } }], deroule: { faits: [{ chiffre: '1 250', scene: 'clients', exemple: true }] } });
  assert.deepEqual(de(dir, 'exemple-non-signale'), []);
});

test('controler-verite.test.js › cause-affirmee : « grâce à » près d\'un nombre, info', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', textes: { titre: '30 % de pertes en moins grâce au froid' }, html: titre }] });
  const p = de(dir, 'cause-affirmee');
  assert.equal(p.length, 1);
  assert.equal(p[0].gravite, 'info');
  assert.match(p[0].message, /écrire « après »/);
  assert.deepEqual(de(miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Moins de pertes grâce au froid' }, html: titre }] }), 'cause-affirmee'), []);
  assert.ok(fs.existsSync(path.join(RACINE, 'exemples', 'chaine-du-froid')));
});
