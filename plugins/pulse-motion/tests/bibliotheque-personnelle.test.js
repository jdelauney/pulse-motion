'use strict';
/* Bibliothèque personnelle (spec Améliorations du rapport, chantier H ; décision « par copie », § 6 bis) : effets et
 * personnages gardés, copiés dans une vidéo, archive ZIP emportée sur un autre ordinateur. Jamais le vrai dossier de la
 * personne : PULSE_MOTION_DOSSIER pointe sur un dossier temporaire, changé test par test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { miniProjet } = require('./aide/mini-projet.js');
const Z = require('../scripts/lib/zip.js');
const B = require('../scripts/lib/bibliotheque.js');
const P = require('../scripts/lib/personnages.js');

const RACINE = path.join(__dirname, '..');
const PM = path.join(RACINE, 'scripts', 'pm.js');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const EFFETS_PLUGIN = path.join(RACINE, 'effets');
const effetLivre = () => fs.readdirSync(EFFETS_PLUGIN).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()[0];

/** Dossier personnel neuf, posé dans PULSE_MOTION_DOSSIER pour ce test. */
function personnelNeuf() {
  const d = dossierTemporaire('pm-perso-');
  process.env.PULSE_MOTION_DOSSIER = d;
  return d;
}

function ecrire(dossier, relatif, contenu) {
  const f = path.join(dossier, ...relatif.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 2), Buffer.isBuffer(contenu) ? undefined : 'utf8');
  return f;
}

const video = () => miniProjet({ scenes: [{ id: 'titre', html: '<h1 id="t">Bonjour</h1>' }] });

/** Une vidéo dont l'effet « ma-neige » étend « ma-base » (de la vidéo), qui étend la neige livrée, avec une image et un shader. */
function videoAvecEffet() {
  const v = video();
  ecrire(v, 'effets/ma-neige.json', { version: 1, nom: 'ma-neige', description: 'Neige de la vidéo', etend: 'ma-base' });
  ecrire(v, 'effets/ma-base.json', { version: 1, nom: 'ma-base', etend: 'neige', emetteurs: [{ nom: 'flocons', rendu: { texture: 'assets/flocon.png' }, modules: { force: 'mon-vent' } }] });
  ecrire(v, 'assets/flocon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  ecrire(v, 'shaders/mon-vent.json', { nom: 'mon-vent' });
  ecrire(v, 'shaders/mon-vent.wgsl', '// vent\n');
  return v;
}

/** Une vidéo avec un dessin (gabarit de la vidéo) et un mouvement (pose de la vidéo). */
function videoAvecPersonnages() {
  const v = video();
  const gabarit = JSON.parse(lire('personnages', 'gabarits', 'standard.json'));
  ecrire(v, 'personnages/gabarits/mon-gabarit.json', Object.assign(gabarit, { nom: 'mon-gabarit' }));
  const dessin = JSON.parse(lire('personnages', 'dessins', 'touffu.json'));
  ecrire(v, 'personnages/dessins/mon-perso.json', Object.assign(dessin, { nom: 'mon-perso', gabarit: 'mon-gabarit' }));
  ecrire(v, 'personnages/poses/ma-pose.json', { nom: 'ma-pose', angles: {} });
  ecrire(v, 'personnages/clips/mon-geste.json', { nom: 'mon-geste', boucle: false, cles: [{ t: 0, pose: 'ma-pose' }, { t: 0.5, pose: 'debout' }] });
  const lu = P.lire(v);
  assert.deepEqual(lu.erreurs.map((e) => e.message), [], 'personnages de la vidéo valides');
  return v;
}

/* ------------------------------------------------------------------ ZIP */

test('zip : écrit puis relu à l\'identique (Deflate et stocké, noms accentués)', () => {
  const grand = Buffer.from('ab'.repeat(5000), 'utf8');
  const hasard = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 97 + 13) % 256));
  const entrees = [{ nom: 'chartes/dupont/charte.json', donnees: '{"ton":"clair"}' }, { nom: 'grand.txt', donnees: grand }, { nom: 'effets/été/neige.png', donnees: hasard }];
  const octets = Z.ecrireZip(entrees);
  assert.equal(octets.readUInt32LE(0), 0x04034b50);
  const relu = Z.lireZip(octets);
  assert.deepEqual(relu.map((e) => e.nom), entrees.map((e) => e.nom));
  relu.forEach((e, i) => assert.ok(e.donnees.equals(Buffer.isBuffer(entrees[i].donnees) ? entrees[i].donnees : Buffer.from(entrees[i].donnees)), e.nom));
  assert.ok(octets.length < grand.length / 4, 'Deflate gagne sur un texte répétitif');
});

