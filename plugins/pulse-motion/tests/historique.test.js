'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { execFileSync } = require('node:child_process');
const { sauvegarder, annuler, listerSauvegardes, lireSauvegarde, CONSERVEES } = require('../scripts/historique.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const lire = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('sauvegarder puis annuler restaure déroulé, scènes et assets', () => {
  const dir = copierProjet('projet-simple');
  const avant = lire(dir, 'deroule.json');
  const sceneAvant = lire(dir, 'scenes/01-intro.html');
  assert.deepEqual(sauvegarder(dir).numero, '001');

  modifierDeroule(dir, (d) => { d.titre = 'Retouché'; });
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), '<section data-scene="intro">changé</section>');
  fs.writeFileSync(path.join(dir, 'assets', 'nouveau.svg'), '<svg/>');
  fs.rmSync(path.join(dir, 'assets', 'logo.svg'));

  assert.deepEqual(annuler(dir), { numero: '001' });
  assert.equal(lire(dir, 'deroule.json'), avant);
  assert.equal(lire(dir, 'scenes/01-intro.html'), sceneAvant);
  assert.ok(fs.existsSync(path.join(dir, 'assets', 'logo.svg')));
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'nouveau.svg')), false);
  assert.deepEqual(listerSauvegardes(dir), []);
});

test('annuler deux fois remonte deux retouches ; sans copie, message clair', () => {
  const dir = copierProjet('projet-simple');
  sauvegarder(dir);
  modifierDeroule(dir, (d) => { d.titre = 'Un'; });
  sauvegarder(dir);
  modifierDeroule(dir, (d) => { d.titre = 'Deux'; });
  annuler(dir);
  assert.equal(JSON.parse(lire(dir, 'deroule.json')).titre, 'Un');
  annuler(dir);
  assert.equal(JSON.parse(lire(dir, 'deroule.json')).titre, 'La chaîne du froid');
  assert.throws(() => annuler(dir), /Aucune retouche à annuler/);
});

test(`seules les ${CONSERVEES} dernières copies sont gardées, la numérotation continue`, () => {
  const dir = copierProjet('projet-simple');
  for (let i = 0; i < CONSERVEES + 3; i++) sauvegarder(dir);
  const restantes = listerSauvegardes(dir);
  assert.equal(restantes.length, CONSERVEES);
  assert.equal(restantes[0], '004');
  assert.equal(restantes[restantes.length - 1], '023');
});

test('ligne de commande : sans déroulé, code 1 et message en français', () => {
  const dir = dossierTemporaire('pm-vide-');
  let code = 0, erreur = '';
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'historique.js'), 'sauvegarder', dir], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) {
    code = e.status; erreur = e.stderr;
  }
  assert.equal(code, 1);
  assert.match(erreur, /Aucun déroulé à sauvegarder/);
});

test('« annule » après l\'ajout d\'une police ou d\'un terme : seul ce dernier ajout est défait', () => {
  const { annuler } = require('../scripts/historique.js');
  const { installerFichier } = require('../scripts/polices.js');
  const { noterGlossaire, lireGlossaire } = require('../scripts/vocabulaire.js');
  const { police } = require('./aide/polices.js');
  const dir = copierProjet('projet-simple');
  noterGlossaire({ dossier: dir, terme: 'HACCP', sens: 'Méthode' });
  noterGlossaire({ dossier: dir, terme: 'DLC', sens: 'Date limite' });
  annuler(dir);
  assert.deepEqual(lireGlossaire(dir).termes.map((t) => t.terme), ['HACCP']);
  const src = path.join(dir, 'Marque.woff2');
  fs.writeFileSync(src, police({ format: 'woff2' }));
  assert.equal(installerFichier({ fichier: src, dans: path.join(dir, 'charte', 'polices') }).ok, true);
  assert.ok(fs.existsSync(path.join(dir, 'charte', 'polices', 'Marque.woff2')));
  annuler(dir);
  assert.equal(fs.existsSync(path.join(dir, 'charte', 'polices', 'Marque.woff2')), false);
  assert.deepEqual(lireGlossaire(dir).termes.map((t) => t.terme), ['HACCP']);
});

