'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { execFileSync } = require('node:child_process');
const { sauvegarder, annuler, listerSauvegardes, lireSauvegarde, CONSERVEES } = require('../scripts/historique.js');
const { copierProjet, modifierDeroule, FIXTURES } = require('./aide/projet.js');

const FIXTURE = path.join(FIXTURES, 'projet-simple');

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
  // L'état d'avant l'annulation est gardé pour « rétablis » (spec Retouches et ergonomie, 5.9) : seuls ses objets restent.
  const { retablir: aRetablir } = JSON.parse(fs.readFileSync(path.join(dir, '.historique', 'journal.json'), 'utf8'));
  assert.equal(aRetablir.length, 1);
  const cites = Object.values(JSON.parse(fs.readFileSync(path.join(dir, '.historique', `${aRetablir[0].numero}.json`), 'utf8')).fichiers).map((f) => f.empreinte);
  assert.deepEqual(objets(dir), [...new Set(cites)].sort(), 'seuls les objets de la version à rétablir');
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
  // L'état annulé (photo v2) est gardé pour « rétablis » ; une nouvelle sauvegarde vide cette pile, et l'objet part.
  assert.ok(objets(dir).includes(objetV2), 'gardé pour « rétablis »');
  fs.writeFileSync(path.join(dir, 'assets', 'photo.svg'), fs.readFileSync(path.join(FIXTURE, 'assets', 'photo.svg')));
  sauvegarder(dir);
  assert.equal(objets(dir).includes(objetV2), false, 'cité seulement par la sauvegarde annulée et la version à rétablir');
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

// --- Rétablir, versions nommées, liste, versions reconstituées (spec Retouches et ergonomie, 5.9) ---

const H = require('../scripts/historique.js');
const titre = (dir) => JSON.parse(lire(dir, 'deroule.json')).titre;
const journal = (dir) => JSON.parse(lire(dir, '.historique/journal.json'));

test('historique : annuler puis rétablir rend l\'état d\'avant l\'annulation', () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir, { phrase: 'change le titre' });
  modifierDeroule(dir, (d) => { d.titre = 'Retouché'; });
  fs.writeFileSync(path.join(dir, 'assets', 'ajout.svg'), '<svg>ajout</svg>');
  const avant = etatProjet(dir);
  assert.deepEqual(H.annuler(dir), { numero: '001', phrase: 'change le titre' });
  assert.equal(titre(dir), 'La chaîne du froid');
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'ajout.svg')), false);
  assert.equal(journal(dir).retablir.length, 1);
  assert.deepEqual(H.retablir(dir), { numero: '002', phrase: 'change le titre' });
  assert.deepEqual(etatProjet(dir), avant, 'octet pour octet');
  assert.equal(journal(dir).retablir.length, 0);
  // Le retour est lui-même annulable : « annule » redéfait la retouche rétablie.
  assert.equal(H.annuler(dir).phrase, 'change le titre');
  assert.equal(titre(dir), 'La chaîne du froid');
  assert.throws(() => H.annuler(dir), /Aucune retouche à annuler/);
  H.retablir(dir);
  assert.throws(() => H.retablir(dir), /Rien à rétablir/);
  assert.equal(titre(dir), 'Retouché');
});

test('historique : une nouvelle sauvegarde vide la pile à rétablir', () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir, { phrase: 'un' });
  modifierDeroule(dir, (d) => { d.titre = 'Un'; });
  H.sauvegarder(dir, { phrase: 'deux' });
  modifierDeroule(dir, (d) => { d.titre = 'Deux'; });
  H.annuler(dir);
  H.annuler(dir);
  assert.equal(journal(dir).retablir.length, 2);
  H.sauvegarder(dir, { phrase: 'trois' });
  assert.deepEqual(journal(dir).retablir, []);
  assert.throws(() => H.retablir(dir), /Rien à rétablir/);
  // Les états mis de côté sont retirés du disque (pas de fichier orphelin).
  const manifestes = fs.readdirSync(path.join(dir, '.historique')).filter((f) => /^\d{3,}\.json$/.test(f)).map((f) => f.slice(0, -5));
  assert.deepEqual(manifestes, journal(dir).entrees.map((e) => e.numero));
});

test('historique : version nommée gardée au-delà de 20 sauvegardes', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.titre = 'Envoyée'; });
  assert.deepEqual(H.nommer(dir, 'envoyée au client'), { numero: '001', nom: 'envoyée au client' });
  for (let i = 0; i < H.CONSERVEES + 5; i++) { H.sauvegarder(dir, { phrase: `retouche ${i}` }); modifierDeroule(dir, (d) => { d.titre = `Version ${i}`; }); }
  assert.equal(H.listerSauvegardes(dir).length, H.CONSERVEES, 'la rotation ne compte pas la version nommée');
  const l = H.liste(dir);
  assert.equal(l.nommees, 1);
  assert.ok(l.versions.some((v) => v.nom === 'envoyée au client' && v.garde));
  assert.throws(() => H.nommer(dir, 'Envoyée au client'), /s'appelle déjà/);
  assert.throws(() => H.nommer(dir, '  '), /Il faut un nom/);
  // 20 versions nommées au plus, avec un message clair ; « oublier » en libère une.
  for (let i = 1; i < H.NOMMEES_MAX; i++) H.nommer(dir, `essai ${i}`);
  assert.throws(() => H.nommer(dir, 'de trop'), /déjà 20 versions nommées[^]*dites laquelle oublier/);
  assert.equal(H.oublier(dir, 'essai 3').nom, 'essai 3');
  assert.equal(H.nommer(dir, 'de trop').nom, 'de trop');
});

