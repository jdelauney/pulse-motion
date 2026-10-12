'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const P = require('../scripts/polices.js');
const { police } = require('./aide/polices.js');

const BUNNY = path.join(__dirname, 'fixtures', 'bunny');
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(BUNNY, 'list.json'), 'utf8'));
const FEUILLE = fs.readFileSync(path.join(BUNNY, 'playfair.css'), 'utf8');
const URL_FEUILLE = 'https://fonts.bunny.net/css?family=playfair-display:400,700';
const fichierBunny = (g, sous = 'latin') => `https://fonts.bunny.net/playfair-display/files/playfair-display-${sous}-${g}-normal.woff2`;
const dossier = () => dossierTemporaire('pm-polices-');

/** Faux réseau : table url -> contenu (Error : la requête échoue ; absent : 404). */
function faux(table) {
  return async (url) => {
    const v = table[url];
    if (v instanceof Error) throw v;
    if (v === undefined) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => v, text: async () => v, arrayBuffer: async () => Buffer.from(v) };
  };
}
const reseau = (extra = {}) => faux({ 'https://fonts.bunny.net/list': CATALOGUE, [URL_FEUILLE]: FEUILLE, [fichierBunny(400)]: 'wOF2L400', [fichierBunny(700)]: 'wOF2L700', [fichierBunny(400).replace('normal', 'italic')]: 'wOF2I400', ...extra });

test('feuille Bunny : sous-ensemble latin par graisse, feuille entière refusée si une URL sort de l\'hôte', () => {
  const latin = P.choisirLatin(P.fichiersDeLaFeuille(FEUILLE));
  assert.deepEqual(latin.map((f) => [f.graisse, f.style, f.url]), [[400, 'normal', fichierBunny(400)], [400, 'italic', fichierBunny(400).replace('normal', 'italic')], [700, 'normal', fichierBunny(700)]]);
  assert.deepEqual(P.fichiersDeLaFeuille(FEUILLE.replace(fichierBunny(700), 'https://evil.example/x.woff2')), []);
  assert.throws(() => P.familleConnue('../etc', P.lireCatalogueBunny(CATALOGUE)), /Police absente du catalogue Bunny Fonts/);
});

