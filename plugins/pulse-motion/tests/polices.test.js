'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../scripts/polices.js');
const { police } = require('./aide/polices.js');

const BUNNY = path.join(__dirname, 'fixtures', 'bunny');
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(BUNNY, 'list.json'), 'utf8'));
const FEUILLE = fs.readFileSync(path.join(BUNNY, 'playfair.css'), 'utf8');
const URL_FEUILLE = 'https://fonts.bunny.net/css?family=playfair-display:400,700';
const fichierBunny = (g, sous = 'latin') => `https://fonts.bunny.net/playfair-display/files/playfair-display-${sous}-${g}-normal.woff2`;
const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pm-polices-'));

/** Faux réseau : table url -> contenu (Error : la requête échoue ; absent : 404). */
function faux(table) {
  return async (url) => {
    const v = table[url];
    if (v instanceof Error) throw v;
    if (v === undefined) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => v, text: async () => v, arrayBuffer: async () => Buffer.from(v) };
  };
}
const reseau = (extra = {}) => faux({ 'https://fonts.bunny.net/list': CATALOGUE, [URL_FEUILLE]: FEUILLE, [fichierBunny(400)]: 'L400', [fichierBunny(700)]: 'L700', ...extra });

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
  assert.equal(fs.readFileSync(path.join(d, 'Playfair Display-700.woff2'), 'utf8'), 'L700');
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
