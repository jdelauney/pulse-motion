'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { creerRoutesAtelier, ecrireAtomique, empreinte } = require('../scripts/lib/routes-atelier.js');
const { demarrerApercu } = require('../scripts/apercu.js');
const { fnv1a } = require('../scripts/lib/effets.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

function requete(url, { methode = 'GET', type, corps } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: methode, headers: type ? { 'Content-Type': type } : {} }, (res) => {
      const morceaux = [];
      res.on('data', (d) => morceaux.push(d));
      res.on('end', () => {
        const texte = Buffer.concat(morceaux).toString('utf8');
        let json = null;
        try { json = JSON.parse(texte); } catch { /* pas du JSON */ }
        resolve({ statut: res.statusCode, texte, json });
      });
    });
    req.on('error', reject);
    req.end(corps);
  });
}
const json = (corps) => ({ methode: 'POST', type: 'application/json', corps: JSON.stringify(corps) });

/** Sert les seules routes de l'atelier ; fn(base) avec base = http://127.0.0.1:<port>/_pm/atelier/ */
async function servir(projet, options, fn) {
  const routes = creerRoutesAtelier(projet, { dossierStyles: STYLES, bibliotheque: EFFETS, ...options });
  const serveur = http.createServer((req, res) => {
    if (!routes(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  try { await fn(`http://127.0.0.1:${serveur.address().port}/_pm/atelier/`); } finally {
    await new Promise((ok) => serveur.close(ok));
  }
}
const scene = (dir) => path.join(dir, 'scenes', '01-etincelles.html');
const lireScene = (dir) => fs.readFileSync(scene(dir), 'utf8');
const hache = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

test('atelier : contexte, recette résolue, effets des scènes avec graine, durée et recette', async () => {
  const dir = copierProjet('projet-effets');
  await servir(dir, {}, async (base) => {
    const ctx = (await requete(`${base}contexte`)).json;
    assert.equal(ctx.projet, true);
    assert.match(ctx.charte.accent, /^#[0-9a-f]{6}$/i);
    assert.deepEqual(ctx.recettes, { bibliotheque: ['fille', 'gerbe', 'simple'], projet: ['locale'] });
    const locale = (await requete(`${base}recette?nom=locale`)).json;
    assert.equal(locale.source, 'projet');
    assert.equal(locale.recette.nom, 'locale');
    assert.equal(locale.recette.etend, null);
    assert.equal(locale.recette.emetteurs[0].nom, 'salve');
    assert.equal((await requete(`${base}recette?nom=gerbe`)).json.source, 'bibliotheque');
    assert.equal((await requete(`${base}recette?nom=absente`)).statut, 404);
    assert.equal((await requete(`${base}recette?nom=..%2Fderoule`)).statut, 400);
    const { charte, scenes } = (await requete(`${base}scenes`)).json;
    assert.deepEqual(charte, ctx.charte);
    assert.equal(scenes.length, 1);
    const s = scenes[0];
    assert.deepEqual([s.id, s.fichier, s.empreinte], ['etincelles', 'scenes/01-etincelles.html', hache(scene(dir))]);
    const [gerbe, loc] = s.effets;
    assert.deepEqual({ ...gerbe, recette: undefined }, {
      ordre: 0, nom: 'gerbe', calque: 'avant', ancre: 'titre', reglages: 'nombre: 300; couleur: accent',
      graine: fnv1a('etincelles|0|gerbe'), graineEcrite: false, dur: 2, recette: undefined, erreur: null,
    });
    assert.equal(gerbe.recette.emetteurs.length, 2);
    assert.deepEqual([loc.ordre, loc.nom, loc.calque, loc.ancre, loc.dur, loc.erreur], [1, 'locale', 'arriere', null, 1, null]);
  });
});

test('atelier : effet en erreur décrit avec son message ; graine écrite reprise', async () => {
  const dir = copierProjet('projet-effets');
  fs.writeFileSync(scene(dir), lireScene(dir).replace('<div data-effet="locale" data-calque="arriere"></div>',
    '<div data-effet="inconnu"></div>\n  <div data-effet="locale" data-graine="42" data-reglages="nombre: 9999999"></div>'));
  await servir(dir, {}, async (base) => {
    const [, inconnu, locale] = (await requete(`${base}scenes`)).json.scenes[0].effets;
    assert.equal(inconnu.recette, null);
    assert.match(inconnu.erreur, /Effet « inconnu » introuvable/);
    assert.deepEqual([locale.ordre, locale.graine, locale.graineEcrite], [2, 42, true]);
    assert.ok(locale.recette, 'recette résolue malgré le réglage refusé');
    assert.match(locale.erreur, /nombre/);
  });
});

test('atelier : texture du projet en data:, rien hors de assets/', async () => {
  const dir = copierProjet('projet-effets');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'point.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  await servir(dir, {}, async (base) => {
    assert.match((await requete(`${base}texture?chemin=assets/point.png`)).json.uri, /^data:image\/png;base64,/);
    assert.equal((await requete(`${base}texture?chemin=deroule.json`)).statut, 404);
    assert.equal((await requete(`${base}texture?chemin=assets/../deroule.json`)).statut, 404);
  });
});

test('atelier : hors d\'un projet, charte par défaut et aucune scène', async () => {
  await servir(dossierTemporaire('pm-atelier-vide-'), {}, async (base) => {
    const ctx = (await requete(`${base}contexte`)).json;
    assert.equal(ctx.projet, false);
    assert.equal(ctx.charte.fond, '#ffffff');
    assert.deepEqual(ctx.recettes.projet, []);
    assert.deepEqual((await requete(`${base}scenes`)).json.scenes, []);
  });
});

test('aperçu : routes de l\'atelier branchées, bibliothèque des tests transmise', async () => {
  const dir = copierProjet('projet-effets');
  const apercu = await demarrerApercu({ dossier: dir, port: 47401, dossierStyles: STYLES, dossierEffets: EFFETS });
  try {
    const r = await requete(`${apercu.url}_pm/atelier/scenes`);
    assert.equal(r.statut, 200);
    assert.equal(r.json.scenes[0].effets[0].erreur, null);
    assert.equal((await requete(`${apercu.url}_pm/atelier/inconnue`)).statut, 404);
    assert.match((await requete(apercu.url)).texte, /data-effet="gerbe"[^>]*data-pm-effet="0"/, 'la page trouve « gerbe » dans la bibliothèque des tests');
  } finally { await apercu.fermer(); }
});

test('reglages : seuls data-reglages et data-graine de la balise visée changent ; historique avant ; nouvelle empreinte', async () => {
  const dir = copierProjet('projet-effets');
  const avant = lireScene(dir);
  await servir(dir, {}, async (base) => {
    const r = await requete(`${base}reglages`, json({ fichier: 'scenes/01-etincelles.html', empreinte: hache(scene(dir)), scene: 'etincelles', ordre: 0, reglages: 'nombre: 900; couleur: #00ff88', graine: 7 }));
    assert.equal(r.statut, 200, r.texte);
    assert.equal(lireScene(dir), avant.replace('data-reglages="nombre: 300; couleur: accent"', 'data-reglages="nombre: 900; couleur: #00ff88" data-graine="7"'));
    assert.equal(r.json.empreinte, hache(scene(dir)));
    assert.equal(fs.readFileSync(path.join(dir, '.historique', '001', 'scenes', '01-etincelles.html'), 'utf8'), avant);
    // Réglages vides et graine nulle : attributs retirés.
    const r2 = await requete(`${base}reglages`, json({ empreinte: r.json.empreinte, scene: 'etincelles', ordre: 0, reglages: '', graine: null }));
    assert.equal(r2.statut, 200, r2.texte);
    assert.equal(lireScene(dir), avant.replace(' data-reglages="nombre: 300; couleur: accent"', ''));
    assert.ok(fs.existsSync(path.join(dir, '.historique', '002')));
  });
});

test('reglages : refus sans rien écrire – empreinte périmée, balise absente, scène inconnue, valeurs dangereuses, type', async () => {
  const dir = copierProjet('projet-effets');
  const avant = lireScene(dir);
  const e = hache(scene(dir));
  await servir(dir, {}, async (base) => {
    const perimee = await requete(`${base}reglages`, json({ empreinte: 'ffffffffffffffff', scene: 'etincelles', ordre: 0, reglages: 'nombre: 900' }));
    assert.equal(perimee.statut, 409);
    assert.equal(perimee.json.conflit, true);
    assert.match(perimee.json.message, /modifiée sur le disque/);
    assert.equal((await requete(`${base}reglages`, json({ empreinte: e, scene: 'etincelles', ordre: 5, reglages: '' }))).statut, 409);
    assert.equal((await requete(`${base}reglages`, json({ empreinte: e, scene: 'etincelles', ordre: 0, fichier: 'scenes/autre.html' }))).statut, 409);
    assert.equal((await requete(`${base}reglages`, json({ empreinte: e, scene: 'absente', ordre: 0 }))).statut, 404);
    assert.equal((await requete(`${base}reglages`, json({ empreinte: e, scene: 'etincelles', ordre: 0, reglages: 'nombre: 1" onload="x' }))).statut, 400);
    assert.equal((await requete(`${base}reglages`, json({ empreinte: e, scene: 'etincelles', ordre: 0, graine: -1 }))).statut, 400);
    assert.equal((await requete(`${base}reglages`, { methode: 'POST', type: 'text/plain', corps: '{}' })).statut, 415);
    assert.equal((await requete(`${base}reglages`, { methode: 'POST', type: 'application/json', corps: '{oups' })).statut, 400);
  });
  assert.equal(lireScene(dir), avant);
  assert.equal(fs.existsSync(path.join(dir, '.historique')), false);
});

test('reglages : écriture impossible -> 500, scène intacte', async () => {
  const dir = copierProjet('projet-effets');
  const avant = lireScene(dir);
  const disquePlein = () => { throw Object.assign(new Error('disque plein'), { code: 'ENOSPC' }); };
  await servir(dir, { ecrire: disquePlein }, async (base) => {
    const r = await requete(`${base}reglages`, json({ empreinte: hache(scene(dir)), scene: 'etincelles', ordre: 0, reglages: 'nombre: 900' }));
    assert.equal(r.statut, 500);
    assert.match(r.json.message, /Écriture impossible \(ENOSPC\) : rien n'a été modifié/);
  });
  assert.equal(lireScene(dir), avant);
});

test('ecrireAtomique : remplace d\'un coup ; en échec, cible intacte et aucun temporaire laissé', () => {
  const d = dossierTemporaire('pm-atomique-');
  const f = path.join(d, 'a.txt');
  fs.writeFileSync(f, 'ancien');
  ecrireAtomique(f, 'nouveau');
  assert.equal(fs.readFileSync(f, 'utf8'), 'nouveau');
  const dossier = path.join(d, 'dossier');
  fs.mkdirSync(dossier);
  fs.writeFileSync(path.join(dossier, 'garde.txt'), 'x');
  assert.throws(() => ecrireAtomique(dossier, 'contenu'));
  assert.deepEqual(fs.readdirSync(d).sort(), ['a.txt', 'dossier']);
  assert.equal(fs.readFileSync(path.join(dossier, 'garde.txt'), 'utf8'), 'x');
  assert.equal(empreinte(Buffer.from('nouveau')), crypto.createHash('sha256').update('nouveau').digest('hex').slice(0, 16));
});