test('zip : archive abîmée, chiffrée, trop grosse ou trop nombreuse refusée', () => {
  const octets = Z.ecrireZip([{ nom: 'a.txt', donnees: 'bonjour bonjour bonjour bonjour' }]);
  const abime = Buffer.from(octets);
  abime[40] ^= 0xff; // dans les données comprimées
  assert.throws(() => Z.lireZip(abime), (e) => e.zip);
  const chiffre = Buffer.from(octets);
  const central = chiffre.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  chiffre.writeUInt16LE(chiffre.readUInt16LE(central + 8) | 1, central + 8);
  assert.throws(() => Z.lireZip(chiffre), /chiffré/);
  assert.throws(() => Z.lireZip(Z.ecrireZip([{ nom: 'gros', donnees: Buffer.alloc(5000) }]), { maxOctets: 1000 }), /trop grosse/);
  assert.throws(() => Z.lireZip(Z.ecrireZip([{ nom: 'a', donnees: 'x' }, { nom: 'b', donnees: 'y' }]), { maxEntrees: 1 }), /trop grosse/);
  assert.throws(() => Z.lireZip(Buffer.from('pas une archive du tout, vraiment pas')), /pas une archive/);
  // Bombe : un contenu plus gros qu'annoncé n'est jamais décompressé en entier.
  const bombe = Z.ecrireZip([{ nom: 'b', donnees: Buffer.alloc(100000) }]);
  const c = bombe.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bombe.writeUInt32LE(10, c + 24);
  assert.throws(() => Z.lireZip(bombe), (e) => e.zip);
});

test('zip : chemins sûrs seulement (ni remontée, ni chemin absolu, ni lecteur, ni barre inverse)', () => {
  for (const ok of ['chartes/dupont/charte.json', 'effets/neige/assets/flocon.png']) assert.ok(Z.cheminSur(ok), ok);
  for (const ko of ['../evil.txt', 'chartes/../../x', '/etc/passwd', 'C:/Windows/x', 'C:x', 'a\\b', 'a//b', './a', '']) assert.equal(Z.cheminSur(ko), false, ko);
});

test('bibliotheque : ZIP relu par un lecteur indépendant', (t) => {
  const dir = dossierTemporaire('pm-zip-');
  const fichier = path.join(dir, 'essai.zip');
  fs.writeFileSync(fichier, Z.ecrireZip([{ nom: 'dossier/é.txt', donnees: 'café\n' }, { nom: 'b.bin', donnees: Buffer.from([0, 1, 2, 255]) }]));
  const sortie = path.join(dir, 'sortie');
  let r;
  if (process.platform === 'win32') {
    r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${fichier}' -DestinationPath '${sortie}'`], { encoding: 'utf8', timeout: 60000 });
  } else {
    r = spawnSync('unzip', ['-q', fichier, '-d', sortie], { encoding: 'utf8', timeout: 60000 });
  }
  if (r.error) { t.skip(`aucun lecteur de ZIP sur cet ordinateur (${r.error.code})`); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(sortie, 'dossier', 'é.txt'), 'utf8'), 'café\n');
  assert.ok(fs.readFileSync(path.join(sortie, 'b.bin')).equals(Buffer.from([0, 1, 2, 255])));
});

/* ------------------------------------------------------------------ effets */