test('historique-provisoires-exclues : voix provisoires hors des sauvegardes, et gardées par « annule »', () => {
  const dir = copierProjet('projet-simple');
  const prov = path.join(dir, 'assets', 'voix', 'provisoire');
  fs.mkdirSync(prov, { recursive: true });
  fs.writeFileSync(path.join(prov, 'intro.wav'), 'prise provisoire');
  fs.writeFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), 'vraie prise');
  const { fichier } = sauvegarder(dir);
  const manifeste = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  assert.equal(Object.keys(manifeste.fichiers).some((f) => f.startsWith('assets/voix/provisoire')), false);
  assert.equal(manifeste.dossiers.includes('assets/voix/provisoire'), false);
  assert.ok(manifeste.fichiers['assets/voix/intro.wav']);
  fs.writeFileSync(path.join(prov, 'intro.wav'), 'nouvelle prise provisoire');
  annuler(dir);
  assert.equal(fs.readFileSync(path.join(prov, 'intro.wav'), 'utf8'), 'nouvelle prise provisoire');
  assert.equal(fs.readFileSync(path.join(dir, 'assets', 'voix', 'intro.wav'), 'utf8'), 'vraie prise');
});

// --- Stockage par contenu (spec Rapidité 5.12) ---

const crypto = require('node:crypto');
const sha = (octets) => crypto.createHash('sha256').update(octets).digest('hex');
const objets = (dir) => {
  const d = path.join(dir, '.historique', 'objets');
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};
/** Contenu sauvegardé (deroule, scènes, assets…) : chemin -> empreinte, voix provisoires exclues. */
function etatProjet(dir) {
  const r = {};
  const visiter = (rel) => {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs) || rel === path.join('assets', 'voix', 'provisoire')) return;
    if (fs.statSync(abs).isDirectory()) { for (const n of fs.readdirSync(abs).sort()) visiter(path.join(rel, n)); return; }
    r[rel.split(path.sep).join('/')] = sha(fs.readFileSync(abs));
  };
  ['deroule.json', 'scenes', 'assets', 'charte', 'effets', 'personnages'].forEach(visiter);
  return r;
}

test('historique-objets-par-contenu : un manifeste par sauvegarde, chaque contenu écrit une seule fois', () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'copie.svg'), fs.readFileSync(path.join(dir, 'assets', 'logo.svg')));
  const r = sauvegarder(dir);
  assert.equal(r.numero, '001');
  assert.equal(r.fichier, path.join(dir, '.historique', '001.json'));
  const manifeste = JSON.parse(fs.readFileSync(r.fichier, 'utf8'));
  assert.equal(manifeste.version, 1);
  assert.equal(manifeste.fichiers['assets/logo.svg'].empreinte, sha(fs.readFileSync(path.join(dir, 'assets', 'logo.svg'))));
  assert.equal(manifeste.fichiers['assets/copie.svg'].empreinte, manifeste.fichiers['assets/logo.svg'].empreinte);
  for (const nom of objets(dir)) assert.match(nom, /^[0-9a-f]{64}$/);
  // Deux fichiers identiques : un seul objet.
  assert.equal(objets(dir).length, Object.keys(manifeste.fichiers).length - 1);
  const avant = objets(dir);
  modifierDeroule(dir, (d) => { d.titre = 'Seul le déroulé change'; });
  sauvegarder(dir);
  assert.equal(objets(dir).length, avant.length + 1, 'seul le nouveau déroulé est écrit');
  assert.deepEqual(listerSauvegardes(dir), ['001', '002']);
  assert.equal(fs.existsSync(path.join(dir, '.historique', '001')), false, 'plus de copie complète');
});

test('historique-annuler-octet-pour-octet : fichiers binaires, ajoutés, retirés et modifiés remis à l\'identique', () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets', 'sons'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'sons', 'bip.wav'), crypto.randomBytes(200000));
  fs.mkdirSync(path.join(dir, 'effets'));
  const avant = etatProjet(dir);
  sauvegarder(dir);
  fs.writeFileSync(path.join(dir, 'assets', 'sons', 'bip.wav'), crypto.randomBytes(200000));
  fs.rmSync(path.join(dir, 'assets', 'photo.svg'));
  fs.mkdirSync(path.join(dir, 'assets', 'nouveau'));
  fs.writeFileSync(path.join(dir, 'assets', 'nouveau', 'image.svg'), '<svg/>');
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), '<section data-scene="intro">changé</section>');
  fs.mkdirSync(path.join(dir, 'personnages'));
  fs.writeFileSync(path.join(dir, 'personnages', 'x.json'), '{}');
  annuler(dir);
  assert.deepEqual(etatProjet(dir), avant);
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'nouveau')), false, 'dossier apparu depuis : retiré');
  assert.equal(fs.existsSync(path.join(dir, 'personnages')), false);
  assert.ok(fs.statSync(path.join(dir, 'effets')).isDirectory(), 'dossier vide gardé');
  assert.deepEqual(listerSauvegardes(dir), []);
  assert.deepEqual(objets(dir), [], 'plus aucun objet cité');
});