test('historique : revenir à une version nommée est lui-même annulable', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.titre = 'Envoyée'; });
  H.nommer(dir, 'envoyée au client');
  H.sauvegarder(dir, { phrase: 'change le titre' });
  modifierDeroule(dir, (d) => { d.titre = 'Après envoi'; });
  const r = H.revenir(dir, 'Envoyée au client');
  assert.equal(r.nom, 'envoyée au client');
  assert.equal(titre(dir), 'Envoyée');
  assert.equal(H.liste(dir).versions[0].phrase, 'revenir à « envoyée au client »');
  assert.equal(H.annuler(dir).phrase, 'revenir à « envoyée au client »');
  assert.equal(titre(dir), 'Après envoi');
  // Par son numéro aussi ; une version inconnue est dite avec les noms existants.
  H.revenir(dir, '1');
  assert.equal(titre(dir), 'Envoyée');
  assert.throws(() => H.revenir(dir, 'brouillon'), /Aucune version « brouillon » ; versions nommées : « envoyée au client »/);
});

test('historique : liste avec la phrase de chaque retouche', () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir, { phrase: 'ralentis la scène 3' });
  H.sauvegarder(dir, { phrase: '  change le titre ' });
  H.sauvegarder(dir);
  const l = H.liste(dir);
  assert.deepEqual(l.versions.map((v) => [v.numero, v.phrase, v.nom, v.garde]), [['003', null, null, false], ['002', 'change le titre', null, false], ['001', 'ralentis la scène 3', null, false]]);
  for (const v of l.versions) assert.ok(!Number.isNaN(Date.parse(v.date)));
  // Ligne de commande : --phrase et liste.
  const cli = (...a) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'historique.js'), ...a], { encoding: 'utf8' }));
  assert.equal(cli('sauvegarder', dir, '--phrase', 'baisse la musique').numero, '004');
  assert.equal(cli('liste', dir).versions[0].phrase, 'baisse la musique');
  assert.equal(cli('nommer', 'version du lundi', dir).nom, 'version du lundi');
  assert.deepEqual(H.lireArguments(['revenir', 'version du lundi', '.']), { action: 'revenir', valeur: 'version du lundi', dossier: '.', phrase: null });
  // Un projet d'avant le journal : ses sauvegardes deviennent des entrées sans phrase.
  fs.rmSync(path.join(dir, '.historique', 'journal.json'));
  assert.deepEqual(H.listerSauvegardes(dir), ['001', '002', '003', '004', '005']);
});

test('historique : materialiser reconstitue une version dans un dossier temporaire', () => {
  const dir = copierProjet('projet-simple');
  const prov = path.join(dir, 'assets', 'voix', 'provisoire');
  fs.mkdirSync(prov, { recursive: true });
  fs.writeFileSync(path.join(prov, 'intro.wav'), 'prise provisoire');
  const avant = etatProjet(dir);
  H.sauvegarder(dir, { phrase: 'change le titre' });
  modifierDeroule(dir, (d) => { d.titre = 'Après'; });
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), '<section data-scene="intro">après</section>');
  const apres = etatProjet(dir);
  const cible = path.join(dossierTemporaire('pm-version-'), 'v');
  const m = H.materialiser(dir, 'precedente', cible);
  assert.equal(m.numero, '001');
  assert.match(m.empreinte, /^[0-9a-f]{64}$/);
  assert.deepEqual(etatProjet(cible), avant);
  assert.equal(fs.readFileSync(path.join(cible, 'assets', 'voix', 'provisoire', 'intro.wav'), 'utf8'), 'prise provisoire', 'voix provisoires du projet');
  assert.deepEqual(etatProjet(dir), apres, 'le projet n\'a pas changé');
  assert.equal(H.identifier(dir, '1').empreinte, m.empreinte);
  // Jamais dans le projet lui-même ; une version inconnue est refusée.
  assert.throws(() => H.materialiser(dir, '1', path.join(dir, 'sortie', 'v')), /dossier à part/);
  assert.throws(() => H.materialiser(dir, '42', cible), /Aucune version « 42 »/);
});

test('historique : une écriture ratée défaite en interne ne laisse rien à rétablir', () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir);
  modifierDeroule(dir, (d) => { d.titre = 'Écriture ratée'; });
  H.defaire(dir);
  assert.equal(titre(dir), 'La chaîne du froid');
  assert.deepEqual(journal(dir).retablir, []);
  assert.deepEqual(H.listerSauvegardes(dir), []);
});

test('plugin : retoucher couvre rétablir, nommer, revenir et lister', () => {
  const r = fs.readFileSync(path.join(__dirname, '..', 'skills', 'retoucher', 'SKILL.md'), 'utf8');
  const section = r.slice(r.indexOf('## 2. Historique'), r.indexOf('## 3.'));
  for (const motif of [/« rétablis », « finalement remets-le » : `pulse-motion historique retablir \.`/, /« garde cette version sous le nom « envoyée au client » » : `pulse-motion historique nommer "<nom>" \.`/,
    /« reviens à la version envoyée au client » : `pulse-motion historique revenir <nom ou numéro> \.`/, /« quelles versions ai-je \? » : `pulse-motion historique liste \.`, dite en mots simples \(date, retouche, nom\)/]) {
    assert.match(section, motif);
  }
  assert.match(r, /`pulse-motion historique sauvegarder \. --phrase "<la demande>"` \*\*avant\*\* tout changement/);
});