test('bibliotheque : effet enregistré avec ses bases, son image et son shader ; listé « personnel »', () => {
  const perso = personnelNeuf();
  const v = videoAvecEffet();
  const r = B.enregistrerEffet({ nom: 'ma-neige', projet: v });
  assert.equal(r.ok, true, r.message);
  const d = path.join(perso, 'effets', 'ma-neige');
  for (const f of ['effets/ma-neige.json', 'effets/ma-base.json', 'assets/flocon.png', 'shaders/mon-vent.json', 'shaders/mon-vent.wgsl']) assert.ok(fs.existsSync(path.join(d, f)), f);
  assert.ok(!fs.existsSync(path.join(d, 'effets', 'neige.json')), 'la base livrée ne se copie pas');
  const liste = B.listerEffets({ projet: video() });
  assert.equal(liste.find((e) => e.nom === 'ma-neige').source, 'personnel');
  assert.equal(liste.find((e) => e.nom === 'ma-neige').description, 'Neige de la vidéo');
  assert.equal(liste.find((e) => e.nom === effetLivre()).source, 'plugin');
  assert.equal(B.listerEffets({ projet: v }).find((e) => e.nom === 'ma-neige').source, 'video', 'la vidéo passe avant la bibliothèque');
  // Même contenu : rien à faire.
  assert.equal(B.enregistrerEffet({ nom: 'ma-neige', projet: v }).deja, true);
});

test('bibliotheque : un nom déjà pris est signalé et jamais écrasé sans accord', () => {
  const perso = personnelNeuf();
  const v = videoAvecEffet();
  assert.equal(B.enregistrerEffet({ nom: 'ma-neige', projet: v }).ok, true);
  const avant = fs.readFileSync(path.join(perso, 'effets', 'ma-neige', 'effets', 'ma-neige.json'), 'utf8');
  ecrire(v, 'effets/ma-neige.json', { version: 1, nom: 'ma-neige', description: 'Autre neige', etend: 'ma-base' });
  const pris = B.enregistrerEffet({ nom: 'ma-neige', projet: v });
  assert.equal(pris.ok, false);
  assert.equal(pris.raison, 'pris');
  assert.equal(fs.readFileSync(path.join(perso, 'effets', 'ma-neige', 'effets', 'ma-neige.json'), 'utf8'), avant, 'rien n\'a changé');
  const remplace = B.enregistrerEffet({ nom: 'ma-neige', projet: v, remplacer: true });
  assert.equal(remplace.remplace, true);
  assert.match(fs.readFileSync(path.join(perso, 'effets', 'ma-neige', 'effets', 'ma-neige.json'), 'utf8'), /Autre neige/);
  // Personnages : même règle.
  const vp = videoAvecPersonnages();
  assert.equal(B.enregistrerPersonnage({ nom: 'ma-pose', projet: vp }).ok, true);
  ecrire(vp, 'personnages/poses/ma-pose.json', { nom: 'ma-pose', description: 'autre', angles: {} });
  const p2 = B.enregistrerPersonnage({ nom: 'ma-pose', projet: vp });
  assert.equal(p2.raison, 'pris');
  assert.doesNotMatch(fs.readFileSync(path.join(perso, 'personnages', 'poses', 'ma-pose.json'), 'utf8'), /autre/);
});

test('bibliotheque : nom d\'un effet livré refusé à l\'enregistrement, gardé sous un autre nom (--sous)', () => {
  const perso = personnelNeuf();
  const v = video();
  const livre = effetLivre();
  ecrire(v, `effets/${livre}.json`, Object.assign(JSON.parse(lire('effets', `${livre}.json`)), { description: 'Ma version' }));
  const r = B.enregistrerEffet({ nom: livre, projet: v });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'nom-livre');
  assert.ok(!fs.existsSync(path.join(perso, 'effets', livre)));
  const s = B.enregistrerEffet({ nom: livre, projet: v, sous: `${livre}-perso` });
  assert.equal(s.ok, true, s.message);
  const ecrit = JSON.parse(fs.readFileSync(path.join(perso, 'effets', `${livre}-perso`, 'effets', `${livre}-perso.json`), 'utf8'));
  assert.equal(ecrit.nom, `${livre}-perso`);
  assert.equal(ecrit.description, 'Ma version');
  for (const mot of B.RESERVES) assert.equal(B.enregistrerEffet({ nom: livre, projet: v, sous: mot }).ok, false, mot);
});