test('historique-ancien-format-restaurable : une copie .historique/NNN/ d\'avant 0.30.0 se restaure, la numérotation continue', () => {
  const dir = copierProjet('projet-simple');
  const ancien = etatProjet(dir);
  const copie = path.join(dir, '.historique', '004');
  for (const nom of ['deroule.json', 'scenes', 'assets']) fs.cpSync(path.join(dir, nom), path.join(copie, nom), { recursive: true });
  modifierDeroule(dir, (d) => { d.titre = 'Après la copie'; });
  fs.writeFileSync(path.join(dir, 'assets', 'ajout.svg'), '<svg/>');
  const apres = etatProjet(dir);
  assert.equal(sauvegarder(dir).numero, '005');
  assert.equal(lireSauvegarde(dir, '004', 'deroule.json').toString('utf8'), fs.readFileSync(path.join(copie, 'deroule.json'), 'utf8'));
  modifierDeroule(dir, (d) => { d.titre = 'Encore après'; });
  assert.deepEqual(annuler(dir), { numero: '005' });
  assert.deepEqual(etatProjet(dir), apres);
  assert.deepEqual(annuler(dir), { numero: '004' });
  assert.deepEqual(etatProjet(dir), ancien);
  assert.throws(() => annuler(dir), /Aucune retouche à annuler/);
});

test('historique-objets-orphelins-supprimes : à l\'annulation et au-delà des 20 sauvegardes', () => {
  const dir = copierProjet('projet-simple');
  sauvegarder(dir);
  const premiers = objets(dir);
  fs.writeFileSync(path.join(dir, 'assets', 'photo.svg'), '<svg>v2</svg>');
  sauvegarder(dir);
  const objetV2 = sha(Buffer.from('<svg>v2</svg>'));
  assert.ok(objets(dir).includes(objetV2));
  annuler(dir);
  assert.equal(objets(dir).includes(objetV2), false, 'cité seulement par la sauvegarde annulée');
  assert.deepEqual(objets(dir), premiers);
  // Le premier déroulé n'est cité que par la première sauvegarde : il part avec elle.
  const premierDeroule = sha(fs.readFileSync(path.join(dir, 'deroule.json')));
  for (let i = 0; i < CONSERVEES; i++) { modifierDeroule(dir, (d) => { d.titre = `Version ${i}`; }); sauvegarder(dir); }
  assert.equal(listerSauvegardes(dir).length, CONSERVEES);
  assert.equal(objets(dir).includes(premierDeroule), false);
  fs.writeFileSync(path.join(dir, '.historique', 'objets', '.reste.part'), 'écriture interrompue');
  sauvegarder(dir);
  assert.equal(fs.existsSync(path.join(dir, '.historique', 'objets', '.reste.part')), false);
});

test('historique-jamais-de-lien-dur : une prise réenregistrée sous le même nom ne change pas l\'historique', () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets', 'voix'), { recursive: true });
  const prise = path.join(dir, 'assets', 'voix', 'intro.wav');
  fs.writeFileSync(prise, 'première prise');
  sauvegarder(dir);
  for (const nom of objets(dir)) assert.equal(fs.statSync(path.join(dir, '.historique', 'objets', nom)).nlink, 1, nom);
  assert.equal(fs.statSync(prise).nlink, 1);
  fs.writeFileSync(prise, 'seconde prise');
  assert.equal(lireSauvegarde(dir, '001', 'assets/voix/intro.wav').toString('utf8'), 'première prise');
  annuler(dir);
  assert.equal(fs.readFileSync(prise, 'utf8'), 'première prise');
});

test('historique : un fichier inchangé (taille et date) n\'est pas relu ; un fichier changé à la même taille l\'est', () => {
  const dir = copierProjet('projet-simple');
  const photo = path.join(dir, 'assets', 'photo.svg');
  sauvegarder(dir);
  const st = fs.statSync(photo);
  fs.writeFileSync(photo, Buffer.alloc(st.size, 0x20));
  fs.utimesSync(photo, st.atime, new Date(st.mtimeMs + 5000));
  sauvegarder(dir);
  assert.equal(lireSauvegarde(dir, '002', 'assets/photo.svg').toString('utf8'), ' '.repeat(st.size));
});