test('installer depuis Bunny : fichiers nommés par graisse, licence notée, rien en .part', async () => {
  const d = dossier();
  const r = await P.installerBunny({ famille: 'Playfair Display', dans: d, recuperer: reseau() });
  assert.deepEqual(r, { ok: true, famille: 'Playfair Display', fichiers: ['Playfair Display-400.woff2', 'Playfair Display-700.woff2'], dans: d });
  assert.equal(fs.readFileSync(path.join(d, 'Playfair Display-700.woff2'), 'utf8'), 'wOF2L700');
  const licences = fs.readFileSync(path.join(d, 'LICENCES.md'), 'utf8');
  assert.match(licences, /## Playfair Display/);
  assert.match(licences, /Open Font License/);
  assert.match(licences, /sha256 [0-9a-f]{64}/);
  assert.ok(!fs.readdirSync(d).some((f) => f.endsWith('.part')));
});

test('Bunny : famille inconnue, graisse absente, feuille douteuse, réseau absent, échec au 2e fichier : rien d\'installé', async () => {
  const cas = [
    [{ famille: 'Comic Neue Pro' }, reseau(), /absente du catalogue Bunny Fonts/],
    [{ famille: 'Inter', graisses: [300] }, reseau(), /graisse/],
    [{ famille: 'Playfair Display' }, reseau({ [URL_FEUILLE]: FEUILLE.replace(fichierBunny(700), 'https://evil.example/x.woff2') }), /hors de fonts\.bunny\.net/],
    [{ famille: 'Playfair Display' }, faux({ 'https://fonts.bunny.net/list': new TypeError('fetch failed') }), /connexion internet/],
    [{ famille: 'Playfair Display' }, reseau({ [fichierBunny(700)]: undefined }), /404/],
  ];
  for (const [opts, recuperer, motif] of cas) {
    const d = dossier();
    const r = await P.installerBunny({ ...opts, dans: d, recuperer });
    assert.equal(r.ok, false, opts.famille);
    assert.match(r.message, motif);
    assert.match(r.message, /Rien n'a été installé/);
    assert.deepEqual(fs.readdirSync(d), [], opts.famille);
  }
});

test('fichier fourni : licence lue, caractères manquants signalés, confirmation demandée si besoin', () => {
  const src = dossier();
  const ecrire = (nom, contenu) => { fs.writeFileSync(path.join(src, nom), contenu); return path.join(src, nom); };
  const d = dossier();
  const interdite = P.installerFichier({ fichier: ecrire('Secrete.ttf', police({ fsType: 2 })), dans: d });
  assert.equal(interdite.ok, false);
  assert.match(interdite.message, /interdit son intégration/);
  const apercu = ecrire('Apercu.woff', police({ fsType: 4, format: 'woff' }));
  const demande = P.installerFichier({ fichier: apercu, dans: d });
  assert.deepEqual([demande.ok, demande.aConfirmer], [false, true]);
  assert.deepEqual(fs.readdirSync(d), []);
  assert.equal(P.installerFichier({ fichier: apercu, confirmer: true, dans: d }).ok, true);
  const r = P.installerFichier({ fichier: ecrire('ma marque!.woff2', police({ format: 'woff2', texte: 'abcdefghijklmnopqrstuvwxyz' })), famille: 'Ma Marque', dans: d });
  assert.equal(r.ok, true);
  assert.equal(r.famille, 'Ma Marque');
  assert.equal(r.fichier, 'Ma Marque.woff2');
  assert.match(r.avertissements[0], /Caractères absents de cette police : .*é.*€/);
  assert.match(fs.readFileSync(path.join(d, 'LICENCES.md'), 'utf8'), /## Ma Marque\n\n- Fichier fourni par la personne/);
  assert.match(P.installerFichier({ fichier: ecrire('notes.txt', 'x'), dans: d }).message, /TTF, OTF, WOFF ou WOFF2/);
});

test('nom de famille du catalogue Bunny nettoyé : rien n\'est écrit hors du dossier prévu', async () => {
  const parent = dossier();
  const d = path.join(parent, 'a', 'b');
  const catalogue = { 'playfair-display': { ...CATALOGUE['playfair-display'], familyName: '../../evil' } };
  const r = await P.installerBunny({ famille: 'playfair-display', dans: d, recuperer: reseau({ 'https://fonts.bunny.net/list': catalogue }) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.fichiers, ['evil-400.woff2', 'evil-700.woff2']);
  assert.deepEqual(fs.readdirSync(parent), ['a']);
  assert.ok(fs.existsSync(path.join(d, 'evil-400.woff2')));
});

test('Bunny : fichier reçu qui n\'est pas une police, ou renommage impossible : rien d\'installé', async () => {
  const d1 = dossier();
  const pasPolice = await P.installerBunny({ famille: 'Playfair Display', dans: d1, recuperer: reseau({ [fichierBunny(700)]: '<html>page</html>' }) });
  assert.equal(pasPolice.ok, false);
  assert.match(pasPolice.message, /n'est pas une police WOFF2/);
  assert.deepEqual(fs.readdirSync(d1), []);
  const d2 = dossier();
  fs.mkdirSync(path.join(d2, 'Playfair Display-700.woff2', 'occupe'), { recursive: true });
  const bloque = await P.installerBunny({ famille: 'Playfair Display', dans: d2, recuperer: reseau() });
  assert.equal(bloque.ok, false);
  assert.deepEqual(fs.readdirSync(d2), ['Playfair Display-700.woff2'], 'seul le dossier qui bloquait reste');
});

test('Bunny : italiques sur demande, nommés « -italic »', async () => {
  const d = dossier();
  const r = await P.installerBunny({ famille: 'Playfair Display', graisses: [400], italique: true, dans: d, recuperer: reseau({ 'https://fonts.bunny.net/css?family=playfair-display:400,400i': FEUILLE }) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.fichiers, ['Playfair Display-400.woff2', 'Playfair Display-400-italic.woff2']);
});

test('police fournie, caractères manquants : police de remplacement du style nommée pour le rôle', () => {
  const src = dossier();
  fs.writeFileSync(path.join(src, 'Marque.woff2'), police({ format: 'woff2', texte: 'abcdefghijklmnopqrstuvwxyz' }));
  const r = P.installerFichier({ fichier: path.join(src, 'Marque.woff2'), style: 'editorial', role: 'titres', dans: dossier() });
  assert.equal(r.ok, true);
  assert.match(r.avertissements[0], /utilisez « Fraunces », la police des titres du style « editorial »/);
});

test('Bunny : italique demandé pour une police sans italique : refus clair, rien d\'installé', async () => {
  const d = dossier();
  const r = await P.installerBunny({ famille: 'Inter', graisses: [400], italique: true, dans: d, recuperer: reseau() });
  assert.equal(r.ok, false);
  assert.match(r.message, /Inter n'a pas d'italique/);
  assert.deepEqual(fs.readdirSync(d), []);
});

test('Bunny : réinstallation qui échoue à la licence, la police déjà en place reste', async () => {
  const d = dossier();
  fs.writeFileSync(path.join(d, 'Playfair Display-400.woff2'), 'wOF2ANCIEN');
  fs.mkdirSync(path.join(d, 'LICENCES.md'));
  const r = await P.installerBunny({ famille: 'Playfair Display', dans: d, recuperer: reseau() });
  assert.equal(r.ok, false);
  assert.ok(fs.existsSync(path.join(d, 'Playfair Display-400.woff2')), 'la police d\'avant ne doit pas disparaître');
  assert.equal(fs.existsSync(path.join(d, 'Playfair Display-700.woff2')), false, 'la police nouvelle est retirée');
});

test('Bunny : dans un projet, un téléchargement raté ne laisse pas de copie d\'historique vide', async () => {
  const { copierProjet } = require('./aide/projet.js');
  const dir = copierProjet('projet-simple');
  const r = await P.installerBunny({ famille: 'Playfair Display', dans: path.join(dir, 'charte', 'polices'), recuperer: reseau({ [fichierBunny(700)]: undefined }) });
  assert.equal(r.ok, false);
  assert.equal(fs.existsSync(path.join(dir, '.historique')) && fs.readdirSync(path.join(dir, '.historique')).length > 0, false);
});

test('Bunny : police variable (font-weight en plage), chaque graisse demandée installée', async () => {
  const d = dossier();
  const url = 'https://fonts.bunny.net/playfair-display/files/playfair-display-latin-wght-normal.woff2';
  const feuille = `@font-face { font-family: 'Playfair Display'; font-style: normal; font-weight: 400 900; src: url(${url}) format('woff2'); unicode-range: U+0000-00FF; }`;
  const r = await P.installerBunny({ famille: 'Playfair Display', dans: d, recuperer: reseau({ [URL_FEUILLE]: feuille, [url]: 'wOF2VAR' }) });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.fichiers, ['Playfair Display-400.woff2', 'Playfair Display-700.woff2']);
});

test('glossaire : écriture impossible, aucune copie d\'historique laissée', () => {
  const { noterGlossaire } = require('../scripts/vocabulaire.js');
  const { copierProjet } = require('./aide/projet.js');
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'charte'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'charte', 'glossaire.md'));
  assert.throws(() => noterGlossaire({ dossier: dir, terme: 'HACCP', sens: 'Méthode' }));
  assert.equal(fs.existsSync(path.join(dir, '.historique')) && fs.readdirSync(path.join(dir, '.historique')).length > 0, false);
});