test('bibliotheque : effet utilisé = copié dans la vidéo, avec une sauvegarde d\'historique ; conflit sans accord : rien d\'écrit', () => {
  personnelNeuf();
  assert.equal(B.enregistrerEffet({ nom: 'ma-neige', projet: videoAvecEffet() }).ok, true);
  const autre = video();
  const r = B.utiliserEffet({ nom: 'ma-neige', projet: autre });
  assert.equal(r.ok, true, r.message);
  for (const f of ['effets/ma-neige.json', 'effets/ma-base.json', 'assets/flocon.png', 'shaders/mon-vent.wgsl']) assert.ok(fs.existsSync(path.join(autre, f)), f);
  assert.ok(fs.existsSync(path.join(autre, '.historique', 'journal.json')), 'sauvegarde avant la copie');
  assert.equal(B.utiliserEffet({ nom: 'ma-neige', projet: autre }).copies.length, 0, 'déjà là : rien à copier');
  ecrire(autre, 'assets/flocon.png', 'autre image');
  const c = B.utiliserEffet({ nom: 'ma-neige', projet: autre });
  assert.equal(c.ok, false);
  assert.deepEqual(c.conflits, ['assets/flocon.png']);
  assert.equal(fs.readFileSync(path.join(autre, 'assets', 'flocon.png'), 'utf8'), 'autre image');
  assert.equal(B.utiliserEffet({ nom: 'ma-neige', projet: autre, remplacer: true }).ok, true);
  assert.notEqual(fs.readFileSync(path.join(autre, 'assets', 'flocon.png'), 'utf8'), 'autre image');
  assert.equal(B.utiliserEffet({ nom: 'ma-neige', projet: dossierTemporaire('pm-vide-') }).ok, false, 'hors d\'une vidéo');
  assert.equal(B.utiliserEffet({ nom: effetLivre(), projet: autre }).raison, 'livre');
});

test('bibliotheque : l\'assemblage ne lit jamais la bibliothèque (par copie)', () => {
  personnelNeuf();
  const source = video();
  ecrire(source, 'effets/neige-perso.json', { version: 1, nom: 'neige-perso', description: 'Neige', etend: 'neige' });
  assert.equal(B.enregistrerEffet({ nom: 'neige-perso', projet: source }).ok, true);
  const v = video();
  const { preparerEffets } = require('../scripts/lib/effets.js');
  const html = '<section data-scene="s"><div data-effet="neige-perso" data-dur="2"></div></section>';
  const avant = preparerEffets(html, { scene: 's', projet: v, bibliotheque: EFFETS_PLUGIN });
  assert.equal(avant.erreurs[0].regle, 'effet-inconnu');
  assert.match(avant.erreurs[0].message, /bibliothèque personnelle : le copier d'abord dans la vidéo \(pulse-motion effet utiliser neige-perso \.\)/);
  assert.equal(B.utiliserEffet({ nom: 'neige-perso', projet: v }).ok, true);
  assert.deepEqual(preparerEffets(html, { scene: 's', projet: v, bibliotheque: EFFETS_PLUGIN }).erreurs, []);
  // Changer la bibliothèque ne change pas la vidéo.
  ecrire(source, 'effets/neige-perso.json', { version: 1, nom: 'neige-perso', description: 'Changée', etend: 'neige' });
  assert.equal(B.enregistrerEffet({ nom: 'neige-perso', projet: source, remplacer: true }).ok, true);
  assert.match(fs.readFileSync(path.join(v, 'effets', 'neige-perso.json'), 'utf8'), /"Neige"/);
  // Personnages : l'assemblage lit la vidéo et le plugin, jamais la bibliothèque.
  assert.equal(B.enregistrerPersonnage({ nom: 'mon-perso', projet: videoAvecPersonnages() }).ok, true);
  const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');
  const scene = '<section data-scene="s"><div data-personnage="mon-perso" id="p"></div></section>';
  const r = preparerPersonnages(scene, { scene: 's', lu: P.lire(v) });
  assert.ok(r.erreurs.some((e) => /personnage « mon-perso » introuvable.*bibliothèque personnelle.*personnages utiliser mon-perso --dossier \./.test(e.message)), JSON.stringify(r.erreurs));
  assert.equal(B.utiliserPersonnage({ nom: 'mon-perso', projet: v }).ok, true);
  assert.deepEqual(preparerPersonnages(scene, { scene: 's', lu: P.lire(v) }).erreurs, []);
});

/* ------------------------------------------------------------------ personnages */

test('bibliotheque : personnage enregistré avec ce dont il dépend dans la vidéo, puis utilisé dans une autre', () => {
  const perso = personnelNeuf();
  const v = videoAvecPersonnages();
  const r = B.enregistrerPersonnage({ nom: 'mon-perso', projet: v });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.enregistres, [{ type: 'gabarit', nom: 'mon-gabarit' }, { type: 'dessin', nom: 'mon-perso' }]);
  const g = B.enregistrerPersonnage({ nom: 'mon-geste', projet: v });
  assert.deepEqual(g.enregistres, [{ type: 'pose', nom: 'ma-pose' }, { type: 'clip', nom: 'mon-geste' }], 'la pose livrée « debout » ne se copie pas');
  assert.ok(fs.existsSync(path.join(perso, 'personnages', 'gabarits', 'mon-gabarit.json')));
  const lu = P.lire(video(), { personnel: path.join(perso, 'personnages') });
  assert.equal(lu.sources.dessins['mon-perso'], 'personnel');
  assert.equal(lu.sources.clips['mon-geste'], 'personnel');
  assert.deepEqual(lu.erreurs, []);
  const autre = video();
  const u = B.utiliserPersonnage({ nom: 'mon-geste', projet: autre });
  assert.equal(u.ok, true, u.message);
  assert.deepEqual(u.copies.sort(), ['personnages/clips/mon-geste.json', 'personnages/poses/ma-pose.json']);
  assert.deepEqual(P.lire(autre).erreurs, []);
  assert.equal(P.lire(autre).sources.clips['mon-geste'], 'video');
});

test('bibliotheque : personnage au nom d\'un élément livré refusé, puis gardé sous un autre nom', () => {
  const perso = personnelNeuf();
  const v = video();
  const livre = JSON.parse(lire('personnages', 'poses', 'debout.json'));
  ecrire(v, 'personnages/poses/debout.json', Object.assign(livre, { description: 'mon debout' }));
  const r = B.enregistrerPersonnage({ nom: 'debout', projet: v });
  assert.equal(r.raison, 'nom-livre');
  const s = B.enregistrerPersonnage({ nom: 'debout', type: 'pose', projet: v, sous: 'debout-perso' });
  assert.equal(s.ok, true, s.message);
  assert.equal(JSON.parse(fs.readFileSync(path.join(perso, 'personnages', 'poses', 'debout-perso.json'), 'utf8')).nom, 'debout-perso');
  assert.equal(B.enregistrerPersonnage({ nom: 'touffu', projet: v }).raison, 'livre');
  assert.equal(B.enregistrerPersonnage({ nom: 'debout', type: 'decoupe', projet: v }).ok, false, 'une découpe reste avec sa vidéo');
});

test('bibliotheque : personnages liste montre la provenance (video, personnel, plugin)', async () => {
  personnelNeuf();
  assert.equal(B.enregistrerPersonnage({ nom: 'mon-perso', projet: videoAvecPersonnages() }).ok, true);
  const { executer } = require('../scripts/personnages.js');
  const r = await executer(['liste', '--dossier', video()]);
  assert.equal(r.code, 0, r.erreur);
  const dessins = JSON.parse(r.sortie).dessins;
  assert.equal(dessins.find((d) => d.nom === 'mon-perso').source, 'personnel');
  assert.equal(dessins.find((d) => d.nom === 'touffu').source, 'plugin');
  const e = await executer(['enregistrer', 'mon-geste', '--dossier', videoAvecPersonnages()]);
  assert.equal(e.code, 0, e.sortie);
  assert.equal(JSON.parse(e.sortie).ok, true);
  assert.equal((await executer(['utiliser'])).code, 2);
});

/* ------------------------------------------------------------------ archive */

/** Bibliothèque complète : une charte, un style personnel, un effet, un personnage, deux goûts ; et une connexion à un site. */
function bibliothequeComplete() {
  const perso = personnelNeuf();
  ecrire(perso, 'chartes/dupont/charte.json', { couleurs: { primaire: '#1d4ed8' }, ton: 'clair' });
  ecrire(perso, 'chartes/dupont/glossaire.md', '# Glossaire\n\n- HACCP\n');
  // Style personnel repris d'un style livré, comme le fait « pulse-motion style nouveau » : son nom dans ses fiches.
  const style = path.join(perso, 'styles', 'mon-style');
  fs.cpSync(path.join(RACINE, 'styles', 'clair-pedagogique'), style, { recursive: true });
  for (const f of ['catalogue.json', 'identite.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(style, f), 'utf8'));
    fs.writeFileSync(path.join(style, f), JSON.stringify(Object.assign(j, { style: 'mon-style' }), null, 2), 'utf8');
  }
  assert.equal(B.enregistrerEffet({ nom: 'ma-neige', projet: videoAvecEffet() }).ok, true);
  assert.equal(B.enregistrerPersonnage({ nom: 'mon-perso', projet: videoAvecPersonnages() }).ok, true);
  const Pref = require('../scripts/preferences.js');
  assert.equal(Pref.noterPreference({ citation: 'jamais de rebond', regle: 'pas de #001', dossier: perso }).ok, true);
  assert.equal(Pref.noterPreference({ citation: 'toujours mon logo', regle: 'logo à la fin', dossier: perso }).ok, true);
  ecrire(perso, 'navigateur/app.exemple.fr/Cookies', 'secret');
  ecrire(perso, 'videos.json', '{"version":1,"videos":[]}');
  ecrire(perso, 'erreurs.jsonl', '{}\n');
  return perso;
}

test('bibliotheque : exportée puis importée sur un autre ordinateur, à l\'identique ; jamais les connexions aux sites', () => {
  const source = bibliothequeComplete();
  const fichier = path.join(dossierTemporaire('pm-archive-'), 'ma-bibliotheque.zip');
  const e = B.exporterBibliotheque({ fichier });
  assert.equal(e.ok, true, e.message);
  assert.deepEqual(e.contenu.chartes, ['dupont']);
  assert.deepEqual(e.contenu.styles, ['mon-style']);
  assert.equal(e.contenu.gouts, 2);
  const noms = Z.lireZip(fs.readFileSync(fichier)).map((x) => x.nom);
  assert.ok(noms.includes('bibliotheque.json') && noms.includes('LISEZ-MOI.txt'));
  for (const n of noms) assert.doesNotMatch(n, /^(navigateur|videos\.json|erreurs\.jsonl|essais|mesures)/, n);
  assert.ok(noms.includes('personnages/gabarits/mon-gabarit.json'), 'les dépendances du personnage partent avec lui');
  assert.equal(B.exporterBibliotheque({ fichier }).raison, 'pris', 'un fichier existant n\'est pas écrasé sans accord');

  const cible = personnelNeuf();
  const vu = B.importerBibliotheque({ fichier, voir: true });
  assert.equal(vu.ok, true, vu.message);
  assert.ok(vu.importes.length >= 5);
  assert.deepEqual(fs.readdirSync(cible), [], '--voir n\'écrit rien');
  const i = B.importerBibliotheque({ fichier });
  assert.equal(i.ok, true, i.message);
  assert.deepEqual(i.refuses, []);
  assert.equal(i.gouts.ajoutes, 2);
  const avant = B.contenuBibliotheque({ personnel: source });
  const apres = B.contenuBibliotheque({ personnel: cible });
  assert.deepEqual(apres, avant);
  assert.ok(fs.readFileSync(path.join(source, 'effets', 'ma-neige', 'assets', 'flocon.png')).equals(fs.readFileSync(path.join(cible, 'effets', 'ma-neige', 'assets', 'flocon.png'))));
  assert.ok(!fs.existsSync(path.join(cible, 'navigateur')));
  const S = require('../scripts/styles.js');
  assert.equal(S.verifierStyle(path.join(cible, 'styles', 'mon-style'), { livre: false }).ok, true);
  // Une seconde fois : tout est déjà là.
  const j = B.importerBibliotheque({ fichier });
  assert.deepEqual(j.importes, []);
  assert.equal(j.identiques.length, i.importes.length);
  assert.equal(j.gouts.ajoutes, 0);
  assert.equal(j.gouts.deja, 2);
});

test('bibliotheque : à l\'import, un nom déjà pris n\'est jamais remplacé sans accord ; les goûts s\'ajoutent sans doublon', () => {
  bibliothequeComplete();
  const fichier = path.join(dossierTemporaire('pm-archive-'), 'b.zip');
  assert.equal(B.exporterBibliotheque({ fichier, selection: { chartes: 'dupont', gouts: true } }).ok, true);
  const cible = personnelNeuf();
  ecrire(cible, 'chartes/dupont/charte.json', { couleurs: { primaire: '#000000' } });
  const Pref = require('../scripts/preferences.js');
  Pref.noterPreference({ citation: 'jamais de rebond', regle: 'pas de #001', dossier: cible });
  Pref.noterPreference({ citation: 'pas de musique', regle: 'sans musique', dossier: cible });
  const i = B.importerBibliotheque({ fichier });
  assert.deepEqual(i.pris, [{ sorte: 'charte', nom: 'dupont' }]);
  assert.match(fs.readFileSync(path.join(cible, 'chartes', 'dupont', 'charte.json'), 'utf8'), /#000000/);
  assert.deepEqual([i.gouts.ajoutes, i.gouts.deja], [1, 1]);
  const prefs = Pref.lirePreferences(cible);
  assert.equal(new Set(prefs.map((p) => p.id)).size, prefs.length, 'identifiants uniques');
  assert.equal(prefs.length, 3);
  const r = B.importerBibliotheque({ fichier, remplacer: ['charte:dupont'] });
  assert.deepEqual(r.importes, [{ sorte: 'charte', nom: 'dupont', remplace: true }]);
  assert.match(fs.readFileSync(path.join(cible, 'chartes', 'dupont', 'charte.json'), 'utf8'), /#1d4ed8/);
  assert.equal(B.importerBibliotheque({ fichier, remplacer: ['nimporte:quoi'] }).ok, false);
});

test('bibliotheque : archive hostile refusée (chemin qui remonte, chemin absolu, trop grosse)', () => {
  const perso = personnelNeuf();
  const dir = dossierTemporaire('pm-hostile-');
  const manifeste = { nom: 'bibliotheque.json', donnees: JSON.stringify({ format: B.FORMAT, version: 1, contenu: {} }) };
  const fichier = path.join(dir, 'h.zip');
  fs.writeFileSync(fichier, Z.ecrireZip([manifeste, { nom: '../evil.txt', donnees: 'x' }, { nom: '/abs.txt', donnees: 'x' }, { nom: 'chartes/../../evil2.txt', donnees: 'x' },
    { nom: 'chartes/ok/charte.json', donnees: '{"ton":"clair"}' }, { nom: `effets/${effetLivre()}/effets/${effetLivre()}.json`, donnees: '{"version":1}' }, { nom: 'effets/bizarre/autre.exe', donnees: 'x' }]));
  const r = B.importerBibliotheque({ fichier });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.ignores.sort(), ['../evil.txt', '/abs.txt', 'chartes/../../evil2.txt'].sort());
  assert.ok(!fs.existsSync(path.join(dir, 'evil.txt')) && !fs.existsSync(path.join(perso, '..', 'evil.txt')) && !fs.existsSync(path.join(perso, '..', 'evil2.txt')));
  assert.deepEqual(r.importes, [{ sorte: 'charte', nom: 'ok' }]);
  assert.ok(r.refuses.some((x) => x.sorte === 'effet' && x.nom === effetLivre() && /livré/.test(x.raison)));
  assert.ok(r.refuses.some((x) => x.sorte === 'effet' && x.nom === 'bizarre'));
  // Sans manifeste, ou trop grosse : rien.
  const sans = path.join(dir, 's.zip');
  fs.writeFileSync(sans, Z.ecrireZip([{ nom: 'chartes/a/charte.json', donnees: '{}' }]));
  assert.match(B.importerBibliotheque({ fichier: sans }).message, /pas une bibliothèque Pulse Motion/);
  const gros = path.join(dir, 'g.zip');
  const octets = Z.ecrireZip([manifeste, { nom: 'chartes/g/charte.json', donnees: '{}' }]);
  const c = octets.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  octets.writeUInt32LE(0xfffffff0, c + 24); // taille annoncée démesurée
  fs.writeFileSync(gros, octets);
  assert.equal(B.importerBibliotheque({ fichier: gros }).ok, false);
  assert.ok(!fs.existsSync(path.join(perso, 'chartes', 'g')));
});

test('bibliotheque : commandes pulse-motion bibliotheque et effet (liste, enregistrer, utiliser)', () => {
  const perso = personnelNeuf();
  const env = Object.assign({}, process.env, { PULSE_MOTION_DOSSIER: perso });
  const v = videoAvecEffet();
  const lancer = (args, cwd = v) => spawnSync(process.execPath, [PM, ...args], { cwd, env, encoding: 'utf8', timeout: 60000 });
  const e = lancer(['effet', 'enregistrer', 'ma-neige', '.']);
  assert.equal(e.status, 0, e.stderr + e.stdout);
  assert.equal(JSON.parse(e.stdout).ok, true);
  const l = JSON.parse(lancer(['effet', 'liste', '--dossier', video()]).stdout);
  assert.equal(l.effets.find((x) => x.nom === 'ma-neige').source, 'personnel');
  const vue = lancer(['effet', 'ma-neige'], video());
  assert.equal(vue.status, 0, vue.stderr);
  assert.match(vue.stdout, /Neige de la vidéo/);
  const bl = JSON.parse(lancer(['bibliotheque', 'liste']).stdout);
  assert.deepEqual(bl.effets, ['ma-neige']);
  const zip = path.join(dossierTemporaire('pm-cli-'), 'b.zip');
  const ex = lancer(['bibliotheque', 'exporter', zip, '--effets', 'ma-neige']);
  assert.equal(ex.status, 0, ex.stdout);
  assert.deepEqual(JSON.parse(ex.stdout).contenu.effets, ['ma-neige']);
  const im = lancer(['bibliotheque', 'importer', zip, '--voir']);
  assert.equal(JSON.parse(im.stdout).identiques.length, 1);
  assert.equal(lancer(['bibliotheque', 'importer']).status, 2);
  assert.equal(lancer(['bibliotheque', 'exporter', zip, '--effets', 'absent']).status, 1);
});

/* ------------------------------------------------------------------ consignes et wiki */

test('bibliotheque : conduite dans chez-soi, renvois d\'une ligne des compétences, wiki', () => {
  const ref = lire('references', 'chez-soi.md');
  const section = ref.split('## Bibliothèque personnelle')[1].split('\n## ')[0];
  for (const m of ['effet enregistrer', 'personnages enregistrer', 'effet utiliser', 'personnages utiliser', 'bibliotheque exporter', 'bibliotheque importer', '--voir', '--remplacer', 'Par copie']) assert.ok(section.includes(m), m);
  assert.match(lire('skills', 'retoucher', 'SKILL.md'), /« garde cet effet \(ce personnage, cette musique\) pour mes prochaines vidéos » : `pulse-motion reference chez-soi`/);
  assert.match(lire('skills', 'outils', 'SKILL.md'), /## 8\. Emporter sa bibliothèque[\s\S]*section « Bibliothèque personnelle »/);
  assert.match(lire('skills', 'outils', 'SKILL.md'), /^description: ".*« emporte mes chartes ».*"$/m);
  for (const s of ['dessiner-personnage', 'animer-personnage']) assert.match(lire('skills', s, 'SKILL.md'), /« Je le garde pour vos prochaines vidéos \? »[^\n]*« Le garder \(Recommandé\) » · « Seulement cette vidéo »[^\n]*chez-soi/, s);
  const docs = (f) => fs.readFileSync(path.join(RACINE, '..', '..', 'docs', f), 'utf8');
  assert.match(docs('concepts.html'), /<section id="bibliotheque">[\s\S]*Par copie[\s\S]*<\/section>/);
  for (const f of ['commandes/outils.html', 'commandes/retoucher.html', 'commandes/dessiner-personnage.html', 'commandes/animer-personnage.html']) assert.match(docs(f), /concepts\.html#bibliotheque/, f);
  assert.match(lire('references', 'controles.md'), /\| `effet-inconnu` \|.*pulse-motion effet utiliser <nom> \./);
});
